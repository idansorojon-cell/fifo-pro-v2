/** Presentation-only workspace. All figures use the existing Utils layer.
 * No network, auth, FIFO, tax, or persistence contract changes. */
const Workspace = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let range = 'all';
  let dialog, input, results, previousFocus;
  const destinations = [
    ['home','בית','תמונת התיק והמשימות'], ['positions','פוזיציות','החזקות, סטופ ויעד'],
    ['trades','עסקאות','היסטוריה ויומן מסחר'], ['performance','ביצועים','מדדים, גרפים וניתוח'],
    ['research','מחקר','מעקב ומנוע החלטות'], ['coach','מאמן','דפוסים ומשמעת'],
    ['chat',"צ׳אט",'שיחה עם המאמן'], ['settings','הגדרות','תיק, העדפות וחשבון']
  ];

  function chartData(trades, selectedRange, now = new Date()) {
    const cutoff = selectedRange === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : null;
    const included = trades.filter(t => !cutoff || Utils.parseDD(t.sell_date) >= cutoff);
    return Utils.calcStats(included);
  }

  function equitySVG(stats) {
    const values = [0, ...(stats.equity || []).map(point => Number(point.cum))];
    if (values.length < 2) return '<div class="workspace-empty">אין עסקאות סגורות בתקופה הזו. הגרף יופיע לאחר רישום עסקה.</div>';
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const y = n => 174 - (n - min) / span * 142;
    const coords = values.map((value, index) => `${32 + index / (values.length - 1) * 628},${y(value)}`);
    const tone = stats.totalNet >= 0 ? 'pos' : 'neg';
    return `<svg class="workspace-equity ${tone}" viewBox="0 0 700 205" role="img" aria-label="רווח ממומש מצטבר בתקופה, ${escape(Utils.f$(stats.totalNet))}">
      <defs><linearGradient id="workspace-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".22"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      ${[35,82,129,176].map(v => `<line class="workspace-gridline" x1="32" x2="660" y1="${v}" y2="${v}"/>`).join('')}
      <line class="workspace-baseline" x1="32" x2="660" y1="${y(0)}" y2="${y(0)}"/>
      <path d="M${coords.join(' L')} L660,190 L32,190 Z" fill="url(#workspace-fill)"/>
      <path d="M${coords.join(' L')}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="660" cy="${y(values.at(-1))}" r="4" fill="currentColor"/>
    </svg>`;
  }

  function enrichHome(root, stats) {
    const selected = range === 'all' ? stats : chartData(APP.trades, range);
    const hero = root.querySelector('.hero-metric');
    const layout = document.createElement('div');
    layout.className = 'workspace-overview';
    hero.before(layout);
    layout.append(hero);
    const graph = document.createElement('section');
    graph.className = 'workspace-card workspace-curve';
    graph.innerHTML = `<div class="workspace-card-head"><div><div class="workspace-eyebrow">PERFORMANCE SNAPSHOT</div><h2>ההתקדמות שלך</h2></div>
      <div class="segmented" aria-label="טווח הגרף"><button data-range="all" aria-pressed="${range === 'all'}" class="${range === 'all' ? 'active' : ''}">כל התקופה</button><button data-range="month" aria-pressed="${range === 'month'}" class="${range === 'month' ? 'active' : ''}">החודש</button></div></div>
      <div class="workspace-curve-summary"><bdi class="num ${selected.totalNet >= 0 ? 'pos' : 'neg'}">${Utils.f$(Math.round(selected.totalNet))}</bdi><span>רווח ממומש נטו · ${selected.total} עסקאות</span></div>
      ${equitySVG(selected)}<div class="workspace-chart-foot"><span>${escape(selected.monthArr?.at(-1)?.label || '')}</span><span>${escape(selected.monthArr?.[0]?.label || '')}</span></div>
      <p class="workspace-caption">צבירה חודשית של רווח ממומש, לפי מודל המס הקיים. לא שווי תיק ולא תשואה על ההון.</p>`;
    graph.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => { range = button.dataset.range; Home.render(); }));
    layout.append(graph);

    const pending = APP.trades.filter(t => !t.lesson && !t.entry_reason && !t.exit_reason);
    const noStop = APP.positions.filter(p => !(Number(p.stop_loss) > 0));
    const recent = [...APP.trades].sort((a,b) => Utils.parseDD(b.sell_date) - Utils.parseDD(a.sell_date)).slice(0,4);
    const section = document.createElement('section');
    section.className = 'workspace-bottom';
    section.innerHTML = `<div class="workspace-card workspace-actions"><div class="workspace-card-head"><div><div class="workspace-eyebrow">NEXT BEST ACTION</div><h2>סוגרים קצוות</h2></div>${icon('check-circle')}</div>
      <p class="workspace-caption">בדיקה אוטומטית של הנתונים שלך — ללא מודל AI וללא פעולה ללא אישור.</p>
      <button class="workspace-task" data-task="journal"><span class="workspace-task-icon">${icon('book')}</span><span><strong>${pending.length ? `${pending.length} עסקאות מחכות לתיעוד` : 'יומן העסקאות מעודכן'}</strong><small>${pending.length ? 'סיבת כניסה, יציאה ולקח חסרים. תיעוד מאפשר לזהות דפוסים.' : 'אפשר לעבור על העסקאות והלקחים האחרונים.'}</small></span>${icon('chevron')}</button>
      <button class="workspace-task" data-task="risk"><span class="workspace-task-icon ${noStop.length ? 'warn' : ''}">${icon('shield')}</span><span><strong>${noStop.length ? `${noStop.length} פוזיציות ללא סטופ מתועד` : 'בדיקת תוכניות המסחר'}</strong><small>${noStop.length ? 'השלם את התכנון. הרישום כאן אינו שולח הוראה לברוקר.' : 'בדוק יעדים, סטופים וחשיפה במסך הפוזיציות.'}</small></span>${icon('chevron')}</button></div>
      <div class="workspace-card"><div class="workspace-card-head"><div><div class="workspace-eyebrow">TRADE ACTIVITY</div><h2>העסקאות האחרונות</h2></div><button class="linklike" data-task="trades">לכל העסקאות ←</button></div>
      ${recent.length ? recent.map((t,i) => `<button class="workspace-recent" data-trade-index="${i}"><span class="workspace-symbol">${escape(t.symbol.slice(0,2))}</span><span><strong><bdi>${escape(t.symbol)}</bdi></strong><small>${escape(t.sell_date)} · ${t.lesson ? 'לקח מתועד' : 'צפייה ביומן'}</small></span><bdi class="num ${t.net >= 0 ? 'pos' : 'neg'}">${Utils.f$(Math.round(t.net))}</bdi>${icon('chevron')}</button>`).join('') : '<p class="workspace-empty">העסקה הראשונה שלך תופיע כאן.</p>'}</div>`;
    section.querySelector('[data-task="journal"]').addEventListener('click', () => {
      if (pending.length && !Auth.isViewer()) { Trades.applyFilter({symbol:pending.at(-1).symbol}); Journal.openModal(pending.at(-1).id); }
      else navigate('trades');
    });
    section.querySelector('[data-task="risk"]').addEventListener('click', () => {
      if (noStop.length && !Auth.isViewer()) actOnRisk(noStop[0].symbol); else navigate('positions');
    });
    section.querySelector('[data-task="trades"]').addEventListener('click', () => navigate('trades'));
    section.querySelectorAll('[data-trade-index]').forEach(button => button.addEventListener('click', () => Trades.applyFilter({symbol:recent[Number(button.dataset.tradeIndex)].symbol})));
    root.append(section);
  }

  function commands(query) {
    const list = destinations.map(([dest,label,description]) => ({label,description,run:() => navigate(dest)}));
    if (!Auth.isViewer()) list.unshift({label:'עסקה חדשה',description:'פתיחה, סגירה או רישום היסטורי',run:() => openTradeTicket()});
    const symbols = new Set([...APP.positions,...APP.watchlist,...APP.trades].map(p => p.symbol));
    [...symbols].sort().forEach(symbol => list.push({label:symbol,description:'היסטוריה לפי סימבול',run:() => Trades.applyFilter({symbol})}));
    const q = query.trim().toLocaleLowerCase();
    return list.filter(item => `${item.label} ${item.description}`.toLocaleLowerCase().includes(q)).slice(0,14);
  }

  function updateResults() {
    results.replaceChildren();
    const found = commands(input.value);
    if (!found.length) { results.textContent = 'לא נמצאו תוצאות. נסה שם מסך או סימבול אחר.'; return; }
    found.forEach(command => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'workspace-command';
      button.innerHTML = `<span><strong>${escape(command.label)}</strong><small>${escape(command.description)}</small></span>${icon('chevron')}`;
      button.addEventListener('click', () => { dialog.close(); command.run(); });
      results.append(button);
    });
  }

  function openSearch() {
    if (!Auth.isLoggedIn()) return;
    previousFocus = document.activeElement;
    input.value = ''; updateResults(); dialog.showModal(); input.focus();
  }

  function init() {
    dialog = document.createElement('dialog');
    dialog.className = 'workspace-dialog'; dialog.setAttribute('aria-label','חיפוש ופעולות מהירות');
    dialog.innerHTML = `<div class="workspace-search-head">${icon('search')}<input id="workspace-query" aria-label="חיפוש מסך או סימבול" placeholder="לאן ממשיכים? מסך, סימבול או פעולה…" autocomplete="off"><button class="btn-icon" aria-label="סגור חיפוש">${icon('x')}</button></div><div class="workspace-results"></div><div class="workspace-dialog-foot">↑ ↓ מעבר בין תוצאות · Enter לבחירה · Esc לסגירה</div>`;
    document.body.append(dialog);
    input = dialog.querySelector('input'); results = dialog.querySelector('.workspace-results');
    input.addEventListener('input', updateResults);
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => previousFocus?.focus());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', event => {
      const buttons = [...results.querySelectorAll('button')];
      const at = buttons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[(at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      } else if (event.key === 'Enter' && document.activeElement === input) { event.preventDefault(); buttons[0]?.click(); }
    });
    document.getElementById('workspace-search')?.addEventListener('click', openSearch);
    document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!dialog.open) openSearch(); } });
  }
  document.addEventListener('DOMContentLoaded', init);
  return { enrichHome, chartData, equitySVG, commands, openSearch };
})();
