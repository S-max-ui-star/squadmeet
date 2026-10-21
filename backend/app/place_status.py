"""The Place status (SCRUM-60, CONTEXT.md: Place status) and what it allows.

A Place has one status, worked out from its columns by one SQL expression (STATUS), so the
check of one Place (require) and the filter of a list (allowed_in) cannot drift apart.
RULES says for each use and status whether the use is allowed, or which error it answers.
Callers ask this module and do not read is_suggestion, locked_at, deleted_at or the open Place
reports themselves.

This module imports no other app module except the models, so every route can import it.
"""

from enum import StrEnum
from typing import NamedTuple

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func
from sqlmodel import Session, select

from app.models import Place, PlaceReport, User


class PlaceStatus(StrEnum):
    ACTIVE = "active"
    # A user added it, and it has fewer than 3 Confirmations (SCRUM-30, SCRUM-36).
    SUGGESTION = "suggestion"
    # A Place suggestion with 3 Confirmations; an Admin must approve it (SCRUM-56).
    WAITING = "waiting"
    # Open Place reports from 3 different users (SCRUM-57); off the map until an Admin decides.
    REPORTED = "reported"
    # An Admin locked it (SCRUM-39); an Admin can unlock it.
    LOCKED = "locked"
    # An Admin deleted it (SCRUM-39). The row stays, so the OSM import cannot bring it back.
    DELETED = "deleted"


class PlaceUse(StrEnum):
    # The Place detail and what it shows: Meetups, Ratings, Reasons.
    VIEW = "view"
    # The same for an Admin, who also opens a reported Place (view_use).
    REVIEW = "review"
    # The map, the name search and the duplicate warning of a suggestion.
    MAP = "map"
    MEETUP = "meetup"
    # A Rating, and the "noch so / behoben" vote on an issue.
    RATE = "rate"
    CONFIRM = "confirm"
    # A Place report (SCRUM-57).
    REPORT = "report"
    # An Admin approves or rejects a Place suggestion that waits for it (SCRUM-56).
    APPROVE = "approve"
    # Lock, unlock and delete.
    ADMIN = "admin"


# Open Place reports from this many users hide a Place (SCRUM-57).
REPORTS_TO_HIDE = 3

# One open report per user and Place (uq_place_report_open), so this counts users.
OPEN_REPORTS = (
    select(func.count())
    .where(PlaceReport.place_id == Place.id, PlaceReport.closed_at.is_(None))
    .scalar_subquery()
)

# When two apply, the stronger status counts: deleted, then locked, then waiting, then
# suggestion, then reported. An approved Place keeps confirmed_at; is_suggestion = false makes
# it active. A reported suggestion stays a suggestion: the Admin approval guards it already.
STATUS = case(
    (Place.deleted_at.is_not(None), PlaceStatus.DELETED.value),
    (Place.locked_at.is_not(None), PlaceStatus.LOCKED.value),
    (and_(Place.is_suggestion, Place.confirmed_at.is_not(None)), PlaceStatus.WAITING.value),
    (Place.is_suggestion, PlaceStatus.SUGGESTION.value),
    (OPEN_REPORTS >= REPORTS_TO_HIDE, PlaceStatus.REPORTED.value),
    else_=PlaceStatus.ACTIVE.value,
)


class Refusal(NamedTuple):
    status_code: int
    detail: str


# Users must not learn that a hidden Place exists, so it answers as if there were none.
NOT_FOUND = Refusal(status.HTTP_404_NOT_FOUND, "Place not found")
# A Place suggestion may not be real; a Meetup or a Rating there would make it look real.
NOT_CONFIRMED = Refusal(status.HTTP_409_CONFLICT, "Dieser Platz ist noch nicht bestätigt")
ALREADY_CONFIRMED = Refusal(status.HTTP_409_CONFLICT, "Dieser Platz ist schon bestätigt.")
ENOUGH_CONFIRMATIONS = Refusal(
    status.HTTP_409_CONFLICT,
    "Dieser Platzvorschlag hat genug Bestätigungen und wartet auf die Freigabe durch einen Admin.",
)
NOT_WAITING = Refusal(status.HTTP_409_CONFLICT, "Dieser Platz wartet nicht auf eine Freigabe")

ACTIVE, SUGGESTION, WAITING, REPORTED, LOCKED, DELETED = PlaceStatus

# None = allowed. A reported Place is hidden from users like a locked one, until an Admin
# dismisses the reports or locks it; its Meetups stay, but take no Join or move (SCRUM-72).
RULES: dict[PlaceUse, dict[PlaceStatus, Refusal | None]] = {
    PlaceUse.VIEW: {
        ACTIVE: None,
        SUGGESTION: None,
        WAITING: None,
        REPORTED: NOT_FOUND,
        LOCKED: NOT_FOUND,
        DELETED: NOT_FOUND,
    },
    PlaceUse.REVIEW: {
        ACTIVE: None,
        SUGGESTION: None,
        WAITING: None,
        REPORTED: None,
        LOCKED: NOT_FOUND,
        DELETED: NOT_FOUND,
    },
    PlaceUse.MAP: {
        ACTIVE: None,
        SUGGESTION: None,
        WAITING: None,
        REPORTED: NOT_FOUND,
        LOCKED: NOT_FOUND,
        DELETED: NOT_FOUND,
    },
    PlaceUse.MEETUP: {
        ACTIVE: None,
        SUGGESTION: NOT_CONFIRMED,
        WAITING: NOT_CONFIRMED,
        REPORTED: NOT_FOUND,
        LOCKED: NOT_FOUND,
        DELETED: NOT_FOUND,
    },
    PlaceUse.RATE: {
        ACTIVE: None,
        SUGGESTION: NOT_CONFIRMED,
        WAITING: NOT_CONFIRMED,
        REPORTED: NOT_FOUND,
        LOCKED: NOT_FOUND,
        DELETED: NOT_FOUND,
    },
    PlaceUse.CONFIRM: {
        ACTIVE: ALREADY_CONFIRMED,
        SUGGESTION: None,
        WAITING: ENOUGH_CONFIRMATIONS,
        REPORTED: NOT_FOUND,
        LOCKED: NOT_FOUND,
        DELETED: NOT_FOUND,
    },
    PlaceUse.REPORT: {
        ACTIVE: None,
        SUGGESTION: None,
        WAITING: None,
        REPORTED: NOT_FOUND,
        LOCKED: NOT_FOUND,
        DELETED: NOT_FOUND,
    },
    # A locked suggestion is first unlocked; then the Admin decides.
    PlaceUse.APPROVE: {
        ACTIVE: NOT_WAITING,
        SUGGESTION: NOT_WAITING,
        WAITING: None,
        REPORTED: NOT_WAITING,
        LOCKED: NOT_WAITING,
        DELETED: NOT_FOUND,
    },
    # An Admin can lock a Place suggestion and unlock a Locked place; a deleted one is gone.
    PlaceUse.ADMIN: {
        ACTIVE: None,
        SUGGESTION: None,
        WAITING: None,
        REPORTED: None,
        LOCKED: None,
        DELETED: NOT_FOUND,
    },
}

# place.id is a PostgreSQL integer; a bigger number in the URL would make the query fail.
MAX_DB_INT = 2_147_483_647


def in_db(row_id: int) -> bool:
    """A bigger number than a PostgreSQL integer would make the query fail."""
    return 1 <= row_id <= MAX_DB_INT


def view_use(user: User | None) -> PlaceUse:
    """VIEW, or REVIEW for an Admin with MFA on (the rule of auth.require_admin), who may open a
    reported Place."""
    if user is not None and user.is_admin and user.mfa_enabled_at is not None:
        return PlaceUse.REVIEW
    return PlaceUse.VIEW


def allowed_in(use: PlaceUse):
    """SQL condition for a list: the Places whose status allows this use."""
    return STATUS.in_([s.value for s, refusal in RULES[use].items() if refusal is None])


def load(session: Session, place_id: int) -> tuple[Place, PlaceStatus] | None:
    if not 1 <= place_id <= MAX_DB_INT:
        return None
    row = session.exec(select(Place, STATUS).where(Place.id == place_id)).first()
    return row and (row[0], PlaceStatus(row[1]))


def get_status(session: Session, place_id: int) -> PlaceStatus | None:
    """The status of the Place, or None when it does not exist."""
    loaded = load(session, place_id)
    return loaded and loaded[1]


def require(session: Session, place_id: int, use: PlaceUse) -> Place:
    """The Place, when its status allows this use; else the error from RULES (404 when there is
    no such Place)."""
    loaded = load(session, place_id)
    refusal = NOT_FOUND if loaded is None else RULES[use][loaded[1]]
    if refusal is not None:
        raise HTTPException(status_code=refusal.status_code, detail=refusal.detail)
    return loaded[0]
