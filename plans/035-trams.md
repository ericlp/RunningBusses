# 035 – Trams

- New category `tram`: lines 1–13 (GTFS route_type 900). The two "X" entries are excluded. Trams and buses share numbers 1–13, so the route type decides the category.
- Line colours are in `config/lines.json` and copied to `Line.color`. They were read from the line badges on Wikipedia (Commons SVGs), not guessed. Line 1 is white and gets a dark edge so it shows on the map.
- Map: a tram has its line colour as a wide border and a thinner inner line in the status colour. Trams are exempt from rainbow and ignore the "no border" setting for their own border.
- Overlap: trams only share space with each other (side by side in "side" mode); "stripes" falls back to stacked for trams.
- List and course badges use the tram colour.
- Dataset: 116 routes (14 tram routes, including 13 retur). Lisebergslinjen (12) is included.
