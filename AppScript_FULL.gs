/*******************************************************
 * FIFO PRO 2025/2026 — FULL DASHBOARD v13 ELITE
 *******************************************************/

const CFG = {
  IBI_RAW: "IBI_RAW",
  ACTIONS: "פעולות",
  FIFO: "עסקאות FIFO",
  SUMMARY: "סיכום",
  CHARTS: "גרפים",
  TOP_SYMBOLS: "מניות מובילות",
  OPEN_POSITIONS: "פוזיציות פתוחות",
  FX_MONTHLY: "USD_ILS_MONTHLY",
  DEFAULT_YEAR: 2025,
  TAX: 0.25,
  FX_FALLBACK: 3.5,
  WATCH_NEAR_PCT: 0.05,
  DASH: {
    CLEAR_RANGE: "A1:AZ400",
    KPI_START_ROW: 3,
    KPI_START_COL: 1,
    KPI_PER_ROW: 5,
    BESTWORST_ROW: 9,
    MONTH_TITLE_ROW: 18,
    MONTH_HEADER_ROW: 19,
    MONTH_DATA_ROW: 20,
    SYMBOL_TITLE_ROW: 18,
    SYMBOL_COL_START: 12,
    HELPER_COL_START: 27,
    CHART_W: 820,
    CHART_H: 280,
  },
};

/** ---------- UI ---------- **/
function onOpen() {
  createMenu_();
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  createMenu_();
  ensureSheetExists_(ss, CFG.ACTIONS);
  ensureSheetExists_(ss, CFG.FIFO);
  ensureSheetExists_(ss, CFG.SUMMARY);
  ensureSheetExists_(ss, CFG.CHARTS);
  ensureSheetExists_(ss, CFG.TOP_SYMBOLS);
  ensureSheetExists_(ss, CFG.OPEN_POSITIONS);
  ensureActionResearchColumns_();
  ensureMonthlyFxSheet_();
  installOnEditTrigger_();
  SpreadsheetApp.getActive().toast("הוגדר בהצלחה", "FIFO PRO");
}

function createMenu_() {
  SpreadsheetApp.getUi()
    .createMenu("FIFO PRO")
    .addItem("Build Elite Dashboard", "buildEliteDashboard")
    .addSeparator()
    .addItem("עדכן הכול (שערים + FIFO + סיכום)", "runAll")
    .addItem("עדכן שערי דולר חודשיים", "refreshMonthlyFxRates")
    .addItem("עדכן FIFO בלבד", "buildFIFO")
    .addItem("עדכן סיכום בלבד", "buildDashboard")
    .addItem("עדכן גרפים בלבד", "buildCharts")
    .addItem("עדכן מניות מובילות בלבד", "buildTopSymbolsWatchlist")
    .addItem("עדכן פוזיציות פתוחות בלבד", "buildOpenPositions")
    .addSeparator()
    .addItem("setup (התקנה)", "setup")
    .addToUi();
}

function runAll() {
  ensureActionResearchColumns_();
  refreshMonthlyFxRates();
  buildFIFO();
  buildOpenPositions();
  buildDashboard();
  buildCharts();
  buildTopSymbolsWatchlist();
}

function buildEliteDashboard() {
  try {
    ensureActionResearchColumns_();
    refreshMonthlyFxRates();
    buildFIFO();
    buildOpenPositions();
    buildDashboard();
    buildCharts();
    buildTopSymbolsWatchlist();
    SpreadsheetApp.getActive().toast("הדשבורד שודרג על בסיס המבנה הקודם", "FIFO PRO");
  } catch (err) {
    console.error("FIFO PRO Build Elite Dashboard error:", err);
    SpreadsheetApp.getActive().toast("לא הצלחתי לבנות את הדשבורד. בדוק Logs ונתוני קלט.", "FIFO PRO");
  }
}

/** ---------- TRIGGER ---------- **/
function installOnEditTrigger_() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "onEditHandler") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onEditHandler").forSpreadsheet(ss).onEdit().create();
}

function onEditHandler(e) {
  try {
    if (!e) return;
    const sh = e.range.getSheet();
    if (sh.getName() !== CFG.ACTIONS) return;
    if (e.range.getRow() === 1) return;
    const col = e.range.getColumn();
    if (col < 1 || col > 10) return;
    const props = PropertiesService.getScriptProperties();
    const now = Date.now();
    const last = Number(props.getProperty("lastRun") || 0);
    if (now - last < 1200) return;
    props.setProperty("lastRun", String(now));
    runAll();
  } catch (err) {
    console.error(err);
  }
}

/** ---------- MONTHLY FX ---------- **/
function refreshMonthlyFxRates() {
  ensureMonthlyFxSheet_();
  SpreadsheetApp.flush();
  SpreadsheetApp.getActive().toast("שערי דולר חודשיים עודכנו/נבדקו", "FIFO PRO");
}

function ensureMonthlyFxSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ensureSheetExists_(ss, CFG.FX_MONTHLY);
  sh.setRightToLeft(false);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 3).setValues([["Month (YYYY-MM)", "USD/ILS Avg", "Formula / Note"]]);
  sh.getRange(1, 1, 1, 3).setBackground("#0f172a").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(2, 120);
  sh.setColumnWidth(3, 560);
  sh.getRange("A:A").setNumberFormat("@");
  sh.getRange("B:B").setNumberFormat("0.000");

  const months = getRequiredMonthsFromActions_();
  const existing = readExistingFxMonths_(sh);
  const rowsToAppend = [];
  months.forEach(k => { if (!existing.has(k)) rowsToAppend.push([k, "", "auto"]); });
  if (rowsToAppend.length) sh.getRange(sh.getLastRow() + 1, 1, rowsToAppend.length, 3).setValues(rowsToAppend);

  const lr = sh.getLastRow();
  if (lr < 2) return;
  const all = sh.getRange(2, 1, lr - 1, 3).getValues();
  for (let i = 0; i < all.length; i++) {
    const row = i + 2;
    const key = String(all[i][0] || "").trim();
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const rateCell = sh.getRange(row, 2);
    const currentValue = num_(rateCell.getValue());
    const currentFormula = String(rateCell.getFormula() || "");
    if (!currentValue || currentFormula) {
      setMonthlyFxFormula_(rateCell, key);
      sh.getRange(row, 3).setValue("Monthly average by GOOGLEFINANCE. You may override column B manually.");
    }
  }
  sh.getRange(2, 1, Math.max(1, lr - 1), 3).setHorizontalAlignment("center").setBorder(true, true, true, true, true, true, "#e2e8f0", SpreadsheetApp.BorderStyle.SOLID);
}

function getRequiredMonthsFromActions_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shA = ss.getSheetByName(CFG.ACTIONS);
  const months = new Set();
  if (shA && shA.getLastRow() >= 2) {
    const rows = shA.getRange(2, 1, shA.getLastRow() - 1, 5).getValues();
    for (const r of rows) {
      const d = parseDate_(r[0], CFG.DEFAULT_YEAR);
      const type = normalizeTradeType_(r[2]);
      if (isValidDate_(d) && type === "SELL") months.add(monthKey_(d));
    }
  }
  if (!months.size) {
    const y1 = CFG.DEFAULT_YEAR, y2 = new Date().getFullYear();
    [y1, y2].forEach(y => { for (let m = 1; m <= 12; m++) months.add(`${y}-${String(m).padStart(2, "0")}`); });
  }
  return Array.from(months).sort();
}

function readExistingFxMonths_(sh) {
  const set = new Set();
  const lr = sh.getLastRow();
  if (lr < 2) return set;
  sh.getRange(2, 1, lr - 1, 1).getValues().forEach(r => { const k = String(r[0] || "").trim(); if (k) set.add(k); });
  return set;
}

function setMonthlyFxFormula_(cell, monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const start = `DATE(${y},${m},1)`;
  const end = `EOMONTH(${start},0)`;
  const fComma = `=IFERROR(AVERAGE(QUERY(GOOGLEFINANCE("CURRENCY:USDILS","price",${start},MIN(TODAY(),${end})),"select Col2 where Col2 is not null",0)),${CFG.FX_FALLBACK})`;
  cell.setFormula(fComma);
  SpreadsheetApp.flush();
  const disp = String(cell.getDisplayValue() || "");
  if (disp.startsWith("#")) {
    const fSemi = `=IFERROR(AVERAGE(QUERY(GOOGLEFINANCE("CURRENCY:USDILS";"price";${start};MIN(TODAY();${end}));"select Col2 where Col2 is not null";0));${CFG.FX_FALLBACK})`;
    cell.setFormula(fSemi);
  }
}

function getFxMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.FX_MONTHLY);
  const map = new Map();
  if (!sh || sh.getLastRow() < 2) return map;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (const r of data) {
    const key = String(r[0] || "").trim().replace(/^'/, "");
    const rate = num_(r[1]);
    if (/^\d{4}-\d{2}$/.test(key) && rate > 0) map.set(key, rate);
  }
  return map;
}

function getFxByMonth_(date, fxMap) {
  if (!isValidDate_(date)) return CFG.FX_FALLBACK;
  const key = monthKey_(date);
  if (fxMap && fxMap.has(key)) return fxMap.get(key);
  return CFG.FX_FALLBACK;
}

/** ---------- FIFO BUILD ---------- **/
function buildFIFO() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shA = mustSheet_(ss, CFG.ACTIONS);
  const shF = mustSheet_(ss, CFG.FIFO);

  ensureMonthlyFxSheet_();
  SpreadsheetApp.flush();
  const fxMap = getFxMap_();

  shF.clear({ contentsOnly: true });
  shF.clearConditionalFormatRules();
  shF.setRightToLeft(true);
  shF.setFrozenRows(1);
  try { shF.showColumns(1, shF.getMaxColumns()); } catch (_) {}

  const header = [["סימבול", "תאריך קנייה", "תאריך מכירה", "כמות", "מחיר קנייה", "מחיר מכירה",
    "עלות ($)", "ברוטו ($)", "מס ($)", "נטו ($)", "נטו (₪)", "% רווח",
    "חודש מכירה (YYYY-MM)", "שער דולר חודשי", "ימי החזקה"]];
  shF.getRange(1, 1, 1, 15).setValues(header);
  shF.getRange(1, 1, 1, 15).setBackground("#0f172a").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  [95,110,110,75,95,95,110,110,110,110,110,80,150,110,90].forEach((w, i) => shF.setColumnWidth(i + 1, w));
  shF.getRange("B:C").setNumberFormat("dd/MM/yyyy");
  shF.getRange("D:D").setNumberFormat("0.########");
  shF.getRange("E:J").setNumberFormat("0.00");
  shF.getRange("K:K").setNumberFormat('₪#,##0.00;[Red]-₪#,##0.00');
  shF.getRange("L:L").setNumberFormat("0.00");
  shF.getRange("M:M").setNumberFormat("@");
  shF.getRange("N:N").setNumberFormat("0.000");
  shF.getRange("O:O").setNumberFormat("0");

  const lrA = shA.getLastRow();
  if (lrA < 2) return;

  const rows = shA.getRange(2, 1, lrA - 1, 5).getValues();
  const events = [];
  for (const r of rows) {
    const d = parseDate_(r[0], CFG.DEFAULT_YEAR);
    const sym = String(r[1] || "").trim().toUpperCase();
    const type = normalizeTradeType_(r[2]);
    const qty = Math.abs(num_(r[3]));
    const price = num_(r[4]);
    if (!isValidDate_(d)) continue;
    if (!sym) continue;
    if (type !== "BUY" && type !== "SELL") continue;
    if (!qty || !price) continue;
    events.push({ d, sym, type, qty, price, row: events.length });
  }

  events.sort((a, b) => {
    const diff = a.d.getTime() - b.d.getTime();
    if (diff !== 0) return diff;
    if (a.type !== b.type) return a.type === "BUY" ? -1 : 1;
    return a.row - b.row;
  });

  const queues = {};
  const out = [];

  for (const ev of events) {
    if (!queues[ev.sym]) queues[ev.sym] = [];
    if (ev.type === "BUY") {
      queues[ev.sym].push({ d: ev.d, qty: ev.qty, price: ev.price });
      continue;
    }
    let remaining = ev.qty;
    while (remaining > 0) {
      if (!queues[ev.sym].length) {
        const fxMonth = getFxByMonth_(ev.d, fxMap);
        out.push([ev.sym, "", ev.d, remaining, "", ev.price, "", "", "", "", "", "", "'" + monthKey_(ev.d), fxMonth, ""]);
        break;
      }
      const lot = queues[ev.sym][0];
      const used = Math.min(remaining, lot.qty);
      const buyP = lot.price, sellP = ev.price;
      const cost = round2_(used * buyP);
      const gross = round2_((sellP - buyP) * used);
      const tax = round2_(gross * CFG.TAX);
      const net = round2_(gross - tax);
      const fxMonth = getFxByMonth_(ev.d, fxMap);
      const netIls = round2_(net * fxMonth);
      const pct = buyP ? round2_(((sellP - buyP) / buyP) * 100) : "";
      const holdDays = Math.max(0, Math.round((ev.d.getTime() - lot.d.getTime()) / (24 * 60 * 60 * 1000)));
      out.push([ev.sym, lot.d, ev.d, used, buyP, sellP, cost, gross, tax, net, netIls, pct, "'" + monthKey_(ev.d), fxMonth, holdDays]);
      lot.qty = roundQty_(lot.qty - used);
      remaining = roundQty_(remaining - used);
      if (lot.qty <= 0) queues[ev.sym].shift();
    }
  }

  if (!out.length) return;
  shF.getRange(2, 1, out.length, 15).setValues(out);
  try { shF.getRange(2, 1, out.length, 15).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY); } catch (_) {}
  const pctRange = shF.getRange(2, 12, out.length, 1);
  shF.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground("#dcfce7").setFontColor("#166534").setRanges([pctRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground("#fee2e2").setFontColor("#991b1b").setRanges([pctRange]).build(),
  ]);
}

/** ---------- DASHBOARD BUILD ---------- **/
function buildDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shF = mustSheet_(ss, CFG.FIFO);
  const shS = mustSheet_(ss, CFG.SUMMARY);
  try { shS.showColumns(1, shS.getMaxColumns()); } catch (_) {}
  const lr = shF.getLastRow();
  const data = (lr >= 2) ? shF.getRange(2, 1, lr - 1, Math.min(15, shF.getLastColumn())).getValues() : [];
  shS.getCharts().forEach(ch => shS.removeChart(ch));
  shS.getRange(CFG.DASH.CLEAR_RANGE).breakApart().clearContent().clearFormat();
  shS.clearConditionalFormatRules();
  shS.setRightToLeft(true);
  styleSummaryLayout_(shS);
  renderDashboardHeader_(shS);
  if (!data.length) { renderEmptyState_(shS); return; }
  const model = buildDashboardModel_(data);
  const cards = [
    { title: "נטו אחרי מס", sub: "USD", value: model.totalNet, fmt: "$", tone: model.totalNet >= 0 ? "good" : "bad" },
    { title: "נטו אחרי מס", sub: "ILS", value: model.totalNetIls, fmt: "₪", tone: model.totalNetIls >= 0 ? "good" : "bad" },
    { title: "שיעור הצלחה", sub: "Win rate", value: model.winRate, fmt: "%", tone: model.winRate >= 0.5 ? "good" : "warn" },
    { title: "ROI אחרי מס", sub: "על עלות FIFO", value: model.roiTotal, fmt: "%", tone: model.roiTotal >= 0 ? "good" : "bad" },
    { title: "עסקאות", sub: "סגורות", value: model.trades, fmt: "0", tone: "neutral" },
    { title: "Profit Factor", sub: "רווח / הפסד", value: model.profitFactor, fmt: "x", tone: model.profitFactor >= 1 ? "good" : "bad" },
    { title: "Expectancy", sub: "ממוצע לעסקה", value: model.expectancy, fmt: "$", tone: model.expectancy >= 0 ? "good" : "bad" },
    { title: "Max Drawdown", sub: "מימושים בלבד", value: -model.maxDD, fmt: "$", tone: "bad" },
    { title: "מס מחושב", sub: "USD", value: model.totalTax, fmt: "$", tone: model.totalTax >= 0 ? "warn" : "good" },
    { title: "ימי החזקה ממוצע", sub: "עסקאות FIFO", value: model.avgHoldDays, fmt: "days", tone: "info" },
    { title: "רווח גולמי", sub: "לפני מס", value: model.totalGrossProfit, fmt: "$", tone: "good" },
    { title: "הפסד גולמי", sub: "לפני מס", value: -model.totalGrossLossAbs, fmt: "$", tone: "bad" },
    { title: "Avg Win", sub: "עסקאות מרוויחות", value: model.avgWin, fmt: "$", tone: "good" },
    { title: "Avg Loss", sub: "עסקאות מפסידות", value: model.avgLoss, fmt: "$", tone: "bad" },
    { title: "ימי החזקה חציוני", sub: "עסקאות FIFO", value: model.medianHoldDays, fmt: "days", tone: "info" },
  ];
  renderCardsModern_(shS, cards, CFG.DASH.KPI_START_ROW, CFG.DASH.KPI_START_COL, CFG.DASH.KPI_PER_ROW);
  renderInsightStrip_(shS, model);
  renderRiskStrip_(shS, model);
  renderAlertsStrip_(shS, model);
  renderAutoInsights_(shS, model);
  renderMonthTable_(shS, model.monthRows);
  renderSymbolTable_(shS, model.symRows);
  try { shS.hideColumns(CFG.DASH.HELPER_COL_START, 6); } catch (_) {}
}

function buildCharts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shF = mustSheet_(ss, CFG.FIFO);
  const shC = ensureSheetExists_(ss, CFG.CHARTS);
  const lr = shF.getLastRow();
  const data = (lr >= 2) ? shF.getRange(2, 1, lr - 1, Math.min(15, shF.getLastColumn())).getValues() : [];
  try { shC.showColumns(1, shC.getMaxColumns()); } catch (_) {}
  shC.getCharts().forEach(ch => shC.removeChart(ch));
  shC.getRange("A1:AZ300").breakApart().clearContent().clearFormat();
  shC.setRightToLeft(true);
  styleDarkSheet_(shC, "A1:O90");
  shC.getRange("A1:O1").merge().setValue("FIFO PRO — גרפים").setBackground("#020617").setFontColor("#ffffff").setFontWeight("bold").setFontSize(18).setHorizontalAlignment("center").setVerticalAlignment("middle");
  shC.setRowHeight(1, 42);
  shC.getRange("A2:O2").merge().setValue("עודכן: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm")).setFontColor("#94a3b8").setHorizontalAlignment("left");
  if (!data.length) {
    shC.getRange("A4:O8").merge().setValue("אין נתונים לגרפים. הרץ קודם FIFO PRO > עדכן הכול.").setBackground("#111827").setFontColor("#e5e7eb").setHorizontalAlignment("center").setVerticalAlignment("middle");
    return;
  }
  const model = buildDashboardModel_(data);
  buildChartsSheet_(shC, model);
}

function buildOpenPositions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ensureSheetExists_(ss, CFG.OPEN_POSITIONS);
  const latestBuyBySym = getLatestBuyPriceBySymbol_();
  const positions = getOpenPositionsBySymbol_();
  sh.getRange("A1:Z300").breakApart().clearContent().clearFormat();
  sh.clearConditionalFormatRules();
  sh.setRightToLeft(true);
  styleDarkSheet_(sh, "A1:H300");
  sh.getRange("A1:H1").merge().setValue("FIFO PRO — פוזיציות פתוחות").setBackground("#020617").setFontColor("#ffffff").setFontWeight("bold").setFontSize(18).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.setRowHeight(1, 42);
  sh.getRange("A2:H2").merge().setValue("מחיר ממוצע פתוח מחושב לפי הלוטים שנותרו ב-FIFO. מחיר קנייה אחרונה נלקח מפעולת BUY האחרונה בטאב פעולות.").setFontColor("#94a3b8").setHorizontalAlignment("right");
  const headers = [["סימבול", "כמות פתוחה", "מחיר קנייה ממוצע פתוח FIFO", "מחיר קנייה אחרונה", "שער נוכחי", "P/L פתוח ($)", "P/L פתוח (%)", "סטטוס"]];
  sh.getRange(4, 1, 1, 8).setValues(headers);
  styleTableHeader_(sh.getRange(4, 1, 1, 8));
  const rows = Array.from(positions.entries())
    .map(([sym, v]) => {
      const avgOpen = v.qty ? v.cost / v.qty : 0;
      const latestBuy = latestBuyBySym.has(sym) ? num_(latestBuyBySym.get(sym).price) : avgOpen;
      return [sym, roundQty_(v.qty), round2_(avgOpen), round2_(latestBuy), "", "", "", ""];
    })
    .filter(r => r[1] > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (!rows.length) {
    sh.getRange("A6:H9").merge().setValue("אין כרגע פוזיציות פתוחות לפי טאב פעולות.").setBackground("#111827").setFontColor("#e5e7eb").setHorizontalAlignment("center").setVerticalAlignment("middle");
    return;
  }
  sh.getRange(5, 1, rows.length, 8).setValues(rows);
  for (let i = 0; i < rows.length; i++) {
    const row = 5 + i;
    sh.getRange(row, 5).setFormula(`=IFERROR(GOOGLEFINANCE(A${row},"price"),IFERROR(GOOGLEFINANCE("NASDAQ:"&A${row},"price"),IFERROR(GOOGLEFINANCE("NYSE:"&A${row},"price"),"")))`);
    sh.getRange(row, 6).setFormula(`=IFERROR((E${row}-C${row})*B${row},"")`);
    sh.getRange(row, 7).setFormula(`=IFERROR((E${row}-C${row})/C${row},"")`);
    sh.getRange(row, 8).setFormula(`=IF(E${row}="","אין שער",IF(G${row}>=0.1,"רווח פתוח חזק",IF(G${row}>=0,"רווח פתוח",IF(G${row}<=-0.1,"הפסד פתוח חריג","הפסד פתוח"))))`);
  }
  sh.getRange(5, 1, rows.length, 8).setBackground("#111827").setFontColor("#e5e7eb").setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true, true, true, true, true, true, "#334155", SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(5, 2, rows.length, 1).setNumberFormat("0.########");
  sh.getRange(5, 3, rows.length, 4).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
  sh.getRange(5, 7, rows.length, 1).setNumberFormat("0.00%");
  [90,110,180,140,110,130,120,150].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  for (let r = 5; r < 5 + rows.length; r++) sh.setRowHeight(r, 34);
  const plRange = sh.getRange(5, 6, rows.length, 2);
  const statusRange = sh.getRange(5, 8, rows.length, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground("#dcfce7").setFontColor("#166534").setRanges([plRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground("#fee2e2").setFontColor("#991b1b").setRanges([plRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains("רווח").setBackground("#16a34a").setFontColor("#ffffff").setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains("הפסד").setBackground("#991b1b").setFontColor("#fee2e2").setRanges([statusRange]).build(),
  ]);
}

function buildTopSymbolsWatchlist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shF = mustSheet_(ss, CFG.FIFO);
  const shW = ensureSheetExists_(ss, CFG.TOP_SYMBOLS);
  const lr = shF.getLastRow();
  const data = (lr >= 2) ? shF.getRange(2, 1, lr - 1, Math.min(15, shF.getLastColumn())).getValues() : [];
  shW.getRange("A1:AZ500").breakApart().clearContent().clearFormat();
  shW.clearConditionalFormatRules();
  shW.setRightToLeft(true);
  styleDarkSheet_(shW, "A1:AD500");
  shW.getRange("A1:AD1").merge().setValue("FIFO PRO — Radar לכל המניות").setBackground("#020617").setFontColor("#ffffff").setFontWeight("bold").setFontSize(18).setHorizontalAlignment("center").setVerticalAlignment("middle");
  shW.setRowHeight(1, 42);
  shW.getRange("A2:D2").merge().setValue("שערים בזמן אמת/מושהה דרך GOOGLEFINANCE").setFontColor("#94a3b8").setHorizontalAlignment("left");
  shW.getRange("U2:AD2").merge().setValue("סף התראה: " + Math.round(CFG.WATCH_NEAR_PCT * 100) + "% ממחיר הקנייה האחרונה").setBackground("#0f766e").setFontColor("#ecfeff").setFontWeight("bold").setHorizontalAlignment("center");
  const latestBuyBySym = getLatestBuyPriceBySymbol_();
  if (!data.length && !latestBuyBySym.size) {
    shW.getRange("A5:AD8").merge().setValue("אין נתוני FIFO או פעולות BUY. הזן פעולות בטאב 'פעולות' ואז הרץ FIFO PRO > עדכן הכול.").setBackground("#111827").setFontColor("#e5e7eb").setHorizontalAlignment("center").setVerticalAlignment("middle");
    return;
  }
  const rows = buildTopSymbolRows_(data, undefined, latestBuyBySym);
  const headers = [["דירוג", "סימבול", "שער נוכחי", "מחיר קנייה אחרונה", "מרחק ממחיר קנייה אחרונה",
    "סטטוס מחיר", "ציון היסטורי", "אות מחיר", "Net ($)", "Win Rate", "Profit Factor",
    "עסקאות", "Avg Win", "Avg Loss", "P/E", "EPS", "Market Cap", "High 52W",
    "Low 52W", "מיקום 52W", "Change %", "Volume", "Avg Volume", "Volume Ratio",
    "ציון פנדמנטלי", "ציון טכני", "דירוג אנליסטים", "יעד אנליסטים", "אות סופי", "סיבה"]];
  shW.getRange(4, 1, 1, 30).setValues(headers);
  styleTableHeader_(shW.getRange(4, 1, 1, 30));
  if (!rows.length) return;
  shW.getRange(5, 1, rows.length, 30).setValues(rows);
  for (let i = 0; i < rows.length; i++) {
    const row = 5 + i;
    shW.getRange(row, 3).setFormula(`=IFERROR(GOOGLEFINANCE(B${row},"price"),IFERROR(GOOGLEFINANCE("NASDAQ:"&B${row},"price"),IFERROR(GOOGLEFINANCE("NYSE:"&B${row},"price"),"")))`);
    shW.getRange(row, 5).setFormula(`=IFERROR((C${row}-D${row})/D${row},"")`);
    shW.getRange(row, 6).setFormula(`=IF(C${row}="","אין שער",IF(D${row}="","אין מחיר קנייה אחרונה",IF(ABS(E${row})<=${CFG.WATCH_NEAR_PCT},"קרוב למחיר קנייה אחרונה",IF(E${row}<0,"מתחת למחיר קנייה אחרונה","מעל מחיר קנייה אחרונה"))))`);
    shW.getRange(row, 8).setFormula(`=IF(OR(F${row}="אין שער",F${row}="אין מחיר קנייה אחרונה"),F${row},IF(AND(G${row}>=75,OR(F${row}="קרוב למחיר קנייה אחרונה",F${row}="מתחת למחיר קנייה אחרונה")),"בדיקה חזקה",IF(AND(G${row}>=65,F${row}<>"מעל מחיר קנייה אחרונה"),"מעקב",IF(G${row}>=75,"חזק אבל רחוק","להמתין"))))`);
    shW.getRange(row, 15).setFormula(`=IFERROR(GOOGLEFINANCE(B${row},"pe"),IFERROR(GOOGLEFINANCE("NASDAQ:"&B${row},"pe"),IFERROR(GOOGLEFINANCE("NYSE:"&B${row},"pe"),"")))`);
    shW.getRange(row, 16).setFormula(`=IFERROR(GOOGLEFINANCE(B${row},"eps"),IFERROR(GOOGLEFINANCE("NASDAQ:"&B${row},"eps"),IFERROR(GOOGLEFINANCE("NYSE:"&B${row},"eps"),"")))`);
    shW.getRange(row, 17).setFormula(`=IFERROR(GOOGLEFINANCE(B${row},"marketcap"),IFERROR(GOOGLEFINANCE("NASDAQ:"&B${row},"marketcap"),IFERROR(GOOGLEFINANCE("NYSE:"&B${row},"marketcap"),"")))`);
    shW.getRange(row, 18).setFormula(`=IFERROR(GOOGLEFINANCE(B${row},"high52"),IFERROR(GOOGLEFINANCE("NASDAQ:"&B${row},"high52"),IFERROR(GOOGLEFINANCE("NYSE:"&B${row},"high52"),"")))`);
    shW.getRange(row, 19).setFormula(`=IFERROR(GOOGLEFINANCE(B${row},"low52"),IFERROR(GOOGLEFINANCE("NASDAQ:"&B${row},"low52"),IFERROR(GOOGLEFINANCE("NYSE:"&B${row},"low52"),"")))`);
    shW.getRange(row, 20).setFormula(`=IFERROR((C${row}-S${row})/(R${row}-S${row}),"")`);
    shW.getRange(row, 21).setFormula(`=IFERROR(GOOGLEFINANCE(B${row},"changepct")/100,IFERROR(GOOGLEFINANCE("NASDAQ:"&B${row},"changepct")/100,IFERROR(GOOGLEFINANCE("NYSE:"&B${row},"changepct")/100,"")))`);
    shW.getRange(row, 22).setFormula(`=IFERROR(GOOGLEFINANCE(B${row},"volume"),IFERROR(GOOGLEFINANCE("NASDAQ:"&B${row},"volume"),IFERROR(GOOGLEFINANCE("NYSE:"&B${row},"volume"),"")))`);
    shW.getRange(row, 23).setFormula(`=IFERROR(GOOGLEFINANCE(B${row},"volumeavg"),IFERROR(GOOGLEFINANCE("NASDAQ:"&B${row},"volumeavg"),IFERROR(GOOGLEFINANCE("NYSE:"&B${row},"volumeavg"),"")))`);
    shW.getRange(row, 24).setFormula(`=IFERROR(V${row}/W${row},"")`);
    shW.getRange(row, 25).setFormula(`=IF(AND(O${row}="",P${row}="",Q${row}=""),"",ROUND(IF(P${row}>0,35,0)+IF(AND(O${row}>0,O${row}<=25),35,IF(AND(O${row}>25,O${row}<=45),20,IF(O${row}>45,5,15)))+IF(Q${row}>=10000000000,30,IF(Q${row}>=1000000000,22,12)),0))`);
    shW.getRange(row, 26).setFormula(`=IF(C${row}="","",ROUND(IF(T${row}>=0.5,30,15)+IF(U${row}>0,25,10)+IF(X${row}>=1,20,10)+IF(F${row}="מתחת למחיר קנייה אחרונה",25,IF(F${row}="קרוב למחיר קנייה אחרונה",20,5)),0))`);
    shW.getRange(row, 29).setFormula(`=IF(OR(F${row}="אין שער",F${row}="אין מחיר קנייה אחרונה"),F${row},IF(AND(G${row}>=75,Z${row}>=70,OR(F${row}="קרוב למחיר קנייה אחרונה",F${row}="מתחת למחיר קנייה אחרונה")),"בדיקה חזקה",IF(AND(G${row}>=70,Z${row}>=60),"מעקב איכותי",IF(AND(G${row}>=75,Y${row}>=60),"איכותי לבדיקה",IF(G${row}>=70,"חזק היסטורית","להמתין")))))`);
  }
  shW.getRange(5, 1, rows.length, 30).setBackground("#111827").setFontColor("#e5e7eb").setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true, true, true, true, true, true, "#334155", SpreadsheetApp.BorderStyle.SOLID);
  shW.getRange(5, 3, rows.length, 1).setNumberFormat('$#,##0.00');
  shW.getRange(5, 4, rows.length, 1).setNumberFormat('$#,##0.00');
  shW.getRange(5, 5, rows.length, 1).setNumberFormat('0.00%');
  shW.getRange(5, 7, rows.length, 1).setNumberFormat('0');
  shW.getRange(5, 9, rows.length, 1).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
  shW.getRange(5, 10, rows.length, 1).setNumberFormat('0.00%');
  shW.getRange(5, 11, rows.length, 1).setNumberFormat('0.00');
  shW.getRange(5, 12, rows.length, 1).setNumberFormat('0');
  shW.getRange(5, 13, rows.length, 2).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
  shW.getRange(5, 15, rows.length, 1).setNumberFormat('0.00');
  shW.getRange(5, 16, rows.length, 1).setNumberFormat('0.00');
  shW.getRange(5, 17, rows.length, 1).setNumberFormat('$#,##0');
  shW.getRange(5, 18, rows.length, 2).setNumberFormat('$#,##0.00');
  shW.getRange(5, 20, rows.length, 2).setNumberFormat('0.00%');
  shW.getRange(5, 22, rows.length, 2).setNumberFormat('#,##0');
  shW.getRange(5, 24, rows.length, 1).setNumberFormat('0.00');
  shW.getRange(5, 25, rows.length, 2).setNumberFormat('0');
  shW.getRange(5, 28, rows.length, 1).setNumberFormat('$#,##0.00');
  [70,90,110,130,130,150,100,130,110,100,100,80,110,110,80,80,120,100,100,110,100,100,100,100,110,100,130,120,130,430].forEach((w, i) => shW.setColumnWidth(i + 1, w));
  shW.getRange(5, 30, rows.length, 1).setWrap(true).setHorizontalAlignment("right");
  for (let r = 5; r < 5 + rows.length; r++) shW.setRowHeight(r, 34);
  const signalRange = shW.getRange(5, 6, rows.length, 1);
  const actionRange = shW.getRange(5, 8, rows.length, 1);
  const finalRange = shW.getRange(5, 29, rows.length, 1);
  shW.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("קרוב למחיר קנייה אחרונה").setBackground("#f59e0b").setFontColor("#111827").setRanges([signalRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("מתחת למחיר קנייה אחרונה").setBackground("#16a34a").setFontColor("#ffffff").setRanges([signalRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("מעל מחיר קנייה אחרונה").setBackground("#1e293b").setFontColor("#cbd5e1").setRanges([signalRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("אין מחיר קנייה אחרונה").setBackground("#334155").setFontColor("#cbd5e1").setRanges([signalRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("בדיקה חזקה").setBackground("#22c55e").setFontColor("#052e16").setRanges([actionRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("מעקב").setBackground("#f59e0b").setFontColor("#111827").setRanges([actionRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("חזק אבל רחוק").setBackground("#2563eb").setFontColor("#eff6ff").setRanges([actionRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("להמתין").setBackground("#334155").setFontColor("#cbd5e1").setRanges([actionRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("בדיקה חזקה").setBackground("#22c55e").setFontColor("#052e16").setRanges([finalRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("מעקב איכותי").setBackground("#f59e0b").setFontColor("#111827").setRanges([finalRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("איכותי לבדיקה").setBackground("#2563eb").setFontColor("#eff6ff").setRanges([finalRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("חזק היסטורית").setBackground("#7c3aed").setFontColor("#ffffff").setRanges([finalRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("להמתין").setBackground("#334155").setFontColor("#cbd5e1").setRanges([finalRange]).build(),
  ]);
  renderWatchlistNotes_(shW, rows.length);
}

function buildTopSymbolRows_(data, limit, latestBuyBySym) {
  const bySym = new Map();
  for (const r of data) {
    const sym = String(r[0] || "").trim().toUpperCase();
    if (!sym) continue;
    const qty = num_(r[3]), cost = num_(r[6]), net = num_(r[9]), buyPrice = num_(r[4]);
    const v = bySym.get(sym) || { count: 0, wins: 0, losses: 0, sumWin: 0, sumLossAbs: 0, net: 0, qty: 0, cost: 0, buyPriceQty: 0 };
    v.count++; v.net += net; v.qty += qty; v.cost += cost; v.buyPriceQty += buyPrice * qty;
    if (net > 0) { v.wins++; v.sumWin += net; }
    if (net < 0) { v.losses++; v.sumLossAbs += Math.abs(net); }
    bySym.set(sym, v);
  }
  latestBuyBySym = latestBuyBySym || new Map();
  latestBuyBySym.forEach((latest, sym) => { if (!bySym.has(sym)) bySym.set(sym, { count: 0, wins: 0, losses: 0, sumWin: 0, sumLossAbs: 0, net: 0, qty: 0, cost: 0, buyPriceQty: 0 }); });
  const items = Array.from(bySym.entries()).map(([sym, v]) => {
    const avgBuy = v.qty ? v.buyPriceQty / v.qty : 0;
    const latestBuy = latestBuyBySym.has(sym) ? num_(latestBuyBySym.get(sym).price) : avgBuy;
    const winRate = v.count ? v.wins / v.count : 0;
    const pf = v.sumLossAbs ? v.sumWin / v.sumLossAbs : (v.sumWin > 0 ? 999 : 0);
    const avgWin = v.wins ? v.sumWin / v.wins : 0;
    const avgLoss = v.losses ? -(v.sumLossAbs / v.losses) : 0;
    return { sym, net: v.net, latestBuy, winRate, pf, count: v.count, avgWin, avgLoss };
  });
  const maxNet = Math.max.apply(null, items.map(v => Math.max(0, v.net))) || 1;
  return items.map(v => {
    const pfScore = Math.min(v.pf, 5) / 5;
    const countScore = Math.min(v.count, 10) / 10;
    const netScore = Math.max(0, v.net) / maxNet;
    const score = Math.round((v.winRate * 35) + (pfScore * 25) + (countScore * 20) + (netScore * 20));
    const reason = buildWatchReason_(v, score);
    return Object.assign({}, v, { score, reason });
  }).sort((a, b) => (b.score - a.score) || (b.net - a.net)).slice(0, limit || items.length)
    .map((v, idx) => [idx + 1, v.sym, "", round2_(v.latestBuy), "", "", v.score, "", round2_(v.net), v.winRate, v.pf >= 999 ? 999 : v.pf, v.count, round2_(v.avgWin), round2_(v.avgLoss), "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", v.reason]);
}

function getLatestBuyPriceBySymbol_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shA = ss.getSheetByName(CFG.ACTIONS);
  const latest = new Map();
  if (!shA || shA.getLastRow() < 2) return latest;
  const rows = shA.getRange(2, 1, shA.getLastRow() - 1, 5).getValues();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const d = parseActionDateTime_(r[0], CFG.DEFAULT_YEAR);
    const sym = String(r[1] || "").trim().toUpperCase();
    const type = normalizeTradeType_(r[2]);
    const qty = Math.abs(num_(r[3]));
    const price = num_(r[4]);
    if (!isValidDate_(d) || !sym || type !== "BUY" || !qty || !price) continue;
    const t = d.getTime();
    const prev = latest.get(sym);
    if (!prev || t > prev.t || (t === prev.t && i > prev.rowIndex)) latest.set(sym, { price, date: d, t, rowIndex: i });
  }
  return latest;
}

function parseActionDateTime_(input, defaultYear) {
  if (input instanceof Date && isValidDate_(input)) return input;
  const raw = String(input || "").trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  const datePart = parts[0];
  const timePart = parts.length > 1 ? parts[1] : "";
  const dateBits = datePart.split(/[./-]/).map(x => Number(x));
  if (dateBits.length === 2 || dateBits.length === 3) {
    let y, m, d;
    if (dateBits.length === 2) { d = dateBits[0]; m = dateBits[1]; y = Number(defaultYear || CFG.DEFAULT_YEAR); }
    else if (dateBits[0] > 1900) { y = dateBits[0]; m = dateBits[1]; d = dateBits[2]; }
    else { d = dateBits[0]; m = dateBits[1]; y = dateBits[2] < 100 ? dateBits[2] + 2000 : dateBits[2]; }
    const timeBits = timePart ? timePart.split(":").map(x => Number(x)) : [];
    const hh = isFinite(timeBits[0]) ? timeBits[0] : 0;
    const mm = isFinite(timeBits[1]) ? timeBits[1] : 0;
    const ss = isFinite(timeBits[2]) ? timeBits[2] : 0;
    const parsed = new Date(y, m - 1, d, hh, mm, ss);
    if (isValidDate_(parsed)) return parsed;
  }
  const fallback = new Date(input);
  return isValidDate_(fallback) ? fallback : null;
}

function ensureActionResearchColumns_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.ACTIONS);
  if (!sh) return;
  const headersToAdd = ["אסטרטגיה", "סיבה לכניסה", "סיבה ליציאה", "טעות/לקח", "רמת ביטחון 1-5"];
  const lastCol = Math.max(1, sh.getLastColumn());
  const current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || "").trim());
  const missing = headersToAdd.filter(h => current.indexOf(h) === -1);
  if (!missing.length) return;
  sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  sh.getRange(1, lastCol + 1, 1, missing.length).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  missing.forEach((_, i) => sh.setColumnWidth(lastCol + 1 + i, i === 4 ? 120 : 160));
}

function getOpenPositionsBySymbol_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shA = ss.getSheetByName(CFG.ACTIONS);
  const positions = new Map();
  if (!shA || shA.getLastRow() < 2) return positions;
  const rows = shA.getRange(2, 1, shA.getLastRow() - 1, 5).getValues();
  const events = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const d = parseActionDateTime_(r[0], CFG.DEFAULT_YEAR);
    const sym = String(r[1] || "").trim().toUpperCase();
    const type = normalizeTradeType_(r[2]);
    const qty = Math.abs(num_(r[3]));
    const price = num_(r[4]);
    if (!isValidDate_(d) || !sym || (type !== "BUY" && type !== "SELL") || !qty || !price) continue;
    events.push({ d, sym, type, qty, price, row: i });
  }
  events.sort((a, b) => {
    const diff = a.d.getTime() - b.d.getTime();
    if (diff !== 0) return diff;
    if (a.type !== b.type) return a.type === "BUY" ? -1 : 1;
    return a.row - b.row;
  });
  const queues = {};
  for (const ev of events) {
    if (!queues[ev.sym]) queues[ev.sym] = [];
    if (ev.type === "BUY") { queues[ev.sym].push({ d: ev.d, qty: ev.qty, price: ev.price }); continue; }
    let remaining = ev.qty;
    while (remaining > 0 && queues[ev.sym].length) {
      const lot = queues[ev.sym][0];
      const used = Math.min(remaining, lot.qty);
      lot.qty = roundQty_(lot.qty - used);
      remaining = roundQty_(remaining - used);
      if (lot.qty <= 0) queues[ev.sym].shift();
    }
  }
  Object.keys(queues).forEach(sym => {
    let qty = 0, cost = 0;
    queues[sym].forEach(lot => { qty += lot.qty; cost += lot.qty * lot.price; });
    qty = roundQty_(qty);
    if (qty > 0) positions.set(sym, { qty, cost: round2_(cost), lots: queues[sym] });
  });
  return positions;
}

function buildWatchReason_(v, score) {
  const parts = [];
  if (v.net > 0) parts.push("Net חיובי");
  if (v.winRate >= 0.7) parts.push("Win Rate גבוה");
  else if (v.winRate >= 0.55) parts.push("Win Rate סביר");
  if (v.pf >= 3 || v.pf >= 999) parts.push("PF חזק");
  else if (v.pf >= 1.5) parts.push("PF תקין");
  if (v.count >= 10) parts.push("מדגם טוב");
  else if (v.count < 5) parts.push("מדגם קטן");
  parts.push("ציון " + score);
  return parts.join(" | ");
}

function renderWatchlistNotes_(sh, count) {
  const start = 8 + count;
  sh.getRange(start, 1, 1, 30).merge().setValue("איך להשתמש בזה").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange(start + 1, 1, 7, 30).merge()
    .setValue(["הלשונית מציגה סימבולים שהיו לך ב-FIFO וגם סימבולים עם BUY אחרון בטאב פעולות.",
      "ציון היסטורי = Net, Win Rate, Profit Factor ומספר עסקאות אצלך.",
      "ציון פנדמנטלי = EPS, P/E ושווי שוק לפי GOOGLEFINANCE כאשר המידע זמין.",
      "ציון טכני = מיקום ב-52 שבועות, שינוי יומי, ווליום ביחס לממוצע וקרבה למחיר הקנייה האחרונה שלך.",
      "דירוג אנליסטים ויעד אנליסטים אינם זמינים ב-GOOGLEFINANCE. העמודות מוכנות להזנה ידנית או לחיבור API עתידי.",
      "אות סופי משלב איכות היסטורית, טכני ופנדמנטלי. זה כלי תחקור ומעקב בלבד, לא המלצת קנייה.",
      "שערי GOOGLEFINANCE עשויים להיות מושהים או חסרים בחלק מהסימבולים."
    ].join("\n"))
    .setBackground("#111827").setFontColor("#cbd5e1").setWrap(true).setHorizontalAlignment("right").setVerticalAlignment("middle").setBorder(true, true, true, true, false, false, "#334155", SpreadsheetApp.BorderStyle.SOLID);
}

function buildDashboardModel_(data) {
  const byMonth = new Map(), bySym = new Map();
  let trades = 0, wins = 0, losses = 0, sumWin = 0, sumLossAbs = 0;
  let best = { v: -Infinity, sym: "", date: null }, worst = { v: Infinity, sym: "", date: null };
  let largestWin = { v: -Infinity, sym: "", date: null }, largestLoss = { v: Infinity, sym: "", date: null };
  let totalCost = 0, totalGross = 0, totalTax = 0, totalNet = 0, totalNetIls = 0;
  let totalGrossProfit = 0, totalGrossLossAbs = 0, fxSum = 0, fxCount = 0;
  const points = [], holdingDays = [];

  for (const r of data) {
    const sym = String(r[0] || "").trim();
    const buyDate = r[1], sellDate = r[2];
    const cost = num_(r[6]), gross = num_(r[7]), tax = num_(r[8]), net = num_(r[9]), netIls = num_(r[10]);
    const rawMonth = r[12], fxMonth = num_(r[13]), holdDays = num_(r[14]);
    const mKey = normalizeMonthKey_(rawMonth, sellDate);
    if (!mKey) continue;
    trades++; totalCost += cost; totalGross += gross; totalTax += tax; totalNet += net; totalNetIls += netIls;
    if (fxMonth > 0) { fxSum += fxMonth; fxCount++; }
    if (gross > 0) totalGrossProfit += gross;
    if (gross < 0) totalGrossLossAbs += Math.abs(gross);
    if (net > 0) { wins++; sumWin += net; }
    if (net < 0) { losses++; sumLossAbs += Math.abs(net); }
    if (net > best.v) best = { v: net, sym, date: sellDate };
    if (net < worst.v) worst = { v: net, sym, date: sellDate };
    if (net > largestWin.v) largestWin = { v: net, sym, date: sellDate };
    if (net < largestLoss.v) largestLoss = { v: net, sym, date: sellDate };
    if (holdDays > 0) holdingDays.push(holdDays);

    const bm = byMonth.get(mKey) || { count:0,wins:0,losses:0,sumWin:0,sumLossAbs:0,cost:0,grossProfit:0,grossLossAbs:0,gross:0,tax:0,net:0,netIls:0,maxLoss:0,bestTrade:0 };
    bm.count++; bm.cost+=cost; bm.gross+=gross; bm.tax+=tax; bm.net+=net; bm.netIls+=netIls;
    if (gross>0) bm.grossProfit+=gross; if (gross<0) bm.grossLossAbs+=Math.abs(gross);
    if (net>0){bm.wins++;bm.sumWin+=net;} if (net<0){bm.losses++;bm.sumLossAbs+=Math.abs(net);}
    bm.maxLoss=Math.min(bm.maxLoss,net); bm.bestTrade=Math.max(bm.bestTrade,net);
    byMonth.set(mKey, bm);

    const bs = bySym.get(sym) || { count:0,wins:0,losses:0,sumWin:0,sumLossAbs:0,gross:0,tax:0,net:0,netIls:0 };
    bs.count++; bs.gross+=gross; bs.tax+=tax; bs.net+=net; bs.netIls+=netIls;
    if (net>0){bs.wins++;bs.sumWin+=net;} if (net<0){bs.losses++;bs.sumLossAbs+=Math.abs(net);}
    bySym.set(sym, bs);

    const t = (sellDate instanceof Date && isValidDate_(sellDate)) ? sellDate.getTime() : (buyDate instanceof Date && isValidDate_(buyDate) ? buyDate.getTime() : Date.now());
    points.push({ t, net, sym, date: sellDate, holdDays });
  }

  const avgFxUsed = fxCount ? fxSum/fxCount : CFG.FX_FALLBACK;
  const winRate = trades ? wins/trades : 0;
  const avgWin = wins ? sumWin/wins : 0;
  const avgLoss = losses ? -(sumLossAbs/losses) : 0;
  const profitFactor = sumLossAbs ? sumWin/sumLossAbs : (sumWin>0?999:0);
  const expectancy = trades ? totalNet/trades : 0;
  const roiTotal = totalCost ? totalNet/totalCost : 0;
  const avgHoldDays = holdingDays.length ? holdingDays.reduce((a,b)=>a+b,0)/holdingDays.length : 0;
  const medianHoldDays = median_(holdingDays);

  points.sort((a,b)=>a.t-b.t);
  let eq=0,peak=0,maxDD=0,currentWinStreak=0,currentLossStreak=0,maxWinStreak=0,maxLossStreak=0;
  const equitySeries=[], equityRows=[];
  for (const p of points) {
    eq+=p.net; peak=Math.max(peak,eq);
    const dd=peak-eq; maxDD=Math.max(maxDD,dd);
    equitySeries.push({equity:eq,dd:-dd});
    equityRows.push([fmtDate_(p.date),round2_(p.net),round2_(eq),round2_(peak),round2_(-dd)]);
    if (p.net>0){currentWinStreak++;currentLossStreak=0;}
    else if (p.net<0){currentLossStreak++;currentWinStreak=0;}
    maxWinStreak=Math.max(maxWinStreak,currentWinStreak);
    maxLossStreak=Math.max(maxLossStreak,currentLossStreak);
  }

  const monthRows = Array.from(byMonth.keys()).sort().map(k=>{
    const v=byMonth.get(k);
    return [labelMonth_(k),v.count,round2_(v.cost),round2_(v.grossProfit),round2_(v.grossLossAbs),round2_(v.gross),round2_(v.tax),round2_(v.net),round2_(v.netIls),v.cost?v.net/v.cost:0];
  });
  const monthlyAnalysisRows = Array.from(byMonth.keys()).sort().map(k=>{
    const v=byMonth.get(k);
    const mWR=v.count?v.wins/v.count:0, mPf=v.sumLossAbs?v.sumWin/v.sumLossAbs:(v.sumWin>0?999:0);
    return [labelMonth_(k),v.count,round2_(v.net),mWR,mPf>=999?999:mPf,round2_(v.wins?v.sumWin/v.wins:0),round2_(v.losses?-(v.sumLossAbs/v.losses):0),round2_(v.maxLoss),round2_(v.bestTrade)];
  });
  const symRows = Array.from(bySym.entries()).map(([sym,v])=>{
    const sWR=v.count?v.wins/v.count:0,sPf=v.sumLossAbs?v.sumWin/v.sumLossAbs:(v.sumWin>0?999:0);
    return [sym,round2_(v.net),round2_(v.netIls),v.count,sWR,sPf,round2_(v.wins?v.sumWin/v.wins:0),round2_(v.losses?-(v.sumLossAbs/v.losses):0)];
  }).sort((a,b)=>b[1]-a[1]).slice(0,15);

  const bestMonth=monthRows.reduce((best,row)=>!best||row[7]>best[7]?row:best,null);
  const worstMonth=monthRows.reduce((worst,row)=>!worst||row[7]<worst[7]?row:worst,null);
  const ddToNet=totalNet?maxDD/Math.abs(totalNet):0;
  const payoffRatio=Math.abs(avgLoss)?avgWin/Math.abs(avgLoss):(avgWin>0?999:0);

  return { trades,wins,losses,best,worst,largestWin,largestLoss,totalCost,totalGross,totalTax,totalNet,totalNetIls,
    totalGrossProfit,totalGrossLossAbs,avgFxUsed,winRate,avgWin,avgLoss,profitFactor,
    expectancy,roiTotal,maxDD,ddToNet,payoffRatio,maxWinStreak,maxLossStreak,
    avgHoldDays,medianHoldDays,bestMonth,worstMonth,equitySeries,equityRows,monthRows,monthlyAnalysisRows,symRows };
}

/** ---------- DASHBOARD RENDERING ---------- **/
function renderDashboardHeader_(sh) {
  styleDarkSheet_(sh, "A1:S120");
  sh.getRange("A1:O1").merge().setValue("FIFO PRO — דשבורד מסחר Elite").setBackground("#020617").setFontColor("#ffffff").setFontWeight("bold").setFontSize(18).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange("A2:E2").merge().setValue("עודכן: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm")).setFontColor("#94a3b8").setFontSize(10).setHorizontalAlignment("left");
  sh.getRange("L2:M2").merge().setValue("שער דולר: חודשי").setBackground("#075985").setFontColor("#e0f2fe").setFontWeight("bold").setHorizontalAlignment("center").setBorder(true,true,true,true,false,false,"#7dd3fc",SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange("N2:O2").merge().setValue("מס: " + Math.round(CFG.TAX * 100) + "%").setBackground("#92400e").setFontColor("#fef3c7").setFontWeight("bold").setHorizontalAlignment("center").setBorder(true,true,true,true,false,false,"#fbbf24",SpreadsheetApp.BorderStyle.SOLID);
}

function renderEmptyState_(sh) {
  sh.getRange("A5:O8").merge().setValue("אין נתונים עדיין. הזן פעולות בטאב 'פעולות' ואז הפעל FIFO PRO > עדכן הכול.").setBackground("#f8fafc").setFontColor("#475569").setFontSize(12).setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true,true,true,true,false,false,"#cbd5e1",SpreadsheetApp.BorderStyle.SOLID);
}

function renderInsightStrip_(sh, model) {
  const bestText = model.best.sym ? `העסקה הטובה: ${model.best.sym} | ${fmtDate_(model.best.date)} | ${fmtMoney_(model.best.v)}` : "העסקה הטובה: אין נתונים";
  const worstText = model.worst.sym ? `העסקה החלשה: ${model.worst.sym} | ${fmtDate_(model.worst.date)} | ${fmtMoney_(model.worst.v)}` : "העסקה החלשה: אין נתונים";
  sh.getRange("A9:E9").merge().setValue(bestText);
  sh.getRange("F9:J9").merge().setValue(worstText);
  sh.getRange("K9:O9").merge().setValue(`מנצחות/מפסידות: ${model.wins}/${model.losses}`);
  sh.getRange("A9:O9").setBackground("#111827").setFontColor("#e5e7eb").setFontSize(10).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true,true,true,true,true,true,"#334155",SpreadsheetApp.BorderStyle.SOLID);
}

function renderRiskStrip_(sh, model) {
  const items = [`רצף רווחים מקסימלי: ${model.maxWinStreak}`,`רצף הפסדים מקסימלי: ${model.maxLossStreak}`,`הפסד בודד גדול: ${model.largestLoss.sym||""} ${fmtMoney_(model.largestLoss.v)}`,`Drawdown / Net: ${(model.ddToNet*100).toFixed(1)}%`,`Payoff Ratio: ${model.payoffRatio>=999?"∞":model.payoffRatio.toFixed(2)}`];
  sh.getRange("A10:C10").merge().setValue(items[0]);
  sh.getRange("D10:F10").merge().setValue(items[1]);
  sh.getRange("G10:I10").merge().setValue(items[2]);
  sh.getRange("J10:L10").merge().setValue(items[3]);
  sh.getRange("M10:O10").merge().setValue(items[4]);
  sh.getRange("A10:O10").setBackground("#1f2937").setFontColor("#fbbf24").setFontSize(10).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true,true,true,true,true,true,"#92400e",SpreadsheetApp.BorderStyle.SOLID);
}

function renderAlertsStrip_(sh, model) {
  const weakPf = (model.symRows||[]).filter(r=>num_(r[5])>0&&num_(r[5])<1).sort((a,b)=>num_(a[5])-num_(b[5]))[0];
  const holdAlert = model.avgHoldDays&&model.medianHoldDays&&model.avgHoldDays>model.medianHoldDays*2
    ? `זמן החזקה חריג: ממוצע ${Math.round(model.avgHoldDays)} ימים מול חציון ${Math.round(model.medianHoldDays)}`
    : `זמן החזקה: ממוצע ${Math.round(model.avgHoldDays||0)} ימים`;
  const ddAlert = model.ddToNet>0.25 ? `Drawdown גבוה: ${(model.ddToNet*100).toFixed(1)}% מה-Net` : `Drawdown: ${(model.ddToNet*100).toFixed(1)}% מה-Net`;
  const items = [`התראות`,`הפסד גדול: ${model.largestLoss.sym||""} ${fmtMoney_(model.largestLoss.v)}`,`רצף הפסדים: ${model.maxLossStreak}`,holdAlert,weakPf?`PF נמוך: ${weakPf[0]} (${num_(weakPf[5]).toFixed(2)})`:"אין סימבול עם PF נמוך",ddAlert];
  sh.getRange("A11:O11").merge().setValue(items.join(" | ")).setBackground("#3b1114").setFontColor("#fee2e2").setFontSize(10).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true).setBorder(true,true,true,true,false,false,"#ef4444",SpreadsheetApp.BorderStyle.SOLID);
}

function renderAutoInsights_(sh, model) {
  const topSym = model.symRows.length ? model.symRows[0] : null;
  const weakSym = model.symRows.length ? model.symRows[model.symRows.length-1] : null;
  const edgeSource = model.winRate>=0.6 ? "היתרון המרכזי מגיע משיעור הצלחה גבוה." : "היתרון המרכזי תלוי יותר בגודל הרווח ביחס להפסד.";
  const riskTone = model.ddToNet>0.25 ? "ה-Drawdown משמעותי ביחס לרווח הנקי, כדאי לבדוק גודל פוזיציה." : "ה-Drawdown נראה נשלט ביחס לרווח הנקי.";
  const monthText = model.bestMonth&&model.worstMonth ? `חודש חזק: ${model.bestMonth[0]} (${fmtMoney_(model.bestMonth[7])}) | חודש חלש: ${model.worstMonth[0]} (${fmtMoney_(model.worstMonth[7])})` : "אין מספיק חודשים להשוואה.";
  const symText = topSym ? `סימבול מוביל: ${topSym[0]} (${fmtMoney_(topSym[1])})${weakSym?` | סימבול לתחקור: ${weakSym[0]} (${fmtMoney_(weakSym[1])})`:""}`:"אין מספיק סימבולים להשוואה.";
  sh.getRange("A12:O12").merge().setValue("תובנות אוטומטיות").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange("A13:O16").merge().setValue([edgeSource,riskTone,monthText,symText].join("\n")).setBackground("#111827").setFontColor("#cbd5e1").setFontSize(10).setFontWeight("bold").setWrap(true).setHorizontalAlignment("right").setVerticalAlignment("middle").setBorder(true,true,true,true,false,false,"#334155",SpreadsheetApp.BorderStyle.SOLID);
}

function renderMonthTable_(sh, monthRows) {
  sh.getRange(CFG.DASH.MONTH_TITLE_ROW,1,1,10).merge().setValue("ביצועים לפי חודש").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange(CFG.DASH.MONTH_HEADER_ROW,1,1,10).setValues([["חודש","עסקאות","עלות ($)","Gross Profit","Gross Loss","Gross PnL","Tax ($)","Net After Tax ($)","Net After Tax (₪)","ROI"]]);
  styleTableHeader_(sh.getRange(CFG.DASH.MONTH_HEADER_ROW,1,1,10));
  if (!monthRows.length) return;
  sh.getRange(CFG.DASH.MONTH_DATA_ROW,1,monthRows.length,10).setValues(monthRows);
  styleMonthTable_(sh,CFG.DASH.MONTH_DATA_ROW,monthRows.length);
  applyMonthlyHeatmap_(sh,CFG.DASH.MONTH_DATA_ROW,monthRows);
}

function renderSymbolTable_(sh, symRows) {
  const c = CFG.DASH.SYMBOL_COL_START;
  sh.getRange(CFG.DASH.SYMBOL_TITLE_ROW,c,1,8).merge().setValue("ניתוח סימבולים מתקדם").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange(CFG.DASH.SYMBOL_TITLE_ROW+1,c,1,8).setValues([["סימבול","Net ($)","Net (₪)","#","Win Rate","PF","Avg Win","Avg Loss"]]);
  styleTableHeader_(sh.getRange(CFG.DASH.SYMBOL_TITLE_ROW+1,c,1,8));
  if (!symRows.length) return;
  const rng = sh.getRange(CFG.DASH.SYMBOL_TITLE_ROW+2,c,symRows.length,8);
  rng.setValues(symRows).setBackground("#111827").setFontColor("#e5e7eb").setHorizontalAlignment("center").setBorder(true,true,true,true,true,true,"#334155",SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(CFG.DASH.SYMBOL_TITLE_ROW+2,c+1,symRows.length,1).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
  sh.getRange(CFG.DASH.SYMBOL_TITLE_ROW+2,c+2,symRows.length,1).setNumberFormat('₪#,##0.00;[Red]-₪#,##0.00');
  sh.getRange(CFG.DASH.SYMBOL_TITLE_ROW+2,c+3,symRows.length,1).setNumberFormat('0');
  sh.getRange(CFG.DASH.SYMBOL_TITLE_ROW+2,c+4,symRows.length,1).setNumberFormat('0.00%');
  sh.getRange(CFG.DASH.SYMBOL_TITLE_ROW+2,c+5,symRows.length,1).setNumberFormat('0.00');
  sh.getRange(CFG.DASH.SYMBOL_TITLE_ROW+2,c+6,symRows.length,2).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
}

function styleSummaryLayout_(shS) {
  const widths={1:92,2:86,3:104,4:104,5:104,6:104,7:104,8:112,9:112,10:86,11:24,12:92,13:112,14:104,15:54,16:82,17:60,18:90,19:90};
  Object.keys(widths).forEach(k=>shS.setColumnWidth(Number(k),widths[k]));
  shS.setFrozenRows(2); shS.setRowHeight(1,42); shS.setRowHeight(2,26);
  for (let r=3;r<=8;r++) shS.setRowHeight(r,56);
  shS.setRowHeight(9,32); shS.setRowHeight(10,30); shS.setRowHeight(11,34); shS.setRowHeight(12,28);
  for (let r=13;r<=16;r++) shS.setRowHeight(r,24);
  for (let r=18;r<=70;r++) shS.setRowHeight(r,28);
}

function styleDarkSheet_(sh, rangeA1) {
  sh.getRange(rangeA1).setBackground("#0b1120").setFontColor("#e5e7eb").setFontFamily("Arial");
}

function styleTableHeader_(range) {
  range.setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setFontSize(9).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true).setBorder(true,true,true,true,true,true,"#1e293b",SpreadsheetApp.BorderStyle.SOLID);
}

function styleMonthTable_(sh, startRow, count) {
  const rng = sh.getRange(startRow,1,count,10);
  rng.setBackground("#111827").setFontColor("#e5e7eb").setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true,true,true,true,true,true,"#334155",SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(startRow,2,count,1).setNumberFormat("0");
  sh.getRange(startRow,3,count,6).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
  sh.getRange(startRow,9,count,1).setNumberFormat('₪#,##0.00;[Red]-₪#,##0.00');
  sh.getRange(startRow,10,count,1).setNumberFormat('0.00%');
  const netUsd=sh.getRange(startRow,8,count,1), netIls=sh.getRange(startRow,9,count,1), roi=sh.getRange(startRow,10,count,1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground("#dcfce7").setFontColor("#166534").setRanges([netUsd,netIls,roi]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setBackground("#fee2e2").setFontColor("#991b1b").setRanges([netUsd,netIls,roi]).build(),
  ]);
}

function applyMonthlyHeatmap_(sh, startRow, monthRows) {
  if (!monthRows.length) return;
  const maxAbsNet = Math.max.apply(null, monthRows.map(r=>Math.abs(num_(r[7])))) || 1;
  const backgrounds = monthRows.map(r=>{
    const net=num_(r[7]), intensity=Math.min(1,Math.abs(net)/maxAbsNet);
    const color=net>=0?heatColor_(intensity,true):heatColor_(intensity,false);
    return [color,color,color];
  });
  sh.getRange(startRow,8,monthRows.length,3).setBackgrounds(backgrounds);
}

function heatColor_(intensity, positive) {
  const steps = positive ? ["#064e3b","#047857","#059669","#10b981","#34d399"] : ["#7f1d1d","#991b1b","#b91c1c","#dc2626","#ef4444"];
  return steps[Math.min(steps.length-1,Math.floor(intensity*steps.length))];
}

function renderCardsModern_(sh, cards, startRow, startCol, perRow) {
  const tones={
    good:{bg:"#052e2b",border:"#10b981",title:"#6ee7b7",value:"#ecfdf5"},
    bad:{bg:"#3b1114",border:"#ef4444",title:"#fca5a5",value:"#fee2e2"},
    warn:{bg:"#3b2507",border:"#f59e0b",title:"#fcd34d",value:"#fffbeb"},
    info:{bg:"#0f1f3d",border:"#3b82f6",title:"#93c5fd",value:"#eff6ff"},
    neutral:{bg:"#111827",border:"#475569",title:"#cbd5e1",value:"#f8fafc"},
  };
  let r=startRow, c=startCol;
  for (let i=0;i<cards.length;i++){
    const card=cards[i], tone=tones[card.tone]||tones.neutral;
    const range=sh.getRange(r,c,2,2);
    range.merge().setBackground(tone.bg).setBorder(true,true,true,true,false,false,tone.border,SpreadsheetApp.BorderStyle.SOLID_MEDIUM).setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
    const valueText=formatProValue_(card.value,card.fmt), sub=card.sub||"";
    const text=`${card.title}\n${valueText}\n${sub}`;
    range.setValue(text);
    const rich=SpreadsheetApp.newRichTextValue().setText(text)
      .setTextStyle(0,card.title.length,SpreadsheetApp.newTextStyle().setFontSize(9).setForegroundColor(tone.title).setBold(true).build())
      .setTextStyle(card.title.length+1,card.title.length+1+valueText.length,SpreadsheetApp.newTextStyle().setFontSize(14).setForegroundColor(tone.value).setBold(true).build())
      .setTextStyle(text.length-sub.length,text.length,SpreadsheetApp.newTextStyle().setFontSize(8).setForegroundColor("#94a3b8").build())
      .build();
    range.setRichTextValue(rich);
    c+=2;
    if ((i+1)%perRow===0){r+=2;c=startCol;}
  }
}

/** ---------- Charts ---------- **/
function buildChartsSheet_(sh, model) {
  const monthRows=model.monthRows||[], equitySeries=model.equitySeries||[];
  const detailedEquityRows=model.equityRows||[], monthlyAnalysisRows=model.monthlyAnalysisRows||[], symRows=model.symRows||[];
  sh.getCharts().forEach(ch=>sh.removeChart(ch));
  [120,120,130,380,30,120,130,130,360,260,30,120,130,360,260].forEach((w,i)=>sh.setColumnWidth(i+1,w));

  sh.getRange("A4:D4").merge().setValue("Net After Tax לפי חודש").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange("A5:D5").setValues([["Month","Net","Cumulative","Visual Bar"]]);
  let cum=0;
  const monthChartRows=monthRows.map(r=>{const net=num_(r[7]);cum+=net;return [r[0],net,round2_(cum),""];});
  if (monthChartRows.length) {
    const maxAbsMonth=Math.max.apply(null,monthChartRows.map(r=>Math.abs(num_(r[1]))))||1;
    monthChartRows.forEach(r=>r[3]=barText_(r[1],maxAbsMonth,34));
    sh.getRange(6,1,monthChartRows.length,4).setValues(monthChartRows);
    styleChartDataBlock_(sh,5,1,monthChartRows.length+1,4);
    colorBarColumn_(sh,6,4,monthChartRows.map(r=>r[1]));
    sh.getRange(6,2,monthChartRows.length,2).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
    for (let r=6;r<6+monthChartRows.length;r++) sh.setRowHeight(r,28);
  }

  const equityStart=6+Math.max(monthChartRows.length,1)+4;
  sh.getRange(equityStart,1,1,5).merge().setValue("Equity Curve ו-Drawdown לאורך עסקאות").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange(equityStart+1,1,1,5).setValues([["Trade","Equity","Drawdown","Equity Bar","Drawdown Bar"]]);
  const sampledEquity=sampleSeries_(equitySeries,45);
  const equityRows=sampledEquity.map((p,idx)=>[idx+1,round2_(p.equity),round2_(p.dd),"",""]);
  if (equityRows.length) {
    const maxAbsEq=Math.max.apply(null,equityRows.map(r=>Math.abs(num_(r[1]))))||1;
    const maxAbsDd=Math.max.apply(null,equityRows.map(r=>Math.abs(num_(r[2]))))||1;
    equityRows.forEach(r=>{r[3]=barText_(r[1],maxAbsEq,28);r[4]=barText_(r[2],maxAbsDd,28);});
    sh.getRange(equityStart+2,1,equityRows.length,5).setValues(equityRows);
    styleChartDataBlock_(sh,equityStart+1,1,equityRows.length+1,5);
    colorBarColumn_(sh,equityStart+2,4,equityRows.map(r=>r[1]));
    colorBarColumn_(sh,equityStart+2,5,equityRows.map(r=>r[2]));
    sh.getRange(equityStart+2,2,equityRows.length,2).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
  }

  const symStart=equityStart+2+Math.max(equityRows.length,1)+4;
  sh.getRange(symStart,1,1,4).merge().setValue("Top סימבולים לפי Net").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange(symStart+1,1,1,4).setValues([["Symbol","Net","Win Rate %","Visual Bar"]]);
  const symChartRows=symRows.slice(0,10).map(r=>[r[0],num_(r[1]),num_(r[4])*100,""]);
  if (symChartRows.length) {
    const maxAbsSym=Math.max.apply(null,symChartRows.map(r=>Math.abs(num_(r[1]))))||1;
    symChartRows.forEach(r=>r[3]=barText_(r[1],maxAbsSym,34));
    sh.getRange(symStart+2,1,symChartRows.length,4).setValues(symChartRows);
    styleChartDataBlock_(sh,symStart+1,1,symChartRows.length+1,4);
    colorBarColumn_(sh,symStart+2,4,symChartRows.map(r=>r[1]));
    sh.getRange(symStart+2,2,symChartRows.length,1).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
    sh.getRange(symStart+2,3,symChartRows.length,1).setNumberFormat('0.00');
  }

  const monthlyStart=symStart+2+Math.max(symChartRows.length,1)+4;
  sh.getRange(monthlyStart,1,1,9).merge().setValue("ניתוח חודשי מתקדם").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange(monthlyStart+1,1,1,9).setValues([["חודש","עסקאות","רווח נטו","Win Rate","Profit Factor","Avg Win","Avg Loss","Max Loss","Best Trade"]]);
  if (monthlyAnalysisRows.length) {
    sh.getRange(monthlyStart+2,1,monthlyAnalysisRows.length,9).setValues(monthlyAnalysisRows);
    styleChartDataBlock_(sh,monthlyStart+1,1,monthlyAnalysisRows.length+1,9);
    sh.getRange(monthlyStart+2,2,monthlyAnalysisRows.length,1).setNumberFormat("0");
    sh.getRange(monthlyStart+2,3,monthlyAnalysisRows.length,1).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
    sh.getRange(monthlyStart+2,4,monthlyAnalysisRows.length,1).setNumberFormat("0.00%");
    sh.getRange(monthlyStart+2,5,monthlyAnalysisRows.length,1).setNumberFormat("0.00");
    sh.getRange(monthlyStart+2,6,monthlyAnalysisRows.length,4).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
  }

  const equityTableStart=monthlyStart+2+Math.max(monthlyAnalysisRows.length,1)+4;
  sh.getRange(equityTableStart,1,1,5).merge().setValue("Equity Curve מפורט").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  sh.getRange(equityTableStart+1,1,1,5).setValues([["תאריך מכירה","נטו אחרי מס","רווח מצטבר","High Water Mark","Drawdown"]]);
  if (detailedEquityRows.length) {
    sh.getRange(equityTableStart+2,1,detailedEquityRows.length,5).setValues(detailedEquityRows);
    styleChartDataBlock_(sh,equityTableStart+1,1,detailedEquityRows.length+1,5);
    sh.getRange(equityTableStart+2,2,detailedEquityRows.length,4).setNumberFormat('$#,##0.00;[Red]-$#,##0.00');
    const chartRows=Math.max(2,detailedEquityRows.length+1);
    const equityChart=sh.newChart().setChartType(Charts.ChartType.LINE).addRange(sh.getRange(equityTableStart+1,1,chartRows,1)).addRange(sh.getRange(equityTableStart+1,3,chartRows,1)).setOption("title","Equity Curve — רווח מצטבר").setOption("colors",["#22c55e"]).setOption("lineWidth",3).setOption("legend",{position:"none"}).setOption("backgroundColor","#ffffff").setPosition(equityTableStart,11,0,0).build();
    const drawdownChart=sh.newChart().setChartType(Charts.ChartType.AREA).addRange(sh.getRange(equityTableStart+1,1,chartRows,1)).addRange(sh.getRange(equityTableStart+1,5,chartRows,1)).setOption("title","Drawdown").setOption("colors",["#ef4444"]).setOption("areaOpacity",0.25).setOption("legend",{position:"none"}).setOption("backgroundColor","#ffffff").setPosition(equityTableStart+18,11,0,0).build();
    sh.insertChart(equityChart); sh.insertChart(drawdownChart);
  }
}

function styleChartDataBlock_(sh, row, col, rows, cols) {
  sh.getRange(row,col,rows,cols).setBackground("#111827").setFontColor("#e5e7eb").setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true,true,true,true,true,true,"#334155",SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(row,col,1,cols).setBackground("#243244").setFontColor("#ffffff").setFontWeight("bold");
}

function colorBarColumn_(sh, startRow, col, values) {
  values.forEach((v,i)=>{ const n=num_(v); sh.getRange(startRow+i,col).setFontColor(n>=0?"#22c55e":"#ef4444").setFontWeight("bold").setHorizontalAlignment("left"); });
}

function barText_(value, maxAbs, width) {
  const n=num_(value), max=Math.max(1,Math.abs(num_(maxAbs))), len=Math.max(1,Math.round((Math.abs(n)/max)*width));
  return n<0?"−"+"█".repeat(len):"█".repeat(len);
}

function sampleSeries_(series, maxPoints) {
  const arr=series||[];
  if (arr.length<=maxPoints) return arr;
  const out=[];
  const step=(arr.length-1)/(maxPoints-1);
  for (let i=0;i<maxPoints;i++) out.push(arr[Math.round(i*step)]);
  return out;
}

/** ---------- Helpers ---------- **/
function mustSheet_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('חסר טאב בשם: "' + name + '"');
  return sh;
}

function ensureSheetExists_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function num_(v) {
  if (typeof v === "number") return v;
  let s = String(v || "").trim();
  if (!s) return 0;
  s = s.split("₪").join("").split("$").join("").split("€").join("").split("£").join("").split(" ").join("");
  if (s.indexOf(",")>=0&&s.indexOf(".")>=0) {
    const lastComma=s.lastIndexOf(","), lastDot=s.lastIndexOf(".");
    if (lastComma>lastDot) s=s.split(".").join("").replace(",",".");
    else s=s.split(",").join("");
  } else if (s.indexOf(",")>=0) {
    const parts=s.split(",");
    if (parts.length===2&&parts[1].length<=2) s=parts[0]+"."+parts[1];
    else s=s.split(",").join("");
  }
  let clean="";
  for (let i=0;i<s.length;i++){const ch=s.charAt(i);if((ch>="0"&&ch<="9")||ch==="."||ch==="-")clean+=ch;}
  const n=parseFloat(clean);
  return isNaN(n)?0:n;
}

function round2_(n) { n=Number(n); if (!isFinite(n)) return 0; return Math.round(n*100)/100; }
function roundQty_(n) { n=Number(n); if (!isFinite(n)) return 0; return Math.round(n*100000000)/100000000; }

function median_(values) {
  const arr=(values||[]).map(num_).filter(v=>isFinite(v)).sort((a,b)=>a-b);
  if (!arr.length) return 0;
  const mid=Math.floor(arr.length/2);
  return arr.length%2?arr[mid]:(arr[mid-1]+arr[mid])/2;
}

function isValidDate_(d) { return d instanceof Date && !isNaN(d.getTime()); }

function parseDate_(input, defaultYear) {
  if (input instanceof Date && isValidDate_(input)) return input;
  let s = String(input || "").trim();
  if (!s) return null;
  s = s.split(".").join("/").split("-").join("/");
  const p = s.split("/").map(x=>Number(x));
  if (p.length===3&&p[0]>1900) return new Date(p[0],p[1]-1,p[2]);
  if (p.length===3) { let y=p[2]; if (y<100) y+=2000; return new Date(y,p[1]-1,p[0]); }
  if (p.length===2) return new Date(defaultYear,p[1]-1,p[0]);
  const d=new Date(input);
  return isValidDate_(d)?d:null;
}

function normalizeTradeType_(value) {
  let s = String(value || "").trim().toUpperCase();
  if (!s) return "";
  if (["BUY","BOT","B","קניה","קנייה","רכישה"].includes(s)) return "BUY";
  if (["SELL","SEL","SLD","S","מכירה"].includes(s)) return "SELL";
  return s;
}

function monthKey_(d) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"); return `${y}-${m}`; }

function normalizeMonthKey_(raw, fallbackDate) {
  const s=String(raw||"").trim().replace("'","");
  const p=s.split("-");
  if (p.length===2&&p[0].length===4) return `${p[0]}-${String(Number(p[1])).padStart(2,"0")}`;
  if (fallbackDate instanceof Date&&isValidDate_(fallbackDate)) return monthKey_(fallbackDate);
  return "";
}

function labelMonth_(yyyyMm) {
  const [y,m]=String(yyyyMm).split("-");
  const d=new Date(Number(y),Number(m)-1,1);
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

function fmtDate_(d) { if (!(d instanceof Date)||!isValidDate_(d)) return ""; return Utilities.formatDate(d,Session.getScriptTimeZone(),"dd/MM/yyyy"); }
function fmtMoney_(n) { n=Number(n); if (!isFinite(n)) return ""; return (n<0?"-$":"$")+Math.abs(n).toFixed(2); }

function formatProValue_(value, fmt) {
  const n=Number(value); if (!isFinite(n)) return "";
  if (fmt==="0") return String(Math.round(n));
  if (fmt==="%") return (n*100).toFixed(2)+"%";
  if (fmt==="fx") return n.toFixed(3);
  if (fmt==="days") return Math.round(n)+" ימים";
  if (fmt==="x") return n>=999?"∞":n.toFixed(2);
  if (fmt==="₪") return (n<0?"-₪":"₪")+Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  if (fmt==="$") return (n<0?"-$":"$")+Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  return String(n);
}

function detectDominantYear_(data) {
  const counts={};
  for (const r of data||[]){const d=r[2] instanceof Date?r[2]:r[1];if (d instanceof Date&&isValidDate_(d)){const y=d.getFullYear();counts[y]=(counts[y]||0)+1;}}
  let bestYear=CFG.DEFAULT_YEAR, bestCount=-1;
  Object.keys(counts).forEach(y=>{if (counts[y]>bestCount){bestCount=counts[y];bestYear=Number(y);}});
  return bestYear;
}

/*******************************************************
 * Rollback Layer
 *******************************************************/
function buildStableDashboardRollback() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shSummary = ensureSheetExists_(ss, CFG.SUMMARY);
  removeSummaryChartsOnly_(shSummary);
  buildDashboard();
  removeSummaryChartsOnly_(shSummary);
  hideRollbackExtraTabs_();
}

function removeSummaryChartsOnly_(sheet) {
  if (!sheet) return;
  for (let guard=0;guard<10;guard++){
    const charts=sheet.getCharts();
    if (!charts.length) return;
    charts.forEach(chart=>{try{sheet.removeChart(chart);}catch(err){console.warn("Could not remove summary chart: "+err);}});
    SpreadsheetApp.flush();
  }
}

function hideRollbackExtraTabs_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  ["Equity Curve","Monthly Performance","Symbol Performance"].forEach(name=>{
    const sh=ss.getSheetByName(name);
    if (sh){try{sh.hideSheet();}catch(err){console.warn("Could not hide tab "+name+": "+err);}}
  });
  const summary=ss.getSheetByName(CFG.SUMMARY);
  if (summary) ss.setActiveSheet(summary);
}

/*******************************************************
 * Visual Polish Layer
 *******************************************************/
const VISUAL = {
  navy:"#0F172A",navy2:"#111827",card:"#1E293B",card2:"#243244",border:"#334155",
  text:"#FFFFFF",muted:"#CBD5E1",dim:"#94A3B8",green:"#22C55E",greenSoft:"#052E1B",
  red:"#EF4444",redSoft:"#3B1114",orange:"#F59E0B",orangeSoft:"#3B2507",
  blue:"#3B82F6",blueSoft:"#0F1F3D"
};

/*******************************************************
 * AUTO REFRESH LAYER
 *******************************************************/
const FIFO_AUTO_REFRESH = {
  ACTIONS_SHEET: "פעולות",
  DATA_FIRST_ROW: 2,
  RELEVANT_FIRST_COL: 1,
  RELEVANT_LAST_COL: 5,
  SIGNATURE_PROP: "FIFO_AUTO_REFRESH_ACTIONS_SIGNATURE",
  LAST_RUN_PROP: "FIFO_AUTO_REFRESH_LAST_RUN_MS",
  MIN_RUN_GAP_MS: 1500,
  INSTALL_BACKUP_TRIGGER: true
};

function installAutoRefreshTriggers_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const handlersToReplace = ["onEditHandler","autoRefreshOnEdit","backupAutoRefreshEvery5Min"];
  ScriptApp.getProjectTriggers().forEach(trigger=>{
    if (handlersToReplace.indexOf(trigger.getHandlerFunction())!==-1) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("autoRefreshOnEdit").forSpreadsheet(ss).onEdit().create();
  if (FIFO_AUTO_REFRESH.INSTALL_BACKUP_TRIGGER) {
    ScriptApp.newTrigger("backupAutoRefreshEvery5Min").timeBased().everyMinutes(5).create();
  }
}

function autoRefreshOnEdit(e) {
  if (!shouldAutoRefreshFromEdit_(e)) return;
  runAutoRefreshWithLock_("onEdit");
}

function backupAutoRefreshEvery5Min() {
  try {
    const currentSignature=getActionsDataSignature_();
    if (!currentSignature) return;
    const props=PropertiesService.getScriptProperties();
    const previousSignature=props.getProperty(FIFO_AUTO_REFRESH.SIGNATURE_PROP);
    if (previousSignature===currentSignature) return;
    runAutoRefreshWithLock_("backup-5-min");
  } catch(err) { Logger.log("FIFO PRO backupAutoRefreshEvery5Min error: "+formatAutoRefreshError_(err)); }
}

function shouldAutoRefreshFromEdit_(e) {
  try {
    if (!e||!e.range) return false;
    const range=e.range, sheet=range.getSheet();
    if (!sheet||sheet.getName()!==FIFO_AUTO_REFRESH.ACTIONS_SHEET) return false;
    const firstRow=range.getRow(), lastRow=firstRow+range.getNumRows()-1;
    if (lastRow<FIFO_AUTO_REFRESH.DATA_FIRST_ROW) return false;
    const firstCol=range.getColumn(), lastCol=firstCol+range.getNumColumns()-1;
    if (lastCol<FIFO_AUTO_REFRESH.RELEVANT_FIRST_COL) return false;
    if (firstCol>FIFO_AUTO_REFRESH.RELEVANT_LAST_COL) return false;
    return true;
  } catch(err) { Logger.log("FIFO PRO shouldAutoRefreshFromEdit_ error: "+formatAutoRefreshError_(err)); return false; }
}

function runAutoRefreshWithLock_(source) {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) { Logger.log("FIFO PRO auto refresh skipped — another refresh is running. Source: "+source); return; }
  try {
    const props=PropertiesService.getScriptProperties();
    const now=Date.now(), lastRun=Number(props.getProperty(FIFO_AUTO_REFRESH.LAST_RUN_PROP)||0);
    if (now-lastRun<FIFO_AUTO_REFRESH.MIN_RUN_GAP_MS) return;
    props.setProperty(FIFO_AUTO_REFRESH.LAST_RUN_PROP,String(now));
    runFullFifoRefresh_();
    updateAutoRefreshActionsSignature_();
  } catch(err) { Logger.log("FIFO PRO auto refresh error. Source: "+source+". "+formatAutoRefreshError_(err)); }
  finally { lock.releaseLock(); }
}

function runFullFifoRefresh_() {
  ensureActionResearchColumns_();
  refreshMonthlyFxRates();
  buildFIFO();
  buildOpenPositions();
  if (typeof buildStableDashboardRollback==="function") buildStableDashboardRollback();
  else buildDashboard();
  if (typeof buildCharts==="function") buildCharts();
  buildTopSymbolsWatchlist();
}

function updateAutoRefreshActionsSignature_() {
  const signature=getActionsDataSignature_();
  if (!signature) return;
  PropertiesService.getScriptProperties().setProperty(FIFO_AUTO_REFRESH.SIGNATURE_PROP,signature);
}

function getActionsDataSignature_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const sheet=ss.getSheetByName(FIFO_AUTO_REFRESH.ACTIONS_SHEET);
  if (!sheet) return "";
  const lastRow=sheet.getLastRow();
  if (lastRow<FIFO_AUTO_REFRESH.DATA_FIRST_ROW) return "EMPTY";
  const numRows=lastRow-FIFO_AUTO_REFRESH.DATA_FIRST_ROW+1;
  const numCols=FIFO_AUTO_REFRESH.RELEVANT_LAST_COL-FIFO_AUTO_REFRESH.RELEVANT_FIRST_COL+1;
  const values=sheet.getRange(FIFO_AUTO_REFRESH.DATA_FIRST_ROW,FIFO_AUTO_REFRESH.RELEVANT_FIRST_COL,numRows,numCols).getDisplayValues();
  const payload=JSON.stringify(values);
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,payload,Utilities.Charset.UTF_8);
  return digest.map(byte=>{const value=byte<0?byte+256:byte;return ("0"+value.toString(16)).slice(-2);}).join("");
}

function formatAutoRefreshError_(err) { if (!err) return ""; return err.stack||err.message||String(err); }

/*******************************************************
 * FINAL MENU OVERRIDES (last definition wins in Apps Script)
 *******************************************************/
function createMenu_() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("FIFO PRO")
      .addItem("Build Elite Dashboard","buildEliteDashboard")
      .addItem("שחזר דשבורד יציב","buildStableDashboardRollback")
      .addSeparator()
      .addItem("עדכן הכול (שערים + FIFO + סיכום)","runAll")
      .addItem("עדכן שערי דולר חודשיים","refreshMonthlyFxRates")
      .addItem("עדכן FIFO בלבד","buildFIFO")
      .addItem("עדכן סיכום בלבד","buildStableDashboardRollback")
      .addItem("עדכן מניות מובילות בלבד","buildTopSymbolsWatchlist")
      .addItem("עדכן פוזיציות פתוחות בלבד","buildOpenPositions")
      .addSeparator()
      .addItem("setup (התקנה)","setup")
      .addToUi();
  } catch(err) { Logger.log("FIFO PRO menu: "+formatAutoRefreshError_(err)); }
}

function setup() {
  try {
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    createMenu_();
    ensureSheetExists_(ss,CFG.ACTIONS); ensureSheetExists_(ss,CFG.FIFO); ensureSheetExists_(ss,CFG.SUMMARY);
    ensureSheetExists_(ss,CFG.CHARTS); ensureSheetExists_(ss,CFG.OPEN_POSITIONS); ensureSheetExists_(ss,CFG.TOP_SYMBOLS); ensureSheetExists_(ss,CFG.FX_MONTHLY);
    ensureActionResearchColumns_(); ensureMonthlyFxSheet_(); installAutoRefreshTriggers_();
    if (typeof hideRollbackExtraTabs_==="function") hideRollbackExtraTabs_();
    updateAutoRefreshActionsSignature_();
    SpreadsheetApp.getActive().toast("הטריגרים לרענון אוטומטי הותקנו בהצלחה","FIFO PRO");
  } catch(err) { Logger.log("FIFO PRO setup error: "+formatAutoRefreshError_(err)); throw err; }
}

function runAll() {
  try { runFullFifoRefresh_(); SpreadsheetApp.getActive().toast("הכול עודכן בהצלחה","FIFO PRO"); }
  catch(err) { Logger.log("FIFO PRO runAll error: "+formatAutoRefreshError_(err)); SpreadsheetApp.getActive().toast("לא הצלחתי לעדכן הכול. בדוק Logs.","FIFO PRO"); }
}

function buildEliteDashboard() {
  try { runFullFifoRefresh_(); SpreadsheetApp.getActive().toast("Build Elite Dashboard הושלם","FIFO PRO"); }
  catch(err) { Logger.log("FIFO PRO Build Elite Dashboard error: "+formatAutoRefreshError_(err)); SpreadsheetApp.getActive().toast("לא הצלחתי לבנות את הדשבורד. בדוק Logs.","FIFO PRO"); }
}

function installOnEditTrigger_() { installAutoRefreshTriggers_(); }

// ════════════════════════════════════════════════════════════
// WEB API LAYER — doGet / doPost / Auth / Endpoints
// This section enables the FIFO PRO web app to authenticate
// and fetch data via Google Apps Script deployed as web app.
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════

// ── AUTH BYPASS FLAG ─────────────────────────────────────────────
// Set to true  → all endpoints open, no token required (testing mode)
// Set to false → full session auth enforced (production mode)
var AUTH_DISABLED = true;

const TRADE_HEADERS = [
  'id','symbol','buy_date','sell_date','qty','buy_price','sell_price',
  'cost','gross','tax','net','pct','hold_days','month','notes',
  'entry_reason','exit_reason','respected_stop','followed_plan','lesson','emotion'
];
const POSITION_HEADERS = ['id','symbol','qty','avg_price','target','stop_loss','notes','added_date'];
const WATCHLIST_HEADERS = ['symbol','note','added'];

// ════════════════════════════════════════════════════════════
// ENTRY POINTS
// ════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    const action = e.parameter.action;
    const token  = e.parameter.token || '';

    // Every GET endpoint requires a valid token (skipped when AUTH_DISABLED = true)
    if (!AUTH_DISABLED && !validateToken_(token)) {
      return jsonOut_({ ok: false, error: 'Unauthorized', code: 401 });
    }

    switch (action) {
      case 'getTrades':       return handleGetTrades_();
      case 'getGoal':         return handleGetGoal_();
      case 'getPositions':    return handleGetPositions_();
      case 'getWatchlist':    return handleGetWatchlist_();
      case 'addWatchlist':    return handleAddWatchlist_(e.parameter);
      case 'removeWatchlist': return handleRemoveWatchlist_(e.parameter);
      case 'getPrices':       return handleGetPrices_(e.parameter.symbols);
      case 'getIndicators':   return handleGetIndicators_(e.parameter.symbol);
      case 'getNews':         return handleGetNews_(e.parameter.symbol);
      case 'getOperations':   return handleGetOperations_();
      default:                return jsonOut_({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // ── Auth actions (no token required) ──────────────────
    if (data.action === 'login')             return handleLogin_(data.passwordHash);
    if (data.action === 'logout')            return handleLogout_(data.token || '');
    if (data.action === 'revokeAllSessions') return handleRevokeAllSessions_(data.passwordHash);

    // ── Password change (requires valid token AND current password) ──
    if (data.action === 'changePassword')    return handleChangePassword_(data);

    // ── All other actions require a valid session token (skipped when AUTH_DISABLED = true) ───
    if (!AUTH_DISABLED && !validateToken_(data.token || '')) {
      return jsonOut_({ ok: false, error: 'Unauthorized', code: 401 });
    }

    switch (data.action) {
      case 'add':            return handleAddTrade_(data.trade);
      case 'update':         return handleUpdateTrade_(data.trade);
      case 'delete':         return handleDeleteTrade_(data.id);
      case 'seedAll':        return handleSeedAll_(data.trades);
      case 'setGoal':        return handleSetGoal_(data.goal);
      case 'addPosition':    return handleAddPosition_(data.position);
      case 'updatePosition': return handleUpdatePosition_(data.position);
      case 'deletePosition': return handleDeletePosition_(data.id);
      case 'aiChat':         return handleAiChat_(data);
      default:               return jsonOut_({ ok: false, error: 'Unknown action: ' + data.action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════
// AUTH — SERVER-SIDE SESSION MANAGEMENT
// ════════════════════════════════════════════════════════════
//
// Sessions are stored in Script Properties under the key FIFO_SESSIONS
// as a JSON object: { [token_uuid]: expires_at_ms }
//
// Tokens are random UUIDs (Utilities.getUuid()) — not derived from the
// password, so changing the password or deleting FIFO_SESSIONS immediately
// revokes ALL existing sessions on every device.
//
// ── HOW TO REVOKE ALL SESSIONS (kick everyone out) ──────────
// Option A: In Script Properties, delete the FIFO_SESSIONS property.
// Option B: Call POST { action:'revokeAllSessions', passwordHash:'<hash>' }
//           from the Settings page (requires current password).
// ── HOW TO CHANGE PASSWORD ──────────────────────────────────
// Settings page → Security → Change Password.
// This also clears all existing sessions automatically.
// ════════════════════════════════════════════════════════════

var SESSION_STORE_KEY = 'FIFO_SESSIONS';

/**
 * LOGIN
 * POST { action:'login', passwordHash:'<sha256-hex>' }
 * Client sends SHA-256 of the password (Web Crypto API in browser).
 * Server computes SHA-256 of LOGIN_PASSWORD and compares.
 * On success: generates a random UUID, stores it server-side, returns it.
 */
function handleLogin_(clientHash) {
  const props    = PropertiesService.getScriptProperties();
  const storedPw = props.getProperty('LOGIN_PASSWORD');

  // Auth disabled — no password configured (dev/first-setup mode)
  if (!storedPw) {
    Logger.log('handleLogin_: no LOGIN_PASSWORD set — returning auth-disabled token');
    return jsonOut_({ ok: true, token: 'auth-disabled', authDisabled: true });
  }

  if (!clientHash) {
    return jsonOut_({ ok: false, error: 'סיסמה נדרשת' });
  }

  const serverHash = sha256hex_(storedPw);
  Logger.log('handleLogin_: comparing hashes — match=' + (clientHash === serverHash));

  if (clientHash !== serverHash) {
    Utilities.sleep(800); // slow down brute-force attempts
    return jsonOut_({ ok: false, error: 'סיסמה שגויה' });
  }

  // Generate a random session token and store it server-side
  const token     = Utilities.getUuid();
  const ttlHours  = parseInt(props.getProperty('SESSION_TTL_HOURS') || '720', 10); // default 30 days
  const expiresAt = Date.now() + ttlHours * 3600000;

  try {
    storeSessions_(upsertSession_(loadSessions_(), token, expiresAt));
    Logger.log('handleLogin_: session stored OK, token=' + token.slice(0, 8) + '...');
  } catch(e) {
    Logger.log('handleLogin_: storeSessions_ failed: ' + e.message + ' — forcing clean session store');
    // storeSessions_ failed (corrupt/oversized FIFO_SESSIONS). Force-clear and save only this token.
    try {
      const fresh = {};
      fresh[token] = expiresAt;
      props.setProperty(SESSION_STORE_KEY, JSON.stringify(fresh));
      Logger.log('handleLogin_: emergency session store succeeded');
    } catch(e2) {
      Logger.log('handleLogin_: emergency session store also failed: ' + e2.message);
      return jsonOut_({ ok: false, error: 'שגיאת אחסון session — נסה שוב' });
    }
  }

  return jsonOut_({ ok: true, token: token, expiresAt: expiresAt });
}

/**
 * LOGOUT (this device)
 * POST { action:'logout', token:'<uuid>' }
 * Removes only this token from the server-side session store.
 * Frontend also clears localStorage regardless of server response.
 */
function handleLogout_(token) {
  if (token && token !== 'auth-disabled') {
    const sessions = loadSessions_();
    delete sessions[token];
    storeSessions_(sessions);
  }
  return jsonOut_({ ok: true });
}

/**
 * REVOKE ALL SESSIONS (all devices)
 * POST { action:'revokeAllSessions', passwordHash:'<sha256-hex>' }
 * Requires the current password — protects against an attacker calling this.
 * Clears FIFO_SESSIONS entirely, logging out every device immediately.
 */
function handleRevokeAllSessions_(clientHash) {
  const props    = PropertiesService.getScriptProperties();
  const storedPw = props.getProperty('LOGIN_PASSWORD');
  if (!storedPw) return jsonOut_({ ok: false, error: 'AUTH לא מוגדר' });
  if (sha256hex_(storedPw) !== (clientHash || '')) {
    return jsonOut_({ ok: false, error: 'סיסמה שגויה' });
  }
  props.deleteProperty(SESSION_STORE_KEY);
  return jsonOut_({ ok: true });
}

/**
 * CHANGE PASSWORD
 * POST { action:'changePassword', token, currentHash, newHash }
 * Requires both a valid session token AND the current password.
 * After success: clears ALL sessions (all devices must re-login) and
 * saves new password as __hash__:<hex> so future logins compare hashes.
 */
function handleChangePassword_(data) {
  const props    = PropertiesService.getScriptProperties();
  const storedPw = props.getProperty('LOGIN_PASSWORD');
  if (!storedPw) return jsonOut_({ ok: false, error: 'LOGIN_PASSWORD לא מוגדר' });

  if (!validateToken_(data.token || '')) {
    return jsonOut_({ ok: false, error: 'Session פג תוקף — התחבר מחדש' });
  }
  if (sha256hex_(storedPw) !== (data.currentHash || '')) {
    return jsonOut_({ ok: false, error: 'הסיסמה הנוכחית שגויה' });
  }
  if (!data.newHash || data.newHash.length !== 64) {
    return jsonOut_({ ok: false, error: 'סיסמה חדשה לא תקינה' });
  }

  // Store the new password as a hash (client only sent hash, not plaintext)
  props.setProperty('LOGIN_PASSWORD', '__hash__:' + data.newHash);

  // Clear ALL existing sessions — every device must re-login
  props.deleteProperty(SESSION_STORE_KEY);

  // Issue a fresh token for this device
  const ttlHours  = parseInt(props.getProperty('SESSION_TTL_HOURS') || '720', 10);
  const newToken  = Utilities.getUuid();
  const expiresAt = Date.now() + ttlHours * 3600000;
  storeSessions_(upsertSession_({}, newToken, expiresAt));

  return jsonOut_({ ok: true, token: newToken });
}

/**
 * TOKEN VALIDATION
 * Returns true if the token exists in FIFO_SESSIONS and has not expired.
 * If LOGIN_PASSWORD is not set: all requests are accepted (dev mode).
 * Side-effect: lazily removes expired sessions on every validation call.
 */
function validateToken_(token) {
  const props    = PropertiesService.getScriptProperties();
  const storedPw = props.getProperty('LOGIN_PASSWORD');

  // Auth disabled — no password configured
  if (!storedPw) return true;

  // Special no-auth token (issued when password was unset at login time).
  // Accepted even after a password is set so existing sessions stay valid.
  if (token === 'auth-disabled') return true;

  if (!token) { Logger.log('validateToken_: empty token'); return false; }

  const now      = Date.now();
  const sessions = loadSessions_();
  const count    = Object.keys(sessions).length;

  if (!sessions[token]) {
    Logger.log('validateToken_: token not found in FIFO_SESSIONS (total sessions: ' + count + ')');
    return false;
  }
  if (sessions[token] <= now) {
    Logger.log('validateToken_: token expired');
    return false;
  }

  // Lazy-clean expired sessions (avoids the property growing unbounded)
  let dirty = false;
  Object.keys(sessions).forEach(t => {
    if (sessions[t] < now) { delete sessions[t]; dirty = true; }
  });
  try { if (dirty) storeSessions_(sessions); } catch(e) { /* non-fatal */ }

  return true;
}

// ── Session store helpers ─────────────────────────────────

function loadSessions_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(SESSION_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function storeSessions_(sessions) {
  const props = PropertiesService.getScriptProperties();
  try {
    props.setProperty(SESSION_STORE_KEY, JSON.stringify(sessions));
  } catch (e) {
    // Property too large (>9KB) — drop the oldest half and retry.
    // Use reduce instead of Object.fromEntries for GAS V8/Rhino compatibility.
    const now    = Date.now();
    const sorted = Object.entries(sessions).sort(function(a, b) { return a[1] - b[1]; });
    // Keep only the newest half (drop expired first, then oldest)
    const keep   = sorted.filter(function(x) { return x[1] > now; });
    const half   = keep.length > 0 ? keep.slice(Math.ceil(keep.length / 2)) : sorted.slice(Math.ceil(sorted.length / 2));
    const trimmed = half.reduce(function(acc, pair) { acc[pair[0]] = pair[1]; return acc; }, {});
    try {
      props.setProperty(SESSION_STORE_KEY, JSON.stringify(trimmed));
    } catch(e2) {
      Logger.log('storeSessions_: trim also failed — giving up: ' + e2.message);
      throw e2; // let handleLogin_ do emergency save
    }
  }
}

function upsertSession_(sessions, token, expiresAt) {
  sessions[token] = expiresAt;
  return sessions;
}

// ── Auth diagnostics (run testAuth_ directly in the Apps Script editor) ──────
/**
 * Run this function from the Apps Script editor (▶ Run → testAuth_) to diagnose
 * login issues. Check the Execution Log (View → Logs) for results.
 * It does NOT modify any data.
 */
function testAuth_() {
  const props    = PropertiesService.getScriptProperties();
  const storedPw = props.getProperty('LOGIN_PASSWORD');
  const sessions = loadSessions_();
  const sessionCount = Object.keys(sessions).length;
  const now = Date.now();
  const activeSessions = Object.keys(sessions).filter(function(t) { return sessions[t] > now; }).length;

  Logger.log('=== FIFO PRO Auth Diagnostics ===');
  Logger.log('LOGIN_PASSWORD set: ' + !!storedPw);
  if (storedPw) {
    Logger.log('LOGIN_PASSWORD starts with __hash__: ' + storedPw.startsWith('__hash__:'));
    Logger.log('LOGIN_PASSWORD length: ' + storedPw.length);
    // Print the server-side hash so you can compare with what the browser sends
    Logger.log('Server hash (sha256hex_ of storedPw): ' + sha256hex_(storedPw));
  }
  Logger.log('FIFO_SESSIONS total: ' + sessionCount + ', active (not expired): ' + activeSessions);

  const rawFinnhubKey = props.getProperty('FINNHUB_API_KEY');
  const finnhubKey    = rawFinnhubKey ? rawFinnhubKey.trim() : '';
  Logger.log('FINNHUB_API_KEY set: ' + !!rawFinnhubKey);
  if (rawFinnhubKey) {
    Logger.log('FINNHUB_API_KEY length: ' + rawFinnhubKey.length + ' (trimmed: ' + finnhubKey.length + ')');
    Logger.log('FINNHUB_API_KEY has leading/trailing whitespace: ' + (rawFinnhubKey !== finnhubKey));
    Logger.log('FINNHUB_API_KEY first 4 chars: ' + finnhubKey.slice(0, 4));
  }

  Logger.log('=== End Diagnostics ===');
}

/**
 * Run this from the Apps Script editor (▶ Run → testFinnhub_) to call Finnhub
 * directly and see the exact response, without going through doGet/doPost.
 * Check View → Logs for the full result.
 */
function testFinnhub_() {
  Logger.log('=== Finnhub Direct Test ===');
  const result = fetchFinnhubPrices_(['ONDL', 'QBTX']);
  Logger.log(JSON.stringify(result));
  Logger.log('=== End Finnhub Test ===');
}

// ── Password helpers ──────────────────────────────────────

/** SHA-256 of text → lowercase hex. Handles __hash__: prefix from changePassword. */
function sha256hex_(text) {
  if (text && text.startsWith('__hash__:')) return text.slice(9);
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// ════════════════════════════════════════════════════════════
// SHEET HELPERS (generic, header-name based — robust to column order)
// ════════════════════════════════════════════════════════════

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
}

function readRows_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { headers: data[0] || [], rows: [] };
  const headers = data[0];
  const rows = data.slice(1)
    .filter(r => r.some(c => c !== '' && c !== null))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
  return { headers, rows };
}

function appendRow_(sheet, headers, obj) {
  sheet.appendRow(headers.map(h => (obj[h] !== undefined && obj[h] !== null) ? obj[h] : ''));
}

function findRowById_(sheet, id) {
  const data    = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idCol   = headers.indexOf('id');
  if (idCol === -1) return null;
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][idCol]) === Number(id)) {
      return { rowIndex: i + 1, headers, row: data[i] };
    }
  }
  return null;
}

function nextId_(rows) {
  let max = 0;
  rows.forEach(r => { const n = Number(r.id) || 0; if (n > max) max = n; });
  return max + 1;
}

// ════════════════════════════════════════════════════════════
// TRADES
// ════════════════════════════════════════════════════════════

function handleGetTrades_() {
  const sh = getSheet_('Trades');
  ensureHeaders_(sh, TRADE_HEADERS);
  const { rows } = readRows_(sh);
  return jsonOut_({ ok: true, trades: rows });
}

function handleAddTrade_(trade) {
  if (!trade) return jsonOut_({ ok: false, error: 'No trade supplied' });
  const sh = getSheet_('Trades');
  ensureHeaders_(sh, TRADE_HEADERS);
  const { rows } = readRows_(sh);
  trade.id = nextId_(rows);
  appendRow_(sh, TRADE_HEADERS, trade);
  return jsonOut_({ ok: true, trade: trade });
}

function handleUpdateTrade_(trade) {
  if (!trade || trade.id === undefined) return jsonOut_({ ok: false, error: 'Trade id required' });
  const sh    = getSheet_('Trades');
  const found = findRowById_(sh, trade.id);
  if (!found) return jsonOut_({ ok: false, error: 'Trade not found: ' + trade.id });
  const rowArr = found.headers.map((h, i) => (trade[h] !== undefined ? trade[h] : found.row[i]));
  sh.getRange(found.rowIndex, 1, 1, found.headers.length).setValues([rowArr]);
  return jsonOut_({ ok: true });
}

function handleDeleteTrade_(id) {
  if (id === undefined) return jsonOut_({ ok: false, error: 'id required' });
  const sh    = getSheet_('Trades');
  const found = findRowById_(sh, id);
  if (!found) return jsonOut_({ ok: false, error: 'Trade not found: ' + id });
  sh.deleteRow(found.rowIndex);
  return jsonOut_({ ok: true });
}

function handleSeedAll_(trades) {
  const sh = getSheet_('Trades');
  ensureHeaders_(sh, TRADE_HEADERS);
  (trades || []).forEach(t => appendRow_(sh, TRADE_HEADERS, t));
  return jsonOut_({ ok: true, count: (trades || []).length });
}

// ════════════════════════════════════════════════════════════
// POSITIONS
// ════════════════════════════════════════════════════════════

function handleGetPositions_() {
  const sh = getSheet_('Positions');
  ensureHeaders_(sh, POSITION_HEADERS);
  const { rows } = readRows_(sh);
  return jsonOut_({ ok: true, positions: rows });
}

function handleAddPosition_(pos) {
  if (!pos) return jsonOut_({ ok: false, error: 'No position supplied' });
  const sh = getSheet_('Positions');
  ensureHeaders_(sh, POSITION_HEADERS);
  const { rows } = readRows_(sh);
  pos.id = nextId_(rows);
  appendRow_(sh, POSITION_HEADERS, pos);
  return jsonOut_({ ok: true, position: pos });
}

function handleUpdatePosition_(pos) {
  if (!pos || pos.id === undefined) return jsonOut_({ ok: false, error: 'Position id required' });
  const sh    = getSheet_('Positions');
  const found = findRowById_(sh, pos.id);
  if (!found) return jsonOut_({ ok: false, error: 'Position not found: ' + pos.id });
  const rowArr = found.headers.map((h, i) => (pos[h] !== undefined ? pos[h] : found.row[i]));
  sh.getRange(found.rowIndex, 1, 1, found.headers.length).setValues([rowArr]);
  return jsonOut_({ ok: true });
}

function handleDeletePosition_(id) {
  if (id === undefined) return jsonOut_({ ok: false, error: 'id required' });
  const sh    = getSheet_('Positions');
  const found = findRowById_(sh, id);
  if (!found) return jsonOut_({ ok: false, error: 'Position not found: ' + id });
  sh.deleteRow(found.rowIndex);
  return jsonOut_({ ok: true });
}

// ════════════════════════════════════════════════════════════
// WATCHLIST
// (addWatchlist / removeWatchlist sent as GET by the frontend — preserved)
// ════════════════════════════════════════════════════════════

function handleGetWatchlist_() {
  const sh = getSheet_('Watchlist');
  ensureHeaders_(sh, WATCHLIST_HEADERS);
  const { rows } = readRows_(sh);
  return jsonOut_({ ok: true, watchlist: rows });
}

function handleAddWatchlist_(params) {
  const symbol = String(params.symbol || '').trim().toUpperCase();
  if (!symbol) return jsonOut_({ ok: false, error: 'symbol required' });
  const sh = getSheet_('Watchlist');
  ensureHeaders_(sh, WATCHLIST_HEADERS);
  const { rows } = readRows_(sh);
  if (rows.some(r => String(r.symbol).toUpperCase() === symbol)) {
    return jsonOut_({ ok: false, error: symbol + ' כבר נמצא ב-Watchlist' });
  }
  appendRow_(sh, WATCHLIST_HEADERS, { symbol, note: params.note || '', added: params.added || '' });
  return jsonOut_({ ok: true });
}

function handleRemoveWatchlist_(params) {
  const symbol = String(params.symbol || '').trim().toUpperCase();
  const sh     = getSheet_('Watchlist');
  const data   = sh.getDataRange().getValues();
  const headers = data[0] || [];
  const symCol  = headers.indexOf('symbol');
  if (symCol === -1) return jsonOut_({ ok: false, error: 'Watchlist sheet has no symbol column' });
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][symCol]).toUpperCase() === symbol) {
      sh.deleteRow(i + 1);
      return jsonOut_({ ok: true });
    }
  }
  return jsonOut_({ ok: false, error: 'Symbol not found: ' + symbol });
}

// ════════════════════════════════════════════════════════════
// GOAL / SETTINGS
// ════════════════════════════════════════════════════════════

function handleGetGoal_() {
  const sh = getSheet_('Settings');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['key', 'value']);
    sh.appendRow(['goal', 5000]);
  }
  const data = sh.getDataRange().getValues();
  let goal   = 5000;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'goal') goal = Number(data[i][1]) || 5000;
  }
  return jsonOut_({ ok: true, goal: goal });
}

function handleSetGoal_(goal) {
  const sh = getSheet_('Settings');
  if (sh.getLastRow() === 0) sh.appendRow(['key', 'value']);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'goal') {
      sh.getRange(i + 1, 2).setValue(goal);
      return jsonOut_({ ok: true });
    }
  }
  sh.appendRow(['goal', goal]);
  return jsonOut_({ ok: true });
}

// ════════════════════════════════════════════════════════════
// LIVE PRICES (Finnhub primary — Polygon/Yahoo disabled)
// ════════════════════════════════════════════════════════════
// Script Properties required:
//   FINNHUB_API_KEY — Finnhub.io API key (primary and only provider)
//
// Polygon (fetchPolygonPrices_) and Yahoo (fetchYahooBatch_) remain in this
// file but are NOT called from handleGetPrices_ — disabled, not deleted, so
// either can be re-enabled later without rewriting the logic.

const SUSPICIOUS_DAY_CHANGE_RATIO = 0.35;

// ── Main price handler: Finnhub only ──────────────────────────────
function handleGetPrices_(symbolsCsv) {
  const symbols = String(symbolsCsv || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) return jsonOut_({ ok: true, prices: {}, _debug: 'no symbols' });

  const prices = fetchFinnhubPrices_(symbols);
  symbols.forEach(sym => {
    if (!prices[sym]) prices[sym] = { ok: false, error: prices._error || 'Finnhub: no data for ' + sym, source: 'Finnhub' };
  });
  delete prices._error;

  const okCount = symbols.filter(s => prices[s] && prices[s].ok).length;
  const _debug = {
    requested: symbols.length,
    ok:        okCount,
    failed:    symbols.length - okCount,
    sources:   symbols.reduce((acc, s) => { acc[s] = (prices[s] && prices[s].source) || 'none'; return acc; }, {})
  };
  Logger.log('getPrices: ' + JSON.stringify(_debug));

  return jsonOut_({ ok: true, prices, _debug });
}

// ── Polygon.io snapshot (primary price provider) ─────────────────
// Uses the v2 snapshot endpoint: returns current price, prev close, daily change %.
// Batch up to ~50 symbols per call — no separate per-symbol requests needed.
function fetchPolygonPrices_(symbols) {
  const rawKey = PropertiesService.getScriptProperties().getProperty('POLYGON_API_KEY');
  // Trim — a trailing space/newline from copy-paste into Script Properties
  // produces a key that LOOKS right but Polygon rejects with 401.
  const apiKey = rawKey ? rawKey.trim() : '';
  if (!apiKey) {
    Logger.log('POLYGON_API_KEY not set — Polygon unavailable');
    return { _error: 'POLYGON_API_KEY חסר ב-Script Properties' };
  }

  const url = 'https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers' +
              '?tickers=' + symbols.join(',') +
              '&apiKey=' + apiKey;

  let res;
  try {
    res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch(e) {
    Logger.log('Polygon network error: ' + e.message);
    return { _error: 'Polygon network error: ' + e.message };
  }

  const code = res.getResponseCode();
  Logger.log('Polygon snapshot HTTP ' + code + ' for ' + symbols.join(','));

  if (code === 401 || code === 403) {
    // Log the full response body — Polygon's error JSON usually says exactly
    // what's wrong (invalid key, key not activated, wrong plan, etc.)
    const body = res.getContentText();
    Logger.log('Polygon ' + code + ' full response body: ' + body);
    Logger.log('Polygon key length used: ' + apiKey.length + ', first 4 chars: ' + apiKey.slice(0, 4));
    let bodyMsg = body;
    try { const j = JSON.parse(body); bodyMsg = j.error || j.message || body; } catch(e) {}
    return { _error: 'Polygon ' + code + ' Unauthorized — ' + bodyMsg };
  }
  if (code === 429) {
    Logger.log('Polygon 429 full response body: ' + res.getContentText());
    return { _error: 'Polygon 429 Rate Limit — חרגת ממכסת הקריאות' };
  }
  if (code !== 200) {
    Logger.log('Polygon ' + code + ' full response body: ' + res.getContentText());
    return { _error: 'Polygon HTTP ' + code };
  }

  let json;
  try { json = JSON.parse(res.getContentText()); }
  catch(e) { return { _error: 'Polygon: failed to parse response — ' + e.message }; }

  if (json.status !== 'OK' || !Array.isArray(json.tickers)) {
    return { _error: 'Polygon error: ' + (json.error || json.status || 'unknown response') };
  }

  const results = {};
  json.tickers.forEach(t => {
    const sym = t.ticker;

    // lastTrade.p = most recent trade price (real-time); day.c = day close (delayed)
    const price = (t.lastTrade && t.lastTrade.p > 0) ? t.lastTrade.p
                : (t.day && t.day.c > 0)             ? t.day.c
                : null;

    if (!price) {
      results[sym] = { ok: false, error: 'Polygon: no price data for ' + sym, source: 'polygon' };
      return;
    }

    const prevClose    = (t.prevDay && t.prevDay.c > 0) ? t.prevDay.c : null;
    const changePct    = typeof t.todaysChangePerc === 'number' ? t.todaysChangePerc : null;
    const changePctValid = changePct !== null && prevClose !== null && Math.abs(changePct) < (SUSPICIOUS_DAY_CHANGE_RATIO * 100);

    results[sym] = {
      ok:             true,
      price,
      prevClose,
      change:         typeof t.todaysChange === 'number' ? t.todaysChange : null,
      changePct,
      changePctValid,
      dayChangeStatus: changePctValid ? 'ok' : (prevClose === null ? 'missing_prevclose' : 'suspicious_prevclose'),
      preMarket:      null,
      postMarket:     null,
      volume:         (t.day && t.day.v) ? t.day.v : 0,
      updated:        new Date().toLocaleTimeString('he-IL'),
      source:         'polygon',
    };
  });

  // Symbols missing from Polygon response (delisted / unsupported)
  symbols.forEach(sym => {
    if (!results[sym]) {
      results[sym] = { ok: false, error: 'Polygon: ' + sym + ' not found in snapshot', source: 'polygon' };
    }
  });

  return results;
}

// ── Parse a Yahoo chart result into the standard price object ───
function parseYahooResult_(data) {
  if (!data) return null;
  const meta  = data.meta || {};
  const price = meta.regularMarketPrice != null
    ? meta.regularMarketPrice
    : (data.closes && data.closes.length ? data.closes[data.closes.length - 1] : null);
  if (price == null) return null;

  const rawPrevClose = meta.regularMarketPreviousClose != null ? meta.regularMarketPreviousClose
    : meta.chartPreviousClose != null ? meta.chartPreviousClose
    : (data.closes && data.closes.length >= 2 ? data.closes[data.closes.length - 2] : null);

  let prevClose = null, change = null, changePct = null, changePctValid = false;
  let dayChangeStatus = rawPrevClose == null ? 'missing_prevclose' : 'ok';

  if (rawPrevClose != null && rawPrevClose > 0) {
    const ratio = Math.abs(price - rawPrevClose) / rawPrevClose;
    if (ratio > SUSPICIOUS_DAY_CHANGE_RATIO) {
      dayChangeStatus = 'suspicious_prevclose';
      prevClose = rawPrevClose;
    } else {
      prevClose = rawPrevClose;
      change    = price - prevClose;
      changePct = change / prevClose * 100;
      changePctValid = true;
    }
  }

  return {
    ok: true, price, prevClose, change, changePct, changePctValid, dayChangeStatus,
    preMarket:  meta.preMarketPrice  || null,
    postMarket: meta.postMarketPrice || null,
    volume: meta.regularMarketVolume || (data.volumes && data.volumes.length ? data.volumes[data.volumes.length - 1] : 0),
    updated: new Date().toLocaleTimeString('he-IL'),
    source: 'yahoo',
  };
}

// ── Finnhub quote (primary price provider) ─────────────────────────
// https://finnhub.io/api/v1/quote?symbol=SYMBOL&token=KEY
// Response: { c:current, d:change, dp:changePct%, h, l, o, pc:prevClose, t:timestamp }
// Free tier: 60 req/min — sufficient for price polling.
function fetchFinnhubPrices_(symbols) {
  const rawKey = PropertiesService.getScriptProperties().getProperty('FINNHUB_API_KEY');
  const apiKey = rawKey ? rawKey.trim() : '';
  if (!apiKey) {
    Logger.log('FINNHUB_API_KEY not set — Finnhub unavailable');
    return { _error: 'FINNHUB_API_KEY חסר ב-Script Properties' };
  }

  const results  = {};
  const requests = symbols.map(sym => ({
    url: 'https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(sym) + '&token=' + apiKey,
    muteHttpExceptions: true
  }));

  let responses;
  try { responses = UrlFetchApp.fetchAll(requests); }
  catch(e) {
    Logger.log('Finnhub fetchAll error: ' + e.message);
    return { _error: 'Finnhub network error: ' + e.message };
  }

  responses.forEach((res, i) => {
    const sym  = symbols[i];
    const code = res.getResponseCode();
    Logger.log('Finnhub ' + sym + ' HTTP ' + code);

    if (code === 401 || code === 403) {
      Logger.log('Finnhub ' + code + ' full response body: ' + res.getContentText());
      results[sym] = { ok: false, error: 'Finnhub ' + code + ' Unauthorized — בדוק FINNHUB_API_KEY', source: 'Finnhub' };
      return;
    }
    if (code !== 200) {
      Logger.log('Finnhub ' + sym + ' non-200 body: ' + res.getContentText());
      results[sym] = { ok: false, error: 'Finnhub HTTP ' + code, source: 'Finnhub' };
      return;
    }

    try {
      const q = JSON.parse(res.getContentText());
      // Finnhub returns c:0 for unknown/delisted symbols — not an HTTP error.
      if (!q || !q.c || q.c === 0) {
        Logger.log('Finnhub empty quote for ' + sym + ': ' + res.getContentText());
        results[sym] = { ok: false, error: 'Finnhub: no data for ' + sym, source: 'Finnhub' };
        return;
      }
      const changePctValid = q.pc > 0 && Math.abs((q.c - q.pc) / q.pc) <= SUSPICIOUS_DAY_CHANGE_RATIO;
      results[sym] = {
        ok: true,
        price:         q.c,
        prevClose:     q.pc != null ? q.pc : null,
        change:        q.d  != null ? q.d  : null,
        changePct:     q.dp != null ? q.dp : null,
        changePctValid,
        dayChangeStatus: changePctValid ? 'ok' : 'invalid_prevclose',
        preMarket: null, postMarket: null, volume: 0,
        updated: new Date().toLocaleTimeString('he-IL'),
        source: 'Finnhub',
      };
    } catch(e) {
      Logger.log('Finnhub parse error ' + sym + ': ' + e.message);
      results[sym] = { ok: false, error: 'Finnhub parse error: ' + e.message, source: 'Finnhub' };
    }
  });
  return results;
}

// ── Fetch a single Yahoo chart ────────────────────────────────────
function fetchYahooChart_(symbol, range, interval) {
  range    = range    || '1d';
  interval = interval || '5m';
  return fetchYahooChartWithSession_(symbol, range, interval, false);
}

function fetchYahooChartWithSession_(symbol, range, interval, sessionRefreshed) {
  const UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  // query2 first — tends to be more lenient from server IPs
  // NOTE: no Referer header — Yahoo rate-limits requests with Referer from known server IPs
  const hosts = ['https://query2.finance.yahoo.com', 'https://query1.finance.yahoo.com'];

  for (const host of hosts) {
    try {
      const url = host + '/v8/finance/chart/' + encodeURIComponent(symbol) +
                  '?range=' + range + '&interval=' + interval + '&includePrePost=true';
      const res = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': UA, 'Accept': 'application/json, */*', 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const code = res.getResponseCode();
      Logger.log('Yahoo ' + symbol + ' HTTP ' + code + ' from ' + host);
      if (code === 429) { Utilities.sleep(500); continue; }
      if (code !== 200) continue;

      const json   = JSON.parse(res.getContentText());
      const result = json.chart && json.chart.result && json.chart.result[0];
      if (!result) continue;

      const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
      return {
        meta:    result.meta || {},
        closes:  (q.close  || []).filter(v => v != null),
        volumes: (q.volume || []).filter(v => v != null),
        highs:   (q.high   || []).filter(v => v != null),
        lows:    (q.low    || []).filter(v => v != null),
        opens:   (q.open   || []).filter(v => v != null),
      };
    } catch(e) {
      Logger.log('fetchYahooChart_ ' + symbol + ' error: ' + e.message);
    }
  }
  return null;
}

// ── Batch fetch: parallel fetchAll, no session/crumb needed ─────
function fetchYahooBatch_(symbols) {
  const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  const host = 'https://query2.finance.yahoo.com';
  const hdrs = { 'User-Agent': UA, 'Accept': 'application/json, */*', 'Accept-Language': 'en-US,en;q=0.9' };

  const requests = symbols.map(sym => ({
    url: host + '/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=5m&includePrePost=true',
    muteHttpExceptions: true,
    headers: hdrs
  }));

  let responses;
  try {
    responses = UrlFetchApp.fetchAll(requests);
  } catch(e) {
    Logger.log('fetchYahooBatch_ fetchAll error: ' + e.message);
    return symbols.map(sym => fetchYahooChart_(sym, '1d', '5m'));
  }

  // If ALL got 429, wait and retry once with query1
  const all429 = responses.every(r => r.getResponseCode() === 429);
  if (all429) {
    Logger.log('Yahoo 429 on all — retrying with query1 after delay');
    Utilities.sleep(1000);
    const retry = symbols.map(sym => ({
      url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=5m&includePrePost=true',
      muteHttpExceptions: true, headers: hdrs
    }));
    try { responses = UrlFetchApp.fetchAll(retry); } catch(e) {}
  }

  return responses.map((res, i) => {
    const code = res.getResponseCode();
    Logger.log('Yahoo batch ' + symbols[i] + ' HTTP ' + code);
    if (code !== 200) return null;
    try {
      const json   = JSON.parse(res.getContentText());
      const result = json.chart && json.chart.result && json.chart.result[0];
      if (!result) return null;
      const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
      return {
        meta:    result.meta || {},
        closes:  (q.close  || []).filter(v => v != null),
        volumes: (q.volume || []).filter(v => v != null),
        highs:   (q.high   || []).filter(v => v != null),
        lows:    (q.low    || []).filter(v => v != null),
        opens:   (q.open   || []).filter(v => v != null),
      };
    } catch(e) {
      Logger.log('fetchYahooBatch_ parse error ' + symbols[i] + ': ' + e.message);
      return null;
    }
  });
}

function fetchYahooIntraday_(symbol) {
  return fetchYahooChart_(symbol, '1d', '5m');
}

function fetchYahooDailyShort_(symbol) {
  const data = fetchYahooChart_(symbol, '5d', '1d');
  if (!data) return null;
  return { closes: data.closes };
}

// ════════════════════════════════════════════════════════════
// TECHNICAL INDICATORS
// ════════════════════════════════════════════════════════════

function handleGetIndicators_(symbol) {
  if (!symbol) return jsonOut_({ ok: false, error: 'symbol required' });
  try {
    const data = fetchYahooChart_(symbol, '1y', '1d');
    if (!data || data.closes.length < 20) {
      return jsonOut_({ ok: false, error: 'Not enough historical data for ' + symbol });
    }
    const { closes, highs, lows, volumes, opens } = data;
    const price     = (data.meta && data.meta.regularMarketPrice) || closes[closes.length - 1];
    const prevClose = closes[closes.length - 2] || price;

    const ema9   = lastEma_(closes, 9);
    const ema20  = lastEma_(closes, 20);
    const ema21  = lastEma_(closes, 21);
    const ema50  = lastEma_(closes, 50);
    const ema200 = lastEma_(closes, 200);
    const rsi    = rsi_(closes, 14);
    const macdRes = macd_(closes);
    const atr    = atr_(highs, lows, closes, 14);

    const last20Vol  = volumes.slice(-20);
    const avgVolume  = last20Vol.length ? last20Vol.reduce((a,b) => a+b, 0) / last20Vol.length : null;
    const volume     = volumes[volumes.length - 1];

    const last20Highs = highs.slice(-20), last20Lows = lows.slice(-20);
    const resistance  = last20Highs.length ? Math.max.apply(null, last20Highs) : null;
    const support     = last20Lows.length  ? Math.min.apply(null, last20Lows)  : null;

    const last252Highs = highs.slice(-252), last252Lows = lows.slice(-252);
    const week52High   = last252Highs.length ? Math.max.apply(null, last252Highs) : null;
    const week52Low    = last252Lows.length  ? Math.min.apply(null, last252Lows)  : null;

    const changePct = prevClose ? (price - prevClose) / prevClose * 100 : null;
    const gapPct    = (opens && opens.length && closes.length >= 2)
      ? (opens[opens.length-1] - closes[closes.length-2]) / closes[closes.length-2] * 100
      : null;

    let benchmarkChangePct = null;
    try {
      const spy = fetchYahooChart_('SPY', '1y', '1d');
      if (spy && spy.closes.length >= 2) {
        const spyPrice = (spy.meta && spy.meta.regularMarketPrice) || spy.closes[spy.closes.length - 1];
        const spyPrev  = spy.closes[spy.closes.length - 2];
        benchmarkChangePct = spyPrev ? (spyPrice - spyPrev) / spyPrev * 100 : null;
      }
    } catch (e) { /* leave null */ }

    return jsonOut_({ ok: true, indicators: {
      price, ema9, ema20, ema21, ema50, ema200, rsi,
      macd: macdRes.macd, macdSignal: macdRes.signal,
      atr, volume, avgVolume, support, resistance,
      week52High, week52Low, changePct, gapPct,
      preMarket:  (data.meta && data.meta.preMarketPrice)  || null,
      afterHours: (data.meta && data.meta.postMarketPrice) || null,
      benchmarkChangePct,
    }});
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

// fetchYahooChart_ with a single argument is used by handleGetIndicators_ (1-year daily)
// It delegates to the crumb-aware multi-host version defined above.
// The body filters null values and builds ordered arrays — kept for compatibility.
function fetchYahooChart_Historical_(symbol) {
  const data = fetchYahooChart_(symbol, '1y', '1d');
  if (!data) return null;
  // fetchYahooChart_ already filters nulls for closes/highs/etc but the
  // indicators path expects parallel arrays indexed by timestamp — rebuild carefully.
  return data; // already compatible: { closes, highs, lows, opens, volumes, meta }
}

// ── Indicator math ──────────────────────────────────────────

function emaFull_(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k    = 2 / (period + 1);
  let prev   = values.slice(0, period).reduce((a,b) => a+b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev   = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function lastEma_(values, period) {
  const series = emaFull_(values, period);
  const last   = series[series.length - 1];
  return last == null ? null : last;
}

function rsi_(closes, period) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    const gain = diff > 0 ? diff : 0, loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function macd_(closes) {
  if (closes.length < 35) return { macd: null, signal: null };
  const ema12    = emaFull_(closes, 12), ema26 = emaFull_(closes, 26);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] != null && ema26[i] != null) macdLine.push(ema12[i] - ema26[i]);
  }
  if (macdLine.length < 9) return { macd: macdLine[macdLine.length - 1] || null, signal: null };
  const signalSeries = emaFull_(macdLine, 9);
  return { macd: macdLine[macdLine.length - 1], signal: signalSeries[signalSeries.length - 1] };
}

function atr_(highs, lows, closes, period) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i-1]),
      Math.abs(lows[i]  - closes[i-1])
    ));
  }
  const last = trs.slice(-period);
  return last.reduce((a,b) => a+b, 0) / last.length;
}

// ════════════════════════════════════════════════════════════
// NEWS (Finnhub free tier)
// ════════════════════════════════════════════════════════════

function handleGetNews_(symbol) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('FINNHUB_API_KEY');
  if (!apiKey) return jsonOut_({ ok: false, error: 'FINNHUB_API_KEY not configured in Script Properties' });
  if (!symbol) return jsonOut_({ ok: false, error: 'symbol required' });

  try {
    const today = new Date();
    const from  = new Date(today.getTime() - 14 * 86400000);
    const fmt   = d => d.toISOString().split('T')[0];

    const newsUrl = 'https://finnhub.io/api/v1/company-news?symbol=' + encodeURIComponent(symbol) +
                    '&from=' + fmt(from) + '&to=' + fmt(today) + '&token=' + apiKey;
    const rawNews = JSON.parse(UrlFetchApp.fetch(newsUrl, { muteHttpExceptions: true }).getContentText() || '[]');

    const headlines = (Array.isArray(rawNews) ? rawNews : []).slice(0, 10).map(n => ({
      title: n.headline, url: n.url, datetime: n.datetime,
      sentiment: classifySentiment_(n.headline + ' ' + (n.summary || '')),
    }));

    let insiderTx = [];
    try {
      const insiderData = JSON.parse(UrlFetchApp.fetch(
        'https://finnhub.io/api/v1/stock/insider-transactions?symbol=' + encodeURIComponent(symbol) + '&token=' + apiKey,
        { muteHttpExceptions: true }
      ).getContentText() || '{}');
      insiderTx = (insiderData.data || []).slice(0, 20).map(tx => ({
        type: tx.change > 0 ? 'buy' : 'sell',
        shares: Math.abs(tx.change || 0),
        date: tx.transactionDate, name: tx.name,
      }));
    } catch (e) {}

    let earnings = null;
    try {
      const earnTo  = fmt(new Date(today.getTime() + 60 * 86400000));
      const earnData = JSON.parse(UrlFetchApp.fetch(
        'https://finnhub.io/api/v1/calendar/earnings?from=' + fmt(today) + '&to=' + earnTo +
        '&symbol=' + encodeURIComponent(symbol) + '&token=' + apiKey,
        { muteHttpExceptions: true }
      ).getContentText() || '{}');
      if (earnData.earningsCalendar && earnData.earningsCalendar.length) {
        earnings = { date: earnData.earningsCalendar[0].date };
      }
    } catch (e) {}

    return jsonOut_({ ok: true, news: { headlines, insiderTx, earnings } });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function classifySentiment_(text) {
  const t        = (text || '').toLowerCase();
  const bullWords = ['beats','surge','soars','upgrade','record','growth','raises guidance','buyback','approval','partnership','outperform'];
  const bearWords = ['misses','plunge','downgrade','lawsuit','investigation','recall','bankruptcy','delisting','sec probe','underperform'];
  const bull = bullWords.some(w => t.indexOf(w) !== -1);
  const bear = bearWords.some(w => t.indexOf(w) !== -1);
  if (bull && !bear) return 'bullish';
  if (bear && !bull) return 'bearish';
  return 'neutral';
}

// ════════════════════════════════════════════════════════════
// OPERATIONS → FIFO
// Reads the "פעולות" sheet from the spreadsheet specified in
// Script Property OPERATIONS_SPREADSHEET_ID (defaults to the
// active spreadsheet). Builds closed trades + open positions.
//
// Sheet columns (row 1 = headers, data starts row 2):
//   A = תאריך   B = סימבול   C = פעולה (BUY/SELL)
//   D = כמות    E = מחיר ליחידה   F = עמלה (optional)
//   G = הערות (optional)
// ════════════════════════════════════════════════════════════

function getOperationsSheet_() {
  const props   = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('OPERATIONS_SPREADSHEET_ID') || '14e80gt0rcc4DwH1j458kAT1Tz11s-4N8MlWSthF8v9g';
  let ss;
  try {
    ss = SpreadsheetApp.openById(sheetId);
  } catch(e) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  return ss ? ss.getSheetByName('פעולות') : null;
}

function handleGetOperations_() {
  try {
    const sh = getOperationsSheet_();
    if (!sh) return jsonOut_({ ok: false, error: 'לשונית "פעולות" לא נמצאה' });

    const data = sh.getDataRange().getValues();
    if (data.length < 2) return jsonOut_({ ok: true, trades: [], positions: [] });

    // Parse rows (skip header row 1)
    const ops = [];
    for (var i = 1; i < data.length; i++) {
      const row = data[i];
      const dateVal    = row[0];
      const symbol     = String(row[1] || '').trim().toUpperCase();
      const action     = String(row[2] || '').trim().toUpperCase();
      const qty        = parseFloat(row[3]) || 0;
      const price      = parseFloat(row[4]) || 0;
      const commission = parseFloat(row[5]) || 0;
      const notes      = String(row[6] || '').trim();

      if (!symbol || !action || qty <= 0 || price <= 0) continue;
      if (action !== 'BUY' && action !== 'SELL') continue;

      var date;
      if (dateVal instanceof Date) {
        date = dateVal;
      } else {
        date = new Date(dateVal);
        if (isNaN(date.getTime())) continue;
      }
      ops.push({ date: date, symbol: symbol, action: action, qty: qty, price: price, commission: commission, notes: notes });
    }

    var result = applyFIFO_(ops);
    return jsonOut_({ ok: true, trades: result.trades, positions: result.positions });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function applyFIFO_(ops) {
  // Sort BUY/SELL by date ASC; on same date BUY goes before SELL
  ops.sort(function(a, b) {
    var diff = a.date.getTime() - b.date.getTime();
    if (diff !== 0) return diff;
    if (a.action === 'BUY' && b.action === 'SELL') return -1;
    if (a.action === 'SELL' && b.action === 'BUY') return 1;
    return 0;
  });

  var lots   = {};   // { symbol: [{date,qty,price,commission,remaining,notes}] }
  var trades = [];
  var tradeId = 1;

  ops.forEach(function(op) {
    var sym = op.symbol;
    if (!lots[sym]) lots[sym] = [];

    if (op.action === 'BUY') {
      lots[sym].push({ date: op.date, qty: op.qty, price: op.price,
                       commission: op.commission, remaining: op.qty, notes: op.notes });
    } else if (op.action === 'SELL') {
      var sellLeft       = op.qty;
      var sellPrice      = op.price;
      var sellCommTotal  = op.commission;

      while (sellLeft > 0 && lots[sym] && lots[sym].length > 0) {
        var lot     = lots[sym][0];
        var matched = Math.min(sellLeft, lot.remaining);

        var buyCommPerUnit  = lot.qty  > 0 ? lot.commission / lot.qty  : 0;
        var sellCommPerUnit = op.qty   > 0 ? sellCommTotal  / op.qty   : 0;

        var gross    = matched * (sellPrice - lot.price);
        var tax      = gross > 0 ? Math.round(gross * 0.25 * 100) / 100 : 0;
        var buyComm  = Math.round(buyCommPerUnit  * matched * 100) / 100;
        var sellComm = Math.round(sellCommPerUnit * matched * 100) / 100;
        var net      = Math.round((gross - tax - buyComm - sellComm) * 100) / 100;
        var pct      = lot.price > 0 ? Math.round((sellPrice - lot.price) / lot.price * 10000) / 100 : 0;
        var holdDays = Math.round((op.date.getTime() - lot.date.getTime()) / 86400000);
        var cost     = Math.round(matched * lot.price * 100) / 100;
        var tz       = Session.getScriptTimeZone();
        var monthKey = Utilities.formatDate(op.date, tz, 'yyyy-MM');

        trades.push({
          id:           tradeId++,
          symbol:       sym,
          buy_date:     formatDateDDMMYYYY_(lot.date),
          sell_date:    formatDateDDMMYYYY_(op.date),
          qty:          matched,
          buy_price:    lot.price,
          sell_price:   sellPrice,
          cost:         cost,
          gross:        Math.round(gross * 100) / 100,
          tax:          tax,
          net:          net,
          pct:          pct,
          hold_days:    holdDays,
          month:        monthKey,
          notes:        lot.notes || op.notes || '',
          entry_reason: '', exit_reason: '', respected_stop: '',
          followed_plan: '', lesson: '', emotion: ''
        });

        lot.remaining -= matched;
        sellLeft      -= matched;
        if (lot.remaining <= 0) lots[sym].shift();
      }
    }
  });

  // Remaining lots → open positions
  var positions = [];
  var posId = 1;
  Object.keys(lots).forEach(function(sym) {
    var activeLots = lots[sym].filter(function(l) { return l.remaining > 0; });
    if (!activeLots.length) return;
    var totalQty  = activeLots.reduce(function(s, l) { return s + l.remaining; }, 0);
    var totalCost = activeLots.reduce(function(s, l) { return s + l.remaining * l.price; }, 0);
    var avgPrice  = totalQty > 0 ? Math.round(totalCost / totalQty * 100) / 100 : 0;
    positions.push({
      id:         posId++,
      symbol:     sym,
      qty:        totalQty,
      avg_price:  avgPrice,
      target:     '',
      stop_loss:  '',
      notes:      '',
      added_date: formatDateDDMMYYYY_(activeLots[0].date)
    });
  });

  return { trades: trades, positions: positions };
}

function formatDateDDMMYYYY_(date) {
  if (!date || !(date instanceof Date)) return String(date || '');
  var d = date.getDate().toString().padStart(2, '0');
  var m = (date.getMonth() + 1).toString().padStart(2, '0');
  return d + '/' + m + '/' + date.getFullYear();
}

// ════════════════════════════════════════════════════════════
// AI CHAT (Anthropic — key held server-side)
// ════════════════════════════════════════════════════════════

function handleAiChat_(data) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return jsonOut_({ ok: false, error: 'ANTHROPIC_API_KEY not configured in Script Properties' });
  try {
    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: data.system || '',
        messages: data.messages || [],
      }),
      muteHttpExceptions: true,
    });
    const result = JSON.parse(response.getContentText());
    if (result.error) return jsonOut_({ ok: false, error: result.error.message || 'Anthropic API error' });
    const reply = (result.content && result.content[0]) ? result.content[0].text : '';
    return jsonOut_({ ok: true, reply });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}
