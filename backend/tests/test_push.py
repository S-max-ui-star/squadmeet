"""Web Push subscriptions and delivery (SCRUM-44)."""

import json
from datetime import UTC, datetime
from typing import get_args

from app.models import PushSubscription
from app.notification_text import NotificationKind, REASONS
from app.push_delivery import send_web_push
from app.vapid_keys import encoded, generate_pair
from py_vapid import Vapid
from sqlmodel import select
from tests.test_auth import auth_header
from tests.test_meetups import create, guest, host, join, later, place  # noqa: F401 (fixtures)


SUBSCRIPTION = {
    "endpoint": "https://push.example.test/send/one",
    "keys": {"p256dh": "public-browser-key", "auth": "browser-auth-secret"},
}


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


def test_new_notification_is_sent_to_each_subscription(client, session, place, host, guest, monkeypatch):
    sent = []
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("VAPID_SUBJECT", "mailto:test@squadmeet.example")
    monkeypatch.setattr("app.push_delivery.webpush", lambda **kwargs: sent.append(kwargs))
    session.add(
        PushSubscription(
            user_id=guest[1],
            endpoint=SUBSCRIPTION["endpoint"],
            p256dh="public-browser-key",
            auth="browser-auth-secret",
            created_at=datetime.now(UTC),
        )
    )
    place.address = "Karl-Heine-Straße 12–14, 04229 Leipzig"
    session.add(place)
    session.commit()
    meetup = create(client, host[0], place.id, starts_at=later(days=1)).json()
    join(client, guest[0], meetup["id"])

    response = client.post(f"/api/meetups/{meetup['id']}/cancel", headers=auth_header(host[0]))

    assert response.status_code == 200
    assert len(sent) == 1
    assert sent[0]["subscription_info"]["endpoint"] == SUBSCRIPTION["endpoint"]
    payload = json.loads(sent[0]["data"])
    assert payload["url"] == f"/platz/{place.id}#treffen-{meetup['id']}"
    assert payload["body"] == (
        "Pingpong_Paula hat das Treffen abgesagt: Tischtennis in der Karl-Heine-Straße"
    )


def test_expired_subscription_is_removed(session, guest, monkeypatch):
    class Gone(Exception):
        response = type("Response", (), {"status_code": 410})()

    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setattr("app.push_delivery.webpush", lambda **_kwargs: (_ for _ in ()).throw(Gone()))
    subscription = PushSubscription(
        user_id=guest[1],
        endpoint=SUBSCRIPTION["endpoint"],
        p256dh="public-browser-key",
        auth="browser-auth-secret",
        created_at=datetime.now(UTC),
    )
    session.add(subscription)
    session.commit()

    send_web_push(session, {guest[1]}, meetup_id=7, place_id=3, kind="meetup_cancelled", body="Test")
    session.commit()

    assert session.exec(select(PushSubscription)).all() == []
