"""Contact Notifications (SCRUM-43): a new Meetup notifies the Host's Contacts; everyone in a
Meetup can invite their Contacts. Only Contacts, never blocked users, never two Notifications
for one new Meetup."""

from datetime import UTC, datetime, timedelta

import pytest

from app.models import User
from tests.test_auth import auth_header, register
from tests.test_contacts import answer, ask, block
from tests.test_delete_account import delete_account
from tests.test_favorites import add_favorite
from tests.test_meetups import (  # noqa: F401 (fixtures)
    cancel,
    create,
    guest,
    host,
    join,
    later,
    leave,
    place,
    third,
)
from tests.test_notifications import kinds, notifications
from tests.test_series import create_series, slot


def befriend(client, a, b, b_nickname):
    """a asks b by Nickname, b accepts: they are Contacts."""
    request_id = ask(client, a[0], b_nickname).json()["id"]
    assert answer(client, b[0], request_id, "accept").status_code == 200


def invite(client, token, meetup_id, user_ids):
    return client.post(
        f"/api/meetups/{meetup_id}/invite", json={"user_ids": user_ids}, headers=auth_header(token)
    )


@pytest.fixture
def friends(client, host, guest):
    """Paula (host) and Karl (guest) are Contacts."""
    befriend(client, host, guest, "Korb_Karl")


@pytest.fixture
def fourth(client):
    body = register(client, nickname="Netz_Nora").json()
    return body["token"], body["user"]["id"]


# A new Meetup notifies the Contacts


def test_a_now_meetup_notifies_the_contacts_with_the_hosts_nickname(
    client, place, host, guest, third, friends
):
    meetup = create(client, host[0], place.id).json()

    [notice] = notifications(client, guest[0]).json()
    assert notice["kind"] == "contact_meetup_created"
    assert notice["meetup_id"] == meetup["id"]
    assert notice["actor_nickname"] == "Pingpong_Paula"
    # Not a Contact, and not the Host.
    assert kinds(client, third[0]) == []
    assert kinds(client, host[0]) == []


def test_a_later_meetup_notifies_the_contacts(client, place, host, guest, friends):
    create(client, host[0], place.id, starts_at=later(days=2))

    assert kinds(client, guest[0]) == ["contact_meetup_created"]


def test_a_pending_or_declined_request_is_not_a_contact(client, place, host, guest, third):
    ask(client, host[0], "Korb_Karl")
    request_id = ask(client, host[0], "Mia_Matte").json()["id"]
    answer(client, third[0], request_id, "decline")

    create(client, host[0], place.id)

    assert kinds(client, guest[0]) == []
    assert kinds(client, third[0]) == []


def test_blocked_users_are_never_notified(client, place, host, guest, third, friends):
    # Karl blocks Paula (this also ends the Contact), Mia is Contact but blocked by Paula.
    befriend(client, host, third, "Mia_Matte")
    block(client, guest[0], "Pingpong_Paula")
    block(client, host[0], "Mia_Matte")

    create(client, host[0], place.id)

    assert kinds(client, guest[0]) == []
    assert kinds(client, third[0]) == []


def test_a_contact_with_the_place_as_favorite_gets_only_one_notification(
    client, place, host, guest, third, friends
):
    add_favorite(client, guest[0], place.id)
    add_favorite(client, third[0], place.id)

    create(client, host[0], place.id)

    assert kinds(client, guest[0]) == ["contact_meetup_created"]
    # A Favorite owner who is not a Contact still gets the Favorite Notification.
    assert kinds(client, third[0]) == ["favorite_meetup_created"]


def test_a_series_notifies_the_contacts_once(client, place, host, guest, friends):
    weekday = (datetime.now(UTC) + timedelta(days=2)).weekday()

    response = create_series(client, host[0], place.id, [slot(weekday), slot((weekday + 3) % 7)])

    assert response.status_code == 201
    assert kinds(client, guest[0]) == ["contact_meetup_created"]


def test_a_series_contact_with_favorite_gets_one_for_the_first_date(
    client, place, host, guest, friends
):
    add_favorite(client, guest[0], place.id)
    weekday = (datetime.now(UTC) + timedelta(days=2)).weekday()

    create_series(client, host[0], place.id, [slot(weekday)])

    found = kinds(client, guest[0])
    # The first date: the Contact Notification; the other dates: the Favorite rule (SCRUM-41).
    assert found.count("contact_meetup_created") == 1
    assert len(found) == len(set(n["meetup_id"] for n in notifications(client, guest[0]).json()))


# Invitations


def test_the_host_invites_a_contact(client, place, host, guest, friends):
    meetup = create(client, host[0], place.id, starts_at=later(hours=3)).json()

    response = invite(client, host[0], meetup["id"], [guest[1]])

    assert response.status_code == 200
    assert response.json() == {"invited": 1}
    invitation = notifications(client, guest[0]).json()[0]
    assert invitation["kind"] == "meetup_invitation"
    assert invitation["meetup_id"] == meetup["id"]
    assert invitation["place_id"] == place.id
    assert invitation["actor_nickname"] == "Pingpong_Paula"


def test_a_participant_invites_their_own_contact(client, place, host, guest, third, friends):
    befriend(client, guest, third, "Mia_Matte")
    meetup = create(client, host[0], place.id).json()
    join(client, guest[0], meetup["id"])

    assert invite(client, guest[0], meetup["id"], [third[1]]).json() == {"invited": 1}
    [notice] = notifications(client, third[0]).json()
    assert notice["actor_nickname"] == "Korb_Karl"


def test_someone_not_in_the_meetup_cannot_invite(client, place, host, guest, third, friends):
    befriend(client, guest, third, "Mia_Matte")
    meetup = create(client, host[0], place.id).json()

    assert invite(client, guest[0], meetup["id"], [third[1]]).status_code == 403


def test_only_contacts_can_be_invited(client, place, host, guest, third, friends):
    meetup = create(client, host[0], place.id).json()

    response = invite(client, host[0], meetup["id"], [guest[1], third[1]])

    assert response.status_code == 422
    assert kinds(client, guest[0]) == ["contact_meetup_created"]
    assert kinds(client, third[0]) == []


def test_no_second_invitation_and_none_for_someone_already_in(
    client, place, host, guest, third, friends
):
    befriend(client, host, third, "Mia_Matte")
    meetup = create(client, host[0], place.id).json()
    join(client, third[0], meetup["id"])

    assert invite(client, host[0], meetup["id"], [guest[1], third[1]]).json() == {"invited": 1}
    assert invite(client, host[0], meetup["id"], [guest[1]]).json() == {"invited": 0}
    assert kinds(client, guest[0]).count("meetup_invitation") == 1
    assert "meetup_invitation" not in kinds(client, third[0])


def test_a_contact_blocked_with_the_host_is_not_invited(
    client, place, host, guest, third, fourth, friends
):
    # Karl joins Paula's Meetup and invites Nora, whom Paula blocked.
    befriend(client, guest, fourth, "Netz_Nora")
    meetup = create(client, host[0], place.id).json()
    join(client, guest[0], meetup["id"])
    block(client, host[0], "Netz_Nora")

    assert invite(client, guest[0], meetup["id"], [fourth[1]]).json() == {"invited": 0}
    assert kinds(client, fourth[0]) == []


def already_in_or_invited(client, token, meetup_id):
    return client.get(f"/api/meetups/{meetup_id}/invite", headers=auth_header(token))


def test_the_chooser_learns_which_contacts_are_already_in_or_invited(
    client, place, host, guest, third, fourth, friends
):
    # SCRUM-84: Paula's Contacts are Karl (invited), Mia (joined) and Nora (neither).
    befriend(client, host, third, "Mia_Matte")
    befriend(client, host, fourth, "Netz_Nora")
    meetup = create(client, host[0], place.id).json()
    join(client, third[0], meetup["id"])
    invite(client, host[0], meetup["id"], [guest[1]])

    response = already_in_or_invited(client, host[0], meetup["id"])

    assert response.status_code == 200
    assert sorted(response.json()["user_ids"]) == sorted([guest[1], third[1]])


def test_the_chooser_names_only_the_viewers_own_contacts(
    client, place, host, guest, third, fourth, friends
):
    # Karl joins and invites his Contact Nora; Mia joined too, but she is not Karl's Contact.
    befriend(client, guest, fourth, "Netz_Nora")
    meetup = create(client, host[0], place.id).json()
    join(client, guest[0], meetup["id"])
    join(client, third[0], meetup["id"])
    invite(client, guest[0], meetup["id"], [fourth[1]])

    # The Host Paula is Karl's Contact and is in the Meetup.
    assert sorted(already_in_or_invited(client, guest[0], meetup["id"]).json()["user_ids"]) == sorted(
        [host[1], fourth[1]]
    )


def test_someone_not_in_the_meetup_cannot_see_who_is_invited(
    client, place, host, guest, friends
):
    meetup = create(client, host[0], place.id).json()

    assert already_in_or_invited(client, guest[0], meetup["id"]).status_code == 403


def test_no_invitation_to_a_cancelled_meetup(client, place, host, guest, friends):
    meetup = create(client, host[0], place.id, starts_at=later(hours=3)).json()
    cancel(client, host[0], meetup["id"])

    assert invite(client, host[0], meetup["id"], [guest[1]]).status_code == 409


def test_the_invitation_can_be_accepted_with_ich_komme_mit(client, place, host, guest, friends):
    meetup = create(client, host[0], place.id).json()
    invite(client, host[0], meetup["id"], [guest[1]])

    assert join(client, guest[0], meetup["id"]).status_code == 201


def test_invite_is_an_action_for_everyone_in_the_meetup(client, place, host, guest, third):
    meetup = create(client, host[0], place.id).json()
    join(client, guest[0], meetup["id"])

    def actions(token):
        found = client.get(f"/api/places/{place.id}/meetups", headers=auth_header(token)).json()
        return next(m["actions"] for m in found if m["id"] == meetup["id"])

    assert "invite" in actions(host[0])
    assert "invite" in actions(guest[0])
    assert "invite" not in actions(third[0])


def test_after_the_inviters_account_delete_the_invitation_has_no_name(
    client, session, place, host, guest, friends
):
    meetup = create(client, host[0], place.id).json()
    invite(client, host[0], meetup["id"], [guest[1]])
    join(client, guest[0], meetup["id"])

    # Paula deletes her account; Karl gets the Meetup, so its Notifications stay.
    assert delete_account(client, host[0]).status_code == 204

    session.expire_all()
    assert session.get(User, host[1]) is None
    found = notifications(client, guest[0]).json()
    assert {"contact_meetup_created", "meetup_invitation"} <= {n["kind"] for n in found}
    assert all(n["actor_nickname"] is None for n in found)
