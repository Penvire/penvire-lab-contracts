# Penvire Lab contracts

> **Penvire Lab** is a learning project. It never runs in production and never holds real data. Lab and product share no code.

**Status:** not started yet.

OpenAPI, AsyncAPI and Avro contracts between the Penvire Lab services and clients.

## What goes here

- OpenAPI definitions for every lab service, each operation declaring its audience, callers and scopes
- AsyncAPI and Avro schemas for events
- The pipeline that validates contracts and publishes them as versioned packages (planned: Maven group `dev.penvire.lab`, npm scope `@penvire-lab`)

Services and clients consume contracts only through published packages. Every contract change bumps its version.

## Related

- [penvire-lab-backend](https://github.com/Penvire/penvire-lab-backend): services and lab documentation
- [penvire-lab-clients](https://github.com/Penvire/penvire-lab-clients): web, desktop and mobile apps

## License

[Apache-2.0](LICENSE)

## Contributing

Commits must be signed and follow [Conventional Commits](https://www.conventionalcommits.org/). Pull requests are squash-merged; the PR title must be a Conventional Commit.

## Security

See the [Penvire security policy](https://github.com/Penvire/.github/blob/main/SECURITY.md).
