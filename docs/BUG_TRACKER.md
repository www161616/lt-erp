# LT-ERP Bug Tracker (2026-04-16 掃描)

> 一件一件來，每次修一個問題前先讀這份文件確認影響範圍，修完打勾。
> 修之前務必備份，修之後務必跨角色測試。

## 歷史教訓（每次修完 bug 都要更新這裡）

| 日期 | 修了什麼 | 根本原因 | 下次怎麼避免 |
|------|---------|---------|------------|
| 04/17 | saveBranchSetting 加 on_conflict=store_name,setting_key 修正 409 | PostgREST upsert 沒指定 on_conflict 時預設用 PK，遇到複合 UNIQUE 會失敗 | 所有複合 UNIQUE 的 upsert 必須在 URL 加 ?on_conflict=col1,col2 |
| 04/16 | BUG-011: SalesReturn activity_logs 空 catch → 加 console.error | 空 catch 吞掉所有錯誤，稽核軌跡遺失無提示 | 寫 try-catch 時不要用空 catch，至少 console.error |
| 04/16 | BUG-010: SalesOrder 客戶資料 fetch 空 catch × 2 → 加 console.warn | 同上，Excel 匯出缺欄位但無任何提示 | 同上 |
| 04/16 | BUG-009: admin 退貨處理後 return_status + portal_status 寫回 DB | 四個函式只改 local memory 沒寫 DB，syncSalesOrdersToPortal 是空函式 | 改狀態後一定要同步寫 DB，不能只改記憶體 |
| 04/16 | BUG-003: SalesReturn 庫存回補加 res.ok 檢查 + 失敗警告 | PATCH/POST 沒檢查回應，靜默失敗顯示成功 | 所有寫入操作都要檢查 res.ok，失敗要告訴使用者 |
| 04/16 | BUG-006: PendingReview 5 處 PATCH 加 res.ok 檢查 | 轉單/駁回/回寫狀態沒驗證回應，可能資料不一致 | 同上 |
| 04/16 | BUG-004: submitOrder 加防連點 (_submitting + disabled + finally) | async 函式無 re-entry guard，連點重複觸發 RPC | 所有 async 按鈕操作都要加防連點 |
| 04/16 | BUG-005: branch_admin 16 處 bare await 加 res.ok 檢查 (inventory/procurement_followup/transfer/picking/xiaolan) | 大量 PATCH/DELETE 沒檢查回應，靜默失敗 | bare await 是 anti-pattern，所有寫入都要驗證 |
| 04/16 | BUG-007: cloudSave 序列化保護 + beforeunload + 同步指示 | fire-and-forget 多次呼叫導致 RPC race condition (整店資料覆寫，後到的舊資料蓋掉新資料) | 連續觸發的 async write 必須序列化，否則整資料覆寫型 RPC 會丟資料 |

---

## 修復原則 (每次修 bug 前必讀)

1. **只改目標區塊** — 不順手重構旁邊的 code
2. **改之前 grep 所有呼叫端** — 確認沒有漏改
3. **改完用 store + admin 帳號各跑一輪** — 不能只測 admin
4. **靜默失敗比 crash 更危險** — 寧可 Swal 報錯也不要空 catch
5. **commit 備份再改下一個** — 一個 commit 只修一個問題

---

## 🔴 嚴重 (資料遺失/損壞)

### BUG-001: order_date 被覆寫 (根因已定位)
- **狀態**: [ ] 未修
- **嚴重度**: 🔴 嚴重 — 已損壞 149 筆，隨時再發生
- **根因**: `web_save_sales_order` RPC 的 UPDATE 路徑會覆寫 `order_date = v_date`。branch_admin.html 所有呼叫端都把 `order_date` 設成當天日期。如果傳入的 orderData 帶有既存的 order_id（edit mode），RPC 就會把舊單的 order_date 改成今天。
- **涉及檔案**: admin/branch_admin.html, docs/sql/lt_erp_backup.sql (RPC 定義)
- **涉及位置** (branch_admin.html 中呼叫 web_save_sales_order 的地方):
  - ~第 4735 行: `order_date: dateStr` (generateSalesOrder 迴圈)
  - ~第 6274 行: `order_date: dateStr` (欠品補貨)
  - ~第 9192 行: `order_date: dateStr` (手動建單)
  - ~第 9526 行: `order_date: dateStr` (批次開單)
  - ~第 11699 行: `order_date: new Date()...` (手動建單)
  - ~第 11730 行: `order_date: today...` (批次)
  - ~第 11945 行: `order_date: bToday...` (補貨)
  - ~第 12614 行: `order_date: today...` (建單)
- **修法方向**:
  - A) RPC 端: 如果是 UPDATE (order_id 已存在)，不更新 order_date
  - B) 前端: 確保只有新建才帶 order_date，edit mode 不傳此欄位
  - C) 兩邊都改最安全
- **測試項目**:
  - [ ] 新建銷貨單 → order_date 正確
  - [ ] 編輯銷貨單 → order_date 不被改動
  - [ ] 用 SQL 確認 UPDATE 語句不再覆蓋 order_date
- **風險**: 改 RPC 要注意其他呼叫端 (SalesOrder.html, PendingReview.html) 的行為是否受影響

---

### BUG-002: portalSalesOrders 整份覆蓋 + 確認/退貨狀態只存記憶體
- **狀態**: [ ] 未修
- **嚴重度**: 🔴 嚴重 — 資料隨時可能遺失
- **問題 A — 整份覆蓋**:
  - PendingReview.html ~第 426-446 行: 讀整份 array → 改一筆 → 寫回整份
  - 如果 admin 和 store 同時操作，後寫的覆蓋前寫的
- **問題 B — 狀態只存記憶體**:
  - branch_portal.html ~第 5309 行: `order.storeConfirmedAt = ts` → 只改 local memory，沒寫回 shared_kv
  - branch_portal.html ~第 5358-5362 行: `item.returnStatus = 'requested'` → 只改 local memory
  - 關掉分頁 or PendingReview 覆寫 → 確認收貨/退貨回報資料消失
- **涉及檔案**: PendingReview.html, branch/branch_portal.html
- **修法方向**: (這是較大的重構，需要分步驟)
  1. 先確保 branch_portal 修改後有寫回 shared_kv (短期止血)
  2. 長期: portalSalesOrders 完全改讀寫 DB (sales_orders + sales_details 已有對應欄位)
- **⚠️ 這是搬家型改動**: 必須遵守 CLAUDE.md 搬家型改動強制規則
- **測試項目**:
  - [ ] store 確認收貨 → 重整頁面 → 狀態仍在
  - [ ] store 退貨回報 → admin 同時審單 → 退貨狀態不被覆蓋
  - [ ] 多店同時操作 → 互不影響

---

### BUG-003: SalesReturn.html 庫存更新無錯誤檢查
- **狀態**: [x] 已修 (2026-04-16)
- **嚴重度**: 🔴 嚴重 — 庫存錯誤難追溯
- **問題**: 退貨時 PATCH inventory 和 POST inventory_logs 都沒有檢查 res.ok
- **涉及檔案**: SalesReturn.html
- **涉及位置**:
  - ~第 427-430 行: PATCH inventory → 無 res.ok 檢查
  - ~第 431-440 行: POST inventory_logs → 無 res.ok 檢查
  - ~第 458 行: POST activity_logs → 空 catch(e) {}
- **修法**: 加 `if (!res.ok)` 檢查 + Swal 報錯 + 整筆退貨 rollback 或至少警告
- **測試項目**:
  - [ ] 正常退貨 → 庫存回補 + log 寫入
  - [ ] 模擬 RLS 擋住 → 顯示錯誤訊息，不顯示「成功」
  - [ ] 空值商品退貨 → 不 crash

---

### BUG-004: submitOrder 沒有防連點
- **狀態**: [x] 已修 (2026-04-16)
- **嚴重度**: 🔴 嚴重 — 每天分店都在用
- **問題**: submitOrder() 是 async 但按鈕沒有 disabled，連點會觸發重複 RPC
- **涉及檔案**: branch/branch_portal.html
- **涉及位置**:
  - ~第 351 行: 按鈕定義，無 disabled
  - ~第 2548-2660 行: submitOrder 函式，無 re-entry guard
- **修法**: 函式開頭加 `if (_submitting) return; _submitting = true;` + 按鈕 disabled + finally 解除
- **測試項目**:
  - [ ] 快速連點 → 只送出一次
  - [ ] 送出失敗 → 按鈕恢復可點
  - [ ] 正常送出 → 流程不受影響

---

### BUG-012: portalAllRequests 整份覆蓋（Admin 端 6 處寫入點）
- **狀態**: [ ] 未修
- **嚴重度**: 🔴 嚴重 — 店家需求單會消失，admin 也收不到
- **症狀**: 店家填需求單、按送出看起來成功，重整頁面後消失，admin 的需求與欠品管理也看不到
- **根因**:
  `portalAllRequests` 是整份 array 存在 shared_kv。admin 的 6 個寫入點全部是「讀本機 snapshot → 改一筆 → 整份 POST 覆蓋雲端」，且 cloudSave 是 fire-and-forget。admin 長時間開著 branch_admin 頁面時，本機 snapshot 會落後於雲端。只要 admin 做任何操作觸發 cloudSave，就會把店家剛送的新需求單整份覆蓋掉。
- **時間軸範例**:
  - T+0：store 送新需求 → await cloudSave → 雲端多 1 筆 ✓
  - T+30min：admin 早上 10 點開的 branch_admin 頁面還在，本機 portalAllRequests 是 10 點的 snapshot（沒那筆新需求）
  - T+31min：admin 回覆另一筆舊需求 → syncReplyToPortal → cloudSave → 本機整份推回雲端 → 店家的新需求被覆蓋
  - store 重整頁面 → cloudLoadAll 從雲端拉 → 看到被覆蓋後的版本 → 需求單消失
- **涉及檔案**: admin/branch_admin.html
- **涉及位置（6 處）**:

| 行號 | 函式 | 操作 |
|------|------|------|
| 6796 | toggleDemandComplete | 切換完成狀態 |
| 6869 | deleteDemandItem | 刪除單筆需求 |
| 8547 | adminCreateAidDemand | 互助補發自動建需求 |
| 8651 | 批次刪除需求（lambda） | 批次刪除 |
| 8932 | CSV 匯入 | 批次匯入需求 |
| 8995 | syncReplyToPortal | 回覆需求 |

- **修法方向**: fetch-before-write helper（最小可行方案）
  1. 加 async helper `safePortalRequestsUpdate(mutatorFn)`：先從雲端拉最新 → 寫入本機 → 跑 mutator → **await** cloudSave（注意這個 await 不能漏）
  2. 6 個寫入點改成呼叫 helper
  3. grep 所有呼叫鏈，涉及函式改 async 後，呼叫端可能要跟著改 async
- **已知限制**:
  - 不是真正 atomic，還有 ~100ms 的 race window（fetch 拉到推回雲端中間）
  - 每次操作多一個 HTTP 往返（約 100-200ms 延遲，使用者感受不到）
  - 真正根治需要做 RPC（類似 branchOrders 的 `merge_branch_order`），但需要動 DB，風險較大，之後再評估
- **測試項目**:
  - [ ] store 送需求 → 立刻重整 → 看得到
  - [ ] store 送需求 + admin 同時回覆別筆需求 → 兩邊都有
  - [ ] admin 回覆 → store 重整 → 有回覆內容
  - [ ] admin CSV 批次匯入期間 store 送需求 → 兩邊都有（至少不會靜默丟失）
  - [ ] 網路斷線時 admin 操作 → 失敗有提示（不是假成功）
- **Portal 端暫時不動**: `deleteRequest` / `editRequest` 雖然也有 stale 問題，但 store 只改自己的需求，衝突機率極低。優先修 admin，portal 等觀察一段時間再決定
- **相關**: 跟 BUG-002（portalSalesOrders 整份覆蓋）同型問題，但資料不同、修法可獨立

---

## 🟠 中等 (功能異常 / 靜默失敗)

### BUG-005: branch_admin 多處 PATCH/DELETE 無錯誤處理
- **狀態**: [x] 已修 (2026-04-16) — ⚠️ 2026-04-16 發現遺漏項目：branch_portal.html `saveBranchSetting`
- **嚴重度**: 🟠 中等 — 操作靜默失敗
- **問題**: 以下位置全部是 bare `await fetch()` 沒有 res.ok 檢查
- **涉及檔案**: admin/branch_admin.html, branch/branch_portal.html (遺漏)
- **涉及位置**:

| 約略行號 | 操作 | 表 | 影響 |
|----------|------|----|------|
| 10402, 10416, 10459 | PATCH | inventory | 庫存調整靜默失敗 |
| 10403, 10417, 10460 | POST | inventory_logs | 異動記錄遺失 |
| 7688, 7696, 7702 | PATCH | procurement_followup | 追蹤狀態沒更新 |
| 8624-8625 | DELETE | transfer 相關 | 刪除靜默失敗 |
| 3766 | DELETE | br_picking_items | 揀貨品項刪不掉 |
| 13365, 13913, 13927 | PATCH/DELETE | xiaolan 表 | 小瀾資料操作無回饋 |

#### ⚠️ 2026-04-16 補充遺漏項目：branch_portal.html `saveBranchSetting`
- **位置**: branch/branch_portal.html ~第 6693-6702 行
- **問題**: POST `branch_settings` 表 bare await fetch，無 res.ok 檢查，catch 只 console.error 不提示使用者
- **影響**: 行事曆事件/備忘錄、自訂網址、常用語錄儲存靜默失敗（店長實際遇到）
- **呼叫端共 10 處**: migrateBranchSettings (3) / loadMemos 舊版轉換 (1) / addMemo / deleteMemo / addCustomLink / removeCustomLink / addPhrase / removePhrase / saveMemos 遺漏
- **修法**: 加 res.ok 檢查 + 失敗 Swal 提示「儲存失敗，請重試」

#### ⚠️ 2026-04-17 補充真正根因：upsert 少 `on_conflict` 參數（commit 89f578f）
- **位置**: branch/branch_portal.html:6713
- **問題**: 04/16 加了 res.ok 檢查後才發現每次儲存都回 409
- **根因**: POST + `Prefer: resolution=merge-duplicates` 沒在 URL 加 `on_conflict=store_name,setting_key`。PostgREST 預設拿 PK (`id`) 當衝突目標，body 無 `id` → 當純 INSERT → 命中 `(store_name, setting_key)` UNIQUE → 23505 / 409
- **修法**: URL 改成 `?on_conflict=store_name,setting_key`（一行改動）
- **對照**: admin/branch_admin.html:5588 的 `xiaolan_order_tracking` upsert 本來就有加 `on_conflict=product_id`，這次是當時漏抄
- **教訓**: PostgREST upsert 碰到複合 UNIQUE 必須明確指定 `on_conflict`；只加 res.ok 檢查治標不治本，看到 409 要追根因

- **修法**: 逐一加 `if (!res.ok) { Swal.fire('錯誤', ...) }` — 可以分批做
- **測試項目**:
  - [ ] 每個操作正常情況仍正常
  - [ ] 模擬失敗 → 有錯誤提示

---

### BUG-006: PendingReview.html 狀態更新無驗證
- **狀態**: [x] 已修 (2026-04-16)
- **嚴重度**: 🟠 中等 — 資料不一致
- **問題**: PATCH internal_purchases 和 internal_purchase_details 沒有檢查回應
- **涉及檔案**: PendingReview.html
- **涉及位置**:
  - ~第 627 行: PATCH status='已轉單' → 無 res.ok
  - ~第 1024-1027 行: PATCH converted_po_id → 無 res.ok
  - ~第 1036-1039 行: PATCH 相關 → 無 res.ok
- **修法**: 加回應驗證，失敗時 rollback 或警告
- **測試項目**:
  - [ ] 正常轉單流程
  - [ ] 失敗時不會出現「採購單已建但狀態沒轉」的不一致

---

### BUG-007: branch_admin cloudSave 是 fire-and-forget
- **狀態**: [x] 已修 (2026-04-16)
- **嚴重度**: 🟠 中等 — 關 tab 就丟資料
- **問題**: admin 改開團總表數字後，cloudSave 沒有 await，關 tab 資料可能沒上雲端
- **涉及檔案**: admin/branch_admin.html
- **涉及位置**: ~第 10833-10835 行 (editSummaryQty 等多處)
- **修法方向**:
  - A) 關鍵操作加 await + loading 指示
  - B) 或加 beforeunload 攔截 (如果有 pending save)
- **測試項目**:
  - [ ] 改數字後立刻關 tab → 雲端有更新 (修復後)
  - [ ] 改數字後等 1 秒再關 → 雲端有更新

---

### BUG-008: cloudLoadAll 與 autoSaveSingleQty 的競爭條件
- **狀態**: [ ] 未修
- **嚴重度**: 🟠 中等 — 偶發丟資料
- **問題**: cloudLoadAll await 完 pending save 後、fetch 回來前的空窗期，使用者改的數量會被雲端舊資料覆蓋
- **涉及檔案**: branch/branch_portal.html
- **涉及位置**: ~第 1113-1167 行
- **修法方向**: cloudLoadAll 結束後比對 timestamp，如果 localStorage 比雲端新則不覆蓋；或加 mutex lock
- **測試項目**:
  - [ ] 快速改數量 + 切頁 → 數量不消失
  - [ ] 30 分鐘過時提示重整 → 不覆蓋剛改的資料

---

## 🟡 低風險 (邊緣情況)

### BUG-009: portal_status disputed 沒有回寫機制
- **狀態**: [x] 已修 (2026-04-16)
- **嚴重度**: 🟡 低 — 狀態卡住但不丟資料
- **問題**: admin 處理完退貨後 (接受/拒絕/免退)，沒有把 portal_status 改回 issued
- **涉及檔案**: admin/branch_admin.html (adminAcceptReturn / adminRejectReturn / adminWaiveReturn / adminMarkReturnReceived)
- **修法**: 在這些函式加檢查 — 所有 items returnStatus 都已處理 → PATCH portal_status='issued'
- **CLAUDE.md 已記載**: 「待處理問題 2026/04/15 — 中優先」

---

### BUG-010: SalesOrder.html 客戶資料 fetch 空 catch
- **狀態**: [x] 已修 (2026-04-16)
- **嚴重度**: 🟡 低 — Excel 匯出缺欄位
- **問題**: 客戶電話/地址 fetch 失敗被空 catch 吃掉
- **涉及檔案**: SalesOrder.html ~第 1293-1297 行
- **修法**: catch 裡至少 console.warn，或在匯出結果提示「客戶資料載入失敗」

---

### BUG-011: SalesReturn.html activity_logs 空 catch
- **狀態**: [x] 已修 (2026-04-16)
- **嚴重度**: 🟡 低 — 稽核軌跡遺失
- **問題**: POST activity_logs 的 catch(e) {} 完全吞掉錯誤
- **涉及檔案**: SalesReturn.html ~第 458 行
- **修法**: catch 裡加 console.error，不需要 Swal (不阻擋主流程)

---

## 修復記錄

| 日期 | Bug ID | 修了什麼 | commit |
|------|--------|---------|--------|
| | | | |

---

## 附註

- 行號是掃描當下的近似值，修其他 bug 後可能會偏移，以 grep 關鍵字定位為準
- BUG-002 是最大的重構，建議留到最後，先把小的修完穩定後再動
- 每次修完一個 bug，回來更新這份文件的狀態
