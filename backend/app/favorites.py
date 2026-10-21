"""Favorites and their optional Berlin Time rules (SCRUM-41)."""

from datetime import UTC, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func
from sqlmodel import Session, select

from app.auth import current_user
from app.db import get_session
from app.models import Favorite, FavoriteTimeRule, Place, User
from app.place_status import MAX_DB_INT, allowed_in, require, view_use

# Each rule is read on every new Meetup at the Place (app.favorite_notifications).
MAX_RULES = 10

router = APIRouter(tags=["favorites"])


class TimeRuleWrite(BaseModel):
    weekdays: list[int] = Field(min_length=1, max_length=7)
    start: time
    end: time

    @field_validator("weekdays")
    @classmethod
    def valid_weekdays(cls, weekdays: list[int]) -> list[int]:
        if any(day < 0 or day > 6 for day in weekdays) or len(set(weekdays)) != len(weekdays):
            raise ValueError("Wochentage müssen eindeutig zwischen 0 und 6 liegen")
        return sorted(weekdays)

    @model_validator(mode="after")
    def same_day(self):
        if self.start >= self.end:
            raise ValueError("Das Zeitfenster muss am selben Tag enden")
        return self


class TimeRuleRead(BaseModel):
    id: int
    weekdays: list[int]
    start: time
    end: time


class FavoritePlaceRead(BaseModel):
    id: int
    name: str
    address: str | None


class FavoriteRead(BaseModel):
    id: int
    place: FavoritePlaceRead
    rules: list[TimeRuleRead]


def in_db(row_id: int) -> bool:
    """A bigger number than a PostgreSQL integer would make the query fail."""
    return 1 <= row_id <= MAX_DB_INT


def owned(session: Session, favorite_id: int, user_id: int) -> Favorite:
    favorite = in_db(favorite_id) and session.exec(
        select(Favorite).where(Favorite.id == favorite_id, Favorite.user_id == user_id)
    ).first()
    if not favorite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Favorit nicht gefunden")
    return favorite


def rule_read(rule: FavoriteTimeRule) -> TimeRuleRead:
    return TimeRuleRead(
        id=rule.id, weekdays=rule.weekdays, start=rule.start_time, end=rule.end_time
    )


def favorite_reads(session: Session, favorites: list[Favorite]) -> list[FavoriteRead]:
    if not favorites:
        return []
    ids = [favorite.id for favorite in favorites]
    places = {
        place.id: place
        for place in session.exec(
            select(Place).where(Place.id.in_({favorite.place_id for favorite in favorites}))
        )
    }
    rules: dict[int, list[FavoriteTimeRule]] = {favorite_id: [] for favorite_id in ids}
    for rule in session.exec(
        select(FavoriteTimeRule)
        .where(FavoriteTimeRule.favorite_id.in_(ids))
        .order_by(FavoriteTimeRule.id)
    ):
        rules[rule.favorite_id].append(rule)
    return [
        FavoriteRead(
            id=favorite.id,
            place=FavoritePlaceRead(
                id=place.id, name=place.name, address=place.address
            ),
            rules=[rule_read(rule) for rule in rules[favorite.id]],
        )
        for favorite in favorites
        for place in [places[favorite.place_id]]
    ]


@router.get("/favorites", response_model=list[FavoriteRead])
def list_favorites(
    user: User = Depends(current_user), session: Session = Depends(get_session)
):
    """The user's Favorites at Places they may see; a locked or hidden Place comes back when
    it is unlocked."""
    favorites = list(
        session.exec(
            select(Favorite)
            .join(Place, Place.id == Favorite.place_id)
            .where(Favorite.user_id == user.id, allowed_in(view_use(user)))
            .order_by(Favorite.created_at, Favorite.id)
        )
    )
    return favorite_reads(session, favorites)


@router.get("/places/{place_id}/favorite", response_model=FavoriteRead | None)
def get_favorite(
    place_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    require(session, place_id, view_use(user))
    favorite = session.exec(
        select(Favorite).where(Favorite.place_id == place_id, Favorite.user_id == user.id)
    ).first()
    return favorite_reads(session, [favorite])[0] if favorite else None


@router.put("/places/{place_id}/favorite", response_model=FavoriteRead)
def add_favorite(
    place_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    require(session, place_id, view_use(user))
    favorite = session.exec(
        select(Favorite).where(Favorite.place_id == place_id, Favorite.user_id == user.id)
    ).first()
    if favorite is None:
        favorite = Favorite(place_id=place_id, user_id=user.id, created_at=datetime.now(UTC))
        session.add(favorite)
        session.commit()
        session.refresh(favorite)
    return favorite_reads(session, [favorite])[0]


@router.delete("/places/{place_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(
    place_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    favorite = in_db(place_id) and session.exec(
        select(Favorite).where(Favorite.place_id == place_id, Favorite.user_id == user.id)
    ).first()
    if favorite:
        session.delete(favorite)
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/favorites/{favorite_id}/rules",
    response_model=TimeRuleRead,
    status_code=status.HTTP_201_CREATED,
)
def add_time_rule(
    favorite_id: int,
    body: TimeRuleWrite,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    owned(session, favorite_id, user.id)
    rules = session.exec(
        select(func.count()).where(FavoriteTimeRule.favorite_id == favorite_id)
    ).one()
    if rules >= MAX_RULES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ein Favorit hat höchstens {MAX_RULES} Zeitfenster",
        )
    rule = FavoriteTimeRule(
        favorite_id=favorite_id,
        weekdays=body.weekdays,
        start_time=body.start,
        end_time=body.end,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule_read(rule)


def owned_rule(session: Session, favorite_id: int, rule_id: int, user_id: int):
    owned(session, favorite_id, user_id)
    rule = in_db(rule_id) and session.exec(
        select(FavoriteTimeRule).where(
            FavoriteTimeRule.id == rule_id, FavoriteTimeRule.favorite_id == favorite_id
        )
    ).first()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zeitfenster nicht gefunden")
    return rule


@router.put("/favorites/{favorite_id}/rules/{rule_id}", response_model=TimeRuleRead)
def edit_time_rule(
    favorite_id: int,
    rule_id: int,
    body: TimeRuleWrite,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    rule = owned_rule(session, favorite_id, rule_id, user.id)
    rule.weekdays = body.weekdays
    rule.start_time = body.start
    rule.end_time = body.end
    session.commit()
    session.refresh(rule)
    return rule_read(rule)


@router.delete(
    "/favorites/{favorite_id}/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_time_rule(
    favorite_id: int,
    rule_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    rule = owned_rule(session, favorite_id, rule_id, user.id)
    session.delete(rule)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
