"""time when each Reason came into a Rating (SCRUM-138)

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0027"
down_revision: Union[str, Sequence[str], None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rating",
        sa.Column("reasons_added_at", JSONB, nullable=False, server_default=sa.text("'{}'")),
    )
    # The old Ratings: each Reason counts from the last save, as before.
    op.execute(
        """
        UPDATE rating SET reasons_added_at = (
            SELECT jsonb_object_agg(reason, to_jsonb(updated_at)) FROM unnest(reasons) AS reason
        )
        """
    )


def downgrade() -> None:
    op.drop_column("rating", "reasons_added_at")
