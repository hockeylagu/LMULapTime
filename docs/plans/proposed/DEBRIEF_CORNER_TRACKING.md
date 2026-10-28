# Debrief corner tracking (proposal, not started)

Agreed with the driver on 2026-10-28, after the Silverstone International race review; parked to build later.
Goal: show whether a corner habit the debrief found is being corrected, session after session.

## Why

"Where the time goes" ranks corners against a reference lap that changes every session (same car first, otherwise
the faster cars of the class in that session), so its gaps cannot be compared across sessions. Silverstone race
2026-10-28: T3 (~780 m) cost +0.50 s, lost on 12 of 12 laps; S1 17.86 s against 17.52–17.55 s for the field, with
the highest top speed of the class, so the gap was driving, not the car (BoP keeps the cars close below alien level).

## Measure: the driver against themself

Per debrief corner, from the analysed lap and the laps already timed for repeatability (traffic passes left out):

- median corner time of the clean passes;
- the three cues the tips use: braking point, minimum speed, full-throttle point;
- the corner's rank and laps-losing count in that debrief.

Compare only like with like: same driver, car, layout and dry conditions.

## What the card shows

- On a corner row: the change against the most recent earlier entry at this layout, with its date
  (`vs last race here (Oct 21): 0.14 s quicker · brake 6 m later · apex +3 km/h`), and what still separates it from
  the technique lap.
- At the top: the previous debrief's #1 corner (`Focus from last time: T3 — improved 0.14 s, still your #1`).
  A corner leaving the top three is a corrected habit.

## Storage and build

- Small SQLite table keyed by session, driver and layout (a few rows per session), written when a debrief is built.
  Deterministic; never AI.
- History starts with the next built debrief. Older sessions join only when their debrief is opened (about 4 s from
  the stored replays); no background backfill.
- Corner numbers come from the layout's corner map, so they are stable between sessions. A track or patch grip change
  can move times too: always show the earlier session's date.

The unmerged `debrief-first` worktree listed this as item 7 (saved focus corners) but did not start it; its
localStorage debrief store is not the storage to reuse.
