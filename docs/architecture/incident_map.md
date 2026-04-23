# LT-ERP 事故地圖（incident_map）

> 建立日期：2026-04-21
> 目的：把高風險模組、已知 bug 機制、目前禁用操作整理成一眼可查的避雷表
> 讀者：未來 session 的 Claude、接手的工程師、稽核人員
> 對照：[CROSS_FILE_MAP.md](CROSS_FILE_MAP.md) 看檔案結構、本文看**事故風險**

---

## 目錄

1. [sales_orders 寫入家族完整地圖](#1-sales_orders-寫入家族完整地圖)
2. [4 類已知系統性 bug 與機制](#2-4-類已知系統性-bug-與機制)
3. [目前（2026-04-21 起）禁用操作總表](#3-目前2026-04-21-起禁用操作總表)
4. [可以安全用的操作](#4-可以安全用的操作)
5. [shared_kv 高風險 key 地圖](#5-shared_kv-高風險-key-地圖)
6. [解凍前置條件 checklist](#6-解凍前置條件-checklist)
7. [事故歷史索引](#7-事故歷史索引)

---

## 1. sales_orders 寫入家族完整地圖

### 1.1 寫入路徑分類

| 路徑類型 | 實例 | 機制 | 凍結狀態 |
|---------|------|------|---------|
| **RPC `web_save_sales_order`** | SalesOrder / PendingReview / branch_admin generateSalesOrder / showManualSOForm / batchIssueSO / restockAndClose / issueOfficialSalesOrder | SECURITY DEFINER 函式內部 INSERT + UPDATE | 🔴 全凍（5 個入口） |
| **RPC `web_batch_receive_payments`** | ReceivePayment | SECURITY DEFINER，內部 `UPDATE sales_orders SET payment_status = ar.status` | 🔴 凍（2026-04-21 補凍） |
| **REST POST sales_orders** | SalesReturn | 直接 `POST /sales_orders` 建新 RT 單 | 🔴 凍（2026-04-21 補凍） |
| **REST PATCH sales_orders** | branch_admin rtEditOrder / syncSalesOrderAmountToDB / syncReturnStatusToDB / SearchReturns editReturnOrder | 直接 `PATCH /sales_orders?id=eq.X` | 🔴 全凍 |
| **REST DELETE sales_orders** | branch_admin deleteSalesOrder / batchDeleteSO / SearchReturns voidReturnOrder / branch_admin rtVoidOrder | 直接 `DELETE /sales_orders?id=eq.X` | 🔴 全凍 |
| **間接寫入（admin 退貨處理）** | adminAcceptReturn / adminMarkShortage / adminWaiveReturn / adminRejectReturn / adminMarkReturnReceived | 改本機 mockSalesOrders → 呼叫 syncReturnStatusToDB / syncSalesOrderAmountToDB | 🔴 凍（admin 5 個入口直接擋） |

### 1.2 入口總覽（2026-04-21 凍結後的狀態）

| 檔案 | 函式 / 按鈕 | 凍結 commit | 替代方案 |
|------|-----------|------------|---------|
| SalesOrder.html | saveOrder（💾儲存 / 🖨️存檔並列印）| fd6686d | Google Sheets |
| PendingReview.html | approveSalesOrder / batchApproveSales | fd6686d | - |
| SearchReturns.html | editReturnOrder / voidReturnOrder | fd6686d | LINE/Excel |
| admin/branch_admin.html | generateSalesOrder（📋 暫存銷貨單）| fd6686d | Google Sheets |
| admin/branch_admin.html | showManualSOForm / batchIssueSO / issueOfficialSalesOrder / closeSalesOrder | fd6686d | Google Sheets |
| admin/branch_admin.html | restockAndClose（✅補發結案）| fd6686d | - |
| admin/branch_admin.html | rtEditOrder / rtVoidOrder | fd6686d | LINE/Excel |
| admin/branch_admin.html | deleteSalesOrder / batchDeleteSO（P1-a 補）| fd6686d | - |
| admin/branch_admin.html | adminAcceptReturn / adminMarkShortage / adminWaiveReturn / adminRejectReturn / adminMarkReturnReceived（P1-b 補）| fd6686d | LINE/Excel 記 |
| admin/branch_admin.html | syncReturnStatusToDB / syncSalesOrderAmountToDB | fd6686d | - |
| **ReceivePayment.html** | paymentForm submit（確認完成收款）| **7a10016** | LINE/Excel 記 |
| **SalesReturn.html** | submitReturn（✅確認開立退貨單）| **7a10016** | LINE/Excel 記 |

---

## 2. 4 類已知系統性 bug 與機制

### 2.1 BUG-014 — generateSalesOrder items 空/部分空傳

**症狀：** 揀貨完成自動開 21 張分店銷貨單，其中 N 張明細空白或不完整，但主檔 grand_total 有值。

**機制（推測）：** `for-await-of` 迭代呼叫 `web_save_sales_order` 時，某個全域狀態（wave 物件？shared mutable state？）被污染，後續迭代的 items 被清空/截斷。

**首次觀察：** 2026-03-26（Scan #3 發現的 14 張 SO20260326xxx 是「輕度版」）  
**規模最大：** 2026-04-14~16 連續 3 天，9 個 wave 共 102 張 $688,992.5  
**總計：** 104 張 $725,911

**觸發條件：** 「連續建 ≥ 2 張揀貨單的暫存銷貨單」高度相關（但還未完全驗證）

**根因未查：** 需要在下次揀貨分發時盯 F12 + 加 log：
```js
// 在 generateSalesOrder 的 for-await-of 前後 + await RPC 前後
console.log(JSON.stringify({ branch, items_len: items.length, items_qty: items.map(i=>i.qty) }));
```

**狀態：** 🔴 根因未修。所有進入路徑（generateSalesOrder, restockAndClose, batchIssueSO, issueOfficialSalesOrder 等）**全凍**。

---

### 2.2 BUG-015 — REST PATCH sales_orders 副作用

**症狀：** 透過 PostgREST REST API 做 `PATCH /sales_orders`（即使 body 不含 payment_status）→ `payment_status` 會被改成「已付款」。

**實測驗證（2026-04-21）：** `web_batch_receive_payments` RPC 內部雖然也 UPDATE sales_orders，但用 SQL UPDATE 不是 REST PATCH，**沒有**此副作用。

**機制不明：**
- `information_schema.triggers` 查 sales_orders → 空
- `sales_orders.payment_status` 的 column_default = `'未收款'`
- 可能是 RLS policy / Edge Function webhook / pg_rules / pg_policies 裡的某個隱藏規則

**下一步 debug：**
```sql
SELECT * FROM pg_rules WHERE tablename = 'sales_orders';
SELECT * FROM pg_policies WHERE tablename = 'sales_orders';
```

**狀態：** 🔴 機制未查。所有直接 REST PATCH sales_orders 的入口**全凍**。

**暫時對策：** 要修 sales_orders 欄位 → 用 Supabase SQL Editor 的 **SQL UPDATE**（實測 2026-04-21 14 張 subtotal 修補 0 副作用）。

---

### 2.3 BUG-001 — web_save_sales_order 覆寫 order_date（✅ 已修 2026-04-23）

**歷史症狀：** 開正式銷貨單後，該筆的 `order_date` 被 RPC 設為「建單當天日期」，而非原本的 wave.delivery_date 或手動指定日期。

**舊機制（02-28 備份版）：** `docs/sql/龍潭總倉ERP_全系統SQL備份_20260228.txt:119` 可見 RPC 裡有 `UPDATE sales_orders SET order_date = v_date`（v_date 不是原值）＋行 120 `UPDATE accounts_receivable SET order_date = v_date`。

**修復確認：** 2026-04-23 用 `SELECT pg_get_functiondef('web_save_sales_order'::regproc)` 取回 Supabase 現行版，UPDATE 兩條路徑均已移除 `order_date = v_date`。權威備份存於 [`docs/sql/backups/web_save_sales_order_BUG-001_fixed_2026-04-23.sql`](../sql/backups/web_save_sales_order_BUG-001_fixed_2026-04-23.sql)。

**狀態：** ✅ 已修。BUG-001 已不再是解凍阻擋條件，但 BUG-014（items 空傳）、BUG-015（PATCH 副作用）、04-20 源頭不明三條仍在。

---

### 2.4 04-20 批次 UPDATE 源頭不明

**症狀：** 2026-04-20 當天某個操作對 104 張 BUG-014 受害單做批次 UPDATE：
- `order_date` → 2026-04-20（全部）
- `payment_status` → 已付款（全部）

**規模：** 102 張 04-14~16 的受害單 + 2 張 04-02 的 PICK-757876 單。

**反證不是 Claude PATCH 造成：** `SO20260402015 / SO20260402026` 這 2 張 `note = null`（Claude 從未 PATCH 過），也被改壞 → 證明有**其他觸發源**。

**候選觸發源（猜想）：** 員工在 admin 點過某個批次按鈕？某條 Apps Script trigger？未知。

**修補：** 已用 SQL UPDATE 還原 104 張的 order_date 和 payment_status。

**狀態：** 🔴 源頭不明。若源頭還在 active，可能再發。解凍前須查清。

---

### 2.5 shared_kv 整包覆蓋風險

**症狀：** 某些資料以 JSONB 存在 `shared_kv` 表（例如 `portalSalesOrders`、`portalAllRequests`、`portalMutualAidBoard`、舊版 `branchOrders`），寫入時「整包讀 → 改 → 整包寫回」，跨裝置時可能把對方剛寫的資料洗掉。

**已修補：** `branchOrders` 改用 `merge_branch_order` RPC 原子合併（2026-04-11）。

**還有風險：**
- `PendingReview.html:427` 仍會整包讀 `portalSalesOrders` 再整包寫回（稽核提到的第 9 個危險函式）
- `portalAllRequests` / `portalMutualAidBoard` 沒有 RPC 保護
- `store_sheet.gs` 外部 Apps Script 也會寫 `sheetGroupBuyData` 到 shared_kv

**狀態：** ⚠️ 部分已修補。未修的 3 條路徑理論上仍可能重演「舊快照蓋新資料」事故。

---

## 3. 目前（2026-04-21 起）禁用操作總表

### 3.1 完全停用（按鈕灰色 + 點了跳警告）

**index.html 相關：**
- 📝 SalesOrder「💾儲存」「🖨️存檔並列印」
- 📋 PendingReview「✅確認開立」「✅批次確認開立」
- ✏️ SearchReturns「✏️編輯」「🗑️作廢」
- 📦 SalesReturn「✅確認開立退貨單」
- 💰 ReceivePayment「✅確認完成收款」

**admin/branch_admin.html 相關：**
- 📋 揀貨單「📋 暫存銷貨單」「📋 完成揀貨」（BUG-014 元凶）
- ➕ 銷貨單管理「新增銷貨單」
- ✅ 批次開立 / 🗑️ 批次刪除 / 🗑️ 單筆刪除
- 📁 銷貨單結案
- ✅ 欠品管理「補發結案」
- ✏️ 退貨單「編輯」「作廢」
- 🔄 admin 5 個退貨處理按鈕：接受退貨 / 標記補發 / 免退回扣款 / 不接受 / 確認收到

**DB 同步層：**
- `syncReturnStatusToDB`（PATCH sales_orders portal_status）
- `syncSalesOrderAmountToDB`（PATCH sales_orders grand_total）

### 3.2 技術手法

```js
const SALES_WRITE_FROZEN = true;  // 4 個檔案各一份
function checkSalesWriteFrozen(action) {
  if (!SALES_WRITE_FROZEN) return false;
  Swal.fire({ icon: 'warning', title: `${action}已停用`, text: FREEZE_REASON });
  return true;
}
// 所有危險函式入口：if (checkSalesWriteFrozen(...)) return;
// 所有危險按鈕：data-freeze-btn 屬性 → 自動灰化 + tooltip
// document click capture 攔截 → 點灰按鈕真的會跳警告
```

### 3.3 涵蓋檔案

| 檔案 | commit | 函式數 | 按鈕數 |
|------|--------|-------|-------|
| SalesOrder.html | fd6686d | 1 | 2 |
| PendingReview.html | fd6686d | 2 | 2 |
| SearchReturns.html | fd6686d | 2 | 2 |
| admin/branch_admin.html | fd6686d | 17 | 19 |
| ReceivePayment.html | 7a10016 | 1 | 1 |
| SalesReturn.html | 7a10016 | 1 | 1 |
| **總計** | | **24** | **27** |

---

## 4. 可以安全用的操作

### 4.1 完全不動（所有 READ）

- SearchSales 銷貨單查詢、ProductList 商品管理、Inventory 庫存
- MonthlyReport 月結報表、Receivablereport 應收帳款、CustomerMonthlyReport 客戶月結
- SearchReturns 退貨單查詢（編輯/作廢已凍）
- 列印、Excel 匯出

### 4.2 branch_portal 三條 RPC（稽核判定安全）

| RPC | 功能 | 為何安全 |
|-----|------|---------|
| `confirm_store_received(p_order_id)` | 分店確認收貨 | SECURITY DEFINER，只改 portal_status，已驗證無副作用 |
| `submit_return_report(...)` | 分店退貨回報 | SECURITY DEFINER，只改 sales_details.return_status 和 sales_orders.portal_status='disputed' |
| `revoke_store_confirmed(p_order_id)` | 分店撤銷確認 | SECURITY DEFINER，反向操作 |

### 4.3 進貨單、庫存、供應商

- `internal_purchases` / `internal_purchase_details`（走獨立 RPC，不影響 sales_orders）
- `inventory` / `inventory_logs`
- `suppliers` / `supplier_prices`

### 4.4 漂漂館、團購採購、退換貨、店轉店

- `xiaolan_*`（小瀾採購管理，獨立流程）
- `transfer_orders` / `transfer_items`（店轉店，走 transfer RPC）

---

## 5. shared_kv 高風險 key 地圖

| key | 寫入端 | 原子保護 | 風險 |
|-----|-------|---------|------|
| `branchOrders` | admin + portal + store_sheet.gs | ✅ RPC `merge_branch_order` | 已修補（2026-04-11） |
| `branchOrderList` | admin（ImportGroupBuy / syncToERP）| ❌ 整包寫 | ⚠️ key 格式已統一但遷移腳本未寫 |
| `portalSalesOrders` | portal + PendingReview | ❌ 整包寫（PendingReview 有寫回路徑）| 🔴 稽核第 9 個危險函式 |
| `portalAllRequests` | portal + admin | ❌ 整包寫 | 🔴 未保護 |
| `portalMutualAidBoard` | portal | ❌ 整包寫 | 🔴 未保護 |
| `lt_savedWaves` | admin | ❌ 整包寫（但有 QuotaExceeded 保護）| ⚠️ 不可自動清除（揀貨歷史）|
| `portalTrackingData` | admin（syncProcurementToPortal）| ✅ 直接從變數推（不從 localStorage）| 已修補（2026-04-18） |
| `sheetGroupBuyData` | store_sheet.gs（Apps Script 外部寫入）| ❌ 整包寫 | ⚠️ 系統外寫入點 |
| `xiaolan_pp_settings` | supplier_xiaolan + admin（讀）| ❌ 整包寫 | ✅ 已同步雲端（2026-04-19）|

---

## 6. 解凍前置條件 checklist

**解凍流程：** 4 個檔案各自找 `const SALES_WRITE_FROZEN = true` 改 `false` → 重整頁面即可。

**但解凍前必須先做完以下：**

### Must-have（硬性阻擋）

- [x] **修 BUG-001**（2026-04-23 確認）：Supabase 現行 RPC UPDATE 路徑已無 `order_date = v_date`（sales_orders 行 119 + accounts_receivable 行 120 都已拿掉）。權威備份補在 [`docs/sql/backups/web_save_sales_order_BUG-001_fixed_2026-04-23.sql`](../sql/backups/web_save_sales_order_BUG-001_fixed_2026-04-23.sql)。
- [ ] **修 BUG-014**：追出 `generateSalesOrder` items 空傳的觸發條件，加 log 或改寫迴圈
- [ ] **修 BUG-015**：查清 REST PATCH 為何會讓 payment_status 變成已付款（`pg_rules` / `pg_policies` 找隱藏觸發器），根治後才能解除 PATCH 凍結
- [ ] **追 04-20 源頭**：問員工 / 查 Supabase logs，鎖定批次 UPDATE 的觸發點，消除或凍住該路徑
- [ ] **修 3/26 類事故根因**：web_save_sales_order RPC 裡，也一併 UPDATE subtotal（不然主檔 subtotal 會永遠滯後）

### Should-have（強烈建議）

- [ ] **封 PendingReview.html portalSalesOrders 整包回寫**（稽核第 9 條）
- [ ] **封 store_sheet.gs 寫 shared_kv**（外部 Apps Script，需另外處理）
- [ ] **事故掃描上 prod**：5 個 scan + `incident_scan_results` 表 + Apps Script 排程每天 9/14/20 + 批次修補後加跑
- [ ] **branchOrders key 遷移腳本**：清掉舊純編號 key（但**極度小心**，目前遷移腳本會誤刪店家追討中的積壓訂單）

### Nice-to-have（可延後）

- [ ] portalAllRequests / portalMutualAidBoard 改用 RPC 原子合併（跟 branchOrders 同模式）
- [ ] sales_orders 加 `updated_at` 欄位（便於追蹤修改時間）
- [ ] RPC 層加審計 log（誰改了什麼）

---

## 7. 事故歷史索引

| 日期 | 事件 | 詳細紀錄 |
|------|------|---------|
| 2026-03-23 | SO-20260323-134 subtotal/grand_total 少 236（3/31 才從 PendingReview 補建）| Scan #3 發現（2026-04-21 修補）|
| 2026-03-26 | PICK-109389 17 張銷貨單有 14 張 subtotal ≠ grand_total（BUG-014 輕度版）| Scan #3 發現（2026-04-21 修補，$6,085）|
| 2026-04-02 | PICK-757876 2 張 $0 空白單 | docs/changelog/2026-04-21.md |
| 2026-04-14 | BUG-014 連續 3 張揀貨單 40 張空白 | docs/changelog/2026-04-21.md |
| 2026-04-15 | BUG-014 連續 3 張揀貨單 41 張空白 | docs/changelog/2026-04-21.md |
| 2026-04-16 | BUG-014 連續 2 張揀貨單 21 張空白 | docs/changelog/2026-04-21.md |
| 2026-04-20 | 批次 UPDATE 源頭不明，104 張 order_date + payment_status 被改壞 | docs/changelog/2026-04-21.md |
| 2026-04-20~21 | 補回 104 張 $725,911 明細 | docs/changelog/2026-04-21.md |
| 2026-04-21 | 稽核結論 + 凍結 22 個寫入函式 | notes/系統檢討/2026-04-21_稽核結論.md、commit fd6686d |
| 2026-04-21 | 補凍 ReceivePayment + SalesReturn | commit 7a10016 |
| 2026-04-21 | 首次事故掃描 5 項，修 15 筆 subtotal | commit d821c46（PR 未 merge）|
| 2026-04-21 | Scan #2 邏輯修正（±3 天容忍 + 排除 MANUAL）| commit 4fe850c |

---

## 🔒 Golden Rules（開工前 3 秒檢查）

1. **不要寫任何 `PATCH /sales_orders`**（BUG-015 副作用會讓 payment_status 被亂改）
2. **不要呼叫 `web_save_sales_order`**（~~BUG-001 order_date 覆寫~~ 已修 2026-04-23；但 **BUG-014 items 空傳仍未修** → 這條仍禁用）
3. **不要對 shared_kv 裡的 `portalSalesOrders` / `portalAllRequests` / `portalMutualAidBoard` 整包讀寫**
4. **要改 sales_orders 資料，用 Supabase SQL Editor 的 SQL UPDATE**（實測 2026-04-21 14 張 subtotal 修補 0 副作用）
5. **`branchOrders` 跨檔期殘值是店家追討中的真實訂單**，不要清（詳見 CLAUDE.md「絕對不要碰的事」）

---

建立日期：2026-04-21  
最後更新：2026-04-21
