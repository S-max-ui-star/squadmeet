from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.meetups import time_span_end
from app.models import Meetup, Place
from tests.test_auth import PASSWORD, auth_header, register


@pytest.fixture
def place(session):
    """A Place far away in the Atlantic, so no OSM Place is near it."""
    place = Place(
        name="Testplatte", activity_type="table_tennis", location="SRID=4326;POINT(-30.5 0.5)"
    )
    session.add(place)
    session.commit()
    return place


@pytest.fixture
def host(client):
    """(token, user id) of a registered user."""
    body = register(client).json()
    return body["token"], body["user"]["id"]


@pytest.fixture
def guest(client):
    body = register(client, nickname="Korb_Karl").json()
    return body["token"], body["user"]["id"]


def create(client, token, place_id, **changes):
    return client.post(
        "/api/meetups", json={"place_id": place_id} | changes, headers=auth_header(token)
    )


def meetups_at(client, place_id):
    return client.get(f"/api/places/{place_id}/meetups").json()


def people_now(client, place_id, token=None):
    """The map's number of people at the Place, as a guest or as the user of `token`."""
    headers = auth_header(token) if token else {}
    places = client.get("/api/places", params={"bbox": "-31,0,-30,1"}, headers=headers).json()
    return next(p["people_now"] for p in places if p["id"] == place_id)


def map_meetups(client, span, token=None):
    headers = auth_header(token) if token else {}
    return client.get(
        "/api/meetups", params={"bbox": "-31,0,-30,1", "time": span}, headers=headers
    )


def test_map_meetups_use_the_visible_area_and_three_hour_borders(
    client, session, place, host
):
    outside = Place(
        name="Außen", activity_type="table_tennis", location="SRID=4326;POINT(-29.5 0.5)"
    )
    session.add(outside)
    session.commit()
    now = datetime.now(UTC)
    active = Meetup(
        place_id=place.id,
        host_id=host[1],
        party_size=1,
        starts_at=now - timedelta(minutes=30),
        ends_at=now + timedelta(minutes=30),
    )
    just_inside = Meetup(
        place_id=place.id,
        host_id=host[1],
        party_size=2,
        starts_at=now + timedelta(hours=3) - timedelta(seconds=1),
        ends_at=now + timedelta(hours=4),
    )
    just_outside = Meetup(
        place_id=place.id,
        host_id=host[1],
        party_size=3,
        starts_at=now + timedelta(hours=3, seconds=1),
        ends_at=now + timedelta(hours=4),
    )
    outside_area = Meetup(
        place_id=outside.id,
        host_id=host[1],
        party_size=4,
        starts_at=now + timedelta(hours=1),
        ends_at=now + timedelta(hours=2),
    )
    session.add_all([active, just_inside, just_outside, outside_area])
    session.commit()

    response = map_meetups(client, "3h")

    assert response.status_code == 200
    answer = response.json()
    assert [item["id"] for item in answer["places"]] == [place.id]
    assert [item["id"] for item in answer["meetups"]] == [active.id, just_inside.id]


def test_today_ends_at_the_next_midnight_in_berlin():
    winter = datetime(2026, 1, 14, 21, 30, tzinfo=UTC)
    summer = datetime(2026, 7, 14, 10, 0, tzinfo=UTC)

    assert time_span_end("today", winter) == datetime(2026, 1, 14, 23, 0, tzinfo=UTC)
    assert time_span_end("today", summer) == datetime(2026, 7, 14, 22, 0, tzinfo=UTC)


@pytest.mark.parametrize("span", ["soon", "24h", ""])
def test_map_meetups_reject_an_unknown_time_span(client, span):
    assert map_meetups(client, span).status_code == 422


def test_create_a_now_meetup_with_the_creator_as_host(client, place, host):
    token, user_id = host

    response = create(client, token, place.id, hours=3, party_size=2)

    assert response.status_code == 201
    meetup = response.json()
    assert meetup["host"]["id"] == user_id
    assert meetup["host"]["nickname"] == "Pingpong_Paula"
    assert meetup["party_size"] == 2
    starts = datetime.fromisoformat(meetup["starts_at"])
    ends = datetime.fromisoformat(meetup["ends_at"])
    assert ends - starts == timedelta(hours=3)
    assert abs(datetime.now(UTC) - starts) < timedelta(minutes=1)


def test_defaults_are_two_hours_and_party_size_one(client, place, host):
    meetup = create(client, host[0], place.id).json()

    ends = datetime.fromisoformat(meetup["ends_at"])
    assert ends - datetime.fromisoformat(meetup["starts_at"]) == timedelta(hours=2)
    assert meetup["party_size"] == 1


@pytest.mark.parametrize("hours", [0, 5, -1])
def test_duration_must_be_one_to_four_hours(client, place, host, hours):
    assert create(client, host[0], place.id, hours=hours).status_code == 422


@pytest.mark.parametrize("hours", [1, 4])
def test_one_and_four_hours_are_allowed(client, place, host, hours):
    assert create(client, host[0], place.id, hours=hours).status_code == 201


@pytest.mark.parametrize("party_size", [0, 11])
def test_party_size_must_be_one_to_ten(client, place, host, party_size):
    assert create(client, host[0], place.id, party_size=party_size).status_code == 422


@pytest.mark.parametrize("party_size", [1, 10])
def test_party_sizes_one_and_ten_are_allowed(client, place, host, party_size):
    assert create(client, host[0], place.id, party_size=party_size).status_code == 201


def test_creating_needs_a_login(client, place):
    assert client.post("/api/meetups", json={"place_id": place.id}).status_code == 401


def test_creating_at_an_unknown_place_is_404(client, host):
    assert create(client, host[0], 999_999_999).status_code == 404


def test_the_place_detail_lists_its_active_meetups(client, place, host):
    create(client, host[0], place.id, party_size=3)

    meetups = meetups_at(client, place.id)

    assert [m["party_size"] for m in meetups] == [3]


def test_the_map_marks_places_with_people_there_now(client, place, host, guest):
    assert people_now(client, place.id) == 0

    create(client, host[0], place.id, party_size=3)
    create(client, guest[0], place.id, party_size=2)

    assert people_now(client, place.id) == 5


def test_a_meetup_disappears_after_its_duration(client, session, place, host):
    # Written straight into the database: a Meetup whose two hours are over.
    now = datetime.now(UTC)
    session.add(
        Meetup(
            place_id=place.id,
            host_id=host[1],
            party_size=4,
            starts_at=now - timedelta(hours=3),
            ends_at=now - timedelta(hours=1),
        )
    )
    session.commit()

    assert meetups_at(client, place.id) == []
    assert people_now(client, place.id) == 0


def test_the_host_can_end_the_meetup_early(client, place, host):
    meetup = create(client, host[0], place.id).json()

    response = client.post(f"/api/meetups/{meetup['id']}/end", headers=auth_header(host[0]))

    assert response.status_code == 200
    assert meetups_at(client, place.id) == []
    assert people_now(client, place.id) == 0


def test_only_the_host_can_end_the_meetup(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()

    response = client.post(f"/api/meetups/{meetup['id']}/end", headers=auth_header(guest[0]))

    assert response.status_code == 403
    assert len(meetups_at(client, place.id)) == 1


def test_an_ended_meetup_cannot_end_again(client, place, host):
    meetup = create(client, host[0], place.id).json()
    client.post(f"/api/meetups/{meetup['id']}/end", headers=auth_header(host[0]))

    response = client.post(f"/api/meetups/{meetup['id']}/end", headers=auth_header(host[0]))

    assert response.status_code == 409


def test_meetups_of_an_unknown_place_is_404(client):
    assert client.get("/api/places/999999999/meetups").status_code == 404


# Later Meetups (SCRUM-35): a start time in the future, at most 30 days ahead.


def later(**delta) -> str:
    """An ISO time with time zone, `delta` from now (e.g. later(days=2))."""
    return (datetime.now(UTC) + timedelta(**delta)).isoformat()


def test_create_a_later_meetup(client, place, host):
    starts_at = datetime.now(UTC) + timedelta(days=2)

    response = create(client, host[0], place.id, starts_at=starts_at.isoformat(), hours=3)

    assert response.status_code == 201
    meetup = response.json()
    starts = datetime.fromisoformat(meetup["starts_at"])
    assert abs(starts - starts_at) < timedelta(seconds=1)
    assert datetime.fromisoformat(meetup["ends_at"]) - starts == timedelta(hours=3)


def test_a_berlin_time_is_the_same_moment_in_utc(client, place, host):
    # 18:00 in Berlin is 16:00 or 17:00 UTC, depending on summer time.
    berlin = (datetime.now(UTC) + timedelta(days=3)).astimezone(ZoneInfo("Europe/Berlin"))
    berlin = berlin.replace(hour=18, minute=0, second=0, microsecond=0)

    meetup = create(client, host[0], place.id, starts_at=berlin.isoformat()).json()

    starts = datetime.fromisoformat(meetup["starts_at"])
    assert starts == berlin
    assert starts.astimezone(UTC).hour == 18 - berlin.utcoffset().seconds // 3600


def test_a_start_time_without_time_zone_is_rejected(client, place, host):
    naive = (datetime.now(UTC) + timedelta(days=1)).replace(tzinfo=None).isoformat()

    assert create(client, host[0], place.id, starts_at=naive).status_code == 422


def test_a_start_time_in_the_past_is_rejected(client, place, host):
    response = create(client, host[0], place.id, starts_at=later(minutes=-5))

    assert response.status_code == 422


def test_a_start_time_more_than_30_days_ahead_is_rejected(client, place, host):
    assert create(client, host[0], place.id, starts_at=later(days=30, hours=1)).status_code == 422
    assert create(client, host[0], place.id, starts_at=later(days=29, hours=23)).status_code == 201


def test_a_later_meetup_is_listed_after_the_active_ones(client, place, host, guest):
    create(client, host[0], place.id, starts_at=later(days=1), party_size=2)
    create(client, guest[0], place.id, party_size=1)

    meetups = meetups_at(client, place.id)

    assert [m["party_size"] for m in meetups] == [1, 2]


def test_a_later_meetup_does_not_count_as_people_there_now(client, place, host):
    create(client, host[0], place.id, starts_at=later(hours=2), party_size=4)

    assert people_now(client, place.id) == 0


def test_a_later_meetup_cannot_be_ended_before_it_starts(client, place, host):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()

    response = client.post(f"/api/meetups/{meetup['id']}/end", headers=auth_header(host[0]))

    assert response.status_code == 409
    assert len(meetups_at(client, place.id)) == 1


def change_time(client, token, meetup_id, starts_at):
    return client.patch(
        f"/api/meetups/{meetup_id}", json={"starts_at": starts_at}, headers=auth_header(token)
    )


def test_the_host_can_move_the_start_and_the_duration_stays(client, place, host):
    meetup = create(client, host[0], place.id, starts_at=later(days=1), hours=3).json()
    new_start = datetime.now(UTC) + timedelta(days=2)

    response = change_time(client, host[0], meetup["id"], new_start.isoformat())

    assert response.status_code == 200
    moved = response.json()
    starts = datetime.fromisoformat(moved["starts_at"])
    assert abs(starts - new_start) < timedelta(seconds=1)
    assert datetime.fromisoformat(moved["ends_at"]) - starts == timedelta(hours=3)


def test_only_the_host_can_move_the_start(client, place, host, guest):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()

    assert change_time(client, guest[0], meetup["id"], later(days=2)).status_code == 403


def test_the_start_cannot_move_after_the_meetup_started(client, place, host):
    meetup = create(client, host[0], place.id).json()

    assert change_time(client, host[0], meetup["id"], later(days=1)).status_code == 409


def test_the_new_start_follows_the_same_rules(client, place, host):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()

    assert change_time(client, host[0], meetup["id"], later(minutes=-5)).status_code == 422
    assert change_time(client, host[0], meetup["id"], later(days=31)).status_code == 422


def test_moving_an_unknown_meetup_is_404(client, host):
    assert change_time(client, host[0], 999999999, later(days=1)).status_code == 404


def test_no_later_meetup_at_a_place_suggestion(client, session, place, host):
    # The rule of SCRUM-30 holds for a later Meetup too.
    place.is_suggestion = True
    session.commit()

    assert create(client, host[0], place.id, starts_at=later(days=1)).status_code == 409


# Join and Leave (SCRUM-34).


@pytest.fixture
def third(client):
    body = register(client, nickname="Mia_Matte").json()
    return body["token"], body["user"]["id"]


def join(client, token, meetup_id, party_size=1):
    return client.post(
        f"/api/meetups/{meetup_id}/join", json={"party_size": party_size}, headers=auth_header(token)
    )


def leave(client, token, meetup_id):
    return client.delete(f"/api/meetups/{meetup_id}/join", headers=auth_header(token))


def meetups_seen_by(client, token, place_id):
    return client.get(f"/api/places/{place_id}/meetups", headers=auth_header(token)).json()


def test_join_with_a_party_size(client, place, host, guest):
    meetup = create(client, host[0], place.id, party_size=2).json()

    response = join(client, guest[0], meetup["id"], party_size=3)

    assert response.status_code == 201
    joined = response.json()
    assert joined["people"] == 5
    assert [(p["nickname"], p["party_size"]) for p in joined["participants"]] == [("Korb_Karl", 3)]


def test_the_total_counts_the_host_and_every_join(client, place, host, guest, third):
    meetup = create(client, host[0], place.id, party_size=2).json()
    join(client, guest[0], meetup["id"], party_size=3)
    join(client, third[0], meetup["id"])

    [listed] = meetups_seen_by(client, host[0], place.id)

    assert listed["people"] == 6
    assert people_now(client, place.id) == 6


@pytest.mark.parametrize("party_size", [0, 11])
def test_join_party_size_must_be_one_to_ten(client, place, host, guest, party_size):
    meetup = create(client, host[0], place.id).json()

    assert join(client, guest[0], meetup["id"], party_size).status_code == 422


def test_a_user_can_join_only_once(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()
    join(client, guest[0], meetup["id"])

    assert join(client, guest[0], meetup["id"]).status_code == 409


def test_the_host_cannot_join_their_own_meetup(client, place, host):
    meetup = create(client, host[0], place.id).json()

    assert join(client, host[0], meetup["id"]).status_code == 409


def test_joining_needs_a_login(client, place, host):
    meetup = create(client, host[0], place.id).json()

    response = client.post(f"/api/meetups/{meetup['id']}/join", json={"party_size": 1})

    assert response.status_code == 401


def test_joining_an_unknown_meetup_is_404(client, guest):
    assert join(client, guest[0], 999999999).status_code == 404


def test_a_user_cannot_join_an_ended_meetup(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()
    client.post(f"/api/meetups/{meetup['id']}/end", headers=auth_header(host[0]))

    assert join(client, guest[0], meetup["id"]).status_code == 409


def test_a_user_can_join_a_later_meetup(client, place, host, guest):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()

    assert join(client, guest[0], meetup["id"], party_size=2).status_code == 201
    assert people_now(client, place.id) == 0


def test_leave_removes_the_join(client, place, host, guest):
    meetup = create(client, host[0], place.id, party_size=2).json()
    join(client, guest[0], meetup["id"], party_size=3)

    response = leave(client, guest[0], meetup["id"])

    assert response.status_code == 204
    [listed] = meetups_seen_by(client, host[0], place.id)
    assert (listed["people"], listed["participants"]) == (2, [])
    assert people_now(client, place.id) == 2


def test_leave_without_a_join_is_404(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()

    assert leave(client, guest[0], meetup["id"]).status_code == 404


def test_after_leave_the_user_can_join_again(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()
    join(client, guest[0], meetup["id"])
    leave(client, guest[0], meetup["id"])

    assert join(client, guest[0], meetup["id"], party_size=4).status_code == 201


def test_participants_are_listed_in_the_order_they_joined(client, place, host, guest, third):
    meetup = create(client, host[0], place.id).json()
    join(client, third[0], meetup["id"])
    join(client, guest[0], meetup["id"])

    [listed] = meetups_seen_by(client, host[0], place.id)

    assert [p["nickname"] for p in listed["participants"]] == ["Mia_Matte", "Korb_Karl"]


def test_a_guest_sees_only_the_number_of_people(client, place, host, guest):
    meetup = create(client, host[0], place.id, party_size=2).json()
    join(client, guest[0], meetup["id"])

    [listed] = meetups_at(client, place.id)

    assert listed["people"] == 3
    assert listed["host"] is None
    assert listed["participants"] is None


def test_deleting_the_account_removes_the_join(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()
    join(client, guest[0], meetup["id"], party_size=3)

    client.post(
        "/api/auth/delete-account", json={"password": PASSWORD}, headers=auth_header(guest[0])
    )

    [listed] = meetups_seen_by(client, host[0], place.id)
    assert listed["people"] == 1


# Host: Cancel, handover, Closed, moving with Joins (SCRUM-37).


def cancel(client, token, meetup_id):
    return client.post(f"/api/meetups/{meetup_id}/cancel", headers=auth_header(token))


def answer_move(client, token, meetup_id, answer):
    return client.post(
        f"/api/meetups/{meetup_id}/move-answer", json={"answer": answer}, headers=auth_header(token)
    )


def only(meetups, meetup_id):
    [found] = [m for m in meetups if m["id"] == meetup_id]
    return found


def test_the_host_cancels_a_later_meetup_and_it_shows_as_cancelled(client, place, host, guest):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])

    response = cancel(client, host[0], meetup["id"])

    assert response.status_code == 200
    [listed] = meetups_seen_by(client, guest[0], place.id)
    assert listed["cancelled"] is True


def test_only_the_host_can_cancel(client, place, host, guest):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()

    assert cancel(client, guest[0], meetup["id"]).status_code == 403


def test_a_running_meetup_is_ended_not_cancelled(client, place, host):
    meetup = create(client, host[0], place.id).json()

    assert cancel(client, host[0], meetup["id"]).status_code == 409


def test_nobody_can_join_a_cancelled_meetup(client, place, host, guest):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    cancel(client, host[0], meetup["id"])

    assert join(client, guest[0], meetup["id"]).status_code == 409
    assert cancel(client, host[0], meetup["id"]).status_code == 409


def test_a_cancelled_meetup_does_not_count_on_the_map(client, session, place, host, guest):
    meetup = create(client, host[0], place.id, starts_at=later(minutes=1)).json()
    join(client, guest[0], meetup["id"], party_size=2)
    cancel(client, host[0], meetup["id"])
    # The start time has come.
    row = session.get(Meetup, meetup["id"])
    row.starts_at = datetime.now(UTC) - timedelta(minutes=1)
    session.commit()

    assert people_now(client, place.id) == 0


def test_the_host_leaves_and_the_earliest_join_becomes_host(client, place, host, guest, third):
    meetup = create(client, host[0], place.id, party_size=2).json()
    join(client, guest[0], meetup["id"], party_size=3)
    join(client, third[0], meetup["id"])

    assert leave(client, host[0], meetup["id"]).status_code == 204

    [listed] = meetups_seen_by(client, guest[0], place.id)
    assert listed["host"]["nickname"] == "Korb_Karl"
    assert listed["party_size"] == 3
    assert [p["nickname"] for p in listed["participants"]] == ["Mia_Matte"]
    assert listed["people"] == 4


def test_the_new_host_can_cancel(client, place, host, guest):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])
    leave(client, host[0], meetup["id"])

    # The old Host is not the Host any more.
    assert cancel(client, host[0], meetup["id"]).status_code == 403
    assert cancel(client, guest[0], meetup["id"]).status_code == 200


def test_the_last_user_leaves_and_the_meetup_is_closed(client, place, host, guest):
    meetup = create(client, host[0], place.id, party_size=2).json()
    join(client, guest[0], meetup["id"])
    leave(client, host[0], meetup["id"])

    leave(client, guest[0], meetup["id"])

    assert meetups_seen_by(client, guest[0], place.id) == []
    assert people_now(client, place.id) == 0
    assert join(client, host[0], meetup["id"]).status_code == 409


def test_a_host_alone_who_leaves_closes_the_meetup(client, place, host):
    meetup = create(client, host[0], place.id).json()

    assert leave(client, host[0], meetup["id"]).status_code == 204
    assert meetups_at(client, place.id) == []


def test_deleting_the_host_account_hands_the_meetup_over(client, place, host, guest):
    meetup = create(client, host[0], place.id, party_size=2).json()
    join(client, guest[0], meetup["id"], party_size=3)

    response = client.post(
        "/api/auth/delete-account", json={"password": PASSWORD}, headers=auth_header(host[0])
    )

    assert response.status_code == 204
    [listed] = meetups_seen_by(client, guest[0], place.id)
    assert (listed["host"]["nickname"], listed["people"]) == ("Korb_Karl", 3)


def test_deleting_a_host_alone_deletes_the_meetup(client, place, host, guest):
    create(client, host[0], place.id)

    client.post(
        "/api/auth/delete-account", json={"password": PASSWORD}, headers=auth_header(host[0])
    )

    assert meetups_seen_by(client, guest[0], place.id) == []


@pytest.fixture
def moved(client, place, host, guest, third):
    """Paula (host) plans 18:00-ish tomorrow, Karl then Mia join, Paula moves it one hour on.
    Returns (old meetup id, new meetup id)."""
    old = create(client, host[0], place.id, starts_at=later(days=1), party_size=2).json()
    join(client, guest[0], old["id"], party_size=3)
    join(client, third[0], old["id"])
    new_start = datetime.fromisoformat(old["starts_at"]) + timedelta(hours=1)
    response = change_time(client, host[0], old["id"], new_start.isoformat())
    assert response.status_code == 200
    return old["id"], response.json()["id"]


def test_moving_with_joins_keeps_the_old_time_for_the_others(client, place, host, guest, moved):
    old_id, new_id = moved

    meetups = meetups_seen_by(client, guest[0], place.id)

    old, new = only(meetups, old_id), only(meetups, new_id)
    assert old["host"]["nickname"] == "Korb_Karl"
    assert [p["nickname"] for p in old["participants"]] == ["Mia_Matte"]
    assert (new["host"]["nickname"], new["participants"], new["people"]) == (
        "Pingpong_Paula",
        [],
        2,
    )
    assert datetime.fromisoformat(new["starts_at"]) - datetime.fromisoformat(
        old["starts_at"]
    ) == timedelta(hours=1)


def test_everyone_who_was_in_gets_the_offer_also_the_new_host(client, place, guest, third, moved):
    old_id, new_id = moved

    for token in (guest[0], third[0]):
        offer = only(meetups_seen_by(client, token, place.id), old_id)["move_offer"]
        assert offer["meetup_id"] == new_id
        assert offer["host"]["nickname"] == "Pingpong_Paula"


def test_a_user_who_joins_after_the_move_gets_no_offer(client, place, moved):
    old_id, _ = moved
    newcomer = register(client, nickname="Neu_Nina").json()["token"]
    join(client, newcomer, old_id)

    assert only(meetups_seen_by(client, newcomer, place.id), old_id)["move_offer"] is None


def test_go_along_moves_the_join_to_the_new_meetup(client, place, third, moved):
    old_id, new_id = moved

    assert answer_move(client, third[0], old_id, "go").status_code == 200

    meetups = meetups_seen_by(client, third[0], place.id)
    assert [p["nickname"] for p in only(meetups, new_id)["participants"]] == ["Mia_Matte"]
    assert only(meetups, old_id)["participants"] == []


def test_stay_keeps_the_join_and_ends_the_offer(client, place, third, moved):
    old_id, _ = moved

    answer_move(client, third[0], old_id, "stay")

    old = only(meetups_seen_by(client, third[0], place.id), old_id)
    assert old["move_offer"] is None
    assert [p["nickname"] for p in old["participants"]] == ["Mia_Matte"]


def test_cancel_answer_leaves(client, place, third, moved):
    old_id, new_id = moved

    answer_move(client, third[0], old_id, "leave")

    meetups = meetups_seen_by(client, third[0], place.id)
    assert only(meetups, old_id)["participants"] == []
    assert only(meetups, new_id)["participants"] == []


def test_the_new_host_goes_along_and_hands_over_again(client, place, guest, third, moved):
    old_id, new_id = moved

    answer_move(client, guest[0], old_id, "go")

    meetups = meetups_seen_by(client, guest[0], place.id)
    assert only(meetups, old_id)["host"]["nickname"] == "Mia_Matte"
    assert [p["nickname"] for p in only(meetups, new_id)["participants"]] == ["Korb_Karl"]


def test_when_everyone_goes_along_the_old_meetup_is_closed(client, place, guest, third, moved):
    old_id, _ = moved

    answer_move(client, guest[0], old_id, "go")
    answer_move(client, third[0], old_id, "go")

    assert old_id not in [m["id"] for m in meetups_seen_by(client, guest[0], place.id)]


def test_only_a_user_with_an_offer_can_answer(client, place, host, moved):
    old_id, _ = moved

    assert answer_move(client, host[0], old_id, "go").status_code == 409


def test_an_unknown_answer_is_rejected(client, third, moved):
    old_id, _ = moved

    assert answer_move(client, third[0], old_id, "maybe").status_code == 422


def test_a_third_meetup_at_the_same_time_is_refused(client, place, host):
    """SCRUM-80: at most 2 Meetups at one moment; a later one at another time is fine."""
    assert create(client, host[0], place.id).status_code == 201
    assert create(client, host[0], place.id).status_code == 201

    response = create(client, host[0], place.id)
    later = create(client, host[0], place.id, starts_at=(datetime.now(UTC) + timedelta(hours=3)).isoformat())

    assert response.status_code == 409
    assert response.json()["detail"] == "Du bist zu dieser Zeit schon bei 2 Treffen."
    assert later.status_code == 201


def test_a_running_meetups_host_sees_leave_only_with_joins(client, place, host, guest):
    """SCRUM-79: alone, End and Leave do the same, so the Host only gets "end"."""
    meetup = create(client, host[0], place.id).json()

    def actions():
        found = client.get(f"/api/places/{place.id}/meetups", headers=auth_header(host[0])).json()
        return next(m["actions"] for m in found if m["id"] == meetup["id"])

    assert "end" in actions() and "leave" not in actions()
    join(client, guest[0], meetup["id"])
    assert "end" in actions() and "leave" in actions()
