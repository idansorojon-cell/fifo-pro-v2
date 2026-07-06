/**
 * FIFO PRO — trades.js
 * Trade table render, add/edit/delete, filters, sort
 * Depends on: utils.js, api.js, app.js
 */

const Trades = (() => {
  const { f$, fILS, fpct, fnum, TAX, parseDD, isoToDD, ddToISO,
          normalizeTrade, usdToIls, rateForMonth, monthLabel, LS } = Utils;

  // ── Filters ──────────────────────────────────────────────

  function updateFilters() {
    const syms   = [...new Set(APP.trades.map(t => t.symbol))].sort();
    const months = [...new Set(APP.trades.map(t => t.month))].sort();

    const ss = document.getElementById('filter-sym');
    const cur = ss?.value;
    if (ss) {
      ss.innerHTML = '<option value="">כל הסימבולים</option>' +
        syms.map(s => `<option ${s===cur?'selected':''}>${s}</option>`).join('');
    }

    const ms = document.getElementById('filter-month');
    const curM = ms?.value;
    if (ms) {
      ms.innerHTML = '<option value="">כל החודשים</option>' +
        months.map(m => `<option value="${m}" ${m===curM?'selected':''}>${monthLabel(m)}</option>`).join('');
    }
  }

  // ── Render table ─────────────────────────────────────────
  // Shows only the latest PAGE_SIZE rows by default (table was rendering
  // hundreds of rows at once, making the screen feel cluttered). "טען עוד"
  // reveals more without changing filters/sort.

  const PAGE_SIZE = 20;
  let visibleCount = PAGE_SIZE;

  function render(keepPage) {
    if (!keepPage) visibleCount = PAGE_SIZE;
    const tbody = document.getElementById('trades-tbody');
    if (!tbody) return;

    const q   = (document.getElementById('search-input')?.value || '').toLowerCase();
    const sym = document.getElementById('filter-sym')?.value || '';
    const mon = document.getElementById('filter-month')?.value || '';

    let rows = [...APP.trades];
    if (sym) rows = rows.filter(t => t.symbol === sym);
    if (mon) rows = rows.filter(t => t.month  === mon);
    if (q)   rows = rows.filter(t =>
      t.symbol.toLowerCase().includes(q) ||
      (t.sell_date||'').includes(q) ||
      (t.buy_date||'').includes(q)  ||
      (t.notes||'').toLowerCase().includes(q)
    );

    // Sort
    rows.sort((a,b) => {
      let av = a[APP.sortCol], bv = b[APP.sortCol];
      if (APP.sortCol === 'sell_date' || APP.sortCol === 'buy_date') {
        av = parseDD(av); bv = parseDD(bv);
      }
      return av > bv ? APP.sortDir : av < bv ? -APP.sortDir : 0;
    });

    const total = rows.length;
    const shown = rows.slice(0, visibleCount);

    tbody.innerHTML = shown.map(t => {
      const netIls = Math.round(usdToIls(t.net, t.month));
      return `<tr>
        <td style="font-weight:700">${t.symbol}</td>
        <td style="color:var(--text-3)">${t.sell_date}</td>
        <td>${fnum(t.qty)}</td>
        <td>$${t.buy_price}</td>
        <td>$${t.sell_price}</td>
        <td class="${t.net>=0?'green':'red'}" style="font-weight:700">${f$(Math.round(t.net))}</td>
        <td class="${netIls>=0?'green':'red'}" style="font-weight:700;font-size:11px" title="שער ${rateForMonth(t.month)}">${fILS(netIls)}</td>
        <td><span class="badge ${t.pct>=0?'badge-green':'badge-red'}">${fpct(t.pct)}</span></td>
        <td style="color:var(--text-3)">${t.hold_days}י'</td>
        <td>
          <div class="actions" style="display:flex;gap:4px">
            ${Auth.isViewer() ? '' : `
            <button class="btn-icon" onclick="Journal.openNote(${t.id})"   title="הערה">${icon('note')}</button>
            <button class="btn-icon" onclick="Journal.openModal(${t.id})"  title="יומן">${icon('book')}</button>`}
            <button class="btn-icon action-disabled" onclick="Trades.openEdit(${t.id})"    title="ערוך — מבוטל זמנית">${icon('edit')}</button>
            <button class="btn-icon danger action-disabled" onclick="Trades.remove(${t.id})" title="מחק — מבוטל זמנית">${icon('x')}</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    document.getElementById('trades-count').textContent = `מציג ${shown.length} מתוך ${total} עסקאות`;
    const moreBtn = document.getElementById('trades-load-more');
    if (moreBtn) moreBtn.style.display = visibleCount < total ? 'inline-block' : 'none';

    // Sort indicators
    ['symbol','sell_date','qty','net','pct'].forEach(c => {
      const el = document.getElementById('s-'+c);
      if (el) el.textContent = APP.sortCol===c ? (APP.sortDir===1?'↑':'↓') : '';
    });
  }

  function loadMore() {
    visibleCount += PAGE_SIZE;
    render(true);
  }

  function setSort(col) {
    if (APP.sortCol === col) APP.sortDir *= -1;
    else { APP.sortCol = col; APP.sortDir = -1; }
    render();
  }

  // ── Add/Edit Modal ────────────────────────────────────────
  // WRITE-THROUGH (create-only): adding a brand-new closed trade now
  // appends a matched BUY+SELL pair straight to "פעולות" (see
  // API.addTradeOperation / AppScript_FULL.gs handleAddTradeOperation_) —
  // "פעולות" stays the single source of truth, nothing writes to the
  // legacy Trades sheet. Editing/deleting an ALREADY-RECORDED historical
  // trade remains out of scope (openEdit/remove below, still disabled) —
  // mutating a row FIFO has already lot-matched against others is a much
  // harder problem than appending a new, self-contained pair. See
  // docs/TECHNICAL_DEBT.md "Persistence architecture".

  function openAddForm() {
    APP.editId = null;
    document.getElementById('modal-title').textContent = 'עסקה חדשה';
    ['symbol','buy-date','sell-date','qty','buy-price','sell-price','notes'].forEach(f => {
      const el = document.getElementById('f-'+f);
      if (el) el.value = '';
    });
    document.getElementById('preview-box').style.display = 'none';
    document.getElementById('modal-form').style.display = 'flex';
  }

  function openEdit(id) {
    API.setStatus('❌ עריכת עסקאות מבוטלת זמנית — השינוי לא היה נשמר בפועל אחרי רענון', 'warn');
    return;
    APP.editId = id;
    const t = APP.trades.find(x => x.id === id);
    if (!t) return;
    document.getElementById('modal-title').textContent = 'עריכת עסקה';
    document.getElementById('f-symbol').value    = t.symbol;
    document.getElementById('f-buy-date').value  = ddToISO(t.buy_date);
    document.getElementById('f-sell-date').value = ddToISO(t.sell_date);
    document.getElementById('f-qty').value        = t.qty;
    document.getElementById('f-buy-price').value  = t.buy_price;
    document.getElementById('f-sell-price').value = t.sell_price;
    document.getElementById('f-notes').value      = t.notes || '';
    calcPreview();
    document.getElementById('modal-form').style.display = 'flex';
  }

  function closeForm() {
    document.getElementById('modal-form').style.display = 'none';
    APP.editId = null;
  }

  function calcPreview() {
    const qty = +document.getElementById('f-qty').value;
    const bp  = +document.getElementById('f-buy-price').value;
    const sp  = +document.getElementById('f-sell-price').value;
    const box = document.getElementById('preview-box');
    if (!qty || !bp || !sp) { if (box) box.style.display='none'; return; }
    const gross = +(qty * (sp - bp)).toFixed(2);
    const tax   = +(gross * TAX).toFixed(2);
    const net   = +(gross - tax).toFixed(2);
    const pct   = +((sp - bp) / bp * 100).toFixed(2);
    if (box) {
      box.style.display = 'block';
      box.innerHTML = `ברוטו: ${f$(gross)} | מס 25%: ${f$(tax)} | <strong class="${net>=0?'green':'red'}">נטו: ${f$(net)} (${fpct(pct)})</strong>`;
    }
  }

  async function submit() {
    if (APP.editId !== null) {
      // Editing an already-recorded historical trade is still out of
      // scope — openEdit() is disabled at its own entry point so this
      // should be unreachable, but keep a defense-in-depth guard here too,
      // same reasoning as before. See docs/TECHNICAL_DEBT.md P0.
      API.setStatus('❌ עריכת עסקאות מבוטלת זמנית — יש לתקן ישירות ביומן הפעולות', 'warn');
      closeForm();
      return;
    }

    const sym = (document.getElementById('f-symbol').value || '').trim().toUpperCase();
    const bd  = document.getElementById('f-buy-date').value;  // ISO, native <input type="date">
    const sd  = document.getElementById('f-sell-date').value; // ISO
    const qty = +document.getElementById('f-qty').value;
    const bp  = +document.getElementById('f-buy-price').value;
    const sp  = +document.getElementById('f-sell-price').value;
    const notes = document.getElementById('f-notes').value.trim();

    if (!sym || !bd || !sd || !qty || !bp || !sp) {
      alert('נא למלא: סימבול, תאריך קנייה, תאריך מכירה, כמות, מחיר קנייה, מחיר מכירה');
      return;
    }

    closeForm();
    API.setStatus('שומר עסקה — נכתב כזוג BUY+SELL ביומן הפעולות...', 'info');
    API.showSpinner(true);

    const res = await API.addTradeOperation({ symbol: sym, buy_date: bd, sell_date: sd, qty, buy_price: bp, sell_price: sp, notes });
    if (!res.ok) {
      API.showSpinner(false);
      API.setStatus('❌ ' + (res.error || 'שגיאה'), 'error');
      return;
    }

    // Verify by reloading real data from getOperations — never assume the
    // append landed correctly, same discipline as New Position/Quick Trade.
    const loaded = await load();
    API.showSpinner(false);

    if (!loaded) {
      API.setStatus('⚠️ העסקה נכתבה, אך הרענון מהשרת נכשל — רענן ידנית כדי לוודא', 'warn');
      return;
    }

    invalidateStats();
    API.setStatus('✓ עסקה נוספה', 'ok');
    render(); Journal.render(); renderAll();
  }

  async function remove(id) {
    API.setStatus('❌ מחיקת עסקאות מבוטלת זמנית — יש למחוק מיומן הפעולות ב-Google Sheets', 'warn');
    return;
    if (!confirm('למחוק עסקה זו?')) return;
    API.setStatus('מוחק...', 'info');
    API.showSpinner(true);
    const res = await API.deleteTrade(id);
    if (res.ok) {
      APP.trades = APP.trades.filter(t => t.id !== id);
      invalidateStats();
      API.setStatus('✓ עסקה נמחקה', 'ok');
      render(); Journal.render(); renderAll();
    } else {
      API.setStatus('❌ ' + (res.error||'שגיאה'), 'error');
    }
    API.showSpinner(false);
  }

  // Debounced wrapper for the free-text search input — avoids
  // re-rendering/re-sorting the whole table on every keystroke.
  const renderDebounced = Utils.debounce(render, 200);

  return {
    render, renderDebounced, updateFilters, setSort, loadMore,
    openAddForm, openEdit, closeForm, calcPreview, submit, remove
  };
})();
