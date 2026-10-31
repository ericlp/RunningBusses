# 067 - Course action groups and GPX guidance

Status: implemented.

- Keep navigation separate, group course-link/image/GPX sharing and GPX export
  together, then group course editing, completion and deletion together. Preserve
  conditional actions for completed, incomplete and pinned courses. Groups have
  translated accessible names and wrap naturally on phones.
- Successful GPX handoff and download-started notices use the existing blue-grey
  informational toast with `role="status"`. Failures retain the red alert toast;
  cancellation remains silent. File sharing returns an explicit message tone,
  rather than inferring success from translated text.
- GPX guidance in Swedish, English and French explains download-to-Files sharing
  when the browser does not offer Garmin Connect, and warns that Garmin may import
  only the first line. Users must inspect the whole route. Do not imply that a
  share-sheet handoff proves import or watch delivery, or change exported geometry.
- Extend `e2e/gpx-share.mjs` for action grouping and layout in both course states
  at phone and desktop widths, updated guidance, informational success/download
  notices and red failures. Unit tests retain typed handoff/error outcomes.
