# 069 - Browser test reliability and runtime

## Decisions

- Make every browser assertion and page error fail its journey.
- Replace swallowed selector failures and fixed sleeps with explicit state waits.
- Use a small deterministic transit fixture and intercepted tiles for journeys
  that do not test the published feed or service worker.
- Add browser coverage for manual legs, draft lifecycle, failed saves/imports,
  replace imports, history after deletion and offscreen rendering after panning.
- Run isolated journeys with bounded concurrency (two by default), report their
  durations, wait for preview readiness and always clean up owned processes.
- Keep the throttled measurement journey opt-in; protect its inexpensive
  published payload-size budget in the unit suite.

## Validation

Run typecheck, unit tests, production build and every registered browser journey
before committing. Run browser journeys serially as well to check worker
independence. No production UI or storage formats are intentionally changed.

## Result

Implemented. All 22 journeys passed with two workers in 39.1 seconds on the
development machine. Added three journeys without deleting feature assertions;
the unit suite, typecheck and production build also passed.
