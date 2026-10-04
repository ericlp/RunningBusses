# 007 – Phase 6: polish

Status: done except the real-phone walkthrough.

- Touch targets: chips and selects are now 44 px high. A browser check asserts it on browse, filters, build and settings at 360 px and 1280 px, light and dark.
- Contrast: white text on the bright Västtrafik blue (#009ddb, about 3:1) failed AA. Filled controls now use `--vt-blue-strong` (#006f9b); the bright blue stays for lines and outlines. axe-core reports no serious or critical violations.
- Keyboard: a visible focus ring is asserted.
- Browser journeys moved from the ignored `.cache/` into `e2e/` (`npm run e2e`): courses, editing, backup, update, i18n, a11y. CI runs them before deploy.
- README added.
- Visual check of lines 34, 37, 42, 44, 62, 62 retur, 90, 94 and 94 retur (screenshots via `#line=` links): each path is one continuous route between its termini, with turnaround loops at the ends and no stray detours. No data changes needed.
- Still open: walk through it on a real phone (bottom sheet, map gestures, file download/upload on iOS/Android). It needs a physical device and cannot be done from CI.
