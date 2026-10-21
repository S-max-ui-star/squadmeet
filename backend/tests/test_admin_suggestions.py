"""Admin approval of Place suggestions (SCRUM-56): the list of waiting suggestions with the OSM
hint, approve after 24 h, reject."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import select

from app.main import app
from app.models import Place, PlaceReport
from app.osm_hint import get_osm_hinter, hints_from_answer
from tests.test_admin_places import admin  # noqa: F401 (fixture)
from tests.test_auth import auth_header, register
from tests.test_place_reports import report, users
from tests.test_suggestions import confirm, suggest, user_token

BBOX = {"bbox": "-31,0,-30,1"}


class FakeHinter:
    def __init__(self, answer=(), error=None):
        self.answer = list(answer)
        self.error = error
        self.calls = 0

    def hints(self, lat, lon):
        self.calls += 1
        if self.error:
            raise self.error
        return self.answer


@pytest.fixture
def hinter(client):
    fake = FakeHinter(["building"])
    app.dependency_overrides[get_osm_hinter] = lambda: fake
    return fake


@pytest.fixture
def waiting(client, session):
    """A Place suggestion with 3 Confirmations, suggested 2 days ago."""
    first = user_token(client, session, "Steven")
    place_id = suggest(client, first, name="Platte im Hof").json()["id"]
    for nickname in ("Stefan", "Dominik"):
        assert confirm(client, user_token(client, session, nickname), place_id).status_code == 200
    suggested_ago(session, place_id, timedelta(days=2))
    return place_id


def suggested_ago(session, place_id, age):
    place = session.get(Place, place_id)
    place.suggested_at = datetime.now(UTC) - age
    session.commit()


def waiting_list(client, token):
    return client.get("/api/admin/place-suggestions", headers=auth_header(token))


def approve(client, token, place_id):
    return client.post(
        f"/api/admin/place-suggestions/{place_id}/approve", headers=auth_header(token)
    )


def reject(client, token, place_id):
    return client.post(
        f"/api/admin/place-suggestions/{place_id}/reject", headers=auth_header(token)
    )


def test_a_normal_user_gets_403(client, session, waiting):
    token = user_token(client, session, "Paula")

    assert waiting_list(client, token).status_code == 403
    assert approve(client, token, waiting).status_code == 403
    assert reject(client, token, waiting).status_code == 403


def test_an_admin_without_mfa_gets_403_and_a_guest_401(client, session, waiting):
    from app.admin import set_admin

    token = register(client, nickname="Admin_Otto").json()["token"]
    set_admin(session, "Admin_Otto", True)

    assert waiting_list(client, token).status_code == 403
    assert client.get("/api/admin/place-suggestions").status_code == 401


def test_the_list_shows_waiting_suggestions_with_position_confirmations_and_hint(
    client, session, admin, waiting, hinter
):
    young = suggest(client, user_token(client, session, "Paula")).json()["id"]

    listed = waiting_list(client, admin).json()

    assert [s["id"] for s in listed] == [waiting]
    item = listed[0]
    assert item["name"] == "Platte im Hof"
    assert (round(item["lat"], 3), round(item["lon"], 3)) == (0.5, -30.5)
    assert item["confirmations"] == 3
    assert item["osm_hints"] == ["building"]
    assert item["approvable"] is True
    assert young not in [s["id"] for s in listed]


def test_the_hint_is_stored_so_overpass_is_asked_only_once(client, admin, waiting, hinter):
    waiting_list(client, admin)
    waiting_list(client, admin)

    assert hinter.calls == 1


def test_no_hint_found_is_an_empty_list(client, admin, waiting):
    fake = FakeHinter([])
    app.dependency_overrides[get_osm_hinter] = lambda: fake

    assert waiting_list(client, admin).json()[0]["osm_hints"] == []


@pytest.mark.parametrize("error", [OSError("504"), TimeoutError(), ValueError("no JSON")])
def test_an_overpass_failure_gives_no_hint_and_does_not_block(
    client, session, admin, waiting, error
):
    fake = FakeHinter(error=error)
    app.dependency_overrides[get_osm_hinter] = lambda: fake

    response = waiting_list(client, admin)

    assert response.status_code == 200
    assert response.json()[0]["osm_hints"] is None
    assert session.get(Place, waiting).osm_hints is None
    # Not stored, so the next list asks again.
    waiting_list(client, admin)
    assert fake.calls == 2
    assert approve(client, admin, waiting).status_code == 204


def test_approval_before_24_h_is_rejected(client, session, admin, waiting):
    suggested_ago(session, waiting, timedelta(hours=23, minutes=59))

    response = approve(client, admin, waiting)

    assert response.status_code == 409
    assert "24 Stunden" in response.json()["detail"]
    assert waiting_list(client, admin).json()[0]["approvable"] is False
    assert client.get(f"/api/places/{waiting}").json()["waiting_for_admin"] is True


def test_approval_after_24_h_makes_the_place_active(client, session, admin, waiting):
    suggested_ago(session, waiting, timedelta(hours=24))

    assert approve(client, admin, waiting).status_code == 204

    read = client.get(f"/api/places/{waiting}").json()
    assert (read["is_suggestion"], read["waiting_for_admin"], read["confirmations"]) == (
        False,
        False,
        3,
    )
    assert waiting_list(client, admin).json() == []
    host = user_token(client, session, "Paula")
    assert (
        client.post("/api/meetups", json={"place_id": waiting}, headers=auth_header(host))
        .status_code
        == 201
    )


def test_reject_removes_the_suggestion(client, admin, waiting):
    assert reject(client, admin, waiting).status_code == 204

    assert client.get(f"/api/places/{waiting}").status_code == 404
    assert all(p["id"] != waiting for p in client.get("/api/places", params=BBOX).json())
    assert waiting_list(client, admin).json() == []
    assert approve(client, admin, waiting).status_code == 404


def test_the_list_shows_the_open_reports(client, session, admin, waiting, hinter):
    for token in users(client, session, 2):
        report(client, token, waiting)

    [item] = waiting_list(client, admin).json()

    assert item["open_reports"] == 2


def test_approve_closes_the_open_reports_so_the_place_stays_on_the_map(
    client, session, admin, waiting
):
    for token in users(client, session, 3):
        report(client, token, waiting)
    suggested_ago(session, waiting, timedelta(days=2))

    assert approve(client, admin, waiting).status_code == 204

    assert any(p["id"] == waiting for p in client.get("/api/places", params=BBOX).json())
    assert client.get(f"/api/places/{waiting}").json()["open_reports"] == 0


def test_reject_closes_the_open_reports(client, session, admin, waiting):
    [token] = users(client, session, 1)
    report(client, token, waiting)

    assert reject(client, admin, waiting).status_code == 204

    still_open = session.exec(
        select(PlaceReport).where(PlaceReport.place_id == waiting, PlaceReport.closed_at.is_(None))
    ).all()
    assert still_open == []


def test_only_a_waiting_suggestion_can_be_approved_or_rejected(client, session, admin):
    young = suggest(client, user_token(client, session, "Paula")).json()["id"]
    suggested_ago(session, young, timedelta(days=2))

    assert approve(client, admin, young).status_code == 409
    assert reject(client, admin, young).status_code == 409
    assert approve(client, admin, 999_999_999).status_code == 404


def test_a_locked_waiting_suggestion_is_not_listed_or_approved(client, admin, waiting):
    client.post(f"/api/admin/places/{waiting}/lock", headers=auth_header(admin))

    assert waiting_list(client, admin).json() == []
    assert approve(client, admin, waiting).status_code == 409


@pytest.mark.parametrize(
    ("tags", "expected"),
    [
        ([{"building": "yes"}], ["building"]),
        ([{"landuse": "residential"}], ["residential"]),
        ([{"access": "private", "leisure": "park"}], ["private"]),
        (
            [{"landuse": "residential"}, {"building": "house", "access": "private"}],
            ["building", "private", "residential"],
        ),
        ([{"leisure": "park"}, {"boundary": "administrative", "name": "Leipzig"}], []),
        ([{"building": "no"}, {"access": "yes"}], []),
        ([], []),
    ],
)
def test_hints_from_an_overpass_answer(tags, expected):
    answer = {"elements": [{"type": "area", "id": n, "tags": t} for n, t in enumerate(tags)]}

    assert hints_from_answer(answer) == expected


def test_a_broken_overpass_answer_is_an_error():
    with pytest.raises(ValueError):
        hints_from_answer({"remark": "runtime error: timeout"})
