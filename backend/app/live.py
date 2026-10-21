"""Live updates for open pages: Server-Sent Events (SCRUM-93).

An open page keeps one stream to GET /api/live. When a commit changes a user's Notifications or
Contacts, the stream sends that user the topic ("notifications" or "contacts"). A change to a
Meetup or a Join goes to every open stream as "meetups:<place id>", because Meetups are public.
A Rating or a Condition vote goes to every open stream as "ratings:<place id>" (SCRUM-98).
The page then loads that data again. An event carries no data, so a lost or extra event does no
harm: the page loads again when the stream opens, and it still polls every 60 s.

The listeners are in memory, so this works with one uvicorn process (backend/Dockerfile). More
processes need Postgres LISTEN/NOTIFY.
"""

import asyncio
import logging
import threading
from collections.abc import AsyncIterator, Callable, Iterable
from itertools import chain

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import event
from sqlmodel import Session

from app.auth import current_login
from app.db import get_session
from app.models import (
    ConditionVote,
    ContactRequest,
    LoginSession,
    Meetup,
    MeetupJoin,
    Notification,
    Rating,
    UserBlock,
)

logger = logging.getLogger(__name__)

# "notifications", "contacts", "meetups:<place id>" or "ratings:<place id>".
Message = str
Listener = Callable[[Message], None]
# The receiver of a change: a user id, or None for every open stream.
Receiver = int | None

# A comment line this often keeps proxies from closing a quiet stream.
HEARTBEAT_SECONDS = 25
PENDING = "live_pending"


class Hub:
    """The open streams per user. Thread-safe: sync routes commit in worker threads."""

    def __init__(self) -> None:
        self._listeners: dict[int, set[Listener]] = {}
        self._lock = threading.Lock()

    def listen(self, user_id: int, listener: Listener) -> Callable[[], None]:
        """Add a listener; call the returned function to remove it."""
        with self._lock:
            self._listeners.setdefault(user_id, set()).add(listener)

        def stop() -> None:
            with self._lock:
                listeners = self._listeners.get(user_id, set())
                listeners.discard(listener)
                if not listeners:
                    self._listeners.pop(user_id, None)

        return stop

    def listeners(self, user_id: int) -> int:
        with self._lock:
            return len(self._listeners.get(user_id, ()))

    def publish(self, user_ids: Iterable[int] | None, message: Message) -> None:
        """To these users, or to every open stream when user_ids is None."""
        with self._lock:
            if user_ids is None:
                found = [listener for group in self._listeners.values() for listener in group]
            else:
                found = [
                    listener for user_id in user_ids for listener in self._listeners.get(user_id, ())
                ]
        for listener in found:
            try:
                listener(message)
            except Exception:  # A stream that just closed must not break the commit.
                logger.warning("Live update %s not delivered", message, exc_info=True)


hub = Hub()


def changes_of(session: Session, obj: object) -> list[tuple[Receiver, Message]]:
    """Who sees a change to this row, and which data they must load again."""
    if isinstance(obj, Meetup):
        return [(None, f"meetups:{obj.place_id}")]
    if isinstance(obj, MeetupJoin):
        # The route has usually loaded the Meetup already, so this rarely asks the database.
        with session.no_autoflush:
            meetup = session.get(Meetup, obj.meetup_id)
        return [(None, f"meetups:{meetup.place_id}")] if meetup else []
    if isinstance(obj, (Rating, ConditionVote)):
        # The Rating summary and the Condition are public, like Meetups.
        return [(None, f"ratings:{obj.place_id}")]
    if isinstance(obj, Notification):
        return [(obj.user_id, "notifications")]
    if isinstance(obj, ContactRequest):
        return [(obj.requester_id, "contacts"), (obj.addressee_id, "contacts")]
    if isinstance(obj, UserBlock):
        # Only the blocker's list shows the Block; the blocked user does not learn about it.
        return [(obj.blocker_id, "contacts")]
    return []


def note(session: Session, receiver: Receiver, message: Message) -> None:
    """For a change that the ORM does not see (a Core statement): send it after the commit."""
    session.info.setdefault(PENDING, set()).add((receiver, message))


@event.listens_for(Session, "after_flush")
def collect(session: Session, _context) -> None:
    pending = session.info.setdefault(PENDING, set())
    for obj in chain(session.new, session.dirty, session.deleted):
        pending.update(changes_of(session, obj))


@event.listens_for(Session, "after_commit")
def send(session: Session) -> None:
    # After the commit, so a page never loads the data before it is saved.
    for receiver, message in session.info.pop(PENDING, set()):
        hub.publish(None if receiver is None else {receiver}, message)


@event.listens_for(Session, "after_rollback")
def drop(session: Session) -> None:
    session.info.pop(PENDING, None)


async def stream(user_id: int, heartbeat_seconds: float = HEARTBEAT_SECONDS) -> AsyncIterator[str]:
    """"ready" first (the page then loads its data), then one event per message, and a ping
    comment when nothing happens."""
    loop = asyncio.get_running_loop()
    messages: asyncio.Queue[Message] = asyncio.Queue()
    stop = hub.listen(
        user_id, lambda message: loop.call_soon_threadsafe(messages.put_nowait, message)
    )
    try:
        yield "data: ready\n\n"
        while True:
            try:
                message = await asyncio.wait_for(messages.get(), heartbeat_seconds)
            except TimeoutError:
                yield ": ping\n\n"
            else:
                yield f"data: {message}\n\n"
    finally:
        stop()


router = APIRouter(tags=["live"])


@router.get("/live")
def live_updates(
    login: LoginSession = Depends(current_login), session: Session = Depends(get_session)
):
    user_id = login.user_id
    # The stream can stay open for hours. Give the database connection back now, or each open
    # page would hold one from the pool.
    session.close()
    return StreamingResponse(
        stream(user_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
