"""Browser Push subscriptions and Web Push delivery (SCRUM-44)."""

import os
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field as PydanticField, field_validator
from sqlalchemy import delete
from sqlmodel import Session, select

from app.auth import current_user
from app.db import get_session
from app.models import PushSubscription, User
from app.push_delivery import is_push_service

router = APIRouter(prefix="/push", tags=["push"])

# Browsers per user; each Notification is sent to each of them, inside the request that made it.
MAX_SUBSCRIPTIONS = 5


class PushConfig(BaseModel):
    enabled: bool
    public_key: str | None


class SubscriptionKeys(BaseModel):
    p256dh: str = PydanticField(min_length=1, max_length=512)
    auth: str = PydanticField(min_length=1, max_length=512)


class SubscriptionWrite(BaseModel):
    endpoint: str = PydanticField(min_length=1, max_length=2048)
    keys: SubscriptionKeys

    @field_validator("endpoint")
    @classmethod
    def secure_push_endpoint(cls, value: str) -> str:
        if not is_push_service(value):
            raise ValueError("Push endpoint must be an HTTPS URL of a browser push service")
        return value


class SubscriptionDelete(BaseModel):
    endpoint: str = PydanticField(min_length=1, max_length=2048)


@router.get("/config", response_model=PushConfig)
def push_config(_user: User = Depends(current_user)) -> PushConfig:
    public = os.environ.get("VAPID_PUBLIC_KEY")
    private = os.environ.get("VAPID_PRIVATE_KEY")
    return PushConfig(enabled=bool(public and private), public_key=public if public and private else None)


@router.put("/subscription", status_code=status.HTTP_204_NO_CONTENT)
def save_subscription(
    body: SubscriptionWrite,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Upsert by endpoint: a browser reused after login belongs only to its current user. A new
    browser over MAX_SUBSCRIPTIONS replaces the user's oldest one."""
    subscription = session.exec(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    ).first()
    if subscription is None or subscription.user_id != user.id:
        for old in session.exec(
            select(PushSubscription)
            .where(PushSubscription.user_id == user.id)
            .order_by(PushSubscription.created_at.desc(), PushSubscription.id.desc())
            .offset(MAX_SUBSCRIPTIONS - 1)
        ):
            session.delete(old)
    if subscription is None:
        subscription = PushSubscription(
            user_id=user.id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
            created_at=datetime.now(UTC),
        )
        session.add(subscription)
    else:
        subscription.user_id = user.id
        subscription.p256dh = body.keys.p256dh
        subscription.auth = body.keys.auth
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/subscription", status_code=status.HTTP_204_NO_CONTENT)
def remove_subscription(
    body: SubscriptionDelete,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    session.exec(
        delete(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint, PushSubscription.user_id == user.id
        )
    )
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


