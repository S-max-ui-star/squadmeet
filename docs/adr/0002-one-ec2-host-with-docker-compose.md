# One EC2 host with Docker Compose, later the NAS

The graded deployment must be in a cloud, so we run on AWS (Free Tier plus 15 $ credit). We use
one EC2 instance with Docker Compose (Caddy for HTTPS, FastAPI backend, PostgreSQL with PostGIS)
instead of ECS Fargate and RDS. Reasons: cheapest option, simple to explain, and David's NAS can
run the same Compose file, so the planned move to the NAS after the project costs almost nothing.

## Considered Options

- ECS Fargate + RDS: more "cloud native", but more setup and over budget.
- NAS only: does not meet the brief's cloud requirement, and a home network is a risk on demo day.

## Update 2026-10-21

Since the handover on 2026-10-15 (`SCRUM-48`) the host runs in Stefan's own AWS account
(`t2.micro`, budget alarm 10 USD), not on the course credit. David left the project on
2026-10-08, so a later move to a NAS would be Stefan's. Backups: a dump before each deploy and a
daily disk snapshot ([deploy/README.md](../../deploy/README.md) → *Backups*).
