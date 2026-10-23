"""The Equipment a user brings to a Meetup, per Activity type (SCRUM-170, see CONTEXT.md).

A fixed list, no free text (ADR-0004). The key is stored in the database and must never
change; the German labels are in frontend/src/places/equipment.ts. Equipment belongs to a
Meetup, not to a Place: the Host and each Join have their own rows.
"""

from dataclasses import dataclass

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.activities import ActivityType
from app.models import MeetupEquipment

MAX_COUNT = 4


@dataclass(frozen=True)
class Item:
    key: str
    # 1: the user brings it or not. More: the user says how many (Schläger, 1–4).
    max_count: int = 1


ACTIVITY_EQUIPMENT: dict[ActivityType, tuple[Item, ...]] = {
    ActivityType.TABLE_TENNIS: (Item("rackets", MAX_COUNT), Item("balls"), Item("net")),
    ActivityType.BASKETBALL: (Item("ball"),),
    ActivityType.FOOTBALL: (Item("ball"), Item("bibs"), Item("cones")),
    ActivityType.BEACH_VOLLEYBALL: (Item("ball"), Item("net")),
    ActivityType.OUTDOOR_FITNESS: (Item("jump_rope"), Item("mat"), Item("band")),
}


class EquipmentChoice(BaseModel):
    item: str
    count: int = Field(default=1, ge=1, le=MAX_COUNT)


Choices = list[EquipmentChoice]
# More than any Activity type has; a longer list is a broken client.
MAX_CHOICES = 6


def items_for(activity_type: str) -> tuple[Item, ...]:
    return ACTIVITY_EQUIPMENT[ActivityType(activity_type)]


def order(activity_type: str, item: str) -> int:
    """The position of the item in the fixed list, so the UI shows items in that order."""
    keys = [each.key for each in items_for(activity_type)]
    return keys.index(item) if item in keys else len(keys)


def problem(activity_type: str, choices: Choices) -> str | None:
    """Why `choices` do not fit the Place, or None. Only the items of the Place's Activity
    type, each once, within its count. The caller raises it (this module stays free of
    app.meetup_lifecycle, which uses it)."""
    items = {item.key: item for item in items_for(activity_type)}
    seen: set[str] = set()
    for choice in choices:
        item = items.get(choice.item)
        if item is None:
            return f"Diese Ausrüstung passt nicht zu diesem Platz: {choice.item}"
        if choice.item in seen:
            return f"Ausrüstung doppelt gewählt: {choice.item}"
        if choice.count > item.max_count:
            return f"Höchstens {item.max_count} × {choice.item}"
        seen.add(choice.item)
    return None


def rows_of(session: Session, meetup_id: int, user_id: int) -> list[MeetupEquipment]:
    return list(
        session.exec(
            select(MeetupEquipment).where(
                MeetupEquipment.meetup_id == meetup_id, MeetupEquipment.user_id == user_id
            )
        ).all()
    )


def replace(session: Session, meetup_id: int, user_id: int, choices: Choices) -> None:
    """The user's Equipment for this Meetup is now exactly `choices`. Checked before."""
    drop(session, meetup_id, user_id)
    for choice in choices:
        session.add(
            MeetupEquipment(meetup_id=meetup_id, user_id=user_id, item=choice.item, count=choice.count)
        )


def drop(session: Session, meetup_id: int, user_id: int) -> None:
    """Leave: the user brings nothing to this Meetup any more. Row by row, so the live update
    (app.live) sees the change; the flush frees the unique key for new rows."""
    for row in rows_of(session, meetup_id, user_id):
        session.delete(row)
    session.flush()


def carry(session: Session, from_meetup_id: int, to_meetup_id: int, user_id: int) -> None:
    """A Move: the user takes their Equipment along to the new Meetup."""
    choices = [
        EquipmentChoice(item=row.item, count=row.count)
        for row in rows_of(session, from_meetup_id, user_id)
    ]
    replace(session, to_meetup_id, user_id, choices)
