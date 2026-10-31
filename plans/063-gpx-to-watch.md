# 063 – Send GPX to a watch app

Status: todo. Needs testing on a real iPhone and Android phone with Garmin Connect installed.

Goal: on a phone, one tap hands the course GPX to Garmin Connect (or any other watch app) instead of downloading a file the user then has to find.

## Findings

- A web page cannot open Garmin Connect directly with a file; Garmin has no public URL scheme for importing courses. The supported route is the phone's share sheet or "open with": Garmin Connect accepts a GPX file shared to it and imports it as a course.
- Web Share with files (`navigator.share({ files })`) is the only way a web page can reach the share sheet. Safari on iOS is expected to accept a `.gpx` file; Chrome on Android only allows a fixed list of file types (images, audio, video, PDF, plain text and a few more) and rejects `.gpx`. On Android the fallback is the normal download, then "Open" in the download notification, which offers Garmin Connect.

## Decisions

- **Detect capability, not "phone".** No user-agent sniffing. If `navigator.canShare({ files: [gpxFile] })` is true, "Exportera GPX" becomes "Skicka till klockapp", opens the share sheet and keeps a small "Ladda ner fil" link for the plain download. Otherwise it downloads as today and, on touch devices, shows a one-line hint: "Öppna filen från nedladdningar och välj Garmin Connect."
- The file is `application/gpx+xml` with the existing `gpxFileName`. Cancelling the share sheet is not an error.
- **Garmin compatibility of the file.** Garmin Connect imports one track; check on a device how it handles several `trkseg` (current export, 025). If it joins them badly or drops all but the first, add a "watch" variant that writes one continuous segment, bridging gaps under `GAP_NOTE_THRESHOLD_M` and keeping larger gaps as straight lines marked in the waypoint descriptions. Keep the current multi-segment export as the download.
- Course type cannot be set from the file; Garmin asks for it on import. The hint text says to choose Running.
- Applies equally to the runnable GPX from [064](064-runnable-gpx.md) when that exists.
- Out of scope: Garmin Connect API or Courses API (needs a partner agreement and a backend), FIT files, other vendors' APIs.

## Tests

- Unit: the watch variant joins segments correctly and keeps the waypoints.
- e2e: stub `navigator.canShare`/`navigator.share` and check that the file is shared with the right name and type; without them, check the download and hint.
- Manual: iOS Safari and Android Chrome with Garmin Connect, recorded in this plan when done.
