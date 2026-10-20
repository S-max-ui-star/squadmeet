"""Admin: lock, unlock and delete a Place (SCRUM-39, see CONTEXT.md "Locked place").

Lock hides a Place that is not publicly accessible; unlock shows it again. Delete hides it for
good: the row stays with deleted_at, so the OSM import (an upsert on OSM id and Activity type)
cannot bring it back, and its history (Ratings, past Meetups) stays.

Lock and delete call off the Place's Meetups: one that has not started is Cancelled, one that
runs is ended now (a running Meetup is ended, not cancelled, as in SCRUM-37). Unlock does not
undo this. Series Occurrences (SCRUM-38) do not exist yet.

Lock and delete also close the open Place reports (SCRUM-57): the Admin has decided, so an
unlocked Place is not hidden again by the old reports.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import require_admin
from app.db import get_session
from app.meetup_lifecycle import call_off
from app.models import Meetup, Place, User
from app.place_reports import close_reports
from app.place_status import STATUS, PlaceStatus, PlaceUse, get_status, require

router = APIRouter(prefix="/admin/places", tags=["admin"])


class LockedPlaceRead(BaseModel):
    id: int
    name: str
    activity_type: str
    address: str | None
    locked_at: datetime


def call_off_meetups(session: Session, place: Place, now: datetime, actor_id: int) -> None:
    """Cancel the Meetups that have not started, end the running ones (the shared transition
    call_off, SCRUM-61). The caller commits."""
    for meetup in session.exec(select(Meetup).where(Meetup.place_id == place.id)).all():
        call_off(session, meetup, now, actor_id)


@router.get("/locked", response_model=list[LockedPlaceRead])
def list_locked_places(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """The locked Places, the latest first, so an Admin can unlock one."""
    places = session.exec(
        select(Place)
        .where(STATUS == PlaceStatus.LOCKED.value)
        .order_by(Place.locked_at.desc(), Place.id)
    ).all()
    return [LockedPlaceRead.model_validate(place, from_attributes=True) for place in places]


@router.post("/{place_id}/lock", response_model=LockedPlaceRead)
def lock_place(
    place_id: int,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Sperren: the Place leaves the map and search; its Meetups are called off."""
    place = require(session, place_id, PlaceUse.ADMIN)
    if get_status(session, place_id) is PlaceStatus.LOCKED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Der Platz ist schon gesperrt")
    now = datetime.now(UTC)
    place.locked_at = now
    call_off_meetups(session, place, now, admin.id)
    close_reports(session, place_id, now)
    session.commit()
    session.refresh(place)
    return LockedPlaceRead.model_validate(place, from_attributes=True)


@router.post("/{place_id}/unlock", status_code=status.HTTP_204_NO_CONTENT)
def unlock_place(
    place_id: int,
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Entsperren: the Place is visible again. Cancelled Meetups stay cancelled."""
    place = require(session, place_id, PlaceUse.ADMIN)
    if get_status(session, place_id) is not PlaceStatus.LOCKED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Der Platz ist nicht gesperrt")
    place.locked_at = None
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_place(
    place_id: int,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Löschen: like lock, but for good. A locked Place can be deleted too."""
    place = require(session, place_id, PlaceUse.ADMIN)
    now = datetime.now(UTC)
    place.deleted_at = now
    call_off_meetups(session, place, now, admin.id)
    close_reports(session, place_id, now)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
