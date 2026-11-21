---
target: Critique debrief
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Documents\\LMULapTime\\src\\components\\session-detail\\debrief\\SessionDebriefSection.tsx"
target_fingerprint: "sha256:9c07664d3344d8ae7b1820c9ae25566ed3785cf6c5fada6eb60cb7022a18c944"
target_path: "C:\\Documents\\LMULapTime\\src\\components\\session-detail\\debrief\\SessionDebriefSection.tsx"
timestamp: 2026-11-21T21-06-36Z
slug: detail-debrief-sessiondebriefsection-tsx-9d69a62b
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent)

Target: Session Debrief (src/components/session-detail/debrief/SessionDebriefSection.tsx), inspected live on the Sebring School race of 2026-11-17 (R1) and the qualifying before it (Q1).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Unpin reloads the whole card into "Reading corner analysis…" with no confirmation of what changed |
| 2 | Match System / Real World | 3 | Engineer voice works; "km 0.9" as a corner name, "s/lap", "No longer in your top 2" need translating |
| 3 | User Control and Freedom | 2 | Unpin has no undo; no pin from the debrief |
| 4 | Consistency and Standards | 3 | Strategy pane and dialog say the same figure two ways ("est. 1.9 laps" / "1.9 laps of use") |
| 5 | Error Prevention | 2 | The cost readout's green trend sits beside "no gain in the corner yet" on the same row |
| 6 | Recognition Rather Than Recall | 2 | Every definition and baseline lives in native title tooltips |
| 7 | Flexibility and Efficiency | 2 | Direct links to the corner in telemetry; no way to see beyond 2 corners or open all details |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and on-system; 450-900 px gap between advice and its cost |
| 9 | Error Recovery | 3 | Server message plus per-part retry; the unavailable copy says what is needed |
| 10 | Help and Documentation | 2 | No visible "how the focus is chosen" or who the target is |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment:** Authored for this product. The race-engineer voice ("Carry 2 km/h more", "Try: Brake 18 m later", "Apex 115 → 117 km/h"), the pace-level goal ("Good → Competitive · 0.45 s to find") and the try → result loop ("Last try: you got a little closer to the inside at the apex at T17 · no gain in the corner yet") could not come from a generic analytics template. The weaknesses are trust and priority, not identity.

**Deterministic scan:** The static scan of src/components/session-detail/debrief/ and common/CostSparkline.tsx found nothing (exit 0). The in-page overlay found 65 issues on the whole session page, only 3 inside the debrief panel: nested-cards on the Race strategy aside (a tinted strip with a top rule, intended) and undersized-ui-text on "Pit stops" and "VE at finish" (the 10px label is the design system's Label role; the detector's 11px floor conflicts with DESIGN.md). 55 undersized-ui-text findings across the page are the same intended 10px labels and GT3 badges. An em-dash banner (18) looks false: no em dash in the page text. Outside the debrief, worth a look: the "Sectors" header in the session summary overflows its box by 17 px, and two sector rows sit flush against their edge (cramped-padding). The URL scan timed out (the page never goes network-idle).

**Visual overlays:** Injected into the [Human] tab in the browser pane, which shows the 65 overlay labels and the banner.

## Overall Impression

A real coaching surface with a closed loop and a clear voice. Its main number can contradict the sentence next to it, and the two focus corners do not explain where the goal's time is. Fixing what "then" means is the biggest single gain.

## What's Working

1. **The coaching loop closes.** Advice, then "Try:", then next session's "Last try: … · no gain in the corner yet" or "… quicker": the panel checks whether advice was followed and whether it paid (WatchNextSessionCard.tsx:122-126, watchNextSession.ts:200-205).
2. **Answer first, detail on demand.** One white sentence per corner that is also the link to that corner in telemetry against the right lap; diagnosis under a left-ruled Details. Neutral "Your pick", amber only for Slipping and Try, mono readouts, no glow, 10px floor kept.
3. **States and dialog are solid.** Strategy and corner analysis load and fail independently, each with its own retry. The strategy dialog focuses Close, traps Tab, closes on Escape and returns focus to "View full strategy".

## Priority Issues

**[P0] The cost readout's trend contradicts the latest session and the "Last try" line**
- Why it matters: "then" is the oldest of the last 5 sessions (title "17 Nov Qualifying against this session"), and the end dot is coloured by now − then. Sunset Bend reads "0.34 → 0.23 s/lap" with a green dot while its costs went 0.12 → 0.23 since the last session and the row says "no gain in the corner yet"; km 0.9 (0.07 → 0.17) and T1–T2 under "No longer in your top 2" show the same pattern. The driver leaves thinking a corner improved when it got worse. Breaks Principle 1, Trust over coverage.
- Fix: colour the trend by the change since the last session (the same span "Last try" uses), or keep then → now but say the span in visible muted text ("since 17 Nov") and colour by that same span only when it agrees with the latest step. Recheck the "No longer in your top 2" icon tone when the cost rose.
- Suggested command: /impeccable clarify

**[P1] The focus does not explain the goal's gap**
- Why it matters: qualifying says "0.37 s to find" while its two focus corners cost 0.07 and 0.03 s/lap. A 0.03 s, 2 km/h habit is inside lap-to-lap spread. The driver gets no pointer to the other ~0.27 s.
- Fix: say how much the focus covers ("these 2 corners: 0.10 of 0.37 s"), give a focus corner a minimum cost (or show "nothing worth a focus yet"), and link the rest to the track's corner trends.
- Suggested command: /impeccable clarify

**[P1] Too many instructions per corner, sometimes pulling apart**
- Why it matters: Sunset Bend carries "Carry 2 km/h more", "Try: Brake 18 m later", Details "Why vs target: tighter arc: 76 m radius against 82 m" (double colon), "Other differences vs target: 0.4 s more part throttle" and "Last try: you got a little closer to the inside". Moving inside last time and "your arc is too tight" now can read as opposite advice. At the wheel, one cue per corner survives.
- Fix: one cue per row (fold the headline and Try into one imperative, e.g. "Brake 18 m later to carry 2 km/h more"); when the last try and today's diagnosis touch the same thing (the line), say how they relate.
- Suggested command: /impeccable distill

**[P2] Definitions and baselines only in native title tooltips**
- Why it matters: Term (common/Term.tsx) is a non-focusable span with a title; the goal maths, the meaning of "then", the metres behind "a little closer" and the sparkline values are mouse-only and slow. Both topic links are named "Carry 2 km/h more" and both toggles "Details", with no corner in the name.
- Fix: a focusable Term with a small popover, or the definition inline in Details; accessible names with the corner ("Sunset Bend: details"); the baseline as visible muted text.
- Suggested command: /impeccable harden

**[P2] Advice and its cost sit far apart; the side pane is thin**
- Why it matters: justify-between pushes the cost and sparkline to the far edge: 450-600 px from the advice in the race layout, about 900 px in qualifying, where there is no side pane. The race side pane holds two figures and the one-off, and the rose "+0.42 s" one-off ends up the loudest number on the panel while being the thing not to train.
- Fix: cap the row's measure or put the cost right after the advice; give the single-column (qualifying) case a narrower measure; quiet the one-off's number or give the strategy pane a one-line verdict.
- Suggested command: /impeccable layout

## Persona Red Flags

**The author after a race:** lands on "Good → Competitive · 0.45 s to find" (good), reads Sunset Bend "0.34 → 0.23" in green and concludes it improved, though it lost 0.11 s against last session. The strongest number in view is the one-off "+0.42 s", which is not what to train.

**Another LMU driver, first run:** "km 0.9", "s/lap", "target" (who?), "Over-slowing" (dotted underline, hover only) and "Fuel ratio 0.84" are unexplained in view; nothing says how the 2 corners were chosen.

**Alex (power user):** must read headline, Try, then open Details to see why; no "open all"; Unpin reloads the card with no undo.

**Sam (keyboard / screen reader):** two identical link names and two identical "Details" buttons; Term definitions unreachable; the sparkline's direction is only its end-dot colour.

**Riley (stress tester):** green dot beside "no gain"; a 0.03 s/lap focus; an unnamed corner as "km 0.9"; "Why vs target: tighter arc: 76 m …"; the strategy dialog repeats "No pit stops" right after "Stops 0".

## Minor Observations

- "Try:" in amber borrows the warning / rival hue for an instruction; documented in DESIGN.md, so a question rather than a bug.
- The strategy dialog's "Fuel ratio 0.84 — 0.84 covers every clean lap" repeats the value; the pane says "est. 1.9 laps", the dialog "1.9 laps of use".
- The debrief heading icon is red (text-lmu-accent-text); check it against the One Red Rule.
- The goal line's "Good" badge is green and "Competitive" amber: the pace colours can read as good → warning, the reverse of the aspiration.
- "showed on 53% of your clean laps" for a 2 km/h habit with a 1.5 km/h threshold (habitRules.ts:25) is thin evidence for a headline.
- The leaderboard's DebriefCornerRow.tsx still uses its own chip size and an info-blue link style.

## Questions to Consider

- If only one sentence per corner survived, which would it be?
- Should "then" ever be anything but the last time you drove here?
- Should a corner be a focus when its cost is smaller than your lap-to-lap spread, or is "nothing worth a focus yet" the honest answer?
- Does the race strategy recap belong in a panel about what to practise next?
