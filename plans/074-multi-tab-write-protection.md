# 074 - Conservative multi-tab write protection

Status: implemented and validated.

## Decisions

- Use browser-local random revision tokens, not course etags or backup fields.
  Courses are stored together and line membership is a whole-state invariant.
- Load courses, people, history, draft and revision in one readonly transaction.
  Compare and replace revisions and records in one readwrite transaction.
- Reject stale writes, including changes to different courses, imports,
  reconciliation, completion/undo, people and shared draft persistence.
- Serialize this tab's draft writes. Reject overlapping saved-state writes
  calculated from an older local state. A conflict stops all subsequent writes
  in that tab; no retries with a fresh revision or automatic merging.
- Do not rewrite the draft on startup when unchanged. Saving completion and its
  history entry is atomic; failures leave both unchanged.
- Show a persistent warning and keep the in-memory draft visible on conflict.
  Reload is explicit and confirms that unsaved local changes will be lost.
- Preferences and transit caches are independent and remain unchanged. No
  automatic cross-tab refresh, locking, or per-course merging in this version.
  Older app versions that do not participate in revisions must be reloaded.

## Validation

Real IndexedDB tests cover stale and simultaneous writes, atomic rollback,
draft protection, initial legacy data, and same-tab draft ordering. A two-page
browser journey covers rejected draft and course writes, retained edits,
persistent warnings and confirmed reload.
