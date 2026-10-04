# 052 – Start run mode

Status: todo. Largest of the open items; needs a design pass and a user-supplied API key before it can be tested for real.

Goal: from a course, "Start run" follows the user's position and the live positions of the buses on the course's lines, and alerts when a bus is within 100 m.

- Requires the user's position (Geolocation API, `watchPosition`) and an API key for Västtrafik's realtime service (Planera Resa v4). The key is supplied by the user in Settings, stored only in the browser (localStorage `rb.vtKey`), never committed or sent anywhere but Västtrafik. Without both, the mode explains what is missing and does not start.
- Realtime: poll the vehicle positions for the lines in the course (by line key / gid, mapped from the GTFS route). Polling interval a few seconds while the page is visible; stop on leave. Check what the v4 API offers for vehicle positions and its rate limits and CORS rules before building. If it cannot be called from a static site (CORS), the fallback is to document that a proxy would be needed rather than add a backend.
- Map: show the buses as moving markers (with line badge and direction), the user's position, and the course route.
- Alert: when a bus of the course is within 100 m of the user, notify once per bus passage (in-app banner plus vibration; a system notification only if the user allows it). Re-arm when the bus has been farther than e.g. 300 m.
- "In the background": a web page cannot reliably track in the background; keep the screen awake with the Wake Lock API while running and say so in the UI. Do not promise alerts when the phone is locked.
- Pure logic in `src/domain/` (distance to bus, alert state machine) with unit tests; the API client is a thin module with a mockable fetch; e2e uses mocked geolocation and a mocked API.
- Privacy: position never leaves the device except as the API query, which contains no position.
