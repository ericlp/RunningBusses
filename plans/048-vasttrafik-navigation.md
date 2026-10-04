# 048 – Choose navigation provider for "Navigera till start"

Status: todo, design agreed.

Today (042) "Navigera till start" opens Google Maps walking directions to the first point of the course.

## Decisions

- The user can choose between two providers: **Google Maps** and **Västtrafik**.
- Västtrafik is opened with the **name of the nearest stop to the course start** as the destination (`https://www.vasttrafik.se/reseplanerare/?from=…&to=<stop name>` style link). The origin is left for the user/their position on the site: vasttrafik.se has no documented deep link for coordinates or "my position", so we do not pass coordinates. Verify the exact URL format by hand before building, and fall back to a plain planner link if it changes.
- The destination stop is shown by name in the UI ("Navigera till Eketrägatan") so the user sees what will be searched. The stop comes from the course's first leg (`via[0]` / `viaAt[0]`, see 043); if the snapshot has no stop names, the Västtrafik option is hidden.
- **Preferred provider setting** in Settings: "Ask each time" (default), "Google Maps" or "Västtrafik". Stored in localStorage `rb.navProvider`, validated on load, falling back to "ask". With a preferred provider the chip opens it directly; otherwise tapping the chip offers the two options.
- Applies to the course details and to the line card.
- Out of scope: in-app journey planning with the Planera Resa API (needs the credentials from 052); can be a later plan.

## Tests

- Unit: URL builders for both providers, stop-name lookup from a course, setting validation.
- e2e: with no preference the chooser shows both and the links have the right hosts; with a preference set the chip links directly; i18n keys in sv/en/fr.
