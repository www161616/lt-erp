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
  var email = Session.getActiveUser().getEmail().toLowerCase();
  var isAdmin = ADMIN_EMAILS.some(function(e) { return e.toLowerCase() === email; });
  var isPicker = PICKER_EMAILS.some(function(e) { return e.toLowerCase() === email; });

  if (isAdmin) {
    SpreadsheetApp.getUi().createMenu('🛠️ 開團管理')
      .addItem('📥 樂樂報表匯入（選店家）', 'showCsvDialog')
      .addSeparator()
      .addItem('📋 建立本月分頁', 'createCurrentMonthTab')
      .addItem('📋 建立指定月份分頁', 'createCustomMonthTab')
      .addItem('📦 從 ERP 匯入商品（指定結單日）', 'importProductsFromERP')
      .addItem('🎯 只同步全民（不動其他店）', 'syncQuanminOnly')
      .addSeparator()
      .addItem('📦 建立今日撿貨表', 'createTodayPickingSheet')
      .addItem('🔎 搜尋商品（加入撿貨表）', 'showPickingSearchSidebar')
      .addItem('📦 撿貨完成 → 一鍵建單', 'createSalesOrdersFromPicking')
      .addSeparator()
      .addItem('🔒 結單鎖定（指定結單日）', 'showLockDialog')
      .addItem('🔓 解除鎖定（指定結單日）', 'showUnlockDialog')
      .addSeparator()
      .addItem('🛡️ 設定欄位保護', 'setupColumnProtection')
      .addItem('📂 從 JSON 檔匯入（不需網路）', 'showJsonImportDialog')
      .addToUi();
  } else if (isPicker) {
    SpreadsheetApp.getUi().createMenu('🛠️ 撿貨工具')
      .addItem('📦 建立今日撿貨表', 'createTodayPickingSheet')
      .addItem('🔎 搜尋商品（加入撿貨表）', 'showPickingSearchSidebar')
      .addItem('📦 撿貨完成 → 一鍵建單', 'createSalesOrdersFromPicking')
      .addSeparator()
      .addItem('📥 樂樂報表匯入', 'showCsvDialog')
      .addToUi();
  } else {
    // 非 admin（含 email 讀不到的情況）都只顯示樂樂匯入
    SpreadsheetApp.getUi().createMenu('🛠️ 訂貨工具')
      .addItem('📥 樂樂報表匯入', 'showCsvDialog')
      .addToUi();
  }
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
