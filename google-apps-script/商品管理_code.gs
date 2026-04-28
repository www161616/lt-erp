// ============================================================
// 📦 商品管理 — 16staff 撿貨表新分頁
// ============================================================
// 用途：員工內部商品工作清單
//   1. 從開團總表（17f4...）抓某結單日的商品 → 對 products 比對 → 補資料
//   2. 補完成本 / 售價 / 分店價 / 廠商 → 同步回 products
//   3. 也支援搜尋 products 補單筆商品
//
// 設計：
//   - 商品管理 分頁 hidden + protected by ADMIN_EMAILS
//   - PK = 編號，匯入不覆蓋已存在編號（避免洗掉員工本地修改）
//   - Sheet 為主，同步時 UPSERT 到 products
//
// 依賴：
//   - SB_URL / SB_KEY / ADMIN_EMAILS 從 16staff_lookup_code.gs 來
//   - _callSimpleRpc_ / _getAdminSecret_ 從 16staff_lookup_code.gs 來（共用 helper）
//   - upsert_product_admin / search_products_admin / get_products_by_ids_admin RPC
//     （見 2026-04-30_product_admin_rpc.sql + 2026-04-30_get_products_by_ids_admin.sql）
//   - admin_secret 必須存在 Script Properties（key = ADMIN_SECRET）
// ============================================================
// 建立日期：2026-04-30
// ============================================================


// ==================== ⚙️ 設定區 ====================

// 開團總表 Spreadsheet ID（員工建商品的那份 Sheet）
const GROUP_BUY_SHEET_ID = '17f4ExKk89H4Mx-Jo_waNmUkg_D2qydLVc2wwgyLjhWw';

// 商品管理 分頁名稱
const TAB_PRODUCT_MGMT = '商品管理';

// 開團總表月份分頁的欄位（跟 開團總表_code.gs 一致）
const GB_COL = {
  STATUS: 1,
  END_DATE: 2,
  PRODUCT_ID: 3,
  PRODUCT_NAME: 4
  // E 之後是 合計 + 各店訂購量，這裡用不到
};

// 商品管理 分頁欄位
const PM_COL = {
  END_DATE:     1,   // A: 結單日（記錄最後一次 import 來源）
  PRODUCT_ID:   2,   // B: 編號
  NAME:         3,   // C: 名稱
  PRICE:        4,   // D: 售價
  COST:         5,   // E: 成本
  PRICE_BRANCH: 6,   // F: 分店價
  UNIT:         7,   // G: 單位
  SUPPLIER:     8,   // H: 廠商
  STATUS:       9,   // I: 狀態
  COMPARE:     10,   // J: 比對結果
  SYNCED_AT:   11,   // K: 最後同步時間
  NOTE:        12    // L: 備註
};

const PM_HEADERS = [
  '結單日', '編號', '名稱', '售價', '成本', '分店價',
  '單位', '廠商', '狀態', '比對結果', '最後同步時間', '備註'
];

const PM_TOTAL_COLS = PM_HEADERS.length;


// （選單由 16staff_lookup_code.gs onOpen 直接整合到「🛠️ 開團管理」menu）


// ==================== 🔧 初次設定 ====================

function pmSetupSheet() {
  if (!_pmCheckAdmin_()) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TAB_PRODUCT_MGMT);
  var ui = SpreadsheetApp.getUi();

  if (sheet) {
    var resp = ui.alert('⚠️ 「商品管理」分頁已存在', '要重新設定表頭與保護嗎？\n（不會清除既有資料）', ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) return;
  } else {
    sheet = ss.insertSheet(TAB_PRODUCT_MGMT);
  }

  // 表頭
  sheet.getRange(1, 1, 1, PM_TOTAL_COLS).setValues([PM_HEADERS])
       .setFontWeight('bold')
       .setBackground('#1565c0')
       .setFontColor('#ffffff')
       .setHorizontalAlignment('center')
       .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 28);

  // 欄寬
  sheet.setColumnWidth(PM_COL.END_DATE, 70);
  sheet.setColumnWidth(PM_COL.PRODUCT_ID, 110);
  sheet.setColumnWidth(PM_COL.NAME, 260);
  sheet.setColumnWidth(PM_COL.COST, 70);
  sheet.setColumnWidth(PM_COL.PRICE, 70);
  sheet.setColumnWidth(PM_COL.PRICE_BRANCH, 70);
  sheet.setColumnWidth(PM_COL.UNIT, 50);
  sheet.setColumnWidth(PM_COL.SUPPLIER, 100);
  sheet.setColumnWidth(PM_COL.STATUS, 60);
  sheet.setColumnWidth(PM_COL.COMPARE, 110);
  sheet.setColumnWidth(PM_COL.SYNCED_AT, 140);
  sheet.setColumnWidth(PM_COL.NOTE, 200);

  // 凍結首列
  sheet.setFrozenRows(1);

  // 數值格式（D 售價 / E 成本 / F 分店價）
  sheet.getRange(2, PM_COL.PRICE, 2000, 3).setNumberFormat('#,##0.##');
  sheet.getRange(2, PM_COL.SYNCED_AT, 2000, 1).setNumberFormat('yyyy-mm-dd hh:mm');

  // 狀態欄資料驗證：啟用 / 停用
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['啟用', '停用'], true)
    .setAllowInvalid(false)
    .setHelpText('狀態必須是「啟用」或「停用」')
    .build();
  sheet.getRange(2, PM_COL.STATUS, 2000, 1).setDataValidation(rule);

  // 保護分頁：只有 ADMIN_EMAILS 能編
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (var i = 0; i < protections.length; i++) protections[i].remove();
  var protection = sheet.protect();
  protection.setDescription('商品管理 — 限員工專用');
  // 移除其他編輯者，只留當前所有者 + ADMIN_EMAILS
  var owners = protection.getEditors();
  for (var j = 0; j < owners.length; j++) {
    var oe = owners[j].getEmail().toLowerCase();
    var keep = ADMIN_EMAILS.some(function(a) { return a.toLowerCase() === oe; });
    if (!keep && oe !== Session.getEffectiveUser().getEmail().toLowerCase()) {
      try { protection.removeEditor(owners[j]); } catch (e) {}
    }
  }
  for (var k = 0; k < ADMIN_EMAILS.length; k++) {
    try { protection.addEditor(ADMIN_EMAILS[k]); } catch (e) {}
  }

  // 隱藏分頁（員工可在「所有工作表」找到）
  sheet.hideSheet();

  ui.alert(
    '✅ 「商品管理」分頁已設定完成\n\n' +
    '• 表頭、欄寬、資料驗證、保護、隱藏 都設好了\n' +
    '• 只有 ADMIN_EMAILS 能編輯\n\n' +
    '下一步：\n' +
    '  1. View → 顯示隱藏的工作表 → 商品管理（要看時）\n' +
    '  2. 用「📥 匯入指定結單日商品」開始第一次匯入'
  );
}


// ==================== 📥 匯入指定結單日商品 ====================

function pmImportByEndDate() {
  if (!_pmCheckAdmin_()) return;
  var ui = SpreadsheetApp.getUi();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pmSheet = ss.getSheetByName(TAB_PRODUCT_MGMT);
  if (!pmSheet) {
    ui.alert('❌ 找不到「商品管理」分頁\n\n請先執行「🔧 初次設定（建立分頁）」');
    return;
  }

  // 1. 詢問結單日（M/D 格式）
  var resp = ui.prompt(
    '📥 匯入指定結單日商品',
    '請輸入結單日（M/D 格式，例如 4/28）：\n\n' +
    '• 從開團總表抓該結單日的所有商品\n' +
    '• 對 products 比對，自動帶回 cost/price/分店價/單位/廠商\n' +
    '• 已在「商品管理」分頁的編號會跳過（保護員工本地修改）',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var endDateInput = String(resp.getResponseText() || '').trim();
  if (!endDateInput) return;

  if (!/^\d{1,2}\/\d{1,2}$/.test(endDateInput)) {
    ui.alert('❌ 結單日格式不對，請用 M/D（例如 4/28）');
    return;
  }

  // 2. 從開團總表 17f4 讀指定結單日的商品（編號 / 名稱）
  var groupBuyItems;
  try {
    groupBuyItems = _pmFetchGroupBuyItems_(endDateInput);
  } catch (err) {
    ui.alert('❌ 從開團總表抓資料失敗：' + err.message);
    return;
  }

  if (groupBuyItems.length === 0) {
    ui.alert('⚠️ 開團總表的結單日「' + endDateInput + '」沒有任何商品');
    return;
  }

  // 3. 讀「商品管理」現有編號（去重用）
  var pmLastRow = pmSheet.getLastRow();
  var existingIds = {};
  if (pmLastRow >= 2) {
    var idValues = pmSheet.getRange(2, PM_COL.PRODUCT_ID, pmLastRow - 1, 1).getValues();
    for (var i = 0; i < idValues.length; i++) {
      var pid = String(idValues[i][0] || '').trim();
      if (pid) existingIds[pid] = true;
    }
  }

  // 4. 過濾已存在的編號（不覆蓋）
  var newItems = [];
  var skippedExisting = 0;
  for (var j = 0; j < groupBuyItems.length; j++) {
    var it = groupBuyItems[j];
    if (existingIds[it.id]) {
      skippedExisting++;
      continue;
    }
    newItems.push(it);
  }

  if (newItems.length === 0) {
    ui.alert('ℹ️ 沒有新商品要匯入\n\n所有 ' + groupBuyItems.length + ' 筆商品已在「商品管理」分頁中');
    return;
  }

  // 5. 對 products 比對：批次取 products 資料（一次撈所有編號，避免 N 次 RPC）
  var ids = newItems.map(function(it) { return it.id; });
  var productsMap = _pmBatchLookupProducts_(ids);

  // 6. 組要寫入的列
  var nowStr = '';  // 比對結果由 GAS 寫，最後同步時間先空白
  var rows = [];
  var matchedCount = 0;
  var newProductCount = 0;
  for (var k = 0; k < newItems.length; k++) {
    var item = newItems[k];
    var p = productsMap[item.id];
    var compare;
    if (p) {
      compare = '✅ 已存在';
      matchedCount++;
      rows.push([
        endDateInput,
        item.id,
        item.name || p.name || '',
        p.price || 0,        // D 售價
        p.cost || 0,         // E 成本
        p.price_branch || 0, // F 分店價
        p.unit || '',
        p.supplier || '',
        p.status || '啟用',
        compare,
        '',     // 同步時間
        ''      // 備註
      ]);
    } else {
      compare = '🆕 新商品';
      newProductCount++;
      rows.push([
        endDateInput,
        item.id,
        item.name || '',
        '',     // D 售價
        '',     // E 成本
        '',     // F 分店價
        '',     // unit
        '',     // supplier
        '啟用',
        compare,
        '',
        ''
      ]);
    }
  }

  // 7. 寫入 商品管理 分頁
  var startRow = pmSheet.getLastRow() + 1;
  pmSheet.getRange(startRow, 1, rows.length, PM_TOTAL_COLS).setValues(rows);

  // 8. 顯示結果
  ui.alert(
    '✅ 匯入完成（結單日 ' + endDateInput + '）\n\n' +
    '• 新增 ' + rows.length + ' 筆\n' +
    '   ✅ 已在 products：' + matchedCount + ' 筆（自動帶價）\n' +
    '   🆕 新商品：' + newProductCount + ' 筆（請補空白）\n' +
    '• 跳過已存在於商品管理：' + skippedExisting + ' 筆\n\n' +
    '下一步：\n' +
    '  1. 看 J 欄「比對結果」\n' +
    '  2. 補完🆕新商品的成本/售價/分店價/單位/廠商\n' +
    '  3. 按「✅ 同步全部未同步到 products」'
  );
}


// 從開團總表 17f4 讀指定結單日的商品（搜遍所有 YYYY-MM 月份分頁）
function _pmFetchGroupBuyItems_(endDateMD) {
  var gbSs = SpreadsheetApp.openById(GROUP_BUY_SHEET_ID);
  var sheets = gbSs.getSheets();
  var monthRegex = /^\d{4}-\d{2}$/;
  var inputMonth = parseInt(endDateMD.split('/')[0]);

  var items = [];
  var seenIds = {};

  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s];
    var name = sh.getName();
    if (!monthRegex.test(name)) continue;

    var sheetMonth = parseInt(name.split('-')[1]);
    if (sheetMonth !== inputMonth) continue;  // 月份對不上，跳過

    var lastRow = sh.getLastRow();
    if (lastRow < 2) continue;

    var values = sh.getRange(2, 1, lastRow - 1, 4).getValues();  // A-D
    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      var rowEndDate = _pmNormalizeDate_(row[GB_COL.END_DATE - 1]);
      if (rowEndDate !== _pmNormalizeDate_(endDateMD)) continue;

      var pid = String(row[GB_COL.PRODUCT_ID - 1] || '').trim();
      if (!pid) continue;
      // 去重（同編號可能多月份分頁出現）
      if (seenIds[pid]) continue;
      seenIds[pid] = true;

      var pname = String(row[GB_COL.PRODUCT_NAME - 1] || '').trim();
      items.push({ id: pid, name: pname });
    }
  }

  return items;
}


// 日期正規化：'4/28' / '04/28' / Date object → '4/28'
function _pmNormalizeDate_(val) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return (val.getMonth() + 1) + '/' + val.getDate();
  }
  var s = String(val).trim();
  // YYYY-MM-DD → M/D
  var m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m1) return parseInt(m1[2]) + '/' + parseInt(m1[3]);
  // M/D 或 MM/DD（去前導 0）
  var m2 = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m2) return parseInt(m2[1]) + '/' + parseInt(m2[2]);
  return s;
}


// 批次撈 products — 改走 SECURITY DEFINER RPC（不走 anon REST）
// 走 RPC 才有完整的權限檢查，避免 RLS 改動導致誤判成「新商品」
// 任何錯誤直接 throw 由呼叫端處理（不靜默吞掉）
function _pmBatchLookupProducts_(ids) {
  if (!ids || ids.length === 0) return {};

  var result = {};
  var batchSize = 200;  // RPC 上限 500，留 buffer

  for (var i = 0; i < ids.length; i += batchSize) {
    var batch = ids.slice(i, i + batchSize);
    // 用 16staff 既有 helper，失敗會 throw
    var rows = _callSimpleRpc_('get_products_by_ids_admin', {
      p_admin_secret: _getAdminSecret_(),
      p_ids: batch
    });
    if (!Array.isArray(rows)) continue;
    for (var j = 0; j < rows.length; j++) {
      result[rows[j].id] = rows[j];
    }
  }
  return result;
}


// ==================== ✅ 同步到 products ====================

function pmSyncSelected() {
  if (!_pmCheckAdmin_()) return;
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  if (sheet.getName() !== TAB_PRODUCT_MGMT) {
    ui.alert('⚠️ 請先切到「商品管理」分頁再執行');
    return;
  }

  var range = sheet.getActiveRange();
  if (!range) {
    ui.alert('❌ 沒選任何列');
    return;
  }
  var startRow = range.getRow();
  var numRows = range.getNumRows();
  if (startRow < 2) {
    ui.alert('❌ 第 1 列是表頭，不能同步');
    return;
  }

  var resp = ui.alert(
    '✅ 同步選定商品到 products',
    '將同步 ' + numRows + ' 筆（從第 ' + startRow + ' 列開始）。\n\n' +
    '⚠️ 此操作會覆蓋 products 表中同編號的商品資料（成本/售價/分店價/單位/廠商/狀態）。\n\n' +
    '繼續？',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  _pmSyncRange_(sheet, startRow, numRows, ui);
}


function pmSyncAllUnsynced() {
  if (!_pmCheckAdmin_()) return;
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TAB_PRODUCT_MGMT);

  if (!sheet) {
    ui.alert('❌ 找不到「商品管理」分頁');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('ℹ️ 商品管理分頁沒資料');
    return;
  }

  // 找 K 同步時間 為空的列
  var syncedAtValues = sheet.getRange(2, PM_COL.SYNCED_AT, lastRow - 1, 1).getValues();
  var unsyncedRows = [];
  for (var i = 0; i < syncedAtValues.length; i++) {
    var v = syncedAtValues[i][0];
    if (v === '' || v === null || v === undefined) {
      unsyncedRows.push(i + 2);  // 1-based row number
    }
  }

  if (unsyncedRows.length === 0) {
    ui.alert('ℹ️ 全部都已同步過了（K 欄都有時間）\n\n如果想重新同步某列，先清掉 K 欄再執行。');
    return;
  }

  var resp = ui.alert(
    '✅ 同步全部未同步到 products',
    '找到 ' + unsyncedRows.length + ' 筆未同步（K 欄空白）。\n\n' +
    '⚠️ 此操作會覆蓋 products 表中同編號的商品資料。\n\n' +
    '繼續？',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  // 處理連續區塊（一次 sync 一段較有效率，但邏輯簡化先逐列處理）
  var okCount = 0, failCount = 0;
  var failMessages = [];
  for (var r = 0; r < unsyncedRows.length; r++) {
    var rowNum = unsyncedRows[r];
    var result = _pmSyncOneRow_(sheet, rowNum);
    if (result.ok) {
      okCount++;
    } else {
      failCount++;
      failMessages.push('• 第 ' + rowNum + ' 列：' + result.message);
    }
  }

  var msg = '✅ 同步完成\n\n' +
            '• 成功 ' + okCount + ' 筆\n' +
            '• 失敗 ' + failCount + ' 筆';
  if (failMessages.length > 0) {
    msg += '\n\n失敗明細：\n' + failMessages.slice(0, 10).join('\n');
    if (failMessages.length > 10) msg += '\n...（還有 ' + (failMessages.length - 10) + ' 筆失敗）';
  }
  ui.alert(msg);
}


// 同步一個 range（連續多列）
function _pmSyncRange_(sheet, startRow, numRows, ui) {
  var okCount = 0, failCount = 0;
  var failMessages = [];
  for (var r = 0; r < numRows; r++) {
    var rowNum = startRow + r;
    var result = _pmSyncOneRow_(sheet, rowNum);
    if (result.ok) {
      okCount++;
    } else {
      failCount++;
      failMessages.push('• 第 ' + rowNum + ' 列：' + result.message);
    }
  }
  var msg = '✅ 同步完成\n\n' +
            '• 成功 ' + okCount + ' 筆\n' +
            '• 失敗 ' + failCount + ' 筆';
  if (failMessages.length > 0) {
    msg += '\n\n失敗明細：\n' + failMessages.slice(0, 10).join('\n');
    if (failMessages.length > 10) msg += '\n...（還有 ' + (failMessages.length - 10) + ' 筆失敗）';
  }
  ui.alert(msg);
}


// 同步單列：呼叫 upsert_product_admin RPC
// 失敗時把錯誤訊息寫到 J 欄（比對結果）
function _pmSyncOneRow_(sheet, rowNum) {
  var row = sheet.getRange(rowNum, 1, 1, PM_TOTAL_COLS).getValues()[0];
  var id = String(row[PM_COL.PRODUCT_ID - 1] || '').trim();
  var name = String(row[PM_COL.NAME - 1] || '').trim();
  var cost = row[PM_COL.COST - 1];
  var price = row[PM_COL.PRICE - 1];
  var priceBranch = row[PM_COL.PRICE_BRANCH - 1];
  var unit = String(row[PM_COL.UNIT - 1] || '').trim();
  var supplier = String(row[PM_COL.SUPPLIER - 1] || '').trim();
  var status = String(row[PM_COL.STATUS - 1] || '啟用').trim();

  // 前端驗證
  if (!id) return { ok: false, message: '編號空白' };
  if (!name) return { ok: false, message: '名稱空白' };
  if (cost === '' || cost === null || isNaN(Number(cost))) {
    return { ok: false, message: '成本必填' };
  }
  if (price === '' || price === null || isNaN(Number(price))) {
    return { ok: false, message: '售價必填' };
  }
  if (priceBranch === '' || priceBranch === null || isNaN(Number(priceBranch))) {
    return { ok: false, message: '分店價必填' };
  }
  if (Number(cost) < 0 || Number(price) < 0 || Number(priceBranch) < 0) {
    return { ok: false, message: '金額不可為負' };
  }
  if (status !== '啟用' && status !== '停用') {
    return { ok: false, message: '狀態必須是啟用/停用' };
  }

  // 呼叫 upsert RPC
  try {
    var rpcResult = _callSimpleRpc_('upsert_product_admin', {
      p_admin_secret: _getAdminSecret_(),
      p_id: id,
      p_name: name,
      p_cost: Number(cost),
      p_price: Number(price),
      p_price_branch: Number(priceBranch),
      p_unit: unit,
      p_supplier: supplier,
      p_status: status
    });

    var action = (rpcResult && rpcResult.action) || 'updated';
    var compareText = (action === 'inserted') ? '🔄 已同步（新建）' : '🔄 已同步';

    sheet.getRange(rowNum, PM_COL.COMPARE).setValue(compareText);
    sheet.getRange(rowNum, PM_COL.SYNCED_AT).setValue(new Date());

    return { ok: true };
  } catch (err) {
    var errMsg = String(err.message || err).slice(0, 80);
    sheet.getRange(rowNum, PM_COL.COMPARE).setValue('❌ ' + errMsg);
    return { ok: false, message: errMsg };
  }
}


// ==================== 🔍 搜尋商品並補入 ====================

function pmOpenSearchDialog() {
  if (!_pmCheckAdmin_()) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(TAB_PRODUCT_MGMT)) {
    SpreadsheetApp.getUi().alert('❌ 找不到「商品管理」分頁\n\n請先執行「🔧 初次設定（建立分頁）」');
    return;
  }
  var html = HtmlService.createHtmlOutputFromFile('ProductSearchDialog')
    .setWidth(720).setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, '🔍 搜尋商品並補入');
}


// 給 dialog 呼叫：搜尋 products
function pmSearchProducts(keyword, includeInactive) {
  if (!_pmCheckAdmin_()) return { error: '權限不足' };
  try {
    var rows = _callSimpleRpc_('search_products_admin', {
      p_admin_secret:    _getAdminSecret_(),
      p_keyword:         keyword,
      p_include_inactive: !!includeInactive,
      p_limit:           50
    });
    if (!Array.isArray(rows)) rows = [];

    // 標記已在「商品管理」分頁的編號（dialog 顯示灰底不能勾）
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_PRODUCT_MGMT);
    var existingIds = {};
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var ids = sheet.getRange(2, PM_COL.PRODUCT_ID, lastRow - 1, 1).getValues();
        for (var i = 0; i < ids.length; i++) {
          var pid = String(ids[i][0] || '').trim();
          if (pid) existingIds[pid] = true;
        }
      }
    }
    for (var k = 0; k < rows.length; k++) {
      rows[k]._inSheet = !!existingIds[rows[k].id];
    }
    return { rows: rows };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}


// 給 dialog 呼叫：把選中商品加到「商品管理」分頁
function pmAddSearchedToSheet(items) {
  if (!_pmCheckAdmin_()) return { error: '權限不足' };
  if (!Array.isArray(items) || items.length === 0) return { error: '沒選任何商品' };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_PRODUCT_MGMT);
  if (!sheet) return { error: '找不到「商品管理」分頁' };

  // 再次檢查既有編號（dialog 端可能 stale）
  var lastRow = sheet.getLastRow();
  var existingIds = {};
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, PM_COL.PRODUCT_ID, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var pid = String(ids[i][0] || '').trim();
      if (pid) existingIds[pid] = true;
    }
  }

  var rows = [];
  var skipped = 0;
  for (var k = 0; k < items.length; k++) {
    var it = items[k];
    if (existingIds[it.id]) { skipped++; continue; }
    rows.push([
      '',                              // 結單日（搜尋進來的沒有結單日）
      it.id || '',
      it.name || '',
      it.price || 0,                   // D 售價
      it.cost || 0,                    // E 成本
      it.price_branch || 0,            // F 分店價
      it.unit || '',
      it.supplier || '',
      it.status || '啟用',
      '✅ 已存在',                     // 從 products 拉的，本來就在
      '',                              // 同步時間
      ''
    ]);
  }

  if (rows.length === 0) {
    return { ok: true, added: 0, skipped: skipped, message: '所有選中商品都已在「商品管理」分頁' };
  }

  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, PM_TOTAL_COLS).setValues(rows);

  return { ok: true, added: rows.length, skipped: skipped };
}


// ==================== 🔧 內部工具 ====================

function _pmCheckAdmin_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail().toLowerCase(); } catch (e) {}
  // email 取不到（個人 Gmail 隱私）→ fallback 當 admin（與 onOpen 一致）
  if (!email) return true;
  var isAdmin = ADMIN_EMAILS.some(function(e) { return e.toLowerCase() === email; });
  if (!isAdmin) {
    SpreadsheetApp.getUi().alert('❌ 此功能限管理員（' + ADMIN_EMAILS.join(' / ') + '）使用');
    return false;
  }
  return true;
}


// _getAdminSecret_ 與 _callSimpleRpc_ 來自 16staff_lookup_code.gs（共用 helper）
// 不重複定義，避免函式衝突。
