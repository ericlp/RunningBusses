# 013 – Stronger lines, outline setting, rainbow colouring

- Unselected lines are no longer dimmed when a line/course is highlighted (opacity 1). Base line colour is now a saturated blue (`--line`) so lines stand out on the soft map.
- Settings: **Line outline** (none/thin/normal/thick = 0/2/4/7 px extra white/dark casing) and **Line colours** (by status / rainbow).
- Rainbow gives each line its own hue (golden-angle spread of the line number, return variants shifted), for telling interleaved lines apart. In rainbow mode status colours are not shown on the map (status is still in the list/cards); highlight, connectors and course lines keep their fixed colours.
- Build mode: routes that are not candidates stay faded (0.7) on purpose.
