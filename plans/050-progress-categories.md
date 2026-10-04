# 050 – Categories counted in progress

Status: todo.

- The progress panel (037) counts all lines. Add a setting for which categories (`stadsbuss | stombuss | express | industri | tram`) are included in the progress counter. Default: only stadsbuss.
- Stored in localStorage as `rb.progressCategories`, validated on load, falling back to `['stadsbuss']`.
- Applies to the overall total and per-category rows; the person totals and history stay unfiltered.
- Setting lives in Settings next to the other display options (multi-select like the category filter, at least one category required).
- Test: unit tests in `stats.test.ts` for the filter; e2e journey toggling a category changes the total.
