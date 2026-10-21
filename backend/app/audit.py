"""Audit log (SCRUM-66): one audit_log row for each insert, update and delete of a domain row.

One session hook (after_flush) writes the rows, so a new route is covered without extra code.
The actor is kept on the session: the auth dependencies set it (app/auth.py), and a session
without one is a system change (seed, OSM import, `python -m app.admin`).

Not logged, because they skip the ORM:
- bulk `update(...)` / `delete(...)` / `insert(...)` statements. A caller logs them with
  `record` or `write` (Place reports, OSM import), or uses ORM operations instead (the Block in
  app/contacts.py). The bulk statements in app/auth.py change only excluded tables and fields;
- rows that the database deletes with ON DELETE CASCADE (for example the Meetups of a
  deleted account);
- manual edits in psql.
"""

import struct
from collections.abc import Iterator
from datetime import UTC, date, datetime, time
from typing import Any, Literal

from fastapi import Depends
from geoalchemy2 import WKBElement, WKTElement
from sqlalchemy import ARRAY, Text, cast, delete, event, func, inspect, insert, literal, update
from sqlalchemy.dialects.postgresql import JSONB, array
from sqlmodel import Session, SQLModel
from sqlmodel.main import default_registry

from app.db import get_session
from app.models import AuditLog, User

ActorKind = Literal["user", "admin", "system"]
Action = Literal["insert", "update", "delete"]

EXCLUDED_TABLES = {
    "audit_log",
    # Secrets: these rows hold token and code hashes.
    "login_session",
    "recovery_code",
    # Made from Meetup changes that are logged already; each read changes read_at.
    "notification",
    # Browser endpoint and encryption keys are delivery secrets, not domain history.
    "push_subscription",
    # SCRUM-45: the user's chosen point; off and account delete must remove it at once.
    "home_area",
}
# Secrets. failed_logins is not one, but each login changes it; it is not domain data.
EXCLUDED_FIELDS = {"app_user": {"password_hash", "mfa_secret", "mfa_last_step", "failed_logins"}}
# Excluded fields whose change is still logged, under this name and as "changed" without the
# value: a new password shows after an account take-over (SCRUM-69).
MARKED_FIELDS = {"app_user": {"password_hash": "password"}}
CHANGED = "changed"


def user_columns(table) -> list[str]:
    return [
        column.key
        for column in table.columns
        if any(key.column.table.name == "app_user" for key in column.foreign_keys)
    ]


# The fields that name a user, per logged table: every foreign key to app_user (SCRUM-114).
PERSON_FIELDS = {
    table.name: user_columns(table)
    for table in SQLModel.metadata.sorted_tables
    if table.name not in EXCLUDED_TABLES and user_columns(table)
}

ACTOR = "audit_actor"
TIME = "audit_time"


def set_actor(session: Session, user: User | int, kind: ActorKind) -> None:
    """The user who makes the changes of this request. A User object may be new: its id is read
    when the rows are written (register)."""
    session.info[ACTOR] = (user, kind)


def audit_request(session: Session = Depends(get_session)) -> Iterator[None]:
    """App dependency: each request starts as a system change with its own time. In production
    a session lives for one request anyway; the tests share one session between requests."""
    session.info.pop(ACTOR, None)
    session.info.pop(TIME, None)
    yield
    session.info.pop(ACTOR, None)
    session.info.pop(TIME, None)


def record(
    session: Session, entity: str, entity_id: int, action: Action, changes: dict[str, Any]
) -> None:
    """Log a change that a bulk statement made (the session hook does not see it)."""
    write(session, [(entity, entity_id, action, {k: plain(v) for k, v in changes.items()})])


def forget_user(session: Session, user_id: int) -> None:
    """Account delete (SCRUM-28): the user's own rows hold the old Nickname. Call it after the
    flush that deleted the user; the database sets actor_id to NULL in the other rows.

    SCRUM-114: the other rows also hold the old id in their person fields (host_id, user_id, ...).
    It would group all rows of the deleted person, so it becomes null; the other values stay."""
    session.exec(delete(AuditLog).where(AuditLog.entity == "app_user", AuditLog.entity_id == user_id))
    old_id = literal(user_id, JSONB)
    # JSON null: a SQL NULL would make jsonb_set return NULL for the whole changes.
    null = literal(JSONB.NULL, JSONB)
    for table, fields in PERSON_FIELDS.items():
        for field in fields:
            # The value, or the old or the new half of an [old, new] pair.
            for keys in ([field], [field, "0"], [field, "1"]):
                path = cast(array(keys), ARRAY(Text))
                session.exec(
                    update(AuditLog)
                    .where(AuditLog.entity == table, AuditLog.changes.op("#>")(path) == old_id)
                    .values(changes=func.jsonb_set(AuditLog.changes, path, null))
                )


def write(session: Session, entries: list[tuple[str, int, Action, dict[str, Any]]]) -> None:
    if not entries:
        return
    actor_id, kind = actor_of(session)
    occurred_at = session.info.setdefault(TIME, datetime.now(UTC))
    session.connection().execute(
        insert(AuditLog.__table__),
        [
            {
                "occurred_at": occurred_at,
                "actor_id": actor_id,
                "actor_kind": kind,
                "entity": entity,
                "entity_id": entity_id,
                "action": action,
                "changes": changes,
            }
            for entity, entity_id, action, changes in entries
        ],
    )


def actor_of(session: Session) -> tuple[int | None, ActorKind]:
    if ACTOR not in session.info:
        return None, "system"
    user, kind = session.info[ACTOR]
    user_id = user.id if isinstance(user, User) else user
    # Deleting the account: the row that deletes the user cannot point to it.
    if any(isinstance(obj, User) and obj.id == user_id for obj in session.deleted):
        user_id = None
    return user_id, kind


def load_old_value(_target, _value, _old, _initiator) -> None:
    """Nothing to do: the listener exists for active_history (see below)."""


# After a commit, every attribute is expired. Setting one would then forget the old value, and
# the update would log [null, new]. active_history loads the old value before the set.
for mapper in default_registry.mappers:
    for attr in mapper.column_attrs:
        event.listen(getattr(mapper.class_, attr.key), "set", load_old_value, active_history=True)


@event.listens_for(Session, "after_flush")
def log_flush(session: Session, _context) -> None:
    """New ids are known here, and the old values are still in the attribute history."""
    entries = []
    for objects, action in (
        (session.new, "insert"),
        (session.dirty, "update"),
        (session.deleted, "delete"),
    ):
        for obj in objects:
            entry = entry_of(obj, action)
            if entry is not None:
                entries.append(entry)
    write(session, entries)


def entry_of(obj: Any, action: Action) -> tuple[str, int, Action, dict[str, Any]] | None:
    state = inspect(obj)
    table = state.mapper.local_table.name
    if table in EXCLUDED_TABLES:
        return None
    excluded = EXCLUDED_FIELDS.get(table, set())
    keys = [attr.key for attr in state.mapper.column_attrs if attr.key not in excluded]
    if action == "update":
        changes = {}
        for key in keys:
            history = state.attrs[key].history
            if not history.added:
                continue
            old = plain(history.deleted[0]) if history.deleted else None
            new = plain(history.added[0])
            if old != new:
                changes[key] = [old, new]
        for key, name in MARKED_FIELDS.get(table, {}).items():
            if state.attrs[key].history.added:
                changes[name] = CHANGED
        if not changes:
            return None
    else:
        # state.dict holds only loaded values, so a deleted row is not read again.
        changes = {key: plain(state.dict[key]) for key in keys if key in state.dict}
    # A new row has no identity key yet in after_flush, but its id is loaded.
    entity_id = state.identity[0] if state.identity else state.dict["id"]
    return table, entity_id, action, changes


def plain(value: Any) -> Any:
    """A value for the jsonb column. A location becomes WKT, for example "POINT(12.3 51.3)"."""
    if isinstance(value, list):
        return [plain(item) for item in value]
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, WKBElement):
        return point_wkt(value)
    if isinstance(value, WKTElement):
        return value.data
    if isinstance(value, str) and value.startswith("SRID="):
        return value.split(";", 1)[1]
    return value


def point_wkt(element: WKBElement) -> str:
    """WKT of a PostGIS point (the only geometry in the app), without shapely."""
    data = bytes.fromhex(element.data) if isinstance(element.data, str) else bytes(element.data)
    order = "<" if data[0] == 1 else ">"
    (geometry_type,) = struct.unpack(order + "I", data[1:5])
    # Extended WKB from PostGIS has the SRID after the type.
    offset = 9 if geometry_type & 0x20000000 else 5
    x, y = struct.unpack(order + "dd", data[offset : offset + 16])
    return f"POINT({x} {y})"
