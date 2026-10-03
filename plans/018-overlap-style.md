# 018 – Overlap style, outline-order fix, plain checkbox

- Bug: each line's outline was drawn right after its own colour, so the next line's outline covered earlier stripes and only one colour showed. All outlines are now drawn under all lines (highlight/candidate lines still go on top).
- Settings → "Overlapping lines": **Side by side** (default; lines sharing a road are shifted sideways by their width, in screen pixels, recomputed per zoom), **Striped** (interleaved dashes), **On top of each other** (old behaviour). Works with both colour modes.
- "Hide completed" in the list is a bare checkbox row (no chip box).
- Not done: per-line differing dash patterns; with the outline fix the even interleave is cleaner. Can be added if stripes still look synced.
