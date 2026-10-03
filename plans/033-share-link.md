# 033 – Share link

Status: done.

Moves courses to another device with a link. No backend, one-shot, courses only (no radius or other settings).

- **Sender:** settings (⚙) → Dela länk (Web Share API where available) or Kopiera länk. The link is `…/#sync=<payload>`; a fragment is never sent to a server.
- **Payload** (`src/domain/share.ts`): versioned JSON (`v: 1`), deflate-raw compressed (plain fallback if `CompressionStream` is missing), base64url. Line legs hold only the route key and direction; manual legs are kept as they are. A typical link is a few hundred characters. Above 8000 characters the UI warns that some apps cut long links and suggests Export.
- **Receiver:** the fragment is read once at load and removed from the address bar. After the dataset and courses have loaded, the payload is decoded against this device's route data and the existing import dialog opens (merge by default, replace possible). Nothing is saved until the user confirms, and the recovery copy is made as for a file import. Replace keeps the local radius.
- **Missing routes:** a course that uses a route this device does not know is skipped, with a warning naming it and advice to update the app. If every course is skipped, only the warning is shown.
- **Untrusted input:** payload size and decompressed size are capped (2 MB), and the rebuilt courses pass through `parseBackup` (unique ids, no route in two courses, valid legs).
- **Not done (deliberately):** several links (one link holds every course: 49 courses is about 2 KB), QR code, PWA/share target, automatic sync, choosing which courses to share.
- Tests: `src/domain/share.test.ts`, `e2e/share.mjs`.
