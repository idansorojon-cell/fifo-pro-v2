/**
 * FIFO PRO — settings.js
 * Settings screen: password, theme, goal, portfolio, risk, modules
 * Depends on: utils.js, api.js, auth.js
 */

const Settings = (() => {
  const LS = Utils.LS;

  // ── Prefs ───────────────────────────────────────────────
  function getPrefs() {
    return LS.get('fifo_prefs', {
      currency: 'usd',
      monthlyGoal: 5000,
      portfolioSize: 67000,
      riskPct: 1.0,
      theme: 'dark',
      showModules: {
        weekSummary: true,
        portfolioHealth: true,
        heatmap: true,
        coach: true,
        learning: true
      }
    });
  }

  function savePrefs(prefs) {
    LS.set('fifo_prefs', prefs);
  }

  // ── Render ──────────────────────────────────────────────
  function render() {
    const el = document.getElementById('tab-settings');
    if (!el) return;

    const prefs = getPrefs();

    el.innerHTML = `
      <div class="settings-page">

        <!-- Account -->
        <div class="settings-section">
          <div class="settings-section-title">🔐 חשבון</div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-label">
                <span>שינוי סיסמה</span>
                <span class="settings-row-sub">מקומי — לא מחייב גיבוי</span>
              </div>
              <button class="btn btn-ghost btn-sm" onclick="Settings.showPasswordChange()">שנה סיסמה</button>
            </div>
            <div id="pw-change-form" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
              <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr">
                <div class="form-group">
                  <label>סיסמה נוכחית</label>
                  <input type="password" id="s-pw-current" placeholder="••••••••">
                </div>
                <div class="form-group">
                  <label>סיסמה חדשה</label>
                  <input type="password" id="s-pw-new" placeholder="••••••••">
                </div>
                <div class="form-group">
                  <label>אישור</label>
                  <input type="password" id="s-pw-confirm" placeholder="••••••••">
                </div>
              </div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <button class="btn btn-primary btn-sm" onclick="Settings.changePassword()">שמור סיסמה</button>
                <button class="btn btn-ghost btn-sm" onclick="Settings.hidePasswordChange()">ביטול</button>
              </div>
              <div id="pw-change-msg" style="margin-top:8px;font-size:12px"></div>
            </div>
            <div class="settings-row" style="margin-top:0;padding-top:12px;border-top:1px solid var(--border)">
              <div class="settings-row-label">
                <span>יציאה מהמערכת</span>
                <span class="settings-row-sub">מסיר Token מהדפדפן</span>
              </div>
              <button class="btn btn-danger btn-sm" onclick="if(confirm('לצאת?')) Auth.logout()">Logout</button>
            </div>
          </div>
        </div>

        <!-- Trading Defaults -->
        <div class="settings-section">
          <div class="settings-section-title">💼 ברירות מחדל למסחר</div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-label">
                <span>יעד חודשי ($)</span>
                <span class="settings-row-sub">מוצג בדשבורד ובכרטיס יעדים</span>
              </div>
              <input type="number" id="s-goal" value="${prefs.monthlyGoal}" style="width:120px;text-align:center" onchange="Settings.save()">
            </div>
            <div class="settings-row">
              <div class="settings-row-label">
                <span>גודל תיק ($)</span>
                <span class="settings-row-sub">ברירת מחדל ב-Position Sizer</span>
              </div>
              <input type="number" id="s-portfolio" value="${prefs.portfolioSize}" style="width:120px;text-align:center" onchange="Settings.save()">
            </div>
            <div class="settings-row">
              <div class="settings-row-label">
                <span>% סיכון מקסימלי</span>
                <span class="settings-row-sub">ברירת מחדל ל-Risk per trade</span>
              </div>
              <input type="number" id="s-risk" value="${prefs.riskPct}" step="0.1" min="0.1" max="5" style="width:80px;text-align:center" onchange="Settings.save()">
            </div>
          </div>
        </div>

        <!-- Display -->
        <div class="settings-section">
          <div class="settings-section-title">🎨 תצוגה</div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-label">
                <span>מצב תצוגה</span>
                <span class="settings-row-sub">Dark / Light mode</span>
              </div>
              <div class="toggle-group">
                <button class="toggle-btn ${prefs.theme === 'dark' ? 'active' : ''}" onclick="Settings.setTheme('dark')">🌙 Dark</button>
                <button class="toggle-btn ${prefs.theme === 'light' ? 'active' : ''}" onclick="Settings.setTheme('light')">☀️ Light</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Modules -->
        <div class="settings-section">
          <div class="settings-section-title">🧩 מודולים פעילים</div>
          <div class="settings-card">
            ${_moduleToggleRow('weekSummary', 'סיכום שבועי', 'כרטיסי סיכום בדשבורד', prefs)}
            ${_moduleToggleRow('portfolioHealth', 'בריאות תיק', 'ניתוח סיכון בדשבורד', prefs)}
            ${_moduleToggleRow('heatmap', 'Calendar Heatmap', 'לוח שנה רווח/הפסד', prefs)}
            ${_moduleToggleRow('coach', 'AI Coach', 'ניתוח אופי מסחר', prefs)}
            ${_moduleToggleRow('learning', 'Learning Engine', 'מנוע למידה אישי', prefs)}
          </div>
        </div>

        <!-- Data -->
        <div class="settings-section">
          <div class="settings-section-title">🗄️ נתונים</div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-label">
                <span>ייצוא CSV</span>
                <span class="settings-row-sub">כל העסקאות לקובץ Excel</span>
              </div>
              <button class="btn btn-ghost btn-sm" onclick="exportCSV()">⬇️ ייצא CSV</button>
            </div>
            <div class="settings-row">
              <div class="settings-row-label">
                <span>טעינה מחדש</span>
                <span class="settings-row-sub">טעינה מחדש של כל הנתונים מהשרת</span>
              </div>
              <button class="btn btn-ghost btn-sm" onclick="load().then(renderAll)">🔄 רענן</button>
            </div>
          </div>
        </div>

        <!-- About -->
        <div class="settings-section">
          <div class="settings-section-title">ℹ️ אודות</div>
          <div class="settings-card settings-about">
            <div style="font-size:24px;font-weight:800;color:var(--green);margin-bottom:4px">FIFO PRO</div>
            <div style="font-size:13px;color:var(--text-3);margin-bottom:12px">Institutional-grade Personal Trading Journal</div>
            <div class="about-stats">
              <div class="about-stat">
                <div class="about-stat-val" id="s-total-trades">—</div>
                <div class="about-stat-label">סה״כ עסקאות</div>
              </div>
              <div class="about-stat">
                <div class="about-stat-val" id="s-total-pnl">—</div>
                <div class="about-stat-label">רווח כולל</div>
              </div>
              <div class="about-stat">
                <div class="about-stat-val" id="s-first-trade">—</div>
                <div class="about-stat-label">עסקה ראשונה</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;

    // Populate about stats
    const st = getStats();
    const el1 = document.getElementById('s-total-trades');
    const el2 = document.getElementById('s-total-pnl');
    const el3 = document.getElementById('s-first-trade');
    if (el1) el1.textContent = (APP.trades.length || 0).toString();
    if (el2) el2.textContent = Utils.f$(Math.round(st.totalNet || 0));
    if (el3 && APP.trades.length) {
      const sorted = [...APP.trades].sort((a,b) => Utils.parseDD(a.buy_date) - Utils.parseDD(b.buy_date));
      el3.textContent = sorted[0].buy_date;
    }
  }

  function _moduleToggleRow(key, label, sub, prefs) {
    const on = prefs.showModules?.[key] !== false;
    return `
      <div class="settings-row">
        <div class="settings-row-label">
          <span>${label}</span>
          <span class="settings-row-sub">${sub}</span>
        </div>
        <label class="switch">
          <input type="checkbox" ${on ? 'checked' : ''} onchange="Settings.toggleModule('${key}', this.checked)">
          <span class="switch-slider"></span>
        </label>
      </div>`;
  }

  // ── Save ────────────────────────────────────────────────
  function save() {
    const prefs = getPrefs();
    const goal      = parseFloat(document.getElementById('s-goal')?.value) || prefs.monthlyGoal;
    const portfolio = parseFloat(document.getElementById('s-portfolio')?.value) || prefs.portfolioSize;
    const risk      = parseFloat(document.getElementById('s-risk')?.value) || prefs.riskPct;
    prefs.monthlyGoal   = goal;
    prefs.portfolioSize = portfolio;
    prefs.riskPct       = risk;
    savePrefs(prefs);
    // Sync goal to APP
    if (APP && goal !== APP.monthGoal) {
      APP.monthGoal = goal;
      API.setGoal(goal);
    }
    API.setStatus('✓ הגדרות נשמרו', 'ok');
  }

  function setTheme(theme) {
    const prefs = getPrefs();
    prefs.theme = theme;
    savePrefs(prefs);
    const isDark = theme === 'dark';
    APP.darkMode = isDark;
    document.body.classList.toggle('light', !isDark);
    const btn = document.getElementById('dark-btn');
    if (btn) btn.textContent = isDark ? '☀️ Light' : '🌙 Dark';
    Utils.LS.set('fifo_dark', isDark ? '1' : '0');
    render(); // re-render to update toggle state
  }

  function toggleModule(key, value) {
    const prefs = getPrefs();
    if (!prefs.showModules) prefs.showModules = {};
    prefs.showModules[key] = value;
    savePrefs(prefs);
    API.setStatus('✓ הגדרות נשמרו', 'ok');
  }

  // ── Password change UI ──────────────────────────────────
  function showPasswordChange() {
    const f = document.getElementById('pw-change-form');
    if (f) f.style.display = 'block';
  }

  function hidePasswordChange() {
    const f = document.getElementById('pw-change-form');
    if (f) f.style.display = 'none';
  }

  async function changePassword() {
    const cur  = document.getElementById('s-pw-current')?.value || '';
    const nw   = document.getElementById('s-pw-new')?.value || '';
    const conf = document.getElementById('s-pw-confirm')?.value || '';
    const msg  = document.getElementById('pw-change-msg');

    if (!nw || nw.length < 4) {
      if (msg) { msg.textContent = 'סיסמה חייבת להיות לפחות 4 תווים'; msg.style.color = 'var(--red)'; }
      return;
    }
    if (nw !== conf) {
      if (msg) { msg.textContent = 'הסיסמאות אינן תואמות'; msg.style.color = 'var(--red)'; }
      return;
    }

    const res = await Auth.changePasswordLocal(cur, nw);
    if (res.ok) {
      if (msg) { msg.textContent = '✓ סיסמה שונתה בהצלחה'; msg.style.color = 'var(--green)'; }
      setTimeout(hidePasswordChange, 2000);
    } else {
      if (msg) { msg.textContent = res.error; msg.style.color = 'var(--red)'; }
    }
  }

  return { render, save, setTheme, toggleModule, getPrefs,
           showPasswordChange, hidePasswordChange, changePassword };
})();
