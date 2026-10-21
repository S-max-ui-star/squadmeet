# Issue tracker: Jira

Issues live in Jira, not in GitHub Issues. GitHub holds code, PRs and the pipeline only.
Use the Atlassian MCP server (`mcp__atlassian__*`) for every operation.

- Site: `socmediaapp.atlassian.net` · cloudId `4502289e-94d0-48b1-8201-8a91855eb8b2`
- Project key: `SCRUM`
- Hierarchy and naming: `HANDOFF.md` → *Jira*

## Conventions

- **Create**: `createJiraIssue` (project `SCRUM`). Set the parent Epic for Stories and Tasks.
- **Read**: `getJiraIssue` with comments; links via the issue's `issuelinks` field.
- **List**: `searchJiraIssuesUsingJql`, e.g. `project = SCRUM AND statusCategory != Done`.
- **Comment**: `addCommentToJiraIssue`.
- **Labels**: `editJiraIssue` on the `labels` field (add or remove one string).
- **Status**: `transitionJiraIssue`. Flow: Zu erledigen (11) → In Arbeit (21) → Wird überprüft (31) → Fertig (41).
  Jira shows the German names; "In Review" is the transition to "Wird überprüft".
- **Close**: comment why, then transition to Done.

## Dependencies

Use the Jira link type **Blocks**. "A is blocked by B": `createIssueLink` with
inwardIssue = B, outwardIssue = A. An issue is unblocked when every "is blocked by"
issue is Done.

## Link to GitHub

Branch names start with the key (`SCRUM-12-login`, see README → *How we work*), commits too
(`SCRUM-12 add login form`).
The "GitHub for Jira" app then shows branches, commits and PRs on the issue.

## When a skill says "publish to the issue tracker"

Create a Jira issue in `SCRUM`.

## When a skill says "fetch the relevant ticket"

`getJiraIssue` with the key, including comments.

## Wayfinding operations

- **Map**: an Epic with the label `wayfinder:map`. Its description holds Notes / Decisions so far / Fog.
- **Child ticket**: a Story or Task with the Epic as parent, label `wayfinder:<type>`
  (`research` / `prototype` / `grilling` / `task`).
- **Blocking**: the Blocks link type (above).
- **Frontier query**: `parent = <map key> AND statusCategory != Done AND assignee is EMPTY`,
  then drop issues with an open "is blocked by" link. First by rank wins.
- **Claim**: set the assignee to the person driving the session.
- **Resolve**: comment the answer, transition to Done, add a pointer to the map's Decisions so far.
