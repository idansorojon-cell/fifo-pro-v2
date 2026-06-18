/**
 * FIFO PRO — performanceTimeline.js
 * Monthly performance timeline with grades, insights, improvement suggestions
 * Depends on: utils.js, app.js, dailyGrade.js
 */

const PerformanceTimeline = (() => {
  const { f$, monthLabel, currentMonthKey } = Utils;

  // ── Compute monthly insight ─────────────────────────────
  function computeMonthInsight(month, trades, grade) {
    if (!trades.length) return null;

    const net    = trades.reduce((s,t) => s+t.net, 0);
    const wins   = trades.filter(t => t.net > 0).length;
    const losses = trades.length - wins;
    const winRate = Math.round((wins / trades.length) * 100);

    // Main mistake
    let mainMistake = null;
    const noStop = trades.filter(t => t.respected_stop === 'לא').length;
    const noPlan = trades.filter(t => t.followed_plan === 'לא').length;
    const bigLoss = trades.filter(t => t.pct < -15).length;
    if (bigLoss > 0) mainMistake = `${bigLoss} הפסדים גדולים >15%`;
    else if (noStop > 1) mainMistake = `${noStop} עסקאות ללא כיבוד סטופ`;
    else if (noPlan > trades.length * 0.4) mainMistake = 'מסחר ללא תוכנית';

    // Main strength
    let mainStrength = null;
    if (winRate >= 70) mainStrength = `Win Rate מצוין: ${winRate}%`;
    else if (net > 5000) mainStrength = 'חודש רווחי מאוד';
    else if (trades.filter(t => t.followed_plan === 'כן').length > trades.length * 0.7) mainStrength = 'מסחר משמעתי';

    // Next month improvement
    let improvement = null;
    if (mainMistake?.includes('סטופ')) improvement = 'הגדר סטופ לפני כל כניסה';
    else if (mainMistake?.includes('תוכנית')) improvement = 'כתוב תוכנית מסחר לפני כל יום';
    else if (mainMistake?.includes('הפסד')) improvement = 'הקטן גודל פוזיציה בנכסים תנודתיים';
    else if (winRate < 50) improvement = 'בחן מחדש קריטריוני כניסה';
    else improvement = 'המשך כך — שמור עקביות';

    return {
      month, net, wins, losses, winRate, trades: trades.length,
      grade, mainMistake, mainStrength, improvement
    };
  }

  // ── Render ──────────────────────────────────────────────
  function render() {
    const el = document.getElementById('tab-ptimeline');
    if (!el) return;

    if (!APP.trades.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">אין עסקאות</div><div class="empty-sub">הוסף עסקאות כדי לראות Timeline</div></div>`;
      return;
    }

    // Gather monthly data
    const byMonth = {};
    APP.trades.forEach(t => {
      if (!byMonth[t.month]) byMonth[t.month] = [];
      byMonth[t.month].push(t);
    });

    const grades  = DailyGrade.monthlyGrades();
    const gradeMap = {};
    grades.forEach(g => { gradeMap[g.month] = g; });

    const months  = Object.keys(byMonth).sort();
    const insights = months.map(m => computeMonthInsight(m, byMonth[m], gradeMap[m]));

    // Aggregate stats
    const totalNet  = insights.reduce((s,i) => s+i.net, 0);
    const bestMonth = insights.reduce((a,b) => b.net > a.net ? b : a);
    const worstMonth = insights.reduce((a,b) => b.net < a.net ? b : a);
    const avgWinRate = Math.round(insights.reduce((s,i) => s+i.winRate, 0) / insights.length);

    el.innerHTML = `
      <div class="ptimeline-page">

        <!-- Header -->
        <div class="ptl-header">
          <div>
            <div style="font-size:18px;font-weight:700">📅 Performance Timeline</div>
            <div style="font-size:13px;color:var(--text-3)">ניתוח ביצועים חודש לחודש</div>
          </div>
        </div>

        <!-- Overall stats -->
        <div class="ptl-stats">
          <div class="ptl-stat">
            <div class="ptl-stat-val ${totalNet >= 0 ? 'green' : 'red'}">${f$(Math.round(totalNet))}</div>
            <div class="ptl-stat-label">רווח כולל</div>
          </div>
          <div class="ptl-stat">
            <div class="ptl-stat-val">${months.length}</div>
            <div class="ptl-stat-label">חודשים פעילים</div>
          </div>
          <div class="ptl-stat">
            <div class="ptl-stat-val green">${bestMonth ? monthLabel(bestMonth.month) : '—'}</div>
            <div class="ptl-stat-label">חודש הכי טוב</div>
          </div>
          <div class="ptl-stat">
            <div class="ptl-stat-val">${avgWinRate}%</div>
            <div class="ptl-stat-label">Win Rate ממוצע</div>
          </div>
        </div>

        <!-- Timeline -->
        <div class="ptl-timeline">
          ${insights.slice().reverse().map(i => _renderMonthCard(i)).join('')}
        </div>
      </div>
    `;
  }

  function _renderMonthCard(insight) {
    const { month, net, wins, losses, winRate, trades, grade,
            mainMistake, mainStrength, improvement } = insight;

    const G    = grade;
    const gradeInfo = G ? _gradeInfo(G.grade) : null;
    const isPositive = net >= 0;

    return `
      <div class="ptl-month-card">
        <div class="ptl-month-header">
          <div class="ptl-month-name">${monthLabel(month)}</div>
          <div class="ptl-month-net ${isPositive ? 'green' : 'red'}">${f$(Math.round(net))}</div>
          ${gradeInfo ? `<div class="ptl-grade-badge" style="color:${gradeInfo.color};background:${gradeInfo.bg}">${gradeInfo.label}</div>` : ''}
        </div>

        <div class="ptl-month-bar">
          <div class="ptl-bar-track">
            <div class="ptl-bar-fill" style="
              width:${Math.min(100, Math.abs(net) / 200)}%;
              background:${isPositive ? 'var(--green)' : 'var(--red)'};
              min-width:4px
            "></div>
          </div>
        </div>

        <div class="ptl-month-stats">
          <span>${trades} עסקאות</span>
          <span>•</span>
          <span class="green">${wins}W</span>
          <span>/</span>
          <span class="red">${losses}L</span>
          <span>•</span>
          <span>${winRate}% Win Rate</span>
        </div>

        <div class="ptl-month-insights">
          ${mainStrength ? `<div class="ptl-insight success"><span>✅</span><span>${mainStrength}</span></div>` : ''}
          ${mainMistake  ? `<div class="ptl-insight warning"><span>⚠️</span><span>${mainMistake}</span></div>` : ''}
          ${improvement  ? `<div class="ptl-insight info"><span>💡</span><span>${improvement}</span></div>` : ''}
        </div>
      </div>
    `;
  }

  function _gradeInfo(g) {
    const map = {
      A: { label:'A+', color:'var(--green)', bg:'var(--green-dim)' },
      B: { label:'A',  color:'var(--green)', bg:'var(--green-dim)' },
      C: { label:'B+', color:'var(--blue)',  bg:'var(--blue-dim)'  },
      D: { label:'B',  color:'var(--blue)',  bg:'var(--blue-dim)'  },
      E: { label:'C',  color:'var(--gold)',  bg:'var(--gold-dim)'  },
      F: { label:'D',  color:'var(--red)',   bg:'var(--red-dim)'   },
    };
    return map[g] || map.E;
  }

  return { render };
})();
