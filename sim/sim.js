// Headless balance simulator. Usage: node sim/sim.js [hours] [path=hand|hearth] [cps]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const code = ['js/util.js', 'js/data.js', 'js/game.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n')
  + '\n;this.__G = { get S() { return S; }, set S(v) { S = v; }, D, Events, newState, tick, clickStar, catchComet, maxAll, buyAllUpgrades, ignite, flare, canIgnite, canFlare, supernova, canSupernova, sdGain, buyStar, starState, CONSTELLATIONS, TRIALS, enterTrial, exitTrial, trialsUnlocked, unlockFusion, canUnlockFusion, totalCores, setCores, collapse, canCollapse, dmGain, buyHorizon, HORIZON, hzCost, hz, fmt, fmtTime, autoUnlocked, ACHIEVEMENTS, recompute, flareReq, ignitionReq };';
const ctx = { console, Math, Date, JSON, Object, Array, Number, String };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const G = ctx.__G;

const ARGS = process.argv.slice(2).filter(a => !a.startsWith('-'));
const HOURS = parseFloat(ARGS[0] || '8');
const PATH = ARGS[1] || 'hand';
const CPS = parseFloat(ARGS[2] || (PATH === 'hand' ? '4' : '1'));
const VERBOSE = process.argv.includes('-v');
const COLPOL = process.argv.includes('--ratecol') ? 'rate' : 'asap';
const LOGI = +(process.argv.find(a => a.startsWith('--log=')) || '--log=600').slice(6);

G.S = G.newState();
G.recompute();
const S = () => G.S;
let t = 0;
const milestones = {};
function mark(name) { if (!(name in milestones)) { milestones[name] = t; console.log(G.fmtTime(t).padStart(12), ' ', name); } }

G.Events.on('cometSpawn', () => { if (Math.random() < 0.7) G.catchComet(); });
G.Events.on('supernova', g => { if (VERBOSE && t > 1800 && t < 7200) console.log(G.fmtTime(t).padStart(12), '   nova +' + G.fmt(g) + ' SD (total ' + G.fmt(S().sdTotal) + ') runtime=' + G.fmtTime(lastRunTime) + ' best=' + G.fmt(lastBest) + ' stars=' + Object.keys(S().stars).join(',')); });
G.Events.on('collapse', g => console.log(G.fmtTime(t).padStart(12), '   COLLAPSE +' + G.fmt(g) + ' DM (total ' + G.fmt(S().dmTotal) + ')'));

const rival = PATH === 'hand' ? 'hearth' : 'hand';
const starPriority = ['f1', 'c1', PATH === 'hand' ? 'h1' : 'e1', 'c2', 'f2', 'c3', PATH === 'hand' ? 'h2' : 'e2', 'f3', 'c4',
  PATH === 'hand' ? 'h3' : 'e3', 'f4', PATH === 'hand' ? 'h4' : 'e4', 'c5', 'f5', 'c6', PATH === 'hand' ? 'h5' : 'e5', 'f6',
  PATH === 'hand' ? 'h6' : 'e6', 'c7', 'f7', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6'];
const hzPriority = ['glow', 'memory', 'start', 'core', 'fuse', 'sd', 'harmony', 'ironmem', 'horizon', 'bundle', 'starmem', 'autocol', 'lens', 'dense', 'last'];

let lastRunTime = 0, lastBest = 0, peakRate = 0, trialStart = 0, failedTrials = {}, lastFusionPlan = -999, peakDm = 0;
const DT = 0.25;
let actT = 0;
while (t < HOURS * 3600) {
  const s = S();
  // human clicking (only while it matters; humans click less over time)
  const cps = t < 7200 ? CPS : CPS / 2;
  const clicks = cps * DT;
  for (let i = 0; i < Math.floor(clicks + Math.random()); i++) G.clickStar();
  G.tick(DT, false);
  t += DT;
  actT += DT;
  if (actT < 1) continue; // human acts once per second
  actT = 0;

  if (!G.autoUnlocked('low') || !G.autoUnlocked('high')) G.maxAll();
  G.buyAllUpgrades();
  if (!G.autoUnlocked('boost')) { if (G.canFlare()) G.flare(); else if (G.canIgnite()) G.ignite(); }
  if (s.ignitions >= 1) mark('first ignition');
  if (s.ignitions >= 4) mark('all 8 tiers');
  if (s.flares >= 1) mark('first flare');
  if (s.flares >= 3) mark('3 flares');

  // stars
  for (const id of starPriority) G.buyStar(id);
  // fusion
  if (G.canUnlockFusion()) { G.unlockFusion(); mark('fusion unlocked'); }
  if (s.fusion.unlocked && t - lastFusionPlan > 20) {
    lastFusionPlan = t;
    const n = G.totalCores();
    for (let i = 0; i < 6; i++) s.fusion.cores[i] = 0;
    s.fusion.cores[0] = 1;
    let left = n - 1;
    for (let i = 5; i >= 1 && left > 0; i--) { if (s.fusion.el[i - 1] >= 4) { s.fusion.cores[i]++; left--; } }
    s.fusion.cores[0] += left;
  }
  if (s.fusion.el[1] >= 1) mark('first helium');
  if (s.fusion.el[5] >= 1) mark('first IRON');
  // horizon
  for (const id of hzPriority) G.buyHorizon(id);
  if (s.stats.collapses >= 1 && s.siphon === 0) s.siphon = 0.3;

  // supernova / trials
  if (s.trial) {
    if (G.canSupernova()) { const id = s.trial; G.supernova(); mark('trial ' + id + ' done'); peakRate = 0; continue; }
    if (t - trialStart > 600) { failedTrials[s.trial] = t; G.exitTrial(); peakRate = 0; }
    continue;
  }
  if (G.canCollapse() && !process.argv.includes('--nocollapse')) {
    const g = G.dmGain();
    const cr = g / Math.max(1, s.stats.collapseTime);
    if (cr > peakDm) peakDm = cr;
    const colNow = COLPOL === 'asap' ? (s.stats.collapses === 0 || g >= Math.max(1, s.dmTotal * 0.5) || (s.stats.collapseTime > 1200 && g >= s.dmTotal * 0.15))
      : (cr < peakDm * 0.9 && s.stats.collapseTime > 300);
    if (colNow) { G.collapse(); mark('first collapse'); peakRate = 0; peakDm = 0; continue; }
  }
  if (G.canSupernova()) {
    const g = G.sdGain();
    const rate = g / s.run.time;
    if (rate > peakRate) peakRate = rate;
    const push = s.horizon.last || lastBest > 1e200;
    const waitColl = s.fusion.el[5] >= 10 && s.run.best < 1e100 && s.run.best > 1e70 && s.run.time < 900;
    const goodGain = g >= Math.max(2, s.sdTotal * 0.5) || (s.run.time > 240 && rate < peakRate * 0.9);
    if (s.stats.totalNovas === 0 || (push && (s.run.inf || s.run.time > 900)) || (!push && !waitColl && goodGain && s.run.time > 10)) {
      lastBest = s.run.best; lastRunTime = s.run.time;
      G.supernova(); peakRate = 0;
      mark('first supernova');
      if (s.stats.totalNovas >= 10) mark('10 novas');
      // try a trial
      if (G.trialsUnlocked()) {
        mark('trials unlocked');
        const tr = G.TRIALS.find(x => !s.trials[x.id]);
        if (tr && (lastBest < tr.goal / 1e3 || t - (failedTrials[tr.id] || -1e9) < 1200)) { /* not strong enough yet */ } else
        if (tr) { G.enterTrial(tr.id); trialStart = t; }
      }
    }
  }
  if (s.stats.bestLight >= 1e50) mark('1e50 light');
  if (s.stats.bestLight >= 1e100) mark('1e100 light');
  if (s.stats.bestLight >= 1e150) mark('1e150 light');
  if (s.stats.bestLight >= 1e200) mark('1e200 light');
  if (s.stats.bestLight >= 1e250) mark('1e250 light');
  if (s.stats.infinite >= 1) mark('INFINITE LIGHT');
  if (s.stats.infinite >= 3) { mark('3x infinite'); break; }

  if (Math.floor(t) % LOGI === 0) {
    console.log(G.fmtTime(t).padStart(12), '   L=' + G.fmt(s.light) + ' best=' + G.fmt(s.run.best) + ' lps=' + G.fmt(G.D.lps) + ' ign=' + s.ignitions + ' fl=' + s.flares +
      ' pul=' + s.pulses + ' SD=' + G.fmt(s.stardust) + '/' + G.fmt(s.sdTotal) + ' novas=' + s.stats.totalNovas + ' trials=' + Object.keys(s.trials).length +
      ' el=' + s.fusion.el.map(x => G.fmt(x, 1)).join(',') + ' DM=' + G.fmt(s.darkMatter) + ' mass=' + G.fmt(s.mass) + ' ach=' + Object.keys(s.achievements).length +
      (s.trial ? ' [' + s.trial + ']' : '') + ' stars=' + Object.keys(s.stars).length + ' lastBest=' + G.fmt(lastBest));
  }
}
console.log('\nAchievements: ' + Object.keys(S().achievements).length + '/' + G.ACHIEVEMENTS.length);
console.log('Missing: ' + G.ACHIEVEMENTS.filter(a => !S().achievements[a.id]).map(a => a.name).join(', '));
console.log('Stars: ' + Object.keys(S().stars).join(','));
console.log('Horizon: ' + JSON.stringify(S().horizon));
fs.writeFileSync(path.join(__dirname, 'endstate.json'), JSON.stringify(S()));
