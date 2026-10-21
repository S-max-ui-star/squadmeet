"""Weekly Series with Occurrences (SCRUM-38)."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app import series as series_module
from app.models import Meetup, MeetupSeries
from tests.test_auth import auth_header, register
from tests.test_meetups import join, leave, meetups_seen_by, people_now, place  # noqa: F401

BERLIN = ZoneInfo("Europe/Berlin")


@pytest.fixture
def host(client):
    body = register(client).json()
    return body["token"], body["user"]["id"]


@pytest.fixture
def guest(client):
    body = register(client, nickname="Korb_Karl").json()
    return body["token"], body["user"]["id"]


def create_series(client, token, place_id, slots, **changes):
    body = {"place_id": place_id, "slots": slots, "party_size": 2} | changes
    return client.post("/api/meetup-series", json=body, headers=auth_header(token))


def slot(weekday, at="19:00", hours=2):
    return {"weekday": weekday, "time": at, "hours": hours}


def occurrences(client, token, place_id):
    return [m for m in meetups_seen_by(client, token, place_id) if m["series_id"] is not None]


def berlin(m):
    return datetime.fromisoformat(m["starts_at"]).astimezone(BERLIN)


def test_create_a_series_with_two_weekdays(client, place, host):
    response = create_series(client, host[0], place.id, [slot(0, "19:00", 2), slot(3, "18:00", 3)])

    assert response.status_code == 201
    found = occurrences(client, host[0], place.id)
    # Mondays and Thursdays of the next 30 days: 8 or 9 dates.
    assert 8 <= len(found) <= 9
    for m in found:
        start = berlin(m)
        hours = (datetime.fromisoformat(m["ends_at"]) - datetime.fromisoformat(m["starts_at"])) / timedelta(hours=1)
        assert (start.weekday(), start.strftime("%H:%M"), hours) in {(0, "19:00", 2), (3, "18:00", 3)}
        assert m["party_size"] == 2


def test_occurrences_reach_at_most_30_days_ahead(client, place, host):
    create_series(client, host[0], place.id, [slot(d) for d in range(7)])

    found = occurrences(client, host[0], place.id)

    now = datetime.now(UTC)
    assert all(datetime.fromisoformat(m["starts_at"]) <= now + timedelta(days=30) for m in found)
    assert all(datetime.fromisoformat(m["starts_at"]) > now for m in found)


def test_the_time_stays_19_00_in_berlin_across_the_clock_change(session, client, place, host):
    # Generated from a fixed day before the change of 25.10.2026 (summer to winter time).
    series_id = create_series(client, host[0], place.id, [slot(0)]).json()["id"]
    series = session.get(series_module.MeetupSeries, series_id)
    session.exec(series_module.delete_future_of(series))
    series_module.fill_series(session, series, datetime(2026, 10, 14, 8, tzinfo=UTC))
    session.commit()

    starts = sorted(
        m.starts_at
        for m in session.exec(series_module.select(Meetup).where(Meetup.series_id == series_id))
    )
    as_berlin = [s.astimezone(BERLIN) for s in starts]
    assert [s.strftime("%d.%m. %H:%M") for s in as_berlin][:3] == [
        "19.10. 19:00",
        "26.10. 19:00",
        "02.11. 19:00",
    ]
    # 17:00 UTC in summer time, 18:00 UTC in winter time.
    assert [s.astimezone(UTC).hour for s in starts][:2] == [17, 18]


def test_the_end_date_is_respected(client, place, host):
    until = (datetime.now(BERLIN) + timedelta(days=8)).date()

    create_series(client, host[0], place.id, [slot(d) for d in range(7)], until=until.isoformat())

    found = occurrences(client, host[0], place.id)
    assert max(berlin(m).date() for m in found) <= until
    assert len(found) in (7, 8, 9)


def test_new_occurrences_are_filled_in_as_time_goes_on(session, client, place, host):
    series_id = create_series(client, host[0], place.id, [slot(2)]).json()["id"]
    series = session.get(series_module.MeetupSeries, series_id)
    before = len(occurrences(client, host[0], place.id))

    # A week later the window has moved on by one Wednesday.
    added = series_module.fill_series(session, series, datetime.now(UTC) + timedelta(days=7))

    assert added == 1
    assert before in (4, 5)


def test_filling_twice_adds_nothing(session, client, place, host):
    series_id = create_series(client, host[0], place.id, [slot(1)]).json()["id"]
    series = session.get(series_module.MeetupSeries, series_id)

    assert series_module.fill_series(session, series, datetime.now(UTC)) == 0


def test_a_cancelled_or_moved_occurrence_does_not_come_back(session, client, place, host):
    create_series(client, host[0], place.id, [slot(4)])
    first, second = sorted(occurrences(client, host[0], place.id), key=lambda m: m["starts_at"])[:2]
    client.post(f"/api/meetups/{first['id']}/cancel", headers=auth_header(host[0]))
    new_start = datetime.fromisoformat(second["starts_at"]) + timedelta(hours=1)
    client.patch(
        f"/api/meetups/{second['id']}",
        json={"starts_at": new_start.isoformat()},
        headers=auth_header(host[0]),
    )

    found = occurrences(client, host[0], place.id)

    assert [m["id"] for m in found if m["id"] in (first["id"], second["id"])] == [first["id"], second["id"]]
    dates = [berlin(m).date() for m in found]
    assert len(dates) == len(set(dates))


def test_join_one_occurrence_and_leave_it(client, place, host, guest):
    create_series(client, host[0], place.id, [slot(5)])
    first, second = sorted(occurrences(client, guest[0], place.id), key=lambda m: m["starts_at"])[:2]

    assert join(client, guest[0], first["id"], party_size=3).status_code == 201
    joined = {m["id"]: m for m in occurrences(client, guest[0], place.id)}
    assert joined[first["id"]]["people"] == 5
    assert joined[second["id"]]["people"] == 2

    assert leave(client, guest[0], first["id"]).status_code == 204


def test_the_host_cancels_the_whole_series(client, place, host, guest):
    series_id = create_series(client, host[0], place.id, [slot(d) for d in range(7)]).json()["id"]

    assert client.post(f"/api/meetup-series/{series_id}/cancel", headers=auth_header(guest[0])).status_code == 403
    assert client.post(f"/api/meetup-series/{series_id}/cancel", headers=auth_header(host[0])).status_code == 200

    found = occurrences(client, host[0], place.id)
    assert found and all(m["cancelled"] for m in found)


def test_a_cancelled_series_adds_no_new_occurrences(session, client, place, host):
    series_id = create_series(client, host[0], place.id, [slot(3)]).json()["id"]
    client.post(f"/api/meetup-series/{series_id}/cancel", headers=auth_header(host[0]))
    series = session.get(series_module.MeetupSeries, series_id)

    assert series_module.fill_series(session, series, datetime.now(UTC) + timedelta(days=14)) == 0


def test_the_host_may_cancel_the_series_only_while_it_runs(client, place, host):
    series_id = create_series(client, host[0], place.id, [slot(6)]).json()["id"]
    client.post(f"/api/meetup-series/{series_id}/cancel", headers=auth_header(host[0]))

    assert client.post(f"/api/meetup-series/{series_id}/cancel", headers=auth_header(host[0])).status_code == 409


def test_cancelling_the_series_leaves_an_occurrence_handed_to_another_host(client, place, host, guest):
    series_id = create_series(client, host[0], place.id, [slot(d) for d in range(7)]).json()["id"]
    handed, *rest = sorted(occurrences(client, host[0], place.id), key=lambda m: m["starts_at"])
    join(client, guest[0], handed["id"])
    # The Series Host Leaves, so the guest becomes Host of this Occurrence (SCRUM-37).
    assert leave(client, host[0], handed["id"]).status_code == 204

    seen = {m["id"]: m for m in occurrences(client, host[0], place.id)}
    assert "cancel_series" not in seen[handed["id"]]["actions"]
    assert client.post(f"/api/meetup-series/{series_id}/cancel", headers=auth_header(host[0])).status_code == 200

    after = {m["id"]: m for m in occurrences(client, guest[0], place.id)}
    assert not after[handed["id"]]["cancelled"]
    assert all(after[m["id"]]["cancelled"] for m in rest)


def test_an_occurrence_shows_whether_the_viewer_may_cancel_the_series(client, place, host, guest):
    create_series(client, host[0], place.id, [slot(0)])

    assert all("cancel_series" in m["actions"] for m in occurrences(client, host[0], place.id))
    assert not any("cancel_series" in m["actions"] for m in occurrences(client, guest[0], place.id))


@pytest.mark.parametrize(
    "slots",
    [
        [],
        [slot(7)],
        [slot(0), slot(0, "20:00")],
        [slot(0, hours=5)],
        [slot(0, at="25:00")],
    ],
)
def test_invalid_slots_are_rejected(client, place, host, slots):
    assert create_series(client, host[0], place.id, slots).status_code == 422


def test_an_end_date_in_the_past_is_rejected(client, place, host):
    yesterday = (datetime.now(BERLIN) - timedelta(days=1)).date()

    assert create_series(client, host[0], place.id, [slot(0)], until=yesterday.isoformat()).status_code == 422


def test_a_series_without_a_future_occurrence_is_not_created(session, client, place, host):
    now = datetime.now(BERLIN)
    response = create_series(
        client,
        host[0],
        place.id,
        [slot(now.weekday(), now.strftime("%H:%M"))],
        until=now.date().isoformat(),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Die Auswahl enthält keinen zukünftigen Termin"
    assert session.exec(series_module.select(MeetupSeries)).all() == []


def test_creating_needs_a_login(client, place):
    assert client.post("/api/meetup-series", json={"place_id": place.id, "slots": [slot(0)]}).status_code == 401


def test_no_series_at_a_place_suggestion(session, client, place, host):
    place.is_suggestion = True
    session.commit()

    assert create_series(client, host[0], place.id, [slot(0)]).status_code == 409


def test_an_occurrence_counts_on_the_map_while_it_runs(session, client, place, host):
    series_id = create_series(client, host[0], place.id, [slot(0)]).json()["id"]
    first = min(session.exec(series_module.select(Meetup).where(Meetup.series_id == series_id)), key=lambda m: m.starts_at)
    first.starts_at = datetime.now(UTC) - timedelta(minutes=5)
    first.ends_at = datetime.now(UTC) + timedelta(hours=1)
    session.commit()

    assert people_now(client, place.id) == 2


def test_occurrence_dates_for_a_window(session):
    # Pure function: all Mondays 19:00 and Thursdays 18:00 in a window, Berlin time.
    slots = [series_module.Slot(weekday=0, time=time(19), hours=2), series_module.Slot(weekday=3, time=time(18), hours=3)]
    start = datetime(2026, 10, 14, 8, tzinfo=UTC)

    dates = series_module.occurrence_times(slots, start, start + timedelta(days=14), until=date(2026, 10, 22))

    assert [(s.astimezone(BERLIN).strftime("%a %d.%m. %H:%M"), h) for s, _, h in dates] == [
        ("Thu 15.10. 18:00", 3),
        ("Mon 19.10. 19:00", 2),
        ("Thu 22.10. 18:00", 3),
    ]


def test_a_series_is_refused_when_a_date_is_full(session, client, place, host):
    """SCRUM-80: each date counts on its own. At creation the whole Series is refused and
    names the date; a later fill skips a full date."""
    every_day = [slot(d) for d in range(7)]
    create_series(client, host[0], place.id, every_day)
    create_series(client, host[0], place.id, every_day)

    response = create_series(client, host[0], place.id, every_day)
    morning = create_series(client, host[0], place.id, [slot(d, "10:00") for d in range(7)])

    assert response.status_code == 409
    assert response.json()["detail"].startswith("Am ")
    assert response.json()["detail"].endswith(" bist du zu dieser Zeit schon bei 2 Treffen.")
    assert morning.status_code == 201


def test_a_later_fill_skips_a_full_date(session, client, place, host):
    from app.models import MeetupSeries

    every_day = [slot(d) for d in range(7)]
    create_series(client, host[0], place.id, every_day)
    create_series(client, host[0], place.id, every_day)
    now = datetime.now(UTC)
    third = MeetupSeries(
        place_id=place.id, host_id=host[1], party_size=1, slots=every_day, created_at=now
    )
    session.add(third)
    session.flush()

    assert series_module.fill_series(session, third, now) == 0


def emptied(session, series_id):
    """The Series with all its Occurrences deleted, so the next fill makes them again."""
    series = session.get(series_module.MeetupSeries, series_id)
    session.exec(series_module.delete_future_of(series))
    session.commit()
    return series


def count_of(session, series):
    return len(session.exec(series_module.select(Meetup.id).where(Meetup.series_id == series.id)).all())


def test_the_map_fills_only_the_series_in_its_area(session, client, place, host):
    # SCRUM-72: a map load does not fill every Series of every user.
    series = emptied(session, create_series(client, host[0], place.id, [slot(0)]).json()["id"])

    client.get("/api/places", params={"bbox": "10,50,11,51"})
    assert count_of(session, series) == 0

    client.get("/api/places", params={"bbox": "-31,0,-30,1"})
    assert count_of(session, series) > 0


def test_my_meetups_fill_only_the_users_own_series(session, client, place, host, guest):
    series = emptied(session, create_series(client, host[0], place.id, [slot(0)]).json()["id"])

    client.get("/api/meetups/mine", headers=auth_header(guest[0]))
    assert count_of(session, series) == 0

    client.get("/api/meetups/mine", headers=auth_header(host[0]))
    assert count_of(session, series) > 0


def favorite_notices(session, user_id):
    from app.models import Notification

    return len(
        session.exec(
            series_module.select(Notification.id).where(
                Notification.user_id == user_id, Notification.kind == "favorite_meetup_created"
            )
        ).all()
    )


def test_a_fill_that_meets_an_existing_occurrence_goes_on(session, client, place, host, guest, monkeypatch):
    # SCRUM-123: two map loads at the same moment read the same dates; the second insert of an
    # Occurrence must not fail, and the Favorite gets one Notification per Occurrence.
    from tests.test_favorites import add_favorite

    add_favorite(client, guest[0], place.id)
    series_id = create_series(client, host[0], place.id, [slot(0)]).json()["id"]
    series = session.get(series_module.MeetupSeries, series_id)
    first = min(occurrences(client, host[0], place.id), key=lambda m: m["starts_at"])
    session.exec(series_module.delete(Meetup).where(Meetup.id == first["id"]))
    session.commit()
    total = count_of(session, series)
    notices = favorite_notices(session, guest[1])
    # The other request has not committed yet when this one reads: no date is known.
    monkeypatch.setattr(series_module, "occurrence_dates", lambda session, series: set())

    added = series_module.fill_series(session, series, datetime.now(UTC))

    assert added == 1
    assert count_of(session, series) == total + 1
    assert favorite_notices(session, guest[1]) == notices + 1
