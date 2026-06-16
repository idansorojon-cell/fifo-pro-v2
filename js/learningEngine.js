/**
 * FIFO PRO — learningEngine.js
 * Personal Learning Engine — adapts to THIS trader's own history.
 * Depends on: utils.js, app.js
 *
 * IMPORTANT — what this module does NOT do, and why:
 * The brief asked for sector / market-cap / RSI-range / volume-profile /
 * time-of-day personalization. None of those are derivable honestly from
 * the current data model:
 *   - trades have no `sector` or `market_cap` field
 *   - trades have no entry-time-of-day (only DD/MM/YYYY dates, no time)
 *   - trades don't snapshot the RSI/volume that was present AT ENTRY
 *     (Decision Engine only fetches *current* indicators when you analyze
 *     a symbol "right now" — there's no historical indicator log per trade)
 * Rather than invent numbers for these (explicitly forbidden by the brief
 * itself — "NO placeholders, NO fake values"), this module only computes
 * what the real schema actually supports, and clearly labels the rest as
 * "requires schema changes" so nothing here is fabricated.
 */

const LearningEngine = (() => {
  const { parseDD, f$ } = Utils;

  const MIN_SAMPLE = 3; // minimum trades before a stat is considered meaningful

  /**
   * Full personal-learning report over the trader's own history.
   * @param {Array} trades — defaults to APP.trades
   */
  function analyze(trades = window.APP?.trades || []) {
    if (!trades.length) return null;

    return {
      total: trades.length,
      bySymbol:        _bySymbol(trades),
      byHoldBucket:    _byHoldBucket(trades),
      byDayOfWeek:     _byDayOfWeek(trades),
      byMonth:         _byMonth(trades),
      mistakeImpact:   _mistakeImpact(trades),
      notComputable:   [
        'Sector performance — trades have no `sector` field',
        'Market cap performance — trades have no `market_cap` field',
        'Best RSI range at entry — entry-time RSI is not recorded per trade',
        'Best volume profile at entry — entry-time volume is not recorded per trade',
        'Time-of-day performance — trades store dates only, not times',
      ],
    };
  }

  // ── Per-symbol track record (sample-size aware) ───────────

  function _bySymbol(trades) {
    const by = {};
    trades.forEach(t => {
      if (!by[t.symbol]) by[t.symbol] = [];
      by[t.symbol].push(t);
    });
    return Object.entries(by)
      .map(([symbol, arr]) => _summarize(arr, symbol))
      .filter(s => s.n >= MIN_SAMPLE)
      .sort((a,b) => b.winRate - a.winRate);
  }

  /** Look up a specific symbol's personal track record (used by Decision Engine). */
  function forSymbol(symbol, trades = window.APP?.trades || []) {
    const arr = trades.filter(t => t.symbol === symbol);
    if (!arr.length) return null;
    return _summarize(arr, symbol);
  }

  // ── Holding-duration buckets ───────────────────────────────

  function _byHoldBucket(trades) {
    const buckets = {
      '0 ימים':    t => (t.hold_days||0) === 0,
      '1-3 ימים':  t => (t.hold_days||0) >= 1 && (t.hold_days||0) <= 3,
      '4-7 ימים':  t => (t.hold_days||0) >= 4 && (t.hold_days||0) <= 7,
      '8-14 ימים': t => (t.hold_days||0) >= 8 && (t.hold_days||0) <= 14,
      '15+ ימים':  t => (t.hold_days||0) >= 15,
    };
    return Object.entries(buckets)
      .map(([label, fn]) => _summarize(trades.filter(fn), label))
      .filter(s => s.n >= MIN_SAMPLE)
      .sort((a,b) => b.winRate - a.winRate);
  }

  // ── Day of week ─────────────────────────────────────────────

  function _byDayOfWeek(trades) {
    const names = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const by = {};
    trades.forEach(t => {
      if (!t.sell_date) return;
      const dow = parseDD(t.sell_date).getDay();
      (by[dow] = by[dow] || []).push(t);
    });
    return Object.entries(by)
      .map(([dow, arr]) => _summarize(arr, 'יום ' + names[+dow]))
      .filter(s => s.n >= MIN_SAMPLE)
      .sort((a,b) => b.winRate - a.winRate);
  }

  // ── Month-over-month trend (reuses calcStats monthArr shape) ──

  function _byMonth(trades) {
    const by = {};
    trades.forEach(t => (by[t.month] = by[t.month] || []).push(t));
    return Object.entries(by)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([month, arr]) => _summarize(arr, month));
  }

  // ── Which mistakes actually cost the most money ────────────

  function _mistakeImpact(trades) {
    const det = Utils.detectMistakes(trades);
    const costOf = (filterFn) => {
      const arr = trades.filter(filterFn);
      return { count: arr.length, net: Math.round(arr.reduce((s,t)=>s+t.net,0)) };
    };
    return {
      fomo:          { count: det.fomo,          ...costOf(t => t.pct < -3 && (t.hold_days||0) <= 1) },
      chase:         { count: det.chase,         ...costOf(t => t.pct > 15 && (t.hold_days||0)===0 && t.net<0) },
      holdingLosers: { count: det.holdingLosers, ...costOf(t => t.net < 0 && (t.hold_days||0) > 7) },
      noStop:        { count: det.noStop,        ...costOf(t => t.respected_stop === 'לא' || t.respected_stop === 'לא היה סטופ') },
      oversized:     { count: det.oversized,     ...costOf(t => (t.cost||0) > 30000 && t.net < 0) },
    };
  }

  // ── Shared summary stats ───────────────────────────────────

  function _summarize(arr, label) {
    const n     = arr.length;
    const wins  = arr.filter(t => t.net > 0);
    const gp    = wins.reduce((s,t) => s+t.gross, 0);
    const gl    = Math.abs(arr.filter(t=>t.net<0).reduce((s,t)=>s+t.gross,0));
    return {
      label, n,
      winRate: n ? Math.round(wins.length / n * 100) : 0,
      net:     Math.round(arr.reduce((s,t) => s+t.net, 0)),
      avgNet:  n ? Math.round(arr.reduce((s,t) => s+t.net, 0) / n) : 0,
      pf:      gl > 0 ? +(gp/gl).toFixed(2) : (gp>0 ? 99 : 0),
    };
  }

  /**
   * One-line, real-data narrative for a given symbol — used by the
   * Decision Engine's "Personal History" panel. Returns null if the
   * sample size is too small to say anything meaningful (rather than
   * making a confident-sounding claim off 1-2 trades).
   */
  function narrativeForSymbol(symbol, trades = window.APP?.trades || []) {
    const s = forSymbol(symbol, trades);
    if (!s || s.n < MIN_SAMPLE) return null;
    return `בהיסטוריה שלך, ${s.n} עסקאות ב-${symbol} הניבו Win Rate של ${s.winRate}% ` +
           `ו-${f$(s.net)} נטו כולל (PF ${s.pf>=99?'∞':s.pf}).`;
  }

  return { analyze, forSymbol, narrativeForSymbol, MIN_SAMPLE };
})();
