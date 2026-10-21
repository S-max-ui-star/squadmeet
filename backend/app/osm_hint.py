"""The OSM hint for the Admin approval of a Place suggestion (SCRUM-56).

Overpass says which OSM areas contain the suggested point. A building, private land or a
residential area is a hint that the Place may be invented or not public. It is **only a hint**
for the Admin and never blocks anything: Overpass is often too busy (504) or out of date, so an
error only means "no hint" (decision of 2026-10-12, HANDOFF.md).
"""

import json
import time
import urllib.parse
import urllib.request

from app.osm_import import CLOSED_ACCESS, OVERPASS_URLS

# One point needs one small query; the Admin list waits for it, so give up early.
TIMEOUT_SECONDS = 10
# After all servers failed, do not ask again for this long (SCRUM-70): the Admin list asks once
# per waiting suggestion, and each try could wait TIMEOUT_SECONDS per server.
PAUSE_AFTER_ERROR_SECONDS = 60.0
# The order the Admin reads them in.
HINTS = ("building", "private", "residential")


def overpass_query(lat: float, lon: float) -> str:
    # is_in finds the areas (closed ways and relations) that contain the point.
    return f"""
[out:json][timeout:{TIMEOUT_SECONDS}];
is_in({lat},{lon})->.a;
area.a[~"^(building|landuse|access)$"~"."];
out tags;
"""


def hints_from_answer(answer: dict) -> list[str]:
    """The hints in an Overpass answer, in HINTS order; [] when none applies. A broken answer
    (no elements, or a runtime error such as a timeout) is a ValueError."""
    if "error" in answer.get("remark", "") or not isinstance(answer.get("elements"), list):
        raise ValueError(f"Overpass answered without a result: {answer.get('remark')}")
    found = set()
    for element in answer["elements"]:
        tags = element.get("tags", {})
        if tags.get("building", "no") != "no":
            found.add("building")
        if tags.get("access") in CLOSED_ACCESS:
            found.add("private")
        if tags.get("landuse") == "residential":
            found.add("residential")
    return [hint for hint in HINTS if hint in found]


class OverpassHinter:
    def __init__(self):
        self._paused_until = 0.0

    def hints(self, lat: float, lon: float) -> list[str]:
        """Ask the Overpass servers in turn; raise the last error when none answers. After that,
        raise at once for PAUSE_AFTER_ERROR_SECONDS."""
        if time.monotonic() < self._paused_until:
            raise OSError("Overpass is paused after an error")
        body = urllib.parse.urlencode({"data": overpass_query(lat, lon)}).encode()
        last_error: Exception = OSError("no Overpass server")
        for url in OVERPASS_URLS:
            request = urllib.request.Request(url, data=body, headers={"User-Agent": "squadmeet/0.1"})
            try:
                with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                    return hints_from_answer(json.load(response))
            except (OSError, TimeoutError, ValueError) as error:
                last_error = error
        self._paused_until = time.monotonic() + PAUSE_AFTER_ERROR_SECONDS
        raise last_error


hinter = OverpassHinter()


def get_osm_hinter() -> OverpassHinter:
    return hinter
