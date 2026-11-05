# 3D replay rendering fidelity: what the game does

Status: research (2026-11-04), nothing implemented. Goal: make the replay's 3D view look closer to LMU by adopting the game's
own render settings (operators, curves, per-elevation values) instead of tuning by eye. No picture matching (user decision
2026-11-04): the game's values are the reference, and nothing is decoded or exported beyond what a step needs.

Already known from the pipeline (`LMUTrackPipeline/docs/research/SCENERY_MATERIALS.md`): materials, shader families, UV
conventions and the solar position are decoded and reproduced. Lighting, exposure, tone mapping and post-processing are still
"viewer approximations pending matched captures". This review covers that gap.

## Sources read

All installed with the game; decoded locally, never committed or published.

| File | Archive | What it holds |
|---|---|---|
| `PostProcessing.h` | `Core/Shared/coreshaders.mas` | Exposure (manual, or auto from log-average luminance), 8 tone-map operators, bloom, HSV and contrast/brightness grading, optional 1D lookup curve, then gamma 2.2 |
| `IBLShared.h`, `ps30_IBL*.psh` | same | Lighting model: GGX specular with Smith visibility and Schlick Fresnel, a sun-disc term (~1° disc), Disney diffuse, image-based ambient and specular from cubemaps, under-car shadow term, cockpit reflection occlusion from a signed-distance volume |
| `ps30_ambientOcclusion.psh` | same | Screen-space ambient occlusion (ring sampling); on in the user's settings |
| `ScreenSpaceReflection.h`, `ps30_roadReflectionShader.psh` | same | Screen-space reflections and road reflections (wet road, heat mirage) |
| `HDRParamTable.ini` | `Core/Shared/Weather.mas` | Per sun elevation (0–90°, 1° steps): sky luminance, target luminance, white point, air mass, Perez sky coefficient scales, cloud intensity; two tables, *Modified Reinhard* and *Filmic* |
| `SilverLining.config` | same | Sky: SilverLining middleware with Hosek-Wilkie and Preetham sky models, turbidity 3.25, ozone 0.35, SPECTRL2 air mass, sun disc, glare and lens-flare settings, tone-mapping brightness |
| `colorCorrectionCurve.png` | `Core/Shared/` (loose) | 256×2 lookup curve, neutral in colour, an S-curve that brightens mid-tones and clips near 0.81 input |
| Venue `.gdb` / `.scn` / `.wet` | layout archive | Air pollution, haze scales (base, cloudy, storm, dawn), fog height scalars, max shadow range (Fuji 1000 m), weather per session slot (sky type, start time) |

`HDRParamTable.ini`, `SilverLining.config` and the `.fx` sky shaders are text types the pipeline's archive extractor does not
accept yet; they were decoded with its decoder plus a text-only check (scratch script, not committed).

## What the app does today

`sceneEnvironment.ts`: three.js `Sky` (Preetham) with fixed turbidity/Rayleigh/Mie, one sun `DirectionalLight` at intensity
4.0, PMREM of the sky plus a ground disc for ambient and reflections, exponential fog, `NeutralToneMapping` at exposure 0.90.
No ambient occlusion, no screen-space reflections, no bloom, no colour curve, no per-elevation exposure.

## Gaps, largest visual effect first (expected; screenshots decide)

1. **Exposure and tone mapping.** The game exposes per sun elevation (table above, auto-exposure from scene luminance) and
   tone-maps with Modified Reinhard or Filmic (which one is active is not settled: the post shader also has a
   `UseYebisPostProcessing` switch, and the user's settings disable "legacy HDR profiles"), then grades (HSV, contrast,
   lookup curve) and applies gamma 2.2. We use a fixed exposure and three.js's Neutral curve. This drives overall brightness,
   contrast and colour more than any material.
2. **Sky model and sun/sky balance.** Hosek-Wilkie (game) vs Preetham (us), different turbidity, and the game's per-elevation
   sky luminance and Perez scales. Affects the sky colour, the ambient light on everything and the horizon haze.
3. **Ambient occlusion.** The game runs SSAO; we have none. Contact darkening under barriers, in kerb joints and around the
   car is the most visible missing cue after exposure. three.js has a standard pass for it (`GTAOPass`/SSAO in the post
   addons); it costs GPU time, which we have spare (the frame is CPU-bound).
4. **Car grounding.** The game draws a dedicated under-car shadow term; our single sun shadow map gives a softer contact.
   Ties in with the "second shadow map around the car" option already noted in the performance plan.
5. **Reflections.** Static per-area cubemaps, spatial irradiance probes and SSR in the game vs one sky PMREM for us. Matters
   for glass, car paint and wet track; less for dry asphalt.
6. **Bloom, glare, lens flare.** Present in the game (sun glare disabled in the sky config). Small effect in daylight.

## Proposed order

1. Exposure + tone mapping: exposure from the sun elevation table, the game's operator (Modified Reinhard or Filmic) as a
   three.js tone-mapping function, plus the colour curve and gamma 2.2. The values are a few constants copied into the app;
   no new package data.
2. Sky: the game's turbidity, haze and sky luminance values on the existing sky; a Hosek-Wilkie sky only if that is not enough.
3. SSAO through the standard three.js post pass.
4. Car contact shadow, then reflections, if the view still lacks them.

Each step is judged by eye against the game and re-runs `npm run benchmark:replay3d:suite` (p99 must stay < 16 ms).
