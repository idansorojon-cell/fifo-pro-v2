/**
 * FIFO PRO — aiCoach.js
 * AI Coach: behavioral analysis, pattern detection, weekly action items
 * Depends on: utils.js, app.js
 */

const AICoach = (() => {
  const { f$, fpct, parseDD } = Utils;

  function render() {
    if (!APP.trades.length) {
      const el = document.getElementById('coach-summary');
      if (el) el.textContent = 'אין עסקאות לניתוח. הוסף עסקאות כדי לקבל ניתוח אישי.';
      return;
    }
    buildCoachInsights();
  }

  // ── Build all insights ────────────────────────────────────

  function buildCoachInsights() {
    const trades  = APP.trades;
    const sorted  = [...trades].sort((a,b) => parseDD(a.sell_date) - parseDD(b.sell_date));
    const wins    = trades.filter(t => t.net > 0);
    const losses  = trades.filter(t => t.net < 0);
    const winRate = trades.length ? Math.round(wins.length / trades.length * 100) : 0;

    // ── Trading style detection ───────────────────────────────
    const dayTrades  = trades.filter(t => (t.hold_days||0) === 0);
    const swingTrades= trades.filter(t => (t.hold_days||0) >= 3 && (t.hold_days||0) <= 14);
    const holdTrades = trades.filter(t => (t.hold_days||0) > 14);
    const dayPct     = Math.round(dayTrades.length / trades.length * 100);
    const swingPct   = Math.round(swingTrades.length / trades.length * 100);
    const holdPct    = Math.round(holdTrades.length / trades.length * 100);

    let styleLabel = 'מסחר מעורב';
    if (dayPct > 50)   styleLabel = '⚡ Day Trader';
    else if (swingPct > 50) styleLabel = '🌊 Swing Trader';
    else if (holdPct > 50)  styleLabel = '📦 Position Trader';

    // ── Behavioral patterns ───────────────────────────────────
    const holdingLosers = losses.filter(t => (t.hold_days||0) > 7);
    const earlyExits    = wins.filter(t => t.pct < 5 && t.pct > 0);
    const chasingTrades = trades.filter(t => t.pct < -5 && (t.hold_days||0) <= 1);
    const noStopTrades  = trades.filter(t => t.respected_stop === 'לא' || t.respected_stop === 'לא היה סטופ');
    const planTrades    = trades.filter(t => t.followed_plan === 'כן');
    const planRate      = trades.length ? Math.round(planTrades.length / trades.length * 100) : 0;

    // Revenge: loss followed within 2 trades by bigger loss
    let revengeCount = 0;
    for (let i=1; i<sorted.length; i++) {
      if (sorted[i-1].net < 0 && sorted[i].net < sorted[i-1].net) revengeCount++;
    }

    // ── Best/Worst symbols ────────────────────────────────────
    const bySym = {};
    trades.forEach(t => {
      if (!bySym[t.symbol]) bySym[t.symbol] = { net:0, trades:0 };
      bySym[t.symbol].net    += t.net;
      bySym[t.symbol].trades ++;
    });
    const symArr   = Object.entries(bySym).sort((a,b) => b[1].net-a[1].net);
    const bestSym  = symArr[0];
    const worstSym = symArr[symArr.length-1];

    // ── Best hold time ────────────────────────────────────────
    const holdBuckets = {
      '0 ימים':  trades.filter(t=>(t.hold_days||0)===0),
      '1-3 ימים':trades.filter(t=>{const d=t.hold_days||0;return d>=1&&d<=3}),
      '4-7 ימים':trades.filter(t=>{const d=t.hold_days||0;return d>=4&&d<=7}),
      '8+ ימים': trades.filter(t=>(t.hold_days||0)>=8),
    };
    const bestHoldKey = Object.entries(holdBuckets)
      .filter(([,arr]) => arr.length >= 2)
      .map(([k,arr]) => [k, arr.reduce((s,t)=>s+t.net,0)/arr.length])
      .sort((a,b) => b[1]-a[1])[0];

    // ── Best day ──────────────────────────────────────────────
    const dowNames = ['א','ב','ג','ד','ה','ו','ש'];
    const byDow = {};
    trades.forEach(t => {
      if (!t.sell_date) return;
      const dow = parseDD(t.sell_date).getDay();
      if (!byDow[dow]) byDow[dow] = { net:0, c:0 };
      byDow[dow].net += t.net; byDow[dow].c++;
    });
    const bestDowEntry = Object.entries(byDow).sort((a,b) => b[1].net-a[1].net)[0];
    const bestDow = bestDowEntry ? `יום ${dowNames[+bestDowEntry[0]]}` : '—';

    // ── Losing streak ─────────────────────────────────────────
    let maxLS=0, curLS=0;
    sorted.forEach(t => { if(t.net<0){curLS++;maxLS=Math.max(maxLS,curLS);}else curLS=0; });

    // ── Summary text ──────────────────────────────────────────
    const summary = _buildSummary({
      trades, wins, losses, winRate, styleLabel,
      holdingLosers, earlyExits, chasingTrades,
      noStopTrades, revengeCount, planRate, bestSym, worstSym
    });

    // ── Strengths / Weaknesses / Improve ─────────────────────
    const strengths   = _buildStrengths({ winRate, planRate, earlyExits, holdingLosers, revengeCount, trades, wins, losses });
    const weaknesses  = _buildWeaknesses({ winRate, noStopTrades, holdingLosers, revengeCount, earlyExits, chasingTrades, losses });
    const improvements= _buildImprovements({ holdingLosers, noStopTrades, earlyExits, revengeCount, chasingTrades, planRate });
    const actions     = _buildWeeklyActions({ holdingLosers, noStopTrades, earlyExits, revengeCount, winRate, planRate });

    // ── KPI cards ─────────────────────────────────────────────
    const cards = [
      { icon:'🏆', title:'סגנון מסחר',          main:styleLabel,          sub:`${dayPct}% Day | ${swingPct}% Swing | ${holdPct}% Hold` },
      { icon:'🥇', title:'סימבול הטוב ביותר',    main:bestSym?bestSym[0]:'—',    sub:bestSym ? f$(Math.round(bestSym[1].net)) : '' },
      { icon:'⚠️', title:'סימבול הגרוע ביותר',  main:worstSym&&worstSym[1].net<0?worstSym[0]:'ללא', sub:worstSym&&worstSym[1].net<0?f$(Math.round(worstSym[1].net)):'' },
      { icon:'⏱️', title:'זמן החזקה אידיאלי',    main:bestHoldKey?bestHoldKey[0]:'—', sub:bestHoldKey?`ממוצע ${f$(Math.round(bestHoldKey[1]))} לעסקה`:'' },
      { icon:'📅', title:'יום מסחר חזק',         main:bestDow, sub:bestDowEntry ? f$(Math.round(bestDowEntry[1].net)) : '' },
      { icon:'😤', title:'Revenge Trading',       main:revengeCount+' מקרים', sub:revengeCount>2?'⚠️ בעיה שדורשת תשומת לב':'✓ בשליטה' },
      { icon:'🛑', title:'מסחר ללא סטופ',        main:noStopTrades.length+' עסקאות', sub:noStopTrades.length>3?'⚠️ סיכון גבוה':'✓ תקין' },
      { icon:'📋', title:'עמידה בתוכנית',        main:planRate+'%', sub:planRate >= 70 ? '✓ דיסציפלינה טובה' : '⚠️ שפר דיסציפלינה' },
      { icon:'🔥', title:'Losing Streak מקסימלי', main:maxLS+' עסקאות', sub:maxLS>4?'⚠️ בדוק ניהול סיכון':'✓ תקין' },
    ];

    // ── Inject into DOM ────────────────────────────────────────
    const sumEl = document.getElementById('coach-summary');
    if (sumEl) sumEl.innerHTML = summary;

    const reportEl = document.getElementById('coach-report');
    if (reportEl) {
      reportEl.innerHTML = [
        { title:'💪 חוזקות',    items:strengths,    border:'var(--green)' },
        { title:'⚠️ חולשות',    items:weaknesses,   border:'var(--red)' },
        { title:'🔧 שיפורים',   items:improvements, border:'var(--blue)' },
      ].map(s => `
        <div class="card" style="border-color:${s.border}">
          <div class="card-title" style="color:${s.border}">${s.title}</div>
          ${s.items.map(i => `<div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:13px;line-height:1.5">• ${i}</div>`).join('')}
        </div>
      `).join('');
    }

    const gridEl = document.getElementById('coach-grid');
    if (gridEl) {
      gridEl.innerHTML = cards.map(c => `
        <div class="coach-card">
          <div class="coach-title">${c.icon} ${c.title}</div>
          <div class="coach-main">${c.main}</div>
          <div class="coach-sub">${c.sub}</div>
        </div>
      `).join('');
    }

    const actEl = document.getElementById('coach-actions');
    if (actEl) actEl.innerHTML = actions.map(a => `<div style="padding:5px 0">▶ ${a}</div>`).join('');
  }

  // ── Summary text ─────────────────────────────────────────

  function _buildSummary({ trades, winRate, styleLabel, holdingLosers, earlyExits, noStopTrades, revengeCount, planRate, bestSym }) {
    const parts = [
      `על פי ${trades.length} העסקאות שלך, אתה מסווג כ<strong>${styleLabel}</strong> עם Win Rate של <strong>${winRate}%</strong>.`,
    ];
    if (bestSym) parts.push(`הסימבול שלך הרווחי ביותר הוא <strong>${bestSym[0]}</strong> עם ${f$(Math.round(bestSym[1].net))} נטו.`);
    if (holdingLosers.length > 2) parts.push(`זוהה דפוס של <strong>החזקת הפסדים</strong> (${holdingLosers.length} פעמים). זהו אחד המחסומים הנפוצים ביותר לרווחיות.`);
    if (earlyExits.length > 3) parts.push(`<strong>יציאה מוקדמת מרווחות</strong> נצפתה ${earlyExits.length} פעמים — אתה עלול להשאיר כסף על השולחן.`);
    if (revengeCount > 1) parts.push(`זוהו ${revengeCount} מקרים של <strong>Revenge Trading</strong>. מסחר מתוך רגש מזיק לתוצאות.`);
    if (planRate > 0) parts.push(`עמדת בתוכנית שלך ב-<strong>${planRate}%</strong> מהעסקאות.`);
    return parts.join(' ');
  }

  function _buildStrengths({ winRate, planRate, earlyExits, holdingLosers, revengeCount, trades, wins, losses }) {
    const s = [];
    if (winRate >= 60) s.push(`Win Rate של ${winRate}% — מעל הממוצע`);
    if (planRate >= 70) s.push(`עמידה בתוכנית ${planRate}% מהעסקאות — דיסציפלינה גבוהה`);
    if (revengeCount <= 1) s.push('שליטה מצוינת ב-Revenge Trading');
    if (holdingLosers.length <= 2) s.push('ניהול הפסדים תקין — לא מחזיק הפסדים לאורך זמן');
    if (trades.length > 50) s.push(`${trades.length} עסקאות — ניסיון מצטבר משמעותי`);
    const avgW = wins.length ? wins.reduce((s,t)=>s+t.net,0)/wins.length : 0;
    const avgL = losses.length ? Math.abs(losses.reduce((s,t)=>s+t.net,0)/losses.length) : 1;
    if (avgW > avgL) s.push(`Avg Win ($${Math.round(avgW)}) גדול מ-Avg Loss ($${Math.round(avgL)})`);
    if (!s.length) s.push('ממשיך לצבור ניסיון');
    return s.slice(0,4);
  }

  function _buildWeaknesses({ winRate, noStopTrades, holdingLosers, revengeCount, earlyExits, chasingTrades, losses }) {
    const w = [];
    if (winRate < 50) w.push(`Win Rate של ${winRate}% — מתחת ל-50%`);
    if (noStopTrades.length > 3) w.push(`${noStopTrades.length} עסקאות ללא סטופ לוס — סיכון גבוה`);
    if (holdingLosers.length > 2) w.push(`${holdingLosers.length} פעמים החזקת הפסדים >7 ימים`);
    if (revengeCount > 2) w.push(`${revengeCount} מקרי Revenge Trading`);
    if (earlyExits.length > 4) w.push(`${earlyExits.length} יציאות מוקדמות — מפסיד פוטנציאל`);
    if (chasingTrades.length > 2) w.push(`${chasingTrades.length} עסקאות של רדיפה (Chase)`);
    if (!w.length) w.push('לא זוהו חולשות מהותיות — המשך כך');
    return w.slice(0,4);
  }

  function _buildImprovements({ holdingLosers, noStopTrades, earlyExits, revengeCount, chasingTrades, planRate }) {
    const i = [];
    if (holdingLosers.length > 2) i.push('הגדר קטגוריית סטופ לוס לפני כל כניסה ועמוד בה');
    if (noStopTrades.length > 2)  i.push('אל תיכנס לעסקה ללא סטופ מוגדר מראש');
    if (earlyExits.length > 4)    i.push('הגדר יעד מינימלי (לפחות 5%) לפני כניסה');
    if (revengeCount > 1)         i.push('לאחר 2 הפסדים רצופים — קח הפסקה מחוייבת');
    if (chasingTrades.length > 2) i.push('אל תיכנס לאחר עלייה >5% ביום — חכה ל-pullback');
    if (planRate < 60)            i.push('כתוב תוכנית מסחר לפני כניסה ובדוק אחרי יציאה');
    if (!i.length) i.push('הדיסציפלינה שלך טובה — המשך בדרך זו');
    return i.slice(0,4);
  }

  function _buildWeeklyActions({ holdingLosers, noStopTrades, earlyExits, revengeCount, winRate, planRate }) {
    const a = [];
    if (holdingLosers.length > 2)  a.push('סמן את כל הפוזיציות הפתוחות שלך — האם יש הפסדים שאתה מחזיק מ"תקווה"?');
    if (noStopTrades.length > 2)   a.push('הוסף סטופ לוס לכל פוזיציה פתוחה שאין לה סטופ');
    if (revengeCount > 1)          a.push('הוסף כלל בתוכנית: אחרי 2 הפסדים ביום — עצור מסחר');
    if (earlyExits.length > 3)     a.push('נסה לקחת רווחים בשלבים: 50% ביעד ראשון, 50% בהמשך');
    if (winRate < 50)              a.push('חזור על 5 הפסדים האחרונים — מצא מכנה משותף');
    if (planRate < 60)             a.push('כתוב תוכנית קצרה לכל עסקה הבאה: כניסה, יעד, סטופ');
    if (!a.length)                 a.push('המשך בדרך הנוכחית — הנתונים מראים ביצועים טובים');
    return a.slice(0,5);
  }

  return { render };
})();
