'use strict';
// Core game logic. NO DOM ACCESS in this file (it is loaded headless by sim/sim.js).

const SN_REQ = 1e30;          // Light needed for Supernova
const COLLAPSE_REQ = 1e100;   // Light needed for Collapse (plus Iron)
const COLLAPSE_IRON = 10;
const DM_SLOPE = 20;          // orders of magnitude of Light per ×10 Dark Matter
const INF_LIGHT = 1.79e308;   // The ending
const FUSION_UNLOCK_COST = 100;
const FUSION_UNLOCK_NOVAS = 6;
const TRIAL_UNLOCK_NOVAS = 3;
const NEVER = 1e99;           // JSON-safe "infinity" for best-time stats

let S = null;      // game state (saved)
const D = {        // derived values, recomputed every tick (not saved)
  prod: new Array(8).fill(0), genMult: new Array(8).fill(1),
};

// ---------- tiny event bus (UI subscribes; headless sim ignores) ----------
const Events = {
  handlers: {},
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
  emit(type, data) { (this.handlers[type] || []).forEach(fn => fn(data)); },
};
function notify(text, kind) { Events.emit('notify', { text, kind: kind || 'info' }); }

function newState() {
  return {
    version: 1,
    light: 10,
    gens: GENS.map(() => ({ amount: 0, bought: 0 })),
    pulses: 0, freePulses: 0,
    ignitions: 0, flares: 0,
    heat: 0, autoClickAcc: 0,
    upgrades: {}, upgSeen: {},
    run: newRun(10),
    novas: 0, stardust: 0, sdTotal: 0,
    stars: {}, respec: false,
    auto: {
      g: [true, true, true, true, true, true, true, true], pulse: true, ignite: true, flare: true,
      flareLimit: 0, // 0 = unlimited
      nova: false, novaMode: 'gain', novaValue: 10,
      collapse: false, collapseValue: 1,
    },
    trial: null, trials: {},
    fusion: { unlocked: false, el: [0, 0, 0, 0, 0, 0], cores: [0, 0, 0, 0, 0, 0] },
    darkMatter: 0, dmTotal: 0, horizon: {}, mass: 0, siphon: 0,
    comet: { next: 45, flare: 0, wind: 0 },
    achievements: {},
    stats: {
      totalClicks: 0, comets: 0, maxHeat: 0, totalNovas: 0, collapses: 0,
      fastestNova: NEVER, fastestCollapse: NEVER, bestLight: 10, infinite: 0,
      playTime: 0, collapseTime: 0, lifetimeLight: 0, heatHold: 0,
    },
    flags: {},
    settings: { notation: 'scientific', offline: true, news: true, confirmNova: true, confirmCollapse: true, particles: true, autosave: 15 },
    endingSeen: false,
    lastSave: Date.now(),
  };
}

function newRun(startLight) {
  return { time: 0, clicks: 0, best: startLight, sinceBoost: 0, flared: false, inf: false };
}

// ---------- small queries ----------
function hasU(id) { return !!S.upgrades[id]; }
function hasStar(id) { return !!S.stars[id]; }
function hz(id) { return S.horizon[id] || 0; }
function inTrial(id) { return S.trial === id; }
function trialDone(id) { return !!S.trials[id]; }
function trialCount() { return Object.keys(S.trials).length; }
function achCount() { return Object.keys(S.achievements).length; }
function totalCores() { return 3 + Math.floor(trialCount() / 2) + hz('core'); }
function usedCores() { return S.fusion.cores.reduce((a, b) => a + b, 0); }
function unlockedTiers() { return inTrial('t2') ? 4 : Math.min(8, 4 + S.ignitions); }
function trialsUnlocked() { return S.stats.totalNovas >= TRIAL_UNLOCK_NOVAS; }
function fusionVisible() { return S.fusion.unlocked || S.stats.totalNovas >= FUSION_UNLOCK_NOVAS; }
function blackHoleUnlocked() { return S.stats.collapses >= 1; }
function startLight() { return (hz('start') && !S.trial) ? 1e10 : 10; }
function startIgnitions() { return (hz('start') && !S.trial) ? 4 : 0; }

// ---------- element & mass effects ----------
function elH() { return Math.pow(1 + S.fusion.el[0], 0.05); }
function elHe() { return 0.01 * log10(1 + S.fusion.el[1]); }
function elCclick() { return Math.pow(1 + S.fusion.el[2], 0.5); }
function elCheat() { return 0.25 * log10(1 + S.fusion.el[2]); }
function elO() { return Math.pow(1 + S.fusion.el[3], 0.15); }
function elSi() { return 0.2 * log10(1 + S.fusion.el[4]); }
function elFe() { return Math.pow(1 + S.fusion.el[5], 0.3); }
function massExp() { return hz('dense') ? 1.5 : 1; }
function massSD() { return Math.pow(1 + S.mass, 0.4 * massExp()); }
function massFuse() { return Math.pow(1 + S.mass, 0.2 * massExp()); }

// ---------- multipliers ----------
function perTen() {
  return 2 + (hasU('harmony') ? 0.1 : 0) + (hasU('tenfold2') ? 0.1 : 0) + (hasStar('f2') ? 0.2 : 0) + 0.25 * hz('bundle');
}
function ignitionMult() {
  return 2 + (hasU('coil') ? 0.25 : 0) + (hasU('thermite') ? 0.25 : 0) + (hasStar('f4') ? 0.5 : 0) +
    (trialDone('t6') ? 1 : 0) + elSi();
}
function flareStrength() {
  return (0.03 + (hasU('flarelens') ? 0.01 : 0)) * (hasStar('f7') ? 1.5 : 1);
}
function pulseBase() {
  return 1.18 + S.flares * flareStrength() + (hasU('rhythm') ? 0.01 : 0) + (hasU('overdrive') ? 0.02 : 0) +
    (hasStar('f3') ? 0.015 : 0) + (trialDone('t3') ? 0.02 : 0) + elHe();
}
function heatPower() {
  return 0.5 + (hasU('hotcore') ? 0.5 : 0) + (hasU('deep') ? 0.5 : 0) + (hasStar('h2') ? 1 : 0) +
    (trialDone('t4') ? 1 : 0) + elCheat();
}
function heatFloor() {
  if (inTrial('t4')) return 0;
  let f = 0;
  if (trialDone('t4')) f = 25;
  if (hasStar('e3')) f = Math.max(f, 60);
  if (hasStar('h6')) f = Math.max(f, 75);
  return f;
}
function heatDecay() { return 0.08 * (hasU('bellows') ? 0.6 : 1) * (hasU('deep') ? 0.5 : 1); }
function heatPerClick() { return 3 + (hasU('heart') ? 1 : 0); }
function cometFreq() {
  return (hasU('lure') ? 1.3 : 1) * (hasU('season') ? 1.3 : 1) * (hasStar('h3') ? 2 : 1);
}
function cometDuration() { return hasU('tail') ? 1.5 : 1; }
function flareBuffMult() { return hasStar('h5') ? 15 : 7; }
function windBuffMult() { return hasStar('h5') ? 200 : 50; }
function smolderMult() {
  if (!hasStar('e1')) return 1;
  const mins = (S.run.time + (hasStar('e6') ? 1800 : 0)) / 60;
  return Math.pow(1 + mins, hasStar('e4') ? 0.75 : 0.5);
}
function momentumMult() { return hasStar('h4') ? 1 + Math.min(2, 0.002 * S.run.clicks) : 1; }
function autoClickRate() {
  if (inTrial('t1')) return 0;
  return (hasStar('e2') ? 2 * (hasStar('e6') ? 3 : 1) : 0) + (trialDone('t1') ? 2 : 0);
}
function sdMultBase() {
  return (hasStar('c4') ? 2 : 1) * (hasStar('c7') ? 1 + log10(1 + S.sdTotal) : 1) * (trialDone('t7') ? 3 : 1) *
    elO() * massSD() * Math.pow(3, hz('sd'));
}
function siphonPenalty() { return hz('horizon') ? 0.12 : 0.25; }
function fusionSpeed() { return Math.pow(2, hz('fuse')) * massFuse(); }

// Global production multiplier, with a breakdown for the stats screen.
function globalMultParts() {
  const p = [];
  p.push(['Achievements', Math.pow(1.03, achCount())]);
  p.push(['Heat', 1 + S.heat / 100 * heatPower()]);
  if (hasU('archive')) p.push(['Starlit Archive', 1 + 0.04 * achCount()]);
  if (hasU('hoard') && S.light > 10) p.push(['Light Hoard', Math.pow(log10(S.light), 0.6)]);
  if (hasU('echo')) p.push(['Nova Echo', Math.min(25, Math.sqrt(1 + S.stats.totalNovas))]);
  if (hasU('radiant')) p.push(['Radiant Core', Math.pow(Math.max(1, S.run.best), 0.01)]);
  if (S.comet.flare > 0) p.push(['Solar Flare', flareBuffMult()]);
  if (S.fusion.el[5] > 0) p.push(['Iron', elFe()]);
  if (hz('last')) p.push(['The Last Light', 1e20]);
  if (hasStar('h4')) p.push(['Momentum', momentumMult()]);
  if (hasStar('e1')) p.push(['Smoldering', smolderMult()]);
  if (inTrial('t6')) p.push(['Burnout', Math.pow(0.5, S.run.sinceBoost / 30)]);
  return p;
}

// Per-tier multipliers compound through the generator chain, so they are the strongest kind.
function tierMultParts() {
  const p = [];
  if (S.sdTotal > 0) p.push(['Stardust', sdTierMult()]);
  if (hasStar('f1')) p.push(['Forgefire', 2]);
  if (S.fusion.el[0] > 0) p.push(['Hydrogen', elH()]);
  if (hasStar('f5')) p.push(['Novaborn', novabornMult()]);
  if (hz('glow')) p.push(['Remnant Glow', glowMult()]);
  return p;
}
function glowMult() { return Math.pow(1 + S.dmTotal, 0.4); }
function sdTierMult() { return Math.pow(1 + S.sdTotal, 0.1); }
function novabornMult() { return Math.min(3, Math.pow(1 + S.novas, 0.25)); }
function tierMult(k) {
  let m = D.tierShared || 1;
  const doublers = ['spark', 'ember', 'flame', 'blaze', 'pyre', 'sun', 'giant'];
  if (k < 7 && hasU(doublers[k])) m *= 2;
  if (k === 7) {
    if (hasU('quasar')) m *= 3;
    if (hasU('quasar2')) m *= 10;
    if (hasStar('f7')) m *= 10;
  }
  if (k === 0 && hasU('network')) m *= 1 + 0.03 * S.gens[1].bought;
  if (k < 4 && trialDone('t2')) m *= 3;
  if (hasU('chain')) m *= 1 + 0.1 * S.ignitions;
  if (hasStar('f6') && k < 7) m *= 1 + log10(1 + S.gens[k + 1].amount);
  return m;
}

function lightExponent() {
  let e = 1;
  if (inTrial('t8')) e *= 0.8;
  if (trialDone('t8')) e *= 1.02;
  e += 0.01 * hz('lens');
  if (blackHoleUnlocked() && S.siphon > 0) e *= 1 - siphonPenalty() * S.siphon;
  return e;
}

function recompute() {
  let g = 1;
  const parts = globalMultParts();
  for (const [, v] of parts) g *= v;
  D.globalParts = parts;
  D.global = safe(g);
  let ts = 1;
  D.tierParts = tierMultParts();
  for (const [, v] of D.tierParts) ts *= v;
  D.tierShared = safe(ts);
  D.perTen = perTen();
  D.ignMult = ignitionMult();
  D.pulseBase = pulseBase();
  D.pulseMult = safe(Math.pow(D.pulseBase, S.pulses + S.freePulses));
  const ignPow = Math.pow(D.ignMult, S.ignitions);
  const tiers = unlockedTiers();
  for (let k = 0; k < 8; k++) {
    // Per-tier multipliers compound through the chain; the global multiplier applies once, to Light.
    const m = Math.pow(D.perTen, Math.floor(S.gens[k].bought / 10)) * tierMult(k) * (k === 0 ? D.global * ignPow * D.pulseMult : 1);
    D.genMult[k] = safe(m);
    D.prod[k] = k < tiers || S.gens[k].amount > 0 ? safe(S.gens[k].amount * m) : 0;
  }
  D.rawLps = D.prod[0];
  D.lightExp = lightExponent();
  D.lps = D.rawLps > 1 ? safe(Math.pow(D.rawLps, D.lightExp)) : D.rawLps;
  // clicks
  let cm = (hasU('click1') ? 2 : 1) * (hasStar('h1') ? 3 : 1) * elCclick();
  const pct = (hasU('warm') ? 0.02 : 0) + (hasU('sear') ? 0.03 : 0) + (hasU('heart') ? 0.05 : 0) +
    (hasU('supernal') ? 0.10 : 0) + (hasStar('h1') ? 0.03 : 0) + (hasStar('h6') ? 0.10 : 0);
  D.clickPct = pct;
  D.clickValue = safe((cm + D.lps * pct) * (S.comet.wind > 0 ? windBuffMult() : 1));
  D.autoClick = autoClickRate();
  D.sdGain = sdGain();
  D.dmGain = dmGain();
}

// ---------- costs ----------
function genStep(k) {
  let s = GENS[k].step;
  if (inTrial('t5')) s *= 10;
  if (trialDone('t5')) s = Math.pow(s, 0.9);
  return s;
}
function genCost(k) { return GENS[k].base * Math.pow(genStep(k), Math.floor(S.gens[k].bought / 10)); }
function pulseCost() { return 1e3 * Math.pow(10, S.pulses) * (S.pulses > 250 ? Math.pow(10, (S.pulses - 250) * (S.pulses - 249) / 20) : 1); }
function upgradeCost(u) { return u.cost * (inTrial('t4') ? 1000 : 1); }

// ---------- purchases ----------
function canBuyGen(k) { return k < unlockedTiers() && S.light >= genCost(k); }
function buyGen(k, mode) {
  // mode: 'one' | 'ten' (until next 10) | 'max'
  if (k >= unlockedTiers()) return 0;
  let bought = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const c = genCost(k);
    if (S.light < c) break;
    const toTen = 10 - (S.gens[k].bought % 10);
    let n = Math.min(toTen, Math.floor(S.light / c));
    if (mode === 'one') n = 1;
    else if (mode === 'ten' && n < toTen) break; // only complete bundles in 'ten' mode
    S.light -= n * c;
    if (S.light < 0) S.light = 0;
    S.gens[k].bought += n; S.gens[k].amount += n;
    bought += n;
    if (mode !== 'max') break;
  }
  return bought;
}
function canBuyPulse() { return !inTrial('t3') && S.light >= pulseCost(); }
function buyPulse(max) {
  let n = 0;
  while (canBuyPulse()) {
    S.light -= pulseCost(); S.pulses++; n++;
    if (!max || n > 500) break;
  }
  return n;
}
function maxAll() {
  for (let k = unlockedTiers() - 1; k >= 0; k--) buyGen(k, 'max');
  buyPulse(true);
}
// Unlocks are sticky for the rest of the run so upgrades never flicker in and out of the shop.
function upgUnlocked(u) {
  if (S.upgSeen[u.id]) return true;
  let ok = false;
  try { ok = !!u.unlock(); } catch (e) { ok = false; }
  if (ok) S.upgSeen[u.id] = true;
  return ok;
}
function upgradeVisible(u) { return S.upgrades[u.id] || upgUnlocked(u); }
function buyUpgrade(id) {
  const u = UPG_BY_ID[id];
  if (!u || S.upgrades[id] || !upgUnlocked(u)) return false;
  const c = upgradeCost(u);
  if (S.light < c) return false;
  S.light -= c; S.upgrades[id] = true;
  return true;
}
function buyAllUpgrades() {
  const list = UPGRADES.filter(u => !S.upgrades[u.id] && upgUnlocked(u)).sort((a, b) => a.cost - b.cost);
  let n = 0;
  for (const u of list) if (buyUpgrade(u.id)) n++;
  return n;
}

// ---------- ignition & flare ----------
function ignitionReq() {
  if (inTrial('t2')) return { tier: 3, amount: 20 + 10 * S.ignitions };
  const n = S.ignitions;
  return { tier: Math.min(7, 3 + n), amount: n < 4 ? 20 : 20 + 10 * (n - 4) };
}
function canIgnite() { const r = ignitionReq(); return S.gens[r.tier].bought >= r.amount; }
function flareReq() {
  const f = S.flares;
  return 40 + 20 * f + (f >= 6 ? 10 * (f - 5) * (f - 5) : 0) + (f >= 20 ? Math.pow(1.15, f - 19) * 100 : 0);
}
function canFlare() { return !inTrial('t2') && S.gens[7].bought >= Math.floor(flareReq()); }

function softReset() {
  S.light = startLight();
  S.gens.forEach(g => { g.amount = 0; g.bought = 0; });
  S.pulses = 0;
  S.run.sinceBoost = 0;
}
function ignite() {
  if (!canIgnite()) return false;
  S.ignitions++;
  softReset();
  return true;
}
function flare() {
  if (!canFlare()) return false;
  S.flares++;
  S.ignitions = startIgnitions();
  S.run.flared = true;
  softReset();
  return true;
}

// ---------- supernova ----------
function novaGoal() { return S.trial ? TRIAL_BY_ID[S.trial].goal : SN_REQ; }
function canSupernova() { return S.run.best >= novaGoal(); }
function sdGain() {
  const L = S.run.best;
  if (L < SN_REQ) return S.trial && L >= novaGoal() ? 1 : 0;
  let x = log10(L / SN_REQ);
  if (x > 70) x = 50 + (x - 70) * 0.25; // second softcap past 1e100
  else if (x > 30) x = 30 + (x - 30) * 0.5; // softcap past 1e60
  return Math.max(1, Math.floor(2 * Math.pow(10, 0.1 * x) * sdMultBase()));
}
function resetRun() {
  S.light = startLight();
  S.gens.forEach(g => { g.amount = 0; g.bought = 0; });
  S.pulses = 0; S.freePulses = 0;
  S.ignitions = startIgnitions(); S.flares = 0;
  S.heat = 0;
  if (!hasStar('c5')) { S.upgrades = {}; S.upgSeen = {}; }
  S.run = newRun(S.light);
}
function supernova() {
  if (!canSupernova()) return false;
  const gain = D.sdGain = sdGain();
  if (S.trial) {
    const t = TRIAL_BY_ID[S.trial];
    if (!S.trials[t.id]) notify('Trial complete: ' + t.name + '! Reward: ' + t.reward, 'good');
    S.trials[t.id] = true;
    if (t.id === 't7' && S.run.time <= 180) S.flags.fastFuse = true;
    S.trial = null;
  }
  S.stardust += gain; S.sdTotal += gain;
  S.novas++; S.stats.totalNovas++;
  S.stats.fastestNova = Math.min(S.stats.fastestNova, S.run.time);
  if (S.run.clicks === 0) S.flags.noHandsNova = true;
  if (!S.run.flared && S.run.best >= 1e30) S.flags.flarelessNova = true;
  if (S.run.time >= 3600) S.flags.patientNova = true;
  if (S.respec) doRespec();
  resetRun();
  Events.emit('supernova', gain);
  return true;
}
function trialAvailable(id) {
  const i = TRIALS.findIndex(t => t.id === id);
  return trialsUnlocked() && (i === 0 || trialDone(TRIALS[i - 1].id));
}
function enterTrial(id) {
  if (!trialAvailable(id) || S.trial) return false;
  S.trial = id;
  resetRun();
  return true;
}
function exitTrial() {
  if (!S.trial) return;
  S.trial = null;
  resetRun();
}

// ---------- constellations ----------
function starState(id) {
  // 'owned' | 'available' | 'locked' | 'rival'
  if (S.stars[id]) return 'owned';
  const { line, index } = STAR_LINE[id];
  if (index > 0 && !S.stars[line.stars[index - 1].id]) return 'locked';
  if (line.rival && !hz('harmony')) {
    const rival = CONSTELLATIONS.find(c => c.id === line.rival);
    if (rival.stars.some(s => S.stars[s.id])) return 'rival';
  }
  return 'available';
}
function buyStar(id) {
  if (starState(id) !== 'available') return false;
  const s = STAR_BY_ID[id];
  if (S.stardust < s.cost) return false;
  S.stardust -= s.cost; S.stars[id] = true;
  return true;
}
function doRespec() {
  ['hand', 'hearth'].forEach(lid => {
    const line = CONSTELLATIONS.find(c => c.id === lid);
    line.stars.forEach(s => { if (S.stars[s.id]) { delete S.stars[s.id]; S.stardust += s.cost; } });
  });
  S.respec = false;
  notify('The Hand and The Hearth have been reset. Stardust refunded.', 'info');
}

// ---------- fusion ----------
function canUnlockFusion() { return !S.fusion.unlocked && S.stats.totalNovas >= FUSION_UNLOCK_NOVAS && S.stardust >= FUSION_UNLOCK_COST; }
function unlockFusion() {
  if (!canUnlockFusion()) return false;
  S.stardust -= FUSION_UNLOCK_COST; S.fusion.unlocked = true;
  return true;
}
function captureRate() {
  const l = log10(1 + D.lps || 0) / 20;
  return l * l * (hasU('feed') ? 3 : 1) * (hz('ironmem') ? 5 : 1) * fusionSpeed();
}
function fusionRate(i) { return 0.01 * S.fusion.cores[i] * fusionSpeed(); }
function setCores(i, n) {
  n = Math.max(0, Math.floor(n));
  const others = usedCores() - S.fusion.cores[i];
  S.fusion.cores[i] = Math.min(n, totalCores() - others);
}
function fusionTick(dt) {
  const f = S.fusion, el = f.el;
  if (!f.unlocked) return;
  // clamp allocation if total cores shrank
  while (usedCores() > totalCores()) { const i = f.cores.findIndex(c => c > 0); f.cores[i]--; }
  el[0] += f.cores[0] * captureRate() * dt;
  for (let i = 1; i < 6; i++) {
    if (f.cores[i] <= 0 || el[i - 1] <= 0) continue;
    const conv = el[i - 1] * (1 - Math.exp(-fusionRate(i) * dt));
    el[i - 1] -= conv; el[i] += conv / 4;
  }
}

// ---------- collapse ----------
function canCollapse() { return !S.trial && S.run.best >= COLLAPSE_REQ && S.fusion.el[5] >= COLLAPSE_IRON; }
function dmGain() {
  if (S.run.best < COLLAPSE_REQ || S.fusion.el[5] < COLLAPSE_IRON) return 0;
  return Math.floor(3 * Math.pow(10, (log10(S.run.best) - 100) / DM_SLOPE) * Math.pow(S.fusion.el[5] / COLLAPSE_IRON, 0.25));
}
function collapse() {
  if (!canCollapse()) return false;
  const gain = dmGain();
  S.darkMatter += gain; S.dmTotal += gain;
  S.stats.collapses++;
  S.stats.fastestCollapse = Math.min(S.stats.fastestCollapse, S.stats.collapseTime);
  S.stats.collapseTime = 0;
  S.stardust = 0; S.sdTotal = 0; S.novas = 0; S.respec = false;
  const kept = {};
  for (const id in S.stars) {
    const line = STAR_LINE[id].line.id;
    if (hz('starmem') || (hz('memory') && line === 'cosmos')) kept[id] = true;
  }
  S.stars = kept;
  S.fusion.el = [0, 0, 0, 0, 0, 0];
  if (!hz('ironmem')) S.fusion.unlocked = false;
  S.trial = null;
  S.upgrades = {}; S.upgSeen = {};
  resetRun();
  Events.emit('collapse', gain);
  return true;
}

// ---------- horizon ----------
function hzCost(id) { const h = HZ_BY_ID[id]; return h.cost(hz(id)); }
function buyHorizon(id) {
  const h = HZ_BY_ID[id];
  if (!h || hz(id) >= h.max) return false;
  const c = hzCost(id);
  if (S.darkMatter < c) return false;
  S.darkMatter -= c; S.horizon[id] = hz(id) + 1;
  return true;
}

// ---------- clicking & comets ----------
let clickTimes = [];
function clickStar(now) {
  if (inTrial('t1')) return 0;
  const v = D.clickValue;
  gainLight(v);
  S.run.clicks++; S.stats.totalClicks++;
  addHeat(heatPerClick());
  if (now !== undefined) {
    clickTimes.push(now);
    while (clickTimes.length && now - clickTimes[0] > 1000) clickTimes.shift();
    if (clickTimes.length >= 15) S.flags.fastClicks = true;
  }
  return v;
}
function addHeat(h) {
  if (inTrial('t4')) return;
  S.heat = Math.min(100, S.heat + h);
}
function cometsEnabled() { return !inTrial('t1'); }
function pickComet() {
  const total = COMETS.reduce((a, c) => a + c.weight, 0);
  let r = Math.random() * total;
  for (const c of COMETS) { r -= c.weight; if (r <= 0) return c; }
  return COMETS[0];
}
function catchComet() {
  const c = pickComet();
  S.stats.comets++;
  let text = c.name + '! ';
  if (c.id === 'starfall') {
    const g = Math.max(D.lps * 60, Math.min(S.light * 0.25, D.lps * 600)) + D.clickValue * 20;
    gainLight(g);
    text += '+' + fmt(g) + ' Light';
  } else if (c.id === 'flare') {
    S.comet.flare = 30 * cometDuration();
    text += 'Production ×' + flareBuffMult() + ' for ' + Math.round(S.comet.flare) + 's';
  } else if (c.id === 'wind') {
    S.comet.wind = 12 * cometDuration();
    text += 'Clicks ×' + windBuffMult() + ' for ' + Math.round(S.comet.wind) + 's';
  } else {
    S.freePulses += 3; S.flags.conjunction = true;
    text += '+3 free Pulses this run';
  }
  notify(text, 'comet');
  return c;
}
function nextCometDelay() { return (60 + Math.random() * 90); }

function gainLight(x) {
  S.light = Math.min(Number.MAX_VALUE, S.light + x);
  S.stats.lifetimeLight = Math.min(Number.MAX_VALUE, S.stats.lifetimeLight + x);
}

// ---------- autobuyers ----------
function autoUnlocked(what) {
  switch (what) {
    case 'low': return hasStar('c1');
    case 'high': return hasStar('c2');
    case 'boost': return hasStar('c3');
    case 'nova': return hasStar('c6');
    case 'collapse': return hz('autocol') > 0;
  }
  return false;
}
function runAutobuyers() {
  const a = S.auto;
  if (autoUnlocked('boost')) {
    if (a.flare && canFlare() && (!a.flareLimit || S.flares < a.flareLimit)) flare();
    else if (a.ignite && canIgnite()) ignite();
  }
  for (let k = unlockedTiers() - 1; k >= 0; k--) {
    if (!a.g[k]) continue;
    if (k < 4 ? autoUnlocked('low') : autoUnlocked('high')) buyGen(k, 'max');
  }
  if (a.pulse && autoUnlocked('high')) buyPulse(true);
  if (a.nova && autoUnlocked('nova') && canSupernova()) {
    const ok = S.trial ? true : a.novaMode === 'gain' ? sdGain() >= a.novaValue : S.run.time >= a.novaValue;
    if (ok) supernova();
  }
  if (a.collapse && autoUnlocked('collapse') && canCollapse() && dmGain() >= a.collapseValue) collapse();
}

// ---------- achievements ----------
function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (S.achievements[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(); } catch (e) { ok = false; }
    if (ok) {
      S.achievements[a.id] = true;
      Events.emit('achievement', a);
    }
  }
}

// ---------- main tick ----------
let achTimer = 0, autoTimer = 0;
function tick(dt, headless) {
  S.stats.playTime += dt; S.run.time += dt; S.run.sinceBoost += dt; S.stats.collapseTime += dt;

  if (inTrial('t7') && S.run.time > 360) {
    notify('Short Fuse: time ran out! The trial restarts.', 'bad');
    resetRun();
  }
  recompute();

  // self-clicking
  if (D.autoClick > 0) {
    S.autoClickAcc += D.autoClick * dt;
    const n = Math.floor(S.autoClickAcc);
    if (n > 0) {
      S.autoClickAcc -= n;
      gainLight(D.clickValue * n);
      addHeat(heatPerClick() * n);
      Events.emit('autoclick', n);
    }
  }
  // heat
  if (inTrial('t4')) S.heat = 0;
  else {
    S.heat = Math.max(heatFloor(), S.heat * Math.exp(-heatDecay() * dt) - 0.2 * dt);
    if (S.heat < heatFloor()) S.heat = heatFloor();
  }
  if (S.heat > S.stats.maxHeat) S.stats.maxHeat = S.heat;
  if (S.heat >= 99.5) { S.stats.heatHold += dt; if (S.stats.heatHold >= 30) S.flags.heatHold = true; } else S.stats.heatHold = 0;

  // production (top-down)
  for (let k = 7; k >= 1; k--) {
    if (D.prod[k] > 0) S.gens[k - 1].amount = safe(S.gens[k - 1].amount + D.prod[k] * dt);
  }
  gainLight(D.lps * dt);

  // black hole
  if (blackHoleUnlocked() && S.siphon > 0) {
    const l = log10(1 + D.rawLps);
    S.mass += S.siphon * l * l / 500 * dt;
  }
  fusionTick(dt);

  // comets & buffs
  if (S.comet.flare > 0) S.comet.flare = Math.max(0, S.comet.flare - dt);
  if (S.comet.wind > 0) S.comet.wind = Math.max(0, S.comet.wind - dt);
  if (cometsEnabled()) {
    S.comet.next -= dt * cometFreq();
    if (S.comet.next <= 0) {
      S.comet.next = nextCometDelay();
      if (hasStar('e5')) catchComet();
      else if (!headless) Events.emit('cometSpawn');
    }
  }

  if (S.light > S.run.best) S.run.best = S.light;
  if (S.light > S.stats.bestLight) S.stats.bestLight = S.light;

  // ending
  if (S.light >= INF_LIGHT && !S.run.inf) {
    S.run.inf = true; S.stats.infinite++;
    Events.emit('infinite');
  }

  autoTimer += dt;
  if (autoTimer >= 0.1) { autoTimer = 0; runAutobuyers(); }
  achTimer += dt;
  if (achTimer >= 0.5) { achTimer = 0; checkAchievements(); }
}
