"""Web Push subscriptions and delivery (SCRUM-44)."""

import json
import threading
from contextlib import nullcontext
from datetime import UTC, datetime
from typing import get_args

import pytest
from app.models import PushSubscription
from app.notification_text import NotificationKind, REASONS
from app.push_delivery import send_web_push
from app.vapid_keys import encoded, generate_pair
from py_vapid import Vapid
from sqlmodel import select
from tests.test_auth import auth_header
from tests.test_meetups import create, guest, host, join, later, place  # noqa: F401 (fixtures)


SUBSCRIPTION = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/one",
    "keys": {"p256dh": "public-browser-key", "auth": "browser-auth-secret"},
}


class Queue:
    """Stands in for the worker: keeps each job, so a test runs it when it wants."""

    def __init__(self):
        self.jobs = []

    def submit(self, fn, *args):
        self.jobs.append((fn, args))

    def run(self):
        for fn, args in self.jobs:
            fn(*args)
        self.jobs.clear()


@pytest.fixture
def queued(session, monkeypatch):
    queue = Queue()
    monkeypatch.setattr("app.push_delivery.worker", queue)
    # The worker opens its own session; in a test it must see the test's rows.
    monkeypatch.setattr("app.push_delivery.open_session", lambda: nullcontext(session))
    return queue


def add_subscription(session, user_id, endpoint=SUBSCRIPTION["endpoint"]):
    session.add(
        PushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh="public-browser-key",
            auth="browser-auth-secret",
            created_at=datetime.now(UTC),
        )
    )


def test_every_notification_kind_has_a_push_message():
    assert set(REASONS) == set(get_args(NotificationKind))


def test_config_is_disabled_without_vapid_keys(client, guest, monkeypatch):
    monkeypatch.delenv("VAPID_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)

    response = client.get("/api/push/config", headers=auth_header(guest[0]))

    assert response.status_code == 200
    assert response.json() == {"enabled": False, "public_key": None}


def test_generated_vapid_pair_matches():
    private_key, public_key = generate_pair()
    vapid = Vapid.from_string(private_key)
    public = vapid.public_key.public_numbers()
    point = b"\x04" + public.x.to_bytes(32, "big") + public.y.to_bytes(32, "big")

    assert encoded(point) == public_key


def test_user_can_store_replace_and_remove_a_browser_subscription(client, session, guest):
    headers = auth_header(guest[0])
    assert client.put("/api/push/subscription", json=SUBSCRIPTION, headers=headers).status_code == 204

    [stored] = session.exec(select(PushSubscription)).all()
    assert (stored.user_id, stored.endpoint, stored.p256dh, stored.auth) == (
        guest[1],
        SUBSCRIPTION["endpoint"],
        "public-browser-key",
        "browser-auth-secret",
    )

    changed = {**SUBSCRIPTION, "keys": {"p256dh": "new-key", "auth": "new-secret"}}
    assert client.put("/api/push/subscription", json=changed, headers=headers).status_code == 204
    assert session.exec(select(PushSubscription)).one().p256dh == "new-key"

    assert client.request(
        "DELETE", "/api/push/subscription", json={"endpoint": SUBSCRIPTION["endpoint"]}, headers=headers
    ).status_code == 204
    assert session.exec(select(PushSubscription)).all() == []


def test_subscription_routes_need_a_login(client):
    assert client.get("/api/push/config").status_code == 401
    assert client.put("/api/push/subscription", json=SUBSCRIPTION).status_code == 401


def test_subscription_rejects_non_https_and_local_endpoints(client, guest):
    headers = auth_header(guest[0])
    for endpoint in ("http://push.example.test/send", "https://127.0.0.1/internal"):
        body = SUBSCRIPTION | {"endpoint": endpoint}
        assert client.put("/api/push/subscription", json=body, headers=headers).status_code == 422


def test_new_notification_is_sent_to_each_subscription(
    client, session, place, host, guest, queued, monkeypatch
):
    sent = []
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("VAPID_SUBJECT", "mailto:test@squadmeet.example")
    monkeypatch.setattr("app.push_delivery.webpush", lambda **kwargs: sent.append(kwargs))
    add_subscription(session, guest[1])
    place.address = "Karl-Heine-Straße 12–14, 04229 Leipzig"
    session.add(place)
    session.commit()
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])

    response = client.post(f"/api/meetups/{meetup['id']}/cancel", headers=auth_header(host[0]))
    queued.run()

    assert response.status_code == 200
    assert len(sent) == 1
    assert sent[0]["subscription_info"]["endpoint"] == SUBSCRIPTION["endpoint"]
    payload = json.loads(sent[0]["data"])
    assert payload["url"] == f"/platz/{place.id}#treffen-{meetup['id']}"
    assert payload["body"] == (
        "Pingpong_Paula hat das Treffen abgesagt: Tischtennis in der Karl-Heine-Straße"
    )


def test_expired_subscription_is_removed(session, guest, queued, monkeypatch):
    class Gone(Exception):
        response = type("Response", (), {"status_code": 410})()

    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setattr("app.push_delivery.webpush", lambda **_kwargs: (_ for _ in ()).throw(Gone()))
    add_subscription(session, guest[1])
    session.commit()

    send_web_push(session, {guest[1]}, meetup_id=7, place_id=3, kind="meetup_cancelled", body="Test")
    session.commit()
    queued.run()

    assert session.exec(select(PushSubscription)).all() == []


def put_subscription(client, token, endpoint):
    body = SUBSCRIPTION | {"endpoint": endpoint}
    return client.put("/api/push/subscription", json=body, headers=auth_header(token))


def test_only_the_push_services_of_the_browsers_are_accepted(client, guest):
    for endpoint in (
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://web.push.apple.com/abc",
        "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ):
        assert put_subscription(client, guest[0], endpoint).status_code == 204
    for endpoint in (
        "https://push.example.test/send",
        "https://127.0.0.1.nip.io/x",
        "https://fcm.googleapis.com.attacker.example/x",
        "https://notfcm.googleapis.com/x",
    ):
        assert put_subscription(client, guest[0], endpoint).status_code == 422


def test_a_sixth_subscription_replaces_the_oldest(client, session, guest):
    for n in range(6):
        assert put_subscription(client, guest[0], f"{SUBSCRIPTION['endpoint']}{n}").status_code == 204

    stored = session.exec(select(PushSubscription.endpoint)).all()
    assert sorted(stored) == [f"{SUBSCRIPTION['endpoint']}{n}" for n in range(1, 6)]


def test_an_old_subscription_of_another_host_is_not_called(session, guest, queued, monkeypatch):
    sent = []
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setattr("app.push_delivery.webpush", lambda **kwargs: sent.append(kwargs))
    add_subscription(session, guest[1], endpoint="https://127.0.0.1.nip.io/x")
    session.commit()

    send_web_push(session, {guest[1]}, meetup_id=7, place_id=3, kind="meetup_cancelled", body="Test")
    session.commit()
    queued.run()

    assert sent == []


def test_no_push_before_the_commit_and_none_after_a_rollback(session, guest, queued, monkeypatch):
    sent = []
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setattr("app.push_delivery.webpush", lambda **kwargs: sent.append(kwargs))
    add_subscription(session, guest[1])
    session.commit()

    send_web_push(session, {guest[1]}, meetup_id=7, place_id=3, kind="meetup_cancelled", body="Test")
    with session.begin_nested():  # A savepoint (SCRUM-123, SCRUM-139) is not the commit.
        pass
    queued.run()
    assert sent == []

    session.rollback()
    session.commit()
    queued.run()
    assert sent == []


def test_a_failed_savepoint_keeps_the_push_of_the_transaction(session, guest, queued, monkeypatch):
    sent = []
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setattr("app.push_delivery.webpush", lambda **kwargs: sent.append(kwargs))
    add_subscription(session, guest[1])
    session.commit()

    send_web_push(session, {guest[1]}, meetup_id=7, place_id=3, kind="meetup_cancelled", body="Test")
    session.begin_nested().rollback()
    session.commit()
    queued.run()

    assert len(sent) == 1


def test_the_request_does_not_wait_for_the_push_services(
    client, session, place, host, guest, monkeypatch
):
    release, finished = threading.Event(), threading.Event()

    def slow_push_service(**_kwargs):
        release.wait(5)
        finished.set()

    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setattr("app.push_delivery.webpush", slow_push_service)
    add_subscription(session, guest[1])
    session.commit()
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])

    try:
        response = client.post(f"/api/meetups/{meetup['id']}/cancel", headers=auth_header(host[0]))
        assert response.status_code == 200
        # The answer came while the push service still holds the Push.
        assert not finished.is_set()
    finally:
        release.set()
    assert finished.wait(5)
