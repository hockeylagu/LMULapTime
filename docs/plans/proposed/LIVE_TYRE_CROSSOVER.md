# Wet/dry tyre crossover (proposal)

Proposed 2026-10-26. Not built. Part of the strategy engine: the dashboard shows it and the voice
calls ([LIVE_VOICE_CALLS](LIVE_VOICE_CALLS.md)) speak it.

## Outcome

In changing weather, tell the driver when to box for wets and when to box back for dry tyres,
deterministically, with the reason. Merge the change into a stop already planned when it is close.

## Data we have

- Track: `avgPathWetness`, `maxPathWetness`, `minPathWetness` and LMU's raw `mTrackGripLevel`
  (decoded; the grip level is only logged in diagnostics until its values are mapped to the MFD labels;
  the game's HUD labels, in order, are Green, Low Grip, Medium Grip, High Grip, Saturated Grip
  (`Support/Languages/english.dic`, `#TG_*`), so likely 0-4 in that order; confirmed 2 = Medium (dry Spa)
  and 3 = High (dry Silverstone), 2026-10-27. The grip label shows on a dry track; a wet one shows the wetness label.
  Wetness is 0..1 in steps (seen 0, 0.05, 0.4, 0.6, 1.0; rain itself is continuous); the game's menus show
  `averagePathWetness × 100` as a percent (UI.zip `displayTrackWetness`). In-car labels (driver, Silverstone
  2026-10-27): 0 Dry, 0.05 Damp, 0.4 Wet, 0.6 Very wet, 1.0 Extremely wet; Slightly wet sits between Damp and
  Wet, most likely the 0.125 step seen on 2026-10-16, to confirm in the next wet race (no practice runs for it).
  Damp counts as wet for pace, fuel/VE and learning (`liveTrackWet`, driver decision 2026-10-27).
  `raining`, and the 5-minute wetness trend (`LiveWeather`).
- Forecast: next change to rain or dry, its chance, time and lap (`LiveForecast`).
- Car: compound on the car, the MFD `TIRES:` setting (`New Wet`, `New Medium`), measured wheel slip,
  tyre temperatures, new sets left. Wets are not counted in the tyre allocation, so a wet stop
  never uses a dry set; back to slicks takes a used or new set from the allocation. LMU has no
  intermediates for the driver's classes: the choice is slicks or wets (driver, 2026-10-26).
- Pace: the player's laps in this session with their wetness, and past sessions' laps classified wet
  or dry by layout and class (`lapConditions.ts`).
- Stop cost: pit-lane loss plus the tyre change time, which adds to the refuel time (no free tyres while
  refuelling).

## Rule (first version)

Box for the other compound when the time it saves to the flag (or to the next planned stop) is more
than the stop costs:

`gain = (pace on current tyres - pace on the other tyres) per lap * laps it holds - stop cost`

- Laps it holds: from the forecast and the wetness trend (rain arriving and wetness rising, or the
  rain stopped, the forecast dry and wetness falling).
- Pace on current tyres: measured, the last 2 laps against the dry reference.
- Pace on the other tyres: from history at a similar wetness on this layout and class; until there is
  history, a conservative fixed table by wetness band, labelled as an estimate.
- A stop already planned within ~3 laps takes the change: no extra stop, gain without the stop cost.
- Drying signs that back the switch to dry: `minPathWetness` near zero (a dry line), wets' temperature
  rising past their window, rain at zero for several minutes.

States, with hysteresis so the advice does not flip lap to lap:

| State | Meaning |
|---|---|
| Hold | Current tyres are right for the horizon |
| Window open | The switch pays off soon; prepare the MFD |
| Box now | The switch pays off from this lap |
| Not enough data | No pace for the other tyres and no fixed estimate fits; say so, never guess |

## Dashboard

No new row. The race plan's tyre cell (next stop's tyres) shows the advice:
- `WETS IN ~2 LAPS` (amber) while the window is open, with the reason underneath: `TRACK WET · RAIN 20 MIN`.
- `BOX FOR WETS` (red) when it pays off now; the MFD check turns red when `TIRES:` is not set to wets.
- The same for dry: `SLICKS IN ~3 LAPS`, `BOX FOR SLICKS`.
- The garage checklist uses the same rule for the starting tyre when the forecast changes early.

## Calls

| Call | State | P |
|---|---|---|
| "Wets in 2 laps. Set new wets." | Window open, MFD not on wets | P2 |
| "Box this lap for wets." | Box now | P1 |
| "Slicks in 3 laps. Dry line forming." | Window open for dry | P2 |
| "Box this lap for slicks." | Box now for dry | P1 |
| "Stay out on wets. Rain back in 10 minutes." | Drying but the forecast brings rain back within the horizon | P2 |

## Open points

- The MFD's track condition labels and their wetness values: record them in the next wet session.
- Slick versus wet pace by wetness: one private wet practice (slicks while it gets wetter, then wets)
  gives the first calibration; past wet replays may already give some.
