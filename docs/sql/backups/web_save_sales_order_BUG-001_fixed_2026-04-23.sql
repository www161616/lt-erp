-- ============================================================================
-- BUG-001 / AUDIT-014 修復後的 web_save_sales_order
-- ----------------------------------------------------------------------------
-- 用途：這是「已修復版」的權威參考。若未來 RPC 被人誤改回舊（bug）版本，
--       把整份貼到 Supabase SQL Editor 執行即可回滾到修好的狀態。
--
-- 修復內容（跟 docs/sql/龍潭總倉ERP_全系統SQL備份_20260228.txt 的差異）：
--   1. UPDATE sales_orders 路徑 ── 移除 order_date = v_date
--      → 編輯舊單不再把 order_date 改成當天
--   2. UPDATE accounts_receivable 路徑 ── 移除 order_date = v_date
--      → 應收帳款的日期也會保持舊單原值
--   3. INSERT 新單路徑不變 ── 照常寫入 order_date（傳入的 v_date）
--
-- 附加保護（較 02-28 備份多的部分）：
--   - SECURITY DEFINER（繞 RLS 權限檢查，讓 RPC 能寫入受保護表）
--   - INSERT 加入 10 次重試 + unique_violation 例外處理（避免高併發撞單號）
--
-- 驗證方式：2026-04-23 用 pg_get_functiondef('web_save_sales_order'::regproc) 取回
--           Supabase 現行版本，確認 UPDATE 兩條路徑皆已無 order_date 欄位。
--
-- 歷史來源：02-28 備份檔版本仍有 bug（行 119 & 120），保留為歷史紀錄不覆蓋。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.web_save_sales_order(p_order_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE
      v_order_id TEXT;
      v_date DATE;
      v_customer_id TEXT;
      v_customer_name TEXT;
      v_subtotal DECIMAL;
      v_tax_amount DECIMAL;
      v_grand_total DECIMAL;
      v_shipping DECIMAL;
      v_deduction DECIMAL;
      v_tax_type TEXT;
      v_note TEXT;
      v_item RECORD;
      v_item_old RECORD;
      v_seq INT;
      v_idx INT := 1;
      v_detail_id TEXT;
      v_current_stock DECIMAL;
      v_retry INT := 0;
      v_inserted BOOLEAN := FALSE;
  BEGIN
      v_order_id := p_order_data->>'order_id';
      v_date := (p_order_data->>'order_date')::DATE;
      v_customer_id := p_order_data->>'customer_id';
      v_shipping := COALESCE((p_order_data->>'shipping_fee')::DECIMAL, 0);
      v_deduction := COALESCE((p_order_data->>'deduction')::DECIMAL, 0);
      v_subtotal := COALESCE((p_order_data->>'subtotal')::DECIMAL, 0);
      v_tax_amount := COALESCE((p_order_data->>'tax_amount')::DECIMAL, 0);
      v_grand_total := COALESCE((p_order_data->>'grand_total')::DECIMAL, 0);
      v_tax_type := p_order_data->>'tax_type';
      v_note := p_order_data->>'note';

      SELECT name INTO v_customer_name FROM customers WHERE id = v_customer_id;

      IF v_order_id IS NULL OR v_order_id = '' THEN
          WHILE v_retry < 10 AND NOT v_inserted LOOP
              SELECT COALESCE(MAX(RIGHT(id, 3)::INT), 0) + 1 + v_retry INTO v_seq
              FROM sales_orders
              WHERE id LIKE 'SO' || to_char(v_date, 'YYYYMMDD') || '%';

              v_order_id := 'SO' || to_char(v_date, 'YYYYMMDD') || LPAD(v_seq::TEXT, 3, '0');

              BEGIN
                  INSERT INTO sales_orders (
                      id, order_date, customer_id, customer_name, subtotal, tax_amount, grand_total, shipping, deduction, note,
                      payment_status, tax_type
                  ) VALUES (
                      v_order_id, v_date, v_customer_id, v_customer_name, v_subtotal, v_tax_amount, v_grand_total, v_shipping,
                      v_deduction, v_note, '未收款', v_tax_type
                  );
                  v_inserted := TRUE;
              EXCEPTION WHEN unique_violation THEN
                  v_retry := v_retry + 1;
              END;
          END LOOP;

          IF NOT v_inserted THEN
              RAISE EXCEPTION '無法產生唯一單號，請稍後重試';
          END IF;

          INSERT INTO accounts_receivable (
              id, order_id, order_date, customer_id, customer_name, total_amount, paid_amount, unpaid_amount, status, offset_amount
          ) VALUES (
              'AR' || v_order_id, v_order_id, v_date, v_customer_id, v_customer_name, v_grand_total, 0, v_grand_total, '未收款', 0
          );

      ELSE
          FOR v_item_old IN SELECT product_id, product_name, qty, unit FROM sales_details WHERE order_id = v_order_id
          LOOP
              UPDATE inventory SET qty = qty + v_item_old.qty WHERE product_id = v_item_old.product_id RETURNING qty INTO v_current_stock;

              INSERT INTO inventory_logs (log_date, product_id, product_name, log_type, qty_change, unit, doc_no, after_qty, created_at)
              VALUES (CURRENT_DATE, v_item_old.product_id, v_item_old.product_name, '銷貨修改回補', v_item_old.qty, v_item_old.unit,
                      v_order_id, v_current_stock, now());
          END LOOP;

          DELETE FROM sales_details WHERE order_id = v_order_id;

          UPDATE sales_orders SET
              customer_id = v_customer_id,
              customer_name = v_customer_name,
              subtotal = v_subtotal,
              tax_amount = v_tax_amount,
              grand_total = v_grand_total,
              shipping = v_shipping,
              deduction = v_deduction,
              tax_type = v_tax_type,
              note = v_note
          WHERE id = v_order_id;

          UPDATE accounts_receivable SET
              customer_id = v_customer_id,
              customer_name = v_customer_name,
              total_amount = v_grand_total,
              unpaid_amount = GREATEST(0, v_grand_total - COALESCE(paid_amount, 0)),
              status = CASE
                  WHEN COALESCE(paid_amount, 0) >= v_grand_total THEN '已收款'
                  WHEN COALESCE(paid_amount, 0) > 0 THEN '部分收款'
                  ELSE '未收款'
              END
          WHERE order_id = v_order_id;

          UPDATE sales_orders s SET payment_status = ar.status FROM accounts_receivable ar WHERE s.id = ar.order_id AND s.id = v_order_id;
      END IF;

      FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_data->'items')
          AS x(product_id TEXT, product_name TEXT, unit TEXT, qty DECIMAL, price DECIMAL, cost DECIMAL, note TEXT)
      LOOP
          v_detail_id := v_order_id || '-' || v_idx;

          INSERT INTO sales_details (
              id, order_id, product_id, product_name, unit, qty, unit_price, subtotal, unit_cost, profit, note
          ) VALUES (
              v_detail_id, v_order_id, v_item.product_id, v_item.product_name, v_item.unit,
              v_item.qty, v_item.price, (v_item.qty * v_item.price),
              COALESCE(v_item.cost, 0), (v_item.price - COALESCE(v_item.cost, 0)) * v_item.qty, v_item.note
          );

          SELECT qty INTO v_current_stock FROM inventory WHERE product_id = v_item.product_id;
          IF FOUND THEN
              UPDATE inventory SET qty = qty - v_item.qty WHERE product_id = v_item.product_id;
              v_current_stock := v_current_stock - v_item.qty;
          ELSE
              INSERT INTO inventory (product_id, product_name, qty, unit)
              VALUES (v_item.product_id, v_item.product_name, -v_item.qty, v_item.unit);
              v_current_stock := -v_item.qty;
          END IF;

          INSERT INTO inventory_logs (log_date, product_id, product_name, log_type, qty_change, unit, doc_no, after_qty, created_at)
          VALUES (CURRENT_DATE, v_item.product_id, v_item.product_name, '銷貨出庫', -v_item.qty, v_item.unit, v_order_id,
                  v_current_stock, now());

          v_idx := v_idx + 1;
      END LOOP;

      RETURN v_order_id;
  END;
$function$;
