from datetime import UTC, datetime, timedelta

from sqlmodel import select

from app.auth import RECOVERY_CODE_COUNT, sha256
from app.models import LoginSession, RecoveryCode, User
from tests.conftest import CAPTCHA_OK

PASSWORD = "richtig-langes-passwort"


def register(client, **changes):
    body = {
        "nickname": "Pingpong_Paula",
        "password": PASSWORD,
        "avatar": "fox",
        "is_adult": True,
        "turnstile_token": CAPTCHA_OK,
    }
    return client.post("/api/auth/register", json=body | changes)


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_register_returns_token_and_recovery_codes(client):
    response = register(client)

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["nickname"] == "Pingpong_Paula"
    assert body["user"]["avatar"] == "fox"
    assert len(body["recovery_codes"]) == RECOVERY_CODE_COUNT
    assert client.get("/api/auth/me", headers=auth_header(body["token"])).status_code == 200


def test_password_and_recovery_codes_are_stored_only_as_hashes(client, session):
    codes = register(client).json()["recovery_codes"]

    # Only this test's user: a local database may hold other accounts.
    user = session.exec(select(User).where(User.nickname == "Pingpong_Paula")).one()
    assert PASSWORD not in user.password_hash
    assert user.password_hash.startswith("$argon2")
    stored = session.exec(
        select(RecoveryCode.code_hash).where(RecoveryCode.user_id == user.id)
    ).all()
    assert len(stored) == RECOVERY_CODE_COUNT
    assert not set(codes) & set(stored)


def test_duplicate_nickname_is_rejected(client):
    register(client)

    response = register(client, nickname="pingpong_paula")

    assert response.status_code == 409


def test_missing_adult_checkbox_is_rejected(client):
    assert register(client, is_adult=False).status_code == 422

    body = {"nickname": "Pingpong_Paula", "password": PASSWORD, "avatar": "fox"}
    body["turnstile_token"] = CAPTCHA_OK
    assert client.post("/api/auth/register", json=body).status_code == 422


def test_unknown_avatar_is_rejected(client):
    assert register(client, avatar="unicorn").status_code == 422


def test_login_returns_token(client):
    register(client)

    response = client.post(
        "/api/auth/login", json={"nickname": "pingpong_paula", "password": PASSWORD}
    )

    assert response.status_code == 200
    token = response.json()["token"]
    me = client.get("/api/auth/me", headers=auth_header(token))
    assert me.json()["nickname"] == "Pingpong_Paula"


def test_wrong_password_is_rejected(client):
    register(client)

    response = client.post(
        "/api/auth/login", json={"nickname": "Pingpong_Paula", "password": "falsches-passwort"}
    )

    assert response.status_code == 401


def test_protected_route_rejects_request_without_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=auth_header("ausgedacht")).status_code == 401


def test_logout_ends_the_session(client):
    token = register(client).json()["token"]

    assert client.post("/api/auth/logout", headers=auth_header(token)).status_code == 204
    assert client.get("/api/auth/me", headers=auth_header(token)).status_code == 401


def expire_all_sessions(session):
    for login in session.exec(select(LoginSession)).all():
        login.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    session.commit()


def test_an_expired_session_is_rejected(client, session):
    token = register(client).json()["token"]
    expire_all_sessions(session)

    assert client.get("/api/auth/me", headers=auth_header(token)).status_code == 401


def test_a_login_deletes_expired_sessions(client, session):
    # The privacy page says a session ends after 30 days; the row must not stay (review SCRUM-68).
    old = register(client).json()["token"]
    expire_all_sessions(session)

    new = client.post(
        "/api/auth/login", json={"nickname": "Pingpong_Paula", "password": PASSWORD}
    ).json()["token"]

    hashes = [s.token_hash for s in session.exec(select(LoginSession)).all()]
    assert hashes == [sha256(new)]
    assert sha256(old) not in hashes
