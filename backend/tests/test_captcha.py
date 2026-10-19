"""Captcha and rate limits (SCRUM-27). The captcha is the fake from conftest.py."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from app import rate_limit
from app.auth import CAPTCHA_FAILED, CAPTCHA_REQUIRED, login_per_ip
from app.main import app
from app.models import User
from tests.conftest import CAPTCHA_OK
from tests.test_auth import PASSWORD, auth_header, register
from tests.test_mfa import code_in, disable, mfa_user, start_setup  # noqa: F401 (fixture)


def login(client, password=PASSWORD, **extra):
    body = {"nickname": "Pingpong_Paula", "password": password} | extra
    return client.post("/api/auth/login", json=body)


def fail_logins(client, times):
    for _ in range(times):
        assert login(client, password="falsches-passwort").status_code == 401


@pytest.mark.parametrize("token", [None, "", "falsch"])
def test_register_without_a_valid_captcha_is_rejected(client, session, token):
    response = register(client, turnstile_token=token)

    assert response.status_code == 400
    assert response.json()["detail"] == CAPTCHA_FAILED
    assert session.exec(select(User).where(User.nickname == "Pingpong_Paula")).first() is None


def test_captcha_config_sends_the_site_key(client, monkeypatch):
    monkeypatch.setenv("TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    assert client.get("/api/auth/captcha").json() == {"site_key": "1x00000000000000000000AA"}


def test_two_failed_logins_need_no_captcha(client):
    register(client)
    fail_logins(client, 2)

    assert login(client).status_code == 200


def test_after_three_failed_logins_login_needs_the_captcha(client):
    register(client)
    fail_logins(client, 3)

    # Even the right password does not help without the captcha.
    without = login(client)
    wrong_token = login(client, turnstile_token="falsch")
    with_token = login(client, turnstile_token=CAPTCHA_OK)

    assert without.status_code == 401
    assert without.json()["detail"] == CAPTCHA_REQUIRED
    assert wrong_token.json()["detail"] == CAPTCHA_REQUIRED
    assert with_token.status_code == 200


def test_a_login_resets_the_failed_logins(client, session):
    register(client)
    fail_logins(client, 3)
    assert login(client, turnstile_token=CAPTCHA_OK).status_code == 200

    user = session.exec(select(User).where(User.nickname == "Pingpong_Paula")).one()
    session.refresh(user)
    assert user.failed_logins == 0
    assert login(client).status_code == 200


def test_a_wrong_password_with_captcha_still_counts(client, session):
    register(client)
    fail_logins(client, 3)

    login(client, password="falsches-passwort", turnstile_token=CAPTCHA_OK)

    user = session.exec(select(User).where(User.nickname == "Pingpong_Paula")).one()
    session.refresh(user)
    assert user.failed_logins == 4


def test_an_unknown_nickname_gets_the_normal_answer(client):
    response = client.post("/api/auth/login", json={"nickname": "Niemand", "password": PASSWORD})

    assert response.status_code == 401
    assert response.json()["detail"] == "Nickname oder Passwort falsch"


def test_wrong_mfa_codes_count_as_failed_logins(client, mfa_user):
    for _ in range(3):
        assert login(client, code="000000").json()["detail"] == "Code falsch"

    assert login(client, code="000000").json()["detail"] == CAPTCHA_REQUIRED


def test_the_question_for_the_mfa_code_does_not_count(client, mfa_user):
    for _ in range(3):
        assert login(client).status_code == 401

    _, totp, _ = mfa_user
    assert login(client, code=code_in(totp, 1)).status_code == 200


def test_login_rate_limit_per_ip(client):
    register(client)
    for _ in range(login_per_ip.limit):
        assert login(client).status_code == 200

    blocked = login(client)
    other_ip = TestClient(app, client=("203.0.113.7", 50000))

    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    assert login(other_ip).status_code == 200


def test_login_rate_limit_ends_after_the_window(client, monkeypatch):
    register(client)
    now = 1000.0
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: now)
    for _ in range(login_per_ip.limit):
        login(client)
    assert login(client).status_code == 429

    now += 61

    assert login(client).status_code == 200


def test_mfa_disable_rate_limit_per_user(client, mfa_user):
    token, totp, _ = mfa_user
    for _ in range(5):
        assert disable(client, token, "000000").status_code == 400

    # The right password and code do not help until the window ends.
    response = disable(client, token, code_in(totp, 1))

    assert response.status_code == 429
    assert client.get("/api/auth/me", headers=auth_header(token)).json()["mfa_enabled"] is True


def test_mfa_setup_rate_limit_per_user(client):
    token = register(client).json()["token"]
    for _ in range(5):
        assert start_setup(client, token, password="falsches-passwort").status_code == 400

    # The right password does not help until the window ends.
    assert start_setup(client, token).status_code == 429


def test_login_rejects_a_too_long_password_or_nickname(client):
    register(client)

    assert login(client, password="x" * 129).status_code == 422
    assert client.post(
        "/api/auth/login", json={"nickname": "x" * 21, "password": PASSWORD}
    ).status_code == 422
