"""One text format shared by in-app Notifications and Web Push (SCRUM-89)."""

import re
from typing import Literal

from app.activities import ActivityType

NotificationKind = Literal[
    "meetup_cancelled",
    "meetup_ended",
    "meetup_moved",
    "host_handover",
    "blocked_user_joined",
    "favorite_meetup_created",
    "contact_meetup_created",
    "meetup_invitation",
    "home_area_meetup_created",
]

ACTIVITY_NAMES = {
    ActivityType.TABLE_TENNIS: "Tischtennis",
    ActivityType.BASKETBALL: "Basketball",
    ActivityType.FOOTBALL: "Fußball",
    ActivityType.BEACH_VOLLEYBALL: "Beachvolleyball",
    ActivityType.OUTDOOR_FITNESS: "Outdoor-Fitness",
}

REASONS: dict[NotificationKind, str] = {
    "meetup_cancelled": "hat das Treffen abgesagt",
    "meetup_ended": "hat das Treffen beendet",
    "meetup_moved": "hat die Zeit geändert",
    "host_handover": "hat dir die Gastgeberrolle übergeben",
    "blocked_user_joined": "ist dem Treffen beigetreten",
    "favorite_meetup_created": "hat ein Treffen erstellt",
    "contact_meetup_created": "hat ein Treffen erstellt",
    "meetup_invitation": "hat dich eingeladen",
    "home_area_meetup_created": "hat ein Treffen erstellt",
}

# Stored addresses start with "street [house number]", followed by comma-separated city and
# district parts. House numbers may contain a suffix or a range (for example 7a or 12–14).
HOUSE_NUMBER = re.compile(r"\s+\d+[a-zA-Z]?(?:\s*[-–/]\s*\d+[a-zA-Z]?)?$")


def street_only(address: str | None) -> str | None:
    if not address:
        return None
    first_line = address.split(",", 1)[0].strip()
    return HOUSE_NUMBER.sub("", first_line).strip() or None


def notification_text(
    kind: NotificationKind,
    actor_nickname: str | None,
    activity_type: str,
    address: str | None,
) -> str:
    actor = actor_nickname or "Jemand"
    activity = ACTIVITY_NAMES[ActivityType(activity_type)]
    street = street_only(address)
    where = f" in der {street}" if street else ""
    return f"{actor} {REASONS[kind]}: {activity}{where}"
