// ============================================================
// 📋 開團總表 — Google Apps Script（完整版）
// ============================================================
// 📌 使用前必做：
//   1. 修改 STORE_EMAILS — 填入每家店的 Google 帳號
//   2. 修改 ADMIN_EMAILS — 填入管理員帳號
//   3. 部署為網路應用程式（供 branch_admin 讀資料）
// ============================================================

// ==================== ⚙️ 設定區 ====================

const STORES = [
  '三峽', '中和', '文山', '四號', '永和', '忠順',
  '環球', '平鎮', '古華', '林口', '南平', '泰山',
  '萬華', '湖口', '經國', '松山', '全民', '龍潭'
];

const STORE_EMAILS = {
  '三峽': ["pspoqsq@gmail.com","a0226687133@gmail.com","ysc810512@gmail.com","anling591014@gmail.com","shinger1015@gmail.com","a3487210569@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '中和': ["ysc810512@gmail.com","meimeicyndi@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '文山': ["a0226687133@gmail.com","wcfluhu@gmail.com","galawoww@gmail.com","bao26266857@gmail.com","hlai023@gmail.com","lin070sume@gmail.com","yokomon85110@gmail.com","rae9677@gmail.com","jack33412@gmail.com","ferrari0814@gmail.com","www058688@gmail.com","a0976643757@gmail.com","www161616@gmail.com","jack8404ch@gmail.com","liangmo508@gmail.com","jack8404jack0102@gmail.com","hoconnie06@gmail.com","as0989730405@gmail.com","ysc810512@gmail.com","bao4287999@gmail.com","bao29393968@gmail.com","baozimananping@gmail.com","ds073667.lin@gmail.com","anling591014@gmail.com","ant702212@gmail.com","bao29383188@gmail.com","bao22264143@gmail.com","mama042300@gmail.com","pspoqsq@gmail.com","hsiehshuhsun@gmail.com","yokomon86120@gmail.com","shinger1015@gmail.com","meimeicyndi@gmail.com","jay19731228@hotmail.com","hkc738f@gmail.com","accc20080427@gmail.com","bao3586938@gmail.com","a3487210569@gmail.com"],
  '四號': ["clw650311@gmail.com","ysc810512@gmail.com","bao29393968@gmail.com","a0976643757@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '永和': ["hlai023@gmail.com","ysc810512@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '忠順': ["ecw750813@gmail.com","ysc810512@gmail.com","bao29393968@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '環球': ["ysc810512@gmail.com","ant702212@gmail.com","www161616@gmail.com","bao22264143@gmail.com"],
  '平鎮': ["as0989730405@gmail.com","ysc810512@gmail.com","bao4287999@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '古華': ["ysc810512@gmail.com","hkc738f@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '林口': ["hlai023@gmail.com","rae9677@gmail.com","ysc810512@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '南平': ["hoconnie06@gmail.com","ysc810512@gmail.com","bao3586938@gmail.com","baozimananping@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '泰山': ["feifei8279@gmail.com","jack33412@gmail.com","ysc810512@gmail.com","www161616@gmail.com","ant702212@gmail.com"],
  '萬華': ["hsiehshuhsun@gmail.com","ysc810512@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '湖口': ["wcfluhu@gmail.com","ysc810512@gmail.com","ant702212@gmail.com","www161616@gmail.com"],
  '經國': ["c90601189@gmail.com"],
  '松山': ["peiyuchi1002@gmail.com","www161616@gmail.com"],
  '全民': ["www058688@gmail.com"],
  '龍潭': []
};

const ADMIN_EMAILS = ['www161616@gmail.com', 'ant702212@gmail.com','ysc810512@gmail.com'];

// 撿貨員 email 白名單（admin 都可撿，加額外撿貨員 email 在這個陣列）
const PICKER_EMAILS = ADMIN_EMAILS.concat([
  // 之後填撿貨員 email
]);

// 任務 5：退貨待辦分頁名稱
const TAB_RETURN_PENDING = '🔁 退貨待辦';

// 任務 4.1：暫存銷貨單分頁名稱
const TAB_DRAFT_PENDING = '📝 暫存銷貨單';

const SB_URL = 'https://asugjynpocwygggttxyo.supabase.co/rest/v1';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWdqeW5wb2N3eWdnZ3R0eHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzU3MjksImV4cCI6MjA4ODk1MTcyOX0.LzcRQAl80rZxKKD8NIYWGvylfwCbs1ek5LtKpmZodBc';

const COL = {
  STATUS: 1,       // A: 狀態
  END_DATE: 2,     // B: 結單日
  PRODUCT_ID: 3,   // C: 商品編號
  PRODUCT_NAME: 4, // D: 商品名稱
  TOTAL_QTY: 5,    // E: 數量（合計）
  FIRST_STORE: 6   // F: 第一家店
};

// 表頭顏色（跟你原本的表一模一樣）
const COLORS = {
  GREEN: '#4CAF50',    // 狀態、商品編號、商品名稱
  RED: '#F44336',      // 結單日
  ORANGE: '#FF9800',   // 數量
  BLUE: '#42A5F5',     // 各店欄位
  WHITE: '#FFFFFF'
};


// ==================== 📋 選單 ====================

function onOpen() {
  // ⚠️ onOpen 是「簡單觸發器」，對非擁有者的個人 Gmail 取不到 email（Google 隱私限制）
  // 員工（ant702212/ysc810512）會踩到這個雷 → email='' → 走 else 分支只看到「訂貨工具」
  // 修法：取不到 email 時，預設顯示完整 admin 選單（員工 OR 真正擁有者都該看到全部）
  // 實際權限由 Sheet 共用編輯權限控制（沒被 share 的人連 sheet 都打不開）
  var email = '';
  try { email = Session.getActiveUser().getEmail().toLowerCase(); } catch (e) {}

  var isAdmin = email && ADMIN_EMAILS.some(function(e) { return e.toLowerCase() === email; });
  var isPicker = email && PICKER_EMAILS.some(function(e) { return e.toLowerCase() === email; });

  // email 取不到 → 當 admin 處理（員工 fallback）
  if (!email) isAdmin = true;

  if (isAdmin) {
    SpreadsheetApp.getUi().createMenu('🛠️ 開團管理')
      .addItem('── 開團前準備 ──', 'noopMenuLabel_')
      .addItem('📋 建立本月分頁', 'createCurrentMonthTab')
      .addItem('📋 建立指定月份分頁', 'createCustomMonthTab')
      .addItem('📦 從 ERP 匯入商品（指定結單日）', 'importProductsFromERP')
      .addItem('🎯 只同步全民（不動其他店）', 'syncQuanminOnly')
      .addSeparator()
      .addItem('── 撿貨員每日流程（依序執行）──', 'noopMenuLabel_')
      .addItem('① 📦 建立今日撿貨表', 'createTodayPickingSheet')
      .addItem('② 🔎 搜尋商品（加入撿貨表）', 'showPickingSearchSidebar')
      .addItem('③ 📦 撿貨完成 → 一鍵建單（轉暫存）', 'createSalesOrdersFromPicking')
      .addItem('④ 📝 刷新暫存銷貨單', 'refreshDraftOrders')
      .addItem('⑤ 🔧 編輯選定暫存單（先點某筆，可省略）', 'openDraftEditDialog')
      .addItem('⑥ ✅ 一鍵確認所有暫存單（轉正式）', 'finalizeAllDrafts')
      .addSeparator()
      .addItem('── 補開銷貨單（手動，直接正式）──', 'noopMenuLabel_')
      .addItem('📦 補開銷貨單（單店、多商品）', 'showManualSalesOrderDialog')
      .addSeparator()
      .addItem('── 退貨處理 ──', 'noopMenuLabel_')
      .addItem('🔁 刷新退貨待辦', 'refreshReturnPending')
      .addItem('🔧 處理選定退貨（先點某筆）', 'openReturnProcessDialog')
      .addSeparator()
      .addItem('── 其他工具 ──', 'noopMenuLabel_')
      .addItem('📥 樂樂報表匯入（選店家）', 'showCsvDialog')
      .addItem('🔒 結單鎖定（指定結單日）', 'showLockDialog')
      .addItem('🔓 解除鎖定（指定結單日）', 'showUnlockDialog')
      .addItem('🛡️ 設定欄位保護', 'setupColumnProtection')
      .addItem('📦 封存舊分頁（隱藏 N 天前）', 'archiveOldDailySheets')
      .addItem('📂 從 JSON 檔匯入（不需網路）', 'showJsonImportDialog')
      .addToUi();
  } else if (isPicker) {
    SpreadsheetApp.getUi().createMenu('🛠️ 撿貨工具')
      .addItem('── 每日流程（請依①~⑥順序執行）──', 'noopMenuLabel_')
      .addItem('① 📦 建立今日撿貨表', 'createTodayPickingSheet')
      .addItem('② 🔎 搜尋商品（加入撿貨表）', 'showPickingSearchSidebar')
      .addItem('③ 📦 撿貨完成 → 一鍵建單（轉暫存）', 'createSalesOrdersFromPicking')
      .addItem('④ 📝 刷新暫存銷貨單（自己的）', 'refreshDraftOrders')
      .addItem('⑤ 🔧 編輯選定暫存單（先點某筆，可省略）', 'openDraftEditDialog')
      .addItem('⑥ ✅ 一鍵確認所有暫存單（轉正式 → 店家可收貨）', 'finalizeAllDrafts')
      .addSeparator()
      .addItem('── 補開銷貨單（手動，直接正式）──', 'noopMenuLabel_')
      .addItem('📦 補開銷貨單（單店、多商品）', 'showManualSalesOrderDialog')
      .addSeparator()
      .addItem('── 補充工具 ──', 'noopMenuLabel_')
      .addItem('📥 樂樂報表匯入（店家用 LINE 傳時才用）', 'showCsvDialog')
      .addToUi();
  } else {
    // 非 admin（含 email 讀不到的情況）都只顯示樂樂匯入
    SpreadsheetApp.getUi().createMenu('🛠️ 訂貨工具')
      .addItem('📥 樂樂報表匯入', 'showCsvDialog')
      .addToUi();
  }
}


// 選單小標題的 no-op callback（誤點時跳輕量提示）
function noopMenuLabel_() {
  SpreadsheetApp.getUi().alert(
    'ℹ️ 這只是分組標題',
    '這列「── XXX ──」只是分組標題，不是功能按鈕。\n\n請點上下方有 ① ② ③ 編號或圖示的項目來執行操作。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}


// ==================== 📋 建立分頁 ====================

function createCurrentMonthTab() {
  var now = new Date();
  var yearMonth = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM');
  var sheet = createMonthTab_(yearMonth);
  SpreadsheetApp.getUi().alert('✅ 已建立分頁：' + yearMonth);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
}

function createCustomMonthTab() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('建立月份分頁', '請輸入月份（格式：2026-05）', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var yearMonth = response.getResponseText().trim();
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    ui.alert('❌ 格式不對，請用 YYYY-MM（例如 2026-05）');
    return;
  }
  var sheet = createMonthTab_(yearMonth);
  ui.alert('✅ 已建立分頁：' + yearMonth);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
}

/**
 * 建立月份分頁（只有表頭，資料由 importProductsFromERP 填入）
 */
function createMonthTab_(yearMonth) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName(yearMonth);
  if (existing) return existing;

  var sheet = ss.insertSheet(yearMonth);
  var headers = ['狀態', '結單日', '商品編號', '商品名稱', '數量'];
  headers = headers.concat(STORES);
  var totalCols = headers.length;

  // 寫入表頭
  sheet.getRange(1, 1, 1, totalCols).setValues([headers]);

  // === 表頭樣式（跟你原本的配色一模一樣） ===
  var headerRange = sheet.getRange(1, 1, 1, totalCols);
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  headerRange.setFontColor(COLORS.WHITE);

  // A 狀態 — 綠色
  sheet.getRange(1, COL.STATUS).setBackground(COLORS.GREEN);
  // B 結單日 — 紅色
  sheet.getRange(1, COL.END_DATE).setBackground(COLORS.RED);
  // C 商品編號 — 綠色
  sheet.getRange(1, COL.PRODUCT_ID).setBackground(COLORS.GREEN);
  // D 商品名稱 — 綠色
  sheet.getRange(1, COL.PRODUCT_NAME).setBackground(COLORS.GREEN);
  // E 數量 — 橘色
  sheet.getRange(1, COL.TOTAL_QTY).setBackground(COLORS.ORANGE);
  // F~ 各店 — 藍色
  sheet.getRange(1, COL.FIRST_STORE, 1, STORES.length).setBackground(COLORS.BLUE);

  // 凍結
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);

  // 欄寬
  sheet.setColumnWidth(COL.STATUS, 50);
  sheet.setColumnWidth(COL.END_DATE, 55);
  sheet.setColumnWidth(COL.PRODUCT_ID, 95);
  sheet.setColumnWidth(COL.PRODUCT_NAME, 250);
  sheet.setColumnWidth(COL.TOTAL_QTY, 50);
  for (var i = 0; i < STORES.length; i++) {
    sheet.setColumnWidth(COL.FIRST_STORE + i, 42);
  }

  return sheet;
}


// ==================== 📦 從 ERP 匯入商品（含數量） ====================

function importProductsFromERP() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var sheetName = sheet.getName();

  if (!/^\d{4}-\d{2}$/.test(sheetName)) {
    ui.alert('⚠️ 請先切到月份分頁（如 2026-04）再執行');
    return;
  }

  var tabMonth = parseInt(sheetName.split('-')[1]);

  // 1. 詢問結單日
  var dateRes = ui.prompt(
    '📦 從 ERP 匯入商品',
    '請輸入要匯入的結單日（格式：M/D，例如 4/20）\n\n' +
    '• 只會匯入該結單日的商品\n' +
    '• 其他日期的資料完全不碰\n' +
    '• 已存在的商品會自動跳過',
    ui.ButtonSet.OK_CANCEL
  );
  if (dateRes.getSelectedButton() !== ui.Button.OK) return;
  var inputDate = dateRes.getResponseText().trim();
  if (!inputDate) return;

  var normalizedTarget = normalizeDate_(inputDate);
  if (!/^\d{1,2}\/\d{1,2}$/.test(normalizedTarget)) {
    ui.alert('❌ 結單日格式不對，請用 M/D（例如 4/20）');
    return;
  }

  // 驗證結單日是否屬於目前月份分頁
  var inputMonth = parseInt(normalizedTarget.split('/')[0]);
  if (inputMonth !== tabMonth) {
    ui.alert('❌ 結單日「' + normalizedTarget + '」不屬於 ' + sheetName + '，\n請切到對應的月份分頁再匯入');
    return;
  }

  try {
    // 2. 讀 branchOrderList
    var listRes = UrlFetchApp.fetch(
      SB_URL + '/shared_kv?key=eq.branchOrderList&select=value',
      { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }
    );
    var listRaw = JSON.parse(listRes.getContentText());
    if (!listRaw || !listRaw.length) { ui.alert('❌ 找不到 branchOrderList'); return; }
    var orderList = typeof listRaw[0].value === 'string' ? JSON.parse(listRaw[0].value) : listRaw[0].value;
    if (!Array.isArray(orderList)) { ui.alert('❌ branchOrderList 格式不對'); return; }

    // 3. 篩選該結單日的商品
    var items = [];
    for (var i = 0; i < orderList.length; i++) {
      var item = orderList[i];
      if (!item) continue;
      var endDate = String(item.endDate || '').trim();
      if (!endDate) continue;
      if (normalizeDate_(endDate) !== normalizedTarget) continue;
      items.push(item);
    }

    if (items.length === 0) {
      ui.alert('⚠️ 結單日「' + normalizedTarget + '」在 branchOrderList 裡沒有任何商品');
      return;
    }

    // 4. 讀已存在的商品（B 結單日 + C 商品編號 → 去重 key）
    var lastRow = sheet.getLastRow();
    var existingKeys = {};
    if (lastRow >= 2) {
      var existingData = sheet.getRange(2, COL.END_DATE, lastRow - 1, 2).getValues();
      for (var e = 0; e < existingData.length; e++) {
        var existDate = normalizeDate_(String(existingData[e][0] || ''));
        var existPid = String(existingData[e][1] || '').trim();
        if (existPid) existingKeys[existPid + '|' + existDate] = true;
      }
    }

    // 5. 過濾掉已存在的商品
    var newItems = [];
    var skippedCount = 0;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var cleanPid = String(it.id || '').trim().replace(/_.*$/, '');
      if (existingKeys[cleanPid + '|' + normalizedTarget]) {
        skippedCount++;
        continue;
      }
      newItems.push(it);
    }

    if (newItems.length === 0) {
      ui.alert('✅ 結單日「' + normalizedTarget + '」的 ' + skippedCount + ' 筆商品都已經匯入過了，沒有新商品要加');
      return;
    }

    // 6. 組裝新資料（附加到最後，不清舊資料）
    var totalCols = 5 + STORES.length;
    var startRow = sheet.getLastRow() + 1;
    var rows = [];
    var formulas = [];
    var firstStoreCol = columnToLetter_(COL.FIRST_STORE);
    var lastStoreCol = columnToLetter_(COL.FIRST_STORE + STORES.length - 1);

    for (var j = 0; j < newItems.length; j++) {
      var nit = newItems[j];
      var npid = String(nit.id || '').trim().replace(/_.*$/, '');
      var nshort = toShortDate_(nit.endDate);
      var nstatus = (nit.status === 'closed') ? '已結' : '🟢開';

      var row = [nstatus, nshort, npid, nit.name || '', ''];
      for (var s = 0; s < STORES.length; s++) row.push(''); // 各店留空
      rows.push(row);

      var rowNum = startRow + j;
      formulas.push(['=SUM(' + firstStoreCol + rowNum + ':' + lastStoreCol + rowNum + ')']);
    }

    // 7. 補寫店家表頭（舊分頁可能沒有全民欄位）
    _ensureStoreHeaders_(sheet);

    // 8. 附加寫入（不清舊資料）
    sheet.getRange(startRow, 1, rows.length, totalCols).setValues(rows);
    sheet.getRange(startRow, COL.TOTAL_QTY, formulas.length, 1).setFormulas(formulas);

    // 9. 格式（字型 14pt、置中、SUM 數字格式）
    sheet.getRange(startRow, COL.TOTAL_QTY, rows.length, 1 + STORES.length).setNumberFormat('#,##0');
    sheet.getRange(startRow, 1, rows.length, totalCols).setHorizontalAlignment('center');
    sheet.getRange(startRow, COL.PRODUCT_NAME, rows.length, 1).setHorizontalAlignment('left');
    sheet.getRange(startRow, 1, rows.length, totalCols).setFontSize(14);

    var msg = '✅ 匯入完成！\n\n';
    msg += '結單日：' + normalizedTarget + '\n';
    msg += '新增：' + rows.length + ' 筆\n';
    if (skippedCount > 0) msg += '已存在跳過：' + skippedCount + ' 筆\n';
    msg += '分頁：' + sheetName;
    ui.alert(msg);

  } catch (err) {
    ui.alert('❌ 匯入失敗：' + err.toString());
  }
}

/**
 * 從 branchOrders 查找某店某商品的數量
 * 處理 key 格式不一致問題：先精確比對，再 cleanPid + 結單日比對
 */
function lookupQty_(branchOrders, storeName, rawId, cleanPid, shortDate) {
  var storeData = branchOrders[storeName];
  if (!storeData) return 0;

  // 1. 精確比對 rawId（如 "160203140_4/15"）
  if (storeData[rawId] !== undefined) {
    var v = parseInt(storeData[rawId]);
    return isNaN(v) ? 0 : v;
  }

  // 2. 試 cleanPid（純編號，如 "160203140"）
  if (storeData[cleanPid] !== undefined) {
    var v2 = parseInt(storeData[cleanPid]);
    return isNaN(v2) ? 0 : v2;
  }

  // 3. 遍歷所有 key，找 cleanPid 開頭 + 結單日匹配的
  if (shortDate) {
    var normalizedTarget = normalizeDate_(shortDate);
    for (var key in storeData) {
      var keyClean = key.replace(/_.*$/, '');
      if (keyClean === cleanPid) {
        // 取 key 的日期部分
        var underscoreIdx = key.indexOf('_');
        if (underscoreIdx > 0) {
          var keyDate = normalizeDate_(key.substring(underscoreIdx + 1));
          if (keyDate === normalizedTarget) {
            var v3 = parseInt(storeData[key]);
            return isNaN(v3) ? 0 : v3;
          }
        }
      }
    }
  }

  return 0;
}


// ==================== 📥 樂樂報表匯入 ====================

function showCsvDialog() {
  var html = HtmlService.createHtmlOutputFromFile('sidebar')
    .setWidth(440)
    .setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, '📥 樂樂報表匯入（選店家）');
}

function getStoreList() {
  var email = Session.getActiveUser().getEmail().toLowerCase();
  var isAdmin = ADMIN_EMAILS.some(function(e) { return e.toLowerCase() === email; });
  if (isAdmin) return JSON.stringify(STORES);
  // 店家：只回傳自己登記的店家（支援多店 supervisor）
  return JSON.stringify(_getStoresByEmail_(email));
}

function processCsvData(fileContent, selectedStore) {
  try {
    // 權限檢查：店家只能匯自己的店
    var email = Session.getActiveUser().getEmail().toLowerCase();
    var isAdmin = ADMIN_EMAILS.some(function(e) { return e.toLowerCase() === email; });
    if (!isAdmin) {
      var allowedStores = _getStoresByEmail_(email);
      if (allowedStores.indexOf(selectedStore) === -1) {
        return JSON.stringify({ success: false, error: '❌ 你只能匯入自己店家的資料' });
      }
    }

    var sheet = SpreadsheetApp.getActiveSheet();
    var lastCol = sheet.getLastColumn();
    if (lastCol < COL.FIRST_STORE) {
      return JSON.stringify({ success: false, error: '⚠️ 目前分頁沒有店家欄位' });
    }

    // 找該店的欄
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var storeColIndex = -1;
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).trim() === selectedStore) {
        storeColIndex = h + 1;
        break;
      }
    }
    if (storeColIndex === -1) {
      return JSON.stringify({ success: false, error: '❌ 找不到「' + selectedStore + '」欄位' });
    }

    // 解析 CSV
    var dataString = Utilities.newBlob(Utilities.base64Decode(fileContent)).getDataAsString('UTF-8');
    var csvData = Utilities.parseCsv(dataString);

    var quantities = {};
    var csvTotalQty = 0;

    for (var i = 1; i < csvData.length; i++) {
      var row = csvData[i];
      if (row.length < 10) continue;

      var qtyJ = parseInt(row[9]);
      if (isNaN(qtyJ)) qtyJ = 0;
      csvTotalQty += qtyJ;

      var nameB = row[1];
      var styleC = row[2];
      var productId = null;

      var matchB = nameB.match(/#(\d+)#/);
      if (matchB) {
        productId = matchB[1];
      } else {
        var matchC = styleC.match(/#(\d+)#/);
        if (matchC) productId = matchC[1];
      }

      if (productId) {
        productId = productId.trim();
        if (!quantities[productId]) quantities[productId] = 0;
        quantities[productId] += qtyJ;
      }
    }

    // 比對表格
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return JSON.stringify({ success: false, error: '⚠️ 沒有商品資料' });
    }

    var idValues = sheet.getRange(2, COL.PRODUCT_ID, lastRow - 1, 1).getValues();
    var storeValues = sheet.getRange(2, storeColIndex, lastRow - 1, 1).getValues();

    var updateCount = 0;
    var filledTotalQty = 0;
    var missingItems = [];
    var fullItems = [];

    for (var prodId in quantities) {
      var totalQty = quantities[prodId];
      var isFoundInTable = false;
      var isFilled = false;

      for (var r = 0; r < idValues.length; r++) {
        var cellVal = idValues[r][0];
        if (cellVal === '' || cellVal === null) continue;
        if (String(cellVal).trim() === String(prodId).trim()) {
          isFoundInTable = true;
          var currentVal = storeValues[r][0];
          if (currentVal === '' || currentVal === null || String(currentVal).trim() === '') {
            storeValues[r][0] = totalQty;
            updateCount++;
            isFilled = true;
            filledTotalQty += totalQty;
          }
          break;
        }
      }

      if (!isFoundInTable) {
        missingItems.push('編號: ' + prodId + ' (數量: ' + totalQty + ')');
      } else if (!isFilled) {
        fullItems.push('編號: ' + prodId + ' (已有數字，漏填: ' + totalQty + ')');
      }
    }

    if (updateCount > 0) {
      sheet.getRange(2, storeColIndex, lastRow - 1, 1).setValues(storeValues);
    }

    var alertMsg = '';
    var diff = csvTotalQty - filledTotalQty;
    if (diff !== 0) {
      alertMsg += '🚨 【數量核對】\nCSV 總量：' + csvTotalQty + '\n填入量：' + filledTotalQty + '\n差額：' + diff + '\n────────\n\n';
    }
    if (missingItems.length > 0) {
      alertMsg += '【找不到的編號】\n' + missingItems.join('\n') + '\n\n';
    }
    if (fullItems.length > 0) {
      alertMsg += '【已有數字】\n' + fullItems.join('\n') + '\n\n';
    }

    return JSON.stringify({ success: true, updateCount: updateCount, storeName: selectedStore, alertMsg: alertMsg });

  } catch (e) {
    return JSON.stringify({ success: false, error: '❌ ' + e.toString() });
  }
}

function showSystemAlert(msg) {
  SpreadsheetApp.getUi().alert('⚠️ 數量核對報告', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}


// ==================== 🔒 結單鎖定 / 解鎖 ====================

function showLockDialog() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('🔒 結單鎖定', '輸入結單日（如 4/18）\n鎖定後店家無法修改', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var endDate = response.getResponseText().trim();
  if (!endDate) return;
  lockEndDate_(endDate, true);
  ui.alert('✅ 已鎖定：' + endDate);
}

function showUnlockDialog() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('🔓 解除鎖定', '輸入結單日（如 4/18）', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var endDate = response.getResponseText().trim();
  if (!endDate) return;
  lockEndDate_(endDate, false);
  ui.alert('✅ 已解除：' + endDate);
}

function lockEndDate_(endDate, isLock) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var endDates = sheet.getRange(2, COL.END_DATE, lastRow - 1, 1).getValues();
  var statuses = sheet.getRange(2, COL.STATUS, lastRow - 1, 1).getValues();
  var normalizedTarget = normalizeDate_(endDate);
  var matchedRows = [];

  for (var i = 0; i < endDates.length; i++) {
    if (normalizeDate_(String(endDates[i][0])) === normalizedTarget) {
      matchedRows.push(i + 2);
      statuses[i][0] = isLock ? '已結' : '🟢開';
    }
  }

  sheet.getRange(2, COL.STATUS, lastRow - 1, 1).setValues(statuses);

  if (matchedRows.length === 0) {
    SpreadsheetApp.getUi().alert('⚠️ 找不到結單日「' + endDate + '」');
    return;
  }

  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  var lockPrefix = '🔒結單_' + normalizedTarget + '_';
  var validAdmins = ADMIN_EMAILS.filter(function(e) { return e && e.indexOf('@') > 0; });

  if (isLock) {
    for (var r = 0; r < matchedRows.length; r++) {
      var row = matchedRows[r];
      var range = sheet.getRange(row, COL.FIRST_STORE, 1, STORES.length);
      var protection = range.protect().setDescription(lockPrefix + 'row' + row);
      if (validAdmins.length > 0) protection.addEditors(validAdmins);
      var currentEditors = protection.getEditors();
      var adminSet = {};
      for (var a = 0; a < validAdmins.length; a++) adminSet[validAdmins[a].toLowerCase()] = true;
      for (var c = 0; c < currentEditors.length; c++) {
        var ce = currentEditors[c].getEmail().toLowerCase();
        if (!adminSet[ce]) { try { protection.removeEditor(currentEditors[c]); } catch(ex) {} }
      }
      protection.setWarningOnly(false);
    }
  } else {
    for (var p = 0; p < protections.length; p++) {
      if ((protections[p].getDescription() || '').indexOf(lockPrefix) === 0) {
        protections[p].remove();
      }
    }
  }
}


// ==================== 🛡️ 欄位保護 ====================

function setupColumnProtection() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = Math.max(sheet.getLastRow(), 500);

  var validAdmins = ADMIN_EMAILS.filter(function(e) { return e && e.indexOf('@') > 0; });
  if (validAdmins.length === 0) {
    ui.alert('❌ 請先填 ADMIN_EMAILS');
    return;
  }

  // 移除舊保護
  var existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  for (var e = 0; e < existing.length; e++) {
    if ((existing[e].getDescription() || '').indexOf('🛡️') === 0) {
      existing[e].remove();
    }
  }

  var missingEmails = [];
  var successCount = 0;

  for (var i = 0; i < STORES.length; i++) {
    var storeName = STORES[i];
    var rawEmails = STORE_EMAILS[storeName];
    var colIndex = COL.FIRST_STORE + i;

    var storeEmails = [];
    if (typeof rawEmails === 'string') {
      if (rawEmails.indexOf('@') > 0) storeEmails = [rawEmails];
    } else if (Array.isArray(rawEmails)) {
      storeEmails = rawEmails.filter(function(e) { return e && e.indexOf('@') > 0; });
    }

    // rawEmails 完全沒定義 = 忘了填 → 警告
    // rawEmails 是 [] = 刻意不給店家編輯（如全民）→ 只給 admin 編
    if (rawEmails === undefined) { missingEmails.push(storeName); continue; }

    var range = sheet.getRange(2, colIndex, lastRow - 1, 1);
    var protection = range.protect().setDescription('🛡️店欄_' + storeName);
    var allEditors = storeEmails.concat(validAdmins);
    protection.addEditors(allEditors);

    var allowedSet = {};
    for (var ae = 0; ae < allEditors.length; ae++) allowedSet[allEditors[ae].toLowerCase()] = true;
    var currentEditors = protection.getEditors();
    for (var ce = 0; ce < currentEditors.length; ce++) {
      var ceEmail = currentEditors[ce].getEmail().toLowerCase();
      if (!allowedSet[ceEmail]) { try { protection.removeEditor(currentEditors[ce]); } catch(ex) {} }
    }
    protection.setWarningOnly(false);
    successCount++;
  }

  // 保護前 5 欄
  var fixedRange = sheet.getRange(1, 1, lastRow, COL.TOTAL_QTY);
  var fixedProt = fixedRange.protect().setDescription('🛡️固定欄位');
  fixedProt.addEditors(validAdmins);
  var fixedEditors = fixedProt.getEditors();
  var adminSet2 = {};
  for (var va = 0; va < validAdmins.length; va++) adminSet2[validAdmins[va].toLowerCase()] = true;
  for (var fe = 0; fe < fixedEditors.length; fe++) {
    var feEmail = fixedEditors[fe].getEmail().toLowerCase();
    if (!adminSet2[feEmail]) { try { fixedProt.removeEditor(fixedEditors[fe]); } catch(ex) {} }
  }
  fixedProt.setWarningOnly(false);

  var msg = '✅ 已設定 ' + successCount + ' 家店的欄位保護';
  if (missingEmails.length > 0) msg += '\n\n⚠️ 未填 Email：' + missingEmails.join('、');
  ui.alert(msg);
}


// ==================== 🌐 Web App ====================

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getData';
  try {
    if (action === 'getMonths') return jsonResponse_(getAvailableMonths_());
    if (action === 'getStores') return jsonResponse_({ stores: STORES });
    if (action === 'getData') {
      var month = (e && e.parameter && e.parameter.month) || '';
      var endDate = (e && e.parameter && e.parameter.endDate) || '';
      return jsonResponse_(getSheetData_(month, endDate));
    }
    return jsonResponse_({ error: '未知 action' });
  } catch (err) {
    return jsonResponse_({ error: err.toString() });
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload.action === 'addProducts') {
      var result = addProducts(payload.products);
      return jsonResponse_(result);
    }
    return jsonResponse_({ error: '未知 action' });
  } catch (err) {
    return jsonResponse_({ error: err.toString() });
  }
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAvailableMonths_() {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  var months = [];
  for (var i = 0; i < sheets.length; i++) {
    if (/^\d{4}-\d{2}$/.test(sheets[i].getName())) months.push(sheets[i].getName());
  }
  months.sort().reverse();
  return { months: months };
}

function getSheetData_(month, filterEndDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!month) {
    var months = getAvailableMonths_().months;
    if (months.length === 0) return { error: '沒有月份分頁' };
    month = months[0];
  }
  var sheet = ss.getSheetByName(month);
  if (!sheet) return { error: '找不到：' + month };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { month: month, stores: STORES, rows: [] };

  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var rows = [];
  var normalizedFilter = filterEndDate ? normalizeDate_(filterEndDate) : '';

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (normalizedFilter && normalizeDate_(String(row[COL.END_DATE - 1])) !== normalizedFilter) continue;

    var rowObj = {
      status: row[COL.STATUS - 1] || '',
      endDate: String(row[COL.END_DATE - 1] || ''),
      productId: String(row[COL.PRODUCT_ID - 1] || ''),
      productName: String(row[COL.PRODUCT_NAME - 1] || ''),
      totalQty: row[COL.TOTAL_QTY - 1] || 0,
      stores: {}
    };
    for (var s = 0; s < STORES.length; s++) {
      var colIdx = COL.FIRST_STORE - 1 + s;
      rowObj.stores[STORES[s]] = (colIdx < row.length) ? (row[colIdx] || 0) : 0;
    }
    rows.push(rowObj);
  }

  return { month: month, stores: STORES, rows: rows, lastUpdated: new Date().toISOString() };
}


// ==================== 🔄 同步到 Supabase ====================

function syncToSupabase() {
  var ui = SpreadsheetApp.getUi();
  try {
    var sheet = SpreadsheetApp.getActiveSheet();
    var sheetName = sheet.getName();
    if (!/^\d{4}-\d{2}$/.test(sheetName)) {
      ui.alert('⚠️ 請先切到月份分頁');
      return;
    }

    var data = getSheetData_(sheetName, '');
    var branchOrdersFormat = {};

    for (var i = 0; i < data.rows.length; i++) {
      var row = data.rows[i];
      for (var s = 0; s < STORES.length; s++) {
        var store = STORES[s];
        var qty = row.stores[store] || 0;
        if (qty > 0) {
          if (!branchOrdersFormat[store]) branchOrdersFormat[store] = {};
          var key = row.productId;
          if (row.endDate) key = row.productId + '_' + normalizeDate_(row.endDate);
          branchOrdersFormat[store][key] = qty;
        }
      }
    }

    var payload = {
      key: 'sheetGroupBuyData',
      value: JSON.stringify({ month: sheetName, data: branchOrdersFormat, syncedAt: new Date().toISOString() })
    };

    UrlFetchApp.fetch(SB_URL + '/shared_kv', {
      method: 'post',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      payload: JSON.stringify(payload)
    });

    ui.alert('✅ 同步完成：' + data.rows.length + ' 筆，' + Object.keys(branchOrdersFormat).length + ' 家店');
  } catch (err) {
    ui.alert('❌ 同步失敗：' + err.toString());
  }
}


// ==================== 📤 新增商品（供 branch_admin POST） ====================

function addProducts(products) {
  if (!products || products.length === 0) return { success: false, error: '沒有商品' };

  var firstEnd = products[0].endDate || '';
  var yearMonth = getYearMonthFromEndDate_(firstEnd);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(yearMonth) || createMonthTab_(yearMonth);

  var lastRow = sheet.getLastRow();
  var existingIds = {};
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, COL.PRODUCT_ID, lastRow - 1, 1).getValues();
    var ends = sheet.getRange(2, COL.END_DATE, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      existingIds[String(ids[i][0]).trim() + '_' + normalizeDate_(String(ends[i][0]))] = true;
    }
  }

  var firstStoreColLetter = columnToLetter_(COL.FIRST_STORE);
  var lastStoreColLetter = columnToLetter_(COL.FIRST_STORE + STORES.length - 1);
  var totalCols = 5 + STORES.length;
  var newRows = [];

  for (var p = 0; p < products.length; p++) {
    var prod = products[p];
    var shortDate = toShortDate_(prod.endDate);
    var checkKey = String(prod.productId).trim() + '_' + normalizeDate_(shortDate);
    if (existingIds[checkKey]) continue;

    var row = ['', shortDate, prod.productId || '', prod.productName || '', ''];
    for (var s = 0; s < STORES.length; s++) row.push('');
    newRows.push(row);
    existingIds[checkKey] = true;
  }

  if (newRows.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, totalCols).setValues(newRows);
    // SUM 公式
    var formulas = [];
    for (var f = 0; f < newRows.length; f++) {
      var rn = startRow + f;
      formulas.push(['=SUM(' + firstStoreColLetter + rn + ':' + lastStoreColLetter + rn + ')']);
    }
    sheet.getRange(startRow, COL.TOTAL_QTY, formulas.length, 1).setFormulas(formulas);
  }

  return { success: true, added: newRows.length, sheet: yearMonth };
}


// ==================== 🔧 工具函式 ====================

function normalizeDate_(dateStr) {
  if (!dateStr) return '';
  // 支援 Sheet 的 Date 物件（getValues 對日期欄會回 Date）
  if (dateStr instanceof Date) {
    return (dateStr.getMonth() + 1) + '/' + dateStr.getDate();
  }
  dateStr = String(dateStr).trim();
  var m = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return parseInt(m[2]) + '/' + parseInt(m[3]);
  var m2 = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2) return parseInt(m2[1]) + '/' + parseInt(m2[2]);
  return dateStr;
}

function toShortDate_(dateStr) {
  if (!dateStr) return '';
  dateStr = String(dateStr).trim();
  var m = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return parseInt(m[2]) + '/' + parseInt(m[3]);
  var m2 = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2) return parseInt(m2[1]) + '/' + parseInt(m2[2]);
  return dateStr;
}

function getMonthFromDate_(dateStr) {
  if (!dateStr) return 0;
  var m = String(dateStr).match(/(\d{4})-(\d{1,2})/);
  if (m) return parseInt(m[2]);
  var m2 = String(dateStr).match(/^(\d{1,2})\//);
  if (m2) return parseInt(m2[1]);
  return 0;
}

function parseSortDate_(dateStr) {
  if (!dateStr) return 0;
  dateStr = String(dateStr).trim();
  var m = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])).getTime();
  var m2 = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2) return new Date(2026, parseInt(m2[1]) - 1, parseInt(m2[2])).getTime();
  return 0;
}

function getYearMonthFromEndDate_(endDate) {
  if (!endDate) return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  var m = String(endDate).match(/(\d{4})-(\d{2})/);
  if (m) return m[1] + '-' + m[2];
  var m2 = String(endDate).match(/^(\d{1,2})\//);
  if (m2) {
    var month = parseInt(m2[1]);
    return new Date().getFullYear() + '-' + (month < 10 ? '0' + month : month);
  }
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
}

/**
 * 確保店家表頭符合當前 STORES（舊分頁新增店家時補寫）
 * 重寫 F 欄起的表頭 + 補藍底白字 + 欄寬
 */
function _ensureStoreHeaders_(sheet) {
  var headerRange = sheet.getRange(1, COL.FIRST_STORE, 1, STORES.length);
  headerRange.setValues([STORES]);
  headerRange.setBackground(COLORS.BLUE);
  headerRange.setFontColor(COLORS.WHITE);
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  for (var i = 0; i < STORES.length; i++) {
    sheet.setColumnWidth(COL.FIRST_STORE + i, 42);
  }
}

/**
 * 依 email 查出該帳號登記在哪些店家（支援多店 supervisor）
 * @param {string} email 使用者 email（小寫）
 * @return {string[]} 店家名稱陣列，沒對上回傳 []
 */
function _getStoresByEmail_(email) {
  if (!email) return [];
  email = String(email).toLowerCase();
  var result = [];
  for (var store in STORE_EMAILS) {
    var emails = STORE_EMAILS[store];
    var list = Array.isArray(emails) ? emails : (typeof emails === 'string' ? [emails] : []);
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]).toLowerCase() === email) {
        result.push(store);
        break;
      }
    }
  }
  return result;
}

function columnToLetter_(col) {
  var letter = '';
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}


// ==================== 📂 從 JSON 檔匯入（不用 UrlFetch） ====================

function showJsonImportDialog() {
  var html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: 'Segoe UI', sans-serif; padding: 20px; text-align: center; }
      .box { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      h3 { margin-top: 0; }
      input[type="file"] { margin: 15px 0; }
      .btn { background: #4CAF50; color: white; border: none; padding: 12px 20px; border-radius: 8px; font-size: 15px; font-weight: bold; width: 100%; cursor: pointer; }
      .btn:disabled { background: #ccc; }
      #status { margin-top: 15px; font-weight: bold; white-space: pre-wrap; }
    </style>
    <div class="box">
      <h3>📂 匯入 erp_export.json</h3>
      <p style="color:#888;font-size:13px">先從 branch_admin Console 下載 JSON，再上傳到這裡</p>
      <input type="file" id="jsonFile" accept=".json" />
      <button class="btn" id="btn" onclick="doImport()">📦 開始匯入</button>
      <div id="status"></div>
    </div>
    <script>
      function doImport() {
        var f = document.getElementById('jsonFile');
        var s = document.getElementById('status');
        var b = document.getElementById('btn');
        if (!f.files.length) { s.innerText = '❌ 請選檔案'; s.style.color = 'red'; return; }
        s.innerText = '⏳ 讀取中...'; s.style.color = '#3498db'; b.disabled = true;
        var reader = new FileReader();
        reader.onload = function(e) {
          google.script.run
            .withSuccessHandler(function(msg) { s.innerText = msg; s.style.color = '#27ae60'; b.disabled = false; })
            .withFailureHandler(function(err) { s.innerText = '❌ ' + err; s.style.color = 'red'; b.disabled = false; })
            .importFromJsonString(e.target.result);
        };
        reader.readAsText(f.files[0]);
      }
    </script>
  `).setWidth(420).setHeight(320);
  SpreadsheetApp.getUi().showModalDialog(html, '📂 從 JSON 匯入');
}

function importFromJsonString(jsonString) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var sheetName = sheet.getName();
  if (!/^\d{4}-\d{2}$/.test(sheetName)) throw new Error('請先切到月份分頁（如 2026-04）');

  var sheetMonth = parseInt(sheetName.split('-')[1]);
  var data = JSON.parse(jsonString);
  var orderList = data.branchOrderList || [];
  var branchOrders = data.branchOrders || {};

  if (typeof orderList === 'string') orderList = JSON.parse(orderList);
  if (typeof branchOrders === 'string') branchOrders = JSON.parse(branchOrders);

  // 篩選本月 + 排序
  var items = [];
  for (var i = 0; i < orderList.length; i++) {
    var item = orderList[i];
    if (!item) continue;
    var endDate = String(item.endDate || '').trim();
    if (!endDate) continue;
    var month = getMonthFromDate_(endDate);
    if (month > 0 && month !== sheetMonth) continue;
    items.push(item);
  }

  items.sort(function(a, b) {
    return parseSortDate_(b.endDate) - parseSortDate_(a.endDate);
  });

  if (items.length === 0) throw new Error('這個月份沒有商品');

  // 組裝資料
  var totalCols = 5 + STORES.length;
  var rows = [];
  var formulas = [];
  var firstStoreCol = columnToLetter_(COL.FIRST_STORE);
  var lastStoreCol = columnToLetter_(COL.FIRST_STORE + STORES.length - 1);

  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    var rawId = String(it.id || '').trim();
    var cleanPid = rawId.replace(/_.*$/, '');
    var shortDate = toShortDate_(it.endDate);
    var status = (it.status === 'closed') ? '已結' : '開放';

    var row = [status, shortDate, cleanPid, it.name || '', ''];
    for (var s = 0; s < STORES.length; s++) {
      var qty = lookupQty_(branchOrders, STORES[s], rawId, cleanPid, shortDate);
      row.push(qty > 0 ? qty : '');
    }
    rows.push(row);
    formulas.push(['=SUM(' + firstStoreCol + (j + 2) + ':' + lastStoreCol + (j + 2) + ')']);
  }

  // 清除舊資料
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clear();

  // 補寫店家表頭
  _ensureStoreHeaders_(sheet);

  // 一次寫入
  sheet.getRange(2, 1, rows.length, totalCols).setValues(rows);
  sheet.getRange(2, COL.TOTAL_QTY, formulas.length, 1).setFormulas(formulas);

  // 格式
  sheet.getRange(2, COL.TOTAL_QTY, rows.length, 1 + STORES.length).setNumberFormat('#,##0');
  sheet.getRange(2, 1, rows.length, totalCols).setHorizontalAlignment('center');
  sheet.getRange(2, COL.PRODUCT_NAME, rows.length, 1).setHorizontalAlignment('left');
  // 字型 14pt（表頭 + 資料）
  sheet.getRange(1, 1, rows.length + 1, totalCols).setFontSize(14);

  return '✅ 匯入完成！共 ' + rows.length + ' 筆商品';
}


// ==================== 🎯 只同步全民（不動其他店） ====================
// 設計原則：
//   - 只讀 branchOrders['全民'] 的資料
//   - 只寫 V 欄（表頭 + 資料 + 14pt 字型）
//   - 其他欄位（A~U）完全不碰
//   - 切到目標月份分頁（如 2026-04）再按選單執行

function syncQuanminOnly() {
  var ui = SpreadsheetApp.getUi();
  var STORE_NAME = '全民';
  var storeIdx = STORES.indexOf(STORE_NAME);
  if (storeIdx === -1) {
    ui.alert('❌ STORES 陣列沒有「' + STORE_NAME + '」');
    return;
  }
  var colIndex = COL.FIRST_STORE + storeIdx; // V 欄

  var sheet = SpreadsheetApp.getActiveSheet();
  var sheetName = sheet.getName();
  if (!/^\d{4}-\d{2}$/.test(sheetName)) {
    ui.alert('⚠️ 請先切到月份分頁（如 2026-04）再執行');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('⚠️ 目前分頁沒有商品資料，請先匯入商品');
    return;
  }

  try {
    // 拉 branchOrders
    var ordersRes = UrlFetchApp.fetch(
      SB_URL + '/shared_kv?key=eq.branchOrders&select=value',
      { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }, muteHttpExceptions: true }
    );
    if (ordersRes.getResponseCode() !== 200) {
      ui.alert('❌ 拉 branchOrders 失敗（HTTP ' + ordersRes.getResponseCode() + '）');
      return;
    }
    var ordersRaw = JSON.parse(ordersRes.getContentText());
    var branchOrders = {};
    if (ordersRaw && ordersRaw.length) {
      branchOrders = typeof ordersRaw[0].value === 'string' ? JSON.parse(ordersRaw[0].value) : ordersRaw[0].value;
    }

    if (!branchOrders[STORE_NAME] || Object.keys(branchOrders[STORE_NAME]).length === 0) {
      ui.alert('⚠️ branchOrders 裡沒有「' + STORE_NAME + '」的資料');
      return;
    }

    // 寫 V 欄表頭（藍底白字，跟其他店一致）
    sheet.getRange(1, colIndex)
      .setValue(STORE_NAME)
      .setBackground(COLORS.BLUE)
      .setFontColor(COLORS.WHITE)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    sheet.setColumnWidth(colIndex, 42);

    // 讀 C 欄（商品編號）+ B 欄（結單日）
    var ids = sheet.getRange(2, COL.PRODUCT_ID, lastRow - 1, 1).getValues();
    var endDates = sheet.getRange(2, COL.END_DATE, lastRow - 1, 1).getValues();

    // 查數量 → 只組 V 欄
    var values = [];
    var filled = 0;
    for (var r = 0; r < ids.length; r++) {
      var rawId = String(ids[r][0] || '').trim();
      if (!rawId) { values.push(['']); continue; }
      var cleanPid = rawId.replace(/_.*$/, '');
      var shortDate = toShortDate_(String(endDates[r][0] || ''));
      var qty = lookupQty_(branchOrders, STORE_NAME, rawId, cleanPid, shortDate);
      if (qty > 0) {
        values.push([qty]);
        filled++;
      } else {
        values.push(['']);
      }
    }

    // 寫入 V 欄（只動這一欄）
    var dataRange = sheet.getRange(2, colIndex, values.length, 1);
    dataRange.setValues(values);
    dataRange.setNumberFormat('#,##0');
    dataRange.setHorizontalAlignment('center');

    // V 欄字型 14pt（表頭 + 資料）
    sheet.getRange(1, colIndex, values.length + 1, 1).setFontSize(14);

    ui.alert(
      '✅ 全民資料同步完成！\n\n' +
      '分頁：' + sheetName + '\n' +
      '填入筆數：' + filled + '\n\n' +
      '（V 欄以外的資料完全沒動）'
    );
  } catch (err) {
    ui.alert('❌ 失敗：' + err.toString());
  }
}


// ==================== 📦 一鍵建單（任務 2） ====================
// 流程：撿貨表-YYYY-MM-DD → 對每家有訂購的店呼叫 simple_create_sales_order RPC
//      → 寫入「當日銷貨單成立表-YYYY-MM-DD」
// 安全機制：
//   - PICKER_SECRET 從 Script Properties 讀（不寫進程式碼）
//   - 撿貨員 email 必須在 PICKER_EMAILS 內
//   - 重複建單由 DB 偵測（同店 + 同 wave_id）

function createSalesOrdersFromPicking() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var sheetName = sheet.getName();

  // ===== Step 0：前置檢查 =====
  // 0.1 分頁名稱
  var m = sheetName.match(/^撿貨表-(\d{4}-\d{2}-\d{2})$/);
  if (!m) {
    ui.alert('⚠️ 請先切到「撿貨表-YYYY-MM-DD」分頁再執行');
    return;
  }
  var orderDate = m[1];

  // 0.2 撿貨員 email
  var pickerEmail = Session.getActiveUser().getEmail();
  if (!pickerEmail) {
    ui.alert('❌ 抓不到您的 Google 帳號 email\n\n禁止建單，請聯絡管理員。');
    return;
  }

  // 0.3 PICKER_EMAILS 白名單
  var pickerEmailLower = pickerEmail.toLowerCase();
  var isPicker = PICKER_EMAILS.some(function(e) { return e.toLowerCase() === pickerEmailLower; });
  if (!isPicker) {
    ui.alert('❌ 您（' + pickerEmail + '）不在撿貨員白名單\n\n請聯絡管理員加入 PICKER_EMAILS。');
    return;
  }

  // 0.4 PICKER_SECRET
  var secret = PropertiesService.getScriptProperties().getProperty('PICKER_SECRET');
  if (!secret) {
    ui.alert('❌ Script Properties 未設定 PICKER_SECRET\n\n請聯絡管理員到 Apps Script「專案設定」設定。');
    return;
  }

  // ===== Step 1：確認彈窗 =====
  var deliveryDate = _addOneDay_(orderDate);
  var confirmRes = ui.alert(
    '📦 一鍵建單確認',
    '撿貨表：' + sheetName + '\n' +
    '撿貨員：' + pickerEmail + '\n' +
    '配送日：' + deliveryDate + '\n\n' +
    '會對「有訂購量 > 0」的店呼叫 RPC 建單。\n' +
    '價格由 DB 從 products 自動帶入（撿貨員不用填）。\n' +
    '同一張撿貨表已建過的店會自動跳過。\n\n' +
    '確定要建立銷貨單嗎？',
    ui.ButtonSet.OK_CANCEL
  );
  if (confirmRes !== ui.Button.OK) return;

  // ===== Step 2：讀撿貨表 =====
  var items = _readPickingSheet_(sheet);
  if (items.length === 0) {
    ui.alert('⚠️ 撿貨表沒有任何訂購資料（每店都是空白）');
    return;
  }

  // ===== Step 3：對每店組 payload + 呼叫 RPC =====
  var resultSheetName = '當日銷貨單成立表-' + orderDate;
  var results = [];
  for (var s = 0; s < STORES.length; s++) {
    var storeName = STORES[s];
    var storeItems = _filterItemsForStore_(items, storeName);
    if (storeItems.length === 0) continue;

    var payload = {
      api_secret:        secret,
      order_date:        orderDate,
      delivery_date:     deliveryDate,
      store_name:        storeName,
      wave_id:           sheetName,
      sheet_name:        sheetName,
      result_sheet_name: resultSheetName,
      picker_email:      pickerEmail,
      created_by_role:   'picker',
      items:             storeItems
    };

    var rpcRes = _callSimpleCreateOrder_(payload);
    results.push({ storeName: storeName, result: rpcRes, itemCount: storeItems.length });
  }

  // ===== Step 4：寫成立表 =====
  _writeResultSheet_(resultSheetName, results, pickerEmail, deliveryDate);

  // ===== Step 5：產生今日撿貨差額表（比對應撿 vs 實撿） =====
  var diffRows = _computeDiff_(items);
  var diffSheetName = '今日撿貨差額表-' + orderDate;
  if (diffRows.length > 0) {
    _writeDiffSheet_(orderDate, diffRows);
  }

  // ===== Step 6：摘要彈窗 =====
  var okCount = 0, dupCount = 0, failCount = 0, totalAmount = 0;
  var failDetails = [];
  for (var r = 0; r < results.length; r++) {
    var rr = results[r];
    if (rr.result.success) {
      okCount++;
      totalAmount += parseFloat(rr.result.total_amount) || 0;
    } else if (rr.result.duplicate) {
      dupCount++;
    } else {
      failCount++;
      failDetails.push(rr.storeName + '：' + (rr.result.error || '未知錯誤'));
    }
  }

  // 差額統計
  var diffSummary = _summarizeDiff_(diffRows);

  var msg = '✅ 一鍵建單完成\n\n';
  msg += '建單成功：' + okCount + ' 張\n';
  msg += '已建過跳過：' + dupCount + ' 店\n';
  msg += '失敗：' + failCount + ' 店\n';
  msg += '總金額：$' + totalAmount.toLocaleString() + '\n\n';
  msg += '結果：' + resultSheetName + '\n';
  if (diffRows.length > 0) {
    msg += '差額表：' + diffSheetName + '\n';
    msg += '  ✅ 持平：' + diffSummary.equal + ' 筆\n';
    msg += '  🔴 少給：' + diffSummary.shortage + ' 筆\n';
    msg += '  🟡 多給：' + diffSummary.surplus + ' 筆\n';
  }
  if (failDetails.length > 0) {
    msg += '\n失敗明細：\n' + failDetails.join('\n');
  }
  ui.alert(msg);
}


/**
 * 比對應撿 vs 實撿，產生差額列表
 * @return Array<{ pid, pname, store, expected, actual, diff }>
 */
function _computeDiff_(items) {
  var diffRows = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    // 收集所有「應撿或實撿」有值的店
    var allStores = {};
    for (var s in it.expectedByStore) allStores[s] = true;
    for (var s2 in it.qtyByStore) allStores[s2] = true;

    for (var store in allStores) {
      var expected = it.expectedByStore[store] || 0;
      var actual   = it.qtyByStore[store] || 0;
      if (expected === 0 && actual === 0) continue; // 都 0 跳過
      diffRows.push({
        pid:      it.productId,
        pname:    it.productName,
        store:    store,
        expected: expected,
        actual:   actual,
        diff:     actual - expected
      });
    }
  }
  return diffRows;
}


/** 差額統計（持平 / 少給 / 多給） */
function _summarizeDiff_(diffRows) {
  var s = { equal: 0, shortage: 0, surplus: 0 };
  for (var i = 0; i < diffRows.length; i++) {
    var d = diffRows[i].diff;
    if (d === 0) s.equal++;
    else if (d < 0) s.shortage++;
    else s.surplus++;
  }
  return s;
}


/**
 * 讀撿貨表內容
 * cell value = 實撿（撿貨員填的最終值）
 * cell note '應撿:N' = 應撿（加商品時帶入的訂購量）
 * @return Array<{ productId, productName, endDate, qtyByStore (實撿), expectedByStore (應撿) }>
 */
function _readPickingSheet_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var totalCols = COL.FIRST_STORE - 1 + STORES.length;
  var range = sheet.getRange(2, 1, lastRow - 1, totalCols);
  var data = range.getValues();
  var notes = range.getNotes();

  var items = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var noteRow = notes[i];
    var productId = String(row[COL.PRODUCT_ID - 1] || '').trim();
    if (!productId) continue;

    var productName = String(row[COL.PRODUCT_NAME - 1] || '').trim();
    var endDate = String(row[COL.END_DATE - 1] || '').trim();

    var qtyByStore = {};       // 實撿
    var expectedByStore = {};  // 應撿
    var hasAnyQty = false;

    for (var s = 0; s < STORES.length; s++) {
      var colIdx = COL.FIRST_STORE - 1 + s;
      var qty = parseInt(row[colIdx]);
      var expected = _parseExpectedFromNote_(noteRow[colIdx]);

      if (!isNaN(qty) && qty > 0) {
        qtyByStore[STORES[s]] = qty;
        hasAnyQty = true;
      }
      if (expected > 0) {
        expectedByStore[STORES[s]] = expected;
      }
    }

    if (!hasAnyQty && Object.keys(expectedByStore).length === 0) continue;

    items.push({
      productId:       productId,
      productName:     productName,
      endDate:         endDate,
      qtyByStore:      qtyByStore,
      expectedByStore: expectedByStore
    });
  }
  return items;
}


/** 篩出某店有訂購的 items，回傳 RPC 用的 items 陣列 */
function _filterItemsForStore_(items, storeName) {
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var qty = items[i].qtyByStore[storeName];
    if (!qty || qty <= 0) continue;
    out.push({
      product_id:   items[i].productId,
      product_name: items[i].productName,
      qty:          qty,
      end_date:     items[i].endDate
    });
  }
  return out;
}


/** 呼叫 simple_create_sales_order RPC，回傳統一格式 */
function _callSimpleCreateOrder_(payload) {
  try {
    var response = UrlFetchApp.fetch(SB_URL + '/rpc/simple_create_sales_order', {
      method: 'post',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ p_payload: payload }),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var text = response.getContentText();

    if (code === 200) {
      var parsed = JSON.parse(text);
      // RPC 回傳格式：{success, order_no, ...} 或 {success:false, duplicate:true, order_no, message}
      return parsed;
    }

    // 解析 PostgREST/PG 錯誤
    var errMsg = text;
    try {
      var errObj = JSON.parse(text);
      errMsg = errObj.message || errObj.hint || errObj.details || text;
    } catch (e) { /* 保留 raw text */ }
    return { success: false, error: errMsg };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}


/** 寫結果到「當日銷貨單成立表-YYYY-MM-DD」分頁（沒有就建立） */
function _writeResultSheet_(sheetName, results, pickerEmail, deliveryDate) {
  var sheet = _ensureResultSheet_(sheetName);

  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  var nowStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');

  var rows = [];
  for (var i = 0; i < results.length; i++) {
    var storeName = results[i].storeName;
    var res = results[i].result;

    if (res.success === true && !res.duplicate) {
      // ✅ 成功
      rows.push([
        nowStr, res.order_no, deliveryDate, storeName,
        res.total_qty || 0, res.total_amount || 0,
        '已建單', '無', pickerEmail, '', ''
      ]);
    } else if (res.duplicate === true) {
      // ⚠️ 已建過
      rows.push([
        nowStr, res.order_no || '', deliveryDate, storeName,
        '', '', '已建過', '', pickerEmail,
        res.message || '此撿貨表已為該店建過單', ''
      ]);
    } else {
      // ❌ 失敗
      rows.push([
        nowStr, '', deliveryDate, storeName,
        '', '', '失敗', '', pickerEmail,
        res.error || '未知錯誤', ''
      ]);
    }
  }

  if (rows.length === 0) return;

  var startRow = sheet.getLastRow() + 1;
  var totalCols = 11;
  sheet.getRange(startRow, 1, rows.length, totalCols).setValues(rows);

  // 樣式
  var dataRange = sheet.getRange(startRow, 1, rows.length, totalCols);
  dataRange.setFontSize(14);
  dataRange.setVerticalAlignment('middle');
  dataRange.setHorizontalAlignment('left');
  // 件數欄置中
  sheet.getRange(startRow, 5, rows.length, 1).setHorizontalAlignment('center');
  // 金額欄右對齊 + 千分位
  sheet.getRange(startRow, 6, rows.length, 1)
    .setHorizontalAlignment('right')
    .setNumberFormat('#,##0');
  // 配送日格式
  sheet.getRange(startRow, 3, rows.length, 1).setHorizontalAlignment('center');
}


/** 建立「當日銷貨單成立表」分頁（含表頭、14pt、欄寬） */
function _ensureResultSheet_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;

  sheet = ss.insertSheet(sheetName);
  var headers = ['建單時間','單號','配送日','店名','件數','金額','狀態','退貨狀態','撿貨員','錯誤訊息','列印連結'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(14);
  headerRange.setFontColor(COLORS.WHITE);
  headerRange.setBackground(COLORS.GREEN);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');

  sheet.setFrozenRows(1);

  // 欄寬
  sheet.setColumnWidth(1, 130);  // 建單時間
  sheet.setColumnWidth(2, 150);  // 單號
  sheet.setColumnWidth(3, 100);  // 配送日
  sheet.setColumnWidth(4, 80);   // 店名
  sheet.setColumnWidth(5, 70);   // 件數
  sheet.setColumnWidth(6, 100);  // 金額
  sheet.setColumnWidth(7, 80);   // 狀態
  sheet.setColumnWidth(8, 90);   // 退貨狀態
  sheet.setColumnWidth(9, 200);  // 撿貨員
  sheet.setColumnWidth(10, 250); // 錯誤訊息
  sheet.setColumnWidth(11, 90);  // 列印連結

  return sheet;
}


/** 'YYYY-MM-DD' 加一天 → 'YYYY-MM-DD' */
function _addOneDay_(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + 1);
  var y = d.getFullYear();
  var mo = String(d.getMonth() + 1);
  var da = String(d.getDate());
  if (mo.length < 2) mo = '0' + mo;
  if (da.length < 2) da = '0' + da;
  return y + '-' + mo + '-' + da;
}


// ==================== 📦 任務 2.5：建撿貨表 + 跨月搜尋 + 差額表 ====================
// workflow：
//   1. 撿貨員按「📦 建立今日撿貨表」→ 建空白撿貨表-YYYY-MM-DD（23 欄）
//   2. 按「🔎 搜尋商品」→ 右側 sidebar
//   3. 跨月份分頁搜尋 → 卡片清單 → 勾選 → 批次加入
//   4. 各店欄位寫入「應撿（訂購量）」+ setNote 存應撿備份
//   5. 列印 → 撿完回來 → 直接覆寫各店為實撿
//   6. 一鍵建單 → 自動產生「今日撿貨差額表」


/**
 * Step 1：建立今日撿貨表（空白）
 * 分頁名稱：撿貨表-YYYY-MM-DD（預設 today，admin/picker 可改）
 */
function createTodayPickingSheet() {
  var ui = SpreadsheetApp.getUi();
  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  var resp = ui.prompt(
    '📦 建立今日撿貨表',
    '請輸入撿貨日期（格式 YYYY-MM-DD）\n預設今天：' + todayStr,
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var input = resp.getResponseText().trim() || todayStr;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    ui.alert('❌ 日期格式不對，請用 YYYY-MM-DD（例如 ' + todayStr + '）');
    return;
  }

  var sheetName = '撿貨表-' + input;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName(sheetName);
  if (existing) {
    var goRes = ui.alert(
      '撿貨表已存在',
      '「' + sheetName + '」已經存在。\n要切到那個分頁繼續加商品嗎？',
      ui.ButtonSet.YES_NO
    );
    if (goRes === ui.Button.YES) ss.setActiveSheet(existing);
    return;
  }

  // 新建空白撿貨表
  var sheet = ss.insertSheet(sheetName);
  _formatPickingSheetHeader_(sheet);
  ss.setActiveSheet(sheet);

  ui.alert(
    '✅ 撿貨表建立完成\n\n' +
    '分頁：' + sheetName + '\n\n' +
    '下一步：點選單「🔎 搜尋商品（加入撿貨表）」打開右側面板，' +
    '搜尋今天到貨的商品並加入。'
  );
}


/**
 * 撿貨表表頭格式（23 欄：A 狀態 / B 結單日 / C 編號 / D 名稱 / E 合計 / F~W 18 家店）
 */
function _formatPickingSheetHeader_(sheet) {
  var headers = ['狀態', '結單日', '商品編號', '商品名稱', '合計'].concat(STORES);
  var totalCols = headers.length; // 5 + 18 = 23

  sheet.getRange(1, 1, 1, totalCols).setValues([headers]);

  var headerRange = sheet.getRange(1, 1, 1, totalCols);
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(14);
  headerRange.setFontColor(COLORS.WHITE);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');

  // 顏色（跟月份分頁一致）
  sheet.getRange(1, COL.STATUS).setBackground(COLORS.GREEN);
  sheet.getRange(1, COL.END_DATE).setBackground(COLORS.RED);
  sheet.getRange(1, COL.PRODUCT_ID).setBackground(COLORS.GREEN);
  sheet.getRange(1, COL.PRODUCT_NAME).setBackground(COLORS.GREEN);
  sheet.getRange(1, COL.TOTAL_QTY).setBackground(COLORS.ORANGE);
  sheet.getRange(1, COL.FIRST_STORE, 1, STORES.length).setBackground(COLORS.BLUE);

  // 凍結
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);

  // 欄寬
  sheet.setColumnWidth(COL.STATUS, 55);
  sheet.setColumnWidth(COL.END_DATE, 70);
  sheet.setColumnWidth(COL.PRODUCT_ID, 105);
  sheet.setColumnWidth(COL.PRODUCT_NAME, 280);
  sheet.setColumnWidth(COL.TOTAL_QTY, 65);
  for (var i = 0; i < STORES.length; i++) {
    sheet.setColumnWidth(COL.FIRST_STORE + i, 60);
  }

  // 套用內建篩選器（給商品搜尋用）
  sheet.getRange(1, 1, 1, totalCols).createFilter();
}


/**
 * Step 2：開啟右側 sidebar（搜尋商品 + 卡片勾選 + 批次加入）
 * 必須在「撿貨表-YYYY-MM-DD」分頁執行
 */
function showPickingSearchSidebar() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  if (!/^撿貨表-\d{4}-\d{2}-\d{2}$/.test(sheet.getName())) {
    ui.alert('⚠️ 請先切到「撿貨表-YYYY-MM-DD」分頁再開啟搜尋');
    return;
  }
  var html = HtmlService.createHtmlOutputFromFile('PickingSearchSidebar')
    .setTitle('🔎 搜尋商品 → 加入撿貨表')
    .setWidth(380);
  SpreadsheetApp.getUi().showSidebar(html);
}


/**
 * 跨月份分頁搜尋商品（給 sidebar 呼叫）
 * @param {string} keyword 搜尋關鍵字（編號 OR 名稱）
 * @return {string} JSON：[{ pid, name, endDate, monthSheet, qtyByStore: {...}, totalQty }]
 */
function searchProductsAcrossMonths(keyword) {
  if (!keyword) return JSON.stringify([]);
  var kw = String(keyword).trim().toLowerCase();
  if (!kw) return JSON.stringify([]);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var results = [];

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var name = sh.getName();
    if (!/^\d{4}-\d{2}$/.test(name)) continue; // 只掃月份分頁

    var lastRow = sh.getLastRow();
    if (lastRow < 2) continue;
    var totalCols = COL.FIRST_STORE - 1 + STORES.length;
    var data = sh.getRange(2, 1, lastRow - 1, totalCols).getValues();

    for (var r = 0; r < data.length; r++) {
      var row = data[r];
      var pid = String(row[COL.PRODUCT_ID - 1] || '').trim();
      if (!pid) continue;
      var pname = String(row[COL.PRODUCT_NAME - 1] || '').trim();

      // 比對關鍵字
      if (pid.toLowerCase().indexOf(kw) === -1 &&
          pname.toLowerCase().indexOf(kw) === -1) continue;

      // 結單日：用 normalizeDate_ 處理 Date 物件 / YYYY-MM-DD / M/D 都會變成 'M/D'
      var endDate = normalizeDate_(row[COL.END_DATE - 1]);
      var qtyByStore = {};
      var totalQty = 0;
      for (var s = 0; s < STORES.length; s++) {
        var qty = parseInt(row[COL.FIRST_STORE - 1 + s]);
        if (!isNaN(qty) && qty > 0) {
          qtyByStore[STORES[s]] = qty;
          totalQty += qty;
        }
      }

      // 跳過沒有任何訂購量的商品（避免員工誤勾空商品）
      if (totalQty <= 0) continue;

      results.push({
        pid: pid,
        name: pname,
        endDate: endDate,
        monthSheet: name,
        qtyByStore: qtyByStore,
        totalQty: totalQty
      });
    }
  }

  // 按結單日新到舊排序（同月份分頁內按列順序）
  results.sort(function(a, b) {
    return parseSortDate_(b.endDate) - parseSortDate_(a.endDate);
  });

  return JSON.stringify(results);
}


/**
 * Step 3：批次加入勾選的商品到撿貨表
 * @param {string} itemsJson JSON：[{ pid, name, endDate, qtyByStore }]
 * @return {string} JSON：{ added, skipped, message }
 */
function addPickedProductsToPickingSheet(itemsJson) {
  var sheet = SpreadsheetApp.getActiveSheet();
  if (!/^撿貨表-\d{4}-\d{2}-\d{2}$/.test(sheet.getName())) {
    return JSON.stringify({ added: 0, skipped: 0, message: '請切到撿貨表分頁' });
  }

  var items;
  try {
    items = JSON.parse(itemsJson);
  } catch (e) {
    return JSON.stringify({ added: 0, skipped: 0, message: 'JSON 格式錯誤' });
  }
  if (!items || items.length === 0) {
    return JSON.stringify({ added: 0, skipped: 0, message: '沒有勾選任何商品' });
  }

  var totalCols = 5 + STORES.length;
  var startRow = sheet.getLastRow() + 1;
  if (startRow < 2) startRow = 2;

  var rows = [];
  var notes = [];
  var formulas = [];
  var added = 0;

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.pid || !it.name) continue;

    var rowNum = startRow + rows.length;
    var rowData = [
      '🟢開',                       // A 狀態
      it.endDate || '',             // B 結單日
      it.pid,                       // C 編號
      it.name,                      // D 名稱
      ''                            // E 合計（之後設公式）
    ];
    var rowNotes = ['', '', '', '', ''];

    for (var s = 0; s < STORES.length; s++) {
      var storeQty = (it.qtyByStore && it.qtyByStore[STORES[s]]) || 0;
      if (storeQty > 0) {
        rowData.push(storeQty);              // 應撿（撿貨員之後可覆寫為實撿）
        rowNotes.push('應撿:' + storeQty);   // setNote 存原值
      } else {
        rowData.push('');
        rowNotes.push('');
      }
    }

    rows.push(rowData);
    notes.push(rowNotes);

    // E 合計公式：SUM(F:W)
    var firstStore = columnToLetter_(COL.FIRST_STORE);
    var lastStore = columnToLetter_(COL.FIRST_STORE + STORES.length - 1);
    formulas.push(['=SUM(' + firstStore + rowNum + ':' + lastStore + rowNum + ')']);
    added++;
  }

  if (rows.length === 0) {
    return JSON.stringify({ added: 0, skipped: items.length, message: '沒有有效資料' });
  }

  // 結單日欄強制 text 格式（避免 Google Sheet 把 '4/19' 自動轉成日期）
  sheet.getRange(startRow, COL.END_DATE, rows.length, 1).setNumberFormat('@');
  // 商品編號欄也強制 text（避免 360420123 被當成數字、可能科學記號）
  sheet.getRange(startRow, COL.PRODUCT_ID, rows.length, 1).setNumberFormat('@');

  // 一次寫入
  sheet.getRange(startRow, 1, rows.length, totalCols).setValues(rows);
  sheet.getRange(startRow, 1, rows.length, totalCols).setNotes(notes);
  sheet.getRange(startRow, COL.TOTAL_QTY, formulas.length, 1).setFormulas(formulas);

  // 格式
  var dataRange = sheet.getRange(startRow, 1, rows.length, totalCols);
  dataRange.setFontSize(14);
  dataRange.setHorizontalAlignment('center');
  sheet.getRange(startRow, COL.PRODUCT_NAME, rows.length, 1).setHorizontalAlignment('left');
  sheet.getRange(startRow, COL.TOTAL_QTY, rows.length, 1 + STORES.length).setNumberFormat('#,##0');

  return JSON.stringify({
    added: added,
    skipped: 0,
    message: '已加入 ' + added + ' 筆商品到撿貨表'
  });
}


/**
 * Step 5：寫今日撿貨差額表（一鍵建單成功後自動呼叫）
 * @param {string} pickingDate 撿貨日 YYYY-MM-DD（從 wave_id 取）
 * @param {Array} diffRows [{ pid, pname, store, expected, actual, diff }]
 */
function _writeDiffSheet_(pickingDate, diffRows) {
  if (!diffRows || diffRows.length === 0) return;

  var sheetName = '今日撿貨差額表-' + pickingDate;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var headers = ['商品編號', '商品名稱', '店名', '應撿', '實撿', '差額', '狀態'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(14);
    headerRange.setFontColor(COLORS.WHITE);
    headerRange.setBackground(COLORS.GREEN);
    headerRange.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 110);
    sheet.setColumnWidth(2, 280);
    sheet.setColumnWidth(3, 80);
    sheet.setColumnWidth(4, 70);
    sheet.setColumnWidth(5, 70);
    sheet.setColumnWidth(6, 70);
    sheet.setColumnWidth(7, 100);
  }

  // 重跑保護：每次重寫前先清掉舊資料（保留表頭）
  var oldLastRow = sheet.getLastRow();
  if (oldLastRow > 1) {
    sheet.getRange(2, 1, oldLastRow - 1, sheet.getLastColumn()).clearContent();
  }

  var rows = [];
  for (var i = 0; i < diffRows.length; i++) {
    var d = diffRows[i];
    var status = d.diff === 0 ? '✅ 持平' :
                 d.diff < 0 ? '🔴 少給 ' + (-d.diff) + ' 件' :
                 '🟡 多給 ' + d.diff + ' 件';
    rows.push([d.pid, d.pname, d.store, d.expected, d.actual, d.diff, status]);
  }

  if (rows.length === 0) return;

  sheet.getRange(2, 1, rows.length, 7).setValues(rows);
  var dataRange = sheet.getRange(2, 1, rows.length, 7);
  dataRange.setFontSize(14);
  dataRange.setHorizontalAlignment('center');
  sheet.getRange(2, 2, rows.length, 1).setHorizontalAlignment('left');
}


/** 從 cell note 解析應撿值（'應撿:N' → N）*/
function _parseExpectedFromNote_(noteText) {
  if (!noteText) return 0;
  var m = String(noteText).match(/應撿\s*[:：]\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}


// ============================================================
// 任務 5：退貨待辦處理（admin 限定）
// ============================================================

/** 取 Script Property: ADMIN_SECRET */
function _getAdminSecret_() {
  var v = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET');
  if (!v || String(v).trim().length === 0) {
    throw new Error('Script Properties「ADMIN_SECRET」未設定（請到專案設定 → 指令碼屬性新增）');
  }
  return String(v).trim();
}


/** 取 Script Property: PICKER_SECRET（任務 7B 補開銷貨單也需要） */
function _getPickerSecret_() {
  var v = PropertiesService.getScriptProperties().getProperty('PICKER_SECRET');
  if (!v || String(v).trim().length === 0) {
    throw new Error('Script Properties「PICKER_SECRET」未設定（請到專案設定 → 指令碼屬性新增）');
  }
  return String(v).trim();
}


/** 通用 RPC 呼叫（throws on error） */
function _callSimpleRpc_(funcName, body) {
  var response = UrlFetchApp.fetch(SB_URL + '/rpc/' + funcName, {
    method: 'post',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 300) {
    var msg = text;
    try { var j = JSON.parse(text); msg = j.message || j.hint || j.details || text; } catch (e) {}
    throw new Error('RPC ' + funcName + ' 失敗 (HTTP ' + code + ')：' + msg);
  }
  try { return JSON.parse(text); } catch (e) { return text; }
}


/** 刷新退貨待辦分頁 */
function refreshReturnPending() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var secret;
  try { secret = _getAdminSecret_(); }
  catch (err) { ui.alert('❌ 設定錯誤', err.message, ui.ButtonSet.OK); return; }

  var rows;
  try {
    rows = _callSimpleRpc_('simple_get_pending_returns', {
      p_admin_secret: secret,
      p_include_resolved: true
    });
    if (!Array.isArray(rows)) rows = [];
  } catch (err) {
    ui.alert('❌ 拉退貨待辦失敗', err.message, ui.ButtonSet.OK);
    return;
  }

  _writeReturnPendingSheet_(ss, rows);

  var sh = ss.getSheetByName(TAB_RETURN_PENDING);
  if (sh) ss.setActiveSheet(sh);

  var pendingCnt = 0, resolvedCnt = 0;
  for (var i = 0; i < rows.length; i++) {
    if (['申請中','同意'].indexOf(rows[i].return_status) >= 0) pendingCnt++;
    else resolvedCnt++;
  }

  ui.alert('✅ 完成',
    '已刷新「' + TAB_RETURN_PENDING + '」\n\n' +
    '  未結案：' + pendingCnt + ' 筆（申請中 / 同意）\n' +
    '  最近 30 天已結案：' + resolvedCnt + ' 筆\n\n' +
    '處理方式：點某筆 → 選單「🔧 處理選定退貨」',
    ui.ButtonSet.OK);
}


/** 確保退貨待辦分頁存在 */
function _ensureReturnPendingSheet_(ss) {
  var sh = ss.getSheetByName(TAB_RETURN_PENDING);
  if (sh) return sh;

  sh = ss.insertSheet(TAB_RETURN_PENDING);

  var headers = [
    '申請時間', '單號', '店名', '商品編號', '商品名稱',
    '訂購量', '類型', '退貨量', '原因', '狀態',
    '處理時間', 'admin 回應', 'detail_id'
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1565c0').setFontColor('#ffffff').setFontSize(13);
  sh.setFrozenRows(1);

  sh.setColumnWidth(1, 140); // 申請時間
  sh.setColumnWidth(2, 180); // 單號
  sh.setColumnWidth(3, 70);  // 店名
  sh.setColumnWidth(4, 110); // 商品編號
  sh.setColumnWidth(5, 220); // 商品名稱
  sh.setColumnWidth(6, 70);  // 訂購量
  sh.setColumnWidth(7, 60);  // 類型
  sh.setColumnWidth(8, 70);  // 退貨量
  sh.setColumnWidth(9, 250); // 原因
  sh.setColumnWidth(10, 80); // 狀態
  sh.setColumnWidth(11, 140); // 處理時間
  sh.setColumnWidth(12, 200); // admin 回應
  sh.setColumnWidth(13, 80);  // detail_id

  sh.hideColumns(13);  // 隱藏 detail_id 欄

  return sh;
}


/** 寫退貨資料 + 依狀態著色 */
function _writeReturnPendingSheet_(ss, rows) {
  var sh = _ensureReturnPendingSheet_(ss);

  if (sh.getLastRow() > 1) {
    var oldRange = sh.getRange(2, 1, sh.getLastRow() - 1, 13);
    oldRange.clearContent();
    oldRange.setBackground(null);
  }

  if (rows.length === 0) return;

  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  var data = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    data.push([
      r.return_reported_at ? Utilities.formatDate(new Date(r.return_reported_at), tz, 'yyyy-MM-dd HH:mm') : '',
      r.order_no || '',
      r.store_name || '',
      r.product_id || '',
      r.product_name || '',
      r.qty || 0,
      r.report_type || '',
      r.return_qty || 0,
      r.return_reason || '',
      r.return_status || '',
      r.return_resolved_at ? Utilities.formatDate(new Date(r.return_resolved_at), tz, 'yyyy-MM-dd HH:mm') : '',
      r.admin_response || '',
      r.detail_id || ''
    ]);
  }

  sh.getRange(2, 1, data.length, 13).setValues(data).setFontSize(13);
  // 強制單號、商品編號為文字格式
  sh.getRange(2, 2, data.length, 1).setNumberFormat('@');
  sh.getRange(2, 4, data.length, 1).setNumberFormat('@');

  // 依狀態著色
  for (var j = 0; j < rows.length; j++) {
    var status = rows[j].return_status;
    var bg = null;
    if (status === '申請中')      bg = '#ffebee'; // 紅底（最緊急）
    else if (status === '同意')   bg = '#fff3e0'; // 橘底（待寄回）
    else if (status === '拒絕')   bg = '#fafafa'; // 灰底
    else if (status === '已收到') bg = '#e8f5e9'; // 綠底
    else if (status === '免退')   bg = '#f3e5f5'; // 紫底
    if (bg) sh.getRange(j + 2, 1, 1, 13).setBackground(bg);
  }
}


/** 開退貨處理 dialog（從 active cell 取 detail_id） */
function openReturnProcessDialog() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getActiveSheet();

  if (sh.getName() !== TAB_RETURN_PENDING) {
    ui.alert('❌ 請在「' + TAB_RETURN_PENDING + '」分頁操作',
      '請先點下方分頁切到「' + TAB_RETURN_PENDING + '」，選一筆退貨後再點「🔧 處理選定退貨」。',
      ui.ButtonSet.OK);
    return;
  }

  var cell = sh.getActiveCell();
  if (!cell || cell.getRow() < 2) {
    ui.alert('❌ 沒選任何退貨', '請先點某一行（第 2 列以後）再點「🔧 處理選定退貨」', ui.ButtonSet.OK);
    return;
  }

  var rowNum = cell.getRow();
  var rowData = sh.getRange(rowNum, 1, 1, 13).getValues()[0];

  var detailId = rowData[12];
  if (!detailId) {
    ui.alert('❌ 此行無 detail_id', '請先點「🔁 刷新退貨待辦」重新載入', ui.ButtonSet.OK);
    return;
  }

  var status = rowData[9];
  if (['申請中', '同意'].indexOf(status) < 0) {
    ui.alert('❌ 此筆已結案',
      '狀態為「' + status + '」，admin 已處理完畢，無法再變更。',
      ui.ButtonSet.OK);
    return;
  }

  var info = {
    detail_id:          detailId,
    order_no:           rowData[1],
    store_name:         rowData[2],
    product_id:         rowData[3],
    product_name:       rowData[4],
    qty:                rowData[5],
    report_type:        rowData[6],
    return_qty:         rowData[7],
    return_reason:      rowData[8],
    return_status:      status,
    return_reported_at: rowData[0],
    admin_response:     rowData[11]
  };

  var tpl = HtmlService.createTemplateFromFile('ReturnProcessDialog');
  tpl.info = info;
  var html = tpl.evaluate().setWidth(900).setHeight(650);
  ui.showModelessDialog(html, '🔧 處理退貨：' + info.order_no + ' / ' + info.product_name);
}


/** dialog 用：執行退貨處理 RPC */
function processReturnFromDialog(detailId, action, adminResponse) {
  if (!detailId) return JSON.stringify({ success: false, error: 'detail_id 為空' });
  if (['同意','拒絕','已收到','免退'].indexOf(action) < 0) {
    return JSON.stringify({ success: false, error: '處理動作必須是 同意/拒絕/已收到/免退' });
  }

  var secret;
  try { secret = _getAdminSecret_(); }
  catch (err) { return JSON.stringify({ success: false, error: err.message }); }

  try {
    var r = _callSimpleRpc_('simple_admin_process_return', {
      p_payload: {
        admin_secret:   secret,
        detail_id:      detailId,
        action:         action,
        admin_response: adminResponse || ''
      }
    });
    return JSON.stringify(r || { success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}


// ============================================================
// 任務 4.1：暫存銷貨單流程（admin / picker 都可用）
// ============================================================
// 權限分流：
//   - admin：看全部暫存單（不傳 picker_email）
//   - picker：只看自己建的暫存單（傳 picker_email = Session.getActiveUser().getEmail()）
//   兩者共用 ADMIN_SECRET（在 Script Properties），靠 Apps Script 端做 UI 限制
// ============================================================

/** 判斷目前 user 是否 admin */
function _isCurrentUserAdmin_() {
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  return ADMIN_EMAILS.some(function (e) { return e.toLowerCase() === email; });
}


/**
 * 檢查暫存單操作權限：
 *   - 必須是暫存單（is_draft=true）
 *   - admin：可操作全部
 *   - 非 admin：只能操作 picker_email = 自己 email 的暫存單
 * @param {Object} order — order 物件（含 is_draft, picker_email）
 * @throws Error 如果權限不足或不是暫存單
 */
function _checkDraftOwnership_(order) {
  if (!order) throw new Error('單號不存在');
  if (!order.is_draft) throw new Error('此單已正式化，不允許編輯（要改只能走退貨流程）');
  if (!_isCurrentUserAdmin_()) {
    var myEmail = (Session.getActiveUser().getEmail() || '').toLowerCase();
    var ownerEmail = (order.picker_email || '').toLowerCase();
    if (myEmail !== ownerEmail) {
      throw new Error('權限不足：此暫存單由 ' + (order.picker_email || '?')
                    + ' 建立，您（非 admin）只能操作自己建的單');
    }
  }
}


/**
 * 撈暫存單 + 同時驗證權限（給 4 個變動 RPC 用）
 * @param {string} orderNo
 * @return {Object} order 物件
 * @throws Error 如果單不存在 / 不是暫存 / 權限不足
 */
function _assertDraftOrderAccess_(orderNo) {
  if (!orderNo) throw new Error('order_no 為空');
  var secret = _getAdminSecret_();
  var r = _callSimpleRpc_('simple_get_order_details_admin', {
    p_admin_secret: secret,
    p_order_no:     orderNo
  });
  if (!r || !r.order) throw new Error('單號 ' + orderNo + ' 不存在');
  _checkDraftOwnership_(r.order);
  return r.order;
}


/** 刷新暫存銷貨單分頁 */
function refreshDraftOrders() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var secret;
  try { secret = _getAdminSecret_(); }
  catch (err) { ui.alert('❌ 設定錯誤', err.message, ui.ButtonSet.OK); return; }

  var isAdmin = _isCurrentUserAdmin_();
  var pickerEmail = isAdmin ? null : (Session.getActiveUser().getEmail() || null);

  var rows;
  try {
    rows = _callSimpleRpc_('simple_get_draft_orders', {
      p_admin_secret: secret,
      p_picker_email: pickerEmail
    });
    if (!Array.isArray(rows)) rows = [];
  } catch (err) {
    ui.alert('❌ 拉暫存單失敗', err.message, ui.ButtonSet.OK);
    return;
  }

  _writeDraftSheet_(ss, rows);

  var sh = ss.getSheetByName(TAB_DRAFT_PENDING);
  if (sh) ss.setActiveSheet(sh);

  var scopeMsg = isAdmin ? '全部暫存單' : ('您（' + pickerEmail + '）的暫存單');
  ui.alert('✅ 完成',
    '已刷新「' + TAB_DRAFT_PENDING + '」\n\n' +
    '範圍：' + scopeMsg + '\n' +
    '筆數：' + rows.length + ' 張\n\n' +
    '處理方式：點某筆 → 選單「🔧 編輯選定暫存單」',
    ui.ButtonSet.OK);
}


/** 確保暫存單分頁存在 */
function _ensureDraftSheet_(ss) {
  var sh = ss.getSheetByName(TAB_DRAFT_PENDING);
  if (sh) return sh;

  sh = ss.insertSheet(TAB_DRAFT_PENDING);

  var headers = [
    '單號', '店家', '訂單日', '出貨日', '件數', '金額',
    '撿貨員', '建單時間', '撿貨表 wave_id'
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#fb8c00').setFontColor('#ffffff').setFontSize(13);
  sh.setFrozenRows(1);

  sh.setColumnWidth(1, 180); // 單號
  sh.setColumnWidth(2, 80);  // 店家
  sh.setColumnWidth(3, 110); // 訂單日
  sh.setColumnWidth(4, 110); // 出貨日
  sh.setColumnWidth(5, 70);  // 件數
  sh.setColumnWidth(6, 100); // 金額
  sh.setColumnWidth(7, 220); // 撿貨員
  sh.setColumnWidth(8, 140); // 建單時間
  sh.setColumnWidth(9, 200); // 撿貨表 wave_id

  return sh;
}


/** 寫暫存單資料 */
function _writeDraftSheet_(ss, rows) {
  var sh = _ensureDraftSheet_(ss);

  if (sh.getLastRow() > 1) {
    var oldRange = sh.getRange(2, 1, sh.getLastRow() - 1, 9);
    oldRange.clearContent();
    oldRange.setBackground(null);
  }

  if (rows.length === 0) return;

  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  var data = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    data.push([
      r.order_no || '',
      r.store_name || '',
      r.order_date || '',
      r.delivery_date || '',
      r.total_qty || 0,
      r.total_amount || 0,
      r.picker_email || '',
      r.created_at ? Utilities.formatDate(new Date(r.created_at), tz, 'yyyy-MM-dd HH:mm') : '',
      r.wave_id || ''
    ]);
  }

  sh.getRange(2, 1, data.length, 9).setValues(data).setFontSize(13);
  // 強制單號為文字
  sh.getRange(2, 1, data.length, 1).setNumberFormat('@');
  // 金額千分位
  sh.getRange(2, 6, data.length, 1).setNumberFormat('#,##0');
  // 整列淡黃底（暫存標示）
  sh.getRange(2, 1, data.length, 9).setBackground('#fff8e1');
}


/** 開暫存單編輯 dialog（從 active cell 取 order_no） */
function openDraftEditDialog() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getActiveSheet();

  if (sh.getName() !== TAB_DRAFT_PENDING) {
    ui.alert('❌ 請在「' + TAB_DRAFT_PENDING + '」分頁操作',
      '請先點下方分頁切到「' + TAB_DRAFT_PENDING + '」，選一筆暫存單後再點此項。',
      ui.ButtonSet.OK);
    return;
  }

  var cell = sh.getActiveCell();
  if (!cell || cell.getRow() < 2) {
    ui.alert('❌ 沒選任何暫存單', '請先點某一行（第 2 列以後）再點此項', ui.ButtonSet.OK);
    return;
  }

  var orderNo = String(sh.getRange(cell.getRow(), 1).getValue() || '').trim();
  if (!orderNo || orderNo.indexOf('SS-') !== 0) {
    ui.alert('❌ 此行無有效單號', '請先「📝 刷新暫存銷貨單」重新載入', ui.ButtonSet.OK);
    return;
  }

  var tpl = HtmlService.createTemplateFromFile('DraftOrderEditDialog');
  tpl.orderNo = orderNo;
  var html = tpl.evaluate().setWidth(900).setHeight(650);
  ui.showModelessDialog(html, '🔧 編輯暫存單：' + orderNo);
}


/** dialog 用：取暫存單明細
 *  - 暫存單 + ownership OK → 回 { order, items }
 *  - 已正式化 → 回 { finalized: true, order_no, order }（讓 dialog 顯示「看明細」按鈕）
 *  - 暫存但非 owner → 回 { error: 權限不足 }
 *  - 找不到 → 回 { error }
 */
function getDraftOrderForDialog(orderNo) {
  if (!orderNo) return JSON.stringify({ error: '單號為空' });
  var secret;
  try { secret = _getAdminSecret_(); }
  catch (err) { return JSON.stringify({ error: err.message }); }

  try {
    var r = _callSimpleRpc_('simple_get_order_details_admin', {
      p_admin_secret: secret,
      p_order_no:     orderNo
    });
    if (!r || !r.order) {
      return JSON.stringify({ error: '單號 ' + orderNo + ' 不存在' });
    }

    // ⚡ 已正式化 → 回特殊 response（不擋，讓 dialog 顯示「看明細」按鈕）
    if (!r.order.is_draft) {
      return JSON.stringify({
        finalized: true,
        order_no:  orderNo,
        order:     r.order
      });
    }

    // 暫存單 → ownership 檢查
    if (!_isCurrentUserAdmin_()) {
      var myEmail = (Session.getActiveUser().getEmail() || '').toLowerCase();
      var ownerEmail = (r.order.picker_email || '').toLowerCase();
      if (myEmail !== ownerEmail) {
        return JSON.stringify({
          error: '權限不足：此暫存單由 ' + (r.order.picker_email || '?')
                 + ' 建立，您（非 admin）只能操作自己建的單'
        });
      }
    }

    return JSON.stringify(r);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}


/** dialog 用：改某筆品項數量（含 ownership 檢查）*/
function updateDraftQtyFromDialog(orderNo, detailId, newQty) {
  try { _assertDraftOrderAccess_(orderNo); }
  catch (err) { return JSON.stringify({ success: false, error: err.message }); }

  var secret = _getAdminSecret_();
  var editedBy = Session.getActiveUser().getEmail() || '';
  try {
    var r = _callSimpleRpc_('simple_update_draft_qty', {
      p_admin_secret: secret,
      p_order_no:     orderNo,
      p_detail_id:    detailId,
      p_new_qty:      newQty,
      p_edited_by:    editedBy
    });
    return JSON.stringify(r || { success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}


/** dialog 用：刪某筆品項（含 ownership 檢查）*/
function deleteDraftDetailFromDialog(orderNo, detailId) {
  try { _assertDraftOrderAccess_(orderNo); }
  catch (err) { return JSON.stringify({ success: false, error: err.message }); }

  var secret = _getAdminSecret_();
  var editedBy = Session.getActiveUser().getEmail() || '';
  try {
    var r = _callSimpleRpc_('simple_delete_draft_detail', {
      p_admin_secret: secret,
      p_order_no:     orderNo,
      p_detail_id:    detailId,
      p_edited_by:    editedBy
    });
    return JSON.stringify(r || { success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}


/** dialog 用：暫存 → 正式（含 ownership 檢查）*/
function finalizeOrderFromDialog(orderNo) {
  try { _assertDraftOrderAccess_(orderNo); }
  catch (err) { return JSON.stringify({ success: false, error: err.message }); }

  var secret = _getAdminSecret_();
  var finalizedBy = Session.getActiveUser().getEmail() || '';
  try {
    var r = _callSimpleRpc_('simple_finalize_order', {
      p_admin_secret: secret,
      p_order_no:     orderNo,
      p_finalized_by: finalizedBy
    });
    return JSON.stringify(r || { success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}


/** dialog 用：砍整張暫存單（含 ownership 檢查）*/
function voidDraftOrderFromDialog(orderNo) {
  try { _assertDraftOrderAccess_(orderNo); }
  catch (err) { return JSON.stringify({ success: false, error: err.message }); }

  var secret = _getAdminSecret_();
  var voidedBy = Session.getActiveUser().getEmail() || '';
  try {
    var r = _callSimpleRpc_('simple_void_draft_order', {
      p_admin_secret: secret,
      p_order_no:     orderNo,
      p_voided_by:    voidedBy
    });
    return JSON.stringify(r || { success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}


/** 一鍵確認所有暫存單（admin 確認全部、picker 確認自己的） */
function finalizeAllDrafts() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var secret;
  try { secret = _getAdminSecret_(); }
  catch (err) { ui.alert('❌ 設定錯誤', err.message, ui.ButtonSet.OK); return; }

  var isAdmin = _isCurrentUserAdmin_();
  var pickerEmail = isAdmin ? null : (Session.getActiveUser().getEmail() || null);
  var finalizedBy = Session.getActiveUser().getEmail() || '';

  // 先撈暫存單清單
  var rows;
  try {
    rows = _callSimpleRpc_('simple_get_draft_orders', {
      p_admin_secret: secret,
      p_picker_email: pickerEmail
    });
    if (!Array.isArray(rows)) rows = [];
  } catch (err) {
    ui.alert('❌ 拉暫存單失敗', err.message, ui.ButtonSet.OK);
    return;
  }

  if (rows.length === 0) {
    ui.alert('沒有暫存單可確認', isAdmin ? '目前沒有任何暫存單' : '您目前沒有暫存單', ui.ButtonSet.OK);
    return;
  }

  var orderNos = rows.map(function (r) { return r.order_no; });

  var scopeMsg = isAdmin ? '全部暫存單' : '您建的暫存單';
  var confirmRes = ui.alert('確認送出 ' + rows.length + ' 張暫存單？',
    '範圍：' + scopeMsg + '\n' +
    '筆數：' + rows.length + ' 張\n\n' +
    '⚠️ 確認後變正式單，店家可確認收貨 / 退貨。確認後不能撤銷。\n\n' +
    '繼續？',
    ui.ButtonSet.YES_NO);

  if (confirmRes !== ui.Button.YES) return;

  try {
    var r = _callSimpleRpc_('simple_finalize_orders_batch', {
      p_admin_secret: secret,
      p_order_nos:    orderNos,
      p_finalized_by: finalizedBy
    });
    ui.alert('✅ 完成',
      '請求 ' + (r.requested || rows.length) + ' 張，'
      + '成功確認 ' + (r.finalized || 0) + ' 張。\n\n'
      + '請點「📝 刷新暫存銷貨單」確認列表清空。',
      ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('❌ 確認失敗', err.message, ui.ButtonSet.OK);
  }
}


// ============================================================
// 任務 7B：員工手動補開銷貨單（admin / picker 都可用）
// ============================================================
// 流程：
//   1. 點「📦 補開銷貨單」→ 開 dialog
//   2. dialog 選店家、搜商品（products 表）、加多筆品項、改數量
//   3. 送出 → simple_create_sales_order RPC（is_draft=false 直接正式）
//   4. wave_id 留 NULL（不偵測重複）
// ============================================================

/** 開「📦 補開銷貨單」dialog */
function showManualSalesOrderDialog() {
  var ui = SpreadsheetApp.getUi();

  // 權限檢查：admin OR picker 都可
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  var isAdmin  = ADMIN_EMAILS.some(function (e) { return e.toLowerCase() === email; });
  var isPicker = PICKER_EMAILS.some(function (e) { return e.toLowerCase() === email; });
  if (!isAdmin && !isPicker) {
    ui.alert('❌ 權限不足',
      '此功能僅限 admin 或撿貨員白名單使用。\n\n您（' + email + '）不在名單內。',
      ui.ButtonSet.OK);
    return;
  }

  // 預檢 PICKER_SECRET + ADMIN_SECRET 都要存在
  // （建單 RPC 用 picker_secret 驗，搜商品 RPC 用 admin_secret 驗）
  try {
    _getPickerSecret_();    // 沒設會 throw
    _getAdminSecret_();     // 沒設會 throw
  } catch (err) {
    ui.alert('❌ 設定錯誤', err.message, ui.ButtonSet.OK);
    return;
  }

  var tpl = HtmlService.createTemplateFromFile('ManualSalesOrderDialog');
  tpl.stores      = STORES;
  tpl.pickerEmail = email;
  var html = tpl.evaluate().setWidth(900).setHeight(700);
  ui.showModelessDialog(html, '📦 補開銷貨單');
}


/** dialog 用：搜尋 products（用 admin_secret） */
function searchProductsForManualOrder(keyword) {
  var k = String(keyword || '').trim();
  if (k.length < 1) return JSON.stringify([]);

  var secret;
  try { secret = _getAdminSecret_(); }
  catch (err) { return JSON.stringify({ error: err.message }); }

  try {
    var rows = _callSimpleRpc_('simple_search_products', {
      p_admin_secret: secret,
      p_keyword:      k,
      p_limit:        30
    });
    return JSON.stringify(Array.isArray(rows) ? rows : []);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}


/**
 * dialog 用：補開銷貨單
 * @param {string} storeName - 店家名稱
 * @param {string} orderDate - YYYY-MM-DD
 * @param {string} deliveryDate - YYYY-MM-DD（可空字串）
 * @param {Array}  items     - [{ product_id, product_name, qty }]
 * @param {string} notes     - 備註（可空）
 */
function createManualSalesOrderFromDialog(storeName, orderDate, deliveryDate, items, notes) {
  var pickerEmail = Session.getActiveUser().getEmail() || '';
  if (!pickerEmail) {
    return JSON.stringify({ success: false, error: '抓不到您的 Google 帳號 email' });
  }

  // 前端驗證
  if (!storeName || STORES.indexOf(storeName) < 0) {
    return JSON.stringify({ success: false, error: '請選擇有效店家' });
  }
  if (!orderDate || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
    return JSON.stringify({ success: false, error: '訂單日格式錯誤（YYYY-MM-DD）' });
  }
  if (deliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    return JSON.stringify({ success: false, error: '出貨日格式錯誤（YYYY-MM-DD 或留空）' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return JSON.stringify({ success: false, error: '請至少加一筆商品' });
  }
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.product_id || !it.product_name) {
      return JSON.stringify({ success: false, error: '第 ' + (i + 1) + ' 筆商品資料不完整' });
    }
    var q = parseInt(it.qty, 10);
    if (isNaN(q) || q <= 0) {
      return JSON.stringify({ success: false, error: '第 ' + (i + 1) + ' 筆數量必須 > 0' });
    }
    items[i].qty = q;
  }

  var secret;
  try { secret = _getPickerSecret_(); }
  catch (err) { return JSON.stringify({ success: false, error: err.message }); }

  try {
    var r = _callSimpleRpc_('simple_create_sales_order', {
      p_payload: {
        api_secret:      secret,
        order_date:      orderDate,
        delivery_date:   deliveryDate || null,
        store_name:      storeName,
        wave_id:         null,                  // 補開單不用 wave_id（不偵測重複）
        is_draft:        false,                 // ⚡ 直接正式單，不走暫存
        picker_email:    pickerEmail,
        created_by_role: 'manual',
        source:          'manual_supplement',
        notes:           String(notes || '').trim() || null,
        items:           items
      }
    });
    return JSON.stringify(r || { success: true });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}


// ============================================================
// 📦 封存舊分頁（admin 限定 — 把 N 天前的舊每日分頁隱藏起來）
// ============================================================
// 對象：撿貨表-YYYY-MM-DD / 當日銷貨單成立表-YYYY-MM-DD / 今日撿貨差額表-YYYY-MM-DD
// 動作：sheet.hideSheet()（不刪除）
// 還原：右鍵任一分頁標籤 → 顯示 → 選名稱
// ============================================================

function archiveOldDailySheets() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    '📦 封存舊分頁',
    '封存幾天前的舊分頁？預設 3 天\n\n' +
    '會【隱藏】（不刪除）以下類型分頁：\n' +
    '  • 撿貨表-YYYY-MM-DD\n' +
    '  • 當日銷貨單成立表-YYYY-MM-DD\n' +
    '  • 今日撿貨差額表-YYYY-MM-DD\n\n' +
    '隱藏後可右鍵任一分頁標籤 → 顯示 → 選名稱還原',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var input = resp.getResponseText().trim();
  var days = parseInt(input || '3');
  if (isNaN(days) || days < 1) {
    ui.alert('❌ 天數必須是 >= 1 的整數');
    return;
  }

  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var todayMs  = new Date(todayStr + 'T00:00:00').getTime();
  var cutoffMs = todayMs - days * 86400000;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var patterns = [
    /^撿貨表-(\d{4}-\d{2}-\d{2})$/,
    /^當日銷貨單成立表-(\d{4}-\d{2}-\d{2})$/,
    /^今日撿貨差額表-(\d{4}-\d{2}-\d{2})$/
  ];

  var hidden = [];
  var skipped = [];
  var failed  = [];

  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    var dateStr = null;
    for (var p = 0; p < patterns.length; p++) {
      var m = name.match(patterns[p]);
      if (m) { dateStr = m[1]; break; }
    }
    if (!dateStr) continue;  // 不符規則的分頁跳過（如 2026-04 / 退貨待辦）

    var sheetMs = new Date(dateStr + 'T00:00:00').getTime();
    if (sheetMs >= cutoffMs) {
      skipped.push(name);
      continue;
    }
    if (sheets[i].isSheetHidden()) {
      skipped.push(name + '（已隱藏）');
      continue;
    }

    try {
      sheets[i].hideSheet();
      hidden.push(name);
    } catch (e) {
      failed.push(name + '：' + e.message);
    }
  }

  var msg = '✅ 已封存 ' + hidden.length + ' 個分頁（' + days + ' 天前）\n\n';
  if (hidden.length > 0) {
    msg += '【封存清單】\n  ' + hidden.slice(0, 15).join('\n  ');
    if (hidden.length > 15) msg += '\n  ... 共 ' + hidden.length + ' 個';
    msg += '\n\n';
  }
  if (failed.length > 0) {
    msg += '【失敗】\n  ' + failed.join('\n  ') + '\n\n';
  }
  msg += '【還原方式】\n右鍵任一分頁標籤 → 顯示 → 選名稱';

  ui.alert(msg);
}
