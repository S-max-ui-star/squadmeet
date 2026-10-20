"""Create Notifications inside the same transaction as a Meetup event (SCRUM-40).

This module imports only models, so the Meetup lifecycle can use it without an auth cycle.
"""

from datetime import datetime

from sqlmodel import Session, select

from app.models import Meetup, MeetupJoin, Notification, Place, User
from app.notification_text import NotificationKind, notification_text
from app.push_delivery import send_web_push


def notify_users(
    session: Session,
    user_ids: set[int],
    meetup: Meetup,
    kind: NotificationKind,
    now: datetime,
    actor_id: int | None = None,
) -> None:
    """Add one Notification per recipient. The caller owns the transaction. `actor_id` is the
    person named in the shared in-app and Web Push text."""
    if meetup.id is None:
        raise ValueError("A Notification needs a stored Meetup")
    if not user_ids:
        return
    session.add_all(
        Notification(
            user_id=user_id, meetup_id=meetup.id, kind=kind, actor_id=actor_id, created_at=now
        )
        for user_id in user_ids
    )
    place = session.get(Place, meetup.place_id)
    if place is None:
        raise ValueError("A Notification needs a stored Place")
    actor = session.get(User, actor_id) if actor_id is not None else None
    body = notification_text(kind, actor.nickname if actor else None, place.activity_type, place.address)
    send_web_push(session, user_ids, meetup.id, meetup.place_id, kind, body)


def notify_joined(
    session: Session,
    meetup: Meetup,
    kind: NotificationKind,
    now: datetime,
    actor_id: int | None = None,
) -> None:
    """Notify the current Joins, not the Host and not users who already Left."""
    joined = set(
        session.exec(select(MeetupJoin.user_id).where(MeetupJoin.meetup_id == meetup.id))
    )
    notify_users(session, joined, meetup, kind, now, actor_id=actor_id)
