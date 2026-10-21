"""SCRUM-102: "Meine Treffen", the user's own coming and running Meetups (as Host and as Join)."""

from datetime import UTC, datetime, timedelta

from app.models import Meetup
from tests.test_auth import auth_header
from tests.test_meetups import create, guest, host, place  # noqa: F401 (fixtures)


def mine(client, token):
    return client.get("/api/meetups/mine", headers=auth_header(token))


def later(hours: float) -> str:
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


def test_needs_a_login(client):
    assert client.get("/api/meetups/mine").status_code == 401


def test_lists_hosted_and_joined_meetups_with_their_place(client, place, host, guest):
    hosted = create(client, host[0], place.id, starts_at=later(5)).json()
    joined = create(client, guest[0], place.id, starts_at=later(2)).json()
    client.post(f"/api/meetups/{joined['id']}/join", json={}, headers=auth_header(host[0]))
    create(client, guest[0], place.id, starts_at=later(8))  # not the host's

    answer = mine(client, host[0])

    assert answer.status_code == 200
    found = answer.json()
    # Soonest start first.
    assert [m["id"] for m in found] == [joined["id"], hosted["id"]]
    assert [m["hosting"] for m in found] == [False, True]
    assert found[0]["place"] == {
        "id": place.id,
        "name": "Testplatte",
        "activity_type": "table_tennis",
    }
    assert found[0]["people"] == 2


def test_only_the_users_own_meetups(client, place, host, guest):
    create(client, host[0], place.id, starts_at=later(3))

    assert mine(client, guest[0]).json() == []


def test_cancelled_until_its_end_but_not_ended_or_closed(client, session, place, host):
    now = datetime.now(UTC)
    cancelled = create(client, host[0], place.id, starts_at=later(3)).json()
    client.post(f"/api/meetups/{cancelled['id']}/cancel", headers=auth_header(host[0]))
    session.add_all(
        [
            Meetup(
                place_id=place.id,
                host_id=host[1],
                party_size=1,
                starts_at=now - timedelta(hours=3),
                ends_at=now - timedelta(hours=1),
            ),
            Meetup(
                place_id=place.id,
                host_id=host[1],
                party_size=1,
                starts_at=now + timedelta(hours=6),
                ends_at=now + timedelta(hours=8),
                closed_at=now,
            ),
        ]
    )
    session.commit()

    found = mine(client, host[0]).json()

    assert [(m["id"], m["cancelled"]) for m in found] == [(cancelled["id"], True)]


def test_running_meetup_is_listed(client, place, host):
    running = create(client, host[0], place.id).json()

    found = mine(client, host[0]).json()

    assert [(m["id"], m["state"]) for m in found] == [(running["id"], "live")]
