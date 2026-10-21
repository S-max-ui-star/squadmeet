"""Checks of the migrated database schema that `alembic check` does not make."""

from sqlalchemy import text


def test_every_set_null_foreign_key_has_an_index(session):
    # A delete of the parent row sets NULL in every child row; without an index PostgreSQL
    # reads the whole child table to find them (SCRUM-69).
    missing = session.exec(
        text(
            """
            SELECT c.conrelid::regclass || '.' || a.attname
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
            WHERE c.contype = 'f' AND c.confdeltype = 'n'
              AND NOT EXISTS (
                SELECT 1 FROM pg_index i
                WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
                  AND i.indpred IS NULL
              )
            ORDER BY 1
            """
        )
    ).scalars().all()

    assert missing == []
