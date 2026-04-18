/* ========================================
 * LT-ERP 每日備份
 * 從 Supabase shared_kv → Google Sheet（每月一個）+ Drive JSON
 * 每天一個 branchOrders 分頁快照，永不刪除
 *
 * 2026-04-17 更新：
 * 1. writeBranchOrdersDaily 的 products 表補名改為「只查缺名的」批次 id=in.(...)
 *    原本每天翻整張表（數十次 urlfetch），現在 0~2 次
 * 2. 新增 importTodayFromJson：當自動備份失敗，從手動下載的 JSON 補建今日分頁
 * ======================================== */

var CONFIG = {
  SB_URL: 'https://asugjynpocwygggttxyo.supabase.co/rest/v1',
  SB_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWdqeW5wb2N3eWdnZ3R0eHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzU3MjksImV4cCI6MjA4ODk1MTcyOX0.LzcRQAl80rZxKKD8NIYWGvylfwCbs1ek5LtKpmZodBc',
  BACKUP_KEYS: [
    'branchOrders', 'branchOrderList', 'branchOrdersLocked',
    'branchDataList', 'importedStoreNames', 'branchTypeMap'
  ],
  TZ: 'Asia/Taipei',
  DRIVE_FOLDER: 'LT-ERP 備份'
};

/* ===== 主程式（每日自動）===== */

function dailyBackup() {
  var now = new Date();
  var ts = Utilities.formatDate(now, CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss');
  var dateStr = Utilities.formatDate(now, CONFIG.TZ, 'yyyy-MM-dd');
  var monthStr = Utilities.formatDate(now, CONFIG.TZ, 'yyyy-MM');
  var dayTab = Utilities.formatDate(now, CONFIG.TZ, 'MM-dd');

  try {
    var data = fetchAllKeys();
    var folder = getOrCreateFolder(CONFIG.DRIVE_FOLDER);
    var ss = getOrCreateMonthlySheet(folder, monthStr);

    writeBranchOrdersDaily(ss, data.branchOrders, data.branchOrderList, dayTab, ts, false);
    writeBranchOrderList(ss, data.branchOrderList, ts);
    writeBranchOrdersLocked(ss, data.branchOrdersLocked, ts);
    writeGenericData(ss, 'branchDataList', data.branchDataList, ts);
    writeGenericData(ss, 'importedStoreNames', data.importedStoreNames, ts);
    writeGenericData(ss, 'branchTypeMap', data.branchTypeMap, ts);

    saveJsonToDrive(folder, data, dateStr);
    appendLog(ss, ts, '✅ 成功', buildSummary(data));

  } catch (e) {
    try {
      var folder2 = getOrCreateFolder(CONFIG.DRIVE_FOLDER);
      var ss2 = getOrCreateMonthlySheet(folder2, monthStr);
      appendLog(ss2, ts, '❌ 失敗', e.message);
    } catch(e2) {}
    throw e;
  }
}

/* ===== 從 JSON 匯入（urlfetch 炸掉時救急用）===== */

function importTodayFromJson() {
  var now = new Date();
  var ts = Utilities.formatDate(now, CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss');
  var dateStr = Utilities.formatDate(now, CONFIG.TZ, 'yyyy-MM-dd');
  var monthStr = Utilities.formatDate(now, CONFIG.TZ, 'yyyy-MM');
  var dayTab = Utilities.formatDate(now, CONFIG.TZ, 'MM-dd');

  var folder = getOrCreateFolder(CONFIG.DRIVE_FOLDER);

  // 先找今天日期的檔名，找不到就抓資料夾裡最新的 lt-erp-*.json
  var fileName = 'lt-erp-supabase-backup-' + dateStr + '.json';
  var file = findJsonFile(folder, fileName);
  if (!file) {
    throw new Error('❌ 找不到 JSON 檔。請把 ' + fileName + ' 上傳到 Google Drive 的「' + CONFIG.DRIVE_FOLDER + '」資料夾');
  }

  var content = file.getBlob().getDataAsString('UTF-8');
  var parsed = JSON.parse(content);

  // branch_admin 大備份的格式會多包一層 {exportedAt, source, keys, data}
  // dailyBackup 直接存的格式是 6 個 key 在頂層
  // 兩種都要支援
  var data = (parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;

  if (!data.branchOrders && !data.branchOrderList) {
    throw new Error('❌ JSON 格式不對，找不到 branchOrders 或 branchOrderList');
  }

  var ss = getOrCreateMonthlySheet(folder, monthStr);

  // skipProductsLookup=true：從 JSON 匯入時不呼叫 Supabase（避免再踩 urlfetch）
  writeBranchOrdersDaily(ss, data.branchOrders, data.branchOrderList, dayTab, ts, true);
  writeBranchOrderList(ss, data.branchOrderList, ts);
  writeBranchOrdersLocked(ss, data.branchOrdersLocked, ts);
  writeGenericData(ss, 'branchDataList', data.branchDataList, ts);
  writeGenericData(ss, 'importedStoreNames', data.importedStoreNames, ts);
  writeGenericData(ss, 'branchTypeMap', data.branchTypeMap, ts);

  appendLog(ss, ts, '✅ 從 JSON 匯入', '來源: ' + file.getName() + ' | ' + buildSummary(data));

  Logger.log('✅ 匯入完成：' + file.getName() + ' → ' + monthStr + ' Sheet / ' + dayTab + ' 分頁');
}

function findJsonFile(folder, preferName) {
  var exact = folder.getFilesByName(preferName);
  if (exact.hasNext()) return exact.next();

  // 找資料夾裡最新的 lt-erp-*.json
  var all = folder.getFiles();
  var latest = null;
  while (all.hasNext()) {
    var f = all.next();
    var name = f.getName();
    if (name.indexOf('lt-erp') >= 0 && name.toLowerCase().indexOf('.json') >= 0) {
      if (!latest || f.getLastUpdated() > latest.getLastUpdated()) {
        latest = f;
      }
    }
  }
  return latest;
}

/* ===== Supabase 讀取 ===== */

function fetchAllKeys() {
  var keys = CONFIG.BACKUP_KEYS.join(',');
  var url = CONFIG.SB_URL + '/shared_kv?key=in.(' + keys + ')&select=key,value';
  var res = UrlFetchApp.fetch(url, {
    headers: {
      'apikey': CONFIG.SB_KEY,
      'Authorization': 'Bearer ' + CONFIG.SB_KEY
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('Supabase 回傳 ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300));
  }

  var rows = JSON.parse(res.getContentText());
  var result = {};
  for (var i = 0; i < rows.length; i++) {
    var val = rows[i].value;
    result[rows[i].key] = (typeof val === 'string') ? JSON.parse(val) : val;
  }
  return result;
}

/* ===== Drive / Sheet 管理 ===== */

function getOrCreateFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function getOrCreateMonthlySheet(folder, monthStr) {
  var files = folder.getFilesByName(monthStr);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  var ss = SpreadsheetApp.create(monthStr);
  var file = DriveApp.getFileById(ss.getId());
  folder.addFile(file);
  var parents = file.getParents();
  while (parents.hasNext()) {
    var parent = parents.next();
    if (parent.getId() !== folder.getId()) {
      parent.removeFile(file);
    }
  }
  return ss;
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function styleHeader(sheet, cols) {
  sheet.getRange(1, 1, 1, cols)
    .setFontWeight('bold')
    .setBackground('#4a5568')
    .setFontColor('white');
  sheet.setFrozenRows(1);
}

/* ===== branchOrders 每日快照 ===== */

function writeBranchOrdersDaily(ss, data, listData, dayTab, ts, skipProductsLookup) {
  if (!data) return;

  var existing = ss.getSheetByName(dayTab);
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet(dayTab);

  var sheet1 = ss.getSheetByName('工作表1');
  if (sheet1) { try { ss.deleteSheet(sheet1); } catch(e) {} }
  var sheetEn = ss.getSheetByName('Sheet1');
  if (sheetEn) { try { ss.deleteSheet(sheetEn); } catch(e) {} }

  // 從 branchOrderList 建商品名稱 + 結單日對照表
  var nameMap = {};
  var endDateMap = {};
  if (listData && Array.isArray(listData)) {
    for (var i = 0; i < listData.length; i++) {
      var item = listData[i];
      var pid = item.productId || item.id || '';
      var cleanId = pid.replace(/_.*$/, '');
      var name = item.name || item.productName || '';
      var ed = item.endDate || '';
      if (cleanId && name) nameMap[cleanId] = name;
      if (pid && name) nameMap[pid] = name;
      if (cleanId && ed) endDateMap[cleanId] = ed;
      if (pid && ed) endDateMap[pid] = ed;
    }
  }

  var stores = Object.keys(data).sort();

  // 蒐集所有有數量的商品
  var pidSet = {};
  for (var s = 0; s < stores.length; s++) {
    var products = data[stores[s]];
    if (!products || typeof products !== 'object') continue;
    var pids = Object.keys(products);
    for (var p = 0; p < pids.length; p++) {
      if (products[pids[p]] && products[pids[p]] !== 0) {
        pidSet[pids[p]] = true;
      }
    }
  }

  var allPids = Object.keys(pidSet);

  // 從 products 表補名：只查 branchOrderList 沒有名稱的那幾個 cleanPid，批次 id=in.(...)
  if (!skipProductsLookup) {
    var missingSet = {};
    for (var mi = 0; mi < allPids.length; mi++) {
      var mpid = allPids[mi];
      var mclean = mpid.replace(/_.*$/, '');
      if (!nameMap[mpid] && !nameMap[mclean]) {
        missingSet[mclean] = true;
      }
    }
    var missingList = Object.keys(missingSet).filter(function(x){ return x.length > 0; });
    if (missingList.length > 0) {
      try {
        var CHUNK = 100;
        for (var ci = 0; ci < missingList.length; ci += CHUNK) {
          var chunk = missingList.slice(ci, ci + CHUNK);
          var pUrl = CONFIG.SB_URL + '/products?id=in.(' + chunk.join(',') + ')&select=id,product_name';
          var pRes = UrlFetchApp.fetch(pUrl, {
            headers: { 'apikey': CONFIG.SB_KEY, 'Authorization': 'Bearer ' + CONFIG.SB_KEY },
            muteHttpExceptions: true
          });
          if (pRes.getResponseCode() === 200) {
            var pRows = JSON.parse(pRes.getContentText());
            for (var pi2 = 0; pi2 < pRows.length; pi2++) {
              var pId = String(pRows[pi2].id || '');
              var pName = pRows[pi2].product_name || '';
              if (pId && pName) nameMap[pId] = pName;
            }
          }
        }
      } catch(e) {
        // 配額爆掉或網路錯誤時略過，沒名稱就留空
      }
    }
  }

  var items = [];
  for (var pi = 0; pi < allPids.length; pi++) {
    var pid2 = allPids[pi];
    var cleanPid = pid2.replace(/_.*$/, '');
    var endDate = '';
    var underscoreIdx = pid2.indexOf('_');
    if (underscoreIdx > 0) {
      endDate = pid2.substring(underscoreIdx + 1);
    } else {
      endDate = endDateMap[pid2] || endDateMap[cleanPid] || '(無結單日)';
    }
    endDate = normalizeDate(endDate);

    items.push({
      pid: pid2,
      cleanPid: cleanPid,
      endDate: endDate,
      name: nameMap[pid2] || nameMap[cleanPid] || ''
    });
  }

  items.sort(function(a, b) {
    if (a.endDate === '(無結單日)' && b.endDate !== '(無結單日)') return 1;
    if (b.endDate === '(無結單日)' && a.endDate !== '(無結單日)') return -1;
    var da = parseEndDate(a.endDate);
    var db = parseEndDate(b.endDate);
    if (da && db && da.getTime() !== db.getTime()) return db.getTime() - da.getTime();
    if (a.endDate !== b.endDate) return a.endDate > b.endDate ? -1 : 1;
    return a.cleanPid.localeCompare(b.cleanPid);
  });

  var headers = ['備份時間', '結單日', '商品編號', '商品名稱'];
  for (var h = 0; h < stores.length; h++) headers.push(stores[h]);
  headers.push('合計');

  var rows = [headers];
  for (var idx = 0; idx < items.length; idx++) {
    var item = items[idx];
    var row = [ts, item.endDate, item.pid, item.name];
    var total = 0;
    for (var si = 0; si < stores.length; si++) {
      var storeData = data[stores[si]];
      var qty = (storeData && storeData[item.pid]) ? Number(storeData[item.pid]) : 0;
      row.push(qty || '');
      total += qty || 0;
    }
    row.push(total);
    rows.push(row);
  }

  if (rows.length > 1) {
    sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
    styleHeader(sheet, headers.length);
    sheet.setFrozenColumns(4);
  }
}

/* ===== 日期工具 ===== */

function normalizeDate(str) {
  if (!str || str === '(無結單日)') return str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  var parts = str.split('/');
  if (parts.length === 2) {
    var m = parseInt(parts[0]);
    var d = parseInt(parts[1]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return '2026-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
    }
  }
  if (parts.length === 3) {
    var y = parseInt(parts[0]);
    var m2 = parseInt(parts[1]);
    var d2 = parseInt(parts[2]);
    return y + '-' + (m2 < 10 ? '0' + m2 : m2) + '-' + (d2 < 10 ? '0' + d2 : d2);
  }
  return str;
}

function parseEndDate(str) {
  if (!str || str === '(無結單日)') return null;
  try {
    if (str.indexOf('-') > 0) return new Date(str);
    var parts = str.split('/');
    if (parts.length === 2) return new Date(2026, parseInt(parts[0]) - 1, parseInt(parts[1]));
    if (parts.length === 3) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  } catch(e) {}
  return null;
}

/* ===== branchOrderList ===== */

function writeBranchOrderList(ss, data, ts) {
  if (!data || !Array.isArray(data) || data.length === 0) return;
  var sheet = getOrCreateSheet(ss, 'branchOrderList');
  sheet.clear();

  var priority = ['id', 'productId', 'name', 'productName', 'endDate', 'startDate',
                  'price', 'price_branch', 'cost', 'supplier', 'status'];
  var keySet = {};
  var limit = Math.min(data.length, 50);
  for (var i = 0; i < limit; i++) {
    var ks = Object.keys(data[i]);
    for (var j = 0; j < ks.length; j++) keySet[ks[j]] = true;
  }
  var ordered = [];
  for (var p = 0; p < priority.length; p++) {
    if (keySet[priority[p]]) { ordered.push(priority[p]); delete keySet[priority[p]]; }
  }
  var remaining = Object.keys(keySet).sort();
  for (var r = 0; r < remaining.length; r++) ordered.push(remaining[r]);

  var headers = ['備份時間'].concat(ordered);
  var rows = [headers];
  for (var d = 0; d < data.length; d++) {
    var row = [ts];
    for (var k = 0; k < ordered.length; k++) {
      var v = data[d][ordered[k]];
      if (v === undefined || v === null) row.push('');
      else if (typeof v === 'object') row.push(JSON.stringify(v));
      else row.push(v);
    }
    rows.push(row);
  }
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  styleHeader(sheet, headers.length);
}

/* ===== branchOrdersLocked ===== */

function writeBranchOrdersLocked(ss, data, ts) {
  if (!data) return;
  var sheet = getOrCreateSheet(ss, 'branchOrdersLocked');
  sheet.clear();

  var rows = [['備份時間', '店名', '商品編號', '鎖定值']];
  var stores = Object.keys(data).sort();
  for (var s = 0; s < stores.length; s++) {
    var products = data[stores[s]];
    if (!products || typeof products !== 'object') continue;
    var pids = Object.keys(products);
    for (var p = 0; p < pids.length; p++) {
      rows.push([ts, stores[s], pids[p], products[pids[p]]]);
    }
  }
  if (rows.length > 1) {
    sheet.getRange(1, 1, rows.length, 4).setValues(rows);
    styleHeader(sheet, 4);
  }
}

/* ===== 通用 ===== */

function writeGenericData(ss, name, data, ts) {
  if (!data) return;
  var sheet = getOrCreateSheet(ss, name);
  sheet.clear();

  var rows;
  if (Array.isArray(data)) {
    if (data.length === 0) return;
    if (typeof data[0] === 'object') {
      var keySet = {};
      var limit = Math.min(data.length, 20);
      for (var i = 0; i < limit; i++) {
        var ks = Object.keys(data[i]);
        for (var j = 0; j < ks.length; j++) keySet[ks[j]] = true;
      }
      var keys = Object.keys(keySet);
      rows = [['備份時間'].concat(keys)];
      for (var d = 0; d < data.length; d++) {
        var row = [ts];
        for (var k = 0; k < keys.length; k++) {
          var v = data[d][keys[k]];
          if (v === undefined || v === null) row.push('');
          else if (typeof v === 'object') row.push(JSON.stringify(v));
          else row.push(v);
        }
        rows.push(row);
      }
    } else {
      rows = [['備份時間', '值']];
      for (var a = 0; a < data.length; a++) {
        rows.push([ts, String(data[a])]);
      }
    }
  } else if (typeof data === 'object') {
    rows = [['備份時間', 'Key', 'Value']];
    var entries = Object.keys(data);
    for (var e = 0; e < entries.length; e++) {
      var val = data[entries[e]];
      rows.push([ts, entries[e], typeof val === 'object' ? JSON.stringify(val) : String(val)]);
    }
  }
  if (rows && rows.length > 1) {
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    styleHeader(sheet, rows[0].length);
  }
}

/* ===== Drive JSON 備份 ===== */

function saveJsonToDrive(folder, data, dateStr) {
  var fileName = 'lt-erp-backup-' + dateStr + '.json';
  var content = JSON.stringify(data, null, 2);
  var existing = folder.getFilesByName(fileName);
  if (existing.hasNext()) {
    existing.next().setContent(content);
  } else {
    folder.createFile(fileName, content, 'application/json');
  }
}

/* ===== 備份紀錄 ===== */

function appendLog(ss, ts, status, detail) {
  var sheet = getOrCreateSheet(ss, '備份紀錄');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([['時間', '狀態', '摘要']]);
    styleHeader(sheet, 3);
  }
  sheet.appendRow([ts, status, detail]);
}

function buildSummary(data) {
  var parts = [];
  if (data.branchOrders) {
    var stores = Object.keys(data.branchOrders);
    var total = 0;
    for (var i = 0; i < stores.length; i++) {
      var obj = data.branchOrders[stores[i]];
      if (obj && typeof obj === 'object') total += Object.keys(obj).length;
    }
    parts.push('branchOrders: ' + stores.length + '店/' + total + '筆');
  }
  if (data.branchOrderList) {
    parts.push('商品清單: ' + (Array.isArray(data.branchOrderList) ? data.branchOrderList.length : '?') + '筆');
  }
  var others = ['branchOrdersLocked', 'branchDataList', 'importedStoreNames', 'branchTypeMap'];
  for (var o = 0; o < others.length; o++) {
    if (data[others[o]]) parts.push(others[o] + ': ✓');
  }
  return parts.join(' | ');
}

/* ===== 每日自動觸發（執行一次就好）===== */

function setupDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'dailyBackup') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('dailyBackup')
    .timeBased()
    .atHour(2)
    .everyDays(1)
    .inTimezone('Asia/Taipei')
    .create();
  Logger.log('✅ 已設定每日凌晨 2 點自動備份');
}

/* ===== 手動測試 ===== */

function testBackup() {
  dailyBackup();
  Logger.log('✅ 手動備份完成');
}
