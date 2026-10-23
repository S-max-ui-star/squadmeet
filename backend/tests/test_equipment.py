"""The Equipment users bring to a Meetup (SCRUM-170). The Place is a table tennis Place:
Schläger ("rackets", 1–4), Bälle ("balls") and Netz ("net")."""

from datetime import datetime, timedelta

import pytest

from app.equipment import ACTIVITY_EQUIPMENT
from app.activities import ActivityType
from tests.test_auth import auth_header
from tests.test_meetups import (  # noqa: F401
    answer_move,
    cancel,
    change_time,
    create,
    guest,
    hide,
    host,
    join,
    later,
    leave,
    meetups_at,
    meetups_seen_by,
    only,
    place,
    third,
)
from tests.test_series import create_series, occurrences, slot

RACKETS_2 = [{"item": "rackets", "count": 2}]


def join_with(client, token, meetup_id, equipment, party_size=1):
    return client.post(
        f"/api/meetups/{meetup_id}/join",
        json={"party_size": party_size, "equipment": equipment},
        headers=auth_header(token),
    )


def change(client, token, meetup_id, equipment):
    return client.put(
        f"/api/meetups/{meetup_id}/equipment",
        json={"equipment": equipment},
        headers=auth_header(token),
    )


def brought(meetup):
    """{nickname: {item: count}} from the per-person list."""
    return {
        person["nickname"]: {each["item"]: each["count"] for each in person["items"]}
        for person in meetup["equipment_by_person"]
    }


def totals(meetup):
    return [(each["item"], each["count"]) for each in meetup["equipment"]]


def test_every_activity_type_has_equipment():
    assert set(ACTIVITY_EQUIPMENT) == set(ActivityType)


def test_the_host_says_what_they_bring(client, place, host):
    meetup = create(client, host[0], place.id, equipment=RACKETS_2 + [{"item": "balls"}]).json()

    assert totals(meetup) == [("rackets", 2), ("balls", 1)]
    assert brought(meetup) == {"Pingpong_Paula": {"rackets": 2, "balls": 1}}


def test_without_equipment_a_meetup_is_as_before(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()
    joined = join(client, guest[0], meetup["id"]).json()

    assert (joined["equipment"], joined["equipment_by_person"]) == ([], [])


def test_joins_add_up_in_the_fixed_order(client, place, host, guest):
    meetup = create(client, host[0], place.id, equipment=[{"item": "net"}]).json()

    joined = join_with(client, guest[0], meetup["id"], [{"item": "balls"}] + RACKETS_2).json()

    assert totals(joined) == [("rackets", 2), ("balls", 1), ("net", 1)]
    # The Host first, then the Joins.
    assert list(brought(joined)) == ["Pingpong_Paula", "Korb_Karl"]
    assert brought(joined)["Korb_Karl"] == {"rackets": 2, "balls": 1}


def test_a_guest_sees_the_totals_but_not_who_brings_what(client, place, host):
    create(client, host[0], place.id, equipment=RACKETS_2)

    [meetup] = meetups_at(client, place.id)

    assert totals(meetup) == [("rackets", 2)]
    assert meetup["equipment_by_person"] is None


@pytest.mark.parametrize(
    "equipment",
    [
        [{"item": "ball"}],  # basketball, not table tennis
        [{"item": "balls", "count": 2}],  # only Schläger have a count
        [{"item": "rackets", "count": 5}],
        [{"item": "rackets", "count": 0}],
        [{"item": "balls"}, {"item": "balls"}],
    ],
)
def test_items_that_do_not_fit_are_refused(client, place, host, guest, equipment):
    assert create(client, host[0], place.id, equipment=equipment).status_code == 422

    meetup = create(client, host[0], place.id).json()
    assert join_with(client, guest[0], meetup["id"], equipment).status_code == 422
    assert change(client, host[0], meetup["id"], equipment).status_code == 422
    assert meetups_seen_by(client, guest[0], place.id)[0]["participants"] == []


def test_change_replaces_the_users_equipment(client, place, host, guest):
    meetup = create(client, host[0], place.id, equipment=RACKETS_2).json()
    join_with(client, guest[0], meetup["id"], [{"item": "balls"}])

    changed = change(client, guest[0], meetup["id"], [{"item": "net"}])

    assert changed.status_code == 200
    assert brought(changed.json()) == {"Pingpong_Paula": {"rackets": 2}, "Korb_Karl": {"net": 1}}
    emptied = change(client, host[0], meetup["id"], []).json()
    assert brought(emptied) == {"Korb_Karl": {"net": 1}}


def test_only_people_in_the_meetup_change_equipment(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()

    assert change(client, guest[0], meetup["id"], RACKETS_2).status_code == 404
    assert "equipment" not in only(meetups_seen_by(client, guest[0], place.id), meetup["id"])["actions"]
    assert "equipment" in only(meetups_seen_by(client, host[0], place.id), meetup["id"])["actions"]


def test_no_change_after_a_cancel_or_at_a_hidden_place(client, session, place, host):
    cancelled = create(client, host[0], place.id, starts_at=later(days=1)).json()
    cancel(client, host[0], cancelled["id"])
    assert change(client, host[0], cancelled["id"], RACKETS_2).status_code == 409

    meetup = create(client, host[0], place.id, starts_at=later(days=2)).json()
    hide(session, place)
    assert change(client, host[0], meetup["id"], RACKETS_2).status_code == 404


def test_leave_removes_the_users_equipment(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()
    join_with(client, guest[0], meetup["id"], RACKETS_2)

    assert leave(client, guest[0], meetup["id"]).status_code == 204

    assert totals(meetups_seen_by(client, host[0], place.id)[0]) == []


def test_after_a_handover_the_new_host_keeps_their_equipment(client, place, host, guest):
    meetup = create(client, host[0], place.id, equipment=[{"item": "net"}]).json()
    join_with(client, guest[0], meetup["id"], RACKETS_2)

    leave(client, host[0], meetup["id"])

    [handed] = meetups_seen_by(client, guest[0], place.id)
    assert handed["host"]["nickname"] == "Korb_Karl"
    assert brought(handed) == {"Korb_Karl": {"rackets": 2}}


@pytest.fixture
def moved_with_equipment(client, place, host, guest, third):
    """Paula (net) moves her Meetup one hour on after Karl (2 Schläger) and Mia (Bälle) joined.
    Returns (old meetup id, new meetup id)."""
    old = create(client, host[0], place.id, starts_at=later(days=1), equipment=[{"item": "net"}])
    old = old.json()
    join_with(client, guest[0], old["id"], RACKETS_2)
    join_with(client, third[0], old["id"], [{"item": "balls"}])
    new_start = datetime.fromisoformat(old["starts_at"]) + timedelta(hours=1)
    response = change_time(client, host[0], old["id"], new_start.isoformat())
    return old["id"], response.json()["id"]


def test_a_move_takes_each_persons_equipment_along(client, place, guest, third, moved_with_equipment):
    old_id, new_id = moved_with_equipment

    # Paula is at the new time with her net; Karl hosts the old time now.
    meetups = meetups_seen_by(client, guest[0], place.id)
    assert brought(only(meetups, new_id)) == {"Pingpong_Paula": {"net": 1}}
    assert brought(only(meetups, old_id)) == {"Korb_Karl": {"rackets": 2}, "Mia_Matte": {"balls": 1}}

    # Mia goes along, Karl stays.
    assert answer_move(client, third[0], old_id, "go").status_code == 200
    assert answer_move(client, guest[0], old_id, "stay").status_code == 200

    meetups = meetups_seen_by(client, guest[0], place.id)
    assert brought(only(meetups, new_id)) == {"Pingpong_Paula": {"net": 1}, "Mia_Matte": {"balls": 1}}
    assert brought(only(meetups, old_id)) == {"Korb_Karl": {"rackets": 2}}


def test_equipment_belongs_to_one_occurrence_of_a_series(client, place, host, guest):
    create_series(client, host[0], place.id, [slot(5)])
    first, second = sorted(occurrences(client, guest[0], place.id), key=lambda m: m["starts_at"])[:2]

    assert join_with(client, guest[0], first["id"], RACKETS_2).status_code == 201

    seen = {m["id"]: m for m in occurrences(client, guest[0], place.id)}
    assert totals(seen[first["id"]]) == [("rackets", 2)]
    assert totals(seen[second["id"]]) == []


def test_a_blocker_is_counted_but_not_named(client, place, host, guest, third):
    meetup = create(client, host[0], place.id, equipment=[{"item": "net"}]).json()
    join_with(client, guest[0], meetup["id"], RACKETS_2)
    join(client, third[0], meetup["id"])
    # Karl blocks Mia: Mia must not see Karl's name, as in the participants list (SCRUM-32).
    client.post("/api/blocks", json={"nickname": "Mia_Matte"}, headers=auth_header(guest[0]))

    seen = only(meetups_seen_by(client, third[0], place.id), meetup["id"])

    assert totals(seen) == [("rackets", 2), ("net", 1)]
    assert brought(seen) == {"Pingpong_Paula": {"net": 1}}


# SCRUM-171: "Brauche ich" and "Fehlt noch".

NEED_1_RACKET = [{"item": "rackets", "count": 1, "kind": "need"}]


def needed(meetup):
    """{nickname: {item: count}} of what each person needs."""
    return {
        person["nickname"]: {each["item"]: each["count"] for each in person["needs"]}
        for person in meetup["equipment_by_person"]
    }


def missing(meetup):
    return [(each["item"], each["count"]) for each in meetup["equipment_missing"]]


def test_a_user_says_what_they_need(client, place, host, guest):
    meetup = create(client, host[0], place.id, equipment=RACKETS_2).json()

    joined = join_with(client, guest[0], meetup["id"], NEED_1_RACKET + [{"item": "balls", "kind": "need"}]).json()

    # What people bring and what they need are apart.
    assert totals(joined) == [("rackets", 2)]
    assert [(each["item"], each["count"]) for each in joined["equipment_needed"]] == [("rackets", 1), ("balls", 1)]
    assert brought(joined) == {"Pingpong_Paula": {"rackets": 2}, "Korb_Karl": {}}
    assert needed(joined) == {"Pingpong_Paula": {}, "Korb_Karl": {"rackets": 1, "balls": 1}}


@pytest.mark.parametrize(
    "equipment",
    [
        [{"item": "balls"}, {"item": "balls", "kind": "need"}],  # bring and need: not both
        [{"item": "balls", "kind": "lend"}],
        [{"item": "rackets", "count": 5, "kind": "need"}],
        [{"item": "balls", "count": 2, "kind": "need"}],
    ],
)
def test_needs_that_do_not_fit_are_refused(client, place, host, equipment):
    assert create(client, host[0], place.id, equipment=equipment).status_code == 422


def test_missing_compares_what_is_needed_with_what_is_brought(client, place, host, guest, third):
    # Paula brings 2 Schläger; Karl needs 1, Mia 3: 2 are still missing.
    meetup = create(client, host[0], place.id, equipment=RACKETS_2).json()
    join_with(client, guest[0], meetup["id"], NEED_1_RACKET)
    joined = join_with(client, third[0], meetup["id"], [{"item": "rackets", "count": 3, "kind": "need"}]).json()

    assert missing(joined) == [("rackets", 2)]

    # Karl brings 2 more: nothing is missing.
    changed = change(client, guest[0], meetup["id"], RACKETS_2).json()
    assert missing(changed) == []


def test_one_ball_is_enough_for_everybody_who_needs_balls(client, place, host, guest, third):
    meetup = create(client, host[0], place.id, equipment=[{"item": "net", "kind": "need"}]).json()
    join_with(client, guest[0], meetup["id"], [{"item": "balls", "kind": "need"}])
    joined = join_with(client, third[0], meetup["id"], [{"item": "balls", "kind": "need"}]).json()

    # An item without a count is there or not: Bälle count once, however many need them.
    assert missing(joined) == [("balls", 1), ("net", 1)]

    changed = change(client, host[0], meetup["id"], [{"item": "balls"}, {"item": "net"}]).json()
    assert missing(changed) == []


def test_a_guest_sees_what_is_missing_but_not_who_needs_it(client, place, host):
    create(client, host[0], place.id, equipment=NEED_1_RACKET)

    [meetup] = meetups_at(client, place.id)

    assert missing(meetup) == [("rackets", 1)]
    assert meetup["equipment_by_person"] is None


def test_leave_removes_what_the_user_needs(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()
    join_with(client, guest[0], meetup["id"], NEED_1_RACKET)

    leave(client, guest[0], meetup["id"])

    [seen] = meetups_seen_by(client, host[0], place.id)
    assert (seen["equipment_needed"], seen["equipment_missing"]) == ([], [])


def test_a_move_takes_what_the_host_needs_along(client, place, host, guest):
    old = create(client, host[0], place.id, starts_at=later(days=1), equipment=NEED_1_RACKET).json()
    # With a Join the Host gets a new Meetup at the new time.
    join(client, guest[0], old["id"])
    new_start = datetime.fromisoformat(old["starts_at"]) + timedelta(hours=1)

    moved = change_time(client, host[0], old["id"], new_start.isoformat()).json()

    assert moved["id"] != old["id"]
    assert needed(only(meetups_seen_by(client, host[0], place.id), moved["id"])) == {
        "Pingpong_Paula": {"rackets": 1}
    }


def test_what_a_blocker_needs_is_missing_but_not_named(client, place, host, guest, third):
    meetup = create(client, host[0], place.id).json()
    join_with(client, guest[0], meetup["id"], NEED_1_RACKET)
    join(client, third[0], meetup["id"])
    client.post("/api/blocks", json={"nickname": "Mia_Matte"}, headers=auth_header(guest[0]))

    seen = only(meetups_seen_by(client, third[0], place.id), meetup["id"])

    assert missing(seen) == [("rackets", 1)]
    assert "Korb_Karl" not in needed(seen)
