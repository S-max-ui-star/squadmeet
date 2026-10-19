"""Live updates for open pages: Server-Sent Events (SCRUM-93).

An open page keeps one stream to GET /api/live. When a commit changes a user's Notifications or
Contacts, the stream sends that user the topic ("notifications" or "contacts"), and the page
loads that data again. An event carries no data, so a lost or extra event does no harm: the page
loads again when the stream opens, and it still polls every 60 s.

The listeners are in memory, so this works with one uvicorn process (backend/Dockerfile). More
processes need Postgres LISTEN/NOTIFY.
"""

import asyncio
import logging
import threading
from collections.abc import AsyncIterator, Callable, Iterable
from itertools import chain
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import event
from sqlmodel import Session

from app.auth import current_login
from app.db import get_session
from app.models import ContactRequest, LoginSession, Notification, UserBlock

logger = logging.getLogger(__name__)

Topic = Literal["notifications", "contacts"]
Listener = Callable[[Topic], None]

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

    def publish(self, user_ids: Iterable[int], topic: Topic) -> None:
        with self._lock:
            found = [listener for user_id in user_ids for listener in self._listeners.get(user_id, ())]
        for listener in found:
            try:
                listener(topic)
            except Exception:  # A stream that just closed must not break the commit.
                logger.warning("Live update %s not delivered", topic, exc_info=True)


hub = Hub()


def changes_of(obj: object) -> list[tuple[int, Topic]]:
    """Who sees a change to this row, and which data they must load again."""
    if isinstance(obj, Notification):
        return [(obj.user_id, "notifications")]
    if isinstance(obj, ContactRequest):
        return [(obj.requester_id, "contacts"), (obj.addressee_id, "contacts")]
    if isinstance(obj, UserBlock):
        # Only the blocker's list shows the Block; the blocked user does not learn about it.
        return [(obj.blocker_id, "contacts")]
    return []


@event.listens_for(Session, "after_flush")
def collect(session: Session, _context) -> None:
    pending = session.info.setdefault(PENDING, set())
    for obj in chain(session.new, session.dirty, session.deleted):
        pending.update(changes_of(obj))


@event.listens_for(Session, "after_commit")
def send(session: Session) -> None:
    # After the commit, so a page never loads the data before it is saved.
    for user_id, topic in session.info.pop(PENDING, set()):
        hub.publish({user_id}, topic)


@event.listens_for(Session, "after_rollback")
def drop(session: Session) -> None:
    session.info.pop(PENDING, None)


async def stream(user_id: int, heartbeat_seconds: float = HEARTBEAT_SECONDS) -> AsyncIterator[str]:
    """"ready" first (the page then loads its data), then one event per topic, and a ping
    comment when nothing happens."""
    loop = asyncio.get_running_loop()
    topics: asyncio.Queue[Topic] = asyncio.Queue()
    stop = hub.listen(user_id, lambda topic: loop.call_soon_threadsafe(topics.put_nowait, topic))
    try:
        yield "data: ready\n\n"
        while True:
            try:
                topic = await asyncio.wait_for(topics.get(), heartbeat_seconds)
            except TimeoutError:
                yield ": ping\n\n"
            else:
                yield f"data: {topic}\n\n"
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
