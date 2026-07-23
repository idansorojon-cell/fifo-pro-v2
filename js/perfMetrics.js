/**
 * FIFO PRO 2.1 — perfMetrics.js
 * Derived-metric helpers shared by Performance, Positions and Research.
 *
 * PURE PRESENTATION-SHAPING COMPUTE ONLY. Every number here is derived
 * from calcStats() output or straight from the trades array — no new
 * trading math (tax/FIFO/P&L formulas live in utils.js and are never
 * re-implemented). Depends on: utils.js.
 */

const PerfMetrics = (() => {
  const { parseDD, usdToIls, monthLabel } = Utils;

  // ── Monthly table rows (v2) ────────────────────────────────
  // Grouped straight from the trades array (same t.month key calcStats
  // uses), chronological. Per month: trades, win rate, net $ / net ₪
  // (month-correct rate), Profit Factor (gross wins ÷ |gross losses|,
  // same definition as the overall PF in calcStats), avg net per trade,
  // running cumulative, Δ vs previous month, and a trailing 3-month
  // moving average of net. Returned ASCENDING — display sorts it.
  function monthlyRows(trades) {
    const by = {};
    trades.forEach(t => {
      if (!t.month) return;
      const b = by[t.month] || (by[t.month] = { net: 0, c: 0, w: 0, gw: 0, gl: 0 });
      b.net += t.net; b.c++;
      if (t.net > 0) { b.w++; b.gw += t.gross; }
      else if (t.net < 0) { b.gl += Math.abs(t.gross); }
    });
    let cum = 0;
    const asc = Object.keys(by).sort().map(m => {
      const b = by[m];
      cum += b.net;
      return {
        month: m, label: monthLabel(m),
        net: Math.round(b.net), trades: b.c,
        winRate: Math.round(b.w / b.c * 100),
        netIls: Math.round(usdToIls(b.net, m)),
        pf: b.gl > 0 ? +(b.gw / b.gl).toFixed(2) : (b.gw > 0 ? 99 : 0),
        avg: Math.round(b.net / b.c),
        cum: Math.round(cum),
      };
    });
    asc.forEach((r, i) => {
      r.mom = i > 0 ? r.net - asc[i - 1].net : null;
      const win = asc.slice(Math.max(0, i - 2), i + 1);
      r.ma3 = Math.round(win.reduce((s, x) => s + x.net, 0) / win.length);
    });
    if (asc.length) {
      const best  = asc.reduce((a, b) => (b.net > a.net ? b : a));
      const worst = asc.reduce((a, b) => (b.net < a.net ? b : a));
      best.isBest = true;
      // A single positive-only month shouldn't be labeled both best & worst
      if (worst !== best) worst.isWorst = true;
    }
    return asc;
  }

  // ── Top winners / losers ───────────────────────────────────
  function topTrades(trades, n = 5) {
    const sorted = [...trades].sort((a, b) => b.net - a.net);
    return {
      winners: sorted.filter(t => t.net > 0).slice(0, n),
      losers:  sorted.filter(t => t.net < 0).slice(-n).reverse()
        .sort((a, b) => a.net - b.net),
    };
  }

  // ── Profit distribution (histogram of per-trade net) ───────
  // Fixed, honest buckets — count of trades per P&L range.
  const DIST_BUCKETS = [
    { label: '≤ -$2k',        test: n => n <= -2000 },
    { label: '-$2k…-$1k',     test: n => n > -2000 && n <= -1000 },
    { label: '-$1k…-$500',    test: n => n > -1000 && n <= -500 },
    { label: '-$500…0',       test: n => n > -500  && n < 0 },
    { label: '0…$500',        test: n => n >= 0    && n < 500 },
    { label: '$500…$1k',      test: n => n >= 500  && n < 1000 },
    { label: '$1k…$2k',       test: n => n >= 1000 && n < 2000 },
    { label: '≥ $2k',         test: n => n >= 2000 },
  ];
  function distribution(trades) {
    return DIST_BUCKETS.map((b, i) => ({
      label: b.label,
      count: trades.filter(t => b.test(t.net)).length,
      neg: i < 4,
    }));
  }

  // ── Average position size (cost) ───────────────────────────
  function avgCost(trades) {
    const withCost = trades.filter(t => t.cost > 0);
    return withCost.length
      ? withCost.reduce((s, t) => s + t.cost, 0) / withCost.length : 0;
  }

  // ── Per-symbol closed-trade history ────────────────────────
  // Used by Positions cards ("what's my record on this ticker?") and
  // Research. All from APP.trades — the same rows the Trades screen shows.
  function symbolHistory(trades, symbol) {
    const rows = trades.filter(t => t.symbol === symbol);
    if (!rows.length) return null;
    const wins = rows.filter(t => t.net > 0).length;
    const net  = rows.reduce((s, t) => s + t.net, 0);
    const avgHold = rows.reduce((s, t) => s + (t.hold_days || 0), 0) / rows.length;
    const last = [...rows].sort((a, b) => parseDD(b.sell_date) - parseDD(a.sell_date))[0];
    return {
      count: rows.length, wins, losses: rows.length - wins,
      winRate: Math.round(wins / rows.length * 100),
      net: Math.round(net),
      avgHold: Math.round(avgHold * 10) / 10,
      lastDate: last ? last.sell_date : '',
      lastNet: last ? Math.round(last.net) : 0,
    };
  }

  // ── Days a position has been open ──────────────────────────
  // From the FIFO-derived entry date (DD/MM/YYYY). Returns null when the
  // date is missing/unparseable — caller renders '—', never a fake 0.
  function daysOpen(addedDate) {
    if (!addedDate) return null;
    const d = parseDD(addedDate);
    if (!d || d.getTime() === 0) return null;
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days >= 0 ? days : null;
  }

  return { monthlyRows, topTrades, distribution, avgCost, symbolHistory, daysOpen };
})();
