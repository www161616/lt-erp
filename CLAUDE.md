# 龍潭總倉 ERP 系統

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

## 資料夾結構
```
龍潭_deploy/
├── index.html              # ERP 主頁（管理員/會計用）
├── *.html                  # 各功能子頁面（iframe 載入）
├── supplier_xiaolan.html   # 小瀾私人採購管理（獨立頁面）
├── backup.html             # 備份工具（不改動）
├── admin/
│   ├── branch_admin.html   # 開團小幫手（助理/員工用）
│   └── ImportGroupBuy.html
├── branch/
│   └── branch_portal.html  # 分店入口
├── templates/
│   └── 銷貨單.xlsx         # Excel 範本
├── docs/                   # 參考資料（.gitignore 排除，不部署）
│   ├── supabase/           # DB 欄位 CSV（查欄位名用這裡）
│   ├── 備份紀錄/
│   ├── ai紀錄/
│   └── *.sql, *.txt, *.xlsx
└── .gitignore              # 排除 docs/
```

## 主題色（不可混用）
- **index.html + 根目錄所有 HTML**：石板灰護眼主題（slate gray）
- **branch_admin.html**：專業深藍護眼主題
- **branch_portal.html**：玫瑰粉護眼主題

## Supabase
- URL: `https://asugjynpocwygggttxyo.supabase.co/rest/v1`
- KEY: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdWdqeW5wb2N3eWdnZ3R0eHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzU3MjksImV4cCI6MjA4ODk1MTcyOX0.LzcRQAl80rZxKKD8NIYWGvylfwCbs1ek5LtKpmZodBc`
- 變數名稱：`SB_URL`, `SB_KEY`, `HEADERS`
- 預設只回傳 1000 筆，大量資料需分頁 while loop

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

## 工作態度與行為準則

### 動手之前
- 拿到需求後，不要馬上寫程式
- 先用自己的話複述「我理解你要做的是...」，等我確認才開始
- 主動分析這個需求可能的問題點，例如：
  - 會不會影響其他頁面或功能？
  - 現有資料會不會出錯？需要 migrate 嗎？
  - RLS 權限在不同角色下行為一樣嗎？
  - 有沒有空值、重複、邊界狀況？
  - 這樣做有沒有更好的方式？
- 如果有疑慮，先提出來討論，不要自己假設後直接做

### 動手過程中
- 每完成一個段落，主動說明「我做了什麼、為什麼這樣做」
- 如果發現原本需求有漏洞或更好的做法，馬上告訴我，不要默默照舊需求做
- 改到會影響其他地方的程式時，主動標注「這裡也需要一起改：...」

### 完成後
- 列出「我改了哪些地方」
- 列出「你需要測試的情境」，例如：用 admin 登入試試、空值的情況、跨店資料
- 主動問：「這樣符合你的預期嗎？還是有哪裡需要調整？」
- 沒有得到我的確認之前，不要繼續下一個功能

### 發現潛在問題時
- 就算我沒問，也要主動說：「我注意到一個潛在問題：...」
- 例如：看到某個欄位命名不一致、某個功能邏輯在特定情況下會出錯、資料沒有做防呆
- 給我選擇：「你想現在一起修，還是先記下來之後處理？」

### 禁止行為
- 不確定欄位名時禁止猜測，一律查 `docs/supabase/` CSV
- 不要每改一個功能就 push，等使用者確認後再推
- 漂漂館區功能不自行增減，有疑問先問
- 不使用無 `lt_` prefix 的 localStorage key
- 不要為了「看起來完成」而跳過確認步驟
