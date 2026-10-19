FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY . .
# CI passes the commit SHA; /api/health shows it.
ARG GIT_SHA=local
ENV APP_VERSION=$GIT_SHA
EXPOSE 8000
# Migrate the schema, then start the API. docker-compose.yml overrides this for hot reload.
# --timeout-graceful-shutdown: open live streams (SCRUM-93) never end by themselves, so a stop
# waits at most 5 s for them.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 5"]
