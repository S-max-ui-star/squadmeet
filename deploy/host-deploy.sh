#!/usr/bin/env bash
# Runs on the EC2 host as root (sent through AWS SSM). Writes the .env, logs in to GHCR,
# pulls the images and (re)starts the stack in /opt/squadmeet.
# The secrets come from SSM Parameter Store (/squadmeet/*); the host's IAM role may read them.
#
# Before the new stack starts, it dumps the database into backups/ (the last KEEP_BACKUPS stay),
# because the new backend migrates the schema at its start (SCRUM-49 review).
#
# Usage: host-deploy.sh <domain> <image-tag> <image-owner>
#   image-tag: a commit SHA, or "main" / "dev"; image-owner: the GHCR account, lowercase.
set -euo pipefail

USAGE="Usage: host-deploy.sh <domain> <image-tag> <image-owner>"
DOMAIN="${1:?$USAGE}"
IMAGE_TAG="${2:?$USAGE}"
IMAGE_OWNER="${3:?$USAGE}"
KEEP_BACKUPS=10
cd /opt/squadmeet

# The AWS CLI on the host needs the region; the instance metadata (IMDSv2) knows it.
imds_token=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
AWS_DEFAULT_REGION=$(curl -fsS -H "X-aws-ec2-metadata-token: $imds_token" \
  http://169.254.169.254/latest/meta-data/placement/region)
export AWS_DEFAULT_REGION

param() {
  aws ssm get-parameter --name "$1" --with-decryption --query Parameter.Value --output text
}
# /squadmeet/photo-bucket comes from deploy/setup-photos.sh (SCRUM-42). Without it Photos are
# off (upload answers 503), and the deploy still works.

umask 077
cat > .env <<EOF
DOMAIN=$DOMAIN
IMAGE_TAG=$IMAGE_TAG
IMAGE_OWNER=$IMAGE_OWNER
POSTGRES_USER=squadmeet
POSTGRES_DB=squadmeet
POSTGRES_PASSWORD=$(param /squadmeet/postgres-password)
TURNSTILE_SITE_KEY=$(param /squadmeet/turnstile-site-key)
TURNSTILE_SECRET_KEY=$(param /squadmeet/turnstile-secret-key)
PHOTO_BUCKET=$(param /squadmeet/photo-bucket 2>/dev/null || true)
VAPID_PUBLIC_KEY=$(param /squadmeet/vapid-public-key 2>/dev/null || true)
VAPID_PRIVATE_KEY=$(param /squadmeet/vapid-private-key 2>/dev/null || true)
VAPID_SUBJECT=mailto:admin@$DOMAIN
AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION
EOF

param /squadmeet/ghcr-token | docker login ghcr.io -u "$(param /squadmeet/ghcr-user)" --password-stdin

docker compose pull

# A dump of the running database (custom format, for pg_restore), before the new backend
# migrates it. Not on the first deploy, when no database runs yet. Restore: deploy/README.md.
if [[ -n "$(docker compose ps --status running --quiet db)" ]]; then
  mkdir -p backups
  dump="backups/$(date -u +%Y-%m-%dT%H%M%SZ).dump"
  docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$dump.part"
  mv "$dump.part" "$dump"
  echo "Database dump: /opt/squadmeet/$dump ($(du -h "$dump" | cut -f1))"
  # Only the newest KEEP_BACKUPS; the names sort by time.
  # shellcheck disable=SC2012  # our own names, no spaces
  ls -1 backups/*.dump | head -n -"$KEEP_BACKUPS" | xargs -r rm --
fi

docker compose up -d --remove-orphans
# -a: also the images of older tags, so they do not fill the disk; the running ones stay. A
# rollback pulls its images from GHCR again.
docker image prune -af
docker compose ps
