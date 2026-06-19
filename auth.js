/**
 * FIFO PRO — auth.js
 * Login, session management, 30-day token, SHA-256 password hashing
 * Depends on: utils.js, api.js
 */

const Auth = (() => {
  const TOKEN_KEY    = 'fifo_session_v1';
  const EXPIRY_DAYS  = 30;
  const BRIEF_SHOWN  = 'fifo_brief_shown';
  const LAST_VISIT   = 'fifo_last_visit';

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

  function saveToken(token) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      token,
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
  async function login(password) {
    if (!password.trim()) return { ok: false, error: 'הכנס סיסמה' };

    const hash = await sha256(password.trim());

    // Try backend verification
    if (API.isConfigured()) {
      try {
        const res = await API.verifyLogin(hash);
        if (res.ok && res.token) {
          saveToken(res.token);
          return { ok: true };
        }
        if (res.authDisabled) {
          // Backend has no password set — allow through
          saveToken('auth-disabled-' + Date.now());
          return { ok: true };
        }
        return { ok: false, error: res.error || 'סיסמה שגויה' };
      } catch(e) {
        // Backend unreachable — fall through to offline mode
        console.warn('Auth backend unavailable, using offline mode:', e.message);
      }
    }

    // Offline / no backend — use local hash comparison
    const storedHash = localStorage.getItem('fifo_local_pw_hash');
    if (!storedHash) {
      // First time, no password set — allow any password and save hash
      localStorage.setItem('fifo_local_pw_hash', hash);
      saveToken('local-' + hash.slice(0,8) + '-' + Date.now());
      return { ok: true, firstTime: true };
    }
    if (hash === storedHash) {
      saveToken('local-' + hash.slice(0,8) + '-' + Date.now());
      return { ok: true };
    }
    return { ok: false, error: 'סיסמה שגויה' };
  }

  // ── Logout ──────────────────────────────────────────────
  async function logout() {
    // Revoke server-side session first (fire-and-forget; we log out locally regardless)
    if (API.isConfigured()) {
      try { await API.logoutServer(); } catch(e) { console.warn('Server logout failed:', e.message); }
    }
    clearToken();
    localStorage.removeItem(BRIEF_SHOWN);
    showLoginScreen();
  }

  // Called by api.js when the server returns code:401 (expired/invalid session)
  function handle401() {
    clearToken();
    localStorage.removeItem(BRIEF_SHOWN);
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
    if (isLoggedIn()) {
      hideLoginScreen();
      return true;
    }
    showLoginScreen();
    return false;
  }

  // ── Login form handler ──────────────────────────────────
  async function handleLoginSubmit() {
    const pwEl  = document.getElementById('login-password');
    const errEl = document.getElementById('login-error');
    const btn   = document.getElementById('login-btn');
    if (!pwEl) return;

    const pw = pwEl.value;
    if (btn) { btn.disabled = true; btn.textContent = 'מתחבר...'; }
    if (errEl) errEl.textContent = '';

    const res = await login(pw);

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
    init, login, logout, isLoggedIn, getToken,
    handleLoginSubmit, showLoginScreen, hideLoginScreen,
    sha256, changePasswordLocal, saveLastVisit, getLastVisit,
    handle401
  };
})();
