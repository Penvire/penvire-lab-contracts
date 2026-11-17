# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `Penvire/penvire-lab-contracts`.
Use the `gh` CLI for all tracker operations. Inside this clone, `gh` infers the repository from the Git remote.

## Conventions

- Create: `gh issue create --title "..." --body "..."`. Use a heredoc for multiline bodies.
- Read: `gh issue view <number> --comments`. Fetch labels and comment metadata with `--json` when needed.
- List: `gh issue list --state open --json number,title,body,labels,comments`. Use appropriate label and state filters.
- Comment: `gh issue comment <number> --body "..."`
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

When a skill says "publish to the issue tracker", create a GitHub issue.
When a skill says "fetch the relevant ticket", read the issue and its comments.

## Pull requests as a triage surface

**PRs as a request surface: no.**

If enabled later, triage external PRs with the same roles using `gh pr` commands.
Read the PR and its diff. Include authors with association `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`.

GitHub shares one number space across issues and PRs.
For an ambiguous reference, resolve its type with `gh pr view <number>` and then `gh issue view <number>` if needed.

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, containing Notes, Decisions-so-far, and Fog.
- Child: link each ticket as a GitHub sub-issue. If unavailable, use a task list in the map and `Part of #<map>` in the child.
- Type: label children `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- Blocking: use native GitHub issue dependencies. Add an edge with `gh api --method POST repos/Penvire/penvire-lab-contracts/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
- Blocker ID: obtain the database ID with `gh api repos/Penvire/penvire-lab-contracts/issues/<blocker> --jq .id`; do not use the issue number or node ID.
- If dependencies are unavailable, record `Blocked by: #<number>, #<number>` at the top of the child.
- Frontier: select the first open, unassigned child in map order with no open blockers. Native `issue_dependencies_summary.blocked_by` counts open blockers.
- Claim: assign the ticket to the driving developer. For the authenticated developer, use `gh issue edit <number> --add-assignee @me` as the session's first write.
- Resolve: comment with the answer, close the child, and append a summary plus link to the map's Decisions-so-far.
