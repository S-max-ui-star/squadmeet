"""Audit log (SCRUM-66): who changed which row, and when."""

import json
from datetime import UTC, datetime, time, timedelta

import pyotp
from sqlalchemy import event
from sqlmodel import select

from app.models import AuditLog, Place, User
from app.osm_import import load
from tests.test_admin_places import admin, later, lock  # noqa: F401 (fixture)
from tests.test_auth import PASSWORD, auth_header, register
from tests.test_contacts import ask, answer, block, user
from tests.test_delete_account import delete_account
from tests.test_meetups import create, host, join, leave, place  # noqa: F401 (fixtures)
from tests.test_mfa import code_in
from tests.test_osm_import import row, snapshot
from tests.test_place_reports import dismiss, report
from tests.test_ratings import rate
from tests.test_suggestions import confirm, suggest, user_token


def audit_rows(session, entity=None, entity_id=None, action=None):
    query = select(AuditLog).order_by(AuditLog.id)
    if action is not None:
        query = query.where(AuditLog.action == action)
    if entity is not None:
        query = query.where(AuditLog.entity == entity)
    if entity_id is not None:
        query = query.where(AuditLog.entity_id == entity_id)
    return session.exec(query).all()


def actions(rows):
    return [(r.entity, r.action) for r in rows]


def after(session, rows_before):
    """The audit rows written since `rows_before` was read."""
    last = rows_before[-1].id if rows_before else 0
    return [r for r in audit_rows(session) if r.id > last]


def test_an_insert_records_the_row_and_the_user(client, session, place, host):  # noqa: F811
    token, user_id = host

    meetup_id = create(client, token, place.id).json()["id"]

    [entry] = audit_rows(session, "meetup", meetup_id)
    assert (entry.action, entry.actor_id, entry.actor_kind) == ("insert", user_id, "user")
    assert entry.changes["host_id"] == user_id
    assert entry.changes["place_id"] == place.id
    assert entry.occurred_at is not None


def test_register_records_the_new_user_as_actor(client, session):
    user_id = register(client).json()["user"]["id"]

    [entry] = audit_rows(session, "app_user", user_id)
    assert (entry.action, entry.actor_id, entry.actor_kind) == ("insert", user_id, "user")
    assert entry.changes["nickname"] == "Pingpong_Paula"


def test_an_update_stores_only_the_changed_fields(client, session, place, admin):  # noqa: F811
    admin_id = client.get("/api/auth/me", headers=auth_header(admin)).json()["id"]

    lock(client, admin, place.id)

    [entry] = audit_rows(session, "place", place.id, "update")
    assert (entry.action, entry.actor_id, entry.actor_kind) == ("update", admin_id, "admin")
    assert list(entry.changes) == ["locked_at"]
    old, new = entry.changes["locked_at"]
    assert old is None
    assert datetime.fromisoformat(new) <= datetime.now(UTC)


def test_a_delete_records_the_old_row(client, session, place, host):  # noqa: F811
    token, _ = host
    meetup_id = create(client, token, place.id).json()["id"]
    karl_token, karl_id = user(client, "Korb_Karl")
    join(client, karl_token, meetup_id, party_size=3)

    leave(client, karl_token, meetup_id)

    entries = [r for r in audit_rows(session, "meetup_join") if r.action == "delete"]
    assert len(entries) == 1
    assert (entries[0].actor_id, entries[0].actor_kind) == (karl_id, "user")
    assert entries[0].changes["party_size"] == 3
    assert entries[0].changes["user_id"] == karl_id


def test_all_rows_of_one_request_have_one_time(client, session, place, host, admin):  # noqa: F811
    token, _ = host
    later(client, token, place.id)
    before = audit_rows(session)

    # Lock also cancels the later Meetup: two rows from one request.
    lock(client, admin, place.id)

    rows = after(session, before)
    assert sorted(actions(rows)) == [("meetup", "update"), ("place", "update")]
    assert len({r.occurred_at for r in rows}) == 1


SECRETS = ("password_hash", "mfa_secret", "mfa_last_step", "code_hash", "token_hash")


def test_secrets_never_appear_in_the_log(client, session):
    body = register(client).json()
    token = body["token"]
    headers = auth_header(token)
    secret = client.post(
        "/api/auth/mfa/setup", json={"password": PASSWORD}, headers=headers
    ).json()["secret"]
    totp = pyotp.TOTP(secret)
    client.post("/api/auth/mfa/enable", json={"code": code_in(totp, 0)}, headers=headers)
    client.post(
        "/api/auth/mfa/disable",
        json={"password": PASSWORD, "code": code_in(totp, 1)},
        headers=headers,
    )
    client.post(
        "/api/auth/password-reset",
        json={
            "nickname": "Pingpong_Paula",
            "code": body["recovery_codes"][0],
            "new_password": "ein-ganz-neues-passwort",
            "turnstile_token": "ok",
        },
    )

    rows = audit_rows(session)
    assert rows, "the user and MFA changes must be logged"
    assert not {r.entity for r in rows} & {"login_session", "recovery_code"}
    text = json.dumps([r.changes for r in rows])
    for field in SECRETS:
        assert field not in text
    assert secret not in text
    # MFA on and off are logged, without the secret.
    mfa = [r.changes for r in rows if r.action == "update" and "mfa_enabled_at" in r.changes]
    assert len(mfa) == 2


def test_an_update_of_only_excluded_fields_writes_no_row(client, session):
    register(client)
    before = audit_rows(session)

    # A wrong password counts a failed login; a right one resets the count.
    client.post("/api/auth/login", json={"nickname": "Pingpong_Paula", "password": "falsch-falsch"})
    client.post("/api/auth/login", json={"nickname": "Pingpong_Paula", "password": PASSWORD})

    assert after(session, before) == []


def test_a_password_reset_is_logged_without_the_hash(client, session):
    body = register(client).json()
    user_id = body["user"]["id"]
    before = audit_rows(session)

    client.post(
        "/api/auth/password-reset",
        json={
            "nickname": "Pingpong_Paula",
            "code": body["recovery_codes"][0],
            "new_password": "ein-ganz-neues-passwort",
            "turnstile_token": "ok",
        },
    )

    [entry] = after(session, before)
    assert (entry.entity, entry.entity_id, entry.action) == ("app_user", user_id, "update")
    assert (entry.actor_id, entry.actor_kind) == (user_id, "user")
    assert entry.changes == {"password": "changed"}


def test_new_recovery_codes_are_logged_without_the_codes(client, session):
    body = register(client).json()
    before = audit_rows(session)

    client.post(
        "/api/auth/recovery-codes", json={"password": PASSWORD}, headers=auth_header(body["token"])
    )

    [entry] = after(session, before)
    assert (entry.entity, entry.entity_id, entry.action) == ("app_user", body["user"]["id"], "update")
    assert entry.changes == {"recovery_codes": "changed"}


def test_block_logs_the_removed_contact_and_join(client, session, place, host):  # noqa: F811
    paula_token, paula_id = host
    karl_token, karl_id = user(client, "Korb_Karl")
    request_id = ask(client, paula_token, "Korb_Karl").json()["id"]
    answer(client, karl_token, request_id, "accept")
    meetup_id = create(client, paula_token, place.id).json()["id"]
    join(client, karl_token, meetup_id)
    before = audit_rows(session)

    assert block(client, paula_token, "Korb_Karl").status_code == 201

    rows = after(session, before)
    assert sorted(actions(rows)) == [
        ("contact_request", "delete"),
        ("meetup_join", "delete"),
        ("user_block", "insert"),
    ]
    assert {(r.actor_id, r.actor_kind) for r in rows} == {(paula_id, "user")}
    contact = next(r for r in rows if r.entity == "contact_request")
    assert contact.entity_id == request_id
    assert contact.changes["status"] == "accepted"
    removed_join = next(r for r in rows if r.entity == "meetup_join")
    assert removed_join.changes["user_id"] == karl_id


def test_place_reports_and_their_dismissal_are_logged(client, session, place, admin):  # noqa: F811
    token, user_id = user(client, "Korb_Karl")
    # A report needs an account at least 7 days old (SCRUM-71).
    session.get(User, user_id).created_at = datetime.now(UTC) - timedelta(days=8)
    session.commit()

    report(client, token, place.id, "dangerous")
    dismiss(client, admin, place.id)

    [inserted, closed] = audit_rows(session, "place_report")
    assert (inserted.action, inserted.actor_id, inserted.actor_kind) == ("insert", user_id, "user")
    assert inserted.changes["reason"] == "dangerous"
    assert (closed.action, closed.actor_kind) == ("update", "admin")
    assert closed.entity_id == inserted.entity_id
    assert list(closed.changes) == ["closed_at"]
    assert closed.changes["closed_at"][0] is None


def test_a_rating_and_its_change_are_logged(client, session, place):  # noqa: F811
    token, user_id = user(client, "Korb_Karl")

    rate(client, token, place.id, stars=4, reasons=["table_good"])
    rate(client, token, place.id, stars=2, reasons=["table_good", "table_damaged"])

    [inserted, changed] = audit_rows(session, "rating")
    assert (inserted.action, inserted.actor_id, inserted.actor_kind) == ("insert", user_id, "user")
    assert inserted.changes["place_id"] == place.id
    assert inserted.changes["user_id"] == user_id
    assert inserted.changes["stars"] == 4
    assert inserted.changes["reasons"] == ["table_good"]
    assert (changed.action, changed.actor_id) == ("update", user_id)
    assert changed.entity_id == inserted.entity_id
    assert changed.changes["stars"] == [4, 2]
    assert changed.changes["reasons"] == [["table_good"], ["table_good", "table_damaged"]]
    assert "created_at" not in changed.changes


def test_the_same_rating_again_logs_only_the_new_time(client, session, place):  # noqa: F811
    token, _ = user(client, "Korb_Karl")

    rate(client, token, place.id)
    rate(client, token, place.id)

    [_, changed] = audit_rows(session, "rating")
    assert list(changed.changes) == ["updated_at"]


def test_a_place_confirmation_is_logged(client, session):
    place_id = suggest(client, user_token(client, session, "Steven")).json()["id"]
    other = user_token(client, session, "Stefan")
    other_id = session.exec(select(User.id).where(User.nickname == "Stefan")).one()

    assert confirm(client, other, place_id).status_code == 200

    [entry] = [r for r in audit_rows(session, "place_confirmation") if r.actor_id == other_id]
    assert (entry.action, entry.actor_kind) == ("insert", "user")
    assert entry.changes["place_id"] == place_id
    assert entry.changes["user_id"] == other_id
    assert entry.changes["created_at"] is not None


def test_delete_account_keeps_the_log_without_the_user(client, session, place):  # noqa: F811
    token, user_id = user(client, "Korb_Karl")
    meetup_id = create(client, token, place.id).json()["id"]

    assert delete_account(client, token).status_code == 204

    session.expire_all()
    # The Meetup insert stays, but nobody can see who made it.
    [entry] = audit_rows(session, "meetup", meetup_id, "insert")
    assert entry.actor_id is None
    assert not [r for r in audit_rows(session) if r.actor_id == user_id]
    # The rows of the user itself held the old Nickname.
    assert audit_rows(session, "app_user", user_id) == []


# The fields in `changes` that name a user (SCRUM-114).
PERSON_FIELDS = {
    "meetup": {"host_id"},
    "meetup_join": {"user_id"},
    "contact_request": {"requester_id", "addressee_id"},
    "user_block": {"blocker_id", "blocked_id"},
}


def test_delete_account_removes_the_old_id_from_other_rows(client, session, place):  # noqa: F811
    paula_token, paula_id = user(client, "Pingpong_Paula")
    karl_token, karl_id = user(client, "Korb_Karl")
    mia_token, mia_id = user(client, "Mia_Matte")
    request_id = ask(client, karl_token, "Pingpong_Paula").json()["id"]
    answer(client, paula_token, request_id, "accept")
    karls_meetup = create(client, karl_token, place.id).json()["id"]
    join(client, paula_token, karls_meetup)
    paulas_meetup = create(client, paula_token, place.id).json()["id"]
    join(client, karl_token, paulas_meetup)
    block(client, mia_token, "Korb_Karl")

    assert delete_account(client, karl_token).status_code == 204

    session.expire_all()
    # The rows of one deleted person cannot be grouped by the old id any more.
    for entry in audit_rows(session):
        for field in PERSON_FIELDS.get(entry.entity, ()):
            value = entry.changes.get(field)
            assert value != karl_id and karl_id not in (value if isinstance(value, list) else [])
    # The other values stay, so the history still makes sense.
    [hosted] = audit_rows(session, "meetup", karls_meetup, "insert")
    assert (hosted.changes["host_id"], hosted.changes["place_id"]) == (None, place.id)
    [handover] = audit_rows(session, "meetup", karls_meetup, "update")
    assert handover.changes["host_id"] == [None, paula_id]
    [request] = audit_rows(session, "contact_request", request_id, "insert")
    assert (request.changes["requester_id"], request.changes["addressee_id"]) == (None, paula_id)
    [blocked] = audit_rows(session, "user_block", action="insert")
    assert (blocked.changes["blocker_id"], blocked.changes["blocked_id"]) == (mia_id, None)
    karls_join = next(
        r
        for r in audit_rows(session, "meetup_join", action="insert")
        if r.changes["meetup_id"] == paulas_meetup and r.changes["user_id"] is None
    )
    assert karls_join.actor_id is None


def test_the_osm_import_is_a_system_change(session, tmp_path):
    load(session, [snapshot(tmp_path, row("test/1", name="Alt"), row("test/2"))])
    place_id = session.exec(select(Place.id).where(Place.osm_id == "test/1")).one()

    [entry] = audit_rows(session, "place", place_id)
    assert (entry.action, entry.actor_id, entry.actor_kind) == ("insert", None, "system")
    assert entry.changes["name"] == "Alt"
    assert entry.changes["location"] == "POINT(2.0 1.0)"


def test_the_osm_import_logs_only_real_changes(session, tmp_path):
    load(session, [snapshot(tmp_path, row("test/1", name="Alt"), row("test/2"))])
    before = audit_rows(session)

    load(session, [snapshot(tmp_path, row("test/1", name="Neu"), row("test/2"))])

    [entry] = after(session, before)
    assert (entry.entity, entry.action, entry.actor_kind) == ("place", "update", "system")
    assert entry.changes == {"name": ["Alt", "Neu"]}


def test_the_osm_import_logs_all_places_in_one_statement(session, tmp_path):
    inserts = []

    def count(_conn, _cursor, statement, *_):
        if statement.startswith("INSERT INTO audit_log"):
            inserts.append(statement)

    event.listen(session.connection(), "before_cursor_execute", count)
    load(session, [snapshot(tmp_path, row("test/1"), row("test/2"), row("test/3"))])

    assert len(inserts) == 1
    assert len(audit_rows(session, "place", action="insert")) >= 3


def test_a_change_outside_a_request_is_a_system_change(client, session, place):  # noqa: F811
    register(client)

    place.name = "Neuer Name"
    session.commit()

    [entry] = audit_rows(session, "place", place.id, "update")
    assert (entry.actor_id, entry.actor_kind) == (None, "system")
    assert entry.changes == {"name": ["Testplatte", "Neuer Name"]}


def test_a_place_suggestion_logs_its_location(client, session):
    # The location of a Place set by the app is a WKT string; the log keeps it readable.
    place = Place(name="Neu", activity_type="basketball", location="SRID=4326;POINT(-30.25 0.75)")
    session.add(place)
    session.commit()

    [entry] = audit_rows(session, "place", place.id)
    assert entry.changes["location"] == "POINT(-30.25 0.75)"


def test_times_are_iso_strings(client, session, place, host):  # noqa: F811
    token, _ = host
    starts_at = datetime.now(UTC) + timedelta(hours=2)

    meetup_id = create(client, token, place.id, starts_at=starts_at.isoformat()).json()["id"]

    [entry] = audit_rows(session, "meetup", meetup_id)
    assert datetime.fromisoformat(entry.changes["starts_at"]) == starts_at


def test_wall_clock_times_are_iso_strings():
    from app.audit import plain

    assert plain(time(17, 30)) == "17:30:00"
