"""Password reset with a Recovery code or MFA code, and new Recovery codes (SCRUM-33)."""

import pytest
from sqlmodel import select

from app.auth import CAPTCHA_FAILED, RECOVERY_CODE_COUNT
from app.models import LoginSession, User
from tests.conftest import CAPTCHA_OK
from tests.test_auth import PASSWORD, auth_header, register
from tests.test_mfa import code_in, mfa_user, setup_mfa  # noqa: F401 (fixture)

NEW_PASSWORD = "ganz-neues-passwort"
WRONG_ANSWER = "Nickname oder Code falsch"


def reset(client, code, **changes):
    body = {
        "nickname": "Pingpong_Paula",
        "code": code,
        "new_password": NEW_PASSWORD,
        "turnstile_token": CAPTCHA_OK,
    }
    return client.post("/api/auth/password-reset", json=body | changes)


def login_with(client, password, code=None):
    body = {"nickname": "Pingpong_Paula", "password": password}
    if code is not None:
        body["code"] = code
    return client.post("/api/auth/login", json=body)


def test_reset_with_a_recovery_code(client):
    code = register(client).json()["recovery_codes"][0]

    response = reset(client, code)

    assert response.status_code == 200
    assert client.get("/api/auth/me", headers=auth_header(response.json()["token"])).status_code == 200
    assert login_with(client, NEW_PASSWORD).status_code == 200
    assert login_with(client, PASSWORD).status_code == 401


def test_the_recovery_code_may_be_typed_by_hand(client):
    code = register(client).json()["recovery_codes"][0]

    assert reset(client, code.lower().replace("-", " ")).status_code == 200


def test_a_used_recovery_code_is_rejected(client):
    code = register(client).json()["recovery_codes"][0]
    assert reset(client, code).status_code == 200

    response = reset(client, code, new_password="noch-ein-passwort")

    assert response.status_code == 400
    assert response.json()["detail"] == WRONG_ANSWER
    assert login_with(client, NEW_PASSWORD).status_code == 200


def test_a_recovery_code_of_another_user_is_rejected(client):
    register(client)
    other_code = register(client, nickname="Basket_Ben").json()["recovery_codes"][0]

    response = reset(client, other_code)

    assert response.status_code == 400
    assert response.json()["detail"] == WRONG_ANSWER


def test_an_unknown_nickname_gets_the_same_answer(client):
    code = register(client).json()["recovery_codes"][0]

    response = reset(client, code, nickname="Niemand")

    assert response.status_code == 400
    assert response.json()["detail"] == WRONG_ANSWER


def test_reset_ends_all_old_sessions(client, session):
    body = register(client).json()
    second = login_with(client, PASSWORD).json()["token"]

    new_token = reset(client, body["recovery_codes"][0]).json()["token"]

    for old in (body["token"], second):
        assert client.get("/api/auth/me", headers=auth_header(old)).status_code == 401
    user = session.exec(select(User).where(User.nickname == "Pingpong_Paula")).one()
    assert len(session.exec(select(LoginSession).where(LoginSession.user_id == user.id)).all()) == 1
    assert client.get("/api/auth/me", headers=auth_header(new_token)).status_code == 200


@pytest.mark.parametrize("token", [None, "", "falsch"])
def test_reset_needs_the_captcha(client, token):
    code = register(client).json()["recovery_codes"][0]

    response = reset(client, code, turnstile_token=token)

    assert response.status_code == 400
    assert response.json()["detail"] == CAPTCHA_FAILED
    # The code was not used up.
    assert reset(client, code).status_code == 200


def test_reset_needs_a_valid_new_password(client):
    code = register(client).json()["recovery_codes"][0]

    assert reset(client, code, new_password="kurz").status_code == 422
    assert reset(client, code).status_code == 200


def test_reset_with_the_mfa_code(client, mfa_user):  # noqa: F811
    _, totp, _ = mfa_user

    # The step after: enabling MFA used the current code.
    response = reset(client, code_in(totp, 1))

    assert response.status_code == 200
    assert response.json()["user"]["mfa_enabled"] is True


def test_an_mfa_code_is_not_enough_while_mfa_is_off(client):
    token = register(client).json()["token"]
    # Set up, but not confirmed: MFA is still off.
    totp = setup_mfa(client, token)

    response = reset(client, code_in(totp, 1))

    assert response.status_code == 400
    assert response.json()["detail"] == WRONG_ANSWER


def test_reset_clears_the_failed_logins(client, session):
    code = register(client).json()["recovery_codes"][0]
    for _ in range(3):
        assert login_with(client, "falsches-passwort").status_code == 401

    assert reset(client, code).status_code == 200

    assert session.exec(select(User).where(User.nickname == "Pingpong_Paula")).one().failed_logins == 0


def test_reset_rate_limit_per_ip(client):
    register(client)
    for _ in range(10):
        assert reset(client, "AAAA-AAAA-AAAA-AAAA").status_code == 400

    assert reset(client, "AAAA-AAAA-AAAA-AAAA").status_code == 429


def new_codes(client, token, password=PASSWORD, code=None):
    body = {"password": password} | ({"code": code} if code is not None else {})
    return client.post("/api/auth/recovery-codes", json=body, headers=auth_header(token))


def test_new_recovery_codes_replace_the_old_set(client):
    body = register(client).json()

    response = new_codes(client, body["token"])

    assert response.status_code == 200
    codes = response.json()["recovery_codes"]
    assert len(codes) == RECOVERY_CODE_COUNT
    assert set(codes).isdisjoint(body["recovery_codes"])
    assert reset(client, body["recovery_codes"][1]).status_code == 400
    assert reset(client, codes[0]).status_code == 200


def test_new_recovery_codes_need_the_password(client):
    body = register(client).json()

    response = new_codes(client, body["token"], password="falsches-passwort")

    assert response.status_code == 400
    assert reset(client, body["recovery_codes"][0]).status_code == 200


def test_new_recovery_codes_need_login(client):
    response = client.post("/api/auth/recovery-codes", json={"password": PASSWORD})

    assert response.status_code == 401


def test_new_recovery_codes_need_a_code_when_mfa_is_on(client, mfa_user):  # noqa: F811
    token, totp, _ = mfa_user

    assert new_codes(client, token).status_code == 400
    assert new_codes(client, token, code="000000").status_code == 400
    assert new_codes(client, token, code=code_in(totp, 1)).status_code == 200


def test_new_recovery_codes_rate_limit_per_user(client):
    token = register(client).json()["token"]
    for _ in range(5):
        assert new_codes(client, token, password="falsches-passwort").status_code == 400

    assert new_codes(client, token).status_code == 429
