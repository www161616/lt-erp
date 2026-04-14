// ============================================================
// 小瀾採購管理 — Google Sheets ↔ Supabase 雙向同步
// ============================================================
// 使用方式：
// 1. 建立新的 Google Sheet
// 2. 延伸功能 → Apps Script → 貼上此程式碼
// 3. 執行 setupSheets() 建立分頁結構
// 4. 執行 setupTrigger() 設定自動同步（每 5 分鐘）
// 5. 重新整理 Sheet，上方選單會出現「小瀾採購管理」
// ============================================================

const SB_URL = 'https://asugjynpocwygggttxyo.supabase.co/rest/v1';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWdqeW5wb2N3eWdnZ3R0eHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzU3MjksImV4cCI6MjA4ODk1MTcyOX0.LzcRQAl80rZxKKD8NIYWGvylfwCbs1ek5LtKpmZodBc';

const SHEET_NAMES = {
  ORDER_TRACKING: '叫貨清單',
  PURCHASES:      '訂單記錄',
  ARRIVALS:       '到貨清單',
  RETURNS:        '退換貨',
  PIAOPIAO:       '漂漂館',
  MONTHLY:        '月結報表',
  SETTINGS:       '設定'
};

// ============================================================
// 選單 & 觸發器
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('小瀾採購管理')
    .addItem('🔄 全部同步', 'syncAll')
    .addSeparator()
    .addItem('📋 匯入1688/拼多多訂單', 'showImportDialog')
    .addSeparator()
    .addItem('⬇️ 拉取叫貨清單', 'pullOrderTracking')
    .addItem('⬇️ 拉取訂單記錄（從DB）', 'pullPurchases')
    .addItem('⬇️ 拉取到貨清單（從DB）', 'pullArrivals')
    .addItem('⬇️ 拉取漂漂館（從DB）', 'pullPiaopiao')
    .addItem('⬇️ 拉取退換貨', 'pullReturns')
    .addSeparator()
    .addItem('⬆️ 推送訂單記錄', 'pushPurchases')
    .addItem('⬆️ 推送到貨清單', 'pushArrivals')
    .addItem('⬆️ 推送退換貨進度', 'pushReturnProgress')
    .addItem('⬆️ 推送漂漂館', 'pushPiaopiao')
    .addSeparator()
    .addItem('📊 產生月結報表（當月）', 'generateMonthlyReport')
    .addItem('📊 產生月結報表（選擇月份）', 'generateMonthlyReportPrompt')
    .addSeparator()
    .addItem('⚙️ 初始化分頁結構', 'setupSheets')
    .addItem('⏰ 設定自動同步（每5分鐘）', 'setupTrigger')
    .addToUi();
}

function setupTrigger() {
  // 移除舊觸發器
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncAll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('已設定每 5 分鐘自動同步');
}

// ============================================================
// 初始化分頁
// ============================================================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 叫貨清單
  createOrResetSheet(ss, SHEET_NAMES.ORDER_TRACKING, [
    '商品編號', '商品名稱', '結單日', '總數量', '叫貨量', '售價',
    '1688訂單號', '已叫貨', '進貨價', '各店數量', 'DB_ID'
  ], { freezeRows: 1, hideCols: [11], colWidths: { 1:110, 2:200, 3:90, 4:70, 5:70, 6:70, 7:140, 8:70, 9:70, 10:200 } });

  // 訂單記錄
  createOrResetSheet(ss, SHEET_NAMES.PURCHASES, [
    '日期', '來源', '1688訂單號', '商品名稱(1688)', '配對商品編號', '配對商品名稱',
    '金額(RMB)', '數量', '重量(kg)', '台幣總計', '進貨單價', '運單號', '用途', '備註', 'DB_ID'
  ], { freezeRows: 1, hideCols: [15], colWidths: { 1:90, 2:70, 3:140, 4:180, 5:110, 6:160, 7:90, 8:60, 9:80, 10:90, 11:80, 12:140, 13:80, 14:120 } });

  // 到貨清單
  createOrResetSheet(ss, SHEET_NAMES.ARRIVALS, [
    '已到貨', '運單號', '商品名稱', '商品編號', '數量', '進貨價', '售價',
    '出貨日', '集運單號', '寄至', '備註', 'DB_ID'
  ], { freezeRows: 1, hideCols: [12], colWidths: { 1:60, 2:140, 3:180, 4:110, 5:60, 6:70, 7:70, 8:90, 9:120, 10:100, 11:120 } });

  // 退換貨
  createOrResetSheet(ss, SHEET_NAMES.RETURNS, [
    '日期', '商品編號', '商品名稱', '數量', '原因', '內容',
    '處理進度', '處理日期', '補寄運單號', '備註', 'DB_ID'
  ], { freezeRows: 1, hideCols: [11], colWidths: { 1:90, 2:110, 3:180, 4:60, 5:80, 6:200, 7:90, 8:90, 9:120, 10:120 } });

  // 漂漂館
  createOrResetSheet(ss, SHEET_NAMES.PIAOPIAO, [
    '結單日', '商品編號', '售價', '規格數量', '訂貨狀態', '廠商連結',
    '大陸售價', '重量', '進貨成本', '1688單號', '物流', '預計到貨', 'DB_ID'
  ], { freezeRows: 1, hideCols: [13], colWidths: { 1:90, 2:110, 3:70, 4:200, 5:80, 6:160, 7:80, 8:70, 9:80, 10:120, 11:120, 12:90 } });

  // 月結報表
  createOrResetSheet(ss, SHEET_NAMES.MONTHLY, [
    '日期', '商品代碼', '商品名稱', '數量', '叫貨數量', '叫貨總金額(台幣)', '商品重量'
  ], { freezeRows: 1, colWidths: { 1:90, 2:110, 3:200, 4:70, 5:80, 6:120, 7:80 } });

  // 設定
  const settingsSheet = getOrCreateSheet(ss, SHEET_NAMES.SETTINGS);
  if (settingsSheet.getLastRow() < 1) {
    settingsSheet.getRange('A1:B1').setValues([['項目', '值']]).setFontWeight('bold').setBackground('#edf2f7');
    settingsSheet.getRange('A2:B5').setValues([
      ['匯率', 4.7],
      ['運費率(RMB/kg)', 7.5],
      ['漂漂館匯率', 4.7],
      ['漂漂館運費率', 7.5]
    ]);
    settingsSheet.setColumnWidth(1, 150);
    settingsSheet.setColumnWidth(2, 80);
  }

  // 在訂單記錄加入公式說明
  const purchSheet = ss.getSheetByName(SHEET_NAMES.PURCHASES);
  if (purchSheet && purchSheet.getLastRow() <= 1) {
    // 第 2 行放示範公式
    purchSheet.getRange('E2').setFormula('=IFERROR(INDEX(叫貨清單!A:A, MATCH(C2, 叫貨清單!G:G, 0)), "")');
    purchSheet.getRange('F2').setFormula('=IFERROR(INDEX(叫貨清單!B:B, MATCH(C2, 叫貨清單!G:G, 0)), IFERROR(INDEX(叫貨清單!B:B, MATCH(E2, 叫貨清單!A:A, 0)), ""))');
    purchSheet.getRange('J2').setFormula('=IF(G2="","",(G2+I2*設定!B3)*設定!B2)');
    purchSheet.getRange('K2').setFormula('=IF(OR(J2="",H2=0,H2=""),"",J2/H2)');
    // 設定公式欄底色
    purchSheet.getRange('E2:F2').setBackground('#f0f7ff');
    purchSheet.getRange('J2:K2').setBackground('#f0f7ff');
  }

  SpreadsheetApp.getUi().alert('分頁結構已建立！\n\n請先執行「拉取叫貨清單」取得最新資料。');
}

// ============================================================
// 匯入 1688 / 拼多多訂單（智能匯入）
// ============================================================

/** 顯示匯入對話框 */
function showImportDialog() {
  const html = HtmlService.createHtmlOutput(IMPORT_DIALOG_HTML)
    .setWidth(700)
    .setHeight(520)
    .setTitle('匯入訂單');
  SpreadsheetApp.getUi().showModalDialog(html, '📋 匯入 1688 / 拼多多訂單');
}

/** 從對話框接收貼上的文字，解析並寫入訂單記錄 */
function importPastedData(text, category) {
  if (!text || !text.trim()) return { success: false, msg: '沒有資料' };

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { success: false, msg: '沒有資料' };

  // 偵測格式
  const format = detectFormat(lines);
  let parsed = [];

  if (format === '1688') {
    parsed = parse1688(lines);
  } else if (format === '1688_raw') {
    parsed = parse1688Raw(lines);
  } else if (format === 'pdd') {
    parsed = parsePDD(lines);
  } else {
    parsed = parseFree(lines);
  }

  if (parsed.length === 0) return { success: false, msg: '解析結果為空，請確認資料格式' };

  // 寫入訂單記錄
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PURCHASES);
  if (!sheet) return { success: false, msg: '找不到「訂單記錄」分頁' };

  const settings = getSettings();
  const lastRow = Math.max(sheet.getLastRow(), 1);

  // 找到第一個空行
  let insertRow = lastRow + 1;
  if (lastRow > 1) {
    const col1 = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < col1.length; i++) {
      if (!col1[i][0]) { insertRow = i + 2; break; }
    }
  }

  const newRows = parsed.map(r => {
    const payRmb = r.payment_rmb || 0;
    const weightKg = r.weight_kg || 0;
    const qty = r.qty || 0;
    const totalTwd = payRmb > 0 ? Math.round((payRmb + weightKg * settings.ship) * settings.rate * 100) / 100 : '';
    const unitCost = totalTwd && qty > 0 ? Math.round(totalTwd / qty * 100) / 100 : '';

    return [
      r.order_date || '',               // A: 日期
      r.source || '',                    // B: 來源
      r.order_number || '',              // C: 1688訂單號
      r.product_name || '',              // D: 商品名稱(1688)
      '',                                // E: 配對商品編號（公式）
      '',                                // F: 配對商品名稱（公式）
      payRmb || '',                      // G: 金額(RMB)
      qty || '',                         // H: 數量
      weightKg || '',                    // I: 重量(kg)
      totalTwd,                          // J: 台幣總計
      unitCost,                          // K: 進貨單價
      r.tracking_number || '',           // L: 運單號
      category || '團購',               // M: 用途
      '',                                // N: 備註
      ''                                 // O: DB_ID
    ];
  });

  // 寫入資料
  sheet.getRange(insertRow, 1, newRows.length, 15).setValues(newRows);

  // 設定配對公式（E, F 欄）和計算公式（J, K 欄）
  for (let i = 0; i < newRows.length; i++) {
    const row = insertRow + i;
    sheet.getRange(row, 5).setFormula(`=IFERROR(INDEX(叫貨清單!A:A, MATCH(C${row}, 叫貨清單!G:G, 0)), "")`);
    sheet.getRange(row, 6).setFormula(`=IFERROR(INDEX(叫貨清單!B:B, MATCH(C${row}, 叫貨清單!G:G, 0)), IFERROR(INDEX(叫貨清單!B:B, MATCH(E${row}, 叫貨清單!A:A, 0)), ""))`);
    // J, K 欄：如果匯入時已有金額就保留數值，沒有才放公式
    if (!newRows[i][9]) {
      sheet.getRange(row, 10).setFormula(`=IF(G${row}="","",(G${row}+I${row}*設定!B3)*設定!B2)`);
    }
    if (!newRows[i][10]) {
      sheet.getRange(row, 11).setFormula(`=IF(OR(J${row}="",H${row}=0,H${row}=""),"",J${row}/H${row})`);
    }
    // 公式欄底色
    sheet.getRange(row, 5, 1, 2).setBackground('#f0f7ff');
  }

  return {
    success: true,
    msg: `成功匯入 ${parsed.length} 筆（格式：${format}，用途：${category}）`,
    count: parsed.length,
    format: format
  };
}

// ---- 格式偵測 ----
function detectFormat(lines) {
  if (!lines || lines.length === 0) return 'free';
  const first = lines[0].toLowerCase();
  if (first.includes('订单编号') && (first.includes('实付款') || first.includes('货品标题') || first.includes('订单创建时间'))) return '1688';
  if (first.includes('订单编号') && first.includes('快递单号')) return 'package';
  if ((first.includes('订单号') || first.includes('订单编号')) && (first.includes('拼单') || first.includes('售后') || first.includes('商家备注'))) return 'pdd';

  const cols = splitCols(lines[0]);
  if (cols.length >= 4) {
    const c0 = cols[0].trim(), c1 = cols[1].trim();
    if (/^\d{4}[-\/]\d{2}[-\/]\d{2}/.test(c0) && /^\d{15,}$/.test(c1)) return '1688_raw';
    if (/^\d{15,}$/.test(c0)) return '1688_raw';
  }
  return 'free';
}

function splitCols(line) {
  return line.split('\t').length > 1 ? line.split('\t') : line.split(',');
}

function excelDateToStr(v) {
  if (!v) return '';
  if (typeof v === 'number' || /^\d{4,5}(\.\d+)?$/.test(String(v).trim())) {
    var n = parseFloat(v);
    if (n > 40000 && n < 60000) {
      var d = new Date((n - 25569) * 86400000);
      return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
  }
  var s = String(v).trim();
  if (s.includes('-') || s.includes('/')) {
    var d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return s;
}

// ---- 1688 有表頭 ----
function parse1688(lines) {
  var results = [];
  var headers = splitCols(lines[0]);
  var findCol = function(keywords) { return headers.findIndex(function(h) { return keywords.some(function(k) { return h.includes(k); }); }); };
  var cOrder = findCol(['订单编号']);
  var cPay = findCol(['实付款', '应付款']);
  var cDate = findCol(['订单创建时间', '创建时间']);
  var cName = findCol(['货品标题', '商品名称']);
  var cQty = findCol(['数量', '购买数量']);
  var cTrack = findCol(['运单号', '物流单号']);
  var cOffer = findCol(['Offer ID', 'offer', 'Offer']);

  var current = null;
  for (var i = 1; i < lines.length; i++) {
    var cols = splitCols(lines[i]);
    if (cols.length < 3) continue;
    var orderNum = cOrder >= 0 ? (cols[cOrder] || '').trim() : '';
    var name = cName >= 0 ? (cols[cName] || '').trim() : '';
    if (!name) continue;
    var qty = cQty >= 0 ? (parseInt(cols[cQty]) || 0) : 0;

    if (orderNum) {
      if (current) results.push(current);
      current = {
        order_number: orderNum,
        order_date: cDate >= 0 ? excelDateToStr(cols[cDate]) : '',
        tracking_number: cTrack >= 0 ? (cols[cTrack] || '').trim() : '',
        product_name: name.replace(/\s*(颜色|规格|尺寸|型号)\s*[:：].*/i, '').trim(),
        payment_rmb: cPay >= 0 ? (parseFloat(cols[cPay]) || 0) : 0,
        qty: qty,
        offer_id: cOffer >= 0 ? (cols[cOffer] || '').trim() : '',
        source: '1688'
      };
    } else if (current) {
      current.qty += qty;
    }
  }
  if (current) results.push(current);
  return results;
}

// ---- 1688 無表頭（從網頁複製）----
function parse1688Raw(lines) {
  var results = [];
  var current = null;

  for (var i = 0; i < lines.length; i++) {
    var cols = splitCols(lines[i]).map(function(c) { return c.trim(); }).filter(function(c) { return c; });
    if (cols.length < 2) continue;

    var orderIdx = cols.findIndex(function(c) { return /^\d{15,}$/.test(c); });
    var dateIdx = cols.findIndex(function(c) { return /^\d{4}[-\/]\d{2}[-\/]\d{2}/.test(c); });
    var hasChinese = cols.some(function(c) { return /[\u4e00-\u9fff]/.test(c); });
    var isNewRow = orderIdx >= 0 || (hasChinese && (dateIdx >= 0 || cols.length >= 4));

    if (isNewRow) {
      if (current) results.push(current);
      var orderNum = orderIdx >= 0 ? cols[orderIdx] : '';
      var date = dateIdx >= 0 ? excelDateToStr(cols[dateIdx]) : '';
      var rest = orderIdx >= 0 ? cols.slice(orderIdx + 1) : cols.filter(function(c, idx) { return idx !== dateIdx; });

      var trackIdx = rest.findIndex(function(c) { return /^[A-Z]{0,3}\d{10,}$/i.test(c); });
      var tracking = trackIdx >= 0 ? rest[trackIdx] : '';
      var nameIdx = rest.findIndex(function(c) { return /[\u4e00-\u9fff]/.test(c); });
      var name = nameIdx >= 0 ? rest[nameIdx].replace(/\s*(颜色|规格|尺寸|型号)\s*[:：].*/i, '').trim() : '';
      var nums = rest.filter(function(c, idx) { return idx !== trackIdx && idx !== nameIdx && /^[\d,]+\.?\d*$/.test(c); })
        .map(function(c) { return parseFloat(c.replace(/,/g, '')) || 0; });

      current = {
        order_number: orderNum,
        order_date: date,
        tracking_number: tracking,
        product_name: name,
        payment_rmb: nums[0] || 0,
        qty: nums.length > 1 ? Math.round(nums[1]) : 0,
        weight_kg: nums.length > 2 ? nums[2] : 0,
        source: '1688'
      };
    } else if (current) {
      var nums2 = cols.filter(function(c) { return /^\d+\.?\d*$/.test(c); }).map(Number);
      if (nums2.length >= 2) {
        if (!current.payment_rmb && nums2[0]) current.payment_rmb = nums2[0];
        if (!current.qty && nums2.length > 1) current.qty = Math.round(nums2[1]);
      }
    }
  }
  if (current) results.push(current);
  return results;
}

// ---- 拼多多 ----
function parsePDD(lines) {
  var results = [];
  var headers = splitCols(lines[0]);
  var findCol = function(keywords) { return headers.findIndex(function(h) { return keywords.some(function(k) { return h.includes(k); }); }); };
  var cOrder = findCol(['订单号', '订单编号']);
  var cDate = findCol(['下单时间', '创建时间', '订单时间']);
  var cName = findCol(['商品名称', '商品', '货品']);
  var cPay = findCol(['实付金额', '实付款', '商品金额', '支付金额']);
  var cQty = findCol(['数量', '商品数量']);
  var cTrack = findCol(['快递单号', '物流单号', '运单号']);

  for (var i = 1; i < lines.length; i++) {
    var cols = splitCols(lines[i]);
    if (cols.length < 3) continue;
    var name = cName >= 0 ? (cols[cName] || '').trim() : '';
    if (!name) continue;
    results.push({
      order_number: cOrder >= 0 ? (cols[cOrder] || '').trim() : '',
      order_date: cDate >= 0 ? excelDateToStr(cols[cDate]) : '',
      tracking_number: cTrack >= 0 ? (cols[cTrack] || '').trim() : '',
      product_name: name.replace(/\s*(颜色|规格|尺寸|型号)\s*[:：].*/i, '').trim(),
      payment_rmb: cPay >= 0 ? (parseFloat(cols[cPay]) || 0) : 0,
      qty: cQty >= 0 ? (parseInt(cols[cQty]) || 0) : 1,
      source: '拼多多'
    });
  }
  return results;
}

// ---- 自由格式 ----
function parseFree(lines) {
  var results = [];
  var headers = splitCols(lines[0]).map(function(h) { return h.trim(); });
  var mapping = {
    order_date: ['訂單日', '日期', 'date', '下单时间'],
    order_number: ['訂單號', '訂單編號', '订单编号', '订单号'],
    tracking_number: ['運單', '快遞', '物流', '运单号'],
    product_name: ['商品名', '品名', '名稱', '商品', '货品标题'],
    payment_rmb: ['付款', '金額', 'RMB', '实付款'],
    qty: ['數量', '数量'],
    weight_kg: ['重量', 'kg'],
    source: ['下單處', '來源', '来源']
  };

  var fieldMap = {};
  for (var field in mapping) {
    var keywords = mapping[field];
    var idx = headers.findIndex(function(h) { return keywords.some(function(k) { return h.toLowerCase().includes(k.toLowerCase()); }); });
    if (idx >= 0) fieldMap[field] = idx;
  }

  var hasHeaders = Object.keys(fieldMap).length > 0;
  var startRow = hasHeaders ? 1 : 0;

  for (var i = startRow; i < lines.length; i++) {
    var cols = splitCols(lines[i]);
    if (cols.length < 2) continue;
    var row = {};
    if (hasHeaders) {
      for (var f in fieldMap) row[f] = (cols[fieldMap[f]] || '').trim();
    } else {
      row.order_date = cols[0] || '';
      row.order_number = cols[1] || '';
      row.product_name = cols[2] || '';
      row.payment_rmb = cols[3] || '';
      row.qty = cols[4] || '';
    }
    row.payment_rmb = parseFloat(row.payment_rmb) || 0;
    row.qty = parseInt(row.qty) || 0;
    row.weight_kg = parseFloat(row.weight_kg) || 0;
    if (row.product_name || row.order_number) results.push(row);
  }
  return results;
}

// ---- 匯入對話框 HTML ----
const IMPORT_DIALOG_HTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', sans-serif; padding: 16px; color: #2d3748; }
    h3 { margin: 0 0 12px; font-size: 15px; }
    .category-row { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
    .category-row label { font-weight: 600; font-size: 13px; }
    .category-row select { padding: 4px 8px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 13px; }
    textarea {
      width: 100%; height: 240px; padding: 10px; border: 1px solid #cbd5e0; border-radius: 6px;
      font-size: 12px; font-family: monospace; line-height: 1.5; resize: vertical;
    }
    textarea:focus { outline: none; border-color: #4a6fa5; box-shadow: 0 0 0 2px rgba(74,111,165,0.2); }
    .btn-row { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
    .btn {
      padding: 8px 20px; border: none; border-radius: 6px; font-size: 13px;
      font-weight: 600; cursor: pointer; transition: 0.2s;
    }
    .btn-primary { background: #4a6fa5; color: #fff; }
    .btn-primary:hover { background: #3d5f8f; }
    .btn-outline { background: #fff; color: #718096; border: 1px solid #cbd5e0; }
    .btn-outline:hover { background: #f7fafc; }
    .hint { font-size: 11px; color: #718096; margin-top: 6px; line-height: 1.5; }
    .result { margin-top: 12px; padding: 10px; border-radius: 6px; font-size: 13px; display: none; }
    .result.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .result.error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  </style>
</head>
<body>
  <div class="category-row">
    <label>用途：</label>
    <select id="category">
      <option value="團購">團購</option>
      <option value="漂漂館">漂漂館</option>
      <option value="大姐">大姐</option>
      <option value="二姐">二姐</option>
      <option value="私人">私人</option>
    </select>
    <span style="font-size:11px; color:#718096; margin-left:8px;">格式自動偵測（1688 / 拼多多 / 自由格式）</span>
  </div>

  <textarea id="pasteArea" placeholder="在這裡貼上從 1688 匯出的訂單資料...&#10;&#10;支援格式：&#10;- 1688 訂單匯出（有表頭：订单编号、实付款...）&#10;- 1688 網頁直接複製（無表頭）&#10;- 拼多多訂單匯出&#10;- 自訂 Tab 分隔格式"></textarea>

  <div class="hint">
    從 1688「我的訂單」匯出 Excel → 打開 → 全選複製 → 貼到這裡
  </div>

  <div class="btn-row">
    <button class="btn btn-outline" onclick="google.script.host.close()">取消</button>
    <button class="btn btn-primary" id="importBtn" onclick="doImport()">匯入</button>
  </div>

  <div class="result" id="result"></div>

  <script>
    function doImport() {
      var text = document.getElementById('pasteArea').value;
      var category = document.getElementById('category').value;
      var btn = document.getElementById('importBtn');
      btn.disabled = true;
      btn.textContent = '匯入中...';

      google.script.run
        .withSuccessHandler(function(r) {
          var el = document.getElementById('result');
          el.style.display = 'block';
          if (r.success) {
            el.className = 'result success';
            el.textContent = r.msg;
            document.getElementById('pasteArea').value = '';
            setTimeout(function() { google.script.host.close(); }, 2000);
          } else {
            el.className = 'result error';
            el.textContent = r.msg;
          }
          btn.disabled = false;
          btn.textContent = '匯入';
        })
        .withFailureHandler(function(e) {
          var el = document.getElementById('result');
          el.style.display = 'block';
          el.className = 'result error';
          el.textContent = '錯誤：' + e.message;
          btn.disabled = false;
          btn.textContent = '匯入';
        })
        .importPastedData(text, category);
    }
  </script>
</body>
</html>
`;

// ============================================================
// 全部同步
// ============================================================
function syncAll() {
  pullOrderTracking();
  pullReturns();
  pushPurchases();
  pushArrivals();
  pushReturnProgress();
  pushPiaopiao();
}

// ============================================================
// PULL: Supabase → Google Sheets
// ============================================================

/** 拉取叫貨清單（xiaolan_order_tracking → 叫貨清單） */
function pullOrderTracking() {
  const rows = sbFetchAll('xiaolan_order_tracking', 'end_date.desc,product_name.asc');
  const sheet = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_NAMES.ORDER_TRACKING);

  // 清除舊資料（保留表頭）
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  if (rows.length === 0) return;

  const data = rows.map(r => [
    r.product_id || '',
    r.product_name || '',
    r.end_date || '',
    r.total_qty || 0,
    r.order_qty || 0,
    r.selling_price || '',
    r.order_number_1688 || '',
    r.ordered ? '是' : '',
    r.unit_cost || '',
    r.store_qtys ? JSON.stringify(r.store_qtys) : '',
    r.product_id || ''   // DB_ID = product_id (PK)
  ]);

  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);

  // 1688訂單號欄底色
  for (let i = 0; i < data.length; i++) {
    if (data[i][6]) {
      sheet.getRange(i + 2, 7).setBackground('#f0fdf4');
    }
  }
}

/** 拉取退換貨（xiaolan_returns → 退換貨） */
function pullReturns() {
  const rows = sbFetchAll('xiaolan_returns', 'created_at.desc');
  const sheet = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_NAMES.RETURNS);

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  if (rows.length === 0) return;

  const data = rows.map(r => [
    r.return_date || '',
    r.product_code || '',
    r.product_name || '',
    r.qty || '',
    r.reason || '',
    r.content || '',
    r.progress || '待處理',
    r.process_date || '',
    r.tracking_number || '',
    r.note || '',
    r.id || ''
  ]);

  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);

  // 處理進度欄顏色
  const progressColors = {
    '待處理': '#fef3c7', '廠商補寄': '#eff6ff', '已重新訂貨': '#f0fdf4',
    '廠商退款': '#fdf2f8', '認賠': '#fef2f2', '已解決': '#ecfdf5'
  };
  for (let i = 0; i < data.length; i++) {
    const color = progressColors[data[i][6]] || '#fff';
    sheet.getRange(i + 2, 7).setBackground(color);
  }
}

/** 拉取訂單記錄（xiaolan_purchases → 訂單記錄）— 首次匯入用 */
function pullPurchases() {
  const rows = sbFetchAll('xiaolan_purchases', 'order_date.desc,id.desc');
  const sheet = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_NAMES.PURCHASES);

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length === 0) return;

  const data = rows.map(r => [
    r.order_date || '',
    r.source || '',
    r.order_number || '',
    r.product_name || '',
    r.linked_product || '',       // E: 配對商品編號
    '',                            // F: 配對商品名稱（用公式）
    r.payment_rmb || '',
    r.qty || '',
    r.weight_kg || '',
    r.total_twd || '',
    r.unit_cost || '',
    r.tracking_number || '',
    r.category || '',
    r.note || '',
    r.id || ''                     // O: DB_ID
  ]);

  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);

  // 設定配對公式（F 欄）
  for (let i = 0; i < data.length; i++) {
    const row = i + 2;
    sheet.getRange(row, 6).setFormula(`=IFERROR(INDEX(叫貨清單!B:B, MATCH(C${row}, 叫貨清單!G:G, 0)), IFERROR(INDEX(叫貨清單!B:B, MATCH(E${row}, 叫貨清單!A:A, 0)), ""))`);
    sheet.getRange(row, 5, 1, 2).setBackground('#f0f7ff');
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(`拉取完成：${data.length} 筆`, '訂單記錄', 3);
}

/** 拉取到貨清單（xiaolan_arrivals → 到貨清單）— 首次匯入用 */
function pullArrivals() {
  const rows = sbFetchAll('xiaolan_arrivals', 'created_at.desc');
  const sheet = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_NAMES.ARRIVALS);

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length === 0) return;

  const data = rows.map(r => [
    r.arrived ? '是' : '',
    r.tracking_number || '',
    r.product_name || '',
    r.product_id || '',
    r.qty || '',
    r.unit_cost || '',
    r.selling_price || '',
    r.ship_date || '',
    r.ship_order || '',
    r.ship_to || '',
    r.note || '',
    r.id || ''
  ]);

  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
  SpreadsheetApp.getActiveSpreadsheet().toast(`拉取完成：${data.length} 筆`, '到貨清單', 3);
}

/** 拉取漂漂館（xiaolan_piaopiao → 漂漂館）— 首次匯入用 */
function pullPiaopiao() {
  const rows = sbFetchAll('xiaolan_piaopiao', 'created_at.desc');
  const sheet = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_NAMES.PIAOPIAO);

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length === 0) return;

  const data = rows.map(r => [
    r.close_date || '',
    r.product_id || '',
    r.price || '',
    r.specs || '',
    r.order_status || '',
    r.supplier_url || '',
    r.cn_price || '',
    r.weight || '',
    r.unit_cost || '',
    r.order_1688 || '',
    r.tracking || '',
    r.eta || '',
    r.id || ''
  ]);

  sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
  SpreadsheetApp.getActiveSpreadsheet().toast(`拉取完成：${data.length} 筆`, '漂漂館', 3);
}

// ============================================================
// PUSH: Google Sheets → Supabase
// ============================================================

/** 推送訂單記錄（訂單記錄 → xiaolan_purchases） */
function pushPurchases() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PURCHASES);
  if (!sheet || sheet.getLastRow() <= 1) return;

  const settings = getSettings();
  const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15);
  const values = dataRange.getValues();
  let updated = 0, inserted = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    // 至少要有日期或訂單號才處理
    if (!row[0] && !row[2]) continue;

    const obj = {
      order_date:      formatDate(row[0]),
      source:          row[1] || '',
      order_number:    String(row[2] || ''),
      product_name:    row[3] || '',
      linked_product:  row[4] || '',          // 配對商品編號
      payment_rmb:     parseNum(row[6]),
      qty:             parseInt(row[7]) || 0,
      weight_kg:       parseNum(row[8]),
      total_twd:       parseNum(row[9]),
      unit_cost:       parseNum(row[10]),
      tracking_number: String(row[11] || ''),
      category:        row[12] || '',          // 用途
      note:            row[13] || '',
      used_rate:       settings.rate,
      used_ship:       settings.ship
    };

    const dbId = row[14]; // DB_ID
    if (dbId) {
      // 更新
      sbPatch('xiaolan_purchases', dbId, obj);
      updated++;
    } else {
      // 新增
      const newRow = sbPost('xiaolan_purchases', obj);
      if (newRow && newRow.id) {
        sheet.getRange(i + 2, 15).setValue(newRow.id);
        inserted++;
      }
    }
  }

  if (updated + inserted > 0) {
    // 同步進貨價到 xiaolan_order_tracking
    syncUnitCostToTracking();
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `推送完成：新增 ${inserted} 筆，更新 ${updated} 筆`, '訂單記錄', 3
  );
}

/** 推送到貨清單（到貨清單 → xiaolan_arrivals） */
function pushArrivals() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ARRIVALS);
  if (!sheet || sheet.getLastRow() <= 1) return;

  const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12);
  const values = dataRange.getValues();
  let updated = 0, inserted = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row[1] && !row[2]) continue; // 至少要有運單號或商品名稱

    const obj = {
      arrived:          row[0] === true || row[0] === '是' || row[0] === 'TRUE',
      tracking_number:  String(row[1] || ''),
      product_name:     row[2] || '',
      product_id:       row[3] || '',
      qty:              parseInt(row[4]) || 0,
      unit_cost:        parseNum(row[5]),
      selling_price:    parseNum(row[6]),
      ship_date:        row[7] || '',
      ship_order:       row[8] || '',
      ship_to:          row[9] || '',
      note:             row[10] || ''
    };

    const dbId = row[11];
    if (dbId) {
      sbPatch('xiaolan_arrivals', dbId, obj);
      updated++;
    } else {
      if (!obj.original_name) obj.original_name = obj.product_name;
      const newRow = sbPost('xiaolan_arrivals', obj);
      if (newRow && newRow.id) {
        sheet.getRange(i + 2, 12).setValue(newRow.id);
        inserted++;
      }
    }
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `推送完成：新增 ${inserted} 筆，更新 ${updated} 筆`, '到貨清單', 3
  );
}

/** 推送退換貨進度（只推小瀾填的欄位：進度/處理日期/運單號） */
function pushReturnProgress() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RETURNS);
  if (!sheet || sheet.getLastRow() <= 1) return;

  const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11);
  const values = dataRange.getValues();
  let updated = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const dbId = row[10];
    if (!dbId) continue;

    const obj = {
      progress:         row[6] || '',
      process_date:     formatDate(row[7]),
      tracking_number:  String(row[8] || ''),
      note:             row[9] || ''
    };

    sbPatch('xiaolan_returns', dbId, obj);
    updated++;
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `推送完成：更新 ${updated} 筆`, '退換貨', 3
  );
}

/** 推送漂漂館（漂漂館 → xiaolan_piaopiao） */
function pushPiaopiao() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PIAOPIAO);
  if (!sheet || sheet.getLastRow() <= 1) return;

  const settings = getSettings();
  const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13);
  const values = dataRange.getValues();
  let updated = 0, inserted = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row[0] && !row[1]) continue;

    const obj = {
      close_date:     row[0] || '',
      product_id:     row[1] || '',
      price:          parseNum(row[2]),
      specs:          row[3] || '',
      order_status:   row[4] || '',
      supplier_url:   row[5] || '',
      cn_price:       parseNum(row[6]),
      weight:         parseNum(row[7]),
      unit_cost:      parseNum(row[8]),
      order_1688:     row[9] || '',
      tracking:       row[10] || '',
      eta:            row[11] || '',
      pp_ex_rate:     settings.ppRate,
      pp_ship_rate:   settings.ppShip
    };

    const dbId = row[12];
    if (dbId) {
      sbPatch('xiaolan_piaopiao', dbId, obj);
      updated++;
    } else {
      const newRow = sbPost('xiaolan_piaopiao', obj);
      if (newRow && newRow.id) {
        sheet.getRange(i + 2, 13).setValue(newRow.id);
        inserted++;
      }
    }
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `推送完成：新增 ${inserted} 筆，更新 ${updated} 筆`, '漂漂館', 3
  );
}

// ============================================================
// 進貨價同步到 xiaolan_order_tracking
// ============================================================
function syncUnitCostToTracking() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PURCHASES);
  if (!sheet || sheet.getLastRow() <= 1) return;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();
  const costMap = {}; // product_id → unit_cost

  values.forEach(row => {
    const linkedPid = row[4]; // 配對商品編號
    const unitCost = parseNum(row[10]);
    if (linkedPid && unitCost > 0) {
      costMap[linkedPid] = unitCost;
    }
  });

  Object.keys(costMap).forEach(pid => {
    try {
      sbPatchByField('xiaolan_order_tracking', 'product_id', pid, {
        unit_cost: costMap[pid],
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      // 靜默失敗，不影響主流程
    }
  });
}

// ============================================================
// 月結報表
// ============================================================
function generateMonthlyReport() {
  const now = new Date();
  const month = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');
  _generateMonthlyReport(month);
}

function generateMonthlyReportPrompt() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt('月結報表', '請輸入月份（格式：2026-04）：', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) return;
  const month = result.getResponseText().trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    ui.alert('格式錯誤，請輸入 YYYY-MM 格式');
    return;
  }
  _generateMonthlyReport(month);
}

function _generateMonthlyReport(month) {
  const purchSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PURCHASES);
  const otSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ORDER_TRACKING);
  const reportSheet = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_NAMES.MONTHLY);

  if (!purchSheet || purchSheet.getLastRow() <= 1) {
    SpreadsheetApp.getUi().alert('訂單記錄是空的');
    return;
  }

  // 讀取訂單記錄
  const purchValues = purchSheet.getRange(2, 1, purchSheet.getLastRow() - 1, 15).getValues();

  // 讀取叫貨清單建立 pid → total_qty map
  const otMap = {};
  if (otSheet && otSheet.getLastRow() > 1) {
    const otValues = otSheet.getRange(2, 1, otSheet.getLastRow() - 1, 5).getValues();
    otValues.forEach(r => {
      if (r[0]) otMap[r[0]] = r[3] || 0; // product_id → total_qty
    });
  }

  // 篩選當月 + 用途=團購
  const filtered = purchValues.filter(row => {
    const dateStr = formatDate(row[0]);
    const category = (row[12] || '').toString();
    return dateStr.startsWith(month) && category === '團購';
  });

  // 清除舊資料
  if (reportSheet.getLastRow() > 1) {
    reportSheet.getRange(2, 1, reportSheet.getLastRow() - 1, reportSheet.getLastColumn()).clearContent();
    reportSheet.getRange(2, 1, reportSheet.getLastRow() - 1, reportSheet.getLastColumn()).setBackground(null);
  }

  if (filtered.length === 0) {
    SpreadsheetApp.getUi().alert(`${month} 沒有用途為「團購」的訂單`);
    return;
  }

  // 整理資料
  const reportData = filtered.map(row => {
    const pid = row[4] || '';  // 配對商品編號
    const totalTwd = parseNum(row[9]);
    return [
      formatDate(row[0]),        // 日期
      pid,                       // 商品代碼
      row[5] || row[3] || '',    // 商品名稱（配對名稱優先，fallback 1688名稱）
      parseInt(row[7]) || 0,     // 數量
      otMap[pid] || '',          // 叫貨數量
      totalTwd || '',            // 叫貨總金額(台幣)
      parseNum(row[8]) || ''     // 商品重量
    ];
  });

  // 寫入
  reportSheet.getRange(2, 1, reportData.length, 7).setValues(reportData);

  // 合計列
  const totalRow = reportData.length + 2;
  reportSheet.getRange(totalRow, 1).setValue('合計');
  reportSheet.getRange(totalRow, 1).setFontWeight('bold');
  reportSheet.getRange(totalRow, 4).setFormula(`=SUM(D2:D${totalRow - 1})`);
  reportSheet.getRange(totalRow, 6).setFormula(`=SUM(F2:F${totalRow - 1})`);
  reportSheet.getRange(totalRow, 7).setFormula(`=SUM(G2:G${totalRow - 1})`);
  reportSheet.getRange(totalRow, 1, 1, 7).setFontWeight('bold').setBackground('#edf2f7');

  // 標題
  reportSheet.getRange(1, 1, 1, 7).setBackground('#4a6fa5').setFontColor('#fff').setFontWeight('bold');

  // 加入月份標記
  reportSheet.getRange(totalRow + 1, 1).setValue(`報表月份：${month}，產生時間：${new Date().toLocaleString('zh-TW')}`);
  reportSheet.getRange(totalRow + 1, 1).setFontColor('#718096').setFontSize(9);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `${month} 月結報表已產生，共 ${reportData.length} 筆`, '月結報表', 5
  );
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(reportSheet);
}

// ============================================================
// Supabase API Helpers
// ============================================================

function sbHeaders(extra) {
  const h = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json'
  };
  if (extra) Object.keys(extra).forEach(k => h[k] = extra[k]);
  return h;
}

/** 分頁讀取全部資料 */
function sbFetchAll(table, order) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    let url = `${SB_URL}/${table}?limit=${limit}&offset=${offset}`;
    if (order) url += `&order=${order}`;
    const res = UrlFetchApp.fetch(url, {
      headers: sbHeaders(),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      Logger.log(`sbFetchAll error: ${res.getContentText()}`);
      break;
    }
    const rows = JSON.parse(res.getContentText());
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

/** POST 新增一筆（回傳含 id） */
function sbPost(table, data) {
  const res = UrlFetchApp.fetch(`${SB_URL}/${table}`, {
    method: 'post',
    headers: sbHeaders({ 'Prefer': 'return=representation' }),
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    Logger.log(`sbPost ${table} error: ${res.getContentText()}`);
    return null;
  }
  const arr = JSON.parse(res.getContentText());
  return arr.length > 0 ? arr[0] : null;
}

/** PATCH 更新一筆（by id） */
function sbPatch(table, id, data) {
  const res = UrlFetchApp.fetch(`${SB_URL}/${table}?id=eq.${id}`, {
    method: 'patch',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    Logger.log(`sbPatch ${table} id=${id} error: ${res.getContentText()}`);
  }
}

/** PATCH 更新（by 自訂欄位） */
function sbPatchByField(table, field, value, data) {
  const res = UrlFetchApp.fetch(`${SB_URL}/${table}?${field}=eq.${encodeURIComponent(value)}`, {
    method: 'patch',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    Logger.log(`sbPatchByField ${table} ${field}=${value} error: ${res.getContentText()}`);
  }
}

// ============================================================
// Sheet Helpers
// ============================================================

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function createOrResetSheet(ss, name, headers, opts) {
  const sheet = getOrCreateSheet(ss, name);

  // 只設定表頭（不清除既有資料）
  if (sheet.getLastRow() < 1 || sheet.getRange(1, 1).getValue() === '') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // 表頭樣式
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold').setBackground('#edf2f7').setFontSize(10);

  // 凍結
  if (opts.freezeRows) sheet.setFrozenRows(opts.freezeRows);

  // 欄寬
  if (opts.colWidths) {
    Object.keys(opts.colWidths).forEach(col => {
      sheet.setColumnWidth(parseInt(col), opts.colWidths[col]);
    });
  }

  // 隱藏欄（DB_ID）
  if (opts.hideCols) {
    opts.hideCols.forEach(col => {
      try { sheet.hideColumns(col); } catch(e) {}
    });
  }
}

// ============================================================
// 通用工具
// ============================================================

function getSettings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SETTINGS);
  if (!sheet) return { rate: 4.7, ship: 7.5, ppRate: 4.7, ppShip: 7.5 };
  const vals = sheet.getRange('B2:B5').getValues();
  return {
    rate:   parseFloat(vals[0][0]) || 4.7,
    ship:   parseFloat(vals[1][0]) || 7.5,
    ppRate: parseFloat(vals[2][0]) || 4.7,
    ppShip: parseFloat(vals[3][0]) || 7.5
  };
}

function parseNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function formatDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v);
}
