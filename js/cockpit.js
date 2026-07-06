/**
 * FIFO PRO — cockpit.js
 * FIFO PRO 2.0, Phase 1: the new default landing screen.
 *
 * Built additively alongside Mission Control (app.js/renderMissionControl) —
 * that screen is untouched and still fully reachable via the existing
 * "דשבורד" nav category. Nothing here modifies calcStats(), _shortCoachInsight(),
 * or Positions.riskStatus() — it only reads/reuses them.
 *
 * Design principle carried over from the FIFO PRO 2.0 product-discovery
 * work: lead with what needs a decision, not with how the P&L number feels.
 * See docs/ (2.0 vision + migration plan) for the full rationale.
 *
 * Depends on: utils.js, api.js, app.js (getStats/_shortCoachInsight),
 * positions.js (Positions.riskStatus). Loaded after all of these — see
 * index.html script order.
 */

const Cockpit = (() => {

  // ── Ranked action items ────────────────────────────────────
  // Highest-urgency first. "No stop set + currently losing" is flagged
  // ahead of a plain high-risk-by-percentage position, because a missing
  // stop is a process failure the trader can fix right now — not just a
  // number that happens to be bad today.
  function buildActionItems() {
    const items = [];

    (APP.positions || []).forEach(p => {
      const live = APP.liveData[p.symbol];
      if (!live?.price) return;

      const pnlPct   = (live.price - p.avg_price) / p.avg_price * 100;
      const hasStop  = !!p.stop_loss;
      const heldDays = p.added_date ? Math.round((Date.now() - Utils.parseDD(p.added_date).getTime()) / 86400000) : null;
      const risk     = (typeof Positions !== 'undefined') ? Positions.riskStatus(p, live) : null;

      if (!hasStop && pnlPct < 0) {
        items.push({
          severity: 'high',
          symbol: p.symbol,
          text: `${p.symbol}: אין סטופ מוגדר, <bdi>${Utils.fpct(pnlPct)}</bdi>${heldDays !== null ? `, ${heldDays} ימים בפוזיציה` : ''}`,
        });
        return; // most specific, most actionable signal for this position — don't also add a duplicate generic-risk row
      }

      if (risk && risk.level === 'high') {
        items.push({
          severity: 'high',
          symbol: p.symbol,
          text: `${p.symbol}: <bdi>${Utils.fpct(pnlPct)}</bdi> — סיכון גבוה${hasStop ? '' : ' (ללא סטופ)'}`,
        });
      } else if (risk && risk.level === 'warn') {
        items.push({
          severity: 'medium',
          symbol: p.symbol,
          text: `${p.symbol}: <bdi>${Utils.fpct(pnlPct)}</bdi> — מתקרב לאזור סיכון`,
        });
      }
    });

    const order = { high: 0, medium: 1 };
    items.sort((a, b) => order[a.severity] - order[b.severity]);
    return items;
  }

  // ── Truthful, risk-aware coach sentence ─────────────────────
  // Real-time position risk always takes priority over the existing
  // closed-trade-history insight (_shortCoachInsight, app.js — unmodified,
  // used only as a fallback here). This directly fixes a real bug found
  // during the Sprint 0 audit: the old ambient message could say
  // "excellent performance" while positions were down double digits with
  // no stop set, because it only ever looked at closed trades.
  function riskAwareInsight(st) {
    const items = buildActionItems();
    const highCount = items.filter(i => i.severity === 'high').length;

    if (highCount > 0) {
      return `${icon('alert-triangle')} ${highCount} ${highCount === 1 ? 'פוזיציה דורשת' : 'פוזיציות דורשות'} תשומת לב מיידית — ראה רשימת הפעולות למעלה.`;
    }
    if (items.length > 0) {
      return `${icon('alert-triangle')} ${items.length} ${items.length === 1 ? 'פוזיציה מתקרבת' : 'פוזיציות מתקרבות'} לאזור סיכון — כדאי לעקוב.`;
    }
    // No live position risk right now — safe to defer to the existing,
    // closed-trade-based insight exactly as-is.
    return (typeof _shortCoachInsight === 'function') ? _shortCoachInsight(st) : '';
  }

  // ── Render ───────────────────────────────────────────────────
  function render() {
    const el = document.getElementById('tab-cockpit');
    if (!el) return;

    const st    = getStats();
    const live  = Utils.calcLiveStats(APP.trades, APP.positions, APP.liveData);
    const items = buildActionItems();
    const insight = riskAwareInsight(st);

    const actionListHTML = items.length
      ? items.map(i => `
          <div class="cockpit-action cockpit-action--${i.severity}">
            ${icon(i.severity === 'high' ? 'octagon' : 'alert-triangle')}
            <span>${i.text}</span>
          </div>`).join('')
      : `<div class="cockpit-action cockpit-action--ok">${icon('check-circle')}<span>אין פוזיציות שדורשות תשומת לב מיידית כרגע.</span></div>`;

    el.innerHTML = `
      <div class="cockpit-page">

        <div class="cockpit-header">
          <div class="cockpit-title">Cockpit</div>
          <div class="cockpit-sub">${timeGreeting()} ${Auth.getDisplayName()} · מה דורש תשומת לב עכשיו — לפני המספרים</div>
        </div>

        <div class="cockpit-actions">
          ${actionListHTML}
        </div>

        <div class="mc-hero">
          <div class="mc-hero-label">שווי כולל — Realized + Unrealized</div>
          <div class="mc-hero-value ${live.combinedNet >= 0 ? 'green' : 'red'}"><bdi>${Utils.f$(Math.round(live.combinedNet))}</bdi></div>
          <div class="mc-hero-sub">
            רווח ממומש: <bdi>${Utils.f$(Math.round(live.realizedNet))}</bdi> ·
            פתוח <bdi>(${live.liveCount}/${live.positionsCount} live)</bdi>: <bdi>${Utils.f$(Math.round(live.unrealizedNet))}</bdi>
          </div>
        </div>

        <div class="mc-grid mc-grid-2">
          <div class="mc-card">
            <div class="mc-label">${icon('trending-up')} פוזיציות פתוחות</div>
            ${APP.positions.length
              ? `<div class="mc-value-sm">${APP.positions.length}</div><div class="mc-sub">${APP.positions.map(p => p.symbol).join(', ')}</div>`
              : `<div class="mc-sub">אין פוזיציות פתוחות</div>`}
          </div>
          <div class="mc-card">
            <div class="mc-label">${icon('list')} פעולות פתוחות</div>
            <div class="mc-value-sm">${items.length}</div>
            <div class="mc-sub">${items.filter(i => i.severity === 'high').length} בדחיפות גבוהה</div>
          </div>
        </div>

        <div class="mc-card mc-coach">
          <div class="mc-label">${icon('cpu')} AI Coach</div>
          <div class="mc-coach-msg">${insight}</div>
        </div>

      </div>
    `;
  }

  return { render, buildActionItems, riskAwareInsight };
})();
