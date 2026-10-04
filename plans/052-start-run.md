# 052 – Start run mode

Status: todo, design agreed. Needs the user's own Västtrafik credentials to test against the real API.

Goal: from a course, "Start run" shows the user's position and the live positions of the buses on the course's lines, and alerts when any of those buses is within 100 m.

## Decisions

- **Foreground only.** A static page is suspended when the phone locks, there is no background geolocation on the web, and Web Push needs a backend. So the run keeps the screen on with the Wake Lock API and the UI says plainly that alerts only work while the screen is on and the app is open. No silent-audio hack, no native wrapper, no push backend (any of these can be a later plan).
- **Alert:** in-app banner, vibration and a sound. Any bus on a course line counts, in any direction.
- **Credentials:** the user's own Västtrafik API client id and secret, entered in Settings and stored only on the device (localStorage `rb.vt`), never committed or sent anywhere except Västtrafik. Without credentials and a position the mode explains what is missing and does not start.
- **If the API cannot be called from the browser the feature is dropped**, no proxy. Checked so far: a CORS preflight to `ext-api.vasttrafik.se` allows browser calls (token endpoint with any origin). Not yet verified with a real key.
- **Accuracy note** in the run view: positions are estimates.

## API facts (docs: vasttrafik/api-pr-docs, REST.md section 9)

- OAuth2 client credentials: token from `https://ext-api.vasttrafik.se/token`, sent as `Authorization: Bearer`. Refresh before expiry.
- `Positions`: takes a bounding box (two corner coordinates) and returns position, direction and line for each vehicle in it. Filter with repeated `lineDesignations` (the line's `line.name`, i.e. the line number). `detailsReferences` filters individual vehicles.
- Positions are interpolated from the last stop, the next planned stop and an average speed, not GPS. They can be well off during disruptions, so a 100 m alert is approximate; consider a small safety margin and show "estimated".
- Rate limits are not published; poll every few seconds only while the page is visible and stop on leaving the mode.

## Design sketch

- Pure logic in `src/domain/` with unit tests: distance bus to user, the alert state machine (one alert per bus passage, re-arm beyond ~300 m), bounding box around the course route.
- Thin API client (token cache, positions request) with a mockable `fetch`; map line keys to line designations from the dataset.
- Map: buses as moving markers with line badge, the user's position, the course route. Only `MapView.tsx` touches Leaflet.
- All strings in sv/en/fr.
- Tests: unit tests for the logic; e2e with mocked geolocation and a mocked API (no real key in CI).
