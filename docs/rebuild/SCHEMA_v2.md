# 🏗️ branchOrders v2 Schema 設計

> **狀態**：設計中（待使用者決定）
> **分支**：rebuild-2026-04
> **相關討論**：[notes/系統檢討/2026-04-18_系統重構討論.md](../../notes/系統檢討/2026-04-18_系統重構討論.md)

---

## 🎯 設計目標

讓新結構**自然解決舊系統所有架構問題**：

1. ✅ **沒有「孤兒 key」**：每筆訂單明確屬於某個結單日，無法跨期撈到
2. ✅ **沒有「歸 0 才算結案」**：`status` 欄位獨立存在，qty 永遠保留
3. ✅ **欠品是內建概念**：不需要員工另開 sheet
4. ✅ **月份自然分區**：撈 4 月資料不會把 1 月資料一起拉
5. ✅ **每店獨立寫入**：不會發生多人寫覆蓋（cloudSave race）
6. ✅ **歷史完整保留**：店家追討時 admin 查得到任何月份

---

## 📐 結構設計

### 主表：`branch_orders_v2`

每一列 = **(店, 商品, 結單日)** 三元組

```sql
CREATE TABLE branch_orders_v2 (
  id              BIGSERIAL PRIMARY KEY,
  store_name      TEXT      NOT NULL,         -- 店名（如「三峽」）
  product_id      TEXT      NOT NULL,         -- 純商品編號（如 199070101）
  end_date        DATE      NOT NULL,         -- 結單日（如 2026-04-19）
  qty             INTEGER   NOT NULL DEFAULT 0,   -- 訂購數量（永遠不歸 0）
  shortage_qty    INTEGER   NOT NULL DEFAULT 0,   -- 欠多少（撿貨後填）
  status          TEXT      NOT NULL DEFAULT 'pending',
                  -- pending（待撿）/ partial（部分到貨）/ received（全到貨）/
                  --   shortage（欠補中）/ no_replenish（不補）/ closed（結案）
  locked          BOOLEAN   NOT NULL DEFAULT FALSE,  -- admin 鎖定（取代 branchOrdersLocked）
  note            TEXT,                        -- 備註（員工可寫）
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMP,                   -- status = 'closed' 時才有值

  UNIQUE(store_name, product_id, end_date)
);

CREATE INDEX idx_bo_v2_end_date ON branch_orders_v2(end_date);
CREATE INDEX idx_bo_v2_store    ON branch_orders_v2(store_name);
CREATE INDEX idx_bo_v2_status   ON branch_orders_v2(status);
CREATE INDEX idx_bo_v2_pending_shortage
  ON branch_orders_v2(store_name, product_id)
  WHERE status IN ('pending','shortage','partial');
```

### 商品表：`branch_order_list_v2`

每一列 = **(商品, 結單日)** 二元組

```sql
CREATE TABLE branch_order_list_v2 (
  id              BIGSERIAL PRIMARY KEY,
  product_id      TEXT      NOT NULL,
  end_date        DATE      NOT NULL,
  start_date      DATE,
  product_name    TEXT      NOT NULL,
  category        TEXT,
  temp            TEXT,                  -- 常溫 / 冷藏 / 冷凍
  price           NUMERIC(10,2),
  price_branch    NUMERIC(10,2),
  cost            NUMERIC(10,2),
  supplier        TEXT,
  status          TEXT NOT NULL DEFAULT 'open',  -- open / closed
  proc_status     TEXT NOT NULL DEFAULT 'pending',
                  -- pending / ordered / arrived / out_of_stock / supplier_shortage
  eta             DATE,                  -- 預計到貨日
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(product_id, end_date)
);

CREATE INDEX idx_bol_v2_end_date ON branch_order_list_v2(end_date);
CREATE INDEX idx_bol_v2_status   ON branch_order_list_v2(status);
```

---

## 🔄 跟舊系統的對應

### 舊 → 新 對應表

| 舊資料（shared_kv） | 新資料（DB 表）|
|---|---|
| `branchOrders[店][編號_M/D] = 10` | `branch_orders_v2 (店, 編號, 結單日, qty=10, status='pending')` |
| `branchOrders[店][純編號] = 24`（孤兒）| 用 `branch_order_list_v2` 查 endDate 補上，遷移到 `branch_orders_v2` |
| `branchOrdersLocked[店][編號] = true` | `branch_orders_v2.locked = TRUE` |
| `branchOrderList[i] = {id, name, endDate...}` | `branch_order_list_v2` 一筆 |

### 「店家清除 = 結案」 → 變成

舊：`branchOrders[店][編號] = 0`
新：`UPDATE branch_orders_v2 SET status='closed', closed_at=NOW() WHERE ...`

**qty 永遠保留**，歷史查得到。

### 「員工撿完欠 5 件」 → 變成

舊：員工另開 google sheet 寫
新：`UPDATE branch_orders_v2 SET shortage_qty=5, status='shortage' WHERE ...`

撿貨頁面自動有「欠品矩陣」視圖，跟員工 sheet 一樣的長相。

### 「廠商補貨後配對欠單」 → 變成

舊：員工去 google sheet 找 → 貼到當天出貨表
新：admin 點商品 → 系統自動列出 `WHERE product_id=X AND status='shortage'` → 一鍵補發

---

## ✅ 已決定（2026-04-18 晚 使用者確認）

| 問題 | 決定 |
|---|---|
| Q1 status 列舉 | pending / partial / received / shortage / no_replenish / closed（**TEXT 不加 enum**，未來加新狀態零成本）|
| Q2 欠品 | 塞主表 `shortage_qty` 欄位（簡單）|
| Q3 store_name | 用文字（直觀）|
| Q4 個人戶 | 都塞 `branch_orders_v2`，加 `store_type` 欄位區分（'branch' vs 'personal'）|

### 因 Q4 主表加新欄位

```sql
store_type      TEXT NOT NULL DEFAULT 'branch',  -- 'branch'（分店）/ 'personal'（個人戶）
```

---

## 📝 我的下一步（如果你同意這個設計）

1. 寫 SQL 給你（含 RLS policy）→ 你切換之夜跑
2. 寫遷移腳本（從舊 shared_kv 倒進 v2 表）→ 切換之夜跑
3. 改 branch_admin / branch_portal 的程式碼讀寫 v2 表
4. 做欠品管理的「商品 vs 店家」矩陣頁（照員工 sheet 的設計）

---

#方案C #schema #v2
