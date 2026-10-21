# Abschlussprojekt — Working notes

Syntax Modul 4 final project (Fullstack, Backend & DevOps). This folder is where I prepare
for the project and later build it. The original course text is in `BRIEF.md`.

**State (2026-10-02):** Preparation only. No team, no topic, no code.

> **Outdated (note of 2026-10-21):** these are the notes from before the project. The dates
> changed: work ends Fri 23.10.2026, the presentation is on Mon 26.10.2026 (see
> [HANDOFF.md](HANDOFF.md)). The topic is SquadMeet, not one of the shortlist below.

## Real timeline

The brief says "3 sprints of 1 week each". The course calendar is shorter.

| Date | What happens |
|------|--------------|
| Mon 05.10. – Tue 06.10. | Course finishes the open DevOps and automation topics |
| **Wed 07.10.** | **Project starts:** ideas, requirements, architecture, tech choice |
| Thu 08.10. – Fri 09.10. | Planning continues, technical setup |
| Mon 12.10. – Fri 16.10. | Build: app, cloud, CI/CD, deployment, tests |
| Mon 19.10. – Tue 20.10. | Final sprint: tests, fixes, docs, presentation prep |
| **Wed 21.10.** | **Presentation day** (15–20 min per team, live demo) |
| Thu 22.10. | Next course part starts: Cloud Business Expert (IHK) preparation |

**Consequence:** From start to presentation there are only about **2 weeks**
(9–10 working days), not 3. Week 1 of the brief ("Planning & MVP") gets only Wed–Fri.
The presentation is on Wednesday, so week 3 has only 2 working days.

## Must-haves (pass level)

- [ ] **Cloud deployment** — the app runs in a cloud and is reachable
- [ ] **Docker** — the main part of the app runs in a container
- [ ] **CI/CD** — automatic pipeline: test → build → deploy
- [ ] **Real use case** with **at least one complete business workflow**
- [ ] Git/GitHub with regular commits
- [ ] Basic tests
- [ ] Useful documentation
- [ ] **At least one interesting debugging case** — write it down when it happens
      (symptom, wrong guesses, cause, fix). It is a presentation item.

Bonus (only after the must-haves work): Terraform, Ansible, secrets handling,
HTTPS/reverse proxy/domain, monitoring/alerting, more tests, scaling, backup, rollback,
full end-to-end automation.

**Grading rule from the brief:** "Understand what you build." Every tool needs a reason I can
say out loud. 23 logos in the README do not help.

## Presentation must show

Problem & solution · architecture · technologies · important features · technical challenges ·
cloud deployment · Docker · CI/CD · lessons learned. Plus a live demo.

## Decisions (open)

1. **Team or solo?** Unknown until the project start (teams of 3–5, solo possible).
2. **Topic.** Shortlist below.
3. **My role.** Recommendation: take the DevOps part (pipeline, Docker, cloud), or share it.
   It matches this module, the AWS Cloud Practitioner (CLF-C02) preparation and the job search.
   In Modul 3 (MediDoc) one person did all DevOps; I did auth.

## Topic shortlist

| Topic | Business workflow |
|-------|-------------------|
| IT helpdesk | Ticket opened → assigned → in progress → solved → closed (with roles) |
| Asset / licence management | Device issued to an employee → returned → reissued; licence count warning |
| Onboarding / offboarding | New employee → checklist (account, laptop, licences) → done; offboarding reverses it |
| Room / equipment booking | Request → conflict check → confirm → cancel |

Onboarding/offboarding and asset management fit together well. They also make a good
IT-admin story (IHK IT-Administration certificate).

## Working principles

- **Small app, complete delivery chain.** One workflow that is fully deployed is better than
  five features that only run on localhost.
- **Deploy in the first days**, even a "hello world". Deploy problems take longer than
  planned, and the time is short (see timeline).
- **Branching trap from MediDoc:** GitHub's "closes #12" keywords work only for merges into the
  default branch. If the team uses a `develop` branch, make it the default branch, or close
  issues by hand.

## Before Wednesday 07.10.

- [ ] Choose 2–3 favourite topics so the team can decide fast
- [ ] Check the AWS account: Free Tier status, and set a **budget alarm**
- [ ] Do not write app code yet — the team decides the stack on day 1
