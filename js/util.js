'use strict';
// Number formatting and small helpers. Shared by game (headless) and UI.

const NOTATION = { setting: 'scientific' };
const SHORT_SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
  'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'ODc', 'NDc', 'Vg', 'UVg', 'DVg', 'TVg',
  'QaVg', 'QiVg', 'SxVg', 'SpVg', 'OVg', 'NVg', 'Tg', 'UTg', 'DTg', 'TTg', 'QaTg', 'QiTg', 'SxTg',
  'SpTg', 'OTg', 'NTg', 'Qd', 'UQd', 'DQd', 'TQd', 'QaQd', 'QiQd', 'SxQd', 'SpQd', 'OQd', 'NQd',
  'Qq', 'UQq', 'DQq', 'TQq', 'QaQq', 'QiQq', 'SxQq', 'SpQq', 'OQq', 'NQq', 'Sg', 'USg', 'DSg',
  'TSg', 'QaSg', 'QiSg', 'SxSg', 'SpSg', 'OSg', 'NSg', 'St', 'USt', 'DSt', 'TSt', 'QaSt', 'QiSt',
  'SxSt', 'SpSt', 'OSt', 'NSt', 'Og', 'UOg', 'DOg', 'TOg', 'QaOg', 'QiOg', 'SxOg', 'SpOg', 'OOg',
  'NOg', 'Nn', 'UNn', 'DNn', 'TNn', 'QaNn', 'QiNn', 'SxNn', 'SpNn', 'ONn', 'NNn', 'Ce', 'UCe'];

function fmt(n, places) {
  if (places === undefined) places = 2;
  if (n === Infinity || n >= Number.MAX_VALUE) return '∞';
  if (n !== n) return 'NaN';
  if (n < 0) return '-' + fmt(-n, places);
  if (n < 1000) {
    if (n === Math.floor(n)) return String(n);
    if (n < 10) return n.toFixed(places);
    if (n < 100) return n.toFixed(Math.min(places, 1));
    return n.toFixed(0);
  }
  if (n < 1e6) return Math.floor(n).toLocaleString('en-US');
  let e = Math.floor(Math.log10(n));
  let m = n / Math.pow(10, e);
  if (m >= 9.995) { m = 1; e += 1; }
  switch (NOTATION.setting) {
    case 'engineering': {
      const e3 = Math.floor(e / 3) * 3;
      const m3 = n / Math.pow(10, e3);
      return m3.toFixed(m3 >= 100 ? 0 : m3 >= 10 ? 1 : 2) + 'e' + e3;
    }
    case 'short': {
      const i = Math.floor(e / 3);
      if (i < SHORT_SUFFIXES.length) {
        const m3 = n / Math.pow(10, i * 3);
        return m3.toFixed(m3 >= 100 ? 0 : m3 >= 10 ? 1 : 2) + ' ' + SHORT_SUFFIXES[i];
      }
      return m.toFixed(2) + 'e' + e;
    }
    case 'log':
      return 'e' + Math.log10(n).toFixed(2);
    default:
      return m.toFixed(2) + 'e' + e;
  }
}

// Integer-ish format (no decimals below 1000)
function fmtInt(n) {
  if (n < 1000) return String(Math.floor(n));
  return fmt(n);
}

function fmtMult(n) {
  if (n < 1000) return '×' + (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0));
  return '×' + fmt(n);
}

function fmtTime(sec) {
  if (sec === Infinity || sec !== sec) return '∞';
  if (sec < 1) return sec.toFixed(2) + 's';
  if (sec < 60) return sec.toFixed(1) + 's';
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600) % 24, d = Math.floor(sec / 86400);
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  return m + 'm ' + s + 's';
}

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function log10(x) { return x > 0 ? Math.log10(x) : 0; }
function safe(x) { return x !== x ? 0 : x > Number.MAX_VALUE ? Number.MAX_VALUE : x; }

if (typeof module !== 'undefined') module.exports = { fmt, fmtInt, fmtMult, fmtTime, clamp, log10, safe, NOTATION };
