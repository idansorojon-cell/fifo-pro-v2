/**
 * FIFO PRO — trades.js
 * Trade table render, add/edit/delete, filters, sort
 * Depends on: utils.js, api.js, app.js
 */

const Trades = (() => {
  const { f$, fILS, fpct, fnum, TAX, parseDD,
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

  function render() {
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

    tbody.innerHTML = rows.map(t => {
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
            <button class="btn-icon ${t.notes?'':''}      " onclick="Journal.openNote(${t.id})"    title="הערה">📝</button>
            <button class="btn-icon ${t.entry_reason?'':''}" onclick="Journal.openModal(${t.id})"  title="יומן">📓</button>
            <button class="btn-icon"                          onclick="Trades.openEdit(${t.id})"    title="ערוך">✏️</button>
            <button class="btn-icon danger"                   onclick="Trades.remove(${t.id})"      title="מחק">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    document.getElementById('trades-count').textContent = `${rows.length} עסקאות`;

    // Sort indicators
    ['symbol','sell_date','qty','net','pct'].forEach(c => {
      const el = document.getElementById('s-'+c);
      if (el) el.textContent = APP.sortCol===c ? (APP.sortDir===1?'↑':'↓') : '';
    });
  }

  function setSort(col) {
    if (APP.sortCol === col) APP.sortDir *= -1;
    else { APP.sortCol = col; APP.sortDir = -1; }
    render();
  }

  // ── Add/Edit Modal ────────────────────────────────────────

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
    APP.editId = id;
    const t = APP.trades.find(x => x.id === id);
    if (!t) return;
    document.getElementById('modal-title').textContent = 'עריכת עסקה';
    document.getElementById('f-symbol').value    = t.symbol;
    document.getElementById('f-buy-date').value  = t.buy_date;
    document.getElementById('f-sell-date').value = t.sell_date;
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
    const sym = (document.getElementById('f-symbol').value || '').trim().toUpperCase();
    const bd  = document.getElementById('f-buy-date').value.trim();
    const sd  = document.getElementById('f-sell-date').value.trim();
    const qty = +document.getElementById('f-qty').value;
    const bp  = +document.getElementById('f-buy-price').value;
    const sp  = +document.getElementById('f-sell-price').value;
    const notes = document.getElementById('f-notes').value.trim();

    if (!sym || !sd || !qty || !bp || !sp) {
      alert('נא למלא: סימבול, תאריך מכירה, כמות, מחיר קנייה, מחיר מכירה');
      return;
    }

    const cost      = +(qty * bp).toFixed(2);
    const gross     = +(qty * (sp - bp)).toFixed(2);
    const tax       = +(gross * TAX).toFixed(2);
    const net       = +(gross - tax).toFixed(2);
    const pct       = +((sp - bp) / bp * 100).toFixed(2);
    const hold_days = bd && sd ? Math.round(Math.abs(parseDD(sd) - parseDD(bd)) / 86400000) : 0;
    const [d,m,y]   = sd.split('/');
    const month     = y && m ? `${y}-${m.padStart(2,'0')}` : '';

    const trade = { symbol:sym, buy_date:bd, sell_date:sd, qty, buy_price:bp, sell_price:sp,
                    cost, gross, tax, net, pct, hold_days, month, notes };

    closeForm();
    API.setStatus('שומר עסקה...', 'info');
    API.showSpinner(true);

    if (APP.editId !== null) {
      trade.id = APP.editId;
      const cur = APP.trades.find(x => x.id === APP.editId) || {};
      ['entry_reason','exit_reason','respected_stop','followed_plan','lesson','emotion'].forEach(k => {
        trade[k] = cur[k] || '';
      });
      const res = await API.updateTrade(trade);
      if (res.ok) {
        APP.trades = APP.trades.map(x => x.id === APP.editId ? trade : x);
        invalidateStats();
        API.setStatus('✓ עסקה עודכנה', 'ok');
        render(); Journal.render(); renderAll();
      } else {
        API.setStatus('❌ ' + (res.error||'שגיאה'), 'error');
      }
    } else {
      const res = await API.addTrade(trade);
      if (res.ok) {
        trade.id = res.trade.id;
        APP.trades.push(trade);
        invalidateStats();
        API.setStatus('✓ עסקה נוספה', 'ok');
        render(); Journal.render(); renderAll();
      } else {
        API.setStatus('❌ ' + (res.error||'שגיאה'), 'error');
      }
    }

    API.showSpinner(false);
  }

  async function remove(id) {
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
    render, renderDebounced, updateFilters, setSort,
    openAddForm, openEdit, closeForm, calcPreview, submit, remove
  };
})();
