#!/usr/bin/env bash
set -euo pipefail

sudo chown "$(id -u):$(id -g)" node_modules
mise trust mise.toml
mise install
mise reshim
mise exec -- npm ci
mise exec -- npx playwright install --with-deps chromium
docker info >/dev/null
osmium --version
