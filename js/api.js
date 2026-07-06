/**
 * FIFO PRO — api.js
 * כל התקשורת עם Google Apps Script + Live Prices
 */

const API = (() => {

  // ── Auth bypass flag (must match auth.js AUTH_DISABLED) ─────────
  // true  → skip all token logic, ignore 401s, verifyLogin is a no-op (testing mode)
  // false → full session auth enforced (production mode)
  // Phase 1 (owner login): the backend flag (AppScript_FULL.gs) only takes
  // effect after a manual Apps Script redeploy — see
  // docs/PROJECT_OVERVIEW.md "Deployment".
  const AUTH_DISABLED = false;

  const API_URL = 'https://script.google.com/macros/s/AKfycbzbiOcOGu5Qh8Zte_eU04BIh-ufie_V87nq8otruMBgwuil3DYJR5qn0qgo4VFsY-R5sw/exec';
  // NOTE: the Polygon.io API key and the Anthropic API key must NEVER live
  // in client-side JS — anyone can read them from the browser. Both live
  // prices and AI Chat are proxied through Google Apps Script instead
  // (see getPrices/getIndicators below and the 'aiChat' action).

  // ── Status bar ─────────────────────────────────────────

  let statusTimer = null;
  function setStatus(msg, type='info') {
    const bar = document.getElementById('sync-bar');
    if (!bar) return;
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    bar.textContent = msg;
    bar.className = `sync-bar sync-bar--${type}`;
    bar.style.display = msg ? 'flex' : 'none';
    bar.style.cursor = msg ? 'pointer' : '';
    bar.onclick = msg ? () => setStatus('') : null;
    if (type === 'ok')      statusTimer = setTimeout(() => setStatus(''), 3000);
    else if (msg)           statusTimer = setTimeout(() => setStatus(''), 8000);
  }

  function showSpinner(show) {
    const sp = document.getElementById('sync-spinner');
    if (sp) sp.style.display = show ? 'inline-block' : 'none';
    const btn = document.getElementById('add-btn');
    if (btn) btn.disabled = show;
  }

  function isConfigured() { return !!API_URL && API_URL !== 'PLACEHOLDER'; }

  // ── Session token helpers ──────────────────────────────
  // Token stored by auth.js; we read it here so every request is authenticated.

  // Reads the actual UUID token from localStorage (stored as JSON by auth.js)
  function getToken_() {
    try {
      const raw = localStorage.getItem('fifo_session_v1');
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      return parsed.token || '';
    } catch {
      return '';
    }
  }

  function authedUrl_(action, extra) {
    const t     = Date.now();
    const token = encodeURIComponent(getToken_());
    let url     = API_URL + '?action=' + action + '&token=' + token + '&t=' + t;
    if (extra) url += '&' + extra;
    return url;
  }

  // Called when any response comes back with code:401 (expired/invalid session)
  function handle401_() {
    if (AUTH_DISABLED) return; // bypass — ignore 401s in testing mode
    localStorage.removeItem('fifo_session_v1');
    setStatus('Session פג תוקף — מתחבר מחדש...', 'warn');
    if (typeof Auth !== 'undefined' && Auth.handle401) {
      Auth.handle401();
    }
  }

  // Checks a parsed JSON response for 401 and handles it; returns true if intercepted
  function check401_(data) {
    if (AUTH_DISABLED) return false; // bypass — never block on 401 in testing mode
    if (data && data.code === 401) { handle401_(); return true; }
    return false;
  }

  // ── REST post ──────────────────────────────────────────

  async function post(body) {
    if (!isConfigured()) { setStatus('⚠️ API לא מוגדר','warn'); return {ok:false}; }
    if (!navigator.onLine) { setStatus('❌ אין חיבור לאינטרנט','error'); return {ok:false}; }
    try {
      // Inject token into every POST body except actions that don't need one
      const noTokenActions = ['login', 'logout', 'revokeAllSessions'];
      if (!noTokenActions.includes(body.action)) {
        body = Object.assign({ token: getToken_() }, body);
      }
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'text/plain' },
        redirect: 'follow'
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch {
        // HTML response = deployment misconfiguration (wrong version / access settings)
        const isHtml = text.trimStart().startsWith('<');
        const msg = isHtml
          ? 'שגיאת פריסה — בדוק Deployment ב-Apps Script (Execute as: Me, Who has access: Anyone, גרסה חדשה)'
          : 'שגיאת תקשורת עם השרת';
        console.error('API parse error:', text.slice(0, 200));
        setStatus('❌ ' + msg, 'error');
        return { ok: false, error: msg, deploymentError: isHtml };
      }
      check401_(data);
      return data;
    } catch(err) {
      console.error('API post error:', err.message);
      setStatus('❌ שגיאת רשת: ' + err.message, 'error');
      return {ok:false, error:err.message};
    }
  }

  // Wrapper around GET fetches that checks for 401.
  // timeoutMs: optional AbortSignal timeout (use for slow endpoints like getPrices).
  async function authedGet_(url, timeoutMs) {
    const opts = { cache:'no-store', redirect:'follow' };
    if (timeoutMs) opts.signal = AbortSignal.timeout(timeoutMs);
    const res  = await fetch(url, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { return {ok:false,error:'Invalid JSON'}; }
    if (check401_(data)) return {ok:false,error:'Unauthorized',code:401};
    return data;
  }

  // ── Load all data ──────────────────────────────────────

  async function loadAll() {
    if (!isConfigured()) return null;
    if (!navigator.onLine) { setStatus('❌ אין חיבור','error'); return null; }
    showSpinner(true);
    setStatus('טוען נתונים...','info');
    try {
      // Try getOperations first (derives trades + positions from "פעולות" sheet via FIFO).
      // Falls back to the legacy getTrades + getPositions endpoints if not available.
      const [ops, gr, wl] = await Promise.all([
        authedGet_(authedUrl_('getOperations')),
        authedGet_(authedUrl_('getGoal')),
        authedGet_(authedUrl_('getWatchlist')).catch(() => ({ ok: false }))
      ]);

      // 401 bubbles up through ops/gr — show login screen (already handled by check401_)
      if (ops.code === 401 || gr.code === 401) return null;

      if (ops.ok) {
        setStatus(''); // clear "טוען נתונים..." — success is reflected by #last-updated, not a toast
        return {
          trades:    ops.trades    || [],
          positions: ops.positions || [],
          goal:      gr.ok ? gr.goal : null,
          watchlist: wl.ok ? wl.watchlist : null,
          source:    'operations'
        };
      }

      // Fallback: separate getTrades + getPositions (used when פעולות sheet is absent)
      const [tr, pr] = await Promise.all([
        authedGet_(authedUrl_('getTrades')),
        authedGet_(authedUrl_('getPositions'))
      ]);
      if (tr.code === 401) return null;
      if (!tr.ok) throw new Error(tr.error || 'שגיאה בטעינת עסקאות');
      setStatus(''); // clear "טוען נתונים..." — same as the primary path above
      return {
        trades:    tr.trades    || [],
        positions: pr.ok ? pr.positions : null,
        goal:      gr.ok ? gr.goal : null,
        watchlist: wl.ok ? wl.watchlist : null,
        source:    'trades-sheet'
      };
    } catch(err) {
      setStatus('❌ ' + err.message, 'error');
      return null;
    } finally {
      showSpinner(false);
    }
  }

  // ── Trades ─────────────────────────────────────────────

  const addTrade    = trade  => post({ action:'add',    trade });
  const updateTrade = trade  => post({ action:'update', trade });
  const deleteTrade = id     => post({ action:'delete', id });
  const seedAll     = trades => post({ action:'seedAll',trades });
  const setGoal     = goal   => post({ action:'setGoal', goal });
  // Composite-key-keyed upsert for journal/notes fields — required when
  // trades come from getOperations (FIFO-derived, synthetic per-load id,
  // never a real row id in the Trades sheet). See AppScript_FULL.gs
  // handleUpsertTradeMeta_.
  const upsertTradeMeta = trade => post({ action:'upsertTradeMeta', trade });

  // ── Positions ──────────────────────────────────────────

  const addPosition    = pos => post({ action:'addPosition',    position:pos });
  const updatePosition = pos => post({ action:'updatePosition', position:pos });
  const deletePosition = id  => post({ action:'deletePosition', id });
  // Symbol-keyed upsert for target/stop-loss/notes — required when positions
  // come from getOperations (FIFO-derived, synthetic per-load id, never a
  // real row id in the Positions sheet). See AppScript_FULL.gs handleUpsertPositionMeta_.
  const upsertPositionMeta = pos => post({ action:'upsertPositionMeta', position:pos });

  // ── Write-through to "פעולות" (create-only) ─────────────
  // Appends real BUY/SELL rows to the same sheet applyFIFO_ already treats
  // as sole source of truth — not the legacy Trades/Positions sheets.
  // op.date must be an ISO string (native <input type="date"> .value) to
  // avoid DD/MM vs MM/DD ambiguity on the backend. See AppScript_FULL.gs
  // handleAppendOperation_/handleAddTradeOperation_ and
  // docs/TECHNICAL_DEBT.md "Persistence architecture".
  const appendOperation   = op    => post({ action:'appendOperation',   op });
  const addTradeOperation = trade => post({ action:'addTradeOperation', trade });

  // ── Watchlist ──────────────────────────────────────────

  async function addWatchlistItem(symbol, note) {
    const added = new Date().toLocaleDateString('he-IL');
    const url = authedUrl_('addWatchlist',
      'symbol=' + encodeURIComponent(symbol) +
      '&note='  + encodeURIComponent(note)   +
      '&added=' + encodeURIComponent(added));
    return authedGet_(url);
  }

  async function removeWatchlistItem(symbol) {
    return authedGet_(authedUrl_('removeWatchlist', 'symbol=' + encodeURIComponent(symbol)));
  }

  async function getWatchlist() {
    return authedGet_(authedUrl_('getWatchlist'));
  }

  // ── Indicators (for Decision Engine) ──────────────────

  async function getIndicators(symbol) {
    const data = await authedGet_(authedUrl_('getIndicators', 'symbol=' + encodeURIComponent(symbol)));
    if (!data.ok) throw new Error(data.error || 'לא הצלחתי לטעון אינדיקטורים');
    return data.indicators;
  }

  // ── News (for Decision Engine News Panel) ──────────────

  async function getNews(symbol) {
    try {
      const data = await authedGet_(authedUrl_('getNews', 'symbol=' + encodeURIComponent(symbol)));
      if (!data.ok) return null;
      return data.news || null;
    } catch {
      return null;
    }
  }

  // ── Live Prices (via Apps Script proxy) ────────────────

  async function fetchPrices(symbols) {
    if (!symbols.length) return {};
    try {
      const data = await authedGet_(
        authedUrl_('getPrices', 'symbols=' + symbols.join(',')), 25000
      );
      console.log('[fetchPrices] response:', JSON.stringify(data));
      if (data.ok && data.prices) {
        const ok     = Object.entries(data.prices).filter(([,v]) => v && v.ok).map(([k]) => k);
        const failed = Object.entries(data.prices).filter(([,v]) => !v || !v.ok).map(([k,v]) => k + '(' + (v && v.error || '?') + ')');
        console.log('[fetchPrices] ok:', ok.join(',') || 'none', '| failed:', failed.join(',') || 'none');
        return data.prices;
      }
      console.warn('[fetchPrices] bad response (ok=false or no prices):', data);
    } catch(e) { console.warn('[fetchPrices] error:', e.message); }
    return {};
  }

  async function fetchPrice(symbol) {
    const prices = await fetchPrices([symbol]);
    const p = prices[symbol];
    return (p && p.ok) ? p : null;
  }

  // ── Live price updates ──────────────────────────────────
  // Real-time push (e.g. Polygon WebSocket) requires authenticating
  // directly from the browser with a provider API key, which would
  // expose that key to anyone viewing the page source. Until prices
  // are proxied through a backend that supports streaming, FIFO PRO
  // relies on polling fetchPrices()/getPrices via Apps Script instead
  // (see startPolling() in app.js). These two functions are kept as a
  // stable no-op API so callers (positions.js) don't need to change.

  function connectWS(/* symbols, onPrice */) {
    updateWsDot('idle'); // no real WS connection — idle until the first poll lands
  }

  function disconnectWS() {
    updateWsDot('idle');
  }

  // ── Ambient live-status indicator (Live-status UX phase) ────
  // Reflects the 15s price-poll result via the header's #ws-dot/#ws-label/
  // #last-updated — never a banner, never shifts layout. state: 'idle'
  // (no positions yet / never polled), 'ok' (fresh data), 'error' (last
  // poll failed). See css/style.css .ws-dot--ok/--error and
  // docs/DESIGN_SYSTEM.md for the full rationale.
  function updateWsDot(state, detail) {
    const dot   = document.getElementById('ws-dot');
    const label = document.getElementById('ws-label');
    if (dot) {
      dot.classList.remove('ws-dot--ok', 'ws-dot--error');
      if (state === 'ok' || state === 'error') dot.classList.add('ws-dot--' + state);
      if (detail) dot.setAttribute('data-tip', detail); else dot.removeAttribute('data-tip');
    }
    if (label) label.textContent = state === 'ok' ? 'Live' : state === 'error' ? 'Offline' : 'Polling';
  }

  // Tracks whether the *current* streak of poll failures has already been
  // surfaced as a toast — so a recurring background error (e.g. a missing
  // API key firing every 15s) interrupts the user once, then degrades to
  // the quiet #ws-dot--error state instead of repeating. Mirrors the
  // existing once-per-day alert-dedup pattern in positions.js.
  let _priceErrorStreakShown = false;

  // No success toast, ever — not even for a manual refresh. A refresh the
  // user just triggered doesn't need an announcement after the fact; the
  // button's own spin state (setButtonBusy) is the real-time feedback,
  // and the dot pulse + timestamp below are the "it worked" confirmation.
  // See docs/DESIGN_SYSTEM.md.
  function reportPriceSuccess() {
    _priceErrorStreakShown = false;
    const now = new Date().toLocaleTimeString('he-IL');
    updateWsDot('ok', 'עודכן לאחרונה: ' + now);
    const lu = document.getElementById('last-updated');
    if (lu) lu.textContent = 'עודכן: ' + now;
    Utils.LS.set('fifo_last_price_update', now);
  }

  function reportPriceError(msg, manual) {
    updateWsDot('error', msg);
    if (manual || !_priceErrorStreakShown) setStatus(msg, 'error');
    _priceErrorStreakShown = true;
  }

  // Toggles a spinning refresh icon + disables the button while a manual
  // refresh is in flight — the real-time "is this working" signal that
  // replaces the old "מרענן..." toast. id = the button's DOM id.
  function setButtonBusy(id, busy) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = busy;
    const svg = btn.querySelector('svg.icon');
    if (svg) svg.classList.toggle('icon-spin', busy);
  }

  // ── Auth ──────────────────────────────────────────────────

  async function verifyLogin(username, passwordHash) {
    if (AUTH_DISABLED) {
      // No network call — return a valid auth-disabled response immediately
      return { ok: true, token: 'auth-disabled', authDisabled: true };
    }
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'login', username, passwordHash }),
        headers: { 'Content-Type': 'text/plain' },
        redirect: 'follow',
      });
      return JSON.parse(await res.text());
    } catch(e) {
      return { ok: false, error: e.message };
    }
  }

  // Invalidate this device's session server-side
  async function logoutServer() {
    const token = getToken_();
    if (!token) return { ok: true };
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'logout', token }),
        headers: { 'Content-Type': 'text/plain' },
        redirect: 'follow',
      });
      return JSON.parse(await res.text());
    } catch(e) {
      return { ok: false, error: e.message };
    }
  }

  // Revoke ALL sessions on all devices (requires password)
  async function revokeAllSessions(passwordHash) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'revokeAllSessions', passwordHash }),
        headers: { 'Content-Type': 'text/plain' },
        redirect: 'follow',
      });
      return JSON.parse(await res.text());
    } catch(e) {
      return { ok: false, error: e.message };
    }
  }

  // Password change (POST — sends old + new hashes, never plaintext)
  async function changePassword(currentHash, newHash) {
    return post({ action: 'changePassword', currentHash, newHash });
  }

  // ── Viewer management (Phase 2, owner-only — enforced server-side) ──
  // passwordHash is always computed client-side (Auth.sha256()), same as
  // every other password field in this app — the plaintext never leaves
  // the browser.
  async function setViewerCredentials(username, passwordHash, displayName) {
    return post({ action: 'setViewerCredentials', username, passwordHash, displayName });
  }
  async function setViewerEnabled(enabled) {
    return post({ action: 'setViewerEnabled', enabled });
  }
  // Whether the Viewer's getOperations/getPositions responses include real
  // open-position rows. Independent of setViewerEnabled — doesn't require
  // re-entering the viewer's credentials.
  async function setViewerPositionPermission(enabled) {
    return post({ action: 'setViewerPositionPermission', enabled });
  }
  async function getViewerStatus() {
    return authedGet_(authedUrl_('getViewerStatus'));
  }
  // Phase 3 — display name is UI-only, never checked for permissions.
  async function setOwnerDisplayName(displayName) {
    return post({ action: 'setOwnerDisplayName', displayName });
  }

  // ── AI Chat (proxied through Apps Script) ──────────────
  // Never call api.anthropic.com directly from the browser — that
  // would require shipping an Anthropic API key in client JS, which
  // anyone could read from page source. Instead, Apps Script holds the
  // key server-side (Script Properties) and forwards the request.
  // See README_AI.md / the Apps Script snippet provided alongside this
  // change for the required 'aiChat' action.

  async function askClaude(system, messages) {
    const res = await post({ action: 'aiChat', system, messages });
    if (!res.ok) throw new Error(res.error || 'AI Chat לא הצליח לענות');
    return res.reply || '';
  }

  // ── Deployment diagnostic (call from browser console: API.diagnose()) ──
  async function diagnose() {
    console.group('FIFO PRO — API Diagnostic');
    console.log('URL:', API_URL);
    const token = getToken_();
    console.log('Token in localStorage:', token ? token.slice(0,8)+'...' : 'NONE');

    // Test GET
    try {
      const r = await fetch(API_URL + '?action=getPrices&symbols=AAPL&token=' + encodeURIComponent(token||''), { redirect:'follow' });
      const t = await r.text();
      try {
        const j = JSON.parse(t);
        console.log('GET getPrices:', j.ok ? '✅ ok' : '❌ ' + JSON.stringify(j));
      } catch { console.error('GET returned HTML (deployment error):', t.slice(0,100)); }
    } catch(e) { console.error('GET failed (network):', e.message); }

    // Test POST (login probe)
    try {
      const r = await fetch(API_URL, { method:'POST', body: JSON.stringify({action:'login',passwordHash:'probe'}), headers:{'Content-Type':'text/plain'}, redirect:'follow' });
      const t = await r.text();
      try {
        const j = JSON.parse(t);
        console.log('POST login probe:', j.ok === false && j.error ? '✅ JSON ok (error expected: '+j.error+')' : JSON.stringify(j));
      } catch { console.error('POST returned HTML — DEPLOYMENT ISSUE:', t.slice(0,100)); }
    } catch(e) { console.error('POST failed (network):', e.message); }

    console.groupEnd();
  }

  return {
    isConfigured, setStatus, showSpinner,
    loadAll,
    addTrade, updateTrade, deleteTrade, seedAll, setGoal, upsertTradeMeta,
    addPosition, updatePosition, deletePosition, upsertPositionMeta,
    appendOperation, addTradeOperation,
    addWatchlistItem, removeWatchlistItem, getWatchlist,
    getIndicators, getNews,
    fetchPrices, fetchPrice,
    connectWS, disconnectWS, diagnose,
    reportPriceSuccess, reportPriceError, setButtonBusy,
    askClaude, verifyLogin, logoutServer, revokeAllSessions, changePassword,
    setViewerCredentials, setViewerEnabled, setViewerPositionPermission, getViewerStatus, setOwnerDisplayName,
    _url: API_URL
  };
})();
