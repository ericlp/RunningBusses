# 057 - All public timetabled Västtrafik buses

## Scope and decisions

- Include public timetabled buses operating anywhere in the downloaded feed period, not just Wednesday service.
- Exclude pupil-restricted school transport. The owner explicitly chose to keep public municipal school-day lines, despite their school-oriented timetable.
- Preserve current Gothenburg categories/defaults and all existing keys. Add "Övriga Västtrafikbussar" / "Other Västtrafik buses" / "Autres bus Västtrafik".
- No all-buses shortcut; selecting all bus categories includes every bus but not trams.
- Keep representative routes, direction splits and historical course rules. Do not publish every variant or fabricate missing geometry.

## Feed audit and identity evidence

Audited feed version 2026-10-03:

- Västtrafik agency suffix 1418 has 606 ordinary bus records (700) and 93 call-ordered records (1501), all with active trips: 699 records and 481 displayed numbers.
- Dates cover 2026-09-30 through 2026-12-12. Calendar weekday flags are zero; 19,407 calendar-date additions supply service. Calendar parsing nevertheless supports weekday flags and cancellations.
- No frequency-based file exists. All bus trip templates have shape identifiers. Coverage is checked after requiring at least two timed stops and a usable shape.
- GTFS exposes no school flag or school text. The official [line registry](https://www.vasttrafik.se/api/timetables/lines) matches 682 bus identities; the remaining 17 are explicitly described train/tram replacement services.
- Registry descriptions identify closed school services separately; these have no matching bus records in this feed. GTFS bus types alone would not safely classify future additions, so registry lookup is required and unclassified routes fail.
- Every current registry identity has one version. Mixed public/restricted versions in future registry data require an audit before publication rather than silently including restricted service dates.
- [Västtrafik's Alingsås changes](https://www.vasttrafik.se/info/alingsas/) explicitly describe public municipal school-day routes such as 942. These stay included under the confirmed scope. Their numbers also occur elsewhere, so a number-range school filter would be incorrect.
- Matching public numbers and official direction descriptions establish 54 ordinary/call-ordered aliases. They are fixed in `config/route-aliases.json` and verified against the registry on subsequent builds. Ambiguous/unverified technical identities remain separate, including the three records numbered 527.
- Existing keys remain number-based inside their original scope. Additional identities use `vt.<canonical-route_id>`, optionally ending in `r`, independent of endpoints/geometry.

## Implementation

- Testable calendar and route-eligibility helpers support full-period selection, public-service classification, aliases and collisions.
- Existing categories prefer their Wednesday patterns; other buses and Wednesday-absent lines weight patterns by service occurrences, with deterministic fallback ordering.
- Non-timetabled/inactive groups are reported. Missing geometry for a timetabled group prevents dataset writes. Unknown frequency-based timetable data requires an explicit audit.
- Original length limits remain for existing categories. The new category allows up to 200 km; the audited maximum is approximately 124 km. Finite values, coordinate integrity, geometry-derived distance, key uniqueness and removal guards remain enforced.
- Category chips and progress settings use the existing category collection. Defaults, saved preferences, ownership, snapshots, backups and share links retain their previous behaviour.
- Expanded rendering originally took about two seconds to select all buses. Map rendering/overlap calculations now operate on routes intersecting a buffered viewport, retaining highlights throughout camera movement. Geometry extents are cached for both rendering and hit testing. No routes or geometry are removed from storage or the list.
- Monthly refresh and service-worker caching require no format/version migration; registry refresh is coupled to feed refresh.

## Dataset and measurements

The rebuilt dataset contains 805 runnable routes: 791 bus routes (689 in the new category) and 14 tram routes. Every eligible bus identity is accounted for. All 116 previously published route records remain byte-for-byte equivalent at both the previous reference date and the current reference Wednesday.

Dataset size grows from approximately 1.38 MB / 327 KB gzip to 13.86 MB / 3.32 MB gzip. Coordinates grow from 64,626 to 659,466. A local rebuild takes approximately six seconds.

Local Playwright measurements at a 360 x 740 viewport, with map-tile requests blocked (not a physical-phone/network benchmark):

| All-bus selection | Previous dataset | Expanded, before viewport work | Expanded, after viewport work |
| --- | --- | --- | --- |
| Stack | 258 ms | 553 ms | 461 ms |
| Stripes | 520 ms | 2,080 ms | 1,068 ms |
| Side-by-side | 534 ms | 2,145 ms | 1,158 ms |

Default-view load remains approximately 1.5-2.1 seconds in this environment. Every all-bus measurement shows all 791 bus routes in the list; the default view still shows 51 city-bus routes.

The full dataset still loads and parses upfront. Slow-network costs and memory/rendering behaviour on physical low-end phones have not been measured. Viewport rendering reduces drawing work, not download size; all-bus overlap selection still takes approximately one second locally.

## Regression coverage

- Calendar additions/cancellations, weekend/seasonal dates, Wednesday preference and service weighting.
- Identity collisions, bus/tram separation, fixed alias validation, legacy keys and explicit classification failures.
- Restricted versus public school-day service, ambiguous mixed registry versions, replacement routes and long-route geometry validation.
- Missing-shape publication gate, including an empty representative-pattern selection.
- Category persistence, progress defaults, namespaced/return keys in backups and share links, and completed/pinned reconciliation.
- Cached bounds and offscreen/crossing geometry.
- `e2e/regional.mjs` uses an isolated fixture subset to exercise category controls, duplicate-number selection, rendering after camera movement, separate course persistence and progress settings on phone/desktop widths.

Final verification: typecheck, 130 unit tests, production build and every browser journey pass. The rebuilt dataset validates against the previous publication, preserves all 116 historical records and reproduces the same line-body hash.
