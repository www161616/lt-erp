-- =====================================================================
-- branchOrders v2 表結構 + RLS
-- 版本：2026-04-18
-- 分支：rebuild-2026-04
--
-- ⚠️ 不要現在跑！這份 SQL 是切換之夜（週日 22:00）才執行的。
--    現在只是文件，給使用者 review。
--
-- 執行方式：
--   1. 在 Supabase Dashboard → SQL Editor
--   2. 整段複製貼上
--   3. 按 Run
--   4. 檢查表是否建立成功
--   5. 跑遷移腳本（另一份 SQL）把 v1 資料倒進來
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. 主表：每店每商品每結單日的訂購狀態
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branch_orders_v2 (
  id              BIGSERIAL PRIMARY KEY,
  store_name      TEXT      NOT NULL,
  store_type      TEXT      NOT NULL DEFAULT 'branch',  -- branch / personal
  product_id      TEXT      NOT NULL,
  end_date        DATE      NOT NULL,
  qty             INTEGER   NOT NULL DEFAULT 0,
  shortage_qty    INTEGER   NOT NULL DEFAULT 0,
  status          TEXT      NOT NULL DEFAULT 'pending',
                  -- 註：故意不用 enum，未來加新狀態零成本
                  -- 目前用：pending / partial / received / shortage / no_replenish / closed
  locked          BOOLEAN   NOT NULL DEFAULT FALSE,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,

  CONSTRAINT uniq_store_product_date UNIQUE(store_name, product_id, end_date)
);

CREATE INDEX IF NOT EXISTS idx_bo_v2_end_date ON branch_orders_v2(end_date);
CREATE INDEX IF NOT EXISTS idx_bo_v2_store    ON branch_orders_v2(store_name);
CREATE INDEX IF NOT EXISTS idx_bo_v2_status   ON branch_orders_v2(status);
CREATE INDEX IF NOT EXISTS idx_bo_v2_product  ON branch_orders_v2(product_id);

-- 撈「未結案」用：跨期積壓檢視超快
CREATE INDEX IF NOT EXISTS idx_bo_v2_active_orders
  ON branch_orders_v2(store_name, product_id, end_date)
  WHERE status IN ('pending','shortage','partial');

-- ─────────────────────────────────────────────────────────────────
-- 2. 商品表：每商品每結單日的開團資訊
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branch_order_list_v2 (
  id              BIGSERIAL PRIMARY KEY,
  product_id      TEXT      NOT NULL,
  end_date        DATE      NOT NULL,
  start_date      DATE,
  product_name    TEXT      NOT NULL,
  category        TEXT,
  temp            TEXT,
  price           NUMERIC(10,2),
  price_branch    NUMERIC(10,2),
  cost            NUMERIC(10,2),
  supplier        TEXT,
  status          TEXT NOT NULL DEFAULT 'open',  -- open / closed
  proc_status     TEXT NOT NULL DEFAULT 'pending',
                  -- pending / ordered / arrived / out_of_stock / supplier_shortage
  eta             DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uniq_product_date UNIQUE(product_id, end_date)
);

CREATE INDEX IF NOT EXISTS idx_bol_v2_end_date ON branch_order_list_v2(end_date);
CREATE INDEX IF NOT EXISTS idx_bol_v2_status   ON branch_order_list_v2(status);
CREATE INDEX IF NOT EXISTS idx_bol_v2_product  ON branch_order_list_v2(product_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. updated_at 自動更新（trigger）
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bo_v2_updated ON branch_orders_v2;
CREATE TRIGGER trg_bo_v2_updated
  BEFORE UPDATE ON branch_orders_v2
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_bol_v2_updated ON branch_order_list_v2;
CREATE TRIGGER trg_bol_v2_updated
  BEFORE UPDATE ON branch_order_list_v2
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- 4. RLS（Row Level Security）
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE branch_orders_v2     ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_order_list_v2 ENABLE ROW LEVEL SECURITY;

-- 4a. branch_orders_v2 policy
-- admin / assistant：全部權限
DROP POLICY IF EXISTS bo_v2_admin_all ON branch_orders_v2;
CREATE POLICY bo_v2_admin_all ON branch_orders_v2
  FOR ALL TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') IN ('admin','assistant','staff'))
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') IN ('admin','assistant','staff'));

-- accountant：只能查
DROP POLICY IF EXISTS bo_v2_accountant_read ON branch_orders_v2;
CREATE POLICY bo_v2_accountant_read ON branch_orders_v2
  FOR SELECT TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') = 'accountant');

-- store：只能看/寫自己店的資料
-- store_name 比對 user_metadata.store（如「文山店」→ 砍「店」字 → 「文山」）
DROP POLICY IF EXISTS bo_v2_store_own ON branch_orders_v2;
CREATE POLICY bo_v2_store_own ON branch_orders_v2
  FOR ALL TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'role') = 'store'
    AND store_name = REPLACE((auth.jwt()->'user_metadata'->>'store'), '店', '')
  )
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'role') = 'store'
    AND store_name = REPLACE((auth.jwt()->'user_metadata'->>'store'), '店', '')
  );

-- 4b. branch_order_list_v2 policy
-- 商品列表所有 authenticated 都能讀（店家要看開團商品）
DROP POLICY IF EXISTS bol_v2_read_all ON branch_order_list_v2;
CREATE POLICY bol_v2_read_all ON branch_order_list_v2
  FOR SELECT TO authenticated USING (TRUE);

-- 寫入只給 admin/assistant/staff
DROP POLICY IF EXISTS bol_v2_write_admin ON branch_order_list_v2;
CREATE POLICY bol_v2_write_admin ON branch_order_list_v2
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->'user_metadata'->>'role') IN ('admin','assistant','staff'));

DROP POLICY IF EXISTS bol_v2_update_admin ON branch_order_list_v2;
CREATE POLICY bol_v2_update_admin ON branch_order_list_v2
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') IN ('admin','assistant','staff'));

DROP POLICY IF EXISTS bol_v2_delete_admin ON branch_order_list_v2;
CREATE POLICY bol_v2_delete_admin ON branch_order_list_v2
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'user_metadata'->>'role') IN ('admin','assistant','staff'));

-- ─────────────────────────────────────────────────────────────────
-- 5. 驗證：跑完應該看到兩張表 + 8 個 index + 4 個 policy 群
-- ─────────────────────────────────────────────────────────────────
-- SELECT tablename FROM pg_tables WHERE tablename LIKE '%_v2';
-- SELECT indexname FROM pg_indexes WHERE tablename LIKE '%_v2';
-- SELECT policyname, tablename FROM pg_policies WHERE tablename LIKE '%_v2';
