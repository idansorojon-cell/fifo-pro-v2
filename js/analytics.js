/**
 * FIFO PRO — analytics.js
 * Insights, Heatmap, Performance Center, Mistake Detector, Symbol Intelligence
 * Depends on: utils.js, charts.js, app.js
 */

const Analytics = (() => {
  const { f$, fILS, fpct, fnum, parseDD, monthLabel, usdToIls, tradesNetIls } = Utils;

  // ── Insights ─────────────────────────────────────────────

  function renderInsights(st) {
    _renderInsightCards(st);
    _renderAdvStats(st);
    Charts.renderDow(st);
    Charts.renderHold(st);
    Charts.renderSize(st);
    renderMistakeDetector();
  }

  function _renderInsightCards(st) {
    const el = document.getElementById('insights-grid');
    if (!el) return;
    const dowNames  = ['א','ב','ג','ד','ה','ו','ש'];
    const bestDow   = Object.entries(st.byDow).sort((a,b) => b[1].net-a[1].net)[0];
    const worstDow  = Object.entries(st.byDow).sort((a,b) => a[1].net-b[1].net)[0];
    const topSym    = st.symArr[0];
    const worstSym  = st.symArr[st.symArr.length-1];
    const top20     = Math.ceil(st.total*0.2);
    const top20net  = [...APP.trades].sort((a,b)=>b.net-a.net).slice(0,top20).reduce((s,t)=>s+t.net,0);
    const top20pct  = st.totalNet>0 ? Math.round(top20net/st.totalNet*100) : 0;
    const bestHold  = Object.entries(st.holdBuckets).sort((a,b)=>b[1]-a[1])[0];

    el.innerHTML = [
      ['🏆','סימבול מוביל',   topSym?.symbol||'—',   topSym ? f$(topSym.net)+` (WR ${topSym.winRate}%)` : ''],
      ['⚠️','סימבול חלש',     worstSym?.net<0?worstSym.symbol:'ללא הפסדים', worstSym?.net<0?f$(worstSym.net):''],
      ['📅','יום חזק בשבוע',  bestDow  ? 'יום '+dowNames[+bestDow[0]]  : '—', bestDow  ? f$(Math.round(bestDow[1].net))  : ''],
      ['📉','יום חלש בשבוע',  worstDow?.net<0 ? 'יום '+dowNames[+worstDow[0]] : '—', worstDow?.net<0 ? f$(Math.round(worstDow[1].net)) : ''],
      ['🎯','Expectancy',      f$(Math.round(st.expectancy)),  'לעסקה ממוצעת'],
      ['🔥','Winning Streak',  st.maxWS+' עסקאות',             'רצף מנצח מקסימלי'],
      ['❄️','Losing Streak',   st.maxLS+' עסקאות',             'רצף מפסיד מקסימלי'],
      ['⏱️','Avg Hold Time',   st.avgHold.toFixed(1)+' ימים', 'ממוצע'],
      ['💥','Largest Win',     f$(Math.round(st.largestWin)),  'עסקה רווחית ביותר'],
      ['💔','Largest Loss',    f$(Math.round(st.largestLoss)), 'עסקה מפסידה ביותר'],
      ['📊','חוק 80/20',       top20pct+'%',                   'מ-20% העסקאות הטובות'],
      ['⏳','Hold מנצח',       bestHold?bestHold[0]:'—',       bestHold?f$(Math.round(bestHold[1])):''],
      ['📐','Kelly %',         Math.round(st.kelly*100)+'%',   'גודל פוזיציה מומלץ'],
      ['📈','Sharpe Ratio',    st.sharpe,                      'תשואה/סיכון חודשי'],
      ['🔽','Max Drawdown',    f$(Math.round(st.maxDD)),       'ירידה מקסימלית מהשיא'],
      ['🔄','Recovery Factor', st.recoveryFactor,              'רווח כולל / Max DD'],
    ].map(([i,t,v,s]) => `
      <div class="insight-card">
        <div class="insight-icon">${i}</div>
        <div class="insight-title">${t}</div>
        <div class="insight-val">${v}</div>
        <div class="insight-sub">${s}</div>
      </div>
    `).join('');
  }

  function _renderAdvStats(st) {
    const el = document.getElementById('adv-stats');
    if (!el) return;
    el.innerHTML = [
      ['Win Rate',            st.winRate+'%'],
      ['Profit Factor',       st.pf >= 99 ? '∞' : st.pf],
      ['Expectancy',          f$(Math.round(st.expectancy))],
      ['Sharpe Ratio',        st.sharpe],
      ['Kelly %',             Math.round(st.kelly*100)+'%'],
      ['Avg Win',             f$(Math.round(st.avgWin))],
      ['Avg Loss',            f$(Math.round(Math.abs(st.avgLoss)))],
      ['Max Winning Streak',  st.maxWS+' עסקאות'],
      ['Max Losing Streak',   st.maxLS+' עסקאות'],
      ['Largest Win',         f$(Math.round(st.largestWin))],
      ['Largest Loss',        f$(Math.round(st.largestLoss))],
      ['Avg Hold Time',       st.avgHold.toFixed(1)+' ימים'],
      ['Max Drawdown',        f$(Math.round(st.maxDD))],
      ['Recovery Factor',     st.recoveryFactor],
      ['סה"כ עסקאות',         st.total],
      ['רווחיות',             st.wins],
      ['מפסידות',             st.losses],
    ].map(([l,v]) => `
      <div class="stat-row">
        <span class="stat-label">${l}</span>
        <span class="stat-val">${v}</span>
      </div>
    `).join('');
  }

  // ── Mistake Detector ─────────────────────────────────────

  function renderMistakeDetector() {
    const el = document.getElementById('mistake-grid');
    if (!el) return;

    const trades = APP.trades;
    if (!trades.length) { el.innerHTML = '<div style="color:var(--text-3)">אין מספיק נתונים</div>'; return; }

    // Canonical detector (utils.js) — shared with aiCoach.js so both
    // modules always agree on what counts as a FOMO/Chase/etc. trade
    // (previously each had its own slightly different, drifting logic).
    const det = Utils.detectMistakes(trades);

    const mistakes = [
      { icon:'😱', name:'FOMO',             count:det.fomo,         threshold:3, desc:'נכנסת בפחד להפסיד, יצאת בהפסד' },
      { icon:'🏃', name:'Chase',            count:det.chase,        threshold:2, desc:'רדפת אחרי מניה מתוקפת' },
      { icon:'🚪', name:'Early Exit',       count:det.earlyExit,    threshold:5, desc:'יצאת עם רווח קטן (<3%)' },
      { icon:'🤲', name:'Holding Losers',   count:det.holdingLosers,threshold:3, desc:'החזקת הפסדים >7 ימים' },
      { icon:'📉', name:'Adding to Losers', count:det.addingLosers, threshold:2, desc:'הוספת לפוזיציה מפסידה' },
      { icon:'🛑', name:'No Stop',          count:det.noStop,       threshold:3, desc:'מסחר ללא סטופ לוס' },
      { icon:'💰', name:'Oversized',        count:det.oversized,    threshold:2, desc:'פוזיציה גדולה מדי שהפסידה' },
      { icon:'😤', name:'Revenge Trading',  count:det.revenge,      threshold:2, desc:'הפסד אחרי הפסד גדול יותר' },
      { icon:'🔄', name:'Overtrading',      count:det.overtrading,  threshold:2, desc:'יותר מ-4 עסקאות ביום' },
    ];

    el.innerHTML = mistakes.map(m => `
      <div class="mistake-card ${m.count >= m.threshold ? 'has-issue' : m.count===0?'no-issue':''}">
        <div class="mistake-icon">${m.icon}</div>
        <div class="mistake-name">${m.name}</div>
        <div class="mistake-count ${m.count>=m.threshold?'red':m.count===0?'green':'gold'}">${m.count}</div>
        <div class="mistake-sub">${m.desc}</div>
      </div>
    `).join('');
  }

  // ── Performance Center ────────────────────────────────────

  function renderPerformance(st) {
    const el = document.getElementById('perf-grid');
    if (!el) return;

    const payoffRatio = st.avgLoss !== 0 ? Math.abs(st.avgWin / st.avgLoss).toFixed(2) : '—';
    const avgPosSize  = APP.trades.length
      ? Math.round(APP.trades.reduce((s,t)=>s+(t.cost||0),0)/APP.trades.length)
      : 0;
    const avgR = st.avgLoss !== 0 && st.avgWin !== 0
      ? (st.avgWin / Math.abs(st.avgLoss)).toFixed(2)
      : '—';

    const perfs = [
      { label:'Profit Factor',   val: st.pf>=99?'∞':st.pf, color: st.pf>=2?'green':'red' },
      { label:'Expectancy',      val: f$(Math.round(st.expectancy)), color: st.expectancy>=0?'green':'red' },
      { label:'Kelly %',         val: Math.round(st.kelly*100)+'%', color:'gold' },
      { label:'Sharpe Ratio',    val: st.sharpe, color: st.sharpe>=1?'green':'red' },
      { label:'Max Drawdown',    val: f$(Math.round(st.maxDD)), color:'red' },
      { label:'Recovery Factor', val: st.recoveryFactor, color: st.recoveryFactor>=2?'green':'red' },
      { label:'Avg Winner',      val: f$(Math.round(st.avgWin)), color:'green' },
      { label:'Avg Loser',       val: f$(Math.round(Math.abs(st.avgLoss))), color:'red' },
      { label:'Avg Hold Time',   val: st.avgHold.toFixed(1)+' ימים', color:'blue' },
      { label:'Avg Position',    val: f$(avgPosSize), color:'blue' },
      { label:'Avg R Multiple',  val: avgR, color: parseFloat(avgR)>=1?'green':'red' },
      { label:'Win Rate',        val: st.winRate+'%', color: st.winRate>=60?'green':'red' },
      { label:'Payoff Ratio',    val: payoffRatio, color: parseFloat(payoffRatio)>=1.5?'green':'red' },
    ];

    el.innerHTML = perfs.map(p => `
      <div class="perf-stat">
        <div class="perf-stat-label">${p.label}</div>
        <div class="perf-stat-val ${p.color}">${p.val}</div>
      </div>
    `).join('');

    renderSymbolIntelligence(st);
    renderSectorExposure();
  }

  // ── Sector Exposure ───────────────────────────────────────
  // Trades don't currently carry a `sector` field, so this cannot be
  // computed honestly — rather than fabricate sector buckets, say so
  // plainly. To enable this, add a `sector` field to the trade schema
  // (see README_AI.md "Trade Object Schema") and populate it on add/edit.

  function renderSectorExposure() {
    const el = document.getElementById('sector-exposure');
    if (!el) return;
    el.innerHTML = `
      <div style="color:var(--text-3);font-size:12px;line-height:1.6">
        אין נתוני סקטור זמינים — לא נשמר שדה "סקטור" בעסקאות.
        כדי להפעיל תצוגה זו יש להוסיף שדה <code>sector</code> לסכמת העסקה.
      </div>`;
  }

  // ── Symbol Intelligence ───────────────────────────────────

  function renderSymbolIntelligence(st) {
    const el = document.getElementById('sym-intel');
    if (!el) return;
    el.innerHTML = st.symArr.slice(0,8).map(s => {
      const symTrades = APP.trades.filter(t => t.symbol === s.symbol);
      const mistakes  = _symMistakes(symTrades);
      return `
        <div class="sym-intel-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:15px;font-weight:700">${s.symbol}</div>
            <span class="badge ${s.net>=0?'badge-green':'badge-red'}">${f$(s.net)}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px">
            <span style="color:var(--text-3)">עסקאות:</span>   <span>${s.trades}</span>
            <span style="color:var(--text-3)">Win Rate:</span>  <span class="${s.winRate>=60?'green':'red'}">${s.winRate}%</span>
            <span style="color:var(--text-3)">Avg Hold:</span>  <span>${s.avgHold} ימים</span>
            <span style="color:var(--text-3)">Profit Factor:</span><span>${s.pf>=99?'∞':s.pf}</span>
          </div>
          ${mistakes ? `<div style="font-size:11px;color:var(--red);margin-top:6px">⚠️ ${mistakes}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function _symMistakes(trades) {
    const losses = trades.filter(t => t.net < 0);
    if (!losses.length) return null;
    const pcts = [];
    if (losses.length / trades.length > 0.6) pcts.push('WR נמוך');
    if (losses.some(t => (t.hold_days||0) > 14)) pcts.push('מחזיק הפסדים');
    if (losses.some(t => t.respected_stop === 'לא')) pcts.push('לא כיבד סטופ');
    return pcts.join(' · ') || null;
  }

  // ── Heat Map ──────────────────────────────────────────────

  function renderHeatmap(st) {
    const sel = document.getElementById('hm-year');
    if (!sel) return;
    const years = [...new Set(APP.trades.map(t => t.sell_date?t.sell_date.split('/')[2]:null).filter(Boolean))].sort();
    if (!years.length) return;
    const prev = sel.value;
    sel.innerHTML = years.map(y => `<option>${y}</option>`).join('');
    if (prev && years.includes(prev)) sel.value = prev;
    const year = sel.value || years[years.length-1];
    sel.value = year;

    const container  = document.getElementById('heatmap-container');
    if (!container) return;
    const monthNames = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

    let html = '';
    for (let m=0; m<12; m++) {
      const firstDay   = new Date(+year, m, 1).getDay();
      const daysInMonth= new Date(+year, m+1, 0).getDate();
      html += `<div style="margin-bottom:18px">
        <div style="font-size:12px;color:var(--text-3);margin-bottom:6px">${monthNames[m]} ${year}</div>
        <div class="heatmap-wrap"><div class="heatmap-grid">`;
      ['א','ב','ג','ד','ה','ו','ש'].forEach(d => html += `<div class="hm-head">${d}</div>`);
      for (let i=0; i<firstDay; i++) html += `<div></div>`;
      for (let d=1; d<=daysInMonth; d++) {
        const key = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const val = st.byDate[key];
        let bg='var(--surface-2)', color='var(--text-3)';
        if (val !== undefined) {
          if (val > 0)      { const i=Math.min(1,Math.abs(val)/5000); bg=`rgba(78,204,168,${0.2+i*0.7})`;  color='#fff'; }
          else if (val < 0) { const i=Math.min(1,Math.abs(val)/5000); bg=`rgba(255,107,107,${0.2+i*0.7})`; color='#fff'; }
          else              { bg='var(--surface-3)'; color='var(--text-3)'; }
        }
        html += `<div class="hm-cell" style="background:${bg};color:${color}" title="${key}: ${val!==undefined?f$(Math.round(val)):'אין מסחר'}">${d}</div>`;
      }
      html += `</div></div></div>`;
    }
    container.innerHTML = html;
  }

  // ── Symbol Notes ──────────────────────────────────────────

  function renderSymNotes() {
    const container = document.getElementById('sym-notes-container');
    if (!container) return;
    const q = (document.getElementById('symnote-search')?.value || '').toLowerCase();
    const bySymbol = {};
    APP.trades.forEach(t => {
      if (!t.entry_reason && !t.exit_reason && !t.lesson && !t.emotion && !t.notes) return;
      if (q && !t.symbol.toLowerCase().includes(q)) return;
      if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
      bySymbol[t.symbol].push(t);
    });
    if (!Object.keys(bySymbol).length) {
      container.innerHTML = '<div style="color:var(--text-3);font-size:13px;grid-column:1/-1">אין תוכן יומן. הוסף הערות ולקחים לעסקאות בטאב יומן.</div>';
      return;
    }
    container.innerHTML = Object.entries(bySymbol).sort((a,b)=>a[0].localeCompare(b[0])).map(([sym, ts]) => {
      const totalNet = ts.reduce((s,t) => s+t.net, 0);
      const items    = ts.slice(0,5).map(t => {
        const content = t.lesson || t.entry_reason || t.notes || '';
        if (!content) return '';
        return `<div class="sym-note-item">
          <span class="sym-note-date">${t.sell_date}</span>
          <span>${content.slice(0,80)}${content.length>80?'...':''}</span>
        </div>`;
      }).filter(Boolean).join('');
      return `<div class="sym-note-card">
        <div class="sym-note-sym">${sym} <span style="font-size:12px;font-weight:400;color:${totalNet>=0?'var(--green)':'var(--red)'}">${f$(Math.round(totalNet))}</span></div>
        <div style="font-size:11px;color:var(--text-3);margin-bottom:8px">${ts.length} עסקאות עם הערות</div>
        ${items || '<div style="color:var(--text-3);font-size:12px">אין תוכן</div>'}
        ${ts.length>5?`<div style="font-size:11px;color:var(--text-3);margin-top:6px">+${ts.length-5} נוספות...</div>`:''}
      </div>`;
    }).join('');
  }

  // ── Progress Tab ──────────────────────────────────────────

  function renderProgress(st) {
    const kpisEl = document.getElementById('progress-kpis');
    if (!kpisEl || !APP.trades.length) return;

    const sorted = [...APP.trades].sort((a,b) => parseDD(a.sell_date)-parseDD(b.sell_date));
    const half   = Math.floor(sorted.length/2);
    const first  = sorted.slice(0,half);
    const second = sorted.slice(half);

    const calcH = arr => {
      const w = arr.filter(t=>t.net>0), l = arr.filter(t=>t.net<0);
      const gp= w.reduce((s,t)=>s+t.gross,0), gl=Math.abs(l.reduce((s,t)=>s+t.gross,0));
      return {
        winRate: arr.length ? Math.round(w.length/arr.length*100) : 0,
        pf:      gl>0 ? +(gp/gl).toFixed(2) : 99,
        avgNet:  arr.length ? arr.reduce((s,t)=>s+t.net,0)/arr.length : 0,
        avgHold: arr.length ? arr.reduce((s,t)=>s+(t.hold_days||0),0)/arr.length : 0,
      };
    };
    const f = calcH(first), s = calcH(second);

    const trend = (oldV, newV, higher=true) => {
      const diff = newV-oldV;
      const pct  = oldV ? Math.abs(diff/oldV*100).toFixed(0) : 0;
      if (Math.abs(diff) < 0.01) return { cls:'trend-flat', icon:'→', txt:'ללא שינוי' };
      const better = higher ? diff>0 : diff<0;
      return { cls: better?'trend-up':'trend-down', icon: diff>0?'▲':'▼', txt:`${pct}% ${better?'שיפור':'ירידה'}` };
    };

    kpisEl.innerHTML = [
      { label:'Win Rate',       old:f.winRate+'%',          new:s.winRate+'%',          tr:trend(f.winRate,s.winRate) },
      { label:'Profit Factor',  old:f.pf,                   new:s.pf,                   tr:trend(f.pf,s.pf) },
      { label:'Avg נטו לעסקה', old:f$(Math.round(f.avgNet)), new:f$(Math.round(s.avgNet)), tr:trend(f.avgNet,s.avgNet) },
      { label:'Avg Hold (ימים)',old:f.avgHold.toFixed(1),   new:s.avgHold.toFixed(1),   tr:trend(f.avgHold,s.avgHold,false) },
    ].map(m => `
      <div class="prog-kpi">
        <div class="prog-kpi-label">${m.label}</div>
        <div style="display:flex;justify-content:center;gap:12px;align-items:center;margin:6px 0">
          <div style="text-align:center"><div style="font-size:11px;color:var(--text-3)">ראשית</div><div style="font-weight:500">${m.old}</div></div>
          <div class="${m.tr.cls}" style="font-size:18px">${m.tr.icon}</div>
          <div style="text-align:center"><div style="font-size:11px;color:var(--text-3)">עכשיו</div><div style="font-weight:700;font-size:16px">${m.new}</div></div>
        </div>
        <div class="prog-kpi-sub ${m.tr.cls}">${m.tr.txt}</div>
      </div>
    `).join('');

    Charts.renderWinRateTime(st);
    Charts.renderRollingAvg(st);
    Charts.renderPFTime(st);
    Charts.renderWeekOfMonth();
  }

  // Debounced wrapper for the free-text symbol-notes search input —
  // avoids re-rendering the whole grid on every keystroke.
  const renderSymNotesDebounced = Utils.debounce(renderSymNotes, 200);

  return {
    renderInsights, renderMistakeDetector,
    renderPerformance, renderSymbolIntelligence,
    renderHeatmap, renderSymNotes, renderSymNotesDebounced, renderProgress
  };
})();
