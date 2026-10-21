"""Import the public Places of a city from OpenStreetMap (SCRUM-21).

Two steps, so that a deploy or the demo never depends on a public Overpass server (they are
often too busy to answer):

    python -m app.osm_import fetch Leipzig   # Overpass -> data/osm/leipzig.json; commit the file
    python -m app.osm_import load            # data/osm/*.json -> database (new + refreshed Places)

`docker compose up` runs `load` through app/seed.py. The city is a parameter, so another city
is one more `fetch` (SCRUM-25). `load` can run any number of times: a Place keeps its OSM id,
so a second run adds no duplicates, and it never deletes a Place.
OSM data is © OpenStreetMap contributors, ODbL; the map shows the attribution.
"""

import json
import re
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import func, or_
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from app.activities import LABELS, ActivityType
from app.audit import write
from app.models import Place

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "osm"

# The main server first; the second one answers when the main one is too busy.
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)

# A German municipality name: letters, spaces, dots, hyphens and brackets ("Halle (Saale)").
# No quotes, so the name cannot break the Overpass query.
CITY_NAME = re.compile(r"^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .()-]*$")

# OSM sport=* values on a leisure=pitch, per Activity type.
SPORTS = {
    "table_tennis": ActivityType.TABLE_TENNIS,
    "basketball": ActivityType.BASKETBALL,
    "soccer": ActivityType.FOOTBALL,
    "beachvolleyball": ActivityType.BEACH_VOLLEYBALL,
    "beach_volleyball": ActivityType.BEACH_VOLLEYBALL,
}

# access=* values of places that are not open to everybody (clubs, schools, customers).
CLOSED_ACCESS = {"private", "customers", "members", "no", "permit", "students"}


def activity_types(tags: dict[str, str]) -> list[ActivityType]:
    """The Activity types of an OSM element. A pitch for two sports gives two Places."""
    if tags.get("leisure") == "fitness_station":
        return [ActivityType.OUTDOOR_FITNESS]
    if tags.get("leisure") != "pitch":
        return []
    found: list[ActivityType] = []
    for sport in tags.get("sport", "").split(";"):
        activity = SPORTS.get(sport.strip())
        if activity and activity not in found:
            found.append(activity)
    return found


def is_public(tags: dict[str, str]) -> bool:
    """A Place is public and free (CONTEXT.md): no closed access, no fee, not indoors."""
    return (
        tags.get("access", "yes") not in CLOSED_ACCESS
        and tags.get("fee", "no") != "yes"
        and tags.get("indoor", "no") != "yes"
    )


def places_from_overpass(elements: list[dict]) -> list[dict]:
    """Turns Overpass elements into Place rows, sorted, so a new fetch gives a small git diff."""
    places = []
    for element in elements:
        tags = element.get("tags", {})
        if not is_public(tags):
            continue
        # A node has its own position; a way or relation has the "center" that `out center` adds.
        point = element if "lat" in element else element.get("center")
        if point is None:
            continue
        for activity in activity_types(tags):
            places.append(
                {
                    "osm_id": f"{element['type']}/{element['id']}",
                    "activity_type": activity.value,
                    "name": tags.get("name") or LABELS[activity],
                    "lat": round(point["lat"], 7),
                    "lon": round(point["lon"], 7),
                }
            )
    return sorted(places, key=lambda p: (p["osm_id"], p["activity_type"]))


def check_city(city: str) -> None:
    if not CITY_NAME.fullmatch(city):
        raise ValueError(f"not a city name: {city!r} (letters, spaces, . - ( ) only)")


def snapshot_name(city: str) -> str:
    """The file name for a city: "Halle (Saale)" -> "halle-saale"."""
    name = city.lower()
    for umlaut, plain in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        name = name.replace(umlaut, plain)
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")


def check_answer(city: str, answer: dict) -> None:
    """Rejects an Overpass answer that is cut off or covers more than one municipality."""
    # A server that runs out of time still answers 200, with a "remark" and only some elements.
    if answer.get("remark"):
        raise RuntimeError(f"Overpass answer for {city} is incomplete: {answer['remark']}")
    # One municipality can be mapped twice (Stuttgart: as Stadtkreis and as Gemeinde); both
    # areas then carry the same official key, so count keys, not areas.
    keys = {
        e.get("tags", {}).get("de:regionalschluessel")
        for e in answer["elements"]
        if e["type"] == "area"
    }
    if len(keys) != 1:
        raise RuntimeError(
            f"{len(keys)} municipalities are called {city!r}; the import needs exactly one"
        )


def overpass_query(city: str) -> str:
    sports = "|".join(SPORTS)
    # de:regionalschluessel is set only on German municipalities, so "Leipzig" means the city.
    return f"""
[out:json][timeout:180];
area["name"="{city}"]["boundary"="administrative"]["de:regionalschluessel"]->.city;
.city out tags;
(
  nwr["leisure"="pitch"]["sport"~"(^|;)({sports})(;|$)"](area.city);
  nwr["leisure"="fitness_station"](area.city);
);
out center tags;
"""


def fetch(city: str) -> Path:
    """Asks Overpass for the Places of a city and writes them to data/osm/<city>.json."""
    check_city(city)
    body = urllib.parse.urlencode({"data": overpass_query(city)}).encode()
    last_error: Exception | None = None
    for url in OVERPASS_URLS:
        request = urllib.request.Request(url, data=body, headers={"User-Agent": "squadmeet/0.1"})
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                answer = json.load(response)
            check_answer(city, answer)
            break
        except Exception as error:  # a busy server answers 429/504, times out or cuts off
            print(f"{url}: {error}", file=sys.stderr)
            last_error = error
    else:
        raise RuntimeError(f"no Overpass server answered for {city}") from last_error

    places = places_from_overpass(answer["elements"])
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{snapshot_name(city)}.json"
    snapshot = {
        "city": city,
        "source": "© OpenStreetMap contributors, ODbL 1.0, openstreetmap.org/copyright",
        "osm_timestamp": answer.get("osm3s", {}).get("timestamp_osm_base"),
        "places": places,
    }
    path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n")
    print(f"{city}: {len(places)} Places -> {path}")
    return path


@dataclass(frozen=True)
class LoadResult:
    added: int  # Places that were not in the database yet
    refreshed: int  # Places that were there; name and location now match the snapshot
    kept: int  # OSM Places in the database that the snapshots no longer have; never deleted


def load(session: Session, files: list[Path] | None = None) -> LoadResult:
    """Puts the Places from the snapshot files into the database (SCRUM-25).

    A Place is known by its OSM id and Activity type, so running this twice adds no
    duplicates and keeps each Place's database id. It never deletes a Place: one that left
    OpenStreetMap may already have Ratings or Meetups.
    """
    rows = [
        row
        for path in (files if files is not None else sorted(DATA_DIR.glob("*.json")))
        for row in json.loads(path.read_text())["places"]
    ]
    # (osm id, Activity type) -> (name, WKT) before the import, for the audit log (SCRUM-66).
    before = {
        (osm_id, activity_type): (name, point(lon, lat))
        for osm_id, activity_type, name, lon, lat in session.exec(
            select(
                Place.osm_id,
                Place.activity_type,
                Place.name,
                func.ST_X(Place.location),
                func.ST_Y(Place.location),
            ).where(Place.osm_id.is_not(None))
        )
    }
    known = set(before)
    in_snapshots = {(row["osm_id"], row["activity_type"]) for row in rows}
    if rows:
        statement = insert(Place.__table__).values(
            [
                {
                    "name": row["name"],
                    "activity_type": row["activity_type"],
                    "osm_id": row["osm_id"],
                    "location": f"SRID=4326;POINT({row['lon']} {row['lat']})",
                }
                for row in rows
            ]
        )
        table = Place.__table__
        # Only a changed Place is updated (SCRUM-70); the others are not written again, so
        # RETURNING gives the new and the changed Places only.
        ids = session.exec(
            statement.on_conflict_do_update(
                constraint="uq_place_osm_id_activity_type",
                set_={"name": statement.excluded.name, "location": statement.excluded.location},
                where=or_(
                    table.c.name.is_distinct_from(statement.excluded.name),
                    table.c.location.is_distinct_from(statement.excluded.location),
                ),
            ).returning(Place.id, Place.osm_id, Place.activity_type)
        ).all()
        log_changes(session, rows, before, {(osm_id, kind): id for id, osm_id, kind in ids})
        session.commit()
    return LoadResult(
        added=len(in_snapshots - known),
        refreshed=len(in_snapshots & known),
        kept=len(known - in_snapshots),
    )


def point(lon: float, lat: float) -> str:
    return f"POINT({float(lon)} {float(lat)})"


def log_changes(session: Session, rows: list[dict], before: dict, ids: dict) -> None:
    """Audit rows for new Places and for Places whose name or location changed, in one
    statement. The import runs on each deploy; an unchanged Place is not written or logged."""
    entries = []
    for row in rows:
        key = (row["osm_id"], row["activity_type"])
        name, location = row["name"], point(row["lon"], row["lat"])
        if key not in before:
            entries.append(
                (
                    "place",
                    ids[key],
                    "insert",
                    {"name": name, "activity_type": key[1], "osm_id": key[0], "location": location},
                )
            )
            continue
        old = dict(zip(("name", "location"), before[key]))
        changes = {
            field: [old[field], new]
            for field, new in (("name", name), ("location", location))
            if old[field] != new
        }
        if changes:
            entries.append(("place", ids[key], "update", changes))
    write(session, entries)


def main(args: list[str]) -> None:
    if len(args) == 2 and args[0] == "fetch":
        fetch(args[1])
    elif args == ["load"]:
        from app.db import engine

        with Session(engine) as session:
            print(f"OSM import: {load(session)}")
    else:
        sys.exit("usage: python -m app.osm_import fetch <City> | load")


if __name__ == "__main__":
    main(sys.argv[1:])
