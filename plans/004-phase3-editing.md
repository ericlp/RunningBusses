# 004 – Phase 3: editing

Built on top of Phase 2.

## What exists

- **Redigera** on incomplete courses opens the builder with the course's legs as a draft (`editingId`). The course's own lines are released for the draft; other courses' lines stay unavailable. Completed courses have no edit button (unlock first).
- **Remove from the ends:** a × on the first and last card. Never from the middle, and never the only remaining leg (deleting the course is the way to remove everything).
- **Split:** `✂ Dela` between two legs opens a preview with a name and total for each half. Confirming replaces the course with both halves in one write; both become `NotCompleted`. The gap across the split is dropped from the totals. The split uses the draft as it currently stands, so unsaved edits go into the halves.
- **Reverse:** `⇄ Vänd riktning` flips order and each leg's direction.
- **Rename:** the name field in the strip. **Undo:** `Ångra senaste` (same as removing the last leg).
- **One draft only.** Closing keeps the draft (new course or edit); `Förkasta ändringar/utkast` deletes it. Opening an edit while a different draft has content asks before discarding it. A saved edit draft is dropped on load if its course was deleted or completed meanwhile.
- Pure rules (`removeFirst`, `removeLast`, `canSplitAt`, `splitAt`, `reverseLegs`) are in `src/domain/course.ts` with tests.

## Decisions for manual legs

A manual leg has no end point, so it can never start a course:
- Removing the first leg also drops manual legs that would end up at the front.
- A split cannot be placed before a manual leg.
- Reverse is unavailable when the last leg is manual.

## Not changed

Unlock still has no pinning (Phase 5).
