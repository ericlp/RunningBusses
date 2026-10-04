# 051 – Clearer merge/replace choice when importing

Status: done.

In the import dialog (046) "Slå ihop" and "Ersätt" are toggle buttons that look like actions next to the real apply button, and it is unclear how they differ.

## Decisions

- Show the choice as **radio options**, each with a one-line explanation, and a single primary **Importera** button. The radios are not actions.
- Wording: **"Lägg till i mina banor"** (merge: keeps everything you have and adds the new ones; conflicts are resolved one by one) and **"Ersätt alla mina banor"** (replace: deletes your current courses and uses the file's). en/fr equivalents in all three dictionaries.
- Default selection: merge (safe).
- Under the selected option show a summary of what will happen: for merge the number of new courses, courses you already have, and conflicts to resolve; for replace the number of your courses that will be removed and the number that will be imported. Replace keeps its confirm step.
- Share links are merge only (partial links, see 040): no radios, just the merge explanation and the counts.
- The primary button is disabled while merge conflicts are unresolved, as today, with the existing "resolve first" text.

## Tests

- e2e: exactly one primary button; both options have explanations; selecting replace changes the summary; links show no replace option. Update `backup.mjs` and `share.mjs` selectors (`button:text-is("Ersätt")` etc.).
- i18n test keeps sv/en/fr aligned.
