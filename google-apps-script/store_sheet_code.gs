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

const TAB_TOMORROW = '隔日進貨單';
const TAB_ALL      = '所有進貨單';
const TAB_TRANSFER = '店轉店';
const TAB_REQUEST  = '需求表';

const HEADERS_ORDER = ['單號','訂單日期','出貨日期','商品數','總金額','狀態','退貨狀態','收貨時間','備註'];
const COL_ORDER_NO  = 1;
const ALL_ORDERS_DAYS = 30;
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
    throw new Error('RPC ' + funcName + ' 失敗 (HTTP ' + code + ')：' + msg);
  }
  try { return JSON.parse(text); } catch (_) { return text; }
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
  _ensurePlaceholderSheet_(ss, TAB_TRANSFER, '🚧 店轉店功能開發中\n\n目前請繼續使用 branch_portal 網站處理店轉店。\n\n（任務 6 會做這個分頁的雙向同步）');
  _ensurePlaceholderSheet_(ss, TAB_REQUEST,  '🚧 需求表功能開發中\n\n目前請繼續使用 branch_portal 網站填寫需求表。\n\n（任務 7 會做這個分頁的雙向同步）');

  // 移除預設「工作表1」（如果空白）
  const def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() <= 1 && def.getLastColumn() <= 1) {
    try { ss.deleteSheet(def); } catch (_) {}
  }

  // 順序固定
  _moveSheetTo_(ss, TAB_TOMORROW, 0);
  _moveSheetTo_(ss, TAB_ALL,      1);
  _moveSheetTo_(ss, TAB_TRANSFER, 2);
  _moveSheetTo_(ss, TAB_REQUEST,  3);

  ui.alert('✅ 完成',
    '已建立 4 個分頁，店名：' + storeName +
    '\n\n下一步：\n  1. 點「📋 刷新所有進貨單」確認 RPC 連線\n  2. 點「🔄 刷新隔日進貨單」看明天要到的貨\n  3. 點任一單號 → 「🔍 查單號明細」確認收貨',
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

  const storeName = _getStoreName_();
  const secret    = _getStoreSecret_();

  const tomorrow    = _addDays_(new Date(), 1);
  const tomorrowStr = Utilities.formatDate(tomorrow, TIMEZONE, 'yyyy-MM-dd');

  const orders   = _fetchOrdersLast30Days_(secret, storeName);
  const filtered = orders.filter(o => o.delivery_date === tomorrowStr);

  _writeOrdersToSheet_(ss, TAB_TOMORROW, filtered);

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

  const storeName = _getStoreName_();
  const secret    = _getStoreSecret_();

  const orders = _fetchOrdersLast30Days_(secret, storeName);
  _writeOrdersToSheet_(ss, TAB_ALL, orders);

  const sh = ss.getSheetByName(TAB_ALL);
  if (sh) ss.setActiveSheet(sh);

  ui.alert('✅ 完成',
    '已刷新「' + TAB_ALL + '」\n\n最近 ' + ALL_ORDERS_DAYS + ' 天訂單筆數：' + orders.length,
    ui.ButtonSet.OK);
}


// ============================================================
// helper：拉 30 天內訂單
// ============================================================
function _fetchOrdersLast30Days_(secret, storeName) {
  const today = new Date();
  const fromD = _addDays_(today, -ALL_ORDERS_DAYS);

  const rows = _callRpc_('simple_get_store_orders', {
    p_api_secret: secret,
    p_store_name: storeName,
    p_date_from:  Utilities.formatDate(fromD, TIMEZONE, 'yyyy-MM-dd'),
    p_date_to:    null
  });

  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    order_no:      r.order_no || '',
    order_date:    r.order_date    ? String(r.order_date).slice(0, 10)    : '',
    delivery_date: r.delivery_date ? String(r.delivery_date).slice(0, 10) : '',
    total_qty:     r.total_qty || 0,
    total_amount:  r.total_amount != null ? Number(r.total_amount) : 0,
    status:        r.status || '',
    has_return:    !!r.has_return,
    return_status: r.return_status || '無',
    received_at:   r.received_at || ''
  }));
}

function _writeOrdersToSheet_(ss, tabName, orders) {
  const sh = ss.getSheetByName(tabName);
  if (!sh) throw new Error('找不到分頁「' + tabName + '」，請先跑「⚙️ 初始化分頁」');

  // 清掉舊資料（保留標題列）
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS_ORDER.length).clearContent();
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

  if (cell && cell.getColumn() === COL_ORDER_NO && cell.getRow() > 1
      && (sh.getName() === TAB_TOMORROW || sh.getName() === TAB_ALL)) {
    const v = String(cell.getValue() || '').trim();
    if (v && v.indexOf('SS-') === 0) orderNo = v;
  }

  if (!orderNo) {
    const r = ui.prompt('🔍 查單號明細',
      '請輸入單號（例如 SS-20260426-001）：',
      ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    orderNo = String(r.getResponseText() || '').trim();
  }

  if (!orderNo || orderNo.indexOf('SS-') !== 0) {
    ui.alert('❌ 找不到單號',
      '單號為空或格式錯誤（必須是 SS- 開頭）。\n\n請先點選一個訂單列的 A 欄，或在 prompt 輸入完整單號。',
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
// ============================================================
function getOrderDetailsForSidebar(orderNo) {
  if (!orderNo || String(orderNo).indexOf('SS-') !== 0) {
    return JSON.stringify({ error: '單號格式錯誤' });
  }

  const storeName = _getStoreName_();
  const secret    = _getStoreSecret_();

  // 1. 主表（從 30 天內 fetch 找）
  const orders = _fetchOrdersLast30Days_(secret, storeName);
  let order = orders.filter(o => o.order_no === orderNo)[0];

  // 主表不在 30 天內？只能顯示明細，主表用 fallback
  if (!order) {
    order = {
      order_no: orderNo,
      status: '?',
      order_date: '?',
      delivery_date: '',
      total_qty: 0,
      total_amount: 0,
      has_return: false,
      return_status: '無',
      received_at: '',
      _outOfRange: true
    };
  }

  // 2. 明細
  let items = [];
  try {
    const rows = _callRpc_('simple_get_order_details', {
      p_api_secret: secret,
      p_order_no:   orderNo,
      p_store_name: storeName
    });
    if (Array.isArray(rows)) items = rows;
  } catch (err) {
    return JSON.stringify({ error: '讀取明細失敗：' + err.message });
  }

  return JSON.stringify({ order: order, items: items });
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
