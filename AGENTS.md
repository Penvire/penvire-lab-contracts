# Penvire Lab contracts

OpenAPI, AsyncAPI and Avro contracts between the Penvire Lab services and clients, published as versioned Maven and npm packages. Services and clients consume contracts only through published packages.

> Penvire Lab is a learning project. It never runs in production, never holds real data and shares no code with the product. Ideas move to the product only by reimplementation or a reviewed copy.

## Repository map

```text
openapi/<service>/openapi.yaml   one release component per service
asyncapi/<domain>/               AsyncAPI and Avro schemas per event domain (not defined yet)
generator/                       validation, compatibility checks, code generation
```

## Development environment

Enter the environment with `devenv shell`, or run `direnv allow` once. It provides Java 25, Gradle 9, Node 24, pnpm and openapi-changes. Always run tools through it.

Git hooks run automatically: a commit-msg hook rejects messages that are not Conventional Commits (the same rule as CI), and actionlint checks workflow files.

No build yet. Validation and publishing scripts arrive with the first contract.

## Rules

- Never push to `main`. Create a branch (`feat/`, `fix/` or `chore/`), push it and open a pull request. The maintainer merges.
- Pull requests are squash-merged. The PR title becomes the commit on `main`, so it must be a Conventional Commit; mark breaking changes with `!`.
- Commits are GPG-signed; `main` rejects unsigned commits.
- PR body: a one-paragraph summary, then a `## Test plan` section.
- Releases are managed by release-please. Do not bump versions or edit `CHANGELOG.md` by hand.
- Everything starts at 0.x. Below 1.0.0, `feat` and `fix` bump the patch and a breaking change (`!`) bumps the minor, so a new minor always means breaking. Leaving 0.x is deliberate: a commit with a `Release-As: 1.0.0` footer (ADR 0001 in penvire-lab-backend).
- The PR title becomes the changelog entry. Keep one user-facing change per PR. If a PR contains several, list every `feat` and `fix` on its own line in the PR description, between `BEGIN_COMMIT_OVERRIDE` and `END_COMMIT_OVERRIDE`; release-please uses that block instead of the title.

## Agent docs

- [Issue tracker](docs/agents/issue-tracker.md): GitHub Issues for `Penvire/penvire-lab-contracts`
- [Triage labels](docs/agents/triage-labels.md)
- [Domain docs](docs/agents/domain.md): where the glossary and ADRs live

## Related repositories

- `../backend`: [penvire-lab-backend](https://github.com/Penvire/penvire-lab-backend), also the lab documentation
- `../clients`: [penvire-lab-clients](https://github.com/Penvire/penvire-lab-clients)
