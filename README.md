# Penvire Lab contracts

> **Penvire Lab** is a learning project. It never runs in production and never holds real data. Lab and product share no code.

**Status:** in progress.

OpenAPI, AsyncAPI and Avro contracts between the Penvire Lab services and clients.

## What goes here

- OpenAPI definitions for every lab service, each operation declaring its audience, callers and scopes
- AsyncAPI and Avro schemas for events
- The pipeline that validates contracts and publishes them as versioned packages (Maven group `dev.penvire.lab`, npm scope `@penvire-lab`)

Services and clients consume contracts only through published packages. Every contract change bumps its version.

## Using the packages

Released contracts are published to the [Forgejo package registry](https://git.qf0xb.de/penvire/-/packages), readable without authentication:

```kotlin
repositories {
    maven("https://git.qf0xb.de/api/packages/penvire/maven")
}

dependencies {
    // Server-to-server client for another service.
    implementation("dev.penvire.lab:identity-client:0.1.0")
    // Avro classes and schema revisions of another service's events.
    implementation("dev.penvire.lab:identity-events:0.1.0")
}
```

| Artifact | Contents |
| --- | --- |
| `dev.penvire.lab:<service>-client` | MicroProfile REST client (`@RegisterRestClient(configKey = "<service>")`) with sources |
| `dev.penvire.lab:<service>-openapi@yaml` | The service's OpenAPI document as one bundled file, for generating its server interfaces |
| `dev.penvire.lab:<service>-events` | Avro classes for the service's events (latest schema revisions) with sources, and every revision as `avro/<full name>/<revision>.avsc` for decoding by `ce_dataschema` |
| `dev.penvire.lab:public-api@yaml` | Every `api` and `protocol` operation of every released service, merged: the contract of the public API gateway |
| `@penvire-lab/api-client` (npm) | TypeScript fetch client for the `api` operations, ESM with type declarations; `protocol` schemas (such as OpenID discovery and JWKS) as types only, since an OIDC library calls those endpoints |

For npm, point the scope at the registry in `.npmrc`:

```ini
@penvire-lab:registry=https://git.qf0xb.de/api/packages/penvire/npm/
```

## API reference

The [contract reference](https://penvire.github.io/penvire-lab-contracts/)
lists the latest and earlier OpenAPI and AsyncAPI releases for each service.
OpenAPI releases have a read-only Swagger UI and a downloadable, bundled
`openapi.yaml`. AsyncAPI releases show event channels and the contract document,
with downloads for `asyncapi.yaml` and the tagged Avro schema revisions.

To preview it locally, build the site from Git tags and serve the output:

```bash
git fetch --tags
devenv shell -- pnpm install --frozen-lockfile
devenv shell -- pnpm run swagger-site
python3 -m http.server 8000 --directory build/swagger-site
```

Open <http://localhost:8000/>. The hosted site is served by GitHub Pages
(source: **GitHub Actions**). Every contract release deploys it after package
publication; to redeploy by hand, run **Deploy Contract Pages** on `main`.

## Related

- [penvire-lab-backend](https://github.com/Penvire/penvire-lab-backend): services and lab documentation
- [penvire-lab-clients](https://github.com/Penvire/penvire-lab-clients): web, desktop and mobile apps

## License

[Apache-2.0](LICENSE)

## Contributing

Commits must be signed and follow [Conventional Commits](https://www.conventionalcommits.org/). Pull requests are squash-merged; the PR title must be a Conventional Commit.

## Security

See the [Penvire security policy](https://github.com/Penvire/.github/blob/main/SECURITY.md).
