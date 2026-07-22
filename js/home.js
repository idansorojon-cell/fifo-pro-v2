/**
 * FIFO PRO 2.0 — home.js
 * The single unified Home screen. Replaces four separate "home" screens
 * from v1 — Cockpit, Mission Control, the main Dashboard, and Daily Brief.
 *
 * Design principle (Quiet Terminal): action & risk before vanity metrics.
 * Attention queue first, then ONE live hero number (Open P&L), then a
 * quiet realized breakdown, context chips, a positions preview, and a
 * single focused coach line.
 *
 * Source-of-truth discipline: every number here is derived ONCE, from the
 * canonical compute layer already in the app — no parallel re-implementation:
 *   · Utils.calcLiveStats()  → realized / unrealized / combined P&L
 *   · getStats()             → win rate, month net, goal, etc.
 *   · Cockpit.buildActionItems() → the attention queue (reused, not copied)
 *   · Positions.riskStatus() → per-position risk (reused)
 *   · Cockpit.riskAwareInsight() / _shortCoachInsight() → the coach line
 *
 * Renders into #screen-home. Called by navigate('home'), renderAll()
 * (after mutations), and renderMissionControl() (the 15s price poll).
 */

const Home = (() => {


  // Signed money display, bidi-safe. Zero is NEUTRAL (mist), not profit-
  // green — a $0 day is not a win. Always <bdi>-wrapped: mixed LTR
  // ($, digits, +/-) inside RTL text otherwise reorders the sign
  // ("+$94" renders "$94+").
  function _money(v) {
    const r = Math.round(v);
    return `<bdi>${r > 0 ? '+' : ''}${f$(r)}</bdi>`;
  }
  function _tone(v) { return Math.round(v) > 0 ? 'pos' : Math.round(v) < 0 ? 'neg' : 'zero'; }

  function _greeting() {
    const g = (typeof timeGreeting === 'function') ? timeGreeting() : 'שלום';
    const name = (typeof Auth !== 'undefined' && Auth.getDisplayName) ? Auth.getDisplayName() : '';
    return name ? `${g}, ${name}` : g;
  }

  function _dateLine() {
    const days = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    const d = new Date();
    return `יום ${days[d.getDay()]}, ${d.getDate()} ב${months[d.getMonth()]}`;
  }

  // Realized today / week / month — the ONE place these three figures are
  // computed. (v1 re-derived them independently in 4 screens.)
  function _realizedWindows() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(todayStart.getTime() - 6 * 86400000);
    const curMonth   = Utils.currentMonthKey();
    let today = 0, week = 0, month = 0;
    (APP.trades || []).forEach(t => {
      const d = Utils.parseDD(t.sell_date);
      if (d >= todayStart) today += t.net;
      if (d >= weekStart)  week  += t.net;
      if (t.month === curMonth) month += t.net;
    });
    return { today, week, month };
  }

  function _exposurePct() {
    const portfolio = (typeof Settings !== 'undefined' && Settings.get('portfolioSize')) || 67000;
    let cost = 0;
    (APP.positions || []).forEach(p => { cost += (p.avg_price || 0) * (p.qty || 0); });
    return portfolio > 0 ? (cost / portfolio * 100) : 0;
  }

  function _attentionHTML() {
    const items = (typeof Cockpit !== 'undefined') ? Cockpit.buildActionItems() : [];
    if (!items.length) {
      return `<div class="attn-empty">${icon('check-circle')} אין פוזיציות שדורשות תשומת לב מיידית כרגע.</div>`;
    }
    return `<div class="attn">${items.map(i => `
      <button class="attn-item" onclick="navigate('positions')">
        <span class="sev ${i.severity === 'high' ? 'high' : 'mid'}"></span>
        <span>${i.text}</span>
        <span class="chev">${icon('chevron')}</span>
      </button>`).join('')}</div>`;
  }

  function _miniPosCard(p) {
    const live = APP.liveData[p.symbol];
    const price = live?.price;
    const pnl = price ? (price - p.avg_price) * p.qty : null;
    const pnlPct = price ? (price - p.avg_price) / p.avg_price * 100 : null;
    const risk = (typeof Positions !== 'undefined') ? Positions.riskStatus(p, live) : { level:'none' };
    const cls = risk.level === 'high' ? 'high' : risk.level === 'warn' ? 'warn' : 'ok';
    const label = risk.level === 'high' ? 'סיכון גבוה' : risk.level === 'warn' ? 'אזהרה' : 'תקין';
    return `
      <button class="home-pos" onclick="navigate('positions')">
        <div class="home-pos-top">
          <span class="home-pos-sym">${p.symbol}${live ? '<span class="live-dot"></span>' : ''}</span>
          <span class="qpill ${cls}">${label}</span>
        </div>
        <div class="home-pos-price num">${price ? fprice(price) : '—'}</div>
        <div class="home-pos-pnl num ${pnl==null?'':_tone(pnl)}">${pnl!=null ? _money(pnl) : '—'}${pnlPct!=null ? ` · <bdi>${fpct(pnlPct)}</bdi>` : ''}</div>
      </button>`;
  }

  function _coachLine(st) {
    let msg = '';
    if (typeof Cockpit !== 'undefined' && Cockpit.riskAwareInsight) msg = Cockpit.riskAwareInsight(st);
    else if (typeof _shortCoachInsight === 'function') msg = _shortCoachInsight(st);
    if (!msg) return '';
    return `
      <div class="sec-head"><h3>מאמן</h3><button class="linklike" onclick="navigate('coach')">פתח את המאמן ←</button></div>
      <button class="coach-line" onclick="navigate('coach')">
        ${icon('cpu')}<span>${msg}</span>
      </button>`;
  }

  function render() {
    const el = document.getElementById('screen-home');
    if (!el) return;

    const st   = getStats();
    const live = Utils.calcLiveStats(APP.trades, APP.positions, APP.liveData);
    const rw   = _realizedWindows();

    const hasLive = live.positionsCount > 0;
    const openPnl = live.unrealizedNet;
    const heroSub = hasLive
      ? `<bdi>${live.liveCount}/${live.positionsCount}</bdi> פוזיציות live`
      : 'אין פוזיציות פתוחות';

    const winRate = st.winRate != null ? st.winRate : 0;
    const goalPct = APP.monthGoal ? Math.round((st.curMonthNet || 0) / APP.monthGoal * 100) : 0;
    const exposure = _exposurePct();

    const posPreview = (APP.positions || []).slice(0, 3).map(_miniPosCard).join('');

    el.innerHTML = `
      <div class="home-greet">
        <h1>${_greeting()}</h1>
        <div class="lede">${_dateLine()} · דשבורד אחד, מספר אחד לכל מדד</div>
      </div>

      ${_attentionHTML()}

      <div class="hero-metric">
        <div class="hero-metric-label">Open P&L — פוזיציות פתוחות בלבד <span class="live-dot" title="מתעדכן כל 15 שניות"></span></div>
        <div class="hero-metric-value ${_tone(openPnl)}">${_money(openPnl)}</div>
        <div class="hero-metric-sub">${heroSub}${live.realizedNet!=null ? ` · ריאלי מצטבר <span class="num"><bdi>${f$(Math.round(live.combinedNet - live.unrealizedNet))}</bdi></span>` : ''}</div>
        <button class="hero-expand" id="home-hero-expand" onclick="Home.toggleBreakdown()">
          ${icon('trending-down')} פירוק רווח ריאלי: היום · השבוע · החודש
        </button>
        <div class="hero-detail" id="home-hero-detail" hidden>
          <div class="hero-detail-item"><div class="l">ריאלי היום</div><div class="v ${_tone(rw.today)}">${_money(rw.today)}</div></div>
          <div class="hero-detail-item"><div class="l">ריאלי השבוע</div><div class="v ${_tone(rw.week)}">${_money(rw.week)}</div></div>
          <div class="hero-detail-item"><div class="l">ריאלי החודש</div><div class="v ${_tone(rw.month)}">${_money(rw.month)}</div></div>
        </div>
      </div>

      <div class="chiprow">
        <div class="chip"><div class="chip-label">פוזיציות פתוחות</div><div class="chip-val">${live.positionsCount}</div></div>
        <div class="chip"><div class="chip-label">Win Rate</div><div class="chip-val">${winRate}%</div></div>
        <div class="chip"><div class="chip-label">יעד חודשי</div><div class="chip-val" style="color:${goalPct>=100?'var(--signal)':'inherit'}">${goalPct}%</div></div>
        <div class="chip"><div class="chip-label">חשיפה</div><div class="chip-val">${exposure.toFixed(0)}%</div></div>
      </div>

      ${(APP.positions || []).length ? `
        <div class="sec-head"><h3>פוזיציות פתוחות</h3><button class="linklike" onclick="navigate('positions')">הצג את כל ה-${APP.positions.length} ←</button></div>
        <div class="home-pos-grid">${posPreview}</div>
      ` : ''}

      ${_coachLine(st)}
    `;
  }

  function toggleBreakdown() {
    const d = document.getElementById('home-hero-detail');
    const b = document.getElementById('home-hero-expand');
    if (!d) return;
    d.hidden = !d.hidden;
    if (b) b.classList.toggle('open', !d.hidden);
  }

  return { render, toggleBreakdown };
})();
