"""Where the Photo files are (SCRUM-42). The database keeps only their key.

- PHOTO_BUCKET set: a private S3 bucket. The backend reaches it with the EC2 host's role (no
  stored keys) and gives the browser short-lived presigned links. The bucket is never public.
- else PHOTO_DIR set: a folder on the disk (local development). The links are signed the same
  way, and the backend itself sends the file (GET /api/photo-files/...).
- neither: no storage. Uploads answer 503, the lists are empty.

Photos are deferred (SCRUM-94): they work only when the switch PHOTOS_ENABLED is "true". Off,
every photo endpoint answers 404 and the frontend hides Photos (GET /api/photos/config). The
bucket, the files and the database rows stay, so switching on again needs nothing else.

Both kinds give links that stop working after LINK_SECONDS, so a pending Photo is never
reachable by a guessed or old link. Tests replace the storage (get_photo_storage).
"""

import hashlib
import hmac
import os
import re
import secrets
import time
from functools import cache
from pathlib import Path
from typing import Protocol

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

# How long a link to a Photo works.
LINK_SECONDS = 15 * 60
# Every key looks like this (app.photos.new_key), so a link cannot reach other files.
KEY_PATTERN = re.compile(r"places/\d+/[0-9a-f]{32}\.jpg")

router = APIRouter(tags=["photos"])


class PhotoStorage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def delete(self, key: str) -> None: ...
    def url(self, key: str) -> str: ...


class S3PhotoStorage:
    def __init__(self, bucket: str):
        import boto3  # only used on the server; tests and local development use no S3
        from botocore.config import Config

        self.bucket = bucket
        # The region comes from AWS_DEFAULT_REGION (deploy/compose.yml); SigV4 links name it.
        self.client = boto3.client("s3", config=Config(signature_version="s3v4"))

    def put(self, key: str, data: bytes) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType="image/jpeg")

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def url(self, key: str) -> str:
        return self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=LINK_SECONDS
        )


class LocalPhotoStorage:
    def __init__(self, folder: str | Path, secret: bytes | None = None):
        self.folder = Path(folder)
        # A new secret on each start: old links stop working, like an expired S3 link.
        self.secret = secret or secrets.token_bytes(32)

    def path(self, key: str) -> Path:
        return self.folder / key

    def put(self, key: str, data: bytes) -> None:
        path = self.path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def delete(self, key: str) -> None:
        self.path(key).unlink(missing_ok=True)

    def signature(self, key: str, expires: int) -> str:
        return hmac.new(self.secret, f"{key}:{expires}".encode(), hashlib.sha256).hexdigest()

    def url(self, key: str) -> str:
        expires = int(time.time()) + LINK_SECONDS
        return f"/api/photo-files/{key}?expires={expires}&sig={self.signature(key, expires)}"

    def is_valid(self, key: str, expires: int, sig: str) -> bool:
        return expires >= time.time() and hmac.compare_digest(sig, self.signature(key, expires))


def photos_enabled() -> bool:
    """The switch PHOTOS_ENABLED (SCRUM-94). FastAPI dependency; the tests override it."""
    return os.environ.get("PHOTOS_ENABLED", "").lower() == "true"


def photos_on(enabled: bool = Depends(photos_enabled)) -> None:
    """Router dependency: with the switch off, a photo endpoint does not exist."""
    if not enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fotos sind ausgeschaltet")


@cache
def configured_storage() -> PhotoStorage | None:
    if bucket := os.environ.get("PHOTO_BUCKET"):
        return S3PhotoStorage(bucket)
    if folder := os.environ.get("PHOTO_DIR"):
        return LocalPhotoStorage(folder)
    return None


def get_photo_storage() -> PhotoStorage | None:
    """FastAPI dependency; the tests override it."""
    return configured_storage()


@router.get("/photo-files/{key:path}", include_in_schema=False, dependencies=[Depends(photos_on)])
def photo_file(
    key: str,
    expires: int = Query(),
    sig: str = Query(),
    storage: PhotoStorage | None = Depends(get_photo_storage),
):
    """A Photo file from the local folder, for a signed link (only with PHOTO_DIR)."""
    if (
        not isinstance(storage, LocalPhotoStorage)
        or not KEY_PATTERN.fullmatch(key)
        or not storage.is_valid(key, expires, sig)
        or not storage.path(key).is_file()
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto nicht gefunden")
    return FileResponse(storage.path(key), media_type="image/jpeg")
