import os

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app.admin_places import router as admin_places_router
from app.admin_suggestions import router as admin_suggestions_router
from app.audit import audit_request
from app.auth import router as auth_router
from app.contacts import router as contacts_router
from app.favorites import router as favorites_router
from app.home_area import router as home_area_router
from app.live import router as live_router
from app.meetup_lifecycle import LifecycleError
from app.meetups import router as meetups_router
from app.notifications import router as notifications_router
from app.photo_storage import router as photo_files_router
from app.photos import config_router as photos_config_router
from app.photos import router as photos_router
from app.place_reports import router as place_reports_router
from app.places import router as places_router
from app.push import router as push_router
from app.ratings import router as ratings_router
from app.series import router as series_router
from app.suggestions import router as suggestions_router

# audit_request runs first: the auth dependencies then set the actor of the audit log.
app = FastAPI(title="SquadMeet API", dependencies=[Depends(audit_request)])


@app.exception_handler(LifecycleError)
async def lifecycle_error(_request: Request, error: LifecycleError) -> JSONResponse:
    """A Meetup rule said no (app.meetup_lifecycle, SCRUM-61): its status and German text."""
    return JSONResponse(status_code=error.status_code, content={"detail": error.detail})


api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    # APP_VERSION is the commit SHA of the image (backend/Dockerfile). The deploy smoke
    # test waits for it, so an old container that still answers does not pass (SCRUM-23).
    return {"status": "ok", "version": os.environ.get("APP_VERSION", "local")}


api.include_router(places_router)
api.include_router(auth_router)
api.include_router(meetups_router)
api.include_router(notifications_router)
api.include_router(push_router)
api.include_router(live_router)
api.include_router(series_router)
api.include_router(contacts_router)
api.include_router(favorites_router)
api.include_router(home_area_router)
api.include_router(suggestions_router)
api.include_router(ratings_router)
api.include_router(admin_places_router)
api.include_router(admin_suggestions_router)
api.include_router(place_reports_router)
api.include_router(photos_router)
api.include_router(photos_config_router)
api.include_router(photo_files_router)
app.include_router(api)
