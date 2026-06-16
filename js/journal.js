/**
 * FIFO PRO — journal.js
 * Trade journal: modal, render, notes
 * Depends on: utils.js, api.js, app.js
 */

const Journal = (() => {
  const { f$, fpct, parseDD } = Utils;

  // ── Render Journal Table ─────────────────────────────────

  function render() {
    const tbody = document.getElementById('journal-tbody');
    if (!tbody) return;

    const q    = (document.getElementById('journal-search')?.value || '').toLowerCase();
    const sym  = document.getElementById('journal-filter-sym')?.value  || '';
    const plan = document.getElementById('journal-filter-plan')?.value || '';

    // Populate symbol filter once
    const jss = document.getElementById('journal-filter-sym');
    if (jss && jss.options.length <= 1) {
      const syms = [...new Set(APP.trades.map(t => t.symbol))].sort();
      syms.forEach(s => {
        const o = document.createElement('option');
        o.value = s; o.textContent = s;
        jss.appendChild(o);
      });
    }

    let rows = [...APP.trades].sort((a,b) => parseDD(b.sell_date) - parseDD(a.sell_date));
    if (sym)  rows = rows.filter(t => t.symbol === sym);
    if (plan) rows = rows.filter(t => t.followed_plan === plan);
    if (q)    rows = rows.filter(t =>
      t.symbol.toLowerCase().includes(q) ||
      (t.entry_reason||'').toLowerCase().includes(q) ||
      (t.lesson||'').toLowerCase().includes(q) ||
      (t.emotion||'').toLowerCase().includes(q)
    );

    tbody.innerHTML = rows.map(t => `
      <tr>
        <td style="font-weight:700">${t.symbol}</td>
        <td style="color:var(--text-3)">${t.sell_date}</td>
        <td class="${t.net>=0?'green':'red'}" style="font-weight:700">${f$(Math.round(t.net))}</td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${t.entry_reason || '<span style="color:var(--text-3)">—</span>'}
        </td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${t.exit_reason || '<span style="color:var(--text-3)">—</span>'}
        </td>
        <td>${t.respected_stop
          ? `<span class="badge ${t.respected_stop==='כן'?'badge-green':'badge-red'}">${t.respected_stop}</span>`
          : '—'}</td>
        <td>${t.followed_plan
          ? `<span class="badge ${t.followed_plan==='כן'?'badge-green':t.followed_plan==='חלקית'?'badge-gold':'badge-red'}">${t.followed_plan}</span>`
          : '—'}</td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-3)">
          ${t.lesson || '—'}
        </td>
        <td style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-3)">
          ${t.emotion || '—'}
        </td>
        <td>
          <button class="btn-icon" onclick="Journal.openModal(${t.id})">✏️</button>
        </td>
      </tr>
    `).join('');
  }

  // ── Journal Modal ────────────────────────────────────────

  function openModal(id) {
    APP.journalId = id;
    const t = APP.trades.find(x => x.id === id);
    if (!t) return;
    document.getElementById('j-title').textContent = `${t.symbol} ${t.sell_date}`;
    document.getElementById('j-entry').value   = t.entry_reason    || '';
    document.getElementById('j-exit').value    = t.exit_reason     || '';
    document.getElementById('j-stop').value    = t.respected_stop  || '';
    document.getElementById('j-plan').value    = t.followed_plan   || '';
    document.getElementById('j-lesson').value  = t.lesson          || '';
    document.getElementById('j-emotion').value = t.emotion         || '';
    document.getElementById('modal-journal').style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('modal-journal').style.display = 'none';
    APP.journalId = null;
  }

  async function save() {
    const t = APP.trades.find(x => x.id === APP.journalId);
    if (!t) { closeModal(); return; }
    const updated = {
      ...t,
      entry_reason:   document.getElementById('j-entry').value.trim(),
      exit_reason:    document.getElementById('j-exit').value.trim(),
      respected_stop: document.getElementById('j-stop').value,
      followed_plan:  document.getElementById('j-plan').value,
      lesson:         document.getElementById('j-lesson').value.trim(),
      emotion:        document.getElementById('j-emotion').value.trim(),
    };
    closeModal();
    API.setStatus('שומר יומן...', 'info');
    const res = await API.updateTrade(updated);
    if (res.ok) {
      APP.trades = APP.trades.map(x => x.id === updated.id ? updated : x);
      invalidateStats();
      API.setStatus('✓ יומן נשמר', 'ok');
      render();
      Trades.render();
    } else {
      API.setStatus('❌ שגיאה בשמירה', 'error');
    }
  }

  // ── Notes Modal ──────────────────────────────────────────

  function openNote(id) {
    APP.noteId = id;
    const t = APP.trades.find(x => x.id === id);
    document.getElementById('note-text').value = t?.notes || '';
    document.getElementById('modal-note').style.display = 'flex';
  }

  function closeNote() {
    document.getElementById('modal-note').style.display = 'none';
    APP.noteId = null;
  }

  async function saveNote() {
    const txt = document.getElementById('note-text').value.trim();
    const t   = APP.trades.find(x => x.id === APP.noteId);
    if (!t) { closeNote(); return; }
    closeNote();
    API.setStatus('שומר הערה...', 'info');
    const res = await API.updateTrade({ ...t, notes: txt });
    if (res.ok) {
      APP.trades = APP.trades.map(x => x.id === t.id ? { ...x, notes: txt } : x);
      API.setStatus('✓ הערה נשמרה', 'ok');
      Trades.render();
    } else {
      API.setStatus('❌ שגיאה', 'error');
    }
  }

  return { render, openModal, closeModal, save, openNote, closeNote, saveNote };
})();
