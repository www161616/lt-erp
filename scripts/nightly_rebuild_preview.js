/*
============================================================================
 夜間銷貨單補單腳本 — Step 1 預覽版（read-only）
============================================================================
 用途：
   把 lt_savedWaves（揀貨歷史）裡「實際已分發但還沒寫進 sales_orders」的
   資料預覽列出來，但不寫入任何東西。

 背景：
   2026-04-21 止血後，web_save_sales_order 被凍結（BUG-001 覆寫 order_date
   + BUG-014 for-await-of items 空傳）。白天揀貨照常，出貨用紙本 + LINE，
   晚上跑此腳本把昨晚實際出貨補進 DB，讓店家隔天早上 portal 看得到，
   會計也能正常對帳。

 執行方式：
   1. 登入 branch_admin.html（admin 帳號，必要權限：INSERT sales_orders）
   2. F12 打開 Console
   3. 把整份此檔貼進 Console 按 Enter → 自動跑預覽
   4. 看 console.table 輸出確認：
      - 會建幾張單、每張單的客戶對應是否正確、總金額合理
      - 有沒有「UNKNOWN 店名」警告（如果有，Step 2 會 throw 停下）
      - 龍潭總倉 actual > 0 需人工處理
   5. 全部合理 → 執行 Step 2（正式 INSERT 腳本）

 絕對保證：
   - 本腳本不呼叫任何 POST / PATCH / DELETE
   - 只讀 lt_savedWaves + 查 sales_orders / customers（SELECT only）
   - 跑完結果放 window._previewResult，可隨時再檢視

 依賴：
   頁面 global：SB_URL, HEADERS（branch_admin.html line 170/174 已定義）
============================================================================
*/

(async function nightlyRebuildPreview() {
  'use strict';

  // ─── 常數定義 ───────────────────────────────────────────────────

  // 16 家正式分店 mapping（短名 → customer_id）
  const STORE_TO_CUSTOMER = {
    '三峽': 'C00020', '中和': 'C00016', '南平': 'C00024', '古華': 'C00023',
    '四號': 'C00019', '平鎮': 'C00025', '忠順': 'C00018', '文山': 'C00017',
    '松山': 'C00027', '林口': 'C00021', '永和': 'C00022', '泰山': 'C00030',
    '湖口': 'C00032', '環球': 'C00026', '萬華': 'C00029', '經國': 'C00033',
  };

  // 已倒店：skip，log 到 SKIP_CLOSED
  const SKIP_CLOSED = new Set(['淡水', '板橋']);

  // 明確非分店（總倉/批發商/舊代號）：skip，log 到 SKIP_NON_STORE
  // 龍潭特別：actual > 0 時額外警告（總倉自留需人工處理）
  const SKIP_NON_STORE = new Set(['龍潭', '全民', '山張', '買上癮', '大溪']);

  // ─── 預設參數（可改）────────────────────────────────────────────
  const DATE_FROM = '2026-04-01';  // 預覽起始日（YYYY-MM-DD，含）
  const DATE_TO   = null;           // 預覽結束日（含）null = 不限

  // ─── 前置檢查 ──────────────────────────────────────────────────
  if (typeof SB_URL === 'undefined' || typeof HEADERS === 'undefined') {
    console.error('❌ SB_URL / HEADERS 未定義。請在 branch_admin.html 頁面內執行。');
    return;
  }

  // ─── 工具函式 ──────────────────────────────────────────────────

  // 店家分類
  function classifyStore(shortName) {
    if (STORE_TO_CUSTOMER[shortName]) {
      return { type: 'store', customerId: STORE_TO_CUSTOMER[shortName] };
    }
    if (SKIP_CLOSED.has(shortName))    return { type: 'closed' };
    if (SKIP_NON_STORE.has(shortName)) return { type: 'non_store' };
    return { type: 'unknown' };
  }

  // 取 actual（fallback expected → 0），對應 branch_admin.html:3512 實際結構
  function getActual(bd) {
    if (!bd) return 0;
    if (typeof bd === 'number') return bd;           // 極舊格式 fallback
    if (typeof bd.actual === 'number')   return bd.actual;
    if (typeof bd.expected === 'number') return bd.expected;
    return 0;
  }

  // 查 customer.name（快取）
  const _custNameCache = {};
  async function getCustomerName(customerId) {
    if (_custNameCache[customerId]) return _custNameCache[customerId];
    try {
      const res = await fetch(`${SB_URL}/customers?id=eq.${customerId}&select=name`, { headers: HEADERS });
      if (!res.ok) return '(查不到)';
      const data = await res.json();
      const name = (data[0] && data[0].name) || '(查不到)';
      _custNameCache[customerId] = name;
      return name;
    } catch (e) {
      return '(查不到)';
    }
  }

  // 查 DB 既有銷貨單（idempotent 依據）
  // 回傳 Set of "waveId|customerId"
  async function fetchExistingWaves(waveIds) {
    if (waveIds.length === 0) return new Set();
    const existing = new Set();
    const batchSize = 20;
    for (let i = 0; i < waveIds.length; i += batchSize) {
      const batch = waveIds.slice(i, i + batchSize);
      const inClause = batch.map(id => `"${id}"`).join(',');
      const url = `${SB_URL}/sales_orders?wave_id=in.(${inClause})&order_type=eq.normal&select=wave_id,customer_id`;
      try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) {
          console.error('[預覽] 查既有 SO 失敗:', res.status, await res.text());
          continue;
        }
        const data = await res.json();
        data.forEach(r => existing.add(`${r.wave_id}|${r.customer_id}`));
      } catch (e) {
        console.error('[預覽] fetch 異常:', e);
      }
    }
    return existing;
  }

  // ─── 主流程 ────────────────────────────────────────────────────

  console.log('%c====== 夜間補單預覽（read-only）======',
              'color:#2563eb; font-weight:bold; font-size:14px');
  console.log(`預覽範圍：${DATE_FROM || '全部'} ~ ${DATE_TO || '今日'}`);

  const waves = JSON.parse(localStorage.getItem('lt_savedWaves') || '[]');
  console.log(`lt_savedWaves 總筆數：${waves.length}`);

  // 日期範圍過濾
  const filteredWaves = waves.filter(w => {
    if (!w || !w.id || !w.delivery_date) return false;
    if (DATE_FROM && w.delivery_date < DATE_FROM) return false;
    if (DATE_TO   && w.delivery_date > DATE_TO)   return false;
    return true;
  });
  console.log(`日期範圍內：${filteredWaves.length} 筆`);

  if (filteredWaves.length === 0) {
    console.warn('⚠️ 範圍內沒有任何 wave，請檢查 DATE_FROM / DATE_TO');
    return;
  }

  // idempotent：先查 DB 既有
  const existingSet = await fetchExistingWaves(filteredWaves.map(w => w.id));
  console.log(`DB 已有 SO 組合：${existingSet.size} 個 (wave_id, customer_id)`);

  // 預覽結果容器
  const previewRows   = [];  // 要建的單（每行一張 SO）
  const skipExisting  = [];  // 已存在跳過
  const logClosed     = [];  // 已倒店
  const logNonStore   = [];  // 非分店（龍潭以外）
  const logUnknown    = [];  // 未知（預覽只累積不 throw）
  const logLongtan    = [];  // 龍潭 actual>0 警告

  for (const wave of filteredWaves) {
    const matrix = Array.isArray(wave.matrix) ? wave.matrix : [];
    if (matrix.length === 0) continue;

    // 收集此 wave 下所有出現過的店名
    const storesInWave = new Set();
    matrix.forEach(item => {
      const bd = item.branchData || {};
      Object.keys(bd).forEach(s => storesInWave.add(s));
    });

    // 逐店處理
    for (const shortName of storesInWave) {
      const c = classifyStore(shortName);

      // 龍潭特別處理：先算 actual 總和
      if (shortName === '龍潭') {
        let longtanTotal = 0;
        matrix.forEach(item => {
          longtanTotal += getActual(item.branchData && item.branchData['龍潭']);
        });
        if (longtanTotal > 0) {
          logLongtan.push({
            wave_id:       wave.id,
            delivery_date: wave.delivery_date,
            actual_total:  longtanTotal,
            note:          '總倉自留需人工處理'
          });
        }
        // 龍潭照樣 skip (non_store)
        logNonStore.push({ wave_id: wave.id, store: shortName });
        continue;
      }

      if (c.type === 'closed')    { logClosed.push({ wave_id: wave.id, store: shortName });   continue; }
      if (c.type === 'non_store') { logNonStore.push({ wave_id: wave.id, store: shortName }); continue; }
      if (c.type === 'unknown')   { logUnknown.push({ wave_id: wave.id, store: shortName });  continue; }

      // c.type === 'store'：正式分店，檢查 idempotent
      const customerId = c.customerId;
      if (existingSet.has(`${wave.id}|${customerId}`)) {
        skipExisting.push({ wave_id: wave.id, store: shortName, customer_id: customerId });
        continue;
      }

      // 聚合 detail（actual > 0 才算）
      let detailCount = 0;
      let orderTotal  = 0;
      matrix.forEach(item => {
        const actual = getActual(item.branchData && item.branchData[shortName]);
        if (actual <= 0) return;
        const price = Number(item.storePrice) || 0;
        detailCount++;
        orderTotal += actual * price;
      });

      if (detailCount === 0) continue;  // 全 0 不建單

      const customerName = await getCustomerName(customerId);
      previewRows.push({
        wave_id:       wave.id,
        delivery_date: wave.delivery_date,
        store:         shortName,
        customer_id:   customerId,
        customer_name: customerName,
        detail_count:  detailCount,
        order_total:   orderTotal,
      });
    }
  }

  // ─── 輸出 ──────────────────────────────────────────────────────

  console.log('');
  console.log('%c────── 將建立的銷貨單 ──────', 'color:#059669; font-weight:bold');
  if (previewRows.length > 0) {
    console.table(previewRows);
  } else {
    console.log('（無需建立的單）');
  }
  const totalAmt = previewRows.reduce((s, r) => s + r.order_total, 0);
  console.log(`小計：將建 ${previewRows.length} 張銷貨單，總金額 $${totalAmt.toLocaleString()}`);

  console.log('');
  console.log('%c────── idempotent 跳過（DB 已存在）──────',
              'color:#718096; font-weight:bold');
  console.log(`${skipExisting.length} 組 (wave_id, customer_id) 跳過`);
  if (skipExisting.length > 0 && skipExisting.length <= 30) console.table(skipExisting);

  console.log('');
  console.log('%c────── SKIP_CLOSED（已倒店）──────', 'color:#a0aec0; font-weight:bold');
  console.log(`${logClosed.length} 筆 (wave, store)`);
  if (logClosed.length > 0 && logClosed.length <= 30) console.table(logClosed);

  console.log('');
  console.log('%c────── SKIP_NON_STORE（總倉/批發商/舊代號）──────',
              'color:#a0aec0; font-weight:bold');
  console.log(`${logNonStore.length} 筆 (wave, store)`);
  if (logNonStore.length > 0 && logNonStore.length <= 30) console.table(logNonStore);

  console.log('');
  console.log('%c────── ⚠️ 龍潭總倉自留（actual > 0 需人工處理）──────',
              'color:#c53030; font-weight:bold');
  if (logLongtan.length === 0) {
    console.log('（無）');
  } else {
    console.table(logLongtan);
  }

  console.log('');
  console.log('%c────── 🚨 UNKNOWN 店名（Step 2 會報錯停下）──────',
              'color:#c53030; font-weight:bold; font-size:13px');
  if (logUnknown.length === 0) {
    console.log('✅ 全部店名都認識');
  } else {
    // 依店名去重計數
    const unknownCount = {};
    logUnknown.forEach(u => { unknownCount[u.store] = (unknownCount[u.store] || 0) + 1; });
    console.log('未知店名出現次數（聚合）：');
    console.table(Object.entries(unknownCount).map(([store, count]) => ({ store, count })));
    console.warn('⚠️ Step 2 正式腳本遇到上面任一店名會 throw Error 停下。執行前先決定：');
    console.warn('   (a) 屬於新分店 → 加入 STORE_TO_CUSTOMER');
    console.warn('   (b) 應跳過     → 加入 SKIP_CLOSED 或 SKIP_NON_STORE');
  }

  console.log('');
  console.log('%c====== 預覽結束（未寫入任何資料）======',
              'color:#2563eb; font-weight:bold; font-size:14px');

  // 回傳結果給全域變數，方便再檢視
  window._previewResult = {
    date_range:     { from: DATE_FROM, to: DATE_TO },
    will_create:    previewRows,
    skip_existing:  skipExisting,
    skip_closed:    logClosed,
    skip_non_store: logNonStore,
    longtan_warn:   logLongtan,
    unknown_stores: logUnknown,
    summary: {
      will_create_count: previewRows.length,
      total_amount:      totalAmt,
      skip_existing:     skipExisting.length,
      skip_closed:       logClosed.length,
      skip_non_store:    logNonStore.length,
      longtan_warnings:  logLongtan.length,
      unknown_count:     logUnknown.length,
    }
  };
  console.log('完整結果已存入 window._previewResult，可再次檢視：');
  console.log('  window._previewResult.summary');
  console.log('  window._previewResult.will_create');
})();
