# 061 – Shareable course card

Status: implemented and automatically validated. Native phone sharing remains a real-device acceptance check.

Goal: "Dela bild" on a course makes a Strava-style image of the course and shares it (Web Share with files) or downloads it as a PNG. Works offline and without a backend.

## Decisions

- **Content:** the course name, the route drawn over the map, total distance (with "minst" if a manual leg has no distance), line badges in running order, start and end stop names, status, completion date and runners for completed courses, and the app name. No personal data beyond what the user already put on the course.
- **Format:** 1080 × 1350 PNG (4:5 portrait), drawn on a `<canvas>` at that size whatever the screen. Follow the app's resolved light/dark theme and use the Västtrafik palette.
- **Map background:** open a visible, interactive map preview fitted to the course snapshots. Use only the tiles actually loaded for this viewport; exporting must not fetch another area, zoom level or tile stack. A 540 × 400 logical-pixel map area can be scaled into the card's 1080 × 800 map area. At 256-pixel tile size this intersects at most 12 tiles. Draw readable "© OpenStreetMap contributors" attribution into the PNG; link to the copyright/licence page in the preview. The current OSM policy permits interactive viewport requests and cached revisits, but prohibits fetching unviewed tiles. This approach stays within that documented model without a second tile provider or API key.
- **Fallback:** missing or unreadable tiles produce a clearly labelled route-only preview. Draw into a fresh canvas after a taint/export failure, rather than attempting to reuse a tainted canvas. Log the underlying failure and keep the route-only download usable.
- **Route drawing:** each line leg is drawn in running direction (`orientedCoordinates`) in the line's colour (fixed tram colours, otherwise the app accent), with start and end markers. Gaps stay as breaks and manual legs are not drawn, as in GPX export (025).
- **Sharing:** prepare the PNG and `File` in the preview, including waiting for fonts/images, then enable Share and Download actions. Invoke `navigator.share({ files, title })` directly from the later Share tap, with no preceding asynchronous work that could consume transient activation. Check `navigator.canShare({ files })` against the prepared file. Keep Download available and reuse the GPX filename stem. Cancelling is not an error; share resolution means handoff, not confirmed delivery to a destination app. A download action may say "download started", not claim that a file has been saved.
- **Where:** a "Dela bild" chip next to "Exportera GPX" on the course row, and in the line card's course actions (045). Saved courses render from their immutable route snapshots, even if current dataset categories are unavailable or routes have changed. No rehydration of current geometry just to export an existing course.
- Out of scope: choosing a template or theme, adding photos, elevation (see the separate profile idea), animated output.

## Design sketch

- `src/domain/card.ts` (pure, tested): bounding box with padding, zoom choice for a given pixel size, Web Mercator projection to card pixels, tile list for the box, and the text model (title, distance string, badges, subtitle lines, truncation of long names and runner lists).
- `src/components/renderCourseCard.ts`: draws the model on a canvas (tiles, route, markers, text panel) and returns a `Blob`. `MapView.tsx` remains the sole Leaflet integration and exposes a typed snapshot of visible loaded tile images plus projection/bounds for the preview. No private Leaflet DOM traversal or DOM-screenshot dependency.
- Share or download handled next to `shareLink.ts`.
- i18n: preview/actions, share title, handoff/download-started messages, route-only fallback, errors and attribution text in sv/en/fr.

## Confirmed choices and technical checks

- Confirmed: 4:5 portrait, runners' names included, app theme, map background when permitted and available with route-only fallback.
- Verified: the OSM policy permits viewed viewport requests/cached revisits, requires attribution and caching, and prohibits offline-area downloads and unviewed prefetch.
- A HEAD probe of an existing standard tile returned `Access-Control-Allow-Origin: *` and image/cache headers. This is an observation, not a future availability guarantee.
- A Chromium experiment produced an `image/png` with IHDR dimensions exactly 1080 × 1350. A CORS-readable mock tile exported successfully; a non-CORS image caused `SecurityError`, confirming the need for a fresh-canvas fallback.
- Remaining acceptance check: real-phone PNG file sharing when the implementation exists. No secret/account is needed.

## Sources (checked 2026-10-31)

- [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- [OSM attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines).
- [Web Share specification: file validation and transient activation](https://www.w3.org/TR/web-share/).

## Tests

- Unit: projection and zoom choice, tile list, text model (manual leg "minst", completed vs not completed, long names).
- e2e `e2e/card.mjs` (added to `run.mjs`): check exact PNG dimensions, both themes, attribution, names, manual-leg distance and historical snapshots without current geometry. Mock tile requests: verify capture does not request new tiles, an incomplete/tainted map falls back explicitly, and the fresh canvas exports. Check sharing uses a prepared file after a new tap, cancellation and failure retain Download, and regeneration invalidates the old file. No real OSM requests in CI.

## Implementation

- Course-list and line-card actions open a native modal dialog with keyboard/focus
  handling. The visible map is fitted to snapshot legs; its responsive viewport
  is at most 540 × 400 logical pixels. Only intersecting, loaded tiles from public
  Leaflet events are captured, with no private map internals or additional fetch.
- Preparing waits for fonts and the visible tile state. Tile loading has a
  15-second bound; failures use an explicitly labelled route-only canvas. Security
  errors retry on a fresh canvas; unrelated encoding errors remain errors with retry.
- Map movement during preparation invalidates the result. Prepared PNGs replace
  the interactive map, stopping further tile activity. Changing the preview
  removes the old file before any new Share/Download action.
- The 1080 × 1350 card keeps snapshot direction/colour, breaks, total-distance
  semantics, completion date and names; white tram lines retain a dark outline.
  Attribution is embedded and linked. PNG sharing reuses 063's prepared-file
  helpers; filenames reuse the GPX stem and all labels are translated.
- Automated journeys cover light/dark phone/desktop layouts, offline tile failure,
  simulated canvas taint, encoder errors, absent file-sharing support, real PNG
  dimensions, transient activation, cancellation/failure download fallback,
  regeneration, both entry points and dialog accessibility.
- Typecheck, 214 unit tests, production build and all 19 browser journeys passed.
