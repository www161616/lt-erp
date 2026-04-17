# branchOrders key 格式統一 — 交接文件

> 日期：2026-04-17
> 目的：交接給下一個 AI（Claude Code），讓它可以直接動手改程式碼
> ⚠️ 開工前必須先讀專案的 CLAUDE.md、BUG_TRACKER.md、CROSS_FILE_MAP.md、SCHEMA_QUICK_REF.md

---

## 一、問題是什麼

branchOrders 儲存各店訂購數量，結構是：

```
branchOrders[店名][商品key] = 數量
```

**商品 key 有兩種格式，這就是問題根源：**

| 來源 | key 格式 | 例子 |
|------|---------|------|
| `syncToERP`（branch_admin 商品建檔） | 純編號 | `"160203140"` |
| `ImportGroupBuy`（匯入開團資料，已從選單移除） | `編號_結單日` | `"160203140_4/15"` |

同一個商品開新檔期時，syncToERP 寫的純編號 key 會跟上一次的值撞在一起，導致：
- 新檔期繼承舊數量
- 開團總表的 cleanPid fallback 撿到舊檔期的值（鬼影 key）
- 大量補丁程式碼（autoCleanBranchOrders、_normDateKey、_branchOrdersByCleanPid 等）

---

## 二、解決方案（已確認）

**不改 branchOrders 的資料結構**（不加第三層維度），只統一 key 格式。

**讓 syncToERP 也用 `編號_結單日` 格式**（跟 ImportGroupBuy 一致），這樣同商品不同結單日的 key 天然不會撞。

### 為什麼不做結構大改造（`{pid: qty}` → `{pid: {date: qty}}`）

1. **多端版本不一致是致命風險**：16 家店任何一家沒刷新頁面，讀到三層結構會把 `{date: qty}` 當 qty，顯示 NaN，更糟的是寫回去會毀掉整個 date 維度
2. 121 處讀寫點要全改，風險太大
3. 統一 key 格式只改 1 個地方（syncToERP），效果一樣

---

## 三、具體改動（全在 branch_admin.html）

### 改動 1：加共用 `_normDateKey` 到頂層作用域

**位置**：在 `const _dirtyBranchStores = new Set();` 之前（約第 181 行前面）

**加入以下程式碼：**

```js
    // ============================
    // 共用：日期正規化為 M/D（去年份、去前導零）
    // 用途：branchOrders key 後綴、開團總表 fallback 比對
    // ============================
    function _normDateKey(s) {
      if (!s) return '';
      const str = String(s).trim();
      const m = str.match(/^\d{4}-(\d{1,2})-(\d{1,2})/);
      if (m) return parseInt(m[1], 10) + '/' + parseInt(m[2], 10);
      const m2 = str.match(/^(\d{1,2})[\/\-](\d{1,2})/);
      if (m2) return parseInt(m2[1], 10) + '/' + parseInt(m2[2], 10);
      return str;
    }
```

**注意**：這個函式在 portal（branch_portal.html 第 2867 行）也有一份，邏輯一模一樣。portal 那份不動（它在 renderSummaryPage 的局部作用域，位置正確）。

---

### 改動 2：syncToERP 的 id 格式 + 加 productId 欄位

**位置**：branch_admin.html 的 `syncToERP` 函式內，約第 2810 行

**找到這段**（在 `// ③ 同步至 branch_portal localStorage` 的迴圈裡）：

```js
      stagingList.forEach(item => {
        const entry = {
          id: item.code, name: item.name,
```

**改成：**

```js
      stagingList.forEach(item => {
        const dateSuffix = _normDateKey(item.endDate);
        const entry = {
          id: dateSuffix ? (item.code + '_' + dateSuffix) : item.code,
          productId: item.code,
          name: item.name,
```

**兩個關鍵：**

1. **`dateSuffix` 為空時 fallback 回純編號**，避免產生 `160203140_undefined` 之類的垃圾 key
2. **必須加 `productId: item.code`**，因為下游多個地方用 `item.productId || item.id` 取純編號：
   - 揀貨站（~第 3066 行）：`const pid = item.productId || item.id` → 用來查 products 表分店價
   - 開銷貨單（~第 4755 行）：`branchPriceMap[row.productId]` → 查不到價格會整單失敗
   - 銷貨單明細（~第 4756 行）：`product_id: row.productId || row.id.replace(/_.*$/, '')` → 寫進 DB 的 product_id 必須是純編號（products 表有外鍵約束）
   - 欠品計算（~第 4901 行）：`const pid = it.product_id.replace(/_.*$/, '')` → 這裡有 cleanPid 保護，但 product_id 一開始就該是純編號

   **不加 productId 的後果**：`item.productId || item.id` 會拿到 `"160302060_3/4"`，products 表找不到 → 價格為 0 → 銷貨單金額全錯，甚至 RPC 409 Conflict（外鍵約束失敗）

   **這跟 ImportGroupBuy 的格式完全一致**：ImportGroupBuy 寫的 entry 也是 `id: "編號_日期"` + `productId: "編號"`

3. **findIndex 去重也要改**，否則同商品同結單日重新 syncToERP 會 push 重複項目

**同一段裡還有 findIndex，找到：**

```js
        const idx = saved.findIndex(p => p.id === item.code);
```

**改成：**

```js
        const newId = entry.id;
        const idx = saved.findIndex(p => p.id === newId || p.id === item.code);
```

這樣會匹配到新格式 `"160302060_3/4"`（重複建檔時更新）和舊格式 `"160302060"`（遷移舊 entry）。

---

### 改動 3：刪除 ipImportByEndDate 裡的重複函式 _normDK

**位置**：branch_admin.html 約第 1218 行

**找到這段**（在 `ipImportByEndDate` 函式內）：

```js
      function _normDK(s) {
        if (!s) return '';
        const m = String(s).trim().match(/^\d{4}-(\d{1,2})-(\d{1,2})/);
        if (m) return parseInt(m[1],10) + '/' + parseInt(m[2],10);
        const m2 = String(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})/);
        if (m2) return parseInt(m2[1],10) + '/' + parseInt(m2[2],10);
        return String(s).trim();
      }
      const targetDK = _normDK(endDate);
```

**改成：**

```js
      const targetDK = _normDateKey(endDate);
```

刪掉整個 `_normDK` 函式定義（6 行），只留上面這一行。這樣 `ipImportByEndDate` 直接用頂層的 `_normDateKey`，不再有重複函式。

---

## 四、不需要改的（很重要，不要多動）

- ❌ branch_portal.html — 完全不動
- ❌ RPC `merge_branch_order` — 不動（它在 store 層級合併，跟 key 格式無關）
- ❌ `autoCleanBranchOrders` — 保留（過渡期舊格式 key 還在，清理邏輯有用）
- ❌ 所有 cleanPid fallback 邏輯 — 保留（相容舊資料）
- ❌ portal 的 `_normDateKey`（第 2867 行）— 不動（局部作用域，位置正確）
- ❌ index.html — 不動

---

## 五、為什麼只改 syncToERP 就夠了（但 productId 不能忘）

所有寫入 branchOrders 的路徑都是拿 `branchOrderList` 的 `item.id` 當 key。改了 syncToERP 產生的 id 格式後，整條鏈自動跟著對。

**但 `productId` 欄位必須同時加上**。下游用 `item.productId || item.id` 取純編號去查 products 表、寫 sales_details 的 product_id。如果不加 productId，這個 fallback 會拿到帶日期的 id，導致價格查不到、外鍵約束失敗。

| 寫入函式 | key 來自 | 自動跟著對？ |
|---------|---------|------------|
| portal `submitOrder`（~2635行） | `item.id` ← branchOrderList | ✅ |
| portal `autoSaveSingleQty`（~2156行） | `el.dataset.id` ← `data-id="${p.id}"` ← branchOrderList | ✅ |
| portal 缺品換品（~7569行） | `nego.orderKey` ← `item.id` ← branchOrderList | ✅ |
| admin `editSummaryQty`（~10928行） | onclick `'${item.id}'` ← branchOrderList | ✅ |
| admin `clearBranchOrderQty`（~10813行） | checkbox data-id / Object.keys | ✅ |
| admin `batchDeleteSummaryItems`（~10892行） | checkbox value ← `item.id` | ✅ |
| admin `finalizeShortageNegotiation`（~5851行） | `nego.orderKey` ← `item.id` | ✅ |

---

## 六、上線順序

**先上程式碼，後跑遷移腳本。**

1. **推程式碼**（以上三處改動）
   - 新建的商品自動產生 `編號_日期` 格式的 key
   - 舊商品靠 fallback 繼續正常顯示
2. **確認新建商品的 key 格式正確**
   - 在 branch_admin 建一個測試商品
   - 去 branch_portal 填數量
   - 看 branchOrders 裡的 key 是不是 `編號_M/D` 格式
3. **找一個沒人操作的時段跑遷移腳本**
   - 從 shared_kv 讀 branchOrderList 和 branchOrders
   - 把純編號 key 轉成 `編號_結單日` 格式
   - 查不到結單日的保留原 key（讓 fallback 自然處理）
4. **觀察一段時間後**
   - 確認舊檔期都結單了、純編號 key 自然消亡
   - 再考慮是否移除 autoCleanBranchOrders 和 cleanPid fallback

---

## 七、遷移腳本設計（上線穩定後再跑）

**前置條件**：遷移前請所有 admin 先關閉 branch_admin 頁面。branchOrdersLocked 沒有專用 merge RPC，cloudSave 走通用路徑（整份 POST 回 shared_kv），有覆蓋風險。

在 branch_admin Console 執行的腳本，邏輯：

```
1. 從 shared_kv 讀 branchOrderList、branchOrders、branchOrdersLocked
2. 建立 lookup: 純編號 → endDate（從 branchOrderList）
3. 掃描 branchOrders 每家店的每個 key：
   - 已經有 _ 後綴 → 跳過
   - 純編號且 lookup 有唯一 endDate → 改 key 為 編號_M/D，刪舊 key
   - 純編號且 lookup 有多個 endDate → 取最新的 endDate（syncToERP 寫的是最新檔期）
   - 純編號且 lookup 找不到 → 記錄為孤兒，保留原 key
4. 掃描 branchOrdersLocked 每家店的每個 key（沿用步驟 2 的同一份 lookup）：
   - 已經有 _ 後綴 → 跳過
   - 純編號且 lookup 有唯一 endDate → 改 key 為 編號_M/D，刪舊 key
   - 純編號且 lookup 有多個 endDate → 取最新的 endDate
   - 純編號且 lookup 找不到 → **直接刪除**（locked 值只是 true，對應商品已不在 branchOrderList，鎖定毫無意義）
   ※ 必須與步驟 3 共用 lookup 和規則，確保遷移後 branchOrders 與 branchOrdersLocked 的 key 對得起來
5. 用 merge_branch_order RPC 逐店寫回 branchOrders
6. cloudSave('branchOrdersLocked') 整份寫回（沒有專用 RPC，走通用路徑 resolution=merge-duplicates）
7. 輸出報告：
   - branchOrders：遷移 N 個、跳過 M 個、孤兒保留 K 個
   - branchOrdersLocked：遷移 P 個、跳過 Q 個、孤兒刪除 R 個
```

資料分布（從 erp_export.json 分析，branchOrders）：
- 40,735 個純編號 key 有唯一 endDate → 可安全遷移
- 2,425 個有多個 endDate → 取最新
- 609 個是孤兒 → 保留

branchOrdersLocked 的資料量小很多（只有 admin 會寫），實際分布等遷移時即時統計。

**遷移腳本的程式碼現在不寫，等程式碼改動上線穩定後再寫。**

---

## 八、現有資料分布（供參考）

branchOrders 共 76,583 個 key（21 家店）：
- 帶日期後綴：32,814 個（主要是 1-3 月，ImportGroupBuy 產生）
- 純編號：43,769 個（主要是 3-4 月，syncToERP 產生）

branchOrderList 共 3,222 筆商品：
- 帶日期後綴 id：2,077 筆
- 純編號 id：1,145 筆（其中 1,143 筆有 endDate 欄位）

---

## 九、測試項目（改完必須做）

| 測試項目 | 用哪個帳號 | 確認什麼 |
|---------|-----------|---------|
| syncToERP 建商品 | assistant | branchOrderList 的 id 是 `編號_M/D` 格式，且有 `productId` 欄位（純編號） |
| syncToERP 重複建同商品 | assistant | 不會產生重複項目（findIndex 要能找到新格式 id） |
| portal 結單填表 | store 帳號 | 能看到新商品、填數量後 branchOrders key 正確 |
| portal 開團總表 | store 帳號 | 新商品數量正確顯示，舊商品也正常 |
| admin 開團總表 | assistant | 新舊商品數量都正確，不會翻倍 |
| admin 編輯數量 | assistant | 點格子改數字，branchOrders 用正確的 key 寫入 |
| admin 採購單帶入 | assistant | 帶入結單日商品數量正確 |
| admin 揀貨站 | assistant | 新商品的各店分配數量正確顯示 |
| admin 開銷貨單 | assistant | 銷貨單明細的 product_id 是純編號、分店價正確（不是 0） |
| 重整頁面 | 任何帳號 | 資料還在，沒有空白或報錯 |

---

## 十、安全網

- Google Sheet 已備份 1-3 月資料（erp_export.json 已匯入）
- Git 還原點可用（`git tag` 查看）
- erp_export.json 本機留一份

---

## 十一、給 Claude Code 的提醒

1. **只改 branch_admin.html**，不動 branch_portal.html 和 index.html
2. **用 grep 確認行號**，不要用我寫的近似行號直接改（其他 bug fix 可能讓行號偏移）
3. **改完用 git diff 給使用者看**，不要自己 push
4. **這次只做改動 1、2、3**，不要順手重構其他地方
5. **改動 2 有四個小改（id 格式 + productId + findIndex + dateSuffix 防禦），缺一不可**
6. **必須讀 CLAUDE.md 的工作流程**，特別是 Phase 1（理解需求）和 Phase 3（自我審查）
