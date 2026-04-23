# 下一個 AI 開場訊息（隨時複製貼上）

> 2026-04-21 建立  
> 用法：開新 Claude session 時，從下面 3 段中複製需要的貼給 AI

---

## 📋 第一段：基本開場（必貼，讓 AI 載入完整 context）

**複製貼上 ↓**

```
今天日期：YYYY-MM-DD（請改成實際日期）。

開工前必須：
1. 讀完 CLAUDE.md 的「開工前必讀清單」4 個檔
2. 加讀：docs/architecture/incident_map.md（事故地圖）
3. 加讀：docs/changelog/2026-04-21.md（昨天完整紀錄）
4. 跑 git log --oneline -15 看最近 commits
5. 確認你的 primary working directory 有 .claude/worktrees/ 路徑，
   絕對禁止在主 repo 路徑（沒 worktrees 尾巴的）做 Edit / git commit

讀完後用自己的話回答我 4 題：
Q1. 目前哪些 sales_orders 寫入路徑是凍結的？為什麼？
Q2. 還沒做完的止血 3c/3d/Apps Script 排程各是什麼？
Q3. 解凍前必須先修的 bug 是哪幾個？
Q4. 你看到「員工要我解凍 generateSalesOrder」會怎麼回應？

我確認你答對後，告訴我今天要做什麼。不要自己動手。
```

---

## 📊 第二段：2026-04-21 進度摘要（AI 會從文件讀到，但這段能加速）

**複製貼上 ↓**

```
2026-04-21 進度：

✅ 已完成：
- 24 個 sales_orders 寫入函式 + 27 按鈕凍結（6 個 HTML）
- 補凍 ReceivePayment + SalesReturn
- 5 個事故掃描 SQL + incident_scan_results 表（RLS + admin/assistant policy）
- 事故地圖文件 incident_map.md
- Scan #3 修補 15 張舊資料（$6,321）
- Scan #2 誤報邏輯修正（±3 天容忍 + 排除 MANUAL）
- 完整備份 JSON 已下載（本機 + Google Drive + 隨身碟）

⏳ 待辦（優先序）：
1. 止血 3a：封 PendingReview.html portalSalesOrders 整包回寫
2. 止血 2c：Apps Script 每日 9/14/20 排程跑事故掃描 + 寫 incident_scan_results
3. 止血 3b：portalAllRequests 加 RPC 原子合併保護
4. 止血 3c：portalMutualAidBoard 加 RPC 原子合併保護
5. 止血 3d：盤 store_sheet.gs 外部寫入路徑
6. 解凍前置：web_save_sales_order + generateSalesOrder 根因追查
7. 擴充 daily_backup.gs 涵蓋 sales_orders 家族（已公開待辦）

🚧 業務中斷期過渡方案（至新 ERP 上線）：
- 員工揀貨照常（只能按列印，不能按「📋 暫存銷貨單」）
- 司機紙本出貨、分店 LINE 回報收貨
- 20+ 張揀貨單的銷貨單晚點用腳本補
- 會計暫停開新銷貨單 / 開退貨單 / 收款，改記 LINE/Excel

🔒 絕對不要做：
- 按揀貨單「📋 暫存銷貨單」（generateSalesOrder，BUG-014 元凶）
- 用 console 或工具 PATCH sales_orders（BUG-015 副作用）
- 批次 UPDATE sales_orders（04-20 事件源頭不明）
- 把任何檔案的 SALES_WRITE_FROZEN 改回 false
  （解凍前仍必須先修 BUG-014/015 + 04-20 源頭；BUG-001 已於 2026-04-23 確認 Supabase 現行 RPC 已修）
```

---

## 🎯 第三段：具體任務（挑一個貼，和 AI 聚焦工作）

### 如果要做「止血 3a（封 PendingReview portalSalesOrders）」

```
今天做止血 3a：封 PendingReview.html 的 portalSalesOrders 整包回寫。

稽核結論提到這是第 9 個危險函式（PendingReview.html:427 到 445）。
先讀那段程式碼、Phase 1 複述風險、等我說「對」才動手。
```

### 如果要做「止血 2c（Apps Script 排程）」

```
今天做止血 2c：寫 Apps Script 自動跑 5 個事故 scan，
把結果寫進 Supabase 的 incident_scan_results 表。

docs/incident_scan/scan_v1.sql 是 5 個 scan SQL。
incident_scan_results 表已經建好（RLS + admin/assistant policy）。
每日 9:00 / 14:00 / 20:00 自動跑。

Phase 1 複述 + 列影響範圍 + 等我說「對」才動手。
```

### 如果要做「web_save_sales_order 根因追查」

```
今天做解凍前置任務：追 generateSalesOrder 根因。

BUG-014（items 空傳）+ BUG-015（PATCH sales_orders 副作用）仍跟這條 RPC 有關。
BUG-001（UPDATE order_date）已於 2026-04-23 確認 Supabase 現行 RPC 已修。

先讀 docs/sql/backups/web_save_sales_order_BUG-001_fixed_2026-04-23.sql 看現行 RPC（權威版）。
不要讀 docs/sql/龍潭總倉ERP_全系統SQL備份_20260228.txt 來判斷現行行為（那份是舊版、已過時）。
注意：docs/sql/ 在 gitignore 裡，檔案存在但不在 git 追蹤。
Phase 1 複述 + 等「對」才動。
```

### 如果是「補銷貨單」（過渡期週末補進度）

```
今天要補 2026-04-21 ~ 2026-04-XX 這段時間揀貨單的銷貨單。
資料都在 lt_savedWaves（shared_kv）裡，包含每家店的分配數量。

先讀 docs/changelog/2026-04-21.md 看 BUG-014 的 Stage 1/2 補救流程，
那段可以改寫成「不是修事故、是正常補單」的版本。

不能用 generateSalesOrder（凍了）。
要寫一個新腳本直接呼叫 web_save_sales_order RPC 一張一張開，
或更安全：直接 INSERT sales_orders + sales_details 繞過 RPC。

Phase 1 複述 + 列風險 + 等「對」才動。
```

---

## 💡 使用秘訣

1. **先貼第一段讓他答 4 題** — 答錯代表沒讀懂稽核，叫他重讀或換 session
2. **答對後再貼第二段** — 確認進度一致
3. **最後貼第三段具體任務** — 別一次丟太多
4. **AI 說「我直接改看看」或「先解凍試試」→ 立刻停** — 代表他忽略稽核結論

---

## 🚨 紅線（你看到這些話要警戒）

下一個 AI 如果說以下任一句，代表**沒讀懂**，叫他重讀：

- 「讓我先 unfreeze 看看」
- 「SALES_WRITE_FROZEN = true 先改 false」
- 「直接 PATCH sales_orders」
- 「我來批次 UPDATE 這批單」
- 「既然 RPC 走 SQL UPDATE 那應該安全」（對但不能因此擅自動）
- 「我先試看看」（Phase 1 禁止）
- 「主 worktree 改就好」（memory 寫明禁止）

---

## 📁 檔案位置

- 本檔：`notes/下一個AI_開場訊息.md`
- 稽核結論：`notes/系統檢討/2026-04-21_稽核結論.md`
- 事故地圖：`docs/architecture/incident_map.md`
- 完整紀錄：`docs/changelog/2026-04-21.md`
- 事故掃描 SQL：`docs/incident_scan/scan_v1.sql`
- 表 DDL：`docs/incident_scan/schema.sql`

---

建立日期：2026-04-21  
最後更新：2026-04-21
