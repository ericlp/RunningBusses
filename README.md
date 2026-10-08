# Do you wanna chase buses?

A static, phone-first site for planning runs along Gothenburg city-bus routes. Chain routes into courses, mark them completed, and move your progress between devices with a link or a backup file. Live at https://ericlp.github.io/RunningBusses/ (sv / en / fr, follows the browser language).

The bus lines show where the bus drives. They are a reference only: roads, tunnels and busways may not be runnable.

## Develop

Node is managed with [mise](https://mise.jdx.dev): `mise install`, then `mise exec -- npm ci`.

| Command | What |
| --- | --- |
| `npm run dev` | dev server |
| `npm test` | unit tests |
| `npm run build` | typecheck and production build |
| `npm run e2e` | browser journeys at phone and desktop widths (needs `npm run build` and `npx playwright install chromium`) |
| `npm run data` | rebuild `public/data` from the Trafiklab feed |
| `npm run data:validate -- --previous=old-lines.json` | check a rebuilt dataset |

Copilot CLI loads this repository's Playwright MCP configuration from `.github/mcp.json`. After installing dependencies, run `npx playwright install chromium`. The launcher resolves the browser from the project's Playwright installation, without machine-specific paths. MCP browsers run headless with isolated storage, and output is saved under `.cache/playwright-mcp/`.

## Transit data

Source: Trafiklab *GTFS Regional Static* (Västtrafik). Put your key in `.env` (`TRAFIKLAB_API_KEY`, see `.env.example`; never commit it). The GitHub Action `Refresh transit data` runs monthly with the repository secret of the same name, validates the result and redeploys only when the lines changed. A manual run can accept removed lines.

## Data on your device

Courses live in the browser (IndexedDB); filters and sort order are remembered in localStorage. Use ⚙ → Säkerhetskopia to share a link (courses only) or export a file, and open the link or import the file with merge or replace on another device. A copy from before the last import can be downloaded.

## Links

The address shows the current view: `#line=<key>` selects a line and zooms to it, `#mode=plan` opens the course list. Copy the address to share or bookmark it.

## Plans

Design and decisions are in [`plans/`](plans/PLAN.md), with one small plan per change.
