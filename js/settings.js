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
    refreshInterval: 15, // matches the app's actual historical polling cadence — do not
                         // change this default without updating startPolling() in app.js
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
              <button class="seg-btn ${p.theme==='dark'?'active':''}" onclick="Settings.setTheme('dark')">${icon('moon')} Dark</button>
              <button class="seg-btn ${p.theme==='light'?'active':''}" onclick="Settings.setTheme('light')">${icon('sun')} Light</button>
            </div>
          </div>

          <!-- SPRINT 0: hidden from UI — decorative, never read anywhere in the
               app (confirmed via full-codebase grep during the Sprint 0 audit).
               Not deleted: row markup + Settings.get/set('currency'/'dateFormat')
               remain fully intact for possible 2.0 use. See docs/TECHNICAL_DEBT.md.
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
          -->


          <!-- FUNCTIONAL CLEANUP: hidden — never read anywhere (confirmed via
               full-codebase grep); the "preferred trading hours" feature this
               would have supported is itself already hidden (see SPRINT 0 note
               below). Not deleted, kept for possible 2.0 use.
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
          -->

        </div>
      </div>

      <!-- ════ 2. יעדים ומסחר ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🎯</span> יעדים מסחריים</div>
        <div class="settings-card">
          ${_numRow('monthlyGoal','יעד חודשי ($)','יעד הרווח החודשי שלך',p.monthlyGoal,'$')}
          <!-- FUNCTIONAL CLEANUP: hidden — weeklyGoal/dailyGoal are never read
               anywhere; only monthlyGoal has a real display surface (Dashboard's
               goal-progress ring/bar, via APP.monthGoal). A week/day equivalent
               would need new UI, not just wiring an existing one — out of scope
               for this cleanup pass. Not deleted, kept for possible 2.0 use.
          ${_numRow('weeklyGoal','יעד שבועי ($)','יעד הרווח השבועי',p.weeklyGoal,'$')}
          ${_numRow('dailyGoal','יעד יומי ($)','יעד הרווח היומי',p.dailyGoal,'$')}
          -->
          ${_numRow('portfolioSize','גודל תיק ($)','סך ההון המנוהל',p.portfolioSize,'$')}
        </div>
      </div>

      <!-- ════ 3. ניהול סיכון ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🛡️</span> ניהול סיכון</div>
        <div class="settings-card">
          ${_numRow('riskPct','% סיכון לעסקה','אחוז מקסימלי מהתיק לסיכון',p.riskPct,'%',0.1,5,0.1)}
          <!-- SPRINT 0: hidden — stopLossPct/takeProfitPct/defaultRR/taxPct encode
               a percentage-based-stop / fixed-R:R model that doesn't match a
               supply-and-demand, zone-based methodology; taxPct specifically is
               never read by the real tax formula (hardcoded 25% in utils.js and
               AppScript_FULL.gs) so leaving it editable implied a control over
               real numbers it never actually had. Not deleted, kept for 2.0.
          ${_numRow('stopLossPct','% ברירת מחדל Stop Loss','ברירת מחדל בכניסה לפוזיציה',p.stopLossPct,'%',0.5,20,0.5)}
          ${_numRow('takeProfitPct','% ברירת מחדל Take Profit','ברירת מחדל ליעד רווח',p.takeProfitPct,'%',0.5,50,0.5)}
          ${_numRow('defaultRR','יחס Risk/Reward ברירת מחדל','למשל 2 = מחפש 2:1',p.defaultRR,'',0.5,10,0.5)}
          -->
          ${_numRow('maxPositionSize','גודל פוזיציה מקסימלי (% תיק)','הגבלת ריכוז — משפיע על צביעת "חשיפה כוללת" ב-Decision Engine',p.maxPositionSize,'%',1,100,1)}
          <!-- FUNCTIONAL CLEANUP: hidden — maxConsecLosses is never read anywhere
               (no consecutive-loss-streak detection exists yet to gate); building
               that detection is new logic, not a wiring fix, so out of scope for
               this cleanup pass. commission is never read anywhere either — no
               trade-entry form (Add Trade/Quick Trade/New Position) collects a
               commission value, so this had no real number to control. Not
               deleted, kept for possible 2.0 use.
          ${_numRow('maxConsecLosses','עצור לאחר X הפסדים רצופים','0 = ללא הגבלה',p.maxConsecLosses,'',0,20,1)}
          ${_numRow('commission','עמלת ברוקר ($)','לעסקה',p.commission,'$',0,100,0.5)}
          -->
          <!-- SPRINT 0: hidden, see note above about taxPct
          ${_numRow('taxPct','% מס רווח הון','ישראל = 25%',p.taxPct,'%',0,50,1)}
          -->
          <!--
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">ברוקר</span>
              <span class="settings-row-sub">שם הברוקר שלך</span>
            </div>
            <input class="s-input" type="text" value="${p.broker||''}" placeholder="Interactive Brokers, TradeStation..." onchange="Settings.set('broker',this.value)">
          </div>
          -->
        </div>
      </div>

      <!-- SPRINT 0: entire "preferred trading hours" section hidden — defaults
           (09:30-16:00) are literally US market hours as if viewed in the
           user's own local time, which is wrong for an Israeli trader of US
           stocks (real session is evening/night, Israel time). A real,
           session-aware version belongs in FIFO PRO 2.0's Cockpit, not this
           generic HH:MM picker. Not deleted, kept intact below.
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
      -->


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
              <input type="checkbox" ${p.autoRefresh?'checked':''} onchange="Settings.set('autoRefresh',this.checked);restartPolling()">
              <span class="switch-slider"></span>
            </label>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">מרווח רענון (שניות)</span>
              <span class="settings-row-sub">כל כמה שניות לרענן מחירים</span>
            </div>
            <select class="s-input" onchange="Settings.set('refreshInterval',+this.value);restartPolling()">
              ${[15,30,60,120].map(v=>`<option value="${v}" ${(p.refreshInterval||15)===v?'selected':''}>${v}s</option>`).join('')}
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

      <!-- FUNCTIONAL CLEANUP: entire "6. בינה מלאכותית" section hidden —
           aiModel was already hidden (SPRINT 0); aiDetailLevel/aiAfterTrade/
           aiDailyReview/aiWeeklyReview are never read anywhere (confirmed via
           full-codebase grep) — no scheduled/triggered AI review exists to gate,
           and AI Chat doesn't consult a detail-level preference. Building that
           is new feature work, not a wiring fix. Not deleted, kept for 2.0.
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
      -->

      <!-- ════ 7. התראות ════ -->
      <div class="settings-section">
        <div class="settings-section-title"><span class="ss-icon">🔔</span> התראות</div>
        <div class="settings-card">
          <div class="settings-note">התראות מוצגות בתוך האפליקציה. Push Notifications דורשות הגדרה נפרדת.</div>
          ${_toggleRow('alertStop','התראת Stop Loss','פוזיציה קרובה לסטופ או פגיעה בו — משפיע בפועל על מערכת ההתראות',p.alertStop)}
          <!-- FUNCTIONAL CLEANUP: hidden — alertGoal/alertDrawdown/
               alertConsecLosses are never consulted by any real alert-firing
               code (positions.js's alert system only checks target/stop/warn
               thresholds, gated now by alertStop above). Wiring these up would
               mean building new alert categories from scratch (a monthly-goal
               toast, a drawdown-from-peak toast, a consecutive-loss-streak
               detector), not a small fix. Not deleted, kept for 2.0.
          ${_toggleRow('alertGoal','התראת יעד חודשי','הגעה ל-100% מהיעד',p.alertGoal)}
          -->
          <!-- SPRINT 0: hidden — duplicates the monthly goal already visible
               on Mission Control with no added insight. Not deleted.
          ${_toggleRow('alertDailyProfit','התראת רווח יומי','הגעה ליעד יומי',p.alertDailyProfit)}
          -->
          <!-- FUNCTIONAL CLEANUP: see note above alertGoal
          ${_toggleRow('alertDrawdown','התראת Drawdown','ירידה חדה מהשיא',p.alertDrawdown)}
          ${_toggleRow('alertConsecLosses','התראת הפסדים רצופים','לאחר ' + (p.maxConsecLosses||3) + ' הפסדים ברצף',p.alertConsecLosses)}
          -->
        </div>
      </div>

      <!-- SPRINT 0: entire "modules" section hidden — none of these 5 toggles
           are read anywhere; every module already renders unconditionally
           regardless of state. Building real show/hide for a screen structure
           that's being redesigned in FIFO PRO 2.0 would be throwaway effort.
           Not deleted — section title, card, and all 5 _moduleToggle calls
           remain intact below.
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
      -->


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
              <span class="settings-row-sub">משחזר הגדרות בלבד — עסקאות/פוזיציות/Watchlist תמיד מגיעות מ-Google Sheets</span>
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

          ${Auth.getRole() === 'owner' ? `
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
          ` : ''}

          <!-- FUNCTIONAL CLEANUP: hidden — never read anywhere; the real
               session TTL is server-side (Script Property SESSION_TTL_HOURS,
               consulted by handleLogin_/handleChangePassword_), completely
               independent of this local dropdown. Also currently moot while
               AUTH_DISABLED=true. Not deleted, kept for when auth is restored.
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">פסק זמן Session (דקות)</span>
              <span class="settings-row-sub">0 = ללא פסק זמן אוטומטי</span>
            </div>
            <select class="s-input" onchange="Settings.set('sessionTimeout',+this.value)">
              ${[0,15,30,60,120].map(v=>`<option value="${v}" ${(p.sessionTimeout||0)===v?'selected':''}>${v===0?'ללא':v+' דקות'}</option>`).join('')}
            </select>
          </div>
          -->

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">יציאה מהמערכת</span>
              <span class="settings-row-sub">מסיר Session מהדפדפן ומהשרת</span>
            </div>
            <button class="btn btn-danger btn-sm" onclick="if(confirm('לצאת מהמערכת?')) Auth.logout()">⎋ Logout</button>
          </div>

          ${Auth.getRole() === 'owner' ? `
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">בטל כל הSessionים</span>
              <span class="settings-row-sub">מנתק את כל המכשירים המחוברים באחת</span>
            </div>
            <button class="btn btn-danger btn-sm" onclick="Settings.revokeAllSessions()">🔒 נתק הכל</button>
          </div>
          <div id="revoke-msg" style="margin:0 16px 12px;font-size:12px"></div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">שם תצוגה (שלי)</span>
              <span class="settings-row-sub">מוצג בברכה האישית בדשבורד/Cockpit</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="Settings.showOwnerNameForm()">ערוך</button>
          </div>

          <div id="owner-name-form" style="display:none;margin-top:12px;padding:16px;background:var(--surface-2);border-radius:var(--r-md)">
            <div class="form-group">
              <label>שם תצוגה</label>
              <input type="text" id="owner-display-name" placeholder="Owner">
            </div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary btn-sm" onclick="Settings.saveOwnerDisplayName()">שמור</button>
              <button class="btn btn-ghost btn-sm" onclick="Settings.hideOwnerNameForm()">ביטול</button>
            </div>
            <div id="owner-name-msg" style="margin-top:8px;font-size:12px"></div>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-label">משתמש צופה (Viewer)</span>
              <span class="settings-row-sub" id="viewer-status-sub">טוען...</span>
            </div>
            <button class="btn btn-ghost btn-sm viewer-manage-btn" onclick="Settings.showViewerManage()">נהל Viewer</button>
          </div>

          <div id="viewer-manage-form" style="display:none;margin-top:12px;padding:16px;background:var(--surface-2);border-radius:var(--r-md)">
            <div class="form-grid">
              <div class="form-group">
                <label>שם משתמש</label>
                <input type="text" id="viewer-username" placeholder="viewer">
              </div>
              <div class="form-group">
                <label>סיסמה חדשה</label>
                <input type="password" id="viewer-password" placeholder="••••••••">
              </div>
              <div class="form-group">
                <label>שם תצוגה</label>
                <input type="text" id="viewer-display-name" placeholder="Viewer">
              </div>
            </div>

            <div class="settings-row" style="margin-top:10px">
              <div class="settings-row-info">
                <span class="settings-row-label">יכול לראות פוזיציות פתוחות</span>
                <span class="settings-row-sub">פוזיציות, מחירים חיים, P&amp;L, יעד/סטופ ופתקים — ברירת מחדל: מוסתר</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="viewer-can-view-positions" onchange="Settings.toggleViewerPositionPermission()">
                <span class="switch-slider"></span>
              </label>
            </div>

            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary btn-sm" onclick="Settings.saveViewerCredentials()">שמור</button>
              <button class="btn btn-ghost btn-sm" id="viewer-lock-btn" onclick="Settings.toggleViewerEnabled()">🔒 נעל</button>
              <button class="btn btn-ghost btn-sm" onclick="Settings.hideViewerManage()">ביטול</button>
            </div>
            <div id="viewer-msg" style="margin-top:8px;font-size:12px"></div>
          </div>
          ` : ''}

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

    if (Auth.getRole() === 'owner') _refreshViewerStatus();
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
    if (btn) btn.innerHTML = (isDark ? icon('sun') + ' Light' : icon('moon') + ' Dark');
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
        if (!confirm(`הקובץ מ-${data.exportDate?.split('T')[0] || 'גיבוי'} מכיל ${data.trades.length} עסקאות, אך רק ההגדרות (${'prefs' in data ? 'קיימות' : 'לא קיימות'} בקובץ) ישוחזרו — עסקאות/פוזיציות/Watchlist תמיד נטענות מ-Google Sheets ולא ישתנו. להמשיך?`)) return;
        if (data.prefs) savePrefs(data.prefs);
        API.setStatus('✓ הגדרות יובאו (עסקאות/פוזיציות לא הושפעו — הן תמיד מגיעות מ-Google Sheets)', 'ok');
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

  // ── Revoke all sessions (all devices) ───────────────────
  async function revokeAllSessions() {
    const msg = document.getElementById('revoke-msg');
    const pw = prompt('הכנס את הסיסמה הנוכחית לאישור:');
    if (pw === null) return; // cancelled
    const hash = await Auth.sha256(pw.trim());
    const res  = await API.revokeAllSessions(hash);
    if (res.ok) {
      if (msg) { msg.textContent = '✓ כל הSessionים בוטלו — תצא מהמערכת'; msg.style.color = 'var(--green)'; }
      setTimeout(() => Auth.logout(), 1500);
    } else {
      if (msg) { msg.textContent = res.error || 'שגיאה'; msg.style.color = 'var(--red)'; }
    }
  }

  // ── Viewer management (Phase 2, owner-only — section isn't even
  // rendered unless Auth.getRole()==='owner', but every action below is
  // also independently rejected server-side for a non-owner token) ──
  function showViewerManage() {
    const f = document.getElementById('viewer-manage-form');
    if (f) f.style.display = 'block';
    _refreshViewerStatus(); // always re-check live state on open, never assume
  }
  function hideViewerManage() {
    const f = document.getElementById('viewer-manage-form');
    if (f) f.style.display = 'none';
  }

  async function _refreshViewerStatus() {
    const sub = document.getElementById('viewer-status-sub');
    if (!sub) return; // not owner, or Settings tab not open
    const res = await API.getViewerStatus();
    const lockBtn  = document.getElementById('viewer-lock-btn');
    const userEl   = document.getElementById('viewer-username');
    const nameEl   = document.getElementById('viewer-display-name');
    const ownerNameEl = document.getElementById('owner-display-name');
    const posEl    = document.getElementById('viewer-can-view-positions');
    if (!res.ok) { sub.textContent = 'שגיאה בטעינת סטטוס'; return; }
    sub.textContent = !res.configured ? 'טרם הוגדר'
      : (res.enabled ? `פעיל — ${res.username}` : `נעול — ${res.username}`);
    if (userEl && !userEl.value) userEl.value = res.username || '';
    if (nameEl && !nameEl.value) nameEl.value = res.displayName || '';
    if (ownerNameEl && !ownerNameEl.value) ownerNameEl.value = res.ownerDisplayName || '';
    if (lockBtn) {
      lockBtn.textContent = res.enabled ? '🔒 נעל' : '🔓 שחרר';
      lockBtn.dataset.enabled = res.enabled ? '1' : '0';
      lockBtn.disabled = !res.configured; // nothing to lock/unlock before a viewer exists
    }
    if (posEl) {
      // Independent, immediately-saved toggle (same idiom as lockBtn above) —
      // always reflect the live server value, never preserve a pending click.
      posEl.checked = !!res.canViewOpenPositions;
      posEl.disabled = !res.configured; // nothing to grant before a viewer exists
    }
  }

  async function saveViewerCredentials() {
    const userEl = document.getElementById('viewer-username');
    const pwEl   = document.getElementById('viewer-password');
    const nameEl = document.getElementById('viewer-display-name');
    const msg    = document.getElementById('viewer-msg');
    const username = userEl ? userEl.value.trim() : '';
    const password = pwEl ? pwEl.value : '';
    const displayName = nameEl ? nameEl.value.trim() : '';
    if (!username)                { _viewerMsg(msg, 'שם משתמש נדרש', 'red'); return; }
    if (!password || password.length < 4) { _viewerMsg(msg, 'סיסמה חייבת להיות לפחות 4 תווים', 'red'); return; }
    const passwordHash = await Auth.sha256(password);
    const res = await API.setViewerCredentials(username, passwordHash, displayName);
    if (res.ok) {
      _viewerMsg(msg, '✓ נשמר — sessions קודמים של Viewer בוטלו', 'green');
      if (pwEl) pwEl.value = '';
      _refreshViewerStatus();
    } else {
      _viewerMsg(msg, res.error || 'שגיאה', 'red');
    }
  }

  // ── Owner display name (Phase 3, UI-only) ───────────────
  function showOwnerNameForm() {
    const f = document.getElementById('owner-name-form');
    if (f) f.style.display = 'block';
    _refreshViewerStatus(); // same endpoint also returns ownerDisplayName — always re-check live
  }
  function hideOwnerNameForm() {
    const f = document.getElementById('owner-name-form');
    if (f) f.style.display = 'none';
  }
  async function saveOwnerDisplayName() {
    const nameEl = document.getElementById('owner-display-name');
    const msg    = document.getElementById('owner-name-msg');
    const displayName = nameEl ? nameEl.value.trim() : '';
    const res = await API.setOwnerDisplayName(displayName);
    _viewerMsg(msg, res.ok ? '✓ נשמר' : (res.error || 'שגיאה'), res.ok ? 'green' : 'red');
  }

  async function toggleViewerEnabled() {
    const lockBtn = document.getElementById('viewer-lock-btn');
    const msg     = document.getElementById('viewer-msg');
    if (!lockBtn) return;
    const currentlyEnabled = lockBtn.dataset.enabled === '1';
    const res = await API.setViewerEnabled(!currentlyEnabled);
    if (res.ok) {
      _viewerMsg(msg, currentlyEnabled ? '✓ Viewer ננעל — sessions קיימים בוטלו' : '✓ Viewer שוחרר', 'green');
      _refreshViewerStatus();
    } else {
      _viewerMsg(msg, res.error || 'שגיאה', 'red');
    }
  }

  // Independent, immediately-saved toggle — same idiom as toggleViewerEnabled
  // above, but for the canViewOpenPositions permission (no session purge,
  // no need to retype the viewer's password just to flip this).
  async function toggleViewerPositionPermission() {
    const el  = document.getElementById('viewer-can-view-positions');
    const msg = document.getElementById('viewer-msg');
    if (!el) return;
    const res = await API.setViewerPositionPermission(el.checked);
    if (res.ok) {
      _viewerMsg(msg, res.canViewOpenPositions
        ? '✓ Viewer יכול לראות פוזיציות פתוחות'
        : '✓ פוזיציות פתוחות מוסתרות מה-Viewer', 'green');
    } else {
      el.checked = !el.checked; // revert optimistic UI change
      _viewerMsg(msg, res.error || 'שגיאה', 'red');
    }
  }

  function _viewerMsg(el, text, color) {
    if (!el) return;
    el.textContent = text;
    el.style.color = 'var(--' + color + ')';
  }

  // ── Compatibility shim ───────────────────────────────────
  function save() { _syncGoal(); }

  return {
    render, get, set, getPrefs, save, setTheme, toggleModule,
    clearCache, syncNow, validateData, exportJSON, triggerImport, importJSON,
    showPasswordChange, hidePasswordChange, changePassword, revokeAllSessions, _syncGoal,
    showViewerManage, hideViewerManage, saveViewerCredentials, toggleViewerEnabled,
    toggleViewerPositionPermission,
    showOwnerNameForm, hideOwnerNameForm, saveOwnerDisplayName,
  };
})();
