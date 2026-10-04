# 054 – Icons and tones on action buttons

Status: done.

Chips are now inline-flex with centred content, which fixes "Navigera till start" (an `<a>`) sitting too high in its button. Course and line-card actions get a small inline SVG (`Icon.tsx`, decorative, `aria-hidden`): pen for edit, arrow for navigate, and so on. "Markera som genomförd" uses a green `success` tone (the completed status colour), like `danger` for delete; "undo" stays neutral.
