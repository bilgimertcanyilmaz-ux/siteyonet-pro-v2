-- ═══════════════════════════════════════════════════════════════════════════
-- SiteYönet Pro — Finansal Çekirdek Migration
-- Sprint 1A: Ledger, Audit, Accounts, Soft-Cancel altyapısı
-- Uygulama: Supabase SQL Editor'da çalıştır
-- Güvenli: Her CREATE TABLE IF NOT EXISTS — tekrar çalıştırılabilir
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Mevcut syp_data tablosuna soft-cancel indexi
--    (Mevcut JSONB blob'un üzerine ek sütun yoktur,
--     ileride gerçek tablolara geçiş yapıldığında bu migration genişler.)
-- ─────────────────────────────────────────────────────────────────────────
-- syp_data zaten var; updated_at sütununu ekle (yoksa)
ALTER TABLE IF EXISTS syp_data
  ADD COLUMN IF NOT EXISTS last_migration TEXT DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. LEDGER ENTRIES (muhasebe defteri)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id            TEXT PRIMARY KEY,              -- client-side UUID
  site_id       TEXT        NOT NULL,          -- apartman/site id
  person_id     TEXT        DEFAULT NULL,      -- sakin id
  unit_no       TEXT        DEFAULT NULL,      -- daire no
  entry_type    TEXT        NOT NULL           -- 'accrual'|'collection'|'reversal'|'income'|'expense'|'opening'
                CHECK (entry_type IN ('accrual','collection','reversal','income','expense','transfer','opening','adjustment')),
  ref_type      TEXT        DEFAULT NULL,      -- kaynak tablo adı
  ref_id        TEXT        DEFAULT NULL,      -- kaynak kayıt id
  debit         NUMERIC(14,2) NOT NULL DEFAULT 0  CHECK (debit  >= 0),
  credit        NUMERIC(14,2) NOT NULL DEFAULT 0  CHECK (credit >= 0),
  period        TEXT        DEFAULT NULL,      -- 'YYYY-MM'
  doc_no        TEXT        DEFAULT NULL,
  description   TEXT        DEFAULT NULL,
  date          DATE        NOT NULL DEFAULT CURRENT_DATE,
  source        TEXT        DEFAULT 'manuel',
  created_by    TEXT        DEFAULT 'local',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','cancelled'))
);

-- RLS
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "ledger_user_isolation" ON ledger_entries
  FOR ALL USING (
    site_id IN (
      SELECT (value->>'id')::TEXT
      FROM syp_data,
           jsonb_array_elements(data->'apartmanlar') AS value
      WHERE user_id = auth.uid()
    )
  );

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_ledger_site_date    ON ledger_entries (site_id, date);
CREATE INDEX IF NOT EXISTS idx_ledger_person_date  ON ledger_entries (person_id, date);
CREATE INDEX IF NOT EXISTS idx_ledger_ref          ON ledger_entries (ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entry_type   ON ledger_entries (entry_type, site_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. AUDIT LOGS (kim/ne zaman/ne yaptı)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT        DEFAULT NULL,
  user_email    TEXT        DEFAULT NULL,
  site_id       TEXT        DEFAULT NULL,
  action        TEXT        NOT NULL
                CHECK (action IN ('CREATE','UPDATE','DELETE','REVERSE','EXPORT','LOGIN','LOGOUT','IMPORT')),
  entity_type   TEXT        DEFAULT NULL,
  entity_id     TEXT        DEFAULT NULL,
  old_values    JSONB       DEFAULT NULL,
  new_values    JSONB       DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "audit_insert_only" ON audit_logs
  FOR INSERT WITH CHECK (true);  -- herkes yazabilir
CREATE POLICY IF NOT EXISTS "audit_owner_read" ON audit_logs
  FOR SELECT USING (user_id = auth.uid()::TEXT);

CREATE INDEX IF NOT EXISTS idx_audit_user_date      ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity         ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_site_date      ON audit_logs (site_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. ACCOUNTS (banka + kasa hesapları)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id              TEXT PRIMARY KEY,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id         TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  type            TEXT        NOT NULL
                  CHECK (type IN ('banka','kasa','kredi_karti')),
  bank_name       TEXT        DEFAULT NULL,
  iban            TEXT        DEFAULT NULL,
  currency        TEXT        NOT NULL DEFAULT 'TRY',
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_date    DATE        DEFAULT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  notes           TEXT        DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "accounts_owner" ON accounts
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_accounts_site   ON accounts (site_id, is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_user   ON accounts (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. YARDIMCI FONKSIYONLAR
-- ─────────────────────────────────────────────────────────────────────────

-- 5a. Kişi net bakiyesi (ledger_entries üzerinden)
CREATE OR REPLACE FUNCTION get_person_balance(
  p_person_id TEXT,
  p_site_id   TEXT
)
RETURNS NUMERIC AS $$
  SELECT COALESCE(
    SUM(debit) - SUM(credit),
    0
  )
  FROM ledger_entries
  WHERE person_id = p_person_id
    AND site_id   = p_site_id
    AND status    = 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5b. Kişi hesap ekstresi (kronolojik, running balance)
CREATE OR REPLACE FUNCTION get_person_statement(
  p_person_id TEXT,
  p_site_id   TEXT,
  p_start     DATE DEFAULT '2000-01-01',
  p_end       DATE DEFAULT '2099-12-31'
)
RETURNS TABLE (
  id          TEXT,
  entry_type  TEXT,
  ref_type    TEXT,
  ref_id      TEXT,
  debit       NUMERIC,
  credit      NUMERIC,
  balance     NUMERIC,
  description TEXT,
  date        DATE,
  period      TEXT,
  doc_no      TEXT
) AS $$
  SELECT
    id, entry_type, ref_type, ref_id,
    debit, credit,
    SUM(debit - credit) OVER (ORDER BY date, created_at) AS balance,
    description, date, period, doc_no
  FROM ledger_entries
  WHERE person_id = p_person_id
    AND site_id   = p_site_id
    AND status    = 'active'
    AND date BETWEEN p_start AND p_end
  ORDER BY date, created_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. MIGRATION TAMAMLANDI KAYDI
-- ─────────────────────────────────────────────────────────────────────────
-- syp_data'da migration flag'i güncelle
UPDATE syp_data
SET last_migration = '001_financial_core_' || NOW()::TEXT
WHERE user_id = auth.uid();

-- ─────────────────────────────────────────────────────────────────────────
-- NOTLAR:
--   • Bu migration mevcut syp_data tablosunu bozmaz
--   • ledger_entries ve audit_logs client'tan yazılır
--     (app.js'deki LedgerService ve AuditService kullanır)
--   • accounts tablosu ileride UI'dan doldurulur
--   • Sprint 2'de accruals, collections, expenses gerçek tablolara geçer
-- ─────────────────────────────────────────────────────────────────────────
