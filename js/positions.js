/**
 * FIFO PRO — positions.js
 * Open positions, live prices, alerts, R:R calculator
 * Depends on: utils.js, api.js, app.js
 */

const Positions = (() => {
  const { f$, fILS, fpct, fnum, fprice, usdToIls, currentMonthKey,
          isoToDD, ddToISO, LS } = Utils;

  const ALERT_SHOWN_KEY  = 'fifo_alerts_shown_v1';
  const WARN_THRESHOLD_PCT = -5;

  // ── Render ──────────────────────────────────────────────

  function render() {
    renderGrid();
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
    // Every dynamic value below is wrapped in <bdi> — these strings mix
    // LTR currency/percent content ($, %, digits, minus signs, parens)
    // into an RTL page, and without isolation the bidi algorithm visually
    // reorders the minus sign/parens (e.g. "-$1,234" renders as "$1,234-").
    // <bdi> isolates each value's own direction without affecting layout
    // or the underlying number/logic. See docs/TECHNICAL_DEBT.md.
    el.innerHTML = `
      <div><div style="font-size:11px;color:var(--text-3);margin-bottom:3px">עלות כוללת</div><div style="font-weight:700"><bdi>${f$(Math.round(totalCost))}</bdi></div></div>
      <div><div style="font-size:11px;color:var(--text-3);margin-bottom:3px">שווי נוכחי</div><div style="font-weight:700"><bdi>${f$(Math.round(totalVal))}</bdi></div></div>
      <div><div style="font-size:11px;color:var(--text-3);margin-bottom:3px">Open P&L</div>
        <div style="font-weight:700;color:${totalPnl>=0?'var(--green)':'var(--red)'}">
          <bdi>${f$(Math.round(totalPnl))}</bdi> ${liveCount ? `<bdi>(${liveCount}/${APP.positions.length} live)</bdi>` : ''}
        </div></div>
      <div><div style="font-size:11px;color:var(--text-3);margin-bottom:3px">P&L %</div>
        <div style="font-weight:700;color:${totalPnl>=0?'var(--green)':'var(--red)'}">
          <bdi>${totalCost ? fpct(totalPnl/totalCost*100) : '—'}</bdi>
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

  // Risk status used by both the position card and Mission Control's
  // "biggest risk" widget — kept in one place so they never disagree.
  function riskStatus(p, live) {
    const price = live?.price;
    if (!price) return { level: 'none', label: '—', color: 'var(--text-3)' };
    const pnlPct  = (price - p.avg_price) / p.avg_price * 100;
    const stopPct = p.stop_loss ? (price - p.stop_loss) / price * 100 : null;
    if ((p.stop_loss && price <= p.stop_loss) || pnlPct <= -10)
      return { level: 'high', label: icon('dot') + ' סיכון גבוה', color: 'var(--red)' };
    if (pnlPct <= WARN_THRESHOLD_PCT || (stopPct !== null && stopPct < 5))
      return { level: 'warn', label: icon('dot') + ' אזהרה', color: 'var(--gold)' };
    return { level: 'ok', label: icon('dot') + ' תקין', color: 'var(--green)' };
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
    const risk      = riskStatus(p, live);

    return `
      <div class="pos-card pos-card--${risk.level}">
        <div class="pos-card-top">
          <div class="pos-card-sym">
            ${p.symbol}
            ${live ? '<span class="live-dot"></span>' : ''}
          </div>
          <span class="risk-pill" style="color:${risk.color};border-color:${risk.color}">${risk.label}</span>
        </div>

        <div class="pos-card-price-row">
          <div class="pos-card-price ${pnl===null?'':(pnl>=0?'green':'red')}">
            <bdi>${price ? fprice(price) : '—'}</bdi>
          </div>
          ${live ? (
            dayChgValid
              ? `<div class="pos-card-daychg ${dayChg>=0?'green':'red'}">יומי: <bdi>${dayChg>=0?'+':''}${dayChg.toFixed(2)}%</bdi></div>`
              : `<div class="pos-card-daychg" style="color:var(--text-3)" title="${_dayChangeStatusTitle(live.dayChangeStatus)}">יומי: N/A</div>`
          ) : ''}
        </div>

        ${live?.preMarket ? `
          <div style="font-size:11px;padding:2px 8px;background:var(--gold-dim);border-radius:var(--r-sm);display:inline-block;margin-top:3px;color:var(--gold)">
            🌅 Pre: <b><bdi>${fprice(live.preMarket)}</bdi></b>
            ${dayChgValid ? `<bdi> (${live.preMarket>live.prevClose?'+':''}${((live.preMarket-live.prevClose)/live.prevClose*100).toFixed(2)}%)</bdi>` : ''}
          </div>` : ''}

        ${live?.postMarket ? `
          <div style="font-size:11px;padding:2px 8px;background:var(--purple-dim);border-radius:var(--r-sm);display:inline-block;margin-top:3px;color:var(--purple)">
            🌙 AH: <b><bdi>${fprice(live.postMarket)}</bdi></b>
          </div>` : ''}

        <div class="pos-card-stats">
          <div class="pos-card-stat"><span class="pos-card-stat-label">כמות</span><span class="pos-card-stat-val"><bdi>${fnum(p.qty)}</bdi></span></div>
          <div class="pos-card-stat"><span class="pos-card-stat-label">כניסה</span><span class="pos-card-stat-val"><bdi>${fprice(p.avg_price)}</bdi></span></div>
          <div class="pos-card-stat"><span class="pos-card-stat-label">שווי נוכחי</span><span class="pos-card-stat-val"><bdi>${f$(Math.round(val))}</bdi></span></div>
          <div class="pos-card-stat"><span class="pos-card-stat-label">P&L %</span><span class="pos-card-stat-val ${pnlPct===null?'':(pnlPct>=0?'green':'red')}"><bdi>${pnlPct!==null?fpct(pnlPct):'—'}</bdi></span></div>
        </div>

        ${p.added_date ? `<div style="font-size:11px;color:var(--text-3);margin-top:6px">${p.added_date}</div>` : ''}

        <div class="pos-card-pnl-row">
          <span class="pos-card-pnl ${pnl===null?'':(pnl>=0?'green':'red')}">
            P&L: <bdi>${pnl!==null ? f$(Math.round(pnl)) : '—'}</bdi>
          </span>
          ${pnl !== null ? `<span style="font-size:11px;color:var(--text-3)"><bdi>${fILS(Math.round(usdToIls(pnl, currentMonthKey())))}</bdi></span>` : ''}
        </div>

        ${p.target ? `
          <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px">
            <span style="color:var(--blue)">${icon('target')} יעד: <bdi>${fprice(p.target)}</bdi>${targetPct!==null?'<bdi> ('+fpct(targetPct)+' נותר)</bdi>':''}</span>
            ${p.stop_loss ? `<span style="color:var(--red)">${icon('octagon')} סטופ: <bdi>${fprice(p.stop_loss)}</bdi>${stopPct!==null?'<bdi> ('+fpct(-stopPct)+')</bdi>':''}</span>` : ''}
          </div>` : ''}

        ${p.notes ? `<div style="font-size:11px;color:var(--text-3);margin-top:6px;font-style:italic">${p.notes}</div>` : ''}

        ${Auth.isViewer() ? '' : `
        <div style="display:flex;gap:6px;margin-top:12px">
          <button class="btn-icon" onclick="Positions.openEdit(${p.id})" title="ערוך יעד/סטופ/הערות">${icon('edit')}</button>
          <button class="btn-icon danger" onclick="Positions.remove(${p.id})" title="מחק פוזיציה — נכתב כמכירה במחיר עלות ביומן הפעולות">${icon('x')}</button>
        </div>`}
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

  // ── Live Prices ─────────────────────────────────────────

  // manual=true only for the explicit "רענן" button click (refresh icon,
  // see index.html) — the automatic 15s poll (startPolling() in app.js)
  // always calls this with no argument. There is no success toast for
  // either case — the button's own spin state (API.setButtonBusy) is the
  // real-time feedback, and the #ws-dot pulse + #last-updated timestamp
  // are the "it worked" confirmation. Only failures ever toast (see
  // API.reportPriceSuccess/reportPriceError and docs/DESIGN_SYSTEM.md).
  async function refreshPrices(manual = false) {
    if (!APP.positions.length) return;
    if (manual) API.setButtonBusy('pos-refresh-btn', true);
    try {
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
        API.reportPriceError('❌ מחירים לא נטענו — בדוק חיבור ו-API key', manual);
        render();
        return;
      }

      render();
      // Mission Control's Open P&L / biggest-risk widgets depend on live
      // prices — keep them current every poll without re-rendering anything
      // else. app.js loads after positions.js but this only ever runs at
      // runtime (after boot), so the function is guaranteed to exist by then.
      if (typeof renderMissionControl === 'function') renderMissionControl();
      // Same reasoning for Cockpit (FIFO PRO 2.0, Phase 1) — its
      // mark-to-market number and action list are only ever as fresh as
      // the last render() call, so it needs the same live-price hook.
      // cockpit.js is guarded the same way (checks #tab-cockpit exists).
      if (typeof Cockpit !== 'undefined') Cockpit.render();

      if (loadedCount > 0) {
        API.reportPriceSuccess();
      } else {
        // Surface the first real error rather than a generic message
        const firstErr = errors[0] || '';
        let errMsg;
        if (firstErr.includes('401') || firstErr.includes('Unauthorized') || firstErr.includes('API key'))
          errMsg = '❌ Finnhub 401 — בדוק FINNHUB_API_KEY ב-Script Properties';
        else if (firstErr.includes('429') || firstErr.includes('Rate Limit'))
          errMsg = '⚠️ Finnhub 429 — חרגת ממכסת הקריאות';
        else if (firstErr.includes('FINNHUB_API_KEY חסר'))
          errMsg = '❌ הגדר FINNHUB_API_KEY ב-Script Properties של Apps Script';
        else if (firstErr.includes('network') || firstErr.includes('רשת'))
          errMsg = '❌ שגיאת רשת — בדוק חיבור לאינטרנט';
        else if (firstErr)
          errMsg = '⚠️ ' + firstErr.slice(0, 80);
        else
          errMsg = '⚠️ לא ניתן לטעון מחירים';
        console.error('[prices] errors:', errors.join(' | '));
        API.reportPriceError(errMsg, manual);
      }
    } finally {
      if (manual) API.setButtonBusy('pos-refresh-btn', false);
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
  // Alerts are recomputed on every price poll (every ~15s), but the SAME
  // alert (same symbol + type + threshold) must only ever pop as a toast
  // once per day — otherwise every polling cycle re-triggers the same
  // "down 5%" toast forever. Shown/dismissed alert IDs are tracked in
  // localStorage so a "🔴 N alerts" badge (not a toast) is the steady
  // state once the user has already seen them.

  function _alertId(type, symbol, threshold) {
    return symbol + '_' + type + '_' + threshold;
  }

  function _todayKey() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function _loadShownMap() { return LS.get(ALERT_SHOWN_KEY, {}); }
  function _saveShownMap(map) { LS.set(ALERT_SHOWN_KEY, map); }

  function _computeActiveAlerts() {
    const alerts = [];
    // Settings' "התראת Stop Loss" (alertStop) gates the two stop-related
    // categories below (hit + approaching) — previously collected but never
    // actually consulted, so turning this toggle off had no effect.
    const stopAlertsEnabled = Settings.get('alertStop') !== false;
    APP.positions.forEach(p => {
      const live = APP.liveData[p.symbol];
      if (!live?.price) return;
      const price = live.price;
      const pct   = (price - p.avg_price) / p.avg_price * 100;
      if (p.target && price >= p.target) {
        alerts.push({ id: _alertId('target', p.symbol, p.target), type: 'target', symbol: p.symbol,
          msg: `${icon('target')} ${p.symbol} הגיע ליעד! <bdi>${fprice(price)} ≥ ${fprice(p.target)}</bdi>` });
      }
      if (stopAlertsEnabled && p.stop_loss && price <= p.stop_loss) {
        alerts.push({ id: _alertId('stop', p.symbol, p.stop_loss), type: 'stop', symbol: p.symbol,
          msg: `${icon('octagon')} ${p.symbol} פגע בסטופ! <bdi>${fprice(price)} ≤ ${fprice(p.stop_loss)}</bdi>` });
      }
      if (stopAlertsEnabled && pct <= WARN_THRESHOLD_PCT && (!p.stop_loss || price > p.stop_loss)) {
        alerts.push({ id: _alertId('warn', p.symbol, WARN_THRESHOLD_PCT), type: 'warn', symbol: p.symbol,
          msg: `${icon('alert-triangle')} ${p.symbol} ירד <bdi>${pct.toFixed(1)}%</bdi> מהכניסה` });
      }
    });
    return alerts;
  }

  function checkAlerts() {
    const badge = document.getElementById('alert-badge');
    if (!APP.positions.length) {
      if (badge) badge.style.display = 'none';
      return;
    }

    const alerts = _computeActiveAlerts();
    _updateAlertBadge(alerts);
    if (!alerts.length) return;

    const shown = _loadShownMap();
    const today = _todayKey();
    const newAlerts = alerts.filter(a => shown[a.id] !== today);
    if (!newAlerts.length) return; // every active alert was already toasted today

    const priority = newAlerts.find(a=>a.type==='stop') || newAlerts.find(a=>a.type==='target') || newAlerts[0];
    _showToast(priority, alerts.length - 1);

    shown[priority.id] = today;
    _saveShownMap(shown);
  }

  function _showToast(priority, extraCount) {
    const banner = document.getElementById('alert-banner');
    if (!banner) return;
    clearTimeout(banner._hideTimer);
    banner.className = 'alert-banner ' + priority.type;
    banner.style.display = 'flex';
    banner.innerHTML = `
      <span>${priority.msg}${extraCount>0?` <span style="color:var(--text-3);font-size:11px">(+${extraCount})</span>`:''}</span>
      <button onclick="Positions.dismissAlert()" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-3);padding:0 4px">✕</button>
    `;
    banner._hideTimer = setTimeout(() => { banner.style.display = 'none'; }, 6000);
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
    clearTimeout(banner._hideTimer);
    banner.style.display = 'none';
  }

  function _updateAlertBadge(alerts) {
    const badge = document.getElementById('alert-badge');
    if (!badge) return;
    if (!alerts.length) { badge.style.display = 'none'; hideAlertList(); return; }
    badge.style.display = 'inline-flex';
    badge.innerHTML = icon('alert-triangle') + ' ' + alerts.length + ' התראות';
    badge._alerts = alerts; // read by showAlertList()
  }

  function toggleAlertList() {
    const dd = document.getElementById('alert-list-dropdown');
    if (!dd) return;
    dd.style.display === 'block' ? hideAlertList() : showAlertList();
  }

  function showAlertList() {
    const dd    = document.getElementById('alert-list-dropdown');
    const badge = document.getElementById('alert-badge');
    if (!dd || !badge) return;
    const alerts = badge._alerts || [];
    dd.innerHTML = alerts.length
      ? alerts.map(a => `<div class="alert-list-item alert-list-item--${a.type}">${a.msg}</div>`).join('')
      : '<div class="alert-list-item">אין התראות פעילות</div>';
    dd.style.display = 'block';
    _repositionAlertList(dd, badge);
  }

  function hideAlertList() {
    const dd = document.getElementById('alert-list-dropdown');
    if (dd) { dd.style.display = 'none'; dd.style.top = ''; }
  }

  // The dropdown is `position:absolute` under the alert badge (top action
  // row), but the category nav row (.main-nav) sits directly below that
  // row — at desktop widths the dropdown's default offset lands on top of
  // it, silently swallowing clicks meant for the nav buttons underneath
  // (confirmed via elementFromPoint: the nav button never received the
  // click at all). Fix: when .main-nav is actually visible (desktop/
  // tablet — it's hidden entirely on mobile, which uses the bottom nav
  // instead, so this is a no-op there), push the dropdown's top down to
  // clear the nav row's own bottom edge instead of just the badge's.
  function _repositionAlertList(dd, badge) {
    const nav = document.querySelector('.main-nav');
    if (!nav) return;
    const navRect  = nav.getBoundingClientRect();
    const wrapRect = badge.closest('.alert-badge-wrap').getBoundingClientRect();
    if (navRect.height > 0 && navRect.bottom > wrapRect.bottom) {
      dd.style.top = (navRect.bottom - wrapRect.top + 8) + 'px';
    }
  }

  // Click-outside-to-close: without this, the dropdown stayed open
  // indefinitely once opened (nothing ever closed it), which is what let
  // it sit on top of the nav row blocking clicks. Clicking the badge
  // itself is left to its own onclick (toggleAlertList) so it isn't
  // double-toggled; clicking anywhere else — including inside the
  // dropdown, which has no other defined action per row — just closes it.
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('alert-list-dropdown');
    const badge = document.getElementById('alert-badge');
    if (!dd || dd.style.display !== 'block') return;
    if (badge && badge.contains(e.target)) return;
    hideAlertList();
  });

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
    const riskPct    = (totalRisk / (APP.monthGoal > 0 ? APP.monthGoal * 13.4 : Settings.get('portfolioSize')) * 100).toFixed(1);
    document.getElementById('rr-risk').textContent   = risk   > 0 ? `$${risk.toFixed(2)}`   : '—';
    document.getElementById('rr-reward').textContent = reward > 0 ? `$${reward.toFixed(2)}` : '—';
    const ratioEl = document.getElementById('rr-ratio');
    ratioEl.textContent = ratio > 0 ? `1:${ratio.toFixed(2)}` : '—';
    ratioEl.style.color = ratio >= 2 ? 'var(--green)' : ratio >= 1 ? 'var(--blue)' : 'var(--red)';
    document.getElementById('rr-total-risk').textContent = qty && risk > 0 ? `$${totalRisk.toFixed(0)} (${riskPct}%)` : '—';
  }

  // ── CRUD ────────────────────────────────────────────────
  // WRITE-THROUGH (create-only): a brand-new position (a symbol with no
  // open FIFO lot yet) now appends a real BUY row to "פעולות" itself —
  // see API.appendOperation / AppScript_FULL.gs handleAppendOperation_.
  // "פעולות" stays the single source of truth; nothing here writes to the
  // legacy Positions sheet. Editing an *existing* derived position's
  // target/stop/notes (openEdit below) is unchanged — that already-correct
  // path still uses upsertPositionMeta, matched by symbol. See
  // docs/TECHNICAL_DEBT.md "Persistence architecture".

  function openForm() {
    APP.posEditId = null;
    document.getElementById('pos-modal-title').textContent = 'פוזיציה חדשה';
    ['symbol','qty','price','target','stop','notes'].forEach(f => {
      const el = document.getElementById('pf-'+f);
      if (el) el.value = '';
    });
    document.getElementById('pf-date').value = new Date().toISOString().split('T')[0];
    // Symbol/date/qty/price are read-only only when editing an *existing*
    // FIFO-derived position (openEdit below) — for a brand-new position
    // they ARE the fact being written (a BUY row), so they're editable here.
    ['pf-symbol','pf-date','pf-qty','pf-price'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });
    const note = document.getElementById('pos-modal-note');
    if (note) note.textContent = 'פוזיציה חדשה נכתבת כפעולת קנייה (BUY) אמיתית ביומן הפעולות. יעד/סטופ/הערות נשמרים בנפרד ואפשר לערוך אותם בכל עת אחר כך.';
    const rrBox = document.getElementById('rr-box');
    if (rrBox) rrBox.style.display = 'none';
    document.getElementById('modal-pos').style.display = 'flex';
  }

  function openEdit(id) {
    APP.posEditId = id;
    const p = APP.positions.find(x => x.id === id);
    if (!p) return;
    document.getElementById('pos-modal-title').textContent = 'עריכת פוזיציה';
    // Existing FIFO-derived position: symbol/date/qty/avg-price always come
    // from "פעולות" — read-only here (a new BUY/SELL op is the only way to
    // change them, not this modal).
    ['pf-symbol','pf-date','pf-qty','pf-price'].forEach(id2 => {
      const el = document.getElementById(id2);
      if (el) el.disabled = true;
    });
    const note = document.getElementById('pos-modal-note');
    if (note) note.textContent = 'סימבול, תאריך, כמות ומחיר קנייה ממוצע מגיעים מיומן העסקאות (FIFO) ואינם ניתנים לעריכה ידנית. ניתן לערוך יעד, סטופ לוס והערות בלבד.';
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
    if (APP.posEditId === null) return _submitNewPosition();

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

    // Saved by symbol, not id: positions from getOperations (the primary data
    // path) get a synthetic id recomputed on every load that never matches a
    // real row in the Positions sheet — saving by id there silently dropped
    // target/stop-loss/notes. See AppScript_FULL.gs handleUpsertPositionMeta_.
    const res = await API.upsertPositionMeta(pos);
    API.showSpinner(false);

    if (!res.ok) {
      API.setStatus('❌ ' + (res.error || 'שמירת הפוזיציה נכשלה'), 'error');
      render();
      return;
    }

    APP.positions = APP.positions.map(p => p.id === editingId ? { ...p, ...pos } : p);
    LS.set('fifo_positions_backup', APP.positions);
    API.setStatus('✓ פוזיציה עודכנה', 'ok');
    render();

    if (!APP.liveData[sym]) {
      const d = await API.fetchPrice(sym);
      if (d) { APP.liveData[sym] = d; render(); }
    }
  }

  // New position = a real BUY fact appended to "פעולות" (write-through,
  // create-only — see AppScript_FULL.gs handleAppendOperation_), followed
  // by a full reload from getOperations so the new position is only ever
  // shown once the backend itself confirms it via real FIFO derivation
  // (never optimistically inserted into APP.positions client-side). If
  // target/stop/notes were also filled in, they're attached afterward via
  // the already-correct, symbol-keyed upsertPositionMeta — same call
  // openEdit's submit() above uses for an existing position.
  async function _submitNewPosition() {
    const sym   = (document.getElementById('pf-symbol').value || '').trim().toUpperCase();
    const qty   = +document.getElementById('pf-qty').value;
    const price = +document.getElementById('pf-price').value;
    const rawDate = document.getElementById('pf-date').value; // ISO, native <input type="date">
    if (!sym || !qty || !price || !rawDate) {
      alert('נא למלא סימבול, תאריך, כמות ומחיר קנייה');
      return;
    }

    const target   = +document.getElementById('pf-target').value || 0;
    const stopLoss = +document.getElementById('pf-stop').value   || 0;
    const notes    = document.getElementById('pf-notes').value.trim();

    closeForm();
    API.setStatus('יוצר פוזיציה חדשה — נכתב כפעולת BUY ביומן הפעולות...', 'info');
    API.showSpinner(true);

    const res = await API.appendOperation({ date: rawDate, symbol: sym, action: 'BUY', qty, price, notes: '' });
    if (!res.ok) {
      API.showSpinner(false);
      API.setStatus('❌ ' + (res.error || 'כתיבת הפוזיציה נכשלה'), 'error');
      return;
    }

    // Verify by reloading real data from getOperations — never assume the
    // append landed correctly, and never optimistically fabricate a local
    // position row the way the old (broken) path used to.
    const loaded = await load();
    API.showSpinner(false);

    if (!loaded) {
      API.setStatus('⚠️ הפוזיציה נכתבה, אך הרענון מהשרת נכשל — רענן ידנית כדי לוודא', 'warn');
      return;
    }

    const created = APP.positions.find(p => p.symbol === sym);
    if (!created) {
      API.setStatus('⚠️ הפוזיציה נכתבה ביומן הפעולות אך לא הופיעה כפוזיציה פתוחה — בדוק את הנתונים', 'warn');
      renderAll();
      return;
    }

    if (target || stopLoss || notes) {
      const metaRes = await API.upsertPositionMeta({ symbol: sym, target, stop_loss: stopLoss, notes });
      if (metaRes.ok) await load();
      else API.setStatus('✓ פוזיציה נוספה, אך שמירת יעד/סטופ/הערות נכשלה: ' + (metaRes.error || ''), 'warn');
    }

    invalidateStats();
    API.setStatus('✓ פוזיציה נוספה', 'ok');
    renderAll();

    if (!APP.liveData[sym]) {
      const d = await API.fetchPrice(sym);
      if (d) { APP.liveData[sym] = d; render(); }
    }
  }

  // Delete Position (write-through correction, create-only): a position is
  // an OPEN lot — the shares are still available in FIFO's bookkeeping —
  // so a mistaken one is deleted by appending a SELL of the full
  // remaining quantity at the exact same price as its cost basis
  // (avg_price), via the same appendOperation endpoint everything else in
  // this file already uses. Since sell price == buy price, gross/tax/net
  // all land at $0 — the position closes out with zero P&L impact. Pure
  // addition, no mutation of any existing row, no new backend logic. If
  // avg_price blends multiple separate buy lots, this may show up as a
  // few small offsetting trades that net to exactly $0 in total rather
  // than one single $0 trade — cosmetically noisy, economically correct.
  // This does NOT extend to closed trades (Edit/Delete Trade, still
  // disabled) — a closed trade's lot is already fully consumed by its
  // matching sell, so there's nothing left to sell back; that remains a
  // separate, harder, deliberately deferred problem (would need backend
  // row-provenance tracking, out of scope here).
  async function remove(id) {
    const p = APP.positions.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`למחוק את הפוזיציה ${p.symbol}? הפעולה תיכתב כמכירה מלאה של ${fnum(p.qty)} מניות במחיר העלות (${fprice(p.avg_price)}) ביומן הפעולות — ללא השפעה על הרווח/הפסד.`)) return;

    API.setStatus('מוחק פוזיציה — נכתב כפעולת SELL במחיר עלות ביומן הפעולות...', 'info');
    API.showSpinner(true);

    const today = new Date().toISOString().split('T')[0];
    const res = await API.appendOperation({ date: today, symbol: p.symbol, action: 'SELL', qty: p.qty, price: p.avg_price, notes: '' });
    if (!res.ok) {
      API.showSpinner(false);
      API.setStatus('❌ ' + (res.error || 'מחיקת הפוזיציה נכשלה'), 'error');
      return;
    }

    // Verify by reloading real data from getOperations — never assume the
    // append landed correctly, same discipline as every other write-through
    // path in this file.
    const loaded = await load();
    API.showSpinner(false);

    if (!loaded) {
      API.setStatus('⚠️ הפעולה נכתבה, אך הרענון מהשרת נכשל — רענן ידנית כדי לוודא', 'warn');
      return;
    }

    if (APP.positions.some(x => x.symbol === p.symbol)) {
      API.setStatus('⚠️ הפוזיציה עדיין מופיעה כפתוחה — ייתכן שהייתה כמות נוספת שלא נלקחה בחשבון', 'warn');
      renderAll();
      return;
    }

    invalidateStats();
    API.setStatus('✓ הפוזיציה נמחקה (ללא השפעה על רווח/הפסד)', 'ok');
    renderAll();
  }

  return {
    render, refreshPrices, connectWS,
    checkAlerts, dismissAlert, toggleAlertList, showAlertList, hideAlertList,
    riskStatus, calcRR,
    openForm, openEdit, closeForm, submit, remove,
  };
})();
