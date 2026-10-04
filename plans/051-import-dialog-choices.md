# 051 – Clearer merge/replace choice when importing

Status: todo.

- In the import dialog (046) "Slå ihop" and "Ersätt" look like two buttons that both proceed, and it is unclear how they differ.
- Make it a radio-style choice with a one-line explanation under each ("Add to your courses, keep what you have" / "Replace all your courses with the file"), and a single clearly primary "Importera" button. Default to merge; the choice is not an action.
- For share links (merge only) show no choice, just the explanation.
- Replace keeps its confirm step.
- Test: e2e checks there is exactly one primary action and the explanations are shown; i18n keys in sv/en/fr.
