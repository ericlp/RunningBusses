# 049 – Distinguish NotPlanned and NotCompleted in "by status" colours

Status: todo.

- With the "by status" line colour setting, Completed lines have their own colour but NotPlanned and NotCompleted look the same, so planned lines cannot be told from unplanned ones.
- Give the three statuses three clearly different colours (also distinguishable without colour alone, e.g. dash or weight, for colour-blind users) in both light and dark themes and with the tram border.
- Update the legend, if any, and the settings description.
- Test: e2e/a11y check that the styles differ per status; unit test for the colour mapping if it lives in the domain.
