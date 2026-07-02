/**
 * FIFO PRO — charts.js
 * All Chart.js instances. Destroy before re-create to avoid memory leaks.
 * Depends on: utils.js, app.js
 */

const Charts = (() => {
  const { f$, fpct, GREEN: G, RED: R, BLUE: B } = Utils;
  const GREEN  = 'rgba(78,204,168,';
  const RED    = 'rgba(255,107,107,';
  const BLUE   = 'rgba(100,181,246,';

  function dark() { return APP.darkMode; }

  function destroy(id) {
    if (APP.charts[id]) { APP.charts[id].destroy(); delete APP.charts[id]; }
  }

  function defaults() {
    const d = dark();
    return {
      ticks:   { color: d?'#8892a4':'#999', font:{size:10} },
      grid:    { color: d?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)' },
      tooltip: {
        bodyColor:       d?'#e8ecf4':'#333',
        titleColor:      d?'#e8ecf4':'#333',
        backgroundColor: d?'#1a2035':'#fff',
        borderColor:     d?'#2a3044':'#eee',
        borderWidth: 1,
        padding: 8,
        callbacks: { label: c => f$(c.raw) }
      }
    };
  }

  // ── Equity Curve ─────────────────────────────────────────

  function renderEquity(st) {
    destroy('equity');
    const canvas = document.getElementById('chart-equity');
    if (!canvas) return;
    const d = defaults();
    APP.charts['equity'] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: st.equity.map(e => e.label),
        datasets: [{
          data: st.equity.map(e => e.cum),
          borderColor:      GREEN+'1)',
          backgroundColor:  GREEN+'0.08)',
          borderWidth: 2.5,
          fill: true, tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: GREEN+'1)',
          pointHoverRadius: 5,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: d.tooltip
        },
        scales: {
          x: { ticks:{...d.ticks,maxRotation:45}, grid:{display:false} },
          y: { ticks:{...d.ticks,callback:v=>'$'+(v/1000).toFixed(0)+'k'}, grid:d.grid }
        }
      }
    });
  }

  // ── Monthly Bar ──────────────────────────────────────────

  function renderMonthly(st) {
    destroy('monthly');
    const canvas = document.getElementById('chart-monthly');
    if (!canvas) return;
    const d = defaults();
    APP.charts['monthly'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: st.monthArr.map(m => m.label),
        datasets: [{
          data: st.monthArr.map(m => m.net),
          backgroundColor: st.monthArr.map(m => m.net >= 0 ? GREEN+'0.85)' : RED+'0.85)'),
          borderRadius: 5,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend:{display:false}, tooltip:d.tooltip },
        scales: {
          x: { ticks:{...d.ticks,maxRotation:45}, grid:{display:false} },
          y: { ticks:{...d.ticks,callback:v=>'$'+(v/1000).toFixed(0)+'k'}, grid:d.grid }
        }
      }
    });
  }

  // ── Drawdown ─────────────────────────────────────────────

  function renderDrawdown(st) {
    destroy('dd');
    const canvas = document.getElementById('chart-dd');
    if (!canvas) return;
    const d = defaults();
    let peak=0, cum=0;
    const ddData = st.monthArr.map(m => {
      cum += m.net; peak = Math.max(peak, cum);
      return { label:m.label, dd: Math.round(cum - peak) };
    });
    APP.charts['dd'] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ddData.map(x => x.label),
        datasets: [{
          data: ddData.map(x => x.dd),
          borderColor:     RED+'1)',
          backgroundColor: RED+'0.08)',
          borderWidth: 2, fill: true, tension: 0.3,
          pointRadius: 2, pointBackgroundColor: RED+'1)',
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend:{display:false}, tooltip:d.tooltip },
        scales: {
          x: { ticks:{...d.ticks,maxRotation:45}, grid:{display:false} },
          y: { ticks:{...d.ticks,callback:v=>'$'+(v/1000).toFixed(0)+'k'}, grid:d.grid }
        }
      }
    });
  }

  // ── Symbol P&L (horizontal bar) ──────────────────────────

  function renderSymbol(st) {
    destroy('sym'); destroy('wr');
    const d = defaults();
    const top = st.symArr.slice(0,12);

    const cSym = document.getElementById('chart-sym');
    if (cSym) {
      APP.charts['sym'] = new Chart(cSym, {
        type: 'bar',
        data: {
          labels: top.map(s => s.symbol),
          datasets: [{
            data: top.map(s => s.net),
            backgroundColor: top.map(s => s.net >= 0 ? GREEN+'0.85)' : RED+'0.85)'),
            borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y', responsive:true, maintainAspectRatio:false,
          plugins: { legend:{display:false}, tooltip:d.tooltip },
          scales: {
            x: { ticks:{...d.ticks,callback:v=>'$'+(v/1000).toFixed(0)+'k'}, grid:d.grid },
            y: { ticks:d.ticks, grid:{display:false} }
          }
        }
      });
    }

    const sWR = [...st.symArr].sort((a,b) => b.winRate-a.winRate).slice(0,12);
    const cWR = document.getElementById('chart-wr');
    if (cWR) {
      APP.charts['wr'] = new Chart(cWR, {
        type: 'bar',
        data: {
          labels: sWR.map(s => s.symbol),
          datasets: [{
            data: sWR.map(s => s.winRate),
            backgroundColor: sWR.map(s => s.winRate>=70?GREEN+'0.85)':s.winRate>=50?BLUE+'0.85)':RED+'0.85)'),
            borderRadius: 4,
          }]
        },
        options: {
          indexAxis: 'y', responsive:true, maintainAspectRatio:false,
          plugins: { legend:{display:false}, tooltip:{ ...d.tooltip, callbacks:{ label:c=>c.raw+'%' } } },
          scales: {
            x: { ticks:{...d.ticks,callback:v=>v+'%'}, max:110, grid:d.grid },
            y: { ticks:d.ticks, grid:{display:false} }
          }
        }
      });
    }

    // Symbol table
    const tbl = document.getElementById('sym-table');
    if (tbl) {
      tbl.innerHTML = `
        <thead><tr>
          <th>סימבול</th><th>עסקאות</th><th>Win%</th><th>Avg Hold</th><th>נטו $</th>
        </tr></thead>
        <tbody>
          ${st.symArr.map(s => `
            <tr>
              <td style="font-weight:700">${s.symbol}</td>
              <td style="color:var(--text-3)">${s.trades}</td>
              <td class="${s.winRate>=70?'green':s.winRate>=50?'blue':'red'}">${s.winRate}%</td>
              <td style="color:var(--text-3)">${s.avgHold}י'</td>
              <td class="${s.net>=0?'green':'red'}" style="font-weight:700">${f$(s.net)}</td>
            </tr>
          `).join('')}
        </tbody>
      `;
    }
  }

  // ── Day-of-Week ──────────────────────────────────────────

  function renderDow(st) {
    destroy('dow');
    const canvas = document.getElementById('chart-dow');
    if (!canvas) return;
    const d = defaults();
    const labels = ['א','ב','ג','ד','ה','ו','ש'];
    const data   = labels.map((_,i) => Math.round((st.byDow[i]||{net:0}).net));
    APP.charts['dow'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: data.map(v => v>=0?GREEN+'0.85)':RED+'0.85)'),
          borderRadius: 4,
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend:{display:false}, tooltip:d.tooltip },
        scales: {
          x: { ticks:d.ticks, grid:{display:false} },
          y: { ticks:{...d.ticks,callback:v=>'$'+(v/1000).toFixed(0)+'k'}, grid:d.grid }
        }
      }
    });
  }

  // ── Hold Duration ────────────────────────────────────────

  function renderHold(st) {
    destroy('hold');
    const canvas = document.getElementById('chart-hold');
    if (!canvas) return;
    const d = defaults();
    const labels = Object.keys(st.holdBuckets);
    const data   = Object.values(st.holdBuckets).map(Math.round);
    APP.charts['hold'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: data.map(v => v>=0?GREEN+'0.85)':RED+'0.85)'),
          borderRadius: 4,
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend:{display:false}, tooltip:d.tooltip },
        scales: {
          x: { ticks:{...d.ticks,maxRotation:30}, grid:{display:false} },
          y: { ticks:{...d.ticks,callback:v=>'$'+(v/1000).toFixed(0)+'k'}, grid:d.grid }
        }
      }
    });
  }

  // ── Position Size ────────────────────────────────────────

  function renderSize(st) {
    destroy('size');
    const canvas = document.getElementById('chart-size');
    if (!canvas) return;
    const d = defaults();
    const labels = Object.keys(st.sizeBuckets);
    const data   = Object.values(st.sizeBuckets).map(Math.round);
    APP.charts['size'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: data.map(v => v>=0?GREEN+'0.85)':RED+'0.85)'),
          borderRadius: 4,
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend:{display:false}, tooltip:d.tooltip },
        scales: {
          x: { ticks:d.ticks, grid:{display:false} },
          y: { ticks:{...d.ticks,callback:v=>'$'+(v/1000).toFixed(0)+'k'}, grid:d.grid }
        }
      }
    });
  }

  // ── Win Rate over time ───────────────────────────────────

  function renderWinRateTime(st) {
    destroy('winrate-time');
    const canvas = document.getElementById('chart-winrate-time');
    if (!canvas) return;
    const d = defaults();
    const data = st.monthArr.map(m => m.trades ? Math.round(m.wins/m.trades*100) : 0);
    APP.charts['winrate-time'] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: st.monthArr.map(m => m.label),
        datasets: [
          { data, borderColor:BLUE+'1)', backgroundColor:BLUE+'0.08)', borderWidth:2, fill:true, tension:0.3, pointRadius:3 },
          { data:data.map(()=>60), borderColor:'rgba(255,255,255,0.1)', borderWidth:1, borderDash:[4,4], pointRadius:0, fill:false }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend:{display:false}, tooltip:{ ...d.tooltip, callbacks:{label:c=>c.raw+'%'} } },
        scales: {
          x: { ticks:{...d.ticks,maxRotation:45}, grid:{display:false} },
          y: { ticks:{...d.ticks,callback:v=>v+'%'}, min:0, max:100, grid:d.grid }
        }
      }
    });
  }

  // ── Rolling Avg ──────────────────────────────────────────

  function renderRollingAvg(st) {
    destroy('rolling-avg');
    const canvas = document.getElementById('chart-rolling-avg');
    if (!canvas) return;
    const d = defaults();
    const nets = st.monthArr.map(m => m.net);
    const rolling = nets.map((_,i) => {
      const w = nets.slice(Math.max(0,i-2), i+1);
      return Math.round(w.reduce((s,v)=>s+v,0)/w.length);
    });
    APP.charts['rolling-avg'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: st.monthArr.map(m => m.label),
        datasets: [
          { data:nets, backgroundColor:nets.map(v=>v>=0?GREEN+'0.3)':RED+'0.3)'), borderRadius:3, label:'חודשי' },
          { data:rolling, type:'line', borderColor:BLUE+'1)', borderWidth:2, pointRadius:2, fill:false, tension:0.3, label:'ממוצע נע 3M' }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: {
          legend:{ display:true, labels:{ font:{size:10}, color:d.ticks.color, boxWidth:12 } },
          tooltip:d.tooltip
        },
        scales: {
          x: { ticks:{...d.ticks,maxRotation:45}, grid:{display:false} },
          y: { ticks:{...d.ticks,callback:v=>'$'+(v/1000).toFixed(0)+'k'}, grid:d.grid }
        }
      }
    });
  }

  // ── PF over time ─────────────────────────────────────────

  function renderPFTime(st) {
    destroy('pf-time');
    const canvas = document.getElementById('chart-pf-time');
    if (!canvas) return;
    const d = defaults();
    const pfByMonth = st.monthArr.map(m => {
      const mt = APP.trades.filter(t => t.month === m.month);
      const gp = mt.filter(t=>t.net>0).reduce((s,t)=>s+t.gross,0);
      const gl = Math.abs(mt.filter(t=>t.net<0).reduce((s,t)=>s+t.gross,0));
      return gl > 0 ? +(gp/gl).toFixed(2) : gp > 0 ? 5 : 0;
    });
    APP.charts['pf-time'] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: st.monthArr.map(m => m.label),
        datasets: [
          { data:pfByMonth, borderColor:GREEN+'1)', backgroundColor:GREEN+'0.08)', borderWidth:2, fill:true, tension:0.3, pointRadius:3 },
          { data:pfByMonth.map(()=>1), borderColor:'rgba(255,255,255,0.1)', borderWidth:1, borderDash:[4,4], pointRadius:0, fill:false }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend:{display:false} },
        scales: {
          x: { ticks:{...d.ticks,maxRotation:45}, grid:{display:false} },
          y: { ticks:d.ticks, min:0, grid:d.grid }
        }
      }
    });
  }

  // ── Week of Month ────────────────────────────────────────

  function renderWeekOfMonth() {
    destroy('week-of-month');
    const canvas = document.getElementById('chart-week-of-month');
    if (!canvas) return;
    const d = defaults();
    const buckets = { 'שבוע 1\n(1-7)':0, 'שבוע 2\n(8-14)':0, 'שבוע 3\n(15-21)':0, 'שבוע 4\n(22+)':0 };
    APP.trades.forEach(t => {
      if (!t.sell_date) return;
      const day = parseInt(t.sell_date.split('/')[0]);
      if      (day<=7)  buckets['שבוע 1\n(1-7)']   += t.net;
      else if (day<=14) buckets['שבוע 2\n(8-14)']  += t.net;
      else if (day<=21) buckets['שבוע 3\n(15-21)'] += t.net;
      else              buckets['שבוע 4\n(22+)']    += t.net;
    });
    const data = Object.values(buckets).map(Math.round);
    APP.charts['week-of-month'] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: Object.keys(buckets),
        datasets: [{ data, backgroundColor:data.map(v=>v>=0?GREEN+'0.85)':RED+'0.85)'), borderRadius:4 }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend:{display:false}, tooltip:d.tooltip },
        scales: {
          x: { ticks:d.ticks, grid:{display:false} },
          y: { ticks:{...d.ticks,callback:v=>'$'+(v/1000).toFixed(0)+'k'}, grid:d.grid }
        }
      }
    });
  }

  return {
    destroy,
    renderEquity, renderMonthly, renderDrawdown,
    renderSymbol, renderDow, renderHold, renderSize,
    renderWinRateTime, renderRollingAvg, renderPFTime, renderWeekOfMonth,
  };
})();
