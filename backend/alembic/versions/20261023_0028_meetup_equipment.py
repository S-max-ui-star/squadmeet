"""the Equipment a user brings to a Meetup (SCRUM-170)

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0028"
down_revision: Union[str, Sequence[str], None] = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "meetup_equipment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meetup_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("item", sa.String(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.CheckConstraint("count BETWEEN 1 AND 4", name="ck_meetup_equipment_count"),
        sa.ForeignKeyConstraint(["meetup_id"], ["meetup.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("meetup_id", "user_id", "item", name="uq_meetup_equipment_item"),
    )
    op.create_index(
        op.f("ix_meetup_equipment_meetup_id"), "meetup_equipment", ["meetup_id"], unique=False
    )
    op.create_index(
        op.f("ix_meetup_equipment_user_id"), "meetup_equipment", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_meetup_equipment_user_id"), table_name="meetup_equipment")
    op.drop_index(op.f("ix_meetup_equipment_meetup_id"), table_name="meetup_equipment")
    op.drop_table("meetup_equipment")
