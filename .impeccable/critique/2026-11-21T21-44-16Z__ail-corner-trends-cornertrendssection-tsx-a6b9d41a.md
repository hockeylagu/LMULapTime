---
target: corner trend in the track detail
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Documents\\LMULapTime\\src\\components\\track-detail\\corner-trends\\CornerTrendsSection.tsx"
target_fingerprint: "sha256:42edb6d58aeb349877ab4ba785ef93877ed72695e80cfef45ae3f38768aa95ca"
target_path: "C:\\Documents\\LMULapTime\\src\\components\\track-detail\\corner-trends\\CornerTrendsSection.tsx"
timestamp: 2026-11-21T21-44-16Z
slug: ail-corner-trends-cornertrendssection-tsx-a6b9d41a
---
# Critique: Corner Trends (track detail)

Method: dual-agent (A: design review · B: detector + browser overlay)

## Design Health Score: 25/40 (Acceptable)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Loading, error, empty and "no corner times" footer present; sort state is only a small arrow, no aria-sort |
| 2 | Match with the real world | 2 | One corner is named "SQ2 km 0.9" in the row, "turn 3" in its advice, "T14" in the next row |
| 3 | User control | 3 | Rows open and close, sorts flip, Unpin undoes; sort resets on navigation |
| 4 | Consistency | 2 | Row graph puts quicker higher; cost sparkline puts lower cost lower. "Ref. gap" (class best) beside "vs target" |
| 5 | Error prevention | 2 | "Make focus" offered with no habit named; a 0.165 s corner (Silverstone National, Maggotts) shown as fact |
| 6 | Recognition over recall | 2 | Mark-shape legend, dashed line meaning and per-session details only in native title tooltips |
| 7 | Flexibility | 3 | Sortable columns, keyboard disclosure, telemetry deep link |
| 8 | Aesthetic and minimal | 3 | Calm and on-system; sparse tracks become a wall of grey placeholders |
| 9 | Error recovery | 3 | Fetch error with Try again; pin refusal inline with role=alert |
| 10 | Help and documentation | 2 | No visible key for marks, colours or terms (SQ, median, Ref.) |

## Design specificity
Authored for this product: sequence-corner labels, session-type mark shapes, Theil–Sen trend, one shared seconds scale across rows, habit Focus/Pinned pills, compare-in-telemetry link, lmu-* tokens, no purple/glass/glow. Weak spots are coherence and trust, not style.

Detector: CLI 1 advisory (text-[13px] off the ramp, CornerHabitLine.tsx:44). Overlay with GT3: 2 undersized-ui-text (10px FOCUS tags, HabitTags.tsx:5), 1 tiny-text (11px footer, CornerTrendsSection.tsx:179), 1 skipped heading caused by the next section's h4s. ~58 findings elsewhere on the page. URL mode timed out (SSE keeps the page from settling). Small-text hits are deliberate convention for this dense desktop app.

## Priority issues
1. [P1] Opposite sparkline directions (CornerTrendSparkline.tsx:37 quicker = higher; CostSparkline.tsx:32 lower cost = lower). Fix: flip CostSparkline so better is higher; check DrivingHabitsCard too. /impeccable polish
2. [P1] Three corner naming systems and two references in one row (SQ/km, "turn 3", "T14"; Ref. gap vs class best beside cost vs target). Fix: name turns in the row ("SQ2 · T3"), same form in habit text; label the two gaps by what they compare against or use one reference. /impeccable clarify
3. [P1] Implausible values reach the screen (0.165 s Maggotts corner next to a second Maggotts row). Fix: withhold or flag corners below a physical floor server-side; show "needs a rebuild" instead. /impeccable harden
4. [P2] Sparse state is noise: lone dot at the top edge reads as "at the class line"; every row repeats Need 3 sessions / No reference; chevrons open to "No habit named here". Fix: below 3 sessions collapse to one sentence or show only latest median; hide empty chevrons. /impeccable onboard
5. [P2] Legend and session details only in hover titles; point spans not focusable. Fix: quiet inline key under the header, focusable points, aria-sort. /impeccable clarify

## Persona red flags
- Author after a race: default lap order hides the costliest corner; "Keep as focus" on an auto-picked focus is ambiguous; three trend readings to reconcile.
- First-time open-source driver: section starts as "Pick a class"; SQ/median/Ref. unexplained; replay requirement only in the footer.
- Power user: BMW and Ford points share a class line, only the tooltip says so, so a car change can look like a trend.
- Screen reader: disclosure label "SQ2 km 0.9" omits Focus/Slipping; graph aria-hidden with no text trend.

## Minor
- "1 of 2 sessions have" → "has" (cornerTrendRows.ts:135).
- Empty state "No Hyper session" vs button "HY".
- Dead space in the corner column at 1500px; 360px graph floats centred.
- "Recent trend" descending sort puts slowing first without saying so.
- "Carry 2 km/h more" headline under a gap series of 8 → 1 → 2 km/h is within noise.

## Questions
- Default sort costliest first?
- Should a habit gap inside session-to-session noise show any headline?
- One "target" everywhere instead of a section-specific class reference?
- Below 3 sessions, is a table the right form at all?
