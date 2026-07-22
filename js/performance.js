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
  const { f$, fpct } = Utils;

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

  // The single place the headline KPI set is rendered — one tile per
  // metric, no duplicates anywhere else in the app (v1 showed several of
  // these in up to 8 different screens/widgets).
  function _renderOverview(st) {
    const el = document.getElementById('pv-overview-stats');
    if (!el) return;
    if (!APP.trades.length) {
      el.innerHTML = `<div class="tk-empty" style="grid-column:1/-1">אין עסקאות עדיין — המדדים יופיעו אחרי העסקה הסגורה הראשונה.</div>`;
      return;
    }
    const tiles = [
      ['רווח נטו כולל', f$(Math.round(st.totalNet)), st.totalNet >= 0 ? 'pos' : 'neg'],
      ['Win Rate', st.winRate + '%', ''],
      ['Profit Factor', st.pf >= 99 ? '∞' : st.pf, ''],
      ['Expectancy / עסקה', f$(Math.round(st.expectancy)), st.expectancy >= 0 ? 'pos' : 'neg'],
      ['Sharpe', st.sharpe, ''],
      ['Max Drawdown', f$(Math.round(st.maxDD)), 'neg'],
      ['החזקה ממוצעת', (Math.round(st.avgHold * 10) / 10) + ' ימים', ''],
      ['רצף שיא (W/L)', `${st.maxWS} / ${st.maxLS}`, ''],
    ];
    el.innerHTML = tiles.map(([l, v, cls]) => `
      <div class="qstat"><div class="l">${l}</div><div class="v ${cls}"><bdi>${v}</bdi></div></div>`).join('');
  }

  return { render, setSegment };
})();
