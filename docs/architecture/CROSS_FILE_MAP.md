# LT-ERP 跨檔案架構地圖 (CROSS_FILE_MAP)

> 產生日期：2026-04-16
> 涵蓋範圍：所有非 backup 的 HTML 檔 + Google Apps Script
> ⚠️ Claude Code 開工前必讀此文件。改任何東西前先查對應章節。

---

## 目錄

1. [系統總覽](#1-系統總覽)
2. [三大入口與角色對應](#2-三大入口與角色對應)
3. [index.html — 主站 iframe shell](#3-indexhtml--主站-iframe-shell)
4. [admin/branch_admin.html — 開團小幫手](#4-adminbranch_adminhtml--開團小幫手)
5. [branch/branch_portal.html — 分店入口](#5-branchbranch_portalhtml--分店入口)
6. [supplier_xiaolan.html — 小瀾採購管理](#6-supplier_xiaolanhtml--小瀾採購管理)
7. [shared_kv 雲端同步對照表](#7-shared_kv-雲端同步對照表)
8. [localStorage 完整鍵值地圖（含風險等級）](#8-localstorage-完整鍵值地圖含風險等級)
9. [Supabase 表 × 檔案 存取矩陣](#9-supabase-表--檔案-存取矩陣)
10. [RPC 函式 × 呼叫端對照表](#10-rpc-函式--呼叫端對照表)
11. [跨檔案資料流向圖](#11-跨檔案資料流向圖)
12. [sales_orders / sales_details 完整欄位](#12-sales_orders--sales_details-完整欄位含-branch-擴充)
13. [store 角色安全規則（最容易踩的雷）](#13-store-角色安全規則最容易踩的雷)
14. [改動觸發規則（Stop Trigger 對照表）](#14-改動觸發規則stop-trigger-對照表)
15. [已知地雷清單](#15-已知地雷清單)
16. [外部依賴 CDN / 本地 libs](#16-外部依賴-cdn--本地-libs)
17. [Google Apps Script](#17-google-apps-script)
18. [已停用/廢棄檔案](#18-已停用廢棄檔案)

---

## 1. 系統總覽

```
LT-ERP 是純 HTML/CSS/JS 單檔架構，無框架，部署在 GitHub Pages。
後端：Supabase (PostgreSQL + REST API + Auth + RLS)

┌─────────────────────────────────────────────────────────┐
│                    GitHub Pages                          │
│                                                          │
│  ┌──────────┐   ┌───────────────┐   ┌────────────────┐  │
│  │ index    │   │ branch_admin  │   │ branch_portal  │  │
│  │ (主站)   │   │ (助理/員工)    │   │ (分店)         │  │
│  │ iframe   │   │ 獨立單頁      │   │ 獨立單頁       │  │
│  │ ↓載入    │   └───────┬───────┘   └───────┬────────┘  │
│  │ 40+子頁  │           │                    │           │
│  └────┬─────┘           │   shared_kv 同步   │           │
│       │                 └────────────────────┘           │
│  ┌────┴──────────────────┐   ┌───────────────────────┐  │
│  │ supplier_xiaolan      │   │ backup.html           │  │
│  │ (小瀾私人採購，獨立)    │   │ (備份工具，獨立)       │  │
│  └───────────────────────┘   └───────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         │
                    Supabase
              (REST API + Auth + RLS)
```

---

## 2. 三大入口與角色對應

| 入口檔案 | 允許角色 | 主題色 | 載入方式 |
|----------|---------|--------|---------|
| `index.html` | admin, accountant | 石板灰 `#475569` | iframe 載入 40+ 子頁 |
| `admin/branch_admin.html` | admin, assistant, staff | 深藍 `#2b6cb0` | 獨立單頁，內建 20+ tab |
| `branch/branch_portal.html` | store (+ admin 可登入) | 玫瑰粉 `#be185d` | 獨立單頁，內建 17 tab |
| `supplier_xiaolan.html` | 無限制 (anon key) | 獨立配色 | 獨立單頁，6 分頁 |

---

## 3. index.html — 主站 iframe shell

### 認證流程
1. `erpDoLogin()` → `signInWithPassword(username@lt-erp.com)`
2. 驗證 role 必須是 `admin` 或 `accountant`
3. Token 存入 `sessionStorage('sb_auth_token')`
4. 每 10 分鐘自動刷新 token
5. 帳號管理 (AccountManager.html) 僅 `www161616` 可見

### Sidebar 選單 → iframe 載入對照

| 選單群組 | 選單項目 | 載入的 HTML |
|---------|---------|------------|
| 儀表板 | 儀表板 | (內建 dashboard-view) |
| 待審 | 待審單據 | PendingReview.html |
| 開單作業 | 開新銷貨單 | SalesOrder.html |
| | 查詢銷貨單 | SearchSales.html |
| | 銷貨退回 | SalesReturn.html |
| | 查詢退貨單 | SearchReturns.html |
| | 開新進貨單 | PurchaseOrder.html |
| | 查詢進貨單 | SearchPurchase.html |
| 收付款管理 | 客戶收款紀錄 | ReceivePayment.html |
| | 收款紀錄查詢 | ReceivePaymentList.html |
| | 供應商付款 | MakePayment.html |
| 庫存管理 | 庫存查詢 | Inventory.html |
| | 庫存盤點 | Stocktake.html |
| | 庫存耗損單 | DamageOrders.html |
| | 庫存預警 | Lowstockalert.html |
| | 庫存異動記錄 | InventoryLog.html |
| 財務管理 | 零用金管理 | PettyCashPanel.html |
| | 現金支出 | AddExpense.html |
| | 支出明細 | ExpenseList.html |
| 報表分析 | 應收帳款報表 | Receivablereport.html |
| | 應付帳款報表 | PayableReport.html |
| | 月結報表 | MonthlyReport.html (chooseMonthlyReport 路由) |
| | 客戶月結對帳 | CustomerMonthlyReport.html |
| | 商品分析 | ProductAnalysis.html |
| | 每日出貨報表 | DailyReport.html |
| | 異常價格清單 | AbnormalPrices.html |
| | 店轉店月結 | TransferSettlement.html |
| 基礎設定 | 商品管理 | ProductList.html |
| | 客戶管理 | CustomerList.html |
| | 供應商管理 | SupplierList.html |
| | 設定客戶特價 | PriceForm.html |
| | 帳號管理 | AccountManager.html |

### Dashboard 直接查詢的 Supabase 表
- `sales_orders` — 本月銷售額
- `purchase_orders` — 本月進貨額
- `accounts_receivable` — 未收帳款
- `petty_cash` — 零用金餘額
- `internal_purchases` — 待審筆數 badge
- `calendar_events` — 日曆記事

### 特殊
- `chooseMonthlyReport()` → SweetAlert 選 → `sessionStorage('mr_view')` → 載入同一個 `MonthlyReport.html`
- index.html 自己只存 `lt_sidebarState`，其餘資料全在子頁面

---

## 4. admin/branch_admin.html — 開團小幫手

### Tab 結構 (switchTab)

| Tab ID | 名稱 | 用途 |
|--------|------|------|
| home | 總倉儀表板 | 首頁 |
| arrivalTracking | 到貨追蹤 | 陸貨到貨狀態 |
| campaign | 商品建檔 | 極速開團建檔 + Excel 批次匯入 |
| purchase | 新增採購單 | 內部採購單 |
| searchPurchase | 查詢採購單 | 採購歷史 |
| adminSummary | 開團總表 | 所有店的訂購匯總 |
| orders | 訂貨追蹤 | 訂貨進度管理 |
| gbOrder | 團購叫貨區 | 團購訂貨 + 退換貨登記 |
| ppAssistant | 漂漂館區 | 漂漂館商品管理 |
| cnArrivals | 陸貨到貨清單 | 大陸到貨明細 |
| cnReturns | 查詢退換貨 | 退換貨歷史 |
| warehouseReturn | 退回龍潭 | 分店退回總倉記錄 |
| picking | 新建揀貨單 | 建立揀貨波次 |
| pickingHistory | 揀貨歷史 | 波次查詢 |
| accounting | 銷貨單管理 | 銷貨單 CRUD |
| searchReturns | 退貨單查詢 | 退貨歷史 |
| demandBackorder | 需求與欠品管理 | 需求單 + 欠品追蹤 |
| transfer | 店轉店審核 | 審批店轉店 + 損壞登記 |
| aid | 互助交流 | 互助留言板 |
| bulletin | 公告管理 | 公告 CRUD |
| backup | 資料備份 | 匯出 / 還原 |

### 內嵌 iframe
- `SupplierList.html` — 供應商管理 tab 內嵌
- `admin/ImportGroupBuy.html` — 匯入開團資料（postMessage 傳 authToken）

### Badge 通知來源
- **待審需求 badge** ← `portalAllRequests` status==='pending' 筆數
- **店轉店 badge** ← `transfer_orders` admin_status==='pending' 筆數
- **互助交流 badge** ← `portalMutualAidBoard` 中非 admin 的未讀回覆

### Dirty Tracking 機制（防覆蓋關鍵）
- `_dirtyBranchStores = new Set()` — 追蹤 admin 修改過哪些店
- cloudSave branchOrders 只推 dirty set 裡的店（透過 RPC `merge_branch_order`）
- 防止 admin 的過時 snapshot 覆蓋 portal 剛送出的資料

---

## 5. branch/branch_portal.html — 分店入口

### 認證流程
1. `doLogin()` → `signInWithPassword(username@lt-erp.com)`
2. 驗證 role 必須是 `store`（admin 帳號 www161616 例外）
3. 從 `user_metadata` 取 store name，對照 `branchDataList`
4. 每 10 分鐘刷新 token
5. 批發店 (store_type=wholesale) 隱藏大部分功能

### Tab 結構 (switchPage)

| Page ID | 名稱 | 主要功能 |
|---------|------|---------|
| pageBulletin | 公告欄 | 讀取公告 |
| pageOrder | 結單填表 | 訂購數量填寫 + 樂樂報表匯入 |
| pageTracking | 訂貨動態追蹤 | 訂貨進度查看 |
| pageSummary | 開團總表 | 訂購匯總（唯讀） |
| pageRequest | 需求表 | 提出需求 |
| pageTransfer | 店轉店登記 | 登記轉出/確認轉入 |
| pageAid | 互助交流 | 互助留言 + 88折出清 |
| pageBackorder | 欠品清單 | 查看欠品 |
| pageDeliveryPreview | 明日到貨預告 | 預覽明日到貨 |
| pageBilling | 今日進貨單 | 查看當日銷貨單（讀 DB） |
| pageHistory | 所有進貨單 | 歷史銷貨單 + 退貨回報 |
| pageLedger | 流水帳/訂包管理 | 記帳 + 訂包記錄 |
| pageArrival | 到貨狀況 | 到貨進度 |
| pagePriceSearch | 商品查價 | 查商品價格 |
| pageCommon | 常用功能 | 備忘錄/自訂網址/常用語 |
| pageInventory | 庫存管理 | 分店庫存 |
| pageSales | 今日銷貨 | 今日銷貨 CSV 匯入 |

### 自動同步
- `cloudLoadAll()` 在切頁時觸發
- 每 60 秒自動同步
- `_pendingBranchOrdersSave` 確保 cloudSave 完成前不覆蓋

---

## 6. supplier_xiaolan.html — 小瀾採購管理

| 分頁 | 用途 | 主要 Supabase 表 |
|------|------|----------------|
| 所有訂單 | 全部採購紀錄 | xiaolan_purchases |
| 漂漂館 | 大陸服飾採購 | xiaolan_piaopiao |
| 團購購買 | 團購叫貨 | xiaolan_order_tracking |
| 到貨清單 | 到貨管理 | xiaolan_arrivals |
| 陸貨訂購 | 陸貨訂單 | xiaolan_purchases |
| 退換貨追蹤 | 退換貨 | xiaolan_returns |

- 獨立頁面，用 anon key（xiaolan_* 6 張表有 anon RLS）
- 搜尋支援繁簡互搜（fuzzyMatch 函式）
- 已被 Google Sheets 雙向同步取代日常操作，但仍保留

---

## 7. shared_kv 雲端同步對照表

### branch_admin 同步的 keys
```
branchOrderList, branchOrders(RPC), branchDataList, branchTypeMap,
portalAllRequests, portalTransferList, portalMutualAidBoard,
importedStoreNames, importedPersonalNames, lt_savedWaves,
lt_backorderMeta, branchOrdersLocked, shortageNegotiations,
portalTrackingData, portalBulletin
```

### branch_portal 同步的 keys
```
branchOrders(RPC), portalAllRequests, portalMutualAidBoard,
portalBulletin, shortageNegotiations
```

### ⚠️ branchOrders 特殊：必須用 RPC
- 任何寫入 branchOrders 一律呼叫 `merge_branch_order(p_store, p_data)` RPC
- **禁止直接 POST 到 shared_kv**（會覆蓋其他店的資料）

---

## 8. localStorage 完整鍵值地圖（含風險等級）

> 🔴 改動格式兩邊都會壞　🟡 影響範圍大　🟢 局部影響

| Key | 寫入方 | 讀取方 | 格式說明 | 風險 |
|-----|--------|--------|----------|------|
| `branchOrders` | portal（主）、admin（補） | **兩邊都讀** | `{ storeId: { _uid: qty } }`，**_uid = `id + '__' + storeId`** | 🔴 最高 |
| `branchOrderList` | admin（唯一） | portal（唯讀） | `[{ id, name, endDate, status, ... }]` | 🔴 高 |
| `branchOrdersLocked` | admin（唯一） | portal（唯讀） | `{ _uid: true }`，任何清除必須跳過 | 🔴 高 |
| `branchDataList` | admin（唯一） | portal（唯讀） | 分店清單 + 運費設定 | 🟡 中 |
| `branchTypeMap` | admin（唯一） | portal（唯讀） | `{ storeName: 'store'/'branch' }` | 🟡 中 |
| `lt_savedWaves` | admin（唯一） | admin（自讀） | 波次資料，**不可被 QuotaExceeded 清除** | 🟡 中 |
| `portalAllRequests` | **兩邊都寫** | **兩邊都讀** | 分店需求清單 | 🔴 高 |
| `portalBulletin` | admin（唯一） | portal（唯讀） | 公告列表 | 🟢 低 |
| `portalMutualAidBoard` | **兩邊都寫** | **兩邊都讀** | 互助交流 | 🟡 中 |
| `portalTransferList` | admin（唯一） | portal（唯讀） | 店轉店清單快取 | 🟡 中 |
| `shortageNegotiations` | **兩邊都寫** | **兩邊都讀** | 缺貨協商 | 🟡 中 |
| `portalTrackingData` | admin（唯一） | portal（唯讀） | 追蹤資料 | 🟢 低 |
| `lt_backorderMeta` | admin（唯一） | admin（自讀） | 補貨紀錄 | 🟢 低 |
| `importedStoreNames` | admin（唯一） | portal（唯讀） | 匯入過的店名 | 🟢 低 |
| `portalSalesOrders` | （已廢棄，改讀 DB） | portal 唯讀 | **不可被 QuotaExceeded 清除** | 🟡 中 |
| `bp_orderQtyCache` | portal | portal | 結單頁填單暫存 | 🟢 低 |

### 絕對禁止被 QuotaExceeded 清除的 key
- `lt_savedWaves`
- `portalSalesOrders`

---

## 9. Supabase 表 × 檔案 存取矩陣

> R=讀, W=寫, RW=讀寫, CRUD=全部, -=不使用

### 開團 / 訂單核心表

| 表名 | branch_admin | branch_portal | SalesOrder | SearchSales | PendingReview |
|------|-------------|--------------|-----------|-------------|--------------|
| sales_orders | RW | R（透過 RPC）| W | RW | RW |
| sales_details | RW | R（透過 RPC）| W | RW | RW |
| br_picking_waves | RW | - | - | - | - |
| br_picking_items | RW | - | - | - | - |
| backorders | RW | R | - | - | - |
| shared_kv | RW | RW | - | - | - |

### 採購 / 應收應付

| 表名 | branch_admin | PurchaseOrder | SearchPurchase | ReceivePayment |
|------|-------------|--------------|---------------|---------------|
| purchase_orders | RW | W | R | - |
| purchase_details | RW | W | R | - |
| accounts_receivable | R | - | - | RW |
| accounts_payable | - | - | - | - |

### 庫存表

| 表名 | branch_admin | Inventory | Stocktake | InventoryLog | DamageOrders |
|------|-------------|-----------|-----------|-------------|-------------|
| inventory | RW | RW | R | - | R |
| inventory_logs | RW | W | - | R | W |
| damage_orders | - | - | - | - | RW |

### 小瀾相關表

| 表名 | supplier_xiaolan | branch_admin |
|------|-----------------|-------------|
| xiaolan_purchases | CRUD | R |
| xiaolan_arrivals | CRUD | RW |
| xiaolan_returns | CRUD | CRUD |
| xiaolan_piaopiao | CRUD | CRUD |
| xiaolan_order_tracking | CRUD | RW |

### 分店特有表

| 表名 | branch_portal | branch_admin |
|------|--------------|-------------|
| transfer_orders | RW | RWD |
| transfer_items | RW | RD |
| clearance_periods | RW | - |
| clearance_items | CRUD | - |
| branch_settings | RW | - |

---

## 10. RPC 函式 × 呼叫端對照表

| RPC 函式 | 呼叫端 | 用途 |
|----------|--------|------|
| `merge_branch_order` | branch_admin, branch_portal | 原子合併 branchOrders（防覆蓋） |
| `confirm_store_received` | branch_portal | 確認收貨 |
| `revoke_store_confirmed` | branch_portal | 撤銷確認收貨 |
| `submit_return_report` | branch_portal | 退貨回報（同時改 sales_details + sales_orders.portal_status） |
| `web_save_sales_order` | SalesOrder, branch_admin, PendingReview | 開銷貨單（主表+明細+應收+庫存） |
| `web_delete_sales_order` | SearchSales | 刪除銷貨單 |
| `web_receive_payment` | SearchSales | 單筆收款 |
| `web_batch_receive_payments` | ReceivePayment | 批次收款 |
| `web_save_purchase_order` | PurchaseOrder, PendingReview | 儲存進貨單 |
| `web_make_payment` | MakePayment, PendingReview | 供應商付款 |
| `web_save_expense` | AddExpense | 儲存支出 |
| `web_add_petty_cash` | PettyCashPanel | 新增零用金 |
| `web_convert_stock` | ConvertStock | 庫存轉換 |
| `process_damage_order` | DamageOrders | 處理耗損單（扣庫存） |
| `cancel_damage_order` | DamageOrders | 作廢耗損單 |
| `process_transfer_damage` | branch_admin | 店轉店損壞登記 |
| `cancel_transfer_damage` | branch_admin | 撤銷損壞登記 |
| `get_store_transfers` | branch_admin, branch_portal, TransferSettlement | 查詢店轉店明細 |
| `generate_transfer_settlement` | TransferSettlement | 產生店轉店月結 |
| `web_save_special_prices` | PriceForm, SalesOrder | 儲存客戶特價 |
| `web_save_supplier` | SupplierManager, PurchaseOrder | 儲存供應商 |
| `web_save_customer` | CustomerManager | 儲存客戶 |
| `web_get_product_analysis` | ProductAnalysis | 商品分析報表 |
| `admin_create_auth_user` | AccountManager | 建立帳號 |
| `admin_update_auth_user` | AccountManager | 更新帳號 |
| `admin_delete_auth_user` | AccountManager | 刪除帳號 |

---

## 11. 跨檔案資料流向圖

### 開團訂貨流程
```
[admin/ImportGroupBuy.html]
    │ 匯入 Excel → 寫 branchOrderList + branchOrders
    ▼
[shared_kv] ◄──── cloudSave(RPC) ────► [localStorage]
    │
    ├──► [branch_admin.html] 開團總表（讀 branchOrders 匯總）
    │       │ admin 改數量 → RPC merge_branch_order → shared_kv
    │       │ syncToERP → 建 branchOrderList 商品
    │       │ 新建揀貨單 → br_picking_waves + br_picking_items
    │       │ 開銷貨單 → sales_orders + sales_details + inventory
    │       ▼
    │    [Supabase DB]
    │
    └──► [branch_portal.html] 結單填表（讀 branchOrderList 顯示商品）
            │ 店家填數量 → RPC merge_branch_order → shared_kv
            │ 匯入樂樂報表 → 解析 CSV → 填入數量
            │ 送出訂單 → await cloudSave branchOrders
            ▼
         [shared_kv]
```

### 銷貨單流程
```
[branch_admin.html] 揀貨分發
    │ 開銷貨單 → web_save_sales_order RPC
    ▼
[sales_orders + sales_details] (DB)
    │
    ├──► [branch_portal.html] 今日進貨單（直接讀 DB）
    │       │ 確認收貨 → confirm_store_received RPC
    │       │ 退貨回報 → submit_return_report RPC
    │       ▼
    │    [sales_orders.portal_status + sales_details.return_*]
    │
    ├──► [SearchSales.html] 查詢（via index.html iframe）
    ├──► [Receivablereport.html] 應收帳款
    └──► [CustomerMonthlyReport.html] 客戶月結
```

### 需求單 / 互助 / 店轉店
```
[branch_portal.html] 分店提出
    │ 需求單 → portalAllRequests → shared_kv
    │ 互助留言 → portalMutualAidBoard → shared_kv
    │ 店轉店 → transfer_orders (DB)
    ▼
[branch_admin.html] 管理端審核
    │ 需求處理 → 更新 portalAllRequests → shared_kv
    │ 互助回覆 → 更新 portalMutualAidBoard → shared_kv
    │ 店轉店審批 → PATCH transfer_orders (DB)
    ▼
[branch_portal.html] 分店收到結果
```

---

## 12. sales_orders / sales_details 完整欄位（含 branch 擴充）

> ⚠️ Schema CSV 只有基本欄位，以下包含 branch 系統擴充欄位

### sales_orders

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | varchar | 格式 `SO20260407010` 或舊版 `SO00001` |
| order_date | date | ⚠️ 已知 bug：開單時可能被改成當天日期，根因未找 |
| customer_id | varchar | 分店單用「包子媽-xxx店」格式 |
| customer_name | varchar | 查詢分店單：`customer_name=like.*包子媽*` |
| subtotal | numeric | |
| shipping | numeric | |
| deduction | numeric | |
| tax_amount | numeric | |
| grand_total | numeric | |
| tax_type | varchar | |
| payment_status | varchar | 未收款 / 已收款 / 部分收款 |
| created_at | timestamp | |
| note | text | |
| wave_id | text | 對應 lt_savedWaves 的波次 ID |
| portal_status | text | null / issued / disputed / received |
| issued_at | timestamp | 銷貨單開立時間 |

### sales_details

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | varchar | 格式 `SO20260407010-1` |
| order_id | varchar | 關聯 sales_orders.id |
| product_id | varchar | |
| product_name | varchar | |
| qty | integer | |
| unit | varchar | |
| unit_price | numeric | |
| subtotal | numeric | |
| unit_cost | numeric | |
| profit | numeric | |
| note | text | |
| return_qty | integer | 退貨數量 |
| return_status | varchar | none / requested / accepted / received / rejected / waived |
| return_reason | text | |
| report_type | varchar | shortage(少) / damaged(損) / missing(缺) / return(退) |

---

## 13. store 角色安全規則（最容易踩的雷）

### ⚠️ store 角色直接 PATCH 敏感表 = 靜默失敗（RLS 擋住，但回傳 200）

store 角色必須走 RPC：

| 操作 | 必須用的 RPC |
|------|------------|
| 退貨回報 | `submit_return_report(p_detail_id, p_order_id, p_return_qty, p_return_reason, p_report_type)` |
| 確認收貨 | `confirm_store_received(p_order_id)` |
| 撤銷確認 | `revoke_store_confirmed(p_order_id)` |
| 寫入 branchOrders | `merge_branch_order(p_store, p_data)` |

### 歷史教訓（04/15 事故）
搬家型改動只改讀取端，沒改寫入端。store 角色 PATCH 被 RLS 擋住回傳 200，退貨回報全部靜默失敗，修了整整一天。

---

## 14. 改動觸發規則（Stop Trigger 對照表）

| 你在改... | 你必須同時確認... |
|-----------|-----------------|
| `branchOrders` 格式 | branch_admin + branch_portal + `merge_branch_order` RPC 三個 |
| `branchOrderList` 結構 | grep `getItem('branchOrderList'` 在 branch_portal 所有讀取點 |
| `portalAllRequests` 格式 | branch_admin 同步函式 + branch_portal 讀取端 |
| `sales_orders` 任何欄位 | branch_admin 開單流程 + SearchSales + SalesOrder |
| `sales_details` 任何欄位 | 退貨 RPC + branch_admin showSalesOrderDetail + branch_portal 退貨回報 |
| store 角色的任何寫入 | 確認走 RPC，不能直接 PATCH 敏感表 |
| 任何 shared_kv key | grep branch_admin + branch_portal 兩個檔案所有用到這個 key 的地方 |
| index 子頁面 | branch_admin 有沒有也操作同一張表 |
| transfer_orders/items | branch_portal + branch_admin 兩邊的審核/列印邏輯 |
| products 表欄位 | index 子頁面 + branch_admin 商品建檔 + branch_portal 結單填表 |
| QuotaExceeded 清除邏輯 | 確認 `lt_savedWaves` 和 `portalSalesOrders` 不在清除名單 |

---

## 15. 已知地雷清單

1. **branchOrders _uid 複合主鍵**
   ```js
   // ✅ 正確
   const uid = `${productId}__${storeId}`;
   const item = branchOrders[storeId]?.[uid];
   // ❌ 錯誤（找不到資料）
   const item = branchOrders[storeId]?.[productId];
   ```

2. **store 角色 PATCH 靜默失敗**：RLS 擋了但回傳 200。一定走 RPC。

3. **portalSalesOrders 已改讀 DB**：不再靠 shared_kv，但不可被 QuotaExceeded 清除。

4. **branchOrdersLocked 必須跳過**：任何清除 branchOrders 的操作，必須保留 locked 項目。

5. **搬家型改動必須同時改讀寫兩端**：只改讀取端就 push = 確定出事。

6. **customer_name 篩選**：查分店銷貨單必須加 `customer_name=like.*包子媽*`。

7. **order_date bug（根因未找）**：開單時可能被改成當天日期，不要在不確定情況下動這個邏輯。

8. **payment_received.order_id 命名不一致**：這個欄位實際存的是 customer_id，已知問題，不要「修正」它。

9. **branchOrderList key 格式不一致**：syncToERP 存 `商品編號`，ImportGroupBuy 存 `商品編號_結單日`。portal 用 `.replace(/_.*$/, '')` 去重，改任何一端要確認另一端。

---

## 16. 外部依賴 CDN / 本地 libs

### 本地庫 (libs/)
| 檔案 | 用途 | 使用頁面 |
|------|------|---------|
| `libs/supabase.min.js` | Supabase JS | 部分子頁面 |
| `libs/sweetalert2.min.js` | 彈窗 | 幾乎所有頁面 |
| `libs/xlsx.full.min.js` | Excel 讀寫 | branch_admin, branch_portal, 匯入/匯出 |

### CDN
| 資源 | 使用頁面 |
|------|---------|
| Supabase JS v2 (`cdn.jsdelivr.net`) | index, branch_admin, branch_portal, supplier_xiaolan |
| Google Fonts Noto Sans TC | 所有頁面 |
| Font Awesome 6.4.0 | index, ProductList, CustomerList |
| ExcelJS 4.4.0 | branch_portal（動態載入）, ProductList, 報表頁面 |

---

## 17. Google Apps Script

### google-apps-script/xiaolan_sync.gs
- Google Sheets ↔ Supabase 雙向同步（小瀾採購）
- 7 個分頁：叫貨清單、訂單記錄、到貨清單、退換貨、漂漂館、月結報表、設定
- 每 5 分鐘自動同步 或 手動，用 anon key 存取

### 每日備份（獨立 Apps Script 專案）
- 每日凌晨 2 點自動執行
- 備份：branchOrders / branchOrderList / branchOrdersLocked / branchDataList / importedStoreNames / branchTypeMap
- 存放：Google Drive `LT-ERP 備份` 資料夾（名稱必須精確匹配）

---

## 18. 已停用/廢棄檔案

| 檔案 | 狀態 | 說明 |
|------|------|------|
| `DetailedReport.html` | 已停用 | 功能已整合進 MonthlyReport.html |
| `admin/ImportGroupBuy.html` | 選單已移除 | 檔案保留但從選單移除 |
| `piaopiao_assistant.html` | 不存在 | 功能已全部在 branch_admin 漂漂館區 |
| `*_backup_*.html` | 備份檔 | .gitignore 排除，不部署 |

---

*最後更新：2026-04-16*
*來源：Claude Code 全專案掃描 + Claude Web 審查合併*
