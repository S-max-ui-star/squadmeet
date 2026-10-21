import io
import json
import threading
import time

import pytest

from app.geocoding import NominatimGeocoder


class JsonResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def response(value):
    return JsonResponse(json.dumps(value).encode())


def test_repeated_search_uses_the_cache(monkeypatch):
    requests = []

    def fake_urlopen(request, timeout):
        requests.append((request, timeout))
        return response([])

    monkeypatch.setattr("app.geocoding.urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr("app.geocoding.time.monotonic", lambda: 10.0)
    geocoder = NominatimGeocoder()

    geocoder.search("Clara-Zetkin-Park")
    geocoder.search("Clara-Zetkin-Park")

    assert len(requests) == 1
    assert requests[0][0].get_header("User-agent").startswith("SquadMeet/")


def test_different_provider_requests_are_at_least_one_second_apart(monkeypatch):
    # First request: starts at 10.0. Second request arrives at 10.25 and must wait 0.75 s.
    clock = iter([10.0, 10.25])
    sleeps = []
    monkeypatch.setattr("app.geocoding.time.monotonic", lambda: next(clock))
    monkeypatch.setattr("app.geocoding.time.sleep", sleeps.append)
    monkeypatch.setattr(
        "app.geocoding.urllib.request.urlopen", lambda request, timeout: response([])
    )
    geocoder = NominatimGeocoder()

    geocoder.search("Leipzig")
    geocoder.search("Plauen")

    assert sleeps == [pytest.approx(0.75)]


def test_a_cached_search_does_not_wait_for_a_slow_request(monkeypatch):
    # SCRUM-70: the lock was held during the network call.
    def fake_urlopen(request, timeout):
        if "langsam" in request.full_url:
            time.sleep(0.5)
        return response([])

    monkeypatch.setattr("app.geocoding.urllib.request.urlopen", fake_urlopen)
    geocoder = NominatimGeocoder()
    geocoder.search("schnell")
    geocoder._next_slot = 0.0
    slow = threading.Thread(target=geocoder.search, args=("langsam",))
    slow.start()
    time.sleep(0.1)

    start = time.monotonic()
    geocoder.search("schnell")
    waited = time.monotonic() - start
    slow.join()

    assert waited < 0.2


def test_the_cache_keeps_only_the_newest_answers(monkeypatch):
    monkeypatch.setattr("app.geocoding.CACHE_SIZE", 2)
    monkeypatch.setattr("app.geocoding.time.sleep", lambda seconds: None)
    monkeypatch.setattr(
        "app.geocoding.urllib.request.urlopen", lambda request, timeout: response([])
    )
    geocoder = NominatimGeocoder()

    for query in ("eins", "zwei", "drei"):
        geocoder.search(query)

    assert len(geocoder._cache) == 2


def test_after_an_error_nominatim_is_not_asked_for_a_while(monkeypatch):
    requests = []

    def failing_urlopen(request, timeout):
        requests.append(request)
        raise OSError("503")

    monkeypatch.setattr("app.geocoding.urllib.request.urlopen", failing_urlopen)
    monkeypatch.setattr("app.geocoding.time.sleep", lambda seconds: None)
    geocoder = NominatimGeocoder()

    with pytest.raises(OSError):
        geocoder.search("Leipzig")
    with pytest.raises(OSError):
        geocoder.reverse(51.3, 12.3)

    assert len(requests) == 1


def test_a_request_that_would_wait_too_long_gives_up(monkeypatch):
    # Many searches at once would queue up behind each other, one second each.
    monkeypatch.setattr("app.geocoding.time.monotonic", lambda: 10.0)
    monkeypatch.setattr(
        "app.geocoding.urllib.request.urlopen", lambda request, timeout: response([])
    )
    geocoder = NominatimGeocoder()
    geocoder._next_slot = 20.0

    with pytest.raises(OSError):
        geocoder.search("Leipzig")


def test_the_address_lookup_has_a_short_timeout(monkeypatch):
    # The Place detail waits for it.
    timeouts = []

    def fake_urlopen(request, timeout):
        timeouts.append(timeout)
        return response({})

    monkeypatch.setattr("app.geocoding.urllib.request.urlopen", fake_urlopen)
    NominatimGeocoder().reverse(51.3, 12.3)

    assert timeouts == [3]
