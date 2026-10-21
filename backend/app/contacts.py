"""Contacts and Block (SCRUM-32, see CONTEXT.md).

A user asks another user by their exact Nickname (no search, no suggestions). The other user
accepts or declines; a declined request shows to the asker, who may ask again. Either side can
remove a Contact. No chat (ADR-0004).

A Block works in one direction: when Paula blocks Karl, their Contact and open requests go,
Karl cannot ask Paula again (he gets a neutral answer), and Karl no longer sees the Meetups
Paula hosts, nor her Nickname in other Meetups (app.blocks, used by app.meetups). Paula still
sees Karl, and is warned when he is in a Meetup she is in.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.auth import current_user
from app.blocks import blocked_by
from app.db import get_session
from app.models import ContactRequest, Meetup, MeetupJoin, User, UserBlock
from app.place_status import in_db
from app.rate_limit import RateLimit

router = APIRouter(tags=["contacts"])

NOT_POSSIBLE = "Anfrage nicht möglich"

# Requests and Blocks by Nickname: more per hour is spam after a decline, or a script that
# tests which Nicknames exist.
nickname_lookup_per_user = RateLimit(limit=20, window_seconds=60 * 60)


class NicknameBody(BaseModel):
    nickname: str


class ContactUser(BaseModel):
    id: int
    nickname: str
    avatar: str


class RequestRead(BaseModel):
    id: int
    user: ContactUser
    status: str


class ContactsRead(BaseModel):
    contacts: list[ContactUser]
    incoming: list[RequestRead]
    outgoing: list[RequestRead]
    blocked: list[ContactUser]


def brief(user: User) -> ContactUser:
    return ContactUser(id=user.id, nickname=user.nickname, avatar=user.avatar)


def find_user(session: Session, nickname: str, by: User) -> User:
    """The user with exactly this Nickname (case does not matter, as at registration). Counts
    against the lookup limit of `by`."""
    nickname_lookup_per_user.hit(by.id)
    found = session.exec(
        select(User).where(func.lower(User.nickname) == nickname.strip().lower())
    ).first()
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nickname nicht gefunden")
    return found


def between(a: int, b: int):
    """SQL: the request row of the pair, whoever asked."""
    return or_(
        and_(ContactRequest.requester_id == a, ContactRequest.addressee_id == b),
        and_(ContactRequest.requester_id == b, ContactRequest.addressee_id == a),
    )


@router.get("/contacts", response_model=ContactsRead)
def list_contacts(user: User = Depends(current_user), session: Session = Depends(get_session)):
    """The user's Contacts, open requests in both directions, and the users they blocked."""
    rows = session.exec(
        select(ContactRequest).where(
            or_(ContactRequest.requester_id == user.id, ContactRequest.addressee_id == user.id)
        )
    ).all()
    other_ids = {r.addressee_id if r.requester_id == user.id else r.requester_id for r in rows}
    blocked_ids = blocked_by(session, user.id)
    users = {
        u.id: u for u in session.exec(select(User).where(User.id.in_(other_ids | blocked_ids)))
    }
    result = ContactsRead(contacts=[], incoming=[], outgoing=[], blocked=[])
    for r in sorted(rows, key=lambda r: r.updated_at):
        mine = r.requester_id == user.id
        other = users[r.addressee_id if mine else r.requester_id]
        if r.status == "accepted":
            result.contacts.append(brief(other))
        elif mine:
            result.outgoing.append(RequestRead(id=r.id, user=brief(other), status=r.status))
        elif r.status == "pending":
            result.incoming.append(RequestRead(id=r.id, user=brief(other), status=r.status))
    result.contacts.sort(key=lambda u: u.nickname.lower())
    result.blocked = sorted((brief(users[i]) for i in blocked_ids), key=lambda u: u.nickname.lower())
    return result


@router.post("/contacts/requests", response_model=RequestRead, status_code=201)
def ask_for_contact(
    body: NicknameBody,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """A Contact request by exact Nickname. A request back accepts the open one."""
    other = find_user(session, body.nickname, user)
    if other.id == user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Das bist du selbst")
    if session.exec(
        select(UserBlock.id).where(
            or_(
                and_(UserBlock.blocker_id == other.id, UserBlock.blocked_id == user.id),
                and_(UserBlock.blocker_id == user.id, UserBlock.blocked_id == other.id),
            )
        )
    ).first():
        # The same answer for both directions: a blocked user does not learn about the Block.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=NOT_POSSIBLE)
    now = datetime.now(UTC)
    row = session.exec(select(ContactRequest).where(between(user.id, other.id))).first()
    if row is None:
        row = ContactRequest(
            requester_id=user.id, addressee_id=other.id, status="pending", updated_at=now
        )
        session.add(row)
    elif row.status == "accepted":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ihr seid schon Kontakte")
    elif row.requester_id == other.id and row.status == "pending":
        row.status = "accepted"
        row.updated_at = now
    elif row.requester_id == user.id and row.status == "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Anfrage schon gesendet")
    else:
        # Declined before (either way): ask again, as the user who asks now.
        row.requester_id, row.addressee_id = user.id, other.id
        row.status = "pending"
        row.updated_at = now
    try:
        session.commit()
    except IntegrityError:
        # The other user asked at the same moment; the database keeps one row per pair.
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ihr habt euch gleichzeitig angefragt. Bitte lade die Kontakte neu.",
        )
    session.refresh(row)
    return RequestRead(id=row.id, user=brief(other), status=row.status)


def incoming_request(session: Session, request_id: int, user: User) -> ContactRequest:
    row = session.get(ContactRequest, request_id) if in_db(request_id) else None
    if row is None or row.addressee_id != user.id or row.status != "pending":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Keine offene Anfrage")
    return row


@router.post("/contacts/requests/{request_id}/accept", response_model=RequestRead)
def accept_request(
    request_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    row = incoming_request(session, request_id, user)
    row.status = "accepted"
    row.updated_at = datetime.now(UTC)
    session.commit()
    return RequestRead(id=row.id, user=brief(session.get(User, row.requester_id)), status=row.status)


@router.post("/contacts/requests/{request_id}/decline", response_model=RequestRead)
def decline_request(
    request_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    row = incoming_request(session, request_id, user)
    row.status = "declined"
    row.updated_at = datetime.now(UTC)
    session.commit()
    return RequestRead(id=row.id, user=brief(session.get(User, row.requester_id)), status=row.status)


@router.delete("/contacts/requests/{request_id}", status_code=204)
def withdraw_request(
    request_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    """The asker takes back an open request, or clears a declined one from their list."""
    row = session.get(ContactRequest, request_id) if in_db(request_id) else None
    if row is None or row.requester_id != user.id or row.status == "accepted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Keine Anfrage")
    session.delete(row)
    session.commit()
    return Response(status_code=204)


@router.delete("/contacts/{user_id}", status_code=204)
def remove_contact(
    user_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    row = in_db(user_id) and session.exec(
        select(ContactRequest).where(
            between(user.id, user_id), ContactRequest.status == "accepted"
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kein Kontakt")
    session.delete(row)
    session.commit()
    return Response(status_code=204)


@router.post("/blocks", response_model=ContactUser, status_code=201)
def block_user(
    body: NicknameBody,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Block: the Contact and open requests go, and the blocked user's Joins of Meetups this
    user hosts are removed. Blocking twice changes nothing."""
    other = find_user(session, body.nickname, user)
    if other.id == user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Das bist du selbst")
    now = datetime.now(UTC)
    if not session.exec(
        select(UserBlock.id).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == other.id)
    ).first():
        session.add(UserBlock(blocker_id=user.id, blocked_id=other.id, created_at=now))
    hosted = select(Meetup.id).where(Meetup.host_id == user.id, Meetup.ends_at > now)
    # ORM deletes, not one DELETE statement, so the audit log sees each row (SCRUM-66).
    for row in [
        *session.exec(select(ContactRequest).where(between(user.id, other.id))),
        *session.exec(
            select(MeetupJoin).where(
                MeetupJoin.user_id == other.id, MeetupJoin.meetup_id.in_(hosted)
            )
        ),
    ]:
        session.delete(row)
    session.commit()
    return brief(other)


@router.delete("/blocks/{user_id}", status_code=204)
def unblock_user(
    user_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    row = in_db(user_id) and session.exec(
        select(UserBlock).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == user_id)
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nicht blockiert")
    session.delete(row)
    session.commit()
    return Response(status_code=204)
