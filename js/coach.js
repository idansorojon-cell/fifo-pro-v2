/**
 * FIFO PRO — coach.js
 * FIFO PRO 2.0, Phase 3: the Coach — a real behavioral coach, not another
 * AI screen.
 *
 * Every insight below is a deterministic comparison over data already
 * loaded client-side (APP.trades/positions/liveData) — there is no new
 * AI/LLM call here, on purpose: the brief was evidence, not generation.
 * Existing AI Chat (aiChat.js), AI Coach (aiCoach.js), and Decision
 * Engine (decisionEngine.js) are untouched — this reuses their
 * underlying data/functions (Utils.detectMistakes, getStats,
 * Cockpit.buildActionItems) rather than duplicating or replacing them.
 * Read-only: no API calls anywhere in this file.
 *
 * Depends on: utils.js, app.js (getStats), cockpit.js
 * (Cockpit.buildActionItems — Phase 1). Loaded after cockpit.js.
 */

const Coach = (() => {
  const { f$, fpct, parseDD } = Utils;

  // ── New, small, additive aggregate ──────────────────────────
  // Not in calcStats() — a pure display-time computation over already-
  // loaded trades, same category as Cockpit's calcLiveStats() in Phase 1.
  // Needed to answer "am I holding losers longer than my winning
  // pattern?" with an actual number instead of a guess.
  function avgHoldByOutcome(trades) {
    const wins   = trades.filter(t => t.net > 0);
    const losses = trades.filter(t => t.net < 0);
    return {
      avgHoldWin:  wins.length   ? wins.reduce((s, t) => s + (t.hold_days || 0), 0) / wins.length     : null,
      avgHoldLoss: losses.length ? losses.reduce((s, t) => s + (t.hold_days || 0), 0) / losses.length  : null,
      winCount: wins.length, lossCount: losses.length,
    };
  }

  function heldDays(position) {
    if (!position.added_date) return null;
    return Math.round((Date.now() - parseDD(position.added_date).getTime()) / 86400000);
  }

  // How much of the closed-trade history actually has plan-adherence
  // data logged at all — needed to answer honestly, not confidently,
  // whether "changing the plan" is detectable from what's recorded.
  function planDataCoverage(trades) {
    const logged = trades.filter(t => t.followed_plan === 'כן' || t.followed_plan === 'לא' || t.followed_plan === 'חלקית');
    return { logged: logged.length, total: trades.length };
  }

  // ── Build every insight ─────────────────────────────────────
  function buildInsights() {
    const trades    = APP.trades;
    const mistakes  = Utils.detectMistakes(trades);            // reused, unmodified
    const holdStats = avgHoldByOutcome(trades);
    const planCov   = planDataCoverage(trades);
    const topAction = (typeof Cockpit !== 'undefined') ? Cockpit.buildActionItems()[0] : null;

    const perPosition = [];

    (APP.positions || []).forEach(p => {
      const live = APP.liveData[p.symbol];
      if (!live?.price) return;
      const pnlPct = (live.price - p.avg_price) / p.avg_price * 100;
      const days   = heldDays(p);
      const hasStop = !!p.stop_loss;
      const entry   = { symbol: p.symbol, findings: [] };

      // Q: repeating a historical mistake? (no stop + currently losing)
      if (!hasStop && pnlPct < 0) {
        entry.findings.push({
          severity: 'high',
          text: mistakes.noStop > 0
            ? `אין סטופ מוגדר בזמן הפסד של ${fpct(pnlPct)}. יש לך ${mistakes.noStop} עסקאות היסטוריות שנסגרו ללא סטופ — זה אותו דפוס, בזמן אמת.`
            : `אין סטופ מוגדר בזמן הפסד של ${fpct(pnlPct)}. (אין מספיק היסטוריה של עסקאות ללא סטופ כדי להשוות דפוס — זו עדיין עובדה, לא ניחוש.)`,
        });
      }

      // Q: holding this loser longer than the winning pattern?
      if (pnlPct < 0 && days !== null) {
        if (holdStats.avgHoldWin !== null) {
          if (days > holdStats.avgHoldWin) {
            entry.findings.push({
              severity: 'medium',
              text: `מוחזק ${days} ימים בהפסד — זמן ההחזקה הממוצע שלך בעסקאות מנצחות הוא ${holdStats.avgHoldWin.toFixed(1)} ימים. אתה כבר מחזיק את זה ${(days / holdStats.avgHoldWin).toFixed(1)}× יותר מזמן.`,
            });
          }
        } else {
          entry.findings.push({ severity: 'low', text: `מוחזק ${days} ימים בהפסד. אין מספיק עסקאות מנצחות בהיסטוריה שלך כדי להשוות זמן החזקה — לא ניתן לענות על זה באמינות עדיין.` });
        }
      }

      // Q: cutting winners too early? — historical-tendency reminder,
      // never a claim about what's happening right now (can't be known
      // from static data).
      if (pnlPct > 0) {
        entry.findings.push({
          severity: 'info',
          text: mistakes.earlyExit > 0
            ? `כרגע ברווח של ${fpct(pnlPct)}. יש לך ${mistakes.earlyExit} מקרים היסטוריים של יציאה מוקדמת מרווח קטן — לא אומר שתעשה זאת כאן, אבל שווה לזכור לפני החלטה.`
            : `כרגע ברווח של ${fpct(pnlPct)}. אין מספיק היסטוריה של יציאות מוקדמות כדי לזהות דפוס כזה אצלך.`,
        });
      }

      if (entry.findings.length) perPosition.push(entry);
    });

    return { mistakes, holdStats, planCov, topAction, perPosition };
  }

  // ── Render ───────────────────────────────────────────────────
  function render() {
    const el = document.getElementById('tab-coach-evidence');
    if (!el) return;

    if (!APP.trades.length && !APP.positions.length) {
      el.innerHTML = `<div class="cockpit-page"><div class="cockpit-header"><div class="cockpit-title">Coach</div></div><div style="color:var(--text-3);padding:20px 0">אין מספיק נתונים לניתוח עדיין.</div></div>`;
      return;
    }

    const d = buildInsights();

    const priorityHTML = d.topAction
      ? `<div class="cockpit-action cockpit-action--${d.topAction.severity}">${icon(d.topAction.severity === 'high' ? 'octagon' : 'alert-triangle')}<span>${d.topAction.text}</span></div>`
      : `<div class="cockpit-action cockpit-action--ok">${icon('check-circle')}<span>לא זוהתה פוזיציה שדורשת תשומת לב מיידית כרגע — זו התשובה, לא ניחוש.</span></div>`;

    const positionsHTML = d.perPosition.length
      ? d.perPosition.map(entry => `
          <div class="ledger-detail-block">
            <div class="ledger-detail-title">${entry.symbol}</div>
            ${entry.findings.map(f => `
              <div class="cockpit-action cockpit-action--${f.severity === 'info' ? 'ok' : f.severity}" style="margin-bottom:6px">
                <span>${f.text}</span>
              </div>`).join('')}
          </div>`).join('')
      : `<div style="color:var(--text-3)">אין פוזיציות פתוחות עם מחיר חי לניתוח כרגע.</div>`;

    const planChangeHTML = `
      <div class="ledger-detail-block">
        <div class="ledger-detail-title">האם אני משנה את התוכנית שלי?</div>
        <div style="color:var(--text-2);font-size:13px;line-height:1.6">
          אין מספיק נתונים כדי לענות על זה באמינות. האפליקציה שומרת רק את הסטופ/יעד <strong>הנוכחיים</strong> של כל פוזיציה — לא היסטוריה של מה שהיה קודם — כך שאין דרך לדעת אם שינית משהו לעומת התוכנית המקורית.
          מתוך ${d.planCov.total} עסקאות סגורות, רק ${d.planCov.logged} מתועדות עם נתון "עמידה בתוכנית" בכלל — כך שגם ההיסטוריה חלקית מאוד.
          זו בדיוק הפער שזוהה בשיחת הגילוי של FIFO PRO 2.0: כדי לענות על השאלה הזו באמת צריך לנעול את התוכנית המקורית ברגע הכניסה ולתעד כל שינוי בה — זה דורש נתיב כתיבה חדש, ולכן לא ממומש בשלב הקריאה-בלבד הזה.
        </div>
      </div>`;

    const evidenceHTML = `
      <div class="ledger-detail-block">
        <div class="ledger-detail-title">העדויות הגולמיות (כדי שתוכל לבדוק בעצמך)</div>
        <div class="ledger-detail-grid">
          <div><span style="color:var(--text-3)">החזקת הפסדים >7 ימים</span> ${d.mistakes.holdingLosers} עסקאות</div>
          <div><span style="color:var(--text-3)">יציאה מוקדמת מרווח</span> ${d.mistakes.earlyExit} עסקאות</div>
          <div><span style="color:var(--text-3)">Revenge Trading</span> ${d.mistakes.revenge} מקרים</div>
          <div><span style="color:var(--text-3)">ללא סטופ (מתועד)</span> ${d.mistakes.noStop} עסקאות</div>
          <div><span style="color:var(--text-3)">זמן החזקה ממוצע — מנצחות</span> ${d.holdStats.avgHoldWin !== null ? d.holdStats.avgHoldWin.toFixed(1) + ' ימים' : 'אין מספיק נתונים'}</div>
          <div><span style="color:var(--text-3)">זמן החזקה ממוצע — מפסידות</span> ${d.holdStats.avgHoldLoss !== null ? d.holdStats.avgHoldLoss.toFixed(1) + ' ימים' : 'אין מספיק נתונים'}</div>
        </div>
      </div>`;

    el.innerHTML = `
      <div class="cockpit-page">
        <div class="cockpit-header">
          <div class="cockpit-title">Coach</div>
          <div class="cockpit-sub">תוכנית מול מציאות מול היסטוריה — כל תובנה מגובה בעדות, או שנאמר בפירוש שאין מספיק נתונים</div>
        </div>

        <div class="cockpit-actions">
          ${priorityHTML}
        </div>

        <div class="mc-card">
          <div class="mc-label">${icon('list')} לפי פוזיציה</div>
          ${positionsHTML}
        </div>

        <div class="mc-card">
          <div class="mc-label">${icon('cpu')} שינוי תוכנית</div>
          ${planChangeHTML}
        </div>

        <div class="mc-card">
          <div class="mc-label">${icon('search')} עדויות</div>
          ${evidenceHTML}
        </div>
      </div>
    `;
  }

  return { render, buildInsights, avgHoldByOutcome };
})();
