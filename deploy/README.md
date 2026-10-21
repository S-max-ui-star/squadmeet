# Deploy (SCRUM-20, SCRUM-23, SCRUM-47)

The app runs on one AWS EC2 host with Docker Compose ([ADR-0002](../docs/adr/0002-one-ec2-host-with-docker-compose.md)).
The same files work on the NAS later.

**Current host (since the handover on 2026-10-15, `SCRUM-48`):** Stefan's AWS account
`146062274476` (login `aws login`, SSO role "Student"), region `eu-central-1`, instance
`i-0c6f51ccbb8ba4cbe` (`t2.micro`), Elastic IP 3.74.38.119, https://squadmeet.duckdns.org.
Repo `S-max-ui-star/squadmeet`, images `ghcr.io/s-max-ui-star/squadmeet-*`, Photos in the private
bucket `squadmeet-photos-146062274476` ([Photo storage](#photo-storage-s3)). DuckDNS and
Cloudflare Turnstile are in Stefan's accounts.

```
browser ──HTTPS──▶ web (Caddy: built React app + /api/* → backend) ──▶ backend (FastAPI) ──▶ db (PostGIS)
```

| File | What |
|------|------|
| [setup-aws.sh](setup-aws.sh) | Wizard for the first setup. You run it on your laptop; it uses the AWS CLI |
| [handover.sh](handover.sh) | Wizard for the handover to Stefan's accounts (`SCRUM-48`). It runs `setup-turnstile.sh` and `setup-aws.sh` |
| [compose.yml](compose.yml) | The production stack. It pulls the images from GHCR; nothing is built on the host |
| [host-deploy.sh](host-deploy.sh) | Runs on the host: writes `.env`, logs in to GHCR, pulls the images, dumps the database, restarts the stack |
| [deploy.sh](deploy.sh) | Runs on your laptop or in CI: sends the SSM document `squadmeet-deploy` with one image tag, then the smoke test |
| [Dockerfile](Dockerfile) | The image `squadmeet-deploy`: only `compose.yml` + `host-deploy.sh`. CI pushes it with the same tags as the app images |
| [setup-deploy-document.sh](setup-deploy-document.sh) | Creates the SSM document `squadmeet-deploy`: pull the `squadmeet-deploy` image of one tag, copy its two files to `/opt/squadmeet`, run `host-deploy.sh` |
| [setup-github-deploy.sh](setup-github-deploy.sh) | Creates the GitHub OIDC provider and the IAM role `squadmeet-github-deploy` for the automatic deploy |
| [setup-photos.sh](setup-photos.sh) | Photo storage (`SCRUM-42`): private S3 bucket, the host role's permission for it, its name in SSM, IMDS hop limit 2 |
| [setup-backup.sh](setup-backup.sh) | Daily EBS snapshot of the host (Data Lifecycle Manager, the newest 7 stay). See [Backups](#backups) |
| [setup-turnstile.sh](setup-turnstile.sh) | Wizard: makes the Cloudflare Turnstile widget (captcha, `SCRUM-27`) and stores its keys in SSM |
| [ec2-user-data.sh](ec2-user-data.sh) | First boot of the EC2 host: Docker, Compose plugin (fixed version, checksum checked), 2 GB swap file |
| [../frontend/Caddyfile](../frontend/Caddyfile) | Caddy: HTTPS certificate, the static files, the proxy to the API, the security headers (HSTS, CSP) |

## First setup on AWS

You need the AWS CLI v2, `gh` (logged in), `jq` and `dig`, and the frontend image with Caddy in
GHCR (on `dev`). Then, in the repo root:

```sh
./deploy/setup-aws.sh
```

The wizard has 10 stages. You can stop it at any time and run it again; it finds what it made
before (by the name `squadmeet`) and keeps the values in `.env.aws` (not in git).

1. **AWS login** (`aws login`) and the region (`eu-central-1`).
2. **Budget alarm** `squadmeet-monthly`: an email at 50 % of the limit used and at 100 % forecast.
   It counts costs before credits.
3. **DuckDNS:** you make the subdomain and copy the token.
4. **Secrets** in SSM Parameter Store: `/squadmeet/ghcr-token` (a classic GitHub token with only
   `read:packages`), `/squadmeet/ghcr-user`, `/squadmeet/postgres-password` (random, made once),
   `/squadmeet/turnstile-site-key` and `/squadmeet/turnstile-secret-key` (the captcha, `SCRUM-27`;
   see [Captcha keys](#captcha-keys-turnstile)).
5. **Firewall** `squadmeet-web` (only TCP 80, TCP 443 and UDP 443) and the **IAM role**
   `squadmeet-ec2` (SSM may run commands; the host may read `/squadmeet/*`).
6. **EC2** `t2.micro` (Free Tier eligible; `t3.micro` is not in this account), Amazon Linux 2023, 20 GB
   encrypted disk, CPU credits "standard", and an **Elastic IP**. The disk is encrypted only for
   hosts started after the `SCRUM-49` review; the current host's disk is probably not (not checked:
   EC2 → Volumes → *Encryption*). Encrypting it later needs an encrypted copy of a snapshot.
7. **DuckDNS** points the subdomain to the Elastic IP.
8. **Deploy:** `setup-deploy-document.sh` creates the SSM document, then `deploy.sh` deploys
   (tag `main`; before the first merge into `main`, run the wizard with `DEPLOY_TAG=dev`).
9. **Check** `https://<subdomain>.duckdns.org/api/health` and the map.
10. **Automatic deploy:** `setup-github-deploy.sh` creates the OIDC provider and the deploy role,
    then sets the GitHub variables `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `EC2_INSTANCE_ID`, `APP_DOMAIN`.

There is no SSH. For a shell on the host, use AWS SSM (needs the
[Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)):

```sh
aws ssm start-session --target <instance-id>
sudo -i && cd /opt/squadmeet
```

## Automatic deploy (SCRUM-23)

A merge into `main` runs the CI workflow ([../.github/workflows/ci.yml](../.github/workflows/ci.yml)):
tests → images with the tags `<commit SHA>` and `main` → job **Deploy to AWS + smoke test**.

```
GitHub Actions ──OIDC──▶ AWS role squadmeet-github-deploy ──SSM document squadmeet-deploy (tag=<SHA>)──▶ EC2
   EC2: pull squadmeet-deploy:<SHA> → copy compose.yml + host-deploy.sh → host-deploy.sh <domain> <SHA>
       └── smoke test: https://<domain>/api/health must answer with "version": "<SHA>"
```

- No AWS keys and no SSH keys in GitHub. The role trusts only runs on `main` of
  `S-max-ui-star/squadmeet` (since the handover, `SCRUM-48`). It may only send the SSM document `squadmeet-deploy` to our one
  instance (`SCRUM-47`). It cannot send `AWS-RunShellScript`, so it cannot run other commands.
- The document takes one parameter, the tag. SSM accepts only a full commit SHA, `main` or
  `dev`. The domain and the region are fixed in the document.
- A change to `compose.yml` or `host-deploy.sh` ships with the deploy: they are in the image
  `squadmeet-deploy` of the same commit. Only a change to the document's own steps needs a
  manual run of `deploy/setup-deploy-document.sh <domain>` (logged in to AWS, `AWS_REGION` set).
- A merge into `dev` builds and pushes images (tags `<SHA>` and `dev`), but does not deploy.
- `/api/health` shows the running commit: `curl https://squadmeet.duckdns.org/api/health`.

## Deploy by hand and roll back

On your laptop, logged in to AWS, in the repo root:

```sh
export AWS_REGION=eu-central-1 EC2_INSTANCE_ID=<instance-id> APP_DOMAIN=<subdomain>.duckdns.org
deploy/deploy.sh <commit SHA>      # a rollback: the SHA of an older commit on main
deploy/deploy.sh dev               # try the newest dev images on the server
```

The values are in the GitHub variables (`gh variable list`). The images of every pushed commit
stay in GHCR, so you can deploy each older SHA again (the host keeps only the running images and
pulls the old ones again). **Limit:** only commits from `SCRUM-47` on have the `squadmeet-deploy`
image. An older SHA fails at `docker pull`.

**Rollback over a migration.** Each start runs `alembic upgrade head`. An older image does not
know a newer migration, so its backend stops at the start and the smoke test fails. Go back in
this order:

1. Find the newest migration of the old commit: `git show <old SHA>:backend/alembic/versions/`
   (the highest number, for example `0024`).
2. On the host, with the **new** image still running (it knows both migrations):
   `docker compose exec backend alembic downgrade <that number>`.
3. Then `deploy/deploy.sh <old SHA>`.

If a downgrade loses data or fails, restore the dump from before the deploy ([Backups](#backups)).

## Handover to Stefan (SCRUM-48)

**Done on 2026-10-15/16:** all hosting is in Stefan's accounts (see *Current host* above), and
Steven removed his side. The table below records how it was done; run the wizard again only for
another move.

All hosting moved to Stefan's accounts: AWS, GitHub (repo + GHCR images), DuckDNS and Cloudflare
Turnstile. Steven's host stayed live until the switch, so there was no time without a host.
In the repo root, on `main`:

```sh
./deploy/handover.sh              # after a break: START_AT=<stage> ./deploy/handover.sh
```

| # | Stage | Who |
|---|-------|-----|
| 1 | Tools, your GitHub login, your AWS account (account ID confirmed before any write), Free Tier check of `t2.micro` | Stefan |
| 2 | Repo transfer `GitGitRice/squadmeet` → Stefan; checks: Actions, rulesets, secrets, variables, collaborators; Steven's deploy variables deleted | **Steven** transfers, Stefan accepts |
| 3 | CI builds the four images `dev` and `main` in `ghcr.io/<new owner>/squadmeet-*` (manual run) | Stefan |
| 4 | Your DuckDNS: a temporary name; `squadmeet` comes at the switch | Stefan |
| 5 | `setup-turnstile.sh` with your Cloudflare account, widget for both names | Stefan |
| 6 | `setup-aws.sh` (budget, GHCR token of your account, server, IP, deploy, automatic deploy), then checks | Stefan |
| 7 | Proof: one merge into `main` deploys by itself | Stefan |
| 8 | Switch: data move if wanted (**Steven** dumps into a one-hour upload link; your server restores it), **Steven** deletes `squadmeet` in his DuckDNS, you add it, deploy with the name, checks | both |
| 9 | **Steven** removes his side (course AWS account, Turnstile widget, GHCR packages); you decide on his collaborator access | both |
| 10 | Docs and the Jira comment | Stefan |

Between stage 2 and stage 7, a merge into `main` builds the images but does not deploy (CI
skips the deploy job without `AWS_DEPLOY_ROLE_ARN`). Each stage writes a line into
`HANDOFF.local.md`. Values are in `.env.aws` (not in git); tokens and keys go only to SSM.

## Troubleshooting

In a shell on the host, in `/opt/squadmeet`:

| Question | Command |
|----------|---------|
| Do all three containers run? | `docker compose ps` |
| Why does the API not start? | `docker compose logs backend` |
| No certificate? (DNS must point to the host, port 80 must be open) | `docker compose logs web` |
| Did the first boot finish? | `cloud-init status` and `/var/log/cloud-init-output.log` |
| Memory? | `free -h` (the swap file must show 2 GB) |
| Disk? | `df -h /` and `docker system df` (each deploy removes the images that do not run; each container keeps at most 3 × 10 MB of logs) |
| Deploy fails at `docker login`? The GHCR token may have expired | `t=$(aws ssm get-parameter --name /squadmeet/ghcr-token --with-decryption --query Parameter.Value --output text); curl -sI -H "Authorization: Bearer $t" https://api.github.com/user \| grep -i -e '^HTTP' -e expiration`; a new token: [setup-aws.sh](setup-aws.sh) stage 4 |

## Host updates

Each deploy installs the timer `squadmeet-os-update.timer` (`SCRUM-49` review): every Wednesday at
03:30 UTC (not before a Monday demo) it installs the Amazon Linux security updates
(`dnf upgrade --releasever=latest --security`). A Docker update restarts the containers. A new
kernel needs a reboot, which nobody does automatically: `dnf needs-restarting -r` says when, then
`sudo reboot` at a quiet time (the stack starts by itself). Last run:
`systemctl status squadmeet-os-update.service`.

The base images in the Dockerfiles are pinned to a digest, so a rebuild gets the same base.
Dependabot ([../.github/dependabot.yml](../.github/dependabot.yml)) opens a PR into `dev` each
month with new digests and new GitHub Action versions.

## Backups

Two kinds, for two cases (`SCRUM-49` review):

- **Before each deploy** `host-deploy.sh` dumps the database to `/opt/squadmeet/backups/<UTC
  time>.dump` (the newest 10 stay). It helps when a migration goes wrong. It is on the same disk,
  so it does not help when the host is gone.
- **Every day at 03:00 UTC** a snapshot of the whole disk, the newest 7 stay. Set it up once per
  AWS account: `AWS_REGION=eu-central-1 deploy/setup-backup.sh`. It helps when the host is gone.

Restore a dump on the host, in `/opt/squadmeet` (this replaces the data in the database):

```sh
docker compose stop backend
docker compose exec -T db sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/<file>.dump
docker compose start backend
```

Restore a snapshot: EC2 → Snapshots → the snapshot → *Create volume* in the instance's zone,
stop the instance, detach its root volume, attach the new one as `/dev/xvda`, start it.

## Audit log (SCRUM-66)

The table `audit_log` keeps each insert, update and delete of a domain row: when, who
(`actor_id` and `actor_kind`: `user`, `admin` or `system`) and what (`changes`; an update holds
only the changed fields as `{"field": [old, new]}`). Code: `backend/app/audit.py`. There is no
Admin page; read it in a shell on the host, in `/opt/squadmeet`. The history of one row, here
Place 42:

```sh
docker compose exec db psql -U squadmeet -d squadmeet -c "
  SELECT a.occurred_at, a.action, a.actor_kind, u.nickname, a.changes
  FROM audit_log a LEFT JOIN app_user u ON u.id = a.actor_id
  WHERE a.entity = 'place' AND a.entity_id = 42
  ORDER BY a.id"
```

`entity` is the table name (`place`, `meetup`, `app_user`, `rating`, ...). Not in the log: secrets
(password hash, MFA secret, Recovery codes, login sessions), Notifications, rows that the
database deletes by cascade (for example the Meetups of a deleted account), and edits in `psql`.
A new password or new Recovery codes show only as `{"password": "changed"}` or
`{"recovery_codes": "changed"}`, without the value (`SCRUM-69`). Ratings and Place
Confirmations are logged (`SCRUM-115`).
An empty `nickname` with `actor_kind = user` means that the account was deleted.

## Move to the NAS later

The NAS needs Docker with Compose and ports 80 and 443 forwarded from the router.

1. Copy `compose.yml` and `host-deploy.sh` to a folder on the NAS.
2. Write the `.env` by hand (same keys as in `host-deploy.sh`), and run `docker login ghcr.io` with
   a `read:packages` token. The NAS has no Parameter Store.
3. Move the data: `docker compose exec db pg_dump -U squadmeet squadmeet > dump.sql` on EC2,
   then `psql` on the NAS.
4. Point the DuckDNS subdomain to the home IP (a DuckDNS update job if the IP changes), then
   `docker compose up -d`.
5. Stop the EC2 instance and release the Elastic IP, so they cost nothing more.

## Captcha keys (Turnstile)

The backend checks a Cloudflare Turnstile token at registration and after 3 failed logins
(`SCRUM-27`). It needs two keys. `host-deploy.sh` reads them from SSM, and the deploy stops
when they are missing.

Locally and in CI, Cloudflare's public test keys are used (`docker-compose.yml`), so the widget
always passes. For the real keys, run the wizard once:

```bash
deploy/setup-turnstile.sh
```

It checks the AWS login, opens the Cloudflare dashboard and says what to click (widget `squadmeet`,
hostname `squadmeet.duckdns.org`, mode Managed). It checks the secret key with Cloudflare, then
stores both keys in SSM. Run it again to replace the keys, for example at the handover to Stefan
(`SCRUM-48`). The keys take effect at the next deploy.

The host's IAM role may already read `/squadmeet/*`, so nothing else changes.

## Photo storage (S3)

Photos (`SCRUM-42`) are in a private S3 bucket, not in the database. The backend reaches it
with the host's IAM role (no stored keys) and gives the browser presigned links that work for
15 minutes. Locally the backend uses the folder `backend/photos/` (`PHOTO_DIR` in
`docker-compose.yml`) with signed links of its own; the tests use neither.

Run once per AWS account, then deploy again:

```bash
AWS_REGION=eu-central-1 deploy/setup-photos.sh <instance-id>
```

It creates the bucket `squadmeet-photos-<account id>` (all public access blocked), lets the
role `squadmeet-ec2` put, get and delete objects under `places/`, stores the bucket name in
`/squadmeet/photo-bucket`, and sets the IMDS hop limit of the instance to 2: the backend runs in
a container, one network hop behind the host, and IMDSv2 answers only within the hop limit.
`setup-aws.sh` starts new instances with hop limit 2.

**Only the backend reaches the role (`SCRUM-49` review):** with hop limit 2, every container could
get the role's credentials. So the database is only in the internal network `data` (no route out
of the host), and Caddy (fixed address `172.30.0.10` in the network `edge`) is blocked from
`169.254.169.254` by an iptables rule in Docker's chain `DOCKER-USER`. `host-deploy.sh` installs
it as the systemd unit `squadmeet-imds-block.service`, so it is back after a reboot. Check on the
host: `iptables -S DOCKER-USER`.

Without the parameter the deploy still works and Photos are off (upload answers 503).

**Deferred since 2026-10-20 (`SCRUM-94`):** Photos are off with the switch `PHOTOS_ENABLED:
"false"` in [compose.yml](compose.yml). Off, every photo endpoint answers 404 and the frontend
hides Photos (it asks `GET /api/photos/config`). The bucket, its parameter, the files and the
`photo` rows stay. To switch Photos on again, set `PHOTOS_ENABLED: "true"` in `compose.yml`
(locally in `docker-compose.yml`) and deploy. No migration and no new setup run are needed.

## Web Push (VAPID)

Web Push (`SCRUM-44`) uses one P-256 VAPID key pair. The public key is sent to signed-in browsers;
the private key stays in SSM Parameter Store and is passed only to the backend container. Generate
and store the pair once per AWS account, then deploy again:

```bash
AWS_REGION=eu-central-1 deploy/setup-push.sh
```

The script stores `/squadmeet/vapid-public-key` and the encrypted
`/squadmeet/vapid-private-key`. Replacing the pair invalidates existing subscriptions, so users
would have to turn Push on again. Without both values the app keeps working, but the Push setting
shows that Push is not configured.

For local testing, generate a matching pair in the ignored `.env` without printing the private
key, then recreate the backend:

```bash
deploy/setup-push-local.sh
docker compose up -d --force-recreate backend
```
