'use strict';
// Boot, main loop, hotkeys.

let lastTick = Date.now(), uiAcc = 0, saveAcc = 0, lastFrame = performance.now();

function doSupernova() {
  if (!canSupernova()) return;
  const go = () => { if (supernova()) updateAll(true); };
  if (S.settings.confirmNova && !S.trial && S.stats.totalNovas > 0) {
    confirmAction('Go Supernova?', 'Gain ' + fmt(D.sdGain) + ' Stardust. Light, generators, Pulses, Ignitions, Flares' +
      (hasStar('c5') ? '' : ' and Upgrades') + ' will be reset.', 'Supernova', go);
  } else go();
}
function doCollapse() {
  if (!canCollapse()) return;
  const go = () => { if (collapse()) updateAll(true); };
  if (S.settings.confirmCollapse) {
    confirmAction('Collapse?', 'Gain ' + fmt(D.dmGain) + ' Dark Matter. Everything from the Supernova layer — Stardust, Constellations' +
      (hz('memory') || hz('starmem') ? ' (except those you remember)' : '') + ', elements' + (hz('ironmem') ? '' : ' and the Reactor') +
      ' — will be reset. Trials, achievements and Mass are kept.', 'Collapse', go);
  } else go();
}

function showOffline(r) {
  const parts = ['<p>You were away for <b>' + fmtTime(r.seconds) + '</b>' + (r.capped ? ' (capped at 24h)' : '') + '.</p>'];
  parts.push('<p>Light: ' + fmt(r.lightBefore) + ' → <b>' + fmt(r.light) + '</b></p>');
  if (r.novas > 0) parts.push('<p>Supernovas: +' + fmt(r.novas) + '</p>');
  if (r.sd > 0) parts.push('<p>Stardust: <span style="color:var(--sd)">+' + fmt(r.sd) + '</span></p>');
  if (r.collapses > 0) parts.push('<p>Collapses: +' + fmt(r.collapses) + ', Dark Matter: <span style="color:var(--dm)">+' + fmt(r.dm) + '</span></p>');
  showModal('Welcome back', parts.join(''), [{ text: 'Continue', cls: 'can' }]);
}

function checkStory() {
  if (modalOpen()) return;
  if (S.stats.totalNovas >= 1 && !S.flags.story_firstNova) story('firstNova');
  else if (trialsUnlocked() && !S.flags.story_trials) story('trials');
  else if (fusionVisible() && !S.flags.story_reactor) story('reactor');
  else if (S.stats.collapses >= 1 && !S.flags.story_collapse) story('collapse');
}

function gameLoop() {
  const now = Date.now();
  let dt = (now - lastTick) / 1000;
  lastTick = now;
  if (dt <= 0) return;
  if (dt > 60 && S.settings.offline) {
    // computer slept or tab was frozen: catch up quietly
    UI.quiet = true;
    const r = offlineProgress(dt);
    UI.quiet = false;
    if (r && dt > 300) showOffline(r);
    updateAll(true);
    return;
  }
  dt = Math.min(dt, 60);
  while (dt > 0) { const step = Math.min(dt, 1); tick(step, false); dt -= step; }

  uiAcc += 50;
  if (uiAcc >= 100) { uiAcc = 0; updateAll(); checkStory(); }
  saveAcc += 50;
  if (saveAcc >= (S.settings.autosave || 15) * 1000) { saveAcc = 0; saveGame(true); }
}

function frame(t) {
  const dt = Math.min(0.1, (t - lastFrame) / 1000);
  lastFrame = t;
  drawSky(t);
  tickNews(dt);
  requestAnimationFrame(frame);
}

function initInput() {
  const star = $('star');
  star.addEventListener('mousedown', e => { if (e.button === 0) { onStarClick(e); updateAll(); } });
  star.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; onStarClick({ clientX: t.clientX, clientY: t.clientY }); updateAll(); }, { passive: false });
  $('btnSupernova').addEventListener('click', doSupernova);
  $('btnCollapse').addEventListener('click', doCollapse);
  $('modalBack').addEventListener('mousedown', e => { if (e.target.id === 'modalBack' && $('modalButtons').childElementCount <= 1) closeModal(); });

  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (modalOpen()) { if (e.key === 'Escape') closeModal(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); if (!e.repeat) onStarClick(null); }
    else if (k === 'm') maxAll();
    else if (k === 'p') buyPulse(true);
    else if (k === 'i') { if (ignite()) flashStar(); }
    else if (k === 'f') { if (flare()) flash('nova'); }
    else if (k === 's') doSupernova();
    else if (k === 'c') doCollapse();
    else if (k >= '1' && k <= '8') buyGen(+k - 1, 'max');
    else return;
    updateAll();
  });
}

function boot() {
  const had = loadGame();
  NOTATION.setting = S.settings.notation;
  recompute();

  Events.on('notify', ({ text, kind }) => toast(esc(text), kind));
  Events.on('achievement', a => toast('<div class="tt">🏆 ' + esc(a.name) + '</div>' + esc(a.desc), 'ach', 5500));
  Events.on('cometSpawn', spawnComet);
  Events.on('supernova', g => { if (!UI.quiet) { flash('nova'); toast('Supernova! +' + fmt(g) + ' Stardust', 'good', 3000); } });
  Events.on('collapse', g => { if (!UI.quiet) { flash('collapse'); toast('Collapse! +' + fmt(g) + ' Dark Matter', 'good', 3500); } });
  Events.on('infinite', () => {
    if (UI.quiet) return;
    if (!S.endingSeen) { S.endingSeen = true; showEnding(); }
    else { flash('infinite'); toast('<b>Infinite Light</b> reached again! (' + S.stats.infinite + ')', 'good', 5000); }
  });
  Events.on('saved', () => toast('Game saved.', '', 1500));

  initSky();
  initTooltip();
  initInput();
  rebuildAll();

  if (had && S.settings.offline) {
    const away = (Date.now() - S.lastSave) / 1000;
    if (away > 10) {
      UI.quiet = true;
      const r = offlineProgress(away);
      UI.quiet = false;
      if (r && away > 60) showOffline(r);
      updateAll(true);
    }
  }
  if (!S.flags.intro) showIntro();
  lastTick = Date.now();
  setInterval(gameLoop, 50);
  requestAnimationFrame(frame);
  addEventListener('beforeunload', () => saveGame(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(true); });
}

boot();
