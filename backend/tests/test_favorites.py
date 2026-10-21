"""Favorites with optional Time rules and Meetup Notifications (SCRUM-41)."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.favorites import MAX_RULES
from tests.test_admin_places import admin, lock, unlock  # noqa: F401 (fixture)
from tests.test_auth import auth_header
from tests.test_contacts import block
from tests.test_meetups import create, guest, host, place, third  # noqa: F401 (fixtures)
from tests.test_notifications import kinds, notifications
from tests.test_series import create_series, slot

BERLIN = ZoneInfo("Europe/Berlin")


def add_favorite(client, token, place_id):
    return client.put(f"/api/places/{place_id}/favorite", headers=auth_header(token))


def add_rule(client, token, favorite_id, weekdays, start="17:00", end="21:00"):
    return client.post(
        f"/api/favorites/{favorite_id}/rules",
        json={"weekdays": weekdays, "start": start, "end": end},
        headers=auth_header(token),
    )


def future(weekday, hour, minute=0):
    now = datetime.now(BERLIN)
    days = (weekday - now.weekday()) % 7
    found = (now + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    if found <= now:
        found += timedelta(days=7)
    return found


def test_add_list_and_remove_a_favorite(client, place, guest):
    created = add_favorite(client, guest[0], place.id)

    assert created.status_code == 200
    favorite = created.json()
    assert favorite["place"] == {"id": place.id, "name": place.name, "address": place.address}
    assert favorite["rules"] == []
    assert client.get("/api/favorites", headers=auth_header(guest[0])).json() == [favorite]
    assert client.get(
        f"/api/places/{place.id}/favorite", headers=auth_header(guest[0])
    ).json() == favorite

    assert client.delete(
        f"/api/places/{place.id}/favorite", headers=auth_header(guest[0])
    ).status_code == 204
    assert client.get("/api/favorites", headers=auth_header(guest[0])).json() == []


def test_time_rules_can_be_added_edited_and_deleted(client, place, guest):
    favorite = add_favorite(client, guest[0], place.id).json()
    created = add_rule(client, guest[0], favorite["id"], [0, 1, 2, 3, 4]).json()

    assert (created["weekdays"], created["start"], created["end"]) == (
        [0, 1, 2, 3, 4],
        "17:00:00",
        "21:00:00",
    )
    changed = client.put(
        f"/api/favorites/{favorite['id']}/rules/{created['id']}",
        json={"weekdays": [5, 6], "start": "09:00", "end": "12:00"},
        headers=auth_header(guest[0]),
    )
    assert changed.status_code == 200
    assert changed.json()["weekdays"] == [5, 6]
    assert client.delete(
        f"/api/favorites/{favorite['id']}/rules/{created['id']}",
        headers=auth_header(guest[0]),
    ).status_code == 204
    assert client.get("/api/favorites", headers=auth_header(guest[0])).json()[0]["rules"] == []


def test_time_rules_reject_midnight_and_empty_weekdays(client, place, guest):
    favorite = add_favorite(client, guest[0], place.id).json()

    assert add_rule(client, guest[0], favorite["id"], [0], "21:00", "17:00").status_code == 422
    assert add_rule(client, guest[0], favorite["id"], [], "17:00", "21:00").status_code == 422


def test_a_meetup_at_a_favorite_notifies_except_the_creator(client, place, host, guest):
    add_favorite(client, guest[0], place.id)
    add_favorite(client, host[0], place.id)

    create(client, host[0], place.id)

    [notice] = notifications(client, guest[0]).json()
    assert notice["kind"] == "favorite_meetup_created"
    assert notice["text"] == "Pingpong_Paula hat ein Treffen erstellt: Tischtennis"
    assert kinds(client, host[0]) == []


def test_time_rule_notifies_inside_but_not_outside(client, place, host, guest):
    favorite = add_favorite(client, guest[0], place.id).json()
    day = future(2, 18)
    add_rule(client, guest[0], favorite["id"], [day.weekday()], "17:00", "21:00")

    create(client, host[0], place.id, starts_at=day.isoformat())
    create(client, host[0], place.id, starts_at=day.replace(hour=16).isoformat())

    assert kinds(client, guest[0]) == ["favorite_meetup_created"]


def test_a_blocked_hosts_meetup_does_not_notify(client, place, host, guest):
    add_favorite(client, guest[0], place.id)
    block(client, guest[0], "Pingpong_Paula")

    create(client, host[0], place.id)

    assert kinds(client, guest[0]) == []


def test_a_series_notifies_for_matching_occurrences(client, place, host, guest):
    favorite = add_favorite(client, guest[0], place.id).json()
    weekday = future(3, 19).weekday()
    add_rule(client, guest[0], favorite["id"], [weekday], "18:00", "20:00")

    response = create_series(client, host[0], place.id, [slot(weekday, "19:00")])

    assert response.status_code == 201
    found = kinds(client, guest[0])
    assert 4 <= len(found) <= 5
    assert set(found) == {"favorite_meetup_created"}


def test_favorites_need_a_login(client, place):
    assert client.get("/api/favorites").status_code == 401
    assert client.put(f"/api/places/{place.id}/favorite").status_code == 401


def test_a_too_big_id_answers_404(client, place, guest):
    big = 9_999_999_999
    headers = auth_header(guest[0])
    favorite = add_favorite(client, guest[0], place.id).json()
    rule = {"weekdays": [1], "start": "10:00", "end": "11:00"}

    assert client.get(f"/api/places/{big}/favorite", headers=headers).status_code == 404
    assert client.delete(f"/api/places/{big}/favorite", headers=headers).status_code == 204
    assert add_rule(client, guest[0], big, [1]).status_code == 404
    path = f"/api/favorites/{favorite['id']}/rules/{big}"
    assert client.put(path, json=rule, headers=headers).status_code == 404
    assert client.delete(path, headers=headers).status_code == 404


def test_a_locked_place_leaves_the_favorites_until_it_is_unlocked(client, place, guest, admin):
    favorite = add_favorite(client, guest[0], place.id).json()

    lock(client, admin, place.id)

    assert client.get("/api/favorites", headers=auth_header(guest[0])).json() == []
    assert client.get(
        f"/api/places/{place.id}/favorite", headers=auth_header(guest[0])
    ).status_code == 404

    unlock(client, admin, place.id)

    assert client.get("/api/favorites", headers=auth_header(guest[0])).json() == [favorite]


def test_a_favorite_has_at_most_ten_time_rules(client, place, guest):
    favorite = add_favorite(client, guest[0], place.id).json()
    for _ in range(MAX_RULES):
        assert add_rule(client, guest[0], favorite["id"], [1]).status_code == 201

    response = add_rule(client, guest[0], favorite["id"], [2])

    assert response.status_code == 409
    assert str(MAX_RULES) in response.json()["detail"]
