// ============================================================
// LT-ERP 簡易銷貨單 — 店家 Sheet（任務 3 第一版）
// ============================================================
// 部署方式：每家店一個 Sheet（副帳號 w161616w@gmail.com 持有）
//   1. 開新 Spreadsheet
//   2. 「擴充功能 → Apps Script」貼入此檔
//   3. 新增檔案 StoreOrderSidebar.html，貼入對應內容
//   4. 「⚙️ 專案設定 → 指令碼屬性」新增：
//        STORE_NAME    例：三峽（必須是 18 家店其中之一，完全相同）
//        STORE_SECRET  從 admin 取得對應店的 store_secret
//   5. 重新整理 Sheet → 出現「🛠️ 進貨工具」選單
//   6. 點「⚙️ 初始化分頁」建好 4 個分頁（會跳一次授權）
//   7. 點「📋 刷新所有進貨單」確認 RPC 連線正常
//
// 安全：所有 Supabase 寫入都走 RPC + store_secret 驗證
//   anon key 直接寫 simple_sales_orders 會被 RLS 擋
// ============================================================

const SB_URL = 'https://asugjynpocwygggttxyo.supabase.co/rest/v1';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWdqeW5wb2N3eWdnZ3R0eHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzU3MjksImV4cCI6MjA4ODk1MTcyOX0.LzcRQAl80rZxKKD8NIYWGvylfwCbs1ek5LtKpmZodBc';

const STORES = [
  '三峽','中和','文山','四號','永和','忠順','環球','平鎮','古華',
  '林口','南平','泰山','萬華','湖口','經國','松山','全民','龍潭'
];

const TAB_TOMORROW       = '隔日進貨單';
const TAB_ALL            = '所有進貨單';
const TAB_RETURN_HISTORY = '退貨紀錄';      // 舊系統 sales_orders.order_type='return' 的單
const TAB_TRANSFER       = '店轉店';
const TAB_REQUEST        = '需求表';

const HEADERS_ORDER  = ['單號','訂單日期','出貨日期','商品數','總金額','狀態','退貨狀態','收貨時間','備註'];
const HEADERS_RETURN = ['退貨單號','退貨日期','商品數','退貨金額','原銷貨單號','備註'];

const COL_ORDER_NO       = 1;
const ALL_ORDERS_DAYS    = 90;   // 含舊系統資料，拉長以過渡（簡單版；長期應做「歷史月份」查詢）
const RETURN_HISTORY_DAYS = 90;  // 退貨單少（4 月才 14 筆），拉久一點方便追溯
const ALL_ORDERS_MIN_DATE = '2026-04-01';  // 不論 sliding window 算到何時，from 不會早於此日（含 4/1 起所有歷史單）
const FONT_SIZE = 14;
const TIMEZONE = 'Asia/Taipei';


// ============================================================
// 選單
// ============================================================
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu('🛠️ 進貨工具')
    .addItem('🔄 刷新隔日進貨單',   'refreshTomorrowDeliveries')
    .addItem('📋 刷新所有進貨單',   'refreshAllDeliveries')
    .addItem('📜 刷新退貨紀錄',     'refreshReturnHistory')
    .addItem('🔍 查單號明細',       'openOrderDetailsSidebar')
    .addSeparator()
    .addItem('⚙️ 初始化分頁（第一次安裝）', 'setupStoreSheets')
    .addToUi();
}


// ============================================================
// helper：取設定 / 呼叫 RPC
// ============================================================
function _getStoreName_() {
  const v = PropertiesService.getScriptProperties().getProperty('STORE_NAME');
  if (!v || STORES.indexOf(String(v).trim()) < 0) {
    throw new Error('Script Properties「STORE_NAME」未設定或不在 18 家店清單裡');
  }
  return String(v).trim();
}

function _getStoreSecret_() {
  const v = PropertiesService.getScriptProperties().getProperty('STORE_SECRET');
  if (!v || String(v).trim().length === 0) {
    throw new Error('Script Properties「STORE_SECRET」未設定');
  }
  return String(v).trim();
}

function _callRpc_(funcName, payload) {
  const url = SB_URL + '/rpc/' + funcName;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) {
    let msg = text;
    try { const j = JSON.parse(text); if (j.message) msg = j.message; } catch (_) {}
    throw new Error(_formatRpcError_(code, msg));
  }
  try { return JSON.parse(text); } catch (_) { return text; }
}


// ============================================================
// 友善錯誤訊息（任務 4.1 補強：rate limit / 配額錯誤改中文）
// ============================================================
function _formatRpcError_(httpCode, rawMsg) {
  const msg = String(rawMsg || '').toLowerCase();

  // Rate limit / 頻寬 / 配額
  if (httpCode === 429 ||
      msg.indexOf('rate limit') >= 0 ||
      msg.indexOf('quota') >= 0 ||
      msg.indexOf('配額') >= 0 ||
      msg.indexOf('頻寬') >= 0 ||
      msg.indexOf('too many') >= 0 ||
      msg.indexOf('降低資料傳輸速率') >= 0) {
    return '⚠️ 系統忙碌中\n\n' +
           '剛才太多人在用，請等 1 分鐘後再試。\n\n' +
           '（如果一直出現，請聯絡管理員）';
  }

  // 網路 / 連線
  if (msg.indexOf('timeout') >= 0 ||
      msg.indexOf('connection') >= 0 ||
      msg.indexOf('連線') >= 0 ||
      msg.indexOf('network') >= 0) {
    return '⚠️ 網路連線異常\n\n請檢查網路後再試一次。';
  }

  // 預設：截短英文訊息（保留 200 字內，避免螢幕被超長 URL 塞滿）
  const shortMsg = String(rawMsg || '').substring(0, 200);
  return '❌ 系統錯誤（HTTP ' + httpCode + '）\n\n' + shortMsg +
         '\n\n如果一直出現，請聯絡管理員。';
}


// ============================================================
// 60 秒冷卻機制（任務 4.1 補強：防店家連點刷新）
// ============================================================
function _checkRefreshCooldown_(key, seconds) {
  const props = PropertiesService.getDocumentProperties();
  const lastTs = parseInt(props.getProperty(key) || '0');
  if (!lastTs) return { ok: true, elapsed: 0 };
  const now = Date.now();
  const elapsed = Math.floor((now - lastTs) / 1000);
  if (elapsed < seconds) {
    return { ok: false, wait: seconds - elapsed, elapsed: elapsed };
  }
  return { ok: true, elapsed: elapsed };
}

function _setRefreshCooldown_(key) {
  PropertiesService.getDocumentProperties().setProperty(key, String(Date.now()));
}


function _addDays_(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}


// ============================================================
// 初始化分頁
// ============================================================
function setupStoreSheets() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let storeName;
  try {
    storeName = _getStoreName_();
    _getStoreSecret_();
  } catch (err) {
    ui.alert('❌ 設定錯誤',
      err.message + '\n\n請先到「擴充功能 → Apps Script → 專案設定 → 指令碼屬性」新增：\n  STORE_NAME（店名，必須是：' + STORES.join(' / ') + '）\n  STORE_SECRET（從 admin 取得）',
      ui.ButtonSet.OK);
    return;
  }

  _ensureOrderSheet_(ss, TAB_TOMORROW);
  _ensureOrderSheet_(ss, TAB_ALL);
  _ensureReturnSheet_(ss, TAB_RETURN_HISTORY);
  _ensurePlaceholderSheet_(ss, TAB_TRANSFER, '🚧 店轉店功能開發中\n\n目前請繼續使用 branch_portal 網站處理店轉店。\n\n（任務 6 會做這個分頁的雙向同步）');
  _ensurePlaceholderSheet_(ss, TAB_REQUEST,
    '需求表暫不使用。\n\n' +
    '如需追加商品或詢問到貨日，請直接聯絡 admin。\n\n' +
    'admin 會視情況補開銷貨單或安排下次出貨。');

  // 移除預設「工作表1」（如果空白）
  const def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() <= 1 && def.getLastColumn() <= 1) {
    try { ss.deleteSheet(def); } catch (_) {}
  }

  // 順序固定
  _moveSheetTo_(ss, TAB_TOMORROW,       0);
  _moveSheetTo_(ss, TAB_ALL,            1);
  _moveSheetTo_(ss, TAB_RETURN_HISTORY, 2);
  _moveSheetTo_(ss, TAB_TRANSFER,       3);
  _moveSheetTo_(ss, TAB_REQUEST,        4);

  ui.alert('✅ 完成',
    '已建立 5 個分頁，店名：' + storeName +
    '\n\n下一步：\n  1. 點「📋 刷新所有進貨單」確認 RPC 連線\n  2. 點「🔄 刷新隔日進貨單」看明天要到的貨\n  3. 點「📜 刷新退貨紀錄」看歷史退貨單\n  4. 點任一單號 → 「🔍 查單號明細」確認收貨',
    ui.ButtonSet.OK);
}

function _ensureOrderSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  sh.getRange(1, 1, 1, HEADERS_ORDER.length).setValues([HEADERS_ORDER])
    .setFontWeight('bold')
    .setBackground('#1565c0')
    .setFontColor('#ffffff')
    .setFontSize(FONT_SIZE);
  sh.setFrozenRows(1);

  sh.setColumnWidth(1, 200); // 單號
  sh.setColumnWidth(2, 110); // 訂單日期
  sh.setColumnWidth(3, 110); // 出貨日期
  sh.setColumnWidth(4, 80);  // 商品數
  sh.setColumnWidth(5, 110); // 總金額
  sh.setColumnWidth(6, 90);  // 狀態
  sh.setColumnWidth(7, 100); // 退貨狀態
  sh.setColumnWidth(8, 150); // 收貨時間
  sh.setColumnWidth(9, 220); // 備註
}

function _ensureReturnSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  sh.getRange(1, 1, 1, HEADERS_RETURN.length).setValues([HEADERS_RETURN])
    .setFontWeight('bold')
    .setBackground('#c62828')        // 紅色背景區別於正常進貨單（藍色）
    .setFontColor('#ffffff')
    .setFontSize(FONT_SIZE);
  sh.setFrozenRows(1);

  sh.setColumnWidth(1, 200); // 退貨單號
  sh.setColumnWidth(2, 110); // 退貨日期
  sh.setColumnWidth(3, 80);  // 商品數
  sh.setColumnWidth(4, 110); // 退貨金額
  sh.setColumnWidth(5, 200); // 原銷貨單號
  sh.setColumnWidth(6, 250); // 備註
}

function _ensurePlaceholderSheet_(ss, name, msg) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange('A1').setValue(msg).setFontSize(FONT_SIZE).setWrap(true);
  sh.setColumnWidth(1, 600);
  sh.setRowHeight(1, 120);
}

function _moveSheetTo_(ss, name, pos) {
  const sh = ss.getSheetByName(name);
  if (!sh) return;
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(pos + 1);
}


// ============================================================
// 刷新隔日進貨單（filter: delivery_date == tomorrow）
// ============================================================
function refreshTomorrowDeliveries() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ⚡ 任務 4.1 補強：60 秒冷卻防連點
  const cd = _checkRefreshCooldown_('LAST_REFRESH_TOMORROW', 60);
  if (!cd.ok) {
    ui.alert('⏳ 剛剛已刷新',
      '剛才（' + cd.elapsed + ' 秒前）已刷新過了。\n\n' +
      '請等 ' + cd.wait + ' 秒後再試。\n\n' +
      '（避免短時間重複請求造成系統忙碌）',
      ui.ButtonSet.OK);
    return;
  }

  const storeName = _getStoreName_();
  const secret    = _getStoreSecret_();

  const tomorrow    = _addDays_(new Date(), 1);
  const tomorrowStr = Utilities.formatDate(tomorrow, TIMEZONE, 'yyyy-MM-dd');

  const orders   = _fetchStoreOrdersForList_(secret, storeName);
  const filtered = orders.filter(o => o.delivery_date === tomorrowStr);

  _writeOrdersToSheet_(ss, TAB_TOMORROW, filtered);
  _setRefreshCooldown_('LAST_REFRESH_TOMORROW');

  // 切到該分頁
  const sh = ss.getSheetByName(TAB_TOMORROW);
  if (sh) ss.setActiveSheet(sh);

  ui.alert('✅ 完成',
    '已刷新「' + TAB_TOMORROW + '」\n\n隔日（' + tomorrowStr + '）出貨筆數：' + filtered.length,
    ui.ButtonSet.OK);
}


// ============================================================
// 刷新所有進貨單（30 天）
// ============================================================
function refreshAllDeliveries() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ⚡ 任務 4.1 補強：60 秒冷卻防連點
  const cd = _checkRefreshCooldown_('LAST_REFRESH_ALL', 60);
  if (!cd.ok) {
    ui.alert('⏳ 剛剛已刷新',
      '剛才（' + cd.elapsed + ' 秒前）已刷新過了。\n\n' +
      '請等 ' + cd.wait + ' 秒後再試。\n\n' +
      '（避免短時間重複請求造成系統忙碌）',
      ui.ButtonSet.OK);
    return;
  }

  const storeName = _getStoreName_();
  const secret    = _getStoreSecret_();

  const orders = _fetchStoreOrdersForList_(secret, storeName);
  _writeOrdersToSheet_(ss, TAB_ALL, orders);
  _setRefreshCooldown_('LAST_REFRESH_ALL');

  const sh = ss.getSheetByName(TAB_ALL);
  if (sh) ss.setActiveSheet(sh);

  ui.alert('✅ 完成',
    '已刷新「' + TAB_ALL + '」\n\n最近 ' + ALL_ORDERS_DAYS + ' 天訂單筆數：' + orders.length,
    ui.ButtonSet.OK);
}


// ============================================================
// helper：拉訂單（merge 新系統 simple + 舊系統 legacy normal）
//   - sliding window: today - ALL_ORDERS_DAYS (90)
//   - 但 from 不早於 ALL_ORDERS_MIN_DATE (2026-04-01)，確保過渡期看得到 4 月所有舊單
//   - 8 月之後 sliding 會超過 4/1，4 月舊單自然從清單移除（要查可用「查單號明細」）
// ============================================================
function _fetchStoreOrdersForList_(secret, storeName) {
  const today = new Date();
  let fromD = _addDays_(today, -ALL_ORDERS_DAYS);
  // 不早於 ALL_ORDERS_MIN_DATE（過渡期 floor）
  const minD = new Date(ALL_ORDERS_MIN_DATE + 'T00:00:00');
  if (fromD < minD) fromD = minD;
  const fromStr = Utilities.formatDate(fromD, TIMEZONE, 'yyyy-MM-dd');

  // 1. 新系統：simple_sales_orders（4/22+ 的單）
  const simpleRows = _callRpc_('simple_get_store_orders', {
    p_api_secret: secret,
    p_store_name: storeName,
    p_date_from:  fromStr,
    p_date_to:    null
  });

  // 2. 舊系統：sales_orders 的正常單（4/1~4/21 的單）
  //    若 RPC 還沒部署或無資料，回 [] 不阻擋主流程
  let legacyRows = [];
  try {
    legacyRows = _callRpc_('get_legacy_store_orders', {
      p_api_secret: secret,
      p_store_name: storeName,
      p_date_from:  fromStr,
      p_date_to:    null
    });
  } catch (err) {
    Logger.log('legacy orders fetch failed (繼續用新系統資料)：' + err);
  }

  const all = [].concat(
    Array.isArray(simpleRows) ? simpleRows : [],
    Array.isArray(legacyRows) ? legacyRows : []
  );

  // order_no 去重（理論上不會撞，保險）
  const seen = {};
  const merged = [];
  for (let i = 0; i < all.length; i++) {
    const ono = String(all[i].order_no || '');
    if (!ono || seen[ono]) continue;
    seen[ono] = true;
    merged.push(all[i]);
  }

  return merged.map(r => ({
    order_no:      r.order_no || '',
    order_date:    r.order_date    ? String(r.order_date).slice(0, 10)    : '',
    delivery_date: r.delivery_date ? String(r.delivery_date).slice(0, 10) : '',
    total_qty:     r.total_qty || 0,
    total_amount:  r.total_amount != null ? Number(r.total_amount) : 0,
    status:        r.status || '',
    has_return:    !!r.has_return,
    return_status: r.return_status || '無',
    received_at:   r.received_at || '',
    is_draft:      !!r.is_draft
  })).sort((a, b) => {
    // order_date DESC（同日依 order_no DESC）
    if (a.order_date !== b.order_date) return a.order_date < b.order_date ? 1 : -1;
    return a.order_no < b.order_no ? 1 : -1;
  });
}

function _writeOrdersToSheet_(ss, tabName, orders) {
  const sh = ss.getSheetByName(tabName);
  if (!sh) throw new Error('找不到分頁「' + tabName + '」，請先跑「⚙️ 初始化分頁」');

  // 清掉舊資料（保留標題列）+ 清掉先前可能設的暫存單底色/字色
  if (sh.getLastRow() > 1) {
    const lastRow = sh.getLastRow();
    sh.getRange(2, 1, lastRow - 1, HEADERS_ORDER.length).clearContent();
    sh.getRange(2, 1, lastRow - 1, HEADERS_ORDER.length).setBackground('#ffffff');
    sh.getRange(2, 6, lastRow - 1, 1).setFontColor('#000000').setFontWeight('normal');
  }
  if (orders.length === 0) return;

  const rows = orders.map(o => [
    o.order_no,
    o.order_date,
    o.delivery_date,
    o.total_qty,
    o.total_amount,
    o.status,
    o.has_return ? o.return_status : '',
    o.received_at ? Utilities.formatDate(new Date(o.received_at), TIMEZONE, 'yyyy-MM-dd HH:mm') : '',
    ''
  ]);

  const range = sh.getRange(2, 1, rows.length, HEADERS_ORDER.length);
  range.setValues(rows).setFontSize(FONT_SIZE);

  // 強制 A/B/C 欄為文字（避免單號或日期被自動轉）
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('@');
  sh.getRange(2, 2, rows.length, 2).setNumberFormat('@');
  // E 欄金額
  sh.getRange(2, 5, rows.length, 1).setNumberFormat('#,##0');

  // ⚡ 任務 4.1 C 段：暫存單整列底色淡黃 (#fff8e1) + 狀態欄加粗紅
  //   先把所有列底色清成白色（避免上次的暫存色殘留到正式單）
  sh.getRange(2, 1, rows.length, HEADERS_ORDER.length).setBackground('#ffffff');
  for (let i = 0; i < orders.length; i++) {
    if (orders[i].is_draft) {
      sh.getRange(2 + i, 1, 1, HEADERS_ORDER.length).setBackground('#fff8e1');
      // F 欄 = 狀態欄（第 6 欄）強調
      sh.getRange(2 + i, 6).setFontColor('#e65100').setFontWeight('bold');
    } else {
      sh.getRange(2 + i, 6).setFontColor('#000000').setFontWeight('normal');
    }
  }
}


// ============================================================
// 刷新退貨紀錄（舊系統 sales_orders.order_type='return'，預設 90 天）
// ============================================================
function refreshReturnHistory() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const cd = _checkRefreshCooldown_('LAST_REFRESH_RETURNS', 60);
  if (!cd.ok) {
    ui.alert('⏳ 剛剛已刷新',
      '剛才（' + cd.elapsed + ' 秒前）已刷新過了。\n\n請等 ' + cd.wait + ' 秒後再試。',
      ui.ButtonSet.OK);
    return;
  }

  const storeName = _getStoreName_();
  const secret    = _getStoreSecret_();

  // 既有店家 sheet 已初始化過，但「退貨紀錄」是新分頁 → 自動補建
  _ensureReturnSheet_(ss, TAB_RETURN_HISTORY);

  const returns = _fetchReturnsLastNDays_(secret, storeName, RETURN_HISTORY_DAYS);
  _writeReturnsToSheet_(ss, TAB_RETURN_HISTORY, returns);
  _setRefreshCooldown_('LAST_REFRESH_RETURNS');

  const sh = ss.getSheetByName(TAB_RETURN_HISTORY);
  if (sh) ss.setActiveSheet(sh);

  ui.alert('✅ 完成',
    '已刷新「' + TAB_RETURN_HISTORY + '」\n\n最近 ' + RETURN_HISTORY_DAYS + ' 天退貨單筆數：' + returns.length,
    ui.ButtonSet.OK);
}

function _fetchReturnsLastNDays_(secret, storeName, days) {
  const today = new Date();
  const fromD = _addDays_(today, -days);
  const fromStr = Utilities.formatDate(fromD, TIMEZONE, 'yyyy-MM-dd');

  let rows = [];
  try {
    rows = _callRpc_('get_legacy_store_returns', {
      p_api_secret: secret,
      p_store_name: storeName,
      p_date_from:  fromStr,
      p_date_to:    null
    });
  } catch (err) {
    Logger.log('legacy returns fetch failed：' + err);
    throw err;  // 退貨紀錄這支沒備援，失敗就拋出讓 UI 顯示錯誤
  }

  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    return_no:     r.return_no || '',
    return_date:   r.return_date ? String(r.return_date).slice(0, 10) : '',
    total_qty:     r.total_qty || 0,
    return_amount: r.return_amount != null ? Number(r.return_amount) : 0,
    ref_order_no:  r.ref_order_no || '',
    note:          r.note || ''
  }));
}

function _writeReturnsToSheet_(ss, tabName, returns) {
  const sh = ss.getSheetByName(tabName);
  if (!sh) throw new Error('找不到分頁「' + tabName + '」，請先跑「⚙️ 初始化分頁」');

  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS_RETURN.length).clearContent();
    sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS_RETURN.length).setBackground('#ffffff');
  }
  if (returns.length === 0) return;

  const rows = returns.map(r => [
    r.return_no,
    r.return_date,
    r.total_qty,
    r.return_amount,
    r.ref_order_no,
    r.note
  ]);

  sh.getRange(2, 1, rows.length, HEADERS_RETURN.length).setValues(rows).setFontSize(FONT_SIZE);
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('@');  // 退貨單號文字
  sh.getRange(2, 2, rows.length, 1).setNumberFormat('@');  // 日期文字
  sh.getRange(2, 4, rows.length, 1).setNumberFormat('#,##0');  // 退貨金額
  sh.getRange(2, 5, rows.length, 1).setNumberFormat('@');  // 原銷貨單號文字
}


// ============================================================
// 開啟單號明細 sidebar
//   - 若 active cell 在訂單分頁 A 欄且是有效單號 → 直接開
//   - 否則跳 prompt 問
// ============================================================
function openOrderDetailsSidebar() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getActiveSheet();
  const cell = sh.getActiveCell();

  let orderNo = '';

  // 接受 3 個分頁：所有進貨單 / 隔日進貨單 / 退貨紀錄
  // 接受 3 種前綴：SS-（新單）/ SO（舊正常單）/ RT（舊退貨單）
  if (cell && cell.getColumn() === COL_ORDER_NO && cell.getRow() > 1
      && (sh.getName() === TAB_TOMORROW || sh.getName() === TAB_ALL || sh.getName() === TAB_RETURN_HISTORY)) {
    const v = String(cell.getValue() || '').trim();
    if (v) orderNo = v;
  }

  if (!orderNo) {
    const r = ui.prompt('🔍 查單號明細',
      '請輸入單號（如 SS-20260426-001 / SO20260415001 / RT20260415001）：',
      ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    orderNo = String(r.getResponseText() || '').trim();
  }

  if (!orderNo) {
    ui.alert('❌ 找不到單號',
      '單號為空。\n\n請先點選一筆訂單列的 A 欄，或在 prompt 輸入完整單號。',
      ui.ButtonSet.OK);
    return;
  }

  const tpl = HtmlService.createTemplateFromFile('StoreOrderSidebar');
  tpl.orderNo = orderNo;
  const html = tpl.evaluate()
    .setTitle('📦 ' + orderNo)
    .setWidth(900)
    .setHeight(650);
  SpreadsheetApp.getUi().showModelessDialog(html, '📦 單號明細：' + orderNo);
}


// ============================================================
// sidebar 用：取單號明細（主表 + 明細）
//   - SS- 開頭 → 走新系統 simple_get_order_details
//   - 其他（SO / RT）→ 走舊系統 get_legacy_order_details，sidebar 渲染為唯讀
// ============================================================
function getOrderDetailsForSidebar(orderNo) {
  if (!orderNo) {
    return JSON.stringify({ error: '單號為空' });
  }

  const isLegacy = (String(orderNo).indexOf('SS-') !== 0);  // 不是 SS- 開頭都當舊單

  const storeName = _getStoreName_();
  const secret    = _getStoreSecret_();

  // 1. 主表（從 _fetchStoreOrdersForList_ 找；同時涵蓋新單跟舊正常單）
  //    退貨單（RT）不在這個清單裡，要另外從 RPC get_legacy_order_main 讀
  const orders = _fetchStoreOrdersForList_(secret, storeName);
  let order = orders.filter(o => o.order_no === orderNo)[0];

  // 主表找不到 + 是舊單 → 直接呼叫 get_legacy_order_main 拉
  if (!order && isLegacy) {
    try {
      const main = _callRpc_('get_legacy_order_main', {
        p_api_secret: secret,
        p_order_no:   orderNo,
        p_store_name: storeName
      });
      if (main) {
        order = {
          order_no:      main.order_no || orderNo,
          status:        '歷史',
          order_date:    main.order_date ? String(main.order_date).slice(0, 10) : '',
          delivery_date: '',
          total_qty:     main.total_qty || 0,
          total_amount:  main.total_amount != null ? Number(main.total_amount) : 0,
          has_return:    false,
          return_status: '無',
          received_at:   '',
          is_draft:      false,
          ref_order_no:  main.ref_order_no || '',
          order_type:    main.order_type || 'normal',
          note:          main.note || ''
        };
      }
    } catch (err) {
      Logger.log('legacy main fetch failed (用 fallback)：' + err);
    }
  }

  // 還是找不到？最後 fallback（網路 / 越權 / 真的不存在）
  if (!order) {
    order = {
      order_no:      orderNo,
      status:        isLegacy ? '歷史' : '?',
      order_date:    '?',
      delivery_date: '',
      total_qty:     0,
      total_amount:  0,
      has_return:    false,
      return_status: '無',
      received_at:   '',
      is_draft:      false,
      _outOfRange:   true
    };
  }

  // 2. 明細：依 prefix 走不同 RPC
  let items = [];
  try {
    const rpcName = isLegacy ? 'get_legacy_order_details' : 'simple_get_order_details';
    const rows = _callRpc_(rpcName, {
      p_api_secret: secret,
      p_order_no:   orderNo,
      p_store_name: storeName
    });
    if (Array.isArray(rows)) items = rows;
  } catch (err) {
    return JSON.stringify({ error: '讀取明細失敗：' + err.message });
  }

  return JSON.stringify({ order: order, items: items, is_legacy: isLegacy });
}


// ============================================================
// sidebar 用：確認收貨
// ============================================================
function confirmReceivedFromSidebar(orderNo) {
  if (!orderNo) return JSON.stringify({ success: false, error: '單號為空' });
  const storeName = _getStoreName_();
  const secret    = _getStoreSecret_();
  const email     = (function () {
    try { return Session.getActiveUser().getEmail() || ''; } catch (_) { return ''; }
  })();

  try {
    const r = _callRpc_('simple_confirm_received', {
      p_payload: {
        api_secret:  secret,
        store_name:  storeName,
        order_no:    orderNo,
        received_by: email
      }
    });
    return JSON.stringify(r || { success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}


// ============================================================
// dialog 用：申請退貨
// ============================================================
function submitReturnFromSidebar(orderNo, detailId, returnQty, returnReason, reportType) {
  if (!orderNo)  return JSON.stringify({ success: false, error: '單號為空' });
  if (!detailId) return JSON.stringify({ success: false, error: '明細 ID 為空' });

  // 後端再驗一次（前端 JS 可能被繞過）
  const qty = parseInt(returnQty, 10);
  if (isNaN(qty) || qty < 1) {
    return JSON.stringify({ success: false, error: '退貨數量必須是 >= 1 的整數' });
  }
  if (['少','損','缺','退'].indexOf(reportType) < 0) {
    return JSON.stringify({ success: false, error: '退貨類型必須是 少/損/缺/退 其中之一' });
  }

  const storeName = _getStoreName_();
  const secret    = _getStoreSecret_();

  try {
    const r = _callRpc_('simple_submit_return_report', {
      p_payload: {
        api_secret:    secret,
        store_name:    storeName,
        order_no:      orderNo,
        detail_id:     detailId,
        return_qty:    qty,
        return_reason: returnReason || '',
        report_type:   reportType
      }
    });
    return JSON.stringify(r || { success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}


// ============================================================
// sidebar 用：撤銷收貨
// ============================================================
function revokeReceivedFromSidebar(orderNo) {
  if (!orderNo) return JSON.stringify({ success: false, error: '單號為空' });
  const storeName = _getStoreName_();
  const secret    = _getStoreSecret_();

  try {
    const r = _callRpc_('simple_revoke_received', {
      p_payload: {
        api_secret: secret,
        store_name: storeName,
        order_no:   orderNo
      }
    });
    return JSON.stringify(r || { success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}


