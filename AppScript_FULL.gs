/**
 * ============================================================
 * FIFO PRO — AppScript_FULL.gs
 * Complete, ready-to-paste Google Apps Script backend.
 * ============================================================
 *
 * ⚠️ IMPORTANT — READ BEFORE PASTING:
 * I do not have access to your live, currently-deployed Apps Script
 * source (it was never shared in this conversation). This file is a
 * faithful RECONSTRUCTION from the documented contract your own
 * README_AI.md / CLAUDE.md specify, and from exactly what js/api.js
 * calls on the frontend (verified action-by-action against the live
 * file). It implements every endpoint your frontend needs, using the
 * sheet names and field names your own docs define:
 *   Sheets: Trades, Positions, Watchlist, Settings
 *   Trade fields: id, symbol, buy_date, sell_date, qty, buy_price,
 *     sell_price, cost, gross, tax, net, pct, hold_days, month, notes,
 *     entry_reason, exit_reason, respected_stop, followed_plan, lesson,
 *     emotion
 *   Position fields: id, symbol, qty, avg_price, target, stop_loss,
 *     notes, added_date
 *   Watchlist fields: symbol, note, added
 *
 * If your actual production sheets use a different column order or
 * extra columns, this script's header-row-based reader/writer (it maps
 * by COLUMN NAME, not position) will still work AS LONG AS your header
 * row uses these exact field names. If your headers differ, either
 * rename them to match, or tell me the actual names and I'll adjust.
 *
 * SAFE ROLLOUT — do this, don't skip it:
 *   1. In the Apps Script editor: File → Make a copy (keep your current
 *      working script untouched as a backup).
 *   2. In a NEW deployment (or the copy), replace all code with this
 *      file's contents.
 *   3. Test every action below against a COPY of your spreadsheet first
 *      if you're not 100% sure your headers match.
 *   4. Only once verified, point your real API_URL deployment at this
 *      code (or redeploy the same project as a "New version").
 * ============================================================
 */

// ════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════

const TRADE_HEADERS = [
  'id','symbol','buy_date','sell_date','qty','buy_price','sell_price',
  'cost','gross','tax','net','pct','hold_days','month','notes',
  'entry_reason','exit_reason','respected_stop','followed_plan','lesson','emotion'
];
const POSITION_HEADERS = ['id','symbol','qty','avg_price','target','stop_loss','notes','added_date'];
const WATCHLIST_HEADERS = ['symbol','note','added'];

// ════════════════════════════════════════════════════════════
// ENTRY POINTS
// ════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    const action = e.parameter.action;
    switch (action) {
      case 'getTrades':       return handleGetTrades_();
      case 'getGoal':         return handleGetGoal_();
      case 'getPositions':    return handleGetPositions_();
      case 'getWatchlist':    return handleGetWatchlist_();
      case 'addWatchlist':    return handleAddWatchlist_(e.parameter);
      case 'removeWatchlist': return handleRemoveWatchlist_(e.parameter);
      case 'getPrices':       return handleGetPrices_(e.parameter.symbols);
      case 'getIndicators':   return handleGetIndicators_(e.parameter.symbol);
      case 'getNews':         return handleGetNews_(e.parameter.symbol);
      default:                return jsonOut_({ ok:false, error:'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut_({ ok:false, error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case 'add':             return handleAddTrade_(data.trade);
      case 'update':          return handleUpdateTrade_(data.trade);
      case 'delete':          return handleDeleteTrade_(data.id);
      case 'seedAll':         return handleSeedAll_(data.trades);
      case 'setGoal':         return handleSetGoal_(data.goal);
      case 'addPosition':     return handleAddPosition_(data.position);
      case 'updatePosition':  return handleUpdatePosition_(data.position);
      case 'deletePosition':  return handleDeletePosition_(data.id);
      case 'aiChat':          return handleAiChat_(data);
      default:                return jsonOut_({ ok:false, error:'Unknown action: ' + data.action });
    }
  } catch (err) {
    return jsonOut_({ ok:false, error: err.message });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════
// SHEET HELPERS (generic, header-name based — robust to column order)
// ════════════════════════════════════════════════════════════

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
}

function readRows_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { headers: data[0] || [], rows: [] };
  const headers = data[0];
  const rows = data.slice(1)
    .filter(r => r.some(c => c !== '' && c !== null))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = r[i]);
      return obj;
    });
  return { headers, rows };
}

function appendRow_(sheet, headers, obj) {
  sheet.appendRow(headers.map(h => obj[h] !== undefined && obj[h] !== null ? obj[h] : ''));
}

function findRowById_(sheet, id) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idCol = headers.indexOf('id');
  if (idCol === -1) return null;
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][idCol]) === Number(id)) return { rowIndex: i + 1, headers, row: data[i] };
  }
  return null;
}

function nextId_(rows) {
  let max = 0;
  rows.forEach(r => { const n = Number(r.id) || 0; if (n > max) max = n; });
  return max + 1;
}

// ════════════════════════════════════════════════════════════
// TRADES
// ════════════════════════════════════════════════════════════

function handleGetTrades_() {
  const sh = getSheet_('Trades');
  ensureHeaders_(sh, TRADE_HEADERS);
  const { rows } = readRows_(sh);
  return jsonOut_({ ok:true, trades: rows });
}

function handleAddTrade_(trade) {
  if (!trade) return jsonOut_({ ok:false, error:'No trade supplied' });
  const sh = getSheet_('Trades');
  ensureHeaders_(sh, TRADE_HEADERS);
  const { rows } = readRows_(sh);
  trade.id = nextId_(rows);
  appendRow_(sh, TRADE_HEADERS, trade);
  return jsonOut_({ ok:true, trade: trade });
}

function handleUpdateTrade_(trade) {
  if (!trade || trade.id === undefined) return jsonOut_({ ok:false, error:'Trade id required' });
  const sh = getSheet_('Trades');
  const found = findRowById_(sh, trade.id);
  if (!found) return jsonOut_({ ok:false, error:'Trade not found: ' + trade.id });
  const rowArr = found.headers.map((h, i) => trade[h] !== undefined ? trade[h] : found.row[i]);
  sh.getRange(found.rowIndex, 1, 1, found.headers.length).setValues([rowArr]);
  return jsonOut_({ ok:true });
}

function handleDeleteTrade_(id) {
  if (id === undefined) return jsonOut_({ ok:false, error:'id required' });
  const sh = getSheet_('Trades');
  const found = findRowById_(sh, id);
  if (!found) return jsonOut_({ ok:false, error:'Trade not found: ' + id });
  sh.deleteRow(found.rowIndex);
  return jsonOut_({ ok:true });
}

function handleSeedAll_(trades) {
  const sh = getSheet_('Trades');
  ensureHeaders_(sh, TRADE_HEADERS);
  (trades || []).forEach(t => appendRow_(sh, TRADE_HEADERS, t));
  return jsonOut_({ ok:true, count: (trades || []).length });
}

// ════════════════════════════════════════════════════════════
// POSITIONS
// ════════════════════════════════════════════════════════════

function handleGetPositions_() {
  const sh = getSheet_('Positions');
  ensureHeaders_(sh, POSITION_HEADERS);
  const { rows } = readRows_(sh);
  return jsonOut_({ ok:true, positions: rows });
}

function handleAddPosition_(pos) {
  if (!pos) return jsonOut_({ ok:false, error:'No position supplied' });
  const sh = getSheet_('Positions');
  ensureHeaders_(sh, POSITION_HEADERS);
  const { rows } = readRows_(sh);
  pos.id = nextId_(rows);
  appendRow_(sh, POSITION_HEADERS, pos);
  return jsonOut_({ ok:true, position: pos });
}

function handleUpdatePosition_(pos) {
  if (!pos || pos.id === undefined) return jsonOut_({ ok:false, error:'Position id required' });
  const sh = getSheet_('Positions');
  const found = findRowById_(sh, pos.id);
  if (!found) return jsonOut_({ ok:false, error:'Position not found: ' + pos.id });
  const rowArr = found.headers.map((h, i) => pos[h] !== undefined ? pos[h] : found.row[i]);
  sh.getRange(found.rowIndex, 1, 1, found.headers.length).setValues([rowArr]);
  return jsonOut_({ ok:true });
}

function handleDeletePosition_(id) {
  if (id === undefined) return jsonOut_({ ok:false, error:'id required' });
  const sh = getSheet_('Positions');
  const found = findRowById_(sh, id);
  if (!found) return jsonOut_({ ok:false, error:'Position not found: ' + id });
  sh.deleteRow(found.rowIndex);
  return jsonOut_({ ok:true });
}

// ════════════════════════════════════════════════════════════
// WATCHLIST (note: addWatchlist/removeWatchlist are GET in the
// frontend's current implementation — preserved as-is)
// ════════════════════════════════════════════════════════════

function handleGetWatchlist_() {
  const sh = getSheet_('Watchlist');
  ensureHeaders_(sh, WATCHLIST_HEADERS);
  const { rows } = readRows_(sh);
  return jsonOut_({ ok:true, watchlist: rows });
}

function handleAddWatchlist_(params) {
  const symbol = String(params.symbol || '').trim().toUpperCase();
  if (!symbol) return jsonOut_({ ok:false, error:'symbol required' });
  const sh = getSheet_('Watchlist');
  ensureHeaders_(sh, WATCHLIST_HEADERS);
  const { rows } = readRows_(sh);
  if (rows.some(r => String(r.symbol).toUpperCase() === symbol)) {
    return jsonOut_({ ok:false, error: symbol + ' is already on the watchlist' });
  }
  appendRow_(sh, WATCHLIST_HEADERS, { symbol, note: params.note || '', added: params.added || '' });
  return jsonOut_({ ok:true });
}

function handleRemoveWatchlist_(params) {
  const symbol = String(params.symbol || '').trim().toUpperCase();
  const sh = getSheet_('Watchlist');
  const data = sh.getDataRange().getValues();
  const headers = data[0] || [];
  const symCol = headers.indexOf('symbol');
  if (symCol === -1) return jsonOut_({ ok:false, error:'Watchlist sheet has no symbol column' });
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][symCol]).toUpperCase() === symbol) {
      sh.deleteRow(i + 1);
      return jsonOut_({ ok:true });
    }
  }
  return jsonOut_({ ok:false, error:'Symbol not found: ' + symbol });
}

// ════════════════════════════════════════════════════════════
// GOAL / SETTINGS
// ════════════════════════════════════════════════════════════

function handleGetGoal_() {
  const sh = getSheet_('Settings');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['key', 'value']);
    sh.appendRow(['goal', 5000]);
  }
  const data = sh.getDataRange().getValues();
  let goal = 5000;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'goal') goal = Number(data[i][1]) || 5000;
  }
  return jsonOut_({ ok:true, goal: goal });
}

function handleSetGoal_(goal) {
  const sh = getSheet_('Settings');
  if (sh.getLastRow() === 0) sh.appendRow(['key', 'value']);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'goal') {
      sh.getRange(i + 1, 2).setValue(goal);
      return jsonOut_({ ok:true });
    }
  }
  sh.appendRow(['goal', goal]);
  return jsonOut_({ ok:true });
}

// ════════════════════════════════════════════════════════════
// LIVE PRICES (Yahoo Finance — no API key required)
// ════════════════════════════════════════════════════════════

// BUG FIX (reported live, ONDL example: shown daily change -42.92% while
// the stock actually moved a normal daily amount):
//
// ROOT CAUSE — `meta.chartPreviousClose` from Yahoo's chart endpoint is
// NOT "yesterday's close". It is the close of the session immediately
// BEFORE the requested `range` window started. Since fetchYahooChart_
// requests range=1y, `chartPreviousClose` was the close from ~1 YEAR ago
// — for ONDL that was ~$20, vs a live price of $11.49, producing a fake
// "daily" change of -42.92% that was actually the stock's ~1-year decline
// mislabeled as today's move. The old code prioritized this field first:
//   meta.chartPreviousClose || meta.previousClose || closes[len-2] || price
// `meta.previousClose` isn't even a real field on this endpoint (chart
// meta never sets it) — it always fell through to chartPreviousClose.
//
// FIX — derive prevClose ONLY from the actual daily closes series
// (the second-to-last entry in `closes`, i.e. the prior trading day's
// real close), never from chart-range metadata. Additionally, sanity-
// check it: if missing, zero/negative, or implausibly far from the
// live price (default >35% in a single session — configurable below),
// treat the daily change as unverifiable and return null rather than a
// wrong number — the frontend then shows "N/A" instead of guessing.
const SUSPICIOUS_DAY_CHANGE_RATIO = 0.35; // 35% single-day move triggers "suspicious", not "impossible" — still flagged rather than trusted blindly

function handleGetPrices_(symbolsCsv) {
  const symbols = String(symbolsCsv || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const prices = {};
  symbols.forEach(sym => {
    try {
      const data = fetchYahooChart_(sym);
      if (!data || !data.closes.length) { prices[sym] = { ok:false }; return; }
      const meta = data.meta || {};
      const price = meta.regularMarketPrice || data.closes[data.closes.length - 1];

      // Previous CLOSE, strictly from the daily series — never from
      // range-metadata (see bug-fix note above).
      const rawPrevClose = data.closes.length >= 2 ? data.closes[data.closes.length - 2] : null;

      let prevClose = null, change = null, changePct = null, changePctValid = false, dayChangeStatus = 'ok';
      if (rawPrevClose == null) {
        dayChangeStatus = 'missing_prevclose';
      } else if (rawPrevClose <= 0) {
        dayChangeStatus = 'invalid_prevclose';
      } else {
        const diffRatio = Math.abs(price - rawPrevClose) / rawPrevClose;
        if (diffRatio > SUSPICIOUS_DAY_CHANGE_RATIO) {
          dayChangeStatus = 'suspicious_prevclose';
          prevClose = rawPrevClose; // kept for transparency/debug, but % is not trusted
        } else {
          prevClose = rawPrevClose;
          change = price - prevClose;
          changePct = (change / prevClose) * 100;
          changePctValid = true;
        }
      }

      prices[sym] = {
        price: price,
        prevClose: prevClose,           // null if missing/invalid; present-but-unverified if "suspicious"
        change: change,                  // null unless changePctValid
        changePct: changePct,            // null unless changePctValid — frontend MUST show "N/A", not 0 or a guess
        changePctValid: changePctValid,  // explicit flag — frontend should gate on this, not just `!= null`
        dayChangeStatus: dayChangeStatus, // 'ok' | 'missing_prevclose' | 'invalid_prevclose' | 'suspicious_prevclose'
        preMarket: meta.preMarketPrice || null,
        postMarket: meta.postMarketPrice || null,
        volume: meta.regularMarketVolume || data.volumes[data.volumes.length - 1] || 0,
        updated: new Date().toLocaleTimeString('he-IL'),
        source: 'apps-script',
        ok: true,
        // ── TEMPORARY DEBUG FIELDS — requested for verification, remove
        // once the fix is confirmed correct on the live site ──
        debug: {
          livePrice: price,
          prevCloseUsed: rawPrevClose,
          source: 'yahoo-chart-daily-closes[-2] (NOT meta.chartPreviousClose)',
          calculatedChangePct: rawPrevClose ? +(((price - rawPrevClose) / rawPrevClose) * 100).toFixed(2) : null,
          status: dayChangeStatus,
        },
      };
    } catch (err) {
      prices[sym] = { ok:false, error: err.message };
    }
  });
  return jsonOut_({ ok:true, prices: prices });
}

// ════════════════════════════════════════════════════════════
// TECHNICAL INDICATORS (real data, computed from Yahoo Finance
// daily OHLCV history — no placeholders; any field that can't be
// computed honestly is simply omitted from the response, and the
// frontend (decisionEngine.js) already treats a missing field as
// "not available" rather than guessing)
// ════════════════════════════════════════════════════════════

function handleGetIndicators_(symbol) {
  if (!symbol) return jsonOut_({ ok:false, error:'symbol required' });
  try {
    const data = fetchYahooChart_(symbol);
    if (!data || data.closes.length < 20) {
      return jsonOut_({ ok:false, error:'Not enough historical data for ' + symbol });
    }
    const closes = data.closes, highs = data.highs, lows = data.lows, volumes = data.volumes, opens = data.opens;
    const price = (data.meta && data.meta.regularMarketPrice) || closes[closes.length - 1];
    const prevClose = closes[closes.length - 2] || price;

    const ema9    = lastEma_(closes, 9);
    const ema20   = lastEma_(closes, 20);
    const ema21   = lastEma_(closes, 21);
    const ema50   = lastEma_(closes, 50);
    const ema200  = lastEma_(closes, 200); // null if <200 days of history — honestly omitted, never faked
    const rsi      = rsi_(closes, 14);
    const macdRes   = macd_(closes);
    const atr        = atr_(highs, lows, closes, 14);

    const last20Vol = volumes.slice(-20);
    const avgVolume   = last20Vol.length ? last20Vol.reduce((a,b)=>a+b,0) / last20Vol.length : null;
    const volume        = volumes[volumes.length - 1];

    const last20Highs = highs.slice(-20), last20Lows = lows.slice(-20);
    const resistance      = last20Highs.length ? Math.max.apply(null, last20Highs) : null;
    const support           = last20Lows.length  ? Math.min.apply(null, last20Lows)  : null;

    const last252Highs = highs.slice(-252), last252Lows = lows.slice(-252);
    const week52High      = last252Highs.length ? Math.max.apply(null, last252Highs) : null;
    const week52Low        = last252Lows.length  ? Math.min.apply(null, last252Lows)  : null;

    const changePct = prevClose ? (price - prevClose) / prevClose * 100 : null;
    const gapPct       = (opens && opens.length && closes.length >= 2)
      ? (opens[opens.length-1] - closes[closes.length-2]) / closes[closes.length-2] * 100
      : null;

    // Benchmark comparison vs S&P 500 (SPY) — real, computed the same way.
    // NOTE: sector-strength comparison is intentionally NOT included —
    // it would require a reliable symbol→sector→sector-ETF mapping this
    // script doesn't have. Faking it would violate "no placeholders."
    let benchmarkChangePct = null;
    try {
      const spy = fetchYahooChart_('SPY');
      if (spy && spy.closes.length >= 2) {
        const spyPrice = (spy.meta && spy.meta.regularMarketPrice) || spy.closes[spy.closes.length - 1];
        const spyPrev    = spy.closes[spy.closes.length - 2];
        benchmarkChangePct = spyPrev ? (spyPrice - spyPrev) / spyPrev * 100 : null;
      }
    } catch (e) { /* leave null — frontend shows "not available" */ }

    const indicators = {
      price: price,
      ema9: ema9, ema20: ema20, ema21: ema21, ema50: ema50, ema200: ema200,
      rsi: rsi,
      macd: macdRes.macd, macdSignal: macdRes.signal,
      atr: atr,
      volume: volume, avgVolume: avgVolume,
      support: support, resistance: resistance,
      week52High: week52High, week52Low: week52Low,
      changePct: changePct, gapPct: gapPct,
      preMarket: (data.meta && data.meta.preMarketPrice) || null,
      afterHours: (data.meta && data.meta.postMarketPrice) || null,
      benchmarkChangePct: benchmarkChangePct,
      // sectorChangePct intentionally omitted — see note above
    };
    return jsonOut_({ ok:true, indicators: indicators });
  } catch (err) {
    return jsonOut_({ ok:false, error: err.message });
  }
}

// ── Yahoo Finance chart fetch (shared by getPrices + getIndicators) ──

function fetchYahooChart_(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
              '?interval=1d&range=1y&includePrePost=true';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const json = JSON.parse(res.getContentText());
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result) return null;

  const ts = result.timestamp || [];
  const q   = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const closes = [], highs = [], lows = [], opens = [], volumes = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close == null || q.close[i] == null) continue; // skip days with no close (holidays etc.)
    closes.push(q.close[i]);
    highs.push(q.high && q.high[i] != null ? q.high[i] : q.close[i]);
    lows.push(q.low && q.low[i] != null ? q.low[i] : q.close[i]);
    opens.push(q.open && q.open[i] != null ? q.open[i] : q.close[i]);
    volumes.push(q.volume && q.volume[i] != null ? q.volume[i] : 0);
  }
  return { closes, highs, lows, opens, volumes, meta: result.meta || {} };
}

// ── Indicator math (real calculations, standard formulas) ─────

function emaFull_(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a,b) => a+b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function lastEma_(values, period) {
  const series = emaFull_(values, period);
  const last = series[series.length - 1];
  return last == null ? null : last;
}

function rsi_(closes, period) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    const gain = diff > 0 ? diff : 0, loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function macd_(closes) {
  if (closes.length < 35) return { macd: null, signal: null }; // not enough history for a real signal line
  const ema12 = emaFull_(closes, 12), ema26 = emaFull_(closes, 26);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] != null && ema26[i] != null) macdLine.push(ema12[i] - ema26[i]);
  }
  if (macdLine.length < 9) return { macd: macdLine[macdLine.length - 1] || null, signal: null };
  const signalSeries = emaFull_(macdLine, 9);
  return {
    macd: macdLine[macdLine.length - 1],
    signal: signalSeries[signalSeries.length - 1],
  };
}

function atr_(highs, lows, closes, period) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i-1]),
      Math.abs(lows[i] - closes[i-1])
    ));
  }
  const last = trs.slice(-period);
  return last.reduce((a,b) => a+b, 0) / last.length;
}

// ════════════════════════════════════════════════════════════
// NEWS (Finnhub free tier — real headlines + heuristic sentiment;
// anything not reliably available on the free tier is OMITTED, not
// faked — the frontend shows "Not available" for those fields)
// ════════════════════════════════════════════════════════════

function handleGetNews_(symbol) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('FINNHUB_API_KEY');
  if (!apiKey) {
    return jsonOut_({ ok:false, error:'FINNHUB_API_KEY not configured in Script Properties' });
  }
  if (!symbol) return jsonOut_({ ok:false, error:'symbol required' });

  try {
    const today = new Date();
    const from    = new Date(today.getTime() - 14 * 86400000); // last 14 days
    const fmt      = d => d.toISOString().split('T')[0];

    const newsUrl = 'https://finnhub.io/api/v1/company-news?symbol=' + encodeURIComponent(symbol) +
                     '&from=' + fmt(from) + '&to=' + fmt(today) + '&token=' + apiKey;
    const newsRes  = UrlFetchApp.fetch(newsUrl, { muteHttpExceptions: true });
    const rawNews   = JSON.parse(newsRes.getContentText() || '[]');

    const headlines = (Array.isArray(rawNews) ? rawNews : []).slice(0, 10).map(n => ({
      title: n.headline,
      url: n.url,
      datetime: n.datetime,
      sentiment: classifySentiment_(n.headline + ' ' + (n.summary || '')),
    }));

    let insiderTx = [];
    try {
      const insiderUrl = 'https://finnhub.io/api/v1/stock/insider-transactions?symbol=' + encodeURIComponent(symbol) + '&token=' + apiKey;
      const insiderRes  = UrlFetchApp.fetch(insiderUrl, { muteHttpExceptions: true });
      const insiderData = JSON.parse(insiderRes.getContentText() || '{}');
      insiderTx = (insiderData.data || []).slice(0, 20).map(tx => ({
        type: tx.change > 0 ? 'buy' : 'sell',
        shares: Math.abs(tx.change || 0),
        date: tx.transactionDate,
        name: tx.name,
      }));
    } catch (e) { /* leave empty — frontend shows "not available" */ }

    let earnings = null;
    try {
      const earnFrom = fmt(today);
      const earnTo     = fmt(new Date(today.getTime() + 60 * 86400000));
      const earnUrl    = 'https://finnhub.io/api/v1/calendar/earnings?from=' + earnFrom + '&to=' + earnTo +
                          '&symbol=' + encodeURIComponent(symbol) + '&token=' + apiKey;
      const earnRes    = UrlFetchApp.fetch(earnUrl, { muteHttpExceptions: true });
      const earnData   = JSON.parse(earnRes.getContentText() || '{}');
      if (earnData.earningsCalendar && earnData.earningsCalendar.length) {
        earnings = { date: earnData.earningsCalendar[0].date };
      }
    } catch (e) { /* leave null — frontend shows "not available" */ }

    // shortInterest, shortFloat, institutionalOwnership, filings: NOT
    // included — not reliably available on Finnhub's free tier. Do not
    // stub with 0/fake values; frontend already treats their absence as
    // "Not available (requires premium data provider)".

    return jsonOut_({ ok:true, news: { headlines: headlines, insiderTx: insiderTx, earnings: earnings } });
  } catch (err) {
    return jsonOut_({ ok:false, error: err.message });
  }
}

function classifySentiment_(text) {
  const t = (text || '').toLowerCase();
  const bullWords = ['beats','surge','soars','upgrade','record','growth','raises guidance','buyback','approval','partnership','outperform'];
  const bearWords = ['misses','plunge','downgrade','lawsuit','investigation','recall','bankruptcy','delisting','sec probe','underperform'];
  const bull = bullWords.some(w => t.indexOf(w) !== -1);
  const bear = bearWords.some(w => t.indexOf(w) !== -1);
  if (bull && !bear) return 'bullish';
  if (bear && !bull) return 'bearish';
  return 'neutral';
}

// ════════════════════════════════════════════════════════════
// AI CHAT (Anthropic, key held server-side — never in the browser)
// ════════════════════════════════════════════════════════════

function handleAiChat_(data) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return jsonOut_({ ok:false, error:'ANTHROPIC_API_KEY not configured in Script Properties' });
  }
  try {
    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: data.system || '',
        messages: data.messages || []
      }),
      muteHttpExceptions: true
    });
    const result = JSON.parse(response.getContentText());
    if (result.error) {
      return jsonOut_({ ok:false, error: result.error.message || 'Anthropic API error' });
    }
    const reply = (result.content && result.content[0]) ? result.content[0].text : '';
    return jsonOut_({ ok:true, reply: reply });
  } catch (err) {
    return jsonOut_({ ok:false, error: err.message });
  }
}
