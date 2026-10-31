# 075 - Development container

Status: implemented and validated on 2026-11-01.

Goal: a reproducible development environment for the app and the forthcoming
local runnable-GPX preparation, without depending on host Node/browser/OSM
packages.

## Decisions

- Use the official Ubuntu 24.04 development-container base and a pinned mise
  binary. Install the project's exact Node version from `mise.toml`; do not
  maintain a second Node version in the container configuration.
- Retain the CLI-generated `devcontainer-lock.json` to pin feature versions
  and their registry integrity digests.
- Run as the base image's non-root `vscode` user. Setup trusts this repository's
  mise configuration, installs locked npm dependencies and the project's
  Chromium plus Linux browser dependencies, and fails explicitly on errors.
- Keep container `node_modules` in a dedicated named volume to avoid mixing
  host and Linux native dependencies. Do not mount host credentials explicitly
  or add secrets to the image.
- Include osmium and GitHub CLI. The user selected Docker-in-Docker for local
  runnable-GPX work: use the official feature and its dedicated daemon storage,
  not a host Docker socket mount. This requires a privileged outer container;
  it is not a security sandbox for untrusted repositories.
- Reserve 1 GB of shared memory for Chromium and forward Vite ports 5173/4173.
  Do not start a server automatically: the browser runner owns its preview
  lifecycle, and port 4173 must be free.
- Bind the browser runner's preview explicitly to IPv4 loopback. Actual
  container validation found that Vite's default `localhost` binding selected
  `::1`, while Node's readiness request connected to `127.0.0.1`; the runner
  timed out despite a running preview. An explicit loopback binding fixes the
  listener rather than changing global DNS preferences or timeout thresholds.
- Settle each keyboard zoom in the history journey with the installed browser
  clock and an explicit animation-state wait. Parallel container runs exposed
  ignored rapid zoom inputs during Leaflet's active transition; retain the
  stop-label assertion and avoid real-time sleeps or increased deadlines.
- Do not restore, build or publish the stashed runnable-GPX implementation as
  part of this environment change.

## Validation

- Build and start through the development-container CLI, including lifecycle
  setup.
- Verify the exact Node version, npm, Chromium, osmium, GitHub CLI and an
  independently functioning nested Docker daemon.
- Run the existing `npm run check` pipeline in the container.
- Commit this environment change separately from the WIP checkpoint after
  required pre-commit checks pass.

## Result

- The development-container CLI built and started the actual configuration;
  its lifecycle installed Node 24.21.0 from `mise.toml`, npm dependencies,
  Chromium and system dependencies successfully.
- Verified mise, Node/npm, GitHub CLI and osmium. A nested Docker container ran
  successfully through the dedicated inner daemon.
- The complete `npm run check` pipeline passed inside the container: typecheck,
  292 unit tests, published dataset validation, production build and all 23
  browser journeys with two workers.
- Container validation exposed the IPv4/IPv6 preview binding mismatch and a
  parallel keyboard-zoom race in the history journey. Both were fixed without
  changing production application behavior or weakening browser assertions.
- The runnable-GPX implementation remains stashed and unpublished.
