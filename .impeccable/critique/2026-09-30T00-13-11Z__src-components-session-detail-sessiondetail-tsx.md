---
target: session detail page
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Documents\\LMULapTime\\src\\components\\session-detail\\SessionDetail.tsx"
target_fingerprint: "sha256:c1cb0f57484047d5e013408d928d1590dac07441292c6a13b16723e9c94a9a37"
target_path: "C:\\Documents\\LMULapTime\\src\\components\\session-detail\\SessionDetail.tsx"
timestamp: 2026-09-30T00-13-11Z
slug: src-components-session-detail-sessiondetail-tsx
---
# Critique: session detail page (SessionDetail.tsx)

DEGRADED: single-context (session policy: sub-agents only on explicit request)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Debrief collapsed behind a button without preview |
| 2 | Match system / real world | 3 | Clipped jargon: Excl. L1, Consist, OA |
| 3 | User control and freedom | 3 | Back, driver switch, quali/race jump work |
| 4 | Consistency and standards | 1 | Gold quali link, indigo average, blue best lap, old session type colors in header |
| 5 | Error prevention | 3 | Reading page |
| 6 | Recognition rather than recall | 3 | Labels everywhere |
| 7 | Flexibility and efficiency | 2 | Best lap tile is a clickable div; no jump to best lap row |
| 8 | Aesthetic and minimalist design | 1 | ~12 hues and 13 boxed tiles above the fold at equal weight |
| 9 | Error recovery | 3 | Load error shows message and a way back |
| 10 | Help and documentation | 2 | Tooltips only, some emoji |
| Total | | 24/40 | Acceptable |

Specificity: content deeply product-specific; presentation a generic tile grid. Detector: 0 findings.

## Priority issues
- [P1] Every metric its own hue (blue best, aqua top3, indigo avg, green theo, cyan peak, amber pits, gold laps led). Fix: white values, color only for gain/loss, P1/PB gold, incidents>0. /impeccable quieter
- [P1] Header off-system: type tag bypasses getSessionTypeStyle (gold quali, blue practice); gold Go to Quali and amber Open Telemetry compete above the title; gold hovers. Fix: getSessionTypeStyle, neutral jump buttons. /impeccable polish
- [P2] 13 equal boxed tiles in two grids, heading duplicates standings. Fix: dashboard card shape, 3-4 headline values, quiet label:value line. /impeccable layout
- [P2] Lap table decorates the normal case: green shield on every valid lap, blue session best row, red Compare Laps. Fix: silent valid laps, neutral best row, neutral compare. /impeccable quieter
- [P2] Standings: player row gold (gold = P1, red = identity), incident chips on nearly every row, purple Damage badge. /impeccable quieter

## Persona red flags
- Alex: 13 tiles then collapsed debrief to find lost time; best lap tile looks like a stat not a control; no jump to best lap row.
- Sam: best lap tile is a non-focusable div; sector bests color+bold only; emoji in labels read aloud.

## Minor
- Finished Normally chip for the default outcome; amber Excl. L1; True Pace badge + footnote redundant; Rules & Config chip row adds 3 hues; back button red hover border; rounded-2xl vs rounded-xl siblings.

## Questions
- Which single number is the page about?
- Should race and practice summaries differ?
- Debrief second and open by default?
