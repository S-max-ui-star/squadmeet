"""The minimum account age for the actions that change what other users see on the map:
suggest and confirm a Place (SCRUM-36), report a Place (SCRUM-57, decided 2026-10-16). So a few
new accounts cannot add a Place or hide one.

This module imports no other app module except the models, so app.suggestions and
app.place_reports can both import it (app.places imports app.place_reports).
"""

from datetime import datetime, timedelta

from fastapi import HTTPException, status

from app.models import User

MIN_ACCOUNT_AGE = timedelta(days=7)


def require_account_age(user: User, now: datetime) -> None:
    """403 when the account is younger than MIN_ACCOUNT_AGE."""
    if now - user.created_at < MIN_ACCOUNT_AGE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dein Konto muss mindestens 7 Tage alt sein, um Plätze vorzuschlagen, "
            "zu bestätigen oder zu melden.",
        )
