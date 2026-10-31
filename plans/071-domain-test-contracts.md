# 071 - Stronger domain contract tests

## Decisions

- Verify refreshed snapshots, immutability and geometry/name-only updates.
- Isolate catalogue hash, byte, release and membership validation guards.
- Verify actual GPX coordinate presence, direction and waypoint content.
- Exercise nonzero split gaps and manual legs without inferred connectors.
- Assert exactly which completion events survive sorting and truncation.
- Check overlap locations, endpoints and direction, not merely run counts.
- Cover status filters, facets, candidate ordering, east-west/bent distances,
  hit-test clamping, badge contrast and the specified status-style mapping.
- Exercise share encoding without compression and recipient-owned geometry.

Preserve established behavior; do not add speculative validation requirements
or delete category/identity regression tests merely because they look similar.

## Validation

Run typecheck, all unit tests, the production build and every browser journey
before committing. The separately discovered backup byte-limit fix belongs to
plan 070.

Implemented; all scoped domain tests pass without changing domain behavior
outside the separately committed backup safeguard.
