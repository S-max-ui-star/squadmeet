"""Place suggestions (SCRUM-30, SCRUM-36): a user at a Place that is missing on the map suggests
it, and two other users confirm it at the Place.

Before saving, the app asks for Places of the same Activity type within DUPLICATE_RADIUS_M
("Ist es einer davon?"); the user can still continue. A suggestion is a Place with
is_suggestion = true, so the map, the Place detail and its URL work for it as for any Place.
The suggester's own Confirmation is the first of CONFIRMATIONS_NEEDED; at CONFIRMATIONS_NEEDED
the suggestion waits for an Admin (confirmed_at, SCRUM-56, app.admin_suggestions), who makes it
active. Suggesting and confirming require an account that is at least 7 days old
(app.account_age).
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2 import Geography
from pydantic import BaseModel, Field
from sqlalchemy import cast, func
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from app.account_age import require_account_age
from app.activities import LABELS, ActivityType
from app.audit import record
from app.auth import current_user
from app.db import get_session
from app.models import Place, PlaceConfirmation, PlaceRead, User
from app.place_status import PlaceUse, allowed_in, require
from app.places import select_place_reads
from app.rate_limit import RateLimit

DUPLICATE_RADIUS_M = 50
CONFIRM_RADIUS_M = 100
CONFIRMATIONS_NEEDED = 3
MAX_NAME_LENGTH = 60

router = APIRouter(prefix="/place-suggestions", tags=["place suggestions"])

# A user stands at each Place they suggest, so a few per hour is plenty; more is map spam.
suggest_per_user = RateLimit(limit=5, window_seconds=60 * 60)


class NearbyPlace(PlaceRead):
    distance_m: int


class SuggestionCreate(BaseModel):
    activity_type: ActivityType
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    # Empty or missing: the German word for the Activity type, as for an OSM Place without a name.
    name: str = Field(default="", max_length=MAX_NAME_LENGTH)


class ConfirmInput(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


def point(lat: float, lon: float):
    return func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)


@router.get("/nearby", response_model=list[NearbyPlace])
def nearby_places(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    activity_type: ActivityType = Query(),
    session: Session = Depends(get_session),
):
    """The duplicate warning: Places of the same Activity type within DUPLICATE_RADIUS_M,
    suggestions included, the nearest first."""
    here = cast(point(lat, lon), Geography)
    there = cast(Place.location, Geography)
    distance = func.ST_Distance(there, here)
    rows = session.exec(
        select_place_reads()
        .add_columns(func.round(distance).label("distance_m"))
        .where(
            Place.activity_type == activity_type,
            # Geography: the distance is in metres on the earth, not in degrees.
            func.ST_DWithin(there, here, DUPLICATE_RADIUS_M),
            # A Place the map does not show cannot be opened, so it is no duplicate to offer.
            allowed_in(PlaceUse.MAP),
        )
        .order_by(distance, Place.id)
    ).all()
    return [NearbyPlace.model_validate(row, from_attributes=True) for row in rows]


@router.post("", response_model=PlaceRead, status_code=status.HTTP_201_CREATED)
def suggest_place(
    body: SuggestionCreate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Add a Place suggestion at the user's position, with the user's own Confirmation."""
    now = datetime.now(UTC)
    require_account_age(user, now)
    suggest_per_user.hit(user.id)
    place = Place(
        name=body.name.strip() or LABELS[body.activity_type],
        activity_type=body.activity_type,
        location=f"SRID=4326;POINT({body.lon} {body.lat})",
        is_suggestion=True,
        suggested_at=now,
    )
    session.add(place)
    session.flush()
    session.add(PlaceConfirmation(place_id=place.id, user_id=user.id, created_at=now))
    session.commit()
    row = session.exec(select_place_reads().where(Place.id == place.id)).one()
    return PlaceRead.model_validate(row, from_attributes=True)


@router.post("/{place_id}/confirm", response_model=PlaceRead)
def confirm_place(
    place_id: int,
    body: ConfirmInput,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Confirm a Place suggestion while standing within CONFIRM_RADIUS_M of it (SCRUM-36)."""
    place = require(session, place_id, PlaceUse.CONFIRM)
    now = datetime.now(UTC)
    require_account_age(user, now)
    already = session.exec(
        select(PlaceConfirmation.id).where(
            PlaceConfirmation.place_id == place_id, PlaceConfirmation.user_id == user.id
        )
    ).first()
    if already is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Du hast diesen Platzvorschlag schon bestätigt.",
        )
    here = cast(point(body.lat, body.lon), Geography)
    there = cast(Place.location, Geography)
    within = session.exec(
        select(func.ST_DWithin(there, here, CONFIRM_RADIUS_M)).where(Place.id == place_id)
    ).one()
    if not within:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Du musst am Platz sein (höchstens {CONFIRM_RADIUS_M} m entfernt), um ihn zu bestätigen.",
        )
    values = {"place_id": place_id, "user_id": user.id, "created_at": now}
    inserted = session.exec(
        insert(PlaceConfirmation)
        .values(**values)
        .on_conflict_do_nothing(constraint="uq_place_confirmation_place_user")
        .returning(PlaceConfirmation.id)
    ).first()
    if inserted is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Du hast diesen Platzvorschlag schon bestätigt.",
        )
    # The insert is no ORM change, so the audit log hears of it here (SCRUM-115).
    record(session, "place_confirmation", inserted.id, "insert", values)
    total = session.exec(
        select(func.count()).where(PlaceConfirmation.place_id == place_id)
    ).one()
    if total >= CONFIRMATIONS_NEEDED:
        place.confirmed_at = now
    session.commit()
    row = session.exec(select_place_reads().where(Place.id == place_id)).one()
    return PlaceRead.model_validate(row, from_attributes=True)

