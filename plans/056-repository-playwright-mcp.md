# 056 - Repository-owned Playwright MCP

- Copilot CLI discovers Playwright MCP through `.github/mcp.json`, rather than a personal configuration.
- `scripts/playwright-mcp.mjs` launches the MCP server using Chromium resolved from the project's Playwright installation. No developer-specific browser paths are committed.
- Setup uses the existing dependencies and `npx playwright install chromium`. A missing browser is an explicit error.
- Browsers are headless and isolated. Generated MCP output lives in ignored `.cache/playwright-mcp/`.
- README and Copilot instructions document setup. Remove the previously created personal Playwright entry to avoid duplicate configuration.
