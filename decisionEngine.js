/**
 * FIFO PRO — decisionEngine.js (v2)
 * Pre-trade Decision Engine — REDESIGNED per production audit:
 *
 *   1. Never fabricates a score from missing data. If real technical
 *      indicators can't be loaded, the panel says exactly that and lists
 *      what's missing — it never silently falls back to a fake BUY/AVOID.
 *   2. Splits analysis into two INDEPENDENT scores:
 *        - Trade Discipline Score  → evaluates YOU (always computable —
 *          it's 100% your own real trade/journal history)
 *        - Market Technical Score  → evaluates the STOCK using only
 *          indicator fields the backend actually returned (no placeholders)
 *   3. News panel — real data where the backend provides it, explicit
 *      "Not available" for anything the backend doesn't (never invented).
 *   4. Final blended score (40% Technical / 30% Discipline / 20% News /
 *      10% Personal History) with confidence + full explainability.
 *   5. Personal Learning Engine integration (learningEngine.js) — real,
 *      sample-size-gated stats from this trader's own history.
 *
 * Depends on: utils.js, api.js, app.js, learningEngine.js
 */

const DecisionEngine = (() => {
  const { f$, fpct, fprice, scoreColor, finalRecommendation } = Utils;

  // Full set of indicator fields this module knows how to use if present.
  // Whatever the backend doesn't return shows as "missing" — never faked.
  const TECH_FIELDS = [
    'ema9','ema20','ema50','ema200','rsi','macd','macdSignal',
    'vwap','atr','volume','avgVolume','support','resistance',
    'week52High','week52Low','gapPct','preMarket','afterHours',
    'sectorChangePct','benchmarkChangePct','changePct','price',
  ];
  const CORE_TECH_FIELDS = ['ema20','ema50','ema200','rsi']; // bare minimum to call this "real analysis"

  // ── Entry point ──────────────────────────────────────────

  async function run() {
    const sym       = (document.getElementById('de-symbol')?.value || '').trim().toUpperCase();
    const entry     = +document.getElementById('de-entry')?.value  || 0;
    const stop      = +document.getElementById('de-stop')?.value   || 0;
    const target    = +document.getElementById('de-target')?.value || 0;
    const qty       = +document.getElementById('de-qty')?.value || 0;
    const portfolio = +document.getElementById('de-portfolio')?.value || 67000;
    if (!sym) { alert('הזן סימבול'); return; }
    await analyzeSymbol(sym, entry, stop, target, qty, portfolio);
  }

  async function analyzeSymbol(sym, entry=0, stop=0, target=0, qty=0, portfolio=67000) {
    if (document.getElementById('de-symbol')) document.getElementById('de-symbol').value = sym;
    if (entry  && document.getElementById('de-entry'))  document.getElementById('de-entry').value  = entry;
    if (stop   && document.getElementById('de-stop'))   document.getElementById('de-stop').value   = stop;
    if (target && document.getElementById('de-target')) document.getElementById('de-target').value = target;

    const resultEl = document.getElementById('decision-result');
    if (!resultEl) return;
    resultEl.innerHTML = _loadingCard();

    API.setStatus('טוען נתונים אמיתיים על ' + sym + '...', 'info');

    let ind = null, livePrice = 0, news = null;
    const [indRes, priceRes, newsRes] = await Promise.allSettled([
      API.getIndicators(sym),
      API.fetchPrice(sym),
      API.getNews(sym),
    ]);
    if (indRes.status === 'fulfilled') ind = indRes.value;
    if (priceRes.status === 'fulfilled' && priceRes.value?.price) livePrice = priceRes.value.price;
    if (newsRes.status === 'fulfilled') news = newsRes.value;

    const useEntry = entry || livePrice || (ind && ind.price) || 0;
    const hist     = APP.trades.filter(t => t.symbol === sym);
    const st       = getStats();

    const technical = buildTechnicalScore(ind, livePrice);
    const discipline = buildDisciplineScore(useEntry, stop, target, qty, portfolio, hist, st);
    const newsScore   = buildNewsScore(news);
    const personal      = buildPersonalHistoryScore(hist);
    const final            = blendFinal(technical, discipline, newsScore, personal);

    const ctx = { technical, discipline, newsScore, personal, final, useEntry, stop, target, livePrice, ind, news };
    resultEl.innerHTML = _renderResult(sym, ctx);
    document.getElementById('trade-memory').innerHTML = _renderTradeMemory(sym, hist);
    API.setStatus('✓ ניתוח הושלם', 'ok');
  }

  // ════════════════════════════════════════════════════════════
  // SCORE 1 — Market Technical Score (the STOCK, real data only)
  // ════════════════════════════════════════════════════════════

  function buildTechnicalScore(ind, livePrice) {
    if (!ind) {
      return { insufficient:true, missing: TECH_FIELDS, present: [], score:null, details:[], confidence:'Low',
                reason: 'לא הצלחתי לטעון נתוני שוק כלל (getIndicators נכשל או לא מוגדר).' };
    }
    const present = TECH_FIELDS.filter(f => ind[f] !== undefined && ind[f] !== null);
    const missingCore = CORE_TECH_FIELDS.filter(f => !present.includes(f));
    if (missingCore.length) {
      return { insufficient:true, missing: missingCore, present, score:null, details:[], confidence:'Low',
                reason: `שדות חובה חסרים מהבק-אנד: ${missingCore.join(', ')}.` };
    }

    let score = 50;
    const details = [];
    const price = ind.price || livePrice || 0;
    const push = (label, val, color, points) => { score += points; details.push({ label, val, color, points }); };

    // ── Trend: EMA 20/50/200 ──
    if (price && ind.ema20 && ind.ema50 && ind.ema200) {
      if (price > ind.ema20 && ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200)
        push('מגמה (EMA 20/50/200)', 'שורית מלאה', 'green', 12);
      else if (price > ind.ema20 && ind.ema20 > ind.ema50)
        push('מגמה (EMA 20/50/200)', 'שורית חלקית', 'blue', 6);
      else if (price < ind.ema20 && ind.ema20 < ind.ema50)
        push('מגמה (EMA 20/50/200)', 'דובית', 'red', -8);
      else
        push('מגמה (EMA 20/50/200)', 'מעורב', 'gold', 0);
    }

    // ── Short-term EMA stack 9/21 (uses ema20 as proxy for ema21 if 21 absent) ──
    const ema21 = ind.ema21 != null ? ind.ema21 : ind.ema20;
    if (price && ind.ema9 != null && ema21 != null) {
      const bullish = price > ind.ema9 && ind.ema9 > ema21;
      push('EMA 9/21 (קצר טווח)', bullish ? 'שורי' : 'דובי/מעורב', bullish?'green':'red', bullish?4:-4);
    } else {
      details.push({ label:'EMA 9/21', val:'לא זמין', color:'muted', points:0 });
    }

    // ── RSI ──
    if (ind.rsi != null) {
      if (ind.rsi < 30)      push('RSI', ind.rsi.toFixed(0)+' (מכירת יתר)', 'green', 8);
      else if (ind.rsi > 70) push('RSI', ind.rsi.toFixed(0)+' (קניית יתר)', 'red', -8);
      else if (ind.rsi > 50 && ind.rsi <= 65) push('RSI', ind.rsi.toFixed(0)+' (אזור בריא)', 'blue', 4);
      else push('RSI', ind.rsi.toFixed(0), 'muted', 0);
    }

    // ── MACD ──
    if (ind.macd != null && ind.macdSignal != null) {
      const bullish = ind.macd > ind.macdSignal;
      push('MACD', bullish ? 'חצייה שורית' : 'חצייה דובית', bullish?'green':'red', bullish?6:-6);
    } else {
      details.push({ label:'MACD', val:'לא זמין', color:'muted', points:0 });
    }

    // ── VWAP ──
    if (price && ind.vwap != null) {
      const above = price > ind.vwap;
      push('VWAP', above ? `מעל VWAP ($${ind.vwap.toFixed(2)})` : `מתחת ל-VWAP ($${ind.vwap.toFixed(2)})`, above?'green':'red', above?4:-4);
    } else {
      details.push({ label:'VWAP', val:'לא זמין', color:'muted', points:0 });
    }

    // ── Relative Volume ──
    if (ind.volume && ind.avgVolume) {
      const ratio = ind.volume / ind.avgVolume;
      if (ratio > 1.5)       push('נפח יחסי (RVOL)', `${ratio.toFixed(1)}x ממוצע (גבוה)`, 'green', 6);
      else if (ratio < 0.7)  push('נפח יחסי (RVOL)', `${ratio.toFixed(1)}x ממוצע (נמוך)`, 'red', -3);
      else                   push('נפח יחסי (RVOL)', `${ratio.toFixed(1)}x ממוצע`, 'muted', 0);
    } else {
      details.push({ label:'נפח יחסי (RVOL)', val:'לא זמין', color:'muted', points:0 });
    }

    // ── ATR / Volatility ──
    if (ind.atr != null && price) {
      const atrPct = ind.atr / price * 100;
      if (atrPct > 5) push('תנודתיות (ATR)', atrPct.toFixed(1)+'% מהמחיר — גבוהה', 'gold', -3);
      else            push('תנודתיות (ATR)', atrPct.toFixed(1)+'% מהמחיר', 'muted', 0);
    } else {
      details.push({ label:'תנודתיות (ATR)', val:'לא זמין', color:'muted', points:0 });
    }

    // ── Support / Resistance (relative to current price) ──
    if (ind.support && ind.resistance && price) {
      const nearSupport = Math.abs(price - ind.support) / price < 0.03;
      const nearResist  = Math.abs(price - ind.resistance) / price < 0.03;
      if (nearSupport) push('Support', `$${ind.support.toFixed(2)} (קרוב)`, 'green', 5);
      if (nearResist)  push('Resistance', `$${ind.resistance.toFixed(2)} (קרוב)`, 'red', -5);
      if (!nearSupport && !nearResist) details.push({ label:'Support/Resistance', val:`$${ind.support.toFixed(2)} / $${ind.resistance.toFixed(2)}`, color:'muted', points:0 });
    } else {
      details.push({ label:'Support/Resistance', val:'לא זמין', color:'muted', points:0 });
    }

    // ── 52-week range position ──
    if (price && ind.week52High != null && ind.week52Low != null && ind.week52High > ind.week52Low) {
      const pos = (price - ind.week52Low) / (ind.week52High - ind.week52Low);
      if (pos > 0.9)       push('טווח 52 שבועות', `${(pos*100).toFixed(0)}% — קרוב לשיא שנתי`, 'green', 5);
      else if (pos < 0.15) push('טווח 52 שבועות', `${(pos*100).toFixed(0)}% — קרוב לתחתית שנתית`, 'gold', -3);
      else                 push('טווח 52 שבועות', `${(pos*100).toFixed(0)}% מהטווח`, 'muted', 0);
    } else {
      details.push({ label:'טווח 52 שבועות', val:'לא זמין', color:'muted', points:0 });
    }

    // ── Gap ──
    if (ind.gapPct != null) {
      if (Math.abs(ind.gapPct) > 5) push('Gap', fpct(ind.gapPct) + ' — סיכון רדיפה', 'gold', -4);
      else                          push('Gap', fpct(ind.gapPct), 'muted', 0);
    } else {
      details.push({ label:'Gap', val:'לא זמין', color:'muted', points:0 });
    }

    // ── Pre/After-market (informational — not enough signal alone to score) ──
    details.push({ label:'Pre-Market', val: ind.preMarket != null ? fprice(ind.preMarket) : 'לא זמין', color:'muted', points:0 });
    details.push({ label:'After-Hours', val: ind.afterHours != null ? fprice(ind.afterHours) : 'לא זמין', color:'muted', points:0 });

    // ── Sector strength / Benchmark comparison ──
    if (ind.changePct != null && ind.sectorChangePct != null) {
      const rel = ind.changePct - ind.sectorChangePct;
      push('חוזק יחסי לסקטור', fpct(rel) + ' מהסקטור', rel>=0?'green':'red', rel>=0?4:-4);
    } else {
      details.push({ label:'חוזק יחסי לסקטור', val:'לא זמין', color:'muted', points:0 });
    }
    if (ind.changePct != null && ind.benchmarkChangePct != null) {
      const rel = ind.changePct - ind.benchmarkChangePct;
      push('חוזק יחסי למדד', fpct(rel) + ' מה-S&P 500', rel>=0?'green':'red', rel>=0?4:-4);
    } else {
      details.push({ label:'חוזק יחסי למדד', val:'לא זמין', color:'muted', points:0 });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const confidence = present.length >= 14 ? 'High' : present.length >= 8 ? 'Medium' : 'Low';
    const missing = TECH_FIELDS.filter(f => !present.includes(f));
    return { insufficient:false, score, details, present, missing, confidence };
  }

  // ════════════════════════════════════════════════════════════
  // SCORE 2 — Trade Discipline Score (YOU — always real, always available)
  // ════════════════════════════════════════════════════════════

  function buildDisciplineScore(entry, stop, target, qty, portfolio, hist, st) {
    let score = 50;
    const details = [];
    const push = (label, val, color, points) => { score += points; details.push({ label, val, color, points }); };

    // ── R:R of the planned trade ──
    if (entry && stop && target && entry > stop) {
      const risk = entry - stop, reward = target - entry, rr = reward / risk;
      if (rr >= 3)      push('R:R', `1:${rr.toFixed(1)} (מצוין)`, 'green', 10);
      else if (rr >= 2) push('R:R', `1:${rr.toFixed(1)} (טוב)`, 'blue', 6);
      else if (rr >= 1) push('R:R', `1:${rr.toFixed(1)} (בינוני)`, 'gold', 0);
      else              push('R:R', `1:${rr.toFixed(1)} (גרוע)`, 'red', -10);
    } else if (entry && !stop) {
      push('סטופ לוס', 'לא הוגדר', 'red', -8);
    } else {
      details.push({ label:'R:R', val:'הזן כניסה/סטופ/יעד לחישוב', color:'muted', points:0 });
    }

    // ── Position size & portfolio exposure ──
    if (entry && stop && qty && portfolio && entry > stop) {
      const riskAmt = (entry - stop) * qty;
      const riskPct = riskAmt / portfolio * 100;
      if (riskPct <= 1)      push('סיכון לתיק', riskPct.toFixed(1)+'% (שמרני)', 'green', 6);
      else if (riskPct <= 2) push('סיכון לתיק', riskPct.toFixed(1)+'% (סביר)', 'blue', 2);
      else                   push('סיכון לתיק', riskPct.toFixed(1)+'% (גבוה מהמומלץ)', 'red', -10);

      const exposure = entry * qty;
      const exposurePct = exposure / portfolio * 100;
      details.push({ label:'חשיפה כוללת', val: `${f$(Math.round(exposure))} (${exposurePct.toFixed(0)}% מהתיק)`, color: exposurePct>30?'gold':'muted', points:0 });
    } else {
      details.push({ label:'גודל פוזיציה / חשיפה', val:'הזן כמות וגודל תיק לחישוב', color:'muted', points:0 });
    }

    // ── Personal Win Rate / PF / Expectancy (global, real, from your own journal) ──
    if (st.total >= LearningEngine.MIN_SAMPLE) {
      if (st.winRate >= 60)      push('Win Rate אישי', st.winRate+'%', 'green', 5);
      else if (st.winRate < 45)  push('Win Rate אישי', st.winRate+'%', 'red', -5);
      else                       details.push({ label:'Win Rate אישי', val:st.winRate+'%', color:'muted', points:0 });

      if (st.pf >= 2)       push('Profit Factor אישי', st.pf, 'green', 5);
      else if (st.pf < 1)   push('Profit Factor אישי', st.pf, 'red', -8);
      else                  details.push({ label:'Profit Factor אישי', val:st.pf, color:'muted', points:0 });

      if (st.expectancy >= 0) push('Expectancy אישי', f$(Math.round(st.expectancy)), 'green', 3);
      else                    push('Expectancy אישי', f$(Math.round(st.expectancy)), 'red', -5);
    } else {
      details.push({ label:'סטטיסטיקה אישית', val:`רק ${st.total} עסקאות בהיסטוריה — מדגם קטן`, color:'muted', points:0 });
    }

    // ── Systemic mistake rates (real, from your own trade journal) ──
    if (st.total > 0) {
      const m = Utils.detectMistakes(APP.trades);
      const rate = (n) => n / st.total;
      if (rate(m.noStop) > 0.15)        push('היעדר סטופ (היסטורי)', Math.round(rate(m.noStop)*100)+'% מהעסקאות', 'red', -6);
      if (rate(m.revenge) > 0.10)       push('Revenge Trading (היסטורי)', Math.round(rate(m.revenge)*100)+'% מהעסקאות', 'red', -6);
      if (rate(m.holdingLosers) > 0.15) push('החזקת הפסדים (היסטורי)', Math.round(rate(m.holdingLosers)*100)+'% מהעסקאות', 'red', -5);
      if (rate(m.fomo) > 0.10)          push('FOMO (היסטורי)', Math.round(rate(m.fomo)*100)+'% מהעסקאות', 'gold', -3);
    }

    // ── Trading-plan adherence ──
    const planTrades = APP.trades.filter(t => t.followed_plan);
    if (planTrades.length >= LearningEngine.MIN_SAMPLE) {
      const planRate = Math.round(planTrades.filter(t => t.followed_plan === 'כן').length / planTrades.length * 100);
      if (planRate >= 70)      push('עמידה בתוכנית', planRate+'%', 'green', 5);
      else if (planRate < 50)  push('עמידה בתוכנית', planRate+'%', 'red', -5);
      else                     details.push({ label:'עמידה בתוכנית', val:planRate+'%', color:'muted', points:0 });
    } else {
      details.push({ label:'עמידה בתוכנית', val:'לא מספיק רישומי יומן', color:'muted', points:0 });
    }

    // ── This specific symbol's history ──
    if (hist.length >= LearningEngine.MIN_SAMPLE) {
      const wins = hist.filter(t => t.net > 0).length;
      const wr   = wins / hist.length;
      const gp   = hist.filter(t=>t.net>0).reduce((s,t)=>s+t.gross,0);
      const gl   = Math.abs(hist.filter(t=>t.net<0).reduce((s,t)=>s+t.gross,0));
      const pf   = gl > 0 ? gp/gl : (gp>0 ? 5 : 0);
      if (wr >= 0.7 && pf >= 2)        push('היסטוריה בסימבול זה', `WR ${Math.round(wr*100)}% | PF ${pf.toFixed(1)}`, 'green', 8);
      else if (wr < 0.4 || pf < 0.8)   push('היסטוריה בסימבול זה', `WR ${Math.round(wr*100)}% | PF ${pf.toFixed(1)}`, 'red', -8);
      else                             details.push({ label:'היסטוריה בסימבול זה', val:`WR ${Math.round(wr*100)}% | PF ${pf.toFixed(1)}`, color:'muted', points:0 });
    } else if (hist.length > 0) {
      details.push({ label:'היסטוריה בסימבול זה', val:`${hist.length} עסקאות — מדגם קטן מדי`, color:'muted', points:0 });
    } else {
      details.push({ label:'היסטוריה בסימבול זה', val:'מניה חדשה — אין נתונים', color:'muted', points:0 });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const confidence = (entry && stop && target && qty) ? 'High' : (entry && stop) ? 'Medium' : 'Low';
    return { insufficient:false, score, details, confidence };
  }

  // ════════════════════════════════════════════════════════════
  // SCORE 3 (20% weight) — News
  // ════════════════════════════════════════════════════════════

  function buildNewsScore(news) {
    if (!news) {
      return { insufficient:true, score:null, details:[], confidence:'Low',
                reason:'אין חיבור לחדשות בבק-אנד עדיין (פעולת getNews לא מוגדרת/נכשלה) — ראו AppScript_PATCH.gs.' };
    }
    let score = 50;
    const details = [];

    if (news.headlines && news.headlines.length) {
      const bull = news.headlines.filter(h => h.sentiment === 'bullish').length;
      const bear = news.headlines.filter(h => h.sentiment === 'bearish').length;
      const net  = bull - bear;
      const pts  = Math.max(-15, Math.min(15, net * 5));
      score += pts;
      details.push({ label:'סנטימנט חדשות (היוריסטי במילות מפתח, לא מנוע NLP מאומת)',
                      val:`${bull} חיובי / ${bear} שלילי / ${news.headlines.length - bull - bear} נייטרלי`,
                      color: net>0?'green':net<0?'red':'muted', points: pts });
    } else {
      details.push({ label:'חדשות אחרונות', val:'לא נמצאו כתבות', color:'muted', points:0 });
    }

    if (news.earnings && news.earnings.date) {
      const days = Math.round((new Date(news.earnings.date) - new Date()) / 86400000);
      if (days >= 0 && days <= 7) {
        score -= 5;
        details.push({ label:'דוח רווחים קרוב', val:`בעוד ${days} ימים — תנודתיות גבוהה צפויה`, color:'gold', points:-5 });
      } else {
        details.push({ label:'דוח רווחים הבא', val: news.earnings.date, color:'muted', points:0 });
      }
    } else {
      details.push({ label:'דוח רווחים', val:'לא זמין', color:'muted', points:0 });
    }

    if (news.insiderTx && news.insiderTx.length) {
      const buys  = news.insiderTx.filter(x => x.type === 'buy').length;
      const sells = news.insiderTx.filter(x => x.type === 'sell').length;
      const net   = buys - sells;
      const pts   = Math.max(-8, Math.min(8, net * 4));
      score += pts;
      details.push({ label:'עסקאות פנים (Insider)', val:`${buys} קניות / ${sells} מכירות`, color: net>0?'green':net<0?'red':'muted', points: pts });
    } else {
      details.push({ label:'עסקאות פנים (Insider)', val:'לא זמין', color:'muted', points:0 });
    }

    // Explicitly unavailable on the currently-integrated free data tier —
    // listed honestly rather than invented.
    details.push({ label:'ריבית שורט / Short Float', val:'לא זמין (דורש מקור מידע פרימיום)', color:'muted', points:0 });
    details.push({ label:'החזקות מוסדיות', val:'לא זמין (דורש מקור מידע פרימיום)', color:'muted', points:0 });
    details.push({ label:'דיווחי SEC', val: news.filings?.length ? `${news.filings.length} דיווחים אחרונים` : 'לא זמין', color:'muted', points:0 });

    score = Math.max(0, Math.min(100, Math.round(score)));
    const confidence = (news.headlines?.length || 0) >= 3 ? 'Medium' : 'Low'; // news is inherently a softer signal than hard numbers
    return { insufficient:false, score, details, confidence };
  }

  // ════════════════════════════════════════════════════════════
  // SCORE 4 (10% weight) — Personal historical performance (overall)
  // ════════════════════════════════════════════════════════════

  function buildPersonalHistoryScore(hist) {
    // Real, derived purely from this trader's own closed trades for this
    // exact symbol. Neutral (50) if there's no history — NOT a penalty,
    // since "no history" isn't itself bad, just unproven.
    if (hist.length < LearningEngine.MIN_SAMPLE) return { score: 50, n: hist.length };
    const wins = hist.filter(t => t.net > 0).length;
    const wr   = wins / hist.length;
    const gp   = hist.filter(t=>t.net>0).reduce((s,t)=>s+t.gross,0);
    const gl   = Math.abs(hist.filter(t=>t.net<0).reduce((s,t)=>s+t.gross,0));
    const pf   = gl > 0 ? gp/gl : (gp>0 ? 3 : 0);
    const score = Math.max(0, Math.min(100, Math.round(wr*100*0.6 + Math.min(pf,3)/3*100*0.4)));
    return { score, n: hist.length };
  }

  // ════════════════════════════════════════════════════════════
  // FINAL BLEND — 40% Technical / 30% Discipline / 20% News / 10% Personal
  // ════════════════════════════════════════════════════════════

  function blendFinal(technical, discipline, newsScore, personal) {
    // BUG FIX (production audit, round 2): the Technical Score is 40% of
    // the blend — the single largest component, and it's the one based
    // on the actual stock. Previously, when it was "insufficient" this
    // function silently renormalized weights across Discipline+News+
    // Personal and still produced a confident-looking Buy/Sell-style
    // label. That is exactly the misleading behavior the brief calls
    // out: "shows Insufficient market data but still gives a score and
    // recommendation." A Trade Discipline Score is NOT a substitute for
    // knowing anything about the stock — blending around a missing
    // Technical Score and calling the result "Strong Buy" implies market
    // analysis happened when it didn't. So: no real Technical Score →
    // no final Buy/Sell-style recommendation, full stop. The Discipline
    // Score is still shown on its own (see _renderResult/_scoreCard) —
    // it just isn't laundered into a fake stock recommendation.
    if (technical.insufficient) {
      return {
        insufficient: true,
        score: null,
        rec: null,
        confidence: 'Low',
        componentsUsed: [],
        reason: 'אין מספיק מידע טכני אמיתי על המניה — לא ניתן לייצר המלצת קנייה/מכירה. ' +
                 'ציון המשמעת שלך (Trade Discipline) עדיין מוצג בנפרד למעלה — הוא תקף תמיד, ' +
                 'כי הוא מבוסס על ההיסטוריה האמיתית שלך ולא על המניה.',
      };
    }

    const parts = [{ key:'technical', w:0.40, score:technical.score }];
    parts.push({ key:'discipline', w:0.30, score:discipline.score }); // always real & available
    if (!newsScore.insufficient) parts.push({ key:'news', w:0.20, score:newsScore.score });
    parts.push({ key:'personal', w:0.10, score:personal.score }); // always available (neutral 50 if no history)

    const totalW = parts.reduce((s,p) => s+p.w, 0);
    const blended = parts.reduce((s,p) => s + p.w*p.score, 0) / totalW;

    // Confidence reflects how many of the 4 intended components actually
    // had real data (never artificially inflated when data is missing).
    const completeness = parts.length / 4;
    let confidence = 'Low';
    if (completeness >= 1 && discipline.confidence !== 'Low')      confidence = 'High';
    else if (completeness >= 0.5)                                  confidence = 'Medium';

    return {
      insufficient: false,
      score: Math.round(blended),
      rec: finalRecommendation(blended),
      confidence,
      componentsUsed: parts.map(p => p.key),
      weightsRenormalized: totalW < 1,
    };
  }

  // ── Rendering ────────────────────────────────────────────

  function _scoreCard(title, sub, s) {
    if (s.insufficient) {
      return `
        <div class="de-score-card" style="min-width:200px;flex:1">
          <div style="font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px">${title}</div>
          <div style="margin-top:10px;padding:10px 12px;background:var(--red-dim);border:1px solid var(--red);border-radius:var(--r-md);font-size:13px;color:var(--red)">
            ⚠️ Insufficient market data
          </div>
          <div style="font-size:11px;color:var(--text-3);margin-top:8px;line-height:1.5">${s.reason || ''}</div>
          ${s.missing && s.missing.length ? `<div style="font-size:11px;color:var(--text-3);margin-top:6px">חסר: ${s.missing.join(', ')}</div>` : ''}
        </div>`;
    }
    const color = scoreColor(s.score);
    return `
      <div class="de-score-card" style="min-width:200px;flex:1">
        <div style="font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px">${title}</div>
        <div class="de-score" style="color:${color}">${s.score}</div>
        <div style="font-size:11px;color:var(--text-3)">${sub}</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:6px">ביטחון: <strong>${s.confidence}</strong></div>
        <div class="de-bar" style="margin-top:10px"><div class="de-bar-fill" style="width:${s.score}%;background:${color}"></div></div>
      </div>`;
  }

  function _detailRows(details) {
    if (!details || !details.length) return '<div style="color:var(--text-3);font-size:12px">אין נתונים</div>';
    return details.map(d => `
      <div class="de-row">
        <span>${d.label}</span>
        <span class="${d.color}">${d.val}${d.points ? ` (${d.points>0?'+':''}${d.points})` : ''}</span>
      </div>`).join('');
  }

  function _aiSummary(sym, ctx) {
    // Deterministic, template-based narrative built ONLY from real
    // computed factors above — no second model call, no invented facts.
    const lines = [];
    const { technical, newsScore, ind } = ctx;

    if (!technical.insufficient && ind) {
      if (ind.ema20 && ind.ema50 && ind.ema200) {
        const p = ind.price || ctx.livePrice;
        if (p > ind.ema20 && ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200)
          lines.push(`${sym} נסחרת מעל EMA 20/50/200 — מגמה שורית מלאה.`);
      }
      if (ind.volume && ind.avgVolume) {
        const ratio = ind.volume / ind.avgVolume;
        if (ratio > 1.5) lines.push(`נפח יחסי גבוה — ${ratio.toFixed(1)}x מהממוצע.`);
      }
      if (ind.rsi != null && ind.rsi > 65) lines.push(`RSI נמצא ב-${ind.rsi.toFixed(0)}, מתקרב לאזור קניית יתר.`);
      if (ind.rsi != null && ind.rsi < 35) lines.push(`RSI נמצא ב-${ind.rsi.toFixed(0)}, אזור מכירת יתר.`);
    } else {
      lines.push(`לא ניתן לנתח את ${sym} טכנית — נתוני שוק חסרים.`);
    }

    if (!newsScore.insufficient) {
      const bull = ctx.news?.headlines?.filter(h=>h.sentiment==='bullish').length || 0;
      const bear = ctx.news?.headlines?.filter(h=>h.sentiment==='bearish').length || 0;
      if (bull || bear) lines.push(`סנטימנט חדשות: ${bull} כתבות חיוביות, ${bear} שליליות.`);
    }

    const symNarrative = LearningEngine.narrativeForSymbol(sym);
    if (symNarrative) lines.push(symNarrative);

    if (!lines.length) lines.push('אין מספיק מידע אמיתי כדי לייצר סיכום — מומלץ להמתין לנתונים נוספים.');
    return lines.join(' ');
  }

  function _renderResult(sym, ctx) {
    const { technical, discipline, final, useEntry, stop, target } = ctx;
    const rr = (useEntry && stop && target && useEntry > stop)
      ? ((target-useEntry)/(useEntry-stop)).toFixed(2) : '—';

    const finalCard = final.insufficient ? `
          <div class="de-score-card" style="min-width:220px;flex:1.3;border-color:var(--red)">
            <div style="font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px">${sym} — המלצה סופית</div>
            <div style="margin-top:10px;padding:10px 12px;background:var(--red-dim);border:1px solid var(--red);border-radius:var(--r-md);font-size:14px;font-weight:700;color:var(--red)">
              ⚠️ Insufficient market data
            </div>
            <div style="font-size:12px;color:var(--text-3);margin-top:8px;line-height:1.5">${final.reason}</div>
          </div>` : `
          <div class="de-score-card" style="min-width:220px;flex:1.3;border-color:${final.rec.color}">
            <div style="font-size:11px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px">${sym} — המלצה סופית</div>
            <div class="de-score" style="color:${final.rec.color}">${final.score}</div>
            <div class="de-pill" style="background:${final.rec.color}22;color:${final.rec.color};margin-bottom:6px">${final.rec.labelHE}</div>
            <div style="font-size:12px;color:var(--text-3)">ביטחון כולל: <strong>${final.confidence}</strong></div>
            <div style="font-size:11px;color:var(--text-3);margin-top:6px">
              משוקלל מ: ${final.componentsUsed.map(k => ({technical:'טכני 40%',discipline:'דיסציפלינה 30%',news:'חדשות 20%',personal:'היסטוריה אישית 10%'}[k])).join(' · ')}
              ${final.weightsRenormalized ? ' (משקלים אוזנו מחדש בשל נתונים חסרים)' : ''}
            </div>
          </div>`;

    return `
      <div class="card" style="margin-top:16px">
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-bottom:14px">
          ${finalCard}
          <div style="flex:2;min-width:220px">
            <div class="card-title">🤖 סיכום AI (מבוסס נתונים אמיתיים בלבד)</div>
            <div style="font-size:13px;line-height:1.7;color:var(--text-2)">${_aiSummary(sym, ctx)}</div>
          </div>
        </div>

        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px">
          ${_scoreCard('📊 Market Technical Score', 'מבוסס על המניה בלבד — נתונים אמיתיים', technical)}
          ${_scoreCard('🧠 Trade Discipline Score', 'מבוסס עליך — היסטוריית מסחר אמיתית', discipline)}
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:14px">
          <div>
            <div class="card-title">פירוט Technical</div>
            ${_detailRows(technical.details)}
          </div>
          <div>
            <div class="card-title">פירוט Discipline</div>
            ${_detailRows(discipline.details)}
          </div>
        </div>

        ${_renderNewsPanel(ctx)}

        ${useEntry ? `
          <div style="margin-top:14px">
            <div class="card-title">פרמטרי עסקה</div>
            <div class="de-row"><span>כניסה</span><span>$${useEntry}</span></div>
            ${stop   ? `<div class="de-row"><span>סטופ</span><span class="red">$${stop}</span></div>` : ''}
            ${target ? `<div class="de-row"><span>יעד</span><span class="green">$${target}</span></div>` : ''}
            ${rr!=='—' ? `<div class="de-row"><span style="font-weight:700">R:R</span><span style="font-weight:700">1:${rr}</span></div>` : ''}
          </div>` : ''}

        <div style="font-size:11px;color:var(--text-3);margin-top:14px;line-height:1.5">
          ⚠️ הדירוג הוא כלי ניתוח בלבד ואינו המלצת השקעה. ציון "Insufficient market data" אומר בדיוק את זה —
          אין מספיק מידע אמיתי כדי לנתח, והמערכת לא מנחשת.
        </div>
      </div>
    `;
  }

  function _renderNewsPanel(ctx) {
    const { newsScore, news } = ctx;
    if (newsScore.insufficient) {
      return `
        <div class="card" style="margin:0 0 14px;border-color:var(--gold)">
          <div class="card-title">📰 News Analysis</div>
          <div style="font-size:12px;color:var(--text-3)">${newsScore.reason}</div>
        </div>`;
    }
    const headlines = (news.headlines || []).slice(0,5).map(h => `
      <div class="de-row">
        <span style="max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${h.url ? `<a href="${h.url}" target="_blank" rel="noopener" style="color:inherit">${h.title}</a>` : h.title}
        </span>
        <span class="${h.sentiment==='bullish'?'green':h.sentiment==='bearish'?'red':'muted'}">${h.sentiment || 'neutral'}</span>
      </div>`).join('');
    return `
      <div class="card" style="margin:0 0 14px">
        <div class="card-title">📰 News Analysis — ציון ${newsScore.score} (ביטחון: ${newsScore.confidence})</div>
        ${headlines || '<div style="color:var(--text-3);font-size:12px">אין כתבות אחרונות</div>'}
        <div style="margin-top:8px">${_detailRows(newsScore.details.slice(1))}</div>
      </div>`;
  }

  // ── Trade Memory + Personal Learning Engine ───────────────

  function _renderTradeMemory(sym, hist) {
    if (!hist.length) {
      return `
        <div class="memory-card" style="border-color:var(--border)">
          <div class="memory-title">🧠 Personal Learning Engine — ${sym}</div>
          <div style="font-size:12px;color:var(--text-3)">אין עסקאות היסטוריות ב-${sym}. אין מה ללמוד ממנו עדיין.</div>
        </div>`;
    }
    const wins   = hist.filter(t => t.net > 0);
    const losses = hist.filter(t => t.net < 0);
    const totalNet = hist.reduce((s,t) => s+t.net, 0);
    const wr       = Math.round(wins.length / hist.length * 100);
    const avgNet   = totalNet / hist.length;
    const avgHold  = hist.reduce((s,t) => s+(t.hold_days||0), 0) / hist.length;
    const bestTrade= hist.reduce((m,t) => t.net>m.net?t:m, hist[0]);
    const worstTrd = hist.reduce((m,t) => t.net<m.net?t:m, hist[0]);
    const gp = wins.reduce((s,t) => s+t.gross, 0);
    const gl = Math.abs(losses.reduce((s,t) => s+t.gross, 0));
    const pf = gl > 0 ? (gp/gl).toFixed(2) : wins.length ? '∞' : '0';
    const lastTrade = hist[hist.length-1];

    const sampleNote = hist.length < LearningEngine.MIN_SAMPLE
      ? `<div style="margin-top:10px;padding:8px 12px;background:var(--gold-dim);border-radius:var(--r-sm);font-size:12px;color:var(--gold)">⚠️ רק ${hist.length} עסקאות — מדגם קטן מכדי להסיק מסקנות חזקות</div>`
      : '';

    return `
      <div class="memory-card">
        <div class="memory-title">🧠 Personal Learning Engine — ${sym} (${hist.length} עסקאות היסטוריות)</div>

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

        ${sampleNote}
        ${wr < 50 ? `<div style="margin-top:10px;padding:8px 12px;background:var(--red-dim);border-radius:var(--r-sm);font-size:12px;color:var(--red)">⚠️ Win Rate ב-${sym} מתחת ל-50% — שקול מחדש</div>` :
          wr >= 70 ? `<div style="margin-top:10px;padding:8px 12px;background:var(--green-dim);border-radius:var(--r-sm);font-size:12px;color:var(--green)">✓ ביצועים היסטוריים מצוינים ב-${sym}</div>` : ''}
      </div>
    `;
  }

  // ── Loading / Starter ─────────────────────────────────────

  function _loadingCard() {
    return `
      <div class="card" style="margin-top:16px;text-align:center;padding:40px">
        <div class="spinner" style="margin:0 auto 12px"></div>
        <div style="color:var(--text-3)">טוען נתונים אמיתיים (אינדיקטורים, חדשות, מחיר)...</div>
      </div>
    `;
  }

  function renderStarter() {
    const result = document.getElementById('decision-result');
    const memory = document.getElementById('trade-memory');
    if (result && !result.innerHTML.trim()) {
      result.innerHTML = `
        <div class="card" style="text-align:center;padding:30px;color:var(--text-3)">
          <div style="font-size:32px;margin-bottom:10px">🎯</div>
          <div style="font-size:14px">הזן סימבול למעלה ולחץ "נתח מניה"</div>
          <div style="font-size:12px;margin-top:6px">שני ציונים עצמאיים: Market Technical (המניה) ו-Trade Discipline (אתה) + חדשות + AI Summary</div>
        </div>
      `;
    }
    if (memory) memory.innerHTML = '';
  }

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

  return {
    run, analyzeSymbol,
    buildTechnicalScore, buildDisciplineScore, buildNewsScore, buildPersonalHistoryScore, blendFinal,
    renderStarter, fillFromWatchlist,
  };
})();
