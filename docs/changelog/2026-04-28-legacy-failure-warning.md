# 2026-04-28 — 店家 Sheet 舊系統 RPC 失敗警示(避免靜默吞掉)

## 摘要

修 `store_sheet_code.gs` 的 `_fetchStoreOrdersForList_`:當 `get_legacy_store_orders` 失敗時(如配額爆),不再靜默 fallback 成空陣列,而是把失敗狀態傳給 caller,在 alert 顯示警示。

避免店家以為「我這幾天就是沒下單」,實際上是 RPC 拉取失敗。

---

## 動機

今天泰山店反映「看不到 4/1~4/21 的單」。SQL 查 `sales_orders` 確認**確實有 32 筆 $223,486.50** 的舊單,資料沒缺。

追根因 — `_fetchStoreOrdersForList_` line 367-375 的 try/catch 把 legacy RPC 失敗**直接吞掉**,只 Logger.log 不通知 UI:

```js
try {
  legacyRows = _callRpc_('get_legacy_store_orders', {...});
} catch (err) {
  Logger.log('legacy orders fetch failed:' + err);  // ← 只記 log,前端不知道
}
```

→ 前端看到 `legacyRows = []` → 列表只剩 simple 單(4/22+)→ 店家以為「資料不見」。

比噴 URL 還危險 — 噴 URL 至少會被察覺,**靜默吞掉看起來「正常」但資料缺一塊**。

---

## 完成項目(只動 store_sheet_code.gs)

### 1. `_fetchStoreOrdersForList_` 加 legacyFailed flag

```diff
   let legacyRows = [];
+  let legacyFailed = false;
+  let legacyErrMsg = '';
   try {
     legacyRows = _callRpc_('get_legacy_store_orders', {...});
   } catch (err) {
-    Logger.log('legacy orders fetch failed (繼續用新系統資料)：' + err);
+    Logger.log('legacy orders fetch failed:' + err);
+    legacyFailed = true;
+    legacyErrMsg = String(err && err.message || err).substring(0, 200);
   }
```

return 的 sorted array 上掛 property:
```js
sorted.legacyFailed = legacyFailed;
sorted.legacyErrMsg = legacyErrMsg;
return sorted;
```

JS 允許 array 物件掛任意 property,`.filter / .length / .map` 不受影響,**不 break 任何現有 caller**(包含 `getOrderDetailsForSidebar`)。

### 2. `refreshAllDeliveries` 加警示

```diff
-  ui.alert('✅ 完成',
-    '已刷新「' + TAB_ALL + '」\n\n最近 ' + ALL_ORDERS_DAYS + ' 天訂單筆數：' + orders.length,
-    ui.ButtonSet.OK);
+  let alertMsg = '已刷新「' + TAB_ALL + '」\n\n最近 ' + ALL_ORDERS_DAYS + ' 天訂單筆數：' + orders.length;
+  if (orders.legacyFailed) {
+    alertMsg += '\n\n⚠️ 舊系統資料（4/1~4/21）暫時載入失敗，這次只顯示 4/22 之後的新系統單。請稍後再刷新。';
+  }
+  ui.alert('✅ 完成', alertMsg, ui.ButtonSet.OK);
```

### 3. `refreshTomorrowDeliveries` 同 #2

文字一致,讓店家無論刷新哪個分頁都看到一樣的警示。

### 4. 沒動的部分

- `getOrderDetailsForSidebar`(單張明細,不影響)
- `StoreOrderSidebar.html`
- `refreshReturnHistory`(它打的是 returns RPC,不是 orders)
- `_callRpc_` / `_formatRpcError_`(73e7d49 已修)
- DB / 16staff Sheet / portal

---

## 邏輯路徑

```
┌─ 配額爆 / legacy RPC 失敗
│  └─ _callRpc_ throw new Error("⚠️ 系統忙碌中...")  (73e7d49 已做)
│  
└─ _fetchStoreOrdersForList_ catch err
   ├─ 設 legacyFailed = true
   ├─ legacyErrMsg = err.message
   └─ return sorted array (掛 property)
   
┌─ refreshAllDeliveries / refreshTomorrowDeliveries
│  └─ if (orders.legacyFailed) alertMsg += "⚠️ 舊系統資料(4/1~4/21)暫時載入失敗..."
```

---

## DB 變更紀錄

**無**。純 GAS 修改。

---

## 部署

每家店 Sheet 各自貼新版 `store_sheet_code.gs`(同 73e7d49 部署流程)。

⚠️ 已部署 73e7d49 的店家(松山)**需要重貼一次**才會吃到本次新增的警示邏輯。

---

## 風險清單

| # | 風險 | 處置 |
|---|---|---|
| 1 | array 掛 property 是少見寫法 | 註解寫清楚 + 只掛 2 個欄位,可讀性 OK |
| 2 | 警示文字提到「4/1~4/21」但 8 月後 sliding window 越過此範圍會誤導 | **本次接受** — 過渡期說明,長期應該動態算 from/to 日期顯示 |
| 3 | sidebar caller 會不會 break | 不會 — `_fetchStoreOrdersForList_` 仍回 array,`.filter` 仍可跑 |
| 4 | 舊單 sliding window 移出後,legacyFailed 永遠是 false | 不影響 — 沒打 RPC 就不會 catch,正確行為 |

---

## 改動檔案

```
google-apps-script/store_sheet_code.gs           (+13/-3 行)
docs/changelog/2026-04-28-legacy-failure-warning.md  (新建,本檔)
```

---

## 部署 checklist(18 家店)

```
[ ] 三峽    [ ] 中和    [ ] 文山    [ ] 四號
[ ] 永和    [ ] 忠順    [ ] 環球    [ ] 平鎮
[ ] 古華    [ ] 林口    [ ] 南平    [ ] 泰山
[ ] 萬華    [ ] 湖口    [ ] 經國    [ ] 松山(已部署 73e7d49,需重貼)
[ ] 全民    [ ] 龍潭(若有)
```
