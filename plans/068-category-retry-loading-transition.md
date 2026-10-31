# 068 - Observe loading before accepting a category failure

Status: implemented.

The planning retry scenario in `e2e/category-data.mjs` still had a race after 066.
The previous mode's unavailable message can remain rendered when Playwright sees
the new mode's network request. Waiting for that message again can therefore
return before React has rendered the new loading state. Restoring the mock then
allows the pending request to succeed and remove Retry before the test clicks it.

For both Plan and Create course, hold the mocked failing request until its
loading message is visible, then release the abort and wait for unavailable.
Scope loading/failure checks to the data-status panel: unloaded list rows use the
same unavailable text and must not satisfy or make these locators ambiguous.
The test can now distinguish successive loading/failure cycles. Keep the network
failing until both transitions finish, and continue to assert that the explicit
Retry click starts a new category request and restores the full suggestion pool.

No application behaviour changes, forced clicks, sleeps or relaxed assertions.
The corrected category-data journey passed five consecutive production-preview
runs. Full typecheck, unit, build and browser validation is required before commit.
