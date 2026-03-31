# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 龍潭總倉 ERP 系統

## 近期完成功能（2026/03/31）
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

## 工作態度與行為準則（強化版）

### 動手之前
- 拿到需求後，不要馬上寫程式
- 先用自己的話複述「我理解你要做的是⋯⋯」，等我確認才開始
- 主動做「影響範圍掃描」，逐一回答以下問題（不可跳過）：
  - 這個改動會碰到哪些頁面、元件、函式？全部列出來
  - 有沒有 ID、key、class name、localStorage key、欄位名稱在其他地方也用到，改了這裡會不會炸掉那裡？
  - 現有資料結構會不會因為這個改動而出現不一致？需要 migrate 嗎？
  - RLS 權限在不同角色（admin / branch / guest）下行為一樣嗎？
  - 有沒有空值、undefined、null、重複 ID、陣列越界、非同步競態的風險？
  - 這個做法對使用者來說夠直覺嗎？有沒有更人性化的流程？
- 如果有任何疑慮，先提出討論，不要自行假設後直接做

### 動手過程中
- 每完成一個段落，主動說明「我做了什麼、為什麼這樣做」
- 修改任何共用元件、工具函式、全域狀態時，必須標注：「⚠️ 這是共用邏輯，以下地方也受影響：[列出清單]」
- 看到以下情形，立刻停下來告訴我，不要默默繞過：
  - HTML 裡出現重複的 id 屬性
  - localStorage key 沒有 `lt_` prefix
  - 欄位名稱與 `docs/supabase/` CSV 對不上
  - 某段邏輯在特定角色或資料狀態下會靜默失敗（沒有錯誤提示）
  - 某個操作沒有 loading 狀態或錯誤回饋，使用者會不知道發生什麼事
  - 表單送出後沒有防止重複點擊
  - 刪除 / 轉移 / 核銷等不可逆操作沒有二次確認

### 完成後
- 列出「我改了哪些地方」（檔案 + 函式 + 影響範圍）
- 列出「你需要測試的情境」，例如：
  - 用 admin 登入試試
  - 用 branch 角色試試，確認看不到不該看的
  - 空值、0、負數、超長字串的情況
  - 跨店資料、同筆資料被兩人同時操作
  - 網路慢 / 斷線時的行為
- 主動指出這次改動有沒有留下技術債或臨時解法，例如：「這裡我用了 setTimeout 暫時繞過，之後應該改成⋯⋯」
- 主動問：「這樣符合你的預期嗎？還是有哪裡需要調整？」
- 沒有得到我的確認之前，不要繼續下一個功能

### 發現潛在問題時（就算我沒問）
- 主動說：「🔍 我注意到一個潛在問題：⋯⋯」，並給我選擇：「你想現在一起修，還是先記下來之後處理？」
- 常見應主動提出的問題類型：
  - **重複 ID**：同一頁有兩個 `id="modal-confirm"`，JS 只抓到第一個
  - **命名不一致**：有地方寫 `branch_id`，有地方寫 `branchId`，資料對不上
  - **靜默失敗**：fetch 失敗後沒有 catch，使用者看不到錯誤，以為成功了
  - **UX 不人性化**：操作完沒有跳回列表、沒有成功提示、按鈕沒有 disabled 防重複送出
  - **邊界狀況**：清單為空時沒有空狀態畫面、金額欄位沒有限制只能輸入數字
  - **權限漏洞**：前端藏了按鈕但 API 沒有驗證角色，直接打 API 還是能操作
  - **非同步競態**：兩個請求同時送出，後回來的蓋掉先回來的結果
  - **不可逆操作無防護**：刪除 / 沖銷沒有確認彈窗，誤觸即生效

### 禁止行為
- 不確定欄位名時禁止猜測，一律查 `docs/supabase/` CSV
- 不要每改一個功能就 push，等使用者確認後再推
- 漂漂館區功能不自行增減，有疑問先問
- 不使用無 `lt_` prefix 的 localStorage key
- 不要為了「看起來完成」而跳過確認步驟
- 不允許在同一個頁面出現重複的 HTML id
- 不允許新增任何「暫時繞過」的邏輯而不標注說明
- 不允許在沒有錯誤處理的情況下送出任何 API 請求
