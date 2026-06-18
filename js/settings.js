/**
 * FIFO PRO — settings.js
 * Complete settings center: all sections, all saves to localStorage
 * Depends on: utils.js, api.js, auth.js
 */

const Settings = (() => {
  const LS = Utils.LS;

  const DEFAULTS = {
    // General
    theme: 'dark',
    language: 'he',
    currency: 'USD',
    timezone: 'Asia/Jerusalem',
    dateFormat: 'DD/MM/YYYY',
    // Trading
    monthlyGoal: 5000,
    weeklyGoal: 1200,
    dailyGoal: 250,
    portfolioSize: 67000,
    riskPct: 1.0,
    stopLossPct: 2.0,
    takeProfitPct: 4.0,
    commission: 0,
    taxPct: 25,
    defaultRR: 2.0,
    maxPositionSize: 20,
    maxConsecLosses: 3,
    preferredHoursStart: '09:30',
    preferredHoursEnd: '16:00',
    broker: '',
    // Live data
    autoRefresh: true,
    refreshInterval: 30,
    // AI
    aiModel: 'claude-sonnet-4-6',
    aiDetailLevel: 'medium',
    aiAfterTrade: false,
    aiDailyReview: false,
    aiWeeklyReview: true,
    // Alerts
    alertGoal: true,
    alertStop: true,
    alertDailyProfit: false,
    alertDrawdown: true,
    alertConsecLosses: true,
    // Modules
    showModules: {
      weekSummary: true, portfolioHealth: true,
      heatmap: true, coach: true, learning: true,
    },
    // Session
    sessionTimeout: 0, // 0 = never
  };

  function getPrefs() { return LS.get('fifo_prefs', DEFAULTS); }
  function savePrefs(p) { LS.set('fifo_prefs', p); }

  function get(key) {
    const p = getPrefs();
    return p[key] !== undefined ? p[key] : DEFAULTS[key];
  }
  function set(key, val) {
    const p = getPrefs();
    p[key] = val;
    savePrefs(p);
  }

  // ── Render ──────────────────────────────────────────────
  function render() {
    const el = document.getElementById('tab-settings');
    if (!el) return;
    const p = getPrefs();
    const st = (typeof getStats === 'function') ? getStats() : {};
    const apiOk = typeof API !== 'undefined' && API.isConfigured();
    const vers = '2.1.0';

    el.innerHTML = `
    <div class="settings-page">

      <!-- ── Page title ── -->
      <div class="settings-hero">
        <div class="settings-hero-icon">⚙️</div>
        <div>
          <div class="settings-hero-title">הגדרות מערכת</div>
          <div class="settings-hero-sub">התאמה אישית מלאה של FIFO PRO</div>
        </div>
      </div>

      <!-- ════ 1. כללי ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🌐</span> כללי</div>
        <div class="settings-card">

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">מצב תצוגה</span>
              <span class="settings-row-sub">Dark / Light mode</span>
            </div>
            <div class="seg-ctrl">
              <button class="seg-btn ${p.theme==='dark'?'active':''}" onclick="Settings.setTheme('dark')">🌙 Dark</button>
              <button class="seg-btn ${p.theme==='light'?'active':''}" onclick="Settings.setTheme('light')">☀️ Light</button>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">מטבע</span>
              <span class="settings-row-sub">מטבע ברירת מחדל לתצוגה</span>
            </div>
            <select class="s-input" onchange="Settings.set('currency',this.value)">
              <option value="USD" ${p.currency==='USD'?'selected':''}>$ USD</option>
              <option value="ILS" ${p.currency==='ILS'?'selected':''}>₪ ILS</option>
              <option value="EUR" ${p.currency==='EUR'?'selected':''}>€ EUR</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">פורמט תאריך</span>
              <span class="settings-row-sub">אופן הצגת תאריכים בממשק</span>
            </div>
            <select class="s-input" onchange="Settings.set('dateFormat',this.value)">
              <option value="DD/MM/YYYY" ${p.dateFormat==='DD/MM/YYYY'?'selected':''}>DD/MM/YYYY</option>
              <option value="MM/DD/YYYY" ${p.dateFormat==='MM/DD/YYYY'?'selected':''}>MM/DD/YYYY</option>
              <option value="YYYY-MM-DD" ${p.dateFormat==='YYYY-MM-DD'?'selected':''}>YYYY-MM-DD</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">אזור זמן</span>
              <span class="settings-row-sub">לחישובי שעות מסחר</span>
            </div>
            <select class="s-input" onchange="Settings.set('timezone',this.value)">
              <option value="Asia/Jerusalem" ${p.timezone==='Asia/Jerusalem'?'selected':''}>ישראל (GMT+3)</option>
              <option value="America/New_York" ${p.timezone==='America/New_York'?'selected':''}>New York (EST)</option>
              <option value="Europe/London" ${p.timezone==='Europe/London'?'selected':''}>London (GMT)</option>
            </select>
          </div>

        </div>
      </div>

      <!-- ════ 2. יעדים ומסחר ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🎯</span> יעדים מסחריים</div>
        <div class="settings-card">
          ${_numRow('monthlyGoal','יעד חודשי ($)','יעד הרווח החודשי שלך',p.monthlyGoal,'$')}
          ${_numRow('weeklyGoal','יעד שבועי ($)','יעד הרווח השבועי',p.weeklyGoal,'$')}
          ${_numRow('dailyGoal','יעד יומי ($)','יעד הרווח היומי',p.dailyGoal,'$')}
          ${_numRow('portfolioSize','גודל תיק ($)','סך ההון המנוהל',p.portfolioSize,'$')}
        </div>
      </div>

      <!-- ════ 3. ניהול סיכון ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🛡️</span> ניהול סיכון</div>
        <div class="settings-card">
          ${_numRow('riskPct','% סיכון לעסקה','אחוז מקסימלי מהתיק לסיכון',p.riskPct,'%',0.1,5,0.1)}
          ${_numRow('stopLossPct','% ברירת מחדל Stop Loss','ברירת מחדל בכניסה לפוזיציה',p.stopLossPct,'%',0.5,20,0.5)}
          ${_numRow('takeProfitPct','% ברירת מחדל Take Profit','ברירת מחדל ליעד רווח',p.takeProfitPct,'%',0.5,50,0.5)}
          ${_numRow('defaultRR','יחס Risk/Reward ברירת מחדל','למשל 2 = מחפש 2:1',p.defaultRR,'',0.5,10,0.5)}
          ${_numRow('maxPositionSize','גודל פוזיציה מקסימלי (% תיק)','הגבלת ריכוז',p.maxPositionSize,'%',1,100,1)}
          ${_numRow('maxConsecLosses','עצור לאחר X הפסדים רצופים','0 = ללא הגבלה',p.maxConsecLosses,'',0,20,1)}
          ${_numRow('commission','עמלת ברוקר ($)','לעסקה',p.commission,'$',0,100,0.5)}
          ${_numRow('taxPct','% מס רווח הון','ישראל = 25%',p.taxPct,'%',0,50,1)}
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">ברוקר</span>
              <span class="settings-row-sub">שם הברוקר שלך</span>
            </div>
            <input class="s-input" type="text" value="${p.broker||''}" placeholder="Interactive Brokers, TradeStation..." onchange="Settings.set('broker',this.value)">
          </div>
        </div>
      </div>

      <!-- ════ 4. שעות מסחר ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🕐</span> שעות מסחר מועדפות</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">שעת פתיחה</span>
              <span class="settings-row-sub">שעת התחלת מסחר מועדפת</span>
            </div>
            <input class="s-input" type="time" value="${p.preferredHoursStart||'09:30'}" onchange="Settings.set('preferredHoursStart',this.value)" style="width:110px">
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">שעת סגירה</span>
              <span class="settings-row-sub">שעת סיום מסחר מועדפת</span>
            </div>
            <input class="s-input" type="time" value="${p.preferredHoursEnd||'16:00'}" onchange="Settings.set('preferredHoursEnd',this.value)" style="width:110px">
          </div>
        </div>
      </div>

      <!-- ════ 5. נתוני שוק חיים ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">📡</span> נתוני שוק חיים</div>
        <div class="settings-card">

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">חיבור Google Apps Script</span>
              <span class="settings-row-sub">Backend API לנתוני שוק ו-AI</span>
            </div>
            <span class="s-badge ${apiOk?'s-badge-ok':'s-badge-warn'}">${apiOk?'✓ מחובר':'⚠ לא מוגדר'}</span>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">עדכון אחרון</span>
              <span class="settings-row-sub">מתי נמשכו מחירים לאחרונה</span>
            </div>
            <span class="settings-row-val" id="s-last-price-update">${LS.get('fifo_last_price_update','—')}</span>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">רענון אוטומטי</span>
              <span class="settings-row-sub">מחירים חיים כל 30 שניות</span>
            </div>
            <label class="switch">
              <input type="checkbox" ${p.autoRefresh?'checked':''} onchange="Settings.set('autoRefresh',this.checked)">
              <span class="switch-slider"></span>
            </label>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">מרווח רענון (שניות)</span>
              <span class="settings-row-sub">כל כמה שניות לרענן מחירים</span>
            </div>
            <select class="s-input" onchange="Settings.set('refreshInterval',+this.value)">
              ${[15,30,60,120].map(v=>`<option value="${v}" ${(p.refreshInterval||30)===v?'selected':''}>${v}s</option>`).join('')}
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">מחק Cache</span>
              <span class="settings-row-sub">מאלץ טעינה מחדש מהשרת</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Settings.clearCache()">🗑 נקה Cache</button>
          </div>

        </div>
      </div>

      <!-- ════ 6. בינה מלאכותית ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🤖</span> בינה מלאכותית</div>
        <div class="settings-card">

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">מודל AI</span>
              <span class="settings-row-sub">מודל Claude לשימוש בשיחות</span>
            </div>
            <select class="s-input" onchange="Settings.set('aiModel',this.value)">
              <option value="claude-sonnet-4-6" ${p.aiModel==='claude-sonnet-4-6'?'selected':''}>Claude Sonnet 4.6 (מומלץ)</option>
              <option value="claude-haiku-4-5-20251001" ${p.aiModel==='claude-haiku-4-5-20251001'?'selected':''}>Claude Haiku 4.5 (מהיר)</option>
              <option value="claude-opus-4-8" ${p.aiModel==='claude-opus-4-8'?'selected':''}>Claude Opus 4.8 (חכם)</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">רמת פירוט</span>
              <span class="settings-row-sub">כמה מפורטות תהיינה תשובות ה-AI</span>
            </div>
            <div class="seg-ctrl">
              <button class="seg-btn ${p.aiDetailLevel==='short'?'active':''}" onclick="Settings.set('aiDetailLevel','short');this.closest('.seg-ctrl').querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">קצר</button>
              <button class="seg-btn ${p.aiDetailLevel==='medium'?'active':''}" onclick="Settings.set('aiDetailLevel','medium');this.closest('.seg-ctrl').querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">בינוני</button>
              <button class="seg-btn ${p.aiDetailLevel==='detailed'?'active':''}" onclick="Settings.set('aiDetailLevel','detailed');this.closest('.seg-ctrl').querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">מפורט</button>
            </div>
          </div>

          ${_toggleRow('aiAfterTrade','AI אחרי כל עסקה','ניתוח אוטומטי עם סגירת עסקה',p.aiAfterTrade)}
          ${_toggleRow('aiDailyReview','סיכום AI יומי','ניתוח בסוף יום מסחר',p.aiDailyReview)}
          ${_toggleRow('aiWeeklyReview','סיכום AI שבועי','ניתוח ביצועים שבועי',p.aiWeeklyReview)}

        </div>
      </div>

      <!-- ════ 7. התראות ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🔔</span> התראות</div>
        <div class="settings-card">
          <div class="settings-note">התראות מוצגות בתוך האפליקציה. Push Notifications דורשות הגדרה נפרדת.</div>
          ${_toggleRow('alertGoal','התראת יעד חודשי','הגעה ל-100% מהיעד',p.alertGoal)}
          ${_toggleRow('alertStop','התראת Stop Loss','פוזיציה קרובה לסטופ',p.alertStop)}
          ${_toggleRow('alertDailyProfit','התראת רווח יומי','הגעה ליעד יומי',p.alertDailyProfit)}
          ${_toggleRow('alertDrawdown','התראת Drawdown','ירידה חדה מהשיא',p.alertDrawdown)}
          ${_toggleRow('alertConsecLosses','התראת הפסדים רצופים','לאחר ' + (p.maxConsecLosses||3) + ' הפסדים ברצף',p.alertConsecLosses)}
        </div>
      </div>

      <!-- ════ 8. מודולים ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🧩</span> מודולים</div>
        <div class="settings-card">
          ${_moduleToggle('weekSummary','סיכום שבועי','כרטיסי סיכום בדשבורד',p)}
          ${_moduleToggle('portfolioHealth','בריאות תיק','ניתוח סיכון וחשיפה',p)}
          ${_moduleToggle('heatmap','Calendar Heatmap','לוח שנה רווח/הפסד',p)}
          ${_moduleToggle('coach','AI Coach','ניתוח אופי מסחר',p)}
          ${_moduleToggle('learning','Learning Engine','מנוע למידה אישי',p)}
        </div>
      </div>

      <!-- ════ 9. גיבוי ונתונים ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">💾</span> גיבוי ונתונים</div>
        <div class="settings-card">

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">ייצוא CSV</span>
              <span class="settings-row-sub">כל העסקאות לקובץ Excel/CSV</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="exportCSV()">⬇️ ייצא CSV</button>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">ייצוא JSON</span>
              <span class="settings-row-sub">גיבוי מלא — עסקאות, פוזיציות, Watchlist, הגדרות</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Settings.exportJSON()">⬇️ ייצא JSON</button>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">ייבוא גיבוי JSON</span>
              <span class="settings-row-sub">שחזור מקובץ גיבוי</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Settings.triggerImport()">⬆️ ייבא JSON</button>
            <input type="file" id="s-import-file" accept=".json" style="display:none" onchange="Settings.importJSON(this)">
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">סנכרון עם Google Sheets</span>
              <span class="settings-row-sub">טעינה מחדש מהשרת</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Settings.syncNow()">🔄 סנכרן עכשיו</button>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">בדיקת תקינות נתונים</span>
              <span class="settings-row-sub">בדיקת עסקאות לשגיאות ואי-עקביות</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Settings.validateData()">🔍 בדוק נתונים</button>
          </div>

          <div id="s-validate-result" style="display:none;margin-top:8px;padding:10px;border-radius:var(--r-md);font-size:12px"></div>

        </div>
      </div>

      <!-- ════ 10. אבטחה ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🔐</span> אבטחה</div>
        <div class="settings-card">

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">שינוי סיסמה</span>
              <span class="settings-row-sub">סיסמת הגישה לאפליקציה</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Settings.showPasswordChange()">שנה סיסמה</button>
          </div>

          <div id="pw-change-form" style="display:none;margin-top:12px;padding:16px;background:var(--surface-2);border-radius:var(--r-md)">
            <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr;gap:10px">
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
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary btn-sm" onclick="Settings.changePassword()">שמור</button>
              <button class="btn btn-ghost btn-sm" onclick="Settings.hidePasswordChange()">ביטול</button>
            </div>
            <div id="pw-change-msg" style="margin-top:8px;font-size:12px"></div>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">פסק זמן Session (דקות)</span>
              <span class="settings-row-sub">0 = ללא פסק זמן אוטומטי</span>
            </div>
            <select class="s-input" onchange="Settings.set('sessionTimeout',+this.value)">
              ${[0,15,30,60,120].map(v=>`<option value="${v}" ${(p.sessionTimeout||0)===v?'selected':''}>${v===0?'ללא':v+' דקות'}</option>`).join('')}
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">יציאה מהמערכת</span>
              <span class="settings-row-sub">מסיר Token מהדפדפן</span>
            </div>
            <button class="btn btn-danger btn-sm" onclick="if(confirm('לצאת מהמערכת?')) Auth.logout()">⎋ Logout</button>
          </div>

        </div>
      </div>

      <!-- ════ 11. אודות ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">ℹ️</span> אודות FIFO PRO</div>
        <div class="settings-card settings-about">
          <div class="about-brand">
            <div class="about-brand-name">FIFO <span>PRO</span></div>
            <div class="about-brand-ver">v${vers} — Institutional Trading Journal</div>
          </div>
          <div class="about-stats">
            <div class="about-stat">
              <div class="about-stat-val">${APP.trades?.length || 0}</div>
              <div class="about-stat-label">עסקאות</div>
            </div>
            <div class="about-stat">
              <div class="about-stat-val">${APP.positions?.length || 0}</div>
              <div class="about-stat-label">פוזיציות</div>
            </div>
            <div class="about-stat">
              <div class="about-stat-val">${APP.watchlist?.length || 0}</div>
              <div class="about-stat-label">Watchlist</div>
            </div>
            <div class="about-stat">
              <div class="about-stat-val">${Utils.f$(Math.round(st.totalNet || 0))}</div>
              <div class="about-stat-label">רווח כולל</div>
            </div>
          </div>
          <div class="about-meta">
            <span>Backend: Google Apps Script</span>
            <span>AI: Claude API (Anthropic)</span>
            <span>מחירים: Yahoo Finance</span>
          </div>
        </div>
      </div>

    </div>`;
  }

  // ── Row builders ────────────────────────────────────────
  function _numRow(key, label, sub, val, unit, min, max, step) {
    const mn = min !== undefined ? `min="${min}"` : '';
    const mx = max !== undefined ? `max="${max}"` : '';
    const st = step !== undefined ? `step="${step}"` : '';
    return `
      <div class="settings-row">
        <div class="settings-row-info">
          <span class="settings-row-label">${label}</span>
          <span class="settings-row-sub">${sub}</span>
        </div>
        <div class="s-num-wrap">
          ${unit?`<span class="s-unit">${unit}</span>`:''}
          <input class="s-input s-input-num" type="number" value="${val}" ${mn} ${mx} ${st}
            onchange="Settings.set('${key}', +this.value);Settings._syncGoal()">
        </div>
      </div>`;
  }

  function _toggleRow(key, label, sub, checked) {
    return `
      <div class="settings-row">
        <div class="settings-row-info">
          <span class="settings-row-label">${label}</span>
          <span class="settings-row-sub">${sub}</span>
        </div>
        <label class="switch">
          <input type="checkbox" ${checked?'checked':''} onchange="Settings.set('${key}',this.checked)">
          <span class="switch-slider"></span>
        </label>
      </div>`;
  }

  function _moduleToggle(key, label, sub, prefs) {
    const on = prefs.showModules?.[key] !== false;
    return `
      <div class="settings-row">
        <div class="settings-row-info">
          <span class="settings-row-label">${label}</span>
          <span class="settings-row-sub">${sub}</span>
        </div>
        <label class="switch">
          <input type="checkbox" ${on?'checked':''} onchange="Settings.toggleModule('${key}',this.checked)">
          <span class="switch-slider"></span>
        </label>
      </div>`;
  }

  // ── Public API ──────────────────────────────────────────
  function setTheme(theme) {
    set('theme', theme);
    const isDark = theme === 'dark';
    APP.darkMode = isDark;
    document.body.classList.toggle('light', !isDark);
    const btn = document.getElementById('dark-btn');
    if (btn) btn.textContent = isDark ? '☀️ Light' : '🌙 Dark';
    Utils.LS.set('fifo_dark', isDark ? '1' : '0');
    render();
  }

  function toggleModule(key, value) {
    const p = getPrefs();
    if (!p.showModules) p.showModules = {};
    p.showModules[key] = value;
    savePrefs(p);
    API.setStatus('✓ הגדרות נשמרו', 'ok');
  }

  function _syncGoal() {
    const goal = get('monthlyGoal');
    if (APP && goal !== APP.monthGoal) {
      APP.monthGoal = goal;
      API.setGoal(goal);
    }
    API.setStatus('✓ הגדרות נשמרו', 'ok');
  }

  function clearCache() {
    ['fifo_live_cache','fifo_stats_cache'].forEach(k => localStorage.removeItem(k));
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    API.setStatus('✓ Cache נוקה', 'ok');
  }

  function syncNow() {
    if (typeof load === 'function') {
      API.setStatus('מסנכרן...', 'info');
      load().then(() => { if (typeof renderAll === 'function') renderAll(); API.setStatus('✓ סנכרון הושלם', 'ok'); });
    }
  }

  function validateData() {
    const out = document.getElementById('s-validate-result');
    if (!out) return;
    const issues = [];
    (APP.trades || []).forEach(t => {
      if (!t.symbol) issues.push(`עסקה #${t.id}: חסר סימבול`);
      if (!t.sell_date) issues.push(`עסקה #${t.id} (${t.symbol}): חסר תאריך מכירה`);
      if (t.net === undefined || t.net === null) issues.push(`עסקה #${t.id}: P&L חסר`);
    });
    out.style.display = 'block';
    if (issues.length === 0) {
      out.style.background = 'var(--green-dim)';
      out.style.color = 'var(--green)';
      out.textContent = '✓ כל הנתונים תקינים (' + APP.trades.length + ' עסקאות)';
    } else {
      out.style.background = 'var(--red-dim)';
      out.style.color = 'var(--red)';
      out.innerHTML = '⚠ נמצאו ' + issues.length + ' בעיות:<br>' + issues.slice(0,10).join('<br>');
    }
  }

  function exportJSON() {
    const data = {
      version: '2.1.0',
      exportDate: new Date().toISOString(),
      trades: APP.trades || [],
      positions: APP.positions || [],
      watchlist: APP.watchlist || [],
      prefs: getPrefs(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fifo-pro-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    API.setStatus('✓ קובץ JSON יוצא', 'ok');
  }

  function triggerImport() {
    document.getElementById('s-import-file')?.click();
  }

  function importJSON(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.trades) throw new Error('קובץ לא תקין — חסר trades');
        if (!confirm(`ייבוא ${data.trades.length} עסקאות מ-${data.exportDate?.split('T')[0] || 'גיבוי'}?\nהנתונים הנוכחיים ישמרו.`)) return;
        if (data.prefs) savePrefs(data.prefs);
        API.setStatus('✓ הגדרות יובאו. רענן לטעינת עסקאות.', 'ok');
      } catch(err) {
        alert('שגיאה בייבוא: ' + err.message);
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  // ── Password change ──────────────────────────────────────
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
    const nw   = document.getElementById('s-pw-new')?.value    || '';
    const conf = document.getElementById('s-pw-confirm')?.value || '';
    const msg  = document.getElementById('pw-change-msg');
    if (!nw || nw.length < 4) { _pwMsg(msg, 'סיסמה חייבת להיות לפחות 4 תווים', 'red'); return; }
    if (nw !== conf)           { _pwMsg(msg, 'הסיסמאות אינן תואמות', 'red'); return; }
    const currentHash = await Auth.sha256(cur);
    const newHash     = await Auth.sha256(nw);
    const res = API.isConfigured()
      ? await API.changePassword(currentHash, newHash)
      : await Auth.changePasswordLocal(cur, nw);
    if (res.ok) { _pwMsg(msg, '✓ סיסמה שונתה בהצלחה', 'green'); setTimeout(hidePasswordChange, 2000); }
    else        { _pwMsg(msg, res.error, 'red'); }
  }
  function _pwMsg(el, text, color) {
    if (!el) return;
    el.textContent = text;
    el.style.color = 'var(--' + color + ')';
  }

  // ── Compatibility shim ───────────────────────────────────
  function save() { _syncGoal(); }

  return {
    render, get, set, getPrefs, save, setTheme, toggleModule,
    clearCache, syncNow, validateData, exportJSON, triggerImport, importJSON,
    showPasswordChange, hidePasswordChange, changePassword, _syncGoal,
  };
})();
