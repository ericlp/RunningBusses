# 053 – Close the filter panel when clicking elsewhere

Status: done.

A pointerdown outside the filter panel and the Filter button (for example on the map) closes the panel. Listener is capture-phase on `document`, so Leaflet's own handlers do not hide the event. e2e: `filters.mjs`.
