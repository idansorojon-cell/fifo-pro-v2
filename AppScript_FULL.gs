/**
 * ============================================================
 * FIFO PRO — AppScript_FULL.gs  (Code.gs)
 * Complete, ready-to-paste Google Apps Script backend.
 * ============================================================
 *
 * HOW TO DEPLOY (every time you update this file):
 *   1. Open script.google.com → your project
 *   2. Delete ALL existing code → paste this entire file
 *   3. Save (Ctrl+S)
 *   4. Deploy → Manage deployments → select existing → Edit → New version → Deploy
 *   5. The deployment URL stays the same — no changes needed in js/api.js
 *
 * SCRIPT PROPERTIES (Project Settings → Script Properties):
 *   LOGIN_PASSWORD  — password to protect the app (plaintext; compared via SHA-256)
 *                     Leave unset to disable login requirement (dev/local mode)
 *   ANTHROPIC_API_KEY — for AI Chat
 *   FINNHUB_API_KEY   — for News panel in Decision Engine
 *
 * AUTH MODEL:
 *   • Client SHA-256-hashes the password and sends the hash via POST
 *   • Server SHA-256-hashes LOGIN_PASSWORD and compares
 *   • On match: returns a stateless session token (base64 of timestamp + hash-fragment)
 *   • Client stores token in localStorage for 30 days
 *   • Every subsequent API call includes the token
 *   • Server validates the token on every request (validateToken_)
 *   • If LOGIN_PASSWORD is not set: all calls are allowed without a token
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
    const token  = e.parameter.token || '';

    // Every GET endpoint requires a valid token (login itself is POST)
    if (!validateToken_(token)) {
      return jsonOut_({ ok: false, error: 'Unauthorized', code: 401 });
    }

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
      default:                return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Auth actions — no token required
    if (data.action === 'login')          return handleLogin_(data.passwordHash);
    if (data.action === 'logout')         return jsonOut_({ ok: true }); // client clears token

    // Password change requires both old token + current password verification
    if (data.action === 'changePassword') return handleChangePassword_(data);

    // Every other POST requires a valid token
    if (!validateToken_(data.token || '')) {
      return jsonOut_({ ok: false, error: 'Unauthorized', code: 401 });
    }

    switch (data.action) {
      case 'add':            return handleAddTrade_(data.trade);
      case 'update':         return handleUpdateTrade_(data.trade);
      case 'delete':         return handleDeleteTrade_(data.id);
      case 'seedAll':        return handleSeedAll_(data.trades);
      case 'setGoal':        return handleSetGoal_(data.goal);
      case 'addPosition':    return handleAddPosition_(data.position);
      case 'updatePosition': return handleUpdatePosition_(data.position);
      case 'deletePosition': return handleDeletePosition_(data.id);
      case 'aiChat':         return handleAiChat_(data);
      default:               return jsonOut_({ ok: false, error: 'Unknown action: ' + data.action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════
// AUTH — LOGIN / TOKEN VALIDATION / PASSWORD CHANGE
// ════════════════════════════════════════════════════════════

/**
 * Called via POST { action:'login', passwordHash:'<sha256-hex>' }
 * Client hashes the password with SHA-256 in the browser (Web Crypto API).
 * We hash the stored plaintext LOGIN_PASSWORD server-side and compare.
 * Neither side ever sends the plaintext password over the wire.
 */
function handleLogin_(clientHash) {
  const props    = PropertiesService.getScriptProperties();
  const storedPw = props.getProperty('LOGIN_PASSWORD');

  // No password configured → auth disabled, accept any login
  if (!storedPw) {
    return jsonOut_({ ok: true, token: 'auth-disabled', authDisabled: true });
  }

  if (!clientHash) {
    return jsonOut_({ ok: false, error: 'סיסמה נדרשת' });
  }

  const serverHash = sha256hex_(storedPw);

  if (clientHash !== serverHash) {
    // Small delay to blunt brute-force (Apps Script allows Utilities.sleep)
    Utilities.sleep(500);
    return jsonOut_({ ok: false, error: 'סיסמה שגויה' });
  }

  const token = makeToken_(serverHash);
  return jsonOut_({ ok: true, token: token });
}

/**
 * Called via POST { action:'changePassword', token, currentHash, newHash }
 * currentHash = SHA-256 of the user's current password (from browser).
 * newHash     = SHA-256 of the desired new password (from browser).
 */
function handleChangePassword_(data) {
  const props    = PropertiesService.getScriptProperties();
  const storedPw = props.getProperty('LOGIN_PASSWORD');

  if (!storedPw) {
    return jsonOut_({ ok: false, error: 'שינוי סיסמה לא זמין — LOGIN_PASSWORD לא מוגדר' });
  }

  const serverHash = sha256hex_(storedPw);

  // Validate current token
  if (!validateToken_(data.token || '')) {
    return jsonOut_({ ok: false, error: 'Session פג תוקף — התחבר מחדש' });
  }

  // Validate current password
  if ((data.currentHash || '') !== serverHash) {
    return jsonOut_({ ok: false, error: 'הסיסמה הנוכחית שגויה' });
  }

  if (!data.newHash || data.newHash.length !== 64) {
    return jsonOut_({ ok: false, error: 'סיסמה חדשה לא תקינה' });
  }

  // We don't store the hash — we store the plaintext and hash on every
  // comparison. But the client only sends hashes, not the new plaintext.
  // Solution: store a special marker so we can compare against future hashes.
  // We store "__hash__:<newHash>" so handleLogin_ knows to compare directly.
  props.setProperty('LOGIN_PASSWORD', '__hash__:' + data.newHash);
  const newToken = makeToken_(data.newHash);
  return jsonOut_({ ok: true, token: newToken });
}

/**
 * Validates a session token from the client.
 * Token format: base64(timestamp + ':' + serverHash.slice(0,16))
 * If LOGIN_PASSWORD is not set: all tokens are valid (auth-disabled mode).
 */
function validateToken_(token) {
  if (!token) {
    // If no password configured, allow unauthenticated access
    const props = PropertiesService.getScriptProperties();
    return !props.getProperty('LOGIN_PASSWORD');
  }

  // Special token issued when no password is set
  if (token === 'auth-disabled') return true;

  const props    = PropertiesService.getScriptProperties();
  const storedPw = props.getProperty('LOGIN_PASSWORD');

  // Auth disabled
  if (!storedPw) return true;

  try {
    const decoded     = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    const parts       = decoded.split(':');
    if (parts.length !== 2) return false;

    const ts          = parseInt(parts[0], 10);
    const hashFrag    = parts[1];

    // Expired? (30 days)
    const thirtyDays  = 30 * 24 * 60 * 60 * 1000;
    if (isNaN(ts) || Date.now() - ts > thirtyDays) return false;

    // Hash fragment must match current password
    const serverHash  = sha256hex_(storedPw);
    return hashFrag === serverHash.slice(0, 16);
  } catch (e) {
    return false;
  }
}

/** SHA-256 of text → lowercase hex string */
function sha256hex_(text) {
  // If stored as __hash__:<hex> (set by changePassword), use the hex directly
  if (text && text.startsWith('__hash__:')) return text.slice(9);

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/** Create a new session token from a password hash */
function makeToken_(serverHash) {
  const ts = Date.now();
  return Utilities.base64Encode(ts + ':' + serverHash.slice(0, 16));
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
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
  return { headers, rows };
}

function appendRow_(sheet, headers, obj) {
  sheet.appendRow(headers.map(h => (obj[h] !== undefined && obj[h] !== null) ? obj[h] : ''));
}

function findRowById_(sheet, id) {
  const data    = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idCol   = headers.indexOf('id');
  if (idCol === -1) return null;
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][idCol]) === Number(id)) {
      return { rowIndex: i + 1, headers, row: data[i] };
    }
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
  return jsonOut_({ ok: true, trades: rows });
}

function handleAddTrade_(trade) {
  if (!trade) return jsonOut_({ ok: false, error: 'No trade supplied' });
  const sh = getSheet_('Trades');
  ensureHeaders_(sh, TRADE_HEADERS);
  const { rows } = readRows_(sh);
  trade.id = nextId_(rows);
  appendRow_(sh, TRADE_HEADERS, trade);
  return jsonOut_({ ok: true, trade: trade });
}

function handleUpdateTrade_(trade) {
  if (!trade || trade.id === undefined) return jsonOut_({ ok: false, error: 'Trade id required' });
  const sh    = getSheet_('Trades');
  const found = findRowById_(sh, trade.id);
  if (!found) return jsonOut_({ ok: false, error: 'Trade not found: ' + trade.id });
  const rowArr = found.headers.map((h, i) => (trade[h] !== undefined ? trade[h] : found.row[i]));
  sh.getRange(found.rowIndex, 1, 1, found.headers.length).setValues([rowArr]);
  return jsonOut_({ ok: true });
}

function handleDeleteTrade_(id) {
  if (id === undefined) return jsonOut_({ ok: false, error: 'id required' });
  const sh    = getSheet_('Trades');
  const found = findRowById_(sh, id);
  if (!found) return jsonOut_({ ok: false, error: 'Trade not found: ' + id });
  sh.deleteRow(found.rowIndex);
  return jsonOut_({ ok: true });
}

function handleSeedAll_(trades) {
  const sh = getSheet_('Trades');
  ensureHeaders_(sh, TRADE_HEADERS);
  (trades || []).forEach(t => appendRow_(sh, TRADE_HEADERS, t));
  return jsonOut_({ ok: true, count: (trades || []).length });
}

// ════════════════════════════════════════════════════════════
// POSITIONS
// ════════════════════════════════════════════════════════════

function handleGetPositions_() {
  const sh = getSheet_('Positions');
  ensureHeaders_(sh, POSITION_HEADERS);
  const { rows } = readRows_(sh);
  return jsonOut_({ ok: true, positions: rows });
}

function handleAddPosition_(pos) {
  if (!pos) return jsonOut_({ ok: false, error: 'No position supplied' });
  const sh = getSheet_('Positions');
  ensureHeaders_(sh, POSITION_HEADERS);
  const { rows } = readRows_(sh);
  pos.id = nextId_(rows);
  appendRow_(sh, POSITION_HEADERS, pos);
  return jsonOut_({ ok: true, position: pos });
}

function handleUpdatePosition_(pos) {
  if (!pos || pos.id === undefined) return jsonOut_({ ok: false, error: 'Position id required' });
  const sh    = getSheet_('Positions');
  const found = findRowById_(sh, pos.id);
  if (!found) return jsonOut_({ ok: false, error: 'Position not found: ' + pos.id });
  const rowArr = found.headers.map((h, i) => (pos[h] !== undefined ? pos[h] : found.row[i]));
  sh.getRange(found.rowIndex, 1, 1, found.headers.length).setValues([rowArr]);
  return jsonOut_({ ok: true });
}

function handleDeletePosition_(id) {
  if (id === undefined) return jsonOut_({ ok: false, error: 'id required' });
  const sh    = getSheet_('Positions');
  const found = findRowById_(sh, id);
  if (!found) return jsonOut_({ ok: false, error: 'Position not found: ' + id });
  sh.deleteRow(found.rowIndex);
  return jsonOut_({ ok: true });
}

// ════════════════════════════════════════════════════════════
// WATCHLIST
// (addWatchlist / removeWatchlist sent as GET by the frontend — preserved)
// ════════════════════════════════════════════════════════════

function handleGetWatchlist_() {
  const sh = getSheet_('Watchlist');
  ensureHeaders_(sh, WATCHLIST_HEADERS);
  const { rows } = readRows_(sh);
  return jsonOut_({ ok: true, watchlist: rows });
}

function handleAddWatchlist_(params) {
  const symbol = String(params.symbol || '').trim().toUpperCase();
  if (!symbol) return jsonOut_({ ok: false, error: 'symbol required' });
  const sh = getSheet_('Watchlist');
  ensureHeaders_(sh, WATCHLIST_HEADERS);
  const { rows } = readRows_(sh);
  if (rows.some(r => String(r.symbol).toUpperCase() === symbol)) {
    return jsonOut_({ ok: false, error: symbol + ' כבר נמצא ב-Watchlist' });
  }
  appendRow_(sh, WATCHLIST_HEADERS, { symbol, note: params.note || '', added: params.added || '' });
  return jsonOut_({ ok: true });
}

function handleRemoveWatchlist_(params) {
  const symbol = String(params.symbol || '').trim().toUpperCase();
  const sh     = getSheet_('Watchlist');
  const data   = sh.getDataRange().getValues();
  const headers = data[0] || [];
  const symCol  = headers.indexOf('symbol');
  if (symCol === -1) return jsonOut_({ ok: false, error: 'Watchlist sheet has no symbol column' });
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][symCol]).toUpperCase() === symbol) {
      sh.deleteRow(i + 1);
      return jsonOut_({ ok: true });
    }
  }
  return jsonOut_({ ok: false, error: 'Symbol not found: ' + symbol });
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
  let goal   = 5000;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'goal') goal = Number(data[i][1]) || 5000;
  }
  return jsonOut_({ ok: true, goal: goal });
}

function handleSetGoal_(goal) {
  const sh = getSheet_('Settings');
  if (sh.getLastRow() === 0) sh.appendRow(['key', 'value']);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'goal') {
      sh.getRange(i + 1, 2).setValue(goal);
      return jsonOut_({ ok: true });
    }
  }
  sh.appendRow(['goal', goal]);
  return jsonOut_({ ok: true });
}

// ════════════════════════════════════════════════════════════
// LIVE PRICES (Yahoo Finance — no API key required)
// ════════════════════════════════════════════════════════════

const SUSPICIOUS_DAY_CHANGE_RATIO = 0.35;

function handleGetPrices_(symbolsCsv) {
  const symbols = String(symbolsCsv || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const prices  = {};
  symbols.forEach(sym => {
    try {
      const intraday = fetchYahooIntraday_(sym);
      if (!intraday) { prices[sym] = { ok: false }; return; }
      const meta  = intraday.meta || {};
      const price = meta.regularMarketPrice != null
        ? meta.regularMarketPrice
        : (intraday.closes.length ? intraday.closes[intraday.closes.length - 1] : null);
      if (price == null) { prices[sym] = { ok: false }; return; }

      // Previous close priority chain
      let rawPrevClose = null, prevCloseSource = null;
      if (meta.regularMarketPreviousClose != null) {
        rawPrevClose    = meta.regularMarketPreviousClose;
        prevCloseSource = 'meta.regularMarketPreviousClose';
      } else if (meta.chartPreviousClose != null) {
        rawPrevClose    = meta.chartPreviousClose;
        prevCloseSource = 'meta.chartPreviousClose (range=1d)';
      } else {
        const shortDaily = fetchYahooDailyShort_(sym);
        if (shortDaily && shortDaily.closes.length >= 2) {
          rawPrevClose    = shortDaily.closes[shortDaily.closes.length - 2];
          prevCloseSource = 'fallback: 5d-daily-closes[-2]';
        }
      }

      let prevClose = null, change = null, changePct = null, changePctValid = false;
      let dayChangeStatus = 'ok';

      if (rawPrevClose == null) {
        dayChangeStatus = 'missing_prevclose';
      } else if (rawPrevClose <= 0) {
        dayChangeStatus = 'invalid_prevclose';
      } else {
        const diffRatio = Math.abs(price - rawPrevClose) / rawPrevClose;
        if (diffRatio > SUSPICIOUS_DAY_CHANGE_RATIO) {
          dayChangeStatus = 'suspicious_prevclose';
          prevClose = rawPrevClose;
        } else {
          prevClose      = rawPrevClose;
          change         = price - prevClose;
          changePct      = (change / prevClose) * 100;
          changePctValid = true;
        }
      }

      prices[sym] = {
        ok: true,
        price, prevClose, change, changePct, changePctValid, dayChangeStatus,
        preMarket:  meta.preMarketPrice  || null,
        postMarket: meta.postMarketPrice || null,
        volume: meta.regularMarketVolume ||
                (intraday.volumes.length ? intraday.volumes[intraday.volumes.length - 1] : 0),
        updated: new Date().toLocaleTimeString('he-IL'),
        source:  'apps-script',
        debug: {
          livePrice: price, prevCloseUsed: rawPrevClose,
          prevCloseSource, changePct: rawPrevClose
            ? +(((price - rawPrevClose) / rawPrevClose) * 100).toFixed(2)
            : null,
          status: dayChangeStatus,
        },
      };
    } catch (err) {
      prices[sym] = { ok: false, error: err.message };
    }
  });
  return jsonOut_({ ok: true, prices });
}

function fetchYahooIntraday_(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
              encodeURIComponent(symbol) + '?range=1d&interval=1m&includePrePost=true';
  const res    = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const json   = JSON.parse(res.getContentText());
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result) return null;
  const q       = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const closes  = (q.close  || []).filter(v => v != null);
  const volumes = (q.volume || []).filter(v => v != null);
  return { meta: result.meta || {}, closes, volumes };
}

function fetchYahooDailyShort_(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
              encodeURIComponent(symbol) + '?range=5d&interval=1d';
  const res    = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const json   = JSON.parse(res.getContentText());
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result) return null;
  const q      = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const closes = (q.close || []).filter(v => v != null);
  return { closes };
}

// ════════════════════════════════════════════════════════════
// TECHNICAL INDICATORS
// ════════════════════════════════════════════════════════════

function handleGetIndicators_(symbol) {
  if (!symbol) return jsonOut_({ ok: false, error: 'symbol required' });
  try {
    const data = fetchYahooChart_(symbol);
    if (!data || data.closes.length < 20) {
      return jsonOut_({ ok: false, error: 'Not enough historical data for ' + symbol });
    }
    const { closes, highs, lows, volumes, opens } = data;
    const price     = (data.meta && data.meta.regularMarketPrice) || closes[closes.length - 1];
    const prevClose = closes[closes.length - 2] || price;

    const ema9   = lastEma_(closes, 9);
    const ema20  = lastEma_(closes, 20);
    const ema21  = lastEma_(closes, 21);
    const ema50  = lastEma_(closes, 50);
    const ema200 = lastEma_(closes, 200);
    const rsi    = rsi_(closes, 14);
    const macdRes = macd_(closes);
    const atr    = atr_(highs, lows, closes, 14);

    const last20Vol  = volumes.slice(-20);
    const avgVolume  = last20Vol.length ? last20Vol.reduce((a,b) => a+b, 0) / last20Vol.length : null;
    const volume     = volumes[volumes.length - 1];

    const last20Highs = highs.slice(-20), last20Lows = lows.slice(-20);
    const resistance  = last20Highs.length ? Math.max.apply(null, last20Highs) : null;
    const support     = last20Lows.length  ? Math.min.apply(null, last20Lows)  : null;

    const last252Highs = highs.slice(-252), last252Lows = lows.slice(-252);
    const week52High   = last252Highs.length ? Math.max.apply(null, last252Highs) : null;
    const week52Low    = last252Lows.length  ? Math.min.apply(null, last252Lows)  : null;

    const changePct = prevClose ? (price - prevClose) / prevClose * 100 : null;
    const gapPct    = (opens && opens.length && closes.length >= 2)
      ? (opens[opens.length-1] - closes[closes.length-2]) / closes[closes.length-2] * 100
      : null;

    let benchmarkChangePct = null;
    try {
      const spy = fetchYahooChart_('SPY');
      if (spy && spy.closes.length >= 2) {
        const spyPrice = (spy.meta && spy.meta.regularMarketPrice) || spy.closes[spy.closes.length - 1];
        const spyPrev  = spy.closes[spy.closes.length - 2];
        benchmarkChangePct = spyPrev ? (spyPrice - spyPrev) / spyPrev * 100 : null;
      }
    } catch (e) { /* leave null */ }

    return jsonOut_({ ok: true, indicators: {
      price, ema9, ema20, ema21, ema50, ema200, rsi,
      macd: macdRes.macd, macdSignal: macdRes.signal,
      atr, volume, avgVolume, support, resistance,
      week52High, week52Low, changePct, gapPct,
      preMarket:  (data.meta && data.meta.preMarketPrice)  || null,
      afterHours: (data.meta && data.meta.postMarketPrice) || null,
      benchmarkChangePct,
    }});
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function fetchYahooChart_(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
              encodeURIComponent(symbol) + '?interval=1d&range=1y&includePrePost=true';
  const res    = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const json   = JSON.parse(res.getContentText());
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result) return null;

  const ts = result.timestamp || [];
  const q  = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const closes = [], highs = [], lows = [], opens = [], volumes = [];
  for (let i = 0; i < ts.length; i++) {
    if (!q.close || q.close[i] == null) continue;
    closes.push(q.close[i]);
    highs.push(q.high  && q.high[i]  != null ? q.high[i]  : q.close[i]);
    lows.push( q.low   && q.low[i]   != null ? q.low[i]   : q.close[i]);
    opens.push(q.open  && q.open[i]  != null ? q.open[i]  : q.close[i]);
    volumes.push(q.volume && q.volume[i] != null ? q.volume[i] : 0);
  }
  return { closes, highs, lows, opens, volumes, meta: result.meta || {} };
}

// ── Indicator math ──────────────────────────────────────────

function emaFull_(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k    = 2 / (period + 1);
  let prev   = values.slice(0, period).reduce((a,b) => a+b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev   = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function lastEma_(values, period) {
  const series = emaFull_(values, period);
  const last   = series[series.length - 1];
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
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function macd_(closes) {
  if (closes.length < 35) return { macd: null, signal: null };
  const ema12    = emaFull_(closes, 12), ema26 = emaFull_(closes, 26);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] != null && ema26[i] != null) macdLine.push(ema12[i] - ema26[i]);
  }
  if (macdLine.length < 9) return { macd: macdLine[macdLine.length - 1] || null, signal: null };
  const signalSeries = emaFull_(macdLine, 9);
  return { macd: macdLine[macdLine.length - 1], signal: signalSeries[signalSeries.length - 1] };
}

function atr_(highs, lows, closes, period) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i-1]),
      Math.abs(lows[i]  - closes[i-1])
    ));
  }
  const last = trs.slice(-period);
  return last.reduce((a,b) => a+b, 0) / last.length;
}

// ════════════════════════════════════════════════════════════
// NEWS (Finnhub free tier)
// ════════════════════════════════════════════════════════════

function handleGetNews_(symbol) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('FINNHUB_API_KEY');
  if (!apiKey) return jsonOut_({ ok: false, error: 'FINNHUB_API_KEY not configured in Script Properties' });
  if (!symbol) return jsonOut_({ ok: false, error: 'symbol required' });

  try {
    const today = new Date();
    const from  = new Date(today.getTime() - 14 * 86400000);
    const fmt   = d => d.toISOString().split('T')[0];

    const newsUrl = 'https://finnhub.io/api/v1/company-news?symbol=' + encodeURIComponent(symbol) +
                    '&from=' + fmt(from) + '&to=' + fmt(today) + '&token=' + apiKey;
    const rawNews = JSON.parse(UrlFetchApp.fetch(newsUrl, { muteHttpExceptions: true }).getContentText() || '[]');

    const headlines = (Array.isArray(rawNews) ? rawNews : []).slice(0, 10).map(n => ({
      title: n.headline, url: n.url, datetime: n.datetime,
      sentiment: classifySentiment_(n.headline + ' ' + (n.summary || '')),
    }));

    let insiderTx = [];
    try {
      const insiderData = JSON.parse(UrlFetchApp.fetch(
        'https://finnhub.io/api/v1/stock/insider-transactions?symbol=' + encodeURIComponent(symbol) + '&token=' + apiKey,
        { muteHttpExceptions: true }
      ).getContentText() || '{}');
      insiderTx = (insiderData.data || []).slice(0, 20).map(tx => ({
        type: tx.change > 0 ? 'buy' : 'sell',
        shares: Math.abs(tx.change || 0),
        date: tx.transactionDate, name: tx.name,
      }));
    } catch (e) {}

    let earnings = null;
    try {
      const earnTo  = fmt(new Date(today.getTime() + 60 * 86400000));
      const earnData = JSON.parse(UrlFetchApp.fetch(
        'https://finnhub.io/api/v1/calendar/earnings?from=' + fmt(today) + '&to=' + earnTo +
        '&symbol=' + encodeURIComponent(symbol) + '&token=' + apiKey,
        { muteHttpExceptions: true }
      ).getContentText() || '{}');
      if (earnData.earningsCalendar && earnData.earningsCalendar.length) {
        earnings = { date: earnData.earningsCalendar[0].date };
      }
    } catch (e) {}

    return jsonOut_({ ok: true, news: { headlines, insiderTx, earnings } });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function classifySentiment_(text) {
  const t        = (text || '').toLowerCase();
  const bullWords = ['beats','surge','soars','upgrade','record','growth','raises guidance','buyback','approval','partnership','outperform'];
  const bearWords = ['misses','plunge','downgrade','lawsuit','investigation','recall','bankruptcy','delisting','sec probe','underperform'];
  const bull = bullWords.some(w => t.indexOf(w) !== -1);
  const bear = bearWords.some(w => t.indexOf(w) !== -1);
  if (bull && !bear) return 'bullish';
  if (bear && !bull) return 'bearish';
  return 'neutral';
}

// ════════════════════════════════════════════════════════════
// AI CHAT (Anthropic — key held server-side)
// ════════════════════════════════════════════════════════════

function handleAiChat_(data) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return jsonOut_({ ok: false, error: 'ANTHROPIC_API_KEY not configured in Script Properties' });
  try {
    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: data.system || '',
        messages: data.messages || [],
      }),
      muteHttpExceptions: true,
    });
    const result = JSON.parse(response.getContentText());
    if (result.error) return jsonOut_({ ok: false, error: result.error.message || 'Anthropic API error' });
    const reply = (result.content && result.content[0]) ? result.content[0].text : '';
    return jsonOut_({ ok: true, reply });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}
