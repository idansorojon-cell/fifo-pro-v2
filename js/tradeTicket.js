/**
 * FIFO PRO 2.0 — tradeTicket.js
 * The unified Trade Ticket: ONE slide-over replacing the three separate
 * v1 entry points (header Add-Trade modal, Positions "פוזיציה חדשה"
 * modal, and the Quick Trade screen).
 *
 * Three intents:
 *   open   — פתיחת פוזיציה: BUY row via API.appendOperation (the exact
 *            write New Position/Quick-Trade-Buy already used), plus
 *            optional target/stop/thesis via API.upsertPositionMeta
 *            (the annotation overlay, matched by symbol).
 *   close  — סגירת פוזיציה: SELL row via API.appendOperation (FIFO
 *            matches lots server-side; the server rejects a SELL larger
 *            than the real open quantity). Journal fields are captured
 *            IN THE SAME FLOW and attached post-reload via
 *            API.upsertTradeMeta to every trade derived from this exit.
 *   record — רישום עסקה היסטורית: matched BUY+SELL pair via
 *            API.addTradeOperation (the existing Add-Trade write).
 *
 * No new endpoints, no changed calculations — this is a UX layer over
 * the already-verified write paths. Position sizing + R:R live in the
 * same flow (same formulas Quick Trade's sizer used).
 */

const TradeTicket = (() => {
  const { f$, fpct, fprice, TAX } = Utils;

  let intent = 'open';
  let priceTimer = null;

  // ── Open / close the slide-over ───────────────────────────
  function open(opts = {}) {
    intent = opts.intent || 'open';
    _renderBody(opts);
    document.getElementById('ticket-scrim')?.classList.add('open');
    const t = document.getElementById('trade-ticket');
    if (t) { t.classList.add('open'); t.setAttribute('aria-hidden', 'false'); }
    setTimeout(() => document.getElementById('tk-symbol')?.focus(), 250);
  }

  function close() {
    document.getElementById('ticket-scrim')?.classList.remove('open');
    const t = document.getElementById('trade-ticket');
    if (t) { t.classList.remove('open'); t.setAttribute('aria-hidden', 'true'); }
  }

  function setIntent(i) {
    // Preserve the symbol across intent switches — no re-typing.
    const sym = document.getElementById('tk-symbol')?.value || '';
    intent = i;
    _renderBody({ symbol: sym });
  }

  // ── Body ──────────────────────────────────────────────────
  function _renderBody(opts = {}) {
    const el = document.getElementById('ticket-body');
    if (!el) return;
    const today = new Date().toISOString().split('T')[0];
    const sym = (opts.symbol || '').toUpperCase();

    const intentRow = `
      <div class="intent-row">
        <button class="intent-opt ${intent==='open'  ?'active':''}" onclick="TradeTicket.setIntent('open')">פתיחת פוזיציה</button>
        <button class="intent-opt ${intent==='close' ?'active':''}" onclick="TradeTicket.setIntent('close')">סגירת פוזיציה</button>
        <button class="intent-opt ${intent==='record'?'active':''}" onclick="TradeTicket.setIntent('record')">רישום עסקה</button>
      </div>`;

    if (intent === 'open') {
      el.innerHTML = `
        ${intentRow}
        <div class="tk-field"><label>סימבול</label>
          <div class="tk-sym-row">
            <input id="tk-symbol" value="${sym}" placeholder="AAPL" style="text-transform:uppercase" oninput="TradeTicket.fetchPrice()">
            <span id="tk-live" class="tk-live num">—</span>
          </div>
        </div>
        <div class="tk-grid-2">
          <div class="tk-field"><label>תאריך</label><input id="tk-date" type="date" value="${today}"></div>
          <div class="tk-field"><label>מחיר כניסה ($)</label><input id="tk-price" type="number" step="0.01" value="${opts.entry||''}" oninput="TradeTicket.recalc()"></div>
        </div>
        <div class="calc-block">
          <div class="calc-title">Sizing + R:R — מחושב חי</div>
          <div class="tk-grid-3">
            <div class="tk-field"><label>גודל תיק מוגדר ($) <span class="lbl-hint" title="ברירת המחדל מגיעה מהגדרות → גודל תיק מוגדר">מההגדרות</span></label><input id="tk-portfolio" type="number" value="${Settings.get('portfolioSize')}" oninput="TradeTicket.recalc()"></div>
            <div class="tk-field"><label>% סיכון</label><input id="tk-risk" type="number" step="0.1" value="${Settings.get('riskPct')||1}" oninput="TradeTicket.recalc()"></div>
            <div class="tk-field"><label>סטופ ($)</label><input id="tk-stop" type="number" step="0.01" value="${opts.stop||''}" oninput="TradeTicket.recalc()"></div>
          </div>
          <div class="tk-field"><label>יעד ($) — אופציונלי</label><input id="tk-target" type="number" step="0.01" value="${opts.target||''}" oninput="TradeTicket.recalc()"></div>
          <div id="tk-calc-out" class="tk-calc-out">הזן מחיר וסטופ לחישוב כמות מומלצת ו-R:R</div>
        </div>
        <div class="tk-field"><label>כמות</label><input id="tk-qty" type="number" value="${opts.qty||''}" oninput="TradeTicket.recalc()"></div>
        <div class="tk-field"><label>תזת הכניסה — למה? (מוצג על כרטיס הפוזיציה)</label><textarea id="tk-thesis" rows="2" placeholder="למשל: פריצת התנגדות בנפח גבוה אחרי דוח"></textarea></div>
        <div id="tk-preview" class="tk-preview" style="display:none"></div>
        <button class="btn btn-primary tk-submit" onclick="TradeTicket.submit()">פתח פוזיציה — נכתב כ-BUY ביומן הפעולות</button>
        <button class="tk-de-link" onclick="TradeTicket.toResearch()">${icon('search')} בדוק קודם במנוע ההחלטות (Research) — הנתונים יועברו</button>
      `;
    } else if (intent === 'close') {
      const opts_ = (APP.positions || []).map(p =>
        `<option value="${p.symbol}" ${p.symbol===sym?'selected':''}>${p.symbol} — ${p.qty} יח' @ ${fprice(p.avg_price)}</option>`).join('');
      el.innerHTML = `
        ${intentRow}
        ${(APP.positions || []).length ? `
        <div class="tk-field"><label>פוזיציה לסגירה</label>
          <select id="tk-symbol" onchange="TradeTicket.syncCloseQty(); TradeTicket.fetchPrice()">${opts_}</select>
        </div>
        <div class="tk-grid-3">
          <div class="tk-field"><label>תאריך מכירה</label><input id="tk-date" type="date" value="${today}"></div>
          <div class="tk-field"><label>כמות</label><input id="tk-qty" type="number" oninput="TradeTicket.recalc()"></div>
          <div class="tk-field"><label>מחיר מכירה ($) <span id="tk-live" class="tk-live num"></span></label><input id="tk-price" type="number" step="0.01" oninput="TradeTicket.recalc()"></div>
        </div>
        <div id="tk-preview" class="tk-preview" style="display:none"></div>
        <div class="calc-block">
          <div class="calc-title">${icon('book')} יומן — באותה זרימה, לא מסך נפרד</div>
          <div class="tk-grid-2">
            <div class="tk-field"><label>סיבת יציאה</label><input id="tk-j-exit" placeholder="למה יצאת?"></div>
            <div class="tk-field"><label>כיבדתי סטופ?</label>
              <select id="tk-j-stop"><option value="">---</option><option value="כן">כן</option><option value="לא">לא</option><option value="לא היה סטופ">לא היה סטופ</option></select>
            </div>
            <div class="tk-field"><label>פעלתי לפי תוכנית?</label>
              <select id="tk-j-plan"><option value="">---</option><option value="כן">כן</option><option value="לא">לא</option><option value="חלקית">חלקית</option></select>
            </div>
            <div class="tk-field"><label>לקח</label><input id="tk-j-lesson" placeholder="מה למדת?"></div>
          </div>
        </div>
        <button class="btn btn-primary tk-submit" onclick="TradeTicket.submit()">סגור פוזיציה — נכתב כ-SELL ביומן הפעולות</button>
        ` : `<div class="tk-empty">אין פוזיציות פתוחות לסגירה.</div>`}
      `;
      syncCloseQty();
      fetchPrice();
    } else {
      el.innerHTML = `
        ${intentRow}
        <div class="tk-field"><label>סימבול</label><input id="tk-symbol" value="${sym}" placeholder="AAPL" style="text-transform:uppercase"></div>
        <div class="tk-grid-2">
          <div class="tk-field"><label>תאריך קנייה</label><input id="tk-buy-date" type="date"></div>
          <div class="tk-field"><label>תאריך מכירה</label><input id="tk-date" type="date" value="${today}"></div>
        </div>
        <div class="tk-grid-3">
          <div class="tk-field"><label>כמות</label><input id="tk-qty" type="number" oninput="TradeTicket.recalc()"></div>
          <div class="tk-field"><label>מחיר קנייה ($)</label><input id="tk-buy-price" type="number" step="0.01" oninput="TradeTicket.recalc()"></div>
          <div class="tk-field"><label>מחיר מכירה ($)</label><input id="tk-price" type="number" step="0.01" oninput="TradeTicket.recalc()"></div>
        </div>
        <div class="tk-field"><label>הערה — אופציונלי</label><input id="tk-notes" placeholder="..."></div>
        <div id="tk-preview" class="tk-preview" style="display:none"></div>
        <button class="btn btn-primary tk-submit" onclick="TradeTicket.submit()">רשום עסקה — נכתב כזוג BUY+SELL ביומן הפעולות</button>
      `;
    }
  }

  // ── Live price lookup (same debounce pattern as Quick Trade) ──
  function fetchPrice() {
    const symEl = document.getElementById('tk-symbol');
    const sym = (symEl?.value || '').trim().toUpperCase();
    const liveEl = document.getElementById('tk-live');
    if (!sym || !liveEl) return;
    clearTimeout(priceTimer);
    liveEl.textContent = '…';
    priceTimer = setTimeout(async () => {
      const d = await API.fetchPrice(sym);
      if (d?.price) {
        liveEl.textContent = fprice(d.price);
        liveEl.style.color = 'var(--signal)';
        const priceEl = document.getElementById('tk-price');
        if (priceEl && !priceEl.value) { priceEl.value = d.price.toFixed(2); recalc(); }
      } else {
        liveEl.textContent = 'לא נמצא';
        liveEl.style.color = 'var(--alarm)';
      }
    }, 600);
  }

  function syncCloseQty() {
    const sym = document.getElementById('tk-symbol')?.value;
    const p = (APP.positions || []).find(x => x.symbol === sym);
    const qtyEl = document.getElementById('tk-qty');
    if (p && qtyEl) qtyEl.value = p.qty;
    recalc();
  }

  // ── Live calc: sizer + R:R + tax-true preview ─────────────
  function recalc() {
    const out = document.getElementById('tk-calc-out');
    const price = +document.getElementById('tk-price')?.value || 0;
    const qty   = +document.getElementById('tk-qty')?.value || 0;

    if (intent === 'open' && out) {
      const portfolio = +document.getElementById('tk-portfolio')?.value || 0;
      const riskPct   = +document.getElementById('tk-risk')?.value || 0;
      const stop      = +document.getElementById('tk-stop')?.value || 0;
      const target    = +document.getElementById('tk-target')?.value || 0;
      if (price && stop && price > stop && portfolio && riskPct) {
        const maxRisk   = portfolio * riskPct / 100;
        const perShare  = price - stop;
        const suggested = Math.floor(maxRisk / perShare);
        const rr = target && target > price ? ((target - price) / perShare) : null;
        out.innerHTML = `
          <div class="tk-calc-row"><span>כמות מומלצת (סיכון ${riskPct}%)</span><b class="num">${suggested.toLocaleString()}</b></div>
          <div class="tk-calc-row"><span>סיכון למניה / כולל</span><b class="num">$${perShare.toFixed(2)} / ${f$(Math.round(maxRisk))}</b></div>
          ${rr !== null ? `<div class="tk-calc-row"><span>יחס R:R</span><b class="num" style="color:${rr>=2?'var(--signal)':rr>=1?'var(--amber)':'var(--alarm)'}">1:${rr.toFixed(2)}</b></div>` : `<div class="tk-calc-row"><span>יחס R:R</span><span style="color:var(--text-3)">הזן יעד לחישוב</span></div>`}
          <button class="btn btn-ghost btn-xs" style="margin-top:6px" onclick="document.getElementById('tk-qty').value=${suggested};TradeTicket.recalc()">השתמש בכמות המומלצת</button>`;
      } else {
        out.textContent = 'הזן מחיר וסטופ לחישוב כמות מומלצת ו-R:R';
      }
    }

    const prev = document.getElementById('tk-preview');
    if (!prev) return;
    if (intent === 'open' && qty && price) {
      prev.style.display = 'block';
      prev.innerHTML = `עלות כוללת: <b class="num">${f$(Math.round(qty*price))}</b> · ${qty.toLocaleString()} יח' × ${fprice(price)}`;
    } else if (intent === 'close' && qty && price) {
      const sym = document.getElementById('tk-symbol')?.value;
      const p = (APP.positions || []).find(x => x.symbol === sym);
      if (p) {
        const gross = +(qty * (price - p.avg_price)).toFixed(2);
        const tax   = +(gross * TAX).toFixed(2);
        const net   = +(gross - tax).toFixed(2);
        prev.style.display = 'block';
        prev.innerHTML = `ברוטו: <b class="num">${f$(gross)}</b> · מס 25%: <b class="num">${f$(tax)}</b> · <b class="num" style="color:${net>=0?'var(--signal)':'var(--alarm)'}">נטו: ${f$(net)}</b> <span style="color:var(--text-3)">(מבוסס מחיר כניסה ממוצע — FIFO הסופי מחושב בשרת)</span>`;
      }
    } else if (intent === 'record') {
      const bp = +document.getElementById('tk-buy-price')?.value || 0;
      if (qty && price && bp) {
        const gross = +(qty * (price - bp)).toFixed(2);
        const tax   = +(gross * TAX).toFixed(2);
        const net   = +(gross - tax).toFixed(2);
        prev.style.display = 'block';
        prev.innerHTML = `ברוטו: <b class="num">${f$(gross)}</b> · מס 25%: <b class="num">${f$(tax)}</b> · <b class="num" style="color:${net>=0?'var(--signal)':'var(--alarm)'}">נטו: ${f$(net)} (${fpct((price-bp)/bp*100)})</b>`;
      } else prev.style.display = 'none';
    } else {
      prev.style.display = 'none';
    }
  }

  // Hand off to Research (Decision Engine) with the data already typed —
  // no re-entering the same symbol/entry/stop across screens.
  function toResearch() {
    const sym    = (document.getElementById('tk-symbol')?.value || '').trim().toUpperCase();
    const entry  = document.getElementById('tk-price')?.value || '';
    const stop   = document.getElementById('tk-stop')?.value || '';
    const target = document.getElementById('tk-target')?.value || '';
    const qty    = document.getElementById('tk-qty')?.value || '';
    close();
    navigate('research');
    setTimeout(() => {
      const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
      set('de-symbol', sym); set('de-entry', entry); set('de-stop', stop);
      set('de-target', target); set('de-qty', qty);
      if (sym && typeof DecisionEngine !== 'undefined') DecisionEngine.run();
    }, 80);
  }

  // ── Submit ────────────────────────────────────────────────
  async function submit() {
    if (intent === 'open')   return _submitOpen();
    if (intent === 'close')  return _submitClose();
    return _submitRecord();
  }

  async function _submitOpen() {
    const sym    = (document.getElementById('tk-symbol')?.value || '').trim().toUpperCase();
    const date   = document.getElementById('tk-date')?.value;
    const qty    = +document.getElementById('tk-qty')?.value;
    const price  = +document.getElementById('tk-price')?.value;
    const stop   = +document.getElementById('tk-stop')?.value || 0;
    const target = +document.getElementById('tk-target')?.value || 0;
    const thesis = (document.getElementById('tk-thesis')?.value || '').trim();
    if (!sym || !date || !qty || !price) { alert('נא למלא סימבול, תאריך, כמות ומחיר'); return; }

    close();
    API.setStatus('פותח פוזיציה — נכתב כ-BUY ביומן הפעולות...', 'info');
    API.showSpinner(true);
    const res = await API.appendOperation({ date, symbol: sym, action: 'BUY', qty, price, notes: '' });
    if (!res.ok) { API.showSpinner(false); API.setStatus('❌ ' + (res.error || 'שגיאה'), 'error'); return; }

    const loaded = await load();
    if (loaded && (stop || target || thesis)) {
      const metaRes = await API.upsertPositionMeta({ symbol: sym, target, stop_loss: stop, notes: thesis });
      if (metaRes.ok) await load();
    }
    API.showSpinner(false);
    if (!loaded) { API.setStatus('⚠️ הפעולה נכתבה, אך הרענון נכשל — רענן ידנית לוודא', 'warn'); return; }
    invalidateStats();
    API.setStatus('✓ פוזיציה נפתחה', 'ok');
    renderAll();
    if (APP.currentDest === 'positions') Positions.render();
  }

  async function _submitClose() {
    const sym   = document.getElementById('tk-symbol')?.value;
    const date  = document.getElementById('tk-date')?.value;
    const qty   = +document.getElementById('tk-qty')?.value;
    const price = +document.getElementById('tk-price')?.value;
    if (!sym || !date || !qty || !price) { alert('נא למלא תאריך, כמות ומחיר'); return; }

    const j = {
      exit_reason:    (document.getElementById('tk-j-exit')?.value || '').trim(),
      respected_stop: document.getElementById('tk-j-stop')?.value || '',
      followed_plan:  document.getElementById('tk-j-plan')?.value || '',
      lesson:         (document.getElementById('tk-j-lesson')?.value || '').trim(),
    };
    const hasJournal = Object.values(j).some(v => v);

    close();
    API.setStatus('סוגר פוזיציה — נכתב כ-SELL ביומן הפעולות...', 'info');
    API.showSpinner(true);
    const res = await API.appendOperation({ date, symbol: sym, action: 'SELL', qty, price, notes: '' });
    if (!res.ok) { API.showSpinner(false); API.setStatus('❌ ' + (res.error || 'שגיאה'), 'error'); return; }

    const loaded = await load();
    if (loaded && hasJournal) {
      // Attach the journal to every trade derived from THIS exit (one
      // SELL can consume several FIFO lots → several derived trades).
      // Matched exactly the way the server merges journal meta: full
      // trade objects through the same upsertTradeMeta endpoint.
      const sellISO = date;
      const targets = APP.trades.filter(t =>
        t.symbol === sym &&
        Utils.ddToISO(t.sell_date) === sellISO &&
        Math.abs(t.sell_price - price) < 0.005
      );
      for (const t of targets) {
        await API.upsertTradeMeta({ ...t, ...j });
      }
      if (targets.length) await load();
    }
    API.showSpinner(false);
    if (!loaded) { API.setStatus('⚠️ הפעולה נכתבה, אך הרענון נכשל — רענן ידנית לוודא', 'warn'); return; }
    invalidateStats();
    API.setStatus('✓ הפוזיציה נסגרה' + (hasJournal ? ' + יומן נשמר' : ''), 'ok');
    renderAll();
    if (APP.currentDest === 'positions') Positions.render();
    if (APP.currentDest === 'trades') Trades.render();
  }

  async function _submitRecord() {
    const sym = (document.getElementById('tk-symbol')?.value || '').trim().toUpperCase();
    const bd  = document.getElementById('tk-buy-date')?.value;
    const sd  = document.getElementById('tk-date')?.value;
    const qty = +document.getElementById('tk-qty')?.value;
    const bp  = +document.getElementById('tk-buy-price')?.value;
    const sp  = +document.getElementById('tk-price')?.value;
    const notes = (document.getElementById('tk-notes')?.value || '').trim();
    if (!sym || !bd || !sd || !qty || !bp || !sp) { alert('נא למלא: סימבול, תאריכים, כמות ומחירים'); return; }

    close();
    API.setStatus('רושם עסקה — נכתב כזוג BUY+SELL ביומן הפעולות...', 'info');
    API.showSpinner(true);
    const res = await API.addTradeOperation({ symbol: sym, buy_date: bd, sell_date: sd, qty, buy_price: bp, sell_price: sp, notes });
    API.showSpinner(false);
    if (!res.ok) { API.setStatus('❌ ' + (res.error || 'שגיאה'), 'error'); return; }
    const loaded = await load();
    if (!loaded) { API.setStatus('⚠️ העסקה נכתבה, אך הרענון נכשל — רענן ידנית לוודא', 'warn'); return; }
    invalidateStats();
    API.setStatus('✓ עסקה נרשמה', 'ok');
    renderAll();
    if (APP.currentDest === 'trades') Trades.render();
  }

  return { open, close, setIntent, fetchPrice, recalc, submit, syncCloseQty, toResearch };
})();
