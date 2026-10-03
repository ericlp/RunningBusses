# 009 – Map legibility and hover cursor

- Basemap stays OSM but is greyscaled/lightened by CSS (inverted in dark mode). CARTO tiles were tried but now require an API key.
- Line widths scale with zoom (1x at zoom 12 up to 2.4x) and every line has a casing (white / dark in dark mode).
- Desktop: the cursor becomes a pointer when hovering within tap tolerance of a clickable line.
