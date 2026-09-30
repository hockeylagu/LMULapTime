---
target: src/components/dashboard/DashboardHero.tsx
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Documents\\LMULapTime\\src\\components\\dashboard\\DashboardHero.tsx"
target_fingerprint: "sha256:c798429c10095b6a715b599fe4359ca07d74b97f1324cd3fdea71f1757d9b944"
target_path: "C:\\Documents\\LMULapTime\\src\\components\\dashboard\\DashboardHero.tsx"
timestamp: 2026-09-29T21-09-32Z
slug: src-components-dashboard-dashboardhero-tsx
---
Method: dual-agent (A: ac47161f36a95129c · B: a94d4f5c47d5f9b95)

# Critique: Dashboard hero (`src/components/dashboard/DashboardHero.tsx`)

## Heuristic scores

| # | Heuristic | Score | Note |
|---|---|---|---|
| 1 | Visibility of system status | 3 | "Last on track" line is clear |
| 2 | Match with the real world | 3 | Racing vocabulary is right |
| 3 | User control | 3 | Replay and session links work |
| 4 | Consistency and standards | 2 | "0.26% slower" is warn amber, but loss is rose; the trophy is amber-soft (#FFD230), not gold |
| 5 | Error prevention | 3 | n/a-ish, no risky actions |
| 6 | Recognition over recall | 3 | Labels on every stat |
| 7 | Flexibility | 2 | The sparkline dots do nothing; no path from a figure to its session |
| 8 | Aesthetic and minimalist design | 2 | About 15 values at the same weight; the largest text in the hero is the greeting (18px) |
| 9 | Error recovery / empty states | 2 | The hero returns null when there is no outing |
| 10 | Help and documentation | 2 | Clean lap rate, consistency and net positions are not explained |
| | **Total** | **25/40** | |

## Specificity verdict
Grounded in LMU vocabulary, but the layout reads like a generic stat card: nothing in it could only belong to a race debrief.

## Overall impression
The hero is flat because it has no figure. Measured live: 5 font sizes (18, 16, 12, 11, 10px) and 10 text colors inside 1436×302px. The finish "P3" is 12px in an outline pill. The best lap is 16px, the same size as the track name. The brightest mass on the card is the amber replay button. The last race and the recent form are both present, but neither is a headline.

## What's working
- The single card with a split column is calmer than the old boxed tiles.
- Contrast is sound everywhere: the muted tier is 6.06:1, and every value passes AA.
- The detector found 0 issues in the source. All 4 "AI palette" hits are false positives (lmu emerald tokens), and so are 7 of the 9 "undersized text" hits (the deliberate 10px caps floor).
- The replay button keeps its meaning: amber for 100Hz, green for replay only.

## Priority issues

**P0: No focal figure** (`DashboardHero.tsx:121-142`)
Promote the result to a large readout: "P3" at 28–32px mono/800, "+3 from P6" in gain beside it, and the best lap at 24px. Drop the pill and the amber trophy; gold only for P1. For a practice or qualifying session, the best lap becomes the hero figure.

**P1: Recent form has no headline number** (`DashboardPaceSparkline.tsx:36, 54-78`)
Lead with the current pace "103.4%" at 24px with its delta. The autoscale (minimum range 0.1%) turns noise into a cliff: set a 1–2% minimum y-range. Make the chart 64–80px tall, add a purple 100% benchmark line, and use a solid fill instead of the gradient. The Past and Latest end values are 10px data, not labels (the only real detector finding): raise them to 12px.

**P1: The replay button out-shouts the content** (`DashboardHero.tsx:173-197`)
It is `flex-1` with a 15% amber fill. Make it content-width at a 10% tint, keeping amber vs green.

**P2: No lift over the cards below**
The hero has the same surface, border and padding as the cards under it. Options: a deeper well behind the chart, `p-6`, or a 2px top rule in the accent.

**P2: "Slower" is colored as a warning, and noise counts as a trend**
A 0.26% change is under half a tenth on most laps. Either color a decline in loss rose, or treat anything under about 0.3% as steady (the threshold is 0.15% today).

**P3: Soft semantics** (`useDashboardTrends.ts:270-291`)
The clean lap rate uses `lap.isValid`, not the parser's clean flags (AGENTS.md rule B). Net positions sum 8 sessions of mixed types with an unlabeled window.

## Persona red flags
- **The racer after a race:** hunts for the result. "P3" is the same size as the lap count, and "0.26% slower" scolds for noise.
- **The data tinkerer:** no axis scale, no benchmark line, and the sparkline dots are not clickable.

## Minor observations
- The benchmark pace badge padding is 2px 8px, tight next to the 12px text (detector, real).
- The ⭐ emoji in the pace category is the only emoji on the card.
- The track outline is small at this size; the long track name pushes the Race badge.
- The "(Past)" and "(Latest)" suffixes are noise once the axis is labeled.

## Questions to consider
- Which one number should the driver read first: the finish, the best lap, or the pace %?
- Should the form column show the per-layout PB delta instead of the benchmark average?
- Does the greeting still earn its own row once the figures are big?
