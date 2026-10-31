# 065 – Lunch after the run

Status: todo.

Goal: from a course, show a few casual places to eat near where it ends, suited to a group that is sweaty and maybe wet: quick, informal and not posh.

## Decisions

- **Source: OpenStreetMap via the Overpass API**, fetched from the browser only when the user opens "Lunch nära målet" for a course. Only the course's end coordinate is sent. Results are cached per course end for 7 days in IndexedDB, so the list also works offline once loaded. Attribution "© OpenStreetMap contributors" is shown under the list.
- **Search area:** 800 m walking-ish radius (straight line) around the end of the last leg with coordinates, widened once to 1.5 km if fewer than three places are found.
- **What counts as casual** (OSM has no price level, so this is a heuristic, explained in the UI):
  - Included: `amenity=fast_food`, `amenity=cafe`, `amenity=food_court`, `shop=bakery` with seating, and `amenity=restaurant` with an everyday `cuisine` (pizza, burger, kebab, falafel, sushi, thai, vietnamese, indian, asian, sandwich, noodle, swedish lunch/`lunch=*`).
  - Ranked up: `outdoor_seating=yes` (dry weather), `lunch=*`/"dagens lunch" tags, `takeaway=yes`, close to the end, open now.
  - Excluded: names or tags that suggest fine dining (`cuisine=fine_dining`, `stars=*`, `reservation=required`), bars and nightclubs, places closed during the next two hours.
- **Opening hours:** parsed with the `opening_hours` library for the planned day (today by default). Places without opening hours are shown last with "öppettider saknas".
- **Weather hint (optional):** if it rains (Open-Meteo forecast for the end point, no key needed), indoor seating ranks first and the list says so. If the forecast fails, it is simply skipped.
- **Each item:** name, type/cuisine, distance from the end, open now/closes at, outdoor seating icon, and links to open it in the phone's map app and on openstreetmap.org. No ratings or reviews (no source without a backend or paid API).
- **Group favourites:** the user can star a place; starred places near the end come first and travel in backups (not share links). Stored as OSM id + name, so they survive cache expiry.
- Out of scope: booking, menus, prices, ratings, Google/Yelp data.

## Design sketch

- `src/domain/lunch.ts` (pure): Overpass query builder, tag classification, ranking, opening-hours evaluation for a time, favourites merge.
- `src/data/overpass.ts` and `src/data/weather.ts`: thin clients with mockable `fetch`, timeouts, cache.
- UI: a "Lunch nära målet" chip on the course row and line card that opens a sheet with the list; selecting a place shows it on the map (`MapView`).
- i18n: all labels, the "casual places" explanation, attribution and errors in sv/en/fr.

## Open questions (defaults assumed until answered)

1. Radius: 800 m widening to 1.5 km (default), or something else?
2. Which time to check opening hours against: now (default), or a planned run date/time on the course?
3. Is the casual-places heuristic right? Anything to always include (e.g. specific chains) or exclude (e.g. pubs serving lunch)?
4. Include the Open-Meteo rain hint (default yes), sending only the end coordinate?
5. Should starred favourites travel in share links as well as backups (default backups only)?

## Tests

- Unit: classification (fine dining excluded, everyday cuisines included), ranking with/without rain, opening hours at given times, widening the radius, favourites in backup round trip.
- e2e `e2e/lunch.mjs` with mocked Overpass and weather responses: list order, offline from cache, favourite survives reload, failure message.
