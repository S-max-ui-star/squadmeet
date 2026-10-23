"""The Equipment a user brings to a Meetup (SCRUM-170) or needs there (SCRUM-171), per
Activity type, see CONTEXT.md.

A fixed list, no free text (ADR-0004). The key is stored in the database and must never
change; the frontend has the same German labels, with an emoji (frontend/src/places/equipment.ts). Equipment belongs to a
Meetup, not to a Place: the Host and each Join have their own rows.
"""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.activities import ActivityType
from app.models import MeetupEquipment

MAX_COUNT = 4


@dataclass(frozen=True)
class Item:
    key: str
    # German, for the Notification text (SCRUM-172); the same as in frontend/src/places/equipment.ts.
    label: str
    # 1: the user brings it or not. More: the user says how many (Schläger, 1–4).
    max_count: int = 1


ACTIVITY_EQUIPMENT: dict[ActivityType, tuple[Item, ...]] = {
    ActivityType.TABLE_TENNIS: (
        Item("rackets", "Schläger", MAX_COUNT),
        Item("balls", "Bälle"),
        Item("net", "Netz"),
    ),
    ActivityType.BASKETBALL: (Item("ball", "Ball"),),
    ActivityType.FOOTBALL: (
        Item("ball", "Ball"),
        Item("bibs", "Leibchen"),
        Item("cones", "Hütchen/Mini-Tore"),
    ),
    ActivityType.BEACH_VOLLEYBALL: (Item("ball", "Ball"), Item("net", "Netz")),
    ActivityType.OUTDOOR_FITNESS: (
        Item("jump_rope", "Springseil"),
        Item("mat", "Matte"),
        Item("band", "Fitnessband"),
    ),
}


# "Bringe ich mit" or "Brauche ich" (SCRUM-171).
Kind = Literal["bring", "need"]


class EquipmentChoice(BaseModel):
    item: str
    count: int = Field(default=1, ge=1, le=MAX_COUNT)
    kind: Kind = "bring"


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
    type, each once (so not both brought and needed), within its count. The caller raises it (this module stays free of
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


def missing(activity_type: str, brought: dict[str, int], needed: dict[str, int]) -> dict[str, int]:
    """"Fehlt noch" (SCRUM-171): per item, how many are needed beyond what is brought, in the
    order of the fixed list. An item without a count (Bälle, Netz) is there or not: one person
    who brings it is enough for everybody who needs it."""
    short: dict[str, int] = {}
    for item in items_for(activity_type):
        need, have = needed.get(item.key, 0), brought.get(item.key, 0)
        if item.max_count == 1:
            need, have = min(need, 1), min(have, 1)
        if need > have:
            short[item.key] = need - have
    return short


def missing_text(activity_type: str, short: dict[str, int]) -> str | None:
    """"2 Schläger, Bälle" for the Notification text (SCRUM-172): a count only for an item
    with a count, as on the Meetup card. None when nothing is missing."""
    labels = {item.key: item for item in items_for(activity_type)}
    return ", ".join(
        f"{count} {labels[key].label}" if labels[key].max_count > 1 else labels[key].label
        for key, count in short.items()
    ) or None


def missing_now(session: Session, meetup_id: int, activity_type: str) -> dict[str, int]:
    """Missing Equipment of one Meetup from its rows (app.meetups does the same for many)."""
    totals: dict[str, dict[str, int]] = {"bring": {}, "need": {}}
    for row in session.exec(select(MeetupEquipment).where(MeetupEquipment.meetup_id == meetup_id)):
        totals[row.kind][row.item] = totals[row.kind].get(row.item, 0) + row.count
    return missing(activity_type, totals["bring"], totals["need"])


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
            MeetupEquipment(
                meetup_id=meetup_id,
                user_id=user_id,
                item=choice.item,
                count=choice.count,
                kind=choice.kind,
            )
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
        EquipmentChoice(item=row.item, count=row.count, kind=row.kind)
        for row in rows_of(session, from_meetup_id, user_id)
    ]
    replace(session, to_meetup_id, user_id, choices)
