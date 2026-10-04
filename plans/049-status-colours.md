# 049 – Distinguish NotPlanned and NotCompleted in "by status" colours

Status: todo, design agreed.

Cause: in "by status" mode NotPlanned is `--line` (`#1b86b8`, weight 3) and NotCompleted is `--vt-blue` (`#009ddb`, weight 4): two nearly identical blues, so only Completed (green) stands out. See `toneColor` in `MapView.tsx` and `toneOf` in `App.tsx`.

## Decisions

- **Scheme:** NotPlanned = muted grey-blue, thin. NotCompleted (planned) = amber/orange, thick. Completed = green, thick. Exact values chosen with contrast checked in light and dark themes and on both map styles.
- **Not colour alone:** also vary the line style: NotPlanned thin solid, NotCompleted a dashed thick line, Completed a solid thick line. Works for colour-blind users.
- **Everywhere, so it matches:** the list status text/badges and the course status chips use the same status colours (CSS variables shared with the map, one source of truth).
- **Legend:** a small map legend with the three statuses, shown only in "by status" mode (not in rainbow mode).
- **Watch out:** the build-mode candidate colour is already orange (`#f08c00`); the new planned amber must be clearly different from it, or the candidate colour changes with it. Trams keep their fixed colours and border.

## Tests

- Unit: the status → colour/style mapping (move it out of `MapView` into a small pure module so it can be tested) returns three distinct values per theme.
- e2e/a11y: legend is shown only in "by status" mode; list chips carry the status class; contrast check for the new colours in both themes.
- i18n keys for the legend in sv/en/fr.
