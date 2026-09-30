---
target: the leaderboard page
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Documents\\LMULapTime\\src\\components\\leaderboard"
timestamp: 2026-09-30T14-41-02Z
slug: src-components-leaderboard
---
# Critique: Leaderboard page (#/leaderboard)
Method: dual-agent (A: design review, B: detector and browser)

## Health score 25/40
1 Status 3: the ribbon card goes stale after switching class. 2 Real world 3: "P1 (Practice)" clashes with position. 3 Control 3: switching track or class drops the compare picks. 4 Consistency 2: amber "you" row, differs from the session classification; three different missing-value dashes. 5 Error prevention 3. 6 Recognition 2: four icon-only row actions, two compare models. 7 Efficiency 2: 20 Tab stops in the ribbon, no search, no descending sort. 8 Minimalism 2: rank shown 3 times, 8 empty band rows in LMP3. 9 Recovery 3: no retry. 10 Help 2: theoretical best, ghost and bands unexplained.

## Specificity
Mostly authored: ribbon track outlines, pace bands in the table, the rival loop. Generic: the four stat tiles, the 11-column table with icon actions, the emoji tags.
Detector: the CLI found nothing. Browser: tiny text below 11px (real: the P{rank} suffix at LeaderboardRow.tsx:36, the car·ago line at :90, RivalCard.tsx:76-78), all caps at LapDebriefPanel.tsx:77. "AI palette", nested cards and flush edge are false positives.

## Priority issues
- [P1] The player and rival rows use amber (LeaderboardRow.tsx:77-88, raw rgba shadow), against the "muted (You), never gold" rule. Fix: neutral tint and a muted You; the rival rim from a token. /impeccable colorize
- [P1] The sector columns show best sectors from any lap, not the lap's sectors, and disagree with the compare and rival cards. Fix: "Best S1/S2/S3" plus a tooltip. /impeccable clarify
- [P1] Four icon-only row actions and two compare models; the compare panel sits below 130 rows. Fix: one Compare (vs you), an overflow menu for pin and telemetry, a sticky selection bar. /impeccable distill
- [P2] Hollow states in small or slow fields (LMP3 P1/2: Leader, top 50%, a "weakest" sector in red, 8 empty bands, "close 0.000", P1/1 cards). Fix: collapse the bands, target the next band when P1, suppress the zero sentence, "Only you". /impeccable harden
- [P2] No focus-visible styles in the leaderboard; the ribbon toolbar has no arrow keys; aria-sort only on the active column; no descending sort. /impeccable audit

## Personas
Alex: no track search or descending sort; Show all loses the anchors; bare crosshair. Jordan: HY, HYPERCAR and LMH; jargon; P1/1 on a fresh install. Author: nothing new since the last visit; the trend has no session names; "36 km/h more" at T5 looks implausible.

## Minor
Three app names; a doubled Leaderboard heading; the leading 0: on sectors; adjacent expanders; the repeated rival time; the 🎯 emoji renders purple; 103.0% vs 103.1%.

## Questions
The rival as the hero? "Drivers I raced" as the default? When P1 of 2 at 113.9%, the bands as the rivals?
