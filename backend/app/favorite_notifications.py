"""Create Favorite Notifications when a Meetup occurrence is first stored (SCRUM-41)."""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app.models import Favorite, FavoriteTimeRule, Meetup, UserBlock
from app.notification_events import notify_users

BERLIN = ZoneInfo("Europe/Berlin")


def notify_favorites(
    session: Session, meetup: Meetup, now: datetime, skip: frozenset[int] = frozenset()
) -> set[int]:
    """Notify matching Favorite owners, excluding the Host and Blocks in either direction; the
    users notified. `skip`: users who already got a Contact Notification for this Meetup
    (SCRUM-43)."""
    favorites = list(
        session.exec(
            select(Favorite).where(
                Favorite.place_id == meetup.place_id, Favorite.user_id != meetup.host_id
            )
        )
    )
    if not favorites:
        return set()
    favorite_ids = [favorite.id for favorite in favorites]
    rules: dict[int, list[FavoriteTimeRule]] = {favorite_id: [] for favorite_id in favorite_ids}
    for rule in session.exec(
        select(FavoriteTimeRule).where(FavoriteTimeRule.favorite_id.in_(favorite_ids))
    ):
        rules[rule.favorite_id].append(rule)
    candidates = {favorite.user_id for favorite in favorites}
    blocked = set(
        session.exec(
            select(UserBlock.blocker_id).where(
                UserBlock.blocker_id.in_(candidates), UserBlock.blocked_id == meetup.host_id
            )
        )
    ) | set(
        session.exec(
            select(UserBlock.blocked_id).where(
                UserBlock.blocker_id == meetup.host_id, UserBlock.blocked_id.in_(candidates)
            )
        )
    )
    local = meetup.starts_at.astimezone(BERLIN)
    local_time = local.time().replace(tzinfo=None)
    recipients = {
        favorite.user_id
        for favorite in favorites
        if favorite.user_id not in blocked
        and favorite.user_id not in skip
        and (
            not rules[favorite.id]
            or any(
                local.weekday() in rule.weekdays
                and rule.start_time <= local_time < rule.end_time
                for rule in rules[favorite.id]
            )
        )
    }
    notify_users(
        session,
        recipients,
        meetup,
        "favorite_meetup_created",
        now,
        actor_id=meetup.host_id,
    )
    return recipients
