"""Home area Notifications (SCRUM-45, see CONTEXT.md "Home area", ADR-0003).

A new Meetup or Now-meetup at a Place inside a user's Home area, of an Activity type they chose,
notifies them. A weekly Series notifies once, about its first Occurrence (Stefan, 2026-10-16).
A user who already got a Contact or Favorite Notification for the Meetup gets no second one.
The Host and users blocked in either direction with the Host are never notified (SCRUM-32).

This module imports only the models and the modules below them, like app.meetup_lifecycle.
"""

from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import any_, cast, func
from sqlmodel import Session, select

from app.blocks import blocked_by, blockers_of
from app.models import HomeArea, Meetup, Place
from app.notification_events import notify_users


def notify_home_areas(
    session: Session, meetup: Meetup, now: datetime, skip: frozenset[int] = frozenset()
) -> None:
    """The caller has flushed the Meetup and owns the transaction."""
    # Geography: the distance is in metres on the earth, not in degrees.
    inside = func.ST_DWithin(
        cast(HomeArea.location, Geography),
        cast(Place.location, Geography),
        HomeArea.radius_km * 1000,
    )
    users = set(
        session.exec(
            select(HomeArea.user_id)
            .join(Place, Place.id == meetup.place_id)
            .where(
                HomeArea.user_id != meetup.host_id,
                Place.activity_type == any_(HomeArea.activity_types),
                inside,
            )
        )
    )
    blocked = blockers_of(session, meetup.host_id) | blocked_by(session, meetup.host_id)
    notify_users(
        session,
        users - skip - blocked,
        meetup,
        "home_area_meetup_created",
        now,
        actor_id=meetup.host_id,
    )
