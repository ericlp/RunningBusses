# 050 – Categories counted in progress

Status: todo, design agreed.

The progress panel (037) counts all lines. Add a setting for which categories (`stadsbuss | stombuss | express | industri | tram`) it counts. Default: only stadsbuss.

## Decisions

- **Separate setting** in Settings, independent of the map's category filter. Multi-select like the map filter; at least one category must stay selected (the last one cannot be removed).
- Stored in localStorage `rb.progressCategories`, validated on load, falling back to `['stadsbuss']`.
- **Everything in the panel follows it:** the overall "x of y lines" and distance, the per-category rows (only included categories get a row), and the per-person totals.
- **Mixed courses** (e.g. stadsbuss + express legs) count only the distance of legs whose line is in an included category. Connector and manual legs are not counted. Course-level counts (such as latest completed) stay as they are.
- The completion history (044) is a log of events and stays unfiltered.
- Lines missing from the dataset (kept in old courses) are counted by the category stored in the course's leg snapshot, so they keep counting.

## Tests

- Unit (`stats.test.ts`): default is stadsbuss only; filter changes totals, rows and per-person distances; mixed course counts only included legs; storage validation falls back to the default; the last category cannot be removed.
- e2e: toggling a category in Settings changes the panel total and rows, and the choice survives a reload.
- i18n keys in sv/en/fr.
