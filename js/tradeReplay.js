/**
 * FIFO PRO — tradeReplay.js
 * Trade Replay: visual timeline of entries, exits, P&L, patterns
 * Depends on: utils.js, app.js
 */

const TradeReplay = (() => {
  const { f$, fpct, parseDD, monthLabel } = Utils;

  let currentMonth = null;

  // ── Get months list ─────────────────────────────────────
  function getMonths() {
    const months = [...new Set(APP.trades.map(t => t.month))].sort();
    return months;
  }

  // ── Render container ────────────────────────────────────
  function render() {
    const el = document.getElementById('tab-replay');
    if (!el) return;

    const months = getMonths();
    if (!months.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎬</div><div class="empty-title">אין עסקאות</div><div class="empty-sub">הוסף עסקאות כדי לראות Replay</div></div>`;
      return;
    }

    if (!currentMonth || !months.includes(currentMonth)) {
      currentMonth = months[months.length - 1];
    }

    el.innerHTML = `
      <div class="replay-page">
        <div class="replay-header">
          <div>
            <div style="font-size:18px;font-weight:700">🎬 Trade Replay</div>
            <div style="font-size:13px;color:var(--text-3)">ציר זמן ויזואלי של המסחר שלך</div>
          </div>
          <div class="replay-month-picker">
            ${months.map(m => `
              <button class="month-pill ${m === currentMonth ? 'active' : ''}"
                onclick="TradeReplay.selectMonth('${m}')">
                ${monthLabel(m)}
              </button>
            `).join('')}
          </div>
        </div>
        <div id="replay-content"></div>
      </div>
    `;

    renderMonth(currentMonth);
  }

  function selectMonth(m) {
    currentMonth = m;
    render();
  }

  // ── Render month timeline ───────────────────────────────
  function renderMonth(month) {
    const el = document.getElementById('replay-content');
    if (!el) return;

    const trades = APP.trades
      .filter(t => t.month === month)
      .sort((a, b) => parseDD(a.sell_date) - parseDD(b.sell_date));

    if (!trades.length) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-3)">אין עסקאות בחודש זה</div>`;
      return;
    }

    // Summary stats
    const totalNet  = trades.reduce((s,t) => s+t.net, 0);
    const wins      = trades.filter(t => t.net > 0).length;
    const losses    = trades.filter(t => t.net < 0).length;
    const best      = trades.reduce((a,b) => b.net > a.net ? b : a);
    const worst     = trades.reduce((a,b) => b.net < a.net ? b : a);

    // Build cumulative P&L for sparkline
    let cumulative = 0;
    const cumData = trades.map(t => { cumulative += t.net; return cumulative; });

    // Pattern detection
    const patterns = detectPatterns(trades);

    el.innerHTML = `
      <!-- Month summary bar -->
      <div class="replay-summary">
        <div class="rs-stat">
          <div class="rs-val ${totalNet >= 0 ? 'green' : 'red'}">${f$(Math.round(totalNet))}</div>
          <div class="rs-label">רווח נטו</div>
        </div>
        <div class="rs-stat">
          <div class="rs-val">${trades.length}</div>
          <div class="rs-label">עסקאות</div>
        </div>
        <div class="rs-stat">
          <div class="rs-val green">${wins}</div>
          <div class="rs-label">רווחות</div>
        </div>
        <div class="rs-stat">
          <div class="rs-val red">${losses}</div>
          <div class="rs-label">הפסדים</div>
        </div>
        <div class="rs-stat">
          <div class="rs-val">${wins && trades.length ? Math.round(wins/trades.length*100) : 0}%</div>
          <div class="rs-label">Win Rate</div>
        </div>
      </div>

      ${patterns.length ? `
        <div class="replay-patterns">
          <div style="font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">דפוסים שזוהו</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${patterns.map(p => `<div class="pattern-badge ${p.type}">${p.icon} ${p.text}</div>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Timeline -->
      <div class="replay-timeline">
        ${trades.map((t, i) => _renderTradeEvent(t, i, cumData[i], trades)).join('')}
      </div>
    `;
  }

  // ── Render single trade event ───────────────────────────
  function _renderTradeEvent(t, i, cumPnl, allTrades) {
    const isWin  = t.net > 0;
    const isBig  = Math.abs(t.pct) > 15;
    const isLong = (t.hold_days || 0) > 7;
    const missed = _detectMissedExit(t, allTrades);

    const color = isWin ? 'var(--green)' : 'var(--red)';
    const bgColor = isWin ? 'var(--green-dim)' : 'var(--red-dim)';

    const warnings = [];
    if (!t.followed_plan || t.followed_plan === 'לא') warnings.push({ icon: '⚠️', text: 'לא לפי תוכנית' });
    if (!t.respected_stop || t.respected_stop === 'לא') warnings.push({ icon: '🔴', text: 'לא כיבד סטופ' });
    if (missed) warnings.push({ icon: '📍', text: missed });
    if (t.hold_days > 20 && t.net < 0) warnings.push({ icon: '⏰', text: 'החזקה ממושכת בהפסד' });

    return `
      <div class="timeline-item ${isWin ? 'win' : 'loss'}">
        <!-- Connector -->
        <div class="timeline-connector">
          <div class="timeline-dot" style="background:${color};box-shadow:0 0 8px ${color}40"></div>
          ${i < allTrades.length - 1 ? '<div class="timeline-line"></div>' : ''}
        </div>

        <!-- Card -->
        <div class="timeline-card">
          <div class="tc-header">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="tc-sym">${t.symbol}</div>
              ${isBig ? `<div class="badge ${isWin ? 'badge-green' : 'badge-red'}">🔥 ${Math.abs(t.pct).toFixed(0)}%</div>` : ''}
              ${isLong ? `<div class="badge badge-blue">⏳ ${t.hold_days}d</div>` : ''}
            </div>
            <div class="tc-pnl" style="color:${color}">${f$(Math.round(t.net))}</div>
          </div>

          <div class="tc-details">
            <div class="tc-detail">
              <span>כניסה</span>
              <span>${t.buy_date} @ $${t.buy_price}</span>
            </div>
            <div class="tc-detail">
              <span>יציאה</span>
              <span>${t.sell_date} @ $${t.sell_price}</span>
            </div>
            <div class="tc-detail">
              <span>כמות</span>
              <span>${t.qty.toLocaleString()}</span>
            </div>
            <div class="tc-detail">
              <span>תשואה</span>
              <span style="color:${color};font-weight:700">${fpct(t.pct)}</span>
            </div>
            <div class="tc-detail">
              <span>P&L מצטבר</span>
              <span style="color:${cumPnl >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700">${f$(Math.round(cumPnl))}</span>
            </div>
            <div class="tc-detail">
              <span>ימי החזקה</span>
              <span>${t.hold_days ?? '—'}</span>
            </div>
          </div>

          ${warnings.length ? `
            <div class="tc-warnings">
              ${warnings.map(w => `<div class="tc-warning">${w.icon} ${w.text}</div>`).join('')}
            </div>
          ` : ''}

          ${t.lesson ? `<div class="tc-lesson">💡 ${t.lesson}</div>` : ''}
          ${t.entry_reason ? `<div class="tc-note">📌 כניסה: ${t.entry_reason}</div>` : ''}
        </div>
      </div>
    `;
  }

  // ── Detect missed exit ──────────────────────────────────
  function _detectMissedExit(t, allTrades) {
    // If trade was positive at some point but exited at loss
    if (t.net < 0 && t.pct < -8 && (t.hold_days || 0) > 3) {
      return 'ייתכן שהיה כדאי לצאת קודם';
    }
    return null;
  }

  // ── Pattern detection ───────────────────────────────────
  function detectPatterns(trades) {
    const patterns = [];

    // Consecutive losses (3+)
    let streak = 0;
    let maxStreak = 0;
    trades.forEach(t => {
      if (t.net < 0) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else streak = 0;
    });
    if (maxStreak >= 3) patterns.push({ icon: '📉', text: `${maxStreak} הפסדים רצופים`, type: 'warning' });

    // FOMO entries (big gap up then loss)
    const fomo = trades.filter(t => t.pct > 15 && (t.hold_days || 0) === 0 && t.net < 0);
    if (fomo.length) patterns.push({ icon: '😰', text: `${fomo.length} כניסות FOMO`, type: 'danger' });

    // Great wins
    const bigWins = trades.filter(t => t.pct > 20 && t.net > 0);
    if (bigWins.length >= 2) patterns.push({ icon: '🚀', text: `${bigWins.length} עסקאות >20%`, type: 'success' });

    // Plan follower
    const planRate = trades.filter(t => t.followed_plan === 'כן').length / trades.length;
    if (planRate > 0.8) patterns.push({ icon: '🎯', text: `${Math.round(planRate*100)}% לפי תוכנית`, type: 'success' });

    // No stops
    const noStop = trades.filter(t => t.respected_stop === 'לא').length;
    if (noStop >= 2) patterns.push({ icon: '⚠️', text: `${noStop} פעמים בלי סטופ`, type: 'warning' });

    return patterns;
  }

  return { render, selectMonth };
})();
