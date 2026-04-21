-- ============================================================
-- 事故掃描 v1（2026-04-21 初版；Scan #2 於 2026-04-21 修正誤報邏輯）
-- ============================================================
-- 目的：每日抓「已經壞但還沒被人發現」的資料，read-only，不自動修
-- 執行方式：手動貼 Supabase SQL Editor 分別跑 5 段；驗證後再接 Apps Script 排程
-- 欄位名依據：docs/supabase/ 2026-04-16 schema 快照
-- ============================================================
-- 5 個 scan：
--   Scan #1 紅燈 - 主檔有金額但明細空白（BUG-014 類）
--   Scan #2 紅燈 - order_date 與單號日期不一致（BUG-001/015 類；已加 ±3 天容忍 + 排除 MANUAL）
--   Scan #3 黃燈 - subtotal 與明細合計不一致
--   Scan #4 紅燈 - 已付款但應收帳款沒跟上（BUG-015 fingerprint）
--   Scan #5 黃燈 - 孤兒 sales_details（主檔不存在）
-- ============================================================
-- 2026-04-21 實測結果（首次掃描 + Scan #2 修正前）：
--   Scan #1: 0 筆  ✅
--   Scan #2: 17 筆（全誤報 - 改用 ±3 天容忍 + 排除 MANUAL 後應該 0）
--   Scan #3: 15 筆（14 筆 3/26 已修；SO-20260323-134 已修）
--   Scan #4: 0 筆（會計當日 8 筆收款 0 副作用，驗證 SQL UPDATE 路徑安全）  ✅
--   Scan #5: 0 筆  ✅
-- ============================================================


-- ============================================================
-- Scan #1 紅燈｜主檔有金額但明細空白
-- ============================================================
-- 判定：sales_orders.grand_total != 0 且該單的 sales_details 筆數 = 0
-- 涵蓋：SO（正值）和 RT（負值）兩種
-- 誤報候選：作廢 = DELETE（不會留在表裡），所以不用再過濾「狀態」
-- 處理：紅燈須 30 分鐘內確認
-- ============================================================
select
  'scan_1_no_details'                as scan_type,
  'red'                              as severity,
  sales_orders.id,
  sales_orders.order_date,
  sales_orders.customer_name,
  sales_orders.grand_total,
  sales_orders.payment_status,
  sales_orders.portal_status,
  count(sales_details.id)            as detail_count
from sales_orders
left join sales_details
  on sales_details.order_id = sales_orders.id
group by
  sales_orders.id,
  sales_orders.order_date,
  sales_orders.customer_name,
  sales_orders.grand_total,
  sales_orders.payment_status,
  sales_orders.portal_status
having
  sales_orders.grand_total != 0
  and count(sales_details.id) = 0
order by
  sales_orders.order_date desc,
  sales_orders.id desc;


-- ============================================================
-- Scan #2 紅燈｜order_date 與單號日期不一致
-- ============================================================
-- 判定：ID 格式 ^(SO|RT)[0-9]{11,}$，拆出 ID 內嵌的日期與 order_date 比對
-- 涵蓋：SO、RT 前綴
-- 已排除：
--   - 舊格式 SO00001 / SO-20260323-134（無法從 ID 取日期）
--   - wave_id = 'MANUAL' 手動開單（使用者可自由填 order_date，本來就可能不等於 ID 日期）
--   - |delta| <= 3 天（容忍揀貨隔日出貨、深夜跨 UTC/Taipei 邊界誤報）
-- 誤報歷史（2026-04-21 首次掃描）：
--   - 17 筆誤報：PICK-854944 的 16 張隔日出貨單 + 1 張 MANUAL 手動單
--   - 都是 |delta| = 1 天的合法情況
-- 驗證：BUG-015 事件受害 102 張 order_date 被改到 04-20，而 ID 日期是 04-14~16
--        → |delta| = 4~6 天 > 3 天 → 此 scan 仍能抓到，無損偵測力
-- 處理：紅燈須 30 分鐘內確認；如為合法修改，記錄到 incident_scan_results.ignored_*
-- ============================================================
select
  'scan_2_date_drift'                                            as scan_type,
  'red'                                                          as severity,
  sales_orders.id,
  sales_orders.order_date,
  to_date(substring(sales_orders.id from 3 for 8), 'YYYYMMDD')   as parsed_date,
  sales_orders.order_date
    - to_date(substring(sales_orders.id from 3 for 8), 'YYYYMMDD') as delta_days,
  sales_orders.wave_id,
  sales_orders.customer_name,
  sales_orders.created_at
from sales_orders
where
  sales_orders.id ~ '^(SO|RT)[0-9]{11,}$'
  -- 排除手動開單（order_date 由人工自由填，無法驗證）
  and (sales_orders.wave_id is null or sales_orders.wave_id <> 'MANUAL')
  -- 容忍 ±3 天（揀貨隔日出貨、時區邊界）；超過才算真漂移
  and abs(
    sales_orders.order_date
      - to_date(substring(sales_orders.id from 3 for 8), 'YYYYMMDD')
  ) > 3
order by
  abs(
    sales_orders.order_date
      - to_date(substring(sales_orders.id from 3 for 8), 'YYYYMMDD')
  ) desc,
  sales_orders.order_date desc,
  sales_orders.id desc;


-- ============================================================
-- Scan #3 黃燈｜subtotal 與明細合計不一致
-- ============================================================
-- 判定：sales_orders.subtotal (未稅小計) 與 sum(sales_details.subtotal) 差異 > 0.5
-- 注意：比較的是 subtotal 不是 grand_total
--   grand_total = subtotal + tax_amount + shipping - deduction
--   若拿 grand_total 比對 details.subtotal，會因稅/運/扣而大量誤報
-- 容忍值 0.5：考慮 PostgREST 可能產生的浮點誤差
-- 處理：黃燈當天內複查；若 detail_count = 0 屬於 Scan #1 紅燈範疇
-- ============================================================
select
  'scan_3_subtotal_mismatch'                                   as scan_type,
  'yellow'                                                     as severity,
  sales_orders.id,
  sales_orders.order_date,
  sales_orders.customer_name,
  sales_orders.subtotal                                        as order_subtotal,
  coalesce(sum(sales_details.subtotal), 0)                     as details_total,
  sales_orders.subtotal - coalesce(sum(sales_details.subtotal), 0) as delta,
  sales_orders.tax_amount,
  sales_orders.shipping,
  sales_orders.deduction,
  sales_orders.grand_total
from sales_orders
left join sales_details
  on sales_details.order_id = sales_orders.id
group by
  sales_orders.id,
  sales_orders.order_date,
  sales_orders.customer_name,
  sales_orders.subtotal,
  sales_orders.tax_amount,
  sales_orders.shipping,
  sales_orders.deduction,
  sales_orders.grand_total
having
  abs(sales_orders.subtotal - coalesce(sum(sales_details.subtotal), 0)) > 0.5
order by
  abs(sales_orders.subtotal - coalesce(sum(sales_details.subtotal), 0)) desc;


-- ============================================================
-- Scan #4 紅燈｜已付款但應收帳款沒跟上（BUG-015 fingerprint）
-- ============================================================
-- 判定：sales_orders.payment_status = '已付款' 但以下任一成立：
--   (A) accounts_receivable 無對應紀錄（ar.id is null）
--   (B) accounts_receivable.status 不是 '已收款'
--   (C) accounts_receivable.paid_amount < accounts_receivable.total_amount
-- 為什麼不查 payment_received：
--   payment_received.order_id 實際存的是 customer_id（SCHEMA_QUICK_REF 已注）
--   → 無法直接關聯單號，須透過 accounts_receivable 中介
-- 2026-04-20 那批未知批次 UPDATE 把 payment_status 改成「已付款」但
-- 沒碰 accounts_receivable，正是這個 scan 能抓的 fingerprint
-- 處理：紅燈須 30 分鐘內確認
-- ============================================================
select
  'scan_4_payment_status_diverge'         as scan_type,
  'red'                                   as severity,
  sales_orders.id,
  sales_orders.payment_status             as so_payment_status,
  accounts_receivable.status              as ar_status,
  accounts_receivable.total_amount        as ar_total,
  accounts_receivable.paid_amount         as ar_paid,
  accounts_receivable.unpaid_amount       as ar_unpaid,
  sales_orders.grand_total,
  sales_orders.order_date
from sales_orders
left join accounts_receivable
  on accounts_receivable.order_id = sales_orders.id
where
  sales_orders.payment_status = '已付款'
  and sales_orders.grand_total > 0
  and (
    accounts_receivable.id is null
    or accounts_receivable.status <> '已收款'
    or accounts_receivable.paid_amount < accounts_receivable.total_amount
  )
order by
  sales_orders.order_date desc,
  sales_orders.id desc;


-- ============================================================
-- Scan #5 黃燈｜孤兒 sales_details
-- ============================================================
-- 判定：sales_details.order_id 指向不存在的 sales_orders.id
-- 風險：主檔被 DELETE 但明細沒清，或明細先寫入主檔後來失敗
-- 處理：黃燈當天內複查；確認是殘留垃圾後手動清
-- ============================================================
select
  'scan_5_orphan_details'    as scan_type,
  'yellow'                   as severity,
  sales_details.id,
  sales_details.order_id,
  sales_details.product_name,
  sales_details.qty,
  sales_details.unit_price,
  sales_details.subtotal
from sales_details
left join sales_orders
  on sales_orders.id = sales_details.order_id
where
  sales_orders.id is null
order by
  sales_details.id desc;
