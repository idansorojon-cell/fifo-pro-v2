/**
 * FIFO PRO — positions.js
 * Open positions, live prices, alerts, R:R calculator
 * Depends on: utils.js, api.js, app.js
 */

const Positions = (() => {
  const { f$, fILS, fpct, fnum, fprice, usdToIls, currentMonthKey,
          isoToDD, ddToISO, LS } = Utils;

  // ── Render ──────────────────────────────────────────────

  function render() {
    renderGrid();
    renderTable();
    renderSummary();
    checkAlerts();
  }

  function renderSummary() {
    const el = document.getElementById('pos-summary');
    if (!el) return;
    if (!APP.positions.length) { el.style.display = 'none'; return; }

    let totalCost=0, totalVal=0, totalPnl=0, liveCount=0;
    APP.positions.forEach(p => {
      const live  = APP.liveData[p.symbol];
      const price = live?.price;
      totalCost += p.avg_price * p.qty;
      if (price) { totalVal += price * p.qty; totalPnl += (price - p.avg_price)*p.qty; liveCount++; }
      else totalVal += p.avg_price * p.qty;
    });

    el.style.display = 'flex';
    el.innerHTML = `
      <div><div style="font-size:11px;color:var(--text-3);margin-bottom:3px">עלות כוללת</div><div style="font-weight:700">${f$(Math.round(totalCost))}</div></div>
      <div><div style="font-size:11px;color:var(--text-3);margin-bottom:3px">שווי נוכחי</div><div style="font-weight:700">${f$(Math.round(totalVal))}</div></div>
      <div><div style="font-size:11px;color:var(--text-3);margin-bottom:3px">Open P&L</div>
        <div style="font-weight:700;color:${totalPnl>=0?'var(--green)':'var(--red)'}">
          ${f$(Math.round(totalPnl))} ${liveCount ? `(${liveCount}/${APP.positions.length} live)` : ''}
        </div></div>
      <div><div style="font-size:11px;color:var(--text-3);margin-bottom:3px">P&L %</div>
        <div style="font-weight:700;color:${totalPnl>=0?'var(--green)':'var(--red)'}">
          ${totalCost ? fpct(totalPnl/totalCost*100) : '—'}
        </div></div>
    `;
  }

  function renderGrid() {
    const el = document.getElementById('pos-grid');
    if (!el) return;
    if (!APP.positions.length) {
      el.innerHTML = '<div style="color:var(--text-3);font-size:13px;grid-column:1/-1;padding:20px 0">אין פוזיציות פתוחות. לחץ "+ פוזיציה חדשה" להוספה.</div>';
      return;
    }
    el.innerHTML = APP.positions.map(p => posCard(p)).join('');
  }

  function posCard(p) {
    const live      = APP.liveData[p.symbol];
    const price     = live?.price;
    // P&L is ALWAYS vs your entry price (p.avg_price) — never touches
    // prevClose. This was already correct; kept exactly as-is.
    const pnl       = price ? (price - p.avg_price) * p.qty : null;
    const pnlPct    = price ? (price - p.avg_price) / p.avg_price * 100 : null;
    const val       = price ? price * p.qty : p.avg_price * p.qty;

    // BUG FIX: daily change must come from the backend's own validated
    // changePct, gated on changePctValid — NEVER recomputed client-side
    // from live.prevClose. The backend may still return a `prevClose`
    // value even when it's flagged "suspicious" (kept for transparency/
    // debugging), so blindly recomputing (price-prevClose)/prevClose
    // here would silently resurrect exactly the bug this fix addresses
    // (e.g. ONDL's fake -42.92% from a ~1-year-old reference close).
    const dayChgValid = !!(live && live.changePctValid && live.changePct != null);
    const dayChg      = dayChgValid ? live.changePct : null;
    const targetPct = p.target && price ? (p.target - price) / price * 100 : null;
    const stopPct   = p.stop_loss && price ? (price - p.stop_loss) / price * 100 : null;

    return `
      <div class="pos-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div class="pos-card-sym">
            ${p.symbol}
            ${live ? '<span class="live-dot"></span>' : ''}
          </div>
          <div style="font-size:11px;color:var(--text-3)">${live?.updated || '—'}</div>
        </div>

        <div class="pos-card-price ${pnl===null?'':(pnl>=0?'green':'red')}">
          ${price ? fprice(price) : '—'}
        </div>

        ${live ? (
          dayChgValid
            ? `<div style="font-size:12px;color:${dayChg>=0?'var(--green)':'var(--red)'}">יומי: ${dayChg>=0?'+':''}${dayChg.toFixed(2)}%</div>`
            : `<div style="font-size:12px;color:var(--text-3)" title="${_dayChangeStatusTitle(live.dayChangeStatus)}">יומי: N/A</div>`
        ) : ''}

        ${live?.preMarket ? `
          <div style="font-size:11px;padding:2px 8px;background:var(--gold-dim);border-radius:var(--r-sm);display:inline-block;margin-top:3px;color:var(--gold)">
            🌅 Pre: <b>${fprice(live.preMarket)}</b>
            ${dayChgValid ? ` (${live.preMarket>live.prevClose?'+':''}${((live.preMarket-live.prevClose)/live.prevClose*100).toFixed(2)}%)` : ''}
          </div>` : ''}

        ${live?.postMarket ? `
          <div style="font-size:11px;padding:2px 8px;background:var(--purple-dim);border-radius:var(--r-sm);display:inline-block;margin-top:3px;color:var(--purple)">
            🌙 AH: <b>${fprice(live.postMarket)}</b>
          </div>` : ''}

        <div class="pos-card-meta">
          <span>כמות: ${fnum(p.qty)}</span>
          <span>כניסה: ${fprice(p.avg_price)}</span>
        </div>

        ${p.added_date ? `<div style="font-size:11px;color:var(--text-3)">${p.added_date}</div>` : ''}

        <div style="display:flex;justify-content:space-between;margin-top:8px;font-weight:700">
          <span class="${pnl===null?'':(pnl>=0?'green':'red')}">
            P&L: ${pnl!==null ? f$(Math.round(pnl)) + ' (' + fpct(pnlPct) + ')' : '—'}
          </span>
          <span style="color:var(--text-3);font-weight:400">${f$(Math.round(val))}</span>
        </div>

        ${pnl !== null ? `
          <div style="font-size:11px;color:var(--text-3);margin-top:2px">
            ₪ ${fILS(Math.round(usdToIls(pnl, currentMonthKey())))}
          </div>` : ''}

        ${p.target ? `
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px">
            <span style="color:var(--blue)">🎯 יעד: ${fprice(p.target)}${targetPct!==null?' ('+fpct(targetPct)+' נותר)':''}</span>
            ${p.stop_loss ? `<span style="color:var(--red)">🛑 סטופ: ${fprice(p.stop_loss)}${stopPct!==null?' ('+fpct(-stopPct)+')':''}</span>` : ''}
          </div>` : ''}

        ${p.notes ? `<div style="font-size:11px;color:var(--text-3);margin-top:6px;font-style:italic">${p.notes}</div>` : ''}

        <div style="display:flex;gap:6px;margin-top:12px">
          <button class="btn-icon" onclick="Positions.openEdit(${p.id})">✏️</button>
          <button class="btn-icon danger" onclick="Positions.remove(${p.id})">✕</button>
        </div>
      </div>
    `;
  }

  // Human-readable tooltip for why daily change is unavailable —
  // matches the dayChangeStatus values returned by getPrices.
  function _dayChangeStatusTitle(status) {
    switch (status) {
      case 'missing_prevclose':   return 'אין נתון מחיר סגירה קודם — לא ניתן לחשב שינוי יומי';
      case 'invalid_prevclose':   return 'מחיר סגירה קודם לא תקין (אפס/שלילי) — לא ניתן לחשב שינוי יומי';
      case 'suspicious_prevclose':return 'מחיר סגירה קודם נראה לא סביר (שינוי חד מאוד) — מוצג N/A במקום ערך שגוי';
      default:                    return 'שינוי יומי לא זמין';
    }
  }

  function renderTable() {
    const tbody = document.getElementById('pos-tbody');
    if (!tbody) return;
    if (!APP.positions.length) { tbody.innerHTML = ''; return; }
    tbody.innerHTML = APP.positions.map(p => {
      const live    = APP.liveData[p.symbol];
      const price   = live?.price;
      // P&L always vs entry price (p.avg_price) — never prevClose. Unchanged.
      const pnl     = price ? (price - p.avg_price) * p.qty : null;
      const pnlPct  = price ? (price - p.avg_price) / p.avg_price * 100 : null;

      // BUG FIX: gate on the backend's validated changePctValid flag,
      // never just `!= null` (prevClose/changePct can be present-but-
      // flagged-suspicious). See posCard() above for the full explanation.
      const dayChgValid = !!(live && live.changePctValid && live.changePct != null);
      const dayChgCell = dayChgValid
        ? `<div style="font-size:10px;color:${live.changePct>=0?'var(--green)':'var(--red)'}">${live.changePct>=0?'+':''}${live.changePct.toFixed(2)}%</div>`
        : live ? `<div style="font-size:10px;color:var(--text-3)" title="${_dayChangeStatusTitle(live.dayChangeStatus)}">N/A</div>` : '';

      const liveCell = price
        ? `<div style="font-weight:700">${fprice(price)}</div>
           ${dayChgCell}
           ${live.preMarket?`<div style="font-size:10px;color:var(--gold)">Pre: ${fprice(live.preMarket)}</div>`:''}
           ${live.postMarket?`<div style="font-size:10px;color:var(--purple)">AH: ${fprice(live.postMarket)}</div>`:''}`
        : '<span style="color:var(--text-3)">—</span>';

      return `<tr>
        <td style="font-weight:700">${p.symbol}</td>
        <td>${fnum(p.qty)}</td>
        <td>${fprice(p.avg_price)}${p.added_date?`<div style="font-size:10px;color:var(--text-3)">${p.added_date}</div>`:''}</td>
        <td>${liveCell}</td>
        <td class="${pnl===null?'':(pnl>=0?'green':'red')}" style="font-weight:700">${pnl!==null?f$(Math.round(pnl)):'—'}</td>
        <td class="${pnl===null?'':(pnl>=0?'green':'red')}" style="font-weight:700">${pnl!==null?fILS(Math.round(usdToIls(pnl,currentMonthKey()))):'—'}</td>
        <td class="${pnlPct===null?'':(pnlPct>=0?'green':'red')}">${pnlPct!==null?fpct(pnlPct):'—'}</td>
        <td>${price?f$(Math.round(price*p.qty)):f$(Math.round(p.avg_price*p.qty))}</td>
        <td>${p.target?fprice(p.target):''}</td>
        <td>${p.stop_loss?fprice(p.stop_loss):''}</td>
        <td>
          <div class="actions" style="display:flex;gap:5px">
            <button class="btn-icon" onclick="Positions.openEdit(${p.id})">✏️</button>
            <button class="btn-icon danger" onclick="Positions.remove(${p.id})">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Live Prices ─────────────────────────────────────────

  async function refreshPrices() {
    if (!APP.positions.length) return;
    API.setStatus('מרענן מחירים...', 'info');
    const syms   = [...new Set(APP.positions.map(p => p.symbol))];
    const prices = await API.fetchPrices(syms);

    let loadedCount = 0;
    const errors = [];

    Object.entries(prices).forEach(([sym, p]) => {
      if (p && p.ok) {
        APP.liveData[sym] = { ...(APP.liveData[sym]||{}), ...p, updated: new Date().toLocaleTimeString('he-IL') };
        loadedCount++;
      } else {
        const err = (p && p.error) || 'no data';
        console.warn('[prices] failed for', sym, err);
        errors.push(sym + ': ' + err);
      }
    });

    if (!Object.keys(prices).length) {
      console.error('[prices] fetchPrices returned empty — auth or network error');
      API.setStatus('❌ מחירים לא נטענו — בדוק חיבור ו-API key', 'error');
      render();
      return;
    }

    render();

    if (loadedCount > 0) {
      API.setStatus('✓ ' + loadedCount + '/' + syms.length + ' מחירים עודכנו', 'ok');
    } else {
      // Surface the first real error rather than a generic message
      const firstErr = errors[0] || '';
      let errMsg;
      if (firstErr.includes('401') || firstErr.includes('Unauthorized') || firstErr.includes('API key'))
        errMsg = '❌ Polygon 401 — בדוק POLYGON_API_KEY ב-Script Properties';
      else if (firstErr.includes('429') || firstErr.includes('Rate Limit'))
        errMsg = '⚠️ Polygon 429 — חרגת ממכסת הקריאות';
      else if (firstErr.includes('POLYGON_API_KEY חסר'))
        errMsg = '❌ הגדר POLYGON_API_KEY ב-Script Properties של Apps Script';
      else if (firstErr.includes('network') || firstErr.includes('רשת'))
        errMsg = '❌ שגיאת רשת — בדוק חיבור לאינטרנט';
      else if (firstErr)
        errMsg = '⚠️ ' + firstErr.slice(0, 80);
      else
        errMsg = '⚠️ לא ניתן לטעון מחירים';
      console.error('[prices] errors:', errors.join(' | '));
      API.setStatus(errMsg, 'error');
    }
  }

  function connectWS() {
    const syms = [...new Set(APP.positions.map(p => p.symbol))];
    API.connectWS(syms, (sym, price) => {
      APP.liveData[sym] = APP.liveData[sym] || {};
      APP.liveData[sym].price   = price;
      APP.liveData[sym].updated = new Date().toLocaleTimeString('he-IL');
      render();
      checkAlerts();
    });
  }

  // ── Alerts ──────────────────────────────────────────────

  function checkAlerts() {
    if (!APP.positions.length) return;
    const alerts = [];
    APP.positions.forEach(p => {
      const live = APP.liveData[p.symbol];
      if (!live?.price) return;
      const price = live.price;
      const pct   = (price - p.avg_price) / p.avg_price * 100;
      if (p.target    && price >= p.target)    alerts.push({ type:'target', msg:`🎯 ${p.symbol} הגיע ליעד! ${fprice(price)} ≥ ${fprice(p.target)}` });
      if (p.stop_loss && price <= p.stop_loss) alerts.push({ type:'stop',   msg:`🛑 ${p.symbol} פגע בסטופ! ${fprice(price)} ≤ ${fprice(p.stop_loss)}` });
      if (pct <= -5 && (!p.stop_loss || price > p.stop_loss)) alerts.push({ type:'warn', msg:`⚠️ ${p.symbol} ירד ${pct.toFixed(1)}% מהכניסה` });
    });

    const banner = document.getElementById('alert-banner');
    if (!banner) return;
    if (!alerts.length) { banner.style.display = 'none'; return; }

    const priority = alerts.find(a=>a.type==='stop') || alerts.find(a=>a.type==='target') || alerts[0];
    if (banner._lastAlert === priority.msg) return;
    banner._lastAlert = priority.msg;
    banner.className = 'alert-banner ' + priority.type;
    banner.style.display = 'flex';
    banner.innerHTML = `
      <span>${priority.msg}${alerts.length>1?` <span style="color:var(--text-3);font-size:11px">(+${alerts.length-1})</span>`:''}</span>
      <button onclick="Positions.dismissAlert()" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-3);padding:0 4px">✕</button>
    `;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = priority.type === 'stop' ? 440 : 880;
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }

  function dismissAlert() {
    const banner = document.getElementById('alert-banner');
    if (!banner) return;
    banner.style.display = 'none';
    banner._lastAlert = (banner._lastAlert || '') + '_dismissed';
  }

  // ── R:R Calculator ──────────────────────────────────────

  function calcRR() {
    const price  = +document.getElementById('pf-price').value;
    const target = +document.getElementById('pf-target').value;
    const stop   = +document.getElementById('pf-stop').value;
    const qty    = +document.getElementById('pf-qty').value;
    const box    = document.getElementById('rr-box');
    if (!price || !target || !stop) { if (box) box.style.display='none'; return; }
    if (box) box.style.display = 'block';
    const risk       = price - stop;
    const reward     = target - price;
    const ratio      = risk > 0 ? reward / risk : 0;
    const totalRisk  = risk * (qty || 0);
    const riskPct    = (totalRisk / (APP.monthGoal > 0 ? APP.monthGoal * 13.4 : 67000) * 100).toFixed(1);
    document.getElementById('rr-risk').textContent   = risk   > 0 ? `$${risk.toFixed(2)}`   : '—';
    document.getElementById('rr-reward').textContent = reward > 0 ? `$${reward.toFixed(2)}` : '—';
    const ratioEl = document.getElementById('rr-ratio');
    ratioEl.textContent = ratio > 0 ? `1:${ratio.toFixed(2)}` : '—';
    ratioEl.style.color = ratio >= 2 ? 'var(--green)' : ratio >= 1 ? 'var(--blue)' : 'var(--red)';
    document.getElementById('rr-total-risk').textContent = qty && risk > 0 ? `$${totalRisk.toFixed(0)} (${riskPct}%)` : '—';
  }

  // ── CRUD ────────────────────────────────────────────────

  function openForm() {
    APP.posEditId = null;
    document.getElementById('pos-modal-title').textContent = 'פוזיציה חדשה';
    ['symbol','qty','price','target','stop','notes'].forEach(f => {
      const el = document.getElementById('pf-'+f);
      if (el) el.value = '';
    });
    document.getElementById('pf-date').value = new Date().toISOString().split('T')[0];
    const rrBox = document.getElementById('rr-box');
    if (rrBox) rrBox.style.display = 'none';
    document.getElementById('modal-pos').style.display = 'flex';
  }

  function openEdit(id) {
    APP.posEditId = id;
    const p = APP.positions.find(x => x.id === id);
    if (!p) return;
    document.getElementById('pos-modal-title').textContent = 'עריכת פוזיציה';
    document.getElementById('pf-symbol').value = p.symbol;
    document.getElementById('pf-qty').value    = p.qty;
    document.getElementById('pf-price').value  = p.avg_price;
    document.getElementById('pf-target').value = p.target  || '';
    document.getElementById('pf-stop').value   = p.stop_loss || '';
    document.getElementById('pf-notes').value  = p.notes   || '';
    if (p.added_date) {
      const parts = String(p.added_date).split('/');
      document.getElementById('pf-date').value = parts.length === 3
        ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
        : p.added_date;
    }
    calcRR();
    document.getElementById('modal-pos').style.display = 'flex';
  }

  function closeForm() {
    document.getElementById('modal-pos').style.display = 'none';
    APP.posEditId = null;
  }

  async function submit() {
    const sym   = (document.getElementById('pf-symbol').value || '').trim().toUpperCase();
    const qty   = +document.getElementById('pf-qty').value;
    const price = +document.getElementById('pf-price').value;
    if (!sym || !qty || !price) { alert('נא למלא סימבול, כמות ומחיר קנייה'); return; }

    const rawDate = document.getElementById('pf-date').value;
    let entryDate = '';
    if (rawDate) {
      const [y,m,d] = rawDate.split('-');
      entryDate = `${d}/${m}/${y}`;
    }

    const pos = {
      symbol:    sym, qty, avg_price: price,
      target:    +document.getElementById('pf-target').value || 0,
      stop_loss: +document.getElementById('pf-stop').value   || 0,
      notes:     document.getElementById('pf-notes').value.trim(),
      added_date: entryDate,
    };

    const editingId = APP.posEditId;
    closeForm();
    API.setStatus('שומר פוזיציה...', 'info');
    API.showSpinner(true);

    if (editingId !== null) {
      pos.id = editingId;
      const res = await API.updatePosition(pos);
      APP.positions = APP.positions.map(p => p.id === editingId ? { ...pos } : p);
      LS.set('fifo_positions_backup', APP.positions);
      API.setStatus(res.ok ? '✓ פוזיציה עודכנה' : '✓ נשמר מקומית', 'ok');
    } else {
      const res = await API.addPosition(pos);
      const saved = res.ok && res.position ? res.position : { ...pos, id: Date.now() };
      APP.positions.push(saved);
      LS.set('fifo_positions_backup', APP.positions);
      API.setStatus(res.ok ? '✓ פוזיציה נוספה' : '✓ נשמר מקומית', 'ok');
    }

    API.showSpinner(false);
    render();

    if (!APP.liveData[sym]) {
      const d = await API.fetchPrice(sym);
      if (d) { APP.liveData[sym] = d; render(); }
    }
  }

  async function remove(id) {
    if (!confirm('למחוק פוזיציה זו?')) return;
    const res = await API.deletePosition(id);
    APP.positions = APP.positions.filter(p => p.id !== id);
    LS.set('fifo_positions_backup', APP.positions);
    render();
    API.setStatus(res.ok ? '✓ פוזיציה נמחקה' : '✓ נמחק מקומית', 'ok');
  }

  return {
    render, refreshPrices, connectWS,
    checkAlerts, dismissAlert, calcRR,
    openForm, openEdit, closeForm, submit, remove,
  };
})();
