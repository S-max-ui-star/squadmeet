import pytest

from app.geocoding import GeocodingHit, format_address, get_geocoder
from app.main import app
from app.models import AuditLog, Place
from tests.test_auth import auth_header, register

# Far away in the Atlantic, so imported OSM Places never fall into these areas.
INSIDE = Place(name="Innen", activity_type="basketball", location="SRID=4326;POINT(-30.5 0.5)")
OUTSIDE = Place(name="Außen", activity_type="basketball", location="SRID=4326;POINT(-29.5 0.5)")


def test_places_returns_only_places_inside_the_map_area(client, session):
    session.add_all([INSIDE, OUTSIDE])
    session.commit()

    response = client.get("/api/places", params={"bbox": "-31,0,-30,1"})

    assert response.status_code == 200
    assert [p["name"] for p in response.json()] == ["Innen"]
    assert response.json()[0]["lat"] == pytest.approx(0.5)
    assert response.json()[0]["lon"] == pytest.approx(-30.5)


@pytest.mark.parametrize("bbox", ["1,2,3", "a,b,c,d", "10,0,5,1", "0,0,200,1"])
def test_places_rejects_a_wrong_map_area(client, bbox):
    assert client.get("/api/places", params={"bbox": bbox}).status_code == 422


def test_places_needs_a_map_area(client):
    assert client.get("/api/places").status_code == 422


def test_the_database_rejects_an_unknown_activity_type(session):
    from sqlalchemy.exc import IntegrityError

    session.add(Place(name="Schach", activity_type="chess", location="SRID=4326;POINT(0 0)"))
    with pytest.raises(IntegrityError):
        session.flush()


def test_places_says_when_it_left_places_out(client, session, monkeypatch):
    monkeypatch.setattr("app.places.MAX_PLACES", 1)
    session.add_all(
        [
            Place(name="A", activity_type="football", location="SRID=4326;POINT(-30.5 0.5)"),
            Place(name="B", activity_type="football", location="SRID=4326;POINT(-30.4 0.5)"),
        ]
    )
    session.commit()

    response = client.get("/api/places", params={"bbox": "-31,0,-30,1"})

    assert len(response.json()) == 1
    assert response.headers["X-Places-Truncated"] == "true"


def test_places_has_no_truncated_header_when_all_places_fit(client):
    response = client.get("/api/places", params={"bbox": "-31,0,-30,1"})

    assert "X-Places-Truncated" not in response.headers


def test_the_model_declares_the_activity_type_check():
    names = {c.name for c in Place.__table__.constraints}

    assert "ck_place_activity_type" in names


def test_one_place_by_id(client, session):
    place = Place(name="Korb", activity_type="basketball", location="SRID=4326;POINT(-30.5 0.5)")
    session.add(place)
    session.commit()

    response = client.get(f"/api/places/{place.id}")

    assert response.status_code == 200
    assert response.json()["name"] == "Korb"
    assert response.json()["activity_type"] == "basketball"
    assert response.json()["lat"] == pytest.approx(0.5)


def test_an_unknown_place_is_404(client):
    assert client.get("/api/places/999999999").status_code == 404


@pytest.mark.parametrize("place_id", ["0", "-1", "99999999999"])
def test_an_id_outside_the_database_range_is_404(client, place_id):
    assert client.get(f"/api/places/{place_id}").status_code == 404


class FailingGeocoder:
    def search(self, query, limit=5):
        raise OSError("Nominatim is down")

    def reverse(self, lat, lon):
        raise TimeoutError()


class FakeGeocoder:
    def __init__(self, search_hits=None, address=None):
        self.search_hits = search_hits or []
        self.address = address
        self.reverse_calls = 0

    def search(self, query, limit=5):
        return self.search_hits

    def reverse(self, lat, lon):
        self.reverse_calls += 1
        return self.address


def test_search_finds_a_named_database_place(client, session):
    place = Place(
        name="Clara-Zetkin-Park",
        activity_type="table_tennis",
        location="SRID=4326;POINT(12.35 51.34)",
    )
    session.add(place)
    session.commit()

    response = client.get("/api/search", params={"q": "Zetkin"})

    assert response.status_code == 200
    assert response.json() == [
        {
            "kind": "place",
            "label": "Clara-Zetkin-Park",
            "lat": pytest.approx(51.34),
            "lon": pytest.approx(12.35),
            "place_id": place.id,
        }
    ]


def test_search_returns_no_hit_for_unknown_text(client):
    response = client.get("/api/search", params={"q": "ganz-sicher-unbekannt"})

    assert response.status_code == 200
    assert response.json() == []


def test_search_includes_an_address_hit(client):
    fake = FakeGeocoder([GeocodingHit("KarLi 20, Leipzig", 51.33, 12.37)])
    app.dependency_overrides[get_geocoder] = lambda: fake

    response = client.get("/api/search", params={"q": "Karl-Liebknecht-Str. 20"})

    assert response.json() == [
        {
            "kind": "address",
            "label": "KarLi 20, Leipzig",
            "lat": 51.33,
            "lon": 12.37,
            "place_id": None,
        }
    ]


def test_place_detail_fetches_and_stores_the_address_once(client, session):
    place = Place(name="Korb", activity_type="basketball", location="SRID=4326;POINT(12.3 51.3)")
    session.add(place)
    session.commit()
    fake = FakeGeocoder(address="Parkstraße 1, Leipzig")
    app.dependency_overrides[get_geocoder] = lambda: fake

    first = client.get(f"/api/places/{place.id}")
    second = client.get(f"/api/places/{place.id}")

    assert first.json()["address"] == "Parkstraße 1, Leipzig"
    assert second.json()["address"] == "Parkstraße 1, Leipzig"
    assert session.get(Place, place.id).address == "Parkstraße 1, Leipzig"
    assert fake.reverse_calls == 1


def test_nominatim_address_is_reduced_to_the_agreed_fields():
    answer = {
        "display_name": "Straße der Einheit, Büßleben, Erfurt, Thüringen, 99098, Deutschland",
        "address": {
            "road": "Straße der Einheit",
            "house_number": "12",
            "postcode": "99098",
            "city": "Erfurt",
            "suburb": "Büßleben",
            "state": "Thüringen",
            "country": "Deutschland",
        },
    }

    assert format_address(answer) == "Straße der Einheit 12, 99098 Erfurt, Ortsteil Büßleben"


def test_search_still_finds_database_places_when_the_geocoder_fails(client, session):
    session.add(
        Place(
            name="Zetkin-Platte",
            activity_type="table_tennis",
            location="SRID=4326;POINT(12.3 51.3)",
        )
    )
    session.commit()
    app.dependency_overrides[get_geocoder] = lambda: FailingGeocoder()

    response = client.get("/api/search", params={"q": "Zetkin-Platte"})

    assert response.status_code == 200
    assert [hit["label"] for hit in response.json()] == ["Zetkin-Platte"]


def test_place_detail_answers_without_address_when_the_geocoder_fails(client, session):
    place = Place(name="Korb", activity_type="basketball", location="SRID=4326;POINT(12.3 51.3)")
    session.add(place)
    session.commit()
    app.dependency_overrides[get_geocoder] = lambda: FailingGeocoder()

    response = client.get(f"/api/places/{place.id}")

    assert response.status_code == 200
    assert response.json()["address"] is None


def test_search_is_limited_per_ip(client):
    # Each search may ask Nominatim, which allows one request per second for the whole app.
    for _ in range(20):
        assert client.get("/api/search", params={"q": "Leipzig"}).status_code == 200

    assert client.get("/api/search", params={"q": "Leipzig"}).status_code == 429


def test_the_audit_log_does_not_show_who_opened_a_place(client, session):
    # SCRUM-70: the address is stored on the first open; that is a system change.
    token = register(client).json()["token"]
    place = Place(name="Korb", activity_type="basketball", location="SRID=4326;POINT(12.3 51.3)")
    session.add(place)
    session.commit()
    app.dependency_overrides[get_geocoder] = lambda: FakeGeocoder(address="Parkstraße 1")

    client.get(f"/api/places/{place.id}", headers=auth_header(token))

    [entry] = [
        row
        for row in session.query(AuditLog).filter_by(entity="place", entity_id=place.id)
        if row.action == "update"
    ]
    assert entry.changes == {"address": [None, "Parkstraße 1"]}
    assert (entry.actor_kind, entry.actor_id) == ("system", None)
