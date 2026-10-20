"""Best-effort Web Push delivery for durable in-app Notifications (SCRUM-44)."""

import json
import logging
import os

from pywebpush import webpush
from sqlmodel import Session, select

from app.models import PushSubscription
from app.notification_text import NotificationKind

logger = logging.getLogger(__name__)

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
