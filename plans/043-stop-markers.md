# 043 – Stop markers

Status: done.

- Data: `lines.json` gains `viaAt` (lon/lat per stop, parallel to `via`). Regenerated once from the cached feed (`--date=20261007`); nothing else changed. `data:validate` checks `viaAt`.
- Map: stops are drawn as small markers from zoom 13, with names always visible from zoom 16 and on click below that. Shown for the selected line, the selected course, and the course being built.
- `src/domain/stops.ts` (`lineStops`, `legStops`) de-duplicates stops. Old backups and course snapshots without `viaAt` simply show no markers.
