# 072 - Storage, release and publication test integrity

## Decisions

- Use fake-indexeddb for real transaction rollback, completion and serialized
  updates, including recovery/courses/people/history import atomicity.
- Give offline releases different metadata and geometry; hold old responses
  across an overlapping deployment refresh.
- Model independent named service-worker caches and actual misses/deletions;
  defer writes to verify serialization and recovery after queue failure.
- Make the transit builder import-safe with an injectable filesystem root.
  Run tiny local GTFS fixtures to verify required geometry blocks publication
  before output changes and calendar weighting retains its category semantics.
- Cover stop-position validation and the published default gzip-size budget.
- Preserve cross-direction representative selection: the reviewed preference
  applies within a direction, and no established plan requires preferring an
  ordinary opposite direction over the existing trip-count tie-break.

No feed download or real publication is permitted in fixture tests. Clean up
only each test's own temporary directory.

## Validation

Run typecheck, all unit tests, dataset validation, the production build and every
browser journey before committing. Preserve CLI invocation and generated data.

Implemented. The added fixtures exercise the real builder and IndexedDB
helpers, and the published dataset validates without modification.
