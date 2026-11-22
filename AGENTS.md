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
generator/compat/                breaking-change check and the pinned openapi-changes version
generator/public-api/            merged public API: merge, diff-based versioning, @penvire-lab/api-client packaging
generator/lib/                   helpers shared by the scripts
build.gradle.kts                 lint, tests, Java clients (build/clients/<service>) and public-api with its TS client (build/public-api)
```

## Development environment

Enter the environment with `devenv shell`, or run `direnv allow` once. It provides Java 25, Gradle 9, Node 24, pnpm and openapi-changes. Always run tools through it. openapi-changes is the release binary pinned by SHA-256 in `generator/compat/openapi-changes.json`; CI installs it from the same file, so upgrade it there.

Git hooks run automatically: a commit-msg hook rejects messages that are not Conventional Commits (the same rule as CI), and actionlint checks workflow files.

### Building

- `./gradlew build`: Redocly lint of every service document, the script tests, generating and compiling each `<service>-client`, and building public-api from the working tree with `@penvire-lab/api-client` compiled and packed. CI runs the same command.
- `pnpm run lint` and `pnpm test`: the Node half on its own.
- `pnpm run breaking`: compares every service document with the merge base of `origin/main` and lists breaking changes: openapi-changes' structural diff plus Penvire rules (audience changed, scope added, caller removed, parameter became required). The **Breaking changes** workflow runs it on every pull request and fails when it finds any and the title has no `!`.

A new service needs `openapi/<service>/openapi.yaml` with `info.version: 0.0.0`. Gradle picks it up automatically. It must also be registered in `release-please-config.json` and `.release-please-manifest.json`; most services already are.

### Publishing

Merging a release PR publishes that service's `<service>-client` and `<service>-openapi` to the Forgejo Maven registry (`forgejoMavenUrl` in `gradle.properties`). The `publish` job in `release-please.yml` does this with the Actions variable `FORGEJO_USER` and the secret `FORGEJO_TOKEN`. A rerun skips versions that are already uploaded.

After that, the `public-api` job merges the `api` and `protocol` operations of every service at its last release tag (`node generator/public-api/build.mjs released`). It compares the result with the last published `dev.penvire.lab:public-api` on Forgejo, which is the baseline, and versions it from the diff (`release.mjs`; 0.x rules as for services). If anything changed, it publishes `@penvire-lab/api-client` (methods for `api` operations only, every schema as a type) to Forgejo npm and then `public-api` (YAML) to Forgejo Maven. Settings such as the gateway URL live in `generator/public-api/config.yaml`. Finally, `label-published` adds `autorelease: published` to the release PR. Never publish by hand. To test the publication locally, use `./gradlew :<service>-client:publishAllPublicationsToForgejoRepository -PforgejoMavenUrl=file:///tmp/repo`.

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
- Everything starts at 0.x. Below 1.0.0, `feat` and `fix` bump the patch and a breaking change (`!`) bumps the minor, so a new minor always means breaking. Leaving 0.x is deliberate: a commit with a `Release-As: 1.0.0` footer (ADR 0001 in penvire-lab-backend).
- The PR title becomes the changelog entry. Keep one user-facing change per PR. If a PR contains several, list every `feat` and `fix` on its own line in the PR description, between `BEGIN_COMMIT_OVERRIDE` and `END_COMMIT_OVERRIDE`; release-please uses that block instead of the title.

## Agent docs

- [Issue tracker](docs/agents/issue-tracker.md): GitHub Issues for `Penvire/penvire-lab-contracts`
- [Triage labels](docs/agents/triage-labels.md)
- [Domain docs](docs/agents/domain.md): where the glossary and ADRs live

## Related repositories

- `../backend`: [penvire-lab-backend](https://github.com/Penvire/penvire-lab-backend), also the lab documentation
- `../clients`: [penvire-lab-clients](https://github.com/Penvire/penvire-lab-clients)
