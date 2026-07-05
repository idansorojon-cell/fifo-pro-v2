/**
 * FIFO PRO — quicktrade.js
 * Quick trade form + Position Sizer
 * Depends on: utils.js, api.js, app.js
 */

const QuickTrade = (() => {
  const { f$, fpct, TAX, parseDD, isoToDD } = Utils;
  let priceTimer = null;

  function fetchPrice() {
    const sym = (document.getElementById('qt-symbol')?.value || '').trim().toUpperCase();
    if (!sym) return;
    clearTimeout(priceTimer);
    document.getElementById('qt-live-price').textContent = '...';
    priceTimer = setTimeout(async () => {
      const d = await API.fetchPrice(sym);
      if (d?.price) {
        document.getElementById('qt-live-price').textContent = '$' + d.price.toFixed(2);
        document.getElementById('qt-live-price').style.color = d.changePct >= 0 ? 'var(--green)' : 'var(--red)';
        const priceEl = document.getElementById('qt-price');
        if (!priceEl.value) priceEl.value = d.price.toFixed(2);
        calc();
      } else {
        document.getElementById('qt-live-price').textContent = 'לא נמצא';
        document.getElementById('qt-live-price').style.color = 'var(--red)';
      }
    }, 600);
  }

  function calc() {
    const price     = +document.getElementById('qt-price')?.value || 0;
    const buyPrice  = +document.getElementById('qt-buy-price')?.value || 0;
    const qty       = +document.getElementById('qt-qty')?.value || 0;
    const action    = document.getElementById('qt-action')?.value;
    const portfolio = +document.getElementById('qt-portfolio')?.value || Settings.get('portfolioSize');
    const riskPct   = +document.getElementById('qt-risk-pct')?.value || Settings.get('riskPct');
    const stopPrice = +document.getElementById('qt-stop-price')?.value || 0;

    // Position Sizer
    const sizerEl = document.getElementById('qt-sizer-result');
    if (sizerEl && price && stopPrice && price > stopPrice) {
      const maxRisk    = portfolio * riskPct / 100;
      const riskPerSh  = price - stopPrice;
      const suggestedQ = Math.floor(maxRisk / riskPerSh);
      const cost       = suggestedQ * price;
      const rr         = ((price * 1.1 - price) / riskPerSh).toFixed(2);
      sizerEl.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div><div style="font-size:11px;color:var(--text-3)">כמות מומלצת</div><div style="font-weight:700;color:var(--blue);font-size:16px">${suggestedQ.toLocaleString()}</div></div>
          <div><div style="font-size:11px;color:var(--text-3)">עלות</div><div style="font-weight:700">${f$(Math.round(cost))}</div></div>
          <div><div style="font-size:11px;color:var(--text-3)">סיכון מקסימלי</div><div style="font-weight:700;color:var(--red)">${f$(Math.round(maxRisk))} (${riskPct}%)</div></div>
        </div>
        <div style="margin-top:6px;font-size:12px;color:var(--text-3)">סיכון למניה: $${riskPerSh.toFixed(2)} | R:R (10% target): 1:${rr}</div>
        <button class="btn btn-ghost btn-xs" style="margin-top:8px" onclick="document.getElementById('qt-qty').value=${suggestedQ};QuickTrade.calc()">השתמש בכמות זו</button>
      `;
    } else if (sizerEl) {
      sizerEl.textContent = 'הזן מחיר וסטופ לחישוב כמות מומלצת';
    }

    // Preview
    const preview = document.getElementById('qt-preview');
    if (!preview) return;
    if (action === 'sell' && qty && price && buyPrice) {
      const cost  = +(qty * buyPrice).toFixed(2);
      const gross = +(qty * (price - buyPrice)).toFixed(2);
      const tax   = +(gross * TAX).toFixed(2);
      const net   = +(gross - tax).toFixed(2);
      const pct   = +((price - buyPrice) / buyPrice * 100).toFixed(2);
      preview.style.display = 'block';
      preview.innerHTML = `עלות: ${f$(cost)} | ברוטו: ${f$(gross)} | מס: ${f$(tax)} | <strong class="${net>=0?'green':'red'}">נטו: ${f$(net)} (${fpct(pct)})</strong>`;
    } else if (action === 'buy' && qty && price) {
      preview.style.display = 'block';
      preview.innerHTML = `עלות כוללת: <strong>${f$(Math.round(qty*price))}</strong> | ${qty.toLocaleString()} מניות × $${price}`;
    } else {
      preview.style.display = 'none';
    }
  }

  // WRITE-THROUGH (create-only): both branches append a real op to
  // "פעולות" via API.appendOperation — the "buy" branch a BUY row (the
  // exact same write New Position uses), the "sell" branch a SELL row,
  // which applyFIFO_ matches against whatever open lots already exist for
  // this symbol server-side — no need to know/send the original buy price
  // or date here, "פעולות" already has that. Neither branch writes to the
  // legacy Trades/Positions sheets. After each write, the full APP state
  // is reloaded from a real getOperations call (never an optimistic local
  // insert) before reporting success. The calculator/preview above
  // (calc()) is unaffected — it never persisted anything. See
  // docs/TECHNICAL_DEBT.md "Persistence architecture".
  async function submit() {
    const sym       = (document.getElementById('qt-symbol')?.value || '').trim().toUpperCase();
    const action    = document.getElementById('qt-action')?.value;
    const qty       = +document.getElementById('qt-qty')?.value;
    const price     = +document.getElementById('qt-price')?.value;
    const sellDate  = document.getElementById('qt-sell-date')?.value; // ISO, native <input type="date">
    const buyDate   = document.getElementById('qt-buy-date')?.value;  // ISO
    const stopPrice = +document.getElementById('qt-stop-price')?.value || 0;

    if (!sym || !qty || !price) { alert('נא למלא סימבול, כמות ומחיר'); return; }

    if (action === 'buy') {
      const dateStr = buyDate || new Date().toISOString().split('T')[0];
      API.setStatus('שומר פוזיציה — נכתב כפעולת BUY ביומן הפעולות...', 'info');
      API.showSpinner(true);

      const res = await API.appendOperation({ date: dateStr, symbol: sym, action: 'BUY', qty, price, notes: '' });
      if (!res.ok) {
        API.showSpinner(false);
        API.setStatus('❌ ' + (res.error || 'שגיאה'), 'error');
        return;
      }

      const loaded = await load();
      if (!loaded) {
        API.showSpinner(false);
        API.setStatus('⚠️ הפוזיציה נכתבה, אך הרענון מהשרת נכשל — רענן ידנית כדי לוודא', 'warn');
        return;
      }

      // Optional stop-loss, attached the same way New Position does it —
      // the annotation-overlay path, never part of the BUY fact itself.
      if (stopPrice) {
        const metaRes = await API.upsertPositionMeta({ symbol: sym, target: 0, stop_loss: stopPrice, notes: '' });
        if (metaRes.ok) await load();
      }
      API.showSpinner(false);

      invalidateStats();
      API.setStatus('✓ פוזיציה נוספה', 'ok');
      reset();
      renderAll();
      return;
    }

    // Sell → append a SELL op for the existing open lot(s).
    if (!sellDate) { alert('נא למלא תאריך מכירה'); return; }
    API.setStatus('שומר עסקה — נכתב כפעולת SELL ביומן הפעולות...', 'info');
    API.showSpinner(true);

    const res = await API.appendOperation({ date: sellDate, symbol: sym, action: 'SELL', qty, price, notes: '' });
    if (!res.ok) {
      API.showSpinner(false);
      API.setStatus('❌ ' + (res.error || 'שגיאה'), 'error');
      return;
    }

    const loaded = await load();
    API.showSpinner(false);
    if (!loaded) {
      API.setStatus('⚠️ העסקה נכתבה, אך הרענון מהשרת נכשל — רענן ידנית כדי לוודא', 'warn');
      return;
    }

    invalidateStats();
    API.setStatus('✓ עסקה נוספה', 'ok');
    reset();
    renderAll();
  }

  function reset() {
    ['qt-symbol','qt-qty','qt-price','qt-buy-price','qt-buy-date','qt-sell-date','qt-stop-price'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const portfolioEl = document.getElementById('qt-portfolio');
    if (portfolioEl) portfolioEl.value = Settings.get('portfolioSize');
    const riskEl = document.getElementById('qt-risk-pct');
    if (riskEl) riskEl.value = Settings.get('riskPct');
    const lp = document.getElementById('qt-live-price');
    if (lp) { lp.textContent = '—'; lp.style.color = 'var(--green)'; }
    const prev = document.getElementById('qt-preview');
    if (prev) prev.style.display = 'none';
    const sizer = document.getElementById('qt-sizer-result');
    if (sizer) sizer.textContent = 'הזן מחיר וסטופ לחישוב כמות מומלצת';
  }

  return { fetchPrice, calc, submit, reset };
})();
