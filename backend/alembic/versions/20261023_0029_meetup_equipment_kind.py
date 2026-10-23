"""Equipment a user needs at a Meetup, beside what they bring (SCRUM-171)

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0029"
down_revision: Union[str, Sequence[str], None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The rows of SCRUM-170 are all things a user brings.
    op.add_column(
        "meetup_equipment",
        sa.Column("kind", sa.String(), nullable=False, server_default="bring"),
    )
    op.create_check_constraint(
        "ck_meetup_equipment_kind", "meetup_equipment", "kind IN ('bring', 'need')"
    )


def downgrade() -> None:
    # The old schema knows only what a user brings.
    op.execute("DELETE FROM meetup_equipment WHERE kind = 'need'")
    op.drop_constraint("ck_meetup_equipment_kind", "meetup_equipment", type_="check")
    op.drop_column("meetup_equipment", "kind")
