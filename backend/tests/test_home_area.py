"""Home area Notifications (SCRUM-45): a user sets a point, a radius and Activity types; a new
Meetup inside it notifies them. Never twice for one Meetup, never the Host or blocked users."""

from datetime import UTC, datetime, timedelta

from sqlmodel import select

from app.models import AuditLog, HomeArea
from tests.test_auth import auth_header
from tests.test_contact_notifications import befriend
from tests.test_contacts import block
from tests.test_delete_account import delete_account
from tests.test_favorites import add_favorite
from tests.test_meetups import (  # noqa: F401 (fixtures)
    create,
    guest,
    host,
    later,
    place,
    third,
)
from tests.test_notifications import kinds, notifications
from tests.test_series import create_series, slot

# The test Place is at lat 0.5, lon -30.5 (tests/test_meetups.py). At the equator 0.01° of
# longitude is about 1.1 km.
NEAR = {"lat": 0.5, "lon": -30.48}  # about 2.2 km away
ALL_TYPES = ["table_tennis", "basketball", "football", "beach_volleyball", "outdoor_fitness"]


def set_home_area(client, token, radius_km=3, activity_types=None, **point):
    body = (NEAR | point) | {
        "radius_km": radius_km,
        "activity_types": ALL_TYPES if activity_types is None else activity_types,
    }
    return client.put("/api/home-area", json=body, headers=auth_header(token))


def get_home_area(client, token):
    return client.get("/api/home-area", headers=auth_header(token))


def turn_off(client, token):
    return client.delete("/api/home-area", headers=auth_header(token))


# Set, read, turn off


def test_no_home_area_until_the_user_sets_one(client, host):
    response = get_home_area(client, host[0])

    assert response.status_code == 200
    assert response.json() is None


def test_set_and_change_the_home_area(client, host):
    assert set_home_area(client, host[0]).status_code == 200

    response = set_home_area(client, host[0], radius_km=20, activity_types=["basketball"], lat=52.5)

    assert response.status_code == 200
    assert response.json() == {
        "lat": 52.5,
        "lon": -30.48,
        "radius_km": 20,
        "activity_types": ["basketball"],
    }
    assert get_home_area(client, host[0]).json() == response.json()


def test_turning_it_off_deletes_the_point(client, session, host):
    set_home_area(client, host[0])

    assert turn_off(client, host[0]).status_code == 204

    assert get_home_area(client, host[0]).json() is None
    assert session.exec(select(HomeArea).where(HomeArea.user_id == host[1])).first() is None
    # Turning it off twice is fine.
    assert turn_off(client, host[0]).status_code == 204


def test_invalid_home_areas_are_rejected(client, host):
    assert set_home_area(client, host[0], radius_km=0).status_code == 422
    assert set_home_area(client, host[0], radius_km=21).status_code == 422
    assert set_home_area(client, host[0], activity_types=[]).status_code == 422
    assert set_home_area(client, host[0], activity_types=["chess"]).status_code == 422
    assert set_home_area(client, host[0], activity_types=["football", "football"]).status_code == 422
    assert set_home_area(client, host[0], lat=91).status_code == 422
    assert get_home_area(client, host[0]).json() is None


def test_the_home_area_needs_a_login(client):
    assert client.get("/api/home-area").status_code == 401
    assert client.put("/api/home-area", json=NEAR).status_code == 401
    assert client.delete("/api/home-area").status_code == 401


def test_the_home_area_is_not_in_the_audit_log(client, session, host):
    set_home_area(client, host[0])
    turn_off(client, host[0])

    assert session.exec(select(AuditLog).where(AuditLog.entity == "home_area")).all() == []


def test_the_account_delete_deletes_the_home_area(client, session, host):
    set_home_area(client, host[0])

    assert delete_account(client, host[0]).status_code == 204

    assert session.exec(select(HomeArea).where(HomeArea.user_id == host[1])).first() is None


# A new Meetup inside the Home area


def test_a_now_meetup_inside_the_radius_notifies(client, place, host, guest):
    set_home_area(client, guest[0], radius_km=3)

    create(client, host[0], place.id)

    [notice] = notifications(client, guest[0]).json()
    assert notice["kind"] == "home_area_meetup_created"
    assert notice["text"] == "Pingpong_Paula hat ein Treffen erstellt: Tischtennis"


def test_a_later_meetup_inside_the_radius_notifies(client, place, host, guest):
    set_home_area(client, guest[0])

    create(client, host[0], place.id, starts_at=later(days=2))

    assert kinds(client, guest[0]) == ["home_area_meetup_created"]


def test_a_meetup_outside_the_radius_does_not_notify(client, place, host, guest, third):
    # 2.2 km away: outside 1 km, inside 3 km.
    set_home_area(client, guest[0], radius_km=1)
    set_home_area(client, third[0], radius_km=3)

    create(client, host[0], place.id)

    assert kinds(client, guest[0]) == []
    assert kinds(client, third[0]) == ["home_area_meetup_created"]


def test_only_the_chosen_activity_types_notify(client, place, host, guest, third):
    set_home_area(client, guest[0], activity_types=["basketball", "football"])
    set_home_area(client, third[0], activity_types=["table_tennis"])

    create(client, host[0], place.id)

    assert kinds(client, guest[0]) == []
    assert kinds(client, third[0]) == ["home_area_meetup_created"]


def test_the_host_is_not_notified_about_their_own_meetup(client, place, host):
    set_home_area(client, host[0])

    create(client, host[0], place.id)

    assert kinds(client, host[0]) == []


def test_a_home_area_turned_off_does_not_notify(client, place, host, guest):
    set_home_area(client, guest[0])
    turn_off(client, guest[0])

    create(client, host[0], place.id)

    assert kinds(client, guest[0]) == []


def test_blocked_users_are_never_notified(client, place, host, guest, third):
    set_home_area(client, guest[0])
    set_home_area(client, third[0])
    # Karl blocked Paula; Paula blocked Mia.
    block(client, guest[0], "Pingpong_Paula")
    block(client, host[0], "Mia_Matte")

    create(client, host[0], place.id)

    assert kinds(client, guest[0]) == []
    assert kinds(client, third[0]) == []


# No duplicates


def test_a_favorite_owner_gets_only_the_favorite_notification(client, place, host, guest):
    set_home_area(client, guest[0])
    add_favorite(client, guest[0], place.id)

    create(client, host[0], place.id)

    assert kinds(client, guest[0]) == ["favorite_meetup_created"]


def test_a_contact_gets_only_the_contact_notification(client, place, host, guest):
    befriend(client, host, guest, "Korb_Karl")
    set_home_area(client, guest[0])
    add_favorite(client, guest[0], place.id)

    create(client, host[0], place.id)

    assert kinds(client, guest[0]) == ["contact_meetup_created"]


def test_a_series_notifies_the_home_area_once(client, place, host, guest):
    set_home_area(client, guest[0])
    weekday = (datetime.now(UTC) + timedelta(days=2)).weekday()

    response = create_series(client, host[0], place.id, [slot(weekday), slot((weekday + 3) % 7)])

    assert response.status_code == 201
    assert kinds(client, guest[0]) == ["home_area_meetup_created"]
