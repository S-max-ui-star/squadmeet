from datetime import date, datetime, time
from typing import Any, Literal

from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Time,
    UniqueConstraint,
    false,
    text,
)
from sqlmodel import Field, SQLModel

from app.activities import ACTIVITY_TYPES


class Place(SQLModel, table=True):
    """A public, free location for one Activity type (see CONTEXT.md)."""

    __table_args__ = (
        # One OSM pitch with "sport=soccer;basketball" gives two Places, one per Activity type.
        UniqueConstraint("osm_id", "activity_type", name="uq_place_osm_id_activity_type"),
        # The same check as migration 0003, so create_all and autogenerate know it too.
        CheckConstraint(
            "activity_type IN (" + ", ".join(f"'{t}'" for t in ACTIVITY_TYPES) + ")",
            name="ck_place_activity_type",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    name: str
    # One of app.activities.ActivityType; the database checks it (ck_place_activity_type).
    activity_type: str
    # "node/123" or "way/456" for a Place from OpenStreetMap, empty for a suggested Place.
    osm_id: str | None = None
    # Nearest address from Nominatim. Filled once when the Place detail is first opened.
    address: str | None = None
    # WGS 84 (lon/lat), the coordinate system of OpenStreetMap and Leaflet.
    location: Any = Field(sa_column=Column(Geometry("POINT", srid=4326), nullable=False))
    # A Place suggestion (SCRUM-30): a user added it, and no Admin has approved it yet.
    is_suggestion: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default=false())
    )
    # SCRUM-56: when the user suggested it. An Admin may approve it 24 h after this at the
    # earliest.
    suggested_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    # SCRUM-56: when it got its 3rd Confirmation. From then on it waits for an Admin.
    confirmed_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    # SCRUM-56: when an Admin approved it; it is an active Place since then.
    approved_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    # SCRUM-56: what OSM has at the point ("building", "private", "residential"), only a hint
    # for the Admin. [] = nothing found; None = not checked yet, or Overpass did not answer.
    osm_hints: list[str] | None = Field(
        default=None, sa_column=Column(ARRAY(String), nullable=True)
    )
    # SCRUM-39: an Admin locked it (not publicly accessible); it is hidden until unlocked.
    locked_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    # SCRUM-39: an Admin deleted it. The row stays, so the OSM import cannot bring it back.
    deleted_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )


class PlaceConfirmation(SQLModel, table=True):
    """A user's Confirmation that a Place suggestion is real (see CONTEXT.md). The user who
    suggested the Place has the first one (SCRUM-30); others confirm at the Place (SCRUM-36)."""

    __tablename__ = "place_confirmation"
    __table_args__ = (
        UniqueConstraint("place_id", "user_id", name="uq_place_confirmation_place_user"),
    )

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        sa_column=Column(ForeignKey("place.id", ondelete="CASCADE"), nullable=False)
    )
    # Deleting the account deletes the user's Confirmations; the Place suggestion stays.
    user_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


# The fixed reasons of a Place report (SCRUM-57); no free text (ADR-0004). The labels are in
# the frontend.
PLACE_REPORT_REASONS = ("not_existing", "not_public", "dangerous")
PlaceReportReason = Literal["not_existing", "not_public", "dangerous"]


class PlaceReport(SQLModel, table=True):
    """A user's Place report (SCRUM-57, see CONTEXT.md). It is open until an Admin dismisses
    the reports of the Place or locks it; then closed_at is set and the user may report again."""

    __tablename__ = "place_report"
    __table_args__ = (
        CheckConstraint(
            "reason IN (" + ", ".join(f"'{r}'" for r in PLACE_REPORT_REASONS) + ")",
            name="ck_place_report_reason",
        ),
        # One open report per user and Place.
        Index(
            "uq_place_report_open",
            "place_id",
            "user_id",
            unique=True,
            postgresql_where=text("closed_at IS NULL"),
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        sa_column=Column(ForeignKey("place.id", ondelete="CASCADE"), nullable=False)
    )
    # Deleting the account deletes the user's reports, like the Confirmations.
    user_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    reason: str
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    closed_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )


class PlaceRead(SQLModel):
    id: int
    name: str
    activity_type: str
    lat: float
    lon: float
    address: str | None = None
    # Party sizes of the active Meetups at the Place; 0 = nobody is there now (SCRUM-29).
    people_now: int = 0
    # A Place suggestion and its number of Confirmations so far (SCRUM-30); 0 for OSM Places.
    is_suggestion: bool = False
    confirmations: int = 0
    # A Place suggestion with 3 Confirmations that waits for an Admin approval (SCRUM-56).
    waiting_for_admin: bool = False
    # Open Place reports (SCRUM-57) and their most common reason; None = no open report.
    open_reports: int = 0
    report_reason: str | None = None


class PlaceSearchHit(SQLModel):
    kind: Literal["place", "address"]
    label: str
    lat: float
    lon: float
    place_id: int | None = None


class User(SQLModel, table=True):
    """A registered person. No email address is stored (ADR-0005)."""

    # "user" is a reserved word in PostgreSQL.
    __tablename__ = "app_user"
    # A Nickname is unique without regard to case: "Steven" blocks "steven".
    __table_args__ = (Index("uq_app_user_nickname_lower", text("lower(nickname)"), unique=True),)

    id: int | None = Field(default=None, primary_key=True)
    nickname: str
    password_hash: str
    avatar: str
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    # Set only by `python -m app.admin grant` (app/admin.py). Admin routes also need MFA on.
    is_admin: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default=false())
    )
    # Base32 TOTP secret (SCRUM-26). Stored in plain text: the server must compute the codes.
    # Set by MFA setup; MFA is on only once a code confirmed it (mfa_enabled_at).
    mfa_secret: str | None = None
    mfa_enabled_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )
    # The 30-second time step of the last accepted code, so a code works only once.
    mfa_last_step: int | None = Field(default=None, sa_column=Column(BigInteger))
    # Wrong passwords and wrong MFA codes since the last login. From 3 on, login also needs the
    # captcha (SCRUM-27). A login resets it to 0.
    failed_logins: int = Field(
        default=0, sa_column=Column(Integer, nullable=False, server_default=text("0"))
    )


class RecoveryCode(SQLModel, table=True):
    """A one-time code for a password reset or an MFA login (see CONTEXT.md). Only the hash is
    stored."""

    __tablename__ = "recovery_code"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    code_hash: str
    used_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True)))


class LoginSession(SQLModel, table=True):
    """One logged-in device. Logout deletes the row, so its token stops working at once."""

    __tablename__ = "login_session"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    token_hash: str = Field(unique=True)
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    expires_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class Meetup(SQLModel, table=True):
    """A user's announcement to be at a Place from starts_at until ends_at (see CONTEXT.md).

    A Now-meetup (SCRUM-29) starts when it is created, a later Meetup (SCRUM-35) at a start
    time up to 30 days ahead; both end after 1–4 hours. It is active while
    starts_at <= now < ends_at; there is no job that deletes it.
    """

    __tablename__ = "meetup"
    __table_args__ = (
        CheckConstraint("party_size BETWEEN 1 AND 10", name="ck_meetup_party_size"),
        CheckConstraint("ends_at > starts_at", name="ck_meetup_ends_after_start"),
        UniqueConstraint("series_id", "series_date", name="uq_meetup_series_date"),
    )

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        sa_column=Column(ForeignKey("place.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    # The creator is the Host (SCRUM-29). Handing the role over is SCRUM-37.
    host_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    # The Host's own Party size, the Host included (1–10). Others come as MeetupJoin.
    party_size: int
    starts_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    # The Host ending the Meetup early sets this to the moment of the end.
    ends_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    # SCRUM-37: the Host called it off before the start; it stays listed as cancelled.
    cancelled_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    # SCRUM-37: nobody is left; it is gone from the list and the map.
    closed_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    # SCRUM-37: the Host moved to this new Meetup; the users who were in get an offer.
    moved_to_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("meetup.id", ondelete="SET NULL"), nullable=True),
    )
    # True while the current Host (who got the role after the move) has not answered.
    host_move_pending: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default=false())
    )
    # SCRUM-38: an Occurrence of a weekly Series, and its date in Berlin (one per Series and
    # date, so a moved or cancelled Occurrence is never made again).
    series_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("meetup_series.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    series_date: date | None = Field(default=None, sa_column=Column(Date, nullable=True))


class MeetupJoin(SQLModel, table=True):
    """A user's Join of a Meetup with their Party size (SCRUM-34, see CONTEXT.md).

    One per user per Meetup; Leave deletes it. The Host has no Join: their Party size is on
    the Meetup. The earliest Join gets the Host role when the Host Leaves (SCRUM-37).
    """

    __tablename__ = "meetup_join"
    __table_args__ = (
        UniqueConstraint("meetup_id", "user_id", name="uq_meetup_join_meetup_user"),
        CheckConstraint("party_size BETWEEN 1 AND 10", name="ck_meetup_join_party_size"),
    )

    id: int | None = Field(default=None, primary_key=True)
    meetup_id: int = Field(
        sa_column=Column(ForeignKey("meetup.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    user_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    party_size: int
    joined_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    # SCRUM-37: the Host moved the Meetup; this user has not yet chosen go / stay / leave.
    move_pending: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default=false())
    )



class Photo(SQLModel, table=True):
    """A user's Photo of a Place (SCRUM-42, see CONTEXT.md). The file is in the photo storage
    (app.photo_storage), not in the database. Pending until an Admin approves it; a rejected
    Photo is deleted with its file."""

    __tablename__ = "photo"
    __table_args__ = (Index("ix_photo_place_approved", "place_id", "approved_at"),)

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        sa_column=Column(ForeignKey("place.id", ondelete="CASCADE"), nullable=False)
    )
    # Empty after the user deleted the account: the Photo stays without a name (Stefan,
    # 2026-10-16). Photos show no people (the upload screen says so).
    user_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    # The file's name in the photo storage.
    storage_key: str = Field(sa_column=Column(String, nullable=False, unique=True))
    width: int
    height: int
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    approved_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )


class Rating(SQLModel, table=True):
    """A user's 1–5 stars for a Place with at least one Reason (SCRUM-31, see CONTEXT.md).

    One per user per Place: a second Rating replaces the first.
    """

    __tablename__ = "rating"
    __table_args__ = (
        UniqueConstraint("place_id", "user_id", name="uq_rating_place_user"),
        CheckConstraint("stars BETWEEN 1 AND 5", name="ck_rating_stars"),
        CheckConstraint("cardinality(reasons) >= 1", name="ck_rating_has_reason"),
    )

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        sa_column=Column(ForeignKey("place.id", ondelete="CASCADE"), nullable=False)
    )
    user_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    stars: int
    # Keys from app/reasons.py for the Place's Activity type. No free text (ADR-0004).
    reasons: list[str] = Field(sa_column=Column(ARRAY(String), nullable=False))
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    # Set again when the user changes the Rating; the Condition counts only recent ones.
    updated_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class ConditionVote(SQLModel, table=True):
    """A user's answer to "Ist das noch so?" for an issue of a Place (SCRUM-31, app/ratings.py).

    Only stored, never changed: the open check and its result are worked out from the votes.
    """

    __tablename__ = "condition_vote"
    __table_args__ = (Index("ix_condition_vote_place_reason", "place_id", "reason_key"),)

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        sa_column=Column(ForeignKey("place.id", ondelete="CASCADE"), nullable=False)
    )
    # A condition_issue key from app/reasons.py.
    reason_key: str
    user_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    # True = the issue is still there; False = it is fixed.
    still_there: bool
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class ContactRequest(SQLModel, table=True):
    """A Contact request and, once accepted, the Contact itself (SCRUM-32, see CONTEXT.md).

    One row per pair of users, from the one who asked. status: pending, accepted (they are
    Contacts) or declined (the asker sees it and may ask again, which makes it pending).
    """

    __tablename__ = "contact_request"
    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_contact_request_pair"),
        CheckConstraint("requester_id <> addressee_id", name="ck_contact_request_not_self"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'declined')", name="ck_contact_request_status"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    requester_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    addressee_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    status: str
    updated_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class UserBlock(SQLModel, table=True):
    """A Block (SCRUM-32, see CONTEXT.md): blocker_id blocked blocked_id. One direction only."""

    __tablename__ = "user_block"
    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_user_block_pair"),
        CheckConstraint("blocker_id <> blocked_id", name="ck_user_block_not_self"),
    )

    id: int | None = Field(default=None, primary_key=True)
    blocker_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    blocked_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class Favorite(SQLModel, table=True):
    """A Place saved by one user for Meetup Notifications (SCRUM-41)."""

    __tablename__ = "favorite"
    __table_args__ = (UniqueConstraint("place_id", "user_id", name="uq_favorite_place_user"),)

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        sa_column=Column(ForeignKey("place.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    user_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class FavoriteTimeRule(SQLModel, table=True):
    """Berlin weekdays and a same-day time range for one Favorite (SCRUM-41)."""

    __tablename__ = "favorite_time_rule"
    __table_args__ = (
        CheckConstraint("cardinality(weekdays) BETWEEN 1 AND 7", name="ck_favorite_rule_weekdays"),
        CheckConstraint("start_time < end_time", name="ck_favorite_rule_same_day"),
    )

    id: int | None = Field(default=None, primary_key=True)
    favorite_id: int = Field(
        sa_column=Column(ForeignKey("favorite.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    weekdays: list[int] = Field(sa_column=Column(ARRAY(Integer), nullable=False))
    start_time: time = Field(sa_column=Column(Time, nullable=False))
    end_time: time = Field(sa_column=Column(Time, nullable=False))


class HomeArea(SQLModel, table=True):
    """A user's Home area (SCRUM-45, ADR-0003): a point they chose and a radius, never a live
    location. One per user; turning it off deletes the row."""

    __tablename__ = "home_area"
    __table_args__ = (
        CheckConstraint("radius_km BETWEEN 1 AND 20", name="ck_home_area_radius"),
        CheckConstraint("cardinality(activity_types) >= 1", name="ck_home_area_activity_types"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, unique=True
        )
    )
    location: Any = Field(sa_column=Column(Geometry("POINT", srid=4326), nullable=False))
    radius_km: int
    # Keys of app.activities.ActivityType; a new Meetup at a Place of another type is ignored.
    activity_types: list[str] = Field(sa_column=Column(ARRAY(String), nullable=False))
    updated_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class Notification(SQLModel, table=True):
    """A Meetup event kept in one user's in-app Notification list (SCRUM-40)."""

    __tablename__ = "notification"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('meetup_cancelled', 'meetup_ended', 'meetup_moved', 'host_handover', "
            "'blocked_user_joined', 'favorite_meetup_created', 'contact_meetup_created', "
            "'meetup_invitation', 'home_area_meetup_created')",
            name="ck_notification_kind",
        ),
        Index("ix_notification_user_created", "user_id", "created_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False)
    )
    meetup_id: int = Field(
        sa_column=Column(ForeignKey("meetup.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    kind: str
    # The person who caused the event; empty after that account is deleted.
    actor_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True),
    )
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    read_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )


class PushSubscription(SQLModel, table=True):
    """One browser endpoint that may receive a user's Notifications (SCRUM-44)."""

    __tablename__ = "push_subscription"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    endpoint: str = Field(sa_column=Column(String, nullable=False, unique=True))
    p256dh: str
    auth: str
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class MeetupSeries(SQLModel, table=True):
    """A weekly Series (SCRUM-38, see CONTEXT.md): weekdays, each with a start time in Berlin
    and a duration. Its Occurrences are ordinary Meetups (series_id), made for the next 30 days
    by app.series.fill_series."""

    __tablename__ = "meetup_series"
    __table_args__ = (CheckConstraint("party_size BETWEEN 1 AND 10", name="ck_meetup_series_party_size"),)

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        sa_column=Column(ForeignKey("place.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    host_id: int = Field(
        sa_column=Column(ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    party_size: int
    # [{"weekday": 0-6 (Monday = 0), "time": "HH:MM", "hours": 1-4}, ...], one per weekday.
    slots: list[dict[str, Any]] = Field(sa_column=Column(JSON, nullable=False))
    # The last date (Berlin) that may have an Occurrence; None = no end.
    until: date | None = Field(default=None, sa_column=Column(Date, nullable=True))
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    # The Host cancelled the whole Series: no new Occurrences.
    cancelled_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )


class AuditLog(SQLModel, table=True):
    """One insert, update or delete of a domain row, with who did it and when (SCRUM-66).

    Written by app/audit.py, never changed. changes: for an update only the changed fields as
    {field: [old, new]}; for an insert or a delete the row. Secrets are never in it.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        CheckConstraint("actor_kind IN ('user', 'admin', 'system')", name="ck_audit_log_actor_kind"),
        CheckConstraint("action IN ('insert', 'update', 'delete')", name="ck_audit_log_action"),
        Index("ix_audit_log_entity", "entity", "entity_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    occurred_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    # NULL for a system change, and after the user deleted their account.
    actor_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    actor_kind: str
    # The table name, for example "place".
    entity: str
    entity_id: int
    action: str
    changes: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
