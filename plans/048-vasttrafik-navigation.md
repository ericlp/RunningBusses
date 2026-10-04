# 048 – Västtrafik navigation to start

Status: todo.

- Today (042) the "Navigera till start" link opens Google Maps walking directions to the course start.
- Add a second option that opens a Västtrafik journey from the user's current position to the start, so they can get there by public transport.
- Open question: Västtrafik's website/app deep links versus the Planera Resa API (needs the user's own key, see 052). Prefer a plain deep link with from = current position (asks for location permission only when tapped) and to = start coordinates; fall back to a link without origin if permission is denied.
- Test: unit test for the URL builder, e2e checks the link href with a mocked geolocation.
