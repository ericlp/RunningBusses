# 029 – Overlap detection follow-up

## Findings

- **Low-zoom visual overlap:** `MapView` derives the overlap cell size from a 4 px target, then clamps it to 40 m. At zoom 10, 4 px is about 326 m at Gothenburg's latitude, so the cap makes the detector's effective search range substantially smaller than the screen-space target. Lines can still overlap visually without being separated.
- **Potential computation hotspot:** `splitByOverlap` densifies the selected routes, rebuilds its spatial grid, and aggregates neighboring-cell headings after each zoom change. This is a profiling candidate, not a measured performance problem. Switching between `side` and `stripes` also recomputes identical runs.

## Proposed solution

Make the sharing threshold explicitly screen-space: use projected map coordinates at the current zoom, and identify nearby, direction-compatible line segments within the visual separation target. This avoids the low-zoom cap silently defeating the stated 4 px goal. Keep crossing roads from being treated as shared by checking segment direction as well as distance. If a strict 40 m physical limit is preferred instead, retain it but describe the behavior as a capped physical-distance heuristic rather than a 4 px threshold.

For performance, first measure overlap computation with representative full-network data. If it is material, cache neighboring-cell heading aggregation for repeated query cells, and avoid recomputing runs when changing between `side` and `stripes`.

## Implementation plan

1. Add tests that cover close parallel routes at zooms 10, 12, and 15, separated routes, opposite directions, and perpendicular crossings. Assert the intended pixel-space behavior, not just the chosen cell size.
2. Implement zoom-aware segment proximity and direction filtering; remove or redefine the 40 m cap so it agrees with the chosen behavior.
3. Profile the full-network case before and after the correctness change. Apply per-cell aggregation caching only if measurements show a meaningful improvement.
4. Make overlap-run memoization depend on whether overlap processing is enabled, rather than whether the style is `side` or `stripes`.
5. Run the overlap tests and the project typecheck/build.

## Acceptance criteria

- At supported zoom levels, lines that visually collide are separated, while crossing roads are not treated as shared stretches solely because they intersect.
- Opposite-direction shared stretches remain offset to opposite sides.
- `side` ↔ `stripes` style changes reuse overlap results; any added cache is supported by before/after measurements.

## Status

Reviewed and deferred: the 40 m cap is intentional, overlap takes well under 260 ms on the full network, and crossings only yield tiny shared stretches. No code change.
