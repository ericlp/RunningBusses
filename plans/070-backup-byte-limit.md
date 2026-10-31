# 070 - Enforce the backup byte limit

## Problem and fix

The backup parser's 25 MiB safeguard counted UTF-16 string characters rather
than UTF-8 file bytes. A valid backup with non-ASCII names could exceed the
documented limit and still be accepted.

Count UTF-8 bytes when enforcing the existing limit. Preserve backup schema,
legacy compatibility and error reporting. Add Unicode boundary coverage along
with completion-log round trips and existing malformed-snapshot cases.

## Validation

The new Unicode regression fails without the fix. Run typecheck, all unit tests,
the production build and every browser journey before committing.

Implemented with a regression proving that non-ASCII content counts toward the
existing byte limit, without changing the backup wire format.
