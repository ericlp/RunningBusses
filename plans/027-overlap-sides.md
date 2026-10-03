# 027 – Side-by-side overlap fixes

- Lines running in opposite directions (e.g. 91 and 91R) are now offset to opposite sides relative to a reference heading, so they no longer land on top of each other.
- Sharing detection densifies long segments instead of only checking midpoints.
- The sharing distance grows when zoomed out (about 4 px, 10–40 m), so lines that visually touch are separated.
