# Lumenforge — Planning & Design Document

> Source of truth for design + progress. If context is lost, resume from here.
> Tech: HTML + CSS + vanilla JS only. No libraries. Plain JS numbers (game is capped at
> `Number.MAX_VALUE` ≈ 1.79e308, which is the "Infinite Light" ending — a natural cap).
> Run it: open `index.html` directly, or serve the folder (`python3 -m http.server 8737`).

## 1. Pitch

You are the last ember of a dead universe. Click the Star to make **Light**, build a chain of
ever-larger fires (each tier produces the tier below — Antimatter-Dimensions style), catch
**comets** (Cookie-Clicker golden cookies), stoke **Heat** by clicking, buy one-off **Upgrades**,
then go **Supernova** for Stardust, light **Constellations**, endure **Trials**, run a **Fusion
Reactor**, and finally **Collapse** into a Black Hole for Dark Matter.
Goal: fill the universe with **Infinite Light** (1.79e308).

## 2. File layout

| File | Purpose |
|---|---|
| `index.html` | DOM skeleton: header, left column (star, buffs, prestige buttons), tabs, modal, toasts |
| `css/style.css` | All styling (space theme, star, heat ring, comets, black hole, responsive ≤1100/≤760px) |
| `js/util.js` | Number formatting (scientific/engineering/short/log), time formatting, helpers |
| `js/data.js` | Static content: GENS, UPGRADES, CONSTELLATIONS, TRIALS, ELEMENTS/PROCESSES, HORIZON, ACHIEVEMENTS, COMETS, NEWS |
| `js/game.js` | State (`S`), derived cache (`D`), formulas, `tick`, purchases, prestige, autobuyers, achievements. **No DOM access** |
| `js/save.js` | localStorage autosave, base64 export/import, defaults-merge on load, offline progress (≤24h) |
| `js/ui.js` | Builds each tab panel once, updates at 10 Hz; star clicks/particles, comets, toasts, modals, tooltips, news, starfield, story |
| `js/main.js` | Boot, 50 ms game loop (wall-clock dt), autosave, hotkeys, prestige confirmations |
| `sim/` | Node balance tools (not loaded by the game): `sim.js`, `ms.sh`, `longrun.js`, `postgame.js`, `trace.js`, `exp.js` |
| `.claude/launch.json` | Dev static server config (port 8737) |

## 3. Layers & mechanics (current numbers)

### Layer 0 — Light (the Kindling)
- **Star click** (mousedown / Space): `(clickMult + LPS·clickPct) × windBuff`. Adds 3 Heat.
- **Heat** 0–100, decays 8%/s (+0.2/s); Light ×`(1 + heat/100·heatPower)`, heatPower base 0.5.
- **Generators** Spark, Ember, Flame, Blaze, Pyre, Sun, Giant, Quasar. Tier 1 → Light, tier k → tier k−1.
  Base costs `[10,100,1e4,1e6,1e9,1e13,1e18,1e24]`, cost step per 10 bought `[1e3,1e4,1e5,1e6,1e8,1e10,1e12,1e8]`.
  Each 10 bought ×`perTen` (2 base). Buy modes ×1 / until-10 / max; Max All (M).
- **Pulse**: cost 1e3·10^n, Light ×`pulseBase^n`, pulseBase 1.18 (+flares, upgrades, He, Trial 3).
- **Ignition**: 20 of the top unlocked tier (4 tiers at start → unlocks next); after 8 tiers 20+10(n−4) Quasars.
  Resets Light/gens/Pulses; Light ×`ignMult^n` (2 base, +Coil/Thermite/Forge/Trial 6/Si).
- **Flare**: 40+20f Quasars (quadratic after 6), resets ignitions too, pulseBase +0.03 each (Lens/Starforge boost).
- **Comets** every 60–150 s (÷ frequency): Starfall (lump of Light), Solar Flare (×7 Light 30 s),
  Stellar Wind (clicks ×50 12 s), Conjunction (3% — +3 free Pulses this run).
- **Light Upgrades** (34, reset on Supernova unless *Remembered Light*). Unlocks are sticky per run (`S.upgSeen`).
- **Achievements** (56): each ×1.03 Light.

### Layer 1 — Supernova → Stardust (SD)
- Requires best Light this run ≥ **1e30**. SD = `floor(2·10^(0.1·x)·mult)`, x = log10(L/1e30),
  softcap: x>30 → 30+(x−30)·0.5; x>70 → 50+(x−70)·0.25. mult: Cosmos ×2, Cosmic Yield, Trial 7 ×3, O, Mass, Dust Lanes.
- Stardust earned (this collapse) → **every generator tier** ×`(1+SDtotal)^0.1`.
- **Constellations** (4 lines bought in order): Hand (active) vs Hearth (idle) are **rivals** (respec on next
  Supernova; *Harmony* removes rivalry), Forge (power), Cosmos (autobuyers, SD gain, keep upgrades, auto-nova).
- **Trials** (unlock at 3 Supernovas, sequential, permanent, replayable): goals 1e30, 1e22, 1e38, 1e45, 1e55, 1e65, 1e80 (≤6 min), 1e100.
- **Fusion Reactor** (6 Supernovas + 100 SD): H→He→C→O→Si→Fe at 4:1. Cores (3 + 1 per 2 trials + Horizon)
  allocated to capture/fusions; capture ∝ (log10 LPS / 20)²; fusion converts 1%/s/core of input. Each element
  held gives a bonus (H per-tier, He pulse, C clicks/heat, O SD, Si ignition, Fe Light). Persist through Supernova.

### Layer 2 — Collapse → Dark Matter (DM)
- Requires Light ≥ **1e100** in a run and **10 Iron**, not in a trial.
  DM = `floor(3·10^((log10 L − 100)/20)·(Fe/10)^0.25)` (`DM_SLOPE` = 20 in game.js).
- Resets SD, constellations (unless remembered), elements/reactor (unless Iron Memory), upgrades.
  Trials, achievements and Mass are kept.
- **Horizon** (15 upgrades, some leveled): Event Memory, Remnant Glow (per-tier ×(1+DMtotal)^0.4), Harmony,
  Reactor Core, Hot Plasma, Dust Lanes, Head Start, Iron Memory, Event Horizon, Dark Bundles, Star Memory,
  Auto-Collapse, Gravitational Lens, Dense Core, The Last Light.
- **Black Hole / Siphon** (after 1st collapse): slider s∈[0,1]; Light gain ^(1−0.25s);
  Mass += s·(log10 rawLPS)²/500 per s (permanent). Mass → SD ×(1+M)^0.4, fusion ×(1+M)^0.2.

### Ending
- Light ≥ 1.79e308 → Infinite Light modal (story), play continues. Final achievement *Eternal Flame*:
  reach Infinite Light 3 times (each endgame run reaches it in minutes).

## 4. Synergy map
- Clicks ↔ LPS (% of LPS); Heat ↔ production; Carbon ↔ clicks/heat; Momentum ↔ click count.
- Ignition ← Silicon/Trial 6; Pulse ← Helium, Flares, Trial 3; SD ← Oxygen, Mass, Trial 7.
- Light → Hydrogen capture → fusion chain → Iron → Collapse/DM → Glow/Hot Plasma → more Light & fusion.
- Siphon trades Light now for Mass forever (SD + fusion) — the main late-game tension.

## 5. Progress checklist
- [x] Planning.md
- [x] util.js, data.js, game.js (headless)
- [x] save.js (autosave 15 s, export/import/copy/download, offline progress, hard reset w/ typed confirm)
- [x] ui.js + index.html + style.css (all 9 tabs, responsive, tooltips, toasts, story modals, ending)
- [x] main.js loop & hotkeys (Space, M, P, I, F, S, C, 1–8)
- [x] Node balance sim + tuning (see §8)
- [x] Browser test pass (all tabs, prestige, trials, reactor, black hole, import/export, offline, ending)
- [x] Final doc update

## 6. Ideas / possible future work
- More Light upgrades in the 1e100–1e300 range; a third prestige layer beyond Infinite Light.
- Sound effects (WebAudio) toggle.

## 7. Decisions log
- Plain numbers instead of a big-number lib: the 1.79e308 ceiling *is* the ending.
- game.js stays DOM-free so `sim/*.js` can `vm`-load util.js + data.js + game.js.
- Toast kinds are prefixed (`t-ach`, …) because `.ach`/`.comet` are also element classes.
- Best-time stats use 1e99 (`NEVER`) instead of Infinity (JSON-safe).

## 8. Balance model (learned from sim — READ before changing numbers)

**Multiplier kinds matter enormously.**
- *Per-tier* multipliers compound through the 8-tier chain: ×10 per tier ≈ +25–30 orders of magnitude of
  Light at a fixed run time. Per-tier: per-10 bundles, tier upgrades, Stardust, Forgefire, Hydrogen,
  Novaborn, Remnant Glow, Chain Reaction, Cascading Fire, Trial 2.
- *Global* multipliers (once, on Light): Pulse, Ignitions, Heat, achievements, comets, Smoldering, Momentum,
  Iron, Last Light… Global ×1e6 ≈ only +5 orders.
- **Never** make anything that scales with Light (pulse, per-10) compound per tier → finite-time blowup.
- Run growth exponent `a ≈ log10(perTen)·Σ1/log10(step_k) + log10(pulseBase)` (× light exponent).
  Early a≈0.47; endgame (Dark Bundles ×3, Trial 5, flares, lens) pushes a→~1 ⇒ runs blow up to
  Infinite Light in minutes. That blow-up *is* the intended climax.
- Pulse cost super-scaling only beyond 250 pulses (a cap at 100 silently stalled the late game).
- Stardust softcaps (1e60, 1e100) make the Supernova layer plateau around ~1e150, so delaying the first
  Collapse is rewarded but bounded (DM slope 15 let a patient first collapse buy the whole Horizon).

**Sim usage**: `node sim/sim.js <hours> <hand|hearth> <cps> [--log=sec] [-v] [--nocollapse] [--ratecol]`,
`sim/ms.sh [hours]` prints milestones for both paths. `sim.js` writes `sim/endstate.json`, used by
`longrun.js` (one long run) and `postgame.js` (Mass/elements grind check).
Bot prestiges when gain ≥ 50% of total (human-like). Greedy "max gain/sec" bots get stuck at the
threshold (local optimum), hence the UI shows Stardust/min and gain previews.

**Current timings (bot, acts every 1 s)**
| Milestone | Active Hand @4cps | Idle Hearth @1cps |
|---|---|---|
| First Supernova | 12 m | 17 m |
| Trial 1 / Trial 8 | 28 m / 1h05 | 35 m / 1h38 |
| Reactor | 43 m | 1h05 |
| First Collapse | 1h09 | 1h39 |
| Infinite Light | 3h08 | 4h35 |
Humans are expected ≈1.3–1.6× slower (≈4–7 h). Unreached by bot only: click-speed/heat achievements,
1-hour run, Dense Matter (needs full siphon ~15 min post-game), Periodic Table (staged-fusion puzzle).
