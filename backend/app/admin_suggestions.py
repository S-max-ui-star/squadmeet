"""Admin approval of Place suggestions (SCRUM-56, see CONTEXT.md "Place suggestion").

A Place suggestion with 3 Confirmations waits for an Admin (app.suggestions sets confirmed_at).
The Admin sees the waiting suggestions with their position, Confirmations and the OSM hint
(app.osm_hint) and the open Place reports, and approves or rejects each one. Both close the open
reports, as lock and delete do: the Admin saw them and decided. Approval is possible only APPROVAL_DELAY after
the suggestion, so a group cannot invent a Place and make it active within one evening.
Rejecting is a soft delete, as the Admin delete of SCRUM-39: the row stays with deleted_at.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import require_admin
from app.db import get_session
from app.models import Place, User
from app.osm_hint import OverpassHinter, get_osm_hinter
from app.place_reports import close_reports
from app.place_status import STATUS, PlaceStatus, PlaceUse, require
from app.places import select_place_reads

APPROVAL_DELAY = timedelta(hours=24)

router = APIRouter(prefix="/admin/place-suggestions", tags=["admin"])


class WaitingSuggestion(BaseModel):
    id: int
    name: str
    activity_type: str
    lat: float
    lon: float
    address: str | None
    confirmations: int
    # Open Place reports (SCRUM-57). Approval closes them, so 3 would not hide the new Place.
    open_reports: int
    suggested_at: datetime
    confirmed_at: datetime
    # The earliest time of the approval, and whether it has come.
    approvable_from: datetime
    approvable: bool
    # See Place.osm_hints: [] = nothing found, None = Overpass did not answer (no hint).
    osm_hints: list[str] | None


def approvable_from(place_suggested_at: datetime | None, now: datetime) -> datetime:
    # Every suggestion has suggested_at (migration 0015 fills the old ones); without it, wait.
    return (place_suggested_at or now) + APPROVAL_DELAY


@router.get("", response_model=list[WaitingSuggestion])
def list_waiting_suggestions(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
    hinter: OverpassHinter = Depends(get_osm_hinter),
):
    """The suggestions that wait for an Admin, the longest waiting first. A missing OSM hint is
    checked now; a hint that Overpass gives is stored, so it is asked only once."""
    now = datetime.now(UTC)
    rows = session.exec(
        select_place_reads()
        .add_columns(Place.suggested_at, Place.confirmed_at, Place.osm_hints)
        .where(STATUS == PlaceStatus.WAITING.value)
        .order_by(Place.confirmed_at, Place.id)
    ).all()
    result = []
    for row in rows:
        hints = row.osm_hints
        if hints is None:
            try:
                hints = hinter.hints(row.lat, row.lon)
            except (OSError, TimeoutError, ValueError):
                hints = None
            else:
                session.get(Place, row.id).osm_hints = hints
        start = approvable_from(row.suggested_at, now)
        result.append(
            WaitingSuggestion(
                id=row.id,
                name=row.name,
                activity_type=row.activity_type,
                lat=row.lat,
                lon=row.lon,
                address=row.address,
                confirmations=row.confirmations,
                open_reports=row.open_reports,
                suggested_at=row.suggested_at or now,
                confirmed_at=row.confirmed_at,
                approvable_from=start,
                approvable=now >= start,
                osm_hints=hints,
            )
        )
    session.commit()
    return result


@router.post("/{place_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
def approve_suggestion(
    place_id: int,
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Freigeben: the suggestion becomes an active Place, "Von Nutzern hinzugefügt"."""
    place = require(session, place_id, PlaceUse.APPROVE)
    now = datetime.now(UTC)
    start = approvable_from(place.suggested_at, now)
    if now < start:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Freigabe erst 24 Stunden nach dem Vorschlag möglich.",
        )
    place.is_suggestion = False
    place.approved_at = now
    close_reports(session, place_id, now)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{place_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_suggestion(
    place_id: int,
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Ablehnen: the suggestion is gone, like an Admin delete. A suggestion has no Meetups."""
    place = require(session, place_id, PlaceUse.APPROVE)
    now = datetime.now(UTC)
    place.deleted_at = now
    close_reports(session, place_id, now)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
