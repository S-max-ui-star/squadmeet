"""indexes for SET NULL foreign keys, one Contact row per pair in any order (SCRUM-69)

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0026"
down_revision: Union[str, Sequence[str], None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_meetup_moved_to_id", "meetup", ["moved_to_id"])
    op.create_index("ix_notification_actor_id", "notification", ["actor_id"])
    # A pair asked in both directions has two rows: keep the accepted one, else the newest.
    op.execute(
        """
        DELETE FROM contact_request
        WHERE id IN (
            SELECT id FROM (
                SELECT id, row_number() OVER (
                    PARTITION BY least(requester_id, addressee_id),
                                 greatest(requester_id, addressee_id)
                    ORDER BY status = 'accepted' DESC, updated_at DESC, id
                ) AS n
                FROM contact_request
            ) ranked
            WHERE n > 1
        )
        """
    )
    op.drop_constraint("uq_contact_request_pair", "contact_request", type_="unique")
    op.create_index(
        "uq_contact_request_pair",
        "contact_request",
        [sa.text("least(requester_id, addressee_id)"), sa.text("greatest(requester_id, addressee_id)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_contact_request_pair", table_name="contact_request")
    op.create_unique_constraint(
        "uq_contact_request_pair", "contact_request", ["requester_id", "addressee_id"]
    )
    op.drop_index("ix_notification_actor_id", table_name="notification")
    op.drop_index("ix_meetup_moved_to_id", table_name="meetup")
