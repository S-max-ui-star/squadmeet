"""The Meetup routes (see CONTEXT.md): a Now-meetup ("Ich bin jetzt hier", SCRUM-29), a later
Meetup (SCRUM-35), Join and Leave (SCRUM-34), the Host's Cancel, End, Leave and move (SCRUM-37),
and how a Meetup is shown to whom (guests and Block, SCRUM-32).

The rules live in app.meetup_lifecycle (SCRUM-61): state, transitions and who may do what. These
routes only translate HTTP; a LifecycleError becomes the HTTP answer in app.main. Each answer
carries the Meetup's state and the actions the viewer may take, so the UI does not work the
rules out again.
"""

from datetime import UTC, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import and_, func, or_, true
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app import meetup_lifecycle as lifecycle
from app.auth import bearer, current_login, current_user
from app.blocks import blocked_by, blockers_of
from app.db import get_session
from app.contact_notifications import MAX_INVITES, invite, notify_new_meetup
from app.meetup_lifecycle import MAX_DAYS_AHEAD, MeetupState, is_active, is_open
from app.models import Meetup, MeetupJoin, MeetupSeries, Place, User
from app.place_status import PlaceUse, require, view_use
from app.series import fill_open_series

MIN_HOURS = 1
MAX_HOURS = 4
DEFAULT_HOURS = 2
MAX_PARTY_SIZE = 10
# Re-exported: other modules and tests use these names from here.
__all__ = ["MAX_DAYS_AHEAD", "is_active", "is_open", "joined_people", "viewer", "router"]
BERLIN = ZoneInfo("Europe/Berlin")
TimeSpan = Literal["now", "3h", "6h", "today"]

router = APIRouter(tags=["meetups"])



def time_span_end(span: TimeSpan, now: datetime) -> datetime | None:
    """Exclusive end of a Time filter. "Today" always means Berlin's next midnight."""
    if span == "now":
        return None
    if span == "3h":
        return now + timedelta(hours=3)
    if span == "6h":
        return now + timedelta(hours=6)
    berlin_now = now.astimezone(BERLIN)
    tomorrow = berlin_now.date() + timedelta(days=1)
    return datetime.combine(tomorrow, time.min, tzinfo=BERLIN).astimezone(UTC)


def in_time_span(span: TimeSpan, now: datetime):
    """SQL condition for running Meetups and those starting before the span's end."""
    end = time_span_end(span, now)
    return and_(
        Meetup.ends_at > now,
        Meetup.starts_at <= now if end is None else Meetup.starts_at < end,
        Meetup.cancelled_at.is_(None),
        Meetup.closed_at.is_(None),
    )


def visible_to(session: Session, user: User | None):
    """SQL condition for Meetups this viewer may see, including a prior Join after handover."""
    hidden = blockers_of(session, user.id if user else None)
    if not hidden:
        return true()
    mine = select(MeetupJoin.meetup_id).where(MeetupJoin.user_id == user.id)
    return or_(Meetup.host_id.not_in(hidden), Meetup.id.in_(mine))


class MeetupCreate(BaseModel):
    place_id: int
    hours: int = Field(default=DEFAULT_HOURS, ge=MIN_HOURS, le=MAX_HOURS)
    party_size: int = Field(default=1, ge=1, le=MAX_PARTY_SIZE)
    # Empty = a Now-meetup. A time needs its time zone, e.g. "2026-10-17T18:00:00+02:00".
    starts_at: AwareDatetime | None = None


class MeetupTimeChange(BaseModel):
    starts_at: AwareDatetime


class JoinCreate(BaseModel):
    party_size: int = Field(default=1, ge=1, le=MAX_PARTY_SIZE)


class MoveAnswer(BaseModel):
    # go = mitgehen, stay = hierbleiben, leave = absagen
    answer: Literal["go", "stay", "leave"]


def viewer(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(get_session),
) -> User | None:
    """The logged-in user of the request, or None for a guest (no 401)."""
    try:
        login = current_login(credentials, session)
    except HTTPException:
        return None
    return session.get(User, login.user_id)


def joined_people(now: datetime, hidden_hosts: frozenset[int] = frozenset()):
    """SQL: the people of all active Meetups at a Place, the Host's Party and every Join.
    For the map (places.py), in the same subquery style as the Place columns.
    Meetups hosted by `hidden_hosts` (the viewer's blockers, SCRUM-32) do not count."""
    joins = (
        select(func.coalesce(func.sum(MeetupJoin.party_size), 0))
        .where(MeetupJoin.meetup_id == Meetup.id)
        .scalar_subquery()
    )
    query = select(func.coalesce(func.sum(Meetup.party_size + joins), 0)).where(
        Meetup.place_id == Place.id, is_active(now)
    )
    if hidden_hosts:
        query = query.where(Meetup.host_id.not_in(hidden_hosts))
    return query


class HostRead(BaseModel):
    id: int
    nickname: str
    avatar: str


class ParticipantRead(HostRead):
    party_size: int


class MeetupRead(BaseModel):
    id: int
    place_id: int
    # None for a guest: only logged-in users see who comes (decided in SCRUM-34).
    host: HostRead | None
    # The Host's own Party size.
    party_size: int
    # The Host's Party plus every Join.
    people: int
    # The users who joined, the earliest first; None for a guest.
    participants: list[ParticipantRead] | None
    starts_at: datetime
    ends_at: datetime
    cancelled: bool
    # For the viewer only: the Host moved this Meetup, and the viewer has not answered yet.
    move_offer: "MoveOfferRead | None"
    # For the viewer only: they are in this Meetup, and so is someone they blocked (SCRUM-32).
    blocked_user_in: bool = False
    # An Occurrence of a weekly Series (SCRUM-38).
    series_id: int | None = None
    # SCRUM-61: the state now, and what the viewer may do (the buttons the UI shows).
    state: MeetupState
    actions: list[lifecycle.Action]


class MoveOfferRead(BaseModel):
    meetup_id: int
    host: HostRead
    starts_at: datetime
    ends_at: datetime


def move_offer(session: Session, meetup: Meetup, user: User | None, joins, now: datetime):
    """The offer "go along / stay / leave" for `user`, while the old time has not started."""
    if user is None or meetup.moved_to_id is None or meetup.starts_at <= now:
        return None
    if meetup.host_id == user.id:
        pending = meetup.host_move_pending
    else:
        pending = any(join.move_pending for join, member in joins if member.id == user.id)
    target = session.get(Meetup, meetup.moved_to_id) if pending else None
    if target is None or not is_open(target, now):
        return None
    host = session.get(User, target.host_id)
    return MoveOfferRead(
        meetup_id=target.id,
        host=HostRead(id=host.id, nickname=host.nickname, avatar=host.avatar),
        starts_at=target.starts_at,
        ends_at=target.ends_at,
    )


def to_reads(session: Session, meetups: list[Meetup], user: User | None) -> list[MeetupRead]:
    """The Meetups as `user` may see them, with their Joins (two queries for any number)."""
    ids = [meetup.id for meetup in meetups]
    joins: dict[int, list[tuple[MeetupJoin, User]]] = {meetup_id: [] for meetup_id in ids}
    for join, member in session.exec(
        select(MeetupJoin, User)
        .join(User, User.id == MeetupJoin.user_id)
        .where(MeetupJoin.meetup_id.in_(ids))
        .order_by(MeetupJoin.joined_at, MeetupJoin.id)
    ).all():
        joins[join.meetup_id].append((join, member))
    hosts = {
        host.id: host
        for host in session.exec(
            select(User).where(User.id.in_({meetup.host_id for meetup in meetups}))
        ).all()
    }
    now = datetime.now(UTC)
    series_ids = {meetup.series_id for meetup in meetups if meetup.series_id is not None}
    series = (
        {s.id: s for s in session.exec(select(MeetupSeries).where(MeetupSeries.id.in_(series_ids)))}
        if series_ids
        else {}
    )
    # SCRUM-32: the viewer's blockers stay unnamed; the users the viewer blocked trigger a warning.
    hidden = blockers_of(session, user.id) if user else set()
    blocked = blocked_by(session, user.id) if user else set()
    reads = []
    for meetup in meetups:
        host = hosts[meetup.host_id]
        members = {meetup.host_id} | {member.id for _, member in joins[meetup.id]}
        reads.append(
            MeetupRead(
                id=meetup.id,
                place_id=meetup.place_id,
                host=None
                if user is None or host.id in hidden
                else HostRead(id=host.id, nickname=host.nickname, avatar=host.avatar),
                party_size=meetup.party_size,
                people=meetup.party_size + sum(join.party_size for join, _ in joins[meetup.id]),
                participants=None
                if user is None
                else [
                    ParticipantRead(
                        id=member.id,
                        nickname=member.nickname,
                        avatar=member.avatar,
                        party_size=join.party_size,
                    )
                    for join, member in joins[meetup.id]
                    if member.id not in hidden
                ],
                starts_at=meetup.starts_at,
                ends_at=meetup.ends_at,
                cancelled=meetup.cancelled_at is not None,
                move_offer=move_offer(session, meetup, user, joins[meetup.id], now),
                blocked_user_in=user is not None
                and user.id in members
                and bool(members & blocked),
                series_id=meetup.series_id,
                state=lifecycle.state(meetup, now),
                actions=lifecycle.actions(
                    meetup,
                    user.id if user else None,
                    user is not None and any(member.id == user.id for _, member in joins[meetup.id]),
                    now,
                    series.get(meetup.series_id),
                ),
            )
        )
    return reads


def to_read(session: Session, meetup: Meetup, user: User | None) -> MeetupRead:
    return to_reads(session, [meetup], user)[0]


def get_meetup(session: Session, meetup_id: int) -> Meetup:
    meetup = session.get(Meetup, meetup_id)
    if meetup is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meetup not found")
    return meetup


@router.post("/meetups", response_model=MeetupRead, status_code=status.HTTP_201_CREATED)
def create_meetup(
    body: MeetupCreate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """A Meetup that starts now or at `starts_at` and ends after `hours`. The creator is the
    Host."""
    require(session, body.place_id, PlaceUse.MEETUP)
    now = datetime.now(UTC)
    starts_at = now
    if body.starts_at is not None:
        lifecycle.check_start(body.starts_at, now)
        starts_at = body.starts_at
    lifecycle.require_room(session, user.id, starts_at, starts_at + timedelta(hours=body.hours), now)
    meetup = Meetup(
        place_id=body.place_id,
        host_id=user.id,
        party_size=body.party_size,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=body.hours),
    )
    session.add(meetup)
    session.flush()
    notify_new_meetup(session, meetup, now)
    session.commit()
    session.refresh(meetup)
    return to_read(session, meetup, user)


@router.get("/places/{place_id}/meetups", response_model=list[MeetupRead])
def list_meetups(
    place_id: int,
    user: User | None = Depends(viewer),
    session: Session = Depends(get_session),
):
    """The upcoming, live and cancelled Meetups at a Place, for the Place detail page. By start
    time, so the live ones come first."""
    require(session, place_id, view_use(user))
    now = datetime.now(UTC)
    # The Occurrences of the next 30 days of this Place's Series (SCRUM-38).
    fill_open_series(session, now, place_id)
    query = (
        select(Meetup)
        .where(Meetup.place_id == place_id, lifecycle.is_listed(now))
        .order_by(Meetup.starts_at, Meetup.id)
    )
    # Not the Meetups a blocker hosts, unless the user was in before (a handover, SCRUM-32).
    query = query.where(visible_to(session, user))
    return to_reads(session, list(session.exec(query).all()), user)


@router.post("/meetups/{meetup_id}/end", response_model=MeetupRead)
def end_meetup_early(
    meetup_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """The Host ends the Meetup now; it leaves the map at once."""
    meetup = get_meetup(session, meetup_id)
    lifecycle.end(meetup, user.id, datetime.now(UTC))
    session.commit()
    session.refresh(meetup)
    return to_read(session, meetup, user)


@router.patch("/meetups/{meetup_id}", response_model=MeetupRead)
def move_meetup_start(
    meetup_id: int,
    body: MeetupTimeChange,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """The Host moves the start of an upcoming Meetup. The answer is the Host's Meetup (a new
    one when others had joined, see lifecycle.move)."""
    meetup = get_meetup(session, meetup_id)
    hosts = lifecycle.move(session, meetup, user.id, body.starts_at, datetime.now(UTC))
    session.commit()
    session.refresh(hosts)
    return to_read(session, hosts, user)


@router.post(
    "/meetups/{meetup_id}/join", response_model=MeetupRead, status_code=status.HTTP_201_CREATED
)
def join_meetup(
    meetup_id: int,
    body: JoinCreate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """"Ich komme mit": the user joins an upcoming or live Meetup with their Party size."""
    meetup = get_meetup(session, meetup_id)
    lifecycle.join(session, meetup, user.id, body.party_size, datetime.now(UTC))
    try:
        session.commit()
    except IntegrityError:
        # The unique key (meetup, user): of two requests at the same moment only one passes.
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Du bist schon dabei"
        ) from None
    return to_read(session, meetup, user)


class InviteCreate(BaseModel):
    # User ids of the inviter's Contacts.
    user_ids: list[int] = Field(min_length=1, max_length=MAX_INVITES)


class InviteResult(BaseModel):
    # New invitations; Contacts already in the Meetup or already invited are not counted.
    invited: int


@router.post("/meetups/{meetup_id}/invite", response_model=InviteResult)
def invite_contacts(
    meetup_id: int,
    body: InviteCreate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Kontakte einladen (SCRUM-43): the chosen Contacts get an invitation Notification."""
    meetup = get_meetup(session, meetup_id)
    count = invite(session, meetup, user.id, set(body.user_ids), datetime.now(UTC))
    session.commit()
    return InviteResult(invited=count)


@router.delete("/meetups/{meetup_id}/join", status_code=status.HTTP_204_NO_CONTENT)
def leave_meetup(
    meetup_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Leave: the user takes back their Join; the Host Leaving hands the Meetup over."""
    meetup = get_meetup(session, meetup_id)
    lifecycle.leave(session, meetup, user.id, datetime.now(UTC))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/meetups/{meetup_id}/cancel", response_model=MeetupRead)
def cancel_meetup(
    meetup_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Absagen: the Host calls off an upcoming Meetup for everyone. It stays listed as
    cancelled until its end time, so the users who joined see it."""
    meetup = get_meetup(session, meetup_id)
    lifecycle.cancel(session, meetup, user.id, datetime.now(UTC))
    session.commit()
    session.refresh(meetup)
    return to_read(session, meetup, user)


@router.post("/meetups/{meetup_id}/move-answer", response_model=MeetupRead)
def answer_move(
    meetup_id: int,
    body: MoveAnswer,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Go along / stay / leave after the Host moved the Meetup. The answer is the old Meetup."""
    meetup = get_meetup(session, meetup_id)
    lifecycle.answer_move(session, meetup, user.id, body.answer, datetime.now(UTC))
    session.commit()
    session.refresh(meetup)
    return to_read(session, meetup, user)
