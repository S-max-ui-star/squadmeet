import time

import pyotp
import pytest
from fastapi import HTTPException
from sqlalchemy.orm.attributes import set_committed_value
from sqlmodel import select

from app.admin import set_admin
from app.auth import MFA_REQUIRED, check_totp, require_admin
from app.models import LoginSession, RecoveryCode, User
from tests.test_auth import PASSWORD, auth_header, register


def start_setup(client, token, password=PASSWORD):
    return client.post(
        "/api/auth/mfa/setup", json={"password": password}, headers=auth_header(token)
    )


def setup_mfa(client, token):
    response = start_setup(client, token)
    assert response.status_code == 200
    return pyotp.TOTP(response.json()["secret"])


def code_in(totp, steps):
    """The code of the time step `steps` away from now (negative = the past)."""
    return totp.at(time.time() + steps * totp.interval)


@pytest.fixture
def mfa_user(client):
    """A registered user with MFA on: (token, totp, recovery codes)."""
    body = register(client).json()
    totp = setup_mfa(client, body["token"])
    response = client.post(
        "/api/auth/mfa/enable",
        json={"code": code_in(totp, 0)},
        headers=auth_header(body["token"]),
    )
    assert response.status_code == 200
    assert response.json()["mfa_enabled"] is True
    return body["token"], totp, body["recovery_codes"]


def login(client, code=None):
    body = {"nickname": "Pingpong_Paula", "password": PASSWORD}
    if code is not None:
        body["code"] = code
    return client.post("/api/auth/login", json=body)


def test_setup_returns_secret_uri_and_qr_code(client):
    token = register(client).json()["token"]

    body = start_setup(client, token).json()

    assert body["otpauth_uri"].startswith("otpauth://totp/Squadmeet:Pingpong_Paula?")
    assert f"secret={body['secret']}" in body["otpauth_uri"]
    assert body["qr_code"].startswith("data:image/svg+xml")


def test_mfa_is_off_until_a_code_confirms_it(client):
    token = register(client).json()["token"]
    setup_mfa(client, token)

    assert client.get("/api/auth/me", headers=auth_header(token)).json()["mfa_enabled"] is False
    assert login(client).status_code == 200


def test_enable_rejects_a_wrong_code(client):
    token = register(client).json()["token"]
    totp = setup_mfa(client, token)
    wrong = f"{(int(code_in(totp, 0)) + 1) % 1_000_000:06d}"

    response = client.post("/api/auth/mfa/enable", json={"code": wrong}, headers=auth_header(token))

    assert response.status_code == 400


def test_enable_rejects_a_recovery_code(client):
    body = register(client).json()
    setup_mfa(client, body["token"])

    response = client.post(
        "/api/auth/mfa/enable",
        json={"code": body["recovery_codes"][0]},
        headers=auth_header(body["token"]),
    )

    assert response.status_code == 400


def test_login_with_mfa_asks_for_the_code(client, mfa_user):
    response = login(client)

    assert response.status_code == 401
    assert response.json()["detail"] == MFA_REQUIRED


def test_login_with_mfa_and_a_current_code(client, mfa_user):
    _, totp, _ = mfa_user

    # The enable step used the current code; the next one is still in the valid window.
    response = login(client, code_in(totp, 1))

    assert response.status_code == 200
    assert response.json()["user"]["mfa_enabled"] is True


def test_login_rejects_a_wrong_code(client, mfa_user):
    _, totp, _ = mfa_user
    wrong = f"{(int(code_in(totp, 1)) + 1) % 1_000_000:06d}"

    response = login(client, wrong)

    assert response.status_code == 401
    assert response.json()["detail"] == "Code falsch"


def test_login_rejects_an_old_code(client, mfa_user):
    _, totp, _ = mfa_user

    assert login(client, code_in(totp, -3)).status_code == 401


def test_a_code_works_only_once(client, mfa_user):
    _, totp, _ = mfa_user
    code = code_in(totp, 1)

    assert login(client, code).status_code == 200
    assert login(client, code).status_code == 401


def test_recovery_code_works_once_for_login(client, session, mfa_user):
    _, _, codes = mfa_user
    # Typed by hand: lower case, spaces instead of dashes.
    typed = codes[0].lower().replace("-", " ")

    assert login(client, typed).status_code == 200
    assert login(client, codes[0]).status_code == 401
    used = session.exec(select(RecoveryCode).where(RecoveryCode.used_at.is_not(None))).all()
    assert len(used) == 1


def test_a_code_works_only_once_even_with_a_stale_read(session, mfa_user):
    """Two requests at the same moment: both read the old mfa_last_step before either writes."""
    _, totp, _ = mfa_user
    user = session.exec(select(User).where(User.nickname == "Pingpong_Paula")).one()
    code = code_in(totp, 1)
    old_step = user.mfa_last_step

    assert check_totp(session, user, code) is True
    # The second request still has the value from before the first one wrote.
    set_committed_value(user, "mfa_last_step", old_step)
    assert check_totp(session, user, code) is False


def test_enable_logs_out_the_other_devices(client, session):
    token = register(client).json()["token"]
    other = login(client).json()["token"]
    totp = setup_mfa(client, token)

    response = client.post(
        "/api/auth/mfa/enable", json={"code": code_in(totp, 0)}, headers=auth_header(token)
    )

    assert response.status_code == 200
    assert client.get("/api/auth/me", headers=auth_header(token)).status_code == 200
    assert client.get("/api/auth/me", headers=auth_header(other)).status_code == 401
    user = session.exec(select(User).where(User.nickname == "Pingpong_Paula")).one()
    assert len(session.exec(select(LoginSession).where(LoginSession.user_id == user.id)).all()) == 1


def disable(client, token, code, password=PASSWORD):
    return client.post(
        "/api/auth/mfa/disable",
        json={"code": code, "password": password},
        headers=auth_header(token),
    )


def test_disable_needs_the_password(client, mfa_user):
    token, totp, _ = mfa_user

    response = disable(client, token, code_in(totp, 1), password="falsch123")

    assert response.status_code == 400
    assert response.json()["detail"] == "Passwort falsch"
    assert client.get("/api/auth/me", headers=auth_header(token)).json()["mfa_enabled"] is True


def test_disable_needs_a_valid_code(client, mfa_user):
    token, totp, _ = mfa_user

    wrong = disable(client, token, "000000")
    right = disable(client, token, code_in(totp, 1))

    assert wrong.status_code == 400
    assert right.status_code == 200
    assert right.json()["mfa_enabled"] is False
    assert login(client).status_code == 200


def test_setup_is_refused_while_mfa_is_on(client, mfa_user):
    token, _, _ = mfa_user

    assert start_setup(client, token).status_code == 409


def test_setup_needs_the_password(client):
    # A stolen session token alone must not turn MFA on: that would log out the user's other
    # devices and lock out a user without Recovery codes (review SCRUM-68).
    token = register(client).json()["token"]

    assert start_setup(client, token, password="falsches-passwort").status_code == 400
    no_password = client.post("/api/auth/mfa/setup", json={}, headers=auth_header(token))
    assert no_password.status_code == 422


def test_admin_without_mfa_is_blocked(client, session):
    register(client)
    user = set_admin(session, "pingpong_paula", True)

    with pytest.raises(HTTPException) as blocked:
        require_admin(user)

    assert blocked.value.status_code == 403
    assert "Zwei-Faktor" in blocked.value.detail


def test_admin_with_mfa_is_allowed(client, session, mfa_user):
    user = set_admin(session, "Pingpong_Paula", True)

    assert require_admin(user, session) is user
    me = client.get("/api/auth/me", headers=auth_header(mfa_user[0])).json()
    assert me["is_admin"] is True


def test_normal_user_is_not_an_admin(client, session, mfa_user):
    user = session.exec(select(User)).one()

    with pytest.raises(HTTPException) as blocked:
        require_admin(user)

    assert blocked.value.status_code == 403
    assert blocked.value.detail == "Nur für Admins"
