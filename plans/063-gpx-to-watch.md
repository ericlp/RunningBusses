# 063 – Send GPX to a watch app

Status: done with a documented Garmin import limitation. Sharing UI implemented and automatically validated; complete multi-segment Garmin import and watch delivery are not claimed. Closed by the user on 2026-11-01; continuous runnable export remains in 064.

Goal: offer GPX sharing alongside download, allowing the user to choose Garmin Connect when the operating system offers it.

## Findings

- No documented public Garmin course-import deep link was found. Do not promise a direct launch/import or attempt an undocumented URL scheme. Garmin's import guidance describes opening/sharing an exported GPX file into Connect, choosing a course type and saving; the user still performs these steps.
- File-sharing support and available target apps vary by browser, operating system and app version. Verify the actual GPX file with `navigator.canShare` and test real devices; do not assume support or rejection based on browser name.
- Chromium's published Web Share extension/MIME allowlists omit `.gpx` and `application/gpx+xml`; PNG is included. This supports expecting a download fallback in Chromium-derived browsers, but does not establish Samsung Internet's or iPhone Chrome's actual behaviour. Do not rename GPX to `.txt` or spoof its MIME type to bypass an allowlist.

## Decisions

- **Detect capability, not "phone".** No user-agent sniffing. Keep Download GPX available and offer Share GPX beside it when `navigator.canShare({ files: [gpxFile] })` is true. Explain how to open the downloaded file in Garmin Connect, without promising it appears as a target.
- The file is `application/gpx+xml` with the existing `gpxFileName`. Cancelling the share sheet is not an error.
- Generate the file before enabling Share; call `navigator.share` directly on a fresh tap. Keep Download available after cancellation/errors. Success means OS handoff, not Garmin import/save/sync. Explain that the standard export follows bus geometry and is not a verified running route.
- **Garmin compatibility of the file.** Test handling of multiple `trkseg` (current export, 025). Do not silently join disconnected legs or invent traversable straight-line connectors. If a different format is needed, report findings and confirm that behaviour before changing export geometry.
- Course type cannot be set from the file; Garmin asks for it on import. The hint text says to choose Running.
- Applies equally to the runnable GPX from [064](064-runnable-gpx.md) when that exists.
- Out of scope: Garmin Connect API or Courses API (needs a partner agreement and a backend), FIT files, other vendors' APIs.

## Confirmed choices and technical checks

- Target app: Garmin Connect only.
- Real-device matrix: Android Samsung Internet, iPhone Chrome and iPhone Safari.
- Share GPX and Download GPX sit side by side.
- Verify handoff, MIME acceptance, multi-segment handling and import results on each browser; browser automation cannot establish successful Garmin import.
- No Garmin login/API secret is needed for file handoff. Do not request the user's Garmin password.
- Investigation generated single- and two-segment reference files with the repository's actual `courseToGpx` exporter, not a substitute serializer. They are diagnostic bus-reference files, not safe-navigation advice.
- Real-phone/import verification was initially deferred until the sharing UI existed. The partial check below established a limitation; the user subsequently closed this plan with that limitation documented, not with successful Garmin acceptance.

## Real-device acceptance matrix

For Android Samsung Internet, iPhone Chrome and iPhone Safari record browser/OS/Connect versions, whether `canShare` accepts the actual file, whether Connect appears, import success, displayed distance, both leg shapes/direction and gap handling. Check download/open-with even when Share is unavailable. Send-to-watch is a separate user-controlled Garmin step.

The fixture files live in the investigation session's `files/` directory as `garmin-single-segment.gpx` and `garmin-two-segments.gpx`; recreate them using the exporter if the session is unavailable. A supported browser API alone is not a passed Garmin test.

### Partial results (2026-10-31)

- iPhone Chrome with Garmin Connect installed: direct Share GPX did not offer Connect; sharing the downloaded file from Files did offer it.
- After importing a course with a gap through that path, the user reported that Garmin's map showed only the first route. Inspection of the supplied `course-1.gpx` confirmed one track with two segments containing 555 and 313 points. The export retained both routes; complete multi-segment import failed in this check.
- OS/browser/Connect versions, Garmin distance, single-segment acceptance and watch delivery have not been recorded. Do not generalise this result to every Garmin version or import path.
- [064](064-runnable-gpx.md#subtask-pedestrian-connections-between-legs) now includes investigating validated pedestrian connectors for a continuous runnable GPX. The existing reference export keeps its segment breaks; no straight-line workaround is approved.

## Closure and workaround assessment (2026-11-01)

- Inspection of `courseToGpx` confirms one track segment per line, with every line's snapshot coordinates retained in running order and direction. The observed first-leg-only result is consistent with Garmin community reports, not missing geometry in our export. Garmin's published import guidance does not establish a universal multi-segment support contract.
- Community reports describe merging all points into one segment as a workaround, with mixed import results. For our disconnected legs this would turn gaps into implied, unverified connections. Do not flatten the reference export or convert to TCX merely to hide those breaks; changing format does not supply pedestrian connector geometry.
- Importing each segment as a separate Garmin course is a reported gap-preserving workaround, but not one complete course. Users can split a copy of the GPX into one file per line using a GPX editor without changing stored app courses. This has not been verified on the user's phone/watch, and no separate-file export UI is added in this plan.
- There is no verified gap-preserving fix for importing the whole disconnected course as one Garmin course. Preserve the current exporter and its translated warning (067), document the limitation in README, and close 063. Browser/OS compatibility and watch delivery remain unverified, not passed acceptance checks; no further implementation or device acceptance work is scheduled here.
- A continuous, validated pedestrian track is a distinct feature in 064, including real-device acceptance of every leg and connector. It must not silently replace the bus-reference GPX.

## Sources (import guidance checked 2026-10-31; segment reports checked 2026-11-01)

- [Garmin third-party course import support](https://support.garmin.com/en-GB/?faq=wKuZXCaZRP4mWPX5aRz5h5). Article identified via indexed support results; direct browser retrieval was blocked, so details still need device confirmation.
- [Web Share specification](https://www.w3.org/TR/web-share/).
- [Chromium's documented file-type allowlist](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webshare/FILE_TYPES.md).
- [Garmin community: only part of track showing](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/235024/only-part-of-track-showing-on-map): a user reports success after removing segment boundaries; not an official support guarantee.
- [Garmin community: GPX import shows only the first part](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/339417/importing-a-gpx-only-shows-the-first-part-of-the-route): reports separate-file import working and mixed results from removing segmentation.

## Tests

- Unit: file construction preserves geometry, segment breaks and waypoints.
- e2e: stub `navigator.canShare`/`navigator.share` and check that the file is shared with the right name and type; without them, check the download and hint.
- Manual: partial iPhone Chrome result recorded above. The broader device matrix was not completed and is no longer a closure gate for this plan; continuous runnable GPX acceptance belongs to 064.

## Implementation

- Prepared GPX files use the existing exporter, filenames and MIME type. Share
  appears beside Export GPX only when the actual file passes capability checks.
- Native sharing starts directly from the tap. Cancellation is silent; other
  failures are logged and reported, with Download retained. Handoff/download
  messages do not claim import, delivery or persistence.
- Garmin guidance and file-action messages are translated in all three languages.
- `shareFile.test.ts` covers file preparation/capabilities/handoff semantics;
  `e2e/gpx-share.mjs` checks activation, snapshot geometry, reversed segments,
  unsupported sharing and downloads after cancellation/failure.
- Typecheck, all unit tests, build and the complete browser journey suite passed.
