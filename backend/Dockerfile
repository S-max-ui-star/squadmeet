# Pinned to a digest (the multi-arch index), so a rebuild gets the same base; Dependabot
# proposes a new digest (.github/dependabot.yml, SCRUM-49 review).
FROM python:3.13-slim@sha256:98ce6fb13b3803744fbca11434f00818f1e300e4e48a4f204e07b2c928b6218e
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Production gets only requirements.txt (SCRUM-49 review); docker-compose.yml passes
# requirements-dev.txt, so `docker compose exec backend pytest` works locally.
ARG REQUIREMENTS=requirements.txt
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r "$REQUIREMENTS"
COPY . .
# Not root: the API needs no rights in the container (SCRUM-49 review).
RUN useradd --system --uid 10001 --no-create-home app
USER app
# CI passes the commit SHA; /api/health shows it.
ARG GIT_SHA=local
ENV APP_VERSION=$GIT_SHA
EXPOSE 8000
# Migrate the schema, then start the API. docker-compose.yml overrides this for hot reload.
# --timeout-graceful-shutdown: open live streams (SCRUM-93) never end by themselves, so a stop
# waits at most 5 s for them.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 5"]
