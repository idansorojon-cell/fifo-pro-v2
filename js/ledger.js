/**
 * FIFO PRO — ledger.js
 * FIFO PRO 2.0, Phase 2: the Ledger — one unified symbol lifecycle view.
 *
 * Read-only. A symbol is really one thing (a stable identity you have a
 * relationship with) moving through up to three states — Watching, Open
 * Position, Closed Trade History — not three unrelated screens. This
 * merges APP.positions / APP.watchlist / APP.trades (already loaded,
 * no new fetches) into one row per symbol.
 *
 * Built additively alongside Positions/Trades/Watchlist/Quick Trade —
 * none of those are touched, modified, or hidden. No new write paths at
 * all in this phase (explicitly read-only per instruction); a future
 * phase may add editing, and if so it must reuse the existing verified
 * upsertPositionMeta/upsertTradeMeta endpoints, matched by symbol/
 * composite key — never a new endpoint, never a synthetic id.
 *
 * Depends on: utils.js, api.js, app.js (getStats), positions.js
 * (Positions.riskStatus). Loaded after positions.js — see index.html.
 */

const Ledger = (() => {
  const { f$, fpct } = Utils;

  let filter = 'all';       // 'all' | 'open' | 'watching' | 'closed'
  let expandedSymbol = null; // one row expanded at a time

  // ── Build unified per-symbol rows ───────────────────────────
  function buildRows() {
    const symbols = new Set();
    APP.positions.forEach(p => symbols.add(p.symbol));
    APP.watchlist.forEach(w => symbols.add(w.symbol));
    APP.trades.forEach(t => symbols.add(t.symbol));

    const rows = [...symbols].sort().map(symbol => {
      const position = APP.positions.find(p => p.symbol === symbol) || null;
      const watching = APP.watchlist.find(w => w.symbol === symbol) || null;
      const trades   = APP.trades.filter(t => t.symbol === symbol);
      const live     = APP.liveData[symbol] || null;

      const tradeCount    = trades.length;
      const historicalNet = trades.reduce((s, t) => s + t.net, 0);
      const winRate       = tradeCount ? Math.round(trades.filter(t => t.net > 0).length / tradeCount * 100) : null;

      let openPnl = null, openPnlPct = null, risk = null;
      if (position && live?.price) {
        openPnl    = (live.price - position.avg_price) * position.qty;
        openPnlPct = (live.price - position.avg_price) / position.avg_price * 100;
        risk = (typeof Positions !== 'undefined') ? Positions.riskStatus(position, live) : null;
      }

      const hasStop = position ? !!position.stop_loss : null;
      let needsAttention = false, attentionReason = '';
      if (position) {
        if (!hasStop && openPnlPct !== null && openPnlPct < 0) {
          needsAttention = true; attentionReason = 'אין סטופ מוגדר';
        } else if (risk && risk.level === 'high') {
          needsAttention = true; attentionReason = 'סיכון גבוה';
        }
      }

      return {
        symbol,
        isOpen: !!position, isWatching: !!watching, hasHistory: tradeCount > 0,
        position, watching, live, trades,
        openPnl, openPnlPct, hasStop, risk,
        tradeCount, historicalNet, winRate,
        needsAttention, attentionReason,
      };
    });

    // Needs-attention first, then open, then watching, then closed-only —
    // alphabetical within each tier.
    const tier = r => r.needsAttention ? 0 : r.isOpen ? 1 : r.isWatching ? 2 : 3;
    rows.sort((a, b) => tier(a) - tier(b) || a.symbol.localeCompare(b.symbol));
    return rows;
  }

  function setFilter(f) { filter = f; render(); }

  function toggleDetail(symbol) {
    expandedSymbol = (expandedSymbol === symbol) ? null : symbol;
    render();
  }

  function _statusBadges(r) {
    const badges = [];
    if (r.isOpen)      badges.push(`<span class="badge badge-blue">Open</span>`);
    if (r.isWatching)  badges.push(`<span class="badge badge-purple">Watching</span>`);
    if (r.hasHistory)  badges.push(`<span class="badge badge-muted">${r.tradeCount} עסקאות</span>`);
    return badges.join(' ');
  }

  function _detailRow(r) {
    let html = '';
    if (r.position) {
      html += `
        <div class="ledger-detail-block">
          <div class="ledger-detail-title">פוזיציה פתוחה</div>
          <div class="ledger-detail-grid">
            <div><span style="color:var(--text-3)">כמות</span> <bdi>${r.position.qty}</bdi></div>
            <div><span style="color:var(--text-3)">כניסה</span> <bdi>$${r.position.avg_price}</bdi></div>
            <div><span style="color:var(--text-3)">יעד</span> ${r.position.target || '—'}</div>
            <div><span style="color:var(--text-3)">סטופ</span> ${r.position.stop_loss || '—'}</div>
            <div><span style="color:var(--text-3)">תאריך כניסה</span> ${r.position.added_date || '—'}</div>
          </div>
          ${r.position.notes ? `<div class="ledger-detail-notes">${r.position.notes}</div>` : ''}
        </div>`;
    }
    if (r.watching) {
      html += `
        <div class="ledger-detail-block">
          <div class="ledger-detail-title">ב-Watchlist</div>
          ${r.watching.note ? `<div class="ledger-detail-notes">${r.watching.note}</div>` : `<div style="color:var(--text-3)">ללא הערה</div>`}
        </div>`;
    }
    if (r.trades.length) {
      const rows = [...r.trades].sort((a, b) => Utils.parseDD(b.sell_date) - Utils.parseDD(a.sell_date)).slice(0, 10);
      html += `
        <div class="ledger-detail-block">
          <div class="ledger-detail-title">היסטוריית עסקאות (עד 10 אחרונות)</div>
          <div class="table-wrap"><table>
            <thead><tr><th>תאריך</th><th>כמות</th><th>קנייה</th><th>מכירה</th><th>נטו</th></tr></thead>
            <tbody>
              ${rows.map(t => `
                <tr>
                  <td>${t.sell_date}</td>
                  <td><bdi>${t.qty}</bdi></td>
                  <td><bdi>$${t.buy_price}</bdi></td>
                  <td><bdi>$${t.sell_price}</bdi></td>
                  <td class="${t.net >= 0 ? 'green' : 'red'}"><bdi>${f$(Math.round(t.net))}</bdi></td>
                </tr>`).join('')}
            </tbody>
          </table></div>
        </div>`;
    }
    return html;
  }

  function render() {
    const el = document.getElementById('tab-ledger');
    if (!el) return;

    const allRows = buildRows();
    const rows = filter === 'all' ? allRows : allRows.filter(r =>
      filter === 'open' ? r.isOpen : filter === 'watching' ? r.isWatching : !r.isOpen && !r.isWatching && r.hasHistory
    );

    const filters = [
      ['all', 'הכל', allRows.length],
      ['open', 'פתוחות', allRows.filter(r => r.isOpen).length],
      ['watching', 'במעקב', allRows.filter(r => r.isWatching).length],
      ['closed', 'רק היסטוריה', allRows.filter(r => !r.isOpen && !r.isWatching && r.hasHistory).length],
    ];

    el.innerHTML = `
      <div class="ledger-page">
        <div class="ledger-header">
          <div class="cockpit-title">Ledger</div>
          <div class="cockpit-sub">כל סימבול — מעקב, פוזיציה פתוחה, או היסטוריה — במקום אחד</div>
        </div>

        <div class="ledger-filters">
          ${filters.map(([key, label, count]) => `
            <button class="seg-btn ${filter === key ? 'active' : ''}" onclick="Ledger.setFilter('${key}')">${label} (${count})</button>
          `).join('')}
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>סימבול</th><th>סטטוס</th><th>מחיר חי</th><th>P&L פתוח</th>
                <th>עסקאות</th><th>נטו היסטורי</th><th>תשומת לב</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(r => `
                <tr class="ledger-row" onclick="Ledger.toggleDetail('${r.symbol}')">
                  <td style="font-weight:700">${r.symbol}</td>
                  <td>${_statusBadges(r)}</td>
                  <td><bdi>${r.live?.price ? '$' + r.live.price.toFixed(2) : '—'}</bdi></td>
                  <td class="${r.openPnl == null ? '' : r.openPnl >= 0 ? 'green' : 'red'}">
                    <bdi>${r.openPnl == null ? '—' : f$(Math.round(r.openPnl)) + ' (' + fpct(r.openPnlPct) + ')'}</bdi>
                  </td>
                  <td>${r.tradeCount || '—'}</td>
                  <td class="${!r.tradeCount ? '' : r.historicalNet >= 0 ? 'green' : 'red'}">
                    <bdi>${r.tradeCount ? f$(Math.round(r.historicalNet)) + (r.winRate !== null ? ' (WR ' + r.winRate + '%)' : '') : '—'}</bdi>
                  </td>
                  <td>${r.needsAttention ? `<span class="badge badge-red">${r.attentionReason}</span>` : '—'}</td>
                </tr>
                ${expandedSymbol === r.symbol ? `<tr><td colspan="7" style="background:var(--surface-2)">${_detailRow(r)}</td></tr>` : ''}
              `).join('') : `<tr><td colspan="7" style="color:var(--text-3);text-align:center;padding:24px">אין סימבולים בקטגוריה זו.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  return { render, setFilter, toggleDetail, buildRows };
})();
