"""add time-change Notifications (SCRUM-89)

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-20

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0025"
down_revision: Union[str, Sequence[str], None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_KINDS = (
    "kind IN ('meetup_cancelled', 'meetup_ended', 'host_handover', "
    "'blocked_user_joined', 'favorite_meetup_created', 'contact_meetup_created', "
    "'meetup_invitation', 'home_area_meetup_created')"
)
NEW_KINDS = (
    "kind IN ('meetup_cancelled', 'meetup_ended', 'meetup_moved', 'host_handover', "
    "'blocked_user_joined', 'favorite_meetup_created', 'contact_meetup_created', "
    "'meetup_invitation', 'home_area_meetup_created')"
)


def upgrade() -> None:
    op.drop_constraint("ck_notification_kind", "notification", type_="check")
    op.create_check_constraint("ck_notification_kind", "notification", NEW_KINDS)


def downgrade() -> None:
    op.execute("DELETE FROM notification WHERE kind = 'meetup_moved'")
    op.drop_constraint("ck_notification_kind", "notification", type_="check")
    op.create_check_constraint("ck_notification_kind", "notification", OLD_KINDS)
