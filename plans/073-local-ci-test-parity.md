# 073 - Local and CI test parity

## Decisions

- Local mise and both workflows' setup-node use `mise.toml` for the same exact
  Node version. Dependencies and Chromium remain pinned by `package-lock.json`.
- `npm run check` runs typecheck, unit tests, dataset validation, build and all
  browser journeys with exactly two workers. Deployment uses this same command;
  focused and serial browser commands remain available for investigation.
- Pause the stalled course-card scenario's browser clock at a fixed future
  instant before opening the preview. Never pause against the Node process's
  wall clock: browser time can already be ahead, causing CI-only failures.
- Assert the complete 15-second deadline, one millisecond before expiry and
  exactly at expiry without depending on real execution speed.
- Run accessibility scans after resuming the clock, since axe needs timers.
- Document identical setup commands without claiming identical OS or hardware.

## Validation

Run the shared pipeline, repeat the card journey and run it serially. Keep all
existing image, sharing, accessibility and tile-deadline assertions.

## Result

The shared pipeline passed twice: 282 tests, dataset validation, typecheck,
production build and all 22 browser journeys. The card journey also passed
independently and with one worker. An `E2E_WORKERS=4` environment override did
not change the shared pipeline's explicit two-worker setting.
