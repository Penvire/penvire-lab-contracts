# Changelog

## [0.2.0](https://github.com/Penvire/penvire-lab-contracts/compare/openapi-identity-v0.1.0...openapi-identity-v0.2.0) (2026-11-22)


### ⚠ BREAKING CHANGES

* **identity:** Fetch keys from /.well-known/jwks.json instead of /jwks. Clients using discovery should follow jwks_uri.

### Features

* **identity:** move JWKS to a well-known path ([#17](https://github.com/Penvire/penvire-lab-contracts/issues/17)) ([b208033](https://github.com/Penvire/penvire-lab-contracts/commit/b208033e05a1019b5a15b66b4c356b5d516f631d))

## 0.1.0 (2026-11-21)


### Features

* **identity:** add discovery and JWKS contract ([#7](https://github.com/Penvire/penvire-lab-contracts/issues/7)) ([ad1a864](https://github.com/Penvire/penvire-lab-contracts/commit/ad1a864411128cefbdd9b60f6675084b19df8331))
