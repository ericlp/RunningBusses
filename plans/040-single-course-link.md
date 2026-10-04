# 040 – Share a single course

Status: done. Builds on [033](033-share-link.md).

- "Dela bana" on a course shares only that course (Web Share API where available, otherwise copies the link). The shared logic is in `components/shareLink.ts`, also used by the settings share buttons.
- The payload gets an optional `p: 1` flag; the receiver reads it as `partial`. A partial link opens the usual import preview but only offers merge, never replace, and says so.
- Participants travel with the course ([038](038-people.md)).
- Everything else follows 033: nothing is saved before confirming, the recovery copy is made, input is capped and validated.
- Tests: `share.test.ts` (partial flag, participants), `e2e/people.mjs`.
- Also fixed stale button selectors in `e2e/share.mjs` and `e2e/backup.mjs`.
