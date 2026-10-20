"""In-app Notifications for Meetup events (SCRUM-40)."""

from datetime import UTC, datetime, timedelta

from app.models import Notification

from tests.test_admin_places import admin, lock  # noqa: F401 (fixture)
from tests.test_auth import auth_header
from tests.test_contacts import block
from tests.test_meetups import (  # noqa: F401 (fixtures)
    cancel,
    change_time,
    create,
    guest,
    host,
    join,
    later,
    leave,
    place,
    third,
)


def notifications(client, token):
    return client.get("/api/notifications", headers=auth_header(token))


def kinds(client, token):
    return [item["kind"] for item in notifications(client, token).json()]


def test_cancel_notifies_current_participants_but_not_the_host_or_someone_who_left(
    client, session, place, host, guest, third
):
    place.address = "Karl-Heine-Straße 12–14, 04229 Leipzig, Ortsteil Plagwitz"
    session.add(place)
    session.commit()
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])
    join(client, third[0], meetup["id"])
    leave(client, third[0], meetup["id"])

    assert cancel(client, host[0], meetup["id"]).status_code == 200

    [notice] = notifications(client, guest[0]).json()
    assert notice["kind"] == "meetup_cancelled"
    assert notice["text"] == (
        "Pingpong_Paula hat das Treffen abgesagt: Tischtennis in der Karl-Heine-Straße"
    )
    assert (
        notice["meetup_id"],
        notice["place_id"],
        notice["place_name"],
        notice["place_address"],
        notice["read"],
    ) == (
        meetup["id"],
        place.id,
        place.name,
        place.address,
        False,
    )
    assert notifications(client, host[0]).json() == []
    assert notifications(client, third[0]).json() == []


def test_time_change_notifies_everyone_who_was_in_the_meetup(client, place, host, guest, third):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])
    join(client, third[0], meetup["id"])
    moved_to = datetime.fromisoformat(meetup["starts_at"]) + timedelta(hours=1)

    assert change_time(client, host[0], meetup["id"], moved_to.isoformat()).status_code == 200

    for token in (guest[0], third[0]):
        moved = next(n for n in notifications(client, token).json() if n["kind"] == "meetup_moved")
        assert moved["text"] == "Pingpong_Paula hat die Zeit geändert: Tischtennis"


def test_handover_notifies_the_new_host(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()
    join(client, guest[0], meetup["id"])

    leave(client, host[0], meetup["id"])

    [notice] = notifications(client, guest[0]).json()
    assert notice["kind"] == "host_handover"
    assert notice["text"] == (
        "Pingpong_Paula hat dir die Gastgeberrolle übergeben: Tischtennis"
    )


def test_ending_a_running_meetup_notifies_the_participants(client, place, host, guest):
    meetup = create(client, host[0], place.id).json()
    join(client, guest[0], meetup["id"])

    response = client.post(f"/api/meetups/{meetup['id']}/end", headers=auth_header(host[0]))

    assert response.status_code == 200
    [notice] = notifications(client, guest[0]).json()
    assert notice["text"] == "Pingpong_Paula hat das Treffen beendet: Tischtennis"


def test_locking_a_place_notifies_participants_of_called_off_meetups(
    client, place, host, guest, admin
):
    meetup = create(client, host[0], place.id, starts_at=later(hours=3)).json()
    join(client, guest[0], meetup["id"])

    assert lock(client, admin, place.id).status_code == 200

    assert kinds(client, guest[0]) == ["meetup_cancelled"]


def test_a_blocker_in_the_meetup_is_notified_when_the_blocked_user_joins(
    client, place, host, guest, third
):
    meetup = create(client, host[0], place.id).json()
    join(client, guest[0], meetup["id"])
    block(client, guest[0], "Mia_Matte")

    assert join(client, third[0], meetup["id"]).status_code == 201

    [notice] = notifications(client, guest[0]).json()
    assert notice["kind"] == "blocked_user_joined"
    assert notice["text"] == "Mia_Matte ist dem Treffen beigetreten: Tischtennis"
    assert notifications(client, host[0]).json() == []
    assert notifications(client, third[0]).json() == []


def test_tap_marks_only_the_users_notification_as_read(client, place, host, guest, third):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])
    join(client, third[0], meetup["id"])
    cancel(client, host[0], meetup["id"])
    [guest_notice] = notifications(client, guest[0]).json()

    assert client.post(
        f"/api/notifications/{guest_notice['id']}/read", headers=auth_header(guest[0])
    ).status_code == 204
    assert notifications(client, guest[0]).json()[0]["read"] is True
    assert client.post(
        f"/api/notifications/{guest_notice['id']}/read", headers=auth_header(third[0])
    ).status_code == 404
    assert notifications(client, third[0]).json()[0]["read"] is False


def test_delete_removes_only_the_users_own_notification(client, place, host, guest, third):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])
    join(client, third[0], meetup["id"])
    cancel(client, host[0], meetup["id"])
    [guest_notice] = notifications(client, guest[0]).json()

    assert client.delete(
        f"/api/notifications/{guest_notice['id']}", headers=auth_header(third[0])
    ).status_code == 404
    assert len(notifications(client, guest[0]).json()) == 1
    assert len(notifications(client, third[0]).json()) == 1

    assert client.delete(
        f"/api/notifications/{guest_notice['id']}", headers=auth_header(guest[0])
    ).status_code == 204
    assert notifications(client, guest[0]).json() == []
    assert len(notifications(client, third[0]).json()) == 1


def test_delete_all_removes_only_the_users_notifications(client, place, host, guest, third):
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])
    join(client, third[0], meetup["id"])
    cancel(client, host[0], meetup["id"])

    assert client.delete("/api/notifications", headers=auth_header(guest[0])).status_code == 204

    assert notifications(client, guest[0]).json() == []
    assert len(notifications(client, third[0]).json()) == 1


def test_notifications_are_newest_first(client, session, place, host, guest):
    meetup = create(client, host[0], place.id).json()
    old = datetime(2026, 10, 15, 8, tzinfo=UTC)
    session.add_all(
        [
            Notification(
                user_id=guest[1],
                meetup_id=meetup["id"],
                kind="meetup_cancelled",
                created_at=old,
            ),
            Notification(
                user_id=guest[1],
                meetup_id=meetup["id"],
                kind="host_handover",
                created_at=old + timedelta(minutes=1),
            ),
        ]
    )
    session.commit()

    assert kinds(client, guest[0]) == ["host_handover", "meetup_cancelled"]


def test_notifications_need_a_login(client):
    assert client.get("/api/notifications").status_code == 401
    assert client.delete("/api/notifications/1").status_code == 401
    assert client.delete("/api/notifications").status_code == 401
