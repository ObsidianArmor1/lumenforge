'use strict';
// Saving, loading, import/export and offline progress.

const SAVE_KEY = 'lumenforge_save_v1';

function encodeSave(state) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}
function decodeSave(str) {
  str = (str || '').trim();
  if (!str) throw new Error('Empty save');
  let json;
  try { json = decodeURIComponent(escape(atob(str))); } catch (e) { json = str; } // also accept raw JSON
  let obj;
  try { obj = JSON.parse(json); } catch (e) { throw new Error('That does not look like a Lumenforge save'); }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.gens)) throw new Error('Not a Lumenforge save');
  return obj;
}

// Merge a saved object onto fresh defaults so new fields always exist.
function mergeState(def, saved) {
  if (saved === undefined || saved === null) return def;
  if (Array.isArray(def)) {
    if (!Array.isArray(saved)) return def;
    return def.map((d, i) => (i < saved.length ? mergeState(d, saved[i]) : d));
  }
  if (typeof def === 'object' && def !== null) {
    if (typeof saved !== 'object') return def;
    // dynamic maps (upgrades, stars, achievements…) default to {}: copy wholesale
    if (Object.keys(def).length === 0) return Object.assign({}, saved);
    const out = {};
    for (const k in def) out[k] = mergeState(def[k], saved[k]);
    return out;
  }
  if (typeof def === 'number') return (typeof saved === 'number' && saved === saved) ? saved : def;
  if (typeof def === 'boolean') return !!saved;
  if (def === null) return saved; // e.g. trial id
  return typeof saved === typeof def ? saved : def;
}

function saveGame(silent) {
  try {
    S.lastSave = Date.now();
    localStorage.setItem(SAVE_KEY, encodeSave(S));
    if (!silent) Events.emit('saved');
    return true;
  } catch (e) {
    console.error('Save failed', e);
    return false;
  }
}

function loadGame() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
  if (!raw) { S = newState(); return false; }
  try {
    S = mergeState(newState(), decodeSave(raw));
    return true;
  } catch (e) {
    console.error('Load failed, starting fresh', e);
    S = newState();
    return false;
  }
}

function importSave(str) {
  const obj = decodeSave(str);
  S = mergeState(newState(), obj);
  S.lastSave = Date.now();
  recompute();
  saveGame(true);
}

function hardReset() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  S = newState();
  recompute();
  saveGame(true);
}

// Simulate time away. Returns a summary object or null.
function offlineProgress(seconds) {
  if (seconds < 10) return null;
  const cap = 24 * 3600;
  const t = Math.min(seconds, cap);
  const before = { light: S.light, sd: S.stardust, dm: S.darkMatter, novas: S.stats.totalNovas, collapses: S.stats.collapses };
  const steps = Math.min(20000, Math.max(50, Math.floor(t / 0.05)));
  const dt = t / steps;
  for (let i = 0; i < steps; i++) tick(dt, true);
  return {
    seconds: t, capped: seconds > cap,
    light: S.light, lightBefore: before.light,
    sd: S.stardust - before.sd, dm: S.darkMatter - before.dm,
    novas: S.stats.totalNovas - before.novas, collapses: S.stats.collapses - before.collapses,
  };
}
