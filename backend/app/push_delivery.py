"""Best-effort Web Push delivery for durable in-app Notifications (SCRUM-44).

The request only collects the Pushes. After its commit, a worker thread sends them, so the
request does not wait for the push services, and a rolled-back Notification sends no Push
(SCRUM-140). A Push still waiting when the process stops is lost; the Notification stays.
"""

import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from pywebpush import webpush
from sqlalchemy import delete, event
from sqlmodel import Session, select

from app.db import engine
from app.models import PushSubscription
from app.notification_text import NotificationKind

logger = logging.getLogger(__name__)

# The push services of Chrome (also Edge on Android, Opera, Samsung), Firefox, Safari and Edge on
# Windows. The server sends only there, so a user cannot make it call a host of their choice.
PUSH_SERVICES = ("fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com")

PENDING = "push_pending"
# (subscription id, subscription info for pywebpush, payload)
Push = tuple[int, dict, str]

worker = ThreadPoolExecutor(max_workers=4, thread_name_prefix="web-push")


def is_push_service(endpoint: str) -> bool:
    """An HTTPS URL on one of the PUSH_SERVICES or a subdomain of one."""
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    return (
        parts.scheme == "https"
        and not parts.username
        and not parts.password
        and any(host == service or host.endswith(f".{service}") for service in PUSH_SERVICES)
    )


def send_web_push(
    session: Session,
    user_ids: set[int],
    meetup_id: int,
    place_id: int,
    kind: NotificationKind,
    body: str,
) -> None:
    """Collect a Push per subscription; the worker sends them after the commit."""
    if not os.environ.get("VAPID_PRIVATE_KEY") or not user_ids:
        return
    subscriptions = session.exec(
        select(PushSubscription).where(PushSubscription.user_id.in_(user_ids))
    ).all()
    payload = json.dumps(
        {
            "title": "SquadMeet",
            "body": body,
            "url": f"/platz/{place_id}#treffen-{meetup_id}",
            "tag": f"meetup-{meetup_id}-{kind}",
        }
    )
    session.info.setdefault(PENDING, []).extend(
        (
            subscription.id,
            {
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            payload,
        )
        for subscription in subscriptions
        # Stored before the host check (SCRUM-74); the browser subscribes again.
        if is_push_service(subscription.endpoint)
    )


# A savepoint (begin_nested) fires these events too. Only the outer transaction decides; a failed
# savepoint keeps the Pushes collected before it, and no route sends a Push inside one.
@event.listens_for(Session, "after_commit")
def hand_over(session: Session) -> None:
    if session.in_nested_transaction():
        return
    pushes = session.info.pop(PENDING, None)
    if pushes:
        worker.submit(deliver, pushes)


@event.listens_for(Session, "after_rollback")
def drop(session: Session) -> None:
    if not session.in_nested_transaction():
        session.info.pop(PENDING, None)


def open_session() -> Session:
    return Session(engine)


def deliver(pushes: list[Push]) -> None:
    """Runs in the worker. A Push provider fails on its own and never breaks the app."""
    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    if not private_key:
        return
    subject = os.environ.get("VAPID_SUBJECT", "mailto:admin@squadmeet.duckdns.org")
    gone = []
    for subscription_id, subscription_info, payload in pushes:
        try:
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": subject},
                timeout=5,
                ttl=24 * 60 * 60,
            )
        except Exception as error:  # Push providers fail independently of the app request.
            response = getattr(error, "response", None)
            if getattr(response, "status_code", None) in {404, 410}:
                gone.append(subscription_id)
            else:
                logger.warning(
                    "Web Push delivery failed for subscription %s: %s", subscription_id, error
                )
    if gone:
        # The request's session is closed by now; an expired subscription goes in its own.
        with open_session() as session:
            session.exec(delete(PushSubscription).where(PushSubscription.id.in_(gone)))
            session.commit()
