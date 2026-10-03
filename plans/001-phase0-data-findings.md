# 001 – Phase 0 data findings

Feed inspected: Trafiklab GTFS Regional, operator `vt`, `feed_version` 2026-10-03 (75 MB zip). Reference weekday: Wednesday 2026-10-07. The exploration was done with throwaway scripts; the real dataset builder comes in Phase 1.

## Verdict

Feasible. Every in-scope line has a shape, and every shape starts and ends exactly (0 m) at the terminus stop of its trips, so no line needs the manual list today. The manual list stays in the plan for lines that lose their shape later.

## How the feed works (matters for the builder)

- Download needs the header `Accept-Encoding: gzip`, otherwise the API answers 406.
- The feed covers all of Västtrafik, including regional lines that reuse numbers 22–99 (Trollhättan/Vänersborg `40xx`, Borås `20xx`, "Ersätter Västtåg" `11xx`). The line number alone is therefore not a safe key.
- **Gothenburg city lines are the routes with `route_id` `9011014 5 0NN 00000`**, i.e. the 8th digit is `5` and agency is Västtrafik (`…1418`). Line 25 (Peppareds torg – Svarte Mosse) also matches but is a stombuss, so it is excluded by hand in `config/city-lines.json`.
- `route_id` looks stable and derived from the line number. `shape_id` and `trip_id` are not meant to be stable.
- Stops have platform-level entries with a `parent_station`; use the parent's name for display.
- Service days are only in `calendar_dates.txt` (`exception_type` 1), as documented.
- `route_type` 700 is a normal bus. **Call-ordered ("anropsstyrd") service is `route_type` 1501**, a separate route with the same number.

## Lines found: 49

27, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40, 42, 43, 44, 46, 47, 56, 57, 59, 60, 61, 62, 63, 64, 65, 69, 71, 73, 74, 75, 76, 77, 78, 82, 83, 84, 86, 89, 90, 91, 92, 93, 94, 95, 97, 99.

The numbers 22–26, 28, 31, 41, 45, 48–55, 58, 66–68, 70, 72, 79–81, 85, 87, 88, 96 and 98 have no Gothenburg city line in the current feed.

- Call-ordered 1501 routes exist for 33, 36, 38 and 39. For 33, 36 and 38 they are the same line as the 700 route; only **39 (Säve Station – Klareberg, 19,6 km)** exists solely as call-ordered.
- **Loops** (start stop = end stop): 57 (Gärdsås Torg, 16,1 km) and 76 (Angered Centrum, 6,8 km). Both run in one direction only in the data.

## Surprises that affect the plan

1. **Many lines are much longer than 3–9 km.** Only 13 of 49 are 9 km or less. Examples: 29 (19,6), 37 (34,9), 40 (17,4), 44 (17,7), 57 (16,1), 86 (15,4). The distance filter will matter. Line 37 looks unusual and is worth a look on the map.
2. **Some lines differ by direction**, so "one main path per number" is not always one path:
   - 38: 4,5 km one way, 7,3 km the other (a one-way loop section);
   - 62: 3,4 km vs 7,0 km;
   - 91: 12,7 vs 14,7 km;
   - 94: ends at different termini (Näsbovägen vs Opaltorget).
3. **Several patterns per line.** 22 lines have 4 or more weekday patterns (short turns, depot runs). Most-frequent-pattern picks the right one for nearly all, but 34, 37, 42, 44, 90, 94 and 62 need a visual check.
4. Most lines run at the same length in both directions (within about 5 %), so one path per line is right for them.

## Fixture

`fixtures/phase0-sample.json` holds the real main path of lines 59, 69, 93 and 57 (the last a loop), in GeoJSON order (longitude, latitude). It is for tests and the UI shell.

## Decisions (from the owner, after Phase 0)

- **Directions that differ are separate routes that both must be run**, e.g. `62` and `62 retur`. Candidates from the data are 38, 62, 91 and 94. The builder splits a line when its two directions differ by more than about 12 % in length or have different termini; the candidates are then checked on the map. All other lines keep one path that can be run in either direction.
- **All 49 lines are included.** The distance filter handles the long ones; no default length cut-off.
- **The dataset may contain lines that are not Stadsbuss.** Each line gets a `category` (`stadsbuss`, `stombuss`, and later others if wanted), and the map's default filter is `stadsbuss`. Line 25 and the other stombuss lines (17, 18, 19, 21) become `stombuss`.
- **Tags** mark special circumstances. First tags: `call-ordered` (route type 1501, e.g. 39 and the call-ordered variants of 33, 36 and 38), `loop` (start = end stop, e.g. 57 and 76), `one-way` (only one direction in the data) and `retur` (a direction that is its own route).
- The call-ordered variants of 33, 36 and 38 are merged into their normal line and give it the `call-ordered` tag; 39 is its own line.
