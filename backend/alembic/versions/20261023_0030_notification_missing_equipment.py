"""The Missing Equipment a Notification names (SCRUM-172)

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0030"
down_revision: Union[str, Sequence[str], None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Older Notifications name nothing.
    op.add_column("notification", sa.Column("missing_equipment", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("notification", "missing_equipment")
