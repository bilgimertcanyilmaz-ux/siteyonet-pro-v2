# SiteYönet Pro V3 — CLAUDE.md

## Proje Özeti

Türk apartman/site yönetimi için vanilla JS SPA. Framework yok, derleme adımı yok.

## Tech Stack

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 |
| Backend/DB | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (email/password) |
| CDN bağımlılıkları | `@supabase/supabase-js@2`, `xlsx@0.18.5`, `html2pdf.js@0.10.1` |
| Dev server | `npx live-server` veya `npx serve` |

## Dosya Yapısı

```
/
├── app.js          (~11.600 satır) — tüm uygulama mantığı
├── index.html      (~2.350 satır) — DOM + modal şablonları
├── style.css       (~2.860 satır) — tüm stiller
└── supabase/
    └── migrations/001_financial_core.sql
```

Proje **monolitik**: tüm JS tek dosyada. Yeni özellikler app.js içine eklenir.

## Global State

```js
const S = { /* uygulama state'i */ }
// Erişim: window.S veya doğrudan S
```

Ana state alanları:
- `apartmanlar`, `sakinler`, `tahsilatlar`, `finansIslemler`
- `kararlar`, `icralar`, `denetimler`, `arizalar`, `duyurular`
- `personel`, `toplantılar`, `faturalar`, `projeler`
- `ledgerEntries`, `auditLogs`, `accounts` (Sprint 1A finansal çekirdek)
- `ayarlar` — kullanıcı/site ayarları

## Supabase Tabloları

| Tablo | Amaç |
|-------|------|
| `syp_data` | Her kullanıcı için JSONB blob (ana veri) |
| `ledger_entries` | Çift taraflı muhasebe kayıtları |
| `audit_logs` | Tüm işlem denetim izi |
| `accounts` | Banka/kasa hesapları |

## Kod Kuralları

- **XSS koruması**: Kullanıcı girdisi her zaman `he(değer)` ile escape edilir
- **Çift submit koruması**: `guardDouble()` ile 800ms cooldown
- **Soft delete**: Status `cancelled` yapılır, kayıt silinmez
- **Render fonksiyonları**: Her veri değişikliğinde `renderX()` çağrılır (ör. `renderSakinler()`)
- **Dil**: Tüm UI, değişken adları ve yorumlar Türkçe
- **Bölüm ayraçları**: `// ════════` ve `// ───────` ile kod bölümleri ayrılır

## Önemli Fonksiyon Kalıpları

```js
// Veri kaydetme
await saveToSupabase()   // State'i Supabase'e yazar

// Denetim logu
AuditService.log(action, entity, oldVal, newVal)

// Muhasebe kaydı
LedgerService.createEntry({...})

// HTML güvenli render
element.innerHTML = he(userInput)
```

## Güvenlik

- Supabase RLS aktif (user_id bazlı)
- Supabase credentials app.js alt kısmında hardcoded (`_SB_URL`, `_SB_KEY`)
- Kimlik bilgilerini loglara veya hata mesajlarına ekleme
- Yeni sorgulara mutlaka RLS politikası ekle

## Ne Yapılmaz

- Yeni framework ekleme (React, Vue vb.) — vanilla JS kalacak
- app.js'i birden fazla dosyaya bölme (mevcut mimari korunur)
- localStorage'a hassas veri yazma
- `innerHTML` yerine `he()` kullanmadan direkt kullanıcı girdisi render etme
- Audit log'u bypass eden silme işlemi

## Geliştirme Başlatma

```bash
npx live-server .
# veya
npx serve .
```

## Mevcut Modüller (özet)

| Modül | Açıklama |
|-------|----------|
| Apartman/Site | CRUD, blok/daire yönetimi |
| Sakinler | Kiracı CRUD, finansal durum |
| Tahsilat | Ödeme makbuzu, banka belgesi |
| Borç Yönetimi | Tahakkuk, toplu borçlandırma |
| Gelir/Gider | Tanım bazlı finansal takip |
| Ledger (Sprint 1A) | Çift taraflı muhasebe |
| Arıza/Bakım | Talep takibi, bakım planı |
| Toplantılar | Gündem, tutanak |
| Kararlar | Yönetim kurulu kararları |
| Denetim | İnceleme raporları |
| Projeler | Bütçe vs. gerçekleşen |
| Personel | Maaş, rol |
| Duyurular | Toplu bildirim |
| Raporlar | Dashboard KPI, finansal raporlar |
| Süper Admin | Çok site yönetimi, abonelik |
