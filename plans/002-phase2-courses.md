# 002 – Phase 2: courses

Built on top of Phase 1. This records what was decided while building, where it differs from or narrows `PLAN.md`.

## What exists

- **Domain** (`src/domain/course.ts`, tested): legs, totals with straight-line gaps, `formatTotal` (bracket only above 100 m), next-leg options within the radius (both ends, both orientations, loops, used lines excluded), derived route status.
- **Storage** (`src/data/store.ts`): courses and one draft in IndexedDB, radius in localStorage. "Saved" is shown only after the write resolves; failures show a message and leave state unchanged.
- **UI**: `Planera` mode with course list, details (every gap listed), highlight on map with dashed connectors, mark completed / not completed (confirmed), delete (confirmed). Draft builder with top strip (name, total, save, close), cards with connector gaps, undo, radius field, discard. Status filter in Karta/Planera.
- A leg stores a full copy of its line, so courses survive data updates (rules for updates come in Phase 5).

## Decisions

- **Manual list simplified.** The data has no lines without geometry (all 49 have shapes), so there is no pre-made list. Instead a **manual leg** (name plus optional km) can be added after at least one real leg, and counts 0 and shows "minst" until a distance is entered. After a manual leg every unused line is offered, since there is no end point to measure from. If a real line ever lacks geometry the builder can list it later.
- **Unlock now, pinning later.** "Markera som ej genomförd" works already, with a confirmation. Pinning to historical data only matters once monthly updates exist (Phase 5).
- **Draft.** Saved automatically. `Stäng` keeps it and returns to the list; `Förkasta utkast` deletes it after confirmation. A line cannot be in two courses, nor twice in a draft.
- Builder candidates respect the category/tag/distance filters, but not the status filter.
- Course names default to `Bana N`.

## Not in this phase

Edit button, split, remove from ends, reverse (Phase 3); backup (Phase 4).
