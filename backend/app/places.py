"""The Place routes: the map (SCRUM-21), the search (SCRUM-52) and the Place detail (SCRUM-24),
and the query for PlaceRead, which the duplicate warning (app.suggestions) uses too.

What a user may see of a Place depends on its status (app.place_status, SCRUM-60)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.audit import as_system
from app.blocks import blockers_of
from app.db import get_session
from app.geocoding import NominatimGeocoder, get_geocoder
from app.meetups import (
    MeetupRead,
    TimeSpan,
    in_time_span,
    joined_people,
    to_reads,
    viewer,
    visible_to,
)
from app.models import Meetup, Place, PlaceConfirmation, PlaceRead, PlaceSearchHit, User
from app.place_reports import REPORT_REASON
from app.rate_limit import RateLimit
from app.series import fill_open_series
from app.turnstile import client_ip
from app.place_status import (
    MAX_DB_INT,
    NOT_FOUND,
    OPEN_REPORTS,
    STATUS,
    PlaceStatus,
    PlaceUse,
    allowed_in,
    view_use,
)

router = APIRouter()

# A whole city is about 700 Places; more than this only happens when the map is zoomed far out.
MAX_PLACES = 2000
# Set on the answer when there were more Places than MAX_PLACES, so the map can ask to zoom in.
TRUNCATED_HEADER = "X-Places-Truncated"
# Each search may ask Nominatim, which allows one request per second for the whole app (SCRUM-70).
search_per_ip = RateLimit(limit=20, window_seconds=60)


class MapMeetupsRead(BaseModel):
    places: list[PlaceRead]
    meetups: list[MeetupRead]
    truncated: bool = False


def select_place_reads(hidden_hosts: frozenset[int] = frozenset()):
    """The columns of a PlaceRead: the PostGIS point as lat and lon, the people there now, and
    the Confirmations of a Place suggestion and whether it waits for an Admin (SCRUM-56), and
    the open Place reports with their most common reason (SCRUM-57).
    Meetups of `hidden_hosts` (the viewer's blockers, SCRUM-32) do not count in people_now."""
    # The Host's Party and every Join of the active Meetups (SCRUM-34).
    people_now = joined_people(datetime.now(UTC), hidden_hosts).scalar_subquery()
    confirmations = (
        select(func.count())
        .where(PlaceConfirmation.place_id == Place.id)
        .scalar_subquery()
    )
    return select(
        Place.id,
        Place.name,
        Place.activity_type,
        func.ST_Y(Place.location).label("lat"),
        func.ST_X(Place.location).label("lon"),
        Place.address,
        people_now.label("people_now"),
        Place.is_suggestion,
        confirmations.label("confirmations"),
        (STATUS == PlaceStatus.WAITING.value).label("waiting_for_admin"),
        OPEN_REPORTS.label("open_reports"),
        REPORT_REASON.label("report_reason"),
    )


def parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    """"west,south,east,north" in degrees (WGS 84), the order of Leaflet's toBBoxString()."""
    try:
        west, south, east, north = (float(value) for value in bbox.split(","))
    except ValueError:
        raise HTTPException(status_code=422, detail="bbox must be west,south,east,north") from None
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise HTTPException(status_code=422, detail="bbox is not a valid area")
    return west, south, east, north


@router.get("/places", response_model=list[PlaceRead])
def list_places(
    response: Response,
    bbox: str = Query(description="The visible map area: west,south,east,north"),
    user: User | None = Depends(viewer),
    session: Session = Depends(get_session),
):
    """The Places inside the visible map area (SCRUM-21), at most MAX_PLACES. A logged-in
    user's count of people leaves out the Meetups of users who blocked them (SCRUM-32)."""
    west, south, east, north = parse_bbox(bbox)
    area = func.ST_MakeEnvelope(west, south, east, north, 4326)
    # Weekly Series (SCRUM-38): make the missing Occurrences in the area, so one that starts now
    # counts.
    fill_open_series(session, datetime.now(UTC), Place.location.op("&&")(area))
    rows = session.exec(
        select_place_reads(frozenset(blockers_of(session, user.id if user else None)))
        # && compares bounding boxes, so PostgreSQL can use the spatial index.
        .where(Place.location.op("&&")(area), allowed_in(PlaceUse.MAP))
        .order_by(Place.id)
        .limit(MAX_PLACES + 1)
    ).all()
    if len(rows) > MAX_PLACES:
        rows = rows[:MAX_PLACES]
        response.headers[TRUNCATED_HEADER] = "true"
    return [PlaceRead.model_validate(row, from_attributes=True) for row in rows]


@router.get("/meetups", response_model=MapMeetupsRead)
def list_map_meetups(
    bbox: str = Query(description="The visible map area: west,south,east,north"),
    time_span: TimeSpan = Query(alias="time"),
    user: User | None = Depends(viewer),
    session: Session = Depends(get_session),
):
    """Meetups and their Places for one Time filter and the visible map area (SCRUM-54)."""
    west, south, east, north = parse_bbox(bbox)
    area = func.ST_MakeEnvelope(west, south, east, north, 4326)
    now = datetime.now(UTC)
    meetup_matches = in_time_span(time_span, now)
    visible = visible_to(session, user)
    has_meetup = (
        select(Meetup.id)
        .where(Meetup.place_id == Place.id, meetup_matches, visible)
        .exists()
    )
    hidden_hosts = frozenset(blockers_of(session, user.id if user else None))
    rows = session.exec(
        select_place_reads(hidden_hosts)
        .where(
            Place.location.op("&&")(area),
            allowed_in(PlaceUse.MAP),
            has_meetup,
        )
        .order_by(Place.id)
        .limit(MAX_PLACES + 1)
    ).all()
    truncated = len(rows) > MAX_PLACES
    if truncated:
        rows = rows[:MAX_PLACES]
    places = [PlaceRead.model_validate(row, from_attributes=True) for row in rows]
    place_ids = [place.id for place in places]
    if not place_ids:
        return MapMeetupsRead(places=[], meetups=[], truncated=truncated)
    meetups = list(
        session.exec(
            select(Meetup)
            .where(Meetup.place_id.in_(place_ids), meetup_matches, visible)
            .order_by(Meetup.starts_at, Meetup.id)
        ).all()
    )
    return MapMeetupsRead(
        places=places,
        meetups=to_reads(session, meetups, user),
        truncated=truncated,
    )


@router.get("/search", response_model=list[PlaceSearchHit])
def search_places(
    request: Request,
    q: str = Query(min_length=1, max_length=200),
    session: Session = Depends(get_session),
    geocoding: NominatimGeocoder = Depends(get_geocoder),
):
    """Named database Places plus address/POI hits from Nominatim (SCRUM-52).

    The UI calls this only when its search form is submitted; it is deliberately not an
    autocomplete endpoint, in accordance with the public Nominatim usage policy.
    """
    search_per_ip.hit(client_ip(request))
    query = q.strip()
    if not query:
        return []
    places = session.exec(
        select(
            Place.id,
            Place.name,
            func.ST_Y(Place.location).label("lat"),
            func.ST_X(Place.location).label("lon"),
        )
        .where(Place.name.icontains(query, autoescape=True), allowed_in(PlaceUse.MAP))
        .order_by(Place.name, Place.id)
        .limit(5)
    ).all()
    hits = [
        PlaceSearchHit(kind="place", label=place.name, lat=place.lat, lon=place.lon, place_id=place.id)
        for place in places
    ]
    try:
        external = geocoding.search(query, limit=5)
    except (OSError, TimeoutError, ValueError):
        # Database Place search remains useful when the optional public service is unavailable.
        external = []
    hits.extend(
        PlaceSearchHit(kind="address", label=hit.label, lat=hit.lat, lon=hit.lon)
        for hit in external
    )
    return hits


@router.get("/places/{place_id}", response_model=PlaceRead)
def get_place(
    place_id: int,
    user: User | None = Depends(viewer),
    session: Session = Depends(get_session),
    geocoding: NominatimGeocoder = Depends(get_geocoder),
):
    """One Place, for the Place detail page (SCRUM-24): its URL can be shared and reloaded.
    An Admin also opens a reported Place (SCRUM-57)."""
    if not 1 <= place_id <= MAX_DB_INT:
        raise HTTPException(status_code=NOT_FOUND.status_code, detail=NOT_FOUND.detail)
    row = session.exec(
        select_place_reads(frozenset(blockers_of(session, user.id if user else None))).where(
            Place.id == place_id, allowed_in(view_use(user))
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=NOT_FOUND.status_code, detail=NOT_FOUND.detail)
    result = PlaceRead.model_validate(row, from_attributes=True)
    if result.address is None:
        try:
            address = geocoding.reverse(result.lat, result.lon)
        except (OSError, TimeoutError, ValueError):
            address = None
        if address:
            place = session.get(Place, place_id)
            place.address = address
            session.add(place)
            with as_system(session):
                session.commit()
            result.address = address
    return result
