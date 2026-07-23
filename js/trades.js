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
  let expandedTrade = null;   // one trade row expanded at a time (inline journal)

  // ── Mode: by-trade / by-symbol (Ledger) ─────────────────────
  // The unified Trades screen merges the v1 history table, the Ledger
  // (per-symbol lifecycle), and the Journal (now inline per row).
  function setMode(mode) {
    const byTrade  = document.getElementById('trades-pane-bytrade');
    const bySymbol = document.getElementById('tab-ledger');
    if (byTrade)  byTrade.classList.toggle('active', mode !== 'bysymbol');
    if (bySymbol) bySymbol.classList.toggle('active', mode === 'bysymbol');
    document.querySelectorAll('#trades-mode button').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    if (mode === 'bysymbol' && typeof Ledger !== 'undefined') Ledger.render();
  }

  // A trade carries journal fields merged server-side (mergeTradeMeta_).
  const _JFIELDS = ['entry_reason','exit_reason','respected_stop','followed_plan','lesson','emotion'];
  function _hasJournal(t) { return _JFIELDS.some(f => (t[f]||'').toString().trim()); }

  function _journalDetail(t) {
    const row = (label, val) => val && String(val).trim()
      ? `<div class="jd-item"><span class="jd-label">${label}</span><span class="jd-val">${val}</span></div>` : '';
    const body = [
      row('סיבת כניסה', t.entry_reason),
      row('סיבת יציאה', t.exit_reason),
      row('כיבד סטופ', t.respected_stop),
      row('לפי תוכנית', t.followed_plan),
      row('לקח', t.lesson),
      row('מצב רגשי', t.emotion),
      t.notes ? row('הערה', t.notes) : '',
    ].filter(Boolean).join('');
    const editBtn = Auth.isViewer() ? '' :
      `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); Journal.openModal(${t.id})">${icon('book')} ${_hasJournal(t)?'ערוך יומן':'הוסף יומן'}</button>`;
    return `
      <div class="jdetail">
        ${body ? `<div class="jd-grid">${body}</div>` : `<div class="jd-empty">אין רשומת יומן לעסקה זו עדיין.</div>`}
        <div class="jd-foot">
          ${editBtn}
          <span class="jd-hint">תיקון פרטי עסקה שנרשמה (מחיר/כמות/תאריך) נעשה ישירות ביומן הפעולות בגיליון.</span>
        </div>
      </div>`;
  }

  function toggleDetail(id) {
    expandedTrade = expandedTrade === id ? null : id;
    render(true);
  }

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

    _renderFilterSummary(rows, !!(sym || mon || q));

    tbody.innerHTML = shown.map(t => {
      const netIls = Math.round(usdToIls(t.net, t.month));
      const hasJ = _hasJournal(t);
      const open = expandedTrade === t.id;
      return `<tr class="trade-row${open?' expanded':''}" onclick="Trades.toggleDetail(${t.id})">
        <td style="font-weight:700">${t.symbol}${hasJ?' <span class="jdot" title="יש רשומת יומן"></span>':''}</td>
        <td style="color:var(--text-3)">${t.sell_date}</td>
        <td class="num">${fnum(t.qty)}</td>
        <td class="num">$${t.buy_price}</td>
        <td class="num">$${t.sell_price}</td>
        <td class="num ${t.net>=0?'green':'red'}" style="font-weight:700">${f$(Math.round(t.net))}</td>
        <td class="num ${netIls>=0?'green':'red'}" style="font-weight:700;font-size:11px" title="שער ${rateForMonth(t.month)}">${fILS(netIls)}</td>
        <td><span class="badge ${t.pct>=0?'badge-green':'badge-red'}">${fpct(t.pct)}</span></td>
        <td class="num" style="color:var(--text-3)">${t.hold_days}י'</td>
        <td class="actions-cell" onclick="event.stopPropagation()">
          <div class="actions" style="display:flex;gap:4px">
            ${Auth.isViewer() ? '' : `
            <button class="btn-icon" onclick="Journal.openNote(${t.id})"   title="הערה">${icon('note')}</button>
            <button class="btn-icon" onclick="Journal.openModal(${t.id})"  title="יומן מסחר">${icon('book')}</button>`}
            <span class="row-chev">${open?'⌃':'⌄'}</span>
          </div>
        </td>
      </tr>${open ? `<tr class="trade-detail"><td colspan="10">${_journalDetail(t)}</td></tr>` : ''}`;
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

  // ── Filtered-set summary strip (2.1) ──────────────────────
  // Totals for the CURRENT filter/search result — the whole point of
  // filtering to a month/symbol is seeing its bottom line, not just its
  // rows. Sums the same rows the table shows (before pagination).
  function _renderFilterSummary(rows, filtered) {
    const el = document.getElementById('trades-filter-summary');
    if (!el) return;
    if (!rows.length) { el.innerHTML = ''; return; }
    const net    = rows.reduce((s, t) => s + t.net, 0);
    const netIls = rows.reduce((s, t) => s + usdToIls(t.net, t.month), 0);
    const wins   = rows.filter(t => t.net > 0).length;
    const losses = rows.filter(t => t.net < 0).length;
    const wr     = Math.round(wins / rows.length * 100);
    const avgHold = rows.reduce((s, t) => s + (t.hold_days || 0), 0) / rows.length;
    const stat = (l, v, cls = '') => `<span class="tfs-stat">${l} <b class="num ${cls}"><bdi>${v}</bdi></b></span>`;
    el.innerHTML = `
      <div class="tfs ${filtered ? 'tfs--filtered' : ''}">
        ${filtered ? `<span class="tfs-flag">${icon('search')} סיכום הסינון</span>` : `<span class="tfs-flag">${icon('list')} סה"כ</span>`}
        ${stat('עסקאות', rows.length)}
        ${stat('נטו', f$(Math.round(net)), net >= 0 ? 'green' : 'red')}
        ${stat('נטו ₪', fILS(Math.round(netIls)), netIls >= 0 ? 'green' : 'red')}
        ${stat('Win Rate', wr + '%')}
        ${stat('W/L', wins + '/' + losses)}
        ${stat('החזקה ממוצעת', (Math.round(avgHold * 10) / 10) + ' ימים')}
        ${filtered ? `<button class="btn btn-ghost btn-xs" onclick="Trades.applyFilter({})">נקה סינון ✕</button>` : ''}
      </div>`;
  }

  // ── Programmatic drill-down (Performance → Trades) ────────
  // Called by the monthly table / top-trades lists: jumps to the Trades
  // screen with the month and/or symbol filter pre-applied. Uses the same
  // <select> filters the user sees, so the active filter is visible and
  // clearable exactly like a manual one.
  function applyFilter({ month = '', symbol = '' } = {}) {
    if (typeof navigate === 'function') navigate('trades');
    setMode('bytrade');
    updateFilters(); // ensure options exist before selecting
    const ms = document.getElementById('filter-month');
    const ss = document.getElementById('filter-sym');
    if (ms) ms.value = month;
    if (ss) ss.value = symbol;
    const q = document.getElementById('search-input');
    if (q) q.value = '';
    render();
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
    render, renderDebounced, updateFilters, setSort, loadMore, applyFilter,
    openAddForm, openEdit, closeForm, calcPreview, submit, remove,
    setMode, toggleDetail
  };
})();
