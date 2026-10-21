"""Best-effort Web Push delivery for durable in-app Notifications (SCRUM-44)."""

import json
import logging
import os
from urllib.parse import urlsplit

from pywebpush import webpush
from sqlmodel import Session, select

from app.models import PushSubscription
from app.notification_text import NotificationKind

logger = logging.getLogger(__name__)

# The push services of Chrome (also Edge on Android, Opera, Samsung), Firefox, Safari and Edge on
# Windows. The server sends only there, so a user cannot make it call a host of their choice.
PUSH_SERVICES = ("fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com")


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
    """Send immediately, but never let a Push provider break the app transaction."""
    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    if not private_key or not user_ids:
        return
    subject = os.environ.get("VAPID_SUBJECT", "mailto:admin@squadmeet.duckdns.org")
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
    for subscription in subscriptions:
        if not is_push_service(subscription.endpoint):
            # Stored before the host check (SCRUM-74); the browser subscribes again.
            continue
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": subject},
                timeout=5,
                ttl=24 * 60 * 60,
            )
        except Exception as error:  # Push providers fail independently of the app request.
            response = getattr(error, "response", None)
            if getattr(response, "status_code", None) in {404, 410}:
                session.delete(subscription)
            else:
                logger.warning(
                    "Web Push delivery failed for subscription %s: %s", subscription.id, error
                )
