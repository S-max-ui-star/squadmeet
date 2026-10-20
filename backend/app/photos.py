"""Photos (SCRUM-42, see CONTEXT.md "Photo").

A logged-in user uploads a Photo of a Place from the camera or the gallery. The server opens it
with Pillow and stores a new JPEG (at most MAX_SIDE pixels on the long side): that drops all
EXIF data, the location too, and applies the camera's orientation first. Only JPEG, PNG and
WebP up to MAX_BYTES are taken. The file goes to the photo storage (app.photo_storage), the
database keeps only its key.

A Photo is pending until an Admin approves it; only approved Photos are shown, also not to the
uploader before. A rejected Photo is deleted with its file. Each user has at most MAX_PENDING
pending Photos per Place, so the Admin queue stays short (Stefan, 2026-10-16). Photos follow
the Rating rules of the Place status: none at a Place suggestion, hidden with a hidden Place.

All of it is behind the switch PHOTOS_ENABLED (SCRUM-94, app.photo_storage.photos_on). Only
GET /api/photos/config answers with the switch off, so the frontend knows to hide Photos.
"""

from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.auth import current_user, require_admin
from app.db import get_session
from app.meetups import viewer
from app.models import Photo, Place, User
from app.photo_storage import PhotoStorage, get_photo_storage, photos_enabled, photos_on
from app.place_status import MAX_DB_INT, PlaceUse, allowed_in, require, view_use

MAX_BYTES = 10 * 1024 * 1024
MAX_SIDE = 1600
MAX_PENDING = 3
# More pixels than this could fill the server's memory when the picture is opened.
MAX_PIXELS = 50_000_000
FORMATS = {"JPEG", "PNG", "WEBP"}

router = APIRouter(tags=["photos"], dependencies=[Depends(photos_on)])
config_router = APIRouter(tags=["photos"])


class PhotosConfig(BaseModel):
    enabled: bool


@config_router.get("/photos/config", response_model=PhotosConfig)
def photos_config(enabled: bool = Depends(photos_enabled)) -> PhotosConfig:
    """Whether Photos are on (SCRUM-94). No login needed: guests see Photos too."""
    return PhotosConfig(enabled=enabled)


class PhotoUploaded(BaseModel):
    id: int
    pending: bool


class PhotoRead(BaseModel):
    id: int
    url: str
    width: int
    height: int
    created_at: datetime


class PendingPhoto(PhotoRead):
    place_id: int
    place_name: str
    activity_type: str
    # None after the uploader deleted the account.
    nickname: str | None


def refuse(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


def storage_on(storage: PhotoStorage | None) -> PhotoStorage:
    if storage is None:
        raise refuse(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Fotos sind auf diesem Server nicht eingerichtet"
        )
    return storage


def to_jpeg(data: bytes) -> tuple[bytes, int, int]:
    """The picture as a new JPEG without EXIF, turned upright and made smaller; its size."""
    try:
        image = Image.open(BytesIO(data))
    except UnidentifiedImageError:
        raise refuse(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Das ist kein Foto (JPEG, PNG, WebP)")
    if image.format not in FORMATS:
        raise refuse(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Nur JPEG, PNG oder WebP")
    if image.width * image.height > MAX_PIXELS:
        raise refuse(status.HTTP_413_CONTENT_TOO_LARGE, "Das Foto hat zu viele Pixel")
    try:
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "LA", "P"):
            # Transparent parts become white, not black.
            image = image.convert("RGBA")
            background = Image.new("RGB", image.size, "white")
            background.paste(image, mask=image.getchannel("A"))
            image = background
        image = image.convert("RGB")
        image.thumbnail((MAX_SIDE, MAX_SIDE))
    except (OSError, Image.DecompressionBombError):
        raise refuse(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Das Foto ist beschädigt")
    out = BytesIO()
    # No exif= argument: Pillow writes none.
    image.save(out, "JPEG", quality=85, optimize=True)
    return out.getvalue(), image.width, image.height


def new_key(place_id: int) -> str:
    """The file name in the storage (app.photo_storage.KEY_PATTERN)."""
    return f"places/{place_id}/{uuid4().hex}.jpg"


@router.post(
    "/places/{place_id}/photos", status_code=status.HTTP_201_CREATED, response_model=PhotoUploaded
)
def upload_photo(
    place_id: int,
    file: UploadFile = File(),
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    storage: PhotoStorage | None = Depends(get_photo_storage),
):
    """Foto hochladen. It waits for an Admin."""
    storage = storage_on(storage)
    require(session, place_id, PlaceUse.RATE)
    pending = session.exec(
        select(func.count()).where(
            Photo.place_id == place_id, Photo.user_id == user.id, Photo.approved_at.is_(None)
        )
    ).one()
    if pending >= MAX_PENDING:
        raise refuse(
            status.HTTP_409_CONFLICT,
            f"Du hast hier schon {MAX_PENDING} Fotos, die auf die Freigabe warten",
        )
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise refuse(status.HTTP_413_CONTENT_TOO_LARGE, "Das Foto ist größer als 10 MB")
    jpeg, width, height = to_jpeg(data)

    key = new_key(place_id)
    storage.put(key, jpeg)
    photo = Photo(
        place_id=place_id,
        user_id=user.id,
        storage_key=key,
        width=width,
        height=height,
        created_at=datetime.now(UTC),
    )
    session.add(photo)
    try:
        session.commit()
    except Exception:
        storage.delete(key)
        raise
    return PhotoUploaded(id=photo.id, pending=True)


@router.get("/places/{place_id}/photos", response_model=list[PhotoRead])
def list_photos(
    place_id: int,
    user: User | None = Depends(viewer),
    session: Session = Depends(get_session),
    storage: PhotoStorage | None = Depends(get_photo_storage),
):
    """The approved Photos of the Place, the newest first."""
    require(session, place_id, view_use(user))
    if storage is None:
        return []
    photos = session.exec(
        select(Photo)
        .where(Photo.place_id == place_id, Photo.approved_at.is_not(None))
        .order_by(Photo.approved_at.desc(), Photo.id.desc())
    ).all()
    return [
        PhotoRead(
            id=p.id, url=storage.url(p.storage_key), width=p.width, height=p.height,
            created_at=p.created_at,
        )
        for p in photos
    ]


@router.get("/admin/photos", response_model=list[PendingPhoto], tags=["admin"])
def list_pending_photos(
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
    storage: PhotoStorage | None = Depends(get_photo_storage),
):
    """The queue: pending Photos, the oldest first. Photos of locked or deleted Places are left
    out; they come back when the Place is unlocked."""
    if storage is None:
        return []
    rows = session.exec(
        select(Photo, Place.name, Place.activity_type, User.nickname)
        .join(Place, Place.id == Photo.place_id)
        .outerjoin(User, User.id == Photo.user_id)
        .where(Photo.approved_at.is_(None), allowed_in(PlaceUse.REVIEW))
        .order_by(Photo.created_at, Photo.id)
    ).all()
    return [
        PendingPhoto(
            id=photo.id,
            url=storage.url(photo.storage_key),
            width=photo.width,
            height=photo.height,
            created_at=photo.created_at,
            place_id=photo.place_id,
            place_name=name,
            activity_type=activity_type,
            nickname=nickname,
        )
        for photo, name, activity_type, nickname in rows
    ]


def pending_photo(session: Session, photo_id: int) -> Photo:
    photo = session.get(Photo, photo_id) if 1 <= photo_id <= MAX_DB_INT else None
    if photo is None:
        raise refuse(status.HTTP_404_NOT_FOUND, "Foto nicht gefunden")
    require(session, photo.place_id, PlaceUse.REVIEW)
    if photo.approved_at is not None:
        raise refuse(status.HTTP_409_CONFLICT, "Dieses Foto ist schon freigegeben")
    return photo


@router.post(
    "/admin/photos/{photo_id}/approve", status_code=status.HTTP_204_NO_CONTENT, tags=["admin"]
)
def approve_photo(
    photo_id: int,
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Freigeben: the Photo shows on the Place detail."""
    photo = pending_photo(session, photo_id)
    photo.approved_at = datetime.now(UTC)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/admin/photos/{photo_id}/reject", status_code=status.HTTP_204_NO_CONTENT, tags=["admin"]
)
def reject_photo(
    photo_id: int,
    _admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
    storage: PhotoStorage | None = Depends(get_photo_storage),
):
    """Ablehnen: the Photo and its file are deleted."""
    photo = pending_photo(session, photo_id)
    key = photo.storage_key
    session.delete(photo)
    session.commit()
    if storage is not None:
        storage.delete(key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
