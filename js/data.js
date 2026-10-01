'use strict';
// Static game content. Effects are implemented in game.js (look up by id);
// functions here only read state lazily (S is defined in game.js).

const GENS = [
  { name: 'Spark',  icon: '✦', base: 10,   step: 1e3,  desc: 'Tiny motes of fire. Produce Light.' },
  { name: 'Ember',  icon: '❋', base: 100,  step: 1e4,  desc: 'Glowing coals. Produce Sparks.' },
  { name: 'Flame',  icon: '🜂', base: 1e4,  step: 1e5,  desc: 'Dancing flames. Produce Embers.' },
  { name: 'Blaze',  icon: '✺', base: 1e6,  step: 1e6,  desc: 'Roaring blazes. Produce Flames.' },
  { name: 'Pyre',   icon: '♨', base: 1e9,  step: 1e8,  desc: 'Funeral pyres of old worlds. Produce Blazes.' },
  { name: 'Sun',    icon: '☀', base: 1e13, step: 1e10, desc: 'Newborn suns. Produce Pyres.' },
  { name: 'Giant',  icon: '◉', base: 1e18, step: 1e12, desc: 'Swollen red giants. Produce Suns.' },
  { name: 'Quasar', icon: '✸', base: 1e24, step: 1e8,  desc: 'Galactic beacons. Produce Giants.' },
];

// ---------- Light upgrades (Cookie-Clicker style, reset on Supernova) ----------
const UPGRADES = [
  { id: 'click1',  name: 'Calloused Fingers', cost: 50,   desc: 'Clicking the Star is twice as effective.', unlock: () => true },
  { id: 'spark',   name: 'Tinderbox',         cost: 300,  desc: 'Sparks are twice as effective.', unlock: () => S.gens[0].bought >= 5 },
  { id: 'warm',    name: 'Warm Touch',        cost: 3e3,  desc: 'Clicks also give 2% of your Light/sec.', unlock: () => S.gens[1].bought >= 1 },
  { id: 'bellows', name: 'Bellows',           cost: 1e4,  desc: 'Heat decays 40% slower.', unlock: () => S.stats.maxHeat >= 30 },
  { id: 'ember',   name: 'Ember Bed',         cost: 5e4,  desc: 'Embers are twice as effective.', unlock: () => S.gens[1].bought >= 10 },
  { id: 'rhythm',  name: 'Steady Rhythm',     cost: 2e5,  desc: 'Pulse multiplier +0.01.', unlock: () => S.pulses >= 2 },
  { id: 'network', name: 'Kindling Network',  cost: 1e6,  desc: 'Sparks gain +3% per Ember bought.', unlock: () => S.gens[1].bought >= 15 },
  { id: 'flame',   name: 'Flame Dance',       cost: 1e7,  desc: 'Flames are twice as effective.', unlock: () => S.gens[2].bought >= 10 },
  { id: 'sear',    name: 'Searing Touch',     cost: 3e7,  desc: 'Clicks give an extra 3% of Light/sec.', unlock: () => S.stats.totalClicks >= 300 },
  { id: 'archive', name: 'Starlit Archive',   cost: 1e8,  desc: 'Production +4% per achievement unlocked.', unlock: () => achCount() >= 6 },
  { id: 'blaze',   name: 'Blaze Feed',        cost: 1e10, desc: 'Blazes are twice as effective.', unlock: () => S.gens[3].bought >= 10 },
  { id: 'lure',    name: 'Comet Lure',        cost: 1e11, desc: 'Comets appear 30% more often.', unlock: () => S.stats.comets >= 1 },
  { id: 'hotcore', name: 'Hot Core',          cost: 1e12, desc: 'Heat bonus +50% (heat power +0.5).', unlock: () => S.stats.maxHeat >= 70 },
  { id: 'pyre',    name: 'Pyre Glow',         cost: 1e15, desc: 'Pyres are twice as effective.', unlock: () => S.gens[4].bought >= 5 },
  { id: 'coil',    name: 'Ignition Coil',     cost: 1e16, desc: 'Each Ignition multiplier +0.25.', unlock: () => S.ignitions >= 2 || S.flares >= 1 },
  { id: 'sun',     name: 'Solar Wind',        cost: 1e18, desc: 'Suns are twice as effective.', unlock: () => S.gens[5].bought >= 5 },
  { id: 'tail',    name: 'Comet Tail',        cost: 1e19, desc: 'Comet effects last 50% longer.', unlock: () => S.stats.comets >= 3 },
  { id: 'giant',   name: 'Giant Strides',     cost: 1e21, desc: 'Giants are twice as effective.', unlock: () => S.gens[6].bought >= 5 },
  { id: 'harmony', name: 'Tenfold Harmony',   cost: 1e22, desc: 'Per-10 multiplier +0.1 for all generators.', unlock: () => S.gens.some(g => g.bought >= 40) },
  { id: 'chain',   name: 'Chain Reaction',    cost: 3e23, desc: 'Generators +10% per Ignition this run.', unlock: () => S.ignitions >= 4 || S.flares >= 1 },
  { id: 'quasar',  name: 'Quasar Lens',       cost: 1e26, desc: 'Quasars are three times as effective.', unlock: () => S.gens[7].bought >= 10 },
  { id: 'heart',   name: 'Heart of the Star', cost: 1e27, desc: 'Clicks give an extra 5% of Light/sec and +1 Heat.', unlock: () => S.stats.totalClicks >= 1000 },
  { id: 'flarelens', name: 'Flare Lens',      cost: 1e28, desc: 'Each Flare adds +0.01 more to the Pulse multiplier.', unlock: () => S.flares >= 1 },
  { id: 'hoard',   name: 'Light Hoard',       cost: 1e30, desc: 'Production × (log₁₀ Light)^0.6.', unlock: () => S.light >= 1e28 },
  // Post-supernova upgrades
  { id: 'echo',    name: 'Nova Echo',         cost: 1e33, desc: 'Production × √(1 + total Supernovas) (max ×25).', unlock: () => S.stats.totalNovas >= 2 },
  { id: 'overdrive', name: 'Overdrive',       cost: 1e38, desc: 'Pulse multiplier +0.02.', unlock: () => S.stats.totalNovas >= 2 && S.pulses >= 20 },
  { id: 'deep',    name: 'Deep Heat',         cost: 1e44, desc: 'Heat decays 50% slower and heat power +0.5.', unlock: () => S.stats.totalNovas >= 3 },
  { id: 'tenfold2', name: 'Resonant Bundles', cost: 1e50, desc: 'Per-10 multiplier +0.1 for all generators.', unlock: () => S.gens.some(g => g.bought >= 120) },
  { id: 'thermite', name: 'Thermite',         cost: 1e56, desc: 'Each Ignition multiplier +0.25.', unlock: () => S.ignitions >= 10 },
  { id: 'feed',    name: 'Stellar Feedstock', cost: 1e60, desc: 'Hydrogen capture ×3.', unlock: () => S.fusion.unlocked },
  { id: 'season',  name: 'Comet Season',      cost: 1e66, desc: 'Comets appear 30% more often.', unlock: () => S.stats.comets >= 20 },
  { id: 'supernal', name: 'Supernal Touch',   cost: 1e72, desc: 'Clicks give an extra 10% of Light/sec.', unlock: () => S.stats.totalClicks >= 5000 },
  { id: 'radiant', name: 'Radiant Core',      cost: 1e85, desc: 'Production × (best Light this run)^0.01.', unlock: () => S.light >= 1e80 },
  { id: 'quasar2', name: 'Twin Quasars',      cost: 1e100, desc: 'Quasars are ten times as effective.', unlock: () => S.gens[7].bought >= 100 },
];
const UPG_BY_ID = {}; UPGRADES.forEach(u => UPG_BY_ID[u.id] = u);

// ---------- Constellations (Stardust shop) ----------
// Each line is bought in order. 'hand' and 'hearth' are rivals.
const CONSTELLATIONS = [
  { id: 'hand', name: 'The Hand', theme: 'Active — clicks, heat & comets', color: '#ff9d5c', rival: 'hearth', stars: [
    { id: 'h1', name: 'Steady Hand',     cost: 1,    desc: 'Clicks ×3 and give +3% of Light/sec.' },
    { id: 'h2', name: "Kindler's Grip",  cost: 4,    desc: 'Heat power +1 (Heat can triple production).' },
    { id: 'h3', name: 'Comet Caller',    cost: 15,   desc: 'Comets appear twice as often.' },
    { id: 'h4', name: 'Momentum',        cost: 80,   desc: 'Each click this run gives +0.2% production (max +200%).' },
    { id: 'h5', name: 'Starfire Fingers', cost: 2e3, desc: 'Solar Flare comets ×15 (was ×7); Stellar Wind ×200 (was ×50).' },
    { id: 'h6', name: 'Wildfire',        cost: 1e6, desc: 'Heat never falls below 75; clicks give +10% of Light/sec.' },
  ]},
  { id: 'hearth', name: 'The Hearth', theme: 'Idle — time, self-stoking', color: '#ffd36e', rival: 'hand', stars: [
    { id: 'e1', name: 'Smoldering',      cost: 1,    desc: 'Production × (1 + minutes this run)^0.5.' },
    { id: 'e2', name: 'Self-Stoking',    cost: 4,    desc: 'The Star clicks itself 2 times per second.' },
    { id: 'e3', name: 'Banked Coals',    cost: 15,   desc: 'Heat never falls below 60.' },
    { id: 'e4', name: 'Patient Flame',   cost: 80,   desc: 'Smoldering exponent 0.5 → 0.75.' },
    { id: 'e5', name: 'Starcatcher',     cost: 2e3,  desc: 'Comets are caught automatically (at full power).' },
    { id: 'e6', name: 'Eternal Hearth',  cost: 1e6, desc: 'Smoldering acts as if each run started 30 minutes earlier; self-stoking ×3.' },
  ]},
  { id: 'forge', name: 'The Forge', theme: 'Raw generator power', color: '#ff6b6b', stars: [
    { id: 'f1', name: 'Forgefire',       cost: 1,    desc: 'All generators ×2 (every tier).' },
    { id: 'f2', name: 'Bundled Flames',  cost: 2,    desc: 'Per-10 multiplier +0.2.' },
    { id: 'f3', name: 'Quickened Pulse', cost: 8,    desc: 'Pulse multiplier +0.015.' },
    { id: 'f4', name: 'Brighter Ignition', cost: 30, desc: 'Each Ignition multiplier +0.5.' },
    { id: 'f5', name: 'Novaborn',        cost: 400,   desc: 'All generators × (1 + Supernovas this collapse)^0.25 (max ×3).' },
    { id: 'f6', name: 'Cascading Fire',  cost: 5e4,  desc: 'Each tier × (1 + log₁₀ of the next tier\'s amount).' },
    { id: 'f7', name: 'Starforge',       cost: 1e8, desc: 'Flares are 50% stronger; Quasars ×10.' },
  ]},
  { id: 'cosmos', name: 'The Cosmos', theme: 'Automation & Stardust', color: '#8fb8ff', stars: [
    { id: 'c1', name: 'Autoforge I',     cost: 1,    desc: 'Unlock autobuyers for Sparks–Blazes.' },
    { id: 'c2', name: 'Autoforge II',    cost: 2,    desc: 'Unlock autobuyers for Pyres–Quasars and Pulse.' },
    { id: 'c3', name: 'Autoforge III',   cost: 5,    desc: 'Unlock auto-Ignite and auto-Flare.' },
    { id: 'c4', name: 'Stellar Yield',   cost: 20,   desc: 'Stardust gain ×2.' },
    { id: 'c5', name: 'Remembered Light', cost: 60,  desc: 'Light upgrades are kept through Supernova.' },
    { id: 'c6', name: 'Auto-Nova',       cost: 150,  desc: 'Unlock the Supernova autobuyer.' },
    { id: 'c7', name: 'Cosmic Yield',    cost: 1e6, desc: 'Stardust gain × (1 + log₁₀ total Stardust).' },
  ]},
];
const STAR_BY_ID = {}; const STAR_LINE = {};
CONSTELLATIONS.forEach(c => c.stars.forEach((s, i) => { STAR_BY_ID[s.id] = s; STAR_LINE[s.id] = { line: c, index: i }; }));

// ---------- Trials (challenges) ----------
const TRIALS = [
  { id: 't1', name: 'Moonless Night', goal: 1e30, desc: 'Clicking and comets are disabled.', reward: 'The Star clicks itself 2×/s, forever.' },
  { id: 't2', name: 'Four Winds',     goal: 1e22, desc: 'Only Sparks–Blazes exist. Ignitions need 20 + 10/ignition Blazes. No Flares.', reward: 'Sparks–Blazes ×3.' },
  { id: 't3', name: 'Flatline',       goal: 1e38, desc: 'Pulse cannot be bought.', reward: 'Pulse multiplier +0.02.' },
  { id: 't4', name: 'Cold Snap',      goal: 1e45, desc: 'Heat is always 0 and Light upgrades cost ×1000.', reward: 'Heat power +1 and Heat never falls below 25.' },
  { id: 't5', name: 'Inflation',      goal: 1e55, desc: 'Generator cost steps are ×10 harsher.', reward: 'Generator cost steps are 10% gentler (exponent ×0.9).' },
  { id: 't6', name: 'Burnout',        goal: 1e65, desc: 'Production halves every 30 seconds since your last Ignition or Flare.', reward: 'Each Ignition multiplier +1.' },
  { id: 't7', name: 'Short Fuse',     goal: 1e80, desc: 'Reach the goal within 6 minutes or the trial restarts.', reward: 'Stardust gain ×3.' },
  { id: 't8', name: 'Dark Sky',       goal: 1e100, desc: 'Light gain is raised to the power 0.8.', reward: 'Light gain is raised to the power 1.02.' },
];
const TRIAL_BY_ID = {}; TRIALS.forEach(t => TRIAL_BY_ID[t.id] = t);

// ---------- Fusion ----------
const ELEMENTS = [
  { sym: 'H',  name: 'Hydrogen', color: '#9ad7ff', eff: 'All generators' },
  { sym: 'He', name: 'Helium',   color: '#ffe48a', eff: 'Pulse multiplier' },
  { sym: 'C',  name: 'Carbon',   color: '#b9b9b9', eff: 'Clicks & heat power' },
  { sym: 'O',  name: 'Oxygen',   color: '#8affc1', eff: 'Stardust gain' },
  { sym: 'Si', name: 'Silicon',  color: '#c79bff', eff: 'Ignition multiplier' },
  { sym: 'Fe', name: 'Iron',     color: '#ff8a7a', eff: 'Production & Dark Matter' },
];
const PROCESSES = [
  { name: 'Capture', desc: 'Pull Hydrogen out of your Light stream' },
  { name: 'H → He', desc: 'Fuse 4 Hydrogen into 1 Helium' },
  { name: 'He → C', desc: 'Fuse 4 Helium into 1 Carbon' },
  { name: 'C → O', desc: 'Fuse 4 Carbon into 1 Oxygen' },
  { name: 'O → Si', desc: 'Fuse 4 Oxygen into 1 Silicon' },
  { name: 'Si → Fe', desc: 'Fuse 4 Silicon into 1 Iron' },
];

// ---------- Horizon (Dark Matter shop) ----------
// cost(level) for leveled upgrades; max = max level.
const HORIZON = [
  { id: 'memory',  name: 'Event Memory',     max: 1,  cost: () => 1,  desc: 'Keep The Cosmos constellation (automation) through Collapse.' },
  { id: 'glow',    name: 'Remnant Glow',     max: 1,  cost: () => 1,  desc: 'All generators × (1 + total Dark Matter)^0.4 (every tier).' },
  { id: 'harmony', name: 'Harmony',          max: 1,  cost: () => 3,  desc: 'The Hand and The Hearth are no longer rivals.' },
  { id: 'core',    name: 'Reactor Core',     max: 5,  cost: l => 3 * Math.pow(4, l), desc: '+1 Reactor core.' },
  { id: 'fuse',    name: 'Hot Plasma',       max: 10, cost: l => 3 * Math.pow(3, l), desc: 'Fusion & capture speed ×2.' },
  { id: 'sd',      name: 'Dust Lanes',       max: 10, cost: l => 3 * Math.pow(4, l), desc: 'Stardust gain ×3.' },
  { id: 'start',   name: 'Head Start',       max: 1,  cost: () => 5,  desc: 'Every run starts with 4 Ignitions and 1e10 Light (not in Trials).' },
  { id: 'ironmem', name: 'Iron Memory',      max: 1,  cost: () => 10,  desc: 'The Reactor stays unlocked through Collapse and Hydrogen capture ×5.' },
  { id: 'horizon', name: 'Event Horizon',    max: 1,  cost: () => 20, desc: 'Siphon penalty 0.25 → 0.12.' },
  { id: 'bundle',  name: 'Dark Bundles',     max: 3,  cost: l => 40 * Math.pow(8, l), desc: 'Per-10 multiplier +0.25.' },
  { id: 'starmem', name: 'Star Memory',      max: 1,  cost: () => 25, desc: 'Keep all constellations through Collapse.' },
  { id: 'autocol', name: 'Auto-Collapse',    max: 1,  cost: () => 60, desc: 'Unlock the Collapse autobuyer.' },
  { id: 'lens',    name: 'Gravitational Lens', max: 3, cost: l => 500 * Math.pow(10, l), desc: 'Light gain is raised to the power +0.01.' },
  { id: 'dense',   name: 'Dense Core',       max: 1,  cost: () => 2000, desc: 'Mass effects are squared... almost (exponents ×1.5).' },
  { id: 'last',    name: 'The Last Light',   max: 1,  cost: () => 1e5, desc: 'Production × 1e20. The universe is almost full.' },
];
const HZ_BY_ID = {}; HORIZON.forEach(h => HZ_BY_ID[h.id] = h);

// ---------- Achievements ----------
// Each achievement: production ×1.03. 'hint' shown when locked.
const ACHIEVEMENTS = [
  // Row 1 — Kindling
  { id: 'a1',  name: 'First Light',       desc: 'Click the Star.', check: () => S.stats.totalClicks >= 1 },
  { id: 'a2',  name: 'Spark of Genius',   desc: 'Buy a Spark.', check: () => S.gens[0].bought >= 1 },
  { id: 'a3',  name: 'Kindling',          desc: 'Buy an Ember.', check: () => S.gens[1].bought >= 1 },
  { id: 'a4',  name: 'Fire Starter',      desc: 'Buy a Flame.', check: () => S.gens[2].bought >= 1 },
  { id: 'a5',  name: 'Blazing Trail',     desc: 'Buy a Blaze.', check: () => S.gens[3].bought >= 1 },
  { id: 'a6',  name: 'Ignition!',         desc: 'Perform an Ignition.', check: () => S.ignitions >= 1 || S.flares >= 1 || S.stats.totalNovas >= 1 },
  { id: 'a7',  name: 'Pyromaniac',        desc: 'Buy a Pyre.', check: () => S.gens[4].bought >= 1 },
  { id: 'a8',  name: 'Clicker Heritage',  desc: 'Click the Star 1,000 times.', check: () => S.stats.totalClicks >= 1000 },
  // Row 2 — Rising
  { id: 'a9',  name: 'Here Comes the Sun', desc: 'Buy a Sun.', check: () => S.gens[5].bought >= 1 },
  { id: 'a10', name: 'Giant Leap',        desc: 'Buy a Giant.', check: () => S.gens[6].bought >= 1 },
  { id: 'a11', name: 'Quasi-Star',        desc: 'Buy a Quasar.', check: () => S.gens[7].bought >= 1 },
  { id: 'a12', name: 'Solar Flare',       desc: 'Perform a Flare.', check: () => S.flares >= 1 || S.stats.totalNovas >= 1 },
  { id: 'a13', name: 'Comet Catcher',     desc: 'Catch a comet.', check: () => S.stats.comets >= 1 },
  { id: 'a14', name: 'White Hot',         desc: 'Reach 100 Heat.', check: () => S.stats.maxHeat >= 99.5 },
  { id: 'a15', name: 'Shopaholic',        desc: 'Own 15 Light upgrades at once.', check: () => Object.keys(S.upgrades).length >= 15 },
  { id: 'a16', name: 'Heartbeat',         desc: 'Buy 25 Pulses in one run.', check: () => S.pulses >= 25 },
  // Row 3 — Supernova
  { id: 'a17', name: 'Supernova!',        desc: 'Go Supernova.', check: () => S.stats.totalNovas >= 1 },
  { id: 'a18', name: 'Stargazer',         desc: 'Light a constellation star.', check: () => Object.keys(S.stars).length >= 1 },
  { id: 'a19', name: 'A Path Chosen',     desc: 'Light the third star of The Hand or The Hearth.', check: () => S.stars.h3 || S.stars.e3 },
  { id: 'a20', name: 'Quick Burn',        desc: 'Go Supernova within 10 minutes of a run.', check: () => S.stats.fastestNova <= 600 },
  { id: 'a21', name: 'Comet Storm',       desc: 'Catch 25 comets.', check: () => S.stats.comets >= 25 },
  { id: 'a22', name: 'Fifty Orders',      desc: 'Reach 1e50 Light.', check: () => S.stats.bestLight >= 1e50 },
  { id: 'a23', name: 'Trial by Fire',     desc: 'Complete a Trial.', check: () => trialCount() >= 1 },
  { id: 'a24', name: 'Look, No Hands',    desc: 'Go Supernova without clicking the Star that run (autoclicks are fine).', check: () => S.flags.noHandsNova },
  // Row 4 — The Reactor
  { id: 'a25', name: 'Novae Decade',      desc: 'Go Supernova 10 times.', check: () => S.stats.totalNovas >= 10 },
  { id: 'a26', name: 'Reactor Online',    desc: 'Unlock the Fusion Reactor.', check: () => S.fusion.unlocked },
  { id: 'a27', name: 'Helium Dreams',     desc: 'Fuse your first Helium.', check: () => S.fusion.el[1] >= 1 },
  { id: 'a28', name: 'Dust Devil',        desc: 'Have 10,000 Stardust.', check: () => S.stardust >= 1e4 },
  { id: 'a29', name: 'Trial Veteran',     desc: 'Complete 4 Trials.', check: () => trialCount() >= 4 },
  { id: 'a30', name: 'Groundless',        desc: 'Go Supernova with at least 1e30 Light without performing a Flare.', check: () => S.flags.flarelessNova },
  { id: 'a31', name: 'Iron Heart',        desc: 'Forge a unit of Iron.', check: () => S.fusion.el[5] >= 1 },
  { id: 'a32', name: 'Trial Master',      desc: 'Complete all 8 Trials.', check: () => trialCount() >= 8 },
  // Row 5 — Collapse
  { id: 'a33', name: 'Event Horizon',     desc: 'Collapse.', check: () => S.stats.collapses >= 1 },
  { id: 'a34', name: 'Into the Dark',     desc: 'Buy a Horizon upgrade.', check: () => Object.keys(S.horizon).length >= 1 },
  { id: 'a35', name: 'Heavyweight',       desc: 'Give the Black Hole 1,000 Mass.', check: () => S.mass >= 1000 },
  { id: 'a36', name: 'Flash in the Pan',  desc: 'Go Supernova within 30 seconds of a run.', check: () => S.stats.fastestNova <= 30 },
  { id: 'a37', name: 'Googol',            desc: 'Reach 1e100 Light.', check: () => S.stats.bestLight >= 1e100 },
  { id: 'a38', name: 'Harmonic',          desc: 'Light every star of both The Hand and The Hearth.', check: () => S.stars.h6 && S.stars.e6 },
  { id: 'a39', name: 'Centennial Novae',  desc: 'Go Supernova 100 times in total.', check: () => S.stats.totalNovas >= 100 },
  { id: 'a40', name: 'Swift Collapse',    desc: 'Collapse within 45 minutes of the previous Collapse.', check: () => S.stats.fastestCollapse <= 2700 },
  // Row 6 — Toward Infinity
  { id: 'a41', name: 'Full Reactor',      desc: 'Have 10 Reactor cores.', check: () => totalCores() >= 10 },
  { id: 'a42', name: 'Periodic Table',    desc: 'Hold at least 1e6 of every element at once.', check: () => S.fusion.el.every(x => x >= 1e6) },
  { id: 'a43', name: 'Bicentennial',      desc: 'Reach 1e200 Light.', check: () => S.stats.bestLight >= 1e200 },
  { id: 'a44', name: 'Dark Hoard',        desc: 'Have 1,000 Dark Matter.', check: () => S.darkMatter >= 1000 },
  { id: 'a45', name: 'Stellar Constellation', desc: 'Light every constellation star.', check: () => CONSTELLATIONS.every(c => c.stars.every(s => S.stars[s.id])) },
  { id: 'a46', name: 'Quarter Millennium', desc: 'Reach 1e250 Light.', check: () => S.stats.bestLight >= 1e250 },
  { id: 'a47', name: 'Infinite Light',    desc: 'Fill the universe with Light (1.79e308).', check: () => S.stats.infinite >= 1 },
  { id: 'a48', name: 'Eternal Flame',     desc: 'Reach Infinite Light 3 times.', check: () => S.stats.infinite >= 3 },
  // Secret-ish / fun (row 7)
  { id: 'a49', name: 'Frenzied Fingers',  desc: 'Click the Star 15 times in one second.', check: () => S.flags.fastClicks },
  { id: 'a50', name: 'Lucky Alignment',   desc: 'Catch a Conjunction comet.', check: () => S.flags.conjunction },
  { id: 'a51', name: 'Century Heartbeat',   desc: 'Have 100 Pulses at once.', check: () => S.pulses >= 100 },
  { id: 'a52', name: 'Dense Matter',      desc: 'Give the Black Hole 100,000 Mass.', check: () => S.mass >= 1e5 },
  { id: 'a53', name: 'Overpopulated',     desc: 'Buy 500 of a single generator in one run.', check: () => S.gens.some(g => g.bought >= 500) },
  { id: 'a54', name: 'Stoked',            desc: 'Hold 100 Heat for 30 seconds straight.', check: () => S.flags.heatHold },
  { id: 'a55', name: 'Clean Slate',       desc: 'Complete Short Fuse in under 3 minutes.', check: () => S.flags.fastFuse },
  { id: 'a56', name: 'Patient Star',      desc: 'Go Supernova after a run lasting 1 hour or more.', check: () => S.flags.patientNova },
];
const ACH_BY_ID = {}; ACHIEVEMENTS.forEach(a => ACH_BY_ID[a.id] = a);

// ---------- Comets ----------
const COMETS = [
  { id: 'starfall', name: 'Starfall',    weight: 50, desc: 'A shower of Light!' },
  { id: 'flare',    name: 'Solar Flare', weight: 35, desc: 'Production multiplied for 30 seconds.' },
  { id: 'wind',     name: 'Stellar Wind', weight: 12, desc: 'Clicks multiplied for 12 seconds.' },
  { id: 'conj',     name: 'Conjunction', weight: 3,  desc: '+3 free Pulses for this run.' },
];

// ---------- News ticker ----------
const NEWS = [
  { t: 'The universe is cold. The universe is dark. The universe has, apparently, been waiting for you.', c: () => true },
  { t: 'Local void reports a "weird warm feeling". Experts baffled.', c: () => true },
  { t: 'Tip: every 10 of a generator doubles its output. Buy in tens!', c: () => S.stats.bestLight < 1e6 },
  { t: 'Tip: catching comets is the fastest way to get ahead early.', c: () => S.stats.comets < 3 },
  { t: 'A Spark asks an Ember where Sparks come from. The Ember changes the subject.', c: () => S.gens[1].bought > 0 },
  { t: 'Flames union demands better working conditions. Embers unimpressed: "you work at 1,000 degrees, we work at 800."', c: () => S.gens[2].bought > 0 },
  { t: 'Tip: Ignition resets your fires but unlocks a new tier and doubles everything.', c: () => S.ignitions === 0 && S.stats.totalNovas === 0 },
  { t: 'Breaking: Sun discovers it is "just a very large Pyre". Existential crisis ongoing.', c: () => S.gens[5].bought > 0 },
  { t: 'Giant refuses to be called "red". "I am merely sunburnt."', c: () => S.gens[6].bought > 0 },
  { t: 'Quasar sues galaxy for noise complaints.', c: () => S.gens[7].bought > 0 },
  { t: 'Tip: Flares reset Ignitions but permanently strengthen every Pulse.', c: () => S.flares === 0 && S.gens[7].bought > 0 },
  { t: 'Astronomers (there are none yet) would describe your star as "aggressively bright".', c: () => S.stats.bestLight > 1e15 },
  { t: 'The Star is getting heavy. It may soon want to explode. Let it.', c: () => S.stats.bestLight > 1e22 && S.stats.totalNovas === 0 },
  { t: 'Stardust settles on everything. You are, quite literally, made of it now.', c: () => S.stats.totalNovas > 0 },
  { t: 'Constellation of "The Hand" spotted making rude gestures at "The Hearth".', c: () => S.stats.totalNovas > 0 },
  { t: 'Tip: The Hand rewards clicking; The Hearth rewards patience. Respec is free on Supernova.', c: () => S.stats.totalNovas > 0 && S.stats.totalNovas < 5 },
  { t: 'Trial participants report "extremely unfair conditions". Rewards described as "worth it".', c: () => S.stats.totalNovas >= 3 },
  { t: 'Reactor safety inspector found fused into a small carbon sculpture.', c: () => S.fusion.unlocked },
  { t: 'Tip: you rarely have enough cores to run every fusion at once. Shuffle them!', c: () => S.fusion.unlocked && !S.stats.collapses },
  { t: 'Iron: the element stars die making. Handle with reverence.', c: () => S.fusion.el[5] > 0 },
  { t: 'Physics department finally hired. Immediately resigns after seeing your Light count.', c: () => S.stats.bestLight > 1e60 },
  { t: 'The Black Hole hums a little tune. It is the sound of everything, very slowly.', c: () => S.stats.collapses > 0 },
  { t: 'Tip: the Siphon trades Light now for Mass forever. Mass boosts Stardust and fusion.', c: () => S.stats.collapses > 0 && S.mass < 100 },
  { t: 'Dark Matter accounts for 85% of the universe\'s mass and 100% of its confusion.', c: () => S.stats.collapses > 0 },
  { t: 'Universe running out of room for zeroes. Please write smaller.', c: () => S.stats.bestLight > 1e200 },
  { t: 'You are approaching the edge of what can be counted.', c: () => S.stats.bestLight > 1e280 && !S.stats.infinite },
  { t: 'The universe is full. It is warm. It is bright. Thank you.', c: () => S.stats.infinite > 0 },
  { t: 'Somewhere, a moth is very, very happy.', c: () => S.stats.bestLight > 1e9 },
  { t: 'Comet insists it was "just passing through". Has been caught ' + '{comets}' + ' times.', c: () => S.stats.comets > 5 },
  { t: 'Weather forecast: 100% chance of light, scattered supernovae.', c: () => S.stats.totalNovas > 2 },
  { t: 'Clicking the Star is free cardio. You\'re welcome.', c: () => S.stats.totalClicks > 200 },
  { t: 'Heat death of the universe postponed indefinitely due to your efforts.', c: () => S.stats.bestLight > 1e40 },
];
