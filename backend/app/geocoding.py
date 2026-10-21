"""Small Nominatim client for user-triggered search and one-time Place addresses (SCRUM-52).

The public service permits moderate, user-triggered searches, but no autocomplete and at most
one request per second for the whole application. Requests therefore go through this one backend
client, are spaced one second apart and cached. A successfully reverse-geocoded Place address is
additionally stored in PostgreSQL by the Place detail endpoint.

The lock guards only the cache and the next free slot, never the network call, so a cached
answer never waits for a slow one (SCRUM-70). A request that would wait too long, and every
request for a while after an error, fails at once with OSError; the callers answer without it.
"""

import json
import os
import threading
import time
import urllib.parse
import urllib.request
from collections import OrderedDict
from dataclasses import dataclass


@dataclass(frozen=True)
class GeocodingHit:
    label: str
    lat: float
    lon: float


# Each answer is small, but every new search text is one more entry.
CACHE_SIZE = 1000
# Nominatim allows one request per second for the whole application.
SECONDS_BETWEEN_REQUESTS = 1.0
# A request further back in the line gives up; the search still shows the database Places.
MAX_WAIT_SECONDS = 3.0
# After an error (Nominatim down or too busy), do not ask for this long.
PAUSE_AFTER_ERROR_SECONDS = 60.0
SEARCH_TIMEOUT_SECONDS = 10
# The Place detail waits for the address, so give up earlier.
REVERSE_TIMEOUT_SECONDS = 3


STREET_KEYS = ("road", "pedestrian", "footway", "path", "cycleway", "residential", "square")
CITY_KEYS = ("city", "town", "village", "municipality")
DISTRICT_KEYS = ("city_district", "suburb", "quarter", "neighbourhood")


def first_value(address: dict, keys: tuple[str, ...]) -> str | None:
    return next((address[key] for key in keys if address.get(key)), None)


def format_address(answer: dict) -> str | None:
    """Compact German address: street, postcode/city and district; no state or country."""
    address = answer.get("address") or {}
    street = first_value(address, STREET_KEYS)
    house_number = address.get("house_number")
    city = first_value(address, CITY_KEYS)
    postcode = address.get("postcode")
    district = first_value(address, DISTRICT_KEYS)

    street_line = " ".join(value for value in (street, house_number) if value)
    city_line = " ".join(value for value in (postcode, city) if value)
    parts = [value for value in (street_line, city_line) if value]
    if district and district != city:
        parts.append(f"Ortsteil {district}")
    return ", ".join(parts) or answer.get("display_name")


class NominatimGeocoder:
    def __init__(self):
        # Configurable so production can switch providers without a client release, as required
        # by the public Nominatim usage policy.
        self.base_url = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org").rstrip("/")
        self.user_agent = os.getenv(
            "NOMINATIM_USER_AGENT", "SquadMeet/1.0 (https://squadmeet.duckdns.org)"
        )
        self._cache: OrderedDict[str, object] = OrderedDict()
        self._lock = threading.Lock()
        self._next_slot = 0.0
        self._paused_until = 0.0

    def _get(self, path: str, params: dict[str, str], timeout: float) -> object:
        url = f"{self.base_url}/{path}?{urllib.parse.urlencode(params)}"
        with self._lock:
            if url in self._cache:
                self._cache.move_to_end(url)
                return self._cache[url]
            now = time.monotonic()
            if now < self._paused_until:
                raise OSError("Nominatim is paused after an error")
            start = max(now, self._next_slot)
            if start - now > MAX_WAIT_SECONDS:
                raise OSError("too many Nominatim requests waiting")
            self._next_slot = start + SECONDS_BETWEEN_REQUESTS
        if start > now:
            time.sleep(start - now)
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "application/json",
                "Accept-Language": "de",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                answer = json.load(response)
        except (OSError, ValueError):
            with self._lock:
                self._paused_until = time.monotonic() + PAUSE_AFTER_ERROR_SECONDS
            raise
        with self._lock:
            self._cache[url] = answer
            while len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
        return answer

    def search(self, query: str, limit: int = 5) -> list[GeocodingHit]:
        answer = self._get(
            "search",
            {
                "q": query,
                "format": "jsonv2",
                "addressdetails": "0",
                "countrycodes": "de",
                "limit": str(limit),
            },
            SEARCH_TIMEOUT_SECONDS,
        )
        return [
            GeocodingHit(label=item["display_name"], lat=float(item["lat"]), lon=float(item["lon"]))
            for item in answer
            if item.get("display_name") and item.get("lat") and item.get("lon")
        ]

    def reverse(self, lat: float, lon: float) -> str | None:
        answer = self._get(
            "reverse",
            {
                "lat": str(lat),
                "lon": str(lon),
                "format": "jsonv2",
                "addressdetails": "1",
                "zoom": "18",
            },
            REVERSE_TIMEOUT_SECONDS,
        )
        if not isinstance(answer, dict):
            return None
        return format_address(answer)


geocoder = NominatimGeocoder()


def get_geocoder() -> NominatimGeocoder:
    return geocoder
