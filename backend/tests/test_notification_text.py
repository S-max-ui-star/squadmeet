"""Shared in-app and Web Push text (SCRUM-89)."""

import pytest

from app.notification_text import REASONS, notification_text, street_only


@pytest.mark.parametrize(
    ("address", "street"),
    [
        ("Karl-Heine-Straße 12–14, 04229 Leipzig, Ortsteil Plagwitz", "Karl-Heine-Straße"),
        ("Gohliser Straße 7a, 04105 Leipzig", "Gohliser Straße"),
        ("Anton-Bruckner-Allee, 04107 Leipzig", "Anton-Bruckner-Allee"),
        (None, None),
    ],
)
def test_street_only_removes_house_number_and_other_address_parts(address, street):
    assert street_only(address) == street


def test_notification_text_uses_actor_reason_activity_and_only_the_street():
    assert notification_text(
        "meetup_cancelled",
        "Max",
        "table_tennis",
        "Karl-Heine-Straße 12–14, 04229 Leipzig, Ortsteil Plagwitz",
    ) == "Max hat das Treffen abgesagt: Tischtennis in der Karl-Heine-Straße"


def test_notification_text_ends_with_the_activity_without_a_street():
    assert notification_text("meetup_moved", "Max", "basketball", None) == (
        "Max hat die Zeit geändert: Basketball"
    )


def test_every_notification_kind_has_reason_words():
    assert set(REASONS) == {
        "meetup_cancelled",
        "meetup_ended",
        "meetup_moved",
        "host_handover",
        "blocked_user_joined",
        "favorite_meetup_created",
        "contact_meetup_created",
        "meetup_invitation",
        "home_area_meetup_created",
    }
