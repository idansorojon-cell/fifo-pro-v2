/**
 * FIFO PRO — api.js
 * כל התקשורת עם Google Apps Script + Live Prices
 */

const API = (() => {

  const API_URL = 'https://script.google.com/macros/s/AKfycbzbiOcOGu5Qh8Zte_eU04BIh-ufie_V87nq8otruMBgwuil3DYJR5qn0qgo4VFsY-R5sw/exec';
  // NOTE: the Polygon.io API key and the Anthropic API key must NEVER live
  // in client-side JS — anyone can read them from the browser. Both live
  // prices and AI Chat are proxied through Google Apps Script instead
  // (see getPrices/getIndicators below and the 'aiChat' action).

  // ── Status bar ─────────────────────────────────────────

  function setStatus(msg, type='info') {
    const bar = document.getElementById('sync-bar');
    if (!bar) return;
    bar.textContent = msg;
    bar.className = `sync-bar sync-bar--${type}`;
    bar.style.display = msg ? 'flex' : 'none';
    if (type === 'ok') setTimeout(() => setStatus(''), 3000);
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
    localStorage.removeItem('fifo_session_v1');
    setStatus('Session פג תוקף — מתחבר מחדש...', 'warn');
    if (typeof Auth !== 'undefined' && Auth.handle401) {
      Auth.handle401();
    }
  }

  // Checks a parsed JSON response for 401 and handles it; returns true if intercepted
  function check401_(data) {
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
      catch { console.error('API parse error:', text.slice(0,200)); return {ok:false,error:'Invalid JSON'}; }
      check401_(data);
      return data;
    } catch(err) {
      console.error('API post error:', err.message);
      setStatus('❌ שגיאת רשת: ' + err.message, 'error');
      return {ok:false, error:err.message};
    }
  }

  // Wrapper around GET fetches that checks for 401
  async function authedGet_(url) {
    const res  = await fetch(url, { cache:'no-store', redirect:'follow' });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { return {ok:false,error:'Invalid JSON'}; }
    if (check401_(data)) return {ok:false,error:'Unauthorized'};
    return data;
  }

  // ── Load all data ──────────────────────────────────────

  async function loadAll() {
    if (!isConfigured()) return null;
    if (!navigator.onLine) { setStatus('❌ אין חיבור','error'); return null; }
    showSpinner(true);
    setStatus('טוען נתונים...','info');
    try {
      const [tr, gr, pr, wl] = await Promise.all([
        authedGet_(authedUrl_('getTrades')),
        authedGet_(authedUrl_('getGoal')),
        authedGet_(authedUrl_('getPositions')),
        authedGet_(authedUrl_('getWatchlist')).catch(()=>({ok:false}))
      ]);
      if (!tr.ok) throw new Error(tr.error || 'שגיאה בטעינת עסקאות');
      return { trades: tr.trades||[], goal: gr.ok?gr.goal:null,
               positions: pr.ok?pr.positions:null, watchlist: wl.ok?wl.watchlist:null };
    } catch(err) {
      setStatus('❌ ' + err.message,'error');
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

  // ── Positions ──────────────────────────────────────────

  const addPosition    = pos => post({ action:'addPosition',    position:pos });
  const updatePosition = pos => post({ action:'updatePosition', position:pos });
  const deletePosition = id  => post({ action:'deletePosition', id });

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
      const data = await authedGet_(authedUrl_('getPrices', 'symbols=' + symbols.join(',')));
      if (data.ok && data.prices) return data.prices;
    } catch(e) { console.warn('fetchPrices error:', e.message); }
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
    updateWsDot(false); // always shows "Polling" — no live WS connection
  }

  function disconnectWS() {
    updateWsDot(false);
  }

  function updateWsDot(connected) {
    const dot   = document.getElementById('ws-dot');
    const label = document.getElementById('ws-label');
    if (!dot || !label) return;
    dot.style.background  = connected ? '#4ecca8' : '#555';
    dot.style.animation   = connected ? 'pulse 1.5s infinite' : 'none';
    label.textContent     = connected ? 'Live' : 'Polling';
  }

  // ── Auth ──────────────────────────────────────────────────

  async function verifyLogin(passwordHash) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'login', passwordHash }),
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

  return {
    isConfigured, setStatus, showSpinner,
    loadAll,
    addTrade, updateTrade, deleteTrade, seedAll, setGoal,
    addPosition, updatePosition, deletePosition,
    addWatchlistItem, removeWatchlistItem, getWatchlist,
    getIndicators, getNews,
    fetchPrices, fetchPrice,
    connectWS, disconnectWS,
    askClaude, verifyLogin, logoutServer, revokeAllSessions, changePassword,
    _url: API_URL
  };
})();
