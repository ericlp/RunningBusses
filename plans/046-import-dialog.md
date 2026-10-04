# 046 – Separate import dialog

Status: done.

- The import preview (merge or replace, conflicts, apply) used to expand inside Settings. It is now its own dialog on top of Settings, rendered in a portal, with its own title and close button.
- Backdrop click or × cancels the import; Settings stays open behind it.
- New key `backup.previewTitle` in sv/en/fr.
