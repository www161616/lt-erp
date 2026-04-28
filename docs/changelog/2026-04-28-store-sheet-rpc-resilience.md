# 2026-04-28 — 店家 Sheet RPC 錯誤訊息友善化 + 退貨刷新冷卻調長

## 摘要

修 `google-apps-script/store_sheet_code.gs` 兩個地方,讓店家在「📜 刷新退貨紀錄」撞到 GAS UrlFetchApp 配額時:
1. 看到友善訊息(「系統忙碌中,請 1 分鐘後再試」),不會看到原始 Supabase URL
2. 連點防護從 60 秒拉到 120 秒,降低再撞配額的機率

---

## 動機

店家用「📜 刷新退貨紀錄」反覆出現:

```
Exception: 已超出頻寬配額：https://asugjynpocwygggttxyo.supabase.co/rest/v1/rpc/get_legacy_store_returns。請嘗試降低資料傳輸速率。
```

訊息直接噴 Supabase URL,店家看了會困惑(以為自己網址打錯 / 系統壞掉)。

---

## 根因

`_formatRpcError_`(line 105-133)**早就存在**,且涵蓋「配額/頻寬/降低資料傳輸速率」的友善訊息。但 `_callRpc_` 在 `UrlFetchApp.fetch()` 那一層**沒包 try/catch**:

- `muteHttpExceptions: true` 只擋 HTTP 4xx/5xx(由後面 `if (code < 200 || code >= 300)` 走 `_formatRpcError_`)
- 但 GAS 平台級錯誤(配額爆 / 網路斷)是 `UrlFetchApp.fetch()` **直接 throw 一個 Exception**,bypass `muteHttpExceptions` → 沒進 `_callRpc_` 的後續邏輯 → 沒進 `_formatRpcError_` → 原始訊息直接 bubble 到 UI

---

## 完成項目

### 1. `_callRpc_` 加 try/catch 包 UrlFetchApp.fetch

```diff
function _callRpc_(funcName, payload) {
   const url = SB_URL + '/rpc/' + funcName;
-  const res = UrlFetchApp.fetch(url, { ... });
+  let res;
+  try {
+    res = UrlFetchApp.fetch(url, { ... });
+  } catch (fetchErr) {
+    // GAS 平台級錯誤(配額爆 / 網路問題)不會走 muteHttpExceptions,
+    // 必須在這裡攔下,統一交給 _formatRpcError_ 轉友善訊息
+    const errMsg = String(fetchErr && fetchErr.message || fetchErr);
+    throw new Error(_formatRpcError_(0, errMsg));
+  }
   ...
}
```

`_formatRpcError_` 既有的判斷(line 113-115:「配額」「頻寬」「降低資料傳輸速率」)會 catch 到此 case → 顯示「⚠️ 系統忙碌中」訊息。

### 2. `refreshReturnHistory` 冷卻 60 → 120 秒

```diff
-  const cd = _checkRefreshCooldown_('LAST_REFRESH_RETURNS', 60);
+  const cd = _checkRefreshCooldown_('LAST_REFRESH_RETURNS', 120);
```

連點 120 秒內第二次按 → 直接顯示「剛剛已刷新,請等 N 秒」,不打 RPC。

### 3. 不動的部分

- `refreshAllDeliveries` 冷卻維持 60 秒(只影響進貨單,跟退貨配額無關)
- `refreshAllDeliveries` 確認**沒打** `get_legacy_store_returns`,不需要拆綁
- `_formatRpcError_` 既有邏輯(line 105-133)不動 — 其判斷已經涵蓋本 case
- 沒加 CacheService 快取 / 沒加「資料截至 XXX」時間戳(這次 spec 範圍外)

---

## 影響範圍 / 風險

| 項目 | 影響 |
|---|---|
| `_callRpc_` | 全部 RPC 呼叫(simple_get_store_orders / get_legacy_store_orders / get_legacy_store_returns 等)— 但只是把「平台 throw」也轉成友善訊息,**正面影響** |
| `refreshReturnHistory` 冷卻 60 → 120 | 只影響「📜 刷新退貨紀錄」按鈕的連點防護 |
| 不影響 DB / 16staff Sheet / lt-erp-portal / lt-erp-simple-sales | ✅ |

---

## DB 變更紀錄

**無**。純 GAS 程式碼修改。

---

## 部署紀錄

### ⚠️ 18 家店 Sheet 是獨立部署

每家店的 Google Sheet 各自掛獨立的 Apps Script 專案,所以本次修改要**逐家 Sheet 貼新版**:

```
1. 開該分店 Google Sheet → 工具 → 指令碼編輯器
2. 找到 store_sheet_code.gs(或同名檔案)
3. Ctrl+A 全選 → 貼上修改後的版本
4. Ctrl+S 儲存
```

或者只貼 2 個改動點(_callRpc_ + refreshReturnHistory 冷卻數字),手動修也行,但全貼比較不會遺漏。

### 部署清單(18 家店)

```
[ ] 三峽    [ ] 中和    [ ] 文山    [ ] 四號    [ ] 永和
[ ] 忠順    [ ] 環球    [ ] 平鎮    [ ] 古華    [ ] 林口
[ ] 南平    [ ] 泰山    [ ] 萬華    [ ] 湖口    [ ] 經國
[ ] 松山    [ ] 全民    [ ] 龍潭(若有)
```

### 測試

每家店 Sheet 部署完後,簡單測試:

| # | 測試項 | 預期 |
|---|---|---|
| 1 | 點「📜 刷新退貨紀錄」(第 1 次) | 正常拉資料 |
| 2 | 立刻再點 1 次 | 跳「剛剛已刷新,請等 N 秒」(N 從 120 倒數) |
| 3 | 配額爆時點(可能要實際撞才能驗) | 跳「⚠️ 系統忙碌中,請等 1 分鐘」,**不顯示 URL** |

---

## Git 還原點

無新 tag。改動檔案:

```
google-apps-script/store_sheet_code.gs           (改 +13/-3 行)
docs/changelog/2026-04-28-store-sheet-rpc-resilience.md  (新建)
```

注意:`store_sheet_code.gs` 在本機 git 是 untracked 狀態(.gitignore 沒排除,但長期沒 commit),這次也**不一定要 commit 進 git**(看你是否要把 GAS 檔納入版本控制)。

---

## 未來可加強(本次未做,放這提醒)

| | 項目 | 為什麼這次沒做 |
|---|---|---|
| A | CacheService 6 小時快取 | 範圍外。短期 120 秒冷卻已經減壓 |
| B | 「📅 資料截至 YYYY-MM-DD HH:mm」時間戳 | 範圍外。如果之後加 cache,搭配時間戳更有意義 |
| C | 錯誤分類(配額 / 認證失敗 / 網路 / 其他)分別顯示不同訊息 | 範圍外。`_formatRpcError_` 已分 3 類(配額/網路/預設),夠用 |
| D | 跨 18 家店共享 lock(避免大家同時打)| 範圍外且複雜度高(各 Sheet 獨立,需要中央 KV) |

如果 120 秒冷卻 + try/catch 後仍頻繁撞配額 → 考慮加 CacheService(A)。
