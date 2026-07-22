/**
 * FIFO PRO 2.0 — versionGuard.js
 * Mandatory update mechanism (Dana-Care-style, adapted to GitHub Pages).
 *
 * Truth model:
 *   · js/version.js   → window.APP_BUILD — the version of the RUNNING bundle
 *                        (stamped at release by tools/bump-version.sh).
 *   · version.json    → the version of the DEPLOYED release, fetched with
 *                        cache:'no-store' (and never SW-cached — sw.js
 *                        passes it straight to the network).
 *
 * When deployed > running:
 *   1. A BLOCKING overlay covers the app — no close button, focus trapped,
 *      aria-modal, Quiet Terminal styled, dark/light, RTL, safe-areas.
 *   2. Writes are refused (assertUpToDate() is called by every write path).
 *   3. "עדכון עכשיו" → snapshot open drafts → registration.update() →
 *      SKIP_WAITING to the waiting worker → controllerchange → reload.
 *      Without a SW (plain-browser/dev), a cache-busted hard reload.
 *   4. After reload, drafts are restored and the landed version verified;
 *      a sessionStorage attempt-marker prevents reload loops — if the
 *      same target build fails to land twice, we STOP and show a manual-
 *      recovery message instead of looping.
 *   5. Offline: no update possible — explain, block writes, auto-retry on
 *      'online'. Never a blank screen, never a loop.
 *
 * Check triggers: app boot (post-auth), tab visibility→visible, network
 * 'online', every 15 minutes while open, and immediately before every
 * significant write (the pre-write guard).
 */

const VersionGuard = (() => {
  const CHECK_INTERVAL_MS = 15 * 60 * 1000;
  const ATTEMPT_KEY = 'fifo_update_attempt_v1';   // sessionStorage: {target, tries}
  const DRAFT_KEY   = 'fifo_update_draft_v1';     // sessionStorage: open-work snapshot

  let latest = null;          // last fetched version.json
  let blocked = false;        // true ⇒ overlay up, writes refused
  let timer = null;
  let checking = false;

  const build = () => window.APP_BUILD || { version: '0', build: '0', cache: '' };
  const newer = (a, b) => a && b && a.build !== b.build;   // any drift ⇒ update (build ids are unique per release)

  // ── Detection ─────────────────────────────────────────────
  async function check(reason) {
    if (checking) return blocked;
    checking = true;
    try {
      const res = await fetch('version.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return blocked;
      latest = await res.json();
      if (newer(latest, build())) {
        _show(latest);
      } else if (blocked) {
        // We were blocked but are now current (e.g. update landed in
        // another tab and this one reloaded) — release.
        _hide();
      }
    } catch (_) {
      // Network failure is NOT a version mismatch — stay as we are.
    } finally {
      checking = false;
    }
    return blocked;
  }

  // ── Pre-write guard ───────────────────────────────────────
  // Called synchronously by every significant write path. If we already
  // KNOW we're stale, refuse immediately; also fire an async re-check so
  // a stale tab discovers a fresh deploy at the moment it matters most.
  function assertUpToDate() {
    check('pre-write');
    if (blocked) {
      if (typeof API !== 'undefined' && API.setStatus) {
        API.setStatus('גרסה חדשה של FIFO PRO זמינה — יש לעדכן לפני שמבצעים פעולות', 'warn');
      }
      return false;
    }
    return true;
  }

  // ── Overlay ───────────────────────────────────────────────
  function _show(v) {
    blocked = true;
    let el = document.getElementById('update-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'update-overlay';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'update-title');
      document.body.appendChild(el);
    }
    const offline = !navigator.onLine;
    el.innerHTML = `
      <div class="update-card">
        <div class="update-brand">FIFO <b>PRO</b></div>
        <h2 id="update-title">גרסה חדשה של FIFO PRO זמינה</h2>
        <p class="update-sub">כדי להמשיך להשתמש במערכת יש לעדכן לגרסה החדשה. הנתונים שלך שמורים בענן ולא יושפעו.</p>
        <div class="update-meta num"><bdi>${build().version} (${build().build})</bdi> ← <bdi>${v.version} (${v.build})</bdi></div>
        ${offline ? `
          <div class="update-offline">${icon('alert-triangle')} אין חיבור לאינטרנט — לא ניתן להשלים את העדכון כרגע. נמשיך אוטומטית כשהחיבור יחזור.</div>
        ` : `
          <button class="btn btn-primary update-btn" id="update-btn" onclick="VersionGuard.applyUpdate()">עדכון עכשיו</button>
        `}
        <div class="update-status" id="update-status"></div>
      </div>`;
    el.classList.add('open');
    document.body.classList.add('update-locked');
    // Focus the action; trap Tab inside the overlay.
    setTimeout(() => document.getElementById('update-btn')?.focus(), 60);
    el.onkeydown = (e) => {
      if (e.key === 'Tab') {
        const b = document.getElementById('update-btn');
        if (b) { e.preventDefault(); b.focus(); }
      }
      if (e.key === 'Escape') e.preventDefault();   // no escape — mandatory
    };
    _checkLoopSafety(v);
  }

  function _hide() {
    blocked = false;
    document.getElementById('update-overlay')?.classList.remove('open');
    document.body.classList.remove('update-locked');
  }

  // If we ALREADY reloaded for this exact target and still run an old
  // build, do not loop — surface a manual recovery path instead.
  function _checkLoopSafety(v) {
    try {
      const a = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null');
      if (a && a.target === v.build && a.tries >= 2) {
        const st = document.getElementById('update-status');
        if (st) st.innerHTML =
          'העדכון לא הושלם אחרי שני ניסיונות. סגור את כל הטאבים של FIFO PRO ופתח מחדש. אם זה חוזר: נקה נתוני אתר בדפדפן (Cache בלבד — לא נתוני מסחר).';
        const b = document.getElementById('update-btn');
        if (b) b.textContent = 'נסה שוב';
      }
    } catch (_) {}
  }

  // ── Draft preservation ────────────────────────────────────
  function _snapshotDrafts() {
    try {
      const draft = {};
      const t = document.getElementById('trade-ticket');
      if (t && t.classList.contains('open')) {
        draft.ticket = {};
        t.querySelectorAll('input, select, textarea').forEach(i => { if (i.id) draft.ticket[i.id] = i.value; });
      }
      const chat = document.getElementById('chat-input');
      if (chat && chat.value.trim()) draft.chat = chat.value;
      const jm = document.getElementById('modal-journal');
      if (jm && jm.style.display !== 'none' && jm.style.display !== '') {
        draft.journal = {};
        jm.querySelectorAll('input, select, textarea').forEach(i => { if (i.id) draft.journal[i.id] = i.value; });
        draft.journalId = APP.journalId;
      }
      if (Object.keys(draft).length) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (_) {}
  }

  function restoreDrafts() {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(DRAFT_KEY);
      const draft = JSON.parse(raw);
      if (draft.chat) {
        const chat = document.getElementById('chat-input');
        if (chat) chat.value = draft.chat;
      }
      if (draft.ticket && typeof TradeTicket !== 'undefined') {
        openTradeTicket({});
        setTimeout(() => {
          Object.entries(draft.ticket).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
          });
          if (typeof TradeTicket.recalc === 'function') TradeTicket.recalc();
          if (typeof API !== 'undefined' && API.setStatus) API.setStatus('הטיוטה שלך שוחזרה אחרי העדכון', 'ok');
        }, 120);
      }
      if (draft.journal && draft.journalId != null && typeof Journal !== 'undefined') {
        Journal.openModal(draft.journalId);
        setTimeout(() => {
          Object.entries(draft.journal).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
          });
        }, 120);
      }
    } catch (_) {}
  }

  // ── The update flow ───────────────────────────────────────
  async function applyUpdate() {
    const btn = document.getElementById('update-btn');
    const st  = document.getElementById('update-status');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner update-spinner"></span> מעדכן את FIFO PRO…'; }
    if (st) st.textContent = '';

    // Record the attempt (loop safety)
    try {
      const prev = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null');
      const tries = (prev && prev.target === (latest?.build || '')) ? prev.tries + 1 : 1;
      sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ target: latest?.build || '', tries }));
    } catch (_) {}

    _snapshotDrafts();

    const finishByReload = () => {
      // A tiny delay lets the new worker finish claiming before we load.
      setTimeout(() => location.reload(), 80);
    };

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          // One reload per controllerchange, guarded against double-fire.
          let reloaded = false;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloaded) return;
            reloaded = true;
            finishByReload();
          });

          await reg.update();

          // Wait (bounded) for a waiting/installing→installed worker.
          const waiting = await _awaitWaitingWorker(reg, 20000);
          if (waiting) {
            waiting.postMessage({ type: 'SKIP_WAITING' });
            // controllerchange listener above completes the flow.
            // Safety net: if controllerchange never fires (edge cases),
            // fall through to a plain reload after a bounded wait.
            setTimeout(() => { if (!reloaded) finishByReload(); }, 8000);
            return;
          }
          // No waiting worker appeared — either the browser already
          // activated it, or sw.js didn't change (dev). Reload lands on
          // whatever is newest.
          finishByReload();
          return;
        }
      }
      // No SW at all (plain browser/dev preview): hard reload.
      finishByReload();
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'נסה שוב'; }
      if (st) st.textContent = 'העדכון נכשל: ' + (err && err.message ? err.message : 'שגיאת רשת') + ' — בדוק את החיבור ונסה שוב.';
    }
  }

  function _awaitWaitingWorker(reg, timeoutMs) {
    return new Promise(resolve => {
      if (reg.waiting) return resolve(reg.waiting);
      const t = setTimeout(() => resolve(reg.waiting || null), timeoutMs);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed') { clearTimeout(t); resolve(reg.waiting || w); }
        });
      });
    });
  }

  // ── Post-boot verification ────────────────────────────────
  // Called once after boot: if we successfully landed on the attempted
  // target, clear the attempt marker (so future updates start fresh).
  function verifyLanded() {
    try {
      const a = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null');
      if (a && a.target === build().build) sessionStorage.removeItem(ATTEMPT_KEY);
    } catch (_) {}
  }

  // ── Wiring ────────────────────────────────────────────────
  function init() {
    verifyLanded();
    restoreDrafts();
    check('boot');
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check('visible');
    });
    window.addEventListener('online',  () => { check('online'); });
    window.addEventListener('offline', () => { if (blocked) _show(latest || {version:'?', build:'?'}); });
    if (!timer) timer = setInterval(() => check('interval'), CHECK_INTERVAL_MS);
  }

  return { init, check, assertUpToDate, applyUpdate, restoreDrafts, isBlocked: () => blocked };
})();
