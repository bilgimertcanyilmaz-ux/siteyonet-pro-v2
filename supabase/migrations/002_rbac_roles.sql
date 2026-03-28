-- ═══════════════════════════════════════════════════════════════════════════
-- SiteYönet Pro — Rol Tabanlı Erişim Kontrolü (RBAC)
-- Migration 002: user_profiles, site_memberships, units, unit_assignments
--
-- Roller:
--   superadmin          → Yazılım sahibi. Tüm verilere sınırsız erişim.
--   yonetim_sirketi     → Birden fazla siteyi yöneten şirket hesabı.
--   apartman_yoneticisi → Tek bir siteyi yöneten bireysel yönetici.
--   personel            → Sitede görev yapan çalışan (güvenlik, temizlik vb.)
--   kat_sakini          → Dairede oturan sakin/kiracı.
--
-- Güvenli: IF NOT EXISTS — tekrar çalıştırılabilir
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ENUM TİPLERİ
-- ─────────────────────────────────────────────────────────────────────────

-- Global sistem rolü (her kullanıcı için bir tane)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'superadmin',
    'yonetim_sirketi',
    'apartman_yoneticisi',
    'personel',
    'kat_sakini'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Site üyeliğindeki rol (bir kullanıcı farklı sitelerde farklı rol taşıyabilir)
DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM (
    'yonetim_sirketi',
    'apartman_yoneticisi',
    'personel',
    'kat_sakini'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Personel izin anahtarları — granüler kontrol
-- (site_memberships.permissions JSONB'de bu key'ler kullanılır)
COMMENT ON TYPE membership_role IS
  'Personel için permissions JSONB anahtarları:
   tahsilat_goruntule, tahsilat_ekle, borc_goruntule, borc_ekle,
   ariza_goruntule, ariza_ekle, ariza_kapat,
   duyuru_goruntule, duyuru_ekle,
   rapor_goruntule, personel_goruntule,
   aidat_goruntule, aidat_duzenle';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. USER_PROFILES — Her Supabase kullanıcısının genişletilmiş profili
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            user_role NOT NULL DEFAULT 'kat_sakini',
  full_name       TEXT,
  phone           TEXT,
  avatar_url      TEXT,
  company_name    TEXT,           -- yonetim_sirketi için şirket adı
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_profiles_user_id_unique UNIQUE (user_id)
);

-- Superadmin satırı her zaman mevcut olmalı — uygulama başlangıcında kontrol eder
COMMENT ON TABLE user_profiles IS
  'Her auth.users kaydı için 1 profil. role alanı global sisteme girişi belirler.
   Site bazlı roller site_memberships tablosunda tutulur.';

-- RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Kendi profilini okuyabilir
CREATE POLICY IF NOT EXISTS "profile_read_own" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

-- Kendi profilini güncelleyebilir (role hariç — role sadece superadmin değiştirir)
CREATE POLICY IF NOT EXISTS "profile_update_own" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (role = (SELECT role FROM user_profiles WHERE user_id = auth.uid()));

-- Superadmin tüm profilleri okur (RLS bypass için SECURITY DEFINER fonksiyon kullanılır — bkz. Bölüm 6)
CREATE POLICY IF NOT EXISTS "profile_insert_own" ON user_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON user_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role    ON user_profiles (role, is_active);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. SITE_MEMBERSHIPS — Kullanıcı ↔ Site ↔ Rol ilişkisi
-- ─────────────────────────────────────────────────────────────────────────
-- Bir kullanıcı birden fazla siteye farklı rollerle üye olabilir.
-- Yönetim şirketi → N siteye 'yonetim_sirketi' rolüyle üye
-- Apartman yöneticisi → genellikle 1 siteye 'apartman_yoneticisi' rolüyle
-- Personel → izin listesi permissions JSONB ile granüler kontrol
-- Kat sakini → unit_assignments ile daireye bağlı

CREATE TABLE IF NOT EXISTS site_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id         TEXT NOT NULL,          -- syp_data içindeki apartman id (TEXT uuid)
  role            membership_role NOT NULL,
  permissions     JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Personel için örnek permissions:
  -- {"tahsilat_goruntule":true,"tahsilat_ekle":false,"ariza_goruntule":true,"ariza_ekle":true}

  is_active       BOOLEAN NOT NULL DEFAULT true,
  invited_by      UUID REFERENCES auth.users(id),   -- kim davet etti
  invite_accepted_at TIMESTAMPTZ,                   -- daveti ne zaman kabul etti
  notes           TEXT,                             -- yöneticinin notu
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT membership_unique UNIQUE (user_id, site_id)
);

COMMENT ON TABLE site_memberships IS
  'Kullanıcının hangi siteye hangi rolle erişebileceğini tanımlar.
   permissions JSONB yalnızca personel rolü için anlamlıdır.
   Diğer roller için default boş obje yeterlidir.';

COMMENT ON COLUMN site_memberships.permissions IS
  'Personel izinleri (boolean flagler):
   tahsilat_goruntule, tahsilat_ekle,
   borc_goruntule, borc_ekle,
   ariza_goruntule, ariza_ekle, ariza_kapat,
   duyuru_goruntule, duyuru_ekle,
   rapor_goruntule, personel_goruntule,
   aidat_goruntule, aidat_duzenle';

-- RLS
ALTER TABLE site_memberships ENABLE ROW LEVEL SECURITY;

-- Kullanıcı kendi üyeliklerini görebilir
CREATE POLICY IF NOT EXISTS "membership_read_own" ON site_memberships
  FOR SELECT USING (user_id = auth.uid());

-- Site yöneticisi kendi sitesinin üyeliklerini görebilir
CREATE POLICY IF NOT EXISTS "membership_read_as_manager" ON site_memberships
  FOR SELECT USING (
    site_id IN (
      SELECT site_id FROM site_memberships
      WHERE user_id = auth.uid()
        AND role IN ('yonetim_sirketi', 'apartman_yoneticisi')
        AND is_active = true
    )
  );

-- Site yöneticisi üye ekleyebilir/güncelleyebilir (superadmin hariç rol atayamaz)
CREATE POLICY IF NOT EXISTS "membership_manage_as_manager" ON site_memberships
  FOR INSERT WITH CHECK (
    site_id IN (
      SELECT site_id FROM site_memberships
      WHERE user_id = auth.uid()
        AND role IN ('yonetim_sirketi', 'apartman_yoneticisi')
        AND is_active = true
    )
  );

CREATE POLICY IF NOT EXISTS "membership_update_as_manager" ON site_memberships
  FOR UPDATE USING (
    site_id IN (
      SELECT site_id FROM site_memberships
      WHERE user_id = auth.uid()
        AND role IN ('yonetim_sirketi', 'apartman_yoneticisi')
        AND is_active = true
    )
  );

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_memberships_user_site   ON site_memberships (user_id, site_id, is_active);
CREATE INDEX IF NOT EXISTS idx_memberships_site_role   ON site_memberships (site_id, role, is_active);
CREATE INDEX IF NOT EXISTS idx_memberships_invited_by  ON site_memberships (invited_by);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. UNITS — Daireler (kat sakini bağlantısı için normalize tablo)
-- ─────────────────────────────────────────────────────────────────────────
-- syp_data içindeki daire listesinin ilişkisel yansıması.
-- Kat sakini rolü bu tabloya bağlanır.

CREATE TABLE IF NOT EXISTS units (
  id              TEXT PRIMARY KEY,       -- syp_data içindeki daire id ile aynı
  site_id         TEXT NOT NULL,
  unit_no         TEXT NOT NULL,          -- Daire numarası (101, A-12 vb.)
  block           TEXT,                   -- Blok adı
  floor           INTEGER,                -- Kat
  unit_type       TEXT,                   -- 'konut' | 'isyeri' | 'depo' | 'otopark'
  gross_m2        NUMERIC(8,2),
  net_m2          NUMERIC(8,2),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

-- Site üyeliği olan herkes daireyi görebilir
CREATE POLICY IF NOT EXISTS "units_read_member" ON units
  FOR SELECT USING (
    site_id IN (
      SELECT site_id FROM site_memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Yönetici daire ekleyip güncelleyebilir
CREATE POLICY IF NOT EXISTS "units_manage_manager" ON units
  FOR ALL USING (
    site_id IN (
      SELECT site_id FROM site_memberships
      WHERE user_id = auth.uid()
        AND role IN ('yonetim_sirketi', 'apartman_yoneticisi')
        AND is_active = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_units_site        ON units (site_id, is_active);
CREATE INDEX IF NOT EXISTS idx_units_site_no     ON units (site_id, unit_no);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. UNIT_ASSIGNMENTS — Kat sakini ↔ Daire ataması
-- ─────────────────────────────────────────────────────────────────────────
-- Bir dairede birden fazla sakin olabilir (giriş/çıkış tarihlerine göre).
-- Aktif sakin: move_out_date IS NULL AND is_active = true

CREATE TABLE IF NOT EXISTS unit_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id         TEXT NOT NULL,          -- denormalized: sorguyu hızlandırır
  move_in_date    DATE,
  move_out_date   DATE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  assigned_by     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE unit_assignments ENABLE ROW LEVEL SECURITY;

-- Kat sakini kendi atamasını görebilir
CREATE POLICY IF NOT EXISTS "assignment_read_own" ON unit_assignments
  FOR SELECT USING (user_id = auth.uid());

-- Yönetici tüm atamaları görebilir ve yönetebilir
CREATE POLICY IF NOT EXISTS "assignment_manage_manager" ON unit_assignments
  FOR ALL USING (
    site_id IN (
      SELECT site_id FROM site_memberships
      WHERE user_id = auth.uid()
        AND role IN ('yonetim_sirketi', 'apartman_yoneticisi')
        AND is_active = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_assignments_unit     ON unit_assignments (unit_id, is_active);
CREATE INDEX IF NOT EXISTS idx_assignments_user     ON unit_assignments (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_assignments_site     ON unit_assignments (site_id, is_active);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. SECURITY DEFINER FONKSİYONLARI — RLS bypass (sadece doğrulanmış roller)
-- ─────────────────────────────────────────────────────────────────────────

-- 6a. Kullanıcının global rolünü döndür (app.js'de oturum açılınca çağrılır)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
  SELECT role FROM user_profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 6b. Superadmin: tüm profilleri listele
CREATE OR REPLACE FUNCTION superadmin_list_profiles()
RETURNS TABLE (
  user_id     UUID,
  email       TEXT,
  role        user_role,
  full_name   TEXT,
  company_name TEXT,
  is_active   BOOLEAN,
  last_login_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ
) AS $$
DECLARE
  caller_role user_role;
BEGIN
  SELECT p.role INTO caller_role
  FROM user_profiles p WHERE p.user_id = auth.uid();

  IF caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Yetkisiz erişim';
  END IF;

  RETURN QUERY
    SELECT
      p.user_id,
      u.email,
      p.role,
      p.full_name,
      p.company_name,
      p.is_active,
      p.last_login_at,
      p.created_at
    FROM user_profiles p
    JOIN auth.users u ON u.id = p.user_id
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6c. Superadmin: kullanıcı rolünü değiştir
CREATE OR REPLACE FUNCTION superadmin_set_role(
  p_target_user_id UUID,
  p_new_role        user_role
)
RETURNS VOID AS $$
DECLARE
  caller_role user_role;
BEGIN
  SELECT p.role INTO caller_role
  FROM user_profiles p WHERE p.user_id = auth.uid();

  IF caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Yetkisiz erişim';
  END IF;

  UPDATE user_profiles
    SET role = p_new_role, updated_at = NOW()
    WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6d. Superadmin: kullanıcıyı pasif yap / aktif et
CREATE OR REPLACE FUNCTION superadmin_set_active(
  p_target_user_id UUID,
  p_active          BOOLEAN
)
RETURNS VOID AS $$
DECLARE
  caller_role user_role;
BEGIN
  SELECT p.role INTO caller_role
  FROM user_profiles p WHERE p.user_id = auth.uid();

  IF caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Yetkisiz erişim';
  END IF;

  UPDATE user_profiles
    SET is_active = p_active, updated_at = NOW()
    WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6e. Kullanıcının belirli bir sitedeki rolünü ve izinlerini döndür
CREATE OR REPLACE FUNCTION get_my_site_access(p_site_id TEXT)
RETURNS TABLE (
  role        membership_role,
  permissions JSONB,
  is_active   BOOLEAN
) AS $$
  SELECT role, permissions, is_active
  FROM site_memberships
  WHERE user_id = auth.uid() AND site_id = p_site_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. TRIGGER: user_profiles OTOMATİK OLUŞTURMA
-- ─────────────────────────────────────────────────────────────────────────
-- Yeni Supabase kullanıcısı kaydolunca otomatik profil oluştur.
-- Varsayılan rol: kat_sakini (yönetici elle değiştirir)

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, role, full_name)
  VALUES (
    NEW.id,
    'kat_sakini',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- 8. MEVCUT TABLOLARA ROL TABANLI RLS GÜNCELLEMESİ
-- ─────────────────────────────────────────────────────────────────────────

-- 8a. ledger_entries: site üyeliğine göre erişim
DROP POLICY IF EXISTS "ledger_user_isolation" ON ledger_entries;
CREATE POLICY "ledger_member_access" ON ledger_entries
  FOR SELECT USING (
    -- Superadmin her şeyi görür (SECURITY DEFINER fonksiyonla)
    (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'superadmin'
    OR
    -- Site üyesi kendi sitesini görür
    site_id IN (
      SELECT site_id FROM site_memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "ledger_manager_write" ON ledger_entries
  FOR INSERT WITH CHECK (
    (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'superadmin'
    OR
    site_id IN (
      SELECT site_id FROM site_memberships
      WHERE user_id = auth.uid()
        AND role IN ('yonetim_sirketi', 'apartman_yoneticisi')
        AND is_active = true
    )
    OR (
      -- Personel: tahsilat_ekle izni varsa
      site_id IN (
        SELECT site_id FROM site_memberships
        WHERE user_id = auth.uid()
          AND role = 'personel'
          AND is_active = true
          AND (permissions->>'tahsilat_ekle')::BOOLEAN = true
      )
      AND entry_type IN ('collection')
    )
  );

-- 8b. audit_logs: superadmin tüm logları görür, diğerleri kendi sitesini
DROP POLICY IF EXISTS "audit_owner_read" ON audit_logs;
CREATE POLICY "audit_read_access" ON audit_logs
  FOR SELECT USING (
    (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'superadmin'
    OR user_id = auth.uid()::TEXT
    OR site_id IN (
      SELECT site_id FROM site_memberships
      WHERE user_id = auth.uid()
        AND role IN ('yonetim_sirketi', 'apartman_yoneticisi')
        AND is_active = true
    )
  );

-- 8c. accounts: site yöneticisi ve üstü
DROP POLICY IF EXISTS "accounts_owner" ON accounts;
CREATE POLICY "accounts_role_access" ON accounts
  FOR ALL USING (
    (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'superadmin'
    OR site_id IN (
      SELECT site_id FROM site_memberships
      WHERE user_id = auth.uid()
        AND role IN ('yonetim_sirketi', 'apartman_yoneticisi')
        AND is_active = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 9. ROL BAZLI İZİN MATRİSİ DOKÜMANTASYONU
-- ─────────────────────────────────────────────────────────────────────────
/*
  ┌────────────────────────────────┬──────────────┬───────────────────┬──────────────────────┬──────────────────┬────────────┐
  │ Özellik / Menü                 │ superadmin   │ yonetim_sirketi   │ apartman_yoneticisi  │ personel         │ kat_sakini │
  ├────────────────────────────────┼──────────────┼───────────────────┼──────────────────────┼──────────────────┼────────────┤
  │ Tüm kullanıcı listesi          │ ✓            │ –                 │ –                    │ –                │ –          │
  │ Kullanıcı rol değiştirme       │ ✓            │ –                 │ –                    │ –                │ –          │
  │ Site oluşturma / silme         │ ✓            │ ✓                 │ –                    │ –                │ –          │
  │ Site ayarları                  │ ✓            │ ✓                 │ ✓                    │ –                │ –          │
  │ Üye davet etme                 │ ✓            │ ✓                 │ ✓                    │ –                │ –          │
  │ Daire yönetimi                 │ ✓            │ ✓                 │ ✓                    │ görüntüle        │ kendi      │
  │ Sakin yönetimi                 │ ✓            │ ✓                 │ ✓                    │ görüntüle        │ kendi      │
  │ Borç tahakkuk / iptal          │ ✓            │ ✓                 │ ✓                    │ izinle           │ –          │
  │ Tahsilat ekleme                │ ✓            │ ✓                 │ ✓                    │ izinle           │ –          │
  │ Tahsilat görüntüleme           │ ✓            │ ✓                 │ ✓                    │ izinle           │ kendi      │
  │ Gelir/Gider tanımları          │ ✓            │ ✓                 │ ✓                    │ –                │ –          │
  │ Finansal işlemler              │ ✓            │ ✓                 │ ✓                    │ –                │ –          │
  │ Arıza bildirimi                │ ✓            │ ✓                 │ ✓                    │ ✓                │ ✓          │
  │ Arıza yönetimi / kapatma       │ ✓            │ ✓                 │ ✓                    │ izinle           │ –          │
  │ Duyuru görüntüleme             │ ✓            │ ✓                 │ ✓                    │ ✓                │ ✓          │
  │ Duyuru oluşturma               │ ✓            │ ✓                 │ ✓                    │ izinle           │ –          │
  │ Toplantı yönetimi              │ ✓            │ ✓                 │ ✓                    │ –                │ –          │
  │ Karar yönetimi                 │ ✓            │ ✓                 │ ✓                    │ –                │ –          │
  │ Personel yönetimi              │ ✓            │ ✓                 │ ✓                    │ –                │ –          │
  │ Proje / renovasyon             │ ✓            │ ✓                 │ ✓                    │ görüntüle        │ –          │
  │ Raporlar (tam)                 │ ✓            │ ✓                 │ ✓                    │ izinle           │ –          │
  │ Raporlar (kişisel)             │ ✓            │ ✓                 │ ✓                    │ ✓                │ kendi      │
  │ Faturalar                      │ ✓            │ ✓                 │ ✓                    │ görüntüle        │ kendi      │
  │ Süper Admin paneli             │ ✓            │ –                 │ –                    │ –                │ –          │
  │ Abonelik / ödeme               │ ✓            │ ✓                 │ –                    │ –                │ –          │
  └────────────────────────────────┴──────────────┴───────────────────┴──────────────────────┴──────────────────┴────────────┘

  "izinle" = site_memberships.permissions JSONB'deki ilgili flag true ise
  "kendi"  = yalnızca kendi dairesi/kaydıyla ilgili veriler
*/

-- ─────────────────────────────────────────────────────────────────────────
-- 10. MİGRATION TAMAMLANDI
-- ─────────────────────────────────────────────────────────────────────────
UPDATE syp_data
SET last_migration = '002_rbac_roles_' || NOW()::TEXT
WHERE user_id = auth.uid();

-- ─────────────────────────────────────────────────────────────────────────
-- NOTLAR:
--   • Mevcut syp_data ve Sprint 1A tabloları korunur — bu migration ekler
--   • Yeni kayıt olan her kullanıcı otomatik 'kat_sakini' rolüyle başlar
--   • Superadmin rolü superadmin_set_role() ile atanır (manuel, ilk kurulumda)
--   • app.js'de oturum açılınca get_my_role() çağrısıyla rol alınır
--   • Menü görünürlüğü bir sonraki sprint'te (003_menu_permissions) yapılacak
-- ─────────────────────────────────────────────────────────────────────────
