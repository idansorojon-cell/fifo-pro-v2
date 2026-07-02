/**
 * FIFO PRO — aiChat.js
 * AI Chat — sends full trading context + natural language Q&A
 * Depends on: utils.js, api.js, app.js
 */

const AIChat = (() => {
  const { f$, fpct, calcStats } = Utils;

  let history = [];
  let initialized = false;

  const SUGGESTIONS = [
    'באיזה מניות אני הכי טוב?',
    'כמה הפסדתי ללא סטופ?',
    'מה הסגנון שלי כמסחרן?',
    'מה החודש הכי טוב שלי?',
    'האם אני מחזיק הפסדים זמן רב מדי?',
    'מה ה-Profit Factor שלי?',
    'כמה הרווחתי השנה?',
    'האם יש Revenge Trading?',
  ];

  // ── Init ─────────────────────────────────────────────────

  function init() {
    if (initialized) return;
    initialized = true;
    history = [];
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.innerHTML = '';

    _addMsg('ai', 'שלום! אני ה-AI Coach שלך. אני מכיר את כל היסטוריית המסחר שלך ויכול לענות על שאלות. מה תרצה לדעת?');

    const sugg = document.getElementById('chat-suggestions');
    if (sugg) {
      sugg.innerHTML = SUGGESTIONS.map(s =>
        `<button class="chat-suggestion" onclick="AIChat._suggest('${s}')">${s}</button>`
      ).join('');
    }
  }

  function _suggest(text) {
    const inp = document.getElementById('chat-input');
    if (inp) inp.value = text;
    send();
  }

  // ── Send ─────────────────────────────────────────────────

  async function send() {
    const input = document.getElementById('chat-input');
    const text  = (input?.value || '').trim();
    if (!text) return;
    if (input) input.value = '';

    _addMsg('user', text);
    _addMsg('ai', '...', 'thinking');

    // Build context
    const st = Utils.calcStats(APP.trades);
    const context = _buildContext(st);

    history.push({ role:'user', content: text });

    try {
      // Proxied through Apps Script — never call Anthropic directly
      // from the browser (see api.js askClaude() for why).
      const reply = await API.askClaude(
        context,
        history.map(m => ({ role:m.role, content:m.content }))
      ) || 'לא הצלחתי לקבל תשובה';

      history.push({ role:'assistant', content: reply });

      // Replace thinking bubble
      const msgs = document.getElementById('chat-messages');
      const thinking = msgs?.querySelector('.thinking');
      if (thinking) {
        thinking.className = 'chat-msg ai';
        thinking.innerHTML = _formatReply(reply);
      }
    } catch(err) {
      const msgs = document.getElementById('chat-messages');
      const thinking = msgs?.querySelector('.thinking');
      if (thinking) {
        thinking.className = 'chat-msg ai';
        thinking.textContent = 'שגיאה: ' + err.message;
      }
    }

    // Scroll to bottom
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  // ── Build system context ──────────────────────────────────

  function _buildContext(st) {
    const topSyms = st.symArr.slice(0,5).map(s =>
      `${s.symbol}: ${f$(s.net)}, WR ${s.winRate}%, ${s.trades} עסקאות`
    ).join('; ');

    const monthSummary = st.monthArr.slice(-6).map(m =>
      `${m.label}: ${f$(m.net)}`
    ).join(', ');

    const journalNotes = APP.trades
      .filter(t => t.lesson || t.entry_reason)
      .slice(-10)
      .map(t => `${t.symbol} ${t.sell_date}: ${t.lesson || t.entry_reason}`)
      .join('\n');

    const openPos = APP.positions.map(p => {
      const live = APP.liveData[p.symbol];
      const pnl  = live?.price ? (live.price - p.avg_price) * p.qty : null;
      return `${p.symbol} x${p.qty} @ $${p.avg_price}${pnl!==null?` | P&L: ${f$(Math.round(pnl))}`:''}`;
    }).join('; ');

    return `אתה AI Coach מסחרי מקצועי עבור מסחר בשוק המניות האמריקאי.
דבר תמיד בעברית. ענה בצורה ישירה, קצרה וברורה. התמקד בנתונים.

═══ נתוני המסחר של המשתמש ═══

סה"כ עסקאות: ${st.total}
רווח נטו כולל: ${f$(Math.round(st.totalNet))}
Win Rate: ${st.winRate}%
Profit Factor: ${st.pf}
Expectancy: ${f$(Math.round(st.expectancy))}
Sharpe Ratio: ${st.sharpe}
Avg Win: ${f$(Math.round(st.avgWin))}
Avg Loss: ${f$(Math.round(Math.abs(st.avgLoss)))}
Max Drawdown: ${f$(Math.round(st.maxDD))}
Kelly %: ${Math.round(st.kelly*100)}%
Max Winning Streak: ${st.maxWS}
Max Losing Streak: ${st.maxLS}
Avg Hold Time: ${st.avgHold.toFixed(1)} ימים
Largest Win: ${f$(Math.round(st.largestWin))}
Largest Loss: ${f$(Math.round(st.largestLoss))}

═══ ביצועי סימבולים מובילים ═══
${topSyms}

═══ 6 חודשים אחרונים ═══
${monthSummary}

═══ פוזיציות פתוחות ═══
${openPos || 'אין פוזיציות פתוחות'}

═══ לקחים אחרונים ═══
${journalNotes || 'לא הוזנו לקחים'}

═══ הוראות ═══
- ענה על שאלות על הביצועים, הדפוסים והשיפורים
- צטט נתונים ספציפיים מהמידע לעיל
- אל תמציא נתונים שאינם מצוינים
- תן המלצות מעשיות וספציפיות
- שמור על טון מקצועי אך ידידותי
- אל תהיה ארוך מדי — 3-5 משפטים לרוב מספיקים`;
  }

  // ── DOM helpers ───────────────────────────────────────────

  function _addMsg(role, text, cls='') {
    const msgs = document.getElementById('chat-messages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${role}${cls?' '+cls:''}`;
    div.innerHTML = cls === 'thinking' ? '<span class="spinner"></span>' : _formatReply(text);
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function _formatReply(text) {
    // Convert markdown-like **bold** and line breaks
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  return { init, send, _suggest };
})();
