/**
 * FIFO PRO — dailyGrade.js
 * Daily Trading Grade: Execution, Risk, Discipline, Psychology, Overall
 * Depends on: utils.js, app.js
 */

const DailyGrade = (() => {
  const { parseDD, currentMonthKey } = Utils;

  // ── Grade thresholds ────────────────────────────────────
  const GRADE_LABELS = {
    A: { label: 'A+', color: 'var(--green)',  bg: 'var(--green-dim)',  text: 'מדהים' },
    B: { label: 'A',  color: 'var(--green)',  bg: 'var(--green-dim)',  text: 'מצוין' },
    C: { label: 'B+', color: 'var(--blue)',   bg: 'var(--blue-dim)',   text: 'טוב' },
    D: { label: 'B',  color: 'var(--blue)',   bg: 'var(--blue-dim)',   text: 'סביר' },
    E: { label: 'C',  color: 'var(--gold)',   bg: 'var(--gold-dim)',   text: 'בינוני' },
    F: { label: 'D',  color: 'var(--red)',    bg: 'var(--red-dim)',    text: 'דורש שיפור' },
  };

  function gradeFromScore(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    if (score >= 45) return 'E';
    return 'F';
  }

  // ── Compute grade for a set of trades ──────────────────
  function computeGrade(trades) {
    if (!trades.length) return null;

    const total = trades.length;
    const wins  = trades.filter(t => t.net > 0).length;
    const winRate = total ? (wins / total) * 100 : 0;

    // 1. Execution (did trades follow plan, hit targets?)
    const withPlan   = trades.filter(t => t.followed_plan === 'כן').length;
    const planRate   = total ? (withPlan / total) * 100 : 50;
    const avgPct     = trades.reduce((s,t) => s + (t.pct || 0), 0) / total;
    const execScore  = Math.min(100, planRate * 0.6 + Math.max(0, Math.min(40, (avgPct + 5) * 2)));

    // 2. Risk (stop losses respected, not averaging down losers)
    const withStop   = trades.filter(t => t.respected_stop === 'כן').length;
    const stopRate   = total ? (withStop / total) * 100 : 50;
    const bigLosses  = trades.filter(t => t.pct < -15).length;
    const bigLossPenalty = bigLosses * 15;
    const riskScore  = Math.max(0, Math.min(100, stopRate * 0.7 + (winRate >= 50 ? 20 : 0) + 10 - bigLossPenalty));

    // 3. Discipline (no revenge trading, no FOMO, held stops)
    const lossTrades  = trades.filter(t => t.net < 0);
    const revengeCount = trades.filter((t, i) => {
      if (i === 0) return false;
      const prev = trades[i-1];
      return prev.net < 0 && t.net < 0 &&
        parseDD(t.buy_date) - parseDD(prev.sell_date) < 86400000 * 2;
    }).length;
    const fomoCount = trades.filter(t => t.pct > 15 && (t.hold_days || 0) === 0 && t.net < 0).length;
    const discScore = Math.max(0, Math.min(100,
      80 + (winRate >= 60 ? 10 : 0) - (revengeCount * 15) - (fomoCount * 10)));

    // 4. Psychology (emotions, consistency)
    const negEmotions = trades.filter(t => {
      const e = (t.emotion || '').toLowerCase();
      return e.includes('פחד') || e.includes('תסכול') || e.includes('כעס') || e.includes('חרדה');
    }).length;
    const psychScore = Math.max(0, Math.min(100,
      70 + (planRate > 70 ? 15 : 0) - (negEmotions / Math.max(1, total)) * 30));

    // Overall weighted
    const overall = Math.round(
      execScore * 0.30 +
      riskScore * 0.30 +
      discScore * 0.25 +
      psychScore * 0.15
    );

    return {
      execution:   Math.round(execScore),
      risk:        Math.round(riskScore),
      discipline:  Math.round(discScore),
      psychology:  Math.round(psychScore),
      overall,
      grade: gradeFromScore(overall),
      winRate: Math.round(winRate),
      trades: total,
    };
  }

  // ── Today's grade ───────────────────────────────────────
  function todayGrade() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayTrades = APP.trades.filter(t => {
      const d = parseDD(t.sell_date);
      return d >= today;
    });
    return todayTrades.length ? computeGrade(todayTrades) : null;
  }

  // ── Monthly grades ──────────────────────────────────────
  function monthlyGrades() {
    const byMonth = {};
    APP.trades.forEach(t => {
      if (!byMonth[t.month]) byMonth[t.month] = [];
      byMonth[t.month].push(t);
    });
    return Object.entries(byMonth)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([month, trades]) => ({ month, ...computeGrade(trades) }));
  }

  // ── Render ──────────────────────────────────────────────
  function render() {
    const el = document.getElementById('tab-grade');
    if (!el) return;

    const st = getStats();
    const todayG   = todayGrade();
    const monthlyG = monthlyGrades();
    const curMonth = currentMonthKey();
    const curG     = monthlyG.find(g => g.month === curMonth);

    el.innerHTML = `
      <div class="grade-page">

        <!-- Today grade -->
        <div class="grade-hero">
          <div class="grade-hero-title">Trading Grade — היום</div>
          ${todayG ? _renderGradeCard(todayG, 'היום') : `
            <div class="grade-empty">
              <div style="font-size:40px;margin-bottom:12px">📋</div>
              <div style="font-size:15px;color:var(--text-2);font-weight:600">אין עסקאות סגורות היום</div>
              <div style="font-size:13px;color:var(--text-3);margin-top:4px">הציון מחושב לאחר סגירת עסקאות</div>
            </div>
          `}
        </div>

        <!-- Current month grade -->
        ${curG ? `
          <div class="card">
            <div class="card-title">📅 ציון החודש — ${Utils.monthLabel(curMonth)}</div>
            ${_renderGradeCard(curG, Utils.monthLabel(curMonth))}
          </div>
        ` : ''}

        <!-- Monthly history -->
        <div class="card">
          <div class="card-title">📈 היסטוריה חודשית</div>
          ${monthlyG.length ? `
            <div class="grade-history">
              ${monthlyG.slice().reverse().slice(0,12).map(g => _renderGradeRow(g)).join('')}
            </div>
          ` : '<div style="color:var(--text-3);padding:16px">אין מספיק נתונים</div>'}
        </div>

        <!-- Grade explanation -->
        <div class="card">
          <div class="card-title">ℹ️ איך מחושב הציון</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
            ${_gradeComponent('⚡ Execution', '30%', 'לפי תוכנית, יחס ממוצע')}
            ${_gradeComponent('🛡️ Risk', '30%', 'כיבוד סטופ, הפסדים גדולים')}
            ${_gradeComponent('🎯 Discipline', '25%', 'Revenge, FOMO, רצף')}
            ${_gradeComponent('🧠 Psychology', '15%', 'מצב רגשי, עקביות')}
          </div>
        </div>
      </div>
    `;
  }

  function _renderGradeCard(g, label) {
    const info = GRADE_LABELS[g.grade];
    const components = [
      { name: 'Execution',  score: g.execution,  icon: '⚡', color: _scoreColor(g.execution) },
      { name: 'Risk',       score: g.risk,        icon: '🛡️', color: _scoreColor(g.risk) },
      { name: 'Discipline', score: g.discipline,  icon: '🎯', color: _scoreColor(g.discipline) },
      { name: 'Psychology', score: g.psychology,  icon: '🧠', color: _scoreColor(g.psychology) },
    ];
    return `
      <div class="grade-card">
        <div class="grade-overall" style="color:${info.color};background:${info.bg}">
          <div class="grade-letter">${info.label}</div>
          <div class="grade-score">${g.overall}/100</div>
          <div class="grade-text">${info.text}</div>
        </div>
        <div class="grade-components">
          ${components.map(c => `
            <div class="grade-component">
              <div class="gc-header">
                <span>${c.icon} ${c.name}</span>
                <span style="font-weight:700;color:${c.color}">${c.score}</span>
              </div>
              <div class="de-bar"><div class="de-bar-fill" style="width:${c.score}%;background:${c.color}"></div></div>
            </div>
          `).join('')}
        </div>
        <div class="grade-stats">
          <div class="grade-stat"><div class="grade-stat-val">${g.trades}</div><div class="grade-stat-label">עסקאות</div></div>
          <div class="grade-stat"><div class="grade-stat-val green">${g.winRate}%</div><div class="grade-stat-label">Win Rate</div></div>
        </div>
      </div>
    `;
  }

  function _renderGradeRow(g) {
    const info = GRADE_LABELS[g.grade];
    return `
      <div class="grade-row">
        <div class="grade-row-month">${Utils.monthLabel(g.month)}</div>
        <div class="grade-row-bar">
          <div style="height:6px;border-radius:3px;background:var(--surface-3);overflow:hidden;flex:1">
            <div style="height:100%;width:${g.overall}%;background:${info.color};border-radius:3px;transition:width 0.6s ease"></div>
          </div>
          <span style="font-size:11px;color:var(--text-3);width:30px;text-align:left">${g.overall}</span>
        </div>
        <div class="grade-badge" style="color:${info.color};background:${info.bg}">${info.label}</div>
        <div class="grade-row-meta">${g.trades} עסקאות | ${g.winRate}% Win</div>
      </div>
    `;
  }

  function _gradeComponent(title, weight, desc) {
    return `
      <div style="background:var(--surface-2);border-radius:var(--r-md);padding:12px">
        <div style="font-weight:700;margin-bottom:4px">${title}</div>
        <div style="font-size:11px;color:var(--green);font-weight:600;margin-bottom:4px">משקל: ${weight}</div>
        <div style="font-size:12px;color:var(--text-3)">${desc}</div>
      </div>
    `;
  }

  function _scoreColor(score) {
    if (score >= 75) return 'var(--green)';
    if (score >= 55) return 'var(--blue)';
    if (score >= 40) return 'var(--gold)';
    return 'var(--red)';
  }

  return { render, computeGrade, todayGrade, monthlyGrades };
})();
