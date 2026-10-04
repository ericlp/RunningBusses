# 055 – Back and Forward follow the selection

Status: done.

The address hash (`#line=…`, `#mode=plan`) used to be rewritten with `replaceState`, so Back/Alt+Left left the app. Each change of selection or mode now adds a history entry with `pushState`; the existing `hashchange` handler restores the view on Back/Forward. The first sync after load only replaces, so the landing page is not duplicated, and nothing is pushed when the address already matches (which avoids loops when Back sets the state). Hash-only URLs need no server routing, so this works on GitHub Pages. The earlier `replaceState` was chosen to avoid cluttering history, not because of Pages. Build mode (drafts) still ignores hash changes.
