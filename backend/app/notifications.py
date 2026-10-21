"""The signed-in user's in-app Notification list (SCRUM-40)."""

from datetime import UTC, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, or_
from sqlmodel import Session, select

from app.auth import current_user
from app.blocks import blockers_of
from app.db import get_session
from app.models import Meetup, Notification, Place, User
from app.notification_text import NotificationKind, notification_text
from app.place_status import in_db

router = APIRouter(prefix="/notifications", tags=["notifications"])

# Stefan's rule (SCRUM-141): a Notification stays until 14 days after its Meetup's end.
KEEP_AFTER_END = timedelta(days=14)


class NotificationRead(BaseModel):
    id: int
    kind: NotificationKind
    meetup_id: int
    place_id: int
    place_name: str
    place_address: str | None
    text: str
    created_at: datetime
    read: bool
    # The person who caused the event; null after that account was deleted.
    actor_nickname: str | None = None


def delete_old_notifications(session: Session, user_id: int, now: datetime) -> None:
    """Delete the user's Notifications whose Meetup ended more than KEEP_AFTER_END ago, read or
    not (SCRUM-141). Runs at each list request, like the Series fill; there is no daily job."""
    ended = select(Meetup.id).where(Meetup.ends_at < now - KEEP_AFTER_END)
    session.exec(
        delete(Notification).where(
            Notification.user_id == user_id, Notification.meetup_id.in_(ended)
        )
    )
    session.commit()


def own_notification(session: Session, notification_id: int, user_id: int) -> Notification:
    notice = in_db(notification_id) and session.exec(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user_id
        )
    ).first()
    if not notice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return notice


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    user: User = Depends(current_user), session: Session = Depends(get_session)
):
    """Newest first; a Notification stays until 14 days after its Meetup ended, or until the
    account or Meetup is deleted. Notices of users who blocked the viewer, as actor or as
    Host, are left out while the Block lasts (SCRUM-32: the blocked user sees neither their
    Meetups nor their Nickname)."""
    delete_old_notifications(session, user.id, datetime.now(UTC))
    blockers = blockers_of(session, user.id)
    rows = session.exec(
        select(
            Notification,
            Meetup.place_id,
            Place.name,
            Place.activity_type,
            Place.address,
            User.nickname,
        )
        .join(Meetup, Meetup.id == Notification.meetup_id)
        .join(Place, Place.id == Meetup.place_id)
        .outerjoin(User, User.id == Notification.actor_id)
        .where(
            Notification.user_id == user.id,
            Meetup.host_id.not_in(blockers),
            # NOT IN drops a NULL actor (deleted account), so keep those explicitly.
            or_(Notification.actor_id.is_(None), Notification.actor_id.not_in(blockers)),
        )
        .order_by(Notification.created_at.desc(), Notification.id.desc())
    ).all()
    return [
        NotificationRead(
            id=notice.id,
            kind=notice.kind,
            meetup_id=notice.meetup_id,
            place_id=place_id,
            place_name=place_name,
            place_address=place_address,
            text=notification_text(notice.kind, actor_nickname, activity_type, place_address),
            created_at=notice.created_at,
            read=notice.read_at is not None,
            actor_nickname=actor_nickname,
        )
        for notice, place_id, place_name, activity_type, place_address, actor_nickname in rows
    ]


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(
    user: User = Depends(current_user), session: Session = Depends(get_session)
):
    """Mark all unread Notifications of the signed-in user as read ("Alle gelesen", SCRUM-101)."""
    now = datetime.now(UTC)
    for notice in session.exec(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    ):
        notice.read_at = now
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Before DELETE /{notification_id}, so "read" is not taken for an id.
@router.delete("/read", status_code=status.HTTP_204_NO_CONTENT)
def delete_read_notifications(
    user: User = Depends(current_user), session: Session = Depends(get_session)
):
    """Delete the signed-in user's read Notifications only ("Gelesene löschen", SCRUM-101)."""
    for notice in session.exec(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_not(None)
        )
    ):
        session.delete(notice)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notification_read(
    notification_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """A tap marks only the signed-in user's Notification as read."""
    notice = own_notification(session, notification_id, user.id)
    if notice.read_at is None:
        notice.read_at = datetime.now(UTC)
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Delete one Notification only when it belongs to the signed-in user."""
    session.delete(own_notification(session, notification_id, user.id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_notifications(
    user: User = Depends(current_user), session: Session = Depends(get_session)
):
    """Delete all Notifications of the signed-in user and nobody else's."""
    for notice in session.exec(select(Notification).where(Notification.user_id == user.id)):
        session.delete(notice)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
