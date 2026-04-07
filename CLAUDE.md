# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 龍潭總倉 ERP 系統

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
