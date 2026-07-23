/**
 * FIFO PRO 2.0 — performance.js
 * The unified Performance screen: one destination with five segments,
 * replacing eight separate v1 screens (main Dashboard's charts, Insights,
 * Performance Center, Progress, Daily Grade, Performance Timeline,
 * Trade Replay, the two heatmaps, and Symbol Notes).
 *
 * Segment map:
 *   overview   — 8 canonical KPIs (each shown ONCE, straight from
 *                getStats()) + equity / monthly / drawdown charts
 *   symbol     — per-symbol charts + table, portfolio heatmap, symbol notes
 *   time       — calendar heatmap, progress-over-time charts, monthly timeline
 *   discipline — Mistake Detector, day-of-week / hold / size behaviour
 *                charts, Daily Grade
 *   replay     — Trade Replay (unchanged)
 *
 * All heavy lifting is delegated to the EXISTING render functions
 * (Charts.*, Analytics.*, PerformanceTimeline, DailyGrade, TradeReplay,
 * renderPortfolioHeatmap) — every one already null-guards its target
 * element, so each pane renders exactly the parts whose markup exists
 * in that pane. No calculation is re-implemented here.
 */

const Perf = (() => {
  const { f$, fILS, fpct, fnum } = Utils;

  let segment = 'overview';

  const SEGMENTS = ['overview', 'symbol', 'time', 'discipline', 'replay'];

  function setSegment(s) {
    segment = SEGMENTS.includes(s) ? s : 'overview';
    SEGMENTS.forEach(k => {
      const pane = document.getElementById('pv-' + k);
      if (pane) pane.classList.toggle('active', k === segment);
    });
    document.querySelectorAll('#perf-seg button').forEach(b =>
      b.classList.toggle('active', b.dataset.seg === segment));
    _renderSegment();
  }

  function render() { setSegment(segment); }

  function _renderSegment() {
    const st = getStats();
    switch (segment) {
      case 'overview':
        _renderOverview(st);
        _renderMonthlyTable(st);
        _renderTopTrades();
        _renderDistribution();
        Charts.renderEquity(st);
        Charts.renderMonthly(st);
        Charts.renderDrawdown(st);
        break;
      case 'symbol':
        Charts.renderSymbol(st);
        if (typeof renderPortfolioHeatmap === 'function') renderPortfolioHeatmap();
        Analytics.renderSymNotes();
        break;
      case 'time':
        Analytics.renderHeatmap(st);
        Analytics.renderProgress(st);
        if (typeof PerformanceTimeline !== 'undefined') PerformanceTimeline.render();
        break;
      case 'discipline':
        Analytics.renderInsights(st);   // only dow/hold/size + mistake grid survive in this pane
        if (typeof DailyGrade !== 'undefined') DailyGrade.render();
        break;
      case 'replay':
        if (typeof TradeReplay !== 'undefined') TradeReplay.render();
        break;
    }
  }

  // The single place the headline KPI set is rendered — every metric shown
  // exactly ONCE, but ALL of them shown, grouped by meaning (profitability /
  // extremes / risk & behaviour). Density with hierarchy, not minimalism:
  // the numbers all come from the one getStats() call — nothing recomputed.
  function _renderOverview(st) {
    const el = document.getElementById('pv-overview-stats');
    if (!el) return;
    if (!APP.trades.length) {
      el.innerHTML = `<div class="tk-empty" style="grid-column:1/-1">אין עסקאות עדיין — המדדים יופיעו אחרי העסקה הסגורה הראשונה.</div>`;
      return;
    }
    const rows = PerfMetrics.monthlyRows(APP.trades);
    const best  = rows.find(r => r.isBest);
    const worst = rows.find(r => r.isWorst);
    const avgSize = PerfMetrics.avgCost(APP.trades);

    const tile = (l, v, cls = '', sub = '') => `
      <div class="qstat"><div class="l">${l}</div><div class="v ${cls}"><bdi>${v}</bdi></div>${sub ? `<div class="qstat-sub"><bdi>${sub}</bdi></div>` : ''}</div>`;
    const group = (title, tiles) => `
      <div class="kpi-group">
        <div class="kpi-group-title">${title}</div>
        <div class="qstat-grid">${tiles.join('')}</div>
      </div>`;

    el.innerHTML =
      group('רווחיות', [
        tile('רווח נטו כולל', f$(Math.round(st.totalNet)), st.totalNet >= 0 ? 'pos' : 'neg', fILS(Math.round(st.totalNetIls))),
        tile('Win Rate', st.winRate + '%', '', `${st.wins}W / ${st.losses}L · ${st.total} עסקאות`),
        tile('Profit Factor', st.pf >= 99 ? '∞' : st.pf, ''),
        tile('Expectancy / עסקה', f$(Math.round(st.expectancy)), st.expectancy >= 0 ? 'pos' : 'neg'),
        tile('רווח ממוצע', '+' + f$(Math.round(st.avgWin)), 'pos'),
        tile('הפסד ממוצע', f$(Math.round(st.avgLoss)), 'neg'),
      ]) +
      group('שיאים וקצוות', [
        tile('העסקה הרווחית ביותר', '+' + f$(Math.round(st.largestWin)), 'pos'),
        tile('העסקה המפסידה ביותר', f$(Math.round(st.largestLoss)), 'neg'),
        tile('החודש הטוב ביותר', best ? f$(best.net) : '—', 'pos', best ? best.label : ''),
        tile('החודש החלש ביותר', worst ? f$(worst.net) : '—', worst && worst.net < 0 ? 'neg' : '', worst ? worst.label : ''),
        tile('רצף נצחונות שיא', st.maxWS, 'pos'),
        tile('רצף הפסדים שיא', st.maxLS, st.maxLS > 0 ? 'neg' : ''),
      ]) +
      group('סיכון והתנהגות', [
        tile('Max Drawdown', f$(Math.round(st.maxDD)), 'neg'),
        tile('Recovery Factor', st.recoveryFactor, ''),
        tile('Sharpe (חודשי)', st.sharpe, ''),
        tile('Kelly %', (st.kelly * 100).toFixed(1) + '%', ''),
        tile('החזקה ממוצעת', (Math.round(st.avgHold * 10) / 10) + ' ימים', ''),
        tile('גודל עסקה ממוצע', f$(Math.round(avgSize)), ''),
      ]);
  }

  // ── Monthly performance table (v2 — a core component) ─────
  // Every month: trades, win rate, PF, avg/trade, net $ (with an inline
  // magnitude bar), Δ vs previous month, 3M moving average, net ₪
  // (month-correct rate), running cumulative. Sortable by every column;
  // default newest-first. Clicking a row jumps to that month's trades.
  let _mSort = { col: 'month', dir: -1 };

  function sortMonthly(col) {
    if (_mSort.col === col) _mSort.dir *= -1;
    else _mSort = { col, dir: -1 };
    _renderMonthlyTable(getStats());
  }

  function _renderMonthlyTable(st) {
    const el = document.getElementById('pv-monthly-table');
    if (!el) return;
    const rows = PerfMetrics.monthlyRows(APP.trades);
    if (!rows.length) { el.innerHTML = ''; return; }
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.net)), 1);

    const sorted = [...rows].sort((a, b) => {
      const av = a[_mSort.col], bv = b[_mSort.col];
      // null Δ (first month) always sinks to the bottom
      if (av === null) return 1;
      if (bv === null) return -1;
      return av > bv ? _mSort.dir : av < bv ? -_mSort.dir : 0;
    });

    const delta = v => v === null ? '<span style="color:var(--text-3)">—</span>'
      : `<bdi class="${v >= 0 ? 'green' : 'red'}">${(v >= 0 ? '+' : '') + f$(v)}</bdi>`;

    const tr = r => `
      <tr class="mrow" onclick="Trades.applyFilter({month:'${r.month}'})" title="הצג את עסקאות ${r.label}">
        <td class="mlabel">${r.label}
          ${r.isBest ? '<span class="mtag best">Best</span>' : ''}${r.isWorst ? '<span class="mtag worst">Worst</span>' : ''}
        </td>
        <td class="num">${r.trades}</td>
        <td class="num">${r.winRate}%</td>
        <td class="num">${r.pf >= 99 ? '∞' : r.pf}</td>
        <td class="num ${r.avg >= 0 ? 'green' : 'red'}"><bdi>${f$(r.avg)}</bdi></td>
        <td class="num mnet ${r.net >= 0 ? 'green' : 'red'}"><bdi>${f$(r.net)}</bdi>
          <div class="mbar ${r.net >= 0 ? 'pos' : 'neg'}" style="width:${Math.round(Math.abs(r.net) / maxAbs * 100)}%"></div>
        </td>
        <td class="num">${delta(r.mom)}</td>
        <td class="num ${r.ma3 >= 0 ? 'green' : 'red'}"><bdi>${f$(r.ma3)}</bdi></td>
        <td class="num ${r.netIls >= 0 ? 'green' : 'red'}"><bdi>${fILS(r.netIls)}</bdi></td>
        <td class="num ${r.cum >= 0 ? 'green' : 'red'}"><bdi>${f$(r.cum)}</bdi></td>
      </tr>`;

    const totNet = rows.reduce((s, r) => s + r.net, 0);
    const totIls = rows.reduce((s, r) => s + r.netIls, 0);
    const totTr  = rows.reduce((s, r) => s + r.trades, 0);

    const TH = [
      ['month', 'חודש'], ['trades', 'עסקאות'], ['winRate', 'Win'], ['pf', 'PF'],
      ['avg', 'ממוצע/עסקה'], ['net', 'נטו $'], ['mom', 'Δ קודם'], ['ma3', '3M ממוצע'],
      ['netIls', 'נטו ₪'], ['cum', 'מצטבר'],
    ];
    const th = ([col, label]) => `
      <th class="${col === 'month' ? '' : 'num'} sortable" onclick="Perf.sortMonthly('${col}')"
          title="מיין לפי ${label}">${label} <span class="msort">${_mSort.col === col ? (_mSort.dir === 1 ? '↑' : '↓') : ''}</span></th>`;

    el.innerHTML = `
      <table class="mtable">
        <thead><tr>${TH.map(th).join('')}</tr></thead>
        <tbody>${sorted.map(tr).join('')}</tbody>
        <tfoot><tr>
          <td>סה"כ</td><td class="num">${totTr}</td><td class="num">${st.winRate}%</td>
          <td class="num">${st.pf >= 99 ? '∞' : st.pf}</td>
          <td class="num"><bdi>${f$(Math.round(totNet / Math.max(totTr, 1)))}</bdi></td>
          <td class="num ${totNet >= 0 ? 'green' : 'red'}" style="font-weight:700"><bdi>${f$(totNet)}</bdi></td>
          <td></td><td></td>
          <td class="num ${totIls >= 0 ? 'green' : 'red'}"><bdi>${fILS(totIls)}</bdi></td>
          <td class="num"><bdi>${f$(Math.round(st.totalNet))}</bdi></td>
        </tr></tfoot>
      </table>`;
  }

  // ── Top winners / losers ──────────────────────────────────
  function _renderTopTrades() {
    const el = document.getElementById('pv-top-trades');
    if (!el) return;
    const { winners, losers } = PerfMetrics.topTrades(APP.trades, 5);
    const item = t => `
      <div class="ttrade" onclick="Trades.applyFilter({symbol:'${t.symbol}'})" title="הצג את כל עסקאות ${t.symbol}">
        <span class="tt-sym">${t.symbol}</span>
        <span class="tt-date">${t.sell_date}</span>
        <span class="tt-pct num"><bdi>${fpct(t.pct)}</bdi></span>
        <span class="tt-net num ${t.net >= 0 ? 'green' : 'red'}"><bdi>${(t.net >= 0 ? '+' : '') + f$(Math.round(t.net))}</bdi></span>
      </div>`;
    el.innerHTML = `
      <div class="ttcol">
        <div class="ttcol-title green">Top Winners</div>
        ${winners.length ? winners.map(item).join('') : '<div class="tt-empty">אין עסקאות רווחיות עדיין</div>'}
      </div>
      <div class="ttcol">
        <div class="ttcol-title red">Top Losers</div>
        ${losers.length ? losers.map(item).join('') : '<div class="tt-empty">אין עסקאות מפסידות 🎉</div>'}
      </div>`;
  }

  // ── Profit distribution histogram ─────────────────────────
  function _renderDistribution() {
    const el = document.getElementById('pv-dist');
    if (!el) return;
    const dist = PerfMetrics.distribution(APP.trades);
    const maxC = Math.max(...dist.map(d => d.count), 1);
    el.innerHTML = dist.map(d => `
      <div class="dist-col" title="${d.count} עסקאות">
        <div class="dist-count num">${d.count || ''}</div>
        <div class="dist-bar-wrap"><div class="dist-bar ${d.neg ? 'neg' : 'pos'}" style="height:${Math.max(d.count / maxC * 100, d.count ? 4 : 0)}%"></div></div>
        <div class="dist-label"><bdi>${d.label}</bdi></div>
      </div>`).join('');
  }

  return { render, setSegment, sortMonthly };
})();
