# 066 - Deterministic category retry journey

Status: implemented and validated.

The category-data journey restored its mocked network while a mode-triggered
category request could still be loading. That request could succeed before the
test clicked Retry, removing the button and producing a locator timeout.
Only plan documents had changed; this was not a new feature requiring different
application behaviour.

Wait for the visible unavailable state before restoring the mocked network in
the deep-link, share-link and planning retry cases. In planning, first settle
the Plan transition, observe the request started by Create course, and wait for
its failure; an unavailable label left over from the previous mode is not enough.
Also wait for the new request triggered by the explicit Retry click. Keep the existing
assertions that planning waits for every selected category and displays the
complete suggestion pool after retry. No forced clicks, sleeps, automatic
retries or application changes.

Validation: the category-data journey passed five consecutive production-preview
runs. Typecheck, all unit tests, production build and every browser journey passed.
