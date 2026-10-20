"""Weekly Series with Occurrences (SCRUM-38, see CONTEXT.md).

A Series has one or more weekdays, each with a start time (Berlin) and a duration of 1–4 hours,
and an optional end date. Each Occurrence is an ordinary Meetup with series_id, so Join, Leave,
Cancel, handover, move, Closed and Block work per Occurrence without extra code.

Occurrences exist for the next WINDOW_DAYS days, the limit of a later Meetup. There is no
background job: fill_open_series() makes the missing ones whenever the map or a Place's
Meetups are loaded. One Occurrence per Series and Berlin date (series_date), so a cancelled or
moved Occurrence is never made again. Users join each Occurrence on their own.
"""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, or_
from sqlmodel import Session, select

from app.auth import current_user
from app.db import get_session
from app.contact_notifications import notify_new_meetup
from app.meetup_lifecycle import MAX_AT_ONCE, Conflict, LifecycleError, call_off, has_room
from app.models import Meetup, MeetupSeries, Place, User
from app.place_status import PlaceUse, allowed_in, require

# The same as app.meetups.MAX_DAYS_AHEAD (that module imports this one).
WINDOW_DAYS = 30
BERLIN = ZoneInfo("Europe/Berlin")

router = APIRouter(tags=["series"])


class Slot(BaseModel):
    # Monday = 0 … Sunday = 6, as datetime.weekday().
    weekday: int = Field(ge=0, le=6)
    # The start in Berlin, e.g. "19:00".
    time: time
    hours: int = Field(ge=1, le=4)


class SeriesCreate(BaseModel):
    place_id: int
    slots: list[Slot] = Field(min_length=1, max_length=7)
    party_size: int = Field(default=1, ge=1, le=10)
    # The last date (Berlin) with an Occurrence; empty = every week until the Host cancels.
    until: date | None = None

    @field_validator("slots")
    @classmethod
    def one_slot_per_weekday(cls, slots: list[Slot]) -> list[Slot]:
        if len({slot.weekday for slot in slots}) != len(slots):
            raise ValueError("Jeder Wochentag nur einmal")
        return slots


class SeriesRead(BaseModel):
    id: int
    place_id: int
    party_size: int
    slots: list[Slot]
    until: date | None
    cancelled: bool


def to_read(series: MeetupSeries) -> SeriesRead:
    return SeriesRead(
        id=series.id,
        place_id=series.place_id,
        party_size=series.party_size,
        slots=[Slot.model_validate(slot) for slot in series.slots],
        until=series.until,
        cancelled=series.cancelled_at is not None,
    )


def occurrence_times(
    slots: list[Slot], after: datetime, until_time: datetime, until: date | None
) -> list[tuple[datetime, date, int]]:
    """(start in UTC, Berlin date, hours) of every Occurrence that starts after `after` and not
    later than `until_time`, and not after the end date. A Berlin wall-clock time, so 19:00
    stays 19:00 across a clock change."""
    by_weekday = {slot.weekday: slot for slot in slots}
    day = after.astimezone(BERLIN).date()
    last = until_time.astimezone(BERLIN).date()
    found = []
    while day <= last:
        slot = by_weekday.get(day.weekday())
        if slot and (until is None or day <= until):
            start = datetime.combine(day, slot.time, tzinfo=BERLIN).astimezone(UTC)
            if after < start <= until_time:
                found.append((start, day, slot.hours))
        day += timedelta(days=1)
    return found


def fill_series(
    session: Session, series: MeetupSeries, now: datetime, new_series: bool = False
) -> int:
    """Makes the missing Occurrences of the next WINDOW_DAYS days; the number made. The caller
    commits. Each new Occurrence notifies the Favorites; for a `new_series` the first one also
    notifies the Host's Contacts (SCRUM-43) and the Home areas (SCRUM-45), once for the whole
    Series.

    Each date counts on its own for the limit of Meetups at one moment (SCRUM-80): a
    `new_series` with a full date is refused (Conflict), a later fill skips that date and
    tries it again next time."""
    if series.cancelled_at is not None:
        return 0
    slots = [Slot.model_validate(slot) for slot in series.slots]
    have = set(session.exec(select(Meetup.series_date).where(Meetup.series_id == series.id)))
    created = []
    for start, day, hours in occurrence_times(slots, now, now + timedelta(days=WINDOW_DAYS), series.until):
        if day in have:
            continue
        if not has_room(session, series.host_id, start, start + timedelta(hours=hours), now):
            if new_series:
                raise Conflict(f"Am {day:%d.%m.} bist du zu dieser Zeit schon bei {MAX_AT_ONCE} Treffen.")
            continue
        meetup = Meetup(
            place_id=series.place_id,
            host_id=series.host_id,
            party_size=series.party_size,
            starts_at=start,
            ends_at=start + timedelta(hours=hours),
            series_id=series.id,
            series_date=day,
        )
        session.add(meetup)
        created.append(meetup)
    session.flush()
    created.sort(key=lambda meetup: meetup.starts_at)
    for index, meetup in enumerate(created):
        notify_new_meetup(session, meetup, now, first=new_series and index == 0)
    return len(created)


def fill_open_series(session: Session, now: datetime, place_id: int | None = None) -> None:
    """Fills every running Series (of one Place, or all) at a Place that may have Meetups, and
    commits when something was made."""
    query = (
        select(MeetupSeries)
        .join(Place, Place.id == MeetupSeries.place_id)
        .where(
            MeetupSeries.cancelled_at.is_(None),
            or_(MeetupSeries.until.is_(None), MeetupSeries.until >= now.astimezone(BERLIN).date()),
            allowed_in(PlaceUse.MEETUP),
        )
    )
    if place_id is not None:
        query = query.where(MeetupSeries.place_id == place_id)
    if sum(fill_series(session, series, now) for series in session.exec(query).all()):
        session.commit()


def delete_future_of(series: MeetupSeries):
    """SQL: delete all Occurrences of a Series (for tests that fill from a fixed day)."""
    return delete(Meetup).where(Meetup.series_id == series.id)


@router.post("/meetup-series", response_model=SeriesRead, status_code=status.HTTP_201_CREATED)
def create_series(
    body: SeriesCreate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """A weekly Series; its Occurrences of the next 30 days are made at once. The creator is
    the Host of each Occurrence."""
    require(session, body.place_id, PlaceUse.MEETUP)
    now = datetime.now(UTC)
    if body.until is not None and body.until < now.astimezone(BERLIN).date():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Das Enddatum liegt in der Vergangenheit",
        )
    series = MeetupSeries(
        place_id=body.place_id,
        host_id=user.id,
        party_size=body.party_size,
        slots=[slot.model_dump(mode="json") for slot in body.slots],
        until=body.until,
        created_at=now,
    )
    session.add(series)
    session.flush()
    try:
        fill_series(session, series, now, new_series=True)
    except LifecycleError:
        session.rollback()
        raise
    session.commit()
    session.refresh(series)
    return to_read(series)


@router.post("/meetup-series/{series_id}/cancel", response_model=SeriesRead)
def cancel_series(
    series_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """The Host of the Series cancels it: every Occurrence that has not started is cancelled,
    and no new ones are made. A running Occurrence goes on (it can be ended)."""
    series = session.get(MeetupSeries, series_id)
    if series is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Serie nicht gefunden")
    if series.host_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Nur der Gastgeber kann die Serie absagen"
        )
    if series.cancelled_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Die Serie ist schon abgesagt")
    now = datetime.now(UTC)
    series.cancelled_at = now
    for meetup in session.exec(select(Meetup).where(Meetup.series_id == series.id)):
        # Upcoming ones are cancelled, a running one goes on (SCRUM-61: one transition).
        call_off(session, meetup, now, end_running=False)
    session.commit()
    session.refresh(series)
    return to_read(series)
