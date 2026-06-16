/**
 * FIFO PRO — decisionEngine.js
 * Pre-trade Decision Engine: score 0-100, BUY/WAIT/AVOID, trade memory
 * Depends on: utils.js, api.js, app.js
 */

const DecisionEngine = (() => {
  const { f$, fpct, scoreColor, scoreLabel, scoreLabelHE } = Utils;

  // ── Entry point ──────────────────────────────────────────

  async function run() {
    const sym    = (document.getElementById('de-symbol')?.value || '').trim().toUpperCase();
    const entry  = +document.getElementById('de-entry')?.value  || 0;
    const stop   = +document.getElementById('de-stop')?.value   || 0;
    const target = +document.getElementById('de-target')?.value || 0;
    if (!sym) { alert('הזן סימבול'); return; }
    await analyzeSymbol(sym, entry, stop, target);
  }

  async function analyzeSymbol(sym, entry=0, stop=0, target=0) {
    if (document.getElementById('de-symbol')) document.getElementById('de-symbol').value = sym;
    if (entry  && document.getElementById('de-entry'))  document.getElementById('de-entry').value  = entry;
    if (stop   && document.getElementById('de-stop'))   document.getElementById('de-stop').value   = stop;
    if (target && document.getElementById('de-target')) document.getElementById('de-target').value = target;

    const resultEl = document.getElementById('decision-result');
    if (!resultEl) return;
    resultEl.innerHTML = _loadingCard();

    // Parallel: load indicators + live price
    API.setStatus('טוען אינדיקטורים ל-' + sym + '...', 'info');
    let ind = null, livePrice = 0;
    try {
      [ind] = await Promise.all([
        API.getIndicators(sym).catch(() => null),
        API.fetchPrice(sym).then(d => { if (d?.price) livePrice = d.price; }).catch(() => {})
      ]);
    } catch {}

    const useEntry = entry || livePrice || 0;
    const hist     = APP.trades.filter(t => t.symbol === sym);
    const score    = buildDecisionScore(ind, useEntry, stop, target, hist);

    resultEl.innerHTML   = _renderResult(sym, score, ind, useEntry, stop, target, livePrice);
    document.getElementById('trade-memory').innerHTML = _renderTradeMemory(sym, hist, score);
    API.setStatus('✓ ניתוח הושלם', 'ok');
  }

  // ── Score calculation ─────────────────────────────────────

  function buildDecisionScore(ind, entry, stop, target, hist) {
    let score = 50, details = [];
    const weights = {};

    // ── Technical indicators (from Apps Script) ─────────────
    if (ind) {
      // EMA trend
      if (ind.ema20 && ind.ema50 && ind.ema200 && ind.price) {
        const p = ind.price;
        if (p > ind.ema20 && ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200) {
          score += 12; weights.ema = 12;
          details.push({ label:'מגמה', val:'שורית מלאה (EMA 20>50>200)', color:'green' });
        } else if (p > ind.ema20 && ind.ema20 > ind.ema50) {
          score += 6; weights.ema = 6;
          details.push({ label:'מגמה', val:'שורית חלקית (EMA 20>50)', color:'blue' });
        } else if (p < ind.ema20 && ind.ema20 < ind.ema50) {
          score -= 8; weights.ema = -8;
          details.push({ label:'מגמה', val:'דובית (מתחת ל-EMA)', color:'red' });
        } else {
          details.push({ label:'מגמה', val:'מעורב', color:'gold' });
        }
      } else {
        details.push({ label:'מגמה', val:'אין נתוני EMA', color:'muted' });
      }

      // RSI
      if (ind.rsi != null) {
        if (ind.rsi < 30)     { score += 8; details.push({ label:'RSI', val:ind.rsi.toFixed(0)+' (מכירת יתר)', color:'green' }); }
        else if (ind.rsi > 70){ score -= 8; details.push({ label:'RSI', val:ind.rsi.toFixed(0)+' (קניית יתר)', color:'red' }); }
        else if (ind.rsi > 50 && ind.rsi <= 65) { score += 4; details.push({ label:'RSI', val:ind.rsi.toFixed(0)+' (אזור בריא)', color:'blue' }); }
        else { details.push({ label:'RSI', val:ind.rsi.toFixed(0), color:'muted' }); }
      }

      // Volume
      if (ind.volume && ind.avgVolume) {
        const ratio = ind.volume / ind.avgVolume;
        if (ratio > 1.5) { score += 6; details.push({ label:'נפח', val:`${ratio.toFixed(1)}x ממוצע (גבוה)`, color:'green' }); }
        else if (ratio < 0.7) { score -= 3; details.push({ label:'נפח', val:`${ratio.toFixed(1)}x ממוצע (נמוך)`, color:'red' }); }
        else { details.push({ label:'נפח', val:`${ratio.toFixed(1)}x ממוצע`, color:'muted' }); }
      }

      // Support/Resistance
      if (ind.support && ind.resistance && entry) {
        const nearSupport = Math.abs(entry - ind.support) / entry < 0.03;
        const nearResist  = Math.abs(entry - ind.resistance) / entry < 0.03;
        if (nearSupport)  { score += 5; details.push({ label:'Support', val:`$${ind.support.toFixed(2)} (קרוב)`, color:'green' }); }
        if (nearResist)   { score -= 5; details.push({ label:'Resistance', val:`$${ind.resistance.toFixed(2)} (קרוב)`, color:'red' }); }
      }
    } else {
      details.push({ label:'אינדיקטורים', val:'לא זמינים (ממשיך ללא)', color:'muted' });
    }

    // ── R:R Ratio ────────────────────────────────────────────
    if (entry && stop && target && entry > stop) {
      const risk   = entry - stop;
      const reward = target - entry;
      const rr     = reward / risk;
      if (rr >= 3)     { score += 10; details.push({ label:'R:R', val:`1:${rr.toFixed(1)} (מצוין)`, color:'green' }); }
      else if (rr >= 2){ score += 6;  details.push({ label:'R:R', val:`1:${rr.toFixed(1)} (טוב)`,   color:'blue' }); }
      else if (rr >= 1){ score += 0;  details.push({ label:'R:R', val:`1:${rr.toFixed(1)} (בינוני)`, color:'gold' }); }
      else             { score -= 10; details.push({ label:'R:R', val:`1:${rr.toFixed(1)} (גרוע)`,  color:'red' }); }
    } else if (!stop) {
      score -= 5; details.push({ label:'סטופ', val:'לא הוגדר (-5 נקודות)', color:'red' });
    }

    // ── Historical performance ────────────────────────────────
    if (hist.length >= 3) {
      const wins = hist.filter(t => t.net > 0).length;
      const wr   = wins / hist.length;
      const gp   = hist.filter(t=>t.net>0).reduce((s,t)=>s+t.gross,0);
      const gl   = Math.abs(hist.filter(t=>t.net<0).reduce((s,t)=>s+t.gross,0));
      const pf   = gl > 0 ? gp/gl : gp > 0 ? 5 : 0;

      if (wr >= 0.7 && pf >= 2)      { score += 12; details.push({ label:'היסטוריה', val:`WR ${Math.round(wr*100)}% | PF ${pf.toFixed(1)} (מצוין)`, color:'green' }); }
      else if (wr >= 0.55 && pf >= 1){ score += 6;  details.push({ label:'היסטוריה', val:`WR ${Math.round(wr*100)}% | PF ${pf.toFixed(1)} (טוב)`,   color:'blue' }); }
      else if (wr < 0.4 || pf < 0.8) { score -= 8;  details.push({ label:'היסטוריה', val:`WR ${Math.round(wr*100)}% | PF ${pf.toFixed(1)} (חלש)`,   color:'red' }); }
      else                           { details.push({ label:'היסטוריה', val:`WR ${Math.round(wr*100)}% | PF ${pf.toFixed(1)}`, color:'muted' }); }
    } else if (hist.length > 0) {
      details.push({ label:'היסטוריה', val:`${hist.length} עסקאות בלבד — מדגם קטן`, color:'gold' });
    } else {
      details.push({ label:'היסטוריה', val:'מניה חדשה — אין נתונים', color:'muted' });
    }

    // ── Clamp ────────────────────────────────────────────────
    score = Math.max(0, Math.min(100, Math.round(score)));
    const label      = scoreLabel(score);
    const labelHE    = scoreLabelHE(score);
    const color      = scoreColor(score);
    const confidence = score >= 75 ? 'גבוהה' : score >= 55 ? 'בינונית' : 'נמוכה';

    return { score, label, labelHE, color, confidence, details };
  }

  // ── Render Result ────────────────────────────────────────

  function _renderResult(sym, score, ind, entry, stop, target, livePrice) {
    const rr = (entry && stop && target && entry > stop)
      ? ((target-entry)/(entry-stop)).toFixed(2) : '—';

    return `
      <div class="card" style="margin-top:16px">
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
          <!-- Score circle -->
          <div class="de-score-card" style="min-width:160px;flex:1">
            <div style="font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px">${sym}</div>
            <div class="de-score" style="color:${score.color}">${score.score}</div>
            <div class="de-pill ${score.label.toLowerCase()}" style="margin-bottom:8px">${score.labelHE}</div>
            <div style="font-size:12px;color:var(--text-3)">ביטחון: <strong>${score.confidence}</strong></div>
            ${livePrice ? `<div style="font-size:14px;font-weight:700;margin-top:8px;color:var(--blue)">$${livePrice.toFixed(2)} <span style="font-size:11px;font-weight:400;color:var(--text-3)">מחיר נוכחי</span></div>` : ''}
            <!-- Score bar -->
            <div class="de-bar" style="margin-top:12px">
              <div class="de-bar-fill" style="width:${score.score}%;background:${score.color}"></div>
            </div>
          </div>

          <!-- Checklist -->
          <div style="flex:2;min-width:200px">
            <div class="card-title">ניתוח פקטורים</div>
            ${score.details.map(d => `
              <div class="de-row">
                <span>${d.label}</span>
                <span class="${d.color}">${d.val}</span>
              </div>
            `).join('')}
          </div>

          <!-- R:R + params -->
          ${entry ? `
            <div style="flex:1;min-width:160px">
              <div class="card-title">פרמטרי עסקה</div>
              <div class="de-row"><span>כניסה</span>   <span>$${entry}</span></div>
              ${stop   ? `<div class="de-row"><span>סטופ</span>   <span class="red">$${stop}</span></div>` : ''}
              ${target ? `<div class="de-row"><span>יעד</span>    <span class="green">$${target}</span></div>` : ''}
              ${rr!=='—' ? `<div class="de-row"><span style="font-weight:700">R:R</span><span style="font-weight:700;color:${+rr>=2?'var(--green)':+rr>=1?'var(--blue)':'var(--red)'};font-size:16px">1:${rr}</span></div>` : ''}
            </div>` : ''}
        </div>

        <!-- Warning box -->
        ${score.score < 50 ? `
          <div style="margin-top:14px;padding:10px 14px;background:var(--red-dim);border-radius:var(--r-md);border:1px solid var(--red);font-size:13px;color:var(--red)">
            ⚠️ ציון נמוך — שקול להמתין לתנאים טובים יותר
          </div>` : score.score >= 75 ? `
          <div style="margin-top:14px;padding:10px 14px;background:var(--green-dim);border-radius:var(--r-md);border:1px solid var(--green);font-size:13px;color:var(--green)">
            ✓ תנאים נוחים — הכלי מצביע על עסקה פוטנציאלית
          </div>` : ''}

        <div style="font-size:11px;color:var(--text-3);margin-top:10px;line-height:1.5">
          ⚠️ הדירוג הוא כלי ניתוח בלבד ואינו המלצת השקעה. תמיד השתמש בשיקול דעתך.
        </div>
      </div>
    `;
  }

  // ── Trade Memory ─────────────────────────────────────────

  function _renderTradeMemory(sym, hist, score) {
    if (!hist.length) return '';
    const wins   = hist.filter(t => t.net > 0);
    const losses = hist.filter(t => t.net < 0);
    const totalNet = hist.reduce((s,t) => s+t.net, 0);
    const wr       = Math.round(wins.length / hist.length * 100);
    const avgNet   = hist.reduce((s,t) => s+t.net, 0) / hist.length;
    const avgHold  = hist.reduce((s,t) => s+(t.hold_days||0), 0) / hist.length;
    const bestTrade= hist.reduce((m,t) => t.net>m.net?t:m, hist[0]);
    const worstTrd = hist.reduce((m,t) => t.net<m.net?t:m, hist[0]);
    const gp = wins.reduce((s,t) => s+t.gross, 0);
    const gl = Math.abs(losses.reduce((s,t) => s+t.gross, 0));
    const pf = gl > 0 ? (gp/gl).toFixed(2) : wins.length ? '∞' : '0';

    // Similar past trades (if we have entry price, find trades with similar buy_price range)
    const lastTrade = hist[hist.length-1];

    return `
      <div class="memory-card">
        <div class="memory-title">🧠 Trade Memory — ${sym} (${hist.length} עסקאות היסטוריות)</div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px">
          ${[
            ['נטו כולל',  f$(Math.round(totalNet)), totalNet>=0?'var(--green)':'var(--red)'],
            ['Win Rate',  wr+'%',                    wr>=60?'var(--green)':'var(--red)'],
            ['Avg נטו',   f$(Math.round(avgNet)),    avgNet>=0?'var(--green)':'var(--red)'],
            ['Avg Hold',  avgHold.toFixed(1)+' ימים','var(--blue)'],
            ['Profit F',  pf,                         parseFloat(pf)>=1.5?'var(--green)':'var(--red)'],
          ].map(([l,v,c]) => `
            <div style="background:var(--surface-2);border-radius:var(--r-md);padding:10px;text-align:center">
              <div style="font-size:10px;color:var(--text-3);margin-bottom:3px">${l}</div>
              <div style="font-size:16px;font-weight:700;color:${c}">${v}</div>
            </div>
          `).join('')}
        </div>

        <div class="memory-stat"><span>עסקה מוצלחת ביותר</span><span class="green" style="font-weight:700">${f$(Math.round(bestTrade.net))} (${bestTrade.sell_date})</span></div>
        <div class="memory-stat"><span>עסקה גרועה ביותר</span><span class="red" style="font-weight:700">${f$(Math.round(worstTrd.net))} (${worstTrd.sell_date})</span></div>
        <div class="memory-stat"><span>עסקה אחרונה</span><span class="${lastTrade.net>=0?'green':'red'}">${f$(Math.round(lastTrade.net))} | ${lastTrade.sell_date} | ${lastTrade.hold_days}י'</span></div>

        ${wr < 50 ? `<div style="margin-top:10px;padding:8px 12px;background:var(--red-dim);border-radius:var(--r-sm);font-size:12px;color:var(--red)">⚠️ Win Rate ב-${sym} מתחת ל-50% — שקול מחדש</div>` :
          wr >= 70 ? `<div style="margin-top:10px;padding:8px 12px;background:var(--green-dim);border-radius:var(--r-sm);font-size:12px;color:var(--green)">✓ ביצועים היסטוריים מצוינים ב-${sym}</div>` : ''}
      </div>
    `;
  }

  // ── Loading card ─────────────────────────────────────────

  function _loadingCard() {
    return `
      <div class="card" style="margin-top:16px;text-align:center;padding:40px">
        <div class="spinner" style="margin:0 auto 12px"></div>
        <div style="color:var(--text-3)">טוען אינדיקטורים...</div>
      </div>
    `;
  }

  // ── Starter screen ────────────────────────────────────────

  function renderStarter() {
    const result = document.getElementById('decision-result');
    const memory = document.getElementById('trade-memory');
    if (result && !result.innerHTML.trim()) {
      result.innerHTML = `
        <div class="card" style="text-align:center;padding:30px;color:var(--text-3)">
          <div style="font-size:32px;margin-bottom:10px">🎯</div>
          <div style="font-size:14px">הזן סימבול למעלה ולחץ "נתח מניה"</div>
          <div style="font-size:12px;margin-top:6px">יחושב ציון 0-100 על בסיס טכני, היסטוריה ו-R:R</div>
        </div>
      `;
    }
    if (memory) memory.innerHTML = '';
  }

  // ── Fill from Watchlist ───────────────────────────────────

  function fillFromWatchlist() {
    if (!APP.watchlist.length) { alert('Watchlist ריק'); return; }
    const first = APP.watchlist[0];
    if (document.getElementById('de-symbol'))
      document.getElementById('de-symbol').value = first.symbol;
    const live = APP.liveData[first.symbol];
    if (live?.price) {
      if (document.getElementById('de-entry'))
        document.getElementById('de-entry').value = live.price.toFixed(2);
    }
  }

  return { run, analyzeSymbol, buildDecisionScore, renderStarter, fillFromWatchlist };
})();
