# 061 – Shareable course card

Status: todo.

Goal: "Dela bild" on a course makes a Strava-style image of the course and shares it (Web Share with files) or downloads it as a PNG. Works offline and without a backend.

## Decisions

- **Content:** the course name, the route drawn over the map, total distance (with "minst" if a manual leg has no distance), line badges in running order, start and end stop names, status, completion date and runners for completed courses, and the app name. No personal data beyond what the user already put on the course.
- **Format:** 1080 × 1350 PNG (4:5 portrait, fits feeds and stories), drawn on a `<canvas>` at that size whatever the screen. Light theme colours and the Västtrafik palette, so a card looks the same from every device.
- **Map background:** OSM tiles for the course's bounding box at the largest zoom that fits, fetched with the same URL and `crossOrigin` as `MapView`, so the service worker usually serves them from cache and the canvas is not tainted. "© OpenStreetMap contributors" is drawn on the image. If any tile fails (offline, not cached) the card uses a plain background with the route only; never block on tiles. It is at most about 12 tiles per card, made only on explicit user action, which keeps within the OSM tile policy (no prefetch).
- **Route drawing:** each line leg is drawn in running direction (`orientedCoordinates`) in the line's colour (fixed tram colours, otherwise the app accent), with start and end markers. Gaps stay as breaks and manual legs are not drawn, as in GPX export (025).
- **Sharing:** if `navigator.canShare({ files })` accepts the PNG, use `navigator.share({ files, title })`; otherwise download `<course-name>.png` (same file-name rule as `gpxFileName`). Cancelling the share sheet is not an error. Show "saved"/"shared" only after it succeeds.
- **Where:** a "Dela bild" chip next to "Exportera GPX" on the course row, and in the line card's course actions (045). Disabled with a hint while the course's geometry categories are still loading (058).
- Out of scope: choosing a template or theme, adding photos, elevation (see the separate profile idea), animated output.

## Design sketch

- `src/domain/card.ts` (pure, tested): bounding box with padding, zoom choice for a given pixel size, Web Mercator projection to card pixels, tile list for the box, and the text model (title, distance string, badges, subtitle lines, truncation of long names and runner lists).
- `src/components/courseCard.ts`: draws the model on a canvas (tiles, route, markers, text panel) and returns a `Blob`; the only browser-specific part. No Leaflet: projection comes from the domain code.
- Share or download handled next to `shareLink.ts`.
- i18n: button label, share title, "shared", "downloaded", error and attribution text in sv/en/fr.

## Tests

- Unit: projection and zoom choice, tile list, text model (manual leg "minst", completed vs not completed, long names).
- e2e `e2e/card.mjs` (added to `run.mjs`): create a course, press "Dela bild" with tile requests aborted, check that a PNG download of the expected size happens, and that the button is disabled while geometry is pending. Then with a stub tile route, check the image uses the tiles (pixel sample differs from the plain background).
