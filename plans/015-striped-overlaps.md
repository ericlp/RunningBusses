# 015 – Striped overlaps (rainbow mode)

- `src/domain/overlap.ts` splits every drawn line into runs by which other lines share the road (10 m grid, 3×3 neighbourhood ≈ 10–20 m tolerance).
- In rainbow mode, a shared run is drawn by each line as interleaved dashes (dash length scales with line width, offset by the line's index in the group), so all lines show. Unshared stretches stay solid.
- Not applied in "by status" colours (same colour would make stripes meaningless), nor to highlight/course/connector lines, which are drawn on top.
