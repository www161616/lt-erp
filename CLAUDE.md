# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 龍潭總倉 ERP 系統

## 完成功能（2026/04/11）

### branchOrders 雲端覆蓋根治：改用 RPC merge_branch_order 原子合併
- **症狀**：店家結單填表送出後，結單填表 input 顯示有數字，但 portal 開團總表和 admin 開團總表都看不到
- **根因**：admin cloudSave 是整份 POST 到 shared_kv，會把 admin 頁面載入時的舊 snapshot 覆蓋雲端
  - 店家送出 → 雲端 OK
  - admin 做任何操作（改數字、清除、批次結單）→ cloudSave → 整份蓋掉雲端 → 店家的新資料瞬間消失
  - 早期沒爆是因為店家集中早上送出，admin 還沒上線；4/8 剛好集中在中午 → 中招 4 家店
- **修法**：新增 Supabase RPC `merge_branch_order(p_store text, p_data jsonb)` 做原子 jsonb merge
  ```sql
  INSERT INTO shared_kv (key, value, updated_at)
  VALUES ('branchOrders', jsonb_build_object(p_store, p_data), now())
  ON CONFLICT (key) DO UPDATE
    SET value = COALESCE(shared_kv.value, '{}'::jsonb) || jsonb_build_object(p_store, EXCLUDED.value->p_store),
        updated_at = now();
  ```
- Portal cloudSave branchOrders 改用 RPC + 回傳 Promise
- Portal submitOrder 改 async 並 await cloudSave，確保雲端寫完才彈成功（避免關 tab 中斷 fetch）
- Admin cloudSave 支援 `onlyStore` 單店推送；多店推送先從雲端 GET merge 再推
- Admin 切到開團總表改為 `cloudLoadAll().then(renderAdminSummary)` 拿最新資料

### 匯入樂樂前先選結單日並清空殘值
- 按「📥 匯入樂樂報表」流程改為：
  1. 選結單日（下拉從 branchOrderList 抓今天 ± 7 天）
  2. 提示「將清空該結單日殘留數字（admin 鎖定的保留）」確認
  3. 執行清除 cache + branchOrders 該店該日 key + UI + cloudSave
  4. 確認開始匯入 → 觸發檔案選擇
  5. 解析後直接覆蓋（已清空），admin 鎖定的永遠跳過
- 拿掉舊的 skip/add/overwrite 彈窗（清空後不需要）
- **順便解決長期 bug**：重複開同編號商品會帶入舊檔期數量 — 清空該結單日後就是乾淨的

### 防店家忘了按送出資料
- 匯入完成彈窗按鈕改「🚀 確認送出」直接呼叫 submitOrder；「先檢查數量」才停留
- `switchPage()` 離開結單填表前偵測 `importMode=true` 時跳警告
- `beforeunload` 關 tab/重整時跳瀏覽器原生警告
- 之前 4/8 資料跑掉的事故根本原因：4 家店匯入後都忘了按「🚀 送出資料」，cache 有所以結單填表看得到，但 branchOrders 沒寫 → 雲端沒上傳 → admin 看不到

### portal cloudLoadAll 加 pending save 等待
- `_pendingBranchOrdersSave` 追蹤 cloudSave 是否完成
- `cloudLoadAll` 開頭 `await _pendingBranchOrdersSave`，避免切頁時 load 搶先拉到舊資料覆蓋剛存的 localStorage

## DB 變更（2026/04/11）
- 新增 Supabase RPC `merge_branch_order(p_store text, p_data jsonb)`
  - SECURITY DEFINER
  - GRANT EXECUTE 給 anon, authenticated
  - 用 jsonb `||` 運算子做原子 merge，只更新指定 key
  - shared_kv.key 是 PRIMARY KEY，ON CONFLICT (key) 可直接用

## ⚠️ 還在運作但要小心的點（更新 04/11）

1. **admin 多店 cloudSave 仍有小 race window**：admin 已載入的店，如果該店家之後又送出新資料，admin 下次 cloudSave（多店模式）會用 admin 本機的該店版本覆蓋雲端。頻率低暫不處理。未來可優化為「對每家店 key-level merge」或「只推 dirty store」
2. **admin 編輯單格的 cloudSave**：10714 的 `editSummaryQty` 仍呼叫 `cloudSave('branchOrders')` 不傳 onlyStore，走多店 merge 路徑。可優化為 `cloudSave('branchOrders', storeName)` 只推單店，效能更好

## 完成功能（2026/04/10）

### 開團總表 CSV 歷史資料匯入（1~3 月）
- 從 Google Sheets 匯出的 CSV（店家填表-已確定數量無法更動）匯入 branchOrders
- 1 月 1039 筆、2 月 595 筆、3 月 854 筆，共 2488 筆配對成功
- key 格式：用 branchOrderList 的 `item.id`（pid_結單日）作為 branchOrders key
- 涵蓋 20 家店：19 分店 + 全民、山張、買上癮
- 3 月有部分商品 branchOrderList id 為純編號（syncToERP 建的），需特殊處理

### 開團總表下方分頁列
- 表格底部加第二組分頁列（首頁/上頁/下頁/末頁/跳轉）

### localStorage QuotaExceeded 自動清理
- branch_admin 和 branch_portal 的 cloudLoadAll 加 try-catch 防護
- QuotaExceeded 時自動清除不需要的快取（portalSalesOrders、portalTrackingData、supplier_xiaolan_orders 等）
- saveMockSavedWaves 也加同樣防護
- ⚠️ **lt_savedWaves 不可清除**（揀貨歷史），已從清理名單移除

### 新增採購單改進
- 表頭改深灰底+白字（修正被主題色覆蓋導致看不到）
- 利潤/利潤小計欄位移除（數量非正確值）
- 成本/售價/分店價支援 Enter 跳下一格
- 售價/分店價 onchange 改用 ipCalcTotal（避免 ipRenderCart 重繪失焦）
- 「待審核」狀態也可刪除

### 採購單加結單日欄位
- DB：internal_purchases 新增 `end_date TEXT`
- 存單時寫入結單日（從下拉取值）
- 查詢採購單左側列表、右側詳情標題改顯示結單日
- PendingReview.html 待審卡片也改顯示結單日
- 舊單無 end_date 時 fallback 顯示供應商名

### 銷貨單開立後自動更新分店庫存
- 新增 `autoUpdateBranchInventory` 函式
- 揀貨分發開立銷貨單後自動加庫存（branch_inventory_店名）
- 補發揀貨單開立後也自動加庫存
- 退貨單（orderType='return'）不加庫存
- 用 soId 明確查找（不依賴 array 最後一筆）

### 所有進貨單搜尋修正（branch_portal）
- 搜尋按鈕和 Enter 改呼叫 loadHistoryFromDB（原本呼叫 renderHistoryPage 不會重新查詢）
- 搜尋範圍擴充：單號 + 備註 + 商品名稱（查 sales_details）

### 今日銷貨 CSV 解析修正（branch_portal）
- 支援樂樂新版 ERP 匯出格式（「商品數量」「商品款式」「商品單價」欄位名）
- 金額改為單價×數量

### generateSalesOrder soId 作用域修正
- `const soId` 在第一個 if(res.ok) 區塊宣告，第二個 if 區塊存取不到
- 改為外層 `let soId = ''`

### 揀貨歷史查詢單號可點擊（唯讀查看）
- 單號加 onclick 開啟 `viewPickingWaveDetail`（唯讀，只顯示品名+各店數量）
- **不可用 `openCorrectionPanel`**，因為它會寫 correctionCache，打開就變「已修正」狀態

### 欠品計算改以銷貨單為主
- **舊邏輯**：揀貨大表 expected vs actual → backorders（修正面板填的數字）
- **新邏輯**：branchOrders 訂購數量 vs 銷貨單實際開出數量 → backorders
- 只處理成功開立的分店，失敗的不記欠品
- 查找 branchOrders 順序：完整 id → 純 pid → 日期格式正規化 fallback（`2026-04-15` → `4/15`）
- `orderedQty === 0` 跳過（散品不記欠品）
- 修正面板仍可改數量（改的是銷貨單要開幾個），但欠品以銷貨單為主

### 揀貨站回算已分數量（pickedQty）
- 從已完成的歷史波次回算 pickedQty（之前刻意歸零，現在恢復）
- **帶日期後綴的 id**（如 `pid_4/15`）→ 完整 id 比對，不會跨檔期互撞
- **純編號 id** → 必須 endDate 雙方都有且相同才回算
- **舊資料無 endDate 的不回算**（寧可少扣不多扣，避免顯示負數）
- ⚠️ 純編號商品重複開團是常態，絕對不能用 cleanPid 回算歷史

### products 表商品編號修正
- `3405230025` → `340523025`（升級防藍光折疊老花眼鏡-黑色150度）
- `3405230026` → `340523026`（200度）
- `3405230027` → `340523027`（250度）
- 原因：branchOrderList 用 9 位編號，products 表多打一個 0 變 10 位

## DB 變更（2026/04/10）
- internal_purchases 新增欄位 `end_date TEXT`
- products 表修正 3 筆商品編號（3405230025→340523025 等）

## ⚠️ 還在運作但要小心的點（更新 04/10）

1. **localStorage 配額問題**：branchOrders 從 562KB 膨脹到 1278KB（匯入 1~3 月資料），加上其他 key 總量接近 10MB
2. **lt_savedWaves 不可自動清除**：揀貨歷史存在 shared_kv + localStorage，如果 localStorage 被清掉後 mockSavedWaves 初始化為 []，任何存檔操作會把空陣列 cloudSave 回去覆蓋雲端（04/10 發生過，花 $10 修復）
3. **branch_inventory_ key 沒有 lt_ prefix**：這是既有格式，branch_portal 讀的是 `branch_inventory_` + store，不可改
4. **openCorrectionPanel 會寫 correctionCache**：打開就會在 cache 建立空物件，導致狀態變「已修正」。查看用 `viewPickingWaveDetail`
5. **products 表外鍵約束**：`inventory.product_id` 有外鍵指向 `products.id`，銷貨單 RPC 扣庫存時如果商品不在 products 表會整張單失敗（409 Conflict）
6. **商品編號長度不一致**：同一商品在 branchOrderList 和 products 表可能編號不同（如 9 位 vs 10 位），建商品時要確認編號一致
7. **揀貨站 pickedQty 回算規則**：純編號商品必須 endDate 雙方都有才回算，舊資料不回算。絕對不能用 cleanPid 回算（會跨檔期互撞）
3. **branch_inventory_ key 沒有 lt_ prefix**：這是既有格式，branch_portal 讀的是 `branch_inventory_` + store，不可改

## 完成功能（2026/04/09 晚）

### 新增採購單改版（還原點 b78db5d，完成 d51211e）
- 右側上方加「結單日下拉 + 帶入按鈕」
  - 從 branchOrderList 抓不重複 endDate 填入下拉（新到舊）
  - 選結單日 → 確認彈窗 → 累加該日商品到 ipCart
  - 數量從 branchOrders 加總各店（cleanPid + 結單日匹配，同鬼影修復邏輯）
  - 成本/供應商/售價/分店價從 products 表即時查
  - 同商品重複帶入自動合併數量
- 左側商品目錄保留（手動追加散品）
- **拿掉批發價/團購價**（新增 + 查詢 + 列印 + Excel 全部拿掉）
  - 理由：批發/團購是賣給客戶的價格，放採購單不對位
  - DB 舊資料不刪，只是前端不顯示
- 加**利潤欄**（分店價-成本）和**利潤小計欄**（利潤×數量），負數紅色
- 左右兩側表頭固定（sticky header）
- 列印移除簽名欄（採購人員/主管/會計）
- 修正 ipPrintNewOrder 讀已不存在的 ipSuppSelectNew 報錯

### 查詢採購單強化
- 明細的成本/售價/分店價改為可編輯 input（原本是唯讀文字）
- onchange 即時更新 ipCurrentDetail.items + 小計 + 總計
- 加「💾 儲存修改」按鈕 → PATCH internal_purchase_details + internal_purchases 主表總計
- 「💰 補寫商品價格」按鈕現在能正確寫入使用者修改過的值到 products 表

### 揀貨單修正數量面板強化
- 品名下方從 1 個金額 input 改為**成本 + 分店價**兩欄
- onchange 即時 PATCH products 表（cost / price_branch）
- 成功時右下角 toast 提示「✅ 已更新 XXX 成本 → $YYY」2 秒消失
- 失敗時 SweetAlert 錯誤提示
- 已開立的揀貨單維持唯讀

### 開團總表「鬼影 key」根治（commit feabdec）
- **症狀**：開團總表 vs 結單填表數字對不上（湖口 4/5 多算 2 件那種）
- **根因**：[branch_portal.html:2716](branch/branch_portal.html#L2716) `_lookupQty` 的 fallback
  - 第 2 步用 cleanPid（砍 `_尾碼`）查 → 不管尾碼是哪個檔期，撿到就用
  - 舊檔期 `編號_3/12` 會被新檔期 `編號_4/15` 撿走
  - 加上「取最大值」的索引邏輯，污染更嚴重
- **修法**：fallback 改為雙層索引 `[cleanPid][dateKey] = qty`
  - dateKey 由 `_normDateKey` 把 `2026-04-15` / `4/15` 都正規化為 `M/D`
  - fallback 必須結單日匹配才採用，不匹配回 0
  - 純編號 key（無尾碼，syncToERP 寫的）視為「當前檔期」，作為次選
- **影響範圍**：只改 branch_portal renderSummaryPage 一個函式，+32/-9 行
- **不需遷移**：對現有 47000+ key 立即生效；branch_admin、index、Supabase 都不動
- **未來不會再發生**：架構上鬼影 key 已絕跡

### 需求與欠品管理跨店相同流水號查找互撞修復（commit 057d123）
- **症狀**：點林口的 REQ105 跑出湖口的 REQ105
- **根因**：mockInquiries 用 `.find(i => i.id === id)` 比對純流水號
  - 不同店有相同流水號（REQ105 林口、REQ105 湖口同時存在）
  - .find 只回第一筆 → 點哪家都跑出第一筆
  - 04/09 早上修了「去重」的 dedupKey 加 storeId，但「查找端」沒一起改
- **修法**：mockInquiries 每筆加 `_uid = id + '__' + storeId` 內部唯一識別
  - 所有 onclick 傳 `_uid`，所有 find/findIndex/filter 用 `_uid` 比對（10 處）
  - 寫回 portalAllRequests 加 `r.storeId === inq.storeId` 雙條件，避免跨店誤改
- **改動**：admin/branch_admin.html，+33/-28 行
- **影響範圍**：只動 admin 端，branch_portal 沒讀 _uid，分店端不受影響
- **未來注意**：新增讀 mockInquiries 的程式碼一律用 `_uid`，不要用 `id`

### 月結報表合併（明細與彙總同一頁）
- DetailedReport.html 的 RPC `web_get_detailed_monthly_data` 已不存在，整個彙總壞掉
- 把彙總功能整合進 MonthlyReport.html，加 viewMode 變數（detail / summary）
- 同一頁兩種視圖共用同一份 fetchData 結果 → 永遠一致
- 銷貨彙總依客戶分組、進貨彙總依供應商分組、餐費彙總依付款方式分組
- 雜項費用兩個視圖都保持逐筆
- 卡片顯示已收/未收 與 已付/未付（依 payment_status 二元判斷）
- exportToExcel 改用 XLSX library 寫 .xlsx，依 viewMode 切換內容
- index.html chooseMonthlyReport 兩個選項都載入 MonthlyReport.html
- DetailedReport.html 檔案保留但已不再被連結

### 應收帳款報表強化
- 修正：退貨單 (RT) 沒扣到加總的 bug
  - 原本 `unpaid = Math.max(0, grand_total - paid)` 把負數截成 0
  - 改為 `unpaid = grandTotal - paid`，新增 `'退貨'` 狀態
  - 篩選器選未收款 / 部分收款時自動包含退貨
- 加運費 (shipping) 和扣款 (deduction) 兩個欄位
  - 從 sales_orders 抓 shipping_fee / deduction
  - 表頭從 9 欄擴充為 11 欄
  - 畫面、列印、Excel 匯出三邊同步加新欄位

### Excel 匯出 xlsx 升級（解決科學記號）
- CustomerMonthlyReport / Receivablereport / MonthlyReport 三份報表
- CSV → xlsx，單號欄強制文字格式 (`cell.t='s'` + `cell.z='@'`) 避免長數字變科學記號
- 動態算品名/單號欄寬（中文 ×2、英數 ×1）
- 大標題合併儲存格

### branch_admin.html 修正與功能
- 陸貨到貨清單列印加全部欄位 + 橫式列印
- 列印拿掉訂單號、寄至兩欄
- 商品名稱欄改為 admin 可編輯（input + onchange PATCH product_name）
- liveName 邏輯改為 r.product_name 優先（讓改名後不會被 cnaGetLive 蓋回去）
- xiaolan_arrivals 加 `original_name` 欄位保留原始名稱
- supplier_xiaolan saveArrivals 寫入時自動同步 product_name → original_name
- supplier_xiaolan 到貨清單顯示「原：xxx」灰字（當被改名時）
- 「需求與欠品管理」去重 key 加上 storeId
  - 修正不同分店相同流水號（REQ105 等）互相覆蓋的 bug

### 後台批次刪除分店
- 淡水、板橋兩家分店已倒店，徹底從 ERP 刪除
- 後台 console 腳本清除 5 個地方：
  - branchOrders / importedStoreNames / branchTypeMap / branchDataList / branchOrdersLocked
- 自動下載備份 JSON 到下載資料夾

### portal 加「資料可能過時」浮動提示
- 店家整天不關 portal 分頁，本機 cache 不會自動更新
- cloudLoadAll 成功後記錄 `window._lastCloudLoadAt`
- setInterval 每 1 分鐘檢查，停留 > 30 分鐘 → 右下角顯示黃色浮動提示
- 點擊 → cloudLoadAll + reload 整頁

### 揀貨單修正
- 不再從歷史波次回算 pickedQty / pickingHistory
- 同編號商品在不同檔期重複開團是常態，舊歷史會把新檔期需求扣到 0
- 改為「乾淨的開始」，每次新建揀貨單用當前 alloc 完整帶入
- 加「顯示已完成分發的商品」checkbox（預設不勾）

### 結單填表功能
- 加「📊 匯出 Excel」按鈕，匯出有訂購數量 > 0 的商品
- 分頁列「共 N 筆」加顯示「篩選日期 X｜訂購總數量 Y」
- clearAllQty 同步順序 bug 修復：先同步雲端再 renderOrderPage
  - 否則 syncQtyCacheFromCloud 會把舊資料寫回 cache
- 結單日列表從 3 天放寬為 30 天

### 泰山店 EZTOOL 舊單匯入
- 之前漏匯入泰山的 EZTOOL 舊單，sales_orders 表沒有 2026 年 1~3 月的紀錄
- 用 console 腳本上傳 `泰山.xls` 解析 + INSERT
- 結果：訂單 105 張、明細 1682 筆、總金額 $872,027.5、日期 2026-01-02 ~ 2026-03-13
- customer_id = C00030（包子媽-泰山店）
- 注意點：
  - sales_orders 有 RLS Policy，必須 admin role 才能寫入
  - 表頭不在 Row 0（前面有雜訊列），要自動偵測表頭位置
  - product_id / product_name 要 trim() 去尾端空格
  - 用「id 重複檢查」避免覆蓋現有單
- ⚠️ **未來如有其他店要補匯入**，可參考這次的腳本（保留在 git history `0166a13` 之後的對話）

## DB 狀態紀錄（2026/04/09）
- xiaolan_arrivals 加欄位 `original_name TEXT`
- sales_orders 中泰山 (C00030) 多 105 張 EZTOOL 舊單，總金額 $872,027.5

## ⚠️ 還在運作但要小心的點

1. **branchOrders 配額問題**：47000+ key，接近 localStorage 5MB 上限
2. **同編號商品開新檔期繼承舊數量**：04/07 加的自動清除按鈕仍是治標
3. **多裝置 cache 不同步**：04/09 加了「資料可能過時」浮動提示協助
4. **sales_orders RLS**：分店帳號（store role）無 INSERT 權限，所有寫入要 admin/assistant 身份
5. **「DetailedReport.html」已停用**：未來不要連結這個檔案，全部走 MonthlyReport.html
6. **鬼影 key 已根治**（04/09 commit feabdec）：開團總表 fallback 強制比對結單日，未來不會再有舊檔期被新檔期撿走的問題
7. **mockInquiries 必須用 `_uid` 不能用 `id`**（04/09 commit 057d123）：跨店有相同流水號（REQ105 林口/湖口），未來新增讀寫點要記得用 `_uid = id + '__' + storeId`

## 完成功能（2026/04/08）

### 結單填表/開團總表強化
- branch_portal 結單填表加「📊 匯出 Excel」按鈕
  - 匯出當前篩選結果中有訂購數量 > 0 的商品
  - 欄位：開團日 / 結單日 / 商品編號 / 商品名稱 / 售價 / 訂購數量
  - 末列加合計，檔名 `{店名}_訂購清單_{日期}.xlsx`
- 分頁列「共 N 筆」旁加顯示「篩選日期 X｜訂購總數量 Y」
- 修 clearAllQty 同步順序 bug：先同步雲端再 renderOrderPage，避免 syncQtyCacheFromCloud 把舊資料寫回 cache
- 結單填表「清除數量」「訂單彙總」結單日列表從 3 天放寬為 30 天

### 後台批次清除多家店訂購數量（手動操作）
- 因為 4/1~4/9 各店有歷史殘留干擾，逐一登入 14 家店帳號跑後台 console 腳本：
  - 中和、文山、林口、永和、經國、古華、南平、環球、松山、忠順、萬華、泰山、四號、湖口
  - 範圍：4/1~4/9，會自動下載備份 + 預覽 + 確認後執行
  - 同時清 branchOrders（影響開團總表）和 orderQtyCache（影響結單填表）
- 額外發現：湖口的 4/5 開團總表 49 vs 結單填表 47 差 2 件
  - 原因：開團總表的 cleanPid fallback 把過期歷史殘留 (1/9, 1/25, 3/12, 3/13...) 撿到現役檔期
  - 寫了「鬼影掃描+清除」腳本，掃描所有店所有過期且被撿到的 _尾碼 key
  - 清除 7 個鬼影 key（13 件）後湖口 4/5 變 47

## ⚠️ 未來可能還會發生的問題（重要）

### 1. 「同編號商品開新檔期繼承舊數量」會持續發生
**根本原因**：`branchOrders[店][商品編號]` 結構沒有檔期維度。

**何時會發生**：
- 員工用「極速開團建檔」或「商品批次匯入」建立新商品
- 該商品編號**過去某次開過團**（或 syncToERP 寫過純編號 key）
- 分店打開 portal 結單填表，看到舊數字

**現有保護**（04/07 加的）：
- 建商品時 syncToERP 會自動掃描 branchOrders，發現有歷史殘留會跳確認彈窗
- 員工可選「清除（建議）」或「保留」
- 但這只保護「建商品的當下」，員工如果按「保留」就會留下舊數字

**如果沒按清除會怎樣**：
- 分店看到舊數字 → 自己用「清除數量」按鈕清掉
- 或請 admin 跑後台清除腳本

### 2. 「鬼影 key」會在開團總表偶爾出現
**根本原因**：`renderSummaryPage` 用 cleanPid 智能 fallback，會撿到 `_尾碼` 的歷史殘留。

**何時會發生**：
- 某店在過去送出過某商品 A 的訂單（branchOrders 寫入 `A_dateKey`）
- 該商品 A 在新檔期又開團（list 有純編號 A）
- 開團總表用 cleanPid fallback 撿到舊的 `A_dateKey`
- 結果：新檔期的開團總表會多算到舊訂單

**症狀**：結單填表跟開團總表的數字對不上（差 N 件）

**短期解法**：跑「鬼影掃描+清除」腳本（內含預覽+確認+備份）
- 我可以包成 branch_admin 一個按鈕，未來不用貼 console

**長期解法**：拿掉 cleanPid fallback，但這要先確保 list 和 branchOrders 的 key 格式絕對一致

### 3. 分店多裝置 cache 不同步
**問題**：店家用多台裝置登入 portal 時，每台的 `bp_orderQtyCache` 是獨立的。
- A 裝置清除 → cloudSave branchOrders → B 裝置 cache 還是舊的
- B 裝置重新整理 → syncQtyCacheFromCloud 從 branchOrders 拉乾淨資料 → 才會同步

**結論**：清除/匯入後要請店家**重新整理頁面**才會生效。

### 4. branchOrders 持續累積，localStorage 配額會爆
**現況**：branchOrders 已經 47000+ key，存 localStorage 大概 5MB 上限的一半以上
- 04/07 我寫備份功能時就踩到 QuotaExceededError
- 未來持續累積會更糟

**建議**：每隔一段時間（例如每月）手動清掉「結單日 < 6 個月前」的歷史 key

### 5. 用 admin 帳號跑後台清除腳本時 cache 不會被清
- 因為 admin 不是分店，沒有 currentStore = 文山/中和...
- 腳本內 `orderQtyCache` 是當前登入帳號的 cache，跟其他店無關
- **必須登入該店帳號才能連 cache 也清**
- branchOrders（雲端）會被清，但**該店家自己裝置的 cache 還在** → 必須請他們重整

## 完成功能（2026/04/07）

### 早上：訂貨追蹤、退換貨整合（穩定運作）
- branch_admin 訂貨追蹤：陸貨到貨清單比對商品編號，兩階段自動更新採購進度
  - 第一階段：商品出現在到貨清單 → pending 改為「已向廠商叫貨」
  - 第二階段：出貨日+10天已過 → 改為「貨已到倉」
  - 自動填入預計到貨日（最新出貨日+10天），不覆蓋手動設定
  - 只限小瀾的陸貨商品（xiaolan_arrivals 表）
- supplier_xiaolan 團購採購：依商品名稱「-」前分組，白/淡灰藍交替標色，排序加商品編號次序
- branch_admin 團購叫貨區整合退換貨登記
  - 退換貨處理分頁更名為「查詢退換貨」
  - 每行加「🔄 登記」按鈕，彈窗填數量/原因/內容/備註/照片影片
  - 上傳檔案到 Supabase Storage（return-media bucket，public）
  - 寫入 xiaolan_returns（progress=待處理）
  - 該商品有進行中退換貨時顯示「⚠️ 待處理 N」徽章
  - 查詢退換貨分頁顯示 📎 照片連結
- supplier_xiaolan 退換貨提醒
  - sidebar「退換貨追蹤」加紅點徽章顯示待處理筆數
  - 團購採購商品名稱旁顯示「⚠️ 退換貨待處理 N」標記，點擊跳轉並篩選
  - 退換貨追蹤分頁顯示 📎 照片連結
  - 改進度為已解決類後徽章/警示自動消失
  - 進行中定義：progress 為空 / 待處理 / 廠商補寄
- branch_portal 開團總表 key 不一致 bug 修復（智能查找 fallback）
- branch_portal 結單填表的「清除數量」「訂單彙總」結單日列表從 3 天放寬為 30 天

### 下午：建商品自動清歷史殘留 + 廢棄 menu 移除
- 移除 branch_admin 廢棄的「📥 匯入開團資料」menu（含 switchTab 分支）
- syncToERP 加自動清舊數量（影響 極速開團建檔 + Excel 商品批次匯入 兩種建商品入口）
  - 寫入 branchOrderList 後呼叫 autoCleanBranchOrdersForNewProducts
  - 掃描各店 branchOrders 是否有新建商品的歷史殘留 (>0)
  - 有則跳確認彈窗顯示明細，使用者可選「清除（建議）」或「保留」
  - 保留選項是給「同編號舊檔期還在進行中」的情境用
  - 清除時把該編號所有 key 包含 _尾碼 的都刪掉

## ⚠️ 今天的重大事故與教訓（2026/04/07）

### 事故經過
1. 早上發現 branchOrderList key 格式不一致（syncToERP 用純編號、ImportGroupBuy 用 productId_dateKey）
2. 我設計了「資料正規化按鈕」想治本，把所有 key 統一為純編號，同編號數量取 max
3. **致命錯誤判斷**：以為「同編號的兩種 key 是同一筆訂單的副本」，所以取 max 合併
4. **真相**：這兩種 key 其實是「同一商品在不同檔期的獨立訂單」，不應該合併
5. 正規化跑下去後，141 個今天新建商品出現「舊歷史最大值」污染各店分店訂貨數
6. 過程中還踩到 localStorage 配額爆掉、第 2 步治本（改 ImportGroupBuy 用純編號）也是錯方向
7. 最終回滾 ImportGroupBuy.html、移除正規化按鈕、改採「建商品時自動掃描+確認彈窗」治標方案

### 教訓
- **不要對「歷史資料的語意」自做主張**——同樣的編號可能代表不同含意，必須先問清楚
- **「治本方案」改寫入端風險極高**，要先在測試環境驗證
- **localStorage 寫入有 5MB 配額限制**，備份方案要用檔案下載而非寫進 localStorage
- **跨裝置 localStorage 是各自獨立的**（本地 vs GitHub Pages），測試時要在實際部署環境跑
- **CLAUDE.md 註記的「已知問題」往往代表是設計妥協而非真 bug**，治本前要先確認背後原因

## 🔧 未來需要改進的地方（2026/04/07 列出）

### 高優先：branchOrders 架構改造
**現況問題**：
- `branchOrders[店][商品編號] = 數量` 只有一格，無法區分不同檔期
- 同編號商品重新開團會繼承上次的數量
- 員工無法事先知道哪個編號有歷史，必須逐次處理
- 目前用「建商品時自動清+確認彈窗」治標，但仍有風險（同編號舊檔期還在進行中時會被誤清）

**目標結構**：
```
branchOrders[店][商品編號][結單日] = 數量
```

**需要改的地方**（明天再做）：
1. ImportGroupBuy 寫入邏輯（雖然 menu 拿掉但檔案還在）
2. branch_portal 結單填表的讀取/寫入
3. 開團總表（branch_portal + branch_admin 都要改）
4. 訂貨追蹤 syncOrderTrackingData
5. 一次性遷移腳本：把現有 branchOrders 資料按檔期拆開
6. 各讀取端的 fallback 補丁可以拆掉

### 中優先：店家匯入樂樂前的舊數量自動處理
- 目前店家自己有「清除數量」按鈕，但要記得按
- 可考慮：店家打開結單填表時，自動偵測「該商品結單日是新檔期但已有數量」→ 提示
- 或：「匯入樂樂報表」按鈕加 hint「按下前建議先清除數量」

### 低優先：刪除廢棄程式碼
- ImportGroupBuy.html 整個檔案（已從 menu 移除，可考慮刪除）
- syncToERP 第 2594 行已刪除的 console.warn 註解可清

## DB 變更（2026/04/07）
- xiaolan_returns 表新增欄位：
  - media_urls (jsonb default '[]')
  - qty (integer)
  - reason (text)
- Supabase Storage 新建 bucket：return-media (public, 50MB)
  - 3 條 RLS Policy：anon/authenticated 可 INSERT/SELECT/DELETE

## 近期完成功能（2026/04/05~04/06）
- index.html sidebar 待審 badge 加入「部分到貨」狀態，與 PendingReview 頁面數字一致
- branch_admin 各功能頁移除 height:100% 框住限制，內容改為整頁自然延伸
- branch_admin 新增/查詢內部採購單移除付款方式欄位（一張單多廠商不合理）
- branch_portal 店轉店 badge 改為已讀即消，有新轉入單才再亮紅字
- branch_portal 常用功能（備忘錄/自訂網址/常用語錄）改存 branch_settings DB 表，登入自動遷移舊 localStorage
- branch_portal 互助交流新增「88折出清」功能（clearance_periods + clearance_items 兩張表）
  - Admin 檔期管理（建立/關閉/移轉未出清/封存）
  - 分店登記出清商品（搜尋商品自動帶價格，必須從商品資料庫選取）
  - 標記成交自動建立店轉店單（用分店價）
  - www161616 限定回溯功能（已出清可回溯 + 作廢店轉店單）
  - 匯出 Excel（admin 隨時可匯，分店 closed 後才能）
  - 競態防護：登記前檢查檔期狀態、成交前檢查品項狀態
- branch_portal 互助交流「全部」tab 隱藏已滿足的個別品項及全滿足貼文
- branch_portal 結單填表、需求表、開團總表、到貨狀況、訂貨動態追蹤移除 max-height 限制
- branch_portal「分店價」全站改稱「成本」
- branch_portal 結單填表送出時對 productId 去重，修正匯入筆數與送出筆數不一致
- branch_portal 匯入樂樂報表區分「開團總表無此品項」vs「找不到編號」+ 重複開團商品不再誤判已結單
- 新建 DB 表：branch_settings（分店常用功能設定）、clearance_periods（出清檔期）、clearance_items（出清品項）
- 修正 branch_settings RLS：store 角色用 replace(store,'店','') 比對 user_metadata

## 完成功能（2026/04/02~04/03）
- supplier_xiaolan 匯入訂單加訂單號重複防呆
- supplier_xiaolan importOfferIds 加 raw:false 防止長訂單號 JS Number 截斷 + 尾碼匹配修復歷史資料
- supplier_xiaolan siHandleFile 加 raw:false 修復 Excel 匯入截斷
- supplier_xiaolan syncUnitCostToDB 移除不可靠的 offer_id 配對，只保留 linked_product 精準配對
- supplier_xiaolan 到貨清單選商品直接寫入 product_id/product_name + Edge datalist 相容修復
- supplier_xiaolan 團購採購（陸貨訂購）加「1688連結」欄位，貼 URL 自動存入 xiaolan_order_tracking.url
- supplier_xiaolan 匯入 Excel 時自動用 Offer ID 配對開團商品，顯示配對統計明細
- branch_admin 團購叫貨區排序改為先依結單日新到舊、同日依商品名稱
- branch_admin 團購叫貨區進貨價改從陸貨到貨清單(xiaolan_arrivals)即時查詢
- branch_admin 團購叫貨區加「1688連結」欄位
- branch_admin 陸貨到貨清單：表頭固定、進貨價>售價標紅、hover 變色
- branch_portal 庫存管理加「補匯進貨單庫存」按鈕
- xiaolan_order_tracking 清除所有錯誤的 unit_cost（已用 SQL 歸零）

## 完成功能（2026/03/31）
- 新建 damage_orders 表 + process_damage_order / cancel_damage_order RPC
- 新增 DamageOrders.html（庫存耗損單查詢/開立/作廢/列印）
- transfer_items 加 damage_qty / damage_note 欄位
- 新增 process_transfer_damage / cancel_transfer_damage RPC（店轉店損壞登記）
- branch_admin 店轉店審核加損壞登記 UI
- branch_admin 銷貨單管理：soId 解析 bug 修正、退貨單 createdAt 格式統一、MANUAL 改顯示「手動開單」、月份預設當月
- branch_admin 陸貨到貨清單：加出貨日期篩選、預設直寄龍潭、列印改用 live 資料
- branch_portal 印標籤加尺寸選擇（80mm / 40×30mm）
- supplier_xiaolan getLiveArrivalData 自動補寫 product_id bug 修正

## 專案概述
- 純 HTML/CSS/JS 單檔架構，無框架
- 這是**唯一工作資料夾**，直接在此編輯＋git push 部署
- index.html 為主殼（sidebar + iframe 載入子頁面）
- 列印抬頭：丸十水產股份有限公司 — 銷貨單（龍潭總倉）
- 使用者用 **Edge 瀏覽器**

## 部署
- **GitHub Pages**：`https://www161616.github.io/lt-erp/`
- **GitHub Repo**：`github.com/www161616/lt-erp`（public）
- WSL 已設定 Git credential（classic PAT），可直接 `git push`
- **工作流程**：本地改完讓使用者測試，確認沒問題再一次 push（不要每改一個就推）

## 架構
- **index.html**：ERP 主殼（sidebar + iframe），管理員/會計用
- **根目錄 *.html**：各功能子頁面，透過 iframe 載入（如 ProductList、SalesOrder、Inventory 等）
- **admin/branch_admin.html**：開團小幫手（助理/員工用），含漂漂館區、團購叫貨區
- **branch/branch_portal.html**：分店入口
- **supplier_xiaolan.html**：小瀾私人採購管理（獨立頁面，不連結主站）
- **backup.html**：備份工具（不改動）
- **libs/**：本地 JS 依賴（supabase.min.js, sweetalert2.min.js, xlsx.full.min.js）
- **templates/**：Excel 範本（銷貨單.xlsx）
- **docs/**：參考資料（.gitignore 排除，不部署）— DB 欄位 CSV 在 `docs/supabase/`

## .gitignore 排除項目
docs/、*_backup*.html、*.xls、*.xlsx、*.jpg、*.png、.claude/、EZTOOL*/

## 主題色（不可混用）
- **index.html + 根目錄所有 HTML**：石板灰護眼主題（slate gray）
- **branch_admin.html**：專業深藍護眼主題
- **branch_portal.html**：玫瑰粉護眼主題

## Supabase
- URL: `https://asugjynpocwygggttxyo.supabase.co/rest/v1`
- KEY: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWdqeW5wb2N3eWdnZ3R0eHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzU3MjksImV4cCI6MjA4ODk1MTcyOX0.LzcRQAl80rZxKKD8NIYWGvylfwCbs1ek5LtKpmZodBc`
- 變數名稱：`SB_URL`, `SB_KEY`, `HEADERS`
- 預設只回傳 1000 筆，大量資料需分頁 while loop

## Supabase REST API 慣例
- 每個 HTML 頁面頂部自行宣告 `SB_URL`/`SB_KEY`/`HEADERS`（非共用模組）
- Auth token 從 `sessionStorage.getItem('sb_auth_token')` 取得，fallback 為 SB_KEY
- HEADERS 必須同時包含 `apikey` 和 `Authorization: Bearer`
- 查詢用 PostgREST 語法：`?id=eq.VALUE`、`?id=in.(A,B)`、`?order=id.desc`
- 超過 1000 筆用 while loop 分頁：`limit=1000&offset=N`，直到回傳筆數 < limit
- 部分頁面有 `api()` helper（如 Inventory.html），但多數頁面直接用 fetch
- RPC 呼叫：`fetch(SB_URL + '/rpc/function_name', { method: 'POST', body: ... })`

## RLS 安全策略（已啟用，非 anon 全開）
- 所有 public 表都已啟用 RLS
- **敏感表**（admin/assistant only）：employees, purchase_orders, purchase_details, accounts_payable, accounts_receivable, suppliers, supplier_prices, expenses, petty_cash, payment_made, payment_received, invoices, activity_logs, special_prices, sales_orders, sales_details, customers, inventory, inventory_logs, materials, stocktake, employee_meals, br_*, internal_*, xiaolan_*
  - Policy: `(auth.jwt()->'user_metadata'->>'role') IN ('admin','assistant')`
- **products 表**：authenticated 可 SELECT，admin/assistant 可寫入/修改/刪除
- **shared_kv 表**：authenticated + anon 全部權限（雲端同步需要）

## Supabase Auth
- 帳號格式：`{username}@lt-erp.com`
- 建帳號用 `admin_create_auth_user` RPC
- signOut 必須用 `{ scope: 'local' }`（anon key 無權限做 global signOut）
- 頁面載入自動恢復 session（localStorage），登入頁預設 display:none 避免閃爍

## 權限架構（5 角色）
| 角色 | index.html | branch_admin | branch_portal |
|------|-----------|-------------|--------------|
| **admin** (www161616) | 全部+帳號管理 | 全部 | 全部 |
| **accountant** 會計 | 全部（無帳號管理）| ❌ | ❌ |
| **assistant** 助理 | ❌ | 全部 | ❌ |
| **staff** 員工 | ❌ | 有限（無漂漂館/團購）| ❌ |
| **store** 分店 | ❌ | ❌ | 指定分店 |

## DB 欄位注意（易搞錯的）
- products 表：`alert_stock`（非 alert_qty）、`supplier`（非 supplier_id）
- products 價格：`price`(售價), `price_branch`(分店價), `price_wholesale`(批發價), `price_group`(團購價)
- inventory 表：`qty`（非 current_stock）、`last_updated`（非 updated_at）
- inventory_logs 表：`log_type`（非 type）、`after_qty`（非 balance）
- **不確定欄位名時，一律查 `docs/supabase/` 裡的 CSV**

## localStorage keys（lt_ prefix）
- `lt_calendarEvents` — 日曆記事
- `lt_calendarTodos` — 待辦事項
- `xiaolan_pp_settings` — 漂漂館匯率/運費率（{ shipRate, exRate }）
- 不要用無 prefix 的 key，會跟央廚單機版衝突

## 共用視窗模式（Shared Window Pattern）
- 所有外部連結統一用此模式，共用同一個瀏覽器分頁
- HTML：`<span class="shared-link" data-url="...">` + 事件委派
- JS：`sharedWin` 變數存 window reference，覆蓋同一分頁
```js
let sharedWin = null;
function openSharedLink(url) {
  if (sharedWin && !sharedWin.closed) {
    sharedWin.location.href = url;
    sharedWin.focus();
  } else {
    sharedWin = window.open(url, '_blank');
  }
}
```

## 新頁面 / 分頁強制規則（所有新增頁面必須遵守）
1. **分頁導覽**：頁面上方＋下方都要有「« ‹ 1 2 3 › »」頁碼跳轉列
2. **連結開啟**：任何可點的外部連結一律使用共用視窗模式
3. **表格可調**：所有表格的欄寬與列高都要能拖拉調整
4. **欄位寬度**：日期、商品編號等欄位寬度要符合內容
5. **搜尋列**：每個分頁都要有搜尋輸入框 + 「查詢」「清除」按鈕
6. **每頁筆數**：預設 50 筆/頁
7. **排序**：資料預設新到舊排序（依日期或 id 降冪）

## 漂漂館區（branch_admin.html）
- piaopiao_assistant.html 不再使用，功能全部在 branch_admin.html 漂漂館區
- 匯率/運費率：小瀾在 supplier_xiaolan.html 設定，branch_admin 唯讀
- 單件進貨價 = `(大陸售價 + 重量 × 運費率) × 匯率`
- 唯讀欄位（藍底）：結單日、叫貨、1688編號、物流編號、預計到貨
- 助理可編輯：商品編號、售價、規格數量、廠商連結、結束、缺少數量、大陸售價、重量
- **不要自行增減功能，有疑問先問使用者**

## 團購叫貨區（branch_admin.html）
- 位於漂漂館區上方，資料存 xiaolan_purchases 表 category='團購'
- 助理填：結單日、商品編號、商品名稱、進價估算、售價、1688連結、包裝
- 小瀾填（唯讀藍底）：已訂貨、訂單號、物流編號

## supplier_xiaolan.html（小瀾私人採購管理）
- 獨立頁面，不連結到 ERP 主站
- 6 分頁：所有訂單、漂漂館、團購購買、到貨清單、陸貨訂購、退換貨追蹤
- Supabase 表：xiaolan_purchases, xiaolan_arrivals, xiaolan_returns
- 搜尋支援繁簡互搜（fuzzyMatch 函式）

## 雲端同步（shared_kv）
- `shared_kv` 表（key TEXT PK, value JSONB）存跨裝置共用資料
- `cloudSave(key)` 寫入、`cloudLoadAll()` 頁面載入/切分頁時拉取

## 已知問題：branchOrderList key 格式不一致
- **syncToERP**（branch_admin 商品建檔）：`id = 商品編號`（如 `"160203140"`）
- **ImportGroupBuy**（匯入開團資料）：`id = 商品編號_結單日`（如 `"160203140_4/15"`）
- branch_portal 去重時用 `.replace(/_.*$/, '')` 砍掉尾巴，所以分店不會看到重複商品
- **風險條件**：如果 syncToERP 的筆 endDate 比 ImportGroupBuy 新，去重會保留 syncToERP 的筆，導致 `branchOrders` 裡的叫貨數量撈不到（key 格式對不上）
- **安全前提**：ImportGroupBuy 必須在分店填單前完成匯入，確保它的筆被保留

## 列印系統規範
- blob URL 開新分頁（Edge 相容）
- 右上角「🖨️ 列印」+「✕ 關閉」按鈕，@media print 隱藏
- `@page { margin: 3mm }`
- 標題格式：公司名(22px bold) → 副標(15px, letter-spacing:8px) → 資訊列 → 表格

## Excel 範本系統
- ExcelJS CDN：`https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js`
- 範本路徑：`templates/銷貨單.xlsx`
- Placeholder：`{{fieldName}}` 單值、`{{#items}}` 展開行

## 結單邏輯
- 只看 admin 是否結單（status=closed），日期過期不阻擋
- 2025 全部 + 2026 年 1、2 月自動結單
- 3 月起由 admin 手動控制

## 工作流程

### Phase 1: 理解需求（禁止寫任何程式碼）
1. 用自己的話複述需求，等我說「對」才進入 Phase 2
2. 列出「影響範圍清單」：
   - 這次會改哪些檔案？
   - 這些檔案裡有哪些函式/區塊會被影響？
   - 有沒有其他檔案呼叫了這些函式？（用 grep 確認，不要憑記憶）
3. 列出「風險清單」，每項必須回答 YES/NO：
   - [ ] 會改 DB schema 或 RPC 嗎？
   - [ ] 會影響其他頁面（index / branch_admin / branch_portal / supplier_xiaolan）嗎？
   - [ ] 有沒有欄位名稱需要確認？（有 → 查 docs/supabase/ CSV，禁止猜）
   - [ ] 現有資料會不會因為這個改動而出錯？
   - [ ] 有沒有涉及金額計算或庫存增減？
   - [ ] 不同角色（admin / assistant / branch）看到的行為一樣嗎？

### Phase 2: 實作
- 每完成一個獨立區塊，說明：改了什麼、為什麼這樣改
- 發現需求有漏洞或更好做法 → 立刻停下來告訴我，不要自己決定
- 改到會影響其他地方的程式時，主動標注「⚠️ 這裡也需要一起改：...」

### Phase 3: 自我審查（寫完程式碼後，交給我之前）
逐項檢查，每項寫出結論：
1. **呼叫端追蹤**：grep 這次改過的函式名、變數名、CSS class，確認所有引用處都一致
2. **空值防禦**：每個從 DB 讀取的欄位，如果是 null 會怎樣？UI 會壞嗎？計算會 NaN 嗎？
3. **陣列為空**：列表查詢結果如果是 0 筆，UI 會顯示什麼？會不會報錯？
4. **重複操作**：使用者連點兩次按鈕會怎樣？會重複建單嗎？
5. **排序與篩選交互**：篩選後再排序，index 還對嗎？排序後再篩選呢？
6. **跨店資料隔離**：branch_id 有沒有正確帶入查詢條件？
7. **localStorage key**：有沒有用 lt_ prefix？
8. **欄位名稱**：和 docs/supabase/ CSV 比對過了嗎？

### 停下來問我的時機（Stop Triggers）
遇到以下任一情況，**立刻停下來問我，不要自己假設後繼續**：
- 需求有兩種以上的合理解讀
- 發現現有程式碼有 bug（跟這次需求無關的也要說）
- 需要新增 DB 欄位或 RPC
- 改動會影響超過 2 個頁面
- 不確定某個欄位是否存在或型別是什麼
- 發現 UI 流程在手機上可能有問題

### 完成後交付格式
1. 改動清單（檔案 + 具體改了什麼）
2. 測試情境清單（至少包含：正常流程、空值、重複操作、不同角色）
3. 「我注意到的潛在問題」（就算沒有也要寫「無」）
4. 問我：「符合預期嗎？確認後我再繼續。」

### 進度記錄與備份
- 每完成一個獨立功能區塊，主動問我：「這段已完成，要我先 commit 備份嗎？」
- 我確認後，將以下內容寫入 `docs/changelog/YYYY-MM-DD.md`：
  - 改了什麼、為什麼改、影響範圍
  - 測試情境與結果

### 禁止行為
- 不確定欄位名時禁止猜測，一律查 `docs/supabase/` CSV
- 不要每改一個功能就 push，等使用者確認後再推
- 漂漂館區功能不自行增減，有疑問先問
- 不使用無 `lt_` prefix 的 localStorage key
- 不要為了「看起來完成」而跳過確認步驟
- 不允許在同一個頁面出現重複的 HTML id
- 不允許新增任何「暫時繞過」的邏輯而不標注說明
- 不允許在沒有錯誤處理的情況下送出任何 API 請求
