# 2026-04-28 — 補入 180 張歷史銷貨單到 simple_sales_orders（4/22~4/28）

## 摘要

`sales_orders` 寫入凍結期間（4/21 起，BUG-014/015 止血），4/22~4/28 共 11 張 branch_admin 揀貨單（PICK-XXXXXX）撿完貨後沒有對應的銷貨單建到 `simple_sales_orders`。本次工作把這 11 張 PICK 拆成「PICK × 店家 = 1 張單」共 180 張單補入 `simple_sales_orders`，金額 $1,540,344，全部 finalize 為「已建單」狀態，月結報表算得到。

不動 `sales_orders`（凍結中）、不動 `products`、不動其他既有 RPC。

---

## 動機

凍結 sales_orders 寫入是為了止 BUG-014/015 的血，但後果是 4/22 起店家撿完貨沒有銷貨單可對帳。本次先把這段歷史洞補到新雙軌 `simple_sales_orders`（不在凍結範圍），等新 ERP 上線再說 sales_orders 的事。

---

## 涉及範圍

### 來源（branch_admin 揀貨歷史）

| 出貨日 | PICK ID | 店數 | 件數 | 金額 |
|---|---|---|---|---|
| 2026-04-22 | PICK-167717 | 17 | 5,317 | $362,235 |
| 2026-04-23 | PICK-722554 | 17（過濾龍潭）| 381 | ~$45,720 |
| 2026-04-23 | PICK-402810 | 17 | 4,185 | $356,549 |
| 2026-04-24 | PICK-434426 | 17 | 4,502 | $305,842 |
| 2026-04-24 | PICK-667257 | 17 | 330 | $31,500 |
| 2026-04-27 | PICK-547535 | 17 | 2,721 | $242,154 |
| 2026-04-27 | PICK-654368 | 15 | 308 | $40,718 |
| 2026-04-28 | PICK-362201 | 17（過濾龍潭）| 1,628 | ~$103,355 |
| 2026-04-28 | PICK-466281 | 17 | 742 | $33,489 |
| 2026-04-28 | PICK-777152 | 15 | 121 | $12,568 |
| 2026-04-28 | PICK-170016 | 14 | 190 | $5,890 |
| **合計** | **11 張 PICK** | **180 張單** | **20,418 件** | **$1,540,344** |

### 各店補單分布

| 店家 | 單數 | 不到 11 張的原因（對照原揀貨單缺少該店）|
|---|---|---|
| 三峽、中和、南平、古華、四號、文山、松山、林口、永和、泰山、湖口、環球、經國 | **11** | 11 張 PICK 全涵蓋 |
| 平鎮、忠順 | **10** | PICK-170016 沒涵蓋 |
| 萬華 | **9** | PICK-654368 / PICK-777152 沒涵蓋 |
| 全民 | **8** | PICK-654368 / PICK-777152 / PICK-170016 沒涵蓋 |

---

## 流程設計

### 7 階段保守流程

```
Step 0: schema 確認 (simple_sales_orders 含 wave_id + UNIQUE 防重複)
Step 1: 查重 (11 張 wave_id 在 simple_sales_orders 是否已存在 → 0 筆,可安全補)
Step 2: branch_admin Console 拉揀貨單明細 → 預覽清單
        342 個不重複 SKU,1 個缺 price_branch,1 個 cost=0
Step 3: admin 補完缺價商品 → 重跑 dry-run 全達標
Step 4: dry-run (不送 RPC,只組 payload + 印每張單的 order_date 對照)
Step 5: TRIAL 1 張試水溫 (用第 5 步腳本,模式 TRIAL)
Step 5e: SQL 驗證 8 項 + finalize TRIAL 試水溫
Step 5f: FULL 跑剩下 179 張 (含 3 個保險:預覽前 3 張、二次確認、150ms delay)
Step 5g: simple_finalize_orders_batch RPC 把 179 張暫存轉「已建單」(分 2 batch:100+79)
Step 5h: SQL 對帳 17 家店分布 + 整體統計
```

### 安全機制

| 機制 | 防什麼 |
|---|---|
| TRIAL/FULL 兩階段 | 第 1 張就出問題不會跑全部 |
| 二次 confirm（FULL 要輸入「FULL 180」）| 避免誤觸 Enter |
| 每張獨立 try/catch | 第 N 張失敗不影響後面 |
| RPC 內建 wave_id+store duplicate 防護 | 重跑不會建重複單 |
| RPC 內建 `WHERE is_draft=TRUE` 過濾 | finalize 重跑不會誤改已 finalize 的 |
| 每張 fetch 後 150ms delay | 避免突發 rate limit |
| 預覽前 3 張 console.table | TRIAL 前再目視 order_date 一次 |

---

## 關鍵設計決策

### 1. 用現有 RPC `simple_create_sales_order`，不寫 SQL INSERT

| 比較 | RPC 路徑（採用） | SQL INSERT |
|---|---|---|
| 流水號 SS-YYYYMMDD-NNN | RPC 內 advisory lock 自動產 | 要自己算 |
| 從 products 抓價 | RPC 內自動 | 要自己 join |
| Transaction | 整張 RPC 包 | 要自己包 |
| 跟 16staff 一致性 | ✅ 同一條路 | ❌ 邏輯分裂 |

### 2. order_date 用 `wave.delivery_date`，不是 `wave.date`

**這是過程中踩到的雷**：第一次 TRIAL 用 `wave.date`（揀貨單建立時間）導致 PICK-167717 三峽那張的 order_date 變成 2026-04-28（建單日）而不是 2026-04-22（出貨日）。

修正：對照 `branch_admin.html generateSalesOrder` line 4852 的原版邏輯 `wave.delivery_date`，dry-run 重跑後 11 張 PICK 的 order_date 才對到 4/22 / 4/23 / 4/24 / 4/27 / 4/28。

教訓：銷貨單的 order_date 業務上 = 出貨日（delivery_date）≠ 建單時間。

### 3. 過濾「龍潭」

「龍潭」這欄在揀貨單裡是「總倉幫山張、買上癮等團購店代叫的貨」，不是分店銷貨：
- store_name 對不上 lt-erp-simple-sales 月結店家清單
- 客戶身份混淆（多個團購店聚合在「龍潭」一欄）
- 沒有店家帳號 / portal

PICK-722554 / PICK-362201 各 1 張龍潭單共 2 張被過濾掉，從 182 → 180 張。
龍潭代叫的貨另案處理。

### 4. 價格用「現在」的 products.price_branch，不回溯歷史

`simple_create_sales_order` v3.2 RPC 自動從 `products` 抓 `price_branch` 跟 `cost`。如果這 9 天 price_branch 調過，補出來的金額會跟當時不同。但討論後決定可接受（products 是正式價格來源）。

補單前先檢查 342 個 SKU：
- products 表查不到：0 個
- price_branch 為空：1 個（編號 399100... 「超密遮...」）→ admin 直接 PATCH products 補
- cost 為空：1 個（編號 360407... 「日本養...」）→ 順手補

### 5. status='暫存' 必須 finalize

04-27 migration 把 RPC 改成兩階段提交：
- 一鍵建單 → `is_draft=true`, `status='暫存'`
- 「✅ 確認送出」→ `is_draft=false`, `status='已建單'`

`get_monthly_summary_admin` line 209-210 明確過濾 `is_draft=true OR status='暫存'`，所以暫存單**不會進月結**。我們的 180 張全部需要 finalize 才達到目標。

走 `simple_finalize_orders_batch` RPC 而非手動 UPDATE：避免漏改 `finalized_at` / `finalized_by` 欄位。

### 6. 沒 double count 風險

月結 RPC 是雙來源加總：`simple_sales_orders`（新）+ `sales_orders`（舊主系統）。但 4/21 起 `sales_orders` 寫入凍結 → 4/22~4/28 主系統沒新單 → 補進 `simple_sales_orders` 不會跟主系統重複。

---

## DB 變更紀錄（2026-04-28）

- **新增 180 筆**：`simple_sales_orders`，全部 `source='manual_backfill_20260502'`、`status='已建單'`、`is_draft=false`、`finalized_by='www161616@lt-erp.com'`
- **新增 N 筆**：`simple_sales_details`（每張單 N 個 SKU，總明細數量待精算）
- **PATCH 2 筆**：`products` 補完 1 個 price_branch（399100...）+ 1 個 cost（360407...）

**沒動：**`sales_orders`（凍結中）、`sales_details`、`xiaolan_*`、`branch_*`、其他既有 RPC、schema。

---

## 對帳結果（最終驗證）

```
Total Orders:         180 ✅
Distinct Stores:       17 ✅ (不含龍潭)
Distinct Waves:        11 ✅ (對應 11 張 PICK)
Total Amount:  $1,540,344 ✅ (跟 dry-run 預估完全一致)
Finalized Count:      180 ✅ (全部 status='已建單')
Still Draft Count:      0 ✅ (沒有殘留暫存)
```

整體統計：`total_qty=20,418`、`total_amount=$1,540,344`。

各店分布加總：11×13 + 10×2 + 9 + 8 = **180** ✅

---

## 已知限制 / 設計取捨

1. **價格凍結為「補單當下」的 price_branch**：如果 4/22~4/28 期間調過價，差異不會回溯。實務上 9 天內 price_branch 通常不變，可接受。

2. **明細 unit_price = price_branch（分店價）**：揀貨單修正面板上員工填的單價（如果有）**不會**用，全部以 products 表為準。

3. **退貨單沒補**：4/22~4/28 期間店家如果有退貨回報，本次只補銷貨單沒補退貨。退貨後續另案處理。

4. **store_name 用短名**（「三峽」「中和」），跟 branch_admin 揀貨單 alloc 的 key 對齊，跟 lt-erp-simple-sales 月結店家清單對齊。

5. **picker_email = www161616@lt-erp.com**：admin 個人帳號 finalized_by。如要追溯「哪天哪個員工撿的」，需要從 branch_admin 揀貨歷史另查。

6. **`finalized_at = 2026-04-28 12:34`**：全部 180 張都是同一時刻 finalize（補單腳本跑完那一刻），不是揀貨當時。

---

## 部署與測試紀錄

### 過程中的踩雷修正

1. **第一次 TRIAL order_date 錯**：用 `wave.date` 導致變成 4/28 建單時間 → 改用 `wave.delivery_date` 對到出貨日 → DELETE SS-20260428-001 重做
2. **TRIAL finalize 漏 admin_secret**：第一次寫 finalize batch 腳本忘了 `p_admin_secret` 參數 → 補上後成功

### Console 腳本流程（branch_admin.html）

| 步驟 | 腳本 | 結果 |
|---|---|---|
| 預覽 | dry-run v1（用 wave.date）| order_date 錯 |
| 修正 | dry-run v2（用 wave.delivery_date）| 11 張日期全對 |
| TRIAL | 第 5 步 actual run / TRIAL 模式 | SS-20260422-001 ✅ |
| FULL | 第 5 步 actual run / FULL 模式 | ✅179 ⚠️1 ❌0（41.1s）|
| FINALIZE | finalize batch 100+80 | finalized=179 ✅ |

### SQL 驗證

主表 + 明細 + 月結 RPC 三層驗證全通過，數據在三峽 4 月可查到 1 張 simple 單 + 38 張 legacy 單 = 39 張（月結雙來源加總）。

---

## Git 還原點

無新 tag。本次工作純粹 console 操作 + RPC 呼叫，沒改 git 追蹤的 .html / .gs / .sql 程式碼。

如需「還原這 180 張單」，跑：
```sql
DELETE FROM simple_sales_orders WHERE source = 'manual_backfill_20260502';
-- ON DELETE CASCADE 會自動清明細
```

---

## 改動檔案清單

```
# lt-erp repo
docs/changelog/2026-04-28-backfill-180-orders.md   （新建,本檔）

# 沒改任何 .html / .gs / .sql / *.js / *.css
# 純粹 console 腳本 + Supabase RPC 呼叫
```

---

## 還沒做的後續工作

1. **樂樂匯入 patch 部署到 GAS（中優先）**
   - 本機 `google-apps-script/開團總表_code.gs` 已修 `processCsvData` 加 try/catch + blockedItems（治本不會撞到結單鎖定）
   - **還沒貼到 GAS 雲端**
   - 古華店之前撞過的問題，當下能用是運氣（暫時性 hiccup 過了）
   - 不部署 = 留地雷，下次再撞還是炸

2. **lt-erp-simple-sales 前端視覺驗證**
   - 對帳 SQL 全通過，但建議 admin 在前端隨機點 2~3 張單看明細
   - 確認月結報表 4/22~4/28 各店有合理金額

3. **退貨單補做（低優先）**
   - 4/22~4/28 期間如果店家有退貨回報，本次沒補
   - 退貨資料來源：branch_admin 的 `mockInquiries`（需另案）

---

## 工程教訓

1. **修 bug 規格（CLAUDE.md Phase 1）救了這次工作**：每一步都先列影響範圍 + 風險點等「對」才動手，過程中踩到 2 個雷（order_date、admin_secret）都因為 TRIAL 試水溫設計被擋下，沒造成髒資料。

2. **「ID 對得上 = 商業意義對得上」是錯覺**：「龍潭」雖然在揀貨單 alloc 裡有數字，但商業意義是「代叫貨」，不是「分店銷貨」。要主動問清楚再過濾。

3. **schema 細節決定流程**：`simple_create_sales_order` v3.2 寫死 `status='暫存'`，必須走 `simple_finalize_orders_batch` RPC 才能進月結。看 RPC 簽章不夠，要看主表 default + CHECK + 月結 RPC 的篩條件。

4. **「沿用原版邏輯」勝過「重新設計」**：order_date 應該抄 `branch_admin.html generateSalesOrder` line 4852 的 `wave.delivery_date`，自己重新解釋 R2 的「PICK 日期」反而踩雷。
