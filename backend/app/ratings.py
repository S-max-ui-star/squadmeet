"""Ratings (SCRUM-31): 1–5 stars and at least one Reason for a Place (see CONTEXT.md).

One Rating per user per Place; a second one replaces the first. No location check.
The Place detail shows the average stars, the most chosen Reasons and the Condition.

The Condition comes only from the Reasons that the city or the operator must fix
(`condition_issue` in app/reasons.py). Such an issue stays until users say it is fixed
(Stefan's decision, 2026-10-09):

- For RECENT_DAYS after the last Rating that names it, the issue simply counts.
- Then a check opens: the Place detail shows the issue as "not confirmed" and asks logged-in
  users "Ist das noch so?". VOTES_NEEDED votes "still there" confirm it for another
  RECENT_DAYS, from the last of them.
- "Fixed" can be said at any time, so a repair does not wait for the check (Stefan,
  2026-10-09). VOTES_NEEDED votes "fixed" end the issue, until a new or changed Rating names
  it again.
- Votes count in a round: from the last report or confirmation on. Each user has one vote per
  round; a later vote replaces their own.
- A fixed issue does not change the Ratings (SCRUM-99): the Reason in Ratings from before the
  fix shows as fixed ("behoben am …"). A Rating after the fix names a new issue and counts
  normally.

Nothing is stored about checks except the votes: the state is worked out from the Ratings and
the votes each time (`issue_history`), so two votes at the same moment cannot break it.
"""

from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import literal_column
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from app import live
from app.audit import record
from app.auth import current_user
from app.db import get_session
from app.models import ConditionVote, Place, Rating, User
from app.meetups import viewer
from app.place_status import PlaceUse, require, view_use
from app.reasons import Reason, reasons_for

# Two months: how long a reported or confirmed issue counts before users are asked again.
# Also: without a Rating or a vote in this time, the Condition is "unknown".
RECENT_DAYS = 60
# Votes of different users that confirm an issue or end it.
VOTES_NEEDED = 3
# How many of the most chosen Reasons the Place detail shows.
TOP_REASONS = 3

router = APIRouter(tags=["ratings"])


class ReasonRead(BaseModel):
    key: str
    label: str
    positive: bool


class ReasonCount(ReasonRead):
    count: int
    # Set when these Ratings name an issue that users said is fixed: the time of the fix.
    fixed_at: datetime | None = None


class IssueRead(ReasonCount):
    """A problem named in Ratings; `count` is the number of Ratings since the last fix that
    name it."""

    # True when it was not confirmed for RECENT_DAYS and users are asked "Ist das noch so?".
    needs_check: bool
    # The votes of the current round so far ("fixed" can come before the check opens).
    still_there_votes: int
    fixed_votes: int


class ConditionRead(BaseModel):
    # unknown = no Rating or vote in RECENT_DAYS and no issue; good = no issue; issues = some.
    state: Literal["unknown", "good", "issues"]
    # The issues that are not fixed, the most named first.
    issues: list[IssueRead]


class RatingSummary(BaseModel):
    count: int
    # None while nobody rated the Place.
    average_stars: float | None
    top_reasons: list[ReasonCount]
    condition: ConditionRead


class RatingInput(BaseModel):
    stars: int = Field(ge=1, le=5)
    reasons: list[str] = Field(min_length=1)


class RatingRead(BaseModel):
    place_id: int
    stars: int
    reasons: list[str]
    updated_at: datetime


class RatingListItem(BaseModel):
    """One anonymous Rating in the public Place detail (SCRUM-100)."""

    stars: int
    reasons: list[str]
    updated_at: datetime


def to_read(reason: Reason) -> ReasonRead:
    return ReasonRead(key=reason.key, label=reason.label, positive=reason.positive)


@dataclass
class IssueState:
    needs_check: bool
    still_there_votes: int
    fixed_votes: int


@dataclass
class IssueHistory:
    # The open issue, or None when there is none (never named, or fixed).
    open: IssueState | None
    # When VOTES_NEEDED "fixed" votes ended it the last time; None if never.
    fixed_at: datetime | None


def issue_history(
    reported: list[datetime], votes: list[ConditionVote], now: datetime
) -> IssueHistory:
    """The state of one issue at a Place and its last fix.

    `reported` are the times of the Ratings that name it; `votes` are the votes about it.
    """
    window = timedelta(days=RECENT_DAYS)
    # Ratings and votes in time order; a Rating comes before a vote at the same moment.
    events = sorted(
        [(at, 0, 0, None) for at in reported] + [(v.created_at, 1, v.id or 0, v) for v in votes],
        key=lambda event: event[:3],
    )
    # The last report or confirmation of the open issue; None while there is no open issue.
    confirmed: datetime | None = None
    fixed_at = None
    round_votes: dict[int, bool] = {}
    for at, _, _, vote in events:
        if vote is None:
            # A new or changed Rating that names the issue starts over: older votes do not count.
            confirmed, round_votes = at, {}
            continue
        if confirmed is None or at == confirmed:
            continue  # nothing open to vote on, or from an earlier round
        if vote.still_there and at < confirmed + window:
            continue  # "still there" only counts while a check is open
        round_votes[vote.user_id] = vote.still_there
        still_there = sum(round_votes.values())
        if still_there >= VOTES_NEEDED:
            confirmed, round_votes = at, {}
        elif len(round_votes) - still_there >= VOTES_NEEDED:
            confirmed, fixed_at, round_votes = None, at, {}
    if confirmed is None:
        return IssueHistory(open=None, fixed_at=fixed_at)
    still_there = sum(round_votes.values())
    state = IssueState(
        needs_check=now >= confirmed + window,
        still_there_votes=still_there,
        fixed_votes=len(round_votes) - still_there,
    )
    return IssueHistory(open=state, fixed_at=fixed_at)


def summarize(
    ratings: list[Rating],
    votes: list[ConditionVote],
    reasons: dict[str, Reason],
    now: datetime,
) -> RatingSummary:
    issues = []
    # (Reason key, time of the fix or None) → Ratings; a fixed issue splits its Reason in two.
    chips: Counter[tuple[str, datetime | None]] = Counter()
    for key, n in Counter(key for r in ratings for key in r.reasons).most_common():
        if key not in reasons:
            continue
        if not reasons[key].affects_condition:
            chips[key, None] = n
            continue
        reported = [r.updated_at for r in ratings if key in r.reasons]
        history = issue_history(reported, [v for v in votes if v.reason_key == key], now)
        fixed = sum(at <= history.fixed_at for at in reported) if history.fixed_at else 0
        if fixed:
            chips[key, history.fixed_at] = fixed
        if n - fixed:
            chips[key, None] = n - fixed
        if history.open:
            issues.append(
                IssueRead(
                    **to_read(reasons[key]).model_dump(),
                    count=n - fixed,
                    **vars(history.open),
                )
            )
    issues.sort(key=lambda issue: -issue.count)
    since = now - timedelta(days=RECENT_DAYS)
    recent = any(r.updated_at > since for r in ratings) or any(v.created_at > since for v in votes)
    if issues:
        state = "issues"
    else:
        state = "good" if recent else "unknown"
    return RatingSummary(
        count=len(ratings),
        average_stars=round(sum(r.stars for r in ratings) / len(ratings), 1) if ratings else None,
        top_reasons=[
            ReasonCount(**to_read(reasons[key]).model_dump(), count=n, fixed_at=fixed_at)
            for (key, fixed_at), n in chips.most_common(TOP_REASONS)
        ],
        condition=ConditionRead(state=state, issues=issues),
    )


def load_summary(session: Session, place: Place) -> RatingSummary:
    ratings = session.exec(select(Rating).where(Rating.place_id == place.id)).all()
    votes = session.exec(select(ConditionVote).where(ConditionVote.place_id == place.id)).all()
    reasons = {reason.key: reason for reason in reasons_for(place.activity_type)}
    return summarize(list(ratings), list(votes), reasons, datetime.now(UTC))


@router.get("/places/{place_id}/reasons", response_model=list[ReasonRead])
def list_reasons(
    place_id: int,
    user: User | None = Depends(viewer),
    session: Session = Depends(get_session),
):
    """The Reasons the rating form offers for this Place (SCRUM-18)."""
    place = require(session, place_id, view_use(user))
    return [to_read(reason) for reason in reasons_for(place.activity_type)]


@router.get("/places/{place_id}/ratings", response_model=RatingSummary)
def rating_summary(
    place_id: int,
    user: User | None = Depends(viewer),
    session: Session = Depends(get_session),
):
    return load_summary(session, require(session, place_id, view_use(user)))


@router.get("/places/{place_id}/ratings/list", response_model=list[RatingListItem])
def rating_list(
    place_id: int,
    user: User | None = Depends(viewer),
    session: Session = Depends(get_session),
):
    """Every Rating, newest change first and without identifying the author."""
    place = require(session, place_id, view_use(user))
    reasons = {reason.key: reason.label for reason in reasons_for(place.activity_type)}
    rows = session.exec(
        select(Rating)
        .where(Rating.place_id == place_id)
        .order_by(Rating.updated_at.desc(), Rating.id.desc())
    ).all()
    return [
        RatingListItem(
            stars=rating.stars,
            reasons=[reasons[key] for key in rating.reasons if key in reasons],
            updated_at=rating.updated_at,
        )
        for rating in rows
    ]


@router.get("/places/{place_id}/ratings/mine", response_model=RatingRead | None)
def my_rating(
    place_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """The user's own Rating of the Place, or null, so the form can show it for a change."""
    require(session, place_id, view_use(user))
    rating = session.exec(
        select(Rating).where(Rating.place_id == place_id, Rating.user_id == user.id)
    ).first()
    return rating and RatingRead.model_validate(rating, from_attributes=True)


@router.put("/places/{place_id}/ratings/mine", response_model=RatingRead)
def rate_place(
    place_id: int,
    body: RatingInput,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Rate the Place, or replace the user's earlier Rating of it."""
    place = require(session, place_id, PlaceUse.RATE)
    allowed = {reason.key for reason in reasons_for(place.activity_type)}
    unknown = [key for key in body.reasons if key not in allowed]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Diese Begründung passt nicht zu dem Platz: {', '.join(unknown)}",
        )
    now = datetime.now(UTC)
    values = {
        "stars": body.stars,
        # dict.fromkeys drops a Reason sent twice and keeps the order.
        "reasons": list(dict.fromkeys(body.reasons)),
        "updated_at": now,
    }
    # The old values for the audit log; the lock keeps them true until the upsert.
    old = session.exec(
        select(Rating.stars, Rating.reasons, Rating.updated_at)
        .where(Rating.place_id == place_id, Rating.user_id == user.id)
        .with_for_update()
    ).first()
    new = {"place_id": place_id, "user_id": user.id, "created_at": now, **values}
    # One statement, so two requests at the same moment cannot make two Ratings.
    saved = session.exec(
        insert(Rating)
        .values(**new)
        .on_conflict_do_update(constraint="uq_rating_place_user", set_=values)
        # xmax is 0 only in a row that this statement inserted.
        .returning(Rating.id, literal_column("xmax = 0").label("inserted"))
    ).one()
    # The upsert is no ORM change, so the audit log (SCRUM-115) and the open pages (SCRUM-98)
    # hear of it here.
    if saved.inserted:
        record(session, "rating", saved.id, "insert", new)
    else:
        record(session, "rating", saved.id, "update", changed(old, values))
    live.note(session, None, f"ratings:{place_id}")
    session.commit()
    rating = session.exec(
        select(Rating).where(Rating.place_id == place_id, Rating.user_id == user.id)
    ).one()
    session.refresh(rating)
    return RatingRead.model_validate(rating, from_attributes=True)


def changed(old, values: dict) -> dict:
    """[old, new] for each value that the update changed. Without a row read before (a second
    request inserted it at the same moment), the old values are unknown."""
    before = old._asdict() if old else {}
    return {
        key: [before.get(key), value] for key, value in values.items() if before.get(key) != value
    }


class ConditionVoteInput(BaseModel):
    # True = "Nein, noch nicht behoben"; False = "Ja, behoben" (words: SCRUM-82).
    still_there: bool


@router.post("/places/{place_id}/condition/{reason_key}/check", response_model=RatingSummary)
def vote_on_issue(
    place_id: int,
    reason_key: str,
    body: ConditionVoteInput,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """"Fixed" for an issue at any time, "still there" while its check is open.

    Returns the new summary."""
    place = require(session, place_id, PlaceUse.RATE)
    summary = load_summary(session, place)
    issue = next((i for i in summary.condition.issues if i.key == reason_key), None)
    if issue is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Diesen Mangel gibt es hier nicht"
        )
    if body.still_there and not issue.needs_check:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dieser Mangel wurde erst vor Kurzem bestätigt",
        )
    session.add(
        ConditionVote(
            place_id=place_id,
            reason_key=reason_key,
            user_id=user.id,
            still_there=body.still_there,
            created_at=datetime.now(UTC),
        )
    )
    session.commit()
    return load_summary(session, place)
