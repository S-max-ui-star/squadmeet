"""Place report (SCRUM-57): users report a Place; from 3 users it leaves the map until an Admin
dismisses the reports or locks the Place."""

from datetime import UTC, datetime, timedelta

from app.admin import set_admin
from tests.test_admin_places import admin, lock, on_map, unlock  # noqa: F401 (fixture)
from tests.test_auth import auth_header, register
from tests.test_meetups import create, place  # noqa: F401 (fixture)
from tests.test_suggestions import add_place, suggest, user_token


def report(client, token, place_id, reason="dangerous"):
    return client.post(
        f"/api/places/{place_id}/reports", json={"reason": reason}, headers=auth_header(token)
    )


def users(client, session, count):
    """Tokens of `count` users whose accounts are old enough to report (8 days)."""
    return [user_token(client, session, f"Melder_{n}") for n in range(count)]


def detail(client, place_id, token=None):
    return client.get(f"/api/places/{place_id}", headers=auth_header(token) if token else {})


def reported_list(client, token):
    return client.get("/api/admin/place-reports", headers=auth_header(token))


def dismiss(client, token, place_id):
    return client.post(f"/api/admin/place-reports/{place_id}/dismiss", headers=auth_header(token))


def test_a_guest_cannot_report(client, place):
    response = client.post(f"/api/places/{place.id}/reports", json={"reason": "dangerous"})

    assert response.status_code == 401


def test_only_the_fixed_reasons(client, session, place):
    [token] = users(client, session, 1)

    assert report(client, token, place.id, reason="Hier ist es laut").status_code == 422


def test_a_report_needs_an_account_at_least_7_days_old(client, session, place):
    young = user_token(client, session, "Neu_Nina", age=timedelta(days=6))

    response = report(client, young, place.id)

    assert response.status_code == 403
    assert "7 Tage" in response.json()["detail"]
    assert detail(client, place.id).json()["open_reports"] == 0


def test_a_user_can_report_at_most_10_places_per_hour(client, session, place):
    [token] = users(client, session, 1)
    others = [add_place(session, name=f"Platte {n}", metres_north=200 * (n + 1)) for n in range(10)]
    for other in others[:9]:
        assert report(client, token, other.id).status_code == 204
    assert report(client, token, place.id).status_code == 204

    assert report(client, token, others[9].id).status_code == 429


def test_the_first_report_shows_the_hint_and_keeps_the_place_on_the_map(client, session, place):
    [token] = users(client, session, 1)

    assert report(client, token, place.id, reason="not_public").status_code == 204

    body = detail(client, place.id).json()
    assert body["open_reports"] == 1
    assert body["report_reason"] == "not_public"
    assert on_map(client, place.id)


def test_the_hint_shows_the_most_common_reason(client, session, place, admin):
    tokens = users(client, session, 3)
    report(client, tokens[0], place.id, reason="dangerous")
    report(client, tokens[1], place.id, reason="not_existing")
    report(client, tokens[2], place.id, reason="not_existing")

    assert detail(client, place.id, admin).json()["report_reason"] == "not_existing"


def test_the_same_user_twice_counts_once(client, session, place):
    [token] = users(client, session, 1)
    report(client, token, place.id)

    response = report(client, token, place.id, reason="not_public")

    assert response.status_code == 409
    assert detail(client, place.id).json()["open_reports"] == 1


def test_hidden_exactly_at_three_users(client, session, place):
    tokens = users(client, session, 3)
    report(client, tokens[0], place.id)
    report(client, tokens[1], place.id)

    assert on_map(client, place.id)

    report(client, tokens[2], place.id)

    assert not on_map(client, place.id)
    assert detail(client, place.id).status_code == 404
    assert detail(client, place.id, tokens[0]).status_code == 404
    assert client.get("/api/search", params={"q": "Testplatte"}).json() == []


def test_an_admin_still_opens_a_reported_place(client, session, place, admin):
    for token in users(client, session, 3):
        report(client, token, place.id)

    body = detail(client, place.id, admin).json()

    assert body["open_reports"] == 3
    assert body["report_reason"] == "dangerous"
    meetups = client.get(f"/api/places/{place.id}/meetups", headers=auth_header(admin))
    assert meetups.status_code == 200
    ratings = client.get(f"/api/places/{place.id}/ratings", headers=auth_header(admin))
    assert ratings.status_code == 200


def test_an_admin_without_mfa_does_not_see_a_reported_place(client, session, place):
    for token in users(client, session, 3):
        report(client, token, place.id)
    token = register(client, nickname="Admin_Anna").json()["token"]
    set_admin(session, "Admin_Anna", True)

    assert detail(client, place.id, token).status_code == 404


def test_no_new_meetups_or_ratings_at_a_hidden_place_but_old_meetups_stay(
    client, session, place, admin
):
    tokens = users(client, session, 4)
    starts_at = (datetime.now(UTC) + timedelta(hours=3)).isoformat()
    meetup = create(client, tokens[3], place.id, starts_at=starts_at).json()
    for token in tokens[:3]:
        report(client, token, place.id)

    assert create(client, tokens[3], place.id).status_code == 404
    rating = client.put(
        f"/api/places/{place.id}/ratings/mine",
        json={"stars": 4, "reasons": ["table_good"]},
        headers=auth_header(tokens[3]),
    )
    assert rating.status_code == 404
    # A fourth user cannot report a Place they cannot see.
    assert report(client, tokens[3], place.id).status_code == 404
    listed = client.get(f"/api/places/{place.id}/meetups", headers=auth_header(admin)).json()
    assert [(m["id"], m["state"]) for m in listed] == [(meetup["id"], "upcoming")]


def test_a_normal_user_cannot_list_or_dismiss(client, session, place):
    [token] = users(client, session, 1)
    report(client, token, place.id)

    assert reported_list(client, token).status_code == 403
    assert dismiss(client, token, place.id).status_code == 403


def test_a_guest_and_an_admin_without_mfa_cannot_list_or_dismiss(client, session, place):
    token = register(client, nickname="Admin_Otto").json()["token"]
    set_admin(session, "Admin_Otto", True)

    assert reported_list(client, token).status_code == 403
    assert dismiss(client, token, place.id).status_code == 403
    assert client.get("/api/admin/place-reports").status_code == 401
    assert client.post(f"/api/admin/place-reports/{place.id}/dismiss").status_code == 401


def test_a_reported_suggestion_is_listed_but_not_hidden(client, session, admin):
    suggestion = suggest(client, user_token(client, session, "Steven")).json()["id"]
    for token in users(client, session, 3):
        report(client, token, suggestion)

    # A suggestion stays a suggestion (place_status.STATUS): still on the map.
    assert on_map(client, suggestion)
    [listed] = reported_list(client, admin).json()
    assert listed["id"] == suggestion
    assert listed["hidden"] is False


def test_the_admin_list_shows_reported_places_hidden_first(client, place, session, admin):
    from app.models import Place

    other = Place(
        name="Andere Platte",
        activity_type="table_tennis",
        location="SRID=4326;POINT(-30.6 0.6)",
    )
    session.add(other)
    session.commit()
    tokens = users(client, session, 3)
    report(client, tokens[0], other.id, reason="not_public")
    for token in tokens:
        report(client, token, place.id)

    body = reported_list(client, admin).json()

    assert [p["id"] for p in body] == [place.id, other.id]
    assert body[0]["hidden"] is True
    assert body[0]["reasons"] == {"dangerous": 3}
    assert body[1]["hidden"] is False
    assert body[1]["reasons"] == {"not_public": 1}


def test_dismiss_shows_the_place_again_and_users_may_report_again(client, session, place, admin):
    tokens = users(client, session, 3)
    for token in tokens:
        report(client, token, place.id)

    assert dismiss(client, admin, place.id).status_code == 204

    assert on_map(client, place.id)
    assert detail(client, place.id).json()["open_reports"] == 0
    assert reported_list(client, admin).json() == []
    assert report(client, tokens[0], place.id).status_code == 204
    assert on_map(client, place.id)


def test_dismiss_without_open_reports_is_a_conflict(client, place, admin):
    assert dismiss(client, admin, place.id).status_code == 409


def test_lock_makes_a_reported_place_a_locked_place(client, session, place, admin):
    for token in users(client, session, 3):
        report(client, token, place.id)

    assert lock(client, admin, place.id).status_code == 200

    assert reported_list(client, admin).json() == []
    locked = client.get("/api/admin/places/locked", headers=auth_header(admin)).json()
    assert [p["id"] for p in locked] == [place.id]
    # Lock closes the reports, so unlock shows the Place again.
    assert unlock(client, admin, place.id).status_code == 204
    assert on_map(client, place.id)


def test_deleting_the_account_deletes_the_users_reports(client, session, place):
    from tests.test_auth import PASSWORD

    [token] = users(client, session, 1)
    report(client, token, place.id)

    client.post(
        "/api/auth/delete-account", json={"password": PASSWORD}, headers=auth_header(token)
    )

    assert detail(client, place.id).json()["open_reports"] == 0
