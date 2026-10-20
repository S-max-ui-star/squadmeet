"""Photos (SCRUM-42): a user uploads a Photo of a Place, an Admin approves or rejects it. Only
approved Photos are visible; the server stores them as JPEG without EXIF."""

import time
from datetime import UTC, datetime
from io import BytesIO
from urllib.parse import parse_qs, urlsplit

import pytest
from PIL import Image
from sqlmodel import select

from app.models import Photo, Place, User
from app.photo_storage import LINK_SECONDS, LocalPhotoStorage, get_photo_storage, photos_enabled
from app.photos import MAX_BYTES, MAX_PENDING, MAX_SIDE
from app.main import app
from tests.test_admin_places import admin, lock  # noqa: F401 (fixture)
from tests.test_auth import auth_header, register
from tests.test_meetups import host, place  # noqa: F401 (fixture)
from tests.test_delete_account import delete_account

# EXIF tags: the camera maker, the orientation, the GPS block.
MAKE, ORIENTATION, GPS = 0x010F, 0x0112, 0x8825


class MemoryStorage:
    def __init__(self):
        self.files: dict[str, bytes] = {}

    def put(self, key, data):
        self.files[key] = data

    def delete(self, key):
        self.files.pop(key, None)

    def url(self, key):
        return f"https://photos.example/{key}?signed"


@pytest.fixture
def storage(client):
    storage = MemoryStorage()
    app.dependency_overrides[get_photo_storage] = lambda: storage
    app.dependency_overrides[photos_enabled] = lambda: True
    return storage


@pytest.fixture
def switched_off(storage):
    """The switch PHOTOS_ENABLED is off (SCRUM-94), although a storage is there."""
    app.dependency_overrides[photos_enabled] = lambda: False
    return storage


def image_bytes(size=(800, 600), fmt="JPEG", exif=None, color="green"):
    buffer = BytesIO()
    image = Image.new("RGB", size, color)
    image.save(buffer, fmt, **({"exif": exif} if exif is not None else {}))
    return buffer.getvalue()


def camera_exif(orientation=1):
    exif = Image.Exif()
    exif[MAKE] = "Testkamera"
    exif[ORIENTATION] = orientation
    exif.get_ifd(GPS)[2] = (51.0, 20.0, 0.0)  # GPSLatitude
    return exif


def upload(client, token, place_id, data=None, filename="foto.jpg", content_type="image/jpeg"):
    files = {"file": (filename, data if data is not None else image_bytes(), content_type)}
    return client.post(
        f"/api/places/{place_id}/photos",
        files=files,
        headers=auth_header(token) if token else {},
    )


def public_list(client, place_id, token=None):
    return client.get(
        f"/api/places/{place_id}/photos", headers=auth_header(token) if token else {}
    )


def queue(client, token):
    return client.get("/api/admin/photos", headers=auth_header(token))


def approve(client, token, photo_id):
    return client.post(f"/api/admin/photos/{photo_id}/approve", headers=auth_header(token))


def reject(client, token, photo_id):
    return client.post(f"/api/admin/photos/{photo_id}/reject", headers=auth_header(token))


def test_a_guest_cannot_upload(client, storage, place):
    assert upload(client, None, place.id).status_code == 401


def test_a_pending_photo_is_not_in_the_public_list(client, storage, place, host):
    response = upload(client, host[0], place.id)

    assert response.status_code == 201
    assert response.json()["pending"] is True
    assert public_list(client, place.id).json() == []
    # The uploader does not see it either, until an Admin approves it.
    assert public_list(client, place.id, host[0]).json() == []


def test_a_normal_user_cannot_see_the_queue_or_decide(client, storage, place, host):
    photo_id = upload(client, host[0], place.id).json()["id"]

    assert queue(client, host[0]).status_code == 403
    assert approve(client, host[0], photo_id).status_code == 403
    assert reject(client, host[0], photo_id).status_code == 403


def test_the_admin_approves_and_the_photo_shows(client, storage, place, host, admin):
    photo_id = upload(client, host[0], place.id).json()["id"]

    [pending] = queue(client, admin).json()
    assert pending["id"] == photo_id
    assert pending["place_id"] == place.id
    assert pending["place_name"] == "Testplatte"
    assert pending["nickname"] == "Pingpong_Paula"
    assert pending["url"].startswith("https://photos.example/")

    assert approve(client, admin, photo_id).status_code == 204

    [shown] = public_list(client, place.id).json()
    assert shown["id"] == photo_id
    assert shown["url"].startswith("https://photos.example/places/")
    assert queue(client, admin).json() == []


def test_approving_twice_answers_409(client, storage, place, host, admin):
    photo_id = upload(client, host[0], place.id).json()["id"]
    approve(client, admin, photo_id)

    assert approve(client, admin, photo_id).status_code == 409
    assert reject(client, admin, photo_id).status_code == 409


def test_an_unknown_photo_answers_404(client, storage, admin):
    assert approve(client, admin, 999_999).status_code == 404
    assert reject(client, admin, 2**40).status_code == 404


def test_reject_deletes_the_photo_and_its_file(client, session, storage, place, host, admin):
    photo_id = upload(client, host[0], place.id).json()["id"]
    assert len(storage.files) == 1

    assert reject(client, admin, photo_id).status_code == 204

    assert storage.files == {}
    assert session.get(Photo, photo_id) is None
    assert queue(client, admin).json() == []


def test_the_stored_file_is_a_jpeg_without_exif(client, storage, place, host):
    data = image_bytes(fmt="JPEG", exif=camera_exif())
    assert Image.open(BytesIO(data)).getexif()[MAKE] == "Testkamera"

    upload(client, host[0], place.id, data)

    [stored] = storage.files.values()
    image = Image.open(BytesIO(stored))
    assert image.format == "JPEG"
    assert dict(image.getexif()) == {}
    assert "exif" not in image.info


def test_png_and_webp_are_converted_to_jpeg(client, storage, place, host):
    upload(client, host[0], place.id, image_bytes(fmt="PNG"), "a.png", "image/png")
    upload(client, host[0], place.id, image_bytes(fmt="WEBP"), "b.webp", "image/webp")

    assert [Image.open(BytesIO(f)).format for f in storage.files.values()] == ["JPEG", "JPEG"]


def test_a_big_photo_is_made_smaller(client, storage, place, host):
    upload(client, host[0], place.id, image_bytes(size=(4000, 3000)))

    [stored] = storage.files.values()
    assert Image.open(BytesIO(stored)).size == (MAX_SIDE, 1200)


def test_the_camera_orientation_is_applied(client, session, storage, place, host):
    # Orientation 6: the camera was turned; the picture must be shown turned by 90°.
    data = image_bytes(size=(800, 600), exif=camera_exif(orientation=6))

    photo_id = upload(client, host[0], place.id, data).json()["id"]

    [stored] = storage.files.values()
    assert Image.open(BytesIO(stored)).size == (600, 800)
    photo = session.get(Photo, photo_id)
    assert (photo.width, photo.height) == (600, 800)


def test_not_an_image_answers_415(client, storage, place, host):
    response = upload(client, host[0], place.id, b"no picture", "a.jpg", "image/jpeg")

    assert response.status_code == 415
    assert storage.files == {}


def test_a_gif_answers_415(client, storage, place, host):
    response = upload(client, host[0], place.id, image_bytes(fmt="GIF"), "a.gif", "image/gif")

    assert response.status_code == 415


def test_a_file_over_the_limit_answers_413(client, storage, place, host):
    data = image_bytes() + b"\0" * MAX_BYTES

    assert upload(client, host[0], place.id, data).status_code == 413
    assert storage.files == {}


def test_at_most_three_pending_per_user_and_place(client, storage, place, host, admin):
    ids = [upload(client, host[0], place.id).json()["id"] for _ in range(MAX_PENDING)]

    response = upload(client, host[0], place.id)
    assert response.status_code == 409
    assert "warten" in response.json()["detail"]

    # Another user may still upload, and after a decision the first one may again.
    other = register(client, nickname="Foto_Fritz").json()["token"]
    assert upload(client, other, place.id).status_code == 201
    approve(client, admin, ids[0])
    assert upload(client, host[0], place.id).status_code == 201


def test_no_photo_for_a_place_suggestion(client, session, storage, host):
    suggestion = Place(
        name="Vorschlag",
        activity_type="table_tennis",
        is_suggestion=True,
        location="SRID=4326;POINT(-30.6 0.6)",
    )
    session.add(suggestion)
    session.commit()

    assert upload(client, host[0], suggestion.id).status_code == 409


def test_a_locked_place_hides_its_photos(client, storage, place, host, admin):
    photo_id = upload(client, host[0], place.id).json()["id"]
    approve(client, admin, photo_id)
    upload(client, host[0], place.id)

    lock(client, admin, place.id)

    assert public_list(client, place.id).status_code == 404
    assert upload(client, host[0], place.id).status_code == 404
    # Its pending Photos leave the queue too.
    assert queue(client, admin).json() == []


def test_no_storage_answers_503_and_an_empty_list(client, place, host):
    app.dependency_overrides[photos_enabled] = lambda: True
    app.dependency_overrides[get_photo_storage] = lambda: None

    response = upload(client, host[0], place.id)

    assert response.status_code == 503
    assert public_list(client, place.id).json() == []


def test_after_account_delete_the_approved_photo_stays_without_a_name(
    client, session, storage, place, host, admin
):
    photo_id = upload(client, host[0], place.id).json()["id"]
    approve(client, admin, photo_id)

    assert delete_account(client, host[0]).status_code == 204

    session.expire_all()
    assert session.get(User, host[1]) is None
    assert session.get(Photo, photo_id).user_id is None
    assert [p["id"] for p in public_list(client, place.id).json()] == [photo_id]


def test_newest_approved_photo_first(client, session, storage, place, host, admin):
    first = upload(client, host[0], place.id).json()["id"]
    second = upload(client, host[0], place.id).json()["id"]
    approve(client, admin, first)
    approve(client, admin, second)

    assert [p["id"] for p in public_list(client, place.id).json()] == [second, first]


# The local folder (PHOTO_DIR) gives signed links like S3.


@pytest.fixture
def local(client, tmp_path):
    storage = LocalPhotoStorage(tmp_path, secret=b"test")
    app.dependency_overrides[get_photo_storage] = lambda: storage
    app.dependency_overrides[photos_enabled] = lambda: True
    return storage


def test_a_signed_local_link_sends_the_file(client, local, place, host, admin):
    photo_id = upload(client, host[0], place.id).json()["id"]
    approve(client, admin, photo_id)
    [shown] = public_list(client, place.id).json()

    response = client.get(shown["url"])

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert Image.open(BytesIO(response.content)).format == "JPEG"


def test_a_changed_or_old_local_link_answers_404(client, local, place, host, monkeypatch):
    upload(client, host[0], place.id)
    [key] = [str(p.relative_to(local.folder)) for p in local.folder.rglob("*.jpg")]
    url = local.url(key)
    query = parse_qs(urlsplit(url).query)

    assert client.get(url.replace(query["sig"][0], "0" * 64)).status_code == 404
    assert client.get("/api/photo-files/../secret.jpg?expires=1&sig=x").status_code == 404

    later = time.time() + LINK_SECONDS + 1
    monkeypatch.setattr("app.photo_storage.time.time", lambda: later)
    assert client.get(url).status_code == 404


def test_the_database_has_no_file_data(client, session, storage, place, host):
    upload(client, host[0], place.id)

    [photo] = session.exec(select(Photo).where(Photo.place_id == place.id)).all()
    assert photo.storage_key in storage.files


# The switch PHOTOS_ENABLED (SCRUM-94): Photos are deferred, but easy to switch on again.


def test_the_config_says_whether_photos_are_on(client, storage):
    assert client.get("/api/photos/config").json() == {"enabled": True}

    app.dependency_overrides[photos_enabled] = lambda: False

    assert client.get("/api/photos/config").json() == {"enabled": False}


def test_switched_off_every_photo_endpoint_answers_404(
    client, session, switched_off, place, host, admin
):
    # A Photo from before the switch: it stays in the database, but nobody reaches it.
    old = Photo(
        place_id=place.id,
        user_id=host[1],
        storage_key=f"places/{place.id}/{'a' * 32}.jpg",
        width=800,
        height=600,
        created_at=datetime.now(UTC),
    )
    session.add(old)
    session.commit()

    assert upload(client, host[0], place.id).status_code == 404
    assert upload(client, None, place.id).status_code == 404
    assert public_list(client, place.id).status_code == 404
    assert queue(client, admin).status_code == 404
    assert approve(client, admin, old.id).status_code == 404
    assert reject(client, admin, old.id).status_code == 404

    assert switched_off.files == {}
    session.expire_all()
    stored = session.get(Photo, old.id)
    assert stored is not None
    assert stored.approved_at is None


def test_switched_on_again_the_old_photos_come_back(client, session, switched_off, place, host, admin):
    app.dependency_overrides[photos_enabled] = lambda: True
    photo_id = upload(client, host[0], place.id).json()["id"]
    approve(client, admin, photo_id)
    app.dependency_overrides[photos_enabled] = lambda: False
    assert public_list(client, place.id).status_code == 404

    app.dependency_overrides[photos_enabled] = lambda: True

    assert [p["id"] for p in public_list(client, place.id).json()] == [photo_id]


@pytest.mark.parametrize(
    ("value", "on"),
    [(None, False), ("", False), ("false", False), ("no", False), ("true", True), ("TRUE", True)],
)
def test_the_switch_is_on_only_with_true(monkeypatch, value, on):
    if value is None:
        monkeypatch.delenv("PHOTOS_ENABLED", raising=False)
    else:
        monkeypatch.setenv("PHOTOS_ENABLED", value)

    assert photos_enabled() is on
