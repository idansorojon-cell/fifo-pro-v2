/**
 * FIFO PRO — watchlist.js
 * Smart Watchlist — sync with Google Sheets, live prices
 * Depends on: utils.js, api.js, app.js
 */

const Watchlist = (() => {
  const { f$, fpct } = Utils;

  function normalizeRows(rows) {
    return (rows||[]).map(w => ({
      symbol: String(w.symbol||'').trim().toUpperCase(),
      note:   w.note  || '',
      added:  w.added || ''
    })).filter(w => w.symbol);
  }

  // ── Add ────────────────────────────────────────────────

  async function add() {
    const sym  = (document.getElementById('watchlist-input')?.value || '').trim().toUpperCase();
    const note = (document.getElementById('watchlist-note')?.value  || '').trim();
    if (!sym) return;
    if (APP.watchlist.find(w => w.symbol === sym)) { alert(sym + ' כבר ברשימת המעקב'); return; }

    try {
      API.setStatus('שומר ' + sym + '...', 'info');
      const data = await API.addWatchlistItem(sym, note);
      if (!data.ok) throw new Error(data.error || 'שגיאה בשמירה');
      if (document.getElementById('watchlist-input'))  document.getElementById('watchlist-input').value  = '';
      if (document.getElementById('watchlist-note'))   document.getElementById('watchlist-note').value   = '';
      await _reloadFromSheets(true);
      API.setStatus('✓ ' + sym + ' נוסף', 'ok');
      const d = await API.fetchPrice(sym);
      if (d) { APP.liveData[sym] = d; render(); }
    } catch(err) {
      API.setStatus('❌ ' + err.message, 'error');
    }
  }

  // ── Remove ─────────────────────────────────────────────

  async function remove(sym) {
    if (!confirm('להסיר את ' + sym + '?')) return;
    try {
      API.setStatus('מוחק ' + sym + '...', 'info');
      const data = await API.removeWatchlistItem(sym);
      if (!data.ok) throw new Error(data.error || 'שגיאה');
      await _reloadFromSheets(true);
      API.setStatus('✓ ' + sym + ' נמחק', 'ok');
    } catch(err) {
      API.setStatus('❌ ' + err.message, 'error');
    }
  }

  // ── Refresh ────────────────────────────────────────────

  async function refresh() {
    API.setStatus('מרענן Watchlist...', 'info');
    await _reloadFromSheets(true);
    if (!APP.watchlist.length) {
      render();
      API.setStatus('Watchlist ריק', 'warn');
      return;
    }
    const syms   = APP.watchlist.map(w => w.symbol);
    const prices = await API.fetchPrices(syms);
    Object.entries(prices).forEach(([sym, p]) => {
      if (p?.ok) APP.liveData[sym] = { ...(APP.liveData[sym]||{}), ...p, updated: new Date().toLocaleTimeString('he-IL') };
    });
    render();
    API.setStatus('✓ Watchlist עודכן', 'ok');
  }

  async function _reloadFromSheets(silent=false) {
    try {
      const data = await API.getWatchlist();
      if (!data.ok) throw new Error(data.error || 'שגיאה');
      APP.watchlist = normalizeRows(data.watchlist || []);
      Utils.LS.set('fifo_watchlist', APP.watchlist);
      render();
    } catch(err) {
      if (!silent) API.setStatus('❌ ' + err.message, 'error');
      APP.watchlist = normalizeRows(Utils.LS.get('fifo_watchlist', []));
      render();
    }
  }

  // ── Render ─────────────────────────────────────────────

  function render() {
    const grid = document.getElementById('watchlist-grid');
    if (!grid) return;
    if (!APP.watchlist.length) {
      grid.innerHTML = '<div style="color:var(--text-3);font-size:13px;grid-column:1/-1;padding:20px 0">אין סימבולים ב-Watchlist. הוסף סימבול למעלה.</div>';
      return;
    }
    grid.innerHTML = APP.watchlist.map(w => wlCard(w)).join('');
  }

  function wlCard(w) {
    const live  = APP.liveData[w.symbol];
    const price = live?.price;
    const chg   = live?.changePct;
    const pre   = live?.preMarket;
    const post  = live?.postMarket;
    const vol   = live?.volume;

    const inTrades = APP.trades.filter(t => t.symbol === w.symbol);
    const totalPnl = inTrades.reduce((s,t) => s+t.net, 0);
    const wr       = inTrades.length
      ? Math.round(inTrades.filter(t=>t.net>0).length / inTrades.length * 100)
      : null;

    // AI Score placeholder (from Decision Engine if available)
    const aiScore = null;

    return `
      <div class="wl-card">
        <button class="wl-remove" onclick="Watchlist.remove('${w.symbol}')" title="הסר">✕</button>

        <div class="wl-sym">
          ${w.symbol}
          ${live ? '<span class="live-dot"></span>' : ''}
        </div>

        <div class="wl-price ${!price?'':(chg>=0?'green':'red')}">
          ${price ? '$'+price.toFixed(2) : '—'}
        </div>

        ${chg!=null ? `
          <div class="wl-change ${chg>=0?'green':'red'}">
            ${chg>=0?'▲':'▼'} ${Math.abs(chg).toFixed(2)}%
          </div>` : ''}

        ${pre  ? `<div class="wl-meta" style="color:var(--gold)">🌅 Pre: $${pre.toFixed(2)}</div>`   : ''}
        ${post ? `<div class="wl-meta" style="color:var(--purple)">🌙 AH: $${post.toFixed(2)}</div>` : ''}
        ${vol  ? `<div class="wl-meta">Vol: ${(vol/1e6).toFixed(1)}M</div>`                          : ''}

        ${inTrades.length ? `
          <div class="wl-meta" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">
            ${inTrades.length} עסקאות | ${totalPnl>=0?'+':''}${f$(Math.round(totalPnl))}
            ${wr!==null ? `| WR ${wr}%` : ''}
          </div>` : ''}

        ${w.note ? `<div class="wl-meta" style="font-style:italic;margin-top:4px">${w.note}</div>` : ''}

        <div class="wl-meta">${live?.updated || ''}</div>

        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="btn btn-ghost btn-xs" onclick="DecisionEngine.analyzeSymbol('${w.symbol}')">🎯 Analyze</button>
        </div>
      </div>
    `;
  }

  return { add, remove, refresh, render };
})();
