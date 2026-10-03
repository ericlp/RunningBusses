# 010 – Theme toggle and map style

- Settings: Appearance (Automatic/Light/Dark) and Map style (Standard/Soft/Grey), stored in localStorage (`rb.theme`, `rb.mapStyle`). Default: automatic, soft.
- `src/appearance.ts` sets `data-theme` and `data-map` on `<html>`; CSS filters on the tile pane implement the styles (OSM itself offers one tile style; other styles need other providers/keys).
- Grey-only was too hard to orient with, so the default is the softly desaturated "Soft".
