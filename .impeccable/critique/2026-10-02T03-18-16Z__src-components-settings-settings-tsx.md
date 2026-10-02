---
target: the settings page (final)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Documents\\LMULapTime\\src\\components\\settings\\Settings.tsx"
target_fingerprint: "sha256:4a97c4814bb2d1d57b47582e3d8dd9191d752bb8df8eb5001a5cf67465eed522"
target_path: "C:\\Documents\\LMULapTime\\src\\components\\settings\\Settings.tsx"
timestamp: 2026-10-02T03-18-16Z
slug: src-components-settings-settings-tsx
---
# Settings page critique (final) — 28/40 Good
Method: dual-agent (A design review, B detector + browser overlay)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility | 3 | Upgrade status only while running; "updated" ambiguous |
| 2 | Real world | 3 | Decoded/Version/Compressed jargon; v3 unexplained |
| 3 | Control | 3 | Gemini key lost on server restart |
| 4 | Consistency | 2 | Missing folder warn vs loss; 10/11/12px labels; mono status words; duplicate Readout |
| 5 | Error prevention | 3 | Red primary Rescan always armed |
| 6 | Recognition | 3 | Column meaning only in title tooltips; Outdated 0 vs 96 v3 rows |
| 7 | Flexibility | 3 | Search whole-section only |
| 8 | Minimalist | 2 | AI status twice; prose on every card; table dominates |
| 9 | Error recovery | 3 | Good |
| 10 | Help | 3 | Version meaning unexplained |

Detector: CLI 0; browser 24 (13 undersized 10px, 9 tiny 10-11px, 1 low-contrast disabled 4.3:1, 1 nested-card false positive).

## Priority issues
1. [P1] formatDuration shows "13:60" (replayModel.ts:139-140) — round total first. /impeccable harden
2. [P1] Signal Rule: Archived = text-lmu-gain (ReplayCacheTable.tsx:98); benchmark change list uses gain/warn/loss as change types; faster target green. /impeccable colorize
3. [P2] Missing folder 3 looks; label sizes 10/11/12; mono status words; 10px AI history data; 20px title. /impeccable typeset
4. [P2] Replay version story hidden: Outdated 0 vs 96 archived v3; upgrade not searchable. /impeccable clarify
5. [P3] IA: search whole cards; Clear in Overview; AI status duplicated; dead getBadge; red Rescan at page end when healthy. /impeccable distill

## Personas
Alex: key re-paste after restart; inert replay rows; nested scroll; version sort mixes archived; duplicate history entry.
Sam: progress bars lack role=progressbar; tooltip-only column meaning; rows unfocusable; sidebar icons lack aria-hidden; path status change not announced; legend bold-only.

## Minor
"No Settings Found" title case/white; "2 Cached"; spinner lacks motion-reduce; text-white x35; subtitle repeats TOC; BenchmarkImpactBadge 10px mono.

## Questions
Replay archive as a first-class library? Table showing only what needs attention? Should a faster target ever be green?
