# 2026-04-30 — 16staff 加「商品管理」分頁（products 表員工維護入口）

## 摘要

員工以前要建商品要做 2 次（開團總表填編號名稱 + index.html 補成本/分店價/廠商）。新流程改在 16staff 撿貨表加一個**商品管理**分頁，員工 inline 在這裡維護全部欄位（含成本、售價、分店價、廠商），同步到 Supabase `products` 表。

主流程：員工在開團總表填新團（B結單日/C編號/D名稱）→ 切到 16staff 商品管理分頁 → 按「📥 匯入指定結單日商品」→ 系統抓開團總表那天的商品 → 對 products 比對 → 已存在的自動帶價、新商品留空 → 員工補完 → 按「✅ 同步」→ 寫回 products。

備用流程：用「🔍 搜尋商品並補入」零星補某商品。

---

## 完成項目

### 1. SQL（2 支 RPC）

**Migration 檔（兩個）**：
- `docs/sql/migrations/2026-04-30_product_admin_rpc.sql`
  - `search_products_admin(secret, keyword, include_inactive, limit)` — 模糊搜尋 products
  - `upsert_product_admin(secret, id, name, cost, price, price_branch, unit, supplier, status)` — UPSERT

- `docs/sql/migrations/2026-04-30_get_products_by_ids_admin.sql`
  - `get_products_by_ids_admin(secret, ids[])` — 批次依編號查 products（給「匯入指定結單日商品」用）
  - 補強原版用 anon REST 直接查 products 的安全弱點（RLS 改動 / URL 太長都會靜默 fail，導致誤判成「新商品」）

**安全**：3 支 RPC 都走 admin_secret OR JWT role 二擇一，跟既有 *_admin RPC 一致。
**白名單**：upsert 必填驗證（編號/名稱/成本/售價/分店價）+ status 限 `啟用/停用` + 金額不可負數。

### 2. GAS — 商品管理_code.gs（新檔）

**檔案**：`google-apps-script/商品管理_code.gs`（~580 行）

**核心函式**：
| 函式 | 用途 |
|---|---|
| `pmSetupSheet` | 一次性建立「商品管理」分頁：表頭 + 欄寬 + 資料驗證（狀態下拉）+ 保護（admin only）+ 隱藏 |
| `pmImportByEndDate` | 從開團總表（17f4...）抓指定結單日商品 → 對 products 比對 → 寫入商品管理分頁 |
| `pmSyncSelected` | 同步選定列到 products（員工選取列 → 點選單）|
| `pmSyncAllUnsynced` | 同步所有「最後同步時間」空白的列到 products |
| `pmOpenSearchDialog` | 開搜尋 dialog（備用，零星補單筆商品）|

**安全 + 共用 helper**：
- 使用 16staff 既有的 `_callSimpleRpc_` / `_getAdminSecret_`（不重複定義）
- `_pmCheckAdmin_` 雙保險：onOpen 已限 admin 看選單，函式內再檢查 email
- 「商品管理」分頁啟用 Sheet protection + hideSheet（店家就算意外拿到網址也看不到）

### 3. GAS — ProductSearchDialog.html（新檔）

**檔案**：`google-apps-script/ProductSearchDialog.html`（~190 行）

員工備用的「🔍 搜尋商品並補入」dialog：
- 輸入編號或名稱 → search_products_admin RPC
- 已在商品管理分頁的編號 → 灰底不能勾（避免覆蓋本地修改）
- 勾選 → 補入到商品管理分頁
- 「含已停用」checkbox 預設不勾

### 4. GAS — 16staff_lookup_code.gs（修改 9 行）

**改動**：
- 拿掉舊 menu「📦 從 ERP 匯入商品（指定結單日）」（importProductsFromERP，舊路徑用 branchOrderList）
- 拿掉舊 menu「🎯 只同步全民（不動其他店）」（syncQuanminOnly，已過時）
- 在「── 開團前準備 ──」之後、「── 撿貨員每日流程 ──」之前插入新區塊：

```
── 商品管理 ──
🔧 初次設定（建立分頁）
📥 匯入指定結單日商品
✅ 同步選定商品到 products
✅ 同步全部未同步到 products
🔍 搜尋商品並補入
```

舊的兩個 importProductsFromERP / syncQuanminOnly 函式本體保留（孤兒 function，沒從 menu 觸發），未來可一起清掉。

---

## 設計決策

### 商品資料分頁欄位順序（D=售價 / E=成本）
員工建商品習慣先填 編號→名稱→**售價**（給散客的價格，店家對帳會看到）→ **成本**（內部毛利分析用）→ 分店價。所以 D 欄是售價、E 欄是成本（不是按字典序）。

### 不全拉 products 到商品管理分頁
products 表有 31,200 筆（啟用 4,728 / 停用 26,451）。一次拉全部 → Sheet 變慢、員工迷路。改採「員工工作清單」模式：
- 員工只在商品管理分頁放「正在處理 + 未來會用」的商品
- 跨月到貨情境（陸貨拖好幾個月）也保留得住
- 需要舊商品時用「搜尋並補入」單筆拉

### 匯入結單日不覆蓋既有列
員工已經補過成本/分店價的列，「匯入指定結單日商品」會跳過（PK = 編號）。避免 admin 重新匯入結單日洗掉員工本地修改。

### 同步以 Sheet 為主
員工在商品管理分頁編輯後按「✅ 同步到 products」會直接 UPSERT 覆蓋 products 表的同編號商品（含 cost / price / price_branch / unit / supplier / status）。設計目的：員工的 Sheet 是維護入口，products 是目標資料庫。

### 從 products 查詢用 RPC 不用 anon REST
原本 `_pmBatchLookupProducts_` 用 PostgREST anon SELECT 查 products，遇到 RLS 改動 / URL 太長 / 網路錯誤都會靜默吞掉，結果商品管理分頁出現「products 明明有但被誤判成🆕新商品」。改成走 `get_products_by_ids_admin` RPC，失敗會直接 throw 由呼叫端處理。

---

## DB 變更紀錄（2026-04-30）

- 新建 RPC（3 支）：
  - `search_products_admin`
  - `upsert_product_admin`
  - `get_products_by_ids_admin`

**沒動：** products schema、RLS、其他既有 RPC。

---

## 已知限制 / 設計取捨

1. **products 表 status NULL 21 筆**：搜尋時當「停用」處理（不勾「含已停用」就不會出現）。是否清乾淨等之後再評估。

2. **商品管理分頁的隱藏不是真隱藏**：Google Sheets 的 hideSheet 任何 editor 都能 unhide。真正擋住店家是「店家不知道網址」+ Sheet protection 的 editor 限 ADMIN_EMAILS。

3. **「含已停用」搜尋仍在 50 筆上限**：products 31,200 筆中啟用 4,728，搜尋常超過 50 筆。員工要多打幾個關鍵字精確化。

4. **員工建新編號要小心命名**：商品編號是 PK，員工亂取會跟 index 散客單編號規則衝突。建議跟現有編號規則一致（10 位數字）。

---

## 部署與測試紀錄

### SQL migration
- 在 Supabase SQL Editor 跑了 2 個 migration（2026-04-30_product_admin_rpc.sql + 2026-04-30_get_products_by_ids_admin.sql）
- 5 句測試 SQL 全通過：
  - search_products_admin 找「牛排」 ✓
  - upsert_product_admin 新建 ZZ_TEST_RPC_001 → action=inserted ✓
  - 同編號再 upsert → action=updated ✓
  - get_products_by_ids_admin 用 ARRAY['160203140','999999998'] 查 → 第一個有資料、第二個不在結果 ✓
  - DELETE 清測試資料 ✓

### GAS 部署
- 16staff Apps Script 加新檔 `商品管理_code.gs` + `ProductSearchDialog.html`
- 修改既有 `16staff_lookup_code.gs` onOpen menu
- 重整 16staff Sheet → 「🛠️ 開團管理」menu 看到新「── 商品管理 ──」區塊
- 跑「🔧 初次設定」建出商品管理分頁
- 跑「📥 匯入指定結單日商品」測試成功

---

## Git 還原點

無新 tag。重要還原點：
- lt-erp-simple-sales：`stable-20260430-monthly-report` / `stable-20260501-monthly-adjustments`
- lt-erp：本 commit 之後可考慮加 tag `stable-20260430-product-mgmt`（如有需要）

---

## 改動檔案清單

```
# lt-erp repo
docs/sql/migrations/2026-04-30_product_admin_rpc.sql           （新建，gitignored）
docs/sql/migrations/2026-04-30_get_products_by_ids_admin.sql   （新建，gitignored）
docs/changelog/2026-04-30-product-mgmt.md                      （新建，本檔）
google-apps-script/商品管理_code.gs                            （新建，~580 行）
google-apps-script/ProductSearchDialog.html                    （新建，~190 行）
google-apps-script/16staff_lookup_code.gs                      （修改 +7 -2 行 menu）
```
