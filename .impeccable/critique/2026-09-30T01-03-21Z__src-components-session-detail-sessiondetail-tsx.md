---
target: session detail lap timing, stewards log, classification
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Documents\\LMULapTime\\src\\components\\session-detail\\SessionDetail.tsx"
target_fingerprint: "sha256:c1cb0f57484047d5e013408d928d1590dac07441292c6a13b16723e9c94a9a37"
target_path: "C:\\Documents\\LMULapTime\\src\\components\\session-detail\\SessionDetail.tsx"
timestamp: 2026-09-30T01-03-21Z
slug: src-components-session-detail-sessiondetail-tsx
---
Method: dual-agent (A: design review · B: detector + browser)
Scope: session detail lower half — lap timing table (after removing Δ Prev and Top Speed), Incidents & Stewards Log, Session Classification.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Sort arrows and expand chevrons are clear; no aria-sort |
| 2 | Match system / real world | 2 | Qualifying classification shows race gaps (+N laps) and a +/- column, and the copy says "Race classification" |
| 3 | User control and freedom | 3 | Sort and expand are reversible |
| 4 | Consistency and standards | 1 | Session best is blue (the S2 hue); NFA track limits are green; damage is purple; player gold/⭐ vs selection red |
| 5 | Error prevention | 2 | Inferred lap shows "+-0.001s"; without a replay, Telemetry and Compare go to the same place |
| 6 | Recognition rather than recall | 2 | Status column is icons only, explained by title tooltips |
| 7 | Flexibility and efficiency | 2 | No clean-laps filter or column hiding; sort not kept |
| 8 | Aesthetic and minimalist design | 2 | Pace chip on every row is the loudest thing; Actions column duplicates row click; 11 and 15 text colors in tbody |
| 9 | Error recovery | 2 | "--:--.---" rows give no reason inline |
| 10 | Help and documentation | 3 | Tooltips and expanded rows explain a lot |
| Total | | 22/40 | Acceptable |

Priority issues:
- [P1] Colors break DESIGN.md roles (session best blue, NFA green, damage purple, gold lap numbers, gold heading hover, orange incidents pill, gold+⭐ player vs red selection).
- [P1] Classification ignores session type (qualifying shows race gaps, +/-, race copy).
- [P1] Keyboard: stewards header is a clickable div; rows unfocusable; no aria-sort; no focus-visible rings.
- [P2] Distill the lap table: drop Actions, pace chip → dot + %, tyre only at stint changes, "Class Pos" → "Pos".
- [P2] Stewards log repeats the summary and the expanded lap rows; inner max-h scroll.

Detector: CLI clean (0) on table/ and standings/. Browser overlay 385 flags: 232 ai-color-palette (false positives: project tokens), 116 undersized 10px text (real: vs-opt sub-lines, HY chips, TL counts), 30 cramped padding (pace badges, stewards pills real), 5 nested cards (thead, false), 2 all-caps (headings, false).
