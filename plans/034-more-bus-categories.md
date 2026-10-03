# 034 – More bus categories

- Categories: stadsbuss, stombuss, express (`X…`) and industri (114–258), set in `config/lines.json`.
- Dataset now has 102 routes; the 56 earlier lines are unchanged.
- The category filter is multi-select with no "All"; the last selected chip cannot be deselected. Default is stadsbuss.
- Line numbers are strings and sorted naturally.
- Trams are shelved: they are route_type 900, the feed has no colours, and they need a tram-coloured border with a thin status line, a rainbow exemption and overlap tuning.
