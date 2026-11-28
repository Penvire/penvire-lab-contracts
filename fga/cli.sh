#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

exec docker run --rm --network none -v "$PWD:/contracts:ro" -w /contracts \
  openfga/cli:v0.9.0@sha256:7a7f9fb0a27a788a0fa7907eb5fc751c3134ca0776245578308e011606b61091 "$@"
