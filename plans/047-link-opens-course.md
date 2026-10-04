# 047 – A share link opens the course

Status: done.

- Opening a share link no longer opens Settings. The import dialog (046) appears directly over the app.
- After confirming, the app switches to plan mode, selects the imported course and zooms to it; "Importen är klar" is shown as a toast.
- A broken link shows its message in the same kind of dialog.
- `BackupSection` gets `dialogOnly` (dialog without the backup controls, used when Settings is closed), `onConsumed` (a link is read once, so it does not reappear when Settings opens) and `onImported`.
- Opening a link while Settings is open still works: the dialog opens over Settings and Settings closes after the import.
