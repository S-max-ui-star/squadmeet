"""The Meetup lifecycle with a set clock (SCRUM-61): states, transitions, rules and actions.

These tests call app.meetup_lifecycle directly. They pass `now` instead of writing rows with
past times, so a Meetup can be "running" or "over" without waiting.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app import meetup_lifecycle as lifecycle
from app.meetup_lifecycle import Conflict, Invalid, MeetupState, NotAllowed, NotFound
from app.models import Meetup, MeetupSeries, Place, User, UserBlock

T0 = datetime(2026, 10, 17, 16, 0, tzinfo=UTC)
HOST, KARL, MIA = 1, 2, 3


def meetup(starts=T0, hours=2, host=HOST, **changes) -> Meetup:
    """A Meetup in memory, not in the database: enough for state and the simple transitions."""
    return Meetup(
        id=10, place_id=1, host_id=host, party_size=2, starts_at=starts, ends_at=starts + timedelta(hours=hours), **changes
    )


@pytest.mark.parametrize(
    ("now", "changes", "expected"),
    [
        (T0 - timedelta(minutes=1), {}, MeetupState.UPCOMING),
        (T0, {}, MeetupState.LIVE),
        (T0 + timedelta(hours=2), {}, MeetupState.ENDED),
        (T0 - timedelta(hours=1), {"cancelled_at": T0 - timedelta(days=1)}, MeetupState.CANCELLED),
        (T0, {"closed_at": T0}, MeetupState.CLOSED),
    ],
)
def test_state(now, changes, expected):
    assert lifecycle.state(meetup(**changes), now) is expected


def test_only_the_host_cancels_and_only_before_the_start(session):
    m = meetup()

    with pytest.raises(NotAllowed):
        lifecycle.cancel(session, m, KARL, T0 - timedelta(hours=1))
    with pytest.raises(Conflict, match="läuft schon"):
        lifecycle.cancel(session, m, HOST, T0 + timedelta(minutes=5))

    lifecycle.cancel(session, m, HOST, T0 - timedelta(hours=1))
    assert lifecycle.state(m, T0) is MeetupState.CANCELLED


def test_end_only_while_running():
    m = meetup()

    with pytest.raises(Conflict, match="noch nicht begonnen"):
        lifecycle.end(m, HOST, T0 - timedelta(minutes=1))
    lifecycle.end(m, HOST, T0 + timedelta(minutes=30))

    assert m.ends_at == T0 + timedelta(minutes=30)
    with pytest.raises(Conflict, match="schon vorbei"):
        lifecycle.end(m, HOST, T0 + timedelta(minutes=31))


def test_call_off_cancels_upcoming_and_ends_running(session):
    upcoming, running = meetup(), meetup(starts=T0 - timedelta(hours=1))

    lifecycle.call_off(session, upcoming, T0 - timedelta(minutes=1))
    lifecycle.call_off(session, running, T0)

    assert upcoming.cancelled_at is not None
    assert (running.cancelled_at, running.ends_at) == (None, T0)


def test_call_off_for_a_series_leaves_a_running_occurrence(session):
    running = meetup(starts=T0 - timedelta(hours=1))

    lifecycle.call_off(session, running, T0, end_running=False)

    assert lifecycle.state(running, T0) is MeetupState.LIVE


def test_a_start_must_be_in_the_future_and_at_most_30_days_ahead():
    with pytest.raises(Invalid):
        lifecycle.check_start(T0, T0)
    with pytest.raises(Invalid):
        lifecycle.check_start(T0 + timedelta(days=30, minutes=1), T0)
    lifecycle.check_start(T0 + timedelta(days=30), T0)


@pytest.mark.parametrize(
    ("viewer", "joined", "now", "expected"),
    [
        (None, False, T0 - timedelta(hours=1), ["join"]),
        (HOST, False, T0 - timedelta(hours=1), ["cancel", "move", "leave", "invite"]),
        (HOST, False, T0 + timedelta(minutes=1), ["end", "leave", "invite"]),
        (KARL, False, T0, ["join"]),
        (KARL, True, T0, ["leave", "invite"]),
        (KARL, False, T0 + timedelta(hours=3), []),
    ],
)
def test_actions(viewer, joined, now, expected):
    assert lifecycle.actions(meetup(), viewer, joined, now) == expected


def test_cancel_series_only_for_the_host_of_a_running_series():
    series = MeetupSeries(id=5, place_id=1, host_id=HOST, party_size=2, slots=[], created_at=T0)
    before = T0 - timedelta(hours=1)

    assert "cancel_series" in lifecycle.actions(meetup(), HOST, False, before, series)
    assert "cancel_series" not in lifecycle.actions(meetup(), KARL, False, before, series)
    series.cancelled_at = before
    assert "cancel_series" not in lifecycle.actions(meetup(), HOST, False, before, series)


# With a database session: Join, Leave, hand over, move.


@pytest.fixture
def stored(session):
    """Three users, a Place and a Meetup of user 1 at T0, in the test database."""
    users = [
        User(nickname=name, password_hash="x", avatar="fox", created_at=T0 - timedelta(days=30))
        for name in ("Paula_L", "Karl_L", "Mia_L")
    ]
    session.add_all(users)
    place = Place(name="Testplatte", activity_type="table_tennis", location="SRID=4326;POINT(-30.5 0.5)")
    session.add(place)
    session.flush()
    m = Meetup(place_id=place.id, host_id=users[0].id, party_size=2, starts_at=T0, ends_at=T0 + timedelta(hours=2))
    session.add(m)
    session.flush()
    return session, m, [u.id for u in users]


def test_join_then_leave_with_a_set_clock(stored):
    session, m, (paula, karl, _) = stored

    lifecycle.join(session, m, karl, 3, T0 - timedelta(hours=1))
    session.flush()
    with pytest.raises(Conflict, match="schon dabei"):
        lifecycle.join(session, m, karl, 1, T0 - timedelta(hours=1))
    with pytest.raises(Conflict, match="Gastgeber"):
        lifecycle.join(session, m, paula, 1, T0)

    lifecycle.leave(session, m, karl, T0)
    with pytest.raises(NotFound):
        lifecycle.leave(session, m, karl, T0)


def test_no_join_after_the_end(stored):
    session, m, (_, karl, _) = stored

    with pytest.raises(Conflict, match="schon vorbei"):
        lifecycle.join(session, m, karl, 1, T0 + timedelta(hours=2))


def test_a_blocked_user_cannot_join(stored):
    session, m, (paula, karl, _) = stored
    session.add(UserBlock(blocker_id=paula, blocked_id=karl, created_at=T0))
    session.flush()

    with pytest.raises(NotFound):
        lifecycle.join(session, m, karl, 1, T0)


def test_hand_over_to_the_earliest_join_then_closed(stored):
    session, m, (paula, karl, mia) = stored
    lifecycle.join(session, m, mia, 2, T0 - timedelta(hours=2))
    lifecycle.join(session, m, karl, 3, T0 - timedelta(hours=1))
    session.flush()

    lifecycle.leave(session, m, paula, T0)
    session.flush()
    assert (m.host_id, m.party_size) == (mia, 2)

    lifecycle.leave(session, m, mia, T0)
    session.flush()
    assert (m.host_id, m.party_size) == (karl, 3)

    lifecycle.leave(session, m, karl, T0)
    assert lifecycle.state(m, T0) is MeetupState.CLOSED
    with pytest.raises(Conflict, match="schon vorbei"):
        lifecycle.leave(session, m, karl, T0)


def test_move_without_joins_moves_the_meetup(stored):
    session, m, (paula, _, _) = stored
    now = T0 - timedelta(days=1)

    result = lifecycle.move(session, m, paula, T0 + timedelta(hours=3), now)

    assert result is m
    assert (m.starts_at, m.ends_at) == (T0 + timedelta(hours=3), T0 + timedelta(hours=5))


def test_move_with_joins_gives_the_host_a_new_meetup_and_asks_the_others(stored):
    session, m, (paula, karl, _) = stored
    now = T0 - timedelta(days=1)
    lifecycle.join(session, m, karl, 1, now)
    session.flush()

    moved = lifecycle.move(session, m, paula, T0 + timedelta(hours=3), now)
    session.flush()

    assert moved is not m and moved.host_id == paula
    assert m.host_id == karl and m.moved_to_id == moved.id and m.host_move_pending
    lifecycle.answer_move(session, m, karl, "go", now)
    session.flush()
    assert lifecycle.find_join(session, moved, karl) is not None
    assert lifecycle.state(m, now) is MeetupState.CLOSED


def test_hand_over_meetups_of_a_deleted_host(stored):
    session, m, (paula, karl, _) = stored
    lifecycle.join(session, m, karl, 4, T0 - timedelta(hours=1))
    session.flush()

    lifecycle.hand_over_meetups_of(session, paula, T0)

    assert (m.host_id, m.party_size) == (karl, 4)


# At most 2 Meetups at one moment (SCRUM-80).


def hosted(session, place_id, host, starts, hours=2, **changes) -> Meetup:
    changes.setdefault("ends_at", starts + timedelta(hours=hours))
    m = Meetup(place_id=place_id, host_id=host, party_size=1, starts_at=starts, **changes)
    session.add(m)
    session.flush()
    return m


def test_two_at_once_are_allowed_a_third_is_refused(stored):
    session, m, (_, karl, mia) = stored
    now = T0 - timedelta(days=1)
    lifecycle.join(session, m, karl, 1, now)
    hosted(session, m.place_id, karl, T0 + timedelta(hours=1))

    with pytest.raises(Conflict, match="Du bist zu dieser Zeit schon bei 2 Treffen"):
        lifecycle.require_room(session, karl, T0 + timedelta(minutes=90), T0 + timedelta(hours=3), now)
    lifecycle.require_room(session, mia, T0 + timedelta(minutes=90), T0 + timedelta(hours=3), now)


def test_a_third_that_never_meets_both_at_one_moment_is_allowed(stored):
    session, m, (paula, _, _) = stored
    now = T0 - timedelta(days=1)
    hosted(session, m.place_id, paula, T0 + timedelta(hours=3))

    # 15:00–21:00 overlaps both, but they do not overlap each other; an end is not a start.
    lifecycle.require_room(session, paula, T0 - timedelta(hours=1), T0 + timedelta(hours=5), now)
    lifecycle.require_room(session, paula, T0 + timedelta(hours=2), T0 + timedelta(hours=3), now)


def test_cancelled_closed_and_ended_meetups_do_not_count(stored):
    session, m, (paula, _, _) = stored
    now = T0 + timedelta(minutes=30)
    hosted(session, m.place_id, paula, T0, cancelled_at=now)
    hosted(session, m.place_id, paula, T0, closed_at=now)
    # Ended 10 minutes ago: it overlapped the running one, but it is over.
    hosted(session, m.place_id, paula, T0 - timedelta(hours=1), ends_at=T0 + timedelta(minutes=20))

    lifecycle.require_room(session, paula, now, now + timedelta(hours=1), now)


def test_join_is_refused_at_the_limit(stored):
    session, m, (_, karl, _) = stored
    now = T0 - timedelta(days=1)
    hosted(session, m.place_id, karl, T0)
    hosted(session, m.place_id, karl, T0 + timedelta(hours=1))

    with pytest.raises(Conflict, match="schon bei 2 Treffen"):
        lifecycle.join(session, m, karl, 1, now)


def test_join_a_running_meetup_ignores_one_that_already_ended(stored):
    session, m, (_, karl, _) = stored
    now = T0 + timedelta(hours=1)
    hosted(session, m.place_id, karl, T0, ends_at=T0 + timedelta(minutes=30))
    hosted(session, m.place_id, karl, T0)

    lifecycle.join(session, m, karl, 1, now)


def test_move_counts_the_new_time_without_the_meetup_itself(stored):
    session, m, (paula, _, _) = stored
    now = T0 - timedelta(days=1)
    hosted(session, m.place_id, paula, T0)
    lifecycle.move(session, m, paula, T0 + timedelta(minutes=30), now)

    hosted(session, m.place_id, paula, T0 + timedelta(hours=4))
    hosted(session, m.place_id, paula, T0 + timedelta(hours=4))
    with pytest.raises(Conflict, match="schon bei 2 Treffen"):
        lifecycle.move(session, m, paula, T0 + timedelta(hours=4), now)


def test_move_with_joins_is_refused_at_the_limit(stored):
    session, m, (paula, karl, _) = stored
    now = T0 - timedelta(days=1)
    lifecycle.join(session, m, karl, 1, now)
    hosted(session, m.place_id, paula, T0 + timedelta(hours=4))
    hosted(session, m.place_id, paula, T0 + timedelta(hours=4))

    with pytest.raises(Conflict, match="schon bei 2 Treffen"):
        lifecycle.move(session, m, paula, T0 + timedelta(hours=4), now)
    assert m.host_id == paula and m.moved_to_id is None


def test_go_counts_the_new_meetup_without_the_old_one(stored):
    session, m, (paula, karl, mia) = stored
    now = T0 - timedelta(days=1)
    lifecycle.join(session, m, karl, 1, now)
    lifecycle.join(session, m, mia, 1, now)
    session.flush()
    moved = lifecycle.move(session, m, paula, T0 + timedelta(hours=1), now)
    session.flush()
    hosted(session, m.place_id, karl, T0 + timedelta(hours=1))
    hosted(session, m.place_id, mia, T0 + timedelta(hours=1))
    hosted(session, m.place_id, mia, T0 + timedelta(hours=1))

    # Karl: the new one and his own; the old one at 16:00 he leaves.
    lifecycle.answer_move(session, m, karl, "go", now)
    session.flush()
    assert lifecycle.find_join(session, moved, karl) is not None
    with pytest.raises(Conflict, match="schon bei 2 Treffen"):
        lifecycle.answer_move(session, m, mia, "go", now)
