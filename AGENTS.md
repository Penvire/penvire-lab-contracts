# Penvire Lab contracts

OpenAPI, AsyncAPI and Avro contracts between the Penvire Lab services and clients, published as versioned Maven and npm packages. Services and clients consume contracts only through published packages.

> Penvire Lab is a learning project. It never runs in production, never holds real data and shares no code with the product. Ideas move to the product only by reimplementation or a reviewed copy.

## Repository map

```text
openapi/<service>/openapi.yaml   one service document; one release component and one Java client each
openapi/scopes.yaml              scope catalogue for x-penvire-scopes
openapi/workloads.yaml           workload catalogue for x-penvire-callers
asyncapi/<domain>/               AsyncAPI and Avro schemas per event domain (not defined yet)
generator/redocly/               Penvire lint rules (Redocly plugin) and their fixture tests
build.gradle.kts                 lint, rule tests and Java client generation into build/clients/<service>
```

## Development environment

Enter the environment with `devenv shell`, or run `direnv allow` once. It provides Java 25, Gradle 9, Node 24, pnpm and openapi-changes. Always run tools through it.

Git hooks run automatically: a commit-msg hook rejects messages that are not Conventional Commits (the same rule as CI), and actionlint checks workflow files.

### Building

- `./gradlew build`: Redocly lint of every service document, the lint-rule tests, and generating and compiling each `<service>-client`. CI runs the same command.
- `pnpm run lint` and `pnpm test`: the Node half on its own.

A new service needs `openapi/<service>/openapi.yaml` with `info.version: 0.0.0`. Gradle picks it up automatically. It must also be registered in `release-please-config.json` and `.release-please-manifest.json`; most services already are.

### Contract rules

Decided in ADR 0001 of `penvire-lab-backend` and enforced by `generator/redocly/penvire.js`:

- Every operation declares `x-penvire-audience`: `api`, `service` or `protocol`; never on the path item.
- `api` operations declare `x-penvire-scopes` from `openapi/scopes.yaml`; `protocol` operations declare none.
- `service` operations declare `x-penvire-callers`, the workloads allowed to call them, from `openapi/workloads.yaml`; `api` and `protocol` operations declare none.
- `api` paths start with `/v<major>/`, `service` paths with `/internal/v<major>/`; `protocol` paths are unversioned. Below contract version 1.0.0, the path major is always `/v1`.
- Path items stay inline in the service document; the rules read operations from `paths`.

## Rules

- Never push to `main`. Create a branch (`feat/`, `fix/` or `chore/`), push it and open a pull request. The maintainer merges.
- Pull requests are squash-merged. The PR title becomes the commit on `main`, so it must be a Conventional Commit; mark breaking changes with `!`.
- Commits are GPG-signed; `main` rejects unsigned commits.
- PR body: a one-paragraph summary, then a `## Test plan` section.
- Releases are managed by release-please. Do not bump versions or edit `CHANGELOG.md` by hand.
- The PR title becomes the changelog entry. Keep one user-facing change per PR. If a PR contains several, list every `feat` and `fix` on its own line in the PR description, between `BEGIN_COMMIT_OVERRIDE` and `END_COMMIT_OVERRIDE`; release-please uses that block instead of the title.

## Agent docs

- [Issue tracker](docs/agents/issue-tracker.md): GitHub Issues for `Penvire/penvire-lab-contracts`
- [Triage labels](docs/agents/triage-labels.md)
- [Domain docs](docs/agents/domain.md): where the glossary and ADRs live

## Related repositories

- `../backend`: [penvire-lab-backend](https://github.com/Penvire/penvire-lab-backend), also the lab documentation
- `../clients`: [penvire-lab-clients](https://github.com/Penvire/penvire-lab-clients)
