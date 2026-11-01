# PostgreSQL with PostGIS. The postgis/postgis image has no arm64 build (Apple Silicon,
# Graviton EC2), so we add the Debian PostGIS package to the official multi-arch image.
# The Alembic migrations run CREATE EXTENSION postgis.
# Pinned to a digest (the multi-arch index), so a rebuild gets the same base; Dependabot
# proposes a new digest (.github/dependabot.yml, SCRUM-49 review).
FROM postgres:17@sha256:31ba9c94a03ada9988f2bb493a22a75eef3a185884533e5cdbcd498ea835b08f
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17-postgis-3 \
    && rm -rf /var/lib/apt/lists/*
