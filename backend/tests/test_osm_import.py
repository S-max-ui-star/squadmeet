import json

import pytest
from sqlalchemy import func, text
from sqlmodel import select

from app.activities import ActivityType
from app.models import Place
from app.osm_import import (
    activity_types,
    check_answer,
    check_city,
    is_public,
    load,
    places_from_overpass,
    snapshot_name,
)


@pytest.mark.parametrize(
    ("tags", "expected"),
    [
        ({"leisure": "pitch", "sport": "table_tennis"}, [ActivityType.TABLE_TENNIS]),
        ({"leisure": "pitch", "sport": "basketball"}, [ActivityType.BASKETBALL]),
        ({"leisure": "pitch", "sport": "soccer"}, [ActivityType.FOOTBALL]),
        ({"leisure": "pitch", "sport": "beachvolleyball"}, [ActivityType.BEACH_VOLLEYBALL]),
        ({"leisure": "fitness_station"}, [ActivityType.OUTDOOR_FITNESS]),
        # One pitch for two sports gives two Places.
        (
            {"leisure": "pitch", "sport": "soccer;basketball"},
            [ActivityType.FOOTBALL, ActivityType.BASKETBALL],
        ),
        ({"leisure": "pitch", "sport": "tennis"}, []),
        ({"leisure": "park", "sport": "soccer"}, []),
        ({"leisure": "pitch"}, []),
    ],
)
def test_osm_tags_map_to_activity_types(tags, expected):
    assert activity_types(tags) == expected


@pytest.mark.parametrize(
    "tags",
    [
        {"access": "private"},
        {"access": "customers"},
        {"access": "members"},
        {"fee": "yes"},
        {"indoor": "yes"},
    ],
)
def test_private_paid_and_indoor_places_are_skipped(tags):
    assert not is_public(tags)


def test_places_without_access_tags_are_public():
    assert is_public({"leisure": "pitch", "sport": "soccer"})


def test_places_from_overpass_uses_node_position_and_way_center():
    elements = [
        {
            "type": "way",
            "id": 2,
            "center": {"lat": 51.2, "lon": 12.2},
            "tags": {"leisure": "pitch", "sport": "basketball", "name": "Korbanlage"},
        },
        {"type": "node", "id": 1, "lat": 51.1, "lon": 12.1, "tags": {"leisure": "fitness_station"}},
        {
            "type": "node",
            "id": 3,
            "lat": 51.3,
            "lon": 12.3,
            "tags": {"leisure": "pitch", "sport": "soccer", "access": "private"},
        },
    ]

    assert places_from_overpass(elements) == [
        {
            "osm_id": "node/1",
            "activity_type": "outdoor_fitness",
            "name": "Outdoor-Fitness",
            "lat": 51.1,
            "lon": 12.1,
        },
        {
            "osm_id": "way/2",
            "activity_type": "basketball",
            "name": "Korbanlage",
            "lat": 51.2,
            "lon": 12.2,
        },
    ]


def test_the_leipzig_snapshot_has_places_for_every_activity_type():
    from app.osm_import import DATA_DIR

    places = json.loads((DATA_DIR / "leipzig.json").read_text())["places"]

    assert {p["activity_type"] for p in places} == {a.value for a in ActivityType}


AREA = {"type": "area", "id": 3600062649, "tags": {"de:regionalschluessel": "147130000000"}}


def test_an_incomplete_overpass_answer_is_rejected():
    answer = {"remark": "runtime error: Query timed out", "elements": [AREA]}

    with pytest.raises(RuntimeError, match="incomplete"):
        check_answer("Leipzig", answer)


OTHER_TOWN = {"type": "area", "id": 1, "tags": {"de:regionalschluessel": "073390000000"}}


@pytest.mark.parametrize("areas", [[], [AREA, OTHER_TOWN]])
def test_a_city_name_must_match_exactly_one_municipality(areas):
    with pytest.raises(RuntimeError, match="municipalities"):
        check_answer("Neustadt", {"elements": areas})


def test_one_municipality_mapped_twice_is_fine():
    # Stuttgart: the Stadtkreis and the Gemeinde are two areas with the same official key.
    same_key = {"type": "area", "id": 3602793104, "tags": AREA["tags"]}

    check_answer("Stuttgart", {"elements": [AREA, same_key]})


def test_a_complete_answer_for_one_municipality_passes():
    check_answer("Leipzig", {"elements": [AREA]})


@pytest.mark.parametrize("city", ['Leip"zig', "Leipzig;", "", "../x"])
def test_city_names_that_could_break_the_query_are_rejected(city):
    with pytest.raises(ValueError):
        check_city(city)


@pytest.mark.parametrize(
    ("city", "file"),
    [("Leipzig", "leipzig"), ("Halle (Saale)", "halle-saale"), ("Lübben", "luebben")],
)
def test_snapshot_file_names_are_plain(city, file):
    check_city(city)
    assert snapshot_name(city) == file


def snapshot(tmp_path, *rows):
    path = tmp_path / "test.json"
    path.write_text(json.dumps({"places": list(rows)}))
    return path


def row(osm_id, activity_type="basketball", name="Korb", lat=1.0, lon=2.0):
    return {"osm_id": osm_id, "activity_type": activity_type, "name": name, "lat": lat, "lon": lon}


def places_by_osm_id(session):
    return {p.osm_id: p for p in session.exec(select(Place).where(Place.osm_id.like("test/%")))}


def test_running_the_import_twice_adds_no_duplicates(session, tmp_path):
    file = snapshot(tmp_path, row("test/1"), row("test/2", "football"))

    # `kept` counts the real OSM Places already in the test database, so it is not compared.
    first = load(session, [file])
    assert (first.added, first.refreshed) == (2, 0)
    first_ids = {key: p.id for key, p in places_by_osm_id(session).items()}
    second = load(session, [file])
    assert (second.added, second.refreshed) == (0, 2)

    # Same Places, same database ids: Ratings and Meetups keep pointing to them.
    assert {key: p.id for key, p in places_by_osm_id(session).items()} == first_ids


def test_a_second_run_refreshes_name_and_location(session, tmp_path):
    load(session, [snapshot(tmp_path, row("test/1", name="Alt", lat=1.0))])

    load(session, [snapshot(tmp_path, row("test/1", name="Neu", lat=1.5))])

    place = places_by_osm_id(session)["test/1"]
    session.refresh(place)
    assert place.name == "Neu"
    assert session.exec(select(func.ST_Y(Place.location)).where(Place.id == place.id)).one() == 1.5


def test_a_new_city_file_loads_into_a_database_that_has_places(session, tmp_path):
    load(session, [snapshot(tmp_path, row("test/1"))])
    other_city = tmp_path / "other.json"
    other_city.write_text(json.dumps({"places": [row("test/2")]}))

    result = load(session, [snapshot(tmp_path, row("test/1")), other_city])

    assert result.added == 1
    assert set(places_by_osm_id(session)) == {"test/1", "test/2"}


def test_a_place_that_left_openstreetmap_is_not_deleted(session, tmp_path):
    # It may already have Ratings or Meetups (SCRUM-25).
    load(session, [snapshot(tmp_path, row("test/1"), row("test/2"))])

    result = load(session, [snapshot(tmp_path, row("test/1"))])

    assert result.kept >= 1
    assert "test/2" in places_by_osm_id(session)


def test_every_city_snapshot_loads_without_duplicates(session):
    from app.osm_import import DATA_DIR

    files = sorted(DATA_DIR.glob("*.json"))
    cities = {json.loads(f.read_text())["city"] for f in files}
    assert {"Leipzig", "Erfurt", "Hannover", "Stuttgart", "Potsdam"} <= cities
    keys = [
        (r["osm_id"], r["activity_type"])
        for f in files
        for r in json.loads(f.read_text())["places"]
    ]
    assert len(keys) == len(set(keys))


def row_version(session, osm_id):
    """The physical row: an UPDATE writes a new one, even inside one transaction."""
    statement = text("SELECT ctid FROM place WHERE osm_id = :id").bindparams(id=osm_id)
    return session.exec(statement).one()


def test_a_second_run_does_not_rewrite_unchanged_places(session, tmp_path):
    # SCRUM-70: each deploy rewrote all 2541 Places.
    load(session, [snapshot(tmp_path, row("test/1"), row("test/2", name="Alt"))])
    unchanged, renamed = row_version(session, "test/1"), row_version(session, "test/2")

    load(session, [snapshot(tmp_path, row("test/1"), row("test/2", name="Neu"))])

    assert row_version(session, "test/1") == unchanged
    assert row_version(session, "test/2") != renamed
