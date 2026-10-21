# SquadMeet (working name)

A map of free public activity places, such as table tennis tables and basketball courts. Adults
announce a Meetup at a Place, and other people join it.

Final project of the Syntax course, Modul 4 (Fullstack, Backend & DevOps). Team of 3 (since 2026-10-12).
Work ends **Fri 23.10.2026**; presentation with live demo: **Mon 26.10.2026**.

> **State:** live at https://squadmeet.duckdns.org (`SCRUM-20`, AWS host). A merge into `main`
> deploys automatically (`SCRUM-23`). Sprints 1 (walking skeleton) and 2 (features) are done.
> Sprint 3 (fixes from the test run) runs until Fri 23.10.; the feature freeze is on
> **Wed 21.10.** evening, then Thu–Fri are for fixes, the manual test (`SCRUM-50`), the review
> (`SCRUM-49`), docs and the presentation.

## Team

| Person | Area |
|--------|------|
| Steven Tanu | DevOps (Docker, CI/CD, AWS, HTTPS), login and MFA, Admin, Place suggestions |
| Stefan Kallinich | Product owner, Meetup workflow, privacy, ratings, photos, contacts, Home area; owns the repo and the AWS host since 2026-10-15 |
| Dominik Fischer | Finding (search, addresses, Meetup list), notifications, manual test |

Dominik joined on 2026-10-12 (`SCRUM-51`). David Ludwig-Erbs left the project on 2026-10-08
(`SCRUM-46`). Who does what is in [TICKETS.md](TICKETS.md).

## Stack

| Part | Tool | Why |
|------|------|-----|
| Client | React + TypeScript + Vite as a PWA, Leaflet map | One code base for phone and laptop ([ADR-0001](docs/adr/0001-pwa-not-native-app.md)) |
| API | FastAPI + SQLModel, Alembic migrations | Course stack; the team knows it. Alembic keeps the EC2 data on schema changes |
| Database | PostgreSQL + PostGIS | Radius queries ("Places near me") |
| Hosting | One AWS EC2 host, Docker Compose, Caddy (HTTPS) | Cheap and simple ([ADR-0002](docs/adr/0002-one-ec2-host-with-docker-compose.md)); push and location need HTTPS |
| CI/CD | GitHub Actions → GHCR → EC2 (OIDC + SSM) | No stored AWS keys, no open SSH port |

## Documentation

| File | What it holds |
|------|---------------|
| [HANDOFF.md](HANDOFF.md) | Shared handoff: rules, team, Jira, decisions, debugging case. Read it first. Your own progress goes in `HANDOFF.local.md` (not in git). |
| [TICKETS.md](TICKETS.md) | Jira tickets per person, in start order |
| [DIARY.md](DIARY.md) | What each person did each day |
| [CONTEXT.md](CONTEXT.md) | Glossary: the domain terms we use |
| [docs/adr/](docs/adr/) | Architecture decisions |
| [deploy/README.md](deploy/README.md) | How the app runs on AWS, the setup wizard, the move to the NAS |
| [BRIEF.md](BRIEF.md) | The original course brief |

Tasks are in Jira (project `SCRUM`, https://socmediaapp.atlassian.net).

## How we work

- **Branches (Gitflow):** `SCRUM-<n>-<short-name>` → `dev` → `main`.
- **Release:** a PR from `dev` into `main`. Merge it with **Create a merge commit**, not with
  squash. A squash commit is not in `dev`, so the next release PR shows the old commits again.
  A merge into `main` deploys to AWS.
- **Commits** start with the Jira key: `SCRUM-22 add login endpoint`.
- **Done** means merged and the pipeline is green.
- **Every day:** add your line to [DIARY.md](DIARY.md).

## Run locally

You need Docker Desktop. Then, in the repo root:

```sh
docker compose up --build
```

| What | URL |
|------|-----|
| Map (frontend) | http://localhost:5173 |
| API health | http://localhost:8000/api/health |
| API docs | http://localhost:8000/docs |
| Database | `localhost:5432`, user, password and DB `squadmeet` (change with `.env`, see `.env.example`) |

On start, the backend runs the Alembic migrations and loads the Places from
`backend/data/osm/*.json` (OpenStreetMap snapshots). Code changes in `backend/` and `frontend/`
reload without a rebuild. After a change to
`requirements*.txt` or `package.json`, run `docker compose up --build` again.
`docker compose down -v` also deletes the database.

### Places from OpenStreetMap

The Places come from a snapshot file per city in `backend/data/osm/` (Leipzig, Erfurt, Hannover,
Stuttgart, Potsdam), so a start never needs the (often busy) public Overpass servers. To refresh
a city or add one, fetch it and commit the file:

```sh
docker compose exec backend python -m app.osm_import fetch Leipzig
```

Each start (`app.seed`) loads the snapshots again: new Places are added, known ones (same OSM
id and Activity type) get the new name and location and keep their database id, and no Place is
ever deleted, because it may already have Ratings or Meetups. The log says how many were new,
refreshed and kept. A city name must match exactly one German municipality.

Place/address search uses Nominatim only after the user submits the search form (never as
autocomplete). The backend caches repeated searches, serializes all provider calls to at most one
request per second, and stores a Place's nearest address after the first successful lookup. Set
`NOMINATIM_URL` to switch the provider without changing the application image. Results are
attributed to OpenStreetMap in the search panel.

Private, paid and indoor places are skipped ([backend/app/osm_import.py](backend/app/osm_import.py)).
Map data © OpenStreetMap contributors (ODbL); the map shows the attribution.

### Admins

There is no UI to make somebody an Admin. Run the command locally, or on the server in a shell
in `/opt/squadmeet` ([deploy/README.md](deploy/README.md) → *Troubleshooting*):

```sh
docker compose exec backend python -m app.admin grant <Nickname>
docker compose exec backend python -m app.admin revoke <Nickname>
```

The Admin functions work only after the Admin turns on two-factor login (MFA) in the app
("Konto" → "Zwei-Faktor-Anmeldung").

What an Admin can do (`SCRUM-39`):

- **Lock a Place** ("Platz sperren" in the Place detail): it leaves the map and the search.
  Meetups that have not started are cancelled; running ones end at once.
- **Unlock it** ("Konto" → "Gesperrte Plätze" → "Entsperren"): it is back on the map.
  Cancelled Meetups stay cancelled.
- **Delete a Place** ("Platz löschen"): like lock, but for good. The row stays in the database
  (soft delete), so the next OSM import does not bring it back.
- **Reported Places** ("Konto" → "Gemeldete Plätze"): Places that users reported, the ones off
  the map first. "Verwerfen" closes the reports, and the Place is back on the map. "Sperren"
  locks it as above.

### Tests

```sh
docker compose exec backend pytest        # backend (pytest)
cd frontend && npm install && npm test    # frontend (Vitest)
```

The backend tests need the running, migrated database. Each test runs in one transaction that
is rolled back at the end, so the tests leave no data behind
([backend/tests/conftest.py](backend/tests/conftest.py)). Some tests (`test_auth`, `test_mfa`,
`test_password_reset`, `test_audit_log`) expect an empty user table: on a local database with
your own accounts they fail. CI starts with an empty database. After new migrations on `dev`, run
`docker compose exec backend alembic upgrade head` first, or many tests fail.

### Database schema changes (Alembic)

Change the models in `backend/app/models.py`, then let Alembic write the migration and check it:

```sh
docker compose exec backend alembic revision --autogenerate -m "add meetup"
docker compose exec backend alembic upgrade head
```

### Folders

| Folder | What |
|--------|------|
| `backend/` | FastAPI + SQLModel API, Alembic migrations, pytest tests, OSM snapshots in `data/osm/` |
| `frontend/` | React + TypeScript + Vite, Leaflet map, Vitest tests |
| `db/` | PostgreSQL image with PostGIS (also runs on arm64) |
| `deploy/` | Production stack on AWS EC2 (Caddy + HTTPS) and the setup wizard. See [deploy/README.md](deploy/README.md) |
