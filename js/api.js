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

  // ── REST post ──────────────────────────────────────────

  async function post(body) {
    if (!isConfigured()) { setStatus('⚠️ API לא מוגדר','warn'); return {ok:false}; }
    if (!navigator.onLine) { setStatus('❌ אין חיבור לאינטרנט','error'); return {ok:false}; }
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'text/plain' },
        redirect: 'follow'
      });
      const text = await res.text();
      try { return JSON.parse(text); }
      catch { console.error('API parse error:', text.slice(0,200)); return {ok:false,error:'Invalid JSON'}; }
    } catch(err) {
      console.error('API post error:', err.message);
      setStatus('❌ שגיאת רשת: ' + err.message, 'error');
      return {ok:false, error:err.message};
    }
  }

  // ── Load all data ──────────────────────────────────────

  async function loadAll() {
    if (!isConfigured()) return null;
    if (!navigator.onLine) { setStatus('❌ אין חיבור','error'); return null; }
    showSpinner(true);
    setStatus('טוען נתונים...','info');
    try {
      const [tr, gr, pr, wl] = await Promise.all([
        fetch(API_URL+'?action=getTrades&t='+Date.now()).then(r=>r.json()),
        fetch(API_URL+'?action=getGoal&t='+Date.now()).then(r=>r.json()),
        fetch(API_URL+'?action=getPositions&t='+Date.now()).then(r=>r.json()),
        fetch(API_URL+'?action=getWatchlist&t='+Date.now()).then(r=>r.json()).catch(()=>({ok:false}))
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
    const url = `${API_URL}?action=addWatchlist&symbol=${encodeURIComponent(symbol)}&note=${encodeURIComponent(note)}&added=${encodeURIComponent(added)}&t=${Date.now()}`;
    const res  = await fetch(url, { cache:'no-store', redirect:'follow' });
    const text = await res.text();
    return JSON.parse(text);
  }

  async function removeWatchlistItem(symbol) {
    const url = `${API_URL}?action=removeWatchlist&symbol=${encodeURIComponent(symbol)}&t=${Date.now()}`;
    const res  = await fetch(url, { cache:'no-store', redirect:'follow' });
    const text = await res.text();
    return JSON.parse(text);
  }

  async function getWatchlist() {
    const res  = await fetch(`${API_URL}?action=getWatchlist&t=${Date.now()}`, { cache:'no-store', redirect:'follow' });
    const text = await res.text();
    return JSON.parse(text);
  }

  // ── Indicators (for Decision Engine) ──────────────────

  async function getIndicators(symbol) {
    const res  = await fetch(`${API_URL}?action=getIndicators&symbol=${encodeURIComponent(symbol)}&t=${Date.now()}`, { cache:'no-store' });
    const text = await res.text();
    const data = JSON.parse(text);
    if (!data.ok) throw new Error(data.error || 'לא הצלחתי לטעון אינדיקטורים');
    return data.indicators;
  }

  // ── Live Prices (via Apps Script proxy) ────────────────

  async function fetchPrices(symbols) {
    if (!symbols.length) return {};
    try {
      const res = await fetch(
        `${API_URL}?action=getPrices&symbols=${symbols.join(',')}&t=${Date.now()}`,
        { signal: AbortSignal.timeout(15000) }
      );
      const data = await res.json();
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
    getIndicators,
    fetchPrices, fetchPrice,
    connectWS, disconnectWS,
    askClaude
  };
})();
