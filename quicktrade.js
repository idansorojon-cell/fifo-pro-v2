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
    const portfolio = +document.getElementById('qt-portfolio')?.value || 67000;
    const riskPct   = +document.getElementById('qt-risk-pct')?.value || 1;
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

  async function submit() {
    const sym       = (document.getElementById('qt-symbol')?.value || '').trim().toUpperCase();
    const action    = document.getElementById('qt-action')?.value;
    const qty       = +document.getElementById('qt-qty')?.value;
    const price     = +document.getElementById('qt-price')?.value;
    const sellDate  = document.getElementById('qt-sell-date')?.value;
    const buyDate   = document.getElementById('qt-buy-date')?.value;
    const buyPrice  = +document.getElementById('qt-buy-price')?.value;
    const stopPrice = +document.getElementById('qt-stop-price')?.value || 0;

    if (!sym || !qty || !price) { alert('נא למלא סימבול, כמות ומחיר'); return; }

    if (action === 'buy') {
      const bdStr = buyDate ? isoToDD(buyDate) : Utils.toDD(new Date());
      const pos = { symbol:sym, qty, avg_price:price, stop_loss:stopPrice, notes:'', added_date:bdStr };
      API.setStatus('שומר פוזיציה...', 'info');
      const res = await API.addPosition(pos);
      if (res.ok) {
        APP.positions.push(res.position || { ...pos, id: Date.now() });
        Utils.LS.set('fifo_positions_backup', APP.positions);
        API.setStatus('✓ פוזיציה נוספה', 'ok');
        reset();
        Positions.render();
      } else {
        API.setStatus('❌ ' + (res.error||'שגיאה'), 'error');
      }
      return;
    }

    // Sell → add trade
    if (!sellDate || !buyPrice) { alert('נא למלא תאריך מכירה ומחיר קנייה'); return; }
    const sdStr = isoToDD(sellDate);
    const bdStr = buyDate ? isoToDD(buyDate) : sdStr;
    const cost  = +(qty * buyPrice).toFixed(2);
    const gross = +(qty * (price - buyPrice)).toFixed(2);
    const tax   = +(gross * TAX).toFixed(2);
    const net   = +(gross - tax).toFixed(2);
    const pct   = +((price - buyPrice) / buyPrice * 100).toFixed(2);
    const hold  = buyDate ? Math.round(Math.abs(parseDD(sdStr) - parseDD(bdStr)) / 86400000) : 0;
    const [d,m,y] = sdStr.split('/');
    const month   = `${y}-${m}`;
    const trade   = { symbol:sym, buy_date:bdStr, sell_date:sdStr, qty, buy_price:buyPrice,
                      sell_price:price, cost, gross, tax, net, pct, hold_days:hold, month, notes:'' };

    API.setStatus('שומר עסקה...', 'info');
    API.showSpinner(true);
    const res = await API.addTrade(trade);
    if (res.ok) {
      trade.id = res.trade.id;
      APP.trades.push(trade);
      invalidateStats();
      API.setStatus('✓ עסקה נוספה', 'ok');
      reset();
      Trades.render();
      Trades.updateFilters();
      renderAll();
    } else {
      API.setStatus('❌ ' + (res.error||'שגיאה'), 'error');
    }
    API.showSpinner(false);
  }

  function reset() {
    ['qt-symbol','qt-qty','qt-price','qt-buy-price','qt-buy-date','qt-sell-date','qt-stop-price'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const lp = document.getElementById('qt-live-price');
    if (lp) { lp.textContent = '—'; lp.style.color = 'var(--green)'; }
    const prev = document.getElementById('qt-preview');
    if (prev) prev.style.display = 'none';
    const sizer = document.getElementById('qt-sizer-result');
    if (sizer) sizer.textContent = 'הזן מחיר וסטופ לחישוב כמות מומלצת';
  }

  return { fetchPrice, calc, submit, reset };
})();
