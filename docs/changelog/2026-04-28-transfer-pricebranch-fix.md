# 2026-04-28 — 店轉店建單強制用 price_branch（fallback bug 修復）

## 摘要

修復 branch_portal.html 店轉店登記頁的價格 fallback bug:當商品 `products.price_branch` 為空時,搜尋商品的 PRODUCT_DB.price 會 fallback 到 `products.price`（一般售價）,導致店家建店轉店單時可能用「一般售價」而非「分店進貨價」結算 → 對方分店金額偏高。

修法:店轉店搜尋結果改用 `branchPrice`(沒 fallback 的欄位),無分店價商品顯示「⚠️ 無分店價」灰底不可加入。

歷史污染極小(1 張單 1 筆 $19),不補修舊資料,只修 portal 防未來再發生。

---

## 完成項目

### 1. branch_portal.html 改 2 個搜尋 UI 區塊

| 區塊 | 位置 | 用途 |
|---|---|---|
| 店轉店搜尋結果 | `onTfSearch` | 店家輸入關鍵字搜商品 |
| 店轉店分類篩選 | `onTfCategoryChange` | 店家選分類列出商品 |

**改動內容**:

每個搜尋結果項目增加 `hasBranchPrice = Number(p.branchPrice) > 0` 判斷:
- ✅ 有分店價 → 正常顯示 + 可點選 + 用 `branchPrice` 建單(不是 `price`)
- ⚠️ 無分店價 → 灰底 + cursor:not-allowed + 點下去跳 Swal 警示「請聯絡 admin 補完分店價」

### 2. branch_portal.html 加送出前二次驗證(防禦深度)

`submitTransfer()` 內 `validItems` 過濾後,**再驗一次** `i.price > 0`:
- 任何 item 的 price <= 0 → Swal 跳警示列出有問題的商品 + return,不送 RPC
- 防搜尋 UI 被繞過 / 舊 tfItems 狀態殘留 / 開發者工具修改 DOM 等情境

兩層守備:UI 擋 + submit 擋,確保 transfer_items.amount 不會是 0 元髒資料。

**diff 大約 +45/-20 行**(搜尋 +15/-10、分類 +15/-10、submitTransfer +12/-0)。

### 3. 沒動的部分

- `loadProductDB` 內 PRODUCT_DB 結構不動(`branchPrice` 欄位本來就有,沒 fallback)
- 88 折出清自動建店轉店流程不動(line 8656/8760 已正確使用 `priceBranch`)
- 需求表 / 互助交流 / 商品資料庫頁不動(`p.price` 在這些用途是「顯示參考價」,fallback 可接受)

---

## 設計決策

### 為什麼不改 PRODUCT_DB.price 計算邏輯而是只改店轉店?

- PRODUCT_DB 物件已經提供 3 個欄位:`price`(有 fallback)、`sellPrice`(一般售價)、`branchPrice`(分店價,無 fallback)
- 改 `price` 計算會影響需求表、互助交流、商品資料庫頁等其他功能
- 直接讓店轉店改用 `branchPrice` 影響範圍最小

### 為什麼無分店價商品顯示但不可選?(而不是篩掉)

- 篩掉 → 店家以為「商品不存在」,可能去煩 admin 「為什麼搜不到」
- 顯示但灰底 + 警示 → 店家明確知道「商品在但缺分店價」,直接知道要找 admin 補
- UX 比較友善

### 歷史污染為什麼不補修?

跑了 SQL 查 transfer_items 對照 products.price_branch:
- 受影響單:1 張、明細:1 筆、偏差金額:**$19**
- 補修舊單會動 transfer_items.amount → 月結結算 → 影響店家對帳
- 風險 > 收益,不補修
- 如會計堅持,可用月結報表的「調整金額」欄位手動補 $19

---

## DB 變更紀錄

**沒動 DB**。純前端 UI 邏輯修正。

---

## 部署與測試紀錄

### 自我審查 checklist

- [x] 點擊「有分店價」商品 → selectTfProduct 用 `p.branchPrice`(>0)寫入 tfItems
- [x] 點擊「無分店價」商品 → Swal 警示,**不**呼叫 selectTfProduct,不會加入 tfItems
- [x] 即使 UI 被繞過(舊狀態 / DOM 改寫),submit 第二層守備也會擋下 price=0 的明細
- [x] 88 折出清自動建店轉店:不受影響(走 line 8656/8760,不經 PRODUCT_DB.price)
- [x] 需求表搜尋:不受影響(走 line 3038,還是用 `p.price`,但需求表不會落地金額)
- [x] 商品資料庫頁:不受影響(line 6647 直接讀 `p.price_branch` 不經 PRODUCT_DB.price)
- [x] HTML 跳脫:商品名稱含 `'` 字符在 onclick 內用 `\\'` 跳脫,在 Swal html 內用 `&apos;`(防 XSS / 防 onclick 字串爆掉)

### 部署需做的測試(deploy 後)

| # | 測試項 | 預期 |
|---|---|---|
| 1 | 用 store 帳號登入 portal,開店轉店 → 搜尋有分店價商品 | 正常顯示 + 點得到 + 金額 = price_branch |
| 2 | 同上,搜尋無分店價商品 | 灰底 + 點下去跳警示,不加入 |
| 3 | 用「分類篩選」找商品 | 跟搜尋一樣行為 |
| 4 | 開 DevTools 改 tfItems[0].price=0 後按送出 | 送出前驗證攔下 + 跳 Swal 警示 |
| 5 | 建立店轉店單後檢視 transfer_items | price 欄位 = price_branch 值 |
| 6 | 88 折出清自動建單 | 行為不變(這次沒動)|

---

## Git 還原點

無新 tag。修改檔案:
```
branch/branch_portal.html  (+30/-20 行,2 個區塊)
docs/changelog/2026-04-28-transfer-pricebranch-fix.md  (新建)
```

---

## 未來搬到 Google Sheet 時的設計原則

如果未來把店轉店搬到「店家 Sheet」(各分店 GAS Apps Script),沿用同規則:
- **店轉店一律用 products.price_branch**
- **沒分店價的商品拒絕加入店轉店**
- 跟 portal 行為一致,避免兩邊邏輯分裂

這個原則記在這裡,搬 Sheet 時請參照。
