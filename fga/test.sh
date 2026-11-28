#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
shopt -s failglob

# Keep suites beside fga.mod: OpenFGA resolves references within the suite directory.
for suite in *.fga.yaml; do
  bash cli.sh model test --tests "$suite"
done
