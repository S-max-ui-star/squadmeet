"""Missing Equipment in Notifications (SCRUM-172): a Notification that asks the reader to come
says what is still missing when it is made. No Notification is sent only because of
Equipment."""

import json

import pytest

from app.equipment import missing_text
from tests.test_auth import auth_header
from tests.test_contact_notifications import befriend, friends, invite  # noqa: F401 (fixture)
from tests.test_equipment import change, join_with
from tests.test_favorites import add_favorite
from tests.test_meetups import create, guest, host, later, place, third  # noqa: F401 (fixtures)
from tests.test_notifications import kinds, notifications
from tests.test_push import add_subscription, queued  # noqa: F401 (fixture)

NEED_2_RACKETS_AND_BALLS = [
    {"item": "rackets", "count": 2, "kind": "need"},
    {"item": "balls", "kind": "need"},
]


def texts(client, token):
    return [item["text"] for item in notifications(client, token).json()]


@pytest.mark.parametrize(
    ("activity_type", "short", "text"),
    [
        ("table_tennis", {"rackets": 2, "balls": 1}, "2 Schläger, Bälle"),
        ("football", {"cones": 1}, "Hütchen/Mini-Tore"),
        ("table_tennis", {}, None),
    ],
)
def test_missing_text_names_the_items_with_a_count_only_where_people_count(
    activity_type, short, text
):
    assert missing_text(activity_type, short) == text


def test_a_new_meetup_tells_the_contacts_what_is_missing(client, place, host, guest, friends):
    create(client, host[0], place.id, equipment=NEED_2_RACKETS_AND_BALLS)

    assert texts(client, guest[0]) == [
        "Pingpong_Paula hat ein Treffen erstellt: Tischtennis · Fehlt noch: 2 Schläger, Bälle"
    ]


def test_the_favorite_notification_says_it_too(client, place, host, third):
    add_favorite(client, third[0], place.id)

    create(client, host[0], place.id, equipment=[{"item": "net", "kind": "need"}])

    assert texts(client, third[0]) == [
        "Pingpong_Paula hat ein Treffen erstellt: Tischtennis · Fehlt noch: Netz"
    ]


def test_nothing_missing_keeps_the_text_as_before(client, place, host, guest, friends):
    create(client, host[0], place.id, equipment=[{"item": "rackets", "count": 2}])

    assert texts(client, guest[0]) == ["Pingpong_Paula hat ein Treffen erstellt: Tischtennis"]


def test_the_text_keeps_what_was_missing_when_it_was_sent(client, place, host, guest, friends):
    meetup = create(client, host[0], place.id, equipment=NEED_2_RACKETS_AND_BALLS).json()

    # Karl brings all of it later: the Notification he already has does not change.
    join_with(client, guest[0], meetup["id"], [{"item": "rackets", "count": 2}, {"item": "balls"}])

    assert texts(client, guest[0]) == [
        "Pingpong_Paula hat ein Treffen erstellt: Tischtennis · Fehlt noch: 2 Schläger, Bälle"
    ]


def test_an_invitation_says_what_is_missing_at_the_invite(
    client, place, host, guest, third, friends
):
    befriend(client, host, third, "Mia_Matte")
    meetup = create(client, host[0], place.id, starts_at=later(hours=3)).json()
    join_with(client, guest[0], meetup["id"], [{"item": "rackets", "count": 1, "kind": "need"}])

    invite(client, host[0], meetup["id"], [third[1]])

    assert texts(client, third[0])[0] == (
        "Pingpong_Paula hat dich eingeladen: Tischtennis · Fehlt noch: 1 Schläger"
    )


def test_a_cancel_does_not_say_what_is_missing(client, place, host, guest):
    meetup = create(
        client, host[0], place.id, starts_at=later(days=1), equipment=NEED_2_RACKETS_AND_BALLS
    ).json()
    assert join_with(client, guest[0], meetup["id"], []).status_code == 201

    response = client.post(f"/api/meetups/{meetup['id']}/cancel", headers=auth_header(host[0]))

    assert response.status_code == 200

    assert texts(client, guest[0]) == ["Pingpong_Paula hat das Treffen abgesagt: Tischtennis"]


def test_a_change_of_equipment_sends_no_notification(client, place, host, guest, friends):
    meetup = create(client, host[0], place.id).json()

    change(client, host[0], meetup["id"], NEED_2_RACKETS_AND_BALLS)

    assert kinds(client, guest[0]) == ["contact_meetup_created"]


def test_the_push_says_what_is_missing(
    client, session, place, host, guest, friends, queued, monkeypatch
):
    sent = []
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("VAPID_SUBJECT", "mailto:test@squadmeet.example")
    monkeypatch.setattr("app.push_delivery.webpush", lambda **kwargs: sent.append(kwargs))
    add_subscription(session, guest[1])
    session.commit()

    create(client, host[0], place.id, equipment=NEED_2_RACKETS_AND_BALLS)
    queued.run()

    [push] = sent
    assert json.loads(push["data"])["body"] == (
        "Pingpong_Paula hat ein Treffen erstellt: Tischtennis · Fehlt noch: 2 Schläger, Bälle"
    )
