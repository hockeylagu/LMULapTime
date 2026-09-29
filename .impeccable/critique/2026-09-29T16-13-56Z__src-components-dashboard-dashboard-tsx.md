---
target: the dashboard
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Documents\\LMULapTime\\src\\components\\dashboard\\Dashboard.tsx"
target_fingerprint: "sha256:c8e975ecaf634bd745497306bbf9dc01589d162b23714518f66d3d4fb16fa88d"
target_path: "C:\\Documents\\LMULapTime\\src\\components\\dashboard\\Dashboard.tsx"
timestamp: 2026-09-29T16-13-56Z
slug: src-components-dashboard-dashboard-tsx
---
# Dashboard critique (src/components/dashboard/Dashboard.tsx)

Method: dual-agent (A: design review · B: detector + browser)

## Heuristics: 24/40 (Acceptable)
1 Status 3 · 2 Real world 3 · 3 Control 3 · 4 Consistency 2 · 5 Error prevention 3 · 6 Recognition 2 · 7 Efficiency 2 · 8 Minimalist 2 · 9 Recovery 2 · 10 Help 2

## Specificity
Half authored: hero (track outline, P3 (+3), 100Hz launch, fidelity-coded action) is sim-racing specific; below it four equal "Top 3 + Show All" cards, odometer stats and a 605-row table read as generic admin dashboard. Page answers "what have I driven" not "where did I lose time / did I improve".
Detector: CLI 0 findings. Overlay 4,704 flags, mostly false positives (lmu tokens read as "cyan neon", 10px floor is deliberate, truncate overflow intended). Real signal: nested stat tiles in the spotlight panel, 605 identical pace badges, 21 distinct text colors in main.

## Priority issues
- [P1] Numbers disagree: hero Clean Lap Rate uses lap.isValid (useDashboardTrends.ts:280) vs overview selectCleanLapCandidates (useDashboardMetrics.ts:135); distance fallback 4.5 km (useDashboardTrends.ts:220) vs 5 km (useDashboardMetrics.ts:118), unlabelled; momentum tiles computed over 8 sessions any class under a "Last 6 Stints · Hypercar" header. -> harden, clarify
- [P1] Landing does not answer "did I improve": Latest Outing prefers a recent race over the newest session (useDashboardTrends.ts:135-160); no delta to PB at layout/class, no rival gap, no debrief takeaway. -> layout, shape
- [P2] Four summary cards generic, equal weight, hue as decoration (gold/blue/purple/teal headers), RankBadge ranks unrelated stats, one Show All opens all four. -> distill, colorize
- [P2] Session table: 605 rows, 34k px, no grouping/count/sticky header, Q and R of one event read as unrelated rows, gold on every Best Lap. -> layout, optimize
- [P3] Voice drift: "Spotlight", "Momentum", pace emoji, duplicate LMP2 pills, gradient sparkline fill, "Click here to show empty results". -> clarify, polish

## Personas
Alex: no one-move "last session at X", four cards before the table, one toggle opens every card, no count/pagination.
Sam (deferred): 605 tr rows not focusable, only 3 headings with skipped structure, pace category by emoji + color, sparkline data in title only.
Driver just out of a session: hero may show an older race, "0.26% slower" pools tracks, no PB/rival/debrief answer.

## Minor
Hide Empty 324 / Has Replay 324 / 325 Replays read like a bug; Race Net Positions +14 over 8 any-class sessions; Activity pill date is the spotlight's day, not today; Overview "929 Sessions" includes hidden empties; N/A tiles unexplained; hard-coded "(9 Stats)".

## Questions
- If the dashboard showed only the last session, its gap to PB and rival there, and one debrief takeaway, what would you miss from the four cards?
- Does the session list belong on the dashboard, or is it the Sessions page wearing a dashboard hat?
- Is a benchmark-% trend across different tracks something a driver can act on?
