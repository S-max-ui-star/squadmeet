# Abschlussprojekt

Team final project (3 people since 2026-10-12), tracked in Jira.

## Handoff

[HANDOFF.md](HANDOFF.md) is the team's shared handoff (in git): rules, team, Jira, decisions,
debugging case. `HANDOFF.local.md` is each person's own progress (not in git): what is in
flight, why, and what comes next. The rules section of `HANDOFF.md` says how to write in both.

- **Session start:** read `HANDOFF.md`, then `HANDOFF.local.md`, then the Jira issues they name,
  before you start work. If `HANDOFF.local.md` does not exist, create it (see the rules).
- **Session end:** before you stop, update `HANDOFF.local.md` by the rules. Then tell the person
  what you changed in it.
- **Diary:** at the end of a working day, add the person's short line to
  [DIARY.md](DIARY.md) (rules at its top), in German. Ask them what they did if you do not know.
- **Decision or debugging case:** add it to `HANDOFF.md` when it happens, not at session end.

## Jira

Use the Atlassian MCP server for Jira. The issue hierarchy and the naming conventions are in
`HANDOFF.md` → *Jira*.

## Agent skills

### Issue tracker

Issues live in Jira (project `SCRUM`), accessed through the Atlassian MCP server. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) as Jira labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

<!-- fallow:agent-install v1 claude-import:start -->
@AGENTS.md
<!-- fallow:agent-install v1 claude-import:end -->
