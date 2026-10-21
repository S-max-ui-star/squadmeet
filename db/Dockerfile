# PostgreSQL with PostGIS. The postgis/postgis image has no arm64 build (Apple Silicon,
# Graviton EC2), so we add the Debian PostGIS package to the official multi-arch image.
# The Alembic migrations run CREATE EXTENSION postgis.
# Pinned to a digest (the multi-arch index), so a rebuild gets the same base; Dependabot
# proposes a new digest (.github/dependabot.yml, SCRUM-49 review).
FROM postgres:17@sha256:a63c1ea3f6a3a5a1621f97d2aba3b30faecfab4224c1b0000cc85ced57bb1939
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17-postgis-3 \
    && rm -rf /var/lib/apt/lists/*
