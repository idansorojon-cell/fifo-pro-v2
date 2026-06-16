/**
 * FIFO PRO — utils.js
 * פונקציות עזר גלובליות, פורמטים, חישובים
 */

// ── קבועים ────────────────────────────────────────────────
const TAX         = 0.25;
const DEFAULT_ILS = 3.5;

const MONTHLY_ILS = {
  '2025-03':3.66,'2025-04':3.68,'2025-05':3.59,'2025-06':3.45,
  '2025-07':3.38,'2025-08':3.36,'2025-09':3.34,'2025-10':3.29,
  '2025-11':3.24,'2025-12':3.20,
  '2026-01':3.15,'2026-02':3.10,'2026-03':3.06,'2026-04':3.02,
  '2026-05':2.94,'2026-06':2.98
};

const GREEN = '#4ecca8';
const RED   = '#ff6b6b';
const BLUE  = '#64b5f6';
const GOLD  = '#ffd166';

// ── פורמטים ────────────────────────────────────────────────

/** $1,234 or -$1,234 */
const f$ = v =>
  (v < 0 ? '-$' : '$') +
  Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** ₪1,234 or -₪1,234 */
const fILS = v =>
  (v < 0 ? '-₪' : '₪') +
  Math.abs(v).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** +12.3% or -5.0% */
const fpct = v => (v >= 0 ? '+' : '') + Number(v).toFixed(1) + '%';

/** 1,234 */
const fnum = v => Math.round(v).toLocaleString();

/** $12.34 */
const fprice = v => '$' + Number(v).toFixed(2);

// ── תאריכים ────────────────────────────────────────────────

/** DD/MM/YYYY → Date */
function parseDD(s) {
  if (!s) return new Date(0);
  const [d, m, y] = String(s).split('/');
  return new Date(+y, +m - 1, +d);
}

/** Date → DD/MM/YYYY */
function toDD(date) {
  const d = new Date(date);
  return String(d.getDate()).padStart(2,'0') + '/' +
         String(d.getMonth()+1).padStart(2,'0') + '/' +
         d.getFullYear();
}

/** YYYY-MM-DD → DD/MM/YYYY */
function isoToDD(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** DD/MM/YYYY → YYYY-MM-DD */
function ddToISO(s) {
  if (!s) return '';
  const [d, m, y] = s.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

/** YYYY-MM → תווית עברית */
function monthLabel(m) {
  const [y, mo] = m.split('-');
  const names = ['ינו','פבר','מרץ','אפר','מאי','יוני','יול','אוג','ספט','אוק','נוב','דצמ'];
  return names[+mo - 1] + "'" + y.slice(2);
}

/** → YYYY-MM של היום */
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// ── מטבע ───────────────────────────────────────────────────

function rateForMonth(month) {
  return MONTHLY_ILS[month] || DEFAULT_ILS;
}

function usdToIls(v, month = currentMonthKey()) {
  return (Number(v) || 0) * rateForMonth(month);
}

function tradesNetIls(arr) {
  return arr.reduce((sum, t) => sum + usdToIls(t.net, t.month), 0);
}

// ── נרמול עסקה ─────────────────────────────────────────────

function normalizeTrade(t) {
  ['buy_date','sell_date'].forEach(key => {
    const v = t[key]; if (!v) return;
    const s = String(v).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return;
    const d = new Date(s);
    if (!isNaN(d.getTime()))
      t[key] = String(d.getDate()).padStart(2,'0') + '/' +
               String(d.getMonth()+1).padStart(2,'0') + '/' +
               d.getFullYear();
  });
  if (t.sell_date && /^\d{2}\/\d{2}\/\d{4}$/.test(t.sell_date)) {
    const [d, m, y] = t.sell_date.split('/');
    t.month = y + '-' + m.padStart(2,'0');
  }
  ['id','qty','buy_price','sell_price','cost','gross','tax','net','pct','hold_days'].forEach(k => {
    if (t[k] !== undefined && t[k] !== '') t[k] = parseFloat(t[k]) || 0;
  });
  return t;
}

// ── חישובים ────────────────────────────────────────────────

/** חישוב סטטיסטיקות מלאות על מערך עסקאות */
function calcStats(trades = window.APP?.trades || []) {
  const wins   = trades.filter(t => t.net > 0);
  const losses = trades.filter(t => t.net < 0);
  const totalNet    = trades.reduce((s, t) => s + t.net, 0);
  const totalNetIls = tradesNetIls(trades);
  const gp = wins.reduce((s,t)   => s + t.gross, 0);
  const gl = Math.abs(losses.reduce((s,t) => s + t.gross, 0));

  // לפי חודש
  const byMonth = {};
  trades.forEach(t => {
    if (!byMonth[t.month]) byMonth[t.month] = { net:0, trades:0, wins:0 };
    byMonth[t.month].net += t.net;
    byMonth[t.month].trades++;
    if (t.net > 0) byMonth[t.month].wins++;
  });
  const monthArr = Object.entries(byMonth)
    .sort((a,b) => a[0].localeCompare(b[0]))
    .map(([m,v]) => ({ month:m, label:monthLabel(m), net:Math.round(v.net), trades:v.trades, wins:v.wins }));
  let cum = 0;
  const equity = monthArr.map(m => ({ label:m.label, cum: Math.round(cum += m.net) }));

  // לפי סימבול
  const bySym = {};
  trades.forEach(t => {
    if (!bySym[t.symbol]) bySym[t.symbol] = { net:0, trades:0, wins:0, losses:0,
      totalCost:0, grossWin:0, grossLoss:0, holdDays:0 };
    const s = bySym[t.symbol];
    s.net += t.net; s.trades++; s.totalCost += (t.cost||0); s.holdDays += (t.hold_days||0);
    if (t.net > 0) { s.wins++; s.grossWin += t.gross; }
    else { s.losses++; s.grossLoss += Math.abs(t.gross); }
  });
  const symArr = Object.entries(bySym)
    .map(([sym, v]) => ({
      symbol: sym, net: Math.round(v.net), trades: v.trades,
      winRate: Math.round(v.wins / v.trades * 100),
      avgHold: v.trades ? (v.holdDays / v.trades).toFixed(1) : 0,
      pf: v.grossLoss > 0 ? +(v.grossWin / v.grossLoss).toFixed(2) : (v.grossWin > 0 ? 99 : 0),
      avgWin:  v.wins   ? Math.round(v.grossWin   * 0.75 / v.wins)   : 0,
      avgLoss: v.losses ? Math.round(v.grossLoss  * 0.75 / v.losses) : 0,
    }))
    .sort((a,b) => b.net - a.net);

  // Advanced
  const sorted = [...trades].sort((a,b) => parseDD(a.sell_date) - parseDD(b.sell_date));
  let maxWS=0,curWS=0,maxLS=0,curLS=0;
  sorted.forEach(t => {
    if (t.net > 0)  { curWS++; maxWS = Math.max(maxWS,curWS); curLS=0; }
    else if (t.net < 0) { curLS++; maxLS = Math.max(maxLS,curLS); curWS=0; }
  });

  const largestWin  = trades.reduce((m,t) => t.net>m ? t.net : m, 0);
  const largestLoss = trades.reduce((m,t) => t.net<m ? t.net : m, 0);

  const avgHold = trades.length ? trades.reduce((s,t) => s+(t.hold_days||0),0) / trades.length : 0;
  const avgWin  = wins.length   ? wins.reduce((s,t)=>s+t.net,0)   / wins.length   : 0;
  const avgLoss = losses.length ? losses.reduce((s,t)=>s+t.net,0) / losses.length : 0;

  const expectancy = (wins.length && losses.length)
    ? (wins.length/trades.length * Math.abs(avgWin)) -
      (losses.length/trades.length * Math.abs(avgLoss))
    : 0;

  // Kelly %
  const wr = trades.length ? wins.length / trades.length : 0;
  const rr = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;
  const kelly = rr > 0 ? Math.max(0, wr - (1-wr)/rr) : 0;

  // Sharpe (monthly)
  const monthNets = monthArr.map(m => m.net);
  const mMean = monthNets.length ? monthNets.reduce((s,v)=>s+v,0)/monthNets.length : 0;
  const mStd  = monthNets.length > 1
    ? Math.sqrt(monthNets.reduce((s,v)=>s+Math.pow(v-mMean,2),0)/(monthNets.length-1))
    : 0;
  const sharpe = mStd > 0 ? +(mMean / mStd).toFixed(2) : 0;

  // Max Drawdown
  let peak2=0, maxDD=0;
  equity.forEach(e => {
    peak2 = Math.max(peak2, e.cum);
    maxDD  = Math.min(maxDD, e.cum - peak2);
  });

  // Profit Factor
  const pf = gl > 0 ? +(gp / gl).toFixed(2) : (gp > 0 ? 99 : 0);

  // Daily PnL for heatmap
  const byDate = {};
  trades.forEach(t => {
    if (!t.sell_date) return;
    const [d,m,y] = t.sell_date.split('/');
    const k = `${y}-${m}-${d}`;
    byDate[k] = (byDate[k]||0) + t.net;
  });

  // By day of week
  const byDow = {};
  trades.forEach(t => {
    if (!t.sell_date) return;
    const dow = parseDD(t.sell_date).getDay();
    if (!byDow[dow]) byDow[dow] = { net:0, c:0 };
    byDow[dow].net += t.net; byDow[dow].c++;
  });

  // Hold buckets
  const holdBuckets = {'0 ימים':0,'1-3 ימים':0,'4-7 ימים':0,'8-14 ימים':0,'15-30 ימים':0,'30+ ימים':0};
  trades.forEach(t => {
    const d = t.hold_days||0;
    if (d===0) holdBuckets['0 ימים']+=t.net;
    else if (d<=3) holdBuckets['1-3 ימים']+=t.net;
    else if (d<=7) holdBuckets['4-7 ימים']+=t.net;
    else if (d<=14) holdBuckets['8-14 ימים']+=t.net;
    else if (d<=30) holdBuckets['15-30 ימים']+=t.net;
    else holdBuckets['30+ ימים']+=t.net;
  });

  // Size buckets
  const sizeBuckets = {'<$5k':0,'$5k-15k':0,'$15k-30k':0,'$30k+':0};
  trades.forEach(t => {
    const c = t.cost||0;
    if (c<5000) sizeBuckets['<$5k']+=t.net;
    else if (c<15000) sizeBuckets['$5k-15k']+=t.net;
    else if (c<30000) sizeBuckets['$15k-30k']+=t.net;
    else sizeBuckets['$30k+']+=t.net;
  });

  const curMonth = currentMonthKey();
  const curMonthNet = (byMonth[curMonth]||{}).net || 0;

  // Recovery Factor
  const recoveryFactor = maxDD !== 0 ? +(totalNet / Math.abs(maxDD)).toFixed(2) : 0;

  return {
    totalNet, totalNetIls, wins: wins.length, losses: losses.length, total: trades.length,
    winRate: trades.length ? Math.round(wins.length/trades.length*100) : 0,
    pf, avgWin, avgLoss, avgHold,
    monthArr, equity, curMonth, curMonthNet, symArr, byDate, byDow,
    holdBuckets, sizeBuckets,
    largestWin, largestLoss, maxWS, maxLS,
    expectancy, kelly, sharpe, maxDD, recoveryFactor,
    gp, gl
  };
}

// ── DOM helpers ────────────────────────────────────────────

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function setHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function show(id) { const el = $(id); if (el) el.style.display=''; }
function hide(id) { const el = $(id); if (el) el.style.display='none'; }

// ── LocalStorage helpers ────────────────────────────────────

const LS = {
  get: (key, fallback=null) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set: (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
};

// ── Debounce ───────────────────────────────────────────────

function debounce(fn, ms=300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Chart defaults ─────────────────────────────────────────

function chartDefaults(dark=false) {
  const textColor = dark ? '#8892a4' : '#999';
  const gridColor = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
  return {
    ticks: { color: textColor, font: { size: 10 } },
    grid:  { color: gridColor },
    tooltip: {
      bodyColor:   dark ? '#e8e8e8' : '#333',
      titleColor:  dark ? '#e8e8e8' : '#333',
      backgroundColor: dark ? '#1e2535' : '#fff',
      borderColor: dark ? '#2a3044' : '#eee',
      borderWidth: 1
    }
  };
}

// ── Score color ────────────────────────────────────────────

function scoreColor(v) {
  if (v >= 75) return 'var(--green)';
  if (v >= 55) return 'var(--blue)';
  return 'var(--red)';
}

function scoreLabel(v) {
  if (v >= 75) return 'BUY';
  if (v >= 55) return 'WAIT';
  return 'AVOID';
}

function scoreLabelHE(v) {
  if (v >= 75) return 'כניסה מעניינת';
  if (v >= 55) return 'לחכות לאישור';
  return 'להימנע';
}

// ── Export ─────────────────────────────────────────────────

window.Utils = {
  TAX, DEFAULT_ILS, MONTHLY_ILS, GREEN, RED, BLUE, GOLD,
  f$, fILS, fpct, fnum, fprice,
  parseDD, toDD, isoToDD, ddToISO, monthLabel, currentMonthKey,
  rateForMonth, usdToIls, tradesNetIls,
  normalizeTrade, calcStats,
  $, $$, setHTML, show, hide, LS, debounce,
  chartDefaults, scoreColor, scoreLabel, scoreLabelHE
};
