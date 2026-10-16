# Driver-centered dashboard review

Reviewed 2026-10-15. Scope: mock placement and session coverage before live integration.
The assessments describe the starting snapshot; accepted changes and user choices
below supersede conflicting recommendations in that snapshot.
Method: independent driver/design assessment (`driver_review`) and independent
detector/browser evidence (`dashboard_evidence`), followed by synthesis. Both
inspected all four mock states at 2560 x 1440 in their own temporary browser tabs.
This is not validation of cockpit readability or live-game data availability.

## Verdict

The layout has a clear sim-racing purpose and readable hierarchy in screenshots,
but it currently represents snapshots rather than the decisions of a full session.
Practice emphasizes completed laps, qualifying lacks visible validity, and the
stint-race repair strip displaces the race position/gaps. Complete the session
states and comparison meanings before connecting live telemetry.

## User decisions incorporated during review

- One passive page; no race-time controls, tooltips or acknowledgments.
- 27-inch 1440p at 50+ inches. Actual seated feedback outranks screenshot approval.
- Short labels, substantial values, signed green/red/neutral timing deltas.
- Full-width 20-second pedal trace remains. Its heading, legend, repeated duration
  caption and current input percentages are removed. Allocation falls from 390 to
  294 px; the time axis still states the history window.
- Remove practice's `LAST 3 LAPS` heading and qualifying's `SESSION TIMING` heading.
  Keep informative table column labels and the best/projected field labels.
- Race headline: `PIT IN 2 LAPS` or `FINISH IN 5 LAPS`; absolute pit lap remains visible.
- Race uses exactly one resource: only GT3 and Hypercar use VE; every other class
  uses fuel. Both pit targets and finish projections follow this rule.
- Practice has no fuel metrics. Real car identity reuses the site's existing pattern.
- User selected last completed lap as practice's largest value. A secondary
  current-lap delta versus best is now present below it; keep that hierarchy.
- User selected current-lap pace/sector deltas for the healthy race support strip.
  Position/gaps are optional, not the default replacement for repairs. The healthy
  mock now shows current delta, completed S1/S2 deltas and an unfinished S3 state.
- Healthy/damaged presentation is now independent of sprint/stint length. The
  default planned-stop race also shows pace; `condition=damage` retains the repair
  example. This corrects the initial snapshot's coupling of every planned pit with damage.

These removals/resource changes were applied after the assessors' initial captures;
the parent checked all four revised browser states. Raw detector measurements refer
to the earlier snapshot, not to the reduced trace/header layout.

## Questions in the driver's mind

| Session / moment | Driver thought | Needed at a glance |
|---|---|---|
| Practice out lap | Am I on a timed lap yet? | OUT LAP; retain completed history; no misleading live delta |
| Practice flying lap | Did that change help this lap? | Live signed delta, explicit reference and validity |
| Practice sector completed | Which part improved? | Current completed sector and its delta; distinguish it from last-lap splits |
| Practice after a lap | Can I repeat it? | Last/best, recent lap/sector rows; invalid laps visibly excluded from clean bests |
| Qualifying departure | Is this preparation or an attempt? | OUT LAP / PUSH LAP |
| Qualifying mistake | Does the lap still count? | INVALID, permanently visible while relevant; do not require interpreting a green gain |
| Qualifying near session end | Can I start another attempt after this one? | Explicit attempts after current lap, based on verified deadline/resource rules |
| Race normal running | Where am I, and when is my next obligation? | Pit/finish countdown, class position and relevant gaps |
| Race resource risk | Can I reach the planned pit or finish? | Class-relevant margin or short actionable warning; never VE and fuel side by side |
| Race pit preparation | What do I enter in the MFD? | Verified target and unit, absolute pit lap; distinguish departure target from amount added |
| Race after contact | Is a stop worth it? | Repair decision, recoverable pace loss and extra stop cost only when supported |
| Pit lane / service | Has the stop begun, and how much remains? | PIT LANE / SERVICE; measured elapsed and supported estimate |
| Out lap after stop | What is the next plan? | OUT LAP, actual replenished resource and recalculated pit/finish obligation |
| Final lap / finish | Is the race actually over? | FINAL LAP / FINISHED from observed finish rules; timed horizon stays estimated |
| Any session, missing source | Can I trust these numbers? | DATA LOST or a specific unavailable capability; suppress stale advice |

## Five priority gaps

1. **P1 in starting snapshot: Current-lap feedback was missing from practice.** Large last-lap time repeats
   the latest table row, while the driver's present experiment has little feedback.
   A secondary live delta has now been added; validity/state still needs a mock.
   The user explicitly chose to keep last completed lap as the primary value.
   Keep last lap, best, best possible and recent sectors in stable supporting positions.
   Do not blend current sectors with previous-lap sectors without explicit labels.
2. **P1: Qualifying validity was accidentally removed by simplification.** The mock
   creates a `VALID` paragraph and its general cleanup deletes it. Restore validity
   as a standalone short state, not as prose. Another-attempt advice must explicitly
   say whether it excludes the current lap. Projected finish time yields space first.
3. **P1 in starting snapshot: Longer races lose ordinary driving context.** The
   repair variant removes current-lap performance entirely. The user chose current
   pace and sector deltas as healthy support content; that mock is now updated.
   Preserve predictable timing context when damage or pit advice takes priority.
   Position/gaps can be considered later if space permits and the user wants them.
   Distinguish class-position rivals from physically neighboring multiclass traffic.
   An optional traffic alert requires observed data, not an invented clear-air claim.
4. **P1: Repair times have ambiguous relationships.** `SKIP REPAIRS`, repair duration
   and total pit time coexist without saying whether repair is included. Use compact
   conditional labels: `IF REPAIR`, `EXTRA STOP`, and a total tied to the selected
   service. Never derive repair seconds from arbitrary damage percentages or sum
   concurrent service tasks. Healthy racing should not be dominated by repair figures.
5. **P1: The difficult states are absent.** Add mock variants for out lap, invalid lap,
   pit this lap, service, final lap, strategy unavailable and disconnected source.
   No real-source precision or capability should be implied by an attractive number.

## Complete the page with fixed information locations

Retain the existing broad regions and full-width trace. Change content automatically
within fixed locations as the session changes; do not add tabs or reflow the page.

- **Primary region:** current delta/state in practice or qualifying; the approved
  pit/finish countdown in races. A genuine urgent state can take priority here.
- **Support region:** reference timing and completed sectors in practice/quali;
  current-lap pace/sector deltas when racing healthy, verified MFD/service essentials
  near a stop. Keep enough timing context visible when damage requires attention.
- **Timing/history region:** substantially sized completed laps/sectors, with clear
  comparison meaning. Preserve information long enough for the next safe glance.
- **Trace region:** only the requested green/red traces and time/input axes; no legend,
  extra caption or duplicated pedal percentages.

Average tyre temperature, qualifying projected time, repeated no-stop confirmations,
car/session identity and best-possible timing have lower priority than validity,
attempt availability, race context and the next obligation. Do not remove user-requested
content indiscriminately; these are the first candidates when space must be traded.

## Evidence and technical limits

The detector returned 11 raw findings: six padding warnings, four color advisories
and one radius advisory. Measured padding existed in all six flagged cases; the
radius corresponds to the existing 4 px token. Canonical pedal colors account for
two color advisories; two remaining literal-color mismatches are low priority in
this standalone mock. The design sidecar predates current DESIGN.md. No unrelated
design-system repairs were performed. Read-only browser evaluation prevents a
mutable detector overlay; no overlay or extra overlay server was created.

Only pedals animate; clocks, advice and lap statistics are static scenario data.
That is appropriate for a placement mock but does not establish freshness. Live
validity, phase transitions, finish rules, gaps, deadlines and lap numbering must
be verified. Live VE and repair/service sources remain unverified. Unsupported
channels must not become invented values. All metric calculations remain deterministic.

The official [LMU HUD guide](https://guide.lemansultimate.com/hc/en-gb/articles/13201287548687-Understanding-the-HUD-Heads-Up-Display)
distinguishes current/last/best timing and live delta. The official
[MFD guide](https://guide.lemansultimate.com/hc/en-gb/articles/13202210967055-Understanding-the-MFD-Multi-Function-Display)
distinguishes nearby cars, track-limit/penalty information, timing and pit/resource settings.
These support the decision categories; they do not establish an external live-data contract.

## Heuristic assessment of prototype completeness

0 = absent/problematic, 4 = excellent. Scores describe visible prototype behavior,
not future implementation promises and not physical cockpit readability.

| Heuristic | Score | Main reason |
|---|---:|---|
| System status | 2 | Session context visible; validity/lifecycle/freshness missing |
| Real-world meaning | 3 | Racing language works; service/target semantics need clarity |
| Control / freedom | N/A | No in-drive controls by requirement |
| Consistency | 3 | Stable regions; references and race-context availability vary |
| Error prevention | 1 | No demonstrated invalidity/stale-advice handling |
| Recognition over recall | 2 | Pit lap/history help; repair relationships require reconstruction |
| Flexibility / efficiency | N/A | Pre-drive setup outside reviewed passive page |
| Minimalism | 3 | Strong hierarchy; latest user corrections remove redundant headings |
| Error recognition / recovery | 1 | Missing source/strategy states not demonstrated |
| In-drive help | N/A | Explanatory interaction intentionally excluded |
| **Total** | **15/28** | **Snapshot composition is ahead of session coverage** |

Experienced racers need current feedback; distance viewers need shorter labels and
fewer competing values; unfamiliar-class drivers need unambiguous VE/fuel units.
Invalidation, contact, a changed pit plan and service delay should produce factual
state plus next obligation. No motivational copy or dismissible alerts are needed.

## Next mock pass and open decisions

Before live integration, test paired normal/problem states: practice flying/invalid,
quali valid/out-lap/last attempt, race healthy/pit imminent/resource shortfall,
service/out lap, final lap/finished and disconnected/unavailable. Each should answer
one immediate driver question without shrinking the confirmed typography.

Resolved layout decisions: practice keeps last completed lap largest, with secondary
current-lap feedback. Healthy racing prioritizes current-lap pace and sector deltas
in the support strip. The pit/finish countdown remains the primary race instruction.
Remaining priority is explicit validity/lifecycle/capability states, followed by
unambiguous conditional service advice. These are proposed next mock states, not
implemented live behavior.
