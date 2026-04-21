/*
============================================================================
 夜間銷貨單補單腳本 — Step 2 正式 INSERT 版
============================================================================
 ⚠️⚠️⚠️ 會寫入 DB ⚠️⚠️⚠️
 會 POST 進：sales_orders / sales_details / accounts_receivable

 ── 執行前必讀 ─────────────────────────────────────────────────────
 1. 必須先跑完 scripts/nightly_rebuild_preview.js 確認結果乾淨
 2. UNKNOWN 店名 → 腳本會 throw Error 停下，要先把該店加到 STORE_TO_CUSTOMER
    或 SKIP_CLOSED / SKIP_NON_STORE
 3. 預設 DRY_RUN = true（不真寫）。看到預覽乾淨後改 false 再跑
 4. 建議在夜間執行，降低 SO id 流水衝突機率

 ── 安全保護 ──────────────────────────────────────────────────────
 A. DRY_RUN flag：預設 true，不 POST 任何東西
 B. UNKNOWN 店名遇到就 throw，不默默跳過
 C. storePrice ≤ 0 或非數字 → 跳過該明細（log 到 skipped_details）
 D. 整張單 detail 全被跳光 → 不建那張單
 E. idempotent：wave_id + customer_id + order_type='normal' 已存在 → 跳過
 F. SweetAlert confirm 彈窗顯示總覽，取消則停
 G. 逐張單事務式：sales_orders + details + AR，中途失敗會 rollback

 ── 執行方式 ──────────────────────────────────────────────────────
 1. 登入 branch_admin.html（admin 帳號，必要權限：INSERT/DELETE sales_orders）
 2. F12 → Console
 3. 整份此檔貼進去 → Enter
 4. 看 SweetAlert 確認彈窗，OK 才開始寫
 5. 跑完看 window._insertResult.summary

 依賴：
   頁面 global：SB_URL, HEADERS, Swal（SweetAlert2）
============================================================================
*/

(async function nightlyRebuildInsert() {
  'use strict';

  // ═══ 安全 FLAG（改這裡）═══════════════════════════════════════════
  const DRY_RUN  = true;          // ⚠️ 預設 true：只模擬、不 POST
                                   //    看過 Step 1 預覽乾淨後改 false 再跑
  const DATE_FROM = '2026-04-20';   // 補單起始日（含）
  const DATE_TO   = '2026-04-22';   // 補單結束日（含）。今天先只補到 4/22；
                                    // 4/23 PICK-389565 等員工確認定稿後，改成 '2026-04-23' 再跑第二輪

  // ═══ 常數（同 Step 1）═════════════════════════════════════════════

  const STORE_TO_CUSTOMER = {
    '三峽': 'C00020', '中和': 'C00016', '南平': 'C00024', '古華': 'C00023',
    '四號': 'C00019', '平鎮': 'C00025', '忠順': 'C00018', '文山': 'C00017',
    '松山': 'C00027', '林口': 'C00021', '永和': 'C00022', '泰山': 'C00030',
    '湖口': 'C00032', '環球': 'C00026', '萬華': 'C00029', '經國': 'C00033',
  };
  const SKIP_CLOSED    = new Set(['淡水', '板橋']);
  const SKIP_NON_STORE = new Set(['龍潭', '全民', '山張', '買上癮', '大溪']);

  // ═══ Wave Blacklist（個案排除的整張 wave）═════════════════════════
  // 用途：已確認該 wave 是 ghost（DB 裡已有另一個真實 wave 處理過同一筆交貨）
  //       或任何其他原因要跳過整張 wave。
  // 規格：wave.id 在裡面 → 腳本直接 skip 該 wave，不建任何 SO，log 到 skip_blacklist_wave
  const WAVE_BLACKLIST = new Set([
    'PICK-721473',  // 2026-04-20 ghost wave（PICK-963399 才是實際出貨，已在 DB）
  ]);

  // ═══ 前置檢查 ═════════════════════════════════════════════════════

  if (typeof SB_URL === 'undefined' || typeof HEADERS === 'undefined') {
    console.error('❌ SB_URL / HEADERS 未定義。請在 branch_admin.html 頁面內執行。');
    return;
  }
  if (typeof Swal === 'undefined') {
    console.error('❌ SweetAlert2 未載入。請在 branch_admin.html 頁面內執行。');
    return;
  }

  console.log('%c====== 夜間補單（Step 2）======',
              'color:#c53030; font-weight:bold; font-size:14px');
  console.log(`DRY_RUN: ${DRY_RUN ? '✅ 是（不會寫入 DB）' : '🔴 否（會真寫）'}`);
  console.log(`範圍: ${DATE_FROM} ~ ${DATE_TO || '今日'}`);

  // ═══ 工具函式 ═════════════════════════════════════════════════════

  function classifyStore(shortName) {
    if (STORE_TO_CUSTOMER[shortName]) {
      return { type: 'store', customerId: STORE_TO_CUSTOMER[shortName] };
    }
    if (SKIP_CLOSED.has(shortName))    return { type: 'closed' };
    if (SKIP_NON_STORE.has(shortName)) return { type: 'non_store' };
    return { type: 'unknown' };
  }

  function getActual(bd) {
    if (!bd) return 0;
    if (typeof bd === 'number') return bd;
    if (typeof bd.actual === 'number')   return bd.actual;
    if (typeof bd.expected === 'number') return bd.expected;
    return 0;
  }

  // actual 型別防禦（Codex Bug 1 修正）
  // - actual = 0: 正常情境（店家沒訂），silent 跳過，不進 skipped_details
  // - actual > 0 但不是正整數: 異常，記 skipped_details
  function validateActual(rawFromBranchData) {
    const raw = rawFromBranchData;
    if (raw === 0 || raw === null || raw === undefined) {
      return { ok: false, reason: 'actual_zero', silent: true };
    }
    const n = Number(raw);
    if (isNaN(n))              return { ok: false, reason: 'actual_nan' };
    if (n <= 0)                return { ok: false, reason: 'actual_zero', silent: true };
    if (!Number.isInteger(n))  return { ok: false, reason: 'actual_not_integer' };
    return { ok: true, value: n };
  }

  // storePrice 型別防禦（Codex Q3 / 我的補充 1）
  function validatePrice(raw) {
    if (raw === null || raw === undefined || raw === '') {
      return { ok: false, reason: 'price_empty' };
    }
    const n = Number(raw);
    if (isNaN(n))      return { ok: false, reason: 'price_nan' };
    if (n <= 0)        return { ok: false, reason: 'price_not_positive' };
    return { ok: true, value: n };
  }

  // 客戶名稱快取（Codex Bug 2 修正：查不到回 null，由呼叫端決定怎麼處理）
  const _custNameCache = {};
  async function getCustomerName(customerId) {
    if (customerId in _custNameCache) return _custNameCache[customerId];
    try {
      const res  = await fetch(`${SB_URL}/customers?id=eq.${customerId}&select=name`, { headers: HEADERS });
      if (!res.ok) { _custNameCache[customerId] = null; return null; }
      const data = await res.json();
      const name = (data[0] && data[0].name) || null;
      _custNameCache[customerId] = name;
      return name;
    } catch (e) {
      _custNameCache[customerId] = null;
      return null;
    }
  }

  // idempotent 查詢第 1 層：wave_id + customer_id 精確匹配
  async function fetchExistingWaveCustomers(waveIds) {
    if (waveIds.length === 0) return new Set();
    const existing = new Set();
    const batchSize = 20;
    for (let i = 0; i < waveIds.length; i += batchSize) {
      const batch    = waveIds.slice(i, i + batchSize);
      const inClause = batch.map(id => `"${id}"`).join(',');
      const url      = `${SB_URL}/sales_orders?wave_id=in.(${inClause})&order_type=eq.normal&select=wave_id,customer_id`;
      const res      = await fetch(url, { headers: HEADERS });
      if (!res.ok) {
        console.error('[Step2] 查既有 SO 失敗:', res.status, await res.text());
        continue;
      }
      const data = await res.json();
      data.forEach(r => existing.add(`${r.wave_id}|${r.customer_id}`));
    }
    return existing;
  }

  // idempotent 查詢第 2 層：(customer_id, order_date) 有「其他 wave」的 SO
  // 用來偵測 potential_duplicate：當我們要建一張 (customer_X, date_Y, wave_A) 的 SO，
  // 但 DB 早已有 (customer_X, date_Y, wave_B != A) 存在 → 同客戶同日兩個 wave，高度懷疑是 duplicate
  // 回傳：Map<"customer_id|order_date", [{wave_id, id, grand_total}, ...]>
  async function fetchExistingByCustDate(customerIds, dateStrs) {
    const map = new Map();
    if (customerIds.length === 0 || dateStrs.length === 0) return map;
    const custIn  = customerIds.map(c => `"${c}"`).join(',');
    const dateIn  = dateStrs.map(d => `"${d}"`).join(',');
    const url     = `${SB_URL}/sales_orders?customer_id=in.(${custIn})&order_date=in.(${dateIn})&order_type=eq.normal&wave_id=not.is.null&select=customer_id,order_date,wave_id,id,grand_total`;
    const res     = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.error('[Step2] 查同客戶同日 SO 失敗:', res.status, await res.text());
      return map;
    }
    const data = await res.json();
    data.forEach(r => {
      const key = `${r.customer_id}|${r.order_date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ wave_id: r.wave_id, id: r.id, grand_total: r.grand_total });
    });
    return map;
  }

  // 取某日下一個 SO 流水（SO + YYYYMMDD + 3 位 padStart）
  async function fetchMaxSoSeq(dateStr) {
    const prefix = 'SO' + dateStr.replace(/-/g, '');
    // PostgREST id=like.SO20260422% 要 URL encode 的是 %25
    const url = `${SB_URL}/sales_orders?id=like.${prefix}%25&select=id&order=id.desc&limit=1`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return 0;
    const data = await res.json();
    if (data.length === 0) return 0;
    const lastId  = data[0].id;
    const seqPart = lastId.slice(prefix.length);  // 保留末段
    const n       = parseInt(seqPart, 10);
    return isNaN(n) ? 0 : n;
  }

  function buildSoId(dateStr, seq) {
    const prefix = 'SO' + dateStr.replace(/-/g, '');
    return prefix + String(seq).padStart(3, '0');
  }
  function buildArId(soId) {
    return 'AR' + soId.slice(2);  // 跟 RPC 一致：AR + SUBSTRING(SO_id, 3)
  }

  // ═══ 載入 waves + 建 plan ══════════════════════════════════════════

  const waves = JSON.parse(localStorage.getItem('lt_savedWaves') || '[]');
  const filteredWaves = waves.filter(w => {
    if (!w || !w.id || !w.delivery_date) return false;
    if (DATE_FROM && w.delivery_date < DATE_FROM) return false;
    if (DATE_TO   && w.delivery_date > DATE_TO)   return false;
    return true;
  });
  console.log(`日期範圍內 wave：${filteredWaves.length}`);

  if (filteredWaves.length === 0) {
    console.warn('⚠️ 範圍內沒有 wave，結束');
    return;
  }

  const existingSet = await fetchExistingWaveCustomers(filteredWaves.map(w => w.id));

  // 先掃一遍：找出 UNKNOWN 就立刻 throw
  const unknownStores = [];
  filteredWaves.forEach(wave => {
    (wave.matrix || []).forEach(item => {
      Object.keys(item.branchData || {}).forEach(shortName => {
        if (classifyStore(shortName).type === 'unknown') {
          unknownStores.push({ wave_id: wave.id, store: shortName });
        }
      });
    });
  });
  if (unknownStores.length > 0) {
    console.error('🚨 UNKNOWN 店名出現，停止寫入：');
    console.table(unknownStores);
    throw new Error(`UNKNOWN 店名 ${unknownStores.length} 筆。先決定加入 mapping 或 blacklist，再重跑。`);
  }

  // 建 plan：每個要建的 SO 收好 payload
  const plan                    = [];  // [{ wave, shortName, customerId, customerName, details[], grandTotal }]
  const skippedDetails          = [];  // 被跳過的明細（storePrice 問題 / actual 非整數）
  const skipExisting            = [];
  const skipClosed              = [];
  const skipNonStore            = [];
  const longtanWarn             = [];
  const skippedMissingCustomer  = [];  // customer_name 查不到（Codex Bug 2）
  const skipBlacklistWave       = [];  // WAVE_BLACKLIST 命中（v2）
  const potentialDuplicate      = [];  // 同客戶同日已有其他 wave SO（v2）

  // 第 1 階段：先過 WAVE_BLACKLIST，並建立 (customer_id, order_date) 查詢清單
  const preFilteredWaves = [];
  for (const wave of filteredWaves) {
    if (WAVE_BLACKLIST.has(wave.id)) {
      skipBlacklistWave.push({
        wave_id:       wave.id,
        delivery_date: wave.delivery_date,
        reason:        'WAVE_BLACKLIST（個案排除）',
      });
      continue;
    }
    preFilteredWaves.push(wave);
  }

  // 第 2 階段：查 DB 既有「同客戶同日」SO（第 2 層 idempotent）
  const candidateCustomerIds = new Set();
  const candidateDates       = new Set();
  preFilteredWaves.forEach(wave => {
    candidateDates.add(wave.delivery_date);
    (wave.matrix || []).forEach(item => {
      Object.keys(item.branchData || {}).forEach(s => {
        const c = classifyStore(s);
        if (c.type === 'store') candidateCustomerIds.add(c.customerId);
      });
    });
  });
  const existingByCustDate = await fetchExistingByCustDate(
    [...candidateCustomerIds], [...candidateDates]
  );
  console.log(`第 2 層 idempotent：查到 ${existingByCustDate.size} 組 (customer_id, order_date) 在 DB 已有其他 wave SO`);

  for (const wave of preFilteredWaves) {
    const matrix = Array.isArray(wave.matrix) ? wave.matrix : [];
    if (matrix.length === 0) continue;

    const storesInWave = new Set();
    matrix.forEach(item => {
      Object.keys(item.branchData || {}).forEach(s => storesInWave.add(s));
    });

    for (const shortName of storesInWave) {
      const c = classifyStore(shortName);

      // 龍潭 log warning（actual > 0）
      if (shortName === '龍潭') {
        let longtanTotal = 0;
        matrix.forEach(item => { longtanTotal += getActual(item.branchData && item.branchData['龍潭']); });
        if (longtanTotal > 0) {
          longtanWarn.push({ wave_id: wave.id, delivery_date: wave.delivery_date, actual_total: longtanTotal });
        }
        skipNonStore.push({ wave_id: wave.id, store: shortName });
        continue;
      }

      if (c.type === 'closed')    { skipClosed.push({ wave_id: wave.id, store: shortName });   continue; }
      if (c.type === 'non_store') { skipNonStore.push({ wave_id: wave.id, store: shortName }); continue; }

      const customerId = c.customerId;
      if (existingSet.has(`${wave.id}|${customerId}`)) {
        skipExisting.push({ wave_id: wave.id, store: shortName, customer_id: customerId });
        continue;
      }

      // 第 2 層 idempotent：同客戶同日是否已有「其他 wave」的 SO
      const custDateKey = `${customerId}|${wave.delivery_date}`;
      if (existingByCustDate.has(custDateKey)) {
        const otherSOs = existingByCustDate.get(custDateKey);
        potentialDuplicate.push({
          wave_id:         wave.id,
          store:           shortName,
          customer_id:     customerId,
          delivery_date:   wave.delivery_date,
          existing_so_ids: otherSOs.map(o => o.id).join(','),
          existing_waves:  otherSOs.map(o => o.wave_id).join(','),
          existing_total:  otherSOs.reduce((s, o) => s + (o.grand_total || 0), 0),
        });
        continue;  // 不建，讓使用者人工決定
      }

      // 聚合 details
      const details = [];
      matrix.forEach((item, idx) => {
        const actualRaw    = getActual(item.branchData && item.branchData[shortName]);
        const actualCheck  = validateActual(actualRaw);
        if (!actualCheck.ok) {
          if (!actualCheck.silent) {
            skippedDetails.push({
              wave_id:      wave.id,
              store:        shortName,
              product_id:   item.productId || item.id,
              product_name: item.name,
              actualRaw:    actualRaw,
              storePrice:   item.storePrice,
              reason:       actualCheck.reason,
            });
          }
          return;
        }
        const qty = actualCheck.value;

        const priceCheck = validatePrice(item.storePrice);
        if (!priceCheck.ok) {
          skippedDetails.push({
            wave_id:      wave.id,
            store:        shortName,
            product_id:   item.productId || item.id,
            product_name: item.name,
            storePrice:   item.storePrice,
            reason:       priceCheck.reason,
            actual:       qty,
          });
          return;
        }

        const unitPrice = priceCheck.value;
        const unitCost  = Number(item.cost) || 0;
        const subtotal  = qty * unitPrice;
        const profit    = qty * (unitPrice - unitCost);

        details.push({
          product_id:   (item.productId || item.id || '').replace(/_.*$/, ''),
          product_name: item.name || '',
          qty,
          unit:         '件',
          unit_price:   unitPrice,
          subtotal,
          unit_cost:    unitCost,
          profit,
          note:         null,
        });
      });

      if (details.length === 0) continue;  // detail 全跳光 → 不建單

      const customerName = await getCustomerName(customerId);
      if (!customerName) {
        // Codex Bug 2：customer_name 查不到就不建單，不容忍空白
        skippedMissingCustomer.push({
          wave_id:        wave.id,
          store:          shortName,
          customer_id:    customerId,
          detail_count:   details.length,
          reason:         'customers 表查不到此 customer_id 對應的 name',
        });
        continue;
      }
      const grandTotal   = details.reduce((s, d) => s + d.subtotal, 0);

      plan.push({
        wave_id:        wave.id,
        delivery_date:  wave.delivery_date,
        short_name:     shortName,
        customer_id:    customerId,
        customer_name:  customerName,
        details,
        detail_count:   details.length,
        grand_total:    grandTotal,
      });
    }
  }

  // ═══ 顯示 plan 彙總 ════════════════════════════════════════════════

  console.log('');
  console.log('%c─── 待建銷貨單 plan ───', 'color:#059669; font-weight:bold');
  if (plan.length === 0) {
    console.log('（無）— 全部已在 DB');
  } else {
    console.table(plan.map(p => ({
      wave_id:       p.wave_id,
      delivery_date: p.delivery_date,
      store:         p.short_name,
      customer_id:   p.customer_id,
      detail_count:  p.detail_count,
      grand_total:   p.grand_total,
    })));
  }
  const planTotal = plan.reduce((s, p) => s + p.grand_total, 0);
  console.log(`共 ${plan.length} 張銷貨單，總金額 $${planTotal.toLocaleString()}`);

  console.log('');
  console.log(`idempotent 跳過：${skipExisting.length} 組`);
  console.log(`SKIP_CLOSED：${skipClosed.length} 筆`);
  console.log(`SKIP_NON_STORE：${skipNonStore.length} 筆`);
  console.log(`⚠️ 龍潭警告：${longtanWarn.length} 筆`);
  if (longtanWarn.length > 0) console.table(longtanWarn);

  console.log('');
  console.log(`🟡 被跳過的明細（storePrice / actual 異常）：${skippedDetails.length} 筆`);
  if (skippedDetails.length > 0) console.table(skippedDetails);

  console.log('');
  console.log(`🔴 客戶查不到跳過整張單（customer_name 查不到）：${skippedMissingCustomer.length} 筆`);
  if (skippedMissingCustomer.length > 0) console.table(skippedMissingCustomer);

  console.log('');
  console.log(`%c🔴 WAVE_BLACKLIST 跳過整張 wave：${skipBlacklistWave.length} 筆`,
              'color:#c53030; font-weight:bold');
  if (skipBlacklistWave.length > 0) console.table(skipBlacklistWave);

  console.log('');
  console.log(`%c⚠️ POTENTIAL_DUPLICATE（同客戶同日已有其他 wave SO）：${potentialDuplicate.length} 筆`,
              'color:#d97706; font-weight:bold; font-size:13px');
  if (potentialDuplicate.length > 0) {
    console.table(potentialDuplicate);
    console.warn('↑ 這些單不會建。要建請先把對應 wave.id 加到 WAVE_BLACKLIST（或反向：把舊 SO 刪掉再重跑）。');
  }

  if (plan.length === 0) {
    Swal.fire({ title: '沒有要建的單', text: '範圍內全部已在 DB', icon: 'info' });
    return;
  }

  // ═══ 最終確認（或 DRY_RUN 結束）═══════════════════════════════════

  if (DRY_RUN) {
    console.log('');
    console.log('%c✅ DRY_RUN 模式：未寫入 DB。檢查 plan 正確後改 DRY_RUN=false 再跑。',
                'color:#2563eb; font-weight:bold; font-size:13px');
    window._insertResult = {
      dry_run:                  true,
      plan,
      skipped_details:          skippedDetails,
      skipped_missing_customer: skippedMissingCustomer,
      skip_existing:            skipExisting,
      skip_closed:              skipClosed,
      skip_non_store:           skipNonStore,
      longtan_warn:             longtanWarn,
      skip_blacklist_wave:      skipBlacklistWave,
      potential_duplicate:      potentialDuplicate,
      summary: {
        plan_count:                plan.length,
        plan_total:                planTotal,
        skipped_details:           skippedDetails.length,
        skipped_missing_customer:  skippedMissingCustomer.length,
        skip_existing:             skipExisting.length,
        skip_closed:               skipClosed.length,
        skip_non_store:            skipNonStore.length,
        longtan_warn:              longtanWarn.length,
        skip_blacklist_wave:       skipBlacklistWave.length,
        potential_duplicate:       potentialDuplicate.length,
      }
    };
    return;
  }

  // 真實寫入前的最終確認
  const confirm = await Swal.fire({
    title:             '確認寫入 DB？',
    html:              `將建立 <b>${plan.length}</b> 張銷貨單 + 應收帳款<br>總金額：<b>$${planTotal.toLocaleString()}</b><br>跳過明細：${skippedDetails.length} 筆<br>客戶查不到跳過：${skippedMissingCustomer.length} 張<br>WAVE_BLACKLIST 跳過：${skipBlacklistWave.length} 張 wave<br>同客戶同日重複疑慮跳過：${potentialDuplicate.length} 張<br><br><span style="color:#c53030;">⚠️ 將真正寫入 sales_orders / sales_details / accounts_receivable</span>`,
    icon:              'warning',
    showCancelButton:  true,
    confirmButtonText: '🔴 確定寫入',
    cancelButtonText:  '取消',
    confirmButtonColor: '#c53030',
  });
  if (!confirm.isConfirmed) {
    console.log('❌ 使用者取消');
    return;
  }

  // ═══ 實際寫入 ═══════════════════════════════════════════════════════

  // 按 delivery_date 分組，每日起跑時查一次 MAX seq
  const dateGroups = {};
  plan.forEach(p => {
    if (!dateGroups[p.delivery_date]) dateGroups[p.delivery_date] = [];
    dateGroups[p.delivery_date].push(p);
  });
  // 日期小到大處理（舊日期的 SO id 先用掉小流水）
  const sortedDateEntries = Object.entries(dateGroups).sort((a, b) => a[0].localeCompare(b[0]));

  const results = {
    success: [],
    failed:  [],
  };

  for (const [dateStr, items] of sortedDateEntries) {
    let seqCounter = await fetchMaxSoSeq(dateStr);
    console.log(`[${dateStr}] 起始流水：${seqCounter}，要建 ${items.length} 張`);

    for (const item of items) {
      seqCounter++;
      const soId = buildSoId(dateStr, seqCounter);
      const arId = buildArId(soId);

      try {
        // 1. POST sales_orders
        const soPayload = {
          id:             soId,
          order_date:     dateStr,
          customer_id:    item.customer_id,
          customer_name:  item.customer_name,
          subtotal:       item.grand_total,
          shipping:       0,
          deduction:      0,
          tax_amount:     0,
          grand_total:    item.grand_total,
          tax_type:       '免稅',
          payment_status: '未收款',
          note:           `夜間補單 script (${new Date().toISOString().slice(0,16)})`,
          wave_id:        item.wave_id,
          portal_status:  'issued',
          issued_at:      new Date().toISOString(),
          order_type:     'normal',
        };
        const soRes = await fetch(`${SB_URL}/sales_orders`, {
          method:  'POST',
          headers: { ...HEADERS, 'Prefer': 'return=minimal' },
          body:    JSON.stringify(soPayload),
        });
        if (!soRes.ok) throw new Error(`sales_orders POST ${soRes.status}: ${await soRes.text()}`);

        // 2. POST sales_details (bulk)
        const detailsPayload = item.details.map((d, i) => ({
          id:           `${soId}-${i + 1}`,
          order_id:     soId,
          product_id:   d.product_id,
          product_name: d.product_name,
          qty:          d.qty,
          unit:         d.unit,
          unit_price:   d.unit_price,
          subtotal:     d.subtotal,
          unit_cost:    d.unit_cost,
          profit:       d.profit,
          note:         d.note,
        }));
        const dRes = await fetch(`${SB_URL}/sales_details`, {
          method:  'POST',
          headers: { ...HEADERS, 'Prefer': 'return=minimal' },
          body:    JSON.stringify(detailsPayload),
        });
        if (!dRes.ok) {
          // rollback SO
          await fetch(`${SB_URL}/sales_orders?id=eq.${soId}`, { method: 'DELETE', headers: HEADERS });
          throw new Error(`sales_details POST ${dRes.status}: ${await dRes.text()}`);
        }

        // 3. POST accounts_receivable
        const arPayload = {
          id:            arId,
          customer_id:   item.customer_id,
          customer_name: item.customer_name,
          order_id:      soId,
          order_date:    dateStr,
          total_amount:  item.grand_total,
          paid_amount:   0,
          unpaid_amount: item.grand_total,
          status:        '未收款',
        };
        const arRes = await fetch(`${SB_URL}/accounts_receivable`, {
          method:  'POST',
          headers: { ...HEADERS, 'Prefer': 'return=minimal' },
          body:    JSON.stringify(arPayload),
        });
        if (!arRes.ok) {
          // rollback details + SO
          await fetch(`${SB_URL}/sales_details?order_id=eq.${soId}`, { method: 'DELETE', headers: HEADERS });
          await fetch(`${SB_URL}/sales_orders?id=eq.${soId}`,       { method: 'DELETE', headers: HEADERS });
          throw new Error(`accounts_receivable POST ${arRes.status}: ${await arRes.text()}`);
        }

        // 成功
        results.success.push({
          so_id:         soId,
          ar_id:         arId,
          wave_id:       item.wave_id,
          store:         item.short_name,
          customer_id:   item.customer_id,
          delivery_date: dateStr,
          detail_count:  item.details.length,
          grand_total:   item.grand_total,
        });
        console.log(`  ✅ ${soId} | ${item.short_name} | ${item.details.length} 筆 | $${item.grand_total}`);

      } catch (err) {
        results.failed.push({
          wave_id:       item.wave_id,
          store:         item.short_name,
          customer_id:   item.customer_id,
          attempted_id:  soId,
          error:         err.message,
        });
        console.error(`  ❌ ${soId} | ${item.short_name} | ${err.message}`);
      }
    }
  }

  // ═══ 輸出結果 ═════════════════════════════════════════════════════

  console.log('');
  console.log('%c────── 寫入結果 ──────', 'color:#059669; font-weight:bold; font-size:14px');
  console.log(`✅ 成功：${results.success.length} 張`);
  console.log(`❌ 失敗：${results.failed.length} 張`);
  if (results.failed.length > 0) {
    console.log('失敗清單：');
    console.table(results.failed);
  }
  const successAmt = results.success.reduce((s, r) => s + r.grand_total, 0);
  console.log(`成功總金額：$${successAmt.toLocaleString()}`);

  window._insertResult = {
    dry_run:                  false,
    success:                  results.success,
    failed:                   results.failed,
    skipped_details:          skippedDetails,
    skipped_missing_customer: skippedMissingCustomer,
    longtan_warn:             longtanWarn,
    skip_blacklist_wave:      skipBlacklistWave,
    potential_duplicate:      potentialDuplicate,
    summary: {
      success_count:             results.success.length,
      failed_count:              results.failed.length,
      success_amount:            successAmt,
      skipped_details:           skippedDetails.length,
      skipped_missing_customer:  skippedMissingCustomer.length,
      longtan_warn:              longtanWarn.length,
      skip_blacklist_wave:       skipBlacklistWave.length,
      potential_duplicate:       potentialDuplicate.length,
    }
  };

  await Swal.fire({
    title: results.failed.length === 0 ? '✅ 全部成功' : '⚠️ 有失敗',
    html:  `成功：<b>${results.success.length}</b> 張<br>失敗：<b>${results.failed.length}</b> 張<br>總金額：$${successAmt.toLocaleString()}`,
    icon:  results.failed.length === 0 ? 'success' : 'warning',
  });
  console.log('完整結果：window._insertResult');
})();
