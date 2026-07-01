/**
 * FIFO PRO — dashboard.js
 * Dashboard KPIs, weekly summary, goal card
 * Depends on: utils.js, app.js
 */

const Dashboard = (() => {
  const { f$, fILS, fpct, fnum, usdToIls, tradesNetIls,
          currentMonthKey, parseDD, monthLabel, LS } = Utils;

  // ── Main render ─────────────────────────────────────────

  function render(st) {
    renderHero(st);
    renderKPIs(st);
    renderWeeklySummary();
    renderGoalCard(st);
    renderPortfolioHealth(st);
  }

  // ── Dashboard hero ──────────────────────────────────────
  function renderHero(st) {
    const el = document.getElementById('dash-hero');
    if (!el) return;

    const now = new Date();
    const curM = currentMonthKey();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 1) % 7));
    weekStart.setHours(0,0,0,0);

    const today = now.toISOString().split('T')[0];
    const todayTrades = APP.trades.filter(t => t.sell_date === today);
    const weekTrades  = APP.trades.filter(t => { const d = parseDD(t.sell_date); return d >= weekStart && d <= now; });
    const monthTrades = APP.trades.filter(t => t.month === curM);

    const todayPnl = todayTrades.reduce((s,t) => s+t.net, 0);
    const weekPnl  = weekTrades.reduce((s,t) => s+t.net, 0);
    const monthPnl = monthTrades.reduce((s,t) => s+t.net, 0);

    const goal = APP.monthGoal || 5000;
    const goalPct = Math.min(Math.round((monthPnl / goal) * 100), 100);
    const goalPctDisplay = Math.round((monthPnl / goal) * 100);

    const openPnl = APP.positions.reduce((s, p) => {
      const live = APP.liveData[p.symbol];
      return s + (live?.price ? (live.price - p.avg_price) * p.qty : 0);
    }, 0);

    const hr = now.getHours();
    const greeting = hr < 12 ? 'בוקר טוב' : hr < 17 ? 'צהריים טובים' : 'ערב טוב';
    const dayName  = now.toLocaleDateString('he-IL', { weekday:'long', month:'long', day:'numeric' });

    const _pill = (val, label) => {
      const pos = val >= 0;
      return `<div class="dh-pill ${pos?'dh-pill-green':'dh-pill-red'}">
        <span class="dh-pill-label">${label}</span>
        <span class="dh-pill-val">${pos?'+':''}${f$(Math.round(val))}</span>
      </div>`;
    };

    el.innerHTML = `
      <div class="dh-greeting">
        <span class="dh-greeting-text">${greeting} 👋</span>
        <span class="dh-date">${dayName}</span>
      </div>
      <div class="dh-stats">
        ${_pill(todayPnl, 'היום')}
        ${_pill(weekPnl, 'השבוע')}
        ${_pill(monthPnl, 'החודש')}
        ${APP.positions.length ? _pill(openPnl, 'פתוח') : ''}
        <div class="dh-goal-pill">
          <span class="dh-pill-label">יעד חודשי</span>
          <div class="dh-goal-bar-wrap">
            <div class="dh-goal-bar" style="width:${goalPct}%"></div>
          </div>
          <span class="dh-pill-val">${goalPctDisplay}%</span>
        </div>
      </div>
    `;
  }

  // ── Portfolio KPIs ──────────────────────────────────────

  function renderKPIs(st) {
    const el = document.getElementById('kpi-grid');
    if (!el) return;

    // Monthly breakdown
    const now = new Date();
    const curM = currentMonthKey();
    const prevM = (() => {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    })();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 1) % 7));
    weekStart.setHours(0,0,0,0);

    const thisMonthTrades = APP.trades.filter(t => t.month === curM);
    const prevMonthTrades = APP.trades.filter(t => t.month === prevM);
    const thisWeekTrades  = APP.trades.filter(t => {
      const d = parseDD(t.sell_date); return d >= weekStart && d <= now;
    });

    const curMonthNet  = thisMonthTrades.reduce((s,t) => s+t.net, 0);
    const prevMonthNet = prevMonthTrades.reduce((s,t) => s+t.net, 0);
    const weekNet      = thisWeekTrades.reduce((s,t)  => s+t.net, 0);

    // Open P&L from positions
    let openPnl = 0;
    APP.positions.forEach(p => {
      const live = APP.liveData[p.symbol];
      if (live && live.price) openPnl += (live.price - p.avg_price) * p.qty;
    });

    // Exposure
    const exposure = APP.positions.reduce((s,p) => {
      const live = APP.liveData[p.symbol];
      return s + (live?.price || p.avg_price) * p.qty;
    }, 0);

    const kpis = [
      {
        label: 'רווח נטו כולל',
        val:   f$(Math.round(st.totalNet)),
        sub:   `${st.total} עסקאות`,
        color: st.totalNet >= 0 ? 'green' : 'red',
        trend: fILS(Math.round(st.totalNetIls)),
      },
      {
        label: 'החודש',
        val:   f$(Math.round(curMonthNet)),
        sub:   `${thisMonthTrades.length} עסקאות`,
        color: curMonthNet >= 0 ? 'green' : 'red',
        trend: prevMonthNet !== 0
          ? (curMonthNet >= prevMonthNet ? '▲' : '▼') + ' vs חודש קודם'
          : '',
      },
      {
        label: 'השבוע',
        val:   f$(Math.round(weekNet)),
        sub:   `${thisWeekTrades.length} עסקאות`,
        color: weekNet >= 0 ? 'green' : 'red',
      },
      {
        label: 'P&L פתוח',
        val:   openPnl !== 0 ? f$(Math.round(openPnl)) : '—',
        sub:   APP.positions.length + ' פוזיציות',
        color: openPnl >= 0 ? 'green' : 'red',
      },
      {
        label: 'Win Rate',
        val:   st.winRate + '%',
        sub:   `${st.wins}W / ${st.losses}L`,
        color: st.winRate >= 60 ? 'green' : st.winRate >= 50 ? 'blue' : 'red',
      },
      {
        label: 'Profit Factor',
        val:   st.pf >= 99 ? '∞' : st.pf,
        sub:   'ברוטו W/L',
        color: st.pf >= 2 ? 'green' : st.pf >= 1 ? 'blue' : 'red',
      },
      {
        label: 'Expectancy',
        val:   f$(Math.round(st.expectancy)),
        sub:   'לעסקה ממוצעת',
        color: st.expectancy >= 0 ? 'green' : 'red',
      },
      {
        label: 'Avg Win',
        val:   f$(Math.round(st.avgWin)),
        sub:   'עסקה רווחית',
        color: 'green',
      },
      {
        label: 'Avg Loss',
        val:   f$(Math.round(Math.abs(st.avgLoss))),
        sub:   'עסקה מפסידה',
        color: 'red',
      },
      {
        label: 'Max Drawdown',
        val:   f$(Math.round(st.maxDD)),
        sub:   'ירידה מהשיא',
        color: 'red',
      },
      {
        label: 'Sharpe',
        val:   st.sharpe,
        sub:   'יחס תשואה/סיכון',
        color: st.sharpe >= 1 ? 'green' : st.sharpe >= 0 ? 'blue' : 'red',
      },
      {
        label: 'Kelly %',
        val:   Math.round(st.kelly * 100) + '%',
        sub:   'גודל פוזיציה מומלץ',
        color: 'gold',
      },
    ];

    el.innerHTML = kpis.map(k => `
      <div class="kpi">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-val ${k.color}">${k.val}</div>
        <div class="kpi-sub">${k.sub}</div>
        ${k.trend ? `<div class="kpi-sub" style="margin-top:2px;opacity:0.7">${k.trend}</div>` : ''}
      </div>
    `).join('');
  }

  // ── Weekly Summary ──────────────────────────────────────

  function renderWeeklySummary() {
    const el = document.getElementById('weekly-summary');
    if (!el || !APP.trades.length) return;
    const { parseDD } = Utils;
    const now = new Date();

    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((dayOfWeek + 1) % 7));
    startOfWeek.setHours(0,0,0,0);
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const isThis = t => { const d = parseDD(t.sell_date); return d >= startOfWeek && d <= now; };
    const isLast = t => { const d = parseDD(t.sell_date); return d >= startOfLastWeek && d < startOfWeek; };

    const thisW = APP.trades.filter(isThis);
    const lastW = APP.trades.filter(isLast);
    const thisNet = thisW.reduce((s,t) => s+t.net, 0);
    const lastNet = lastW.reduce((s,t) => s+t.net, 0);

    // Average weekly
    const byWeek = {};
    APP.trades.forEach(t => {
      const d = parseDD(t.sell_date);
      const wk = Math.floor((d - new Date(2025,0,1)) / (7*86400000));
      byWeek[wk] = (byWeek[wk] || 0) + t.net;
    });
    const vals = Object.values(byWeek);
    const avgWeek = vals.length ? vals.reduce((s,v) => s+v, 0) / vals.length : 0;

    el.style.display = 'grid';
    el.innerHTML = [
      ['השבוע',       thisNet, `${thisW.length} עסקאות`],
      ['שבוע שעבר',   lastNet, `${lastW.length} עסקאות`],
      ['ממוצע שבועי', avgWeek, 'מאז מרץ 2025'],
    ].map(([label, val, sub]) => `
      <div class="week-card">
        <div class="week-card-label">${label}</div>
        <div class="week-card-val ${val >= 0 ? 'green' : 'red'}">${f$(Math.round(val))}</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:3px">${sub}</div>
      </div>
    `).join('');
  }

  // ── Goal Card ───────────────────────────────────────────

  function renderGoalCard(st) {
    const el = document.getElementById('goal-card');
    if (!el) return;
    const pct = Math.min(100, Math.round(st.curMonthNet / APP.monthGoal * 100));
    const curIls = Math.round(usdToIls(st.curMonthNet, st.curMonth));

    el.innerHTML = `
      <div class="card-title">🎯 יעד חודש נוכחי</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div>
          <span class="${st.curMonthNet >= 0 ? 'green' : 'red'}" style="font-size:20px;font-weight:700">
            ${f$(Math.round(st.curMonthNet))}
          </span>
          <span style="font-size:12px;color:var(--text-3);margin-right:6px">
            ${fILS(curIls)}
          </span>
        </div>
        <span style="color:var(--text-3);font-size:13px">${f$(APP.monthGoal)}</span>
      </div>
      <div class="goal-bar-bg">
        <div class="goal-bar-fill" style="width:${pct}%;background:${pct>=100?'var(--green)':'var(--blue)'}"></div>
      </div>
      <div style="font-size:12px;color:var(--text-3);margin-top:6px;display:flex;justify-content:space-between">
        <span>${pct}%</span>
        <span>${pct >= 100 ? '🎯 יעד הושג!' : 'נותר: ' + f$(Math.round(APP.monthGoal - st.curMonthNet))}</span>
      </div>
    `;
  }

  // ── Portfolio Health Score ──────────────────────────────

  function renderPortfolioHealth(st) {
    const el = document.getElementById('portfolio-health');
    if (!el) return;

    let score = 50;
    if (st.winRate >= 65)     score += 10;
    else if (st.winRate < 45) score -= 10;
    if (st.pf >= 2)           score += 10;
    else if (st.pf < 1)       score -= 15;
    if (st.sharpe >= 1)       score += 5;
    if (st.maxDD > -5000)     score += 5;
    else if (st.maxDD < -15000) score -= 10;
    if (st.expectancy >= 200) score += 10;
    else if (st.expectancy < 0) score -= 10;
    score = Math.max(0, Math.min(100, score));

    const color = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--blue)' : 'var(--red)';
    const label = score >= 70 ? 'טוב' : score >= 50 ? 'בינוני' : 'דורש שיפור';

    el.innerHTML = `
      <div class="card-title">💊 Portfolio Health</div>
      <div style="display:flex;align-items:center;gap:16px">
        <div style="font-size:48px;font-weight:800;color:${color};letter-spacing:-2px">${score}</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:${color}">${label}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:4px;line-height:1.5">
            WR: ${st.winRate}% | PF: ${st.pf} | Sharpe: ${st.sharpe}
          </div>
        </div>
      </div>
    `;
  }

  // ── Goals Tab ───────────────────────────────────────────

  function renderGoalsTab(st) {
    const inp = document.getElementById('goal-input');
    if (inp) inp.value = APP.monthGoal;
    const pct = Math.min(100, Math.round(st.curMonthNet / APP.monthGoal * 100));

    const detail = document.getElementById('goal-detail');
    if (detail) {
      detail.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px">
          <span class="${st.curMonthNet >= 0 ? 'green' : 'red'}" style="font-weight:700;font-size:18px">
            ${f$(Math.round(st.curMonthNet))}
          </span>
          <span style="color:var(--text-3)">${f$(APP.monthGoal)}</span>
        </div>
        <div class="goal-bar-bg" style="height:10px">
          <div class="goal-bar-fill" style="width:${pct}%;background:${pct>=100?'var(--green)':'var(--blue)'}"></div>
        </div>
        <div style="font-size:13px;color:var(--text-3);margin-top:6px">
          ${pct >= 100 ? '🎯 יעד הושג החודש!' : 'נותר: ' + f$(Math.round(APP.monthGoal - st.curMonthNet))}
        </div>
      `;
    }

    const tbl = document.getElementById('month-history-table');
    if (tbl) {
      tbl.innerHTML = `
        <thead><tr>
          <th>חודש</th><th>עסקאות</th><th>Win %</th><th>נטו</th><th>נטו ₪</th>
        </tr></thead>
        <tbody>
          ${[...st.monthArr].reverse().map(m => {
            const wr  = m.trades ? Math.round(m.wins/m.trades*100) : 0;
            const ils = Math.round(usdToIls(m.net, m.month));
            const cur = m.month === st.curMonth;
            return `<tr style="${cur?'background:var(--green-dim)':''}">
              <td style="font-weight:${cur?700:400}">${m.label}${cur?' ◀':''}</td>
              <td style="color:var(--text-3)">${m.trades}</td>
              <td class="${wr>=60?'green':'red'}">${wr}%</td>
              <td class="${m.net>=0?'month-good':'month-bad'}">${f$(m.net)}</td>
              <td class="${ils>=0?'month-good':'month-bad'}" style="font-size:11px">${fILS(ils)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      `;
    }
  }

  async function saveGoal() {
    const v = +document.getElementById('goal-input').value;
    if (!v || v <= 0) return;
    APP.monthGoal = v;
    API.setStatus('שומר יעד...', 'info');
    const res = await API.setGoal(v);
    if (res.ok) API.setStatus('✓ יעד נשמר', 'ok');
    invalidateStats();
    renderAll();
  }

  return { render, renderGoalsTab, saveGoal };
})();
