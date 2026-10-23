"""Live updates for open pages: Server-Sent Events (SCRUM-93)."""

import asyncio
import threading
from datetime import UTC, datetime

import pytest

from app import live
from app.models import ContactRequest
from tests.test_auth import auth_header
from tests.test_contacts import answer, ask, block, user
from tests.test_meetups import (  # noqa: F401 (fixtures)
    cancel,
    create,
    guest,
    host,
    join,
    later,
    place,
    third,
)
from tests.test_ratings import rate, vote


@pytest.fixture
def heard():
    """heard(user_id) -> the list of topics that the Hub sends to that user from now on."""
    stops = []

    def listen(user_id):
        topics = []
        stops.append(live.hub.listen(user_id, topics.append))
        return topics

    yield listen
    for stop in stops:
        stop()


def test_a_contact_request_reaches_the_other_user_and_the_asker(client, heard):
    paula, paula_id = user(client, "Pingpong_Paula")
    _, karl_id = user(client, "Korb_Karl")
    to_karl, to_paula = heard(karl_id), heard(paula_id)

    assert ask(client, paula, "Korb_Karl").status_code == 201

    assert to_karl == ["contacts"]
    # The asker's other devices show the open request too.
    assert to_paula == ["contacts"]


def test_accepting_a_request_reaches_the_asker(client, heard):
    paula, paula_id = user(client, "Pingpong_Paula")
    karl, _ = user(client, "Korb_Karl")
    request_id = ask(client, paula, "Korb_Karl").json()["id"]
    to_paula = heard(paula_id)

    assert answer(client, karl, request_id, "accept").status_code == 200

    assert to_paula == ["contacts"]


def test_a_block_reaches_the_blocked_user_whose_request_goes(client, heard):
    paula, _ = user(client, "Pingpong_Paula")
    karl, karl_id = user(client, "Korb_Karl")
    ask(client, karl, "Pingpong_Paula")
    to_karl = heard(karl_id)

    assert block(client, paula, "Korb_Karl").status_code == 201

    assert "contacts" in to_karl


def test_a_new_notification_reaches_only_its_recipient(client, heard, place, host, guest, third):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])
    to_host, to_guest, to_third = heard(host[1]), heard(guest[1]), heard(third[1])

    assert cancel(client, host[0], meetup["id"]).status_code == 200

    assert "notifications" in to_guest
    assert "notifications" not in to_host
    assert "notifications" not in to_third


def test_marking_as_read_reaches_the_users_other_devices(client, heard, place, host, guest):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])
    cancel(client, host[0], meetup["id"])
    [notice] = client.get("/api/notifications", headers=auth_header(guest[0])).json()
    to_guest = heard(guest[1])

    client.post(f"/api/notifications/{notice['id']}/read", headers=auth_header(guest[0]))

    assert to_guest == ["notifications"]


def test_a_new_meetup_reaches_every_open_page_with_its_place(client, heard, place, host, third):
    to_third = heard(third[1])

    assert create(client, host[0], place.id, starts_at=later(days=1)).status_code == 201

    assert to_third == [f"meetups:{place.id}"]


def test_a_join_reaches_every_open_page_with_its_place(client, heard, place, host, guest, third):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    to_host, to_third = heard(host[1]), heard(third[1])

    assert join(client, guest[0], meetup["id"]).status_code == 201

    assert f"meetups:{place.id}" in to_host
    assert f"meetups:{place.id}" in to_third


@pytest.mark.parametrize(("before", "after"), [([], [{"item": "net"}]), ([{"item": "net"}], [])])
def test_an_equipment_change_reaches_every_open_page_with_its_place(
    client, heard, place, host, third, before, after
):
    # SCRUM-170: also when the user takes all their Equipment back (only deleted rows).
    meetup = create(client, host[0], place.id, starts_at=later(days=1), equipment=before).json()
    to_third = heard(third[1])

    changed = client.put(
        f"/api/meetups/{meetup['id']}/equipment",
        json={"equipment": after},
        headers=auth_header(host[0]),
    )

    assert changed.status_code == 200
    assert to_third == [f"meetups:{place.id}"]


def test_a_cancelled_meetup_reaches_every_open_page_with_its_place(
    client, heard, place, host, third
):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    to_third = heard(third[1])

    assert cancel(client, host[0], meetup["id"]).status_code == 200

    assert to_third == [f"meetups:{place.id}"]


def test_a_rating_reaches_every_open_page_with_its_place(client, heard, place, host, third):
    """SCRUM-98: the open Place detail loads its Ratings and Condition again."""
    to_third = heard(third[1])

    assert rate(client, host[0], place.id, reasons=["net_missing"]).status_code == 200

    assert to_third == [f"ratings:{place.id}"]


def test_a_condition_vote_reaches_every_open_page_with_its_place(
    client, heard, place, host, guest, third
):
    rate(client, host[0], place.id, reasons=["net_missing"])
    to_third = heard(third[1])

    assert vote(client, guest[0], place.id, still_there=False).status_code == 200

    assert to_third == [f"ratings:{place.id}"]


def test_nothing_is_sent_before_the_commit_or_after_a_rollback(client, session, heard):
    _, paula_id = user(client, "Pingpong_Paula")
    _, karl_id = user(client, "Korb_Karl")
    to_karl = heard(karl_id)
    row = ContactRequest(
        requester_id=paula_id, addressee_id=karl_id, status="pending", updated_at=datetime.now(UTC)
    )

    session.add(row)
    session.flush()
    assert to_karl == []
    session.rollback()
    session.commit()
    assert to_karl == []

    session.add(row)
    session.commit()
    assert to_karl == ["contacts"]


def test_a_savepoint_is_not_the_commit(client, session, heard):
    _, paula_id = user(client, "Pingpong_Paula")
    _, karl_id = user(client, "Korb_Karl")
    to_karl = heard(karl_id)
    row = ContactRequest(
        requester_id=paula_id, addressee_id=karl_id, status="pending", updated_at=datetime.now(UTC)
    )

    session.add(row)
    with session.begin_nested():  # A savepoint (SCRUM-123, SCRUM-139) is not the commit.
        pass
    assert to_karl == []

    session.commit()
    assert to_karl == ["contacts"]


def test_a_failed_savepoint_keeps_the_events_of_the_transaction(client, session, heard):
    _, paula_id = user(client, "Pingpong_Paula")
    _, karl_id = user(client, "Korb_Karl")
    to_karl = heard(karl_id)
    row = ContactRequest(
        requester_id=paula_id, addressee_id=karl_id, status="pending", updated_at=datetime.now(UTC)
    )

    session.add(row)
    session.flush()
    session.begin_nested().rollback()
    session.commit()

    assert to_karl == ["contacts"]


def test_the_stream_needs_a_login(client):
    assert client.get("/api/live").status_code == 401


def test_the_stream_is_an_event_stream_for_the_signed_in_user(client, monkeypatch):
    token, user_id = user(client, "Pingpong_Paula")
    streamed_for = []

    async def one_event(for_user):
        streamed_for.append(for_user)
        yield "data: ready\n\n"

    monkeypatch.setattr(live, "stream", one_event)

    response = client.get("/api/live", headers=auth_header(token))

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache"
    assert response.text == "data: ready\n\n"
    assert streamed_for == [user_id]


def test_the_stream_says_ready_then_sends_topics_and_pings():
    async def scenario():
        events = live.stream(4711, heartbeat_seconds=0.05)
        received = [await anext(events)]
        # Sync routes commit in a worker thread, not in the event loop.
        threading.Thread(target=live.hub.publish, args=({4711}, "notifications")).start()
        received.append(await anext(events))
        received.append(await anext(events))
        await events.aclose()
        return received

    assert asyncio.run(scenario()) == ["data: ready\n\n", "data: notifications\n\n", ": ping\n\n"]
    # The closed stream no longer listens.
    assert live.hub.listeners(4711) == 0
