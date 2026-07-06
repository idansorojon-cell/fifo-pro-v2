/**
 * FIFO PRO — auth.js
 * Login, session management, 30-day token, SHA-256 password hashing
 * Depends on: utils.js, api.js
 */

const Auth = (() => {
  // ── Auth bypass flag ────────────────────────────────────────
  // true  → skip login screen entirely, load dashboard immediately (testing mode)
  // false → full session auth enforced (production mode)
  // Phase 1 (owner login): must match the AUTH_DISABLED flag in api.js AND
  // AppScript_FULL.gs. The backend flag only takes effect after a manual
  // Apps Script redeploy — see docs/PROJECT_OVERVIEW.md "Deployment".
  const AUTH_DISABLED = false;

  const TOKEN_KEY    = 'fifo_session_v1';
  const EXPIRY_DAYS  = 30;
  const BRIEF_SHOWN  = 'fifo_brief_shown';
  const LAST_VISIT   = 'fifo_last_visit';

  // All localStorage keys that contain private trading data.
  // fifo_dark (theme) is intentionally excluded — it is not sensitive.
  const PRIVATE_KEYS = [
    'fifo_session_v1',
    'fifo_positions_backup',
    'fifo_watchlist',
    'fifo_trades',
    'fifo_journal',
    'fifo_prefs',
    'fifo_last_visit',
    'fifo_brief_shown',
    'fifo_aicoach',
    'fifo_goal',
    'fifo_livedata',
  ];

  function clearPrivateCache() {
    // Remove known private keys
    PRIVATE_KEYS.forEach(k => localStorage.removeItem(k));
    // Also sweep for any unknown fifo_ keys except theme
    Object.keys(localStorage)
      .filter(k => k.startsWith('fifo_') && k !== 'fifo_dark' && k !== 'fifo_local_pw_hash' && k !== 'fifo_local_username')
      .forEach(k => localStorage.removeItem(k));
    // Clear any SW cache partitions named 'fifo-*'
    if ('caches' in window) {
      caches.keys().then(names => names
        .filter(n => n.startsWith('fifo-'))
        .forEach(n => caches.delete(n))
      );
    }
  }

  // ── Web Crypto SHA-256 ──────────────────────────────────
  async function sha256(str) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    } catch {
      // Fallback: simple obfuscation if SubtleCrypto unavailable (HTTP)
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash).toString(16).padStart(8,'0') + str.length.toString(16);
    }
  }

  // ── Token helpers ───────────────────────────────────────
  function getStoredToken() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || Date.now() > data.expiry) {
        localStorage.removeItem(TOKEN_KEY);
        return null;
      }
      return data.token;
    } catch { return null; }
  }

  // role defaults to 'owner' — every Phase 1 session (before the viewer
  // role existed) is an owner session, and this keeps an already-logged-in
  // browser working without forcing a re-login after this Phase 2 update.
  // username/displayName (Phase 3) are UI-only — see getDisplayName().
  function saveToken(token, role, displayName, username) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      token,
      role: role || 'owner',
      displayName: displayName || '',
      username: username || '',
      expiry: Date.now() + EXPIRY_DAYS * 86400000
    }));
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function isLoggedIn() {
    return !!getStoredToken();
  }

  function getToken() {
    return getStoredToken();
  }

  // Only ever consulted by the frontend for UI purposes (e.g. showing/
  // hiding the Settings "Manage Viewer" section) — never for enforcing
  // access to anything. The backend independently re-derives and checks
  // the role from its own session store on every request; the frontend's
  // copy is just a display convenience and is never trusted for security.
  function getRole() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return 'owner';
      const data = JSON.parse(raw);
      return (data && data.role) || 'owner';
    } catch { return 'owner'; }
  }

  function isViewer() { return getRole() === 'viewer'; }
  function isOwner()  { return getRole() === 'owner'; }

  // Phase 3 personal greeting — display name is purely cosmetic (see
  // saveToken/handleLogin_ comments), never used for any permission
  // decision. Fallback chain: display name -> username typed at login ->
  // a role-based default, exactly as specified.
  function getDisplayName() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return 'Owner';
      const data = JSON.parse(raw);
      if (data && data.displayName) return data.displayName;
      if (data && data.username) return data.username;
      return (data && data.role === 'viewer') ? 'Viewer' : 'Owner';
    } catch { return 'Owner'; }
  }

  // ── Last-visit tracking ─────────────────────────────────
  function getLastVisit() {
    try { return JSON.parse(localStorage.getItem(LAST_VISIT)); } catch { return null; }
  }
  function saveLastVisit() {
    localStorage.setItem(LAST_VISIT, JSON.stringify({
      ts: Date.now(),
      trades: (window.APP?.trades?.length) || 0
    }));
  }

  // ── Login ───────────────────────────────────────────────
  // username is currently only meaningfully checked server-side once
  // OWNER_USERNAME is set in Script Properties and AppScript_FULL.gs is
  // redeployed (see handleLogin_) — until then the backend accepts any
  // username alongside the correct password, same as before this phase.
  async function login(username, password) {
    if (!username || !username.trim()) return { ok: false, error: 'הכנס שם משתמש' };
    if (!password.trim()) return { ok: false, error: 'הכנס סיסמה' };

    const user = username.trim();
    const hash = await sha256(password.trim());

    // Try backend verification
    if (API.isConfigured()) {
      try {
        const res = await API.verifyLogin(user, hash);
        if (res.ok && res.token) {
          saveToken(res.token, res.role, res.displayName, user);
          return { ok: true };
        }
        if (res.authDisabled) {
          // Backend has no password set — allow through.
          // MUST save exactly 'auth-disabled' — Apps Script validateToken_() checks this literal.
          saveToken('auth-disabled');
          return { ok: true };
        }
        // Deployment misconfiguration — don't fall to offline, show clear error
        if (res.deploymentError) {
          return { ok: false, error: res.error };
        }
        return { ok: false, error: res.error || 'שם משתמש או סיסמה שגויים' };
      } catch(e) {
        // Network error only — fall through to offline mode
        console.warn('Auth backend unreachable (network), using offline mode:', e.message);
      }
    }

    // Offline / no backend — use local username+hash comparison
    const storedUser = localStorage.getItem('fifo_local_username');
    const storedHash  = localStorage.getItem('fifo_local_pw_hash');
    if (!storedHash) {
      // First time, nothing set — allow any username/password and save both
      localStorage.setItem('fifo_local_username', user);
      localStorage.setItem('fifo_local_pw_hash', hash);
      saveToken('local-' + hash.slice(0,8) + '-' + Date.now(), 'owner', '', user);
      return { ok: true, firstTime: true };
    }
    if (user === storedUser && hash === storedHash) {
      saveToken('local-' + hash.slice(0,8) + '-' + Date.now(), 'owner', '', user);
      return { ok: true };
    }
    return { ok: false, error: 'שם משתמש או סיסמה שגויים' };
  }

  // ── Logout ──────────────────────────────────────────────
  async function logout() {
    // Stop price polling — otherwise refreshPrices() keeps firing getPrices
    // every 15s with no token after logout, and (now that auth is real)
    // each call is correctly rejected server-side but logs a console error.
    // stopPolling() is defined in app.js (loaded after auth.js) but exists
    // by the time a logged-in user can click logout.
    if (typeof stopPolling === 'function') stopPolling();

    // Revoke server-side session first (fire-and-forget; we log out locally regardless)
    if (API.isConfigured()) {
      try { await API.logoutServer(); } catch(e) { console.warn('Server logout failed:', e.message); }
    }
    clearPrivateCache(); // wipes token + all cached trading data
    showLoginScreen();
  }

  // Called by api.js when the server returns code:401 (expired/invalid session)
  function handle401() {
    if (AUTH_DISABLED) return; // bypass — don't show login screen in testing mode
    // Same reasoning as logout(): a 401 can arrive in a tab that never
    // called logout() itself (e.g. another tab logged out, clearing the
    // shared localStorage token) — without this, that tab keeps polling
    // getPrices every 15s, each one failing, indefinitely.
    if (typeof stopPolling === 'function') stopPolling();
    clearPrivateCache();
    showLoginScreen();
  }

  // ── Change password (local) ─────────────────────────────
  async function changePasswordLocal(current, newPw) {
    const curHash = await sha256(current.trim());
    const stored  = localStorage.getItem('fifo_local_pw_hash');
    if (stored && curHash !== stored) return { ok: false, error: 'סיסמה נוכחית שגויה' };
    const newHash = await sha256(newPw.trim());
    localStorage.setItem('fifo_local_pw_hash', newHash);
    return { ok: true };
  }

  // ── UI ──────────────────────────────────────────────────
  function showLoginScreen() {
    const overlay = document.getElementById('login-overlay');
    const app     = document.getElementById('app');
    if (overlay) overlay.style.display = 'flex';
    if (app)     app.style.display = 'none';
    // Focus password field
    setTimeout(() => {
      const pw = document.getElementById('login-password');
      if (pw) pw.focus();
    }, 100);
  }

  function hideLoginScreen() {
    const overlay = document.getElementById('login-overlay');
    const app     = document.getElementById('app');
    if (overlay) overlay.style.display = 'none';
    if (app)     app.style.display = 'block';
  }

  // ── Init ────────────────────────────────────────────────
  async function init() {
    if (AUTH_DISABLED) {
      hideLoginScreen();
      return true;
    }

    if (isLoggedIn()) {
      hideLoginScreen();
      return true;
    }
    // No valid local token — wipe any stale private data before showing login
    clearPrivateCache();
    showLoginScreen();
    return false;
  }

  // ── Login form handler ──────────────────────────────────
  async function handleLoginSubmit() {
    const userEl = document.getElementById('login-username');
    const pwEl  = document.getElementById('login-password');
    const errEl = document.getElementById('login-error');
    const btn   = document.getElementById('login-btn');
    if (!pwEl) return;

    const user = userEl ? userEl.value : '';
    const pw = pwEl.value;
    if (btn) { btn.disabled = true; btn.textContent = 'מתחבר...'; }
    if (errEl) errEl.textContent = '';

    const res = await login(user, pw);

    if (res.ok) {
      pwEl.value = '';
      hideLoginScreen();
      if (res.firstTime && errEl) {
        // Just logged in for first time — password is now set
      }
      // Trigger app load (app.js calls Auth.init() first)
      if (window._onAuthSuccess) window._onAuthSuccess();
    } else {
      if (errEl) errEl.textContent = res.error || 'שגיאה';
      if (pwEl) { pwEl.classList.add('error-shake'); setTimeout(() => pwEl.classList.remove('error-shake'), 500); }
    }

    if (btn) { btn.disabled = false; btn.textContent = 'כניסה'; }
  }

  return {
    init, login, logout, isLoggedIn, getToken, getRole, isViewer, isOwner, getDisplayName,
    handleLoginSubmit, showLoginScreen, hideLoginScreen,
    sha256, changePasswordLocal, saveLastVisit, getLastVisit,
    handle401, clearPrivateCache
  };
})();
