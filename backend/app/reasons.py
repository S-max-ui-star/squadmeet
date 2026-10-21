"""The predefined Reasons for a Rating, per Activity type (SCRUM-18, see CONTEXT.md).

Users cannot write free text (ADR-0004), so a Rating picks one or more of these Reasons.
A negative Reason with affects_condition=True names a problem that the city or the operator of
the Place must fix: something broken or missing, litter, broken glass, standing water. Only these
Reasons drive the Condition of the Place (team decision on SCRUM-18). The other negative Reasons
("Oft überfüllt") are worth knowing, but nobody can fix them, so they do not change the Condition.

The key is stored in the database and must never change. The label is the German UI text and
may change.
"""

from dataclasses import dataclass

from app.activities import ActivityType


@dataclass(frozen=True)
class Reason:
    key: str
    label: str
    positive: bool
    affects_condition: bool = False


def good(key: str, label: str) -> Reason:
    return Reason(key, label, positive=True)


def bad(key: str, label: str) -> Reason:
    """A negative Reason that does not change the Condition."""
    return Reason(key, label, positive=False)


def condition_issue(key: str, label: str) -> Reason:
    """A negative Reason that changes the Condition: the city or the operator must fix it."""
    return Reason(key, label, positive=False, affects_condition=True)


# Reasons that fit every Activity type.
GENERAL_REASONS = (
    good("easy_to_reach", "Gut erreichbar"),
    good("clean", "Sauber und gepflegt"),
    good("lit_in_evening", "Abends beleuchtet"),
    good("shade", "Schattig im Sommer"),
    good("seats_nearby", "Bänke in der Nähe"),
    condition_issue("litter", "Müll oder Verschmutzung"),
    condition_issue("broken_glass", "Glasscherben"),
    bad("hard_to_find", "Schwer zu finden"),
    bad("often_crowded", "Oft überfüllt"),
    condition_issue("puddles", "Steht nach Regen unter Wasser"),
)

ACTIVITY_REASONS: dict[ActivityType, tuple[Reason, ...]] = {
    ActivityType.TABLE_TENNIS: (
        good("table_good", "Platte in gutem Zustand"),
        good("fixed_net", "Festes Netz vorhanden"),
        good("wind_protected", "Windgeschützt"),
        condition_issue("net_missing", "Netz fehlt oder ist kaputt"),
        condition_issue("table_damaged", "Platte beschädigt oder uneben"),
    ),
    ActivityType.BASKETBALL: (
        good("hoops_with_nets", "Körbe mit Netz"),
        good("court_surface_good", "Guter, ebener Belag"),
        good("lines_visible", "Linien gut sichtbar"),
        condition_issue("hoop_damaged", "Korb oder Brett beschädigt"),
        condition_issue("hoop_net_missing", "Korbnetz fehlt"),
        condition_issue("court_surface_bad", "Belag rissig oder rutschig"),
    ),
    ActivityType.FOOTBALL: (
        good("goals_with_nets", "Tore mit Netz"),
        good("pitch_good", "Rasen oder Belag in gutem Zustand"),
        good("fenced", "Eingezäunt, der Ball bleibt drin"),
        condition_issue("goal_nets_missing", "Tornetze fehlen oder sind kaputt"),
        condition_issue("pitch_bad", "Löcher oder kaputter Belag"),
        bad("temporarily_closed", "Zeitweise nicht zugänglich"),
    ),
    ActivityType.BEACH_VOLLEYBALL: (
        good("sand_good", "Feiner, sauberer Sand"),
        good("net_tight", "Netz gespannt und in richtiger Höhe"),
        good("court_marked", "Spielfeld markiert"),
        condition_issue("sand_dirty", "Sand verschmutzt"),
        condition_issue("volleyball_net_missing", "Netz fehlt oder ist kaputt"),
        condition_issue("too_little_sand", "Zu wenig Sand, harter Boden"),
    ),
    ActivityType.OUTDOOR_FITNESS: (
        good("equipment_good", "Geräte in gutem Zustand"),
        good("equipment_varied", "Viele verschiedene Geräte"),
        good("instructions", "Übungsanleitungen an den Geräten"),
        condition_issue("equipment_damaged", "Gerät beschädigt oder außer Betrieb"),
        condition_issue("equipment_rusty", "Geräte rostig oder wackelig"),
    ),
}


def reasons_for(activity_type: str) -> tuple[Reason, ...]:
    """The Reasons a Rating of a Place with this Activity type can pick: its own, then the
    general ones."""
    return ACTIVITY_REASONS[ActivityType(activity_type)] + GENERAL_REASONS
