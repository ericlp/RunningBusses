# 077 - Audited public Boras buses ahead of registry publication

## Evidence and decision

Audit of GTFS feed 2026-11-03 and the live public line registry on 2026-11-03:

| Route ID | Number | Stop pattern endpoints | First service | Last service in feed |
| --- | --- | --- | --- | --- |
| 9011014200900000 | 9 | Hedvigsborg - Engelbrektsgatan 128 | 2027-04-01 | 2027-06-13 |
| 9011014201000000 | 10 | Gasslosa - Oresjo angar | 2027-04-01 | 2027-06-13 |

Both are ordinary buses (700), agency 141010000000001418. There are 106 and
164 trip templates respectively, with service on every date in this interval.
Each has two opposing stop patterns. Route descriptions and trip headsigns are
empty; neither ID is present in the official line registry.

[Vasttrafik's official Boras development announcement](https://www.vasttrafik.se/info/utveckling-av-kollektivtrafiken-i-boras/)
confirms the 1 April 2027 start, new line 9 taking over part of line 7, and new
line 10 replacing line 31 and parts of line 19. It explicitly identifies line
10 as Oresjo angar - Gasslosa. The GTFS stop patterns locate both in Boras;
line 9 covers Hedvigsborg and the Engelbrektsgatan section of line 7.
[Vasttrafik's press release](https://via.tt.se/pressmeddelande/4311655/ett-ar-kvar-ny-stadstrafik-och-elbussar-i-boras?lang=sv)
independently confirms the April 2027 city-traffic transition.

These are announced public city buses, not closed school transport. Include
them under the existing full-feed-period policy in plan 057. Keep their own
`vt.<route_id>` keys and `other-bus` category; they are not aliases of lines
7, 19 or 31 and do not collide with other routes numbered 9 or 10.

## Implementation and safeguards

- Store individual, official-source-backed approvals in `config/lines.json`,
  under `auditedPublicBuses`.
- Only use an approval when that exact ID is absent from the registry. Require
  an exact match of number, bus type and agency; identity drift fails the build.
- Never synthesize a registry entry or override a restricted or mixed official
  classification. Log each approval used. Other unknown routes still fail
  before publication.
- Do not introduce a time horizon or exclude all future routes: that would
  change the previously chosen whole-feed scope.
- Test both actual approved IDs, future-only service, preserved keys, identity
  drift, unrelated routes, official restrictions and unchanged failed output.
- Rebuild the fresh feed in an isolated directory and validate all split assets
  and geometry against the current publication before considering it resolved.
