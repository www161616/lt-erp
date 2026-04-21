-- ============================================================
-- incident_scan_results 表 DDL（2026-04-21 v1）
-- ============================================================
-- 目的：持久化事故掃描結果，支援
--   (1) 趨勢分析（每天一次或多次掃，看紅燈是否遞減）
--   (2) 誤報抑制（已確認的良性異常標記 ignored_*，下次不再警報）
--   (3) 已處理標記（resolved_* 記錄何時修完，由誰修）
--
-- 設計原則：
--   - 固定主欄位 (scan_type, entity_id, severity, scanned_at)
--   - 明細用 JSONB payload，之後新增 scan 類型不用改 schema
--   - 紀錄只寫不改（事件日誌模式），除了 resolved_* / ignored_* 這三組可 UPDATE
--
-- 部署順序（先不要立刻跑）：
--   1. 先在 Supabase SQL Editor 手動跑 scan_v1.sql 的 5 個 scan
--   2. 驗證輸出不是大量誤報
--   3. 確認後才執行這份 DDL 建表
--   4. 最後接 Apps Script 把掃描結果寫進這張表 + Google Sheet 儀表板
-- ============================================================

create table if not exists incident_scan_results (
  id              bigserial       primary key,
  scan_type       text            not null,          -- scan_1_no_details / scan_2_date_drift / scan_3_subtotal_mismatch / scan_4_payment_status_diverge / scan_5_orphan_details
  entity_id       text            not null,          -- 被掃到的對象 ID（sales_orders.id 或 sales_details.id）
  severity        text            not null,          -- 'red' 或 'yellow'
  payload         jsonb           not null,          -- 該次掃描的完整輸出列（除 scan_type/severity 外的所有欄位）
  scanned_at      timestamptz     not null default now(),

  -- 已處理標記（人工確認修好後填）
  resolved_at     timestamptz,
  resolved_by     text,
  resolved_note   text,

  -- 誤報抑制（確認是良性異常後填，未來再掃到同一 entity_id 不再警報）
  ignored_at      timestamptz,
  ignored_by      text,
  ignored_reason  text,

  -- 同一筆資料重複掃到不會重複寫入
  unique (scan_type, entity_id, scanned_at)
);

-- 依 scan_type 看最近事故
create index if not exists idx_incident_scan_type_time
  on incident_scan_results (scan_type, scanned_at desc);

-- 找「未處理、未抑制」的案件（儀表板主要查詢路徑）
create index if not exists idx_incident_scan_open
  on incident_scan_results (entity_id)
  where resolved_at is null and ignored_at is null;

-- severity + scanned_at，列出某天所有紅燈
create index if not exists idx_incident_scan_severity
  on incident_scan_results (severity, scanned_at desc)
  where resolved_at is null and ignored_at is null;

-- RLS：先不啟用（讓 admin/assistant 直接查）
-- 之後接 Apps Script 時再決定是否加 service_role only 的 policy
