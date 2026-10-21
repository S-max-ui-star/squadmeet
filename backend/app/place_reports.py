"""Place report (SCRUM-57, see CONTEXT.md "Place report").

A logged-in user reports a Place with one fixed reason (no free text, ADR-0004). The account
must be at least 7 days old (app.account_age), and a user reports at most 10 Places per hour, so
a few new accounts cannot hide Places. Each user has at most one open report per Place. From the first open report the Place detail shows the most common
reason; from REPORTS_TO_HIDE users the Place status is "reported" (app.place_status): off the map
and hidden from users until an Admin decides. Its Meetups stay.

The Admin lists the reported Places and either dismisses the reports (the Place stays) or locks
the Place (app.admin_places). Both close the open reports; the users may report again later.
"""

from collections import Counter
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import func, update
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from app.account_age import require_account_age
from app.audit import record
from app.auth import current_user, require_admin
from app.db import get_session
from app.models import Place, PlaceReport, PlaceReportReason, User
from app.place_status import OPEN_REPORTS, STATUS, PlaceStatus, PlaceUse, allowed_in, require
from app.rate_limit import RateLimit

router = APIRouter(tags=["place reports"])

IS_OPEN = PlaceReport.closed_at.is_(None)

# A user reports a Place they stand at or know; more than a few per hour is an attack on the map.
report_per_user = RateLimit(limit=10, window_seconds=60 * 60)

# The most common reason of the open reports; a tie goes to the reason reported first.
REPORT_REASON = (
    select(PlaceReport.reason)
    .where(PlaceReport.place_id == Place.id, IS_OPEN)
    .group_by(PlaceReport.reason)
    .order_by(func.count().desc(), func.min(PlaceReport.created_at))
    .limit(1)
    .scalar_subquery()
)


class ReportInput(BaseModel):
    reason: PlaceReportReason


class ReportedPlace(BaseModel):
    id: int
    name: str
    activity_type: str
    lat: float
    lon: float
    address: str | None
    # The number of open reports per reason.
    reasons: dict[str, int]
    first_reported_at: datetime
    # Off the map: the status is "reported". A Place suggestion stays on the map (app.place_status).
    hidden: bool


def close_reports(session: Session, place_id: int, now: datetime) -> int:
    """Close the open reports of the Place; the number closed. The caller commits."""
    closed = session.exec(
        update(PlaceReport)
        .where(PlaceReport.place_id == place_id, IS_OPEN)
        .values(closed_at=now)
        .returning(PlaceReport.id)
    ).all()
    for (report_id,) in closed:
        record(session, "place_report", report_id, "update", {"closed_at": [None, now]})
    return len(closed)


@router.post("/places/{place_id}/reports", status_code=status.HTTP_204_NO_CONTENT)
def report_place(
    place_id: int,
    body: ReportInput,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Melden. A second open report of the same user answers 409 and changes nothing."""
    require(session, place_id, PlaceUse.REPORT)
    now = datetime.now(UTC)
    require_account_age(user, now)
    report_per_user.hit(user.id)
    # One statement, so two requests at the same moment cannot make two open reports.
    values = {
        "place_id": place_id,
        "user_id": user.id,
        "reason": body.reason,
        "created_at": now,
    }
    inserted = session.exec(
        insert(PlaceReport)
        .values(**values)
        .on_conflict_do_nothing(index_elements=["place_id", "user_id"], index_where=IS_OPEN)
        .returning(PlaceReport.id)
    ).first()
    if inserted is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Du hast diesen Platz schon gemeldet"
        )
    record(session, "place_report", inserted.id, "insert", values)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/place-reports", response_model=list[ReportedPlace], tags=["admin"])
def list_reported_places(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """The Places with open reports: the hidden ones first, then by the number of reports.
    Locked and deleted Places are left out; locking closes their reports anyway."""
    places = session.exec(
        select(
            Place.id,
            Place.name,
            Place.activity_type,
            func.ST_Y(Place.location).label("lat"),
            func.ST_X(Place.location).label("lon"),
            Place.address,
            STATUS.label("status"),
        ).where(OPEN_REPORTS > 0, allowed_in(PlaceUse.REVIEW))
    ).all()
    reports = session.exec(
        select(PlaceReport).where(PlaceReport.place_id.in_([p.id for p in places]), IS_OPEN)
    ).all()
    result = []
    for place in places:
        own = [r for r in reports if r.place_id == place.id]
        result.append(
            ReportedPlace(
                id=place.id,
                name=place.name,
                activity_type=place.activity_type,
                lat=place.lat,
                lon=place.lon,
                address=place.address,
                reasons=dict(Counter(r.reason for r in own).most_common()),
                first_reported_at=min(r.created_at for r in own),
                hidden=place.status == PlaceStatus.REPORTED.value,
            )
        )
    result.sort(key=lambda p: (not p.hidden, -sum(p.reasons.values()), p.first_reported_at))
    return result


@router.post(
    "/admin/place-reports/{place_id}/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["admin"],
)
def dismiss_reports(
    place_id: int,
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Verwerfen: the reports are closed, and the Place is back on the map."""
    require(session, place_id, PlaceUse.REVIEW)
    if close_reports(session, place_id, datetime.now(UTC)) == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Dieser Platz hat keine offenen Meldungen"
        )
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
