# 006 – Phase 5: monthly refresh

Status: done (code). Remote setup: see the end.

## Pipeline
- `.github/workflows/refresh-transit-data.yml`: monthly (1st, 04:17 UTC) and manual. Downloads the feed with the `TRAFIKLAB_API_KEY` secret, builds `public/data`, validates against the currently published data, and only if the line hash changed commits to `master` and dispatches `deploy.yml`. A failed validation fails the job and publishes nothing; the previous deployment stays.
- Manual run has an `allow_removal` input for when lines have really disappeared.
- Validation (`scripts/transit/validate.ts`, `npm run data:validate`): errors for too few lines, duplicate keys, invalid coordinates, implausible length (<300 m or >60 km), stored length not matching geometry (>2 %), removed lines. Warnings for added lines, length change >20 %, an end point moved >300 m. The report goes to the job summary.
- Quota: one download per month, far below the 60 per 30 days.

## App update rules (`src/domain/reconcile.ts`)
- On load, courses that are not completed and not pinned adopt the current route data (a toast says how many). Completed courses never change.
- Unlocking a completed course pins it: it keeps its old data, shows an "Äldre data" tag and an "Uppdatera till aktuell data" button. The button previews the total change and then clears the pin.
- A line that is gone from the data stays in its course with its last path, and the course shows a warning. Gone lines are not offered for new courses (the builder only uses the current dataset).
- Settings show the feed version and fetch date; the top notice adds a hint when the data is older than 45 days.
- Not done (postponed): refreshing an open draft against new data; the course row only warns inside its details.
