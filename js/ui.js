'use strict';
// All DOM work: building panels, per-frame updates, star/comet visuals, modals, toasts.

const UI = {
  tab: 'forge',
  buyMode: 'max',
  quiet: false,      // suppress toasts (offline catch-up)
  sig: {},           // signatures to know when to rebuild dynamic lists
  gen: [], stars: {}, trials: {}, hz: {}, ach: {}, upg: {},
};

function $(id) { return document.getElementById(id); }
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'html') el.innerHTML = attrs[k];
    else if (k === 'text') el.textContent = attrs[k];
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
    else if (k === 'style') el.style.cssText = attrs[k];
    else el.setAttribute(k, attrs[k]);
  }
  for (const kid of kids) if (kid !== null && kid !== undefined) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
function setText(el, t) { if (el && el._t !== t) { el._t = t; el.textContent = t; } }
function setHTML(el, t) { if (el && el._h !== t) { el._h = t; el.innerHTML = t; } }
function show(el, on) { if (el) el.classList.toggle('hidden', !on); }
function cls(el, c, on) { if (el) el.classList.toggle(c, !!on); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ======================= tabs =======================
const TABS = [
  { id: 'forge', name: 'Forge', show: () => true },
  { id: 'upgrades', name: 'Upgrades', show: () => S.stats.bestLight >= 20 || S.stats.totalNovas > 0, badge: () => UPGRADES.some(u => !S.upgrades[u.id] && upgUnlocked(u) && S.light >= upgradeCost(u)) },
  { id: 'stars', name: 'Constellations', show: () => S.stats.totalNovas > 0 || S.stats.collapses > 0, badge: () => CONSTELLATIONS.some(c => c.stars.some(s => starState(s.id) === 'available' && S.stardust >= s.cost)) },
  { id: 'trials', name: 'Trials', show: () => trialsUnlocked(), badge: () => !S.trial && TRIALS.some(t => !trialDone(t.id) && trialAvailable(t.id)) },
  { id: 'reactor', name: 'Reactor', show: () => fusionVisible(), badge: () => (canUnlockFusion()) || (S.fusion.unlocked && usedCores() < totalCores()) },
  { id: 'horizon', name: 'Black Hole', show: () => S.stats.collapses > 0, badge: () => HORIZON.some(x => hz(x.id) < x.max && S.darkMatter >= hzCost(x.id)) },
  { id: 'achievements', name: 'Achievements', show: () => true },
  { id: 'stats', name: 'Statistics', show: () => true },
  { id: 'options', name: 'Options', show: () => true },
];
function buildTabs() {
  const nav = $('tabs');
  nav.innerHTML = '';
  UI.tabBtns = {};
  for (const t of TABS) {
    const b = h('button', { class: 'tab', onclick: () => selectTab(t.id) }, t.name, h('span', { class: 'badge hidden' }));
    UI.tabBtns[t.id] = b;
    nav.append(b);
  }
  selectTab(UI.tab);
}
function selectTab(id) {
  UI.tab = id;
  for (const t of TABS) cls(UI.tabBtns[t.id], 'sel', t.id === id);
  document.querySelectorAll('.panel').forEach(p => cls(p, 'sel', p.dataset.tab === id));
  updateAll(true);
}
function updateTabs() {
  for (const t of TABS) {
    const b = UI.tabBtns[t.id];
    const vis = t.show();
    show(b, vis);
    show(b.querySelector('.badge'), vis && t.badge && t.id !== UI.tab && t.badge());
  }
  if (!TABS.find(t => t.id === UI.tab).show()) selectTab('forge');
}

// ======================= forge =======================
function buildForge() {
  const p = $('panel-forge');
  p.innerHTML = '';
  UI.pulse = {};
  const pulseCard = h('div', { class: 'card pulse-card' },
    UI.pulse.icon = h('span', { class: 'pulse-icon' }, '♥'),
    h('div', null,
      h('div', null, h('b', null, 'Pulse '), UI.pulse.count = h('span', { class: 'muted' })),
      UI.pulse.info = h('div', { class: 'muted', style: 'font-size:12px' })),
    h('span', { class: 'spacer' }),
    UI.pulse.btn = h('button', { onclick: () => { buyPulse(false); updateAll(); } }),
    UI.pulse.max = h('button', { class: 'small', onclick: () => { buyPulse(true); updateAll(); }, 'data-tip': 'Buy as many Pulses as you can afford|Hotkey: P' }, 'Max'));
  const modes = h('div', { class: 'card buymode' }, h('span', { class: 'muted' }, 'Buy '));
  UI.modeBtns = {};
  for (const [m, label] of [['one', '×1'], ['ten', 'Until 10'], ['max', 'Max']]) {
    const b = h('button', { class: 'small', onclick: () => { UI.buyMode = m; updateAll(true); } }, label);
    UI.modeBtns[m] = b; modes.append(b);
  }
  modes.append(h('button', { class: 'small', style: 'margin-left:8px', onclick: () => { maxAll(); updateAll(); }, 'data-tip': 'Max All|Buys generators from the top tier down, then Pulses. Hotkey: M' }, 'Max All'));
  p.append(h('div', { class: 'forge-top' }, pulseCard, modes));

  const list = h('div', { class: 'gen-list' });
  UI.gen = [];
  GENS.forEach((g, k) => {
    const r = {};
    r.row = h('div', { class: 'gen' },
      h('div', { class: 'gicon' }, g.icon),
      h('div', { class: 'gname' }, g.name, h('small', null, g.desc)),
      r.amt = h('div', { class: 'gamt' }),
      h('div', null, r.mult = h('div', { class: 'gmult' }), r.rate = h('div', { class: 'grate' })),
      r.btn = h('button', { class: 'gbuy', onclick: () => { buyGen(k, UI.buyMode); updateAll(); } }),
      r.autoWrap = h('label', { class: 'gauto', 'data-tip': 'Autobuyer|Automatically buys max ' + g.name + 's.' },
        r.auto = h('input', { type: 'checkbox', onchange: e => { S.auto.g[k] = e.target.checked; } })),
      r.prog = h('div', { class: 'gprog' }));
    UI.gen.push(r);
    list.append(r.row);
  });
  p.append(list);

  UI.ign = {}; UI.flr = {};
  const ignCard = h('div', { class: 'card boost-card ign' },
    UI.ign.title = h('div', { class: 'bt' }),
    UI.ign.desc = h('div', { class: 'bd' }),
    UI.ign.btn = h('button', { onclick: () => { if (ignite()) { flashStar(); updateAll(true); } } }));
  const flrCard = h('div', { class: 'card boost-card flr' },
    UI.flr.title = h('div', { class: 'bt' }),
    UI.flr.desc = h('div', { class: 'bd' }),
    UI.flr.btn = h('button', { onclick: () => { if (flare()) { flash('nova'); updateAll(true); } } }));
  UI.flr.card = flrCard;
  p.append(h('div', { class: 'boosts' }, ignCard, flrCard));

  // automation strip
  const a = {};
  UI.autoStrip = h('div', { class: 'card auto-strip' },
    h('b', { style: 'color:var(--text)' }, 'Automation'),
    a.pulse = autoToggle('Pulse', 'pulse'),
    a.ignite = autoToggle('Ignite', 'ignite'),
    a.flare = autoToggle('Flare', 'flare'),
    a.flareLim = h('label', { 'data-tip': 'Flare limit|Auto-Flare stops after this many Flares in a run (0 = no limit).' }, 'up to',
      a.flareLimIn = h('input', { type: 'number', min: 0, step: 1, style: 'width:60px', onchange: e => { S.auto.flareLimit = Math.max(0, Math.floor(+e.target.value || 0)); } })),
    a.nova = h('span', { class: 'row', style: 'gap:6px' },
      autoToggle('Supernova', 'nova'),
      a.novaMode = h('select', { onchange: e => { S.auto.novaMode = e.target.value; } },
        h('option', { value: 'gain' }, 'at Stardust ≥'), h('option', { value: 'time' }, 'after seconds')),
      a.novaVal = h('input', { type: 'number', min: 0, onchange: e => { S.auto.novaValue = Math.max(0, +e.target.value || 0); } })),
    a.collapse = h('span', { class: 'row', style: 'gap:6px' },
      autoToggle('Collapse', 'collapse'), 'at DM ≥',
      a.colVal = h('input', { type: 'number', min: 1, onchange: e => { S.auto.collapseValue = Math.max(1, +e.target.value || 1); } })));
  UI.auto = a;
  p.append(UI.autoStrip);
}
function autoToggle(label, key) {
  const cb = h('input', { type: 'checkbox', onchange: e => { S.auto[key] = e.target.checked; } });
  const l = h('label', null, cb, label);
  l._cb = cb; l._key = key;
  return l;
}

function updateForge() {
  for (const m in UI.modeBtns) cls(UI.modeBtns[m], 'active', UI.buyMode === m);
  // pulse
  const pc = pulseCost();
  setText(UI.pulse.count, '×' + D.pulseBase.toFixed(3) + ' each · ' + S.pulses + (S.freePulses ? ' (+' + S.freePulses + ' free)' : '') + ' owned');
  setText(UI.pulse.info, inTrial('t3') ? 'Flatline: Pulses are disabled in this Trial.' : 'Multiplies Light production. Total: ' + fmtMult(D.pulseMult));
  setText(UI.pulse.btn, 'Pulse · ' + fmt(pc));
  UI.pulse.btn.disabled = !canBuyPulse(); cls(UI.pulse.btn, 'can', canBuyPulse());
  UI.pulse.max.disabled = !canBuyPulse();
  UI.pulse.icon.style.setProperty('--beat', Math.max(0.25, 1.4 / Math.log10(10 + D.pulseMult)) + 's');

  const tiers = unlockedTiers();
  const autoLow = autoUnlocked('low'), autoHigh = autoUnlocked('high');
  for (let k = 0; k < 8; k++) {
    const r = UI.gen[k], g = S.gens[k];
    const locked = k >= tiers;
    cls(r.row, 'locked', locked);
    show(r.row, k < tiers + 1 || g.bought > 0);
    setHTML(r.amt, fmtInt(g.amount) + (g.amount !== g.bought ? ' <small>(' + g.bought + ')</small>' : ''));
    setText(r.mult, fmtMult(D.genMult[k]));
    if (locked) {
      setText(r.rate, inTrial('t2') ? 'Does not exist in Four Winds' : 'Unlocked by Ignition');
      setText(r.btn, 'Locked'); r.btn.disabled = true; cls(r.btn, 'can', false);
    } else {
      const target = k === 0 ? 'Light' : GENS[k - 1].name + 's';
      const below = k === 0 ? 0 : S.gens[k - 1].amount;
      const pct = k > 0 && below > 0 ? ' (+' + fmt(D.prod[k] / below * 100, 1) + '%)' : '';
      setText(r.rate, '+' + fmt(k === 0 ? D.lps : D.prod[k]) + ' ' + target + '/s' + pct);
      const c = genCost(k);
      const toTen = 10 - (g.bought % 10);
      let label, can;
      if (UI.buyMode === 'one') { label = 'Buy 1 · ' + fmt(c); can = S.light >= c; }
      else if (UI.buyMode === 'ten') { label = 'Buy ' + toTen + ' · ' + fmt(c * toTen); can = S.light >= c * toTen; }
      else { label = 'Max · ' + fmt(c); can = S.light >= c; }
      setText(r.btn, label); r.btn.disabled = !can; cls(r.btn, 'can', can);
    }
    r.prog.style.width = ((g.bought % 10) * 10) + '%';
    const au = k < 4 ? autoLow : autoHigh;
    cls(r.autoWrap, 'na', !au);
    r.auto.checked = !!S.auto.g[k];
  }

  // ignition
  const req = ignitionReq();
  const have = S.gens[req.tier].bought;
  const nextTier = unlockedTiers() < 8 && !inTrial('t2') ? GENS[unlockedTiers()].name + 's' : null;
  setText(UI.ign.title, 'Ignition ' + (S.ignitions > 0 ? '#' + (S.ignitions + 1) : ''));
  setHTML(UI.ign.desc, 'Requires <b>' + req.amount + ' ' + GENS[req.tier].name + 's</b> (' + Math.min(have, req.amount) + '/' + req.amount + '). ' +
    'Resets Light, generators and Pulses. ' + (nextTier ? 'Unlocks <b>' + nextTier + '</b> and multiplies' : 'Multiplies') +
    ' Light production <b>×' + D.ignMult.toFixed(2) + '</b> (now ' + fmtMult(Math.pow(D.ignMult, S.ignitions)) + ').');
  setText(UI.ign.btn, 'Ignite (I)');
  UI.ign.btn.disabled = !canIgnite(); cls(UI.ign.btn, 'can', canIgnite());
  // flare
  const showFlare = S.ignitions >= 4 || S.flares > 0 || S.stats.totalNovas > 0;
  show(UI.flr.card, showFlare);
  const fr = Math.floor(flareReq());
  setText(UI.flr.title, 'Flare ' + (S.flares > 0 ? '#' + (S.flares + 1) : ''));
  setHTML(UI.flr.desc, inTrial('t2') ? 'Flares are impossible in Four Winds.' :
    'Requires <b>' + fr + ' Quasars</b> (' + Math.min(S.gens[7].bought, fr) + '/' + fr + '). Resets everything Ignition does <i>and</i> your Ignitions, but permanently adds <b>+' + flareStrength().toFixed(3) + '</b> to the Pulse multiplier for this run.');
  setText(UI.flr.btn, 'Flare (F)');
  UI.flr.btn.disabled = !canFlare(); cls(UI.flr.btn, 'can', canFlare());

  // automation
  const a = UI.auto;
  const any = autoUnlocked('low');
  show(UI.autoStrip, any);
  if (any) {
    show(a.pulse, autoUnlocked('high')); a.pulse._cb.checked = S.auto.pulse;
    show(a.ignite, autoUnlocked('boost')); a.ignite._cb.checked = S.auto.ignite;
    show(a.flare, autoUnlocked('boost')); a.flare._cb.checked = S.auto.flare;
    show(a.flareLim, autoUnlocked('boost'));
    if (document.activeElement !== a.flareLimIn) a.flareLimIn.value = S.auto.flareLimit;
    show(a.nova, autoUnlocked('nova'));
    a.nova.querySelector('input[type=checkbox]').checked = S.auto.nova;
    if (document.activeElement !== a.novaMode) a.novaMode.value = S.auto.novaMode;
    if (document.activeElement !== a.novaVal) a.novaVal.value = S.auto.novaValue;
    show(a.collapse, autoUnlocked('collapse'));
    a.collapse.querySelector('input[type=checkbox]').checked = S.auto.collapse;
    if (document.activeElement !== a.colVal) a.colVal.value = S.auto.collapseValue;
  }
}

// ======================= upgrades =======================
function buildUpgrades() {
  const p = $('panel-upgrades');
  p.innerHTML = '';
  p.append(h('h2', null, 'Upgrades'),
    h('p', { class: 'lead' }, 'One-time improvements bought with Light. New ones appear as you progress. They are lost on Supernova (unless remembered).'),
    h('div', { class: 'row', style: 'margin-bottom:10px' },
      h('button', { onclick: () => { buyAllUpgrades(); updateAll(true); } }, 'Buy all affordable'),
      UI.upgCount = h('span', { class: 'muted' })),
    UI.upgGrid = h('div', { class: 'upg-grid' }),
    h('h3', null, 'Owned'),
    UI.upgOwned = h('div', { class: 'upg-grid' }));
  UI.sig.upg = '';
}
function updateUpgrades() {
  const avail = UPGRADES.filter(u => !S.upgrades[u.id] && upgUnlocked(u)).sort((a, b) => a.cost - b.cost);
  const owned = UPGRADES.filter(u => S.upgrades[u.id]);
  const sig = avail.map(u => u.id).join() + '|' + owned.map(u => u.id).join();
  if (sig !== UI.sig.upg) {
    UI.sig.upg = sig;
    UI.upgGrid.innerHTML = ''; UI.upgOwned.innerHTML = ''; UI.upg = {};
    for (const u of avail) {
      const b = h('button', { class: 'upg', onclick: () => { if (buyUpgrade(u.id)) { updateAll(true); } } },
        h('div', { class: 'un' }, u.name), h('div', { class: 'ud' }, u.desc), h('div', { class: 'uc' }));
      UI.upg[u.id] = b; UI.upgGrid.append(b);
    }
    if (!avail.length) UI.upgGrid.append(h('div', { class: 'muted' }, 'No upgrades available right now. Keep growing!'));
    for (const u of owned) UI.upgOwned.append(h('div', { class: 'card upg owned' }, h('div', { class: 'un' }, u.name), h('div', { class: 'ud' }, u.desc), h('div', { class: 'uc' }, 'Owned')));
  }
  for (const u of avail) {
    const b = UI.upg[u.id]; if (!b) continue;
    const c = upgradeCost(u), can = S.light >= c;
    setText(b.querySelector('.uc'), fmt(c) + ' Light');
    b.disabled = !can; cls(b, 'can', can); cls(b, 'poor', !can);
  }
  setText(UI.upgCount, owned.length + ' / ' + UPGRADES.length + ' owned');
}

// ======================= constellations =======================
function buildStars() {
  const p = $('panel-stars');
  p.innerHTML = '';
  p.append(h('h2', null, 'Constellations'),
    h('p', { class: 'lead' }, 'Light stars with Stardust. Each constellation is lit in order. The Hand and The Hearth are rivals — you can only follow one of them. Stardust also strengthens every generator on its own: ',
      UI.sdEffect = h('b', { style: 'color:var(--sd)' }), '.'),
    h('div', { class: 'row', style: 'margin-bottom:12px' },
      UI.respecBtn = h('button', { onclick: () => { S.respec = !S.respec; updateAll(true); }, 'data-tip': 'Respec|On your next Supernova, The Hand and The Hearth are cleared and their Stardust refunded.' }),
      UI.harmonyNote = h('span', { class: 'muted' })));
  const grid = h('div', { class: 'const-grid' });
  UI.stars = {}; UI.consts = {};
  for (const c of CONSTELLATIONS) {
    const col = h('div', { class: 'stars-col' });
    for (const s of c.stars) {
      const b = h('button', { class: 'cstar', style: '--c:' + c.color, onclick: () => { if (buyStar(s.id)) updateAll(true); } },
        h('span', { class: 'link' }), h('span', { class: 'node' }),
        h('span', null, h('div', { class: 'sn' }, s.name), h('div', { class: 'sd' }, s.desc), h('div', { class: 'sc' })));
      UI.stars[s.id] = b; col.append(b);
    }
    const card = h('div', { class: 'card const' }, h('div', { class: 'ct', style: 'color:' + c.color }, c.name), h('div', { class: 'cth' }, c.theme), col);
    UI.consts[c.id] = card;
    grid.append(card);
  }
  p.append(grid);
}
function updateStars() {
  setText(UI.sdEffect, '×' + fmt(sdTierMult(), 2) + ' per tier');
  setText(UI.respecBtn, S.respec ? 'Respec queued (click to cancel)' : 'Respec Hand / Hearth on next Supernova');
  cls(UI.respecBtn, 'active', S.respec);
  setText(UI.harmonyNote, hz('harmony') ? 'Harmony: the rivalry is over — light both!' : '');
  for (const c of CONSTELLATIONS) {
    let rivaled = false;
    for (const s of c.stars) {
      const b = UI.stars[s.id], st = starState(s.id);
      ['owned', 'available', 'locked', 'rival'].forEach(x => cls(b, x, st === x));
      cls(b, 'afford', S.stardust >= s.cost);
      b.disabled = st !== 'available' || S.stardust < s.cost;
      setText(b.querySelector('.sc'), st === 'owned' ? 'Lit' : st === 'rival' ? 'Blocked by rival · ' + fmt(s.cost) + ' SD' : fmt(s.cost) + ' Stardust');
      if (st === 'rival') rivaled = true;
    }
    cls(UI.consts[c.id], 'rivaled', rivaled);
  }
}

// ======================= trials =======================
function buildTrials() {
  const p = $('panel-trials');
  p.innerHTML = '';
  p.append(h('h2', null, 'Trials'),
    h('p', { class: 'lead' }, 'Entering a Trial resets your run like a Supernova. Reach the goal and go Supernova to complete it. Rewards are permanent — they even survive Collapse. Trials unlock one after another.'));
  const grid = h('div', { class: 'trial-grid' });
  UI.trials = {};
  for (const t of TRIALS) {
    const r = {};
    r.card = h('div', { class: 'card trial' },
      h('div', { class: 'tn' }, t.name),
      h('div', { class: 'tg' }, 'Goal: ' + fmt(t.goal) + ' Light'),
      h('div', { class: 'td' }, t.desc),
      h('div', { class: 'tr' }, 'Reward: ' + t.reward),
      r.btn = h('button', { onclick: () => {
        if (S.trial === t.id) { exitTrial(); updateAll(true); return; }
        confirmAction('Enter ' + t.name + '?', 'Your current run will be reset (no Stardust is gained). ' + t.desc, 'Enter Trial', () => { if (enterTrial(t.id)) updateAll(true); });
      } }));
    UI.trials[t.id] = r; grid.append(r.card);
  }
  p.append(grid);
}
function updateTrials() {
  for (const t of TRIALS) {
    const r = UI.trials[t.id];
    const done = trialDone(t.id), running = S.trial === t.id, avail = trialAvailable(t.id);
    cls(r.card, 'done', done); cls(r.card, 'running', running); cls(r.card, 'locked', !avail && !done);
    setText(r.btn, running ? 'Exit Trial' : done ? 'Replay' : avail ? 'Enter Trial' : 'Locked');
    r.btn.disabled = (!avail && !running) || (S.trial && !running);
  }
}

// ======================= reactor =======================
function buildReactor() {
  const p = $('panel-reactor');
  p.innerHTML = '';
  UI.rx = {};
  p.append(h('h2', null, 'Fusion Reactor'),
    h('p', { class: 'lead' }, 'Reactor cores capture Hydrogen from your Light stream and fuse it into heavier elements (4 → 1). Every element you hold grants a bonus — but fusing consumes the lighter element. You rarely have enough cores for everything; choose wisely. Elements persist through Supernova.'));
  UI.rx.lockCard = h('div', { class: 'card', style: 'text-align:center;padding:24px' },
    h('div', { style: 'font-size:15px;margin-bottom:10px' }, 'The Reactor is dark.'),
    UI.rx.unlockBtn = h('button', { onclick: () => { if (unlockFusion()) { buildReactor(); updateAll(true); } } }));
  p.append(UI.rx.lockCard);
  UI.rx.body = h('div');
  const eg = h('div', { class: 'el-grid' });
  UI.rx.el = [];
  ELEMENTS.forEach((e, i) => {
    const r = {};
    r.card = h('div', { class: 'card el', style: '--ec:' + e.color },
      h('div', { class: 'esym' }, e.sym), h('div', { class: 'ename' }, e.name),
      r.amt = h('div', { class: 'eamt' }), r.eff = h('div', { class: 'eeff' }));
    UI.rx.el.push(r); eg.append(r.card);
  });
  UI.rx.body.append(eg);
  UI.rx.body.append(h('div', { class: 'row', style: 'margin-bottom:8px' },
    h('b', null, 'Cores'), UI.rx.pips = h('div', { class: 'core-pips' }), UI.rx.coreText = h('span', { class: 'muted' }),
    h('span', { class: 'spacer' }),
    UI.rx.speed = h('span', { class: 'muted' }),
    h('button', { class: 'small', onclick: () => { S.fusion.cores = [0, 0, 0, 0, 0, 0]; updateAll(); } }, 'Clear')));
  const pl = h('div', { class: 'proc-list' });
  UI.rx.proc = [];
  PROCESSES.forEach((pr, i) => {
    const r = {};
    r.row = h('div', { class: 'card proc' },
      h('div', { class: 'pn' }, pr.name),
      h('div', { class: 'pd' }, pr.desc),
      h('div', null, r.rate = h('div', { class: 'pr' }), h('div', { class: 'flowbar' }, r.bar = h('div'))),
      h('div', { class: 'pc' },
        h('button', { class: 'small', onclick: () => { setCores(i, S.fusion.cores[i] - 1); updateAll(); } }, '−'),
        r.cores = h('b', { class: 'cores' }),
        h('button', { class: 'small', onclick: () => { setCores(i, S.fusion.cores[i] + 1); updateAll(); } }, '+'),
        h('button', { class: 'small', onclick: () => { setCores(i, S.fusion.cores[i] + totalCores()); updateAll(); }, 'data-tip': 'Assign all free cores here' }, 'All')));
    UI.rx.proc.push(r); pl.append(r.row);
  });
  UI.rx.body.append(pl);
  p.append(UI.rx.body);
}
function elEffectText(i) {
  switch (i) {
    case 0: return 'All generators ×' + fmt(elH(), 2) + ' (every tier)';
    case 1: return 'Pulse multiplier +' + elHe().toFixed(3);
    case 2: return 'Clicks ×' + fmt(elCclick(), 2) + ', heat power +' + elCheat().toFixed(2);
    case 3: return 'Stardust gain ×' + fmt(elO(), 2);
    case 4: return 'Ignition multiplier +' + elSi().toFixed(2);
    case 5: return 'Production ×' + fmt(elFe(), 2) + (S.fusion.el[5] < COLLAPSE_IRON ? ' · ' + COLLAPSE_IRON + ' needed to Collapse' : '');
  }
}
function updateReactor() {
  show(UI.rx.lockCard, !S.fusion.unlocked); show(UI.rx.body, S.fusion.unlocked);
  if (!S.fusion.unlocked) {
    const ok = S.stats.totalNovas >= FUSION_UNLOCK_NOVAS;
    setText(UI.rx.unlockBtn, ok ? 'Ignite the Reactor · ' + FUSION_UNLOCK_COST + ' Stardust' : 'Requires ' + FUSION_UNLOCK_NOVAS + ' Supernovas');
    UI.rx.unlockBtn.disabled = !canUnlockFusion(); cls(UI.rx.unlockBtn, 'can', canUnlockFusion());
    return;
  }
  ELEMENTS.forEach((e, i) => {
    setText(UI.rx.el[i].amt, fmt(S.fusion.el[i], 1));
    setText(UI.rx.el[i].eff, elEffectText(i));
  });
  const tc = totalCores(), uc = usedCores();
  if (UI.rx.pips.childElementCount !== tc) { UI.rx.pips.innerHTML = ''; for (let i = 0; i < tc; i++) UI.rx.pips.append(h('span', { class: 'pip' })); }
  [...UI.rx.pips.children].forEach((pp, i) => cls(pp, 'on', i < uc));
  setText(UI.rx.coreText, uc + ' / ' + tc + ' in use');
  setText(UI.rx.speed, 'Fusion speed ×' + fmt(fusionSpeed(), 2));
  PROCESSES.forEach((pr, i) => {
    const r = UI.rx.proc[i];
    setText(r.cores, String(S.fusion.cores[i]));
    let rate, frac;
    if (i === 0) { rate = S.fusion.cores[0] * captureRate(); setText(r.rate, '+' + fmt(rate, 2) + ' H/s'); frac = S.fusion.cores[0] / Math.max(1, tc); }
    else {
      const k = fusionRate(i);
      rate = S.fusion.el[i - 1] * k / 4;
      setText(r.rate, S.fusion.cores[i] ? '+' + fmt(rate, 2) + ' ' + ELEMENTS[i].sym + '/s (' + (k * 100).toFixed(1) + '%/s of ' + ELEMENTS[i - 1].sym + ')' : 'idle');
      frac = Math.min(1, k);
    }
    r.bar.style.width = (frac * 100) + '%';
  });
}

// ======================= horizon / black hole =======================
function buildHorizon() {
  const p = $('panel-horizon');
  p.innerHTML = '';
  UI.bh = {};
  p.append(h('h2', null, 'The Black Hole'),
    h('p', { class: 'lead' }, 'What remains of your collapsed star. Feed it Light through the Siphon to grow its Mass — Mass is permanent and boosts Stardust gain and fusion speed. Spend Dark Matter on the Horizon.'));
  const ctrl = h('div', { class: 'card' },
    h('div', { class: 'kv' }, h('span', null, 'Mass'), UI.bh.mass = h('b')),
    h('div', { class: 'kv' }, h('span', null, 'Mass growth'), UI.bh.rate = h('span')),
    h('div', { class: 'kv' }, h('span', null, 'Stardust gain'), UI.bh.sd = h('span')),
    h('div', { class: 'kv' }, h('span', null, 'Fusion speed'), UI.bh.fu = h('span')),
    h('div', { class: 'siphon-row' }, h('span', null, 'Siphon'),
      UI.bh.slider = h('input', { type: 'range', min: 0, max: 100, step: 1, oninput: e => { S.siphon = (+e.target.value) / 100; updateAll(); } }),
      UI.bh.sv = h('b', { style: 'width:42px;text-align:right' })),
    UI.bh.pen = h('div', { class: 'muted', style: 'font-size:12px' }),
    h('div', { class: 'kv', style: 'margin-top:8px' }, h('span', null, 'Dark Matter (total earned)'), UI.bh.dm = h('b', { style: 'color:var(--dm)' })),
    h('div', { class: 'kv' }, h('span', null, 'Remnant Glow'), UI.bh.glow = h('span')));
  UI.bh.hole = h('div', { class: 'blackhole' }, h('div', { class: 'disk' }), h('div', { class: 'hole' }));
  p.append(h('div', { class: 'bh-wrap' }, h('div', { class: 'card' }, UI.bh.hole), ctrl));
  p.append(h('h3', null, 'The Horizon'));
  const grid = h('div', { class: 'hz-grid' });
  UI.hz = {};
  for (const x of HORIZON) {
    const b = h('button', { class: 'hz', onclick: () => { if (buyHorizon(x.id)) updateAll(true); } },
      h('div', { class: 'hn' }, x.name), h('div', { class: 'hd' }, x.desc), h('div', { class: 'hc' }));
    UI.hz[x.id] = b; grid.append(b);
  }
  p.append(grid);
}
function updateHorizon() {
  const l = log10(1 + D.rawLps);
  setText(UI.bh.mass, fmt(S.mass, 2));
  setText(UI.bh.rate, '+' + fmt(S.siphon * l * l / 500, 2) + '/s');
  setText(UI.bh.sd, '×' + fmt(massSD(), 2));
  setText(UI.bh.fu, '×' + fmt(massFuse(), 2));
  if (document.activeElement !== UI.bh.slider) UI.bh.slider.value = Math.round(S.siphon * 100);
  setText(UI.bh.sv, Math.round(S.siphon * 100) + '%');
  setText(UI.bh.pen, 'Light gain is raised to ^' + (1 - siphonPenalty() * S.siphon).toFixed(3) + ' while siphoning.');
  setText(UI.bh.dm, fmt(S.dmTotal));
  setText(UI.bh.glow, hz('glow') ? '×' + fmt(glowMult(), 2) + ' per tier' : 'not bought');
  UI.bh.hole.style.setProperty('--spin', Math.max(1.5, 10 - log10(1 + S.mass)) + 's');
  for (const x of HORIZON) {
    const b = UI.hz[x.id], lv = hz(x.id), maxed = lv >= x.max;
    const c = maxed ? 0 : hzCost(x.id);
    cls(b, 'maxed', maxed);
    setText(b.querySelector('.hc'), (x.max > 1 ? 'Level ' + lv + '/' + x.max + ' · ' : '') + (maxed ? 'Owned' : fmt(c) + ' DM'));
    b.disabled = maxed || S.darkMatter < c; cls(b, 'can', !maxed && S.darkMatter >= c);
  }
}

// ======================= achievements =======================
function buildAchievements() {
  const p = $('panel-achievements');
  p.innerHTML = '';
  p.append(h('h2', null, 'Achievements'), UI.achLead = h('p', { class: 'lead' }));
  const grid = h('div', { class: 'ach-grid' });
  UI.ach = {};
  for (const a of ACHIEVEMENTS) {
    const el = h('div', { class: 'ach', 'data-tip': a.name + '|' + a.desc }, a.name);
    UI.ach[a.id] = el; grid.append(el);
  }
  p.append(grid);
}
function updateAchievements() {
  const n = achCount();
  setHTML(UI.achLead, 'Unlocked <b>' + n + ' / ' + ACHIEVEMENTS.length + '</b>. Each achievement multiplies Light production by 1.03 — currently <b>' + fmtMult(Math.pow(1.03, n)) + '</b>.');
  for (const a of ACHIEVEMENTS) {
    const el = UI.ach[a.id], got = !!S.achievements[a.id];
    cls(el, 'got', got);
    el.setAttribute('data-tip', a.name + '|' + a.desc + (got ? ' ✓' : ''));
  }
}

// ======================= stats =======================
function buildStats() {
  const p = $('panel-stats');
  p.innerHTML = '';
  p.append(h('h2', null, 'Statistics'), UI.statsBody = h('div', { class: 'stat-grid' }));
}
function kv(k, v) { return '<div class="kv"><span>' + esc(k) + '</span><span>' + v + '</span></div>'; }
function updateStats() {
  const st = S.stats;
  let a = '<div class="card"><h3 style="margin-top:0">General</h3>' +
    kv('Time played', fmtTime(st.playTime)) + kv('This run', fmtTime(S.run.time)) +
    kv('Best Light ever', fmt(st.bestLight)) + kv('Best Light this run', fmt(S.run.best)) +
    kv('Total Light produced', fmt(st.lifetimeLight)) + kv('Star clicks', fmt(st.totalClicks)) +
    kv('Comets caught', fmt(st.comets)) + kv('Highest heat', st.maxHeat.toFixed(0)) + '</div>';
  let b = '<div class="card"><h3 style="margin-top:0">Prestige</h3>' +
    kv('Supernovas (this collapse)', fmt(S.novas)) + kv('Supernovas (all time)', fmt(st.totalNovas)) +
    kv('Fastest Supernova', st.fastestNova >= NEVER ? '—' : fmtTime(st.fastestNova)) +
    kv('Stardust earned (this collapse)', fmt(S.sdTotal)) + kv('Trials completed', trialCount() + ' / 8') +
    kv('Collapses', fmt(st.collapses)) + kv('Fastest Collapse', st.fastestCollapse >= NEVER ? '—' : fmtTime(st.fastestCollapse)) +
    kv('Dark Matter earned', fmt(S.dmTotal)) + kv('Infinite Light reached', fmt(st.infinite)) + '</div>';
  let c = '<div class="card"><h3 style="margin-top:0">Light multipliers (applied once)</h3>';
  for (const [n, v] of D.globalParts) if (Math.abs(v - 1) > 1e-9) c += kv(n, fmtMult(v));
  c += kv('Pulse', fmtMult(D.pulseMult)) + kv('Ignitions', fmtMult(Math.pow(D.ignMult, S.ignitions)));
  if (D.lightExp !== 1) c += kv('Light exponent', '^' + D.lightExp.toFixed(3));
  c += '</div>';
  let d = '<div class="card"><h3 style="margin-top:0">Generator multipliers (every tier)</h3>';
  d += kv('Per 10 bought', '×' + D.perTen.toFixed(2));
  for (const [n, v] of D.tierParts) d += kv(n, fmtMult(v));
  d += '</div>';
  setHTML(UI.statsBody, a + b + c + d);
}

// ======================= options =======================
function buildOptions() {
  const p = $('panel-options');
  p.innerHTML = '';
  const o = {};
  const toggle = (label, key, tip) => {
    const cb = h('input', { type: 'checkbox', onchange: e => { S.settings[key] = e.target.checked; applySettings(); } });
    o[key] = cb;
    return h('label', { class: 'opt-row', 'data-tip': tip ? label + '|' + tip : null }, h('span', null, label), cb);
  };
  o.notation = h('select', { onchange: e => { S.settings.notation = e.target.value; applySettings(); updateAll(true); } },
    h('option', { value: 'scientific' }, 'Scientific (1.23e45)'), h('option', { value: 'engineering' }, 'Engineering (123e43)'),
    h('option', { value: 'short' }, 'Short names (1.23 Qa)'), h('option', { value: 'log' }, 'Logarithm (e45.09)'));
  p.append(h('h2', null, 'Options'),
    h('div', { class: 'opt-grid' },
      h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Display'),
        h('div', { class: 'opt-row' }, h('span', null, 'Number notation'), o.notation),
        toggle('News ticker', 'news'), toggle('Click particles', 'particles'),
        toggle('Confirm Supernova', 'confirmNova'), toggle('Confirm Collapse', 'confirmCollapse'),
        toggle('Offline progress', 'offline', 'Simulate time spent away (up to 24h) when you return.')),
      h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Save'),
        h('p', { class: 'muted', style: 'font-size:12px;margin:0 0 8px' }, 'The game autosaves to your browser every 15 seconds.'),
        h('div', { class: 'row' },
          h('button', { onclick: () => { saveGame(); } }, 'Save now'),
          h('button', { onclick: exportDialog }, 'Export'),
          h('button', { onclick: importDialog }, 'Import'),
          h('button', { class: 'danger', onclick: resetDialog }, 'Hard reset')),
        UI.saveInfo = h('div', { class: 'muted', style: 'font-size:12px;margin-top:8px' })),
      h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Hotkeys'),
        h('div', { html: kv('Click the Star', 'Space') + kv('Max All', 'M') + kv('Max Pulse', 'P') + kv('Ignite', 'I') + kv('Flare', 'F') +
          kv('Supernova', 'S') + kv('Collapse', 'C') + kv('Buy max of tier', '1 – 8') })),
      h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'About'),
        h('p', { class: 'muted', style: 'font-size:12px;line-height:1.6;margin:0' },
          'Lumenforge — an incremental game of light, inspired by Antimatter Dimensions and Cookie Clicker. ' +
          'Made with plain HTML, CSS and JavaScript. Fill the universe with Infinite Light (1.79e308) to finish the story.'))));
  UI.opt = o;
}
function updateOptions() {
  const o = UI.opt;
  if (document.activeElement !== o.notation) o.notation.value = S.settings.notation;
  ['news', 'particles', 'confirmNova', 'confirmCollapse', 'offline'].forEach(k => { o[k].checked = !!S.settings[k]; });
  setText(UI.saveInfo, 'Last saved: ' + new Date(S.lastSave).toLocaleTimeString());
}
function applySettings() {
  NOTATION.setting = S.settings.notation;
  show($('news'), S.settings.news);
}
function exportDialog() {
  const str = encodeSave(S);
  const ta = h('textarea', { readonly: 'readonly' }); ta.value = str;
  showModal('Export save', [h('p', null, 'Copy this text and keep it somewhere safe.'), ta], [
    { text: 'Copy', fn: () => { ta.select(); try { navigator.clipboard.writeText(str); toast('Save copied to clipboard.', 'good'); } catch (e) { document.execCommand('copy'); } return false; } },
    { text: 'Download', fn: () => { const a = h('a', { href: 'data:text/plain;charset=utf-8,' + encodeURIComponent(str), download: 'lumenforge-save.txt' }); document.body.append(a); a.click(); a.remove(); return false; } },
    { text: 'Close' }]);
  setTimeout(() => ta.select(), 50);
}
function importDialog() {
  const ta = h('textarea', { placeholder: 'Paste your save here…' });
  showModal('Import save', [h('p', null, 'This will overwrite your current game.'), ta], [
    { text: 'Cancel' },
    { text: 'Import', fn: () => {
      try { importSave(ta.value); rebuildAll(); toast('Save imported!', 'good'); }
      catch (e) { toast('Import failed: ' + e.message, 'bad'); return false; }
    } }]);
  setTimeout(() => ta.focus(), 50);
}
function resetDialog() {
  const inp = h('input', { placeholder: 'type RESET', style: 'width:100%' });
  showModal('Hard reset', [h('p', null, 'This permanently deletes ALL progress, including achievements. Type RESET to confirm.'), inp], [
    { text: 'Cancel' },
    { text: 'Delete everything', cls: 'danger', fn: () => {
      if (inp.value.trim().toUpperCase() !== 'RESET') { toast('Type RESET to confirm.', 'bad'); return false; }
      hardReset(); rebuildAll(); showIntro();
    } }]);
}

// ======================= left side & header =======================
function updateHeader() {
  setText($('lightAmount'), fmt(S.light));
  setText($('lightRate'), fmt(D.lps));
  show($('chipSD'), S.stats.totalNovas > 0 || S.stats.collapses > 0);
  setText($('sdAmount'), fmt(S.stardust));
  show($('chipDM'), S.stats.collapses > 0);
  setText($('dmAmount'), fmt(S.darkMatter));
  // trial banner
  const tb = $('trialBanner');
  show(tb, !!S.trial);
  if (S.trial) {
    const t = TRIAL_BY_ID[S.trial];
    const pct = Math.min(100, log10(Math.max(1, S.run.best)) / log10(t.goal) * 100);
    let extra = inTrial('t7') ? ' · ' + fmtTime(Math.max(0, 360 - S.run.time)) + ' left' : '';
    if (tb._t !== S.trial) {
      tb._t = S.trial;
      tb.innerHTML = '';
      tb.append(h('span', null, 'Trial: ', h('b', null, t.name), ' — ', UI.tbText = h('span')), h('button', { class: 'small', onclick: () => { exitTrial(); updateAll(true); } }, 'Exit Trial'));
    }
    setText(UI.tbText, 'goal ' + fmt(t.goal) + ' Light (' + pct.toFixed(0) + '%)' + extra);
  } else tb._t = null;
  document.body.classList.toggle('cold', inTrial('t4'));
}
function updateLeft() {
  setText($('clickValue'), inTrial('t1') ? '—' : fmt(D.clickValue));
  setText($('heatValue'), S.heat.toFixed(0));
  setText($('heatBonus'), '(×' + (1 + S.heat / 100 * heatPower()).toFixed(2) + ')');
  $('heatRing').style.setProperty('--heat', (S.heat * 3.6) + 'deg');
  // buffs
  const bf = $('buffs');
  let html = '';
  if (S.comet.flare > 0) html += '<div class="buff flare">☀ Solar Flare: production ×' + flareBuffMult() + ' · ' + S.comet.flare.toFixed(0) + 's<div class="bar" style="width:' + (S.comet.flare / (30 * cometDuration()) * 100) + '%"></div></div>';
  if (S.comet.wind > 0) html += '<div class="buff wind">🌬 Stellar Wind: clicks ×' + windBuffMult() + ' · ' + S.comet.wind.toFixed(0) + 's<div class="bar" style="width:' + (S.comet.wind / (12 * cometDuration()) * 100) + '%"></div></div>';
  if (hasStar('h4')) html += '<div class="buff">Momentum ×' + momentumMult().toFixed(2) + '</div>';
  if (hasStar('e1')) html += '<div class="buff">Smoldering ×' + fmt(smolderMult(), 2) + '</div>';
  if (D.autoClick > 0) html += '<div class="buff">Self-stoking: ' + D.autoClick + ' clicks/s</div>';
  setHTML(bf, html);

  // supernova button
  const nb = $('btnSupernova'), hint = $('novaHint');
  const novaVisible = S.stats.totalNovas > 0 || S.stats.bestLight >= 1e15 || S.trial;
  show(nb, novaVisible);
  const can = canSupernova();
  nb.disabled = !can; cls(nb, 'ready', can);
  const goal = novaGoal();
  if (S.trial) {
    setText(nb.querySelector('.pb-title'), can ? 'Complete Trial' : 'Trial in progress');
    setText($('novaSub'), can ? 'Supernova to complete ' + TRIAL_BY_ID[S.trial].name + (D.sdGain ? ' (+' + fmt(D.sdGain) + ' SD)' : '') : 'Reach ' + fmt(goal) + ' Light');
  } else {
    setText(nb.querySelector('.pb-title'), 'Go Supernova');
    if (can) {
      const rate = D.sdGain / Math.max(1, S.run.time) * 60;
      setText($('novaSub'), '+' + fmt(D.sdGain) + ' Stardust · ' + fmt(rate, 1) + '/min');
    } else setText($('novaSub'), 'Reach ' + fmt(goal) + ' Light (' + Math.min(99, log10(Math.max(1, S.run.best)) / log10(goal) * 100).toFixed(0) + '%)');
  }
  if (can && !S.trial) {
    setText(hint, 'Stardust gain grows ×' + (log10(S.run.best) - 30 > 30 ? '1.12' : '1.26') + ' for every 10× more Light reached this run. Watch the rate per minute!');
  } else setText(hint, S.stats.totalNovas === 0 && novaVisible ? 'A Supernova resets your Light, generators, Pulses, Ignitions, Flares and Upgrades for Stardust.' : '');

  // collapse button
  const cb = $('btnCollapse');
  const colVisible = S.stats.collapses > 0 || S.fusion.el[5] > 0 || S.stats.bestLight >= 1e80;
  show(cb, colVisible); show($('collapseHint'), colVisible && !canCollapse());
  const cc = canCollapse();
  cb.disabled = !cc; cls(cb, 'ready', cc);
  if (cc) setText($('collapseSub'), '+' + fmt(D.dmGain) + ' Dark Matter');
  else setText($('collapseSub'), 'Needs ' + fmt(COLLAPSE_REQ) + ' Light & ' + COLLAPSE_IRON + ' Iron');
  setText($('collapseHint'), S.trial ? 'You cannot Collapse during a Trial.' :
    'Light this run: ' + fmt(S.run.best) + ' / ' + fmt(COLLAPSE_REQ) + ' · Iron: ' + fmt(S.fusion.el[5], 1) + ' / ' + COLLAPSE_IRON);
}

// ======================= orchestration =======================
const PANEL = {
  forge: [buildForge, updateForge], upgrades: [buildUpgrades, updateUpgrades], stars: [buildStars, updateStars],
  trials: [buildTrials, updateTrials], reactor: [buildReactor, updateReactor], horizon: [buildHorizon, updateHorizon],
  achievements: [buildAchievements, updateAchievements], stats: [buildStats, updateStats], options: [buildOptions, updateOptions],
};
function rebuildAll() {
  recompute();
  for (const k in PANEL) PANEL[k][0]();
  buildTabs();
  applySettings();
  updateAll(true);
}
let lastStatsUpdate = 0;
function updateAll(force) {
  recompute();
  updateHeader();
  updateLeft();
  updateTabs();
  if (UI.tab === 'stats') {
    const now = performance.now();
    if (!force && now - lastStatsUpdate < 500) return;
    lastStatsUpdate = now;
  }
  PANEL[UI.tab][1]();
}

// ======================= toasts, modals, tooltip =======================
function toast(html, kind, ms) {
  if (UI.quiet) return;
  const box = $('toasts');
  while (box.childElementCount >= 6) box.firstChild.remove();
  const t = h('div', { class: 'toast' + (kind ? ' t-' + kind : ''), html });
  t.addEventListener('click', () => t.remove());
  box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms || 4500);
}
function showModal(title, body, buttons) {
  setText($('modalTitle'), title);
  const mb = $('modalBody'); mb.innerHTML = '';
  if (typeof body === 'string') mb.innerHTML = body; else body.forEach(x => mb.append(x));
  const bb = $('modalButtons'); bb.innerHTML = '';
  (buttons || [{ text: 'OK' }]).forEach(b => {
    bb.append(h('button', { class: b.cls || '', onclick: () => { const r = b.fn ? b.fn() : undefined; if (r !== false) closeModal(); } }, b.text));
  });
  show($('modalBack'), true);
}
function closeModal() { show($('modalBack'), false); }
function modalOpen() { return !$('modalBack').classList.contains('hidden'); }
function confirmAction(title, text, okText, fn) {
  showModal(title, '<p>' + esc(text) + '</p>', [{ text: 'Cancel' }, { text: okText, cls: 'can', fn }]);
}
function initTooltip() {
  const tip = $('tooltip');
  document.addEventListener('mousemove', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { show(tip, false); return; }
    const [t, b] = el.getAttribute('data-tip').split('|');
    setHTML(tip, '<div class="tt-t">' + esc(t) + '</div>' + (b ? esc(b) : ''));
    show(tip, true);
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 10;
    if (y + hh > innerHeight - 8) y = e.clientY - hh - 10;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
}

// ======================= star & effects =======================
function onStarClick(e) {
  if (inTrial('t1')) { floatText('The Moonless Night swallows your touch', 0, 0); return; }
  const v = clickStar(performance.now());
  const star = $('star');
  star.classList.add('pressed'); setTimeout(() => star.classList.remove('pressed'), 70);
  if (S.settings.particles) {
    const rect = $('starWrap').getBoundingClientRect();
    const x = e && e.clientX ? e.clientX - rect.left - 115 : (Math.random() - 0.5) * 60;
    const y = e && e.clientY ? e.clientY - rect.top - 115 : (Math.random() - 0.5) * 60;
    floatText('+' + fmt(v), x, y);
    sparks(x, y, 5);
  }
}
function floatText(text, x, y) {
  const f = h('div', { class: 'floater' }, text);
  f.style.left = (115 + x) + 'px'; f.style.top = (115 + y - 10) + 'px';
  $('floaters').append(f);
  setTimeout(() => f.remove(), 1000);
}
function sparks(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 50;
    const s = h('div', { class: 'spark-p' });
    s.style.left = (115 + x) + 'px'; s.style.top = (115 + y) + 'px';
    s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d + 'px');
    $('floaters').append(s);
    setTimeout(() => s.remove(), 700);
  }
}
function flashStar() { sparks(0, 0, 18); }
function flash(kind) {
  const f = h('div', { class: 'flash ' + kind });
  document.body.append(f);
  setTimeout(() => f.remove(), kind === 'infinite' ? 3000 : 1200);
}

// comets
function spawnComet() {
  if (UI.quiet || document.hidden) return;
  const layer = $('cometLayer');
  const fromLeft = Math.random() < 0.5;
  const y0 = 10 + Math.random() * 60, y1 = y0 + (Math.random() * 30 - 10);
  const c = h('div', { class: 'comet' });
  const W = innerWidth, H = innerHeight;
  const x0 = fromLeft ? -60 : W + 60, x1 = fromLeft ? W + 60 : -60;
  const ang = Math.atan2((y1 - y0) / 100 * H, x1 - x0) * 180 / Math.PI;
  c.style.setProperty('--tail', ang + 'deg');
  c.style.left = '0px'; c.style.top = '0px';
  c.style.transform = 'translate(' + x0 + 'px,' + (y0 / 100 * H) + 'px)';
  layer.append(c);
  const dur = 13000;
  const start = performance.now();
  let dead = false;
  const step = now => {
    if (dead) return;
    const t = (now - start) / dur;
    if (t >= 1) { c.remove(); return; }
    const x = x0 + (x1 - x0) * t, y = (y0 + (y1 - y0) * t) / 100 * H + Math.sin(t * 6) * 12;
    c.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  c.addEventListener('mousedown', e => {
    e.stopPropagation();
    dead = true;
    const r = c.getBoundingClientRect();
    catchComet();
    cometBurst(r.left + r.width / 2, r.top + r.height / 2);
    c.remove();
    updateAll();
  });
}
function cometBurst(x, y) {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 80;
    const s = h('div', { class: 'spark-p' });
    s.style.position = 'fixed'; s.style.left = x + 'px'; s.style.top = y + 'px'; s.style.zIndex = 6;
    s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d + 'px');
    document.body.append(s);
    setTimeout(() => s.remove(), 700);
  }
}

// ======================= news ticker =======================
const News = { x: 0, w: 0, el: null };
function nextNews() {
  const pool = NEWS.filter(n => { try { return n.c(); } catch (e) { return false; } });
  const n = pool[Math.floor(Math.random() * pool.length)] || NEWS[0];
  News.el.textContent = n.t.replace('{comets}', fmt(S.stats.comets));
  News.w = News.el.offsetWidth;
  News.x = $('news').offsetWidth;
}
function tickNews(dt) {
  if (!S.settings.news) return;
  if (!News.el) { News.el = $('newsText'); nextNews(); }
  News.x -= 80 * dt;
  if (News.x < -News.w - 20) nextNews();
  News.el.style.transform = 'translateX(' + (News.x - $('news').offsetWidth) + 'px)';
}

// ======================= background sky =======================
const Sky = { stars: [], ctx: null, w: 0, h: 0 };
function initSky() {
  const cv = $('sky');
  Sky.ctx = cv.getContext('2d');
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    Sky.w = cv.width = innerWidth * dpr; Sky.h = cv.height = innerHeight * dpr; Sky.dpr = dpr;
  };
  resize(); addEventListener('resize', resize);
  for (let i = 0; i < 420; i++) Sky.stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.2, p: Math.random() * 6.28, s: 0.5 + Math.random() * 2, hue: Math.random() });
}
function drawSky(time) {
  const c = Sky.ctx; if (!c) return;
  c.clearRect(0, 0, Sky.w, Sky.h);
  // The universe fills with stars as your Light grows.
  const prog = Math.min(1, log10(Math.max(1, S.stats.bestLight)) / 308);
  const n = Math.floor(40 + prog * 380);
  const t = time / 1000;
  for (let i = 0; i < n; i++) {
    const s = Sky.stars[i];
    const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
    const col = S.stats.collapses > 0 && s.hue < 0.25 ? '200,160,255' : s.hue < 0.15 ? '160,200,255' : s.hue > 0.9 ? '255,200,150' : '255,245,230';
    c.fillStyle = 'rgba(' + col + ',' + (a * 0.85) + ')';
    c.beginPath(); c.arc(s.x * Sky.w, s.y * Sky.h, s.r * Sky.dpr, 0, 6.283); c.fill();
  }
  // nebula glow grows with progress
  if (prog > 0.1) {
    const g = c.createRadialGradient(Sky.w * 0.75, Sky.h * 0.35, 0, Sky.w * 0.75, Sky.h * 0.35, Sky.w * 0.6);
    g.addColorStop(0, 'rgba(255,140,60,' + (0.06 * prog) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, Sky.w, Sky.h);
  }
  if (S.stats.collapses > 0) {
    const g = c.createRadialGradient(Sky.w * 0.2, Sky.h * 0.8, 0, Sky.w * 0.2, Sky.h * 0.8, Sky.w * 0.5);
    g.addColorStop(0, 'rgba(140,80,255,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, Sky.w, Sky.h);
  }
}

// ======================= story =======================
function showIntro() {
  showModal('Lumenforge', '<p class="story">The universe is cold. Every star has burned out. Every world is dark.</p>' +
    '<p class="story">But in the deepest void, one ember remains — and it remembers how to burn.</p>' +
    '<p>Click the <b>Star</b> to make Light. Spend Light on <b>Sparks</b>, which make Light on their own. Each tier of fire feeds the one below it. Every 10 of a generator doubles its power.</p>' +
    '<p class="muted">Your progress is saved automatically.</p>', [{ text: 'Kindle the Star', cls: 'can', fn: () => { S.flags.intro = true; } }]);
}
const STORY = {
  firstNova: ['Supernova', '<p class="story">Your star could hold no more. It tore itself apart in a blinding flash — and from its ashes, <span style="color:var(--sd)">Stardust</span> scattered across the dark.</p>' +
    '<p>Stardust permanently strengthens every generator tier. Spend it in the <b>Constellations</b> tab: The Forge for raw power, The Cosmos for automation, and choose between <b>The Hand</b> (active play) or <b>The Hearth</b> (idle play).</p>'],
  trials: ['Trials', '<p class="story">The cosmos tests those who would rekindle it.</p><p><b>Trials</b> are restricted runs with a Light goal. Complete them for permanent rewards. They unlock one after another.</p>'],
  reactor: ['The Reactor', '<p class="story">Deep inside the star, pressure builds. Atoms long dormant begin to fuse.</p><p>The <b>Reactor</b> tab is available. For ' + FUSION_UNLOCK_COST + ' Stardust you can ignite it and forge elements, from Hydrogen up to Iron. Iron is the key to what comes next.</p>'],
  collapse: ['Collapse', '<p class="story">Iron does not burn. Your star, choked with it, folds inward — past density, past light, past time. Where it stood, a <span style="color:var(--dm)">Black Hole</span> now drinks the dark.</p>' +
    '<p>Dark Matter can be spent on the <b>Horizon</b> in the Black Hole tab. The <b>Siphon</b> lets the Black Hole feed on your Light to grow its Mass — slowing Light now, but boosting Stardust and fusion forever.</p>'],
};
function story(key) {
  if (S.flags['story_' + key]) return;
  S.flags['story_' + key] = true;
  const [t, b] = STORY[key];
  if (!UI.quiet) showModal(t, b);
}
function showEnding() {
  flash('infinite');
  showModal('Infinite Light', '<div class="ending-glow">✦</div>' +
    '<p class="story">Light pours from every direction. There is no darkness left to fill. Every void is warm; every shadow is gone.</p>' +
    '<p class="story">You were the last ember of a dead universe. Now you are the universe.</p>' +
    '<p>You reached <b>Infinite Light</b> after ' + fmtTime(S.stats.playTime) + ', ' + fmt(S.stats.totalNovas) + ' Supernovas and ' + fmt(S.stats.collapses) + ' Collapses.</p>' +
    '<p class="muted">Thank you for playing! You can keep going — there are achievements to finish, and the Eternal Flame awaits those who reach Infinite Light three times.</p>',
    [{ text: 'Keep burning', cls: 'can' }]);
}
