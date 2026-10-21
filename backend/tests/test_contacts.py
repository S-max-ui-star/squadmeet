"""Contacts and Block (SCRUM-32)."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import false
from sqlalchemy.exc import IntegrityError

from app import contacts as contacts_module
from app.models import ContactRequest, Meetup
from tests.test_auth import auth_header, register
from tests.test_meetups import (  # noqa: F401
    create,
    join,
    later,
    map_meetups,
    meetups_seen_by,
    people_now,
    place,
)


def user(client, nickname):
    body = register(client, nickname=nickname).json()
    return body["token"], body["user"]["id"]


@pytest.fixture
def paula(client):
    return user(client, "Pingpong_Paula")


@pytest.fixture
def karl(client):
    return user(client, "Korb_Karl")


@pytest.fixture
def mia(client):
    return user(client, "Mia_Matte")


def ask(client, token, nickname):
    return client.post(
        "/api/contacts/requests", json={"nickname": nickname}, headers=auth_header(token)
    )


def contacts(client, token):
    return client.get("/api/contacts", headers=auth_header(token)).json()


def answer(client, token, request_id, verb):
    return client.post(f"/api/contacts/requests/{request_id}/{verb}", headers=auth_header(token))


def block(client, token, nickname):
    return client.post("/api/blocks", json={"nickname": nickname}, headers=auth_header(token))


def nicknames(users):
    return [u["nickname"] for u in users]


# Contact requests


def test_ask_and_accept_makes_both_contacts(client, paula, karl):
    request_id = ask(client, paula[0], "Korb_Karl").json()["id"]

    assert nicknames(r["user"] for r in contacts(client, karl[0])["incoming"]) == ["Pingpong_Paula"]
    assert answer(client, karl[0], request_id, "accept").status_code == 200

    assert nicknames(contacts(client, paula[0])["contacts"]) == ["Korb_Karl"]
    assert nicknames(contacts(client, karl[0])["contacts"]) == ["Pingpong_Paula"]
    assert contacts(client, karl[0])["incoming"] == []


def test_the_nickname_must_match_exactly_but_not_its_case(client, paula, karl):
    assert ask(client, paula[0], "korb_karl").status_code == 201
    assert ask(client, paula[0], "Korb").status_code == 404


def test_no_request_to_oneself(client, paula):
    assert ask(client, paula[0], "Pingpong_Paula").status_code == 409


def test_no_duplicate_requests(client, paula, karl):
    ask(client, paula[0], "Korb_Karl")

    assert ask(client, paula[0], "Korb_Karl").status_code == 409


def test_a_request_back_accepts_the_open_one(client, paula, karl):
    ask(client, paula[0], "Korb_Karl")

    assert ask(client, karl[0], "Pingpong_Paula").status_code == 201

    assert nicknames(contacts(client, paula[0])["contacts"]) == ["Korb_Karl"]


def test_a_declined_request_shows_to_the_asker_who_may_ask_again(client, paula, karl):
    request_id = ask(client, paula[0], "Korb_Karl").json()["id"]
    answer(client, karl[0], request_id, "decline")

    [outgoing] = contacts(client, paula[0])["outgoing"]
    assert (outgoing["user"]["nickname"], outgoing["status"]) == ("Korb_Karl", "declined")
    assert contacts(client, karl[0])["incoming"] == []

    assert ask(client, paula[0], "Korb_Karl").status_code == 201
    assert len(contacts(client, karl[0])["incoming"]) == 1


def test_only_the_addressee_can_answer(client, paula, karl, mia):
    request_id = ask(client, paula[0], "Korb_Karl").json()["id"]

    assert answer(client, mia[0], request_id, "accept").status_code == 404
    assert answer(client, paula[0], request_id, "accept").status_code == 404


def test_either_side_can_remove_a_contact(client, paula, karl):
    request_id = ask(client, paula[0], "Korb_Karl").json()["id"]
    answer(client, karl[0], request_id, "accept")

    response = client.delete(f"/api/contacts/{paula[1]}", headers=auth_header(karl[0]))

    assert response.status_code == 204
    assert contacts(client, paula[0])["contacts"] == []


def test_contacts_need_a_login(client):
    assert client.get("/api/contacts").status_code == 401


# Block


def test_block_removes_the_contact_and_open_requests(client, paula, karl):
    request_id = ask(client, paula[0], "Korb_Karl").json()["id"]
    answer(client, karl[0], request_id, "accept")

    assert block(client, paula[0], "Korb_Karl").status_code == 201

    assert contacts(client, paula[0])["contacts"] == []
    assert contacts(client, karl[0])["contacts"] == []
    assert nicknames(contacts(client, paula[0])["blocked"]) == ["Korb_Karl"]


def test_a_request_to_a_blocking_user_is_rejected_neutrally(client, paula, karl):
    block(client, paula[0], "Korb_Karl")

    response = ask(client, karl[0], "Pingpong_Paula")

    assert response.status_code == 409
    assert response.json()["detail"] == "Anfrage nicht möglich"
    assert contacts(client, paula[0])["incoming"] == []


def test_unblock(client, paula, karl):
    block(client, paula[0], "Korb_Karl")

    assert client.delete(f"/api/blocks/{karl[1]}", headers=auth_header(paula[0])).status_code == 204
    assert contacts(client, paula[0])["blocked"] == []
    assert ask(client, karl[0], "Pingpong_Paula").status_code == 201


def test_meetup_list_names_contacts_who_host_or_join(client, place, paula, karl, mia):
    karl_request = ask(client, paula[0], "Korb_Karl").json()["id"]
    answer(client, karl[0], karl_request, "accept")
    mia_request = ask(client, paula[0], "Mia_Matte").json()["id"]
    answer(client, mia[0], mia_request, "accept")
    meetup = create(client, karl[0], place.id).json()
    join(client, mia[0], meetup["id"])

    [listed] = map_meetups(client, "now", paula[0]).json()["meetups"]

    assert [(contact["nickname"], contact["avatar"]) for contact in listed["contacts"]] == [
        ("Korb_Karl", "fox"),
        ("Mia_Matte", "fox"),
    ]


def test_guests_and_users_without_contacts_get_no_meetup_contacts(client, place, paula, karl):
    create(client, karl[0], place.id)

    [guest_view] = map_meetups(client, "now").json()["meetups"]
    [user_view] = map_meetups(client, "now", paula[0]).json()["meetups"]

    assert guest_view["contacts"] is None
    assert user_view["contacts"] == []


def test_a_blocked_former_contact_is_not_named_in_the_meetup_list(
    client, place, paula, karl, mia
):
    request_id = ask(client, paula[0], "Korb_Karl").json()["id"]
    answer(client, karl[0], request_id, "accept")
    meetup = create(client, mia[0], place.id).json()
    join(client, karl[0], meetup["id"])

    block(client, paula[0], "Korb_Karl")
    [listed] = map_meetups(client, "now", paula[0]).json()["meetups"]

    assert listed["contacts"] == []


def test_blocking_twice_is_fine(client, paula, karl):
    block(client, paula[0], "Korb_Karl")

    assert block(client, paula[0], "Korb_Karl").status_code == 201


# What a blocked user sees of Meetups


def test_a_blocked_user_does_not_see_meetups_the_blocker_hosts(client, place, paula, karl):
    create(client, paula[0], place.id, party_size=3)
    block(client, paula[0], "Korb_Karl")

    assert meetups_seen_by(client, karl[0], place.id) == []
    assert len(meetups_seen_by(client, paula[0], place.id)) == 1


def test_the_map_does_not_count_them_for_the_blocked_user(client, place, paula, karl):
    create(client, paula[0], place.id, party_size=3)
    block(client, paula[0], "Korb_Karl")

    assert people_now(client, place.id) == 3
    assert people_now(client, place.id, karl[0]) == 0


def test_the_time_filtered_map_hides_the_blockers_meetup(client, place, paula, karl):
    create(client, paula[0], place.id, party_size=3)
    block(client, paula[0], "Korb_Karl")

    hidden = map_meetups(client, "now", karl[0]).json()
    visible = map_meetups(client, "now", paula[0]).json()

    assert (hidden["places"], hidden["meetups"]) == ([], [])
    assert [meetup["party_size"] for meetup in visible["meetups"]] == [3]


def test_a_blocked_user_cannot_join_a_meetup_of_the_blocker(client, place, paula, karl):
    meetup = create(client, paula[0], place.id, starts_at=later(days=1)).json()
    block(client, paula[0], "Korb_Karl")

    assert join(client, karl[0], meetup["id"]).status_code == 404


def test_blocking_removes_the_join_from_the_blockers_meetups(client, place, paula, karl):
    meetup = create(client, paula[0], place.id, party_size=2).json()
    join(client, karl[0], meetup["id"], party_size=3)

    block(client, paula[0], "Korb_Karl")

    [listed] = meetups_seen_by(client, paula[0], place.id)
    assert (listed["people"], listed["participants"]) == (2, [])


def test_in_other_meetups_the_blocker_is_counted_but_not_named(client, place, paula, karl, mia):
    meetup = create(client, mia[0], place.id).json()
    join(client, paula[0], meetup["id"], party_size=2)
    block(client, paula[0], "Korb_Karl")

    [seen] = meetups_seen_by(client, karl[0], place.id)

    assert seen["participants"] == []
    assert seen["people"] == 3


def test_the_blocker_is_warned_when_a_blocked_user_is_in(client, place, paula, karl, mia):
    meetup = create(client, mia[0], place.id).json()
    join(client, paula[0], meetup["id"])
    block(client, paula[0], "Korb_Karl")
    assert meetups_seen_by(client, paula[0], place.id)[0]["blocked_user_in"] is False

    join(client, karl[0], meetup["id"])

    assert meetups_seen_by(client, paula[0], place.id)[0]["blocked_user_in"] is True
    assert meetups_seen_by(client, mia[0], place.id)[0]["blocked_user_in"] is False


def test_after_a_handover_the_blocked_user_stays_but_sees_no_host_name(
    client, session, place, paula, karl, mia
):
    meetup = create(client, mia[0], place.id, starts_at=later(days=1)).json()
    join(client, paula[0], meetup["id"])
    join(client, karl[0], meetup["id"])
    block(client, paula[0], "Korb_Karl")

    # Mia leaves: Paula joined first and becomes Host.
    client.delete(f"/api/meetups/{meetup['id']}/join", headers=auth_header(mia[0]))

    [seen] = meetups_seen_by(client, karl[0], place.id)
    assert seen["host"] is None
    assert meetups_seen_by(client, paula[0], place.id)[0]["blocked_user_in"] is True


def test_deleting_an_account_removes_its_contacts_and_blocks(client, paula, karl):
    request_id = ask(client, paula[0], "Korb_Karl").json()["id"]
    answer(client, karl[0], request_id, "accept")
    from tests.test_auth import PASSWORD

    client.post(
        "/api/auth/delete-account", json={"password": PASSWORD}, headers=auth_header(karl[0])
    )

    assert contacts(client, paula[0])["contacts"] == []


def test_an_ended_meetup_is_not_affected(client, session, place, paula, karl):
    # Written straight into the database: an old Meetup of Paula.
    now = datetime.now(UTC)
    session.add(
        Meetup(
            place_id=place.id,
            host_id=paula[1],
            party_size=1,
            starts_at=now - timedelta(hours=3),
            ends_at=now - timedelta(hours=1),
        )
    )
    session.commit()

    assert block(client, paula[0], "Korb_Karl").status_code == 201


def test_the_database_refuses_a_second_row_for_the_same_pair(client, session, paula, karl):
    ask(client, paula[0], "Korb_Karl")

    session.add(
        ContactRequest(
            requester_id=karl[1], addressee_id=paula[1], status="pending", updated_at=datetime.now(UTC)
        )
    )
    with pytest.raises(IntegrityError):
        session.flush()


def test_two_requests_at_the_same_moment_answer_409(client, paula, karl, monkeypatch):
    ask(client, paula[0], "Korb_Karl")
    # Karl's request does not see Paula's row, as if both were sent at the same moment.
    monkeypatch.setattr(contacts_module, "between", lambda a, b: false())

    response = ask(client, karl[0], "Pingpong_Paula")

    assert response.status_code == 409
    assert len(contacts(client, paula[0])["outgoing"]) == 1


def test_too_big_ids_are_not_found(client, paula):
    headers = auth_header(paula[0])
    big = 9_999_999_999
    assert client.post(f"/api/contacts/requests/{big}/accept", headers=headers).status_code == 404
    assert client.post(f"/api/contacts/requests/{big}/decline", headers=headers).status_code == 404
    assert client.delete(f"/api/contacts/requests/{big}", headers=headers).status_code == 404
    assert client.delete(f"/api/contacts/{big}", headers=headers).status_code == 404
    assert client.delete(f"/api/blocks/{big}", headers=headers).status_code == 404


def test_at_most_20_nickname_lookups_per_hour(client, paula, karl):
    """Ask again after a decline, unknown Nicknames and Blocks count together."""
    for _ in range(9):
        request_id = ask(client, paula[0], "Korb_Karl").json()["id"]
        answer(client, karl[0], request_id, "decline")
    for n in range(10):
        assert ask(client, paula[0], f"Niemand_{n}").status_code == 404
    assert block(client, paula[0], "Mia_Nobody").status_code == 404

    assert ask(client, paula[0], "Korb_Karl").status_code == 429
    assert block(client, paula[0], "Korb_Karl").status_code == 429
    # Another user has their own count.
    assert ask(client, karl[0], "Pingpong_Paula").status_code == 201
