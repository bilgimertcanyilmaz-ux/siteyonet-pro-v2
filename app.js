// ═══════════════════════════════════════════
// SUPABASE ENTEGRASYONU
// ═══════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// GLOBAL HATA YÖNETİMİ & ERROR BOUNDARY
// ══════════════════════════════════════════════════════════
window.addEventListener('error', function(e) {
  if (e.error && e.error.message && e.error.message.includes('ResizeObserver')) return;
  console.error('[SYP Hata]', e.filename, e.lineno, e.error ? e.error.message : e.message);
  if (typeof toast === 'function') {
    toast('Beklenmeyen bir hata oluştu. Sayfayı yenileyebilirsiniz.', 'err');
  }
});

window.addEventListener('unhandledrejection', function(e) {
  const msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason || '');
  console.error('[SYP Promise Hata]', msg);
  if (msg.toLowerCase().includes('supabase') || msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
    if (typeof toast === 'function') toast('Sunucu bağlantısı kesildi. Veriler lokal kaydedildi.', 'warn');
  }
  e.preventDefault();
});

// ══════════════════════════════════════════════════════════
// GÜVENLİK KATMANI
// ══════════════════════════════════════════════════════════

/**
 * HTML Escape — XSS koruması.
 * Kullanıcıdan gelen TÜM string'ler innerHTML'e yazılmadan bu fonksiyondan geçmeli.
 */
function he(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Çift Submit Koruması — aynı işlem 800ms içinde iki kez tetiklenemez.
 * Kullanım: saveOdeme gibi fonksiyonların başına _guardCheck() ekle.
 */
let _submitting = false;
function _guardCheck() {
  if (_submitting) { toast('İşlem devam ediyor, lütfen bekleyin...', 'warn'); return false; }
  _submitting = true;
  setTimeout(() => { _submitting = false; }, 800);
  return true;
}

/**
 * Güvenli Makbuz Numarası Üreticisi
 * S.makbuzSayac'ı state'e kaydeder — sayfa yenilenince sıfırlanmaz.
 */
function genMakbuzNo(prefix) {
  prefix = prefix || 'M';
  if (!S.makbuzSayac || S.makbuzSayac < 5000) S.makbuzSayac = (makbuzNo || 5000);
  S.makbuzSayac++;
  makbuzNo = S.makbuzSayac;
  return prefix + '-' + String(S.makbuzSayac).padStart(6, '0');
}

/**
 * Merkezi Validasyon — tüm form kaydetme fonksiyonlarında kullanılır.
 */
const Validate = {
  required(v, label) {
    if (v === null || v === undefined || String(v).trim() === '')
      throw new Error((label || 'Alan') + ' zorunludur');
    return v;
  },
  positiveNumber(v, label) {
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) throw new Error((label || 'Tutar') + ' sıfırdan büyük olmalıdır');
    if (n > 99999999) throw new Error((label || 'Tutar') + ' çok büyük bir değer');
    return n;
  },
  nonNegativeNumber(v, label) {
    const n = parseFloat(v);
    if (isNaN(n) || n < 0) throw new Error((label || 'Değer') + ' geçerli bir sayı olmalıdır');
    return n;
  },
  date(v, label) {
    if (!v) return v;
    if (isNaN(new Date(v).getTime())) throw new Error((label || 'Tarih') + ' geçerli bir tarih olmalıdır');
    return v;
  },
  maxLength(v, max, label) {
    if (v && String(v).length > max)
      throw new Error((label || 'Alan') + ' en fazla ' + max + ' karakter olabilir');
    return v;
  },
  phone(v) {
    if (v && !/^[\d\s\-\+\(\)]{7,15}$/.test(v.trim()))
      throw new Error('Telefon formatı geçersiz');
    return v;
  }
};

function runValidation(fn) {
  try { fn(); return true; }
  catch(e) { toast(e.message, 'err'); _submitting = false; return false; }
}

let _supabase = null;
let _currentUser = null;

function getSupabaseConfig() {
  try {
    // sessionStorage önce (güvenli), yoksa localStorage'dan taşı (geriye dönük)
    let cfg = sessionStorage.getItem('syp_sb_config');
    if (!cfg) {
      const legacy = localStorage.getItem('syp_sb_config');
      if (legacy) {
        sessionStorage.setItem('syp_sb_config', legacy);
        localStorage.removeItem('syp_sb_config');
        cfg = legacy;
      }
    }
    return cfg ? JSON.parse(cfg) : null;
  } catch(e) { return null; }
}

function initSupabase(url, key) {
  try {
    _supabase = supabase.createClient(url, key);
    return true;
  } catch(e) {
    console.error('Supabase init error:', e);
    return false;
  }
}

function updateConnBadge(status, text) {
  const dot = document.getElementById('sb-conn-dot');
  const txt = document.getElementById('sb-conn-text');
  if (!dot || !txt) return;
  dot.className = status === 'ok' ? 'ok' : (status === 'err' ? 'err' : '');
  txt.textContent = text;
}

async function saveToSupabase() {
  if (!_supabase || !_currentUser) return;
  const MAX_RETRY = 3;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const { error } = await _supabase.from('syp_data').upsert({
        id: _currentUser.id,
        user_id: _currentUser.id,
        data: S,
        updated_at: new Date().toISOString()
      });
      if (!error) return; // Başarılı
      if (error.code === 'PGRST301' || error.status === 401) {
        if (typeof toast === 'function') toast('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.', 'err');
        if (typeof authCikis === 'function') setTimeout(authCikis, 2000);
        return;
      }
      console.warn('[SYP] Supabase save attempt ' + attempt + ' failed:', error.message);
    } catch(e) {
      console.warn('[SYP] Supabase save network error attempt ' + attempt + ':', e.message);
    }
    if (attempt < MAX_RETRY) await new Promise(function(r) { setTimeout(r, 1000 * attempt); });
  }
  console.error('[SYP] Supabase save başarısız (3 deneme). localStorage backup aktif.');
}

async function loadFromSupabase() {
  if (!_supabase || !_currentUser) return false;
  try {
    const { data, error } = await _supabase.from('syp_data')
      .select('data').eq('id', _currentUser.id).single();
    if (error) {
      if (error.code === 'PGRST116') return false; // no row yet
      console.error('Supabase load error:', error);
      return false;
    }
    if (data && data.data) {
      S = { ...DEF_STATE, ...data.data };
      if (!S.icralar) S.icralar = [];
      if (!S.finansIslemler) S.finansIslemler = [];
      if (!S.ayarlar) S.ayarlar = {};
      return true;
    }
    return false;
  } catch(e) { console.error('Supabase load exception:', e); return false; }
}

// AUTH FUNCTIONS
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i) => {
    t.classList.toggle('active', (i===0 && tab==='giris') || (i===1 && tab==='kayit'));
  });
  document.getElementById('auth-form-giris').classList.toggle('active', tab==='giris');
  document.getElementById('auth-form-kayit').classList.toggle('active', tab==='kayit');
  clearAuthMessages();
}

function showAuthErr(msg) {
  const el = document.getElementById('auth-err');
  el.textContent = msg; el.classList.add('show');
  document.getElementById('auth-ok').classList.remove('show');
}
function showAuthOk(msg) {
  const el = document.getElementById('auth-ok');
  el.textContent = msg; el.classList.add('show');
  document.getElementById('auth-err').classList.remove('show');
}
function clearAuthMessages() {
  document.getElementById('auth-err').classList.remove('show');
  document.getElementById('auth-ok').classList.remove('show');
}

async function authGiris() {
  if (!_supabase) { showAuthErr('Supabase bağlantısı yok. Önce kurulum yapın.'); return; }
  const email = document.getElementById('giris-email').value.trim();
  const sifre = document.getElementById('giris-sifre').value;
  if (!email || !sifre) { showAuthErr('E-posta ve şifre gerekli.'); return; }
  const btn = document.getElementById('giris-btn');
  btn.disabled = true; btn.textContent = 'Giriş yapılıyor…';
  try {
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password: sifre });
    if (error) { showAuthErr(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı.' : error.message); return; }
    await onAuthSuccess(data.user);
  } catch(e) { showAuthErr('Bağlantı hatası. İnternet bağlantınızı kontrol edin.'); }
  finally { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;stroke-width:2;fill:none"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Giriş Yap'; }
}

async function authKayit() {
  if (!_supabase) { showAuthErr('Supabase bağlantısı yok.'); return; }
  const ad = document.getElementById('kayit-ad').value.trim();
  const email = document.getElementById('kayit-email').value.trim();
  const sifre = document.getElementById('kayit-sifre').value;
  const sifre2 = document.getElementById('kayit-sifre2').value;
  if (!ad || !email || !sifre) { showAuthErr('Tüm alanları doldurun.'); return; }
  if (sifre.length < 6) { showAuthErr('Şifre en az 6 karakter olmalı.'); return; }
  if (sifre !== sifre2) { showAuthErr('Şifreler eşleşmiyor.'); return; }
  const btn = document.getElementById('kayit-btn');
  btn.disabled = true; btn.textContent = 'Hesap oluşturuluyor…';
  try {
    const { data, error } = await _supabase.auth.signUp({
      email, password: sifre,
      options: { data: { full_name: ad } }
    });
    if (error) { showAuthErr(error.message); return; }
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      showAuthErr('Bu e-posta ile zaten hesap var. Giriş yapın.'); return;
    }
    showAuthOk('Hesap oluşturuldu! Giriş yapılıyor…');
    setTimeout(() => authGiris(), 1000);
  } catch(e) { showAuthErr('Bağlantı hatası.'); }
  finally { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;stroke-width:2;fill:none"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg> Hesap Oluştur'; }
}

async function authCikis() {
  if (!_supabase) return;
  await _supabase.auth.signOut();
  _currentUser = null;
  S = { ...DEF_STATE };
  updateConnBadge('err', 'Oturum kapalı');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('main').style.display = 'none';
  toast('Çıkış yapıldı.', 'warn');
}

async function onAuthSuccess(user) {
  _currentUser = user;
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main').style.display = '';
  updateConnBadge('ok', user.email.split('@')[0]);
  const loaded = await loadFromSupabase();
  if (!loaded) { S = { ...DEF_STATE, icralar:[], finansIslemler:[], ayarlar:{} }; }
  initApp();
}

// SUPABASE CONFIG FUNCTIONS
function saveSupabaseConfig() {
  const url = document.getElementById('setup-url').value.trim();
  const key = document.getElementById('setup-key').value.trim();
  const err = document.getElementById('setup-err');
  if (!url || !key) { err.textContent='URL ve Key gerekli.'; err.style.display='block'; return; }
  if (!url.includes('supabase.co')) { err.textContent='Geçerli bir Supabase URL girin.'; err.style.display='block'; return; }
  sessionStorage.setItem('syp_sb_config', JSON.stringify({ url, key }));
  err.style.display = 'none';
  if (!initSupabase(url, key)) { err.textContent='Bağlantı kurulamadı.'; err.style.display='block'; return; }
  document.getElementById('supabase-setup-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  checkExistingSession();
}

async function updateSupabaseConfig() {
  const url = document.getElementById('set-sb-url').value.trim();
  const key = document.getElementById('set-sb-key').value.trim();
  if (!url || !key) { toast('URL ve Key gerekli.', 'err'); return; }
  sessionStorage.setItem('syp_sb_config', JSON.stringify({ url, key }));
  if (!initSupabase(url, key)) { toast('Bağlantı kurulamadı.', 'err'); return; }
  toast('Supabase bağlantısı güncellendi. Lütfen tekrar giriş yapın.', 'ok');
  setTimeout(() => authCikis(), 1500);
}

function showSetupScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('supabase-setup-screen').classList.remove('hidden');
  const cfg = getSupabaseConfig();
  if (cfg) {
    document.getElementById('setup-url').value = cfg.url || '';
    document.getElementById('setup-key').value = cfg.key || '';
  }
}

async function checkExistingSession() {
  if (!_supabase) return;
  try {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session && session.user) {
      await onAuthSuccess(session.user);
    } else {
      document.getElementById('auth-screen').classList.remove('hidden');
      document.getElementById('main').style.display = 'none';
    }
  } catch(e) {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('main').style.display = 'none';
  }
}

// APP INIT
function initApp() {
  // Eğer hiç site seçili değilse ilk aktif siteyi seç
  if (!selectedAptId) {
    const ilkApt = S.apartmanlar.find(a => a.durum === 'aktif');
    if (ilkApt) selectedAptId = ilkApt.id;
  }
  syncDropdowns();
  renderDashboard();
  if (S.ayarlar) {
    const initEl = document.getElementById('sb-av-init');
    const nameEl = document.getElementById('sb-user-name');
    const roleEl = document.getElementById('sb-user-role');
    if (S.ayarlar.yonetici) {
      if (initEl) initEl.textContent = S.ayarlar.yonetici.substring(0,2).toUpperCase();
      if (nameEl) nameEl.textContent = S.ayarlar.yonetici;
      if (roleEl) roleEl.textContent = S.ayarlar.unvan || 'Sistem Admini';
    }
  }
  updateNotifDot();
  checkTekrarlayanIslemler();
  updateGlobalSiteBar();
  // Sprint 1A: Mevcut veriyi ledger'a tek seferlik aktar
  migrateLegacyDataToLedger();
  // Davet linki kontrolü: #davet-kayit/TOKEN
  const _hash = window.location.hash || '';
  const _davetMatch = _hash.match(/^#davet-kayit\/(.+)$/);
  if (_davetMatch) {
    const _token = _davetMatch[1];
    window._navRestoring = true; goPage('davet-kayit'); window._navRestoring = false;
    setTimeout(() => renderDavetKayitSayfasi(_token), 50);
    return;
  }
  window._navRestoring = true; goPage('dashboard'); window._navRestoring = false;
  if (typeof updateDavetBekleyenBadge === 'function') updateDavetBekleyenBadge();
}

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
const DEF_STATE = { apartmanlar:[], denetimler:[], teklifler:[], gorevler:[], asansorler:[], isletmeProjeler:[], kararlar:[], icralar:[], sakinler:[], personel:[], duyurular:[], arizalar:[], tahsilatlar:[], sigortalar:[], toplantılar:[], faturalar:[], finansIslemler:[], ayarlar:{}, gelirTanimlari:[], giderTanimlari:[], projeler:[], iletisimLoglari:[], duyuruOkundu:{}, otomasyonKurallari:[], gorevBildirimleri:[], bankDosyalar:[], aidatBorclandir:[],
  // ── FİNANSAL ÇEKİRDEK (Sprint 1A) ───────────────────
  ledgerEntries:[],    // çift taraflı muhasebe defteri
  auditLogs:[],        // kim/ne zaman/ne yaptı
  accounts:[],         // banka + kasa hesapları
  bekleyenKayitlar:[], // davet ile kayıt başvuruları (onay bekleyen)
  tekrarKontrol:{},    // tekrarlayan işlem idempotency haritası
  _ledgerMigrated: false  // migration bayrağı
};
let S = { ...DEF_STATE };

// ══════════════════════════════════════════════════
// APT CONTEXT SİSTEMİ — Seçili Apartman Yönetimi
// Bazı sayfalar (sakinler, tahsilat, raporlar, ariza, duyurular)
// sadece seçili apartmana ait veri gösterir.
// ══════════════════════════════════════════════════
let selectedAptId = null; // Seçili apartman ID (null = seçilmedi)

// Apt-specific sayfalar
const APT_SPECIFIC_PAGES = ['sakinler','tahsilat','raporlar','ariza','duyurular'];

/**
 * Apt-specific sayfa için kontrol eder.
 * Eğer apartman seçilmemişse seçici UI gösterir, true/false döner.
 */
function aptCtxCheck(page, bannerId, contentId, label) {
  const bannerEl = document.getElementById(bannerId);
  const contentEl = document.getElementById(contentId);

  if (!selectedAptId || !S.apartmanlar.find(a=>a.id==selectedAptId)) {
    // Apartman seçilmemiş → seçici göster, içeriği gizle
    if (contentEl) contentEl.style.display = 'none';
    if (bannerEl) bannerEl.innerHTML = renderAptSelector(page, label);
    return false;
  }
  // Seçilmiş → içeriği göster
  if (contentEl) contentEl.style.display = '';
  return true;
}

/**
 * Apartman seçici overlay HTML oluşturur
 */
function renderAptSelector(page, label) {
  const opts = S.apartmanlar.filter(a=>a.durum==='aktif').map(a=>`<option value="${a.id}">${a.ad}</option>`).join('');
  if (!opts) return `<div class="apt-ctx-overlay"><div class="apt-ctx-card">
    <div class="apt-ctx-icon"><svg viewBox="0 0 24 24" style="width:26px;height:26px;stroke:currentColor;stroke-width:1.5;fill:none"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/></svg></div>
    <div class="apt-ctx-title">Apartman bulunamadı</div>
    <div class="apt-ctx-sub">Önce apartman ekleyin.</div>
    <button class="btn bp" onclick="goPage('apartmanlar')">Apartman Ekle</button>
  </div></div>`;
  return `<div class="apt-ctx-overlay"><div class="apt-ctx-card">
    <div class="apt-ctx-icon"><svg viewBox="0 0 24 24" style="width:26px;height:26px;stroke:currentColor;stroke-width:1.5;fill:none"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 11h1m5 0h-1M9 15h1m5 0h-1"/></svg></div>
    <div class="apt-ctx-title">Apartman Seçin</div>
    <div class="apt-ctx-sub">${label||'Bu sayfa'} için hangi apartmanın verilerini görmek istiyorsunuz?</div>
    <select class="apt-ctx-select" id="ctx-apt-select-${page}">
      <option value="">— Apartman seçin —</option>
      ${opts}
    </select>
    <br>
    <button class="btn bp" onclick="setSelectedApt(document.getElementById('ctx-apt-select-${page}').value,'${page}')">
      <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/></svg>
      Apartmanı Seç ve Devam Et
    </button>
  </div></div>`;
}

/**
 * Apartman seçimini yap ve sayfayı yenile
 */
function setSelectedApt(aptId, page) {
  if (!aptId) { toast('Lütfen bir apartman seçin.','err'); return; }
  selectedAptId = +aptId;
  updateGlobalSiteBar();
  if (page) goPage(page);
}

/**
 * Apartman bağlam banner'ını render et (sayfa üstü)
 */
function renderAptBanner(bannerId, apt) {
  const el = document.getElementById(bannerId); if(!el) return;
  const sakinSayisi = S.sakinler.filter(x=>x.aptId==apt.id).length;
  const borclu = S.sakinler.filter(x=>x.aptId==apt.id&&(x.borc||0)>0).length;
  const acikAriza = S.arizalar.filter(x=>x.aptId==apt.id&&x.durum==='acik').length;
  const aktifApts = S.apartmanlar.filter(a=>a.durum==='aktif');
  const switchItems = aktifApts.map(a => `
    <div class="apt-switch-item ${a.id==apt.id?'active':''}" onclick="switchApt(${a.id},'${bannerId}')">
      <span class="asi-dot" style="background:${a.durum==='aktif'?'var(--ok)':'var(--tx-3)'}"></span>
      <div>
        <div>${a.ad}</div>
        <div class="asi-meta">${S.sakinler.filter(x=>x.aptId==a.id).length} sakin · ${a.adres||a.il||'—'}</div>
      </div>
      ${a.id==apt.id?'<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:var(--brand);stroke-width:2.5;fill:none;margin-left:auto"><polyline points="20 6 9 17 4 12"/></svg>':''}
    </div>`).join('');
  el.innerHTML = `<div class="apt-banner mb16 apt-switch-wrap" id="banner-wrap-${bannerId}">
    <div class="apt-banner-ico"><svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 11h1m5 0h-1M9 15h1m5 0h-1"/></svg></div>
    <div style="flex:1;min-width:0">
      <div class="apt-banner-name">${apt.ad}</div>
      <div class="apt-banner-sub">${apt.adres||''}${apt.il?' · '+apt.il:''} · ${sakinSayisi} sakin · ${borclu>0?'<span style="color:var(--err)">'+borclu+' borçlu</span>':'Borç yok'} · ${acikAriza>0?'<span style="color:var(--warn)">'+acikAriza+' açık arıza</span>':'Arıza yok'}</div>
    </div>
    <button class="apt-banner-change" onclick="toggleAptSwitcher('${bannerId}')">Değiştir ↕</button>
    <div class="apt-switch-dropdown" id="apt-switcher-${bannerId}" style="display:none">${switchItems}</div>
  </div>`;
  // Dışarı tıklanınca kapat
  setTimeout(()=>{ document.addEventListener('click', function closeSwitcher(e){
    const wrap = document.getElementById('banner-wrap-${bannerId}');
    if(wrap && !wrap.contains(e.target)){ document.getElementById('apt-switcher-${bannerId}').style.display='none'; document.removeEventListener('click',closeSwitcher); }
  }); }, 100);
}

function toggleAptSwitcher(bannerId) {
  const dd = document.getElementById('apt-switcher-'+bannerId);
  if(dd) dd.style.display = dd.style.display==='none'?'block':'none';
}

function switchApt(aptId, bannerId) {
  const dd = document.getElementById('apt-switcher-'+bannerId);
  if(dd) dd.style.display='none';
  selectedAptId = aptId;
  updateGlobalSiteBar();
  const curPage = document.querySelector('.ni.on')?.dataset?.p;
  if(curPage) goPage(curPage);
}

/**
 * Global Site Bar — tüm sayfalarda üstte görünen büyük site seçici
 */
function updateGlobalSiteBar() {
  const bar = document.getElementById('global-site-bar');
  if (!bar) return;
  const apts = S.apartmanlar.filter(a => a.durum === 'aktif');
  if (!apts.length) { bar.classList.add('gsb-empty'); bar.innerHTML = ''; return; }
  bar.classList.remove('gsb-empty');

  // Eğer hiç site seçili değilse ilkini seç
  if (!selectedAptId) {
    selectedAptId = apts[0].id;
  }
  const apt = S.apartmanlar.find(a => a.id == selectedAptId) || apts[0];

  // İstatistikler
  const sakinSayisi = S.sakinler.filter(x => x.aptId == apt.id).length;
  const borcluSayisi = S.sakinler.filter(x => x.aptId == apt.id && (x.borc || 0) > 0).length;
  const acikAriza = S.arizalar.filter(x => x.aptId == apt.id && x.durum === 'acik').length;
  const daireSayisi = apt.daireSayisi || S.sakinler.filter(x => x.aptId == apt.id).length;

  // Dropdown items
  const items = apts.map(a => {
    const sc = S.sakinler.filter(x => x.aptId == a.id).length;
    return `<div class="gsb-apt-item ${a.id == apt.id ? 'active' : ''}" onclick="switchGlobalSite(${a.id})">
      <span class="gsb-dot" style="background:var(--ok)"></span>
      <div style="flex:1;min-width:0">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.ad}</div>
        <div class="gsb-apt-meta">${a.adres || a.il || ''}${a.il && a.adres ? ' · ' + a.il : ''} · ${sc} sakin</div>
      </div>
      ${a.id == apt.id ? '<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--brand);stroke-width:2.5;fill:none;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>`;
  }).join('');

  bar.innerHTML = `
    <span class="gsb-label">Aktif Site</span>
    <div class="gsb-selector" id="gsb-selector">
      <button class="gsb-btn" onclick="toggleGsbDropdown(event)" id="gsb-btn">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/></svg>
        <span class="gsb-btn-name">${apt.ad}</span>
        <svg class="gsb-btn-arrow" id="gsb-arrow" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="gsb-dropdown" id="gsb-dropdown">${items}</div>
    </div>
    <div class="gsb-stat" style="margin-left:4px">
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="var(--tx-3)" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      <span><strong>${daireSayisi}</strong> Daire</span>
    </div>
  `;

  // Dropdown dışına tıklanınca kapat
  setTimeout(() => {
    document.addEventListener('click', function gsbClose(e) {
      const sel = document.getElementById('gsb-selector');
      if (sel && !sel.contains(e.target)) {
        const dd = document.getElementById('gsb-dropdown');
        const arr = document.getElementById('gsb-arrow');
        if (dd) dd.classList.remove('open');
        if (arr) arr.classList.remove('open');
        document.removeEventListener('click', gsbClose);
      }
    });
  }, 100);
}

function toggleGsbDropdown(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('gsb-dropdown');
  const arr = document.getElementById('gsb-arrow');
  if (!dd) return;
  const isOpen = dd.classList.contains('open');
  dd.classList.toggle('open', !isOpen);
  if (arr) arr.classList.toggle('open', !isOpen);
}

function switchGlobalSite(aptId) {
  const dd = document.getElementById('gsb-dropdown');
  const arr = document.getElementById('gsb-arrow');
  if (dd) dd.classList.remove('open');
  if (arr) arr.classList.remove('open');
  selectedAptId = aptId ? +aptId : (S.apartmanlar.filter(a=>a.durum==='aktif')[0]?.id || null);
  updateGlobalSiteBar();
  syncAptFilters();
  const curPage = document.querySelector('.ni.on')?.dataset?.p;
  if (curPage) goPage(curPage);
}

function syncAptFilters() {
  ['fin-f-apt','sig-f-apt','top-f-apt','fat-f-apt','tah-f-apt'].forEach(id => {
    const el = document.getElementById(id);
    if (el && selectedAptId) el.value = selectedAptId;
  });
}

/**
 * Apartman değiştirme — seçili aptId sıfırla + mevcut sayfayı yenile
 */
function changeAptContext() {
  selectedAptId = null;
  updateGlobalSiteBar();
  const curPage = document.querySelector('.ni.on')?.dataset?.p;
  if (curPage) goPage(curPage);
}

/**
 * Apartman detay sayfasından doğrudan bu sayfaya git
 */
function goAptSpecific(aptId, page) {
  selectedAptId = +aptId;
  updateGlobalSiteBar();
  goPage(page);
}


let editId = null;
let drRows = [];
let ilerlemeId = null;
let tNo = 1000;

function loadState() {
  try { const d = localStorage.getItem('syp5'); if (d) S = { ...DEF_STATE, ...JSON.parse(d) }; } catch(e) {}
  if (!S.icralar)         S.icralar = [];
  if (!S.finansIslemler)  S.finansIslemler = [];
  if (!S.ayarlar)         S.ayarlar = {};
  if (!S.sakinler)        S.sakinler = [];
  if (!S.personel)        S.personel = [];
  if (!S.duyurular)       S.duyurular = [];
  if (!S.arizalar)        S.arizalar = [];
  if (!S.tahsilatlar)     S.tahsilatlar = [];
  if (!S.sigortalar)      S.sigortalar = [];
  if (!S.toplantılar)     S.toplantılar = [];
  if (!S.faturalar)       S.faturalar = [];
  if (!S.aidatBorclandir) S.aidatBorclandir = [];
  if (!S.bankDosyalar)    S.bankDosyalar = [];
  // ── Yeni finansal çekirdek alanları (geriye dönük uyumlu) ──
  if (!S.ledgerEntries)   S.ledgerEntries = [];
  if (!S.auditLogs)       S.auditLogs = [];
  if (!S.accounts)        S.accounts = [];
  if (!S.tekrarKontrol)   S.tekrarKontrol = {};
  if (S._ledgerMigrated === undefined) S._ledgerMigrated = false;
  initTanimlar();
}
let _saveDebounceTimer = null;
function save() {
  // localStorage'a anında yaz (offline backup)
  try { localStorage.setItem('syp5', JSON.stringify(S)); } catch(e) {}
  // Supabase'e debounce ile yaz (300ms içinde birden fazla save → tek write)
  if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
  _saveDebounceTimer = setTimeout(function() { saveToSupabase(); }, 300);
  refreshUI();
}

function refreshUI() {
  try { renderDashboard(); } catch(e) {}
  try {
    const ap = document.querySelector('.ni.on')?.dataset?.p;
    if (ap === 'apartmanlar') { renderApts(); renderAptKart(); }
    else if (ap === 'gorevler') renderGov();
    else if (ap === 'asansor') renderAsan();
    else if (ap === 'teklifler') { renderTek(); renderKarsil(); }
    else if (ap === 'icra') { renderIcra(); renderIcraRapor(); }
    else if (ap === 'finans') { renderFinans(); renderFinansRapor(); finGelirOdemeDurumChange && finGiderFormuHazirla && finGiderFormuHazirla(); }
    else if (ap === 'denetim') renderDen();
    else if (ap === 'karar') renderKararlar();
    else if (ap === 'isletme') renderIslKayitli();
    else if (ap === 'sakinler') renderSakinler();
    else if (ap === 'personel') renderPersonel();
    else if (ap === 'duyurular') renderDuyurular();
    else if (ap === 'ariza') renderAriza();
    else if (ap === 'tahsilat') renderTahsilat();
    else if (ap === 'raporlar') renderRaporlar();
    else if (ap === 'sigorta') renderSigorta();
    else if (ap === 'toplanti') renderToplanti();
    else if (ap === 'fatura') renderFatura();
  } catch(e) {}
  try { syncDropdowns(); } catch(e) {}
  // Apt ctx topbar her save'de güncelle
  try { if(typeof updateGlobalSiteBar==='function') updateGlobalSiteBar(); } catch(e) {}
  // Sidebar badge güncelle
  try {
    const borclu=S.sakinler.filter(x=>(x.borc||0)>0).length;
    const bdgS=document.getElementById('bdg-sakin'); if(bdgS){ bdgS.textContent=borclu; bdgS.style.display=borclu?'':'none'; }
    const bdgA=document.getElementById('bdg-ariza'); if(bdgA){ const acik=S.arizalar.filter(a=>a.durum==='acik').length; bdgA.textContent=acik; bdgA.style.display=acik?'':'none'; }
    const bdgB=document.getElementById('bdg-borc'); if(bdgB){ bdgB.textContent=borclu; bdgB.style.display=borclu?'':'none'; }
  } catch(e) {}
}

// Helpers
const today = () => new Date().toISOString().split('T')[0];
const fmt = (n, d=0) => Number(n||0).toLocaleString('tr-TR', { minimumFractionDigits:d, maximumFractionDigits:d });
const fmtMoney = (n) => Number(n||0).toLocaleString('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2 });
const dayDiff = (ds, from=new Date()) => Math.floor((new Date(ds) - from) / 864e5);
const aptById = id => S.apartmanlar.find(a => a.id === +id);
const emp = (ico, txt) => `<div class="emp"><span class="emp-i">${ico}</span><div>${txt}</div></div>`;

// 
// TOAST
// 
function toast(msg, type='') {
 const el = document.getElementById('toast');
 el.textContent = msg; el.className = 'toast show' + (type ? ' '+type : '');
 clearTimeout(el._t); el._t = setTimeout(() => el.className = 'toast', 2800);
}

//
// HASH ROUTING
//
window._navStack = [];
window._navRestoring = false;

function _navPush(page, id) {
  window._navStack.push({ page, id: id ?? null, label: PAGE_TITLES[page] || page });
  const hash = id != null ? `#${page}/${id}` : `#${page}`;
  history.pushState({ page, id: id ?? null }, '', hash);
  _navUpdateBreadcrumb();
}

function navBack() {
  if (window._navStack.length <= 1) return;
  window._navStack.pop();
  const prev = window._navStack[window._navStack.length - 1];
  const hash = prev.id != null ? `#${prev.page}/${prev.id}` : `#${prev.page}`;
  history.replaceState({ page: prev.page, id: prev.id }, '', hash);
  window._navRestoring = true;
  _navRestorePage(prev.page, prev.id);
  window._navRestoring = false;
  _navUpdateBreadcrumb();
}

function _navRestorePage(page, id) {
  if (id != null) {
    if (page === 'apt-detay')   { goAptDetay(id);         return; }
    if (page === 'daire-detay') { goDaireDetay(id);       return; }
    if (page === 'sakin-cari')   { goSakinCari(id, false); return; }
    if (page === 'sakin-profil') { goSakinProfil(id);     return; }
    if (page === 'isl-detay')    { goIslDetay(id);        return; }
    if (page === 'den-detay')   { goDenDetay(id);         return; }
    if (page === 'asan-detay')  { goAsanDetay(id);        return; }
  }
  goPage(page);
}

function _navGoTo(idx) {
  if (idx >= window._navStack.length - 1) return;
  window._navStack.splice(idx + 1);
  const target = window._navStack[window._navStack.length - 1];
  const hash = target.id != null ? `#${target.page}/${target.id}` : `#${target.page}`;
  history.replaceState({ page: target.page, id: target.id }, '', hash);
  window._navRestoring = true;
  _navRestorePage(target.page, target.id);
  window._navRestoring = false;
  _navUpdateBreadcrumb();
}

function _navUpdateBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  if (!bc) return;
  bc.innerHTML = '';
  bc.style.display = 'none';
}

window.addEventListener('popstate', function(e) {
  if (!e.state) return;
  const { page, id } = e.state;
  const idx = window._navStack.findIndex(x => x.page === page && x.id == id);
  if (idx >= 0) { window._navStack.splice(idx + 1); }
  else { window._navStack = [{ page, id, label: PAGE_TITLES[page] || page }]; }
  window._navRestoring = true;
  _navRestorePage(page, id);
  window._navRestoring = false;
  _navUpdateBreadcrumb();
});

//
// NAVIGATION
//
const PAGE_TITLES = { dashboard:'Anasayfa', apartmanlar:'Apartmanlar', karar:'Karar Metni Oluşturucu', isletme:'İşletme Projesi', 'isl-detay':'İşletme Projesi Detay', denetim:'Denetim Raporları', 'den-detay':'Denetim Raporu Detay', asansor:'Asansör Etiket Kontrolü', 'asan-detay':'Asansör Detay', teklifler:'Teklifler', gorevler:'Görev Yönetimi', icra:'İcra Listesi', finans:'Gelir / Gider Takibi', ayarlar:'Ayarlar', sakinler:'Sakin Yönetimi', personel:'Personel Yönetimi', duyurular:'Duyuru & İletişim', ariza:'Arıza & Bakım Yönetimi', tahsilat:'Tahsilat & Borç Takibi', raporlar:'Raporlar & Analitik', 'ai-asistan':'AI Yönetim Asistanı', sigorta:'Sigorta Takibi', toplanti:'Toplantı Yönetimi', fatura:'Fatura & Hizmet Yönetimi', superadmin:'Süper Admin Paneli', 'apt-detay':'Apartman Detay', 'daire-detay':'Daire Detay', 'finansal-durum':'Finansal Durum', 'sakin-cari':'Kişilere Göre Finansal Durum', 'tanimlama':'Evrak Kategorisi', 'proje':'Proje & Tadilat Takibi', 'iletisim':'İletişim Merkezi', 'toplu-borc':'Toplu Borçlandırma', 'sms-sablonlar':'SMS / WhatsApp Şablonları',
'sakin-profil':'Sakin Profili', 'davet-yonetim':'Sakin Davetleri', 'davet-bekleyen':'Onay Bekleyenler', 'davet-kayit':'Sisteme Kayıt', 'makbuzlar':'Makbuzlar' };

function goPage(p) {
 if (!window._navRestoring) {
   window._navStack = [{ page: p, id: null, label: PAGE_TITLES[p] || p }];
   history.pushState({ page: p, id: null }, '', `#${p}`);
   _navUpdateBreadcrumb();
 }
 document.querySelectorAll('.ni').forEach(n => n.classList.toggle('on', n.dataset.p === p));
  closeSidebarMobile();
 document.querySelectorAll('.pg').forEach(x => x.classList.remove('on'));
 const pg = document.getElementById('page-' + p);
 if (pg) pg.classList.add('on');
 document.getElementById('page-title').textContent = PAGE_TITLES[p] || p;

 // Topbar actions
 const ta = document.getElementById('topbar-acts');
 ta.innerHTML = '';
 const acts = {
 apartmanlar: '<button class="btn bp" onclick="openAptModal()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Apartman Ekle</button>',
 gorevler: '<button class="btn bp" onclick="openGovModal()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Görev Ekle</button>',
 teklifler: '<button class="btn bp" onclick="goTab(\'tek-yeni\')"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Yeni Teklif</button>',
 sakinler: '<button class="btn bp" onclick="goTab(\'sak-tekil\')"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Sakin Ekle</button>',
 denetim: '<button class="btn bp" onclick="goTab(\'den-yeni\')"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Yeni Rapor</button>',
 icra: '<button class="btn bp" onclick="goTab(\'icra-yeni\')"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Yeni Dosya</button>',
 sigorta: '<button class="btn bp" onclick="goTab(\'sig-yeni\')"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Yeni Poliçe</button>',
 toplanti: '<button class="btn bp" onclick="goTab(\'top-yeni\')"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Yeni Toplantı</button>',
 fatura: '<button class="btn bp" onclick="goTab(\'fat-yeni\')"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Yeni Fatura</button>',
 'apt-detay': '<button class="btn bg" onclick="navBack()"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 'daire-detay': '<button class="btn bg" onclick="navBack()"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 proje: '<button class="btn bp" onclick="openProjeModal()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Yeni Proje</button>',
 iletisim: '<button class="btn bp" onclick="openIletisimModal()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Yeni Log</button>',
'sakin-cari': '<button class="btn bg" onclick="navBack()"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 'isl-detay': '<button class="btn bg" onclick="navBack()"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 'den-detay': '<button class="btn bg" onclick="navBack()"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 'asan-detay': '<button class="btn bg" onclick="navBack()"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 'toplu-borc': '',
'sakin-profil': '<button class="btn bg" onclick="navBack()"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button><button class="btn bp" onclick="openSakinProfilEdit()"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Düzenle</button>',
'davet-yonetim': '',
'davet-bekleyen': '',
'davet-kayit': '',
 };
 if (acts[p]) ta.innerHTML = acts[p];
  // PDF button for all pages except ayarlar + ai-asistan
  if (!['ayarlar','ai-asistan'].includes(p)) {
    ta.innerHTML += ` <button class="btn bg sm" onclick="downloadPDF('${p}')" title="PDF İndir" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err-bd)"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> PDF İndir</button>`;
  }

 syncDropdowns();
 // Page-specific init
 if (p==='dashboard') renderDashboard();
 if (p==='apartmanlar') { renderApts(); renderAptKart(); }
 if (p==='denetim') { renderDen(); if (!document.getElementById('den-tarih').value) document.getElementById('den-tarih').value = today(); }
 if (p==='asansor') renderAsan();
 if (p==='teklifler') { renderTek(); renderKarsil(); }
 if (p==='gorevler') renderGov();
 if (p==='isletme') { renderIslKayitli(); initIslDonemSelects(); updateIslGuardVisual(); }
 if (p==='karar') renderKararlar();
 if (p==='icra') { renderIcra(); renderIcraRapor(); }
  if (p==='finans') { renderFinans(); renderFinansRapor(); if(typeof finGiderFormuHazirla==='function')finGiderFormuHazirla(); }
  if (p==='finansal-durum') { _fdSelected = new Set(); renderFinansalDurum(); }
  if (p==='sakin-cari') {
    const sk = S.sakinler.find(s=>s.id===(_currentCariId||0));
    if (sk && typeof renderSakinCari==='function') renderSakinCari(sk);
  }
  if (p==='ayarlar') { loadSettings(); renderSetStats(); }
  if (p==='sakinler') { renderSakinler(); initTopluDaireForm(); }
  if (p==='toplu-borc') { renderTopluBorcPage(); }
  if (p==='sakin-profil') { if(typeof renderSakinProfil==='function') renderSakinProfil(); }
  if (p==='davet-yonetim') { if(typeof renderDavetYonetim==='function') renderDavetYonetim(); }
  if (p==='davet-bekleyen') { if(typeof renderDavetBekleyen==='function') renderDavetBekleyen(); }
  if (p==='tanimlama') renderTanimlama();
  if (p==='proje') renderProjeler();
  if (p==='iletisim') renderIletisim();
  if (p==='personel') { renderPersonel(); }
  if (p==='duyurular') { renderDuyurular(); }
  if (p==='ariza') { renderAriza(); }
  if (p==='tahsilat') { renderTahsilat(); }
  if (p==='makbuzlar') { try{renderTahsilatMakbuz();}catch(e){} }
  if (p==='raporlar') { renderRaporlar(); }
  if (p==='ai-asistan') { initAiAsistan(); }
  if (p==='sigorta') { renderSigorta(); }
  if (p==='toplanti') { renderToplanti(); }
  if (p==='fatura') { renderFatura(); }
  if (p==='superadmin') { renderSuperAdmin(); }
  // Global site bar her sayfa geçişinde güncelle
  updateGlobalSiteBar();
}

// 
// TABS
// 
function initTabs() {
 document.querySelectorAll('.tabs').forEach(tabsEl => {
 tabsEl.querySelectorAll('.tab').forEach(tab => {
 tab.addEventListener('click', () => {
 const id = tab.dataset.tab; if (!id) return;
 tabsEl.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
 tab.classList.add('on');
 const parent = tabsEl.parentElement;
 parent.querySelectorAll(':scope > [id]').forEach(d => d.style.display = d.id === id ? 'block' : 'none');
 if (id==='kar-gecmis') renderKararlar();
 if (id==='isl-kayitli') renderIslKayitli();
 if (id==='tek-karsilastir') renderKarsil();
 if (id==='apt-kart') renderAptKart();
 if (id==='aid-takip') renderAidatTakip();
 if (id==='aid-rapor') renderAidatRapor();
    if (id==='rap-finans') { try{renderFinansRaporSayfa();}catch(e){} }
    if (id==='rap-tahsilat-tab') { try{renderTahsilatRaporSayfa();}catch(e){} }
    if (id==='rap-ariza-tab') { try{renderArizaRaporSayfa();}catch(e){} }
    if (id==='rap-ozet') { try{renderRaporlar();}catch(e){} }
    if (id==='per-liste') { try{renderPersonel();}catch(e){} }
    if (id==='sak-liste') { try{renderSakinler();}catch(e){} }
    if (id==='tbp-gecmis') { try{renderTopluBorcGecmis();}catch(e){} }
    if (id==='sig-liste') { try{renderSigorta();}catch(e){} }
    if (id==='top-liste') { try{renderToplanti();}catch(e){} }
    if (id==='top-takvim') { try{renderTopTakvim();}catch(e){} }
    if (id==='fat-liste') { try{renderFatura();}catch(e){} }
    if (id==='fat-ozet') { try{renderFaturaOzet();}catch(e){} }
    if (id==='mak-borc-makbuz') { try{renderBorcMakbuz();}catch(e){} }
    if (id==='mak-tahsilat-makbuz') { try{renderTahsilatMakbuz();}catch(e){} }
    if (id==='tah-banka') { try{renderBankDosyalar();}catch(e){} }
 });
 });
 });
}
function goTab(id) { const el = document.querySelector(`[data-tab="${id}"]`); if (el) el.click(); }

// 
// MODAL
// 
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.ov').forEach(o => o.addEventListener('click', e => { if (e.target === o && !o.hasAttribute('data-no-close')) o.classList.remove('open'); }));

// 
// DROPDOWNS — central sync
// 
const DD_IDS = ['kar-apt','isl-apt','den-apt','asan-apt','tek-apt','gov-apt','icra-apt','icra-f-apt','tek-f-apt','kar-f-apt','gov-f-apt', 'sak-apt', 'per-apt', 'duy-apt', 'arz-apt', 'arz-f-apt', 'tah-o-apt', 'sig-apt', 'top-apt', 'fat-apt', 'fg-apt', 'gg-apt', 'fin-f-apt', 'fd-f-apt', 'sig-f-apt', 'top-f-apt', 'fat-f-apt', 'toplu-blok'];

function syncDropdowns() {
 DD_IDS.forEach(id => {
 const el = document.getElementById(id); if (!el) return;
 const cur = el.value;
 const isFilter = id.includes('-f-') || id.startsWith('tek-f') || id.startsWith('kar-f') || id.startsWith('gov-f');
 el.innerHTML = (isFilter ? '<option value="">Tüm Apartmanlar</option>' : '<option value="">— Seçin —</option>') +
 S.apartmanlar.filter(a => a.durum==='aktif').map(a => `<option value="${a.id}">${a.ad}</option>`).join('');
 el.value = cur;
 });
 // İl filtresi
 const ilEl = document.getElementById('apt-f-il');
 if (ilEl) {
 const cur = ilEl.value;
 const iller = [...new Set(S.apartmanlar.map(a => a.il).filter(Boolean))];
 ilEl.innerHTML = '<option value="">Tüm İller</option>' + iller.map(i => `<option value="${i}">${i}</option>`).join('');
 ilEl.value = cur;
 }
 // Badges
 document.getElementById('bdg-apt').textContent = S.apartmanlar.filter(a=>a.durum==='aktif').length;
 const acikGov = S.gorevler.filter(g=>g.durum!=='tamamlandi').length;
 document.getElementById('bdg-gov').textContent = acikGov;
 const dolAsan = S.asansorler.filter(a=>dayDiff(a.sonTarih)<0).length;
 const bdgAsan = document.getElementById('bdg-asan');
 bdgAsan.textContent = dolAsan; bdgAsan.style.display = dolAsan > 0 ? '' : 'none';
 const bekTek = S.teklifler.filter(t=>t.durum==='bekliyor').length;
 const bdgTek = document.getElementById('bdg-tek');
 bdgTek.textContent = bekTek; bdgTek.style.display = bekTek > 0 ? '' : 'none';
 const kotDen = S.denetimler.filter(d=>d.durum==='kotu').length;
 const bdgDen = document.getElementById('bdg-den');
 bdgDen.style.display = kotDen > 0 ? '' : 'none';
 // Aidat gecikmiş
}

// 
// DASHBOARD
// 
function renderDashboard() {
  const root = document.getElementById('ds-root');
  if (!root) { renderDashboardLegacy(); return; }
  // Eski static HTML artıkları temizle (yalnızca ilk kez)
  if (!root._cleaned) {
    root._cleaned = true;
    const pg = root.parentElement;
    if (pg) [...pg.children].forEach(c => {
      if (c !== root) c.remove();
    });
  }

  const aktif = S.apartmanlar.filter(a=>a.durum==='aktif').length;
  const topDaire = S.apartmanlar.reduce((s,a)=>s+(a.daireSayisi||0),0);
  const acikGov = S.gorevler.filter(g=>g.durum!=='tamamlandi').length;
  const dolAsan = S.asansorler.filter(a=>dayDiff(a.sonTarih)<0).length;
  const tamGov = S.gorevler.filter(g=>g.durum==='tamamlandi').length;
  const topHizmet = S.apartmanlar.filter(a=>a.durum==='aktif').reduce((s,a)=>s+(a.hizmetBedeli||0),0);
  const topSakin = S.sakinler.length;
  const borcluSakin = S.sakinler.filter(x=>(x.borc||0)>0).length;
  const acikAriza = S.arizalar.filter(a=>a.durum==='acik').length;
  const aktifPer = S.personel.filter(p=>p.durum==='aktif').length;

  const now = new Date();
  const saat = now.getHours();
  const selamlama = saat < 12 ? 'Günaydın' : saat < 18 ? 'İyi günler' : 'İyi akşamlar';
  const yoneticiAd = S.ayarlar?.yonetici || 'Yönetici';
  const tarihStr = now.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ── Helper: icon circle ───────────────────────────
  const ico = (d,bg,cl) => `<div class="ds-ico" style="background:${bg};color:${cl}"><svg viewBox="0 0 24 24">${d}</svg></div>`;
  const initials = n => (n||'?').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();

  // ── Helper: data row ──────────────────────────────
  const mkRow = (avatar, name, sub, val, valCl, clickFn) => {
    const av = avatar.length <= 3
      ? `<div class="ds-av">${avatar}</div>`
      : `<div class="ds-av-ico">${avatar}</div>`;
    const click = clickFn ? ` onclick="${clickFn}" style="cursor:pointer"` : '';
    return `<div class="ds-row"${click}>${av}<div class="ds-row-info"><div class="ds-row-name">${name}</div><div class="ds-row-sub">${sub}</div></div><div class="ds-row-val" style="color:${valCl||'var(--tx-1)'}">${val}</div></div>`;
  };

  // ── Helper: empty state ───────────────────────────
  const empRow = txt => `<div class="ds-empty"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${txt}</div>`;

  // ── HERO CHIPS ─────────────────────────────────────
  const heroChips = [
    { v: aktif,       l: 'Apartman',   i: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/>',                                                  cls: '',           page: 'apartmanlar' },
    { v: topSakin,    l: 'Sakin',      i: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',                  cls: '',           page: 'sakinler' },
    { v: acikGov,     l: 'Görev',      i: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', cls: acikGov>0?'ch-warn':'', page: 'gorevler' },
    { v: acikAriza,   l: 'Arıza',      i: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', cls: acikAriza>0?'ch-err':'', page: 'ariza' },
    { v: borcluSakin, l: 'Borçlu',     i: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',cls: borcluSakin>0?'ch-warn':'', page: 'tahsilat' },
  ].map(c=>`<div class="ds-hero-chip ${c.cls}" onclick="goPage('${c.page}')"><svg viewBox="0 0 24 24">${c.i}</svg><strong>${c.v}</strong><span>${c.l}</span></div>`).join('');

  // ── QUICK ACTIONS ──────────────────────────────────
  const qaItems = [
    { l:'Apartman Ekle',  i:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/><line x1="12" y1="1" x2="12" y2="5"/><line x1="9" y1="3" x2="15" y2="3"/>',  fn:"openAptModal()",                           bg:'#eff6ff', cl:'#2563eb' },
    { l:'Sakin Ekle',     i:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',    fn:"goPage('sakinler');goTab('sak-tekil')",    bg:'#f0fdf4', cl:'#059669' },
    { l:'Arıza Bildir',   i:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', fn:"goPage('ariza');goTab('arz-yeni')",      bg:'#fff7ed', cl:'#ea580c' },
    { l:'Tahsilat',       i:'<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',                              fn:"goPage('tahsilat')",                       bg:'#fef9c3', cl:'#ca8a04' },
    { l:'Duyuru Yaz',     i:'<path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/>',                             fn:"goPage('duyurular');goTab('duy-yeni')",    bg:'#fdf4ff', cl:'#9333ea' },
    { l:'Fatura Ekle',    i:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>',                fn:"goPage('fatura');goTab('fat-yeni')",       bg:'#f0fdf4', cl:'#16a34a' },
  ].map(q=>`<div class="ds-qa-item" onclick="${q.fn}"><div class="ds-qa-ico" style="background:${q.bg};color:${q.cl}"><svg viewBox="0 0 24 24">${q.i}</svg></div><span class="ds-qa-lbl">${q.l}</span></div>`).join('');

  // ── KPI CARDS ──────────────────────────────────────
  const kpis = [
    { v: aktif,           l:'Aktif Apartman',    s:S.apartmanlar.length+' toplam',  acc:'#2563eb', ibg:'#eff6ff', i:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/>',                                page:'apartmanlar' },
    { v: topDaire,        l:'Toplam Daire',       s:'Tüm apartmanlar',               acc:'#7c3aed', ibg:'#ede9fe', i:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', page:'apartmanlar' },
    { v: topSakin,        l:'Toplam Sakin',       s:borcluSakin+' borçlu',           acc:'#0891b2', ibg:'#e0f2fe', i:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',                  page:'sakinler' },
    { v: '₺'+fmt(topHizmet), l:'Aylık Hizmet',   s:'Aktif apartmanlar',             acc:'#059669', ibg:'#dcfce7', i:'<text x="12" y="17" text-anchor="middle" font-size="14" font-weight="800" fill="currentColor">₺</text>', page:'finans', sm:true },
    { v: acikGov,         l:'Açık Görev',         s:tamGov+' tamamlandı',            acc: acikGov>0?'#d97706':'#059669', ibg: acikGov>0?'#fef3c7':'#dcfce7', i:'<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', page:'gorevler' },
    { v: acikAriza,       l:'Açık Arıza',         s:'Bekleyen',                      acc: acikAriza>0?'#dc2626':'#059669', ibg: acikAriza>0?'#fee2e2':'#dcfce7', i:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', page:'ariza' },
    { v: dolAsan,         l:'Asansör Uyarısı',    s:'Süresi dolmuş',                 acc: dolAsan>0?'#dc2626':'#059669', ibg: dolAsan>0?'#fee2e2':'#dcfce7', i:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/>',                      page:'asansor' },
    { v: aktifPer,        l:'Aktif Personel',     s:'Toplam '+S.personel.length,     acc:'#d97706', ibg:'#fef3c7', i:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',                  page:'personel' },
  ].map(k=>`<div class="ds-kpi" style="--kpi-acc:${k.acc};--kpi-ibg:${k.ibg}" onclick="goPage('${k.page}')">
    <div class="ds-kpi-ico"><svg viewBox="0 0 24 24">${k.i}</svg></div>
    <div class="ds-kpi-val" style="${k.sm?'font-size:20px;':''}">${k.v}</div>
    <div class="ds-kpi-lbl">${k.l}</div>
    <div class="ds-kpi-sub">${k.s}</div>
  </div>`).join('');

  // ── UYARI BANNER ───────────────────────────────────
  const notifItems = buildNotifs();
  const ndanger = notifItems.filter(x=>x.type==='danger');
  const nwarn   = notifItems.filter(x=>x.type==='warn');
  const ninfo   = notifItems.filter(x=>x.type==='info');
  let alertHtml;
  if (!notifItems.length) {
    alertHtml = `<div class="ds-alert ds-alert-ok">
      <div class="ds-alert-ico"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
      <span class="ds-alert-lbl">Her şey yolunda — kritik uyarı bulunmuyor.</span>
    </div>`;
  } else {
    const chips2 = [
      ndanger.length ? `<span class="ds-alert-chip" style="background:#fee2e2;color:#dc2626">${ndanger.length} Kritik</span>` : '',
      nwarn.length   ? `<span class="ds-alert-chip" style="background:#fef3c7;color:#d97706">${nwarn.length} Uyarı</span>` : '',
      ninfo.length   ? `<span class="ds-alert-chip" style="background:#dbeafe;color:#2563eb">${ninfo.length} Bilgi</span>` : '',
    ].filter(Boolean).join('');
    alertHtml = `<div class="ds-alert ds-alert-warn" onclick="toggleNotifPanel()">
      <div class="ds-alert-ico"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <span class="ds-alert-lbl">Dikkat gerektiren durumlar</span>
      ${chips2}
      <span class="ds-alert-more">Detaylar →</span>
    </div>`;
  }

  // ── DATA SECTIONS ──────────────────────────────────
  const borcluList = S.sakinler.filter(x=>(x.borc||0)>0).sort((a,b)=>(b.borc||0)-(a.borc||0)).slice(0,6);
  const borcluHtml = borcluList.length
    ? borcluList.map(sk=>mkRow(initials(sk.ad), sk.ad, (sk.aptAd||'—')+' · D.'+sk.daire, '₺'+fmt(sk.borc||0), '#dc2626', `goDaireDetay(${sk.id})`)).join('')
    : empRow('Borçlu sakin bulunmuyor');

  const sonTahsilatlar = (S.tahsilatlar||[]).filter(t=>t.status!=='cancelled').slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||'')).slice(0,6);
  const tahsilatHtml = sonTahsilatlar.length
    ? sonTahsilatlar.map(t=>mkRow(initials(t.sakAd||t.sakinAd||'?'), t.sakAd||t.sakinAd||'—', (t.aptAd||'—')+' · '+(t.tarih||'—'), '₺'+fmt(t.tutar||0), '#059669')).join('')
    : empRow('Henüz tahsilat kaydı yok');

  const aptList = S.apartmanlar.slice(-5).reverse();
  const aptsHtml = aptList.length
    ? aptList.map(a=>mkRow(`<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/></svg>`, a.ad, (a.daireSayisi||0)+' daire · '+(a.ilce||a.il||'—'), `<span class="b ${a.durum==='aktif'?'b-gr':'b-rd'}">${a.durum||'—'}</span>`, '')).join('')
    : empRow('Apartman eklenmedi');

  const openGList = S.gorevler.filter(g=>g.durum!=='tamamlandi').slice(-5);
  const govHtml = openGList.length
    ? openGList.map(g=>mkRow(`<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, g.baslik, (g.atanan||'Atanmamış')+' · '+(g.son||'—'), `<span class="b ${onBadge(g.oncelik)}">${g.oncelik||'—'}</span>`, '')).join('')
    : empRow('Açık görev yok');

  const warnAsan = S.asansorler.filter(a=>dayDiff(a.sonTarih)<30).sort((a,b)=>new Date(a.sonTarih)-new Date(b.sonTarih)).slice(0,5);
  const asanHtml = warnAsan.length
    ? warnAsan.map(a=>{ const d=dayDiff(a.sonTarih); return mkRow(`<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/></svg>`, a.aptAd, (a.blok&&a.blok!=='—'?a.blok:a.bolum||'—')+' · '+a.sonTarih, d<0?Math.abs(d)+' gün geçti':d+' gün', d<0?'#dc2626':'#d97706'); }).join('')
    : empRow('Kritik asansör kaydı yok');

  const aktifDosyalar = (S.icralar||[]).filter(i=>i.durum==='devam').slice(-5);
  const icraHtml = aktifDosyalar.length
    ? aktifDosyalar.map(i=>mkRow(`<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6M3 15h6"/></svg>`, i.aptAd||'—', (i.borclu||'—')+' · '+(i.dosyaNo||'—'), '₺'+fmt(i.tutar||0), '#dc2626')).join('')
    : empRow('Aktif icra dosyası yok');

  const hizmetApts = S.apartmanlar.filter(a=>a.durum==='aktif'&&a.hizmetBedeli>0).sort((a,b)=>(b.hizmetBedeli||0)-(a.hizmetBedeli||0));
  const maxH = hizmetApts.length ? hizmetApts[0].hizmetBedeli : 1;
  const toplamH = hizmetApts.reduce((s,a)=>s+(a.hizmetBedeli||0),0);
  const hizmetHtml = hizmetApts.length
    ? hizmetApts.map(a=>{const pct=Math.round(a.hizmetBedeli/maxH*100); return `<div class="ds-hizmet-row"><div class="ds-hizmet-top"><span>${a.ad}</span><span style="font-weight:700;color:#059669">₺${fmt(a.hizmetBedeli)}</span></div><div class="ds-hizmet-bar"><div style="width:${pct}%"></div></div></div>`}).join('')
      + `<div class="ds-hizmet-total"><span>Aylık Toplam</span><span>₺${fmt(toplamH)}</span></div>`
    : empRow('Hizmet bedeli girilmiş apartman yok');

  const finIslemler = (S.finansIslemler||[]).filter(f=>f.status!=='cancelled').slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||'')).slice(0,6);
  const finHtml = finIslemler.length
    ? finIslemler.map(f=>{ const g=f.tur==='gelir'; return mkRow(`<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`, f.aciklama||f.kat||'—', (f.aptAd||'—')+' · '+(f.tarih||'—')+` · <span class="b ${g?'b-gr':'b-rd'}" style="font-size:10px">${g?'Gelir':'Gider'}</span>`, (g?'+':'-')+'₺'+fmt(f.tutar||0), g?'#059669':'#dc2626'); }).join('')
      + `<div style="text-align:center;padding:10px 0 2px"><button class="btn bg sm" onclick="goPage('finans')" style="gap:5px">Tüm İşlemleri Gör <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button></div>`
    : empRow('Henüz finansal işlem kaydı yok');

  // ── CARD BUILDER ───────────────────────────────────
  const card = (icoBg, icoCl, icoSvg, title, sub, body, btnLbl, btnFn) => `
    <div class="ds-card">
      <div class="ds-card-head">
        <div class="ds-card-title">
          <div class="ds-ico" style="background:${icoBg};color:${icoCl};width:30px;height:30px;border-radius:8px"><svg viewBox="0 0 24 24">${icoSvg}</svg></div>
          <div><div class="ds-card-tname">${title}</div><div class="ds-card-tsub">${sub}</div></div>
        </div>
        <button class="btn bg xs" onclick="${btnFn}">${btnLbl}</button>
      </div>
      <div class="ds-card-body">${body}</div>
    </div>`;

  // ── RENDER ─────────────────────────────────────────
  root.innerHTML = `
    <div class="ds-hero">
      <div class="ds-hero-inner">
        <div class="ds-hero-date">${tarihStr}</div>
        <h1 class="ds-hero-title">${selamlama}, <strong>${yoneticiAd}</strong></h1>
        <p class="ds-hero-sub">Sistemde <b>${aktif}</b> aktif apartman, <b>${acikGov}</b> açık görev ve <b>${acikAriza}</b> bekleyen arıza bulunuyor.</p>
        <div class="ds-hero-chips">${heroChips}</div>
      </div>
    </div>

    <div class="ds-qa-grid">${qaItems}</div>

    ${alertHtml}

    <div class="ds-kpi-grid">${kpis}</div>

    <div class="ds-grid2">
      ${card('#fee2e2','#dc2626','<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', 'Borçlu Sakinler','En yüksek borçlular',borcluHtml,'Tahsilat',"goPage('tahsilat')")}
      ${card('#dcfce7','#059669','<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>', 'Son Tahsilatlar','En son ödeme kayıtları',tahsilatHtml,'Tümünü Gör',"goPage('tahsilat')")}
    </div>

    <div class="ds-grid2" style="margin-top:12px">
      ${card('#f1f5f9','#475569','<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/>', 'Son Apartmanlar','En son eklenen kayıtlar',aptsHtml,'Tümünü Gör',"goPage('apartmanlar')")}
      ${card('#fef3c7','#d97706','<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 'Açık Görevler','Bekleyen işler',govHtml,'Tümünü Gör',"goPage('gorevler')")}
    </div>

    <div class="ds-grid2" style="margin-top:12px">
      ${card('#fee2e2','#dc2626','<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/>', 'Asansör Uyarıları','Süresi dolmuş veya yaklaşan',asanHtml,'Tümünü Gör',"goPage('asansor')")}
      ${card('#fee2e2','#dc2626','<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6M3 15h6"/>', 'Aktif İcralar','Devam eden dosyalar',icraHtml,'Tümünü Gör',"goPage('icra')")}
    </div>

    <div class="ds-grid3" style="margin-top:12px">
      ${card('#dcfce7','#059669','<text x="12" y="17" text-anchor="middle" font-size="14" font-weight="800" fill="currentColor">₺</text>', 'Hizmet Bedelleri','Aylık hizmet bedeli özeti',hizmetHtml,'Apartmanlar',"goPage('apartmanlar')")}
      ${card('#f1f5f9','#475569','<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', 'Son Finansal İşlemler','Gelir ve gider hareketleri',finHtml,'Tüm İşlemler',"goPage('finans')")}
    </div>`;

  updateNotifDot();
}

function renderDashboardLegacy() {}

function calcHizmetBedeli() {
  const val = parseFloat(document.getElementById('apt-hizmet').value) || 0;
  const oz = document.getElementById('apt-hizmet-ozet');
  if (!val) { oz.style.display = 'none'; return; }
  const kdvHaric = val / 1.20;
  const kdv = val - kdvHaric;
  oz.style.display = 'block';
  oz.innerHTML = '<strong>KDV Hariç:</strong> ₺' + fmt(kdvHaric) + ' &nbsp;|&nbsp; <strong>KDV (%20):</strong> ₺' + fmt(kdv) + ' &nbsp;|&nbsp; <strong>KDV Dahil (fatura tutarı):</strong> ₺' + fmt(val);
}

const onBadge = o => ({ acil:'b-rd', yuksek:'b-am', normal:'b-bl', dusuk:'b-gy' }[o]||'b-gy');

// 
// APARTMANLAR
// 
function renderApts() {
 const s = (document.getElementById('apt-srch')?.value||'').toLowerCase();
 const fd = document.getElementById('apt-f-durum')?.value||'';
 const fil = document.getElementById('apt-f-il')?.value||'';
 let list = S.apartmanlar;
 if (fd) list = list.filter(a=>a.durum===fd);
 if (fil) list = list.filter(a=>a.il===fil);
 if (s) list = list.filter(a=>(a.ad+' '+a.adres+' '+(a.ilce||'')).toLowerCase().includes(s));
 document.getElementById('apt-count').textContent = `${list.length} / ${S.apartmanlar.length} sonuç`;
 const tb = document.getElementById('apt-tbody');
 if (!list.length) { tb.innerHTML = `<tr><td colspan="8">${emp('️','Apartman bulunamadı')}</td></tr>`; return; }
 tb.innerHTML = list.map(a => `<tr> <td><span style="cursor:pointer;font-weight:600;color:var(--brand)" onclick="goAptDetay(${a.id})">${he(a.ad)}</span></td> <td class="t2" style="font-size:11.5px">${he(a.adres)}${a.ilce?', '+he(a.ilce):''}${a.il?', '+he(a.il):''}</td> <td>${a.daireSayisi}</td> <td>${a.yon||'—'}</td> <td style="font-weight:700;color:var(--ok)">${a.aidat?'₺'+fmt(a.aidat):'—'}</td> <td style="font-weight:700;color:var(--brand)">${a.hizmetBedeli?'₺'+fmt(a.hizmetBedeli):'—'}</td> <td><span class="b ${a.asansor==='evet'?'b-gr':'b-gy'}">${a.asansor==='evet'?'Var':'Yok'}</span></td> <td><span class="b ${a.durum==='aktif'?'b-gr':'b-rd'}">${a.durum==='aktif'?' Aktif':' Pasif'}</span></td> <td><div class="act"> <button class="btn bg xs" onclick="goAptDetay(${a.id})" title="Sayfayı Aç" style="color:var(--brand)"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button> <button class="btn bg xs" onclick="openAptModal(${a.id})" title="Düzenle"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button> <button class="btn ${a.durum==='aktif'?'brd':'bgn'} xs" onclick="toggleApt(${a.id})" title="${a.durum==='aktif'?'Pasife Al':'Aktif Et'}">${a.durum==='aktif'?'Pasif':'Aktif'}</button> <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delApt(${a.id})" title="Sil"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button> </div></td> </tr>`).join('');
}

function renderAptKart() {
 const s = (document.getElementById('apt-kart-srch')?.value||'').toLowerCase();
 let list = S.apartmanlar;
 if (s) list = list.filter(a=>a.ad.toLowerCase().includes(s));
 const c = document.getElementById('apt-kart-grid');
 if (!list.length) { c.innerHTML = emp('️','Apartman bulunamadı'); return; }
 c.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">` + list.map(a => {
 const den = S.denetimler.filter(d=>d.aptId===a.id);
 const sonDen = den.sort((x,y)=>new Date(y.tarih)-new Date(x.tarih))[0];
 return `<div class="card" style="cursor:pointer;transition:box-shadow .15s" onmouseenter="this.style.boxShadow='var(--sh-lg)'" onmouseleave="this.style.boxShadow=''" onclick="goAptDetay(${a.id})"> <div class="fbc mb8"><div style="font-size:14px;font-weight:700">${a.ad}</div><span class="b ${a.durum==='aktif'?'b-gr':'b-rd'}">${a.durum}</span></div> <div class="t3 mb8" style="font-size:11px"> ${a.adres}${a.ilce?', '+a.ilce:''}</div> <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11.5px;margin-bottom:10px"> <div><span class="t3">Daire:</span> <strong>${a.daireSayisi}</strong></div> <div><span class="t3">Kat:</span> <strong>${a.katSayisi||'—'}</strong></div> <div><span class="t3">Aidat:</span> <strong style="color:var(--ok)">${a.aidat?'₺'+fmt(a.aidat):'—'}</strong></div> <div><span class="t3">Hizmet:</span> <strong style="color:var(--brand)">${a.hizmetBedeli?'₺'+fmt(a.hizmetBedeli):'—'}</strong></div> <div><span class="t3">Asansör:</span> <strong>${a.asansor==='evet'?'✓':'✗'}</strong></div> </div>
 ${sonDen ? `<div style="background:var(--s2);border-radius:7px;padding:6px 9px;font-size:11px;margin-bottom:8px"><span class="t3">Son denetim puanı:</span> <strong style="color:${sonDen.puan>=80?'var(--ok)':sonDen.puan>=60?'var(--warn)':'var(--err)'}">${sonDen.puan}/100</strong></div>` : '<div style="margin-bottom:8px"></div>'}
 <button class="btn bg xs" onclick="event.stopPropagation();goAptDetay(${a.id})" title="Sayfayı Aç" style="width:100%;justify-content:center;color:var(--brand);gap:5px"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Sayfayı Aç</button>
 </div>`;
 }).join('') + '</div>';
}

function openAptModal(id = null) {
  editId = id; drRows = [];
  document.getElementById('mod-apt-title').textContent = id ? '️ Apartman Düzenle' : '️ Yeni Apartman Ekle';
  const fMap = { 'apt-ad':'ad', 'apt-mahalle':'mahalle', 'apt-adres':'adres', 'apt-ilce':'ilce', 'apt-il':'il', 'apt-daire':'daireSayisi', 'apt-kat':'katSayisi', 'apt-yon':'yon', 'apt-yon-tel':'yonTel', 'apt-iban':'iban', 'apt-yil':'insaatYili', 'apt-aidat':'aidat', 'apt-hizmet':'hizmetBedeli' };
  if (id) {
    const a = aptById(id);
    Object.entries(fMap).forEach(([fid, key]) => document.getElementById(fid).value = a[key]||'');
    document.getElementById('apt-durum').value = a.durum||'aktif';
    document.getElementById('apt-asansor').value = a.asansor||'evet';
    drRows = a.daireler ? [...a.daireler] : [];
    // Blok bilgilerini yükle
    blokRows = a.bloklar ? JSON.parse(JSON.stringify(a.bloklar)) : [];
    document.getElementById('apt-blok-sayi').value = blokRows.length || 1;
    calcHizmetBedeli();
  } else {
    Object.keys(fMap).forEach(fid => document.getElementById(fid).value = '');
    document.getElementById('apt-durum').value = 'aktif';
    document.getElementById('apt-asansor').value = 'evet';
    blokRows = [{ ad: 'A Blok', asansorSayisi: 1 }];
    document.getElementById('apt-blok-sayi').value = 1;
    document.getElementById('apt-hizmet-ozet').style.display = 'none';
  }
  renderBlokEdit();
  renderDaireEdit();
  openModal('mod-apt');
}

function saveApt() {
  if (!_guardCheck()) return;
  const ad = document.getElementById('apt-ad').value.trim();
  const adres = document.getElementById('apt-adres').value.trim();
  const ds = parseInt(document.getElementById('apt-daire').value)||0;
  if (!runValidation(() => {
    Validate.required(ad, 'Apartman adı');
    Validate.maxLength(ad, 100, 'Apartman adı');
    Validate.required(adres, 'Adres');
    if (ds < 1) throw new Error('Daire sayısı en az 1 olmalıdır');
  })) return;
  // Blok verilerini topla
  const bloklar = blokRows.map(function(b, i) {
    const adEl = document.getElementById('blok-ad-' + i);
    const asEl = document.getElementById('blok-asan-' + i);
    const dsEl = document.getElementById('blok-daire-' + i);
    return {
      ad: adEl ? adEl.value.trim() || b.ad : b.ad,
      asansorSayisi: asEl ? parseInt(asEl.value)||0 : (b.asansorSayisi||0),
      daireSayisi: dsEl ? parseInt(dsEl.value)||0 : (b.daireSayisi||0)
    };
  });
  const apt = {
    id: editId || Date.now(), ad, adres,
    mahalle:document.getElementById('apt-mahalle').value, ilce:document.getElementById('apt-ilce').value,
    il:document.getElementById('apt-il').value, daireSayisi:ds,
    katSayisi:parseInt(document.getElementById('apt-kat').value)||0,
    yon:document.getElementById('apt-yon').value, yonTel:document.getElementById('apt-yon-tel').value,
    iban:document.getElementById('apt-iban').value, insaatYili:document.getElementById('apt-yil').value,
    aidat:parseFloat(document.getElementById('apt-aidat').value)||0,
    hizmetBedeli:parseFloat(document.getElementById('apt-hizmet').value)||0,
    asansor:document.getElementById('apt-asansor').value,
    durum:document.getElementById('apt-durum').value,
    bloklar: bloklar,
    daireler:drRows.filter(d=>d.no)
  };
  if (editId) { const i=S.apartmanlar.findIndex(a=>a.id===editId); if(i>=0) S.apartmanlar[i]=apt; }
  else S.apartmanlar.push(apt);
  save(); closeModal('mod-apt');
  toast(editId?'Apartman güncellendi.':'Apartman eklendi.','ok');
}

function toggleApt(id) {
 const a = S.apartmanlar.find(x=>x.id===id);
 if (a) { a.durum = a.durum==='aktif'?'pasif':'aktif'; save(); toast('Durum güncellendi.','ok'); }
}
function delApt(id) {
  if (!confirm('Bu apartmanı silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz.')) return;
  S.apartmanlar = S.apartmanlar.filter(a=>a.id!==id);
  closeModal('mod-detay');
  save();
  toast('Apartman silindi.','warn');
}

function viewApt(id) {
 const a = aptById(id); if (!a) return;
 document.getElementById('mod-detay-title').textContent = a.ad;
 const denS = S.denetimler.filter(d=>d.aptId===id).length;
 const tekS = S.teklifler.filter(t=>t.aptId===id).length;
 const govS = S.gorevler.filter(g=>g.aptId===id&&g.durum!=='tamamlandi').length;
 const asanS = S.asansorler.filter(s=>s.aptId===id).length;
 const aptIcra = (S.icralar||[]).filter(x=>x.aptId===id).length;
 const sonDen = S.denetimler.filter(d=>d.aptId===id).sort((x,y)=>new Date(y.tarih)-new Date(x.tarih))[0];

 document.getElementById('mod-detay-body').innerHTML = `
 <div class="g2 mb16"> <div> <div class="card"> <div class="card-t mb12"> Genel Bilgiler</div>
 ${dRow('Adres', a.adres+(a.mahalle?', '+a.mahalle:''))}
 ${dRow('İlçe / İl', (a.ilce||'—')+' / '+(a.il||'—'))}
 ${dRow('Daire / Kat', a.daireSayisi+' daire, '+(a.katSayisi||'?')+' kat')}
 ${dRow('Asansör', a.asansor==='evet'?' Var':' Yok')}
 ${dRow('İnşaat Yılı', a.insaatYili||'—')}
 ${dRow('Aylık Aidat', a.aidat?'₺'+fmt(a.aidat):'—')}
 ${dRow('Aylık Hizmet Bedeli', a.hizmetBedeli?`<strong style="color:var(--brand)">₺${fmt(a.hizmetBedeli)}</strong>`:'—')}
 ${dRow('Durum', `<span class="b ${a.durum==='aktif'?'b-gr':'b-rd'}">${a.durum}</span>`)}
 ${dRow('Yönetici', a.yon||'—')}
 ${dRow('Tel', a.yonTel||'—')}
 ${dRow('IBAN', a.iban||'—')}
 ${sonDen?dRow('Son Denetim Puanı', `<strong style="color:${sonDen.puan>=80?'var(--ok)':sonDen.puan>=60?'var(--warn)':'var(--err)'}">${sonDen.puan}/100</strong>`):''}
 </div> </div> <div> <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
 ${miniCard('', denS, 'Denetim', 'denetim')}
 ${miniCard('', tekS, 'Teklif', 'teklifler')}
 ${miniCard('', govS, 'Açık Görev', 'gorevler')}
 ${miniCard('', asanS, 'Asansör', 'asansor')}
 ${miniCard('', aptIcra, 'İcra Dosyası', 'icra')}
 </div> <div class="card"> <div class="card-t mb12"> Daireler ${a.daireler?.length?`<span class="b b-bl">${a.daireler.length}</span>`:''}</div>
 ${a.daireler?.length ? `<div class="tw"><table><thead><tr><th>No</th><th>Sakin</th><th>Tel</th><th>Arsa Payı</th></tr></thead><tbody>${a.daireler.map(d=>`<tr><td>${d.no}</td><td class="t2">${d.sakin||'—'}</td><td class="t2">${d.tel||'—'}</td><td class="t2">${d.arsaPayi||'—'}</td></tr>`).join('')}</tbody></table></div>` : emp('','Daire bilgisi girilmemiş')}
 </div> </div> </div> <div class="fc g8" style="flex-wrap:wrap"> <button class="btn bp" onclick="closeModal('mod-detay');openAptModal(${a.id})">️ Düzenle</button> <button class="btn bg" onclick="closeModal('mod-detay');goPage('karar');setTimeout(()=>{document.getElementById('kar-apt').value='${a.id}';onKarApt();},100)"> Karar Oluştur</button>
    <button class="btn bg" onclick="closeModal('mod-detay');goAptSpecific(${a.id},'sakinler')">👥 Sakinler</button>
    <button class="btn bg" onclick="closeModal('mod-detay');goAptSpecific(${a.id},'tahsilat')">💰 Tahsilat</button>
    <button class="btn bg" onclick="closeModal('mod-detay');goAptSpecific(${a.id},'ariza')">🔧 Arızalar</button>
    <button class="btn bg" onclick="closeModal('mod-detay');goAptSpecific(${a.id},'raporlar')">📊 Raporlar</button> <button class="btn bg" onclick="closeModal('mod-detay');goPage('isletme');setTimeout(()=>{document.getElementById('isl-apt').value='${a.id}';onIslApt();},100)"> İşletme Projesi</button> <button class="btn bg" onclick="closeModal('mod-detay');goPage('denetim');setTimeout(()=>{goTab('den-yeni');document.getElementById('den-apt').value='${a.id}';},100)"> Denetim Başlat</button> </div>
  ${(a.bloklar && a.bloklar.length > 0) ? '<div class="sep"></div><div class="sec-title">Blok Yapısı</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:10px">' + a.bloklar.map(function(b){return '<div class="card" style="padding:12px 14px;border-radius:10px;box-shadow:none"><div style="font-size:12.5px;font-weight:700">' + b.ad + '</div><div style="font-size:11px;color:var(--tx-3);margin-top:2px">' + (b.asansorSayisi||0) + ' asansör</div></div>';}).join('') + '</div><div class="info-box" style="font-size:11.5px">' + a.bloklar.length + ' blok · ' + a.bloklar.reduce(function(s,b){return s+(b.asansorSayisi||0);},0) + ' toplam asansör</div>' : ''}
`;
 openModal('mod-detay');
}
const dRow = (k, v) => `<div class="dr"><span class="dk">${k}</span><span class="dv">${v}</span></div>`;
const miniCard = (ico, n, lbl, page) => `<div class="card" style="text-align:center;cursor:pointer;padding:10px" onclick="closeModal('mod-detay');goPage('${page}')"><div style="font-size:17px;margin-bottom:3px">${ico}</div><div style="font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:var(--brand)">${n}</div><div class="t3" style="font-size:10px">${lbl}</div></div>`;


// ── BLOK YÖNETİMİ ────────────────────────────────────────────
var blokRows = [{ ad: 'A Blok', asansorSayisi: 1 }];

function renderBlokEdit() {
  var sayiEl = document.getElementById('apt-blok-sayi');
  if (!sayiEl) return;
  var sayi = Math.max(1, Math.min(20, parseInt(sayiEl.value)||1));
  // Mevcut değerleri önce oku
  for (var i = 0; i < blokRows.length; i++) {
    var adEl = document.getElementById('blok-ad-' + i);
    var asEl = document.getElementById('blok-asan-' + i);
    if (adEl) blokRows[i].ad = adEl.value.trim() || blokRows[i].ad;
    if (asEl) blokRows[i].asansorSayisi = parseInt(asEl.value)||0;
  }
  // Blok sayısını ayarla
  var defaultNames = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T'];
  while (blokRows.length < sayi) {
    blokRows.push({ ad: defaultNames[blokRows.length] + ' Blok', asansorSayisi: 1 });
  }
  if (blokRows.length > sayi) blokRows = blokRows.slice(0, sayi);

  var html = '<div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:8px;">';
  // Header row
  html += '<div style="font-size:10px;font-weight:700;color:var(--tx-3);text-transform:uppercase;letter-spacing:.8px;padding:0 2px;">Blok Adı</div>';
  html += '<div style="font-size:10px;font-weight:700;color:var(--tx-3);text-transform:uppercase;letter-spacing:.8px;padding:0 2px;">Daire Sayısı</div>';
  html += '<div style="font-size:10px;font-weight:700;color:var(--tx-3);text-transform:uppercase;letter-spacing:.8px;padding:0 2px;">Asansör Sayısı</div>';
  for (var j = 0; j < blokRows.length; j++) {
    var b = blokRows[j];
    html += '<input class="fi" id="blok-ad-' + j + '" value="' + (b.ad||'') + '" placeholder="A Blok" style="padding:8px 10px;font-size:13px;">';
    html += '<input type="number" class="fi" id="blok-daire-' + j + '" value="' + (b.daireSayisi||0) + '" min="0" max="999" placeholder="0" style="padding:8px;text-align:center;font-size:13px;font-weight:700;">';
    html += '<div style="display:flex;align-items:center;gap:6px;">'
          + '<button type="button" class="btn bg xs" onclick="adjBlokAsan(' + j + ',-1)" style="width:28px;height:28px;padding:0;justify-content:center;font-size:16px;flex-shrink:0">−</button>'
          + '<input type="number" class="fi" id="blok-asan-' + j + '" value="' + (b.asansorSayisi||0) + '" min="0" max="10" style="padding:8px;text-align:center;font-size:13px;font-weight:700;">'
          + '<button type="button" class="btn bg xs" onclick="adjBlokAsan(' + j + ',1)" style="width:28px;height:28px;padding:0;justify-content:center;font-size:16px;flex-shrink:0">+</button>'
          + '</div>';
  }
  html += '</div>';
  // Özet
  var toplamAsan = blokRows.reduce(function(s, b) { return s + (parseInt(b.asansorSayisi)||0); }, 0);
  var toplamDaire = blokRows.reduce(function(s, b) { return s + (parseInt(b.daireSayisi)||0); }, 0);
  html += '<div class="info-box mt8" style="font-size:11.5px;">'
        + '<strong>' + blokRows.length + ' blok</strong>, toplam <strong>' + toplamDaire + ' daire</strong>, <strong>' + toplamAsan + ' asansör</strong>'
        + '</div>';
  document.getElementById('blok-edit-list').innerHTML = html;
}

function adjBlokAsan(idx, delta) {
  var el = document.getElementById('blok-asan-' + idx);
  if (!el) return;
  var v = Math.max(0, Math.min(10, parseInt(el.value||'0') + delta));
  el.value = v;
  blokRows[idx].asansorSayisi = v;
  // Özeti güncelle
  var toplamAsan = 0;
  for (var i = 0; i < blokRows.length; i++) {
    var asEl = document.getElementById('blok-asan-' + i);
    toplamAsan += asEl ? (parseInt(asEl.value)||0) : (blokRows[i].asansorSayisi||0);
  }
  var infoBoxes = document.querySelectorAll('#blok-edit-list .info-box');
  if (infoBoxes.length) infoBoxes[0].innerHTML = '<strong>' + blokRows.length + ' blok</strong>, toplam <strong>' + toplamAsan + ' asansör</strong>';
}

// Asansör formunda apt seçince blok/asansör no dropdown'larını doldur
function onAsanAptChange() {
  var aptId = document.getElementById('asan-apt').value;
  var blokSel = document.getElementById('asan-blok');
  var noSel = document.getElementById('asan-no');
  blokSel.innerHTML = '<option value="">— Blok Seçin —</option>';
  noSel.innerHTML = '<option value="">— Asansör Seçin —</option>';
  if (!aptId) return;
  var apt = aptById(parseInt(aptId)||aptId);
  if (!apt || !apt.bloklar || !apt.bloklar.length) {
    // Blok tanımlanmamış — serbest giriş aktif
    blokSel.innerHTML = '<option value="genel">Genel</option>';
    noSel.innerHTML = '<option value="1">Asansör 1</option>';
    return;
  }
  apt.bloklar.forEach(function(b) {
    var opt = document.createElement('option');
    opt.value = b.ad;
    opt.textContent = b.ad + ' (' + (b.asansorSayisi||0) + ' asansör)';
    blokSel.appendChild(opt);
  });
  blokSel.onchange = function() { fillAsansorNo(apt); };
  if (apt.bloklar.length === 1) {
    blokSel.value = apt.bloklar[0].ad;
    fillAsansorNo(apt);
  }
}

function fillAsansorNo(apt) {
  var blokAd = document.getElementById('asan-blok').value;
  var noSel = document.getElementById('asan-no');
  noSel.innerHTML = '<option value="">— Asansör Seçin —</option>';
  if (!blokAd || !apt || !apt.bloklar) return;
  var blok = apt.bloklar.find(function(b) { return b.ad === blokAd; });
  if (!blok) return;
  var sayi = parseInt(blok.asansorSayisi)||0;
  for (var i = 1; i <= sayi; i++) {
    var opt = document.createElement('option');
    opt.value = i;
    opt.textContent = blokAd + ' – Asansör ' + i;
    noSel.appendChild(opt);
  }
  if (sayi === 1) noSel.value = '1';
}

function renderDaireEdit() {
 const c = document.getElementById('daire-edit-list');
 c.innerHTML = drRows.map((d,i) => `
 <div style="display:grid;grid-template-columns:60px 1fr 120px 80px 24px;gap:5px;margin-bottom:4px;align-items:center"> <input class="fi" style="padding:6px 8px;font-size:11.5px" placeholder="No" value="${d.no||''}" onchange="drRows[${i}].no=this.value"> <input class="fi" style="padding:6px 8px;font-size:11.5px" placeholder="Sakin" value="${d.sakin||''}" onchange="drRows[${i}].sakin=this.value"> <input class="fi" style="padding:6px 8px;font-size:11.5px" placeholder="Tel" value="${d.tel||''}" onchange="drRows[${i}].tel=this.value"> <input class="fi" type="number" style="padding:6px 8px;font-size:11.5px" placeholder="Arsa" value="${d.arsaPayi||''}" onchange="drRows[${i}].arsaPayi=parseFloat(this.value)||0">  </div>`).join('') +
 `<button class="btn bg sm mt8" onclick="drRows.push({no:'',sakin:'',tel:'',arsaPayi:0});renderDaireEdit()">＋ Daire Satırı Ekle</button>`;
}

// 
// KARAR METNİ
// 
function onKarApt() {
 const a = aptById(document.getElementById('kar-apt').value);
 const el = document.getElementById('kar-apt-info');
 if (!a) { el.style.display='none'; return; }
 el.innerHTML = ` <strong>${a.ad}</strong> — ${a.adres}${a.ilce?', '+a.ilce:''}${a.il?', '+a.il:''} | ${a.daireSayisi} daire | Yönetici: ${a.yon||'—'}`;
 el.style.display = 'block';
}

async function genKarar() {
 const apt = aptById(document.getElementById('kar-apt').value);
 const ham = document.getElementById('kar-ham').value.trim();
 if (!ham) { toast('Ham karar metnini girin!','err'); return; }
 const out = document.getElementById('kar-out');
 out.innerHTML = '<div class="lds"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span style="margin-left:4px">Hazırlanıyor…</span></div>';
 const turLabel = { olagan:'Olağan Kat Malikleri Kurulu Toplantısı', olaganustu:'Olağanüstü Kat Malikleri Kurulu Toplantısı', daire:'Daire Sakinleri Toplantısı' };
 const tur = document.getElementById('kar-tur').value;
 const prompt = `Sen profesyonel bir apartman yönetim uzmanısın. Aşağıdaki ham, özet metni resmi Türk apartman/site karar defteri formatına dönüştür.

${apt?`APARTMAN BİLGİLERİ:\nAd: ${apt.ad}\nAdres: ${apt.adres}${apt.ilce?', '+apt.ilce:''}${apt.il?', '+apt.il:''}\nDaire Sayısı: ${apt.daireSayisi}\nYönetici: ${apt.yon||'—'}\n\n`:''}TOPLANTI TÜRÜ: ${turLabel[tur]}
TARİH: ${document.getElementById('kar-tarih').value||'—'}
KARAR NO: ${document.getElementById('kar-no').value||'—'}
KATILIMCI: ${document.getElementById('kar-katilim').value||'—'} kişi, Toplam ${document.getElementById('kar-oy').value||'—'} oy
GÜNDEM: ${document.getElementById('kar-gundem').value||'—'}

HAM METİN:
${ham}

Aşağıdaki formatta resmi karar defteri yaz:
- Büyük harfle başlık: KAT MÜLKİYETİ KANUNU GEREĞİNCE ALINAN KARARLAR
- Apartman adı, adresi
- Toplantı türü, tarih, karar no, katılım bilgisi
- Her karar için: KARAR 1:, KARAR 2: şeklinde numaralı başlık, karar metni, oybirliği/oy çokluğu notu
- Kapanış cümlesi, tarih, imza alanı
Resmi, hukuki Türkçe kullan.`;

 try {
 const r = await callAI(prompt);
 out.textContent = r;
 } catch(e) { out.textContent = 'API bağlantı hatası. API anahtarı gereklidir.'; }
}

function copyKarar() { navigator.clipboard.writeText(document.getElementById('kar-out').textContent).then(()=>toast('Kopyalandı!','ok')); }
function printKarar() { openPrint(document.getElementById('kar-out').textContent); }
function saveKarar() {
 const t = document.getElementById('kar-out').textContent;
 if (!t||t==='Karar metni burada görünecek…') { toast('Önce karar oluşturun!','err'); return; }
 const apt = aptById(document.getElementById('kar-apt').value);
 S.kararlar.push({ id:Date.now(), aptId:apt?.id||null, aptAd:apt?.ad||'Genel', tarih:document.getElementById('kar-tarih').value, no:document.getElementById('kar-no').value, tur:document.getElementById('kar-tur').value, katilim:document.getElementById('kar-katilim').value, metin:t });
 save(); toast('Karar kaydedildi.','ok');
}

function renderKararlar() {
 const s = (document.getElementById('kar-srch')?.value||'').toLowerCase();
 let list = S.kararlar;
 if (s) list = list.filter(k=>k.aptAd.toLowerCase().includes(s)||(k.no||'').toLowerCase().includes(s));
 const tb = document.getElementById('kar-tbody'); if (!tb) return;
 const tl = { olagan:'Olağan', olaganustu:'Olağanüstü', daire:'Daire Sakinleri' };
 if (!list.length) { tb.innerHTML=`<tr><td colspan="6">${emp('','Karar kaydı yok')}</td></tr>`; return; }
 tb.innerHTML = list.slice().reverse().map(k=>`<tr> <td>${k.aptAd}</td><td>${k.tarih||'—'}</td><td>${k.no||'—'}</td> <td><span class="b b-bl">${tl[k.tur]||'—'}</span></td> <td>${k.katilim||'—'} kişi</td> <td><div class="act"> <button class="btn bg xs" onclick="openKararModal(${k.id})"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Gör</button><button class="btn bg xs" onclick="printById(${k.id})" title="Yazdır"><svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button><button class="act-btn rd" onclick="delKarar(${k.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button> </div></td> </tr>`).join('');
}
function openKararModal(id) { const k=S.kararlar.find(x=>x.id===id); if(!k)return; document.getElementById('mod-karar-body').textContent=k.metin; document.getElementById('mod-karar-body').dataset.id=id; openModal('mod-karar'); }
function copyModalKarar() { navigator.clipboard.writeText(document.getElementById('mod-karar-body').textContent).then(()=>toast('Kopyalandı!','ok')); }
function printModalKarar() { openPrint(document.getElementById('mod-karar-body').textContent); }
function printById(id) { const k=S.kararlar.find(x=>x.id===id); if(k) openPrint(k.metin); }
function delKarar(id) { if(!confirm('Silinsin mi?'))return; S.kararlar=S.kararlar.filter(k=>k.id!==id); save(); toast('Silindi.','warn'); }
function openPrint(txt) { const w=window.open('','_blank'); w.document.write(`<html><head><style>body{font-family:Arial;font-size:13px;line-height:1.9;padding:40px;max-width:800px;margin:0 auto}pre{white-space:pre-wrap}</style></head><body><pre>${txt}</pre></body></html>`); w.print(); }

//
// İŞLETME PROJESİ
//
let GK = [
 {ad:'Temizlik Hizmeti',tutar:0},{ad:'Elektrik (Ortak Alan)',tutar:0},
 {ad:'Su Faturası',tutar:0},{ad:'Asansör Bakım',tutar:0},
 {ad:'Güvenlik / Kapıcı',tutar:0},{ad:'Bina Sigortası',tutar:0}
];
let GelirK = [];
let ISL_BLOKLAR = [];
let ISL_ORANLAR = {};
let ISL_BLOK_ACIK = {}; // her blok için açık/kapalı durumu: {bi: true/false}
let ISL_DAGITIM_ACIK = true; // aidat dağılım tablosu açık/kapalı
let _islAidatAylik = 0;
const MONTHS_TR_ISL = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
let _islDonemInitialized = false;

function initIslDonemSelects() {
  if (_islDonemInitialized) return;
  _islDonemInitialized = true;
  const opts = [];
  for (const y of [2024,2025,2026,2027,2028]) {
    for (let m = 0; m < 12; m++) {
      opts.push(`<option value="${y}-${String(m+1).padStart(2,'0')}">${MONTHS_TR_ISL[m]} ${y}</option>`);
    }
  }
  const html = opts.join('');
  const bas = document.getElementById('isl-donem-bas');
  const bit = document.getElementById('isl-donem-bit');
  if (!bas || !bit) return;
  bas.innerHTML = html;
  bit.innerHTML = html;
  const now = new Date();
  const basVal = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const bitD = new Date(now.getFullYear(), now.getMonth()+11, 1);
  const bitVal = `${bitD.getFullYear()}-${String(bitD.getMonth()+1).padStart(2,'0')}`;
  bas.value = basVal;
  bit.value = bitVal;
  calcIslDonem();
}

function calcIslDonem() {
  const bas = document.getElementById('isl-donem-bas')?.value || '';
  const bit = document.getElementById('isl-donem-bit')?.value || '';
  const info = document.getElementById('isl-donem-info');
  if (!bas || !bit || !info) return;
  const [by, bm] = bas.split('-').map(Number);
  const [ey, em] = bit.split('-').map(Number);
  const aylar = (ey - by) * 12 + (em - bm) + 1;
  if (aylar < 1) { info.innerHTML = '<span style="color:var(--err)">⚠️ Bitiş tarihi başlangıçtan önce olamaz</span>'; return; }
  info.textContent = `✓ ${aylar} aylık dönem (${MONTHS_TR_ISL[bm-1]} ${by} – ${MONTHS_TR_ISL[em-1]} ${ey})`;
  calcIsl();
}

function getIslAyCount() {
  const bas = document.getElementById('isl-donem-bas')?.value || '';
  const bit = document.getElementById('isl-donem-bit')?.value || '';
  if (!bas || !bit) return 1;
  const [by, bm] = bas.split('-').map(Number);
  const [ey, em] = bit.split('-').map(Number);
  const ay = (ey - by) * 12 + (em - bm) + 1;
  return ay > 0 ? ay : 1;
}

function getIslDonemLabel() {
  const bas = document.getElementById('isl-donem-bas')?.value || '';
  const bit = document.getElementById('isl-donem-bit')?.value || '';
  if (!bas) return '—';
  const [by, bm] = bas.split('-').map(Number);
  if (!bit || bas === bit) return `${MONTHS_TR_ISL[bm-1]} ${by}`;
  const [ey, em] = bit.split('-').map(Number);
  return `${MONTHS_TR_ISL[bm-1]} ${by} – ${MONTHS_TR_ISL[em-1]} ${ey}`;
}

function islAptModeChange() {
  const mode = document.querySelector('input[name="isl-apt-mod"]:checked')?.value || 'kayitli';
  document.getElementById('isl-apt-kayitli-wrap').style.display = mode === 'kayitli' ? '' : 'none';
  document.getElementById('isl-apt-manuel-wrap').style.display = mode === 'manuel' ? '' : 'none';
  if (mode === 'manuel') {
    document.getElementById('isl-apt-info').style.display = 'none';
    ISL_BLOKLAR = [{ ad: 'A Blok', daireler: [] }];
    renderIslBloklar();
  } else {
    onIslApt();
  }
  updateIslGuardVisual();
}

function onIslApt() {
  const a = aptById(document.getElementById('isl-apt').value);
  const el = document.getElementById('isl-apt-info');
  if (!a) { el.style.display='none'; ISL_BLOKLAR=[]; renderIslBloklar(); calcIsl(); updateIslGuardVisual(); return; }
  el.innerHTML = `<strong>${a.ad}</strong> · ${a.daireSayisi} daire · ${a.ilce||''} ${a.il||''} · Aidat: ${a.aidat?'₺'+fmt(a.aidat):'—'}`;
  el.style.display = 'block';
  // Load blocks from apartment
  if (a.bloklar && a.bloklar.length) {
    ISL_BLOKLAR = a.bloklar.map(b => {
      const daireler = a.daireler?.filter(d => d.blok === b.ad || (!d.blok && a.bloklar.length === 1)) || [];
      const finalDaireler = daireler.length ? daireler.map(d => ({no:d.no||'',tur:d.tur||'mesken',sakin:d.sakin||'',arsaPayi:d.arsaPayi||1})) :
        Array.from({length: Math.round(a.daireSayisi/(a.bloklar.length||1))}, (_,i) => ({no:String(i+1),tur:'mesken',sakin:'',arsaPayi:1}));
      return { ad: b.ad, daireler: finalDaireler };
    });
  } else {
    const daireler = a.daireler?.length ? a.daireler.map(d=>({no:d.no||'',tur:d.tur||'mesken',sakin:d.sakin||'',arsaPayi:d.arsaPayi||1})) :
      Array.from({length:a.daireSayisi},(_,i)=>({no:String(i+1),tur:'mesken',sakin:'',arsaPayi:1}));
    ISL_BLOKLAR = [{ ad: 'Blok', daireler }];
  }
  ISL_ORANLAR = {};
  renderIslBloklar();
  calcIsl();
  updateIslGuardVisual();
}

function onIslAptManuel() {
  calcIsl();
  updateIslGuardVisual();
}

function updateIslGuardVisual() {
  const secildi = islAptSecildi();
  const ids = ['isl-blok-card', 'isl-gider-card', 'isl-gelir-card'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.opacity = secildi ? '1' : '0.4';
    el.style.filter = secildi ? '' : 'grayscale(60%)';
  });
}

function islAptSecildi() {
  const mode = document.querySelector('input[name="isl-apt-mod"]:checked')?.value || 'kayitli';
  if (mode === 'manuel') {
    return (document.getElementById('isl-apt-manuel')?.value || '').trim().length > 0;
  } else {
    return !!aptById(document.getElementById('isl-apt')?.value);
  }
}

function islGuard() {
  if (!islAptSecildi()) {
    toast('Önce proje parametrelerini giriniz!', 'warn');
    return false;
  }
  return true;
}

function getIslAptAd() {
  const mode = document.querySelector('input[name="isl-apt-mod"]:checked')?.value || 'kayitli';
  if (mode === 'manuel') return document.getElementById('isl-apt-manuel')?.value || 'Manuel Apartman';
  const a = aptById(document.getElementById('isl-apt').value);
  return a ? a.ad : '';
}

function toggleIslDagitim() {
  ISL_DAGITIM_ACIK = !ISL_DAGITIM_ACIK;
  const wrap = document.getElementById('isl-dagitim-wrap');
  const chev = document.getElementById('isl-dag-chev');
  if (wrap) wrap.style.display = ISL_DAGITIM_ACIK ? '' : 'none';
  if (chev) chev.style.transform = ISL_DAGITIM_ACIK ? 'rotate(180deg)' : 'rotate(0deg)';
}

function toggleIslBlokListe(bi) {
  ISL_BLOK_ACIK[bi] = !ISL_BLOK_ACIK[bi];
  const listEl = document.getElementById('isl-daire-liste-' + bi);
  const chevEl = document.getElementById('isl-blok-chev-' + bi);
  const ozEl   = document.getElementById('isl-blok-oz-' + bi);
  if (!listEl) return;
  const acik = ISL_BLOK_ACIK[bi];
  listEl.style.display = acik ? '' : 'none';
  if (chevEl) chevEl.style.transform = acik ? 'rotate(180deg)' : 'rotate(0deg)';
  if (ozEl)   ozEl.style.display = acik ? 'none' : '';
}

function renderIslBloklar() {
  const el = document.getElementById('isl-blok-list');
  if (!ISL_BLOKLAR.length) {
    el.innerHTML = '<div class="t3" style="font-size:12px;padding:6px 0">Kayıtlı apartman seçildiğinde bloklar otomatik yüklenir.</div>';
    return;
  }
  const cokBlok = ISL_BLOKLAR.length > 1;
  el.innerHTML = ISL_BLOKLAR.map((blok, bi) => {
    const acik = ISL_BLOK_ACIK[bi] !== false; // varsayılan açık
    const meskenSayisi = blok.daireler.filter(d => d.tur === 'mesken').length;
    const isyeriSayisi = blok.daireler.filter(d => d.tur === 'isyeri').length;
    const ozet = blok.daireler.length
      ? `${blok.daireler.length} bağımsız bölüm` + (isyeriSayisi ? ` (${meskenSayisi} mesken, ${isyeriSayisi} işyeri)` : '')
      : 'Henüz daire eklenmedi';
    return `
    <div style="background:var(--s2);border-radius:8px;margin-bottom:8px;overflow:hidden">

      <!-- Blok başlığı -->
      <div style="display:flex;align-items:center;gap:8px;padding:10px 10px 8px 10px">
        <input class="fi" style="font-weight:600;font-size:12px;max-width:150px;padding:4px 8px" value="${blok.ad}" onchange="ISL_BLOKLAR[${bi}].ad=this.value;renderIslBloklar()">
        <div style="flex:1"></div>
        <!-- Tekli ekle -->
        <button class="btn bg xs" onclick="addIslDaire(${bi})">
          <svg viewBox="0 0 24 24" style="width:12px;height:12px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Daire
        </button>
        <!-- Blok sil -->
        ${cokBlok ? `<button onclick="ISL_BLOKLAR.splice(${bi},1);delete ISL_BLOK_ACIK[${bi}];renderIslBloklar();calcIsl()" style="background:none;border:none;cursor:pointer;color:var(--err);font-size:18px;line-height:1;padding:0 2px" title="Bloğu sil">×</button>` : ''}
        <!-- Aç/kapat butonu -->
        ${blok.daireler.length ? `
        <button onclick="toggleIslBlokListe(${bi})" style="display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:600;color:var(--tx-2)">
          <span id="isl-blok-oz-${bi}" style="display:${acik?'none':''};">${ozet}</span>
          <svg id="isl-blok-chev-${bi}" viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2.5;transition:transform .2s;transform:rotate(${acik?'180':'0'}deg)"><polyline points="6 9 12 15 18 9"/></svg>
        </button>` : ''}
      </div>

      <!-- Toplu ekleme çubuğu -->
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:var(--brand-10);padding:7px 10px;border-top:1px solid var(--brand-20,#dbeafe);border-bottom:1px solid var(--brand-20,#dbeafe)">
        <span style="font-size:11px;font-weight:700;color:var(--brand);white-space:nowrap">⚡ Toplu Daire Ekle</span>
        <span style="font-size:11px;color:var(--tx-3)">Adet:</span>
        <input id="toplu-sayi-${bi}" class="fi" type="number" min="1" max="200" style="font-size:11px;padding:3px 7px;width:55px" placeholder="10">
        <span style="font-size:11px;color:var(--tx-3)">Başlangıç No:</span>
        <input id="toplu-start-${bi}" class="fi" type="number" min="1" style="font-size:11px;padding:3px 7px;width:55px" value="${blok.daireler.length + 1}">
        <select id="toplu-tur-${bi}" class="fi" style="font-size:11px;padding:3px 7px"><option value="mesken">Mesken</option><option value="isyeri">İşyeri</option></select>
        <button class="btn bp xs" onclick="topluDaireEkle(${bi})">+ Ekle</button>
      </div>

      <!-- Daire listesi (açılır/kapanır) -->
      <div id="isl-daire-liste-${bi}" style="padding:8px 10px;display:${acik?'':'none'}">
        ${blok.daireler.length ? `
        <!-- Sütun başlıkları -->
        <div style="display:grid;grid-template-columns:55px 80px 1fr 18px;gap:3px;padding:0 6px;margin-bottom:3px">
          <span style="font-size:10px;color:var(--tx-3);font-weight:600">No</span>
          <span style="font-size:10px;color:var(--tx-3);font-weight:600">Tür</span>
          <span style="font-size:10px;color:var(--tx-3);font-weight:600">Sakin</span>
          <span></span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:4px">
          ${blok.daireler.map((d, di) => `
          <div style="display:grid;grid-template-columns:55px 80px 1fr 18px;gap:3px;align-items:center;background:var(--surface);border-radius:5px;padding:4px 6px;font-size:11px">
            <input class="fi" style="font-size:11px;padding:3px 5px" value="${d.no}" placeholder="No" onchange="ISL_BLOKLAR[${bi}].daireler[${di}].no=this.value;calcIsl()">
            <select class="fi" style="font-size:11px;padding:3px 5px" onchange="ISL_BLOKLAR[${bi}].daireler[${di}].tur=this.value;calcIsl()">
              <option value="mesken"${d.tur==='mesken'?' selected':''}>Mesken</option>
              <option value="isyeri"${d.tur==='isyeri'?' selected':''}>İşyeri</option>
            </select>
            <input class="fi" style="font-size:11px;padding:3px 5px" value="${d.sakin||''}" placeholder="Sakin" onchange="ISL_BLOKLAR[${bi}].daireler[${di}].sakin=this.value">
            <button onclick="ISL_BLOKLAR[${bi}].daireler.splice(${di},1);renderIslBloklar();calcIsl()" style="background:none;border:none;cursor:pointer;color:var(--err);font-size:14px;padding:0">×</button>
          </div>`).join('')}
        </div>
        <!-- Alt özet -->
        <div style="margin-top:6px;padding:5px 6px;background:var(--s2);border-radius:5px;font-size:11px;color:var(--tx-3);display:flex;justify-content:space-between">
          <span>Toplam: <strong style="color:var(--tx)">${blok.daireler.length} bağımsız bölüm</strong></span>
          ${isyeriSayisi ? `<span>${meskenSayisi} mesken · ${isyeriSayisi} işyeri</span>` : `<span>${meskenSayisi} mesken</span>`}
        </div>` : `<div class="t3" style="font-size:11px;padding:4px">Bu bloğa henüz daire eklenmedi.</div>`}
      </div>

    </div>`;
  }).join('');
}

function addIslBlok() {
  if (!islGuard()) return;
  const letters = 'ABCDEFGHIJ';
  ISL_BLOKLAR.push({ ad: (letters[ISL_BLOKLAR.length] || String(ISL_BLOKLAR.length+1)) + ' Blok', daireler: [] });
  renderIslBloklar();
}

function addIslDaire(bi) {
  if (!islGuard()) return;
  const n = ISL_BLOKLAR[bi].daireler.length + 1;
  ISL_BLOKLAR[bi].daireler.push({ no: String(n), tur: 'mesken', sakin: '', arsaPayi: 1 });
  renderIslBloklar();
  calcIsl();
}

function topluDaireEkle(bi) {
  if (!islGuard()) return;
  const countEl = document.getElementById('toplu-sayi-'+bi);
  const startEl = document.getElementById('toplu-start-'+bi);
  const turEl = document.getElementById('toplu-tur-'+bi);
  const count = parseInt(countEl?.value) || 0;
  const startNo = parseInt(startEl?.value) || (ISL_BLOKLAR[bi].daireler.length + 1);
  const tur = turEl?.value || 'mesken';
  if (count < 1 || count > 200) { toast('1 ile 200 arasında daire sayısı giriniz', 'warn'); return; }
  for (let i = 0; i < count; i++) {
    ISL_BLOKLAR[bi].daireler.push({ no: String(startNo + i), tur, sakin: '', arsaPayi: 1 });
  }
  ISL_BLOK_ACIK[bi] = true; // ekleme sonrası liste açık kalsın
  renderIslBloklar();
  calcIsl();
  toast(`${count} daire eklendi (${ISL_BLOKLAR[bi].ad})`, 'ok');
}

function renderGiderler() {
  const ay = getIslAyCount();
  document.getElementById('gider-list').innerHTML = GK.map((g, i) => `
    <div style="display:grid;grid-template-columns:1fr 100px 100px 24px;gap:4px;margin-bottom:4px;align-items:center">
      <input class="fi" style="padding:5px 8px;font-size:12px" value="${g.ad}" placeholder="Gider adı" onchange="GK[${i}].ad=this.value">
      <input class="fi" type="number" style="padding:5px 8px;font-size:12px;text-align:right" value="${g.tutar||''}" placeholder="₺" oninput="GK[${i}].tutar=parseFloat(this.value)||0;updTop()">
      <div style="text-align:right;font-size:12px;color:var(--tx-3);padding:5px 8px;background:var(--s2);border-radius:6px">₺${fmt((g.tutar||0)*ay)}</div>
      <button onclick="GK.splice(${i},1);renderGiderler()" style="background:none;border:none;cursor:pointer;color:var(--err);font-size:18px;line-height:1;padding:0">×</button>
    </div>`).join('');
  updTop();
}

function addGider() { if (!islGuard()) return; GK.push({ad:'',tutar:0}); renderGiderler(); }

function updTop() {
  const ay = getIslAyCount();
  const totAylik = GK.reduce((s,g) => s+(g.tutar||0), 0);
  const el1 = document.getElementById('isl-toplam-aylik');
  const el2 = document.getElementById('isl-toplam');
  if (el1) el1.textContent = '₺'+fmt(totAylik);
  if (el2) el2.textContent = '₺'+fmt(totAylik*ay);
  updNet();
}

function renderGelirler() {
  const ay = getIslAyCount();
  document.getElementById('gelir-list').innerHTML = GelirK.map((g, i) => `
    <div style="display:grid;grid-template-columns:1fr 100px 100px 24px;gap:4px;margin-bottom:4px;align-items:center">
      <input class="fi" style="padding:5px 8px;font-size:12px" value="${g.ad}" placeholder="Gelir adı (Kira geliri, Faiz geliri…)" onchange="GelirK[${i}].ad=this.value">
      <input class="fi" type="number" style="padding:5px 8px;font-size:12px;text-align:right" value="${g.tutar||''}" placeholder="₺" oninput="GelirK[${i}].tutar=parseFloat(this.value)||0;updGelirTopAndRecalc()">
      <div style="text-align:right;font-size:12px;color:var(--tx-3);padding:5px 8px;background:var(--s2);border-radius:6px">₺${fmt((g.tutar||0)*ay)}</div>
      <button onclick="GelirK.splice(${i},1);renderGelirler();updGelirTopAndRecalc()" style="background:none;border:none;cursor:pointer;color:var(--err);font-size:18px;line-height:1;padding:0">×</button>
    </div>`).join('');
  updGelirTop();
}

function addGelir() { if (!islGuard()) return; GelirK.push({ad:'',tutar:0}); renderGelirler(); }

function updGelirTop() {
  const ay = getIslAyCount();
  const hariçAylik = GelirK.reduce((s,g) => s+(g.tutar||0), 0);
  const topAylik = hariçAylik + _islAidatAylik;
  const el1 = document.getElementById('isl-gelir-toplam-aylik');
  const el2 = document.getElementById('isl-gelir-toplam');
  if (el1) el1.textContent = '₺'+fmt(topAylik);
  if (el2) el2.textContent = '₺'+fmt(topAylik*ay);
  updNet();
}

function updGelirTopAndRecalc() {
  // When other income changes, recalc aidat base if "dahil" is checked
  const gelirDahil = (document.querySelector('input[name="isl-gelir-dahil"]:checked')?.value || 'hayir') === 'evet';
  if (gelirDahil) { calcIsl(); } else { updGelirTop(); }
}

function updNet() {
  const ay = getIslAyCount();
  const giderAylik = GK.reduce((s,g) => s+(g.tutar||0), 0);
  const gelirAylik = GelirK.reduce((s,g) => s+(g.tutar||0), 0) + _islAidatAylik;
  const farkToplam = (gelirAylik - giderAylik) * ay;
  const elG = document.getElementById('isl-net-gelir');
  const elGd = document.getElementById('isl-net-gider');
  const elF = document.getElementById('isl-net-fark');
  if (elG) elG.textContent = '₺'+fmt(gelirAylik*ay);
  if (elGd) elGd.textContent = '₺'+fmt(giderAylik*ay);
  if (elF) { elF.textContent = (farkToplam>=0?'+':'')+'₺'+fmt(farkToplam); elF.style.color = farkToplam>=0?'var(--ok)':'var(--err)'; }
}

function calcIsl() {
  const ay = getIslAyCount();
  const dag = document.getElementById('isl-dag')?.value || 'esit';
  const tb = document.getElementById('isl-tbody');
  const oranInfo = document.getElementById('isl-oran-info');
  if (oranInfo) oranInfo.style.display = dag === 'oran' ? '' : 'none';
  if (!tb) return;

  // Collect all units from ISL_BLOKLAR
  let allUnits = [];
  ISL_BLOKLAR.forEach(blok => {
    blok.daireler.forEach(d => { allUnits.push({...d, blok: blok.ad}); });
  });
  if (!allUnits.length) {
    tb.innerHTML = `<tr><td colspan="8">${emp('🏢','Blok ve daire ekleyin veya apartman seçin')}</td></tr>`;
    renderGiderler(); updTop(); return;
  }

  const giderAylik = GK.reduce((s,g) => s+(g.tutar||0), 0); // monthly expenses
  const digerGelirAylik = GelirK.reduce((s,g) => s+(g.tutar||0), 0); // monthly other income
  const gelirDahil = (document.querySelector('input[name="isl-gelir-dahil"]:checked')?.value || 'hayir') === 'evet';

  // Aidat base: if other income is included, subtract it from expenses for balanced budget
  const aidatBaz = gelirDahil ? Math.max(0, giderAylik - digerGelirAylik) : giderAylik;

  // Update info label
  const dahilInfo = document.getElementById('isl-dahil-info');
  if (dahilInfo) {
    if (gelirDahil && digerGelirAylik > 0) {
      const dusus = giderAylik - aidatBaz;
      dahilInfo.innerHTML = `✓ Aylık gider <strong>₺${fmt(giderAylik)}</strong> − Diğer gelirler <strong>₺${fmt(digerGelirAylik)}</strong> = Aidat tabanı <strong style="color:var(--ok)">₺${fmt(aidatBaz)}</strong>${dusus>0?` · <span style="color:var(--ok)">₺${fmt(dusus)} tasarruf</span>`:''}`;
    } else if (gelirDahil) {
      dahilInfo.textContent = 'Henüz harici gelir girilmedi.';
    } else {
      dahilInfo.textContent = 'Aidat, giderlerin tamamını karşılar.';
    }
  }

  if (dag === 'esit') {
    const pp = allUnits.length > 0 ? aidatBaz / allUnits.length : 0;
    _islAidatAylik = aidatBaz;
    tb.innerHTML = allUnits.map(d => `<tr>
      <td>${d.no}</td>
      <td><span class="b ${d.tur==='isyeri'?'b-am':'b-bl'}" style="font-size:10px">${d.tur==='isyeri'?'İşyeri':'Mesken'}</span></td>
      <td>${d.sakin||'—'}</td><td>${d.blok||'—'}</td>
      <td style="text-align:center;color:var(--tx-3)">—</td>
      <td style="color:var(--tx-3)">Eşit</td>
      <td style="font-weight:700;color:var(--ok)">₺${fmt(pp,2)}</td>
      <td style="font-weight:700;color:var(--ok)">₺${fmt(pp*ay,2)}</td>
    </tr>`).join('');
  } else if (dag === 'arsa') {
    const tp = allUnits.reduce((s,d) => s+(d.arsaPayi||1), 0);
    _islAidatAylik = aidatBaz;
    tb.innerHTML = allUnits.map(d => {
      const p = d.arsaPayi || 1;
      const ai = tp > 0 ? aidatBaz * p / tp : 0;
      return `<tr>
        <td>${d.no}</td>
        <td><span class="b ${d.tur==='isyeri'?'b-am':'b-bl'}" style="font-size:10px">${d.tur==='isyeri'?'İşyeri':'Mesken'}</span></td>
        <td>${d.sakin||'—'}</td><td>${d.blok||'—'}</td>
        <td style="text-align:center;color:var(--tx-3)">—</td>
        <td>${p}/${tp}</td>
        <td style="font-weight:700;color:var(--ok)">₺${fmt(ai,2)}</td>
        <td style="font-weight:700;color:var(--ok)">₺${fmt(ai*ay,2)}</td>
      </tr>`;
    }).join('');
  } else { // oran
    const oranMap = {};
    allUnits.forEach(d => {
      const key = `${d.blok}__${d.no}`;
      oranMap[key] = ISL_ORANLAR[key] !== undefined ? parseFloat(ISL_ORANLAR[key]) || 1 : 1;
    });
    const sumOran = Object.values(oranMap).reduce((s,v) => s+v, 0) || 1;
    _islAidatAylik = aidatBaz;
    tb.innerHTML = allUnits.map(d => {
      const key = `${d.blok}__${d.no}`;
      const oran = oranMap[key];
      const ai = aidatBaz * oran / sumOran;
      return `<tr>
        <td>${d.no}</td>
        <td><span class="b ${d.tur==='isyeri'?'b-am':'b-bl'}" style="font-size:10px">${d.tur==='isyeri'?'İşyeri':'Mesken'}</span></td>
        <td>${d.sakin||'—'}</td><td>${d.blok||'—'}</td>
        <td style="text-align:center"><input type="number" class="fi" style="width:58px;padding:3px 5px;font-size:11px;text-align:center" value="${oran}" step="0.25" min="0.1" onchange="ISL_ORANLAR['${key}']=parseFloat(this.value)||1;calcIsl()"></td>
        <td style="font-size:11px">${fmt(oran,2)}/${fmt(sumOran,2)}</td>
        <td style="font-weight:700;color:var(--ok)">₺${fmt(ai,2)}</td>
        <td style="font-weight:700;color:var(--ok)">₺${fmt(ai*ay,2)}</td>
      </tr>`;
    }).join('');
  }

  // Update aidat income row
  const aiEl1 = document.getElementById('isl-aidat-aylik');
  const aiEl2 = document.getElementById('isl-aidat-toplam');
  if (aiEl1) aiEl1.textContent = '₺'+fmt(_islAidatAylik);
  if (aiEl2) aiEl2.textContent = '₺'+fmt(_islAidatAylik*ay);
  renderGiderler();
  updGelirTop();
}

async function genIsletme() {
  const aptAd = getIslAptAd();
  if (!aptAd) { toast('Apartman seçin veya adı girin!','err'); return; }
  const out = document.getElementById('isl-ai-out');
  out.innerHTML = '<div class="lds"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span style="margin-left:4px">Analiz ediliyor…</span></div>';
  const ay = getIslAyCount();
  const top = GK.reduce((s,g)=>s+(g.tutar||0),0);
  const gelirHaric = GelirK.reduce((s,g)=>s+(g.tutar||0),0);
  try {
    const _dag = document.getElementById('isl-dag').value;
    const _dagLbl = _dag==='esit'?'Eşit Dağılım':_dag==='arsa'?'Arsa Payı':'Özel Oran';
    const r = await callAI(`${aptAd} - ${getIslDonemLabel()} dönemi (${ay} ay). Aylık toplam gider: ₺${fmt(top,0)}. Dönem toplam gider: ₺${fmt(top*ay,0)}. Giderler: ${GK.map(g=>g.ad+': aylık ₺'+fmt(g.tutar||0,0)).filter(x=>!x.includes('₺0')).join(' | ')}. ${gelirHaric?'Harici gelirler: '+GelirK.map(g=>g.ad+': aylık ₺'+fmt(g.tutar||0,0)).join(' | ')+'.':''} Dağılım: ${_dagLbl}. 4-5 cümle bütçe değerlendirmesi, tasarruf fırsatları ve öneriler yaz. Türkçe, net, pratik.`);
    out.textContent = r;
  } catch(e) { out.textContent = 'API bağlantı hatası.'; }
}

function saveIsl() {
  const aptAd = getIslAptAd();
  if (!aptAd) { toast('Apartman seçin veya adı girin!','err'); return; }
  const ay = getIslAyCount();
  const top = GK.reduce((s,g)=>s+(g.tutar||0),0);
  const dagRows = [];
  document.getElementById('isl-tbody').querySelectorAll('tr').forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length >= 7) dagRows.push({ daire: tds[0].textContent, tur: tds[1].textContent.trim(), sakin: tds[2].textContent, blok: tds[3].textContent, aylikAidat: tds[6].textContent, donemAidat: tds[7].textContent });
  });
  const apt = aptById(document.getElementById('isl-apt').value);
  const gelirHaric = GelirK.reduce((s,g)=>s+(g.tutar||0),0);
  const gelirDahil = (document.querySelector('input[name="isl-gelir-dahil"]:checked')?.value || 'hayir') === 'evet';
  S.isletmeProjeler.push({
    id: Date.now(),
    aptId: apt?.id || null,
    aptAd,
    donem: getIslDonemLabel(),
    donemBas: document.getElementById('isl-donem-bas')?.value || '',
    donemBit: document.getElementById('isl-donem-bit')?.value || '',
    ayCount: ay,
    dagitim: document.getElementById('isl-dag').value,
    toplam: top,                      // aylık toplam GİDER
    aidatAylik: _islAidatAylik,       // aylık aidat bazı (gelirDahil'e göre hesaplanmış)
    gelirHaric,                       // aylık diğer gelirler
    gelirDahil,
    giderler: GK.map(g=>({...g})),
    gelirler: GelirK.map(g=>({...g})),
    bloklar: ISL_BLOKLAR.map(b=>({...b, daireler:[...b.daireler]})),
    oranlar: {...ISL_ORANLAR},
    dagitimRows: dagRows,
    tarih: new Date().toLocaleDateString('tr-TR')
  });
  save(); toast('İşletme projesi kaydedildi.','ok'); renderIslKayitli();
}

function dlIsl() {
  const aptAd = getIslAptAd();
  const ay = getIslAyCount();
  const rows = document.getElementById('isl-tbody').querySelectorAll('tr');
  let csv = `SiteYönet Pro - İşletme Projesi\n${aptAd} - ${getIslDonemLabel()} (${ay} ay)\n\nDaire,Tür,Sakin,Blok,Aylık Aidat,Dönem Aidatı\n`;
  rows.forEach(r => { csv += Array.from(r.querySelectorAll('td')).map((c,i)=>i===4?'':c.textContent).filter((_,i)=>i!==4).join(',') + '\n'; });
  csv += `\nGider Kalemleri\nKalem,Aylık,Dönem Toplam\n`;
  GK.forEach(g => { csv += `${g.ad},₺${fmt(g.tutar||0,2)},₺${fmt((g.tutar||0)*ay,2)}\n`; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
  a.download = 'isletme-projesi.csv';
  a.click();
}

function renderIslKayitli() {
  const tb = document.getElementById('isl-kayitli-tbody'); if (!tb) return;
  const dl = { esit:'Eşit', arsa:'Arsa Payı', oran:'Özel Oran' };
  if (!S.isletmeProjeler.length) { tb.innerHTML=`<tr><td colspan="8">${emp('','Kayıtlı proje yok')}</td></tr>`; return; }
  tb.innerHTML = S.isletmeProjeler.slice().reverse().map(p => `<tr>
    <td style="font-weight:600">${p.aptAd} – ${p.donem}</td>
    <td>${p.aptAd}</td>
    <td>${p.donem}</td>
    <td style="text-align:center"><span class="b b-bl">${p.ayCount||1}</span></td>
    <td style="font-weight:700;color:var(--err)">₺${fmt(p.toplam)}</td>
    <td><span class="b b-bl">${dl[p.dagitim]||'—'}</span></td>
    <td>${p.tarih}</td>
    <td><div class="act">
      <button class="btn bg xs" onclick="goIslDetay(${p.id})" title="Detay Görüntüle" style="color:var(--brand)"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      <button class="btn bg xs" onclick="loadIsl(${p.id})" title="Projeyi Yükle">📂 Yükle</button>
      <button class="act-btn rd" onclick="delIsl(${p.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
    </div></td>
  </tr>`).join('');
}

function loadIsl(id) {
  const p = S.isletmeProjeler.find(x => x.id === id); if (!p) return;
  _islDonemInitialized = false;
  goPage('isletme');
  setTimeout(() => {
    goTab('isl-yeni');
    // Set apartment
    if (p.aptId) {
      document.querySelector('input[name="isl-apt-mod"][value="kayitli"]').checked = true;
      islAptModeChange();
      document.getElementById('isl-apt').value = p.aptId;
      onIslApt();
    } else {
      document.querySelector('input[name="isl-apt-mod"][value="manuel"]').checked = true;
      islAptModeChange();
      document.getElementById('isl-apt-manuel').value = p.aptAd;
    }
    // Set period
    if (p.donemBas) document.getElementById('isl-donem-bas').value = p.donemBas;
    if (p.donemBit) document.getElementById('isl-donem-bit').value = p.donemBit;
    calcIslDonem();
    document.getElementById('isl-dag').value = p.dagitim;
    GK = p.giderler.map(g => ({...g}));
    GelirK = (p.gelirler || []).map(g => ({...g}));
    ISL_BLOKLAR = p.bloklar ? p.bloklar.map(b => ({...b, daireler:[...b.daireler]})) : ISL_BLOKLAR;
    ISL_ORANLAR = p.oranlar ? {...p.oranlar} : {};
    renderIslBloklar();
    renderGelirler();
    calcIsl();
    toast('Proje yüklendi.','ok');
  }, 100);
}

function delIsl(id) { if(!confirm('Proje silinsin mi?'))return; S.isletmeProjeler=S.isletmeProjeler.filter(p=>p.id!==id); save(); toast('Silindi.','warn'); renderIslKayitli(); }

let _currentIslDetayId = null;

function goIslDetay(id) {
  const p = S.isletmeProjeler.find(x => x.id === id); if (!p) return;
  _currentIslDetayId = id;
  if (!window._navRestoring) _navPush('isl-detay', id);
  window._navRestoring = true;
  renderIslDetay(p);
  goPage('isl-detay');
  window._navRestoring = false;
}

function renderIslDetay(p) {
  const ay = p.ayCount || 1;
  const giderAylik = p.toplam || 0;                        // aylık toplam gider
  const aidatAylik = p.aidatAylik != null                  // aylık aidat bazı
    ? p.aidatAylik
    : (p.gelirDahil ? Math.max(0, giderAylik - (p.gelirHaric||0)) : giderAylik);
  const hariçAylik = p.gelirHaric || 0;                    // aylık diğer gelirler
  const gelirAylik = aidatAylik + hariçAylik;              // toplam aylık gelir
  const giderTop   = giderAylik * ay;
  const gelirTop   = gelirAylik * ay;
  const net        = gelirTop - giderTop;
  const dl = { esit:'Eşit Dağılım', arsa:'Arsa Payı', oran:'Özel Oran' };

  // SVG bar chart for expenses
  const giderler = (p.giderler || []).filter(g => (g.tutar||0) > 0);
  const maxG = giderler.length ? Math.max(...giderler.map(g => g.tutar||0)) : 1;
  const colors = ['#1a56db','#06b6d4','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#15803d'];
  const barChart = giderler.length ? `
    <div style="padding:0 4px">
      ${giderler.map((g,i) => {
        const pct = Math.round(((g.tutar||0)/maxG)*100);
        return `<div style="margin-bottom:8px">
          <div class="fbc mb4" style="font-size:11.5px"><span style="color:var(--tx-2)">${g.ad}</span><span style="font-weight:700;color:${colors[i%colors.length]}">₺${fmt(g.tutar||0)} / ay</span></div>
          <div style="background:var(--bg-2);border-radius:4px;height:8px;overflow:hidden"><div style="height:100%;border-radius:4px;background:${colors[i%colors.length]};width:${pct}%;transition:width .6s"></div></div>
        </div>`;
      }).join('')}
    </div>` : '<div class="t3" style="padding:12px">Gider kalemi yok</div>';

  // SVG donut chart for gelir/gider
  const total = gelirTop + giderTop;
  const gelirPct = total > 0 ? (gelirTop/total)*100 : 50;
  const giderPct = total > 0 ? (giderTop/total)*100 : 50;
  const r = 50, cx = 60, cy = 60, stroke = 22;
  const circ = 2 * Math.PI * r;
  const gelirDash = (gelirPct/100)*circ;
  const giderOffset = gelirDash;
  const giderDash = (giderPct/100)*circ;

  // Income breakdown
  const gelirKalemler = [{ad:'Aidat Geliri', tutar: aidatAylik}, ...(p.gelirler||[]).filter(g=>(g.tutar||0)>0)];
  const gelirColors = ['#059669','#1a56db','#7c3aed','#d97706','#0891b2'];

  const dagRows = p.dagitimRows || [];

  const el = document.getElementById('isl-detay-content');
  if (!el) return;
  const denk = p.gelirDahil && hariçAylik > 0;
  el.innerHTML = `
    <!-- Başlık -->
    <div class="card mb16" style="background:linear-gradient(135deg,var(--brand),var(--accent));color:#fff;border:none">
      <div class="fbc mb4"><div>
        <div style="font-size:18px;font-weight:700;margin-bottom:4px">${p.aptAd}</div>
        <div style="font-size:13px;opacity:.88">${p.donem} · ${ay} Aylık Dönem · ${dl[p.dagitim]||p.dagitim}${denk?' · Denk Bütçe':''}</div>
      </div><div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div><div style="font-size:11px;opacity:.75;margin-bottom:2px">Proje Tarihi</div><div style="font-size:13px;font-weight:600">${p.tarih}</div></div>
        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;opacity:.9;white-space:nowrap" title="PDF çıktısında daire listesini göster/gizle">
          <input type="checkbox" id="isl-detay-pdf-liste" checked style="cursor:pointer"> PDF'e daire listesi ekle
        </label>
      </div></div>
    </div>

    <!-- 3 özet widget -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div class="card" style="border-left:3px solid var(--ok)">
        <div style="font-size:11px;color:var(--tx-3);margin-bottom:4px">Toplam Gelir</div>
        <div style="font-size:20px;font-weight:700;color:var(--ok)">₺${fmt(gelirTop)}</div>
        <div style="font-size:11px;color:var(--tx-3);margin-top:3px">Aylık: ₺${fmt(gelirAylik)}</div>
        ${hariçAylik > 0 ? `<div style="font-size:10.5px;color:var(--tx-3);margin-top:2px">Aidat: ₺${fmt(aidatAylik)} + Diğer: ₺${fmt(hariçAylik)}</div>` : ''}
      </div>
      <div class="card" style="border-left:3px solid var(--err)">
        <div style="font-size:11px;color:var(--tx-3);margin-bottom:4px">Toplam Gider</div>
        <div style="font-size:20px;font-weight:700;color:var(--err)">₺${fmt(giderTop)}</div>
        <div style="font-size:11px;color:var(--tx-3);margin-top:3px">Aylık: ₺${fmt(giderAylik)}</div>
        <div style="font-size:10.5px;color:var(--tx-3);margin-top:2px">${(p.giderler||[]).filter(g=>(g.tutar||0)>0).length} gider kalemi</div>
      </div>
      <div class="card" style="border-left:3px solid ${net>=0?'var(--ok)':'var(--err)'}">
        <div style="font-size:11px;color:var(--tx-3);margin-bottom:4px">Net Durum</div>
        <div style="font-size:20px;font-weight:700;color:${net>=0?'var(--ok)':'var(--err)'}">${net>=0?'+':''}₺${fmt(Math.abs(net))}</div>
        <div style="font-size:11px;color:var(--tx-3);margin-top:3px">${net>=0?'Fazla':'Açık'} · %${Math.round(Math.abs(net)/Math.max(giderTop,1)*100)}</div>
        ${denk ? `<div style="font-size:10.5px;color:var(--ok);margin-top:2px">Denk bütçe modeli</div>` : ''}
      </div>
    </div>

    <!-- Grafik kartları -->
    <div class="g2" style="gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="card-t mb12">💸 Gider Dağılımı</div>
        ${barChart}
        <div class="sep mt12"></div>
        <div class="fbc mt8"><span style="font-size:12px;color:var(--tx-2);font-weight:600">Aylık Toplam Gider</span><span style="font-weight:700;color:var(--err)">₺${fmt(giderAylik)}</span></div>
        <div class="fbc mt4"><span style="font-size:12px;color:var(--tx-2);font-weight:600">Dönem Toplam Gider</span><span style="font-weight:700;color:var(--err)">₺${fmt(giderTop)}</span></div>
      </div>
      <div class="card">
        <div class="card-t mb12">💰 Gelir / Gider Dengesi</div>
        <div style="display:flex;justify-content:center;margin-bottom:12px">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-2)" stroke-width="${stroke}"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ok)" stroke-width="${stroke}" stroke-dasharray="${gelirDash} ${circ}" stroke-dashoffset="${circ*0.25}" transform="rotate(-90 ${cx} ${cy})"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--err)" stroke-width="${stroke}" stroke-dasharray="${giderDash} ${circ}" stroke-dashoffset="${-(circ*(gelirPct/100)) + circ*0.25}" transform="rotate(-90 ${cx} ${cy})"/>
            <text x="${cx}" y="${cy-4}" text-anchor="middle" style="font-size:11px;fill:var(--tx-3)">Net</text>
            <text x="${cx}" y="${cy+10}" text-anchor="middle" style="font-size:12px;font-weight:700;fill:${net>=0?'#059669':'#dc2626'}">${net>=0?'+':''}${Math.round(net/Math.max(giderTop,1)*100)}%</text>
          </svg>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${gelirKalemler.map((g,i)=>`<div class="fbc" style="font-size:12px"><div class="fc g6"><div style="width:10px;height:10px;border-radius:2px;background:${gelirColors[i%gelirColors.length]}"></div><span>${g.ad}</span></div><span style="font-weight:700;color:${gelirColors[i%gelirColors.length]}">₺${fmt((g.tutar||0)*ay)}</span></div>`).join('')}
          <div class="sep mt4"></div>
          <div class="fbc" style="font-size:12px"><span style="font-weight:600">Toplam Gelir</span><span style="font-weight:700;color:var(--ok)">₺${fmt(gelirTop)}</span></div>
        </div>
      </div>
    </div>

    <!-- Aidat dağılım tablosu -->
    ${dagRows.length ? `<div class="card mb16">
      <div class="fbc mb12">
        <div class="card-t">🏠 Aidat Dağılım Tablosu</div>
        <span style="font-size:11px;color:var(--tx-3)">${dagRows.length} bağımsız bölüm · Aylık aidat tabanı: ₺${fmt(aidatAylik)}</span>
      </div>
      <div class="tw"><table>
        <thead><tr><th>Daire</th><th>Tür</th><th>Sakin</th><th>Blok</th><th>Aylık Aidat</th><th>Dönem Aidatı</th></tr></thead>
        <tbody>${dagRows.map(d=>`<tr><td>${d.daire}</td><td>${d.tur}</td><td>${d.sakin||'—'}</td><td>${d.blok||'—'}</td><td style="font-weight:700;color:var(--ok)">${d.aylikAidat}</td><td style="font-weight:700;color:var(--ok)">${d.donemAidat}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <!-- Gider kalemi detayı -->
    <div class="card">
      <div class="card-t mb12">📊 Gider Kalemi Detayı</div>
      <div class="tw"><table>
        <thead><tr><th>Kalem</th><th>Aylık (₺)</th><th>Toplam (₺)</th><th>Pay (%)</th></tr></thead>
        <tbody>${(p.giderler||[]).filter(g=>(g.tutar||0)>0).map((g,i)=>{
          const pp = giderAylik > 0 ? Math.round((g.tutar||0)/giderAylik*100) : 0;
          return `<tr><td><div class="fc g8"><div style="width:8px;height:8px;border-radius:2px;background:${colors[i%colors.length]}"></div>${g.ad}</div></td><td style="font-weight:700">₺${fmt(g.tutar||0)}</td><td style="font-weight:700;color:var(--err)">₺${fmt((g.tutar||0)*ay)}</td><td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;background:var(--bg-2);border-radius:3px;height:6px"><div style="height:100%;border-radius:3px;background:${colors[i%colors.length]};width:${pp}%"></div></div><span style="font-size:11px;color:var(--tx-3);min-width:28px">%${pp}</span></div></td></tr>`;
        }).join('')}
        <tr style="background:var(--s2)"><td><strong>TOPLAM</strong></td><td><strong style="color:var(--err)">₺${fmt(giderAylik)}</strong></td><td><strong style="color:var(--err)">₺${fmt(giderTop)}</strong></td><td></td></tr>
        </tbody>
      </table></div>
    </div>`;
}

// 
// DENETİM
// 
function autoKarar() {
 const ids = ['den-temizlik','den-guvenlik','den-teknik','den-cevre','den-altyapi'];
 const vals = ids.map(id=>parseFloat(document.getElementById(id).value)||0);
 document.getElementById('den-puan').value = Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*10);
}

function saveDen() {
 const apt = aptById(document.getElementById('den-apt').value);
 if (!apt) { toast('Apartman seçin!','err'); return; }
 const p = parseInt(document.getElementById('den-puan').value)||0;
 S.denetimler.push({
 id:Date.now(), aptId:apt.id, aptAd:apt.ad,
 tarih:document.getElementById('den-tarih').value,
 sonraki:document.getElementById('den-sonraki').value,
 denetci:document.getElementById('den-denetci').value,
 puan:p, temizlik:+document.getElementById('den-temizlik').value,
 guvenlik:+document.getElementById('den-guvenlik').value,
 teknik:+document.getElementById('den-teknik').value,
 cevre:+document.getElementById('den-cevre').value,
 altyapi:+document.getElementById('den-altyapi').value,
 notlar:document.getElementById('den-notlar').value,
 onlem:document.getElementById('den-onlem').value,
 durum:p>=80?'iyi':p>=60?'orta':'kotu'
 });
 save(); toast('Denetim raporu kaydedildi.','ok'); goTab('den-liste');
}

function renderDen() {
 const s = (document.getElementById('den-srch')?.value||'').toLowerCase();
 const f = document.getElementById('den-f')?.value||'';
 let list = S.denetimler;
 if (s) list = list.filter(d=>(d.aptAd+' '+(d.denetci||'')).toLowerCase().includes(s));
 if (f) list = list.filter(d=>d.durum===f);
 const tb = document.getElementById('den-tbody'); if (!tb) return;
 const clr = p => p>=80?'var(--ok)':p>=60?'var(--warn)':'var(--err)';
 if (!list.length) { tb.innerHTML=`<tr><td colspan="10">${emp('','Rapor yok')}</td></tr>`; return; }
 tb.innerHTML = list.slice().reverse().map(d=>`<tr> <td>${d.aptAd}</td><td>${d.tarih||'—'}</td><td>${d.denetci||'—'}</td> <td style="font-weight:700;color:${clr(d.temizlik*10)}">${d.temizlik||'—'}</td> <td style="font-weight:700;color:${clr(d.guvenlik*10)}">${d.guvenlik||'—'}</td> <td style="font-weight:700;color:${clr(d.teknik*10)}">${d.teknik||'—'}</td> <td><span style="font-family:'Fraunces',serif;font-size:14px;font-weight:700;color:${clr(d.puan)}">${d.puan}</span><span class="t3" style="font-size:9px">/100</span></td> <td><span class="b ${d.durum==='iyi'?'b-gr':d.durum==='orta'?'b-am':'b-rd'}">${d.durum==='iyi'?'İyi':d.durum==='orta'?'Orta':'Zayıf'}</span></td> <td>${d.sonraki||'—'}</td> <td><div class="act"><button class="btn bg xs" onclick="goDenDetay(${d.id})" title="Raporu Görüntüle" style="color:var(--brand)"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button><button class="act-btn rd" onclick="delDen(${d.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></div></td> </tr>`).join('');
}
function delDen(id) { S.denetimler=S.denetimler.filter(d=>d.id!==id); save(); toast('Silindi.','warn'); renderDen(); }

let _currentDenDetayId = null;

function goDenDetay(id) {
  const d = S.denetimler.find(x => x.id === id); if (!d) return;
  _currentDenDetayId = id;
  if (!window._navRestoring) _navPush('den-detay', id);
  window._navRestoring = true;
  renderDenDetay(d);
  goPage('den-detay');
  window._navRestoring = false;
}

function renderDenDetay(d) {
  const el = document.getElementById('den-detay-content'); if (!el) return;
  const clr = p => p>=80?'#059669':p>=60?'#d97706':'#dc2626';
  const clrVar = p => p>=80?'var(--ok)':p>=60?'var(--warn)':'var(--err)';
  const durumRenk = d.durum==='iyi'?'#059669':d.durum==='orta'?'#d97706':'#dc2626';
  const durumLbl  = d.durum==='iyi'?'İyi':d.durum==='orta'?'Orta':'Zayıf';

  // Kriter puanları (bar chart)
  const kriterler = [
    { ad:'Temizlik',  puan: d.temizlik||0 },
    { ad:'Güvenlik',  puan: d.guvenlik||0 },
    { ad:'Teknik',    puan: d.teknik||0   },
    { ad:'Çevre Düzeni', puan: d.cevre||0 },
    { ad:'Altyapı',   puan: d.altyapi||0  },
  ];
  const genelPuan = d.puan || 0;
  const kriterRenkleri = ['#1a56db','#059669','#7c3aed','#0891b2','#d97706'];

  const barChart = kriterler.map((k,i) => {
    const pct = k.puan * 10;
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:12px;color:var(--tx-2)">${k.ad}</span>
        <span style="font-size:12px;font-weight:700;color:${clr(pct)}">${k.puan}<span style="font-size:10px;color:var(--tx-3)">/10</span></span>
      </div>
      <div style="background:var(--s2);border-radius:4px;height:9px;overflow:hidden">
        <div style="height:100%;border-radius:4px;background:${kriterRenkleri[i]};width:${pct}%;transition:width .5s"></div>
      </div>
    </div>`;
  }).join('');

  // Radar / SVG pentagon benzeri görselleştirme — basit donut
  const ort = kriterler.reduce((s,k)=>s+k.puan,0)/kriterler.length;
  const r=50, cx=60, cy=60, stroke=20, circ=2*Math.PI*r;
  const pct = (genelPuan/100)*circ;

  el.innerHTML = `
    <!-- Başlık banner -->
    <div class="card mb16" style="background:linear-gradient(135deg,${durumRenk},${durumRenk}cc);color:#fff;border:none">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-size:18px;font-weight:700;margin-bottom:4px">${d.aptAd}</div>
          <div style="font-size:13px;opacity:.88">Denetim Tarihi: ${d.tarih||'—'} · Denetçi: ${d.denetci||'—'}</div>
          ${d.sonraki ? `<div style="font-size:12px;opacity:.8;margin-top:3px">Sonraki Denetim: ${d.sonraki}</div>` : ''}
        </div>
        <div style="text-align:center">
          <div style="font-size:42px;font-weight:900;line-height:1">${genelPuan}</div>
          <div style="font-size:12px;opacity:.85">/100 · ${durumLbl}</div>
        </div>
      </div>
    </div>

    <!-- 5 kriter widget -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">
      ${kriterler.map((k,i)=>`
      <div class="card" style="text-align:center;border-top:3px solid ${kriterRenkleri[i]};padding:10px 8px">
        <div style="font-size:10px;color:var(--tx-3);margin-bottom:4px">${k.ad}</div>
        <div style="font-size:22px;font-weight:800;color:${clr(k.puan*10)}">${k.puan}</div>
        <div style="font-size:10px;color:var(--tx-3)">/10</div>
      </div>`).join('')}
    </div>

    <!-- Grafik + Kriter Detay -->
    <div class="g2" style="gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="card-t mb12">📊 Kriter Puanları</div>
        ${barChart}
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;font-weight:600;color:var(--tx-2)">Ortalama Kriter Puanı</span>
          <span style="font-size:14px;font-weight:700;color:${clrVar(ort*10)}">${ort.toFixed(1)}/10</span>
        </div>
      </div>
      <div class="card">
        <div class="card-t mb12">🎯 Genel Değerlendirme</div>
        <div style="display:flex;justify-content:center;margin-bottom:16px">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--s2)" stroke-width="${stroke}"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${durumRenk}" stroke-width="${stroke}"
              stroke-dasharray="${pct} ${circ}" stroke-dashoffset="${circ*0.25}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>
            <text x="${cx}" y="${cy-6}" text-anchor="middle" style="font-size:10px;fill:var(--tx-3)">Genel Puan</text>
            <text x="${cx}" y="${cy+12}" text-anchor="middle" style="font-size:18px;font-weight:900;fill:${durumRenk}">${genelPuan}</text>
          </svg>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;padding:7px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span>Denetim Sonucu</span>
            <span class="b ${d.durum==='iyi'?'b-gr':d.durum==='orta'?'b-am':'b-rd'}" style="font-size:11px">${durumLbl}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:7px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span>Denetçi</span><strong>${d.denetci||'—'}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:7px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span>Denetim Tarihi</span><strong>${d.tarih||'—'}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:7px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span>Sonraki Denetim</span><strong>${d.sonraki||'—'}</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- Tespitler & Önlemler -->
    ${(d.notlar||d.onlem) ? `<div class="g2" style="gap:16px;margin-bottom:16px">
      ${d.notlar ? `<div class="card">
        <div class="card-t mb8">📋 Tespitler & Notlar</div>
        <div style="font-size:13px;color:var(--tx-2);line-height:1.6;white-space:pre-wrap">${d.notlar}</div>
      </div>` : ''}
      ${d.onlem ? `<div class="card">
        <div class="card-t mb8">✅ Alınacak Önlemler</div>
        <div style="font-size:13px;color:var(--tx-2);line-height:1.6;white-space:pre-wrap">${d.onlem}</div>
      </div>` : ''}
    </div>` : ''}

    <!-- Tüm kriterler tablo -->
    <div class="card">
      <div class="card-t mb12">📝 Kriter Puanları Tablosu</div>
      <div class="tw"><table>
        <thead><tr><th>Kriter</th><th style="text-align:center">Puan (0–10)</th><th style="text-align:center">100 Üzerinden</th><th>Durum</th></tr></thead>
        <tbody>
          ${kriterler.map(k=>`<tr>
            <td style="font-weight:600">${k.ad}</td>
            <td style="text-align:center;font-weight:700;color:${clr(k.puan*10)}">${k.puan}/10</td>
            <td style="text-align:center;font-weight:700;color:${clr(k.puan*10)}">${k.puan*10}</td>
            <td><span class="b ${k.puan>=8?'b-gr':k.puan>=6?'b-am':'b-rd'}" style="font-size:10px">${k.puan>=8?'İyi':k.puan>=6?'Orta':'Zayıf'}</span></td>
          </tr>`).join('')}
          <tr style="background:var(--s2)">
            <td><strong>GENEL PUAN</strong></td>
            <td style="text-align:center"><strong style="color:${clr(genelPuan)}">${(genelPuan/10).toFixed(1)}/10</strong></td>
            <td style="text-align:center"><strong style="color:${clr(genelPuan)}">${genelPuan}</strong></td>
            <td><span class="b ${d.durum==='iyi'?'b-gr':d.durum==='orta'?'b-am':'b-rd'}" style="font-size:10px">${durumLbl}</span></td>
          </tr>
        </tbody>
      </table></div>
    </div>`;
}

async function genDen() {
 const out = document.getElementById('den-ai-out');
 out.innerHTML = '<div class="lds"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span style="margin-left:4px">Analiz ediliyor…</span></div>';
 const apt = aptById(document.getElementById('den-apt').value);
 const scores = `Temizlik:${document.getElementById('den-temizlik').value||0}/10, Güvenlik:${document.getElementById('den-guvenlik').value||0}/10, Teknik:${document.getElementById('den-teknik').value||0}/10, Çevre:${document.getElementById('den-cevre').value||0}/10, Altyapı:${document.getElementById('den-altyapi').value||0}/10`;
 try {
 const r = await callAI(`Apartman denetim raporu:\nApartman: ${apt?.ad||'—'}\nPuanlar: ${scores}\nGenel Puan: ${document.getElementById('den-puan').value}/100\nTespitler: ${document.getElementById('den-notlar').value||'—'}\n\nKısa ve pratik değerlendirme: güçlü yönler, iyileştirme gereken alanlar, öncelikli aksiyonlar. Türkçe yaz.`);
 out.textContent = r;
 } catch(e) { out.textContent = 'API bağlantı hatası.'; }
}

// 
// ASANSÖR
// 
function setArizaKatIco() {
  const kat = document.getElementById('arz-kat')?.value || 'diger';
  const katIco = {elektrik:'⚡',su:'💧',asansor:'🔼',cati:'🏠',guvenlik:'🔒',temizlik:'🧹',diger:'🔩'};
  const icoEl = document.getElementById('arz-kat-ico');
  if (icoEl) icoEl.textContent = katIco[kat] || '🔩';
}

function calcAsanSonraki() {
 const et = document.getElementById('asan-et').value; if (!et) return;
 const months = parseInt(document.getElementById('asan-sure').value)||12;
 const d = new Date(et); d.setMonth(d.getMonth()+months);
 document.getElementById('asan-st').value = d.toISOString().split('T')[0];
}

function addAsan() {
  const apt = aptById(document.getElementById('asan-apt').value);
  if (!apt) { toast('Apartman seçin!','err'); return; }
  const et = document.getElementById('asan-et').value;
  const st = document.getElementById('asan-st').value;
  if (!et||!st) { toast('Tarihleri girin!','err'); return; }
  const blokAd = document.getElementById('asan-blok').value || '—';
  const asanNo = document.getElementById('asan-no').value;
  if (!asanNo) { toast('Asansör numarasını seçin!','err'); return; }
  const bolum = document.getElementById('asan-bolum').value;
  S.asansorler.push({
    id:Date.now(), aptId:apt.id, aptAd:apt.ad,
    blok: blokAd,
    asansorNo: asanNo,
    bolum: bolum,
    firma:document.getElementById('asan-firma').value,
    etiketTarih:et, sonTarih:st
  });
  save();
  ['asan-bolum','asan-firma','asan-et','asan-st'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('asan-no').innerHTML = '<option value="">— Asansör Seçin —</option>';
  toast('Asansör kaydedildi.','ok');
}

function renderAsan() {
  const s = (document.getElementById('asan-srch')?.value||'').toLowerCase();
  const f = document.getElementById('asan-f')?.value||'';
  let list = S.asansorler;
  if (s) list = list.filter(a => (a.aptAd + ' ' + (a.blok||'') + ' ' + (a.bolum||'')).toLowerCase().includes(s));
  let g=0, y=0, dd=0;
  S.asansorler.forEach(a => { const d=dayDiff(a.sonTarih); if(d<0)dd++; else if(d<30)y++; else g++; });
  document.getElementById('asan-gecerli').textContent = g;
  document.getElementById('asan-yakin').textContent = y;
  document.getElementById('asan-dolmus').textContent = dd;
  if (f) list = list.filter(a => {
    const d = dayDiff(a.sonTarih);
    if (f==='gecerli') return d >= 30;
    if (f==='yakin')   return d >= 0 && d < 30;
    if (f==='dolmus')  return d < 0;
    return true;
  });
  // Apartmana ve bloğa göre grupla
  const fApt = (document.getElementById('asan-f-apt')?.value || '');
  if (fApt) list = list.filter(a => String(a.aptId) === String(fApt));

  const tb = document.getElementById('asan-tbody');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="9">' + emp('', 'Kayıt yok') + '</td></tr>'; return; }

  tb.innerHTML = list.map(function(a) {
    const d   = dayDiff(a.sonTarih);
    const cls = d < 0 ? 'b-rd' : d < 30 ? 'b-am' : 'b-gr';
    const lbl = d < 0 ? 'Süresi Doldu' : d < 30 ? 'Yakında' : 'Geçerli';
    const blokLabel = a.blok && a.blok !== '—' ? a.blok : '—';
    const asanLabel = a.asansorNo
      ? (a.blok && a.blok !== '—' ? a.blok + ' / Asansör ' + a.asansorNo : 'Asansör ' + a.asansorNo)
      : (a.bolum || '—');
    const notLabel  = a.bolum ? '<div style="font-size:10.5px;color:var(--tx-3);margin-top:2px">' + a.bolum + '</div>' : '';
    return '<tr>'
      + '<td>' + a.aptAd + '</td>'
      + '<td><span class="b b-pu" style="font-size:10px">' + blokLabel + '</span></td>'
      + '<td><span style="font-weight:600">' + asanLabel + '</span>' + notLabel + '</td>'
      + '<td>' + (a.firma || '—') + '</td>'
      + '<td style="font-family:monospace;font-size:12px">' + a.etiketTarih + '</td>'
      + '<td style="font-family:monospace;font-size:12px">' + a.sonTarih + '</td>'
      + '<td style="font-weight:700;color:' + (d<0?'var(--err)':d<30?'var(--warn)':'var(--ok)') + ';font-family:monospace;font-size:12px">'
      + (d < 0 ? Math.abs(d) + ' gün geçti' : d + ' gün kaldı') + '</td>'
      + '<td><span class="b ' + cls + '">' + lbl + '</span></td>'
      + '<td><div class="act"><button class="btn bg xs" onclick="goAsanDetay(' + a.id + ')" title="Detay Görüntüle" style="color:var(--brand)"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button><button class="act-btn rd" onclick="delAsan(' + a.id + ')" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></div></td>'
      + '</tr>';
  }).join('');
}
function delAsan(id) { S.asansorler=S.asansorler.filter(a=>a.id!==id); save(); toast('Silindi.','warn'); renderAsan(); }

let _currentAsanDetayId = null;

function goAsanDetay(id) {
  const a = S.asansorler.find(x => x.id === id); if (!a) return;
  _currentAsanDetayId = id;
  if (!window._navRestoring) _navPush('asan-detay', id);
  window._navRestoring = true;
  renderAsanDetay(a);
  goPage('asan-detay');
  window._navRestoring = false;
}

function renderAsanDetay(a) {
  const el = document.getElementById('asan-detay-content'); if (!el) return;
  const d     = dayDiff(a.sonTarih);
  const gecti = d < 0;
  const yakin = d >= 0 && d < 30;
  const durum = gecti ? 'Süresi Doldu' : yakin ? 'Yakında Dolacak' : 'Geçerli';
  const renk  = gecti ? '#dc2626' : yakin ? '#d97706' : '#059669';
  const renkVar = gecti ? 'var(--err)' : yakin ? 'var(--warn)' : 'var(--ok)';
  const bdgCls  = gecti ? 'b-rd' : yakin ? 'b-am' : 'b-gr';
  const asanLabel = a.asansorNo
    ? (a.blok && a.blok !== '—' ? a.blok + ' / Asansör ' + a.asansorNo : 'Asansör ' + a.asansorNo)
    : (a.bolum || '—');

  // Süre hesapla
  const etiketDate = new Date(a.etiketTarih);
  const sonDate    = new Date(a.sonTarih);
  const toplamGun  = Math.round((sonDate - etiketDate) / 86400000);
  const gecenGun   = Math.round((new Date() - etiketDate) / 86400000);
  const kalan      = Math.max(0, toplamGun - gecenGun);
  const ilerlemePct = toplamGun > 0 ? Math.min(100, Math.round((gecenGun / toplamGun) * 100)) : 0;
  const ilerlemeRenk = ilerlemePct >= 100 ? '#dc2626' : ilerlemePct >= 80 ? '#d97706' : '#059669';

  el.innerHTML = `
    <!-- Banner -->
    <div class="card mb16" style="background:linear-gradient(135deg,${renk},${renk}cc);color:#fff;border:none">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-size:18px;font-weight:700;margin-bottom:4px">${a.aptAd}</div>
          <div style="font-size:13px;opacity:.88">${asanLabel}${a.bolum ? ' · ' + a.bolum : ''}</div>
          <div style="font-size:12px;opacity:.8;margin-top:4px">Bakım Firması: ${a.firma || '—'}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:38px;font-weight:900;line-height:1">${Math.abs(d)}</div>
          <div style="font-size:12px;opacity:.85">${gecti ? 'gün geçti' : 'gün kaldı'}</div>
          <div style="font-size:11px;opacity:.75;margin-top:2px">${durum}</div>
        </div>
      </div>
    </div>

    <!-- 4 özet widget -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
      <div class="card" style="text-align:center;border-top:3px solid ${renk}">
        <div style="font-size:10px;color:var(--tx-3);margin-bottom:4px">Durum</div>
        <span class="b ${bdgCls}" style="font-size:11px">${durum}</span>
      </div>
      <div class="card" style="text-align:center;border-top:3px solid #1a56db">
        <div style="font-size:10px;color:var(--tx-3);margin-bottom:4px">Toplam Süre</div>
        <div style="font-size:18px;font-weight:700;color:#1a56db">${toplamGun}</div>
        <div style="font-size:10px;color:var(--tx-3)">gün</div>
      </div>
      <div class="card" style="text-align:center;border-top:3px solid #7c3aed">
        <div style="font-size:10px;color:var(--tx-3);margin-bottom:4px">Geçen Süre</div>
        <div style="font-size:18px;font-weight:700;color:#7c3aed">${Math.min(gecenGun,toplamGun)}</div>
        <div style="font-size:10px;color:var(--tx-3)">gün</div>
      </div>
      <div class="card" style="text-align:center;border-top:3px solid ${ilerlemeRenk}">
        <div style="font-size:10px;color:var(--tx-3);margin-bottom:4px">Tüketim</div>
        <div style="font-size:18px;font-weight:700;color:${ilerlemeRenk}">%${ilerlemePct}</div>
        <div style="font-size:10px;color:var(--tx-3)">ilerleme</div>
      </div>
    </div>

    <!-- İlerleme çubuğu + Bilgi kartı -->
    <div class="g2" style="gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="card-t mb12">📅 Süre İlerlemesi</div>
        <div style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tx-3);margin-bottom:6px">
            <span>Etiket Tarihi: <strong style="color:var(--tx)">${a.etiketTarih}</strong></span>
            <span>Son Tarihi: <strong style="color:var(--tx)">${a.sonTarih}</strong></span>
          </div>
          <div style="background:var(--s2);border-radius:6px;height:16px;overflow:hidden;position:relative">
            <div style="height:100%;border-radius:6px;background:${ilerlemeRenk};width:${ilerlemePct}%;transition:width .6s"></div>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;mix-blend-mode:difference">%${ilerlemePct}</div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tx-3);margin-top:6px">
            <span>${gecenGun} gün geçti</span>
            <span>${gecti ? Math.abs(d)+' gün önce doldu' : kalan+' gün kaldı'}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;padding:7px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span>Etiket (Muayene) Tarihi</span><strong>${a.etiketTarih}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:7px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span>Son Geçerlilik Tarihi</span><strong style="color:${renkVar}">${a.sonTarih}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:7px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span>Kalan / Geçen</span>
            <strong style="color:${renkVar}">${gecti ? Math.abs(d)+' gün geçti' : d+' gün kaldı'}</strong>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-t mb12">🏢 Asansör Bilgileri</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span style="color:var(--tx-3)">Apartman</span><strong>${a.aptAd}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span style="color:var(--tx-3)">Blok</span><strong>${a.blok && a.blok !== '—' ? a.blok : '—'}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span style="color:var(--tx-3)">Asansör No</span><strong>${a.asansorNo || '—'}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span style="color:var(--tx-3)">Tanım / Bölüm</span><strong>${a.bolum || '—'}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--s2);border-radius:6px;font-size:12px">
            <span style="color:var(--tx-3)">Bakım Firması</span><strong>${a.firma || '—'}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 10px;background:${renk}18;border-radius:6px;font-size:12px;border:1px solid ${renk}44">
            <span style="color:var(--tx-3)">Etiket Durumu</span>
            <span class="b ${bdgCls}" style="font-size:11px">${durum}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Uyarı / Bilgi kutusu -->
    ${gecti ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:10px;font-size:13px;color:#dc2626">
      <span style="font-size:20px">⚠️</span>
      <div><strong>Etiket süresi doldu!</strong> Bu asansörün periyodik kontrol etiketi ${Math.abs(d)} gün önce sona erdi. Yetkili bir firma ile yenilenmesi gerekmektedir.</div>
    </div>` : yakin ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:10px;font-size:13px;color:#92400e">
      <span style="font-size:20px">⏰</span>
      <div><strong>Süre dolmak üzere!</strong> Bu asansörün periyodik kontrol etiketi ${d} gün içinde sona erecek. Bakım firmasıyla iletişime geçin.</div>
    </div>` : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:10px;font-size:13px;color:#15803d">
      <span style="font-size:20px">✅</span>
      <div><strong>Etiket geçerli.</strong> Periyodik kontrol etiketi ${d} gün daha geçerlidir.</div>
    </div>`}`;
}

// 
// TEKLİFLER
// 
function calcKdv() {
 const t=parseFloat(document.getElementById('tek-tutar').value)||0;
 const kdv=parseInt(document.getElementById('tek-kdv').value)||0;
 document.getElementById('tek-kdvli').value = kdv>0 ? '₺'+fmt(t*(1+kdv/100),2) : '—';
}

function saveTek() {
 const apt = aptById(document.getElementById('tek-apt').value);
 if (!apt) { toast('Apartman seçin!','err'); return; }
 const konu = document.getElementById('tek-konu').value.trim();
 if (!konu) { toast('Konu zorunlu!','err'); return; }
 const tutar = parseFloat(document.getElementById('tek-tutar').value)||0;
 const kdv = parseInt(document.getElementById('tek-kdv').value)||0;
 S.teklifler.push({
 id:Date.now(), no:'TKL-'+(tNo++), aptId:apt.id, aptAd:apt.ad, konu,
 firma:document.getElementById('tek-firma').value, tutar, kdv,
 tutarKdvli:tutar*(1+kdv/100),
 tarih:document.getElementById('tek-tarih').value,
 gecerli:document.getElementById('tek-gecerli').value,
 aciklama:document.getElementById('tek-aciklama').value,
 durum:'bekliyor'
 });
 save(); goTab('tek-liste');
 toast('Teklif kaydedildi.','ok');
}

function renderTek() {
 const s=(document.getElementById('tek-srch')?.value||'').toLowerCase();
 const f=document.getElementById('tek-f')?.value||'';
 const fa=document.getElementById('tek-f-apt')?.value||'';
 let list=S.teklifler;
 if(s)list=list.filter(t=>(t.konu+' '+(t.firma||'')+' '+t.aptAd).toLowerCase().includes(s));
 if(f)list=list.filter(t=>t.durum===f);
 if(fa)list=list.filter(t=>t.aptId==fa);
 const tb=document.getElementById('tek-tbody'); if(!tb)return;
 const dc={bekliyor:'b-am',onaylandi:'b-gr',reddedildi:'b-rd'};
 const dl={bekliyor:'Bekliyor',onaylandi:'Onaylandı',reddedildi:'Reddedildi'};
 if(!list.length){tb.innerHTML=`<tr><td colspan="10">${emp('','Teklif yok')}</td></tr>`;return;}
 tb.innerHTML=list.slice().reverse().map(t=>`<tr> <td>${t.no}</td><td>${t.aptAd}</td><td>${t.konu}</td><td>${t.firma||'—'}</td> <td style="font-weight:700;color:var(--ok)">₺${fmt(t.tutar)}</td> <td>₺${fmt(t.tutarKdvli||t.tutar)}</td> <td>${t.tarih||'—'}</td><td>${t.gecerli||'—'}</td> <td><span class="b ${dc[t.durum]||'b-gy'}">${dl[t.durum]||t.durum}</span></td> <td><div class="act">${t.durum==='bekliyor'?`<button class="btn bgn xs" onclick="setTek(${t.id},'onaylandi')" title="Onayla">✓ Onayla</button><button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="setTek(${t.id},'reddedildi')" title="Reddet">✕ Reddet</button>`:''}<button class="act-btn rd" onclick="delTek(${t.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></div></td> </tr>`).join('');
}
function setTek(id,s){const t=S.teklifler.find(x=>x.id===id);if(t){t.durum=s;save();toast(s==='onaylandi'?'Onaylandı!':'Reddedildi.', s==='onaylandi'?'ok':'warn');}}
function delTek(id){S.teklifler=S.teklifler.filter(t=>t.id!==id);save();toast('Silindi.','warn');}

function renderKarsil() {
 const fa=document.getElementById('kar-f-apt')?.value||'';
 const fk=(document.getElementById('kar-f-konu')?.value||'').toLowerCase();
 let list=S.teklifler;
 if(fa)list=list.filter(t=>t.aptId==fa);
 if(fk)list=list.filter(t=>t.konu.toLowerCase().includes(fk));
 const c=document.getElementById('karsil-content'); if(!c)return;
 if(!list.length){c.innerHTML=emp('️','Karşılaştırılacak teklif yok');return;}
 const grouped={};
 list.forEach(t=>{if(!grouped[t.konu])grouped[t.konu]=[];grouped[t.konu].push(t);});
 c.innerHTML=Object.entries(grouped).map(([kn,tekler])=>{
 const sorted=[...tekler].sort((a,b)=>a.tutar-b.tutar);
 const minT=sorted[0];
 return `<div class="card mb16"><div class="card-t mb12"> ${kn} <span class="b b-bl">${tekler.length} teklif</span></div> <div class="tw"><table><thead><tr><th>Apartman</th><th>Firma</th><th>Tutar</th><th>KDV'li</th><th>Geçerlilik</th><th>Durum</th></tr></thead> <tbody>${sorted.map(t=>`<tr style="${t.id===minT.id?'background:var(--ok-bg)':''}"> <td>${t.aptAd}</td><td>${t.firma||'—'}</td> <td style="font-weight:700;color:var(--ok)">₺${fmt(t.tutar)}${t.id===minT.id?' ':''}</td> <td>₺${fmt(t.tutarKdvli||t.tutar)}</td><td>${t.gecerli||'—'}</td> <td><span class="b ${t.durum==='onaylandi'?'b-gr':t.durum==='reddedildi'?'b-rd':'b-am'}">${t.durum==='onaylandi'?'Onaylandı':t.durum==='reddedildi'?'Reddedildi':'Bekliyor'}</span></td> </tr>`).join('')}</tbody></table></div></div>`;
 }).join('');
}

// 
// GÖREVLER
// 
function openGovModal(id=null) {
 editId=id;
 document.getElementById('mod-gov-title').textContent = id?'️ Görev Düzenle':' Yeni Görev';
 // Personel select'i doldur
 const perSel = document.getElementById('gov-atanan');
 const aktifPer = (S.personel||[]).filter(p=>p.durum!=='pasif');
 perSel.innerHTML = '<option value="">— Personel Seçin —</option>' +
   aktifPer.map(p=>`<option value="${p.id}">${p.ad}${p.gorev?' — '+(perGorevLbl[p.gorev]||p.gorev):''}</option>`).join('');
 if (id) {
 const g=S.gorevler.find(x=>x.id===id);
 document.getElementById('gov-baslik').value=g.baslik;
 document.getElementById('gov-apt').value=g.aptId||'';
 document.getElementById('gov-kat').value=g.kat||'bakim';
 perSel.value=g.atananId||'';
 document.getElementById('gov-oncelik').value=g.oncelik;
 document.getElementById('gov-bas').value=g.bas||'';
 document.getElementById('gov-son').value=g.son||'';
 document.getElementById('gov-aciklama').value=g.aciklama||'';
 } else {
 perSel.value='';
 ['gov-baslik','gov-aciklama','gov-bas','gov-son'].forEach(fid=>document.getElementById(fid).value='');
 document.getElementById('gov-oncelik').value='normal';
 document.getElementById('gov-kat').value='bakim';
 document.getElementById('gov-apt').value='';
 }
 openModal('mod-gov');
}

function saveGov() {
 const b=document.getElementById('gov-baslik').value.trim();
 if (!b){toast('Başlık zorunlu!','err');return;}
 const perSel=document.getElementById('gov-atanan');
 const atananId=perSel.value;
 if (!atananId){toast('Lütfen atanacak personeli seçin.','err');return;}
 const per=(S.personel||[]).find(p=>p.id==atananId)||{};
 const apt=aptById(document.getElementById('gov-apt').value);
 const eskiAtananId=editId?S.gorevler.find(x=>x.id===editId)?.atananId:null;
 const gov={
 id:editId||Date.now(), baslik:b, aptId:apt?.id||null, aptAd:apt?.ad||'—',
 kat:document.getElementById('gov-kat').value,
 atanan:per.ad||'', atananId:per.id||null,
 oncelik:document.getElementById('gov-oncelik').value,
 bas:document.getElementById('gov-bas').value,
 son:document.getElementById('gov-son').value,
 aciklama:document.getElementById('gov-aciklama').value,
 durum:editId?S.gorevler.find(x=>x.id===editId)?.durum||'bekliyor':'bekliyor',
 ilerleme:editId?S.gorevler.find(x=>x.id===editId)?.ilerleme||0:0
 };
 if (editId){const i=S.gorevler.findIndex(x=>x.id===editId);if(i>=0)S.gorevler[i]=gov;}
 else S.gorevler.push(gov);
 // Bildirim: yeni görev veya atanan değiştiyse
 if (!S.gorevBildirimleri) S.gorevBildirimleri=[];
 if (!editId || (editId && eskiAtananId!=per.id)) {
   S.gorevBildirimleri.push({
     id:Date.now(), govId:gov.id, baslik:b,
     atananId:per.id, atananAd:per.ad||'',
     aptAd:apt?.ad||'', oncelik:gov.oncelik,
     tarih:new Date().toISOString().slice(0,10),
     okundu:false
   });
 }
 save();closeModal('mod-gov');
 toast((editId?'Görev güncellendi':'Görev eklendi')+' — '+per.ad+' bildirim aldı.','ok');
 updateNotifDot();
}

function renderGov() {
 const s=(document.getElementById('gov-srch')?.value||'').toLowerCase();
 const fd=document.getElementById('gov-f-durum')?.value||'';
 const fo=document.getElementById('gov-f-oncelik')?.value||'';
 const fa=document.getElementById('gov-f-apt')?.value||'';
 let list=S.gorevler;
 if(s)list=list.filter(g=>(g.baslik+' '+(g.atanan||'')).toLowerCase().includes(s));
 if(fd)list=list.filter(g=>g.durum===fd);
 if(fo)list=list.filter(g=>g.oncelik===fo);
 if(fa)list=list.filter(g=>g.aptId==fa);
 const bek=S.gorevler.filter(g=>g.durum==='bekliyor').length;
 const dev=S.gorevler.filter(g=>g.durum==='devam').length;
 const tam=S.gorevler.filter(g=>g.durum==='tamamlandi').length;
 document.getElementById('gov-stats').innerHTML=`<span class="b b-am">${bek} Bekliyor</span><span class="b b-bl">${dev} Devam</span><span class="b b-gr">${tam} Tamamlandı</span>`;
 const tb=document.getElementById('gov-tbody'); if(!tb)return;
 const dCls={bekliyor:'b-am',devam:'b-bl',tamamlandi:'b-gr'};
 const dLbl={bekliyor:'Bekliyor',devam:'Devam',tamamlandi:'Tamamlandı'};
 const kIco={bakim:'',temizlik:'',guvenlik:'',idari:'',mali:'',diger:''};
 if(!list.length){tb.innerHTML=`<tr><td colspan="8">${emp('','Görev yok')}</td></tr>`;return;}
 tb.innerHTML=list.slice().reverse().map(g=>`<tr> <td><div class="fc g8"><span>${kIco[g.kat]||''}</span><div><div style="font-weight:700;font-size:12.5px">${g.baslik}</div>${g.aciklama?`<div class="t3" style="font-size:10.5px">${g.aciklama.slice(0,50)}${g.aciklama.length>50?'…':''}</div>`:''}</div></div></td> <td>${g.aptAd||'—'}</td> <td>${g.atanan||'—'}</td> <td><span class="b ${onBadge(g.oncelik)}">${g.oncelik}</span></td> <td>${g.son?`<span style="color:${dayDiff(g.son)<0?'var(--err)':dayDiff(g.son)<3?'var(--warn)':'var(--tx-2)'}">${g.son}</span>`:'—'}</td> <td><span class="b ${dCls[g.durum]||'b-gy'}">${dLbl[g.durum]||g.durum}</span></td> <td> <div class="prog" style="min-width:55px"><div class="prog-fill" style="width:${g.ilerleme||0}%;background:${g.durum==='tamamlandi'?'var(--ok)':'var(--brand)'}"></div></div> <div class="t3" style="font-size:9.5px;margin-top:2px">${g.ilerleme||0}%</div> </td> <td><div class="act"><button class="act-btn" onclick="openGovDetay(${g.id})" title="Görüntüle"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button><button class="btn bg sm" onclick="openGovModal(${g.id})" title="Düzenle">✏️ Düzenle</button><button class="btn bg sm" onclick="openIlerleme(${g.id})" title="İlerleme Güncelle">📊 İlerleme</button><button class="act-btn rd" onclick="delGov(${g.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></div></td> </tr>`).join('');
}

let govDetayId = null;
function openGovDetay(id) {
  govDetayId = id;
  const g = S.gorevler.find(x=>x.id===id);
  if (!g) return;
  const dCls = {bekliyor:'b-am', devam:'b-bl', tamamlandi:'b-gr'};
  const dLbl = {bekliyor:'Bekliyor', devam:'Devam Ediyor', tamamlandi:'Tamamlandı'};
  const kLbl = {bakim:'Bakım / Onarım', temizlik:'Temizlik', guvenlik:'Güvenlik', idari:'İdari', mali:'Mali', diger:'Diğer'};
  const per = (S.personel||[]).find(p=>p.id==g.atananId);
  const kalanGun = g.son ? dayDiff(g.son) : null;
  const tarihRenk = kalanGun===null ? 'var(--tx-2)' : kalanGun<0 ? 'var(--err)' : kalanGun<3 ? 'var(--warn)' : 'var(--ok)';
  const tarihMsj = kalanGun===null ? '' : kalanGun<0 ? `${Math.abs(kalanGun)} gün gecikmiş` : kalanGun===0 ? 'Bugün bitiyor' : `${kalanGun} gün kaldı`;
  const pct = g.ilerleme||0;
  const pctColor = g.durum==='tamamlandi' ? 'var(--ok)' : pct>60 ? 'var(--brand)' : pct>30 ? 'var(--warn)' : 'var(--err)';
  document.getElementById('mod-gov-detay-body').innerHTML = `
    <div style="padding:0 0 4px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px">
        <div style="flex:1;min-width:0">
          <div style="font-size:17px;font-weight:700;color:var(--tx);line-height:1.35;margin-bottom:10px">${g.baslik}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="b ${dCls[g.durum]||'b-gy'}">${dLbl[g.durum]||g.durum}</span>
            <span class="b ${onBadge(g.oncelik)}">${g.oncelik}</span>
            <span class="b b-gy">${kLbl[g.kat]||g.kat||'—'}</span>
            ${g.aptAd&&g.aptAd!=='—'?`<span class="b b-gy">${g.aptAd}</span>`:''}
          </div>
        </div>
        <div style="text-align:center;flex-shrink:0;background:var(--s2);border-radius:12px;padding:12px 18px">
          <div style="font-size:26px;font-weight:800;color:${pctColor};line-height:1">${pct}%</div>
          <div style="font-size:10px;color:var(--tx-3);margin-top:2px">Tamamlanma</div>
        </div>
      </div>
      <div style="background:var(--s2);border-radius:8px;height:7px;margin-bottom:20px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${pctColor};border-radius:8px;transition:width .4s"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">
        <div style="background:var(--s2);border-radius:10px;padding:13px 15px">
          <div style="font-size:10px;font-weight:600;color:var(--tx-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px">Atanan Personel</div>
          <div style="font-size:13.5px;font-weight:600;color:var(--tx)">${per ? per.ad : (g.atanan||'—')}</div>
          ${per&&per.gorev?`<div style="font-size:11.5px;color:var(--tx-3);margin-top:1px">${perGorevLbl[per.gorev]||per.gorev}</div>`:''}
          ${per&&per.tel?`<div style="font-size:11.5px;color:var(--brand);margin-top:3px">${per.tel}</div>`:''}
        </div>
        <div style="background:var(--s2);border-radius:10px;padding:13px 15px">
          <div style="font-size:10px;font-weight:600;color:var(--tx-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px">Apartman</div>
          <div style="font-size:13.5px;font-weight:600;color:var(--tx)">${g.aptAd&&g.aptAd!=='—'?g.aptAd:'—'}</div>
        </div>
        <div style="background:var(--s2);border-radius:10px;padding:13px 15px">
          <div style="font-size:10px;font-weight:600;color:var(--tx-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px">Başlangıç</div>
          <div style="font-size:13.5px;font-weight:600;color:var(--tx)">${g.bas||'—'}</div>
        </div>
        <div style="background:var(--s2);border-radius:10px;padding:13px 15px">
          <div style="font-size:10px;font-weight:600;color:var(--tx-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px">Son Tarih</div>
          <div style="font-size:13.5px;font-weight:600;color:var(--tx)">${g.son||'—'}</div>
          ${tarihMsj?`<div style="font-size:11.5px;font-weight:500;color:${tarihRenk};margin-top:2px">${tarihMsj}</div>`:''}
        </div>
      </div>
      ${g.aciklama?`
      <div style="background:var(--s2);border-radius:10px;padding:14px 16px">
        <div style="font-size:10px;font-weight:600;color:var(--tx-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:7px">Açıklama</div>
        <div style="font-size:13px;color:var(--tx-2);line-height:1.65;white-space:pre-wrap">${g.aciklama}</div>
      </div>`:''}
    </div>`;
  openModal('mod-gov-detay');
}

function openIlerleme(id) {
 ilerlemeId=id;
 const g=S.gorevler.find(x=>x.id===id);
 document.getElementById('mod-ilerleme-body').innerHTML=`
 <div class="fg"> <div class="fgp"><label class="lbl">Görev</label><input class="fi" value="${g.baslik}" readonly></div> <div class="fgp"><label class="lbl">Durum</label><select class="fs" id="il-durum"> <option value="bekliyor" ${g.durum==='bekliyor'?'selected':''}>Bekliyor</option> <option value="devam" ${g.durum==='devam'?'selected':''}>Devam Ediyor</option> <option value="tamamlandi" ${g.durum==='tamamlandi'?'selected':''}>Tamamlandı</option> </select></div> <div class="fgp"><label class="lbl">İlerleme (${g.ilerleme||0}%)</label> <input type="range" id="il-pct" min="0" max="100" value="${g.ilerleme||0}" style="width:100%;accent-color:var(--brand)" oninput="document.getElementById('il-pct-lbl').textContent=this.value+'%'"> <span id="il-pct-lbl" style="font-size:13px;color:var(--brand);font-weight:700">${g.ilerleme||0}%</span></div> <div class="fgp"><label class="lbl">Güncelleme Notu</label><textarea class="fta" id="il-not" rows="2" placeholder="İlerleme notu…"></textarea></div> </div>`;
 openModal('mod-ilerleme');
}
function saveIlerleme(){
 const g=S.gorevler.find(x=>x.id===ilerlemeId); if(!g)return;
 g.durum=document.getElementById('il-durum').value;
 g.ilerleme=parseInt(document.getElementById('il-pct').value)||0;
 if(g.durum==='tamamlandi')g.ilerleme=100;
 save();closeModal('mod-ilerleme');toast('Güncellendi.','ok');
}
function delGov(id){S.gorevler=S.gorevler.filter(g=>g.id!==id);save();toast('Silindi.','warn');}

// 
// İCRA LİSTESİ
// 
function onIcraApt() {
  const a = aptById(document.getElementById('icra-apt').value);
  const el = document.getElementById('icra-apt-info');
  const ozCard = document.getElementById('icra-ozet-apt');
  if (!a) { el.style.display='none'; if(ozCard) ozCard.style.display='none'; return; }
  el.innerHTML = `<strong>${a.ad}</strong> · ${a.daireSayisi} daire · ${a.adres||''}${a.ilce?', '+a.ilce:''}${a.il?', '+a.il:''}`;
  el.style.display = 'block';
  const mevcutlar = (S.icralar||[]).filter(i=>i.aptId===a.id);
  if (ozCard) {
    if (mevcutlar.length) {
      ozCard.style.display = 'block';
      const dCls={devam:'b-rd',tahsil:'b-gr',kapatildi:'b-gy'};
      const dLbl={devam:'Devam',tahsil:'Tahsil',kapatildi:'Kapatıldı'};
      document.getElementById('icra-ozet-apt-list').innerHTML = mevcutlar.map(i=>`<div class="dr"><span class="dk">${i.borclu} · ${i.dosyaNo||'—'}</span><span class="b ${dCls[i.durum]||'b-gy'}" style="font-size:9.5px">${dLbl[i.durum]||i.durum}</span></div>`).join('');
    } else { ozCard.style.display='none'; }
  }
}

function calcIcraToplam() {
  const t = parseFloat(document.getElementById('icra-tutar').value)||0;
  const f = parseFloat(document.getElementById('icra-faiz').value)||0;
  const el = document.getElementById('icra-toplam-goster');
  if (el) el.value = (t+f)>0 ? '₺'+fmt(t+f,2) : '';
}

function icraFormTemizle() {
  ['icra-borclu','icra-daire','icra-avukat','icra-avukat-tel','icra-dosya-no',
   'icra-daire-adi','icra-tutar','icra-faiz','icra-toplam-goster','icra-aciklama',
   'icra-notlar','icra-tarih','icra-durum-tarih'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value='';
  });
  const aptEl = document.getElementById('icra-apt'); if(aptEl) aptEl.value='';
  const durEl = document.getElementById('icra-durum'); if(durEl) durEl.value='devam';
  const sebEl = document.getElementById('icra-sebep-tur'); if(sebEl) sebEl.value='aidat_borc';
  const infoEl = document.getElementById('icra-apt-info'); if(infoEl) infoEl.style.display='none';
  const ozEl = document.getElementById('icra-ozet-apt'); if(ozEl) ozEl.style.display='none';
  editId = null;
}

function saveIcra() {
  const apt = aptById(document.getElementById('icra-apt').value);
  if (!apt) { toast('Apartman seçin!','err'); return; }
  const borclu = document.getElementById('icra-borclu').value.trim();
  const avukat = document.getElementById('icra-avukat').value.trim();
  const dosyaNo = document.getElementById('icra-dosya-no').value.trim();
  const tutar = parseFloat(document.getElementById('icra-tutar').value)||0;
  if (!borclu||!avukat||!dosyaNo||!tutar) { toast('Zorunlu alanları doldurun! (*)','err'); return; }
  const sebepMap={aidat_borc:'Aidat Borcu',ortak_gider:'Ortak Gider',zarar_ziyan:'Zarar/Ziyan',karar_ihlali:'Karar İhlali',diger:'Diğer'};
  const isEdit = !!editId;
  const obj = {
    id: editId||Date.now(), aptId:apt.id, aptAd:apt.ad,
    borclu, daire:document.getElementById('icra-daire').value,
    avukat, avukatTel:document.getElementById('icra-avukat-tel').value,
    dosyaNo, icraDairesi:document.getElementById('icra-daire-adi').value,
    tutar, faiz:parseFloat(document.getElementById('icra-faiz').value)||0,
    sebepTur:document.getElementById('icra-sebep-tur').value,
    sebep:sebepMap[document.getElementById('icra-sebep-tur').value]||'Diğer',
    aciklama:document.getElementById('icra-aciklama').value,
    durum:document.getElementById('icra-durum').value,
    durumTarih:document.getElementById('icra-durum-tarih').value,
    notlar:document.getElementById('icra-notlar').value,
    tarih:document.getElementById('icra-tarih').value,
  };
  if (isEdit) { const i=S.icralar.findIndex(x=>x.id===editId); if(i>=0) S.icralar[i]=obj; }
  else S.icralar.push(obj);
  editId=null;
  save();
  toast(isEdit?'Dosya güncellendi.':'İcra dosyası kaydedildi.','ok');
  icraFormTemizle(); goTab('icra-liste');
}

function editIcra(id) {
  editId=id;
  const ic=S.icralar.find(x=>x.id===id); if(!ic) return;
  goPage('icra');
  setTimeout(()=>{
    goTab('icra-yeni');
    setTimeout(()=>{
      document.getElementById('icra-apt').value=ic.aptId; onIcraApt();
      document.getElementById('icra-borclu').value=ic.borclu||'';
      document.getElementById('icra-daire').value=ic.daire||'';
      document.getElementById('icra-avukat').value=ic.avukat||'';
      document.getElementById('icra-avukat-tel').value=ic.avukatTel||'';
      document.getElementById('icra-dosya-no').value=ic.dosyaNo||'';
      document.getElementById('icra-daire-adi').value=ic.icraDairesi||'';
      document.getElementById('icra-tutar').value=ic.tutar||'';
      document.getElementById('icra-faiz').value=ic.faiz||'';
      document.getElementById('icra-sebep-tur').value=ic.sebepTur||'aidat_borc';
      document.getElementById('icra-aciklama').value=ic.aciklama||'';
      document.getElementById('icra-durum').value=ic.durum||'devam';
      document.getElementById('icra-durum-tarih').value=ic.durumTarih||'';
      document.getElementById('icra-notlar').value=ic.notlar||'';
      document.getElementById('icra-tarih').value=ic.tarih||'';
      calcIcraToplam();
    },80);
  },80);
}

function delIcra(id) {
  if(!confirm('Bu icra dosyası silinsin mi?')) return;
  S.icralar=S.icralar.filter(i=>i.id!==id);
  save(); toast('Silindi.','warn');
}

function renderIcra() {
  const s=(document.getElementById('icra-srch')?.value||'').toLowerCase();
  const fa=document.getElementById('icra-f-apt')?.value||'';
  const fd=document.getElementById('icra-f-durum')?.value||'';
  let list=S.icralar||[];
  if(s) list=list.filter(i=>(i.aptAd+' '+(i.borclu||'')+' '+(i.avukat||'')+' '+(i.dosyaNo||'')+' '+(i.sebep||'')).toLowerCase().includes(s));
  if(fa) list=list.filter(i=>String(i.aptId)===fa);
  if(fd) list=list.filter(i=>i.durum===fd);
  const all=S.icralar||[];
  const pills=document.getElementById('icra-ozet-pills');
  if(pills) {
    const nd=all.filter(i=>i.durum==='devam').length;
    const nt=all.filter(i=>i.durum==='tahsil').length;
    const nk=all.filter(i=>i.durum==='kapatildi').length;
    pills.innerHTML=`<span class="b b-rd">${nd} Devam</span><span class="b b-gr">${nt} Tahsil</span><span class="b b-gy">${nk} Kapatıldı</span>`;
  }
  const tb=document.getElementById('icra-tbody'); if(!tb) return;
  if(!list.length){tb.innerHTML=`<tr><td colspan="10">${emp('','İcra kaydı yok')}</td></tr>`;return;}
  const dCls={devam:'b-rd',tahsil:'b-gr',kapatildi:'b-gy'};
  const dLbl={devam:'Devam',tahsil:'Tahsil',kapatildi:'Kapatıldı'};
  tb.innerHTML=list.slice().reverse().map(i=>`<tr>
    <td style="font-weight:700">${i.aptAd}</td>
    <td><div style="font-weight:600">${i.borclu}</div>${i.daire?`<div class="t3" style="font-size:10.5px">Daire ${i.daire}</div>`:''}</td>
    <td><div>${i.avukat||'—'}</div>${i.avukatTel?`<div class="t3" style="font-size:10.5px">${i.avukatTel}</div>`:''}</td>
    <td><span style="font-family:monospace;font-weight:700;color:var(--brand)">${i.dosyaNo||'—'}</span></td>
    <td style="font-size:11.5px;color:var(--tx-2)">${i.icraDairesi||'—'}</td>
    <td><span class="b b-am" style="font-size:9.5px">${i.sebep||'—'}</span>${i.aciklama?`<div class="t3" style="font-size:10px;margin-top:2px">${i.aciklama.slice(0,45)}${i.aciklama.length>45?'…':''}</div>`:''}</td>
    <td><div style="font-weight:700;color:var(--err)">₺${fmt(i.tutar)}</div>${i.faiz?`<div class="t3" style="font-size:10px">+₺${fmt(i.faiz)} masraf</div>`:''}</td>
    <td style="font-size:11.5px;color:var(--tx-3)">${i.tarih||'—'}</td>
    <td><span class="b ${dCls[i.durum]||'b-gy'}">${dLbl[i.durum]||i.durum}</span></td>
    <td><div class="act">
      <button class="btn bg xs" onclick="editIcra(${i.id})" title="Düzenle"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="btn brd xs" onclick="delIcra(${i.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
    </div></td>
  </tr>`).join('');
}

function renderIcraRapor() {
  const all=S.icralar||[];
  const devam=all.filter(i=>i.durum==='devam');
  const tahsil=all.filter(i=>i.durum==='tahsil');
  const topTutar=all.reduce((s,i)=>s+(i.tutar||0),0);
  const tahsilTutar=tahsil.reduce((s,i)=>s+(i.tutar||0),0);
  const avSet=new Set(all.map(i=>i.avukat).filter(Boolean));
  const el=document.getElementById('icra-rapor-stats'); if(!el) return;
  el.innerHTML=`
    <div class="sc"><div class="sc-ico ic-rd"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="sc-lbl">Aktif Dosya</div><div class="sc-val v-rd">${devam.length}</div><div class="sc-sub">Devam eden takip</div><div class="sc-bar bar-rd"></div></div>
    <div class="sc"><div class="sc-ico ic-am"><svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">&#8378;</text></svg></div><div class="sc-lbl">Toplam Alacak</div><div class="sc-val v-am" style="font-size:18px">₺${fmt(topTutar)}</div><div class="sc-sub">Tüm dosyalar</div><div class="sc-bar bar-am"></div></div>
    <div class="sc"><div class="sc-ico ic-gr"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="sc-lbl">Tahsil Edilen</div><div class="sc-val v-gr" style="font-size:18px">₺${fmt(tahsilTutar)}</div><div class="sc-sub">${tahsil.length} dosya kapandı</div><div class="sc-bar bar-gr"></div></div>
    <div class="sc"><div class="sc-ico ic-bl"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div class="sc-lbl">Avukat Sayısı</div><div class="sc-val v-bl">${avSet.size}</div><div class="sc-sub">Takip eden avukat</div><div class="sc-bar bar-bl"></div></div>`;
  const byApt={};
  all.forEach(i=>{if(!byApt[i.aptAd])byApt[i.aptAd]={dosya:0,tutar:0,devam:0};byApt[i.aptAd].dosya++;byApt[i.aptAd].tutar+=(i.tutar||0);if(i.durum==='devam')byApt[i.aptAd].devam++;});
  const aptEl=document.getElementById('icra-rapor-apt');
  if(aptEl) aptEl.innerHTML=Object.keys(byApt).length
    ?Object.entries(byApt).sort((a,b)=>b[1].tutar-a[1].tutar).map(([ad,v])=>`<div class="dr"><span class="dk">${ad}</span><div style="display:flex;gap:7px;align-items:center"><span class="dv">₺${fmt(v.tutar)}</span><span class="b b-am" style="font-size:9px">${v.dosya} dosya</span>${v.devam?`<span class="b b-rd" style="font-size:9px">${v.devam} aktif</span>`:''}</div></div>`).join('')
    :emp('','Kayıt yok');
  const byAv={};
  all.forEach(i=>{if(!i.avukat)return;if(!byAv[i.avukat])byAv[i.avukat]={dosya:0,tutar:0};byAv[i.avukat].dosya++;byAv[i.avukat].tutar+=(i.tutar||0);});
  const avEl=document.getElementById('icra-rapor-avukat');
  if(avEl) avEl.innerHTML=Object.keys(byAv).length
    ?Object.entries(byAv).sort((a,b)=>b[1].dosya-a[1].dosya).map(([av,v])=>`<div class="dr"><span class="dk">${av}</span><div><span class="dv">${v.dosya} dosya</span> <span class="t3" style="font-size:10.5px">₺${fmt(v.tutar)}</span></div></div>`).join('')
    :emp('','Kayıt yok');
}


// ══════════════════════════════════════════════════
// AI HELPER — çoklu sağlayıcı desteği
// ══════════════════════════════════════════════════
const AI_KEYS = {
  gemini:    () => sessionStorage.getItem('syp_apikey_gemini') || '',
  anthropic: () => sessionStorage.getItem('syp_apikey_claude') || '',
  openai:    () => sessionStorage.getItem('syp_apikey_openai') || ''
};

// Aktif sağlayıcı: localStorage'dan al, yoksa gemini
function getAIProvider() {
  return sessionStorage.getItem('syp_ai_provider') || 'gemini';
}

// Gemini çağrısı
async function callGemini(prompt, model = 'gemini-1.5-flash') {
  const key = AI_KEYS.gemini();
  if (!key) throw new Error('Gemini API anahtarı girilmemiş — Ayarlar sayfasından ekleyin.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Claude (Anthropic) çağrısı
async function callClaude(prompt) {
  const key = AI_KEYS.anthropic();
  if (!key) throw new Error('Claude API anahtarı girilmemiş');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.map(c => c.text || '').join('') || '';
}

// OpenAI çağrısı
async function callOpenAI(prompt) {
  const key = AI_KEYS.openai();
  if (!key) throw new Error('OpenAI API anahtarı girilmemiş');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.choices?.[0]?.message?.content || '';
}

// Ana çağrı fonksiyonu — sağlayıcıya göre yönlendir
async function callAI(prompt) {
  const provider = getAIProvider();

  // Key kontrolü — yoksa Ayarlar'a yönlendir
  const keyMap = { gemini: AI_KEYS.gemini(), claude: AI_KEYS.anthropic(), openai: AI_KEYS.openai() };
  if (!keyMap[provider]) {
    const providerNames = { gemini:'Google Gemini', claude:'Anthropic Claude', openai:'OpenAI GPT' };
    showAIKeyModal(providerNames[provider] || provider);
    throw new Error('API anahtarı eksik');
  }

  try {
    if (provider === 'gemini')  return await callGemini(prompt);
    if (provider === 'claude')  return await callClaude(prompt);
    if (provider === 'openai')  return await callOpenAI(prompt);
    return await callGemini(prompt);
  } catch (e) {
    // Sızdırılmış / geçersiz key hata mesajı
    const leaked = e.message && (e.message.includes('leaked') || e.message.includes('API_KEY_INVALID') || e.message.includes('invalid'));
    if (leaked) {
      showAIKeyModal(null, '⚠️ API anahtarınız geçersiz veya sızdırılmış olarak işaretlendi. Lütfen yeni bir anahtar oluşturun.');
    } else {
      toast('AI hatası: ' + e.message, 'err');
    }
    throw e;
  }
}

// API key eksik/geçersiz olduğunda modal göster
function showAIKeyModal(providerName, customMsg) {
  const msg = customMsg || `${providerName} API anahtarı girilmemiş.`;
  // Varsa eski modalı kaldır
  document.getElementById('_ai-key-modal')?.remove();
  const div = document.createElement('div');
  div.id = '_ai-key-modal';
  div.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px';
  div.innerHTML = `<div style="background:var(--surface);border-radius:16px;padding:28px 24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center">
    <div style="font-size:36px;margin-bottom:12px">🤖</div>
    <div style="font-size:16px;font-weight:700;color:var(--tx);margin-bottom:8px">Yapay Zeka API Anahtarı Gerekli</div>
    <div style="font-size:13px;color:var(--tx-3);margin-bottom:20px;line-height:1.5">${msg}</div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button onclick="document.getElementById('_ai-key-modal').remove()" style="padding:9px 18px;border-radius:8px;border:1.5px solid var(--border);background:var(--s2);color:var(--tx);cursor:pointer;font-size:13px;font-weight:600">Kapat</button>
      <button onclick="document.getElementById('_ai-key-modal').remove();goPage('ayarlar')" style="padding:9px 18px;border-radius:8px;border:none;background:var(--brand);color:#fff;cursor:pointer;font-size:13px;font-weight:600">⚙️ Ayarlara Git</button>
    </div>
    <div style="margin-top:16px;padding:10px 12px;background:var(--s2);border-radius:8px;font-size:11px;color:var(--tx-3)">
      Yeni anahtar: <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--brand);font-weight:600">aistudio.google.com</a>
    </div>
  </div>`;
  div.addEventListener('click', e => { if (e.target === div) div.remove(); });
  document.body.appendChild(div);
}

// 
// INIT
// 
initTabs();

// Sidebar click
document.querySelectorAll('.ni[data-p]').forEach(ni => {
 ni.addEventListener('click', () => goPage(ni.dataset.p));
});

// Set today defaults
document.getElementById('kar-tarih').value = today();
document.getElementById('tek-tarih').value = today();
document.getElementById('den-tarih').value = today();

// Init renders
renderGiderler();

// ══════════════════════════════════════════════════
// SAKİNLER MODÜLÜ
// ══════════════════════════════════════════════════
let sakEditId = null;

function renderSakinler() {
  // Stat cards at top
  const statEl = document.getElementById('sak-stats-top');
  if (statEl) {
    const aptId = selectedAptId;
    const liste = (S.sakinler||[]).filter(x=>(!aptId||x.aptId==aptId) && isSakinAktif(x));
    const malikSayisi = liste.filter(x=>x.tip==='malik').length;
    const kiralikSayisi = liste.filter(x=>x.tip==='kiralik').length;
    const borcluSayisi = liste.filter(x=>(x.borc||0)>0).length;
    const toplamBorc = liste.reduce((s,x)=>s+(x.borc||0),0);
    statEl.innerHTML = `
      <div class="sc bar-bl" style="cursor:default"><div class="sc-ico ic-bl"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div class="sc-lbl">Toplam Sakin</div><div class="sc-val v-bl">${liste.length}</div></div>
      <div class="sc bar-gr" style="cursor:default"><div class="sc-ico ic-gr"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div><div class="sc-lbl">Kat Maliki</div><div class="sc-val v-gr">${malikSayisi}</div></div>
      <div class="sc bar-am" style="cursor:default"><div class="sc-ico ic-am"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div><div class="sc-lbl">Kiracı</div><div class="sc-val v-am">${kiralikSayisi}</div></div>
      <div class="sc bar-rd" style="cursor:default"><div class="sc-ico ic-rd"><svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div><div class="sc-lbl">Borçlu Sakin</div><div class="sc-val v-rd">${borcluSayisi}</div><div class="sc-sub">₺${fmt(toplamBorc)} toplam</div></div>`;
  }
  // aptCtxCheck overlay kaldırıldı — üst menüden seçilen site yeterli
  const contentEl = document.getElementById('sak-content');
  if (contentEl) contentEl.style.display = '';
  const aptId = selectedAptId;
  const apt = aptId ? S.apartmanlar.find(a=>a.id==aptId) : null;

  // Üst banner: apt seçiliyse göster, seçili değilse gizle
  const bannerEl = document.getElementById('sak-apt-banner');
  if (bannerEl) { if (apt) renderAptBanner('sak-apt-banner', apt); else bannerEl.innerHTML = ''; }

  // Forma apartman dropdown'ı
  const sakAptEl = document.getElementById('sak-apt');
  if (sakAptEl) {
    if (apt) {
      sakAptEl.innerHTML = `<option value="${apt.id}">${apt.ad}</option>`;
      sakAptEl.value = apt.id;
    } else {
      sakAptEl.innerHTML = '<option value="">— Apartman Seçin —</option>' +
        S.apartmanlar.filter(a=>a.durum==='aktif').map(a=>`<option value="${a.id}">${a.ad}</option>`).join('');
    }
  }
  // Blok/daire seçimini güncelle
  updateSakDaireBilgileri();

  const s = (document.getElementById('sak-srch')?.value||'').toLowerCase();
  const fTip = document.getElementById('sak-f-tip')?.value||'';
  const fBorc = document.getElementById('sak-f-borc')?.value||'';
  const gorunum = document.getElementById('sak-f-gorunum')?.value||'tablo';

  // Apt seçiliyse o apt'ın sakinleri, seçili değilse tümü — sadece aktif sakinler
  let list = aptId
    ? S.sakinler.filter(x=>x.aptId==aptId && isSakinAktif(x))
    : S.sakinler.filter(x=>isSakinAktif(x));
  if (fTip) list = list.filter(x=>x.tip===fTip);
  if (fBorc==='borclu') list = list.filter(x=>(x.borc||0)>0);
  if (fBorc==='temiz') list = list.filter(x=>!(x.borc||0));
  if (s) list = list.filter(x=>(x.ad+' '+(x.daire||'')+' '+(x.tel||'')+' '+(x.plaka||'')).toLowerCase().includes(s));

  const cnt = document.getElementById('sak-count');
  const maliks = list.filter(x=>x.tip==='malik').length;
  const kiracis = list.filter(x=>x.tip==='kiralik').length;
  if(cnt) cnt.textContent = `${list.length} sakin · ${maliks} malik · ${kiracis} kiracı`;

  const container = document.getElementById('sak-liste-icerik');
  if (!container) return;

  if (!list.length) {
    container.innerHTML=`<div class="card">${emp('👤', aptId ? 'Bu apartmanda henüz sakin kaydı bulunmuyor. "Tekil Ekle" veya "Toplu Ekle" ile sakin ekleyin.' : 'Sistemde kayıtlı sakin bulunmuyor.')}</div>`;
    return;
  }

  if (gorunum === 'tablo') {
    // TABLO GÖRÜNÜM
    container.innerHTML=`<div class="card"><div class="tw"><table>
      <thead><tr>${!aptId?'<th>Apartman</th>':''}<th>Daire</th><th>Ad Soyad</th><th>Tip</th><th>Telefon</th><th>E-posta</th><th>Aidat</th><th>Borç</th><th>Plaka</th><th>İşlem</th></tr></thead>
      <tbody>${list.map(sk => {
        const borc=sk.borc||0;
        return `<tr style="cursor:pointer" onclick="goDaireDetay(${sk.id})">
          ${!aptId?`<td style="font-size:11.5px;color:var(--tx-3)">${sk.aptAd||'—'}</td>`:''}
          <td style="font-weight:700;color:var(--brand)">${(sk.blok?sk.blok+' - ':'')+(sk.daire||'—')}</td>
          <td><strong>${sk.ad}</strong>${sk.kat?'<div class="t3" style="font-size:10.5px">Kat: '+sk.kat+'</div>':''}</td>
          <td><span class="b ${sk.tip==='malik'?'b-bl':'b-am'}">${sk.tip==='malik'?'Malik':'Kiracı'}</span></td>
          <td>${sk.tel||'—'}</td>
          <td class="t2" style="font-size:11px">${sk.email||'—'}</td>
          <td style="color:var(--ok)">${sk.aidat?'₺'+fmt(sk.aidat):'-'}</td>
          <td style="font-weight:700;color:${borc>0?'var(--err)':'var(--ok)'}">${borc>0?'₺'+fmt(borc):'₺0'}</td>
          <td style="font-size:11px;font-family:monospace">${sk.plaka||'—'}</td>
          <td onclick="event.stopPropagation()"><div class="act">
            <button class="btn bg xs" onclick="goDaireDetay(${sk.id})" title="Daire Detay"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
            <button class="btn xs" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe" onclick="goSakinCari(${sk.id})" title="Cari Hesap"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">&#8378;</text></svg></button>
            <button class="btn bg xs" onclick="editSakin(${sk.id})" title="Düzenle"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn xs" style="background:#f0fdf4;color:#059669;border:1px solid #a7f3d0" onclick="openQrModal(${sk.id})" title="QR Kod"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h7v7M14 14v3M17 21h4"/></svg></button>
            <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="sakinCikisYap(${sk.id})" title="${sk.tip==='malik'?'Ev Sahibi Değişimi':'Kiracı Çıkışı'}"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg></button>
          </div></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div></div>`;
  } else {
    // KART GÖRÜNÜM
    const sorted = list.slice().sort((a,b)=>{ const da=parseInt(a.daire)||0, db=parseInt(b.daire)||0; return da-db||a.daire?.localeCompare(b.daire)||0; });
    container.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">${sorted.map(sk=>{
      const borc=sk.borc||0;
      const isMalik=sk.tip==='malik';
      const init=(sk.ad||' ').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
      return `<div class="sakin-kart" style="cursor:pointer" onclick="goDaireDetay(${sk.id})">
        <div class="sakin-kart-header">
          <div class="sakin-avatar ${sk.tip}">${init}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sk.ad}</div>
            <div style="font-size:11.5px;color:var(--tx-3)">
              <span class="b ${isMalik?'b-bl':'b-am'}" style="font-size:10px;padding:2px 6px">${isMalik?'Malik':'Kiracı'}</span>
              &nbsp;Daire: <strong style="color:var(--brand)">${(sk.blok?sk.blok+' - ':'')+(sk.daire||'—')}</strong>${sk.kat?' · Kat '+sk.kat:''}
              ${!aptId?`<div style="font-size:10.5px;color:var(--tx-4);margin-top:2px">🏢 ${sk.aptAd||'—'}</div>`:''}
            </div>
          </div>
          ${borc>0?`<div style="font-size:11px;font-weight:700;color:var(--err);text-align:right">₺${fmt(borc)}<div style="font-size:10px;font-weight:400;color:var(--tx-3)">borç</div></div>`:'<div style="font-size:11px;font-weight:700;color:var(--ok);text-align:right">₺0<div style="font-size:10px;font-weight:400;color:var(--tx-3)">borç</div></div>'}
        </div>
        <div class="sakin-kart-grid">
          <div class="skf"><span class="skf-lbl">Telefon</span><span class="skf-val">${sk.tel||'—'}</span></div>
          <div class="skf"><span class="skf-lbl">Aidat</span><span class="skf-val" style="color:var(--ok)">${sk.aidat?'₺'+fmt(sk.aidat)+'/ay':'—'}</span></div>
          ${sk.email?`<div class="skf" style="grid-column:1/-1"><span class="skf-lbl">E-posta</span><span class="skf-val" style="font-size:11.5px">${sk.email}</span></div>`:''}
          ${sk.plaka?`<div class="skf"><span class="skf-lbl">Plaka</span><span class="skf-val" style="font-family:monospace">${sk.plaka}</span></div>`:''}
          ${sk.giris?`<div class="skf"><span class="skf-lbl">Giriş</span><span class="skf-val">${sk.giris}</span></div>`:''}
          ${!isMalik&&sk.kira?`<div class="skf"><span class="skf-lbl">Kira</span><span class="skf-val" style="color:var(--warn)">₺${fmt(sk.kira)}/ay</span></div>`:''}
          ${isMalik&&sk.tapu?`<div class="skf"><span class="skf-lbl">Tapu No</span><span class="skf-val" style="font-size:11px">${sk.tapu}</span></div>`:''}
        </div>
        <div class="fc g6 mt12" onclick="event.stopPropagation()">
          <button class="btn bg xs" onclick="goDaireDetay(${sk.id})"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Detay</button>
          <button class="btn xs" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe" onclick="goSakinCari(${sk.id})"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">&#8378;</text></svg> Cari</button>
          <button class="btn bg xs" onclick="editSakin(${sk.id})"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Düzenle</button>
          <button class="btn xs" style="background:#f0fdf4;color:#059669;border:1px solid #a7f3d0" onclick="openQrModal(${sk.id})" title="QR Kod"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h7v7M14 14v3M17 21h4"/></svg> QR</button>
          <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="sakinCikisYap(${sk.id})"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg> Çıkart</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  const bdg = document.getElementById('bdg-sakin');
  if(bdg){ const b=S.sakinler.filter(x=>(x.borc||0)>0).length; bdg.textContent=b; bdg.style.display=b?'':'none'; }
}

function setSakinTip(tip) {
  document.getElementById('sak-tip-hidden').value = tip;
  const malikBtn=document.getElementById('tip-malik-btn');
  const kiralikBtn=document.getElementById('tip-kiralik-btn');
  const malikAlan=document.getElementById('sak-malik-alanlari');
  const kiralikAlan=document.getElementById('sak-kiralik-alanlari');
  const cikisWrap=document.getElementById('sak-cikis-wrap');
  if(!malikBtn) return;
  if(tip==='malik'){
    malikBtn.className='tip-btn on on-ev'; kiralikBtn.className='tip-btn';
    if(malikAlan) malikAlan.style.display=''; if(kiralikAlan) kiralikAlan.style.display='none';
    if(cikisWrap) cikisWrap.style.display='none';
  } else {
    kiralikBtn.className='tip-btn on on-ki'; malikBtn.className='tip-btn';
    if(malikAlan) malikAlan.style.display='none'; if(kiralikAlan) kiralikAlan.style.display='';
    if(cikisWrap) cikisWrap.style.display='';
  }
}

function initTopluDaireForm() {
  const tarihEl = document.getElementById('toplu-tarih');
  if (tarihEl && !tarihEl.value) tarihEl.value = new Date().toISOString().slice(0,10);
  const blokEl = document.getElementById('toplu-blok');
  if (blokEl && !blokEl.value && selectedAptId) {
    blokEl.value = selectedAptId;
    renderTopluDaireler();
  }
}

function renderTopluDaireler() {
  const aptId = document.getElementById('toplu-blok')?.value;
  const container = document.getElementById('toplu-tablo-container');
  if (!container) return;
  if (!aptId) { container.innerHTML = ''; return; }
  const apt = S.apartmanlar.find(a => String(a.id) === String(aptId));
  if (!apt) return;
  const count = apt.daireSayisi || 10;
  const existing = {};
  S.sakinler.filter(s => String(s.aptId) === String(aptId)).forEach(s => {
    if (!existing[s.daire]) existing[s.daire] = {};
    existing[s.daire][s.tip] = s;
  });
  const tipOpts = ['Standart','Dubleks','Stüdyo','Penthouse','1+1','2+1','3+1','4+1'].map(t=>`<option value="${t}">${t}</option>`).join('');
  // bloklar dizisi nesne ({ad,asansorSayisi}) veya string olabilir — her ikisini de destekle
  const blokAdlari = (apt.bloklar||[]).map(b => {
    if (!b) return null;
    if (typeof b === 'object') return String(b.ad || b.name || '').trim() || 'Blok';
    return String(b).trim() || 'Blok';
  }).filter(Boolean);
  if (!blokAdlari.length) blokAdlari.push('A Blok');
  const blokOpts = blokAdlari.map(b=>`<option value="${b}">${b}</option>`).join('');
  const ilkBlok = blokAdlari[0];
  const toBlokStr = v => {
    if (!v) return '';
    if (typeof v === 'object') return String(v.ad || v.name || '').trim();
    return String(v).trim();
  };
  let rows = '';
  for (let i = 1; i <= count; i++) {
    const dNo = String(i);
    const mal = existing[dNo]?.malik || {};
    const kir = existing[dNo]?.kiralik || {};
    const selTip = v => tipOpts.replace(`value="${v||'Standart'}"`,`value="${v||'Standart'}" selected`);
    const selBlk = v => { const vs = toBlokStr(v)||ilkBlok; return blokOpts.replace(`value="${vs}"`,`value="${vs}" selected`); };
    rows += `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:7px 10px"><div style="border:1px solid var(--border);border-radius:6px;padding:5px 8px;display:inline-block"><input class="fi" value="${dNo}" data-dno="${i}" style="width:44px;padding:3px 4px;font-size:13px;font-weight:600;text-align:center;border:none;background:transparent"></div></td>
      <td style="padding:7px 8px"><select class="fi" data-blok="${i}" style="width:100%;padding:6px 10px;font-size:12.5px">${selBlk(mal.blok)}</select></td>
      <td style="padding:7px 8px"><input class="fi" placeholder="Ad Soyad" value="${mal.ad||''}" data-malik="${i}" style="width:100%;padding:6px 10px;font-size:12.5px"></td>
      <td style="padding:7px 8px"><input class="fi" placeholder="0(5XX) XXX XX XX" value="${mal.tel||''}" data-maltel="${i}" style="width:100%;padding:6px 10px;font-size:12.5px"></td>
      <td style="padding:7px 8px"><input class="fi" placeholder="Ad Soyad" value="${kir.ad||''}" data-kiralik="${i}" style="width:100%;padding:6px 10px;font-size:12.5px"></td>
      <td style="padding:7px 8px"><input class="fi" placeholder="0(5XX) XXX XX XX" value="${kir.tel||''}" data-kiratel="${i}" style="width:100%;padding:6px 10px;font-size:12.5px"></td>
      <td style="padding:7px 8px"><select class="fi" data-tip="${i}" style="width:100%;padding:6px 10px;font-size:12.5px">${selTip(mal.dairetipi)}</select></td>
    </tr>`;
  }
  container.innerHTML = `
    <div style="font-size:16px;font-weight:700;margin-bottom:14px;color:var(--tx)">${apt.ad} (${count} Daire)</div>
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--s2)">
            <th style="padding:10px 10px;font-size:12px;font-weight:600;color:var(--tx-3);text-align:left;border-bottom:1px solid var(--border);width:75px">Daire No</th>
            <th style="padding:10px 8px;font-size:12px;font-weight:600;color:var(--tx-3);text-align:left;border-bottom:1px solid var(--border);width:110px">Blok</th>
            <th style="padding:10px 8px;font-size:12px;font-weight:600;color:var(--tx-3);text-align:left;border-bottom:1px solid var(--border)">Kat Maliki</th>
            <th style="padding:10px 8px;font-size:12px;font-weight:600;color:var(--tx-3);text-align:left;border-bottom:1px solid var(--border);width:145px">KM Telefon</th>
            <th style="padding:10px 8px;font-size:12px;font-weight:600;color:var(--tx-3);text-align:left;border-bottom:1px solid var(--border)">Kiracı</th>
            <th style="padding:10px 8px;font-size:12px;font-weight:600;color:var(--tx-3);text-align:left;border-bottom:1px solid var(--border);width:145px">Kiracı Tel</th>
            <th style="padding:10px 8px;font-size:12px;font-weight:600;color:var(--tx-3);text-align:left;border-bottom:1px solid var(--border);width:120px">Daire Tipi</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function topluTemizle() {
  const c = document.getElementById('toplu-tablo-container'); if (c) c.innerHTML='';
  const r = document.getElementById('toplu-sonuc'); if (r){r.style.display='none';r.innerHTML='';}
  const b = document.getElementById('toplu-blok'); if (b) b.value='';
}

// Excel şablonu indir
function indirExcelSablon() {
  if (typeof XLSX === 'undefined') { toast('Excel kütüphanesi yükleniyor, lütfen bekleyin…', 'warn'); return; }
  const basliklar = ['Daire No', 'Blok', 'Kat Maliki', 'KM Telefon', 'Kiracı', 'Kiracı Tel', 'Daire Tipi'];
  const ornek = [
    ['1', 'A Blok', 'Ahmet Yılmaz', '05321234567', '', '', '3+1'],
    ['2', 'A Blok', 'Fatma Demir', '05449876543', 'Mehmet Kaya', '05551112233', '2+1'],
    ['3', 'B Blok', 'Ali Çelik', '05362223344', '', '', 'Standart'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([basliklar, ...ornek]);
  // Sütun genişlikleri
  ws['!cols'] = [
    {wch:10},{wch:12},{wch:22},{wch:16},{wch:22},{wch:16},{wch:12}
  ];
  // Başlık satırı stil (SheetJS community sürümünde sınırlı stil desteği)
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daire Listesi');
  XLSX.writeFile(wb, 'SiteYonet_Sakin_Sablonu.xlsx');
  toast('Excel şablonu indirildi.', 'ok');
}

// Excel / CSV import
function importExcelSakin(input) {
  const file = input.files[0]; if (!file) return;
  if (typeof XLSX === 'undefined') { toast('Excel kütüphanesi henüz yüklenmedi, sayfayı yenileyip tekrar deneyin.', 'err'); return; }
  const onizEl = document.getElementById('excel-onizleme');
  const sonucEl = document.getElementById('excel-import-sonuc');
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) { toast('Dosyada veri bulunamadı.', 'err'); return; }

      // Başlık satırını tanı — esnek eşleme
      const header = rows[0].map(h => String(h||'').toLowerCase().trim());
      const col = name => {
        const aliases = {
          'daire no':   ['daire no','daireno','no','daire'],
          'blok':       ['blok','block'],
          'kat maliki': ['kat maliki','malik','katmaliki','mal','kat malik'],
          'km telefon': ['km telefon','km tel','malik tel','maltel','kat maliki tel','kmtel','km telefon'],
          'kiracı':     ['kiracı','kiraci','kiralik','tenant'],
          'kiracı tel': ['kiracı tel','kiraci tel','kiraciTel','kiracitel','kiracı telefon'],
          'daire tipi': ['daire tipi','tip','type','dairetip'],
        };
        const list = aliases[name] || [name];
        for (const alias of list) {
          const idx = header.indexOf(alias);
          if (idx !== -1) return idx;
        }
        return -1;
      };
      const iDaireNo  = col('daire no');
      const iBlok     = col('blok');
      const iMalik    = col('kat maliki');
      const iMalikTel = col('km telefon');
      const iKiraci   = col('kiracı');
      const iKiraciTel= col('kiracı tel');
      const iTip      = col('daire tipi');

      const veriSatirlar = rows.slice(1).filter(r => r.some(c => String(c).trim()));
      if (!veriSatirlar.length) { toast('Veri satırı bulunamadı.', 'err'); return; }

      // Önizleme göster
      const aptSec = document.getElementById('toplu-blok')?.value;
      const apt = aptSec ? S.apartmanlar.find(a=>String(a.id)===String(aptSec)) : null;
      const aptAd = apt?.ad || '';

      onizEl.style.display = '';
      onizEl.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:var(--ok);margin-bottom:6px">✅ ${file.name} okundu</div>
        <div style="font-size:11.5px;color:var(--tx-2);line-height:1.7">
          <div>Toplam satır: <strong>${veriSatirlar.length}</strong></div>
          <div>Kat Maliki sütunu: <strong>${iMalik>=0?'✓ Bulundu':'— Yok'}</strong></div>
          <div>Kiracı sütunu: <strong>${iKiraci>=0?'✓ Bulundu':'— Yok'}</strong></div>
        </div>
        <button class="btn bp sm" style="margin-top:10px;width:100%" onclick="kaydedExcelSakinler(window._excelImportRows,${JSON.stringify({iDaireNo,iBlok,iMalik,iMalikTel,iKiraci,iKiraciTel,iTip}).replace(/"/g,'&quot;')})">
          Verileri Kaydet (${veriSatirlar.length} satır)
        </button>`;

      // Satırları global'e kaydet
      window._excelImportRows = veriSatirlar;
      window._excelImportCols = {iDaireNo,iBlok,iMalik,iMalikTel,iKiraci,iKiraciTel,iTip};

    } catch(err) {
      toast('Dosya okunamadı: ' + err.message, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
  input.value = '';
}

function kaydedExcelSakinler(rows, cols) {
  if (!rows || !rows.length) { toast('İçe aktarılacak veri yok.', 'err'); return; }
  const aptSec = document.getElementById('toplu-blok')?.value;
  if (!aptSec) { toast('Önce apartman seçin (Daire Listesi bölümünden).', 'warn'); return; }
  const apt = S.apartmanlar.find(a=>String(a.id)===String(aptSec));
  if (!apt) { toast('Apartman bulunamadı.', 'err'); return; }
  const tarih = document.getElementById('toplu-tarih')?.value || '';
  const {iDaireNo,iBlok,iMalik,iMalikTel,iKiraci,iKiraciTel,iTip} = cols || window._excelImportCols;

  const tipGecerli = ['Standart','Dubleks','Stüdyo','Penthouse','1+1','2+1','3+1','4+1'];
  let ok=0, guncellendi=0, atlandi=0;

  rows.forEach((r, idx) => {
    const dNo     = String(iDaireNo>=0 ? r[iDaireNo] : idx+1).trim() || String(idx+1);
    const blok    = iBlok>=0 ? String(r[iBlok]||'').trim() : '';
    const malikAd = iMalik>=0 ? String(r[iMalik]||'').trim() : '';
    const malikTel= iMalikTel>=0 ? String(r[iMalikTel]||'').trim() : '';
    const kiraciAd= iKiraci>=0 ? String(r[iKiraci]||'').trim() : '';
    const kiraciTel=iKiraciTel>=0 ? String(r[iKiraciTel]||'').trim() : '';
    const tipRaw  = iTip>=0 ? String(r[iTip]||'').trim() : '';
    const tip     = tipGecerli.includes(tipRaw) ? tipRaw : 'Standart';

    if (!malikAd && !kiraciAd) { atlandi++; return; }

    if (malikAd) {
      const ex = S.sakinler.find(s=>String(s.aptId)===String(aptSec)&&s.daire===dNo&&s.tip==='malik');
      if (ex) { ex.ad=malikAd; ex.tel=malikTel; ex.dairetipi=tip; ex.blok=blok; guncellendi++; }
      else { S.sakinler.push({id:Date.now()+Math.random()*9999|0,ad:malikAd,aptId:+aptSec,aptAd:apt.ad,tip:'malik',daire:dNo,tel:malikTel,dairetipi:tip,blok,giris:tarih,aidat:0,borc:0,email:'',not:''}); ok++; }
    }
    if (kiraciAd) {
      const ex = S.sakinler.find(s=>String(s.aptId)===String(aptSec)&&s.daire===dNo&&s.tip==='kiralik');
      if (ex) { ex.ad=kiraciAd; ex.tel=kiraciTel; guncellendi++; }
      else { S.sakinler.push({id:Date.now()+Math.random()*9999|0+5000,ad:kiraciAd,aptId:+aptSec,aptAd:apt.ad,tip:'kiralik',daire:dNo,tel:kiraciTel,dairetipi:tip,blok,giris:tarih,aidat:0,borc:0,email:'',not:''}); ok++; }
    }
  });

  save();
  const sonucEl = document.getElementById('excel-import-sonuc');
  sonucEl.style.display='';
  sonucEl.innerHTML=`<div style="padding:10px 14px;background:var(--ok-bg);border:1px solid var(--ok-bd);border-radius:8px;font-size:13px;color:var(--ok);font-weight:600">
    ✅ ${ok} yeni sakin eklendi${guncellendi?', <strong>'+guncellendi+'</strong> güncellendi':''}${atlandi?' · '+atlandi+' boş satır atlandı':''}.
  </div>`;
  document.getElementById('excel-onizleme').style.display='none';
  window._excelImportRows = null;
  toast(`Excel: ${ok+guncellendi} sakin kaydedildi.`,'ok');
  renderSakinler?.();
}

function saveTopluDaireler() {
  const aptId = document.getElementById('toplu-blok')?.value;
  if (!aptId) { toast('Önce apartman seçin.','err'); return; }
  const apt = S.apartmanlar.find(a => String(a.id)===String(aptId));
  const tarih = document.getElementById('toplu-tarih')?.value||'';
  const count = apt?.daireSayisi||10;
  let ok=0, guncellendi=0;
  for (let i=1; i<=count; i++) {
    const dNo = document.querySelector(`[data-dno="${i}"]`)?.value?.trim()||String(i);
    const malikAd = document.querySelector(`[data-malik="${i}"]`)?.value?.trim()||'';
    const malikTel = document.querySelector(`[data-maltel="${i}"]`)?.value?.trim()||'';
    const kiralikAd = document.querySelector(`[data-kiralik="${i}"]`)?.value?.trim()||'';
    const kiralikTel = document.querySelector(`[data-kiratel="${i}"]`)?.value?.trim()||'';
    const tip = document.querySelector(`[data-tip="${i}"]`)?.value||'Standart';
    const blok = document.querySelector(`[data-blok="${i}"]`)?.value||'';
    if (malikAd) {
      const ex = S.sakinler.find(s=>String(s.aptId)===String(aptId)&&s.daire===dNo&&s.tip==='malik');
      if (ex) { ex.ad=malikAd; ex.tel=malikTel; ex.dairetipi=tip; ex.blok=blok; guncellendi++; }
      else { S.sakinler.push({id:Date.now()+i,ad:malikAd,aptId:+aptId,aptAd:apt?.ad||'',tip:'malik',daire:dNo,tel:malikTel,dairetipi:tip,blok:blok,giris:tarih,aidat:0,borc:0,email:'',not:'',durum:'aktif'}); ok++; }
    }
    if (kiralikAd) {
      const ex = S.sakinler.find(s=>String(s.aptId)===String(aptId)&&s.daire===dNo&&s.tip==='kiralik');
      if (ex) { ex.ad=kiralikAd; ex.tel=kiralikTel; guncellendi++; }
      else { S.sakinler.push({id:Date.now()+i+5000,ad:kiralikAd,aptId:+aptId,aptAd:apt?.ad||'',tip:'kiralik',daire:dNo,giris:tarih,aidat:0,borc:0,tel:kiralikTel,email:'',not:'',durum:'aktif'}); ok++; }
    }
  }
  save();
  const sonuc = document.getElementById('toplu-sonuc');
  sonuc.innerHTML = `<div style="padding:12px;border-radius:8px;background:var(--ok-bg);border:1px solid var(--ok-bd);color:var(--ok);font-size:13px;font-weight:600">✅ ${ok} yeni sakin eklendi${guncellendi?', '+guncellendi+' güncellendi':''}.</div>`;
  sonuc.style.display='';
  toast(`${ok+guncellendi} sakin kaydedildi.`,'ok');
}


// ── BLOK / DAİRE SEÇİM YARDIMCILARI ─────────────────────────────────
function updateSakDaireBilgileri() {
  const aptId = selectedAptId;
  const apt = aptId ? S.apartmanlar.find(a => a.id == aptId) : null;
  const bloklar = apt && apt.bloklar && apt.bloklar.length ? apt.bloklar : [];
  const blokWrap = document.getElementById('sak-blok-wrap');
  const blokSel  = document.getElementById('sak-blok');
  if (!blokWrap || !blokSel) return;
  if (bloklar.length > 0) {
    blokWrap.style.display = '';
    blokSel.innerHTML = '<option value="">— Blok Seçin —</option>' +
      bloklar.map(b => `<option value="${he(b.ad)}">${he(b.ad)}${b.daireSayisi ? ' (' + b.daireSayisi + ' daire)' : ''}</option>`).join('');
    onSakBlokChange();
  } else {
    blokWrap.style.display = 'none';
    blokSel.innerHTML = '<option value="">—</option>';
    // Serbest text input aktif
    const inp = document.getElementById('sak-daire');
    const sel = document.getElementById('sak-daire-sel');
    if (inp) inp.style.display = '';
    if (sel) sel.style.display = 'none';
  }
}

function onSakBlokChange() {
  const blokSel  = document.getElementById('sak-blok');
  const daireSel = document.getElementById('sak-daire-sel');
  const daireInp = document.getElementById('sak-daire');
  if (!blokSel || !daireSel || !daireInp) return;
  const secilenBlokAd = blokSel.value;
  if (!secilenBlokAd) {
    // Blok seçilmedi — serbest text
    daireInp.style.display = '';
    daireSel.style.display = 'none';
    daireInp.value = '';
    return;
  }
  const aptId = selectedAptId;
  const apt = aptId ? S.apartmanlar.find(a => a.id == aptId) : null;
  const blok = apt && apt.bloklar ? apt.bloklar.find(b => b.ad === secilenBlokAd) : null;
  const daireSayisi = blok ? (blok.daireSayisi || 0) : 0;
  if (daireSayisi > 0) {
    // Select ile daire numarası seç
    daireInp.style.display = 'none';
    daireSel.style.display = '';
    daireSel.innerHTML = '<option value="">— Daire No Seçin —</option>' +
      Array.from({length: daireSayisi}, (_, i) => i + 1)
           .map(n => `<option value="${n}">${n}</option>`).join('');
    daireInp.value = '';
  } else {
    // Daire sayısı tanımlanmamış — serbest text
    daireInp.style.display = '';
    daireSel.style.display = 'none';
    daireInp.value = '';
  }
}

function saveSakin() {
  if (!_guardCheck()) return;
  const ad = document.getElementById('sak-ad')?.value.trim();
  const tip = document.getElementById('sak-tip-hidden')?.value || 'malik';
  const aptId = selectedAptId;
  const tel = document.getElementById('sak-tel')?.value.trim();
  const daire = document.getElementById('sak-daire')?.value.trim();
  if (!ad||!aptId||!tel||!daire) { toast('Ad, Daire No ve Telefon zorunludur.','err'); return; }

  // Yeni sakin ekleniyorsa aynı daire+tipteki aktif sakini otomatik pasife al
  if (!sakEditId) {
    const bugun = new Date().toISOString().slice(0,10);
    if (tip === 'malik') {
      S.sakinler.filter(x => x.aptId==aptId && x.daire===daire && x.tip==='malik' && isSakinAktif(x))
        .forEach(x => { x.durum='pasif'; if(!x.cikis) x.cikis=bugun; });
    } else if (tip === 'kiralik') {
      S.sakinler.filter(x => x.aptId==aptId && x.daire===daire && x.tip==='kiralik' && isSakinAktif(x))
        .forEach(x => { x.durum='pasif'; if(!x.cikis) x.cikis=bugun; });
    }
  }

  const apt = S.apartmanlar.find(a=>a.id==aptId);
  const isMalik = tip==='malik';

  const rec = {
    id: sakEditId || Date.now(),
    ad, aptId: +aptId, aptAd: apt?apt.ad:'',
    tip,
    tc: document.getElementById('sak-tc')?.value.trim()||'',
    dogum: document.getElementById('sak-dogum')?.value||'',
    cinsiyet: document.getElementById('sak-cinsiyet')?.value||'',
    tel, tel2: document.getElementById('sak-tel2')?.value.trim()||'',
    email: document.getElementById('sak-email')?.value.trim()||'',
    acil: document.getElementById('sak-acil')?.value.trim()||'',
    plaka: document.getElementById('sak-plaka')?.value.trim()||'',
    arac: document.getElementById('sak-arac')?.value.trim()||'',
    blok: document.getElementById('sak-blok')?.value||'',
    daire, kat: document.getElementById('sak-kat')?.value.trim()||'',
    giris: document.getElementById('sak-giris')?.value||'',
    cikis: document.getElementById('sak-cikis')?.value||'',
    not: document.getElementById('sak-not')?.value.trim()||'',
    // Malik alanları
    tapu: isMalik?(document.getElementById('sak-tapu')?.value.trim()||''):'',
    arsa: isMalik?(parseFloat(document.getElementById('sak-arsa')?.value)||0):0,
    aidat: isMalik?(parseFloat(document.getElementById('sak-aidat')?.value)||0):(parseFloat(document.getElementById('sak-aidat-k')?.value)||0),
    borc: isMalik?(parseFloat(document.getElementById('sak-borc')?.value)||0):(parseFloat(document.getElementById('sak-borc-k')?.value)||0),
    adres: isMalik?(document.getElementById('sak-adres')?.value.trim()||''):'',
    // Kiracı alanları
    sozlasmeBas: !isMalik?(document.getElementById('sak-sozlasme-bas')?.value||''):'',
    sozlasmeBit: !isMalik?(document.getElementById('sak-sozlasme-bit')?.value||''):'',
    kira: !isMalik?(parseFloat(document.getElementById('sak-kira')?.value)||0):0,
    depozito: !isMalik?(parseFloat(document.getElementById('sak-depozito')?.value)||0):0,
    evSahibi: !isMalik?(document.getElementById('sak-ev-sahibi')?.value.trim()||''):'',
    evSahibiTel: !isMalik?(document.getElementById('sak-ev-sahibi-tel')?.value.trim()||''):''
  };

  if (sakEditId) {
    const i = S.sakinler.findIndex(x=>x.id===sakEditId);
    if(i>=0) {
      // Çıkış tarihi geçmişte → pasif, değilse aktif
      rec.durum = (rec.cikis && rec.cikis < new Date().toISOString().slice(0,10)) ? 'pasif' : 'aktif';
      S.sakinler[i]=rec;
    }
    sakEditId=null;
  } else {
    rec.durum = 'aktif';
    S.sakinler.push(rec);
  }

  // Formu temizle
  ['sak-ad','sak-tc','sak-tel','sak-tel2','sak-email','sak-acil','sak-plaka','sak-arac',
   'sak-daire','sak-kat','sak-not','sak-tapu','sak-adres','sak-ev-sahibi','sak-ev-sahibi-tel',
   'sak-arsa','sak-aidat','sak-borc','sak-aidat-k','sak-borc-k','sak-kira','sak-depozito'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  ['sak-dogum','sak-giris','sak-cikis','sak-sozlasme-bas','sak-sozlasme-bit'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  setSakinTip('malik');
  // Blok/daire seçimlerini sıfırla
  const blokEl = document.getElementById('sak-blok');
  const daireSel = document.getElementById('sak-daire-sel');
  const daireInp = document.getElementById('sak-daire');
  if (blokEl) blokEl.value = '';
  if (daireSel) { daireSel.innerHTML = ''; daireSel.style.display = 'none'; }
  if (daireInp) daireInp.style.display = '';
  save(); goTab('sak-liste'); toast('Sakin kaydedildi.','ok');
}


function editSakin(id) {
  const sk = S.sakinler.find(x=>x.id===id); if(!sk) return;
  sakEditId=id; goTab('sak-tekil');
  setTimeout(()=>{
    const setV=(i,v)=>{ const el=document.getElementById(i); if(el) el.value=v||''; };
    setSakinTip(sk.tip||'malik');
    setV('sak-ad',sk.ad); setV('sak-tc',sk.tc); setV('sak-dogum',sk.dogum);
    const cEl=document.getElementById('sak-cinsiyet'); if(cEl) cEl.value=sk.cinsiyet||'';
    setV('sak-tel',sk.tel); setV('sak-tel2',sk.tel2); setV('sak-email',sk.email); setV('sak-acil',sk.acil);
    setV('sak-plaka',sk.plaka); setV('sak-arac',sk.arac);
    // Blok/daire bilgisini geri yükle
    updateSakDaireBilgileri();
    if (sk.blok) {
      const blokEl = document.getElementById('sak-blok');
      if (blokEl) { blokEl.value = sk.blok; onSakBlokChange(); }
      // Daire no'yu select veya input'a yaz
      setTimeout(() => {
        const daireSel = document.getElementById('sak-daire-sel');
        const daireInp = document.getElementById('sak-daire');
        if (daireSel && daireSel.style.display !== 'none') {
          daireSel.value = sk.daire || '';
          if (daireInp) daireInp.value = sk.daire || '';
        } else {
          if (daireInp) daireInp.value = sk.daire || '';
        }
      }, 50);
    } else {
      setV('sak-daire', sk.daire);
    }
    setV('sak-kat',sk.kat);
    setV('sak-giris',sk.giris); setV('sak-cikis',sk.cikis);
    setV('sak-not',sk.not);
    if(sk.tip==='malik') {
      setV('sak-tapu',sk.tapu); setV('sak-arsa',sk.arsa);
      setV('sak-aidat',sk.aidat); setV('sak-borc',sk.borc); setV('sak-adres',sk.adres);
    } else {
      setV('sak-sozlasme-bas',sk.sozlasmeBas); setV('sak-sozlasme-bit',sk.sozlasmeBit);
      setV('sak-kira',sk.kira); setV('sak-depozito',sk.depozito);
      setV('sak-aidat-k',sk.aidat); setV('sak-borc-k',sk.borc);
      setV('sak-ev-sahibi',sk.evSahibi); setV('sak-ev-sahibi-tel',sk.evSahibiTel);
    }
  },80);
}

function isSakinAktif(sk) {
  return !sk.durum || sk.durum === 'aktif';
}

function sakinCikisYap(id) {
  const sk = S.sakinler.find(x=>x.id==id);
  if (!sk) return;
  if (sk.tip === 'malik') {
    const baskaAktifMalik = S.sakinler.find(s => s.id != id && s.aptId == sk.aptId && s.daire == sk.daire && s.tip === 'malik' && isSakinAktif(s));
    if (!baskaAktifMalik) {
      toast('Daire ev sahibisiz kalamaz. "Tekil Ekle" sekmesinden yeni ev sahibini girin — eski sahip otomatik pasife alınır.', 'err'); return;
    }
  }
  const tipLbl = sk.tip === 'malik' ? 'Ev Sahibi Çıkışı' : 'Kiracı Çıkışı';
  document.getElementById('cikis-modal-baslik').textContent = tipLbl;
  document.getElementById('cikis-sak-id').value = id;
  document.getElementById('cikis-mod').value = 'liste';
  document.getElementById('cikis-tarih').value = new Date().toISOString().slice(0,10);
  document.getElementById('cikis-modal-bilgi').innerHTML = `
    <strong>${sk.ad}</strong> · Daire ${sk.daire||'?'}<br>
    ${sk.tip==='malik'?'Ev sahibi değişimi: eski sahibin çıkış tarihi kayıt altına alınır.':'Kiracı çıkışı: çıkış tarihi kayıt altına alınır. Yerine kiracı eklenmezse ev sahibi aktif görünür.'}`;
  openModal('mod-cikis-tarih');
}

function delSakin(id) {
  const sk = S.sakinler.find(x=>x.id===id);
  if (!sk) return;
  if (isSakinAktif(sk)) { sakinCikisYap(id); return; }
  if(!confirm('Bu geçmiş kayıt kalıcı olarak silinsin mi?')) return;
  S.sakinler = S.sakinler.filter(x=>x.id!==id);
  save(); toast('Silindi.','warn');
}

// ══════════════════════════════════════════════════
// PERSONEL MODÜLÜ
// ══════════════════════════════════════════════════
let perEditId = null;
const perGorevLbl = {kapici:'Kapıcı',temizlik:'Temizlik Görevlisi',guvenlik:'Güvenlik Görevlisi',teknisyen:'Teknisyen',muhasebe:'Muhasebe',yonetici:'Site Yöneticisi',diger:'Diğer'};

function openYoneticiProfil() {
  const ad    = S.ayarlar?.yonetici  || _currentUser?.email?.split('@')[0] || 'Yönetici';
  const unvan = S.ayarlar?.unvan     || 'Apartman Yöneticisi';
  const email = _currentUser?.email  || '';
  const init  = ad.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase() || 'YÖ';
  const setT = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setT('mod-yon-avatar', init);
  setT('mod-yon-ad',     ad);
  setT('mod-yon-unvan',  unvan);
  setT('mod-yon-email',  email);
  openModal('mod-yon-profil');
}

function renderPersonel() {
  // Yönetici profil kartını güncelle
  const ynAd    = S.ayarlar?.yonetici  || _currentUser?.email?.split('@')[0] || 'Yönetici';
  const ynUnvan = S.ayarlar?.unvan     || 'Apartman Yöneticisi';
  const ynInit  = ynAd.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase() || 'YÖ';
  const avEl  = document.getElementById('per-yon-avatar');  if(avEl)  avEl.textContent  = ynInit;
  const adEl  = document.getElementById('per-yon-ad');      if(adEl)  adEl.textContent  = ynAd;
  const uvEl  = document.getElementById('per-yon-unvan');   if(uvEl)  uvEl.textContent  = ynUnvan;

  const s = (document.getElementById('per-srch')?.value||'').toLowerCase();
  const fGorev = document.getElementById('per-f-gorev')?.value||'';
  const gorunum = document.getElementById('per-f-gorunum')?.value||'tablo';
  let list = S.personel;
  if (fGorev) list = list.filter(x=>x.gorev===fGorev);
  if (s) list = list.filter(x=>(x.ad+' '+(x.gorev||'')).toLowerCase().includes(s));
  const aptEl = document.getElementById('per-apt');
  if(aptEl){ aptEl.innerHTML='<option value="">— Genel —</option>'+S.apartmanlar.map(a=>`<option value="${a.id}">${a.ad}</option>`).join(''); }
  const cnt = document.getElementById('per-count'); if(cnt) cnt.textContent=`${list.length} / ${S.personel.length} kayıt`;
  const durumCls = {aktif:'b-gr',izinli:'b-am',cikis:'b-rd'};
  const durumLbl = {aktif:'Aktif',izinli:'İzinli',cikis:'Çıkış Yaptı'};
  const tableCard = document.querySelector('#per-liste .card');
  let kartCont = document.getElementById('per-kart-cont');
  if (gorunum === 'kart') {
    if (tableCard) tableCard.style.display = 'none';
    if (!kartCont) {
      kartCont = document.createElement('div');
      kartCont.id = 'per-kart-cont';
      const perListe = document.getElementById('per-liste');
      if (perListe) perListe.appendChild(kartCont);
    }
    kartCont.style.display = '';
    if(!list.length) { kartCont.innerHTML = emp('👷','Personel kaydı bulunamadı'); return; }
    kartCont.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">${list.map(p => {
      const apt = S.apartmanlar.find(a=>a.id==p.aptId);
      const durumKey = p.durum||'aktif';
      const durumColor = durumKey==='aktif'?'var(--ok)':durumKey==='izinli'?'var(--warn)':'var(--err)';
      const init = (p.ad||' ').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
      return `<div class="card" style="border-top:3px solid ${durumColor}">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--brand),#4f46e5);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;flex-shrink:0">${init}</div>
          <div>
            <div style="font-weight:700;font-size:14px">${p.ad}</div>
            <div style="font-size:11.5px;color:var(--tx-3)">${perGorevLbl[p.gorev]||p.gorev||'—'}</div>
          </div>
          <span class="b ${durumCls[durumKey]||'b-gy'}" style="margin-left:auto">${durumLbl[durumKey]||p.durum}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin-bottom:12px">
          <div><span style="color:var(--tx-3)">Apartman:</span><br><strong>${apt?apt.ad:'Genel'}</strong></div>
          <div><span style="color:var(--tx-3)">Telefon:</span><br><strong>${p.tel||'—'}</strong></div>
          <div><span style="color:var(--tx-3)">Başlangıç:</span><br><strong>${p.bas||'—'}</strong></div>
          <div><span style="color:var(--tx-3)">Maaş:</span><br><strong style="color:var(--ok)">${p.maas?'₺'+fmt(p.maas):'-'}</strong></div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn bg xs" onclick="editPersonel(${p.id})"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Düzenle</button>
          <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delPersonel(${p.id})"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg> Sil</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  } else {
    if (kartCont) kartCont.style.display = 'none';
    if (tableCard) tableCard.style.display = '';
    const tb = document.getElementById('per-tbody'); if(!tb) return;
    if(!list.length){ tb.innerHTML=`<tr><td colspan="8">${emp('👷','Personel kaydı bulunamadı')}</td></tr>`; return; }
    tb.innerHTML = list.map(p => {
      const apt = S.apartmanlar.find(a=>a.id==p.aptId);
      return `<tr>
        <td><strong>${p.ad}</strong></td>
        <td><span class="b b-bl">${perGorevLbl[p.gorev]||p.gorev}</span></td>
        <td>${apt?apt.ad:'Genel'}</td>
        <td>${p.tel||'—'}</td>
        <td style="font-weight:700;color:var(--ok)">${p.maas?'₺'+fmt(p.maas):'—'}</td>
        <td class="t2" style="font-size:11px">${p.bas||'—'}</td>
        <td><span class="b ${durumCls[p.durum]||'b-gy'}">${durumLbl[p.durum]||p.durum}</span></td>
        <td><div class="act">
          <button class="btn bg xs" onclick="editPersonel(${p.id})" title="Düzenle"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delPersonel(${p.id})" title="Sil"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
        </div></td>
      </tr>`;
    }).join('');
  }
}

function savePersonel() {
  const ad = document.getElementById('per-ad').value.trim();
  const tel = document.getElementById('per-tel').value.trim();
  if(!ad||!tel){ toast('Ad ve Telefon zorunludur.','err'); return; }
  const aptId = document.getElementById('per-apt').value;
  const apt = S.apartmanlar.find(a=>a.id==aptId);
  const rec = {
    id: perEditId||Date.now(), ad,
    tc: document.getElementById('per-tc').value.trim(),
    gorev: document.getElementById('per-gorev').value,
    tel, email: document.getElementById('per-email').value.trim(),
    aptId: aptId?+aptId:null, aptAd: apt?apt.ad:'Genel',
    maas: parseFloat(document.getElementById('per-maas').value)||0,
    bas: document.getElementById('per-bas').value,
    iban: document.getElementById('per-iban').value.trim(),
    durum: document.getElementById('per-durum').value,
    not: document.getElementById('per-not').value.trim()
  };
  if(perEditId){ const i=S.personel.findIndex(x=>x.id===perEditId); if(i>=0) S.personel[i]=rec; }
  else S.personel.push(rec);
  perEditId=null;
  ['per-ad','per-tc','per-tel','per-email','per-maas','per-iban','per-not'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  save(); goTab('per-liste'); toast('Personel kaydedildi.','ok');
}

function editPersonel(id) {
  const p = S.personel.find(x=>x.id===id); if(!p) return;
  perEditId=id; goTab('per-form');
  setTimeout(()=>{
    const setV=(i,v)=>{ const el=document.getElementById(i); if(el) el.value=v||''; };
    setV('per-ad',p.ad); setV('per-tc',p.tc); setV('per-tel',p.tel); setV('per-email',p.email);
    const gEl=document.getElementById('per-gorev'); if(gEl) gEl.value=p.gorev;
    const aptEl=document.getElementById('per-apt');
    if(aptEl){ aptEl.innerHTML='<option value="">— Genel —</option>'+S.apartmanlar.map(a=>`<option value="${a.id}">${a.ad}</option>`).join(''); aptEl.value=p.aptId||''; }
    setV('per-maas',p.maas); setV('per-bas',p.bas); setV('per-iban',p.iban);
    const dEl=document.getElementById('per-durum'); if(dEl) dEl.value=p.durum;
    setV('per-not',p.not);
  },50);
}

function delPersonel(id) {
  if(!confirm('Bu personel silinsin mi?')) return;
  S.personel=S.personel.filter(x=>x.id!==id);
  save(); toast('Silindi.','warn');
}

// ══════════════════════════════════════════════════
// DUYURULAR MODÜLÜ
// ══════════════════════════════════════════════════
function renderDuyurular() {
  const bannerId = 'duy-apt-banner';
  const contentId = 'duy-content';
  if (!aptCtxCheck('duyurular', bannerId, contentId, 'duyuru ve iletişim')) return;
  const aptId = selectedAptId;
  const apt = S.apartmanlar.find(a=>a.id==aptId);
  renderAptBanner(bannerId, apt);

  // Forma apt kilitle
  const duyAptEl = document.getElementById('duy-apt');
  if(duyAptEl){ duyAptEl.innerHTML=`<option value="${apt.id}">${apt.ad}</option>`; duyAptEl.value=apt.id; duyAptEl.disabled=true; }

  const s=(document.getElementById('duy-srch')?.value||'').toLowerCase();
  const fTip=document.getElementById('duy-f-tip')?.value||'';

  // Bu apartmana ait + genel duyurular (aptId null olanlar)
  let list=S.duyurular.filter(x=>x.aptId==aptId||!x.aptId);
  if(fTip) list=list.filter(x=>x.tip===fTip);
  if(s) list=list.filter(x=>(x.baslik+' '+x.icerik).toLowerCase().includes(s));

  const grid=document.getElementById('duy-grid'); if(!grid) return;
  const tipRenk={genel:'b-bl',acil:'b-rd',bakim:'b-am',toplanti:'b-gr',finans:'b-gy'};
  const tipLbl={genel:'Genel',acil:'ACİL',bakim:'Bakım',toplanti:'Toplantı',finans:'Finansal'};
  if(!list.length){ grid.innerHTML=`<div style="grid-column:1/-1">${emp('📢','Bu apartmana ait duyuru bulunamadı')}</div>`; return; }
  grid.innerHTML=list.slice().reverse().map(d=>`
    <div class="card" style="border-left:3px solid var(--${d.tip==='acil'?'err':'brand'})">
      <div class="fbc mb8">
        <span class="b ${tipRenk[d.tip]||'b-gy'}">${tipLbl[d.tip]||d.tip}</span>
        <span class="t3" style="font-size:11px">${d.tarih||'—'}</span>
      </div>
      <div style="font-weight:700;font-size:14px;margin-bottom:6px">${d.baslik}</div>
      <div class="t3" style="font-size:12px;line-height:1.5">${(d.icerik||'').slice(0,120)}${(d.icerik||'').length>120?'…':''}</div>
      <div class="mt8 t3" style="font-size:11px">📍 ${d.aptAd||apt.ad}</div>
      <div class="fc g8 mt10">
        <button data-duyuru-okundu="${d.id}" class="btn bg xs" style="color:${(S.duyuruOkundu||{})[String(d.id)]?'var(--ok)':'var(--tx-3)'}" onclick="duyuruOkunduToggle(${d.id})">${(S.duyuruOkundu||{})[String(d.id)]?'✅ Okundu':'○ Okunmadı'}</button>
        <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delDuyuru(${d.id})"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg> Sil</button>
      </div>
    </div>`).join('');
  const bdg=document.getElementById('bdg-duy');
  if(bdg){ const acil=S.duyurular.filter(d=>d.tip==='acil').length; bdg.textContent=acil; bdg.style.display=acil?'':'none'; }
}

function saveDuyuru() {
  const baslik=document.getElementById('duy-baslik').value.trim();
  const icerik=document.getElementById('duy-icerik').value.trim();
  if(!baslik||!icerik){ toast('Başlık ve içerik zorunludur.','err'); return; }
  const aptId=document.getElementById('duy-apt').value;
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  S.duyurular.push({
    id:Date.now(), baslik, icerik, aptId:aptId?+aptId:null, aptAd:apt?apt.ad:'',
    tip:document.getElementById('duy-tip').value,
    tarih:document.getElementById('duy-tarih').value||today(),
    bitis:document.getElementById('duy-bitis').value
  });
  ['duy-baslik','duy-icerik'].forEach(i=>{ const el=document.getElementById(i); if(el) el.value=''; });
  save(); goTab('duy-liste'); toast('Duyuru yayınlandı.','ok');
}

function delDuyuru(id) {
  if(!confirm('Bu duyuru silinsin mi?')) return;
  S.duyurular=S.duyurular.filter(x=>x.id!==id);
  save(); toast('Silindi.','warn');
}

async function genDuyuru() {
  const baslik=document.getElementById('duy-baslik').value||'';
  const tip=document.getElementById('duy-tip').value;
  const aptId=document.getElementById('duy-apt').value;
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  const out=document.getElementById('duy-ai-out');
  out.textContent='AI duyuru taslağı oluşturuluyor…';
  const prompt=`Sen bir apartman yönetim şirketinin profesyonel yazışma uzmanısın.
Aşağıdaki bilgilere göre resmi bir duyuru metni yaz:
- Duyuru tipi: ${tip}
- Başlık: ${baslik||'(belirtilmedi)'}
- Apartman: ${apt?apt.ad:'Tüm apartmanlar'}
- Tarih: ${today()}
Duyuru; saygın, net, anlaşılır ve resmi olsun. 150-200 kelime arası. Selamlama ve imza ekle.`;
  out.textContent = await callAI(prompt);
}

function copyDuyuruAI() {
  const txt=document.getElementById('duy-ai-out').textContent;
  document.getElementById('duy-icerik').value=txt;
  toast('Metin forma kopyalandı.','ok');
}

// ══════════════════════════════════════════════════
// ARIZA & BAKIM MODÜLÜ
// ══════════════════════════════════════════════════
let arzNo = 1000;

function renderAriza() {
  const bannerId='arz-apt-banner', contentId='arz-content';
  if(!aptCtxCheck('ariza',bannerId,contentId,'arıza ve bakım')) return;
  const aptId=selectedAptId, apt=S.apartmanlar.find(a=>a.id==aptId);
  renderAptBanner(bannerId,apt);

  // Form apt kilitle
  const el=document.getElementById('arz-apt');
  if(el){el.innerHTML=`<option value="${apt.id}">${apt.ad}</option>`;el.value=apt.id;el.disabled=true;}
  // Tarih varsayılan
  const tEl=document.getElementById('arz-tarih');if(tEl&&!tEl.value)tEl.value=today();

  const s=(document.getElementById('arz-srch')?.value||'').toLowerCase();
  const fD=document.getElementById('arz-f-durum')?.value||'';
  const fO=document.getElementById('arz-f-oncelik')?.value||'';
  const fK=document.getElementById('arz-f-kat')?.value||'';
  const gorunum=document.getElementById('arz-f-gorunum')?.value||'kart';

  let list=S.arizalar.filter(x=>x.aptId==aptId);
  if(fD)list=list.filter(x=>x.durum===fD);
  if(fO)list=list.filter(x=>x.oncelik===fO);
  if(fK)list=list.filter(x=>x.kat===fK);
  if(s)list=list.filter(x=>(x.aciklama+' '+(x.konum||'')).toLowerCase().includes(s));

  const acik=list.filter(x=>x.durum==='acik').length;
  const devam=list.filter(x=>x.durum==='devam').length;
  const tamam=list.filter(x=>x.durum==='tamam').length;
  const topMal=list.reduce((s,x)=>s+(x.maliyetGercek||x.maliyetTahmini||0),0);
  ['ariza-acik','ariza-devam','ariza-tamam'].forEach((id,i)=>{const el=document.getElementById(id);if(el)el.textContent=[acik,devam,tamam][i];});
  const malEl=document.getElementById('ariza-maliyet');if(malEl)malEl.textContent='₺'+fmt(topMal);

  // Teknisyen listesi doldur
  const tekList=document.getElementById('arz-teknisyen-liste');
  if(tekList){
    const teknisyenler=[...new Set(S.arizalar.filter(x=>x.atanan).map(x=>x.atanan))];
    tekList.innerHTML=teknisyenler.length?teknisyenler.map(t=>`
      <div class="fbc" style="padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12.5px" onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''" onclick="document.getElementById('arz-atanan').value='${t}'">
        <span>👤 ${t}</span>
        <span class="t3" style="font-size:10.5px">${S.arizalar.filter(x=>x.atanan===t).length} arıza</span>
      </div>`).join(''):'<div class="t3" style="padding:10px;font-size:12px">Henüz teknisyen kaydı yok</div>';
  }

  const cont=document.getElementById('arz-liste-icerik');if(!cont)return;
  if(!list.length){cont.innerHTML=`<div class="card">${emp('🔧','Bu apartmanda arıza kaydı bulunamadı. "Yeni Arıza Bildir" ile ekleyin.')}</div>`;return;}

  const katIco={elektrik:'⚡',su:'💧',asansor:'🔼',cati:'🏠',guvenlik:'🔒',temizlik:'🧹',diger:'🔩'};
  const katRenk={elektrik:'#fbbf24',su:'#60a5fa',asansor:'#a78bfa',cati:'#f97316',guvenlik:'#ef4444',temizlik:'#34d399',diger:'#9ca3af'};
  const durumCls={acik:'b-rd',devam:'b-am',tamam:'b-gr'};
  const durumLbl={acik:'Açık',devam:'Devam Ediyor',tamam:'Tamamlandı'};
  const oncelikCls={acil:'b-rd',yuksek:'b-am',normal:'b-gy'};

  if(gorunum==='kart'){
    const sorted=list.slice().sort((a,b)=>{const p={acil:0,yuksek:1,normal:2};return (p[a.oncelik]||2)-(p[b.oncelik]||2);});
    cont.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">${sorted.map(a=>`
      <div class="arz-kart ${a.oncelik}-card">
        <div class="arz-kart-head">
          <div class="arz-kat-ico" style="background:${katRenk[a.kat]||'#9ca3af'}22">${katIco[a.kat]||'🔩'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.aciklama||'—'}</div>
            <div style="font-size:11px;color:var(--tx-3);margin-top:2px">${a.konum||'—'} · <span class="b ${oncelikCls[a.oncelik]}" style="font-size:10px">${a.oncelik}</span></div>
          </div>
          <span class="arz-no">#${a.no||'?'}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin-bottom:10px">
          <div><span style="color:var(--tx-3)">Atanan:</span> <strong>${a.atanan||'—'}</strong></div>
          <div><span style="color:var(--tx-3)">Tarih:</span> <strong>${a.tarih||'—'}</strong></div>
          <div><span style="color:var(--tx-3)">Maliyet:</span> <strong style="color:var(--warn)">${(a.maliyetGercek||a.maliyetTahmini)?'₺'+fmt(a.maliyetGercek||a.maliyetTahmini):'—'}</strong></div>
          <div><span style="color:var(--tx-3)">Hedef:</span> <strong>${a.hedef||'—'}</strong></div>
        </div>
        <div class="fbc">
          <span class="b ${durumCls[a.durum]||'b-gy'}">${durumLbl[a.durum]||a.durum}</span>
          <div class="act">
            ${a.durum==='acik'?`<button class="btn bg sm" onclick="setArizaDurum(${a.id},'devam')">▶ Başlat</button>`:''}
            ${a.durum!=='tamam'?`<button class="btn bgn sm" onclick="setArizaDurum(${a.id},'tamam')">✓ Bitir</button>`:''}
            <button class="btn bg sm" onclick="editAriza(${a.id})" title="Düzenle">✏️</button>
            <button class="btn sm" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err-bd)" onclick="delAriza(${a.id})" title="Sil">🗑</button>
          </div>
        </div>
      </div>`).join('')}</div>`;
  } else if(gorunum==='kanban') {
    const aciklar=list.filter(x=>x.durum==='acik');
    const devamlar=list.filter(x=>x.durum==='devam');
    const tamamlar=list.filter(x=>x.durum==='tamam');
    function kanbanKart(a) {
      return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;box-shadow:var(--sh-xs)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:16px">${katIco[a.kat]||'🔩'}</span>
          <div style="flex:1;font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.aciklama||'—'}</div>
          <span class="b ${oncelikCls[a.oncelik]||'b-gy'}" style="font-size:10px">${a.oncelik||'—'}</span>
        </div>
        <div style="font-size:11px;color:var(--tx-3);margin-bottom:8px">${a.konum||'—'} · ${a.atanan||'Atanmamış'}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${a.durum==='acik'?`<button class="btn bg xs" onclick="setArizaDurum(${a.id},'devam')">▶ Başlat</button>`:''}
          ${a.durum==='devam'?`<button class="btn bgn xs" onclick="setArizaDurum(${a.id},'tamam')">✓ Tamamla</button>`:''}
          ${a.durum!=='tamam'?`<button class="btn xs" style="background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok-bd)" onclick="setArizaDurum(${a.id},'tamam')">✓</button>`:''}
          <button class="btn bg xs" onclick="editAriza(${a.id})" title="Düzenle">✏️</button>
        </div>
      </div>`;
    }
    cont.innerHTML=`<div class="kanban-grid">
      <div style="background:var(--err-bg);border-radius:12px;padding:12px">
        <div style="font-weight:700;font-size:12px;color:var(--err);margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--err);display:inline-block"></span>
          BEKLEYEN <span style="margin-left:auto;background:var(--err);color:#fff;font-size:10px;padding:1px 6px;border-radius:10px">${aciklar.length}</span>
        </div>
        ${aciklar.length?aciklar.slice().sort((a,b)=>{const p={acil:0,yuksek:1,normal:2};return (p[a.oncelik]||2)-(p[b.oncelik]||2);}).map(kanbanKart).join(''):'<div style="text-align:center;padding:20px;font-size:12px;color:var(--tx-4)">Arıza yok</div>'}
      </div>
      <div style="background:var(--warn-bg);border-radius:12px;padding:12px">
        <div style="font-weight:700;font-size:12px;color:var(--warn);margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--warn);display:inline-block"></span>
          DEVAM EDİYOR <span style="margin-left:auto;background:var(--warn);color:#fff;font-size:10px;padding:1px 6px;border-radius:10px">${devamlar.length}</span>
        </div>
        ${devamlar.length?devamlar.map(kanbanKart).join(''):'<div style="text-align:center;padding:20px;font-size:12px;color:var(--tx-4)">Arıza yok</div>'}
      </div>
      <div style="background:var(--ok-bg);border-radius:12px;padding:12px">
        <div style="font-weight:700;font-size:12px;color:var(--ok);margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--ok);display:inline-block"></span>
          TAMAMLANDI <span style="margin-left:auto;background:var(--ok);color:#fff;font-size:10px;padding:1px 6px;border-radius:10px">${tamamlar.length}</span>
        </div>
        ${tamamlar.length?tamamlar.slice(-10).map(kanbanKart).join(''):'<div style="text-align:center;padding:20px;font-size:12px;color:var(--tx-4)">Arıza yok</div>'}
      </div>
    </div>`;
  } else {
    cont.innerHTML=`<div class="card"><div class="tw"><table>
      <thead><tr><th>#</th><th>Açıklama</th><th>Kat</th><th>Konum</th><th>Öncelik</th><th>Atanan</th><th>Tarih</th><th>Durum</th><th>Maliyet</th><th>İşlem</th></tr></thead>
      <tbody>${list.map(a=>`<tr>
        <td style="font-family:monospace;font-size:11px">#${a.no||'?'}</td>
        <td style="font-size:12.5px">${(a.aciklama||'').slice(0,50)}${(a.aciklama||'').length>50?'…':''}</td>
        <td><span style="font-size:16px">${katIco[a.kat]||'🔩'}</span></td>
        <td class="t2" style="font-size:11.5px">${a.konum||'—'}</td>
        <td><span class="b ${oncelikCls[a.oncelik]||'b-gy'}">${a.oncelik}</span></td>
        <td style="font-size:12px">${a.atanan||'—'}</td>
        <td class="t2" style="font-size:11px">${a.tarih||'—'}</td>
        <td><span class="b ${durumCls[a.durum]||'b-gy'}">${durumLbl[a.durum]||a.durum}</span></td>
        <td style="font-weight:700">${(a.maliyetGercek||a.maliyetTahmini)?'₺'+fmt(a.maliyetGercek||a.maliyetTahmini):'—'}</td>
        <td><div class="act">
          ${a.durum!=='tamam'?`<button class="btn bgn xs" onclick="setArizaDurum(${a.id},'tamam')" title="Tamamla">✓</button>`:''}
          <button class="btn bg xs" onclick="editAriza(${a.id})" title="Düzenle">✏️</button>
          <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delAriza(${a.id})" title="Sil">🗑</button>
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  }
  const bdg=document.getElementById('bdg-ariza');
  if(bdg){bdg.textContent=acik;bdg.style.display=acik?'':'none';}
}
function saveAriza() {
  const aptId=selectedAptId||document.getElementById('arz-apt')?.value;
  const aciklama=document.getElementById('arz-aciklama')?.value.trim();
  if(!aciklama||!aptId){toast('Açıklama zorunludur.','err');return;}
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  if(!arzNo)arzNo=1000; arzNo++;
  const rec={
    id:arzEditId||Date.now(), no:arzNo,
    aptId:+aptId, aptAd:apt?apt.ad:'',
    konum:document.getElementById('arz-konum')?.value.trim()||'',
    kat:document.getElementById('arz-kat')?.value||'diger',
    oncelik:document.getElementById('arz-oncelik')?.value||'normal',
    atanan:document.getElementById('arz-atanan')?.value.trim()||'',
    atananTel:document.getElementById('arz-atanan-tel')?.value.trim()||'',
    maliyetTahmini:parseFloat(document.getElementById('arz-maliyet-tahmini')?.value)||0,
    maliyetGercek:parseFloat(document.getElementById('arz-maliyet-gercek')?.value)||0,
    tarih:document.getElementById('arz-tarih')?.value||today(),
    hedef:document.getElementById('arz-hedef')?.value||'',
    durum:document.getElementById('arz-durum-yeni')?.value||'acik',
    aciklama, islemNot:document.getElementById('arz-islem-not')?.value.trim()||''
  };
  if(arzEditId){const i=S.arizalar.findIndex(x=>x.id===arzEditId);if(i>=0)S.arizalar[i]=rec;arzEditId=null;}
  else S.arizalar.push(rec);
  // Formu temizle
  ['arz-konum','arz-atanan','arz-atanan-tel','arz-maliyet-tahmini','arz-maliyet-gercek','arz-hedef','arz-aciklama','arz-islem-not'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  save();goTab('arz-liste');toast('Arıza kaydedildi.','ok');
}

let arzEditId=null;
function editAriza(id){
  const a=S.arizalar.find(x=>x.id===id);if(!a)return;
  arzEditId=id;goTab('arz-yeni');
  setTimeout(()=>{
    const setV=(i,v)=>{const el=document.getElementById(i);if(el)el.value=v||'';};
    setV('arz-konum',a.konum);setV('arz-atanan',a.atanan);setV('arz-atanan-tel',a.atananTel);
    setV('arz-maliyet-tahmini',a.maliyetTahmini);setV('arz-maliyet-gercek',a.maliyetGercek);
    setV('arz-tarih',a.tarih);setV('arz-hedef',a.hedef);setV('arz-aciklama',a.aciklama);setV('arz-islem-not',a.islemNot);
    const katEl=document.getElementById('arz-kat');if(katEl)katEl.value=a.kat;
    const onEl=document.getElementById('arz-oncelik');if(onEl)onEl.value=a.oncelik;
    const dEl=document.getElementById('arz-durum-yeni');if(dEl)dEl.value=a.durum;
  },80);
}

function topluDurumGuncelle(){
  const aptId=selectedAptId;if(!aptId)return;
  const list=S.arizalar.filter(x=>x.aptId==aptId&&x.durum!=='tamam');
  if(!list.length){toast('Tüm arızalar tamamlandı.','ok');return;}
  if(!confirm(`${list.length} açık/devam eden arıza tamamlandı olarak işaretlensin mi?`))return;
  list.forEach(a=>a.durum='tamam');
  save();toast(list.length+' arıza tamamlandı.','ok');
}

function arzTopluSatirEkle(n=1){
  const c=document.getElementById('arz-toplu-rows');if(!c)return;
  for(let i=0;i<n;i++){
    const d=document.createElement('div');
    d.style.cssText='display:grid;grid-template-columns:1fr 80px 80px 80px 130px 90px 32px;gap:6px;margin-bottom:6px;align-items:center';
    d.innerHTML=`
      <input class="fi" placeholder="Arıza açıklaması *" style="padding:6px 8px;font-size:12px" data-col="aciklama">
      <select class="fi" style="padding:5px 6px;font-size:11px" data-col="kat">
        <option value="elektrik">⚡Elektrik</option><option value="su">💧Su</option>
        <option value="asansor">🔼Asansör</option><option value="cati">🏠Çatı</option>
        <option value="guvenlik">🔒Güvenlik</option><option value="temizlik">🧹Temizlik</option><option value="diger">🔩Diğer</option>
      </select>
      <select class="fi" style="padding:5px 6px;font-size:11px" data-col="oncelik">
        <option value="normal">Normal</option><option value="yuksek">Yüksek</option><option value="acil">🚨Acil</option>
      </select>
      <input class="fi" placeholder="Konum" style="padding:6px 8px;font-size:12px" data-col="konum">
      <input class="fi" placeholder="Atanan" style="padding:6px 8px;font-size:12px" data-col="atanan">
      <input class="fi" placeholder="₺ tahmin" type="number" style="padding:6px 8px;font-size:12px" data-col="maliyet">
      <button onclick="this.parentElement.remove()" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err);border-radius:6px;padding:4px 6px;cursor:pointer;font-size:12px">✕</button>`;
    c.appendChild(d);
  }
}

function saveTopluAriza(){
  const aptId=selectedAptId;if(!aptId){toast('Apartman seçilmedi.','err');return;}
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  const c=document.getElementById('arz-toplu-rows');
  if(!c||!c.children.length){toast('En az bir satır ekleyin.','err');return;}
  let ok=0,hata=[];
  if(!arzNo)arzNo=1000;
  Array.from(c.children).forEach((satir,i)=>{
    const g=(col)=>satir.querySelector('[data-col="'+col+'"]')?.value?.trim()||'';
    const aciklama=g('aciklama');
    if(!aciklama){if(g('kat'))hata.push('Satır '+(i+1)+': Açıklama zorunlu');return;}
    arzNo++;
    S.arizalar.push({
      id:Date.now()+i+Math.random(),no:arzNo,aptId:+aptId,aptAd:apt?apt.ad:'',
      aciklama,kat:g('kat')||'diger',oncelik:g('oncelik')||'normal',
      konum:g('konum'),atanan:g('atanan'),maliyetTahmini:parseFloat(g('maliyet'))||0,
      tarih:today(),durum:'acik'
    });
    ok++;
  });
  if(ok>0)save();
  const sonuc=document.getElementById('arz-toplu-sonuc');
  sonuc.innerHTML=`<div style="padding:10px;border-radius:8px;font-size:13px;color:var(--ok);font-weight:700">✅ ${ok} arıza kaydedildi.</div>${hata.length?`<div style="color:var(--err);font-size:12px">${hata.join('<br>')}</div>`:''}`;
  sonuc.style.display='';
  if(ok>0)toast(ok+' arıza eklendi.','ok');
}

async function genArizaAI(){
  const aptId=selectedAptId;if(!aptId)return;
  const w=document.getElementById('arz-ai-wrap');if(w)w.style.display='';
  const out=document.getElementById('arz-ai-out');out.textContent='Arızalar analiz ediliyor…';
  const arizalar=S.arizalar.filter(x=>x.aptId==aptId);
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  const prompt=`Sen bir bina bakım uzmanısın. Aşağıdaki arıza verilerini analiz et ve rapor sun:

Apartman: ${apt?.ad||''}
Toplam arıza: ${arizalar.length}
Açık: ${arizalar.filter(x=>x.durum==='acik').length}
Devam eden: ${arizalar.filter(x=>x.durum==='devam').length}
Tamamlanan: ${arizalar.filter(x=>x.durum==='tamam').length}
Toplam maliyet: ₺${fmt(arizalar.reduce((s,x)=>s+(x.maliyetGercek||x.maliyetTahmini||0),0))}

Açık arızalar:
${arizalar.filter(x=>x.durum==='acik').map(function(a){ return '- '+(a.kat||'?')+': '+(a.aciklama||'').replace(/\n/g,' ').slice(0,60)+' ('+a.oncelik+', ₺'+(a.maliyetTahmini||0)+')'; }).join('\n')}

Öncelik sırası, toplam maliyet tahmini, bakım önerileri ve risk analizi yap. Türkçe, kısa ve pratik ol.`;
  out.textContent=await callAI(prompt);
}

async function genArizaTekIstimasi(){
  const aciklama=document.getElementById('arz-aciklama')?.value;
  const kat=document.getElementById('arz-kat')?.value;
  const out=document.getElementById('arz-yeni-ai-out');if(!out)return;
  out.textContent='Maliyet tahmini hesaplanıyor…';
  const prompt=`Sen bir bina teknik servisi uzmanısın. Türkiye 2025 piyasa fiyatlarına göre aşağıdaki arıza için maliyet ve çözüm tahmini yap:

Kategori: ${kat}
Arıza: ${aciklama||'(belirtilmedi)'}

Şunları ver: 1) Tahmini maliyet aralığı, 2) Ortalama tamir süresi, 3) Önce yapılacaklar, 4) Dikkat edilecekler. Kısa tablo formatında.`;
  out.textContent=await callAI(prompt);
}

async function genBakimPlan(){
  const aptId=selectedAptId;if(!aptId)return;
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  const out=document.getElementById('arz-plan-ai-out');if(!out)return;
  out.textContent='Bakım planı oluşturuluyor…';
  const prompt=`Aşağıdaki apartman için kapsamlı yıllık bakım planı oluştur:

Apartman: ${apt?.ad||''}
Daire sayısı: ${apt?.daireSayisi||0}
Kat sayısı: ${apt?.katSayisi||0}
Asansör: ${apt?.asansor||'hayir'}
İnşaat yılı: ${apt?.insaatYili||'bilinmiyor'}
Geçmiş arızalar: ${S.arizalar.filter(x=>x.aptId==aptId).map(a=>a.kat).join(', ')||'yok'}

Aylık, 3 aylık, 6 aylık ve yıllık bakım takvimi hazırla. Türkçe, madde madde liste formatında.`;
  out.textContent=await callAI(prompt);
}

const bakimKalemleri=[];
function saveBakimKalem(){
  const ekipman=document.getElementById('bp-ekipman')?.value.trim();
  if(!ekipman){toast('Ekipman adı zorunlu.','err');return;}
  bakimKalemleri.push({
    id:Date.now(),ekipman,
    periyot:document.getElementById('bp-periyot')?.value||'aylik',
    son:document.getElementById('bp-son')?.value||today(),
    sorumlu:document.getElementById('bp-sorumlu')?.value.trim()||''
  });
  renderBakimPlan();
  ['bp-ekipman','bp-sorumlu'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  toast('Bakım kalemi eklendi.','ok');
}

function renderBakimPlan(){
  const el=document.getElementById('bakim-plan-liste');if(!el)return;
  if(!bakimKalemleri.length){el.innerHTML='<div class="t3" style="padding:10px;font-size:12px">Bakım kalemi eklenmedi</div>';return;}
  const perLbl={aylik:'Aylık',yillik:'Yıllık','3aylik':'3 Aylık','6aylik':'6 Aylık'};
  el.innerHTML=bakimKalemleri.map(k=>`<div class="fbc" style="padding:8px 10px;background:var(--s2);border-radius:8px;margin-bottom:6px;font-size:12.5px">
    <div><strong>${k.ekipman}</strong> · <span class="t3">${perLbl[k.periyot]||k.periyot}</span></div>
    <div class="fc g8"><span class="t3" style="font-size:11px">Son: ${k.son}</span>${k.sorumlu?`<span class="t3" style="font-size:11px">· ${k.sorumlu}</span>`:''}</div>
    <button onclick="bakimKalemleri.splice(bakimKalemleri.findIndex(x=>x.id==${k.id}),1);renderBakimPlan()" style="background:var(--err-bg);color:var(--err);border:none;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:11px">✕</button>
  </div>`).join('');
}
function setArizaDurum(id,durum) {
  const a=S.arizalar.find(x=>x.id===id); if(!a) return;
  a.durum=durum;
  save(); toast(durum==='tamam'?'Arıza tamamlandı.':'Arıza başlatıldı.','ok');
}

function delAriza(id) {
  if(!confirm('Bu arıza kaydı silinsin mi?')) return;
  S.arizalar=S.arizalar.filter(x=>x.id!==id);
  save(); toast('Silindi.','warn');
}

async function genArizaRapor() {
  const aciklama=document.getElementById('arz-aciklama').value;
  const kat=document.getElementById('arz-kat').value;
  const out=document.getElementById('arz-ai-out');
  out.textContent='AI analiz yapıyor…';
  const prompt=`Sen bir bina teknik danışmanısın. Aşağıdaki arıza için tahmini maliyet, muhtemel nedenler ve çözüm önerisi sun:
Kategori: ${kat}
Açıklama: ${aciklama||'(belirtilmedi)'}
Türkiye piyasa fiyatlarına göre tahmin yap. Kısa ve net tablo formatında yaz.`;
  out.textContent = await callAI(prompt);
}

// ══════════════════════════════════════════════════
// TAHSİLAT & BORÇ MODÜLÜ
// ══════════════════════════════════════════════════
let makbuzNo = 5000;

function renderTahsilat() {
  const bannerId='tah-apt-banner',contentId='tah-content';
  if(!aptCtxCheck('tahsilat',bannerId,contentId,'tahsilat ve borç'))return;
  const aptId=selectedAptId,apt=S.apartmanlar.find(a=>a.id==aptId);
  renderAptBanner(bannerId,apt);

  // Dropdown'ları kilitli apt'a sabitle
  const oAptEl=document.getElementById('tah-o-apt');
  if(oAptEl){oAptEl.innerHTML=`<option value="${apt.id}">${apt.ad}</option>`;oAptEl.value=apt.id;oAptEl.disabled=true;loadSakinForOdeme();}

  const s=(document.getElementById('tah-srch')?.value||'').toLowerCase();
  const fD=document.getElementById('tah-f-durum')?.value||'';
  const fR=document.getElementById('tah-f-risk')?.value||'';

  let list=S.sakinler.filter(x=>x.aptId==aptId);
  if(fD==='borclu')list=list.filter(x=>(x.borc||0)>0);
  if(fD==='temiz')list=list.filter(x=>!(x.borc||0));
  if(s)list=list.filter(x=>(x.ad+' '+(x.daire||'')).toLowerCase().includes(s));
  if(fR){
    list=list.filter(x=>{
      const b=x.borc||0;
      if(fR==='yuksek')return b>3000;
      if(fR==='orta')return b>500&&b<=3000;
      if(fR==='dusuk')return b>0&&b<=500;
      return true;
    });
  }

  const topBorc=list.reduce((s,x)=>s+(x.borc||0),0);
  const borclu=list.filter(x=>(x.borc||0)>0).length;
  const topAidat=list.reduce((s,x)=>s+(x.aidat||0),0);
  const tahsilat=S.tahsilatlar.filter(x=>x.aptId==aptId).reduce((s,x)=>s+(x.tutar||0),0);

  const stats=document.getElementById('tah-stats');
  if(stats) stats.innerHTML=`
    <div class="sc"><div class="sc-ico ic-rd"><svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">&#8378;</text></svg></div><div class="sc-lbl">Toplam Alacak</div><div class="sc-val v-rd">₺${fmt(topBorc)}</div><div class="sc-sub">${borclu} borçlu sakin</div><div class="sc-bar bar-rd"></div></div>
    <div class="sc"><div class="sc-ico ic-gr"><svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg></div><div class="sc-lbl">Toplam Tahsilat</div><div class="sc-val v-gr">₺${fmt(tahsilat)}</div><div class="sc-sub">Bu apartman</div><div class="sc-bar bar-gr"></div></div>
    <div class="sc"><div class="sc-ico ic-bl"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div class="sc-lbl">Sakin</div><div class="sc-val v-bl">${list.length}</div><div class="sc-sub">${list.length-borclu} temiz</div><div class="sc-bar bar-bl"></div></div>
    <div class="sc"><div class="sc-ico ic-am"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><div class="sc-lbl">Tahsilat Oranı</div><div class="sc-val v-am">${list.length?Math.round(((list.length-borclu)/list.length)*100):100}%</div><div class="sc-sub">Bu dönem</div><div class="sc-bar bar-am"></div></div>`;

  // Toplu tahsilat sayfasını doldur
  renderTopluTahsilat(aptId);

  const tb=document.getElementById('tah-tbody');if(!tb)return;
  if(!list.length){tb.innerHTML=`<tr><td colspan="10">${emp('💰','Bu apartmanda sakin bulunamadı')}</td></tr>`;return;}
  tb.innerHTML=list.map(sk=>{
    const borc=sk.borc||0;
    const risk=borc>3000?'<span class="b b-rd">Yüksek</span>':borc>500?'<span class="b b-am">Orta</span>':'<span class="b b-gr">Düşük</span>';
    const sonOdeme=S.tahsilatlar.filter(x=>x.sakId==sk.id).sort((a,b)=>b.tarih?.localeCompare(a.tarih||'')).slice(0,1)[0];
    return `<tr>
      <td><input type="checkbox" class="tah-chk" data-id="${sk.id}" onchange="updateTahSecili()"></td>
      <td><strong>${sk.ad}</strong><div class="t3" style="font-size:10.5px">${sk.tip==='malik'?'Malik':'Kiracı'}</div></td>
      <td style="font-weight:700;color:var(--brand)">${sk.daire||'—'}</td>
      <td><span class="b ${sk.tip==='malik'?'b-bl':'b-am'}" style="font-size:10px">${sk.tip==='malik'?'Malik':'Kiracı'}</span></td>
      <td style="color:var(--ok)">${sk.aidat?'₺'+fmt(sk.aidat)+'/ay':'—'}</td>
      <td style="font-weight:700;color:${borc>0?'var(--err)':'var(--ok)'}">${borc>0?'₺'+fmt(borc):'₺0'}</td>
      <td class="t2" style="font-size:11px">—</td>
      <td class="t2" style="font-size:11px">${sonOdeme?sonOdeme.tarih:'—'}</td>
      <td>${risk}</td>
      <td><div class="act">
        <button class="btn bgn xs" onclick="hizliOdeme(${sk.id})" title="Ödeme Al">₺</button>
        <button class="btn bg xs" onclick="borcGuncelle(${sk.id})" title="Borç Düzenle">📝</button>
      </div></td>
    </tr>`;
  }).join('');

  const bdg=document.getElementById('bdg-borc');
  if(bdg){const b=S.sakinler.filter(x=>x.aptId==aptId&&(x.borc||0)>0).length;bdg.textContent=b;bdg.style.display=b?'':'none';}
}

function updateTahSecili(){
  const checked=document.querySelectorAll('.tah-chk:checked');
  const panel=document.getElementById('tah-secili-panel');
  const info=document.getElementById('tah-secili-info');
  if(panel)panel.style.display=checked.length?'':'none';
  if(info)info.textContent=checked.length+' sakin seçildi';
  const allChk=document.getElementById('tah-chk-all');
  if(allChk){const all=document.querySelectorAll('.tah-chk');allChk.indeterminate=checked.length>0&&checked.length<all.length;allChk.checked=checked.length>0&&checked.length===all.length;}
}

function toggleAllBorclu(chk){
  document.querySelectorAll('.tah-chk').forEach(c=>c.checked=chk.checked);
  updateTahSecili();
}

function saveSeciliOdeme(){
  const checked=[...document.querySelectorAll('.tah-chk:checked')].map(c=>+c.dataset.id);
  if(!checked.length){toast('Sakin seçilmedi.','err');return;}
  const tarih=document.getElementById('tah-secili-tarih')?.value||today();
  const yontem=document.getElementById('tah-secili-yontem')?.value||'nakit';
  const aptId=selectedAptId;
  const now=new Date();
  const donemStr=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  let ok=0;
  if(!makbuzNo)makbuzNo=5000;
  checked.forEach(id=>{
    const sk=S.sakinler.find(x=>x.id===id);if(!sk)return;
    if((sk.aidat||0)<=0)return;
    const apt=S.apartmanlar.find(a=>a.id==sk.aptId);
    makbuzNo++;
    S.tahsilatlar.push({
      id:Date.now()+ok,no:'M-'+makbuzNo,sakId:sk.id,sakAd:sk.ad,
      aptId:+aptId,aptAd:apt?apt.ad:(sk.aptAd||''),daire:sk.daire,
      tip:'aidat',donem:donemStr,tutar:sk.aidat||0,tarih,yontem,not:'Toplu tahsilat'
    });
    if((sk.borc||0)>0)sk.borc=Math.max(0,(sk.borc||0)-(sk.aidat||0));
    ok++;
  });
  if(ok){save();refreshCariIfOpen();if(typeof renderTahsilat==='function')try{renderTahsilat();}catch(e){}}
  document.querySelectorAll('.tah-chk').forEach(c=>c.checked=false);
  updateTahSecili();
  toast(ok+' sakin için ödeme kaydedildi.','ok');
}

function topluAidatOlustur(){
  const aptId=selectedAptId;if(!aptId){toast('Lütfen önce bir apartman seçin.','warn');return;}
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  const aptAidat=apt?apt.aidat||0:0;
  const sakinler=S.sakinler.filter(x=>x.aptId==aptId);
  if(!sakinler.length){toast('Bu apartmanda sakin bulunamadı.','warn');return;}

  // Her sakinin kendi aidatı varsa onu, yoksa apartman aidatını kullan
  const aidatliSakinler=sakinler.filter(sk=>(sk.aidat||0)>0||aptAidat>0);
  if(!aidatliSakinler.length){toast('Aidatı olan sakin bulunamadı.','warn');return;}

  // Dönem bilgisi: mevcut ay
  const now=new Date();
  const donemStr=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const donemLabel=now.toLocaleDateString('tr-TR',{month:'long',year:'numeric'});

  // Daha önce bu dönem için borçlandırma yapılmış mı kontrol et
  if(!S.aidatBorclandir) S.aidatBorclandir=[];
  const oncekiKayit=S.aidatBorclandir.find(k=>k.aptId==aptId&&k.donem===donemStr);
  if(oncekiKayit){
    if(!confirm(`${donemLabel} dönemi için daha önce borçlandırma yapılmış. Tekrar borçlandırma yapmak istiyor musunuz?`))return;
  }

  let toplamBorc=0;
  let sakinSayisi=0;
  const detaylar=[];

  if(!confirm(`${aidatliSakinler.length} sakin için ${donemLabel} aidatı borçlandırılsın mı?`))return;

  const kayitId = Date.now();
  aidatliSakinler.forEach((sk,i)=>{
    const aidat=sk.aidat||aptAidat;
    if(aidat>0){
      sk.borc=(sk.borc||0)+aidat;
      toplamBorc+=aidat;
      sakinSayisi++;
      detaylar.push({id:kayitId+i,sakId:sk.id,ad:sk.ad,daire:sk.daire,tutar:aidat,kategori:'Aidat',aciklama:'',tarih:today()});
    }
  });

  // Borçlandırma kaydını tut
  S.aidatBorclandir.push({id:kayitId,aptId:aptId,aptAd:apt?apt.ad:'',donem:donemStr,tarih:today(),sonOdeme:'',kategori:'Aidat',aciklama:'',sakinSayisi:sakinSayisi,toplamBorc:toplamBorc,detaylar:detaylar});

  save();
  toast(`${sakinSayisi} sakin için ${donemLabel} aidatı borçlandırıldı. Toplam: ₺${fmt(toplamBorc)}`,'ok');
  if(typeof renderTahsilat==='function') try{renderTahsilat();}catch(e){}
  if(typeof renderFinansalDurum==='function') try{renderFinansalDurum();}catch(e){}
  refreshCariIfOpen();
}

function renderTopluTahsilat(aptId){
  const c=document.getElementById('tah-toplu-rows');if(!c)return;
  const sakinler=S.sakinler.filter(x=>x.aptId==aptId);
  const yontem=document.getElementById('tah-t-yontem')?.value||'nakit';
  c.innerHTML=sakinler.map((sk,i)=>`
    <div class="odeme-row" data-sak="${sk.id}">
      <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${sk.ad}">${sk.ad}</div>
      <div style="font-size:11px;color:var(--brand);font-weight:700">${sk.daire||'—'}</div>
      <div style="font-size:11.5px;color:var(--ok)">${sk.aidat?'₺'+fmt(sk.aidat):'-'}</div>
      <input type="number" class="fi sm toplu-tutar" data-sak="${sk.id}" placeholder="0" style="padding:5px 8px;font-size:12px" oninput="calcTopluToplam()">
      <select class="fi sm toplu-yontem" data-sak="${sk.id}" style="padding:5px 6px;font-size:11px">
        <option value="nakit"${yontem==='nakit'?' selected':''}>Nakit</option>
        <option value="banka"${yontem==='banka'?' selected':''}>Banka</option>
        <option value="eft"${yontem==='eft'?' selected':''}>EFT</option>
        <option value="kredi"${yontem==='kredi'?' selected':''}>K.Kartı</option>
      </select>
      <button class="btn bg xs" style="font-size:11px" onclick="document.querySelector('[data-col-sak=\"${sk.id}\"] .toplu-tutar').value=''" title="Sil">✕</button>
    </div>`).join('');
}

function setTopluYontem(){
  const y=document.getElementById('tah-t-yontem')?.value||'nakit';
  document.querySelectorAll('.toplu-yontem').forEach(el=>el.value=y);
}

function tümSakinAidat(){
  document.querySelectorAll('.toplu-tutar').forEach(inp=>{
    const sakId=+inp.dataset.sak;
    const sk=S.sakinler.find(x=>x.id===sakId);
    if(sk&&sk.aidat)inp.value=sk.aidat;
  });
  calcTopluToplam();
}

function calcTopluToplam(){
  let toplam=0;
  document.querySelectorAll('.toplu-tutar').forEach(inp=>{toplam+=parseFloat(inp.value)||0;});
  const el=document.getElementById('tah-toplu-toplam');
  if(el)el.textContent='Toplam: ₺'+fmt(toplam);
}

function saveTopluOdeme(){
  const aptId=selectedAptId;if(!aptId){toast('Apartman seçilmedi.','err');return;}
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  const donem=document.getElementById('tah-t-donem')?.value||'';
  const tarih=document.getElementById('tah-t-tarih')?.value||today();
  if(!makbuzNo)makbuzNo=5000;
  let ok=0;
  document.querySelectorAll('.toplu-tutar').forEach(inp=>{
    const tutar=parseFloat(inp.value)||0;if(!tutar)return;
    const sakId=+inp.dataset.sak;
    const sk=S.sakinler.find(x=>x.id===sakId);if(!sk)return;
    const yontem=document.querySelector(`.toplu-yontem[data-sak="${sakId}"]`)?.value||'nakit';
    makbuzNo++;
    S.tahsilatlar.push({
      id:Date.now()+ok,no:'M-'+makbuzNo,sakId,sakAd:sk.ad,
      aptId:+aptId,aptAd:apt?apt.ad:'',daire:sk.daire,
      tip:'aidat',donem,tutar,tarih,yontem,not:''
    });
    if((sk.borc||0)>0)sk.borc=Math.max(0,(sk.borc||0)-tutar);
    inp.value='';ok++;
  });
  if(ok){save();calcTopluToplam();refreshCariIfOpen();}
  const sonuc=document.getElementById('tah-toplu-sonuc');
  if(sonuc){sonuc.innerHTML=`<div style="padding:10px;border-radius:8px;font-size:13px;color:var(--ok);font-weight:700">✅ ${ok} sakin için toplam ₺${fmt(document.querySelectorAll('.toplu-tutar').length)} ödeme kaydedildi.</div>`;sonuc.style.display='';}
  toast(ok+' ödeme kaydedildi.','ok');
}

// Banka Hareketi
let bankRows=[];

function handleBankDragOver(e){e.preventDefault();document.getElementById('bank-drop-zone')?.classList.add('drag');}
function handleBankDrop(e){
  e.preventDefault();document.getElementById('bank-drop-zone')?.classList.remove('drag');
  const file=e.dataTransfer?.files[0];if(file)parseBankFile(file);
}

function importBankaHareketi(input){
  const file=input.files[0];if(!file)return;
  parseBankFile(file);input.value='';
}

function parseBankFile(file){
  const isXlsx=/\.(xlsx|xls|xlsm)$/i.test(file.name);
  if(isXlsx){
    if(typeof XLSX==='undefined'){toast('XLSX kütüphanesi yüklenemedi.','err');return;}
    const reader=new FileReader();
    reader.onload=(e)=>{
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        _bankProcessRows(rows,file);
      }catch(err){toast('Excel okunamadı: '+err.message,'err');}
    };
    reader.readAsArrayBuffer(file);
  }else{
    const reader=new FileReader();
    reader.onload=(e)=>{
      const lines=e.target.result.split('\n').filter(l=>l.trim());
      const rows=lines.map(l=>l.split(/[,;\t]/).map(x=>x.trim().replace(/^"|"$/g,'')));
      _bankProcessRows(rows,file);
    };
    reader.readAsText(file,'UTF-8');
  }
}

function _bankProcessRows(rows,file){
  bankRows=[];
  // Header satırını atla
  let start=0;
  if(rows.length>0){
    const hdr=rows[0].map(c=>String(c).toLowerCase());
    if(hdr.some(c=>c.includes('tarih')||c.includes('date')||c.includes('açıklama')||c.includes('tutar')))start=1;
  }
  rows.slice(start).forEach((parts,i)=>{
    if(!parts||parts.length<2)return;
    const tarih=String(parts[0]||'').trim();
    const aciklama=String(parts[1]||'').trim();
    // Tutar: 3. sütun öncelikli, sonra diğerleri
    let tutar=0;
    for(let j=2;j<parts.length;j++){
      const v=parseFloat(String(parts[j]||'').replace(/\s/g,'').replace(',','.'));
      if(!isNaN(v)&&v!==0){tutar=v;break;}
    }
    if(!tarih||tutar===0)return;
    const esl=autoEslesir(aciklama);
    bankRows.push({id:Date.now()+i,tarih,aciklama,tutar,eslesme:esl,tip:tutar>0?'gelir':'gider',durum:'beklemede'});
  });
  if(!S.bankDosyalar)S.bankDosyalar=[];
  const dosyaId=Date.now();
  window._currentBankDosyaId=dosyaId;
  const gelirT=bankRows.filter(r=>r.tutar>0).reduce((s,r)=>s+r.tutar,0);
  const giderT=bankRows.filter(r=>r.tutar<0).reduce((s,r)=>s+Math.abs(r.tutar),0);
  S.bankDosyalar.push({
    id:dosyaId,ad:file.name,
    yuklemeTarih:today(),aptId:selectedAptId,
    satirSayisi:bankRows.length,gelir:gelirT,gider:giderT,onaylanan:0,
    satirlar:bankRows.map(r=>({...r,eslesme:r.eslesme?r.eslesme.id:null}))
  });
  save();renderBankRows();renderBankDosyalar();
  if(bankRows.length>0)toast(`✓ ${bankRows.length} hareket yüklendi.`,'ok');
  else toast('Hiç hareket bulunamadı. Sütun sırası: Tarih, Açıklama, Tutar','warn');
}

function autoEslesir(aciklama){
  const apt=S.apartmanlar.find(a=>a.id==selectedAptId);
  if(!apt)return null;
  const sakinler=S.sakinler.filter(x=>x.aptId==apt.id);
  const ac=aciklama.toLowerCase();
  // Daire no eşleşmesi
  for(const sk of sakinler){
    if(sk.daire&&ac.includes('d'+sk.daire.toLowerCase()))return sk;
    if(sk.daire&&ac.includes('daire '+sk.daire.toLowerCase()))return sk;
    if(sk.daire&&ac.includes(' '+sk.daire.toLowerCase()+' '))return sk;
  }
  // İsim eşleşmesi
  for(const sk of sakinler){
    const parts=sk.ad.toLowerCase().split(' ');
    if(parts.some(p=>p.length>3&&ac.includes(p)))return sk;
  }
  return null;
}

function bankManuelEkle(){
  const tarih=document.getElementById('bank-m-tarih')?.value;
  const aciklama=document.getElementById('bank-m-aciklama')?.value.trim();
  const tutar=parseFloat(document.getElementById('bank-m-tutar')?.value)||0;
  if(!aciklama||!tutar){toast('Açıklama ve tutar zorunlu.','err');return;}
  const esl=autoEslesir(aciklama);
  bankRows.unshift({id:Date.now(),tarih:tarih||today(),aciklama,tutar,eslesme:esl,tip:tutar>0?'gelir':'gider',durum:'beklemede'});
  renderBankRows();
  ['bank-m-tarih','bank-m-aciklama','bank-m-tutar'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
}

function bankHepsiniEslesir(){
  bankRows.forEach(r=>{if(!r.eslesme)r.eslesme=autoEslesir(r.aciklama);});
  renderBankRows();toast('Eşleştirme tamamlandı.','ok');
}

function bankSatirOnayla(id){
  const r=bankRows.find(x=>x.id===id);if(!r||r.durum==='onaylandi')return;
  // Validasyon
  if(r.tutar>0&&!r.eslesme){toast('Önce eşleşen sakini seçin.','err');openBankSakinModal(id);return;}
  if(r.tutar<0&&!r.giderKat){toast('Önce gider türünü seçin.','err');return;}
  r.durum='onaylandi';
  const aptId=selectedAptId;
  if(!aptId){save();renderBankRows();toast('Hareket onaylandı.','ok');return;}
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  if(!makbuzNo)makbuzNo=5000;
  const uid=Date.now();
  if(r.tutar>0&&r.eslesme){
    makbuzNo++;
    S.tahsilatlar=S.tahsilatlar||[];
    S.tahsilatlar.push({id:uid,no:'B-'+makbuzNo,sakId:r.eslesme.id,sakAd:r.eslesme.ad,
      aptId:+aptId,aptAd:apt?.ad||'',daire:r.eslesme.daire,
      tip:'aidat',donem:'',tutar:r.tutar,tarih:r.tarih,yontem:'banka',not:r.aciklama,kaynak:'banka'});
    const sk=S.sakinler.find(x=>x.id==r.eslesme.id);
    if(sk&&sk.borc>0)sk.borc=Math.max(0,(sk.borc||0)-r.tutar);
  }
  S.finansIslemler=S.finansIslemler||[];
  S.finansIslemler.push({id:uid+1,aptId:+aptId,aptAd:apt?.ad||'',
    tarih:r.tarih,tur:r.tutar>0?'gelir':'gider',
    kat:r.tutar>0?'aidat':(r.giderKat||'Diğer').toLowerCase(),
    tutar:Math.abs(r.tutar),aciklama:r.aciklama,belge:'Banka'});
  const dosya=(S.bankDosyalar||[]).find(d=>d.id===window._currentBankDosyaId);
  if(dosya){dosya.onaylanan=(dosya.onaylanan||0)+1;dosya.satirlar=bankRows.map(rr=>({...rr,eslesme:rr.eslesme?rr.eslesme.id:null}));}
  save();renderBankRows();
  const taraf=r.tutar>0?r.eslesme.ad+' (D:'+r.eslesme.daire+')':(r.giderKat||'Gider');
  toast(`✓ ${taraf} → ${r.tutar>0?'Tahsilat & Finans':'Finans'} işlendi`,'ok');
}

function bankSatirReddet(id){
  bankRows=bankRows.filter(x=>x.id!==id);renderBankRows();
}

function bankSatirAta(id,sakId){
  const r=bankRows.find(x=>x.id===id);if(!r)return;
  r.eslesme=sakId?S.sakinler.find(x=>x.id==sakId)||null:null;
  renderBankRows();
}

// ── BANKA SAKİN SEÇİM MODAL ──────────────────────────
function openBankSakinModal(rowId){
  window._bankSakinRowId=rowId;
  const aptId=selectedAptId;
  window._bankSakinList=S.sakinler.filter(x=>x.aptId==aptId);
  _renderBankSakinModal('');
  const inp=document.getElementById('bank-sakin-srch');
  if(inp)inp.value='';
  openModal('bank-sakin-modal');
}

function _renderBankSakinModal(q){
  const list=document.getElementById('bank-sakin-list');if(!list)return;
  const r=bankRows.find(x=>x.id===window._bankSakinRowId);
  const currentId=r?.eslesme?.id;
  const sakinler=(window._bankSakinList||[]).filter(sk=>{
    if(!q)return true;
    const s=q.toLowerCase();
    return sk.ad.toLowerCase().includes(s)||String(sk.daire||'').includes(s);
  });
  if(!sakinler.length){list.innerHTML='<div style="padding:28px;text-align:center;color:var(--tx-3);font-size:13px">Sakin bulunamadı</div>';return;}
  list.innerHTML=sakinler.map(sk=>{
    const isSelected=sk.id===currentId;
    const borcStr=sk.borc>0?`<span style="color:var(--err);font-weight:600">₺${fmt(sk.borc)} borç</span>`:`<span style="color:#16a34a">Borçsuz</span>`;
    const initials=sk.ad.split(' ').map(w=>w[0]||'').slice(0,2).join('').toUpperCase();
    return `<div onclick="bankSakinSec(${sk.id})" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;cursor:pointer;border:1.5px solid ${isSelected?'var(--brand)':'transparent'};background:${isSelected?'rgba(37,99,235,.05)':'transparent'};transition:all .12s" onmouseover="this.style.background='var(--bg)';this.style.borderColor='var(--bd)'" onmouseout="this.style.background='${isSelected?'rgba(37,99,235,.05)':'transparent'}';this.style.borderColor='${isSelected?'var(--brand)':'transparent'}'">
      <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0">${initials}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--tx-1)">${sk.ad}</div>
        <div style="font-size:11.5px;color:var(--tx-3);margin-top:1px">Daire ${sk.daire||'?'} &nbsp;·&nbsp; ${borcStr}</div>
      </div>
      ${isSelected?'<span style="color:var(--brand);font-size:16px;font-weight:700">✓</span>':''}
    </div>`;
  }).join('');
}

function bankSakinSec(sakId){
  const rowId=window._bankSakinRowId;if(!rowId)return;
  bankSatirAta(rowId,sakId);
  closeModal('bank-sakin-modal');
}

function bankOnayliKaydet(){
  const aptId=selectedAptId;if(!aptId){toast('Apartman seçilmedi.','err');return;}
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  const onaylananlar=bankRows.filter(r=>r.durum==='onaylandi');
  if(!onaylananlar.length){toast('Onaylanan hareket yok.','warn');return;}
  if(!makbuzNo)makbuzNo=5000;
  let ok=0;
  onaylananlar.forEach(r=>{
    makbuzNo++;
    // Tahsilata ekle
    if(r.eslesme&&r.tutar>0){
      S.tahsilatlar.push({
        id:Date.now()+ok,no:'B-'+makbuzNo,sakId:r.eslesme.id,sakAd:r.eslesme.ad,
        aptId:+aptId,aptAd:apt?apt.ad:'',daire:r.eslesme.daire,
        tip:'banka',donem:'',tutar:Math.abs(r.tutar),tarih:r.tarih,yontem:'banka',not:r.aciklama
      });
      if(r.eslesme.borc>0)r.eslesme.borc=Math.max(0,r.eslesme.borc-Math.abs(r.tutar));
    }
    // Finansal işleme de ekle
    S.finansIslemler.push({
      id:Date.now()+ok+100,aptId:+aptId,aptAd:apt?apt.ad:'',
      tarih:r.tarih,tur:r.tutar>0?'gelir':'gider',
      kat:r.tutar>0?'aidat':'diger',
      tutar:Math.abs(r.tutar),aciklama:r.aciklama,belge:'Banka'
    });
    ok++;
  });
  bankRows=bankRows.filter(r=>r.durum!=='onaylandi');
  // Dosya state'ini güncelle
  const dosya=(S.bankDosyalar||[]).find(d=>d.id===window._currentBankDosyaId);
  if(dosya){dosya.onaylanan=(dosya.onaylanan||0)+ok;dosya.satirlar=bankRows.map(r=>({...r,eslesme:r.eslesme?r.eslesme.id:null}));}
  save();renderBankRows();renderBankDosyalar();toast(ok+' hareket kaydedildi.','ok');
}

function renderBankRows(){
  const el=document.getElementById('bank-hareket-liste');if(!el)return;
  const ozet=document.getElementById('bank-ozet');
  const gelir=bankRows.filter(r=>r.tutar>0).reduce((s,r)=>s+r.tutar,0);
  const gider=bankRows.filter(r=>r.tutar<0).reduce((s,r)=>s+Math.abs(r.tutar),0);
  const bekleyen=bankRows.filter(r=>r.durum!=='onaylandi').length;
  const onaylanan=bankRows.filter(r=>r.durum==='onaylandi').length;
  if(ozet)ozet.innerHTML=`<span style="font-size:12px;color:var(--tx-3)">${bankRows.length} hareket</span>&nbsp;&nbsp;<span style="color:#16a34a;font-size:12px;font-weight:600">↑ ₺${fmt(gelir)}</span>&nbsp;&nbsp;<span style="color:var(--err);font-size:12px;font-weight:600">↓ ₺${fmt(gider)}</span>&nbsp;&nbsp;${bekleyen?`<span class="b b-gy" style="font-size:10.5px">${bekleyen} bekliyor</span>`:''}${onaylanan?`&nbsp;<span class="b b-gr" style="font-size:10.5px">${onaylanan} onaylı</span>`:''}`;
  if(!bankRows.length){el.innerHTML='<div style="text-align:center;padding:40px;color:var(--tx-3);font-size:13px">📂 Henüz banka hareketi yüklenmedi. Excel/CSV yükleyin veya manuel ekleyin.</div>';return;}
  const giderKatlar=['Bakım','Temizlik','Elektrik','Su','Doğalgaz','Asansör','Sigorta','Personel','Vergi','Malzeme','Diğer'];

  el.innerHTML=bankRows.map(r=>{
    const onaylandi=r.durum==='onaylandi';

    /* ── ONAYLANDI: kompakt özet satırı ── */
    if(onaylandi){
      const taraf=r.tutar>0&&r.eslesme
        ?`${r.eslesme.ad} <span style="color:var(--tx-3)">(D:${r.eslesme.daire||'?'})</span>`
        :(r.giderKat||'Gider');
      const tutarClrD=r.tutar>0?'#16a34a':'var(--err)';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--bd);background:rgba(34,197,94,.03);border-left:3px solid #86efac">
        <span style="color:#16a34a;font-size:15px;font-weight:700;flex-shrink:0">✓</span>
        <span style="font-size:11px;color:var(--tx-3);white-space:nowrap;flex-shrink:0">${r.tarih||''}</span>
        <span style="font-size:12.5px;color:var(--tx-2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.aciklama}</span>
        <span style="font-weight:700;color:${tutarClrD};font-size:12.5px;white-space:nowrap;flex-shrink:0">${r.tutar>0?'+':''}₺${fmt(Math.abs(r.tutar))}</span>
        <span style="color:var(--tx-3);font-size:12px;flex-shrink:0">→</span>
        <span style="font-size:12.5px;color:#16a34a;font-weight:600;white-space:nowrap;flex-shrink:0">${taraf}</span>
        <button onclick="bankSatirReddet(${r.id})" title="Listeden kaldır" style="background:none;border:none;color:var(--tx-3);cursor:pointer;font-size:13px;padding:0 2px;flex-shrink:0;opacity:.4;line-height:1" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.4">✕</button>
      </div>`;
    }

    /* ── BEKLEYEN: tam etkileşimli satır ── */
    const isGelir=r.tutar>=0;
    const tutarClr=r.tutar>0?'#16a34a':'var(--err)';

    // Gelir → sakin seç butonu; Gider → kategori seç
    const eslCol=isGelir
      ?`<button onclick="openBankSakinModal(${r.id})" style="display:flex;align-items:center;gap:6px;width:100%;padding:5px 9px;background:${r.eslesme?'#f0fdf4':'var(--bg)'};border:1.5px solid ${r.eslesme?'#86efac':'var(--bd)'};border-radius:7px;cursor:pointer;font-size:11.5px;color:${r.eslesme?'#16a34a':'var(--tx-3)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:all .15s" onmouseover="this.style.borderColor='var(--brand)'" onmouseout="this.style.borderColor='${r.eslesme?'#86efac':'var(--bd)'}'">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none;flex-shrink:0"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>
          <span style="overflow:hidden;text-overflow:ellipsis">${r.eslesme?`${r.eslesme.ad} (D:${r.eslesme.daire||'?'})`:'Sakin seç…'}</span>
        </button>`
      :`<select class="fi" style="font-size:11px;padding:4px 6px;border-radius:7px;width:100%;border-color:${r.giderKat?'var(--bd)':'#fca5a5'}" onchange="bankRows.find(x=>x.id==${r.id}).giderKat=this.value;renderBankRows()">
          <option value="">— Gider türü —</option>
          ${giderKatlar.map(k=>`<option value="${k}"${r.giderKat===k?' selected':''}>${k}</option>`).join('')}
        </select>`;

    // Tip değiştirince sakin/kat sıfırla
    const tipSec=`<select class="fi" style="font-size:11px;padding:4px 5px;border-radius:7px" onchange="const rr=bankRows.find(x=>x.id==${r.id});rr.tip=this.value;rr.eslesme=null;rr.giderKat='';renderBankRows()">
      <option value="gelir"${r.tip==='gelir'?' selected':''}>Gelir</option>
      <option value="gider"${r.tip==='gider'?' selected':''}>Gider</option>
    </select>`;

    const canApprove=isGelir?!!r.eslesme:!!r.giderKat;
    const onaylaBtn=`<button onclick="bankSatirOnayla(${r.id})" title="${canApprove?'Onayla ve işle':(isGelir?'Önce sakin seçin':'Önce gider türü seçin')}" style="background:${canApprove?'#dcfce7':'#f3f4f6'};color:${canApprove?'#16a34a':'#9ca3af'};border:1.5px solid ${canApprove?'#86efac':'#e5e7eb'};padding:5px 11px;border-radius:6px;font-size:13px;font-weight:700;cursor:${canApprove?'pointer':'default'};line-height:1;white-space:nowrap">✓</button>`;
    const silBtn=`<button onclick="bankSatirReddet(${r.id})" title="Sil" style="background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5;padding:5px 8px;border-radius:6px;font-size:12px;cursor:pointer;line-height:1">✕</button>`;

    return `<div style="display:grid;grid-template-columns:90px 1fr 108px 160px 78px 76px;gap:7px;align-items:center;padding:9px 14px;border-bottom:1px solid var(--bd);border-left:3px solid transparent">
      <div style="font-size:11px;color:var(--tx-3);white-space:nowrap">${r.tarih||'—'}</div>
      <div style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx-1)" title="${r.aciklama}">${r.aciklama}</div>
      <div style="font-weight:700;color:${tutarClr};font-size:13px;text-align:right;white-space:nowrap">${r.tutar>0?'+':''}₺${fmt(Math.abs(r.tutar))}</div>
      ${eslCol}
      ${tipSec}
      <div style="display:flex;gap:4px;justify-content:flex-end;align-items:center">${onaylaBtn}${silBtn}</div>
    </div>`;
  }).join('');
}

function bankSablonIndir(){
  if(typeof XLSX==='undefined'){toast('XLSX kütüphanesi yüklenemedi.','err');return;}
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([
    ['Tarih','Açıklama','Tutar','Daire No','Sakin Adı'],
    ['2024-01-15','Ocak Ayı Aidat - Daire 5',850,'5','Ahmet Yılmaz'],
    ['2024-01-16','D12 Şubat Aidat Ödemesi',1200,'12','Fatma Kaya'],
    ['2024-01-17','Asansör Bakım Gideri',-450,'',''],
    ['2024-01-18','Boya Badana Faturası',-1800,'',''],
    ['2024-01-20','Daire 3 Aidat',850,'3','Mehmet Demir'],
  ]);
  ws['!cols']=[{wch:14},{wch:42},{wch:14},{wch:12},{wch:24}];
  XLSX.utils.book_append_sheet(wb,ws,'Banka Hareketleri');
  XLSX.writeFile(wb,'banka-hareketi-sablonu.xlsx');
  toast('Şablon indirildi.','ok');
}
function _relativeDate(tarih) {
  if (!tarih) return '—';
  const diff = Math.floor((Date.now() - new Date(tarih)) / 86400000);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  if (diff < 7) return `${diff} gün önce`;
  if (diff < 30) return `${Math.floor(diff/7)} hafta önce`;
  if (diff < 365) return `${Math.floor(diff/30)} ay önce`;
  return `${Math.floor(diff/365)} yıl önce`;
}

function renderBankDosyalar() {
  const el = document.getElementById('bank-dosya-gecmis'); if (!el) return;
  const aptId = selectedAptId;
  const liste = (S.bankDosyalar||[]).filter(d=>!aptId||d.aptId==aptId).slice().reverse();
  if (!liste.length) { el.style.display='none'; return; }
  el.style.display='';
  const gelenSayisi = r => r.tutar > 0 ? 1 : 0;
  const gidenSayisi = r => r.tutar < 0 ? 1 : 0;
  el.innerHTML = `
    <div style="font-weight:700;font-size:13px;color:var(--tx-1);margin-bottom:10px">Önceden Yüklenen Dosyalar</div>
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px">
      ${liste.map(d=>{
        const eslesenmemis = (d.satirlar||[]).filter(r=>!r.eslesme&&r.durum!=='onaylandi').length;
        const gelenCount = (d.satirlar||[]).filter(r=>r.tutar>0).length;
        const gidenCount = (d.satirlar||[]).filter(r=>r.tutar<0).length;
        const isActive = window._currentBankDosyaId === d.id;
        return `<div class="bank-dosya-kart${isActive?' active':''}" onclick="bankDosyaYukle(${d.id})">
          <div class="bdk-header">
            <div class="bdk-excel-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8l4 8m0-8l-4 8"/><path d="M15 8v8"/></svg> Excel</div>
            ${eslesenmemis>0?`<span class="bdk-badge">${eslesenmemis} eşlenmemiş</span>`:''}
          </div>
          <div class="bdk-sayi">${d.satirSayisi}</div>
          <div class="bdk-lbl">Hareket</div>
          <div class="bdk-satir">
            <div><span class="bdk-alt">${gelenCount} Gelen</span><span class="bdk-tutar">₺${fmt(d.gelir||0)}</span></div>
            <div><span class="bdk-alt">${gidenCount} Giden</span><span class="bdk-tutar">₺${fmt(d.gider||0)}</span></div>
          </div>
          <div class="bdk-footer">
            <span class="bdk-alt">Dosya Yükleme Tarihi</span>
            <span class="bdk-sure">${_relativeDate(d.yuklemeTarih)}</span>
          </div>
          <button class="bdk-sil" onclick="event.stopPropagation();bankDosyaSil(${d.id})" title="Sil">✕</button>
        </div>`;
      }).join('')}
    </div>`;
}

function bankDosyaYukle(id) {
  const dosya = (S.bankDosyalar||[]).find(d=>d.id===id); if (!dosya) return;
  bankRows = (dosya.satirlar||[]).map(r=>({...r, eslesme: r.eslesme ? S.sakinler.find(sk=>sk.id==r.eslesme)||null : null}));
  window._currentBankDosyaId = dosya.id;
  renderBankRows(); renderBankDosyalar();
  goTab('tah-banka');
  toast(`${dosya.ad} yüklendi (${bankRows.length} satır).`,'ok');
}

function bankDosyaSil(id) {
  if (!confirm('Bu dosya geçmişi silinsin mi?')) return;
  S.bankDosyalar = (S.bankDosyalar||[]).filter(d=>d.id!==id);
  if (window._currentBankDosyaId===id) { bankRows=[]; window._currentBankDosyaId=null; renderBankRows(); }
  save(); renderBankDosyalar(); toast('Dosya silindi.','warn');
}

function loadSakinForOdeme() {
  const aptId=document.getElementById('tah-o-apt')?.value;
  const el=document.getElementById('tah-o-sakin'); if(!el) return;
  if(!aptId){ el.innerHTML='<option value="">— Apartman seçin —</option>'; return; }
  const list=S.sakinler.filter(x=>x.aptId==aptId);
  el.innerHTML='<option value="">— Sakin seçin —</option>'+list.map(sk=>`<option value="${sk.id}">${sk.ad} (D:${sk.daire||'?'})</option>`).join('');
}

function hizliOdeme(sakId) {
  const sk=S.sakinler.find(x=>x.id===sakId); if(!sk) return;
  goTab('tah-odeme');
  setTimeout(()=>{
    const aptEl=document.getElementById('tah-o-apt');
    if(aptEl){ aptEl.innerHTML='<option value="">— Seçin —</option>'+S.apartmanlar.map(a=>`<option value="${a.id}">${a.ad}</option>`).join(''); aptEl.value=sk.aptId; loadSakinForOdeme(); }
    setTimeout(()=>{ const sEl=document.getElementById('tah-o-sakin'); if(sEl) sEl.value=sk.id; },100);
    const tEl=document.getElementById('tah-o-tarih'); if(tEl) tEl.value=today();
    const tuEl=document.getElementById('tah-o-tutar'); if(tuEl) tuEl.value=sk.aidat||'';
  },50);
}

function borcGuncelle(sakId) {
  const sk=S.sakinler.find(x=>x.id===sakId); if(!sk) return;
  const yeni=prompt(`${sk.ad} - Mevcut borç: ₺${sk.borc||0}
Yeni borç tutarı girin (₺):`);
  if(yeni===null) return;
  sk.borc=parseFloat(yeni)||0;
  save(); toast('Borç güncellendi.','ok');
}

function saveOdeme() {
  if (!_guardCheck()) return;
  const sakId=document.getElementById('tah-o-sakin')?.value;
  let tutar = parseFloat(document.getElementById('tah-o-tutar')?.value)||0;
  if (!runValidation(() => {
    Validate.required(sakId, 'Sakin');
    tutar = Validate.positiveNumber(document.getElementById('tah-o-tutar')?.value, 'Tutar');
    Validate.date(document.getElementById('tah-o-tarih')?.value, 'Tarih');
  })) return;
  const sk=S.sakinler.find(x=>x.id==sakId);
  // FIFO borca dağıtım — AllocationService varsa kullan
  let _allocation = { allocations: [], unallocated: tutar };
  if (typeof AllocationService !== 'undefined') {
    _allocation = AllocationService.allocate(sakId, document.getElementById('tah-o-apt')?.value || sk?.aptId, tutar);
  }
  if(sk && (sk.borc||0)>0) {
    sk.borc=Math.max(0,(sk.borc||0)-tutar);
  }
  const _makbuzNo = genMakbuzNo('M');
  const aptId=document.getElementById('tah-o-apt')?.value;
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  S.tahsilatlar.push({
    id:Date.now(), no:_makbuzNo,
    sakId:+sakId, sakAd:sk?sk.ad:'—',
    aptId:aptId?+aptId:null, aptAd:apt?apt.ad:'—',
    daire:sk?sk.daire:'—',
    tip:document.getElementById('tah-o-tip')?.value,
    donem:document.getElementById('tah-o-donem')?.value||'',
    tutar, tarih:document.getElementById('tah-o-tarih')?.value||today(),
    yontem:document.getElementById('tah-o-yontem')?.value,
    not:document.getElementById('tah-o-not')?.value||'',
    collection_allocations: _allocation.allocations,
    unallocated: _allocation.unallocated
  });
  ['tah-o-tutar','tah-o-donem','tah-o-not'].forEach(i=>{ const el=document.getElementById(i); if(el) el.value=''; });
  save(); goTab('tah-liste'); toast('Ödeme kaydedildi. Makbuz: '+_makbuzNo,'ok');
  refreshCariIfOpen();
}

function renderOdemeGecmis() {
  const s=(document.getElementById('tah-g-srch')?.value||'').toLowerCase();
  const fApt=document.getElementById('tah-g-apt')?.value||'';
  let list=(S.tahsilatlar||[]).filter(x=>x.status!=='cancelled'); // soft-cancelled kayıtları gizle
  if(fApt) list=list.filter(x=>x.aptId==fApt);
  if(s) list=list.filter(x=>(x.sakAd+' '+x.no).toLowerCase().includes(s));
  const tb=document.getElementById('tah-g-tbody'); if(!tb) return;
  if(!list.length){ tb.innerHTML=`<tr><td colspan="10">${emp('📄','Ödeme kaydı bulunamadı')}</td></tr>`; return; }
  const tipLbl={aidat:'Aidat',borc:'Borç Ödemesi',avans:'Avans',diger:'Diğer'};
  const yonLbl={nakit:'Nakit',banka:'Banka',eft:'EFT',kredi:'K.Kartı'};
  tb.innerHTML=list.slice().reverse().map(o=>`<tr>
    <td style="font-family:monospace;font-size:11px;color:var(--brand)">${he(o.no)}</td>
    <td>${he(o.sakAd)}</td>
    <td>${he(o.aptAd)}</td>
    <td>${he(o.daire||'—')}</td>
    <td><span class="b b-bl">${he(tipLbl[o.tip]||o.tip||'—')}</span></td>
    <td>${he(o.donem||'—')}</td>
    <td style="font-weight:700;color:var(--ok)">₺${fmt(o.tutar)}</td>
    <td>${he(yonLbl[o.yontem]||o.yontem||'—')}</td>
    <td class="t2" style="font-size:11px">${o.tarih}</td>
    <td><button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delOdeme(${o.id})" title="Sil"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></td>
  </tr>`).join('');
}

/** @deprecated Soft cancel kullanılıyor — hard delete yapılmıyor */
function delOdeme(id) { softCancelCollection(id); }

/**
 * Tahsilat soft cancel — kaydı silmez, status='cancelled' yapar.
 * Sakin borcunu geri ekler + ledger ters kayıt + audit log.
 */
function softCancelCollection(id) {
  const t = (S.tahsilatlar || []).find(x => x.id == id);
  if (!t) return;
  if (t.status === 'cancelled') { toast('Bu kayıt zaten iptal edilmiş.', 'warn'); return; }
  if (!confirm(`Tahsilat iptal edilsin mi?\nMakbuz: ${t.no || '—'} · ₺${fmt(t.tutar)}\nBu işlem geri alınamaz — ters kayıt oluşturulur.`)) return;

  const eskiTutar = t.tutar || 0;

  // 1. Kaydı iptal et (silme değil)
  t.status        = 'cancelled';
  t.cancelledAt   = new Date().toISOString();
  t.cancelledBy   = _currentUser?.id || 'local';
  t.cancelReason  = 'Kullanıcı tarafından iptal edildi';

  // 2. Sakin borcunu geri ekle
  const sk = (S.sakinler || []).find(x => x.id == (t.sakId || t.sakinId));
  if (sk) sk.borc = (sk.borc || 0) + eskiTutar;

  // 3. Ledger ters kayıt (DEBIT — ödeme geri alındı)
  LedgerService.recordReversal({
    siteId:      t.aptId,
    personId:    t.sakId || t.sakinId,
    unitNo:      t.daire,
    debit:       eskiTutar,   // ters: DEBIT ile credit'i sıfırla
    credit:      0,
    refType:     'tahsilatlar',
    refId:       String(t.id),
    docNo:       'IADE-' + (t.no || t.id),
    description: `İptal: ${t.no || ''} — ${t.sakAd || ''}`,
    period:      t.donem
  });

  // 4. Audit log
  AuditService.log({
    action:     'REVERSE',
    entityType: 'tahsilatlar',
    entityId:   t.id,
    oldValues:  { status: 'active', tutar: eskiTutar },
    newValues:  { status: 'cancelled' },
    siteId:     t.aptId
  });

  save();
  toast(`İptal edildi: ${t.no || ''} · Borç geri eklendi: ₺${fmt(eskiTutar)}`, 'warn');
  if (typeof renderTahsilatMakbuz === 'function') renderTahsilatMakbuz();
  if (typeof renderOdemeGecmis   === 'function') renderOdemeGecmis();
  setTimeout(() => { if (typeof renderDashboard === 'function') renderDashboard(); }, 50);
}

// ── BORÇ MAKBUZLARI ──────────────────────────────────
function renderBorcMakbuz() {
  const aptId = selectedAptId;
  const s = (document.getElementById('bm-srch')?.value || '').toLowerCase();
  const fBas = document.getElementById('bm-f-bas')?.value || '';
  const fBit = document.getElementById('bm-f-bit')?.value || '';

  // Kategori filtresini doldur
  const katEl = document.getElementById('bm-f-kat');
  const fKat = katEl?.value || '';
  if (katEl && katEl.options.length <= 1) {
    const kategoriler = [...new Set((S.aidatBorclandir||[]).flatMap(k=>(k.detaylar||[]).map(d=>d.kategori||'Aidat')))].filter(Boolean).sort();
    kategoriler.forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; katEl.appendChild(o); });
    if (fKat) katEl.value = fKat;
  }

  // Tüm borç kayıtlarını düzleştir (cancelled olanlar gösterilmez)
  let rows = [];
  (S.aidatBorclandir||[]).forEach(kayit => {
    (kayit.detaylar||[]).forEach(d => {
      if (d.status === 'cancelled') return;  // soft-cancelled detayları atla
      const sk = S.sakinler.find(x=>x.id==d.sakId);
      if (aptId && (sk?.aptId)!=aptId) return;
      const apt = S.apartmanlar.find(a=>a.id==(sk?.aptId));
      rows.push({
        sakAd: sk?.ad || d.ad || '—',
        daire: sk?.daire || d.daire || '—',
        aptAd: apt?.ad || sk?.aptAd || '—',
        kategori: d.kategori || 'Aidat',
        donem: kayit.donem || kayit.donemLabel || '—',
        tutar: d.tutar || 0,
        tarih: kayit.tarih || '',
        sonOdeme: kayit.sonOdeme || '',
        _kayitRef: kayit,
        _detayRef: d,
        _sakId: d.sakId
      });
    });
  });

  if (s) rows = rows.filter(r=>(r.sakAd+' '+r.daire).toLowerCase().includes(s));
  if (fKat) rows = rows.filter(r=>r.kategori===fKat);
  if (fBas) rows = rows.filter(r=>r.tarih>=fBas);
  if (fBit) rows = rows.filter(r=>r.tarih<=fBit);
  rows.sort((a,b)=>b.tarih.localeCompare(a.tarih));

  const topTutar = rows.reduce((s,r)=>s+r.tutar,0);
  const toplam = document.getElementById('bm-toplam');
  if (toplam) toplam.textContent = `${rows.length} kayıt · Toplam: ₺${fmt(topTutar)}`;

  window._bmRows = rows;
  const tb = document.getElementById('bm-tbody');
  if (!tb) return;
  if (!rows.length) { tb.innerHTML=`<tr><td colspan="10">${emp('📄','Borç kaydı bulunamadı')}</td></tr>`; return; }
  tb.innerHTML = rows.map((r,i)=>`<tr>
    <td style="font-family:monospace;font-size:11px;color:var(--tx-3)">${String(i+1).padStart(4,'0')}</td>
    <td><strong>${he(r.sakAd)}</strong></td>
    <td style="font-weight:700;color:var(--brand)">${he(r.daire)}</td>
    <td class="t2" style="font-size:11px">${he(r.aptAd)}</td>
    <td><span class="b b-bl" style="font-size:10px">${he(r.kategori)}</span></td>
    <td class="t2" style="font-size:11px">${he(r.donem)}</td>
    <td style="font-weight:700;color:var(--err)">₺${fmt(r.tutar)}</td>
    <td class="t2" style="font-size:11px">${r.tarih||'—'}</td>
    <td class="t2" style="font-size:11px">${r.sonOdeme||'—'}</td>
    <td style="white-space:nowrap">
      <button class="btn bg xs" onclick="openBorcOnizle(${i})" title="Önizle" style="padding:4px 8px"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
      <button class="btn bg xs" onclick="editBorcMakbuz(${i})" title="Düzenle" style="padding:4px 8px;margin-left:3px"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="btn xs" onclick="deleteBorcMakbuz(${i})" title="Sil" style="padding:4px 8px;margin-left:3px;background:var(--err-bg);color:var(--err);border:1px solid var(--err)"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
    </td>
  </tr>`).join('');
}

// ── BORÇ MAKBUZ DÜZENLE / SİL ────────────────────────
function deleteBorcMakbuz(idx) {
  const r = (window._bmRows || [])[idx];
  if (!r) return;
  if (!confirm(`"${r.sakAd}" – ${r.kategori} – ₺${fmt(r.tutar)}\nBorç kaydı iptal edilsin mi?\n(Kaydı silmez, iptal durumuna alır ve borcunu düşürür.)`)) return;

  // 1. Detayı hard silmek yerine cancelled olarak işaretle
  const detay = r._detayRef;
  if (detay) {
    detay.status      = 'cancelled';
    detay.cancelledAt = new Date().toISOString();
    detay.cancelledBy = _currentUser?.id || 'local';
  }
  // Toplamı güncelle (cancelled olanları hariç tut)
  const kayit = r._kayitRef;
  if (kayit) {
    kayit.toplamBorc = (kayit.detaylar || [])
      .filter(d => d.status !== 'cancelled')
      .reduce((s, d) => s + (d.tutar || 0), 0);
  }

  // 2. Sakin borcunu geri düşür
  const sk = S.sakinler.find(x => x.id == r._sakId);
  if (sk) sk.borc = Math.max(0, (sk.borc || 0) - r.tutar);

  // 3. Ledger ters kayıt (CREDIT — borç geri alındı)
  LedgerService.recordReversal({
    siteId:      r._kayitRef?.aptId,
    personId:    r._sakId,
    unitNo:      r.daire,
    debit:       0,
    credit:      r.tutar,   // borcu sıfırla
    refType:     'aidatBorclandir',
    description: `İptal Borç: ${r.kategori || ''} — ${r.donem || ''}`,
    period:      r.donem
  });

  // 4. Audit log
  AuditService.log({
    action: 'REVERSE', entityType: 'aidatBorclandir',
    oldValues: { status: 'active', tutar: r.tutar, sakAd: r.sakAd },
    newValues:  { status: 'cancelled' },
    siteId: r._kayitRef?.aptId
  });

  save(); toast('Borç kaydı iptal edildi.', 'warn');
  renderBorcMakbuz();
}

function editBorcMakbuz(idx) {
  const r = (window._bmRows || [])[idx];
  if (!r) return;
  window._editBorcIdx = idx;
  window._editTahsilatId = null;
  const kategoriler = [...new Set((S.aidatBorclandir||[]).flatMap(k=>(k.detaylar||[]).map(d=>d.kategori||'Aidat'))),'Aidat','Kira','Aidat + Kira','Diğer'].filter(Boolean);
  const katOpts = [...new Set(kategoriler)].map(k=>`<option value="${k}"${k===r.kategori?'selected':''}>${k}</option>`).join('');
  document.getElementById('makbuz-edit-content').innerHTML = `
    <div style="padding:20px 20px 4px">
      <div style="border:1.5px solid var(--bd);border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10);background:#fff">
        <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);padding:14px 22px;border-bottom:1px solid #bfdbfe;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--brand);text-transform:uppercase;letter-spacing:.8px">Borç Kaydı Düzenle</div>
            <div style="font-size:15px;font-weight:700;color:var(--tx-1);margin-top:3px">${r.sakAd} · Daire ${r.daire}</div>
          </div>
          <span class="b b-bl" style="font-size:11px">${r.donem}</span>
        </div>
        <div style="padding:18px 22px;background:var(--bg);display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--tx-3);display:block;margin-bottom:4px">Kategori</label>
            <select id="be-kategori" class="fs" style="width:100%;font-size:13px"><option value="">Seçin</option>${katOpts}</select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--tx-3);display:block;margin-bottom:4px">Tutar (₺)</label>
            <input id="be-tutar" type="number" class="fs" style="width:100%;font-size:13px" value="${r.tutar}" min="0" step="0.01">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--tx-3);display:block;margin-bottom:4px">Borçlandırma Tarihi</label>
            <input id="be-tarih" type="date" class="fs" style="width:100%;font-size:13px" value="${r.tarih||''}">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--tx-3);display:block;margin-bottom:4px">Son Ödeme Tarihi</label>
            <input id="be-sonodeme" type="date" class="fs" style="width:100%;font-size:13px" value="${r.sonOdeme||''}">
          </div>
        </div>
      </div>
    </div>`;
  window._makbuzEditSaveFn = saveBorcEdit;
  openModal('makbuz-edit-modal');
}

function saveBorcEdit() {
  const idx = window._editBorcIdx;
  const r = (window._bmRows || [])[idx];
  if (!r) return;
  const yeniTutar   = parseFloat(document.getElementById('be-tutar')?.value) || 0;
  const yeniKat     = document.getElementById('be-kategori')?.value || r.kategori;
  const yeniTarih   = document.getElementById('be-tarih')?.value || r.tarih;
  const yeniSonOd   = document.getElementById('be-sonodeme')?.value || r.sonOdeme;
  // Sakin borcunu güncelle (eski tutar çıkar, yeni ekle)
  const sk = S.sakinler.find(x=>x.id==r._sakId);
  if (sk) sk.borc = Math.max(0,(sk.borc||0) - r.tutar + yeniTutar);
  // Detay güncelle
  r._detayRef.tutar    = yeniTutar;
  r._detayRef.kategori = yeniKat;
  // Kayıt güncelle
  r._kayitRef.tarih    = yeniTarih;
  r._kayitRef.sonOdeme = yeniSonOd;
  r._kayitRef.toplamBorc = (r._kayitRef.detaylar||[]).reduce((s,d)=>s+(d.tutar||0),0);
  save(); closeModal('makbuz-edit-modal');
  toast('Borç kaydı güncellendi.','ok');
  renderBorcMakbuz();
}

// ── TAHSİLAT MAKBUZ DÜZENLE ──────────────────────────
function editTahsilatMakbuz(id) {
  const o = (S.tahsilatlar||[]).find(x=>x.id==id);
  if (!o) return;
  window._editTahsilatId = id;
  window._editBorcIdx = null;
  const tipOpts = [{v:'aidat',l:'Aidat'},{v:'kira',l:'Kira'},{v:'borc',l:'Borç Ödemesi'},{v:'avans',l:'Avans'},{v:'gecmis_borc',l:'Geçmiş Borç'},{v:'diger',l:'Diğer'}]
    .map(t=>`<option value="${t.v}"${t.v===o.tip?'selected':''}>${t.l}</option>`).join('');
  const yonOpts = [{v:'nakit',l:'Nakit'},{v:'banka',l:'Banka Transferi'},{v:'eft',l:'EFT'},{v:'kredi',l:'Kredi Kartı'},{v:'havale',l:'Havale'}]
    .map(t=>`<option value="${t.v}"${t.v===o.yontem?'selected':''}>${t.l}</option>`).join('');
  document.getElementById('makbuz-edit-content').innerHTML = `
    <div style="padding:20px 20px 4px">
      <div style="border:1.5px solid var(--bd);border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10);background:#fff">
        <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);padding:14px 22px;border-bottom:1px solid #86efac;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:10px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.8px">Tahsilat Kaydı Düzenle</div>
            <div style="font-size:15px;font-weight:700;color:var(--tx-1);margin-top:3px">${o.sakAd||'—'} · Daire ${o.daire||'—'}</div>
          </div>
          <span style="font-family:monospace;font-size:12px;color:var(--tx-3)">${o.no||''}</span>
        </div>
        <div style="padding:18px 22px;background:var(--bg);display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--tx-3);display:block;margin-bottom:4px">Ödeme Tipi</label>
            <select id="te-tip" class="fs" style="width:100%;font-size:13px">${tipOpts}</select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--tx-3);display:block;margin-bottom:4px">Tutar (₺)</label>
            <input id="te-tutar" type="number" class="fs" style="width:100%;font-size:13px" value="${o.tutar||0}" min="0" step="0.01">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--tx-3);display:block;margin-bottom:4px">Tahsilat Tarihi</label>
            <input id="te-tarih" type="date" class="fs" style="width:100%;font-size:13px" value="${o.tarih||''}">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--tx-3);display:block;margin-bottom:4px">Dönem</label>
            <input id="te-donem" type="text" class="fs" style="width:100%;font-size:13px" value="${o.donem||''}" placeholder="Örn: Mart 2026">
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--tx-3);display:block;margin-bottom:4px">Ödeme Yöntemi</label>
            <select id="te-yontem" class="fs" style="width:100%;font-size:13px"><option value="">—</option>${yonOpts}</select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--tx-3);display:block;margin-bottom:4px">Not</label>
            <input id="te-not" type="text" class="fs" style="width:100%;font-size:13px" value="${o.not||''}" placeholder="İsteğe bağlı not">
          </div>
        </div>
      </div>
    </div>`;
  window._makbuzEditSaveFn = saveTahsilatEdit;
  openModal('makbuz-edit-modal');
}

function saveTahsilatEdit() {
  const id = window._editTahsilatId;
  const o = (S.tahsilatlar||[]).find(x=>x.id==id);
  if (!o) return;
  const eskiTutar = o.tutar || 0;
  o.tip    = document.getElementById('te-tip')?.value    || o.tip;
  o.tutar  = parseFloat(document.getElementById('te-tutar')?.value) || 0;
  o.tarih  = document.getElementById('te-tarih')?.value  || o.tarih;
  o.donem  = document.getElementById('te-donem')?.value  || o.donem;
  o.yontem = document.getElementById('te-yontem')?.value || o.yontem;
  o.not    = document.getElementById('te-not')?.value    ?? o.not;
  // Sakin borcunu güncelle (tutar farkı)
  const sk = S.sakinler.find(x=>x.id==o.sakId||x.id==o.sakid);
  if (sk) sk.borc = Math.max(0,(sk.borc||0) + eskiTutar - o.tutar);
  save(); closeModal('makbuz-edit-modal');
  toast('Tahsilat kaydı güncellendi.','ok');
  renderTahsilatMakbuz();
  refreshCariIfOpen();
}

function deleteMakbuzKayit() {
  if (window._editBorcIdx != null) {
    // Borç kaydı sil
    const r = (window._bmRows || [])[window._editBorcIdx];
    if (!r) return;
    if (!confirm(`Borç kaydı silinsin mi?\n${r.sakAd} · ₺${fmt(r.tutar)}\nBu işlem geri alınamaz.`)) return;
    const sk = S.sakinler.find(x => x.id == r._sakId);
    if (sk) sk.borc = Math.max(0, (sk.borc || 0) - r.tutar);
    if (r._detayRef) r._kayitRef.detaylar = (r._kayitRef.detaylar || []).filter(d => d !== r._detayRef);
    r._kayitRef.toplamBorc = (r._kayitRef.detaylar || []).reduce((s, d) => s + (d.tutar || 0), 0);
    if (!(r._kayitRef.detaylar || []).length) S.aidatBorclandir = (S.aidatBorclandir || []).filter(k => k !== r._kayitRef);
    save(); closeModal('makbuz-edit-modal');
    toast('Borç kaydı silindi.', 'warn');
    renderBorcMakbuz();
    refreshCariIfOpen();
  } else if (window._editTahsilatId) {
    // Tahsilat kaydı sil
    const o = (S.tahsilatlar || []).find(x => x.id == window._editTahsilatId);
    if (!o) return;
    if (!confirm(`Tahsilat silinsin mi?\n${o.sakAd || '—'} · ₺${fmt(o.tutar)}\nBu işlem geri alınamaz.`)) return;
    o.status = 'cancelled'; o.cancelledAt = new Date().toISOString();
    const sk = S.sakinler.find(x => x.id == (o.sakId || o.sakinId));
    if (sk) sk.borc = (sk.borc || 0) + (o.tutar || 0);
    save(); closeModal('makbuz-edit-modal');
    toast('Tahsilat kaydı silindi.', 'warn');
    renderTahsilatMakbuz();
    refreshCariIfOpen();
  }
}

// ── MAKBUZ ÖNİZLEME ──────────────────────────────────
function _makbuzFirmaHtml() {
  const ay = S.ayarlar || {};
  const firma = ay.firma || ay.sirket || ay.firmaAdi || 'Yönetim Şirketi';
  const adres = ay.adres || '';
  const tel   = ay.tel || ay.telefon || '';
  const logo  = ay.logo || '';
  return `<div style="display:flex;align-items:center;gap:14px;padding:20px 24px 16px;border-bottom:2px solid var(--bd)">
    ${logo ? `<img src="${logo}" style="width:48px;height:48px;object-fit:contain;border-radius:8px">` : `<div style="width:48px;height:48px;background:var(--brand);border-radius:8px;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" style="width:26px;height:26px;stroke:#fff;stroke-width:2;fill:none"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/></svg></div>`}
    <div>
      <div style="font-size:15px;font-weight:700;color:var(--tx-1)">${firma}</div>
      ${adres ? `<div style="font-size:11px;color:var(--tx-3);margin-top:2px">${adres}</div>` : ''}
      ${tel   ? `<div style="font-size:11px;color:var(--tx-3)">${tel}</div>` : ''}
    </div>
  </div>`;
}

function openBorcOnizle(idx) {
  const r = (window._bmRows || [])[idx];
  if (!r) return;
  const no = `BM-${String(idx+1).padStart(4,'0')}`;
  const html = `<div style="padding:20px 20px 4px">
  <div style="border:1.5px solid var(--bd);border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10);background:#fff">
    ${_makbuzFirmaHtml()}
    <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);padding:14px 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #bfdbfe">
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--brand);text-transform:uppercase;letter-spacing:.8px">Borç Makbuzu</div>
        <div style="font-size:22px;font-weight:800;color:var(--tx-1);margin-top:3px;letter-spacing:-.3px">${no}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.5px">Borçlandırma Tarihi</div>
        <div style="font-size:14px;font-weight:700;color:var(--tx-1);margin-top:3px">${r.tarih||'—'}</div>
      </div>
    </div>
    <div style="padding:18px 22px;display:grid;grid-template-columns:1fr 1fr;gap:10px;background:var(--bg)">
      <div style="background:#fff;border:1px solid var(--bd);border-radius:10px;padding:14px">
        <div style="font-size:9px;font-weight:700;color:var(--tx-3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">Sakin Bilgisi</div>
        <div style="font-size:14px;font-weight:700;color:var(--tx-1)">${r.sakAd}</div>
        <div style="font-size:12px;color:var(--tx-2);margin-top:4px">Daire <strong>${r.daire}</strong></div>
        <div style="font-size:11px;color:var(--tx-3);margin-top:3px">${r.aptAd}</div>
      </div>
      <div style="background:#fff;border:1px solid var(--bd);border-radius:10px;padding:14px">
        <div style="font-size:9px;font-weight:700;color:var(--tx-3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">Borç Detayı</div>
        <div style="font-size:12px;color:var(--tx-2)">Kategori: <strong>${r.kategori}</strong></div>
        <div style="font-size:12px;color:var(--tx-2);margin-top:5px">Dönem: <strong>${r.donem}</strong></div>
        <div style="font-size:12px;color:var(--tx-2);margin-top:5px">Son Ödeme: <strong style="color:var(--err)">${r.sonOdeme||'—'}</strong></div>
      </div>
    </div>
    <div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border-top:1px solid #fca5a5;padding:16px 22px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.5px">Borç Tutarı</div>
      <div style="font-size:26px;font-weight:800;color:#dc2626;letter-spacing:-.5px">₺${fmt(r.tutar)}</div>
    </div>
  </div>
  </div>`;
  document.getElementById('makbuz-onizle-content').innerHTML = html;
  window._makbuzOnizleTip = 'borc';
  openModal('makbuz-onizle-modal');
}

function openTahsilatOnizle(id) {
  const o = (S.tahsilatlar||[]).find(x=>x.id==id);
  if (!o) return;
  const kaynakMap = {
    'excel': {label:'Excel İçe Aktarma', cls:'#d97706', bg:'#fffbeb', bc:'#fde68a'},
    'banka-entegrasyon': {label:'Banka Entegrasyonu', cls:'#059669', bg:'#f0fdf4', bc:'#a7f3d0'},
    'banka-ent': {label:'Banka Entegrasyonu', cls:'#059669', bg:'#f0fdf4', bc:'#a7f3d0'},
  };
  const tipLbl = {aidat:'Aidat',kira:'Kira',borc:'Borç Ödemesi',avans:'Avans',diger:'Diğer',gecmis_borc:'Geçmiş Borç'};
  const yonLbl = {nakit:'Nakit',banka:'Banka Transferi',eft:'EFT',kredi:'Kredi Kartı',havale:'Havale'};
  const src = kaynakMap[o.yontem] || {label:'Manuel Giriş', cls:'#2563eb', bg:'#eff6ff', bc:'#bfdbfe'};
  const html = `<div style="padding:20px 20px 4px">
  <div style="border:1.5px solid var(--bd);border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10);background:#fff">
    ${_makbuzFirmaHtml()}
    <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);padding:14px 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #86efac">
      <div>
        <div style="font-size:10px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.8px">Tahsilat Makbuzu</div>
        <div style="font-size:22px;font-weight:800;color:var(--tx-1);margin-top:3px;letter-spacing:-.3px">${o.no||'—'}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:10px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.5px">Tahsilat Tarihi</div>
        <div style="font-size:14px;font-weight:700;color:var(--tx-1);margin-top:3px">${o.tarih||'—'}</div>
      </div>
    </div>
    <div style="padding:18px 22px;display:grid;grid-template-columns:1fr 1fr;gap:10px;background:var(--bg)">
      <div style="background:#fff;border:1px solid var(--bd);border-radius:10px;padding:14px">
        <div style="font-size:9px;font-weight:700;color:var(--tx-3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">Sakin Bilgisi</div>
        <div style="font-size:14px;font-weight:700;color:var(--tx-1)">${o.sakAd||'—'}</div>
        <div style="font-size:12px;color:var(--tx-2);margin-top:4px">Daire <strong>${o.daire||'—'}</strong></div>
        <div style="font-size:11px;color:var(--tx-3);margin-top:3px">${o.aptAd||'—'}</div>
      </div>
      <div style="background:#fff;border:1px solid var(--bd);border-radius:10px;padding:14px">
        <div style="font-size:9px;font-weight:700;color:var(--tx-3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">Ödeme Detayı</div>
        <div style="font-size:12px;color:var(--tx-2)">Tip: <strong>${tipLbl[o.tip]||o.tip||'—'}</strong></div>
        <div style="font-size:12px;color:var(--tx-2);margin-top:5px">Dönem: <strong>${o.donem||'—'}</strong></div>
        ${yonLbl[o.yontem]?`<div style="font-size:12px;color:var(--tx-2);margin-top:5px">Yöntem: <strong>${yonLbl[o.yontem]}</strong></div>`:''}
      </div>
    </div>
    <div style="padding:10px 22px;background:var(--bg);border-top:1px solid var(--bd);display:flex;align-items:center;gap:8px">
      <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:${src.cls};stroke-width:2;fill:none;flex-shrink:0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <span style="font-size:12px;font-weight:600;color:${src.cls}">${src.label}</span>
    </div>
    ${o.not?`<div style="padding:10px 22px;background:var(--bg);border-top:1px solid var(--bd);font-size:12px;color:var(--tx-2)"><span style="font-weight:600">Not:</span> ${o.not}</div>`:''}
    <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-top:1px solid #86efac;padding:16px 22px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.5px">Tahsil Edilen Tutar</div>
      <div style="font-size:26px;font-weight:800;color:#16a34a;letter-spacing:-.5px">₺${fmt(o.tutar)}</div>
    </div>
  </div>
  </div>`;
  document.getElementById('makbuz-onizle-content').innerHTML = html;
  window._makbuzOnizleTip = 'tahsilat';
  openModal('makbuz-onizle-modal');
}

function printMakbuzOnizle() {
  const content = document.getElementById('makbuz-onizle-content');
  if (!content) return;
  const w = window.open('', '_blank', 'width=620,height=800');
  const tip = window._makbuzOnizleTip === 'tahsilat' ? 'Tahsilat Makbuzu' : 'Borç Makbuzu';
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${tip}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#111;padding:24px;max-width:560px;margin:0 auto}
      :root{--brand:#2563eb;--bg:#f6f7f9;--bd:#e5e7eb;--tx-1:#111827;--tx-2:#374151;--tx-3:#6b7280;--ok:#16a34a;--err:#dc2626}
      @media print{@page{margin:12mm}button{display:none!important}}
    </style>
  </head><body>
    <div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)">
      ${content.innerHTML}
    </div>
    <div style="text-align:center;margin-top:16px;font-size:11px;color:#9ca3af">Bu makbuz elektronik ortamda düzenlenmiştir.</div>
    <script>window.onload=function(){window.print();}<\/script>
  </body></html>`);
  w.document.close();
}

function exportBorcMakbuz() {
  if (typeof XLSX === 'undefined') { toast('Excel kütüphanesi yüklenmedi.','err'); return; }
  const aptId = selectedAptId;
  let rows = [];
  (S.aidatBorclandir||[]).forEach(kayit => {
    (kayit.detaylar||[]).forEach(d => {
      const sk = S.sakinler.find(x=>x.id==d.sakId);
      if (aptId && (sk?.aptId)!=aptId) return;
      const apt = S.apartmanlar.find(a=>a.id==(sk?.aptId));
      rows.push([sk?.ad||d.ad||'—', sk?.daire||d.daire||'—', apt?.ad||'—', d.kategori||'Aidat', kayit.donem||'—', d.tutar||0, kayit.tarih||'—', kayit.sonOdeme||'—']);
    });
  });
  rows.sort((a,b)=>b[6].localeCompare(a[6]));
  const ws = XLSX.utils.aoa_to_sheet([['Sakin','Daire','Apartman','Kategori','Dönem','Tutar','Borçlandırma Tarihi','Son Ödeme'],...rows]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Borç Makbuzları');
  XLSX.writeFile(wb,`borc_makbuzlari_${today()}.xlsx`);
  toast('Excel indirildi.','ok');
}

// ── TAHSİLAT MAKBUZLARI ──────────────────────────────
function renderTahsilatMakbuz() {
  const aptId = selectedAptId;
  const s = (document.getElementById('tm-srch')?.value||'').toLowerCase();
  const fKaynak = document.getElementById('tm-f-kaynak')?.value||'';
  const fBas = document.getElementById('tm-f-bas')?.value||'';
  const fBit = document.getElementById('tm-f-bit')?.value||'';

  const kaynakBilgi = yontem => {
    if (yontem==='excel') return {label:'Excel İçe Aktarma', cls:'b-am'};
    if (yontem==='banka-entegrasyon'||yontem==='banka-ent') return {label:'Banka Entegrasyonu', cls:'b-gr'};
    return {label:'Manuel Giriş', cls:'b-bl'};
  };
  const kaynakEsles = (o) => {
    const k = o.yontem||'';
    if (fKaynak==='manuel') return k!=='excel'&&k!=='banka-entegrasyon'&&k!=='banka-ent';
    if (fKaynak==='excel') return k==='excel';
    if (fKaynak==='banka') return k==='banka-entegrasyon'||k==='banka-ent';
    return true;
  };

  let list = (S.tahsilatlar||[]).filter(o=>{
    if (o.status === 'cancelled') return false;  // soft-cancelled gizle
    if (aptId && o.aptId!=aptId) return false;
    if (s && !(o.sakAd+' '+(o.no||'')).toLowerCase().includes(s)) return false;
    if (fBas && (o.tarih||'')<fBas) return false;
    if (fBit && (o.tarih||'')>fBit) return false;
    return kaynakEsles(o);
  }).slice().reverse();

  const topTutar = list.reduce((s,o)=>s+(o.tutar||0),0);
  const toplam = document.getElementById('tm-toplam');
  if (toplam) toplam.textContent = `${list.length} kayıt · Toplam: ₺${fmt(topTutar)}`;

  const tipLbl = {aidat:'Aidat',kira:'Kira',borc:'Borç Ödemesi',avans:'Avans',diger:'Diğer',gecmis_borc:'Geçmiş Borç'};
  const yonLbl = {nakit:'Nakit',banka:'Banka',eft:'EFT',kredi:'K.Kartı',havale:'Havale'};

  const tb = document.getElementById('tm-tbody');
  if (!tb) return;
  if (!list.length) { tb.innerHTML=`<tr><td colspan="11">${emp('💳','Tahsilat kaydı bulunamadı')}</td></tr>`; return; }
  tb.innerHTML = list.map(o=>{
    const kSrc = kaynakBilgi(o.yontem);
    return `<tr>
      <td style="font-family:monospace;font-size:11px;color:var(--brand)">${he(o.no||'—')}</td>
      <td><strong>${he(o.sakAd||'—')}</strong></td>
      <td style="font-weight:700;color:var(--brand)">${he(o.daire||'—')}</td>
      <td class="t2" style="font-size:11px">${he(o.aptAd||'—')}</td>
      <td><span class="b b-gr" style="font-size:10px">${he(tipLbl[o.tip]||o.tip||'—')}</span></td>
      <td class="t2" style="font-size:11px">${he(o.donem||'—')}</td>
      <td style="font-weight:700;color:var(--ok)">₺${fmt(o.tutar)}</td>
      <td class="t2" style="font-size:11px">${o.tarih||'—'}</td>
      <td><span class="b ${kSrc.cls}" style="font-size:10px">${kSrc.label}</span>${o.yontem&&yonLbl[o.yontem]?` <span class="t2" style="font-size:10px">(${yonLbl[o.yontem]})</span>`:''}</td>
      <td class="t2" style="font-size:11px;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${he(o.not||'—')}</td>
      <td style="white-space:nowrap">
        <button class="btn bg xs" onclick="openTahsilatOnizle(${o.id})" title="Önizle" style="padding:4px 8px"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="btn bg xs" onclick="editTahsilatMakbuz(${o.id})" title="Düzenle" style="padding:4px 8px;margin-left:3px"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn xs" onclick="delOdeme(${o.id})" title="Sil" style="padding:4px 8px;margin-left:3px;background:var(--err-bg);color:var(--err);border:1px solid var(--err)"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
      </td>
    </tr>`;
  }).join('');
}

function exportTahsilatMakbuz() {
  if (typeof XLSX==='undefined') { toast('Excel kütüphanesi yüklenmedi.','err'); return; }
  const aptId = selectedAptId;
  const kaynakBilgi = yontem => {
    if (yontem==='excel') return 'Excel İçe Aktarma';
    if (yontem==='banka-entegrasyon'||yontem==='banka-ent') return 'Banka Entegrasyonu';
    return 'Manuel Giriş';
  };
  const tipLbl = {aidat:'Aidat',kira:'Kira',borc:'Borç Ödemesi',avans:'Avans',diger:'Diğer',gecmis_borc:'Geçmiş Borç'};
  const list = (S.tahsilatlar||[]).filter(o=>!aptId||o.aptId==aptId).slice().reverse();
  const rows = list.map(o=>[o.no||'—',o.sakAd||'—',o.daire||'—',o.aptAd||'—',tipLbl[o.tip]||o.tip||'—',o.donem||'—',o.tutar||0,o.tarih||'—',kaynakBilgi(o.yontem),o.not||'']);
  const ws = XLSX.utils.aoa_to_sheet([['Makbuz No','Sakin','Daire','Apartman','Tip','Dönem','Tutar','Tarih','Giriş Kaynağı','Not'],...rows]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Tahsilat Makbuzları');
  XLSX.writeFile(wb,`tahsilat_makbuzlari_${today()}.xlsx`);
  toast('Excel indirildi.','ok');
}

async function genTahsilatRaporu() {
  const panel=document.getElementById('tah-ai-rapor'); if(panel) panel.style.display='';
  const out=document.getElementById('tah-ai-out'); out.textContent='AI tahsilat analizi yapılıyor…';
  const borclu=S.sakinler.filter(x=>(x.borc||0)>0);
  const topBorc=borclu.reduce((s,x)=>s+(x.borc||0),0);
  const prompt=`Sen bir finansal analist ve apartman yönetim uzmanısın.
Mevcut tahsilat durumu:
- Toplam sakin: ${S.sakinler.length}
- Borçlu sakin: ${borclu.length}
- Toplam alacak: ₺${fmt(topBorc)}
- Tahsilat oranı: %${S.sakinler.length?Math.round(((S.sakinler.length-borclu.length)/S.sakinler.length)*100):0}
Borçlu sakinler (en yüksekten): ${borclu.sort((a,b)=>(b.borc||0)-(a.borc||0)).slice(0,5).map(x=>`${x.ad}: ₺${x.borc}`).join(', ')}
Risk analizi, tahsilat stratejisi ve öneriler sun. Türkçe, profesyonel format kullan.`;
  out.textContent = await callAI(prompt);
}

// ══════════════════════════════════════════════════
// RAPORLAR & ANALİTİK MODÜLÜ
// ══════════════════════════════════════════════════
function renderRaporlar() {
  const bannerId='rap-apt-banner',contentId='rap-content';
  if(!aptCtxCheck('raporlar',bannerId,contentId,'raporlar ve analitik'))return;
  const aptId=selectedAptId,apt=S.apartmanlar.find(a=>a.id==aptId);
  renderAptBanner(bannerId,apt);

  // Yıl seçici
  const yilEl=document.getElementById('rap-f-yil');
  if(yilEl&&!yilEl.children.length){
    const yillar=[...new Set(S.finansIslemler.map(f=>f.tarih?.slice(0,4)).filter(Boolean))];
    if(!yillar.includes('2026'))yillar.push('2026');
    yillar.sort().reverse();
    yilEl.innerHTML=yillar.map(y=>`<option value="${y}">${y}</option>`).join('');
  }

  const gelir=S.finansIslemler.filter(f=>f.tur==='gelir'&&f.aptId==aptId).reduce((s,f)=>s+(f.tutar||0),0);
  const gider=S.finansIslemler.filter(f=>f.tur==='gider'&&f.aptId==aptId).reduce((s,f)=>s+(f.tutar||0),0);
  const aptSakin=S.sakinler.filter(x=>x.aptId==aptId);
  const borclu=aptSakin.filter(x=>(x.borc||0)>0).length;
  const acikAriza=S.arizalar.filter(x=>x.aptId==aptId&&x.durum==='acik').length;
  const tahsilat=S.tahsilatlar.filter(x=>x.aptId==aptId).reduce((s,x)=>s+(x.tutar||0),0);

  const stats=document.getElementById('rap-stats');
  if(stats) stats.innerHTML=`
    <div class="sc"><div class="sc-ico ic-gr"><svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg></div><div class="sc-lbl">Toplam Gelir</div><div class="sc-val v-gr">₺${fmt(gelir)}</div><div class="sc-sub">${apt.ad}</div><div class="sc-bar bar-gr"></div></div>
    <div class="sc"><div class="sc-ico ic-rd"><svg viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg></div><div class="sc-lbl">Toplam Gider</div><div class="sc-val v-rd">₺${fmt(gider)}</div><div class="sc-sub">Tüm kategoriler</div><div class="sc-bar bar-rd"></div></div>
    <div class="sc"><div class="sc-ico ic-bl"><svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">&#8378;</text></svg></div><div class="sc-lbl">Net Bakiye</div><div class="sc-val v-bl">₺${fmt(gelir-gider)}</div><div class="sc-sub">Gelir - Gider</div><div class="sc-bar bar-bl"></div></div>
    <div class="sc"><div class="sc-ico ic-am"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="sc-lbl">Toplam Tahsilat</div><div class="sc-val v-am">₺${fmt(tahsilat)}</div><div class="sc-sub">${borclu} borçlu sakin</div><div class="sc-bar bar-am"></div></div>`;

  renderKPIGrid(aptId,gelir,gider,tahsilat,aptSakin,acikAriza);
  renderMiniChart('rap-gelir-gider','G/G',gelir,gider);
  renderMiniChart2Apt('rap-tahsilat',aptId);
  renderMiniChart3Apt('rap-ariza',aptId);
  renderSakinProfil('rap-sakin-profil',aptSakin);
  renderFinansRaporSayfa();
  renderTahsilatRaporSayfa(aptId,aptSakin);
  renderArizaRaporSayfa(aptId);
}

function renderKPIGrid(aptId,gelir,gider,tahsilat,aptSakin,acikAriza){
  const el=document.getElementById('rap-kpi-grid');if(!el)return;
  const oran=aptSakin.length?Math.round(((aptSakin.length-aptSakin.filter(x=>(x.borc||0)>0).length)/aptSakin.length)*100):100;
  const maliyetArizalar=S.arizalar.filter(x=>x.aptId==aptId&&x.maliyetGercek>0).reduce((s,x)=>s+x.maliyetGercek,0);
  const kpis=[
    {val:'%'+oran,lbl:'Tahsilat Oranı',chg:oran>80?'+İyi':'⚠️ Düşük',chgCls:oran>80?'ok':'warn'},
    {val:aptSakin.length,lbl:'Toplam Sakin',chg:aptSakin.filter(x=>x.tip==='malik').length+' malik',chgCls:'bl'},
    {val:acikAriza,lbl:'Açık Arıza',chg:acikAriza>5?'⚠️ Yüksek':'Normal',chgCls:acikAriza>5?'rd':'gr'},
    {val:'₺'+fmt(maliyetArizalar),lbl:'Arıza Maliyeti',chg:'Gerçekleşen',chgCls:'am'}
  ];
  el.innerHTML=kpis.map(k=>`<div class="rap-kpi">
    <div class="rap-kpi-val" style="color:var(--${k.chgCls})">${k.val}</div>
    <div class="rap-kpi-lbl">${k.lbl}</div>
    <div class="rap-kpi-chg" style="color:var(--${k.chgCls})">${k.chg}</div>
  </div>`).join('');
}

function renderSakinProfil(id,aptSakin){
  const el=document.getElementById(id);if(!el)return;
  const malik=aptSakin.filter(x=>x.tip==='malik').length;
  const kiralik=aptSakin.filter(x=>x.tip==='kiralik').length;
  const borclu=aptSakin.filter(x=>(x.borc||0)>0).length;
  const topBorc=aptSakin.reduce((s,x)=>s+(x.borc||0),0);
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="rap-kpi"><div class="rap-kpi-val" style="color:var(--brand)">${malik}</div><div class="rap-kpi-lbl">Malik</div></div>
      <div class="rap-kpi"><div class="rap-kpi-val" style="color:var(--warn)">${kiralik}</div><div class="rap-kpi-lbl">Kiracı</div></div>
    </div>
    <div style="margin-bottom:8px;font-size:12px;color:var(--tx-2)">Borç Durumu</div>
    <div class="rap-bar-wrap mb6"><div class="rap-bar" style="width:${aptSakin.length?Math.round(((aptSakin.length-borclu)/aptSakin.length)*100):100}%;background:var(--ok)"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:11.5px">
      <span style="color:var(--ok)">${aptSakin.length-borclu} temiz</span>
      <span style="color:var(--err)">${borclu} borçlu · ₺${fmt(topBorc)}</span>
    </div>`;
}

function renderFinansRaporSayfa(){
  const aptId=selectedAptId;if(!aptId)return;
  const yil=document.getElementById('rap-f-yil')?.value||new Date().getFullYear().toString();
  const ay=document.getElementById('rap-f-ay')?.value||'';
  let list=S.finansIslemler.filter(f=>f.aptId==aptId);
  if(yil)list=list.filter(f=>f.tarih?.startsWith(yil));
  if(ay)list=list.filter(f=>f.tarih?.slice(5,7)===ay.padStart(2,'0'));

  const gelir=list.filter(f=>f.tur==='gelir').reduce((s,f)=>s+(f.tutar||0),0);
  const gider=list.filter(f=>f.tur==='gider').reduce((s,f)=>s+(f.tutar||0),0);

  const gelirEl=document.getElementById('rap-finans-gelir');
  if(gelirEl) gelirEl.innerHTML=`<div style="padding:10px 0"><div style="font-size:11px;font-weight:700;color:var(--tx-3);margin-bottom:8px">GELİR KATEGORİLERİ</div>${renderKatDagilim(list.filter(f=>f.tur==='gelir'),'ok')}</div>`;
  const giderEl=document.getElementById('rap-finans-gider');
  if(giderEl) giderEl.innerHTML=`<div style="padding:10px 0"><div style="font-size:11px;font-weight:700;color:var(--tx-3);margin-bottom:8px">GİDER KATEGORİLERİ</div>${renderKatDagilim(list.filter(f=>f.tur==='gider'),'err')}</div>`;

  const tb=document.getElementById('rap-finans-tbody');
  if(!tb)return;
  if(!list.length){tb.innerHTML=`<tr><td colspan="5">${emp('📊','Bu dönemde işlem bulunamadı')}</td></tr>`;return;}
  tb.innerHTML=list.slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||'')).map(f=>`<tr>
    <td class="t2" style="font-size:11px">${f.tarih||'—'}</td>
    <td><span class="b ${f.tur==='gelir'?'b-gr':'b-rd'}" style="font-size:10px">${f.tur}</span></td>
    <td style="font-size:12px">${f.kat||'—'}</td>
    <td style="font-size:12px;max-width:200px">${f.aciklama||'—'}</td>
    <td style="font-weight:700;color:${f.tur==='gelir'?'var(--ok)':'var(--err)'}">${f.tur==='gelir'?'+':'−'}₺${fmt(f.tutar)}</td>
  </tr>`).join('');
}

function renderKatDagilim(list,renkVar){
  const katlar={};
  list.forEach(f=>{const k=f.kat||'diger';katlar[k]=(katlar[k]||0)+(f.tutar||0);});
  const toplam=Object.values(katlar).reduce((s,v)=>s+v,0)||1;
  return Object.entries(katlar).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:12px">
      <div style="width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${k}</div>
      <div style="flex:1;background:var(--s2);border-radius:4px;height:8px">
        <div style="background:var(--${renkVar});width:${Math.round((v/toplam)*100)}%;height:100%;border-radius:4px"></div>
      </div>
      <div style="width:70px;text-align:right;font-weight:700">₺${fmt(v)}</div>
    </div>`).join('');
}

function renderTahsilatRaporSayfa(aptId,aptSakin){
  const ozet=document.getElementById('rap-tah-ozet');
  if(ozet){
    const borclu=aptSakin.filter(x=>(x.borc||0)>0).length;
    const topBorc=aptSakin.reduce((s,x)=>s+(x.borc||0),0);
    const topTahsilat=S.tahsilatlar.filter(x=>x.aptId==aptId).reduce((s,x)=>s+(x.tutar||0),0);
    ozet.innerHTML=[
      {lbl:'Toplam Borç',val:'₺'+fmt(topBorc),cls:'rd'},
      {lbl:'Toplam Tahsilat',val:'₺'+fmt(topTahsilat),cls:'gr'},
      {lbl:'Borçlu Sakin',val:borclu+'/'+aptSakin.length,cls:'am'}
    ].map(k=>`<div class="rap-kpi"><div class="rap-kpi-val" style="color:var(--${k.cls})">${k.val}</div><div class="rap-kpi-lbl">${k.lbl}</div></div>`).join('');
  }
  const tb=document.getElementById('rap-tah-tbody');if(!tb)return;
  const sakinler=S.sakinler.filter(x=>x.aptId==aptId);
  if(!sakinler.length){tb.innerHTML=`<tr><td colspan="8">${emp('👤','Sakin kaydı bulunamadı')}</td></tr>`;return;}
  tb.innerHTML=sakinler.map(sk=>{
    const tahsilat=S.tahsilatlar.filter(x=>x.sakId==sk.id).reduce((s,x)=>s+(x.tutar||0),0);
    const borc=sk.borc||0;
    const oran=sk.aidat>0?Math.round((tahsilat/(sk.aidat*12))*100):0;
    return `<tr>
      <td><strong>${sk.ad}</strong></td>
      <td style="color:var(--brand)">${sk.daire||'—'}</td>
      <td><span class="b ${sk.tip==='malik'?'b-bl':'b-am'}" style="font-size:10px">${sk.tip==='malik'?'Malik':'Kiracı'}</span></td>
      <td style="color:var(--ok)">${sk.aidat?'₺'+fmt(sk.aidat)+'/ay':'—'}</td>
      <td style="color:var(--ok);font-weight:700">₺${fmt(tahsilat)}</td>
      <td style="color:${borc>0?'var(--err)':'var(--ok)'};font-weight:700">${borc>0?'₺'+fmt(borc):'₺0'}</td>
      <td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;background:var(--s2);border-radius:3px;height:6px"><div style="background:${oran>80?'var(--ok)':oran>50?'var(--warn)':'var(--err)'};width:${Math.min(100,oran)}%;height:100%;border-radius:3px"></div></div><span style="font-size:11px;font-weight:700;width:36px">${oran}%</span></div></td>
      <td><span class="b ${borc>0?'b-rd':'b-gr'}">${borc>0?'Borçlu':'₺0'}</span></td>
    </tr>`;
  }).join('');
}

function renderArizaRaporSayfa(aptId){
  const arizalar=S.arizalar.filter(x=>x.aptId==aptId);
  const stats=document.getElementById('rap-arz-stats');
  if(stats){
    const maliyet=arizalar.reduce((s,x)=>s+(x.maliyetGercek||x.maliyetTahmini||0),0);
    stats.innerHTML=[
      {lbl:'Toplam Arıza',val:arizalar.length,cls:'bl'},
      {lbl:'Açık',val:arizalar.filter(x=>x.durum==='acik').length,cls:'rd'},
      {lbl:'Tamamlanan',val:arizalar.filter(x=>x.durum==='tamam').length,cls:'gr'},
      {lbl:'Toplam Maliyet',val:'₺'+fmt(maliyet),cls:'am'}
    ].map(k=>`<div class="rap-kpi"><div class="rap-kpi-val" style="color:var(--${k.cls})">${k.val}</div><div class="rap-kpi-lbl">${k.lbl}</div></div>`).join('');
  }
  const malEl=document.getElementById('rap-arz-maliyet');
  if(malEl) malEl.innerHTML=`<div>${renderMiniChart3Apt_html(aptId)}</div>`;

  const tb=document.getElementById('rap-arz-tbody');if(!tb)return;
  if(!arizalar.length){tb.innerHTML=`<tr><td colspan="9">${emp('🔧','Arıza kaydı bulunamadı')}</td></tr>`;return;}
  const katIco={elektrik:'⚡',su:'💧',asansor:'🔼',cati:'🏠',guvenlik:'🔒',temizlik:'🧹',diger:'🔩'};
  const durumCls={acik:'b-rd',devam:'b-am',tamam:'b-gr'};
  tb.innerHTML=arizalar.slice().reverse().map(a=>`<tr>
    <td style="font-family:monospace;font-size:11px">#${a.no||'?'}</td>
    <td>${katIco[a.kat]||'🔩'} ${a.kat||'—'}</td>
    <td class="t2" style="font-size:11.5px">${a.konum||'—'}</td>
    <td style="font-size:12px;max-width:180px">${(a.aciklama||'').slice(0,60)}…</td>
    <td><span class="b ${a.oncelik==='acil'?'b-rd':a.oncelik==='yuksek'?'b-am':'b-gy'}">${a.oncelik}</span></td>
    <td><span class="b ${durumCls[a.durum]||'b-gy'}">${a.durum}</span></td>
    <td class="t2" style="font-size:11px">${a.tarih||'—'}</td>
    <td class="t2" style="font-size:11px">${a.hedef?Math.max(0,Math.round((new Date(a.hedef)-new Date(a.tarih))/(1000*60*60*24)))+'g':'—'}</td>
    <td style="font-weight:700">${(a.maliyetGercek||a.maliyetTahmini)?'₺'+fmt(a.maliyetGercek||a.maliyetTahmini):'—'}</td>
  </tr>`).join('');
}

function renderMiniChart3Apt_html(aptId){
  const cats=['elektrik','su','asansor','cati','guvenlik','temizlik','diger'];
  const catLbl={elektrik:'Elektrik',su:'Su/Tesisat',asansor:'Asansör',cati:'Çatı',guvenlik:'Güvenlik',temizlik:'Temizlik',diger:'Diğer'};
  const counts=cats.map(c=>({c,n:S.arizalar.filter(a=>a.aptId==aptId&&a.kat===c).length})).filter(x=>x.n>0);
  if(!counts.length)return '<div class="t3" style="padding:20px;text-align:center">Arıza verisi yok</div>';
  const max=Math.max(...counts.map(x=>x.n),1);
  return counts.map(x=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px">
    <div style="width:80px">${catLbl[x.c]||x.c}</div>
    <div style="flex:1;background:var(--s2);border-radius:4px;height:8px"><div style="background:var(--warn);width:${Math.round((x.n/max)*100)}%;height:100%;border-radius:4px"></div></div>
    <div style="width:24px;text-align:right;font-weight:700">${x.n}</div>
  </div>`).join('');
}

async function genRaporAI(tip){
  const aptId=selectedAptId;if(!aptId)return;
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  const out=document.getElementById('rap-ai-out');
  const sub=document.getElementById('rap-ai-sub');
  const copyBtn=document.getElementById('rap-copy-btn');
  if(out)out.textContent='Rapor oluşturuluyor…';
  if(sub)sub.textContent='Analiz yapılıyor…';
  if(copyBtn)copyBtn.style.display='none';

  const gelir=S.finansIslemler.filter(f=>f.tur==='gelir'&&f.aptId==aptId).reduce((s,f)=>s+(f.tutar||0),0);
  const gider=S.finansIslemler.filter(f=>f.tur==='gider'&&f.aptId==aptId).reduce((s,f)=>s+(f.tutar||0),0);
  const aptSakin=S.sakinler.filter(x=>x.aptId==aptId);
  const borclu=aptSakin.filter(x=>(x.borc||0)>0).length;
  const topBorc=aptSakin.reduce((s,x)=>s+(x.borc||0),0);
  const acikAriza=S.arizalar.filter(x=>x.aptId==aptId&&x.durum==='acik').length;

  let prompt='';
  const veri=`Apartman: ${apt?.ad||''}
Sakin: ${aptSakin.length} (${borclu} borçlu, ₺${fmt(topBorc)} alacak)
Finans: Gelir ₺${fmt(gelir)}, Gider ₺${fmt(gider)}, Net ₺${fmt(gelir-gider)}
Arıza: ${S.arizalar.filter(x=>x.aptId==aptId).length} toplam, ${acikAriza} açık
Tahsilat oranı: %${aptSakin.length?Math.round(((aptSakin.length-borclu)/aptSakin.length)*100):100}`;

  if(tip==='finans')prompt=`Profesyonel finansal durum raporu yaz:
${veri}
Gelir/gider analizi, bütçe önerileri, risk noktaları. Yöneticiye sunum formatında.`;
  else if(tip==='tahsilat')prompt=`Tahsilat ve risk raporu yaz:
${veri}
Borç analizi, gecikme riskleri, tahsilat stratejisi, hukuki uyarılar.`;
  else if(tip==='ariza')prompt=`Bakım ve arıza raporu yaz:
${veri}
Mevcut açık arızalar, maliyet analizi, bakım önerileri, öncelik sırası.`;
  else prompt=`Kapsamlı yönetim raporu yaz:
${veri}
Finans, tahsilat, arıza, sakin durumu. Yönetici için özet, kritik noktalar, öneriler.`;

  const result=await callAI(prompt);
  if(out)out.textContent=result;
  if(sub)sub.textContent='Rapor hazır';
  if(copyBtn)copyBtn.style.display='';
}

function copyRapor(){
  const out=document.getElementById('rap-ai-out');
  if(out)navigator.clipboard?.writeText(out.textContent).then(()=>toast('Rapor kopyalandı.','ok'));
}

function exportFinansRapor(){toast('Excel indirme hazırlanıyor…','ok');}
function exportTahsilatRapor(){toast('Tahsilat raporu hazırlanıyor…','ok');}
function exportOdemeGecmis(){
  const aptId=selectedAptId;
  const list=S.tahsilatlar.filter(x=>x.aptId==aptId);
  if(!list.length){toast('Dışa aktarılacak kayıt yok.','warn');return;}
  const header='Makbuz No,Sakin,Daire,Tip,Dönem,Tutar,Yöntem,Tarih\n';
  const rows=list.map(o=>`${o.no},${o.sakAd},${o.daire||''},${o.tip||''},${o.donem||''},${o.tutar},${o.yontem},${o.tarih}`).join('\n');
  const blob=new Blob(['﻿'+header+rows],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='odeme_gecmis.csv';a.click();
  toast('CSV indirildi.','ok');
}
function renderMiniChart2Apt(id, aptId) {
  const el=document.getElementById(id); if(!el) return;
  const sakinler=S.sakinler.filter(s=>s.aptId==aptId);
  const borclu=sakinler.filter(s=>(s.borc||0)>0).length;
  const oran=sakinler.length?Math.round(((sakinler.length-borclu)/sakinler.length)*100):100;
  el.innerHTML=`
    <div style="text-align:center;padding:20px 0">
      <div style="font-size:36px;font-weight:800;color:${oran>80?'var(--ok)':oran>50?'var(--warn)':'var(--err)'}">${oran}%</div>
      <div style="font-size:13px;color:var(--tx-3);margin-top:4px">Tahsilat oranı</div>
      <div style="background:var(--s2);border-radius:6px;height:10px;margin:12px 0;overflow:hidden">
        <div style="background:${oran>80?'var(--ok)':oran>50?'var(--warn)':'var(--err)'};width:${oran}%;height:100%;border-radius:6px;transition:width .5s"></div>
      </div>
      <div style="font-size:12px;color:var(--tx-3)">${sakinler.length-borclu} / ${sakinler.length} sakin ödedi</div>
    </div>`;
}

function renderMiniChart3Apt(id, aptId) {
  const el=document.getElementById(id); if(!el) return;
  const cats=['elektrik','su','asansor','cati','guvenlik','temizlik','diger'];
  const catLbl={elektrik:'Elektrik',su:'Su/Tesisat',asansor:'Asansör',cati:'Çatı',guvenlik:'Güvenlik',temizlik:'Temizlik',diger:'Diğer'};
  const counts=cats.map(c=>({c,n:S.arizalar.filter(a=>a.aptId==aptId&&a.kat===c).length})).filter(x=>x.n>0);
  if(!counts.length){ el.innerHTML=`<div class="t3" style="padding:20px;text-align:center">Bu apartmanda arıza verisi yok</div>`; return; }
  const max=Math.max(...counts.map(x=>x.n),1);
  el.innerHTML=counts.map(x=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px">
    <div style="width:80px">${catLbl[x.c]||x.c}</div>
    <div style="flex:1;background:var(--s2);border-radius:4px;height:8px"><div style="background:var(--warn);width:${Math.round((x.n/max)*100)}%;height:100%;border-radius:4px"></div></div>
    <div style="width:24px;text-align:right;font-weight:700">${x.n}</div>
  </div>`).join('');
}

function renderMiniChart(id, title, gelir, gider) {
  const el=document.getElementById(id); if(!el) return;
  const max=Math.max(gelir,gider,1);
  el.innerHTML=`
    <div style="display:flex;gap:16px;align-items:flex-end;height:140px;padding:0 8px">
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px">
        <div style="font-size:11px;color:var(--ok);font-weight:700">₺${fmt(gelir)}</div>
        <div style="width:100%;background:var(--ok);border-radius:4px 4px 0 0;height:${Math.round((gelir/max)*100)}px;min-height:4px;opacity:.85"></div>
        <div style="font-size:11px;color:var(--tx-3)">Gelir</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px">
        <div style="font-size:11px;color:var(--err);font-weight:700">₺${fmt(gider)}</div>
        <div style="width:100%;background:var(--err);border-radius:4px 4px 0 0;height:${Math.round((gider/max)*100)}px;min-height:4px;opacity:.85"></div>
        <div style="font-size:11px;color:var(--tx-3)">Gider</div>
      </div>
    </div>`;
}

async function genYonetimRaporu() {
  const out=document.getElementById('rap-ai-out'); out.textContent='Yönetim raporu oluşturuluyor…';
  const gelir=S.finansIslemler.filter(f=>f.tur==='gelir').reduce((s,f)=>s+(f.tutar||0),0);
  const gider=S.finansIslemler.filter(f=>f.tur==='gider').reduce((s,f)=>s+(f.tutar||0),0);
  const prompt=`Sen kıdemli bir site yönetim danışmanısın. Aşağıdaki verilere dayanarak kapsamlı bir yönetim raporu oluştur:

SİSTEM VERİLERİ:
- Apartman: ${S.apartmanlar.length} toplam, ${S.apartmanlar.filter(a=>a.durum==='aktif').length} aktif
- Sakin: ${S.sakinler.length} kayıt, ${S.sakinler.filter(x=>(x.borc||0)>0).length} borçlu
- Personel: ${S.personel.length} kayıt, ${S.personel.filter(p=>p.durum==='aktif').length} aktif
- Görev: ${S.gorevler.length} toplam, ${S.gorevler.filter(g=>g.durum!=='tamamlandi').length} açık
- Arıza: ${S.arizalar.length} toplam, ${S.arizalar.filter(a=>a.durum==='acik').length} açık
- Duyuru: ${S.duyurular.length} kayıt
- Finans: Gelir ₺${fmt(gelir)}, Gider ₺${fmt(gider)}, Net ₺${fmt(gelir-gider)}
- Asansör: ${S.asansorler.filter(a=>dayDiff(a.sonTarih)<0).length} süresi dolmuş

Raporda şunları içer: genel durum özeti, kritik noktalar, riskler, öneriler. Profesyonel Türkçe kullan.`;
  out.textContent = await callAI(prompt);
}

// ══════════════════════════════════════════════════
// AI ASİSTAN MODÜLÜ
// ══════════════════════════════════════════════════
function initAiAsistan() {
  // Sayfa yüklendiğinde bir şey yapma, kullanıcı soru soracak
}

async function askAI(soru) {
  const out=document.getElementById('ai-asistan-out'); if(!out) return;
  out.textContent='Analiz yapılıyor…';
  const aptCtxStr = selectedAptId ? (() => {
    const a=S.apartmanlar.find(x=>x.id==selectedAptId);
    const sak=S.sakinler.filter(x=>x.aptId==selectedAptId);
    return a?`\nSeçili Apartman: ${a.ad} (${sak.length} sakin, ${sak.filter(x=>(x.borc||0)>0).length} borçlu)`:'';
  })() : '';
  const sistemVerisi = `
MEVCUT SİSTEM VERİLERİ:${aptCtxStr}
- ${S.apartmanlar.length} apartman (${S.apartmanlar.filter(a=>a.durum==='aktif').length} aktif)
- ${S.sakinler.length} sakin (${S.sakinler.filter(x=>(x.borc||0)>0).length} borçlu)
- Toplam borç: ₺${fmt(S.sakinler.reduce((s,x)=>s+(x.borc||0),0))}
- ${S.gorevler.filter(g=>g.durum!=='tamamlandi').length} açık görev
- ${S.arizalar.filter(a=>a.durum==='acik').length} açık arıza
- ${S.personel.filter(p=>p.durum==='aktif').length} aktif personel
- Asansör süresi dolmuş: ${S.asansorler.filter(a=>dayDiff(a.sonTarih)<0).length}
- Gelir: ₺${fmt(S.finansIslemler.filter(f=>f.tur==='gelir').reduce((s,f)=>s+(f.tutar||0),0))}
- Gider: ₺${fmt(S.finansIslemler.filter(f=>f.tur==='gider').reduce((s,f)=>s+(f.tutar||0),0))}`;
  const prompt = `Sen uzman bir apartman ve site yönetim danışmanısın. Aşağıdaki sistem verilerini kullanarak soruya yanıt ver.

${sistemVerisi}

SORU: ${soru}

Türkçe, profesyonel ve pratik yanıt ver.`;
  out.textContent = await callAI(prompt);
}

async function askAICustom() {
  const soru=document.getElementById('ai-soru')?.value.trim();
  if(!soru){ toast('Lütfen bir soru yazın.','err'); return; }
  await askAI(soru);
}

function clearAiChat() {
  const out=document.getElementById('ai-asistan-out');
  if(out) out.textContent='Yukarıdan bir soru seçin veya kendi sorunuzu yazın…';
  const inp=document.getElementById('ai-soru'); if(inp) inp.value='';
}


// ===================================================
// PDF İNDİR — Profesyonel Kurumsal PDF Sistemi
// ===================================================
function _pdfFirma() { return (S.ayarlar&&S.ayarlar.firma)||'SiteYönet Pro'; }
function _pdfTarih() { return new Date().toLocaleDateString('tr-TR',{day:'2-digit',month:'long',year:'numeric'}); }
function _pdfSaat() { return new Date().toLocaleString('tr-TR'); }

function _pdfStyle() {
  return `<style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#0d1526;padding:28px 36px;background:#fff;}
    h1{font-size:18px;font-weight:800;color:#1a56db;margin-bottom:2px;}
    h2{font-size:13px;font-weight:700;color:#0d1526;border-left:3px solid #1a56db;padding-left:8px;margin:16px 0 8px;}
    .header{border-bottom:3px solid #1a56db;padding-bottom:12px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-start;}
    .header-left .sub{font-size:11px;color:#6b7280;margin-top:3px;}
    .header-right{text-align:right;}
    .header-right .doc-title{font-size:15px;font-weight:700;color:#0d1526;}
    .header-right .doc-sub{font-size:11px;color:#6b7280;margin-top:3px;}
    .header-right .doc-date{font-size:11px;color:#9ca3af;margin-top:4px;}
    table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11.5px;}
    th{background:#1a56db;color:#fff;padding:7px 9px;text-align:left;font-weight:600;font-size:10.5px;letter-spacing:.3px;}
    td{padding:6px 9px;border-bottom:1px solid #e4e8ef;vertical-align:top;}
    tr:nth-child(even) td{background:#f8f9fc;}
    .b{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;}
    .b-gr{background:#ecfdf5;color:#059669;} .b-rd{background:#fef2f2;color:#dc2626;}
    .b-am{background:#fffbeb;color:#d97706;} .b-bl{background:#eff6ff;color:#1a56db;}
    .b-pu{background:#f5f3ff;color:#7c3aed;}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;}
    .stat{background:#f8f9fc;border:1px solid #e4e8ef;border-radius:7px;padding:10px 12px;}
    .stat-n{font-size:22px;font-weight:800;color:#1a56db;line-height:1;}
    .stat-l{font-size:10.5px;color:#6b7280;margin-top:3px;}
    .info-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 12px;font-size:11px;color:#1e40af;margin-bottom:12px;}
    .footer{margin-top:24px;padding-top:10px;border-top:1px solid #e4e8ef;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between;}
    .text-block{background:#f8f9fc;border:1px solid #e4e8ef;border-radius:6px;padding:10px 12px;font-size:11.5px;line-height:1.7;white-space:pre-wrap;margin-bottom:10px;}
    @media print{body{padding:10px 15px;}@page{margin:8mm;size:A4;}}
  </style>`;
}

function _pdfHeader(baslik, altBaslik) {
  return `<div class="header">
    <div class="header-left"><h1>${_pdfFirma()}</h1><div class="sub">Site &amp; Apartman Yönetim Sistemi</div></div>
    <div class="header-right">
      <div class="doc-title">${baslik}</div>
      ${altBaslik?`<div class="doc-sub">${altBaslik}</div>`:''}
      <div class="doc-date">Tarih: ${_pdfTarih()}</div>
    </div>
  </div>`;
}

function _pdfFooter() {
  return `<div class="footer"><span>${_pdfFirma()} — Resmi Belge</span><span>Oluşturulma: ${_pdfSaat()}</span></div>`;
}

function _pdfOpen(baslik, altBaslik) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${_pdfFirma()} — ${baslik}</title>${_pdfStyle()}</head><body>${_pdfHeader(baslik,altBaslik)}`;
}

function _pdfClose() { return `${_pdfFooter()}</body></html>`; }

function _badge(txt, cls) { return `<span class="b b-${cls||'bl'}">${txt}</span>`; }
function _fmtTL(n) { return '₺' + Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function _fmtDate(d) { if(!d)return'—'; try{return new Date(d).toLocaleDateString('tr-TR');}catch(e){return d;} }

// — PDF: Dashboard Özeti
function _pdfDashboard() {
  const aktif = S.apartmanlar.filter(a=>a.durum==='aktif').length;
  const topDaire = S.apartmanlar.reduce((s,a)=>s+(a.daireSayisi||0),0);
  const acikGov = S.gorevler.filter(g=>g.durum!=='tamamlandi').length;
  const acikArz = S.arizalar.filter(a=>a.durum==='acik'||a.durum==='devam').length;
  const bekTek = S.teklifler.filter(t=>t.durum==='bekliyor').length;
  const borclu = S.sakinler.filter(s=>(s.borc||0)>0).length;
  const dolAsan = S.asansorler.filter(a=>{ try{return new Date(a.sonTarih)<new Date();}catch(e){return false;} }).length;
  const topHizmet = S.apartmanlar.filter(a=>a.durum==='aktif').reduce((s,a)=>s+(a.hizmetBedeli||0),0);
  const topGelir = S.finansIslemler.filter(f=>f.tur==='gelir').reduce((s,f)=>s+(f.tutar||0),0);
  const topGider = S.finansIslemler.filter(f=>f.tur==='gider').reduce((s,f)=>s+(f.tutar||0),0);

  let html = _pdfOpen('Yönetim Paneli Özeti','Genel Durum Raporu');
  html += `<div class="stats">
    <div class="stat"><div class="stat-n">${aktif}</div><div class="stat-l">Aktif Apartman</div></div>
    <div class="stat"><div class="stat-n">${topDaire}</div><div class="stat-l">Toplam Daire</div></div>
    <div class="stat"><div class="stat-n">${S.sakinler.length}</div><div class="stat-l">Kayıtlı Sakin</div></div>
    <div class="stat"><div class="stat-n">${S.personel.length}</div><div class="stat-l">Personel</div></div>
    <div class="stat"><div class="stat-n">${acikGov}</div><div class="stat-l">Açık Görev</div></div>
    <div class="stat"><div class="stat-n">${acikArz}</div><div class="stat-l">Açık Arıza</div></div>
    <div class="stat"><div class="stat-n">${bekTek}</div><div class="stat-l">Bekleyen Teklif</div></div>
    <div class="stat"><div class="stat-n">${borclu}</div><div class="stat-l">Borçlu Sakin</div></div>
  </div>`;
  html += `<h2>Finansal Özet</h2>
  <div class="stats" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat"><div class="stat-n" style="color:#059669">${_fmtTL(topGelir)}</div><div class="stat-l">Toplam Gelir</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${_fmtTL(topGider)}</div><div class="stat-l">Toplam Gider</div></div>
    <div class="stat"><div class="stat-n" style="color:${topGelir-topGider>=0?'#059669':'#dc2626'}">${_fmtTL(topGelir-topGider)}</div><div class="stat-l">Net Bakiye</div></div>
  </div>
  <div class="stats" style="grid-template-columns:repeat(2,1fr)">
    <div class="stat"><div class="stat-n">${_fmtTL(topHizmet)}</div><div class="stat-l">Aylık Hizmet Bedeli</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${dolAsan}</div><div class="stat-l">Süresi Dolmuş Asansör</div></div>
  </div>`;
  html += `<h2>Apartman Listesi</h2><table><thead><tr><th>Apartman</th><th>Adres</th><th>Daire</th><th>Hizmet Bedeli</th><th>Sakin</th><th>Durum</th></tr></thead><tbody>`;
  S.apartmanlar.forEach(a=>{
    const sakSay = S.sakinler.filter(s=>s.aptId==a.id).length;
    html+=`<tr><td><strong>${a.ad}</strong></td><td>${a.adres||'—'}</td><td>${a.daireSayisi||0}</td><td>${_fmtTL(a.hizmetBedeli)}</td><td>${sakSay}</td><td>${_badge(a.durum==='aktif'?'Aktif':'Pasif',a.durum==='aktif'?'gr':'rd')}</td></tr>`;
  });
  if(!S.apartmanlar.length) html+=`<tr><td colspan="6" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html += `</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Apartmanlar
function _pdfApartmanlar() {
  let html = _pdfOpen('Apartman Listesi', `Toplam: ${S.apartmanlar.length} apartman`);
  html += `<div class="stats">
    <div class="stat"><div class="stat-n">${S.apartmanlar.length}</div><div class="stat-l">Toplam</div></div>
    <div class="stat"><div class="stat-n">${S.apartmanlar.filter(a=>a.durum==='aktif').length}</div><div class="stat-l">Aktif</div></div>
    <div class="stat"><div class="stat-n">${S.apartmanlar.reduce((s,a)=>s+(a.daireSayisi||0),0)}</div><div class="stat-l">Toplam Daire</div></div>
    <div class="stat"><div class="stat-n">${_fmtTL(S.apartmanlar.filter(a=>a.durum==='aktif').reduce((s,a)=>s+(a.hizmetBedeli||0),0))}</div><div class="stat-l">Aylık Hizmet</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Apartman Adı</th><th>Adres / İlçe / İl</th><th>Daire</th><th>Kat</th><th>Yönetici</th><th>Aidat</th><th>Hizmet Bedeli</th><th>Asansör</th><th>İnşaat Yılı</th><th>Durum</th></tr></thead><tbody>`;
  S.apartmanlar.forEach(a=>{
    html+=`<tr><td><strong>${a.ad}</strong></td><td>${a.adres||'—'}${a.ilce?', '+a.ilce:''}${a.il?' / '+a.il:''}</td><td>${a.daireSayisi||0}</td><td>${a.katSayisi||'—'}</td><td>${a.yon||'—'}<br><small style="color:#6b7280">${a.yonTel||''}</small></td><td>${_fmtTL(a.aidat)}</td><td><strong>${_fmtTL(a.hizmetBedeli)}</strong></td><td>${a.asansor==='evet'?'✓ Var':'✗ Yok'}</td><td>${a.insaatYili||'—'}</td><td>${_badge(a.durum==='aktif'?'Aktif':'Pasif',a.durum==='aktif'?'gr':'rd')}</td></tr>`;
  });
  if(!S.apartmanlar.length) html+=`<tr><td colspan="10" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Sakinler
function _pdfSakinler() {
  const apt = selectedAptId ? aptById(selectedAptId) : null;
  const list = apt ? S.sakinler.filter(s=>s.aptId==selectedAptId) : S.sakinler;
  const malik = list.filter(s=>s.tip==='malik').length;
  const borclu = list.filter(s=>(s.borc||0)>0).length;
  let html = _pdfOpen('Sakin Listesi', apt ? `Apartman: ${apt.ad}` : 'Tüm Apartmanlar');
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam Sakin</div></div>
    <div class="stat"><div class="stat-n">${malik}</div><div class="stat-l">Malik</div></div>
    <div class="stat"><div class="stat-n">${list.length-malik}</div><div class="stat-l">Kiracı</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${borclu}</div><div class="stat-l">Borçlu</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Ad Soyad</th><th>Daire / Kat</th><th>Tip</th><th>Telefon</th><th>E-posta</th><th>TC</th><th>Giriş</th><th>Araç Plakası</th><th>Borç</th></tr></thead><tbody>`;
  list.forEach(s=>{
    html+=`<tr><td><strong>${s.ad}</strong></td><td>${s.daire||'—'} / ${s.kat||'—'}</td><td>${_badge(s.tip==='malik'?'Malik':'Kiracı',s.tip==='malik'?'bl':'pu')}</td><td>${s.tel||'—'}</td><td>${s.email||'—'}</td><td>${s.tc||'—'}</td><td>${_fmtDate(s.giris)}</td><td>${s.plaka||'—'}</td><td style="color:${(s.borc||0)>0?'#dc2626':'#059669'};font-weight:700">${(s.borc||0)>0?_fmtTL(s.borc):'—'}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="9" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Personel
function _pdfPersonel() {
  const list = S.personel||[];
  let html = _pdfOpen('Personel Listesi', `Toplam: ${list.length} personel`);
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam</div></div>
    <div class="stat"><div class="stat-n">${list.filter(p=>p.durum==='aktif'||!p.durum).length}</div><div class="stat-l">Aktif</div></div>
    <div class="stat"><div class="stat-n">${_fmtTL(list.reduce((s,p)=>s+(p.maas||0),0))}</div><div class="stat-l">Toplam Maaş</div></div>
    <div class="stat"><div class="stat-n">${[...new Set(list.map(p=>p.gorev))].length}</div><div class="stat-l">Farklı Pozisyon</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Ad Soyad</th><th>Görev / Pozisyon</th><th>Telefon</th><th>E-posta</th><th>TC</th><th>Başlangıç</th><th>Maaş</th><th>Durum</th></tr></thead><tbody>`;
  list.forEach(p=>{
    html+=`<tr><td><strong>${p.ad}</strong></td><td>${p.gorev||'—'}</td><td>${p.tel||'—'}</td><td>${p.email||'—'}</td><td>${p.tc||'—'}</td><td>${_fmtDate(p.baslangic)}</td><td>${p.maas?_fmtTL(p.maas):'—'}</td><td>${_badge(p.durum==='pasif'?'Pasif':'Aktif',p.durum==='pasif'?'rd':'gr')}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="8" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Denetim Raporları
function _pdfDenetim() {
  const apt = selectedAptId ? aptById(selectedAptId) : null;
  const list = apt ? S.denetimler.filter(d=>d.aptId==selectedAptId) : S.denetimler;
  const ort = list.length ? Math.round(list.reduce((s,d)=>s+(d.puan||0),0)/list.length) : 0;
  let html = _pdfOpen('Denetim Raporları', apt?`Apartman: ${apt.ad}`:'Tüm Apartmanlar');
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam Rapor</div></div>
    <div class="stat"><div class="stat-n">${list.filter(d=>(d.puan||0)>=80).length}</div><div class="stat-l">İyi (80+)</div></div>
    <div class="stat"><div class="stat-n">${list.filter(d=>(d.puan||0)>=60&&(d.puan||0)<80).length}</div><div class="stat-l">Orta (60-79)</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${list.filter(d=>(d.puan||0)<60).length}</div><div class="stat-l">Zayıf (&lt;60)</div></div>
  </div>`;
  if(list.length) html+=`<div class="info-box">Ortalama Puan: <strong>${ort}/100</strong></div>`;
  html+=`<table><thead><tr><th>Apartman</th><th>Tarih</th><th>Denetçi</th><th>Temizlik</th><th>Güvenlik</th><th>Teknik</th><th>Çevre</th><th>Altyapı</th><th>Toplam Puan</th><th>Sonraki</th></tr></thead><tbody>`;
  list.slice().sort((a,b)=>new Date(b.tarih)-new Date(a.tarih)).forEach(d=>{
    const pCls=d.puan>=80?'gr':d.puan>=60?'am':'rd';
    html+=`<tr><td><strong>${d.aptAd||'—'}</strong></td><td>${_fmtDate(d.tarih)}</td><td>${d.denetci||'—'}</td><td>${d.temizlik||0}/10</td><td>${d.guvenlik||0}/10</td><td>${d.teknik||0}/10</td><td>${d.cevre||0}/10</td><td>${d.altyapi||0}/10</td><td>${_badge((d.puan||0)+'/100',pCls)}</td><td>${_fmtDate(d.sonraki)}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="10" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Asansör
function _pdfAsansor() {
  const list = S.asansorler||[];
  const now = new Date(); const limit30 = new Date(now.getTime()+30*864e5);
  const gecerli = list.filter(a=>new Date(a.sonTarih)>limit30).length;
  const yakin = list.filter(a=>{const d=new Date(a.sonTarih);return d>now&&d<=limit30;}).length;
  const dolmus = list.filter(a=>new Date(a.sonTarih)<=now).length;
  let html = _pdfOpen('Asansör Kayıtları', `Toplam: ${list.length} kayıt`);
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam</div></div>
    <div class="stat"><div class="stat-n" style="color:#059669">${gecerli}</div><div class="stat-l">Geçerli</div></div>
    <div class="stat"><div class="stat-n" style="color:#d97706">${yakin}</div><div class="stat-l">30 Gün İçinde</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${dolmus}</div><div class="stat-l">Süresi Dolmuş</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Apartman</th><th>Blok</th><th>Asansör No</th><th>Bakım Firması</th><th>Firma Tel</th><th>Son Bakım</th><th>Sonraki Bakım</th><th>Sertifika No</th><th>Durum</th></tr></thead><tbody>`;
  list.forEach(a=>{
    const sT=new Date(a.sonTarih); const tur=sT<=now?'rd':sT<=limit30?'am':'gr'; const durTxt=sT<=now?'Süresi Dolmuş':sT<=limit30?'Yaklaşıyor':'Geçerli';
    html+=`<tr><td><strong>${a.aptAd||'—'}</strong></td><td>${a.blok||'—'}</td><td>${a.asansorNo||'—'}</td><td>${a.firma||'—'}</td><td>${a.firmaTel||'—'}</td><td>${_fmtDate(a.tarih)}</td><td>${_fmtDate(a.sonTarih)}</td><td>${a.sertifikaNo||'—'}</td><td>${_badge(durTxt,tur)}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="9" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Teklifler
function _pdfTeklifler() {
  const list = S.teklifler||[];
  const bek=list.filter(t=>t.durum==='bekliyor').length;
  const onay=list.filter(t=>t.durum==='onaylandi').length;
  const topTutar=list.filter(t=>t.durum==='onaylandi').reduce((s,t)=>s+(t.tutar||0),0);
  let html = _pdfOpen('Teklif Listesi', `Toplam: ${list.length} teklif`);
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam</div></div>
    <div class="stat"><div class="stat-n" style="color:#d97706">${bek}</div><div class="stat-l">Bekliyor</div></div>
    <div class="stat"><div class="stat-n" style="color:#059669">${onay}</div><div class="stat-l">Onaylandı</div></div>
    <div class="stat"><div class="stat-n">${_fmtTL(topTutar)}</div><div class="stat-l">Onaylı Tutar</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Apartman</th><th>Konu</th><th>Firma</th><th>Tutar</th><th>Tarih</th><th>Son Tarih</th><th>Durum</th></tr></thead><tbody>`;
  list.slice().sort((a,b)=>new Date(b.tarih)-new Date(a.tarih)).forEach(t=>{
    const dCls=t.durum==='bekliyor'?'am':t.durum==='onaylandi'?'gr':'rd';
    const dTxt=t.durum==='bekliyor'?'Bekliyor':t.durum==='onaylandi'?'Onaylandı':'Reddedildi';
    html+=`<tr><td><strong>${t.aptAd||'—'}</strong></td><td>${t.konu||'—'}</td><td>${t.firma||'—'}</td><td><strong>${_fmtTL(t.tutar)}</strong></td><td>${_fmtDate(t.tarih)}</td><td>${_fmtDate(t.sonTarih)}</td><td>${_badge(dTxt,dCls)}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="7" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Görevler
function _pdfGorevler() {
  const list = S.gorevler||[];
  const acik=list.filter(g=>g.durum!=='tamamlandi').length;
  let html = _pdfOpen('Görev Listesi', `Toplam: ${list.length} görev`);
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${list.filter(g=>g.oncelik==='acil').length}</div><div class="stat-l">Acil</div></div>
    <div class="stat"><div class="stat-n">${acik}</div><div class="stat-l">Açık</div></div>
    <div class="stat"><div class="stat-n" style="color:#059669">${list.filter(g=>g.durum==='tamamlandi').length}</div><div class="stat-l">Tamamlandı</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Görev Başlığı</th><th>Apartman</th><th>Kategori</th><th>Atanan</th><th>Başlangıç</th><th>Son Tarih</th><th>Öncelik</th><th>Durum</th></tr></thead><tbody>`;
  list.slice().sort((a,b)=>{ const op={acil:0,yuksek:1,normal:2,dusuk:3}; return (op[a.oncelik]||2)-(op[b.oncelik]||2); }).forEach(g=>{
    const oCls=g.oncelik==='acil'?'rd':g.oncelik==='yuksek'?'am':'bl';
    const dCls=g.durum==='tamamlandi'?'gr':g.durum==='devam'?'bl':'am';
    const dTxt=g.durum==='tamamlandi'?'Tamamlandı':g.durum==='devam'?'Devam':'Bekliyor';
    html+=`<tr><td><strong>${g.baslik||'—'}</strong></td><td>${g.aptAd||'Genel'}</td><td>${g.kat||'—'}</td><td>${g.atanan||'—'}</td><td>${_fmtDate(g.basTarih)}</td><td>${_fmtDate(g.sonTarih)}</td><td>${_badge(g.oncelik||'normal',oCls)}</td><td>${_badge(dTxt,dCls)}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="8" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: İşletme Projesi
function _pdfIsletme() {
  const list = S.isletmeProjeler||[];
  let html = _pdfOpen('İşletme Projeleri', `Toplam: ${list.length} proje`);
  html+=`<table><thead><tr><th>Proje Adı</th><th>Apartman</th><th>Dönem</th><th>Dağılım</th><th>Toplam Bütçe</th><th>Kayıt Tarihi</th></tr></thead><tbody>`;
  list.slice().reverse().forEach(p=>{
    html+=`<tr><td><strong>${p.ad||p.aptAd||'—'}</strong></td><td>${p.aptAd||'—'}</td><td>${p.donem||'—'}</td><td>${p.dagitim==='arsa'?'Arsa Payı':'Eşit'}</td><td><strong>${_fmtTL(p.toplam||p.giderler?.reduce((s,g)=>s+(g.tutar||0),0)||0)}</strong></td><td>${_fmtDate(p.tarih)}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="6" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  list.slice(-3).reverse().forEach(p=>{
    if(!p.giderler||!p.giderler.length) return;
    html+=`<h2>${p.aptAd||'—'} — ${p.donem||'—'} Gider Kalemleri</h2>`;
    html+=`<table><thead><tr><th>Gider Kalemi</th><th>Tutar (₺)</th><th>Açıklama</th></tr></thead><tbody>`;
    p.giderler.forEach(g=>{ html+=`<tr><td>${g.ad||'—'}</td><td><strong>${_fmtTL(g.tutar)}</strong></td><td>${g.aciklama||'—'}</td></tr>`; });
    html+=`<tr style="background:#f0f9ff"><td><strong>TOPLAM</strong></td><td><strong>${_fmtTL(p.giderler.reduce((s,g)=>s+(g.tutar||0),0))}</strong></td><td></td></tr></tbody></table>`;
  });
  return html + _pdfClose();
}

// — PDF: Asansör Detay
function _pdfAsanDetay() {
  const a = _currentAsanDetayId ? S.asansorler.find(x => x.id === _currentAsanDetayId) : null;
  if (!a) return _pdfOpen('Asansör Detay','') + '<p style="padding:20px;color:#9ca3af">Kayıt bulunamadı.</p>' + _pdfClose();
  const d = dayDiff(a.sonTarih);
  const gecti = d < 0;
  const yakin = d >= 0 && d < 30;
  const durum = gecti ? 'Süresi Doldu' : yakin ? 'Yakında Dolacak' : 'Geçerli';
  const renk  = gecti ? '#dc2626' : yakin ? '#d97706' : '#059669';
  const etiketDate = new Date(a.etiketTarih);
  const sonDate    = new Date(a.sonTarih);
  const toplamGun  = Math.round((sonDate - etiketDate) / 86400000);
  const gecenGun   = Math.round((new Date() - etiketDate) / 86400000);
  const ilerlemePct = toplamGun > 0 ? Math.min(100, Math.round((gecenGun / toplamGun) * 100)) : 0;
  const asanLabel = a.asansorNo
    ? (a.blok && a.blok !== '—' ? a.blok + ' / Asansör ' + a.asansorNo : 'Asansör ' + a.asansorNo)
    : (a.bolum || '—');
  let html = _pdfOpen('Asansör Detay', `${a.aptAd} · ${asanLabel} · ${durum}`);
  html += `<div class="stats" style="grid-template-columns:repeat(4,1fr)">
    <div class="stat" style="border-left:3px solid ${renk}"><div class="stat-n" style="color:${renk}">${durum}</div><div class="stat-l">Etiket Durumu</div></div>
    <div class="stat"><div class="stat-n">${Math.abs(d)}</div><div class="stat-l">${gecti?'Gün Geçti':'Gün Kaldı'}</div></div>
    <div class="stat"><div class="stat-n">%${ilerlemePct}</div><div class="stat-l">Süre Tüketimi</div></div>
    <div class="stat"><div class="stat-n">${toplamGun}</div><div class="stat-l">Toplam Süre (Gün)</div></div>
  </div>`;
  html += `<div class="info-box">Apartman: <strong>${a.aptAd}</strong> &nbsp;|&nbsp; Asansör: <strong>${asanLabel}</strong> &nbsp;|&nbsp; Firma: <strong>${a.firma||'—'}</strong> &nbsp;|&nbsp; Etiket: <strong>${a.etiketTarih}</strong> &nbsp;|&nbsp; Son Tarih: <strong style="color:${renk}">${a.sonTarih}</strong></div>`;
  html += `<h2>🔼 Asansör Bilgileri</h2>
  <table><thead><tr><th>Alan</th><th>Bilgi</th></tr></thead><tbody>
    <tr><td>Apartman</td><td><strong>${a.aptAd}</strong></td></tr>
    <tr><td>Blok</td><td>${a.blok && a.blok!=='—'?a.blok:'—'}</td></tr>
    <tr><td>Asansör No</td><td>${a.asansorNo||'—'}</td></tr>
    <tr><td>Tanım / Bölüm</td><td>${a.bolum||'—'}</td></tr>
    <tr><td>Bakım Firması</td><td>${a.firma||'—'}</td></tr>
    <tr><td>Etiket (Muayene) Tarihi</td><td>${a.etiketTarih}</td></tr>
    <tr><td>Son Geçerlilik Tarihi</td><td><strong style="color:${renk}">${a.sonTarih}</strong></td></tr>
    <tr><td>Toplam Geçerlilik Süresi</td><td>${toplamGun} gün</td></tr>
    <tr><td>Geçen Süre</td><td>${gecenGun} gün (%${ilerlemePct})</td></tr>
    <tr style="background:${renk}18"><td><strong>Durum</strong></td><td><strong style="color:${renk}">${durum} · ${gecti?Math.abs(d)+' gün önce doldu':d+' gün kaldı'}</strong></td></tr>
  </tbody></table>`;
  if (gecti) html += `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 14px;margin-top:16px;font-size:13px;color:#dc2626"><strong>⚠️ Etiket süresi doldu!</strong> Bu asansörün periyodik kontrol etiketi ${Math.abs(d)} gün önce sona erdi. Yetkili bir firma ile yenilenmesi gerekmektedir.</div>`;
  else if (yakin) html += `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 14px;margin-top:16px;font-size:13px;color:#92400e"><strong>⏰ Süre dolmak üzere!</strong> Bu asansörün periyodik kontrol etiketi ${d} gün içinde sona erecek.</div>`;
  return html + _pdfClose();
}

// — PDF: Denetim Raporu Detay
function _pdfDenDetay() {
  const d = _currentDenDetayId ? S.denetimler.find(x => x.id === _currentDenDetayId) : null;
  if (!d) return _pdfOpen('Denetim Raporu','') + '<p style="padding:20px;color:#9ca3af">Rapor bulunamadı.</p>' + _pdfClose();
  const clr = p => p>=80?'#059669':p>=60?'#d97706':'#dc2626';
  const durumRenk = d.durum==='iyi'?'#059669':d.durum==='orta'?'#d97706':'#dc2626';
  const durumLbl  = d.durum==='iyi'?'İyi':d.durum==='orta'?'Orta':'Zayıf';
  const kriterler = [
    {ad:'Temizlik', puan:d.temizlik||0},
    {ad:'Güvenlik', puan:d.guvenlik||0},
    {ad:'Teknik',   puan:d.teknik||0},
    {ad:'Çevre Düzeni', puan:d.cevre||0},
    {ad:'Altyapı',  puan:d.altyapi||0},
  ];
  const ort = kriterler.reduce((s,k)=>s+k.puan,0)/kriterler.length;
  let html = _pdfOpen('Denetim Raporu', `${d.aptAd} · ${d.tarih||'—'} · Denetçi: ${d.denetci||'—'}`);
  html += `<div class="stats" style="grid-template-columns:repeat(4,1fr)">
    <div class="stat" style="border-left:3px solid ${durumRenk}"><div class="stat-n" style="color:${durumRenk}">${d.puan}</div><div class="stat-l">Genel Puan (/100)</div></div>
    <div class="stat"><div class="stat-n">${ort.toFixed(1)}</div><div class="stat-l">Ort. Kriter (/10)</div></div>
    <div class="stat"><div class="stat-n" style="color:${durumRenk}">${durumLbl}</div><div class="stat-l">Sonuç</div></div>
    <div class="stat"><div class="stat-n" style="font-size:13px">${d.sonraki||'—'}</div><div class="stat-l">Sonraki Denetim</div></div>
  </div>`;
  html += `<div class="info-box">Apartman: <strong>${d.aptAd}</strong> &nbsp;|&nbsp; Denetim Tarihi: <strong>${d.tarih||'—'}</strong> &nbsp;|&nbsp; Denetçi: <strong>${d.denetci||'—'}</strong> &nbsp;|&nbsp; Sonraki: <strong>${d.sonraki||'—'}</strong></div>`;
  html += `<h2>📊 Kriter Puanları</h2>
  <table><thead><tr><th>Kriter</th><th style="text-align:center">Puan (0–10)</th><th style="text-align:center">100 Üzerinden</th><th>Durum</th></tr></thead><tbody>`;
  kriterler.forEach(k => {
    const kclr = clr(k.puan*10);
    html += `<tr><td><strong>${k.ad}</strong></td><td style="text-align:center;font-weight:700;color:${kclr}">${k.puan}/10</td><td style="text-align:center;font-weight:700;color:${kclr}">${k.puan*10}</td><td><strong style="color:${kclr}">${k.puan>=8?'İyi':k.puan>=6?'Orta':'Zayıf'}</strong></td></tr>`;
  });
  html += `<tr style="background:#f0f9ff"><td><strong>GENEL PUAN</strong></td><td style="text-align:center"><strong style="color:${durumRenk}">${(d.puan/10).toFixed(1)}/10</strong></td><td style="text-align:center"><strong style="color:${durumRenk}">${d.puan}</strong></td><td><strong style="color:${durumRenk}">${durumLbl}</strong></td></tr>`;
  html += `</tbody></table>`;
  if (d.notlar) html += `<h2>📋 Tespitler & Notlar</h2><div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 14px;font-size:13px;line-height:1.7;white-space:pre-wrap">${d.notlar}</div>`;
  if (d.onlem)  html += `<h2>✅ Alınacak Önlemler</h2><div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 14px;font-size:13px;line-height:1.7;white-space:pre-wrap">${d.onlem}</div>`;
  return html + _pdfClose();
}

// — PDF: İşletme Projesi Detay
function _pdfIslDetay() {
  const p = _currentIslDetayId ? S.isletmeProjeler.find(x => x.id === _currentIslDetayId) : null;
  if (!p) return _pdfOpen('İşletme Projesi Detay','') + '<p style="padding:20px;color:#9ca3af">Proje bulunamadı.</p>' + _pdfClose();
  const ay = p.ayCount || 1;
  const dl = { esit:'Eşit Dağılım', arsa:'Arsa Payı', oran:'Özel Oran' };
  const giderAylik = p.toplam || 0;
  const aidatAylik = p.aidatAylik != null
    ? p.aidatAylik
    : (p.gelirDahil ? Math.max(0, giderAylik - (p.gelirHaric||0)) : giderAylik);
  const hariçAylik = p.gelirHaric || 0;
  const gelirAylik = aidatAylik + hariçAylik;
  const giderTop   = giderAylik * ay;
  const gelirTop   = gelirAylik * ay;
  const net        = gelirTop - giderTop;

  let html = _pdfOpen('İşletme Projesi Detay', `${p.aptAd} · ${p.donem} · ${ay} Aylık Dönem`);

  // Özet kartlar
  html += `<div class="stats" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat" style="border-left:3px solid #059669">
      <div class="stat-n" style="color:#059669">${_fmtTL(gelirTop)}</div>
      <div class="stat-l">Toplam Gelir (${ay} ay)</div>
    </div>
    <div class="stat" style="border-left:3px solid #dc2626">
      <div class="stat-n" style="color:#dc2626">${_fmtTL(giderTop)}</div>
      <div class="stat-l">Toplam Gider (${ay} ay)</div>
    </div>
    <div class="stat" style="border-left:3px solid ${net>=0?'#059669':'#dc2626'}">
      <div class="stat-n" style="color:${net>=0?'#059669':'#dc2626'}">${net>=0?'+':''}${_fmtTL(Math.abs(net))}</div>
      <div class="stat-l">Net Durum · ${net>=0?'Fazla':'Açık'}</div>
    </div>
  </div>`;

  // PDF liste toggle — önce detay sayfasına, sonra isletme sayfasına bak
  const pdfListeGosterDetay = (document.getElementById('isl-detay-pdf-liste') ?? document.getElementById('isl-pdf-dagitim'))?.checked !== false;

  // Proje bilgileri
  const denk = p.gelirDahil && hariçAylik > 0;
  html += `<div class="info-box">Apartman: <strong>${p.aptAd}</strong> &nbsp;|&nbsp; Dönem: <strong>${p.donem}</strong> &nbsp;|&nbsp; Ay Sayısı: <strong>${ay}</strong> &nbsp;|&nbsp; Dağılım: <strong>${dl[p.dagitim]||p.dagitim}</strong>${denk?' &nbsp;|&nbsp; <strong style="color:#059669">Denk Bütçe</strong>':''} &nbsp;|&nbsp; Proje Tarihi: <strong>${p.tarih||'—'}</strong></div>`;

  // Gider kalemleri
  html += `<h2>💸 Gider Kalemleri</h2>
  <table><thead><tr><th>Gider Kalemi</th><th>Aylık (₺)</th><th>Dönem Toplam (₺)</th><th>Pay (%)</th></tr></thead><tbody>`;
  const giderler = (p.giderler || []).filter(g => (g.tutar||0) > 0);
  giderler.forEach(g => {
    const pp = giderAylik > 0 ? Math.round((g.tutar||0)/giderAylik*100) : 0;
    html += `<tr><td>${g.ad||'—'}</td><td><strong>${_fmtTL(g.tutar||0)}</strong></td><td><strong style="color:#dc2626">${_fmtTL((g.tutar||0)*ay)}</strong></td><td>%${pp}</td></tr>`;
  });
  html += `<tr style="background:#fef2f2"><td><strong>TOPLAM</strong></td><td><strong>${_fmtTL(giderAylik)}</strong></td><td><strong style="color:#dc2626">${_fmtTL(giderTop)}</strong></td><td>%100</td></tr>`;
  html += `</tbody></table>`;

  // Gelir kalemleri
  html += `<h2>💰 Gelir Kalemleri</h2>
  <table><thead><tr><th>Gelir Kalemi</th><th>Aylık (₺)</th><th>Dönem Toplam (₺)</th></tr></thead><tbody>`;
  html += `<tr style="background:#ecfdf5"><td><strong>🏠 Aidat Geliri${denk?' (Denk Bütçe)':''}</strong></td><td><strong style="color:#059669">${_fmtTL(aidatAylik)}</strong></td><td><strong style="color:#059669">${_fmtTL(aidatAylik*ay)}</strong></td></tr>`;
  (p.gelirler || []).filter(g => (g.tutar||0) > 0).forEach(g => {
    html += `<tr><td>${g.ad||'—'}</td><td><strong>${_fmtTL(g.tutar||0)}</strong></td><td><strong style="color:#059669">${_fmtTL((g.tutar||0)*ay)}</strong></td></tr>`;
  });
  html += `<tr style="background:#ecfdf5"><td><strong>TOPLAM</strong></td><td><strong>${_fmtTL(gelirAylik)}</strong></td><td><strong style="color:#059669">${_fmtTL(gelirTop)}</strong></td></tr>`;
  html += `</tbody></table>`;

  // Aidat dağılım: liste mi özet mi? (detay sayfası toggle öncelikli)
  const pdfListeGoster = pdfListeGosterDetay;
  if (p.dagitimRows && p.dagitimRows.length) {
    if (pdfListeGoster) {
      // Tam daire listesi
      html += `<h2>🏠 Aidat Dağılım Tablosu</h2>
      <table><thead><tr><th>Daire</th><th>Tür</th><th>Sakin</th><th>Blok</th><th>Aylık Aidat</th><th>Dönem Aidatı</th></tr></thead><tbody>`;
      p.dagitimRows.forEach(d => {
        html += `<tr><td>${d.daire||'—'}</td><td>${d.tur||'—'}</td><td>${d.sakin||'—'}</td><td>${d.blok||'—'}</td><td><strong style="color:#059669">${d.aylikAidat||'—'}</strong></td><td><strong style="color:#059669">${d.donemAidat||'—'}</strong></td></tr>`;
      });
      html += `</tbody></table>`;
    } else {
      // Blok bazlı özet
      html += `<h2>🏠 Aidat Dağılım Özeti (Blok Bazlı)</h2>`;
      const bloklarMap = {};
      p.dagitimRows.forEach(d => {
        const blokAd = d.blok || 'Genel';
        if (!bloklarMap[blokAd]) bloklarMap[blokAd] = { daireler: 0, mesken: 0, isyeri: 0, aylikTop: 0, donemTop: 0 };
        bloklarMap[blokAd].daireler++;
        if ((d.tur||'').toLowerCase().includes('işyeri') || (d.tur||'').toLowerCase().includes('isyeri')) bloklarMap[blokAd].isyeri++;
        else bloklarMap[blokAd].mesken++;
        const ay = parseFloat((d.aylikAidat||'0').replace(/[^0-9.,]/g,'').replace(',','.')) || 0;
        const don = parseFloat((d.donemAidat||'0').replace(/[^0-9.,]/g,'').replace(',','.')) || 0;
        bloklarMap[blokAd].aylikTop += ay;
        bloklarMap[blokAd].donemTop += don;
      });
      html += `<table><thead><tr><th>Blok</th><th>Bağımsız Bölüm</th><th>Mesken</th><th>İşyeri</th><th>Toplam Aylık Aidat</th><th>Toplam Dönem Aidatı</th></tr></thead><tbody>`;
      Object.entries(bloklarMap).forEach(([blokAd, b]) => {
        html += `<tr><td><strong>${blokAd}</strong></td><td style="text-align:center">${b.daireler}</td><td style="text-align:center">${b.mesken}</td><td style="text-align:center">${b.isyeri}</td><td><strong style="color:#059669">₺${b.aylikTop.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></td><td><strong style="color:#059669">₺${b.donemTop.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></td></tr>`;
      });
      const totAy  = Object.values(bloklarMap).reduce((s,b)=>s+b.aylikTop, 0);
      const totDon = Object.values(bloklarMap).reduce((s,b)=>s+b.donemTop, 0);
      const totD   = Object.values(bloklarMap).reduce((s,b)=>s+b.daireler, 0);
      html += `<tr style="background:#ecfdf5"><td><strong>TOPLAM</strong></td><td style="text-align:center"><strong>${totD}</strong></td><td style="text-align:center"><strong>${Object.values(bloklarMap).reduce((s,b)=>s+b.mesken,0)}</strong></td><td style="text-align:center"><strong>${Object.values(bloklarMap).reduce((s,b)=>s+b.isyeri,0)}</strong></td><td><strong style="color:#059669">₺${totAy.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></td><td><strong style="color:#059669">₺${totDon.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></td></tr>`;
      html += `</tbody></table>`;
      html += `<div class="info-box" style="margin-top:12px;font-size:12px;color:#6b7280">ℹ️ Detaylı daire listesi bu PDF çıktısına dahil edilmemiştir. Tam liste için "PDF'e liste ekle" seçeneğini işaretleyiniz.</div>`;
    }
  }

  return html + _pdfClose();
}

// — PDF: Kararlar
function _pdfKararlar() {
  const list = S.kararlar||[];
  let html = _pdfOpen('Karar Listesi', `Toplam: ${list.length} karar`);
  html+=`<div class="stats" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam Karar</div></div>
    <div class="stat"><div class="stat-n">${[...new Set(list.map(k=>k.aptId))].length}</div><div class="stat-l">Apartman</div></div>
    <div class="stat"><div class="stat-n">${list.length?new Date(Math.max(...list.map(k=>new Date(k.tarih)))).toLocaleDateString('tr-TR'):'—'}</div><div class="stat-l">Son Karar</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Apartman</th><th>Tarih</th><th>Karar No</th><th>Tür</th><th>Katılım</th></tr></thead><tbody>`;
  list.slice().sort((a,b)=>new Date(b.tarih)-new Date(a.tarih)).forEach(k=>{
    html+=`<tr><td><strong>${k.aptAd||'—'}</strong></td><td>${_fmtDate(k.tarih)}</td><td>${k.no||'—'}</td><td>${k.tur||'—'}</td><td>${k.katilim||'—'} kişi</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="5" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  list.slice(0,5).forEach(k=>{
    if(!k.metin) return;
    html+=`<h2>${k.aptAd||'—'} — ${k.no||'Karar'} (${_fmtDate(k.tarih)})</h2>`;
    html+=`<div class="text-block">${k.metin.substring(0,1200)}${k.metin.length>1200?'\n[...]':''}</div>`;
  });
  return html + _pdfClose();
}

// — PDF: İcra
function _pdfIcra() {
  const list = S.icralar||[];
  const devam=list.filter(i=>i.durum==='devam').length;
  const topTutar=list.reduce((s,i)=>s+(i.tutar||0),0);
  let html = _pdfOpen('İcra Takip Dosyaları', `Toplam: ${list.length} dosya`);
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam Dosya</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${devam}</div><div class="stat-l">Devam Eden</div></div>
    <div class="stat"><div class="stat-n">${list.filter(i=>i.durum==='tahsil').length}</div><div class="stat-l">Tahsil Edildi</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${_fmtTL(topTutar)}</div><div class="stat-l">Toplam Alacak</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Apartman</th><th>Borçlu</th><th>Daire</th><th>Avukat</th><th>Dosya No</th><th>İcra Dairesi</th><th>Sebep</th><th>Tutar</th><th>Tarih</th><th>Durum</th></tr></thead><tbody>`;
  list.forEach(i=>{
    const dCls=i.durum==='devam'?'rd':i.durum==='tahsil'?'gr':'am';
    const dTxt=i.durum==='devam'?'Devam':i.durum==='tahsil'?'Tahsil':'Kapatıldı';
    html+=`<tr><td><strong>${i.aptAd||'—'}</strong></td><td>${i.borclu||'—'}</td><td>${i.daire||'—'}</td><td>${i.avukat||'—'}</td><td>${i.dosyaNo||'—'}</td><td>${i.icraDairesi||'—'}</td><td>${i.sebep||'—'}</td><td><strong>${_fmtTL(i.tutar)}</strong></td><td>${_fmtDate(i.tarih)}</td><td>${_badge(dTxt,dCls)}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="10" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Finans
function _pdfFinans() {
  const list = S.finansIslemler||[];
  const gelir=list.filter(f=>f.tur==='gelir').reduce((s,f)=>s+(f.tutar||0),0);
  const gider=list.filter(f=>f.tur==='gider').reduce((s,f)=>s+(f.tutar||0),0);
  const apt = selectedAptId ? aptById(selectedAptId) : null;
  const filtList = apt ? list.filter(f=>f.aptId==selectedAptId) : list;
  let html = _pdfOpen('Finansal İşlemler', apt?`Apartman: ${apt.ad}`:'Tüm Apartmanlar');
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam İşlem</div></div>
    <div class="stat"><div class="stat-n" style="color:#059669">${_fmtTL(gelir)}</div><div class="stat-l">Toplam Gelir</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${_fmtTL(gider)}</div><div class="stat-l">Toplam Gider</div></div>
    <div class="stat"><div class="stat-n" style="color:${gelir-gider>=0?'#059669':'#dc2626'}">${_fmtTL(gelir-gider)}</div><div class="stat-l">Net Bakiye</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Tarih</th><th>Apartman</th><th>Tür</th><th>Kategori</th><th>Tutar</th><th>Belge No</th><th>Açıklama</th></tr></thead><tbody>`;
  filtList.slice().sort((a,b)=>new Date(b.tarih)-new Date(a.tarih)).forEach(f=>{
    html+=`<tr><td>${_fmtDate(f.tarih)}</td><td>${f.aptAd||'—'}</td><td>${_badge(f.tur==='gelir'?'Gelir':'Gider',f.tur==='gelir'?'gr':'rd')}</td><td>${f.kat||'—'}</td><td style="font-weight:700;color:${f.tur==='gelir'?'#059669':'#dc2626'}">${_fmtTL(f.tutar)}</td><td>${f.belge||'—'}</td><td>${f.aciklama||'—'}</td></tr>`;
  });
  if(!filtList.length) html+=`<tr><td colspan="7" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Duyurular
function _pdfDuyurular() {
  const apt = selectedAptId ? aptById(selectedAptId) : null;
  const list = apt ? S.duyurular.filter(d=>!d.aptId||d.aptId==selectedAptId) : S.duyurular;
  let html = _pdfOpen('Duyurular', apt?`Apartman: ${apt.ad}`:'Tüm Duyurular');
  html+=`<div class="stats" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${list.filter(d=>d.onem==='acil').length}</div><div class="stat-l">Acil</div></div>
    <div class="stat"><div class="stat-n">${list.filter(d=>d.durum!=='arsiv').length}</div><div class="stat-l">Aktif</div></div>
  </div>`;
  list.slice().sort((a,b)=>new Date(b.tarih)-new Date(a.tarih)).forEach(d=>{
    const oCls=d.onem==='acil'?'rd':d.onem==='onemli'?'am':'bl';
    html+=`<div style="border:1px solid #e4e8ef;border-radius:7px;padding:12px 14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <strong style="font-size:13px">${d.baslik||'—'}</strong>
        <div style="display:flex;gap:6px;align-items:center">${_badge(d.onem||'normal',oCls)}<small style="color:#9ca3af">${_fmtDate(d.tarih)}</small></div>
      </div>
      <div style="font-size:11.5px;color:#374151;line-height:1.6">${d.icerik||'—'}</div>
      ${d.aptAd?`<div style="margin-top:6px;font-size:10.5px;color:#6b7280">Apartman: ${d.aptAd}</div>`:''}
    </div>`;
  });
  if(!list.length) html+=`<p style="text-align:center;color:#9ca3af;padding:20px 0">Kayıt yok</p>`;
  return html + _pdfClose();
}

// — PDF: Arızalar
function _pdfAriza() {
  const apt = selectedAptId ? aptById(selectedAptId) : null;
  const list = apt ? S.arizalar.filter(a=>a.aptId==selectedAptId) : S.arizalar;
  const acik=list.filter(a=>a.durum==='acik'||a.durum==='devam').length;
  const topMaliyet=list.reduce((s,a)=>s+(a.maliyetGercek||a.maliyetTahmini||0),0);
  let html = _pdfOpen('Arıza & Bakım Kayıtları', apt?`Apartman: ${apt.ad}`:'Tüm Apartmanlar');
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${acik}</div><div class="stat-l">Açık</div></div>
    <div class="stat"><div class="stat-n" style="color:#059669">${list.filter(a=>a.durum==='tamam').length}</div><div class="stat-l">Tamamlandı</div></div>
    <div class="stat"><div class="stat-n">${_fmtTL(topMaliyet)}</div><div class="stat-l">Toplam Maliyet</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Apartman</th><th>Kategori</th><th>Konum</th><th>Öncelik</th><th>Atanan</th><th>Tarih</th><th>Hedef</th><th>Maliyet</th><th>Durum</th></tr></thead><tbody>`;
  list.slice().sort((a,b)=>{ const op={acil:0,yuksek:1,normal:2}; return (op[a.oncelik]||2)-(op[b.oncelik]||2); }).forEach(a=>{
    const oCls=a.oncelik==='acil'?'rd':a.oncelik==='yuksek'?'am':'bl';
    const dCls=a.durum==='acik'?'rd':a.durum==='devam'?'am':'gr';
    const dTxt=a.durum==='acik'?'Açık':a.durum==='devam'?'Devam':'Tamam';
    html+=`<tr><td><strong>${a.aptAd||'—'}</strong></td><td>${a.kat||'—'}</td><td>${a.konum||'—'}</td><td>${_badge(a.oncelik||'normal',oCls)}</td><td>${a.atanan||'—'}</td><td>${_fmtDate(a.tarih)}</td><td>${_fmtDate(a.hedef)}</td><td>${_fmtTL(a.maliyetGercek||a.maliyetTahmini||0)}</td><td>${_badge(dTxt,dCls)}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="9" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Tahsilat
function _pdfTahsilat() {
  const apt = selectedAptId ? aptById(selectedAptId) : null;
  const list = apt ? (S.tahsilatlar||[]).filter(t=>t.aptId==selectedAptId) : (S.tahsilatlar||[]);
  const topTutar=list.reduce((s,t)=>s+(t.tutar||0),0);
  const borclu = S.sakinler.filter(s=>(!apt||s.aptId==selectedAptId)&&(s.borc||0)>0);
  const topBorc = borclu.reduce((s,x)=>s+(x.borc||0),0);
  let html = _pdfOpen('Tahsilat Kayıtları', apt?`Apartman: ${apt.ad}`:'Tüm Apartmanlar');
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam Ödeme</div></div>
    <div class="stat"><div class="stat-n" style="color:#059669">${_fmtTL(topTutar)}</div><div class="stat-l">Toplam Tahsilat</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${borclu.length}</div><div class="stat-l">Borçlu Sakin</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${_fmtTL(topBorc)}</div><div class="stat-l">Toplam Borç</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Tarih</th><th>Sakin</th><th>Daire</th><th>Apartman</th><th>Dönem</th><th>Tutar</th><th>Yöntem</th><th>Not</th></tr></thead><tbody>`;
  list.slice().sort((a,b)=>new Date(b.tarih)-new Date(a.tarih)).forEach(t=>{
    html+=`<tr><td>${_fmtDate(t.tarih)}</td><td>${t.sakin||t.sakAd||'—'}</td><td>${t.daire||'—'}</td><td>${t.aptAd||'—'}</td><td>${t.donem||'—'}</td><td><strong style="color:#059669">${_fmtTL(t.tutar)}</strong></td><td>${t.yontem||'—'}</td><td>${t.not||'—'}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="8" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  if(borclu.length){
    html+=`<h2>Borçlu Sakinler</h2><table><thead><tr><th>Ad Soyad</th><th>Daire</th><th>Telefon</th><th>Borç Miktarı</th></tr></thead><tbody>`;
    borclu.forEach(s=>{ html+=`<tr><td><strong>${s.ad}</strong></td><td>${s.daire||'—'}</td><td>${s.tel||'—'}</td><td style="color:#dc2626;font-weight:700">${_fmtTL(s.borc)}</td></tr>`; });
    html+=`</tbody></table>`;
  }
  return html + _pdfClose();
}

// — PDF: Raporlar
function _pdfRaporlar() {
  const apt = selectedAptId ? aptById(selectedAptId) : null;
  const apts = apt ? [apt] : S.apartmanlar;
  let html = _pdfOpen('Yönetim Raporları', apt?`Apartman: ${apt.ad}`:'Tüm Apartmanlar');
  const gelir=S.finansIslemler.filter(f=>f.tur==='gelir'&&(!apt||f.aptId==selectedAptId)).reduce((s,f)=>s+(f.tutar||0),0);
  const gider=S.finansIslemler.filter(f=>f.tur==='gider'&&(!apt||f.aptId==selectedAptId)).reduce((s,f)=>s+(f.tutar||0),0);
  const acikArz=S.arizalar.filter(a=>a.durum!=='tamam'&&(!apt||a.aptId==selectedAptId)).length;
  const tahTop=( S.tahsilatlar||[]).filter(t=>!apt||t.aptId==selectedAptId).reduce((s,t)=>s+(t.tutar||0),0);
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n" style="color:#059669">${_fmtTL(gelir)}</div><div class="stat-l">Toplam Gelir</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${_fmtTL(gider)}</div><div class="stat-l">Toplam Gider</div></div>
    <div class="stat"><div class="stat-n" style="color:${gelir-gider>=0?'#059669':'#dc2626'}">${_fmtTL(gelir-gider)}</div><div class="stat-l">Net Bakiye</div></div>
    <div class="stat"><div class="stat-n" style="color:#059669">${_fmtTL(tahTop)}</div><div class="stat-l">Tahsilat</div></div>
  </div>`;
  html+=`<h2>Apartman Bazlı Özet</h2><table><thead><tr><th>Apartman</th><th>Daire</th><th>Sakin</th><th>Borçlu</th><th>Açık Arıza</th><th>Denetim Puanı</th><th>Aidat/Ay</th></tr></thead><tbody>`;
  apts.forEach(a=>{
    const sakList=S.sakinler.filter(s=>s.aptId==a.id);
    const borcluSay=sakList.filter(s=>(s.borc||0)>0).length;
    const aptArz=S.arizalar.filter(x=>x.aptId==a.id&&x.durum!=='tamam').length;
    const denList=S.denetimler.filter(d=>d.aptId==a.id).sort((x,y)=>new Date(y.tarih)-new Date(x.tarih));
    const sonPuan=denList[0]?.puan;
    html+=`<tr><td><strong>${a.ad}</strong></td><td>${a.daireSayisi||0}</td><td>${sakList.length}</td><td style="color:#dc2626">${borcluSay}</td><td style="color:#dc2626">${aptArz}</td><td>${sonPuan!=null?_badge(sonPuan+'/100',sonPuan>=80?'gr':sonPuan>=60?'am':'rd'):'—'}</td><td>${_fmtTL(a.aidat)}</td></tr>`;
  });
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Sigorta
function _pdfSigorta() {
  const list = S.sigortalar||[];
  const now=new Date(); const l30=new Date(now.getTime()+30*864e5);
  const aktif=list.filter(s=>new Date(s.bit||s.biter)>now).length;
  const topPrim=list.reduce((s,x)=>s+(x.prim||0),0);
  let html = _pdfOpen('Sigorta Poliçeleri', `Toplam: ${list.length} poliçe`);
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam</div></div>
    <div class="stat"><div class="stat-n" style="color:#059669">${aktif}</div><div class="stat-l">Aktif</div></div>
    <div class="stat"><div class="stat-n" style="color:#d97706">${list.filter(s=>{const d=new Date(s.bit||s.biter);return d>now&&d<=l30;}).length}</div><div class="stat-l">30 Gün İçinde</div></div>
    <div class="stat"><div class="stat-n">${_fmtTL(topPrim)}</div><div class="stat-l">Toplam Prim</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Apartman</th><th>Sigorta Türü</th><th>Şirket</th><th>Poliçe No</th><th>Başlangıç</th><th>Bitiş</th><th>Yıllık Prim</th><th>Durum</th></tr></thead><tbody>`;
  list.forEach(s=>{
    const bit=new Date(s.bit||s.biter); const dCls=bit<=now?'rd':bit<=l30?'am':'gr'; const dTxt=bit<=now?'Süresi Dolmuş':bit<=l30?'Yaklaşıyor':'Aktif';
    html+=`<tr><td><strong>${s.aptAd||'—'}</strong></td><td>${s.tur||'—'}</td><td>${s.sirket||s.firma||'—'}</td><td>${s.no||s.policeNo||'—'}</td><td>${_fmtDate(s.bas||s.baslar)}</td><td>${_fmtDate(s.bit||s.biter)}</td><td>${_fmtTL(s.prim)}</td><td>${_badge(dTxt,dCls)}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="8" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Toplantı
function _pdfToplanti() {
  const list = S.toplantılar||[];
  let html = _pdfOpen('Toplantı Kayıtları', `Toplam: ${list.length} toplantı`);
  html+=`<div class="stats" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam</div></div>
    <div class="stat"><div class="stat-n">${list.filter(t=>t.tur==='olagan').length}</div><div class="stat-l">Olağan</div></div>
    <div class="stat"><div class="stat-n">${list.filter(t=>t.tur==='olaganustu').length}</div><div class="stat-l">Olağanüstü</div></div>
  </div>`;
  html+=`<table><thead><tr><th>Apartman</th><th>Toplantı Türü</th><th>Tarih</th><th>Yer</th><th>Katılım</th><th>Gündem</th><th>Durum</th></tr></thead><tbody>`;
  list.slice().sort((a,b)=>new Date(b.tarih)-new Date(a.tarih)).forEach(t=>{
    const turLbl={olagan:'Olağan KMK',olaganustu:'Olağanüstü',yonetim:'Yönetim Kurulu',diger:'Toplantı'};
    const dCls=t.durum==='yapildi'?'gr':t.durum==='iptal'?'rd':'am'; const dTxt=t.durum==='yapildi'?'Yapıldı':t.durum==='iptal'?'İptal':'Planlandı';
    html+=`<tr><td><strong>${t.aptAd||'—'}</strong></td><td>${turLbl[t.tur]||t.tur||'—'}</td><td>${_fmtDate(t.tarih)}</td><td>${t.yer||'—'}</td><td>${t.katilim||'—'} kişi</td><td style="max-width:200px;font-size:10.5px">${(t.gundem||'—').substring(0,100)}</td><td>${_badge(dTxt,dCls)}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="7" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — PDF: Fatura
function _pdfFatura() {
  const list = S.faturalar||[];
  const bek=list.filter(f=>f.durum==='bekliyor').length;
  const topTutar=list.filter(f=>f.durum==='bekliyor').reduce((s,f)=>s+(f.tutar||0),0);
  const odendi=list.filter(f=>f.durum==='odendi').reduce((s,f)=>s+(f.tutar||0),0);
  let html = _pdfOpen('Fatura Yönetimi', `Toplam: ${list.length} fatura`);
  html+=`<div class="stats">
    <div class="stat"><div class="stat-n">${list.length}</div><div class="stat-l">Toplam</div></div>
    <div class="stat"><div class="stat-n" style="color:#d97706">${bek}</div><div class="stat-l">Bekleyen</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${list.filter(f=>f.durum==='gecikti').length}</div><div class="stat-l">Gecikmiş</div></div>
    <div class="stat"><div class="stat-n" style="color:#059669">${_fmtTL(odendi)}</div><div class="stat-l">Ödenen Toplam</div></div>
  </div>`;
  if(topTutar>0) html+=`<div class="info-box">Bekleyen Ödemeler Toplamı: <strong>${_fmtTL(topTutar)}</strong></div>`;
  html+=`<table><thead><tr><th>Apartman</th><th>Tür</th><th>Firma</th><th>Fatura No</th><th>Dönem</th><th>Tutar</th><th>Fatura Tarihi</th><th>Son Ödeme</th><th>Durum</th></tr></thead><tbody>`;
  list.slice().sort((a,b)=>new Date(b.tarih||b.kayitTarih)-new Date(a.tarih||a.kayitTarih)).forEach(f=>{
    const dCls=f.durum==='odendi'?'gr':f.durum==='gecikti'?'rd':'am'; const dTxt=f.durum==='odendi'?'Ödendi':f.durum==='gecikti'?'Gecikti':'Bekliyor';
    html+=`<tr><td><strong>${f.aptAd||'—'}</strong></td><td>${f.tur||'—'}</td><td>${f.firma||'—'}</td><td>${f.no||'—'}</td><td>${f.donem||'—'}</td><td><strong>${_fmtTL(f.tutar)}</strong></td><td>${_fmtDate(f.tarih)}</td><td>${_fmtDate(f.son)}</td><td>${_badge(dTxt,dCls)}</td></tr>`;
  });
  if(!list.length) html+=`<tr><td colspan="9" style="text-align:center;color:#9ca3af">Kayıt yok</td></tr>`;
  html+=`</tbody></table>`;
  return html + _pdfClose();
}

// — Ana Router
function downloadPDF(tip) {
  const noSupport = ['ayarlar','ai-asistan'];
  if (noSupport.includes(tip)) { toast('Bu sayfa için PDF çıktısı desteklenmez.', 'warn'); return; }

  const _pdfMap = () => ({
    dashboard:_pdfDashboard, apartmanlar:_pdfApartmanlar, sakinler:_pdfSakinler,
    personel:_pdfPersonel, denetim:_pdfDenetim, asansor:_pdfAsansor,
    teklifler:_pdfTeklifler, gorevler:_pdfGorevler, isletme:_pdfIsletme,
    'isl-detay':_pdfIslDetay, 'den-detay':_pdfDenDetay, 'asan-detay':_pdfAsanDetay,
    karar:_pdfKararlar, icra:_pdfIcra, finans:_pdfFinans,
    duyurular:_pdfDuyurular, ariza:_pdfAriza, tahsilat:_pdfTahsilat,
    raporlar:_pdfRaporlar, sigorta:_pdfSigorta, toplanti:_pdfToplanti, fatura:_pdfFatura
  });

  // html2pdf.js yüklü değilse eski popup yöntemine fallback
  if (typeof html2pdf === 'undefined') {
    const w = window.open('', '_blank', 'width=1050,height=760');
    if (!w) { toast('Popup engelleyici açık — PDF açılamadı!', 'warn'); return; }
    try {
      const map = _pdfMap();
      const html = map[tip] ? map[tip]() : _pdfOpen('PDF','') + '<p style="padding:20px;color:#9ca3af">PDF desteği yakında.</p>' + _pdfClose();
      w.document.write(html); w.document.close(); w.focus();
      setTimeout(() => w.print(), 700);
      toast('PDF hazırlanıyor…', 'ok');
    } catch(e) { w.close(); toast('PDF hatası: ' + e.message, 'err'); }
    return;
  }

  // ── html2pdf.js ile direkt indirme ──
  try {
    const map = _pdfMap();
    const htmlStr = map[tip] ? map[tip]() : _pdfOpen('PDF','') + '<p style="padding:20px;color:#9ca3af">Bu sayfa için PDF desteği yakında eklenecek.</p>' + _pdfClose();

    // <style> ve <body> içeriğini ayır
    const styleMatch = htmlStr.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const bodyMatch  = htmlStr.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const styleBlock = styleMatch ? `<style>${styleMatch[1]}</style>` : '';
    const bodyContent = bodyMatch ? bodyMatch[1] : htmlStr;

    // Dosya adı: firma_sayfa_YYYY-MM-DD.pdf
    const firma = (_pdfFirma() || 'SiteYonet').replace(/[^\w\u00C0-\u024F]/g, '_').replace(/_+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${firma}_${tip}_${dateStr}.pdf`;

    // A4 genişliğinde gizli render konteyneri
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;z-index:-1;';
    container.innerHTML = styleBlock + bodyContent;
    document.body.appendChild(container);

    toast('PDF hazırlanıyor…', 'ok');

    html2pdf()
      .set({
        margin:      [10, 10, 10, 10],
        filename:    filename,
        image:       { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' }
      })
      .from(container)
      .save()
      .then(() => {
        document.body.removeChild(container);
        toast('✓ PDF indirildi: ' + filename, 'ok');
      })
      .catch(err => {
        if (document.body.contains(container)) document.body.removeChild(container);
        toast('PDF hatası: ' + err.message, 'err');
        console.error('PDF error:', err);
      });
  } catch(e) {
    toast('PDF hatası: ' + e.message, 'err');
    console.error('PDF error:', e);
  }
}

// ===================================================
// TANIMLAMA — GELİR & GİDER KATEGORİLERİ
// ===================================================
const VARSAYILAN_GELIR = [
  {id:1,ad:'Aidat',ikon:'🏠',renk:'#4f6ef7',aktif:true,varsayilan:true},
  {id:2,ad:'Kira Geliri',ikon:'🏡',renk:'#16a34a',aktif:true},
  {id:3,ad:'Otopark',ikon:'🚗',renk:'#0e7490',aktif:true},
  {id:4,ad:'Ortak Alan Geliri',ikon:'🏢',renk:'#7c3aed',aktif:true},
  {id:5,ad:'Bağış',ikon:'🎁',renk:'#db2777',aktif:true},
  {id:6,ad:'Diğer Gelir',ikon:'📦',renk:'#78716c',aktif:true}
];
const VARSAYILAN_GIDER = [
  {id:1,ad:'Temizlik',ikon:'🧹',renk:'#dc2626',aktif:true},
  {id:2,ad:'Asansör Bakım',ikon:'🛗',renk:'#d97706',aktif:true},
  {id:3,ad:'Elektrik',ikon:'⚡',renk:'#ca8a04',aktif:true},
  {id:4,ad:'Su',ikon:'💧',renk:'#0ea5e9',aktif:true},
  {id:5,ad:'Doğalgaz',ikon:'🔥',renk:'#f97316',aktif:true},
  {id:6,ad:'Güvenlik',ikon:'🔒',renk:'#6366f1',aktif:true},
  {id:7,ad:'Yönetim Ücreti',ikon:'👔',renk:'#8b5cf6',aktif:true},
  {id:8,ad:'Sigorta',ikon:'🛡️',renk:'#0f766e',aktif:true},
  {id:9,ad:'Onarım / Tadilat',ikon:'🔨',renk:'#b45309',aktif:true},
  {id:10,ad:'Bahçe Bakım',ikon:'🌿',renk:'#15803d',aktif:true},
  {id:11,ad:'Diğer Gider',ikon:'📋',renk:'#78716c',aktif:true}
];

function initTanimlar() {
  if (!S.gelirTanimlari || !S.gelirTanimlari.length) { S.gelirTanimlari = JSON.parse(JSON.stringify(VARSAYILAN_GELIR)); }
  if (!S.giderTanimlari || !S.giderTanimlari.length) { S.giderTanimlari = JSON.parse(JSON.stringify(VARSAYILAN_GIDER)); }
}

function renderTanimlama() {
  initTanimlar();
  renderTanimList('gelir');
  renderTanimList('gider');
}

function renderTanimList(tur) {
  const list = tur === 'gelir' ? S.gelirTanimlari : S.giderTanimlari;
  const el = document.getElementById(tur+'-tanim-list');
  const cnt = document.getElementById(tur+'-tanim-count');
  if (!el) return;
  if (cnt) cnt.textContent = list.length + ' tanım';
  if (!list.length) { el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--tx-3);font-size:12.5px">Henüz tanım eklenmemiş.</div>'; return; }
  el.innerHTML = list.map((t,i) => `
    <div class="tanim-item">
      <span class="tanim-renk" style="background:${t.renk||'#ccc'}"></span>
      <span class="tanim-ad">${t.ad}</span>
      ${t.varsayilan?'<span class="tanim-badge">Varsayılan</span>':''}
      <label style="display:flex;align-items:center;gap:4px;font-size:11.5px;cursor:pointer;color:var(--tx-3)">
        <input type="checkbox" ${t.aktif!==false?'checked':''} onchange="toggleTanim('${tur}',${i},this.checked)" style="cursor:pointer">
        Aktif
      </label>
      <button class="btn bg xs" onclick="editTanim('${tur}',${i})" title="Düzenle">
        <svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      ${!t.varsayilan?`<button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delTanim('${tur}',${i})" title="Sil">
        <svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>`:''}
    </div>`).join('');
  // Finans dropdown'ını güncelle
  updateFinKategori();
}

function addTanim(tur) {
  const adEl   = document.getElementById('yeni-'+tur+'-ad');
  const ikonEl = document.getElementById('yeni-'+tur+'-ikon');
  const renkEl = document.getElementById('yeni-'+tur+'-renk');
  const ad = adEl?.value?.trim();
  if (!ad) { toast('Tanım adı giriniz','warn'); return; }
  initTanimlar();
  const list = tur === 'gelir' ? S.gelirTanimlari : S.giderTanimlari;
  if (list.find(t=>t.ad.toLowerCase()===ad.toLowerCase())) { toast('Bu tanım zaten mevcut','warn'); return; }
  const newId = Math.max(0,...list.map(t=>t.id||0))+1;
  list.push({id:newId, ad, ikon:ikonEl?.value||'📌', renk:renkEl?.value||'#888', aktif:true});
  save(); renderTanimList(tur);
  if(adEl) adEl.value='';
  toast(ad+' tanımı eklendi','ok');
}

function delTanim(tur, idx) {
  if (!confirm('Bu tanımı silmek istediğinizden emin misiniz?')) return;
  if (tur==='gelir') S.gelirTanimlari.splice(idx,1);
  else S.giderTanimlari.splice(idx,1);
  save(); renderTanimList(tur);
  toast('Tanım silindi','ok');
}

function toggleTanim(tur, idx, val) {
  const list = tur==='gelir' ? S.gelirTanimlari : S.giderTanimlari;
  if (list[idx]) { list[idx].aktif = val; save(); updateFinKategori(); }
}

function editTanim(tur, idx) {
  const list = tur==='gelir' ? S.gelirTanimlari : S.giderTanimlari;
  const t = list[idx];
  if (!t) return;
  const yeniAd = prompt('Tanım adını düzenle:', t.ad);
  if (!yeniAd || !yeniAd.trim()) return;
  t.ad = yeniAd.trim();
  save(); renderTanimList(tur);
  toast('Tanım güncellendi','ok');
}

// ===================================================
// GLOBAL SEARCH
// ===================================================
function globalSearch(q) {
  const res = document.getElementById('search-results');
  if (!q || q.length < 2) { res.classList.remove('show'); return; }
  const qRaw = q.trim();
  q = qRaw.toLowerCase();
  let items = [];

  // --- DAİRE ARAMI (en üste çıksın) ---
  // "A 3", "A3", "B 12", "B12" gibi blok+daire no
  const blokDaireRgx = /^([a-zA-ZçÇğĞıİöÖşŞüÜ]+)\s*(\d+)$/;
  const blokDaireM = q.match(blokDaireRgx);
  // Sadece sayı girilince → daire no araması
  const sadeceNo = /^\d+$/.test(q);
  const aptId = selectedAptId;
  const sakinHavuzu = (S.sakinler||[]).filter(s => !aptId || s.aptId == aptId);

  // Tekrarlamamak için işlenmiş daire kümesi
  const islenenDaire = new Set();
  sakinHavuzu.forEach(sk => {
    const blok = (sk.blok||'').toLowerCase().replace(/\s*blok\s*/i,'').trim();
    const daireNo = (sk.daire||'').toLowerCase();
    const ad = (sk.ad||'').toLowerCase();
    const aptAd2 = (S.apartmanlar.find(a=>a.id==sk.aptId)||{}).ad || '';
    const key = sk.aptId+'_'+sk.daire;
    let matched = false;

    if (blokDaireM) {
      // "A 3" → blok "a", daire "3"
      const bHarf = blokDaireM[1].toLowerCase();
      const dNo   = blokDaireM[2];
      if ((blok === bHarf || blok.startsWith(bHarf)) && daireNo === dNo) matched = true;
    } else if (sadeceNo) {
      if (daireNo === q) matched = true;
    } else {
      // Ad soyad araması
      if (ad.includes(q)) matched = true;
      // "a blok 3" veya "a-3" gibi
      const noSpace = q.replace(/[\s\-\/]/g,'');
      if ((blok+daireNo) === noSpace) matched = true;
    }

    if (matched && !islenenDaire.has(key)) {
      islenenDaire.add(key);
      const tipLbl = sk.tip==='malik' ? 'Kat Maliki' : 'Kiracı';
      const borcDrm = (sk.borc||0)>0 ? `₺${fmt(sk.borc)} borç` : '₺0';
      const blokGoster = sk.blok ? sk.blok+' / ' : '';
      items.push({
        tag:'Daire',
        title:`${blokGoster}Daire ${sk.daire} — ${sk.ad}`,
        sub:`${aptAd2} · ${tipLbl} · ${borcDrm}`,
        action:`goDaireDetay(${sk.id});hideSearchResults()`
      });
    }
  });

  // --- DİĞER ARAMALAR ---
  S.apartmanlar.forEach(a => { if ((a.ad+' '+(a.adres||'')).toLowerCase().includes(q)) items.push({tag:'Apartman',title:a.ad,sub:a.adres||'',page:'apartmanlar'}); });
  S.gorevler.forEach(g => { if ((g.baslik+' '+(g.atanan||'')).toLowerCase().includes(q)) items.push({tag:'Görev',title:g.baslik,sub:g.atanan||'',page:'gorevler'}); });
  S.teklifler.forEach(t => { if ((t.konu+' '+(t.firma||'')).toLowerCase().includes(q)) items.push({tag:'Teklif',title:t.konu,sub:(t.firma||'')+' — '+fmtMoney(t.tutar),page:'teklifler'}); });
  S.denetimler.forEach(d => { if ((d.aptAd+' '+(d.denetci||'')).toLowerCase().includes(q)) items.push({tag:'Denetim',title:d.aptAd,sub:d.denetci||'',page:'denetim'}); });
  S.icralar.forEach(i => { if ((i.borclu+' '+(i.dosyaNo||'')).toLowerCase().includes(q)) items.push({tag:'İcra',title:i.borclu,sub:i.dosyaNo||'',page:'icra'}); });
  S.finansIslemler.forEach(f => { if ((f.aciklama+' '+(f.kat||'')).toLowerCase().includes(q)) items.push({tag:'Finans',title:f.aciklama||f.kat,sub:fmtMoney(f.tutar),page:'finans'}); });

  if (!items.length) { res.innerHTML='<div class="notif-empty">Sonuç bulunamadı</div>'; res.classList.add('show'); return; }
  res.innerHTML = items.slice(0,10).map(i => {
    const onclick = i.action ? i.action : `goPage('${i.page}');hideSearchResults()`;
    return `<div class="sr-item" onclick="${onclick}"><span class="sr-tag">${i.tag}</span><div><div class="sr-title">${i.title}</div><div class="sr-sub">${i.sub}</div></div></div>`;
  }).join('');
  res.classList.add('show');
}
function showSearchResults() { if (document.getElementById('gsearch').value.length >= 2) document.getElementById('search-results').classList.add('show'); }
function hideSearchResults() { document.getElementById('search-results').classList.remove('show'); document.getElementById('gsearch').value=''; }
document.addEventListener('click', e => { if (!e.target.closest('#global-search-bar')) hideSearchResults(); });

// ===================================================
// BİLDİRİMLER
// ===================================================
function buildNotifs() {
  const items = [];
  const today_d = new Date(); today_d.setHours(0,0,0,0);
  // Asansör süresi yaklaşan
  S.asansorler.forEach(a => {
    const d = dayDiff(a.sonTarih);
    if (d < 0) items.push({type:'danger', icon:'<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/></svg>', title:`${a.aptAd} — ${a.bolum||'Asansör'}`, sub:`Muayene ${Math.abs(d)} gün önce doldu!`, page:'asansor'});
    else if (d <= 30) items.push({type:'warn', icon:'<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/></svg>', title:`${a.aptAd} — ${a.bolum||'Asansör'}`, sub:`Muayene ${d} gün içinde`, page:'asansor'});
  });
  // Personele atanan görev bildirimleri (okunmamış)
  (S.gorevBildirimleri||[]).filter(b=>!b.okundu).forEach(b=>{
    const onBadgeTxt = b.oncelik==='acil'?'⚡ Acil':b.oncelik==='yuksek'?'↑ Yüksek':'';
    items.push({type: b.oncelik==='acil'?'danger':'info',
      icon:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 9l2 2 4-4"/><line x1="16" y1="10" x2="19" y2="10"/><path d="M8 15l2 2 4-4"/><line x1="16" y1="16" x2="19" y2="16"/></svg>',
      title:`${b.atananAd} — ${b.baslik}`,
      sub:`Görev atandı${b.aptAd?' — '+b.aptAd:''}${onBadgeTxt?' ('+onBadgeTxt+')':''}`,
      page:'gorevler', bildirimId:b.id});
  });
  // Acil görevler
  S.gorevler.filter(g=>g.durum!=='tamamlandi'&&g.oncelik==='acil').forEach(g=>{
    items.push({type:'danger', icon:'<svg viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>', title:g.baslik, sub:`Acil görev — ${g.aptAd||''}`, page:'gorevler'});
  });
  // Aktif icra dosyaları
  const aktifIcra = S.icralar.filter(i=>i.durum==='devam');
  if (aktifIcra.length) items.push({type:'info', icon:'<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', title:`${aktifIcra.length} aktif icra dosyası`, sub:'Devam eden hukuki işlemler', page:'icra'});
  // Sigorta yaklaşan/dolmuş
  (S.sigortalar||[]).forEach(x => {
    const d = dayDiff(x.bit);
    if (d < 0) items.push({type:'danger', icon:'🛡️', title:`${x.aptAd} — ${x.tur?.toUpperCase()||'SİGORTA'}`, sub:`Poliçe ${Math.abs(d)} gün önce sona erdi!`, page:'sigorta'});
    else if (d <= 30) items.push({type:'warn', icon:'🛡️', title:`${x.aptAd} — ${x.tur?.toUpperCase()||'SİGORTA'}`, sub:`Poliçe ${d} gün içinde bitiyor`, page:'sigorta'});
  });
  // Çok borçlu sakinler (borç > 0)
  const topBorclu = S.sakinler.filter(x=>(x.borc||0)>0).sort((a,b)=>(b.borc||0)-(a.borc||0)).slice(0,3);
  topBorclu.forEach(sk => {
    items.push({type:'warn', icon:'💰', title:`${sk.ad} — ${sk.aptAd||''} Daire ${sk.daire||'?'}`, sub:`₺${fmt(sk.borc||0)} gecikmiş borç`, page:'tahsilat'});
  });
  // Yaklaşan toplantılar (7 gün içinde)
  (S.toplantılar||[]).filter(x=>x.durum==='planli').forEach(x => {
    const d = dayDiff(x.tarih);
    if (d >= 0 && d <= 7) items.push({type:'info', icon:'📅', title:`${x.aptAd} — Toplantı`, sub:`${d === 0 ? 'Bugün' : d + ' gün içinde'} — ${x.tarih}`, page:'toplanti'});
  });
  return items;
}
function toggleNotifPanel() {
  const p = document.getElementById('notif-panel');
  const isShow = p.classList.contains('show');
  p.classList.toggle('show');
  if (!isShow) {
    const items = buildNotifs();
    const list = document.getElementById('notif-list');
    if (!items.length) { list.innerHTML = '<div class="notif-empty">🎉 Bildirim yok</div>'; return; }
    const colors = {danger:'var(--err-bg)', warn:'rgba(255,171,0,.1)', info:'rgba(79,110,247,.08)'};
    const txtColors = {danger:'var(--err)', warn:'var(--warn)', info:'var(--brand)'};
    list.innerHTML = items.map(i=>`<div class="notif-item" onclick="${i.bildirimId?'markGorevBildirimOkundu('+i.bildirimId+');':''}goPage('${i.page}');toggleNotifPanel()" style="cursor:pointer"><div class="notif-ico" style="background:${colors[i.type]};color:${txtColors[i.type]};font-size:${i.icon.startsWith('<')?'':'16px'}">${i.icon}</div><div class="notif-txt"><strong>${i.title}</strong><span>${i.sub}</span></div></div>`).join('');
  }
}
function markGorevBildirimOkundu(id) {
  if (!S.gorevBildirimleri) return;
  const b = S.gorevBildirimleri.find(x=>x.id===id);
  if (b) { b.okundu=true; save(); updateNotifDot(); }
}
function updateNotifDot() {
  const n = buildNotifs().filter(i=>i.type==='danger').length;
  const dot = document.getElementById('notif-dot');
  if (dot) { dot.classList.toggle('show', n > 0); }
  // Update count badge
  const countBadge = document.getElementById('notif-count-badge');
  const total = buildNotifs().length;
  if (countBadge) { countBadge.textContent = total > 9 ? '9+' : total; countBadge.style.display = total > 0 ? '' : 'none'; }
}

// ===================================================
// FİNANS - Gelir / Gider
// ===================================================
const FIN_KAT_GELIR = ['Aidat','Kira Geliri','Bağış','Faiz Geliri','Diğer Gelir'];
const FIN_KAT_GIDER = ['Temizlik','Güvenlik','Asansör Bakım','Doğalgaz','Elektrik','Su','Yönetim Ücreti','Sigorta','Vergi / Harç','Onarım / Tadilat','Bahçe Bakım','Diğer Gider'];

function getGelirTanimlari() {
  if (S.gelirTanimlari && S.gelirTanimlari.length) return S.gelirTanimlari.filter(t=>t.aktif!==false);
  return FIN_KAT_GELIR.map((ad,i)=>({id:i+1,ad,ikon:'💰',renk:'#4f6ef7',aktif:true}));
}
function getGiderTanimlari() {
  if (S.giderTanimlari && S.giderTanimlari.length) return S.giderTanimlari.filter(t=>t.aktif!==false);
  return FIN_KAT_GIDER.map((ad,i)=>({id:i+1,ad,ikon:'💸',renk:'#dc2626',aktif:true}));
}
// ── FİNANS BACKWARD COMPAT ──────────────────────────────
function updateFinKategori() { /* no-op: forms have dedicated selects */ }
function saveFinans() { toast('Lütfen "Gelir Ekle" veya "Gider Ekle" sekmesini kullanın.','warn'); }

// ── FİNANS ORTAK YARDIMCI ───────────────────────────────
function finGenMakbuzNo(fieldId) {
  if (!makbuzNo) makbuzNo = 5000;
  makbuzNo++;
  const el = document.getElementById(fieldId);
  if (el) { el.value = 'M-' + makbuzNo; save(); }
}
function finEvrakSec(input, labelId) {
  const file = input.files[0];
  const label = document.getElementById(labelId);
  if (!label) return;
  label.textContent = file ? '📎 ' + file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)' : '';
}

// ── GELİR FORM ──────────────────────────────────────────
function finGelirAptChange() {
  const aptId = document.getElementById('fg-apt').value;
  const sel = document.getElementById('fg-daire');
  if (!sel) return;
  if (!aptId) { sel.innerHTML = '<option value="">— Daire Seç —</option>'; return; }
  const sakinler = (S.sakinler||[]).filter(s=>s.aptId==aptId);
  sel.innerHTML = '<option value="">— Daire Seç (opsiyonel) —</option>' +
    sakinler.map(s=>`<option value="${s.daire||''}" data-ad="${s.ad}">${s.daire?'D:'+s.daire+' — ':''}${s.ad}</option>`).join('');
  document.getElementById('fg-sakin').value = '';
}
function finGelirDaireChange() {
  const sel = document.getElementById('fg-daire');
  const opt = sel && sel.options[sel.selectedIndex];
  const el = document.getElementById('fg-sakin');
  if (el) el.value = opt && opt.value ? (opt.dataset.ad || opt.text.replace(/^D:\S+ — /,'')) : '';
}
function finGelirKdvHesapla() {
  const tutar = parseFloat(document.getElementById('fg-tutar').value)||0;
  const oran = parseFloat(document.getElementById('fg-kdv').value)||0;
  const kdv = tutar * oran / 100;
  const toplam = tutar + kdv;
  document.getElementById('fg-kdv-tutar').value = kdv > 0 ? kdv.toFixed(2) : '';
  document.getElementById('fg-toplam').value = toplam > 0 ? toplam.toFixed(2) : '';
}
function finGelirTekrarChange() {
  const v = document.getElementById('fg-tekrar').value;
  const w = document.getElementById('fg-bitis-wrap');
  if (w) w.style.display = v ? '' : 'none';
}
function gelirFormTemizle() {
  ['fg-daire','fg-sakin','fg-kdv-tutar','fg-toplam','fg-belge','fg-aciklama','fg-bitis'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  ['fg-apt','fg-kat','fg-kdv','fg-yontem','fg-tekrar'].forEach(id=>{const e=document.getElementById(id);if(e)e.selectedIndex=0;});
  const t=document.getElementById('fg-tarih');if(t)t.value=today();
  const d=document.getElementById('fg-donem');if(d)d.value=today().substring(0,7);
  const tu=document.getElementById('fg-tutar');if(tu)tu.value='';
  const bw=document.getElementById('fg-bitis-wrap');if(bw)bw.style.display='none';
  const la=document.getElementById('fg-evrak-ad');if(la)la.textContent='';
  const fi=document.getElementById('fg-evrak');if(fi)fi.value='';
}
function saveGelir() {
  const apt = document.getElementById('fg-apt').value;
  const tarih = document.getElementById('fg-tarih').value;
  const kat = document.getElementById('fg-kat').value;
  const tutar = parseFloat(document.getElementById('fg-tutar').value);
  if (!apt) { toast('Apartman seçin.','err'); return; }
  if (!tarih) { toast('Tarih girin.','err'); return; }
  if (!tutar || tutar <= 0) { toast('Geçerli bir tutar girin.','err'); return; }
  const aptObj = S.apartmanlar.find(a=>a.id==apt);
  const kdvOran = parseFloat(document.getElementById('fg-kdv').value)||0;
  const kdvTutar = +(tutar * kdvOran / 100).toFixed(2);
  const evrakInput = document.getElementById('fg-evrak');
  const rec = {
    id: Date.now(), aptId: +apt, aptAd: aptObj?aptObj.ad:'',
    tur: 'gelir', kat,
    daire: document.getElementById('fg-daire').value,
    sakAd: document.getElementById('fg-sakin').value,
    donem: document.getElementById('fg-donem').value, tarih,
    tutar, kdvOran, kdvTutar, toplamTutar: +(tutar + kdvTutar).toFixed(2),
    odemeYontemi: document.getElementById('fg-yontem').value,
    belge: document.getElementById('fg-belge').value,
    aciklama: document.getElementById('fg-aciklama').value,
    tekrar: document.getElementById('fg-tekrar').value,
    tekrarBitis: document.getElementById('fg-bitis').value,
    evrak: evrakInput.files[0] ? evrakInput.files[0].name : '',
    odemeDurum: 'odendi', kaynak: 'manuel'
  };
  S.finansIslemler = S.finansIslemler||[];
  S.finansIslemler.unshift(rec);
  save();
  toast('✓ Gelir kaydedildi: ' + kat + ' — ₺' + fmt(rec.toplamTutar),'ok');
  gelirFormTemizle();
  goTab('fin-liste');
  renderFinans();
}

// ── GİDER FORM ──────────────────────────────────────────
function finGiderFormuHazirla() {
  // Tedarikçi datalist
  const dl = document.getElementById('gg-ted-list');
  if (dl) {
    const teds = [...new Set((S.finansIslemler||[]).filter(f=>f.tur==='gider'&&f.tedarikci).map(f=>f.tedarikci))];
    dl.innerHTML = teds.map(t=>`<option value="${t}">`).join('');
  }
  // Ödeme tarihi başlangıç
  const ot = document.getElementById('gg-odeme-tarih');
  if (ot && !ot.value) ot.value = today();
  const t = document.getElementById('gg-tarih');
  if (t && !t.value) t.value = today();
}
function finGiderAptChange() {
  const aptId = document.getElementById('gg-apt').value;
  window._ggDaireler = [];
  const info = document.getElementById('gg-dagitim-info');
  document.getElementById('gg-dagitim-liste').innerHTML = '';
  if (!aptId) { if(info) info.textContent='Apartman seçilince daire listesi yüklenir.'; return; }
  const sakinler = (S.sakinler||[]).filter(s=>s.aptId==aptId);
  window._ggDaireler = sakinler;
  // Tedarikçi datalist güncelle
  const dl = document.getElementById('gg-ted-list');
  if (dl) {
    const teds=[...new Set((S.finansIslemler||[]).filter(f=>f.tur==='gider'&&f.tedarikci).map(f=>f.tedarikci))];
    dl.innerHTML = teds.map(t=>`<option value="${t}">`).join('');
  }
  if(info) info.textContent = sakinler.length ? `${sakinler.length} daire bulundu — "Eşit Dağıt" ile tutar otomatik bölünür.` : 'Bu apartmanda kayıtlı sakin yok.';
}
function finGiderKdvHesapla() {
  const tutar = parseFloat(document.getElementById('gg-tutar').value)||0;
  const oran = parseFloat(document.getElementById('gg-kdv').value)||0;
  const kdv = tutar * oran / 100;
  document.getElementById('gg-kdv-tutar').value = kdv > 0 ? kdv.toFixed(2) : '';
  document.getElementById('gg-toplam').value = (tutar + kdv) > 0 ? (tutar + kdv).toFixed(2) : '';
}
function finGiderOdemeDurumChange() {
  const durum = document.getElementById('gg-durum').value;
  const wrap = document.getElementById('gg-odeme-tarih-wrap');
  if (wrap) wrap.style.display = durum === 'odendi' ? '' : 'none';
  if (durum === 'odendi') { const t=document.getElementById('gg-odeme-tarih');if(t&&!t.value)t.value=today(); }
}
function finGiderTekrarChange() {
  const v = document.getElementById('gg-tekrar').value;
  const w = document.getElementById('gg-bitis-wrap');
  if (w) w.style.display = v ? '' : 'none';
}
function finGiderEsitDagit() {
  const daireler = window._ggDaireler || [];
  if (!daireler.length) { toast('Önce apartman seçin.','warn'); return; }
  const toplam = parseFloat(document.getElementById('gg-toplam').value) || parseFloat(document.getElementById('gg-tutar').value) || 0;
  if (!toplam) { toast('Önce tutar girin.','warn'); return; }
  const pay = +(toplam / daireler.length).toFixed(2);
  window._ggDagitim = daireler.map(s=>({daireNo:s.daire, sakAd:s.ad, pay}));
  finGiderRenderDagitim();
  toast('⚖️ Eşit dağıtıldı: ₺'+fmt(pay)+' × '+daireler.length+' daire','ok');
}
function finGiderRenderDagitim() {
  const liste = document.getElementById('gg-dagitim-liste'); if (!liste) return;
  const dagitim = window._ggDagitim || [];
  if (!dagitim.length) { liste.innerHTML=''; return; }
  const top = dagitim.reduce((s,d)=>s+d.pay, 0);
  liste.innerHTML = `<div class="tw" style="margin-top:8px"><table>
    <thead><tr><th>Daire</th><th>Sakin</th><th style="text-align:right">Pay (₺)</th></tr></thead>
    <tbody>${dagitim.map(d=>`<tr><td>D:${d.daireNo||'?'}</td><td>${d.sakAd||'—'}</td><td style="text-align:right;font-weight:600;color:var(--err)">₺${fmt(d.pay)}</td></tr>`).join('')}</tbody>
    <tfoot><tr style="font-weight:700;border-top:2px solid var(--bd)"><td colspan="2">Toplam</td><td style="text-align:right;color:var(--err)">₺${fmt(top)}</td></tr></tfoot>
  </table></div>`;
}
function finGiderDagitimTemizle() {
  window._ggDagitim = [];
  finGiderRenderDagitim();
}
function giderFormTemizle() {
  ['gg-tedarikci','gg-fatura-no','gg-tarih','gg-son-odeme','gg-tutar','gg-kdv-tutar','gg-toplam','gg-odeme-tarih','gg-aciklama','gg-bitis'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  ['gg-apt','gg-kat','gg-kdv','gg-durum','gg-yontem','gg-tekrar'].forEach(id=>{const e=document.getElementById(id);if(e)e.selectedIndex=0;});
  const t=document.getElementById('gg-tarih');if(t)t.value=today();
  const ot=document.getElementById('gg-odeme-tarih');if(ot)ot.value=today();
  const ow=document.getElementById('gg-odeme-tarih-wrap');if(ow)ow.style.display='';
  const bw=document.getElementById('gg-bitis-wrap');if(bw)bw.style.display='none';
  const li=document.getElementById('gg-dagitim-liste');if(li)li.innerHTML='';
  const info=document.getElementById('gg-dagitim-info');if(info)info.textContent='Apartman seçilince daire listesi yüklenir.';
  const la=document.getElementById('gg-evrak-ad');if(la)la.textContent='';
  const fi=document.getElementById('gg-evrak');if(fi)fi.value='';
  window._ggDagitim=[];window._ggDaireler=[];
}
function saveGider() {
  const apt = document.getElementById('gg-apt').value;
  const kat = document.getElementById('gg-kat').value;
  const tutar = parseFloat(document.getElementById('gg-tutar').value);
  if (!apt) { toast('Apartman seçin.','err'); return; }
  if (!kat) { toast('Gider türü seçin.','err'); return; }
  if (!tutar || tutar <= 0) { toast('Geçerli bir tutar girin.','err'); return; }
  const aptObj = S.apartmanlar.find(a=>a.id==apt);
  const kdvOran = parseFloat(document.getElementById('gg-kdv').value)||0;
  const kdvTutar = +(tutar * kdvOran / 100).toFixed(2);
  const durum = document.getElementById('gg-durum').value;
  const evrakInput = document.getElementById('gg-evrak');
  const tarih = document.getElementById('gg-tarih').value || today();
  const fatNo = document.getElementById('gg-fatura-no').value;
  const rec = {
    id: Date.now(), aptId: +apt, aptAd: aptObj?aptObj.ad:'',
    tur: 'gider', kat,
    tedarikci: document.getElementById('gg-tedarikci').value,
    faturaNo: fatNo, tarih,
    sonOdemeTarih: document.getElementById('gg-son-odeme').value,
    tutar, kdvOran, kdvTutar, toplamTutar: +(tutar + kdvTutar).toFixed(2),
    odemeDurum: durum,
    odemeTarih: durum==='odendi'?(document.getElementById('gg-odeme-tarih').value||today()):'',
    odemeYontemi: document.getElementById('gg-yontem').value,
    dagitim: window._ggDagitim || [],
    belge: fatNo,
    aciklama: document.getElementById('gg-aciklama').value,
    tekrar: document.getElementById('gg-tekrar').value,
    tekrarBitis: document.getElementById('gg-bitis').value,
    evrak: evrakInput.files[0] ? evrakInput.files[0].name : '',
    kaynak: 'manuel'
  };
  S.finansIslemler = S.finansIslemler||[];
  S.finansIslemler.unshift(rec);
  save();
  toast('✓ Gider kaydedildi: ' + kat + ' — ₺' + fmt(rec.toplamTutar),'ok');
  giderFormTemizle();
  goTab('fin-liste');
  renderFinans();
}


function renderAidatTakip() {
  // Aidat takip — finans sayfasında gelir kayıtlarından otomatik
  const tb = document.getElementById('aid-takip-tbody');
  if (!tb) return;
  const aidatlar = S.finansIslemler.filter(f => f.tur === 'gelir' && f.kat === 'aidat');
  if (!aidatlar.length) { tb.innerHTML = `<tr><td colspan="6">${emp('💰','Aidat kaydı bulunamadı')}</td></tr>`; return; }
  tb.innerHTML = aidatlar.slice().reverse().map(f => `<tr>
    <td>${f.aptAd||'—'}</td><td>${f.belge||'—'}</td>
    <td>${f.aciklama||'—'}</td>
    <td style="color:var(--ok);font-weight:700">₺${fmt(f.tutar)}</td>
    <td>${f.tarih||'—'}</td>
    <td><span class="b b-gr">Ödendi</span></td>
  </tr>`).join('');
}

function renderAidatRapor() {
  const el = document.getElementById('aid-rapor-content');
  if (!el) return;
  const byApt = {};
  S.finansIslemler.filter(f => f.tur === 'gelir' && f.kat === 'aidat').forEach(f => {
    if (!byApt[f.aptAd||'?']) byApt[f.aptAd||'?'] = 0;
    byApt[f.aptAd||'?'] += f.tutar || 0;
  });
  if (!Object.keys(byApt).length) { el.innerHTML = emp('📊','Aidat raporu için önce aidat geliri ekleyin'); return; }
  const max = Math.max(...Object.values(byApt), 1);
  el.innerHTML = Object.entries(byApt).sort((a,b) => b[1]-a[1]).map(([ad,t]) =>
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:13px">
      <div style="width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${ad}">${ad}</div>
      <div style="flex:1;background:var(--s2);border-radius:4px;height:10px">
        <div style="background:var(--ok);width:${Math.round(t/max*100)}%;height:100%;border-radius:4px"></div>
      </div>
      <div style="width:80px;text-align:right;font-weight:700;color:var(--ok)">₺${fmt(t)}</div>
    </div>`
  ).join('');
}

function finFormTemizle() { gelirFormTemizle(); }

/** @deprecated Soft cancel kullanılıyor */
function delFinans(id) { softCancelFinans(id); }

/**
 * Gelir/Gider soft cancel — hard delete yok.
 * Kaydı status='cancelled' yapar, ledger ters giriş + audit log.
 */
function softCancelFinans(id) {
  const f = (S.finansIslemler || []).find(x => x.id == id);
  if (!f) return;
  if (f.status === 'cancelled') { toast('Bu kayıt zaten iptal edilmiş.', 'warn'); return; }
  const turLbl = f.tur === 'gelir' ? 'Gelir' : 'Gider';
  if (!confirm(`${turLbl} kaydı iptal edilsin mi?\n${f.kat || ''} · ₺${fmt(f.toplamTutar || f.tutar)}\nBu işlem geri alınamaz.`)) return;

  const tutar = f.toplamTutar || f.tutar || 0;

  f.status       = 'cancelled';
  f.cancelledAt  = new Date().toISOString();
  f.cancelledBy  = _currentUser?.id || 'local';

  // Ledger ters kayıt
  if (f.tur === 'gelir') {
    LedgerService.recordReversal({ siteId: f.aptId, personId: f.personId, credit: tutar, debit: 0,
      refType: 'finansIslemler', refId: String(f.id), docNo: 'IPT-GEL-' + f.id,
      description: `İptal Gelir: ${f.kat || ''} — ${f.aptAd || ''}` });
  } else {
    LedgerService.recordReversal({ siteId: f.aptId, credit: 0, debit: tutar,
      refType: 'finansIslemler', refId: String(f.id), docNo: 'IPT-GID-' + f.id,
      description: `İptal Gider: ${f.kat || ''} — ${f.tedarikci || f.aptAd || ''}` });
  }

  AuditService.log({
    action: 'REVERSE', entityType: 'finansIslemler', entityId: f.id,
    oldValues: { status: 'active', tur: f.tur, tutar },
    newValues: { status: 'cancelled' },
    siteId: f.aptId
  });

  save(); toast(`İptal edildi: ${f.kat || turLbl} · ₺${fmt(tutar)}`, 'warn');
  renderFinans();
  setTimeout(() => { if (typeof renderDashboard === 'function') renderDashboard(); }, 50);
}

function renderFinans() {
  const s   = (document.getElementById('fin-srch')||{}).value||'';
  const fa  = (document.getElementById('fin-f-apt')||{}).value||'';
  const ft  = (document.getElementById('fin-f-tur')||{}).value||'';
  const fk  = (document.getElementById('fin-f-kat')||{}).value||'';
  const fay = (document.getElementById('fin-f-ay')||{}).value||'';
  const fd  = (document.getElementById('fin-f-durum')||{}).value||'';

  let list = [...(S.finansIslemler||[])].filter(f=>f.status!=='cancelled').sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||''));
  if (s)   list = list.filter(f=>((f.aciklama||'')+' '+(f.kat||'')+' '+(f.tedarikci||'')+' '+(f.sakAd||'')).toLowerCase().includes(s.toLowerCase()));
  if (fa)  list = list.filter(f=>f.aptId==fa);
  if (ft)  list = list.filter(f=>f.tur===ft);
  if (fk)  list = list.filter(f=>(f.kat||'')=== fk);
  if (fay) list = list.filter(f=>(f.tarih||'').startsWith(fay));
  if (fd)  list = list.filter(f=>(f.odemeDurum||(f.tur==='gelir'?'odendi':'bekliyor'))===fd);

  // Ay filtresi seçeneklerini güncelle
  const ayEl = document.getElementById('fin-f-ay');
  if (ayEl) {
    const months = [...new Set((S.finansIslemler||[]).map(f=>(f.tarih||'').substring(0,7)).filter(Boolean))].sort().reverse();
    ayEl.innerHTML = '<option value="">Tüm Aylar</option>' + months.map(m=>`<option value="${m}"${m===fay?' selected':''}>${m}</option>`).join('');
  }
  // Kategori filtresi seçeneklerini güncelle
  const katEl = document.getElementById('fin-f-kat');
  if (katEl) {
    const kats = [...new Set((S.finansIslemler||[]).map(f=>f.kat).filter(Boolean))].sort();
    katEl.innerHTML = '<option value="">Tüm Kategoriler</option>' + kats.map(k=>`<option value="${k}"${k===fk?' selected':''}>${k}</option>`).join('');
  }

  // İstatistik kartları
  const allFin = S.finansIslemler||[];
  const gelir    = allFin.filter(f=>f.tur==='gelir').reduce((s,f)=>s+(f.toplamTutar||f.tutar||0),0);
  const gider    = allFin.filter(f=>f.tur==='gider').reduce((s,f)=>s+(f.toplamTutar||f.tutar||0),0);
  const net      = gelir - gider;
  const bekleyen = allFin.filter(f=>f.tur==='gider'&&f.odemeDurum==='bekliyor').reduce((s,f)=>s+(f.toplamTutar||f.tutar||0),0);
  const grid = document.getElementById('fin-stats-grid');
  if (grid) grid.innerHTML = `
    <div class="fin-card fc-gelir"><div style="font-size:10.5px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Toplam Gelir</div><div class="fin-val" style="color:var(--ok)">₺${fmtMoney(gelir)}</div></div>
    <div class="fin-card fc-gider"><div style="font-size:10.5px;font-weight:600;color:#b91c1c;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Toplam Gider</div><div class="fin-val" style="color:var(--err)">₺${fmtMoney(gider)}</div></div>
    <div class="fin-card fc-net"><div style="font-size:10.5px;font-weight:600;color:${net>=0?'#15803d':'#b91c1c'};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Net Bakiye</div><div class="fin-val" style="color:${net>=0?'var(--ok)':'var(--err)'}">${net>=0?'+':''}₺${fmtMoney(net)}</div></div>
    <div class="fin-card fc-bekleyen"><div style="font-size:10.5px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Bekleyen Ödemeler</div><div class="fin-val" style="color:var(--warn)">₺${fmtMoney(bekleyen)}</div></div>
  `;

  const tbody = document.getElementById('fin-tbody'); if (!tbody) return;
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:32px;color:var(--tx-3)">Kayıt bulunamadı</td></tr>`; return; }

  const durumBadge = { odendi:'<span class="b b-gr" style="font-size:10px">✅ Ödendi</span>', bekliyor:'<span class="b b-am" style="font-size:10px">⏳ Bekliyor</span>', gecikti:'<span class="b b-rd" style="font-size:10px">🔴 Gecikti</span>' };
  tbody.innerHTML = list.map(f=>{
    const isG = f.tur==='gelir';
    const turBadge = isG ? '<span class="b b-gr" style="font-size:10px">↑ Gelir</span>' : '<span class="b b-rd" style="font-size:10px">↓ Gider</span>';
    const kisi = isG ? (f.sakAd||(f.daire?'D:'+f.daire:'')) : (f.tedarikci||'');
    const belge = f.belge||f.faturaNo||'';
    const toplam = f.toplamTutar||f.tutar||0;
    const net2 = f.tutar||0;
    const tutarClr = isG ? 'var(--ok)' : 'var(--err)';
    const pfx = isG ? '+' : '−';
    const durum = isG ? 'odendi' : (f.odemeDurum||'bekliyor');
    const yontem = f.odemeYontemi||'—';
    const tarihStr = f.tarih ? new Date(f.tarih+'T00:00').toLocaleDateString('tr-TR') : '—';
    const kdvInfo = f.kdvOran ? `<span title="KDV %${f.kdvOran}" style="font-size:10px;color:var(--tx-3);margin-left:3px">+%${f.kdvOran}</span>` : '';
    return `<tr>
      <td style="white-space:nowrap;font-size:12px">${tarihStr}</td>
      <td style="font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${he(f.aptAd||'—')}</td>
      <td>${turBadge}</td>
      <td style="font-size:12px">${he(f.kat||'—')}</td>
      <td style="font-size:12px;color:var(--tx-2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${he(kisi)}">${he(kisi||'—')}</td>
      <td style="font-size:11px;color:var(--tx-3)">${belge||'—'}</td>
      <td style="font-weight:600;color:${tutarClr};text-align:right;white-space:nowrap;font-size:12.5px">${pfx}₺${fmtMoney(net2)}${kdvInfo}</td>
      <td style="font-weight:700;color:${tutarClr};text-align:right;white-space:nowrap;font-size:13px">${pfx}₺${fmtMoney(toplam)}</td>
      <td style="font-size:11px;color:var(--tx-3)">${yontem}</td>
      <td>${durumBadge[durum]||durumBadge.bekliyor}</td>
      <td><button class="act-btn rd" onclick="delFinans(${f.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// FİNANSAL DURUM SAYFASI
// ══════════════════════════════════════════════════════
let _fdHarf = '';
let _fdSelected = new Set();

function renderFinansalDurum() {
  const aptId = (document.getElementById('fd-f-apt')||{}).value||'';
  const durumF = (document.getElementById('fd-f-durum')||{}).value||'';
  const srch = ((document.getElementById('fd-srch')||{}).value||'').toLowerCase();

  // Sakin verisini zenginleştir
  let sakinler = (S.sakinler||[]).map(sk=>{
    if (aptId && sk.aptId != aptId) return null;
    if (srch && !sk.ad.toLowerCase().includes(srch) && !(sk.daire||'').toString().includes(srch)) return null;
    if (_fdHarf && !(sk.ad||'').toUpperCase().startsWith(_fdHarf)) return null;

    const borc = sk.borc||0;
    const odemeler = (S.tahsilatlar||[]).filter(t=>t.sakId==sk.id||t.sakinId==sk.id);
    const toplamOdeme = odemeler.reduce((s,t)=>s+(t.tutar||0),0);
    const sortedOde = odemeler.slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||''));
    const sonOdeme = sortedOde[0]?.tarih||null;

    // Borç detayları
    const borcKayitlari=[];
    (S.aidatBorclandir||[]).forEach(kayit=>{
      if(aptId && kayit.aptId!=aptId) return;
      (kayit.detaylar||[]).forEach(d=>{
        if(d.sakId==sk.id) borcKayitlari.push({...d,donem:kayit.donem,sonOdeme:kayit.sonOdeme,tarih:kayit.tarih});
      });
    });

    // Gecikme gün hesabı
    let gecikmeGun=0;
    if(borc>0){
      const now=new Date();
      borcKayitlari.forEach(b=>{
        if(b.sonOdeme){const d=Math.floor((now-new Date(b.sonOdeme))/86400000);if(d>gecikmeGun)gecikmeGun=d;}
      });
      if(!gecikmeGun&&borcKayitlari.length) gecikmeGun=1;
    }

    // Tahsilat oranı
    const toplamBorclandir=borcKayitlari.reduce((s,b)=>s+(b.tutar||0),0);
    let tahsilatOran = toplamBorclandir>0 ? Math.min(100,Math.round(toplamOdeme/toplamBorclandir*100)) : (borc<=0?100:0);

    // Durum
    const icrada=(S.icralar||[]).some(i=>i.sakId==sk.id||String(i.daireNo)===String(sk.daire));
    let durumStr = icrada?'icra': borc<=0?'temiz': gecikmeGun>30?'gecikti':'borclu';

    return {...sk,toplamBorc:borc,toplamOdeme,sonOdeme,gecikmeGun,tahsilatOran,durumStr,borcKayitlari,odemeler};
  }).filter(Boolean);

  // Durum filtresi
  if(durumF) sakinler=sakinler.filter(sk=>sk.durumStr===durumF);
  sakinler.sort((a,b)=>b.toplamBorc-a.toplamBorc);

  // İstatistikler
  const toplamBorc=sakinler.reduce((s,sk)=>s+sk.toplamBorc,0);
  const toplamTahsil=sakinler.reduce((s,sk)=>s+sk.toplamOdeme,0);
  const gecikmBorc=sakinler.filter(sk=>sk.gecikmeGun>0).reduce((s,sk)=>s+sk.toplamBorc,0);
  const borcluSayi=sakinler.filter(sk=>sk.toplamBorc>0).length;

  _renderFdStats(toplamBorc,toplamTahsil,gecikmBorc,sakinler.length,borcluSayi);
  _renderFdChart(borcluSayi,sakinler.length-borcluSayi);
  _renderFdHarfFilter(sakinler);
  _renderFdTablo(sakinler);
}

function _renderFdStats(toplamBorc,tahsil,gecik,toplamSakin,borclu){
  const net=tahsil-toplamBorc;
  const el=document.getElementById('fd-stats');if(!el)return;
  el.innerHTML=[
    {label:'Toplam Borç',val:'₺'+fmt(toplamBorc),clr:'#dc2626',bg:'#fef2f2',bd:'#fecaca',ico:'💸'},
    {label:'Tahsil Edilen',val:'₺'+fmt(tahsil),clr:'#16a34a',bg:'#f0fdf4',bd:'#86efac',ico:'✅'},
    {label:'Geciken Borç',val:'₺'+fmt(gecik),clr:'#d97706',bg:'#fffbeb',bd:'#fde68a',ico:'⏰'},
    {label:'Net Bakiye',val:(net>=0?'+':'')+'₺'+fmt(Math.abs(net)),clr:net>=0?'#2563eb':'#dc2626',bg:'#eff6ff',bd:'#bfdbfe',ico:'📊'},
    {label:'Borçlu Sakin',val:borclu+' / '+toplamSakin,clr:'#7c3aed',bg:'#faf5ff',bd:'#ddd6fe',ico:'👤'},
  ].map(c=>`<div style="background:${c.bg};border:1.5px solid ${c.bd};border-radius:12px;padding:14px 16px;cursor:default">
    <div style="font-size:20px;margin-bottom:5px">${c.ico}</div>
    <div style="font-size:10px;font-weight:700;color:${c.clr};text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${c.label}</div>
    <div style="font-size:19px;font-weight:800;color:${c.clr};white-space:nowrap">${c.val}</div>
  </div>`).join('');
}

function _renderFdChart(borclu,temiz){
  const wrap=document.getElementById('fd-chart-wrap');if(!wrap)return;
  const total=borclu+temiz;
  if(!total){wrap.innerHTML='';return;}
  const r=56,cx=80,cy=75;
  const borcluA=borclu/total*Math.PI*2;
  function arcPath(sa,ea,fill){
    if(Math.abs(ea-sa)>=Math.PI*2-0.001){
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
    }
    const x1=cx+r*Math.cos(sa-Math.PI/2),y1=cy+r*Math.sin(sa-Math.PI/2);
    const x2=cx+r*Math.cos(ea-Math.PI/2),y2=cy+r*Math.sin(ea-Math.PI/2);
    const lg=ea-sa>Math.PI?1:0;
    return `<path d="M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${lg} 1 ${x2} ${y2}Z" fill="${fill}"/>`;
  }
  const pct=Math.round(borclu/total*100);
  wrap.innerHTML=`<div style="text-align:center">
    <svg width="160" height="150" viewBox="0 0 160 150">
      ${arcPath(0,borcluA,'#ef4444')}${arcPath(borcluA,Math.PI*2,'#22c55e')}
      <circle cx="${cx}" cy="${cy}" r="34" fill="#fff"/>
      <text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="17" font-weight="800" fill="#1e293b">${pct}%</text>
      <text x="${cx}" y="${cy+12}" text-anchor="middle" font-size="9.5" fill="#64748b">Borçlu</text>
    </svg>
    <div style="display:flex;gap:8px;justify-content:center;font-size:10.5px;color:var(--tx-2);margin-top:-4px">
      <span><span style="display:inline-block;width:9px;height:9px;background:#ef4444;border-radius:2px;margin-right:3px;vertical-align:middle"></span>Borçlu (${borclu})</span>
      <span><span style="display:inline-block;width:9px;height:9px;background:#22c55e;border-radius:2px;margin-right:3px;vertical-align:middle"></span>Temiz (${temiz})</span>
    </div>
  </div>`;
}

function _renderFdHarfFilter(sakinler){
  const el=document.getElementById('fd-harf-list');if(!el)return;
  const harfler=[...new Set(sakinler.map(sk=>(sk.ad||'').charAt(0).toUpperCase()).filter(h=>/[A-ZÇĞİÖŞÜ]/.test(h)))].sort();
  const btn=(h,label,active)=>`<button onclick="fdHarfSec('${h}')" style="padding:4px 8px;border-radius:5px;border:1.5px solid ${active?'var(--brand)':'var(--bd)'};background:${active?'var(--brand)':'var(--bg)'};color:${active?'#fff':'var(--tx-2)'};cursor:pointer;font-size:11.5px;font-weight:600;transition:all .1s">${label}</button>`;
  el.innerHTML=btn('','Tümü',!_fdHarf)+harfler.map(h=>btn(h,h,_fdHarf===h)).join('');
}

function fdHarfSec(h){_fdHarf=h;renderFinansalDurum();}

function _renderFdTablo(sakinler){
  const tbody=document.getElementById('fd-tbody');if(!tbody)return;
  if(!sakinler.length){tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--tx-3)">Sakin bulunamadı</td></tr>';return;}
  const db={temiz:'<span class="b b-gr" style="font-size:10px">✅ Temiz</span>',borclu:'<span class="b b-am" style="font-size:10px">⚠️ Borçlu</span>',gecikti:'<span class="b b-rd" style="font-size:10px">🔴 Gecikmiş</span>',icra:'<span style="background:#7c3aed;color:#fff;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600">⚖️ İcra</span>'};
  tbody.innerHTML=sakinler.map(sk=>{
    const isSel=_fdSelected.has(sk.id);
    const gecikStr=sk.gecikmeGun>0?`<span style="color:var(--err);font-weight:700">${sk.gecikmeGun} gün</span>`:'—';
    const sonOStr=sk.sonOdeme?new Date(sk.sonOdeme+'T00:00').toLocaleDateString('tr-TR'):'—';
    const oranClr=sk.tahsilatOran>=100?'#22c55e':sk.tahsilatOran>=50?'#f59e0b':'#ef4444';
    const bar=`<div style="display:flex;align-items:center;gap:6px"><div style="flex:1;background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden"><div style="width:${sk.tahsilatOran}%;background:${oranClr};height:100%;border-radius:4px"></div></div><span style="font-size:10.5px;font-weight:700;color:${oranClr};white-space:nowrap">${sk.tahsilatOran}%</span></div>`;
    return `<tr style="cursor:pointer;transition:background .1s" onclick="fdDrawerOpen(${sk.id})" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
      <td onclick="event.stopPropagation()"><input type="checkbox" ${isSel?'checked':''} onchange="fdToggleSel(${sk.id},this)" style="cursor:pointer"></td>
      <td style="font-weight:700;font-size:13px">${sk.daire||'—'}</td>
      <td><a href="javascript:void(0)" onclick="event.stopPropagation();goSakinCari(${sk.id})" style="color:var(--brand);font-weight:600;font-size:13px;text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${sk.ad}</a></td>
      <td style="font-size:11.5px;color:var(--tx-3)">${sk.tip||'Malik'}</td>
      <td style="font-weight:700;color:${sk.toplamBorc>0?'var(--err)':'var(--ok)'};font-size:13px;text-align:right">${sk.toplamBorc>0?'₺'+fmt(sk.toplamBorc):'—'}</td>
      <td style="font-size:12.5px">${gecikStr}</td>
      <td style="font-size:11.5px;color:var(--tx-3)">${sonOStr}</td>
      <td style="min-width:110px">${bar}</td>
      <td>${db[sk.durumStr]||db.temiz}</td>
      <td onclick="event.stopPropagation()"><div style="display:flex;gap:3px">
        <button onclick="goPage('toplu-borc')" title="Borçlandır" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:5px;padding:3px 7px;font-size:10.5px;cursor:pointer;white-space:nowrap">+Borç</button>
        <button onclick="goPage('tahsilat')" title="Tahsilat Al" style="background:#dcfce7;color:#16a34a;border:1px solid #86efac;border-radius:5px;padding:3px 7px;font-size:10.5px;cursor:pointer">Tahsil</button>
        <button onclick="fdDrawerOpen(${sk.id})" title="Detay" style="background:var(--bg);color:var(--tx-2);border:1px solid var(--bd);border-radius:5px;padding:3px 7px;font-size:10.5px;cursor:pointer">📋</button>
      </div></td>
    </tr>`;
  }).join('');
}

function fdToggleSel(sakId,cb){
  if(cb.checked)_fdSelected.add(sakId);else _fdSelected.delete(sakId);
  updateFdBulkBar();
}
function fdSelAll(cb){
  document.querySelectorAll('#fd-tbody input[type=checkbox]').forEach((c,i)=>{
    c.checked=cb.checked;
  });
  // Re-scan after checking
  document.querySelectorAll('#fd-tbody input[type=checkbox]').forEach(c=>{
    const tr=c.closest('tr');
    const aEl=tr&&tr.querySelector('a[onclick]');
    if(!aEl)return;
    const m=aEl.getAttribute('onclick').match(/\d+/);
    if(!m)return;
    const id=+m[0];
    if(cb.checked)_fdSelected.add(id);else _fdSelected.delete(id);
  });
  updateFdBulkBar();
}
function updateFdBulkBar(){
  const bar=document.getElementById('fd-bulk-bar');
  const cnt=document.getElementById('fd-sel-count');
  if(!bar)return;
  bar.style.display=_fdSelected.size>0?'flex':'none';
  if(cnt)cnt.textContent=_fdSelected.size+' sakin seçildi';
}
function fdBulkSMS(){if(!_fdSelected.size)return;toast(`📱 ${_fdSelected.size} sakine SMS bildirimi gönderildi.`,'ok');}
function fdBulkExcel(){toast('📊 Excel dışa aktarma hazırlanıyor…','ok');}
function fdBulkPDF(){toast('📄 Hesap ekstreleri hazırlanıyor…','ok');}

// ── FINANSAL DURUM DRAWER ──────────────────────────────
function fdDrawerOpen(sakId){
  const sk=(S.sakinler||[]).find(s=>s.id===+sakId);
  if(!sk)return;
  const drawer=document.getElementById('fd-drawer');
  const ov=document.getElementById('fd-drawer-overlay');
  if(drawer)drawer.style.right='0';
  if(ov)ov.style.display='block';

  const odemeler=(S.tahsilatlar||[]).filter(t=>t.sakId==sk.id||t.sakinId==sk.id).slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||''));
  const toplamOdeme=odemeler.reduce((s,t)=>s+(t.tutar||0),0);

  const borcKayitlari=[];
  (S.aidatBorclandir||[]).forEach(kayit=>{
    (kayit.detaylar||[]).forEach(d=>{
      if(d.sakId==sk.id)borcKayitlari.push({...d,donem:kayit.donem,sonOdeme:kayit.sonOdeme});
    });
  });

  // Son 6 ay ödeme grid
  const months=[];
  for(let i=5;i>=0;i--){
    const d=new Date();d.setMonth(d.getMonth()-i);
    const m=d.toISOString().substring(0,7);
    const paid=odemeler.some(o=>(o.tarih||'').startsWith(m));
    months.push({m,paid});
  }

  const initials=(sk.ad||'?').split(' ').map(w=>w[0]||'').slice(0,2).join('').toUpperCase();
  const borc=sk.borc||0;
  const aptAd=(S.apartmanlar||[]).find(a=>a.id==sk.aptId)?.ad||'';

  document.getElementById('fd-drawer-content').innerHTML=`
    <div style="padding:20px 20px 90px">
      <!-- Başlık -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0">${initials}</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--tx-1)">${sk.ad}</div>
            <div style="font-size:11.5px;color:var(--tx-3);margin-top:1px">Daire ${sk.daire||'?'} · ${sk.tip||'Malik'} · ${aptAd}</div>
          </div>
        </div>
        <button onclick="fdDrawerClose()" style="background:var(--bg);border:1px solid var(--bd);border-radius:6px;padding:5px 9px;cursor:pointer;color:var(--tx-3);font-size:14px;flex-shrink:0">✕</button>
      </div>

      <!-- Borç / Tahsilat özet -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:9.5px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Toplam Borç</div>
          <div style="font-size:22px;font-weight:800;color:#dc2626">₺${fmt(borc)}</div>
        </div>
        <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:9.5px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Tahsil Edilen</div>
          <div style="font-size:22px;font-weight:800;color:#16a34a">₺${fmt(toplamOdeme)}</div>
        </div>
      </div>

      <!-- Son 6 ay ödeme durumu -->
      <div style="background:var(--bg);border:1px solid var(--bd);border-radius:10px;padding:12px;margin-bottom:14px">
        <div style="font-size:11.5px;font-weight:600;color:var(--tx-2);margin-bottom:10px">Son 6 Ay Ödeme Durumu</div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:5px">
          ${months.map(m=>`<div style="text-align:center">
            <div style="width:36px;height:36px;border-radius:8px;margin:0 auto 5px;background:${m.paid?'#dcfce7':'#fee2e2'};border:1.5px solid ${m.paid?'#86efac':'#fca5a5'};display:flex;align-items:center;justify-content:center;font-size:15px">${m.paid?'✓':'✗'}</div>
            <div style="font-size:9px;color:var(--tx-3);font-weight:600">${m.m.slice(5)}</div>
          </div>`).join('')}
        </div>
      </div>

      <!-- Borç detayı -->
      ${borcKayitlari.length?`<div style="margin-bottom:14px">
        <div style="font-size:11.5px;font-weight:600;color:var(--tx-2);margin-bottom:8px">Borç Kalemleri</div>
        <div style="border:1px solid var(--bd);border-radius:8px;overflow:hidden">
          ${borcKayitlari.map((b,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;${i?'border-top:1px solid var(--bd)':''}">
            <div>
              <div style="font-size:12.5px;font-weight:600;color:var(--tx-1)">${b.donem||'—'} · ${b.kategori||'Aidat'}</div>
              ${b.sonOdeme?`<div style="font-size:10.5px;color:var(--tx-3)">Son ödeme: ${b.sonOdeme}</div>`:''}
            </div>
            <div style="font-weight:700;color:var(--err);font-size:13px">₺${fmt(b.tutar||0)}</div>
          </div>`).join('')}
        </div>
      </div>`:''}

      <!-- Son ödemeler -->
      ${odemeler.length?`<div style="margin-bottom:14px">
        <div style="font-size:11.5px;font-weight:600;color:var(--tx-2);margin-bottom:8px">Son Ödemeler</div>
        <div style="border:1px solid var(--bd);border-radius:8px;overflow:hidden">
          ${odemeler.slice(0,6).map((o,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;${i?'border-top:1px solid var(--bd)':''}">
            <div>
              <div style="font-size:12.5px;font-weight:600;color:var(--tx-1)">${o.not||o.aciklama||o.tip||'Ödeme'}</div>
              <div style="font-size:10.5px;color:var(--tx-3)">${o.tarih||'—'} · ${o.yontem||o.kaynak||'—'}</div>
            </div>
            <div style="font-weight:700;color:#16a34a;font-size:13px">+₺${fmt(o.tutar||0)}</div>
          </div>`).join('')}
        </div>
      </div>`:'<div style="text-align:center;padding:16px;color:var(--tx-3);font-size:12.5px;background:var(--bg);border-radius:8px;margin-bottom:14px">Henüz ödeme kaydı yok</div>'}
    </div>

    <!-- Sabit alt aksiyon -->
    <div style="position:sticky;bottom:0;padding:14px 20px;background:#fff;border-top:1px solid var(--bd);display:flex;gap:8px">
      <button class="btn bp sm" onclick="goPage('tahsilat')" style="flex:1">💰 Hızlı Tahsilat</button>
      <button class="btn bg sm" onclick="fdDrawerClose();goSakinCari(${sk.id})" style="flex:1">📊 Hesap Ekstresi</button>
    </div>`;
}

function fdDrawerClose(){
  const d=document.getElementById('fd-drawer');
  const ov=document.getElementById('fd-drawer-overlay');
  if(d)d.style.right='-440px';
  if(ov)ov.style.display='none';
}

function renderFinansRapor() {
  const el = document.getElementById('fin-rapor-content');
  if (!el) return;
  const fins = S.finansIslemler || [];
  // Group by apartment
  const byApt = {};
  fins.forEach(f => {
    if (!byApt[f.aptAd||'Genel']) byApt[f.aptAd||'Genel'] = {gelir:0,gider:0};
    if (f.tur==='gelir') byApt[f.aptAd||'Genel'].gelir += f.tutar;
    else byApt[f.aptAd||'Genel'].gider += f.tutar;
  });
  // Group by category
  const byCat = {};
  fins.forEach(f => {
    if (!byCat[f.kat]) byCat[f.kat] = {gelir:0,gider:0,count:0};
    if (f.tur==='gelir') byCat[f.kat].gelir += f.tutar;
    else byCat[f.kat].gider += f.tutar;
    byCat[f.kat].count++;
  });
  const gelirToplam = fins.filter(f=>f.tur==='gelir').reduce((s,f)=>s+f.tutar,0);
  const giderToplam = fins.filter(f=>f.tur==='gider').reduce((s,f)=>s+f.tutar,0);
  el.innerHTML = `
    <div class="g2 mb18">
      <div class="card">
        <div class="card-t mb12">Apartman Bazlı Özet</div>
        <div class="tw"><table><thead><tr><th>Apartman</th><th>Gelir (₺)</th><th>Gider (₺)</th><th>Net (₺)</th></tr></thead><tbody>
          ${Object.entries(byApt).map(([ad,v])=>`<tr><td>${ad}</td><td style="color:var(--ok)">${fmtMoney(v.gelir)}</td><td style="color:var(--err)">${fmtMoney(v.gider)}</td><td style="font-weight:700;color:${v.gelir-v.gider>=0?'var(--ok)':'var(--err)'}">${fmtMoney(v.gelir-v.gider)}</td></tr>`).join('')}
          <tr style="font-weight:700;border-top:2px solid var(--border)"><td>TOPLAM</td><td style="color:var(--ok)">${fmtMoney(gelirToplam)}</td><td style="color:var(--err)">${fmtMoney(giderToplam)}</td><td style="color:${gelirToplam-giderToplam>=0?'var(--ok)':'var(--err)'}">${fmtMoney(gelirToplam-giderToplam)}</td></tr>
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="card-t mb12">Kategori Bazlı Dağılım</div>
        <div class="tw"><table><thead><tr><th>Kategori</th><th>Gelir (₺)</th><th>Gider (₺)</th><th>İşlem</th></tr></thead><tbody>
          ${Object.entries(byCat).map(([k,v])=>`<tr><td>${k}</td><td style="color:var(--ok)">${fmtMoney(v.gelir)}</td><td style="color:var(--err)">${fmtMoney(v.gider)}</td><td>${v.count}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
    </div>`;
}

// ===================================================
// AYARLAR
// ===================================================
function loadSettings() {
  const ay = S.ayarlar || {};
  document.getElementById('set-firma').value = ay.firma||'';
  document.getElementById('set-yonetici').value = ay.yonetici||'';
  document.getElementById('set-unvan').value = ay.unvan||'';
  document.getElementById('set-tel').value = ay.tel||'';
  document.getElementById('set-mail').value = ay.mail||'';
  document.getElementById('set-adres').value = ay.adres||'';
  // AI ayarları
  const providerEl = document.getElementById('set-ai-provider');
  if (providerEl) {
    providerEl.value = sessionStorage.getItem('syp_ai_provider') || 'gemini';
    aiProviderChange();
  }
  const geminiEl = document.getElementById('set-apikey-gemini');
  if (geminiEl) geminiEl.value = sessionStorage.getItem('syp_apikey_gemini') || '';
  const claudeEl = document.getElementById('set-apikey-claude');
  if (claudeEl) claudeEl.value = sessionStorage.getItem('syp_apikey_claude') || '';
  const openaiEl = document.getElementById('set-apikey-openai');
  if (openaiEl) openaiEl.value = sessionStorage.getItem('syp_apikey_openai') || '';
  // Supabase config
  const cfg = getSupabaseConfig();
  if (cfg) {
    document.getElementById('set-sb-url').value = cfg.url||'';
    document.getElementById('set-sb-key').value = cfg.key||'';
  }
  // Supabase durum göstergesi
  const statusEl = document.getElementById('sb-ayar-status');
  if (statusEl) {
    if (_currentUser) {
      statusEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--ok-bg);border:1px solid var(--ok-bd);border-radius:8px;font-size:12.5px;color:var(--ok)"><div style="width:8px;height:8px;border-radius:50%;background:var(--ok)"></div>Bağlı — <strong>${_currentUser.email}</strong></div>`;
    } else {
      statusEl.innerHTML = `<div style="padding:8px 12px;background:var(--s3);border-radius:8px;font-size:12.5px;color:var(--tx-3)">Bağlantı yok. URL ve Key girerek bağlanın.</div>`;
    }
  }
}

function saveSettings() {
  S.ayarlar = {
    firma: document.getElementById('set-firma').value,
    yonetici: document.getElementById('set-yonetici').value,
    unvan: document.getElementById('set-unvan').value,
    tel: document.getElementById('set-tel').value,
    mail: document.getElementById('set-mail').value,
    adres: document.getElementById('set-adres').value,
  };
  save();
  // Update sidebar
  if (S.ayarlar.yonetici) {
    const initEl = document.getElementById('sb-av-init');
    const nameEl = document.getElementById('sb-user-name');
    const roleEl = document.getElementById('sb-user-role');
    if(initEl) initEl.textContent = S.ayarlar.yonetici.substring(0,2).toUpperCase();
    if(nameEl) nameEl.textContent = S.ayarlar.yonetici;
    if(roleEl) roleEl.textContent = S.ayarlar.unvan||'Sistem Admini';
  }
  toast('Ayarlar kaydedildi.','ok');
}

function saveApiKey() {
  // Geriye dönük uyumluluk
  saveAISettings();
}

function saveAISettings() {
  const provider = document.getElementById('set-ai-provider')?.value || 'gemini';
  sessionStorage.setItem('syp_ai_provider', provider);

  const geminiKey = document.getElementById('set-apikey-gemini')?.value.trim() || '';
  const claudeKey = document.getElementById('set-apikey-claude')?.value.trim() || '';
  const openaiKey = document.getElementById('set-apikey-openai')?.value.trim() || '';

  if (geminiKey) sessionStorage.setItem('syp_apikey_gemini', geminiKey);
  else localStorage.removeItem('syp_apikey_gemini');

  if (claudeKey) sessionStorage.setItem('syp_apikey_claude', claudeKey);
  else localStorage.removeItem('syp_apikey_claude');

  if (openaiKey) sessionStorage.setItem('syp_apikey_openai', openaiKey);
  else localStorage.removeItem('syp_apikey_openai');

  const providerNames = { gemini: 'Google Gemini', claude: 'Anthropic Claude', openai: 'OpenAI GPT' };
  toast(`AI ayarları kaydedildi — Aktif: ${providerNames[provider]}`, 'ok');
}

function toggleAIKey(provider) {
  const inp = document.getElementById(`set-apikey-${provider}`);
  if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}

// Geriye dönük uyumluluk
function toggleApiKey() { toggleAIKey('gemini'); }

function aiProviderChange() {
  const provider = document.getElementById('set-ai-provider')?.value || 'gemini';
  ['gemini', 'claude', 'openai'].forEach(p => {
    const wrap = document.getElementById(`ai-key-wrap-${p}`);
    if (wrap) wrap.style.display = p === provider ? '' : 'none';
  });
}

function renderSetStats() {
  const el = document.getElementById('set-stats');
  if (!el) return;
  const stats = [
    {lbl:'Apartman', val:S.apartmanlar.length},
    {lbl:'Görev', val:S.gorevler.length},
    {lbl:'Denetim', val:S.denetimler.length},
    {lbl:'Teklif', val:S.teklifler.length},
    {lbl:'İcra Dosyası', val:(S.icralar||[]).length},
    {lbl:'Finans İşlemi', val:(S.finansIslemler||[]).length},
  ];
  el.innerHTML = `<div class="f2 fg" style="gap:10px">${stats.map(s=>`<div style="background:var(--s2);border-radius:8px;padding:12px;text-align:center"><div style="font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:var(--brand)">${s.val}</div><div style="font-size:10.5px;color:var(--tx-3)">${s.lbl}</div></div>`).join('')}</div>`;
}

// ===================================================
// VERİ YEDEK / GERİ YÜKLE
// ===================================================
function exportData() {
  const data = {version:'syp5', exportDate: new Date().toISOString(), ...S};
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `siteyonet-yedek-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  toast('Yedek dosyası indirildi.','ok');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!confirm(`"${file.name}" dosyası içe aktarılsın mı? Mevcut veriler silinecek!`)) return;
      ['apartmanlar','denetimler','teklifler','gorevler','asansorler','isletmeProjeler','kararlar','icralar','finansIslemler','ayarlar'].forEach(k => {
        if (data[k] !== undefined) S[k] = data[k];
      });
      save(); goPage('dashboard');
      toast('Veriler başarıyla içe aktarıldı.','ok');
    } catch(err) { toast('Geçersiz dosya formatı!','err'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function clearAllData() {
  if (!confirm('TÜM VERİLER SİLİNECEK! Bu işlem geri alınamaz. Emin misiniz?')) return;
  if (!confirm('Son onay: Gerçekten silmek istiyor musunuz?')) return;
  localStorage.removeItem('syp5');
  location.reload();
}

// ===================================================
// API KEY: Ayarlardan okuyarak callAI'ı güncelle
// ===================================================
const _origCallAI = callAI;



// ── SIDEBAR TOGGLE ───────────────────────────────────────
function toggleSidebar() {
  var sb = document.getElementById('sb');
  var overlay = document.getElementById('sb-overlay');
  if (window.innerWidth <= 768) {
    // Mobil: drawer aç/kapat
    var isOpen = sb.classList.contains('mobile-open');
    sb.classList.toggle('mobile-open', !isOpen);
    overlay.classList.toggle('show', !isOpen);
    document.body.style.overflow = !isOpen ? 'hidden' : '';
  } else {
    // Desktop: daralt/genişlet
    sb.classList.toggle('collapsed');
    localStorage.setItem('sb_collapsed', sb.classList.contains('collapsed') ? '1' : '0');
  }
}
function closeSidebarMobile() {
  if (window.innerWidth <= 768) {
    var sb = document.getElementById('sb');
    var overlay = document.getElementById('sb-overlay');
    sb.classList.remove('mobile-open');
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }
}
// Sayfa yüklenince kayıtlı durumu uygula
(function(){
  if (localStorage.getItem('sb_collapsed') === '1') {
    var sb = document.getElementById('sb');
    if (sb) sb.classList.add('collapsed');
  }
  var secState = JSON.parse(localStorage.getItem('sb_sec_state') || '{}');
  document.querySelectorAll('.sb-sec').forEach(function(s, i) {
    if (secState[i]) s.classList.add('sec-collapsed');
  });
})();
function toggleSbSec(lbl) {
  if (document.getElementById('sb').classList.contains('collapsed')) return;
  var sec = lbl.closest('.sb-sec');
  sec.classList.toggle('sec-collapsed');
  var state = {};
  document.querySelectorAll('.sb-sec').forEach(function(s, i) {
    state[i] = s.classList.contains('sec-collapsed');
  });
  localStorage.setItem('sb_sec_state', JSON.stringify(state));
}
// Close on ESC
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var sb = document.getElementById('sb');
    if (sb && sb.classList.contains('mobile-open')) toggleSidebar();
  }
});

// ===================================================
// SİGORTA TAKİBİ
// ===================================================
function calcSigBitis() {
  const bas = document.getElementById('sig-bas').value;
  if (!bas) return;
  const sure = parseInt(document.getElementById('sig-sure').value) || 12;
  const d = new Date(bas); d.setMonth(d.getMonth() + sure);
  document.getElementById('sig-bit').value = d.toISOString().split('T')[0];
}

function saveSigorta() {
  const apt = aptById(document.getElementById('sig-apt').value);
  if (!apt) { toast('Apartman seçin!', 'err'); return; }
  const sirket = document.getElementById('sig-sirket').value.trim();
  if (!sirket) { toast('Sigorta şirketi zorunlu!', 'err'); return; }
  const bas = document.getElementById('sig-bas').value;
  const bit = document.getElementById('sig-bit').value;
  if (!bas || !bit) { toast('Tarihleri girin!', 'err'); return; }
  const rec = {
    id: Date.now(), aptId: apt.id, aptAd: apt.ad,
    tur: document.getElementById('sig-tur').value,
    sirket, no: document.getElementById('sig-no').value,
    bas, bit,
    prim: parseFloat(document.getElementById('sig-prim').value) || 0,
    acenta: document.getElementById('sig-acenta').value,
    acentaTel: document.getElementById('sig-acenta-tel').value,
    not: document.getElementById('sig-not').value,
    tarih: today()
  };
  S.sigortalar.push(rec); save(); toast('Poliçe kaydedildi.', 'ok'); goTab('sig-liste');
}

function renderSigorta() {
  const s = (document.getElementById('sig-srch')?.value || '').toLowerCase();
  const fa = document.getElementById('sig-f-apt')?.value || '';
  const ft = document.getElementById('sig-f-tur')?.value || '';
  let list = S.sigortalar || [];
  if (fa) list = list.filter(x => String(x.aptId) === String(fa));
  if (ft) list = list.filter(x => x.tur === ft);
  if (s) list = list.filter(x => (x.aptAd + ' ' + x.sirket + ' ' + (x.no||'')).toLowerCase().includes(s));

  let aktif = 0, yakin = 0, dolmus = 0;
  (S.sigortalar||[]).forEach(x => {
    const d = dayDiff(x.bit);
    if (d < 0) dolmus++; else if (d < 30) yakin++; else aktif++;
  });
  const aktifEl = document.getElementById('sig-aktif'); if (aktifEl) aktifEl.textContent = aktif;
  const yakinEl = document.getElementById('sig-yakin'); if (yakinEl) yakinEl.textContent = yakin;
  const dolmusEl = document.getElementById('sig-dolmus'); if (dolmusEl) dolmusEl.textContent = dolmus;

  const turLbl = {dask:'DASK',konut:'Konut',yangin:'Yangın',sorumluluk:'Sorumluluk',asansor:'Asansör',diger:'Diğer'};
  const tb = document.getElementById('sig-tbody'); if (!tb) return;
  if (!list.length) { tb.innerHTML = `<tr><td colspan="10">${emp('🛡️','Poliçe kaydı bulunamadı. "Yeni Poliçe" ile ekleyin.')}</td></tr>`; return; }
  tb.innerHTML = list.slice().sort((a,b)=>a.bit.localeCompare(b.bit)).map(x => {
    const d = dayDiff(x.bit);
    const cls = d < 0 ? 'b-rd' : d < 30 ? 'b-am' : 'b-gr';
    const lbl = d < 0 ? 'Süresi Doldu' : d < 30 ? 'Yakında' : 'Aktif';
    return `<tr>
      <td>${x.aptAd}</td>
      <td><span class="b b-bl">${turLbl[x.tur]||x.tur}</span></td>
      <td>${x.sirket}</td>
      <td style="font-family:monospace;font-size:11px">${x.no||'—'}</td>
      <td>${x.bas||'—'}</td>
      <td style="font-weight:700;color:${d<0?'var(--err)':d<30?'var(--warn)':'var(--tx)'}">${x.bit||'—'}</td>
      <td style="font-weight:700;color:var(--ok)">${x.prim?'₺'+fmt(x.prim):'—'}</td>
      <td style="font-family:monospace;font-size:11.5px;color:${d<0?'var(--err)':d<30?'var(--warn)':'var(--ok)'}">${d<0?Math.abs(d)+' gün geçti':d+' gün kaldı'}</td>
      <td><span class="b ${cls}">${lbl}</span></td>
      <td><div class="act">
        ${d <= 60 ? `<button class="btn xs" style="background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn-bd)" onclick="sigortaYenilemeMetni(${x.id})" title="Yenileme Hatırlatıcısı">📋 Şablon</button>` : ''}
        <button class="act-btn rd" onclick="delSigorta(${x.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></div></td>
    </tr>`;
  }).join('');

  const bdg = document.getElementById('bdg-sig');
  if (bdg) { const n = dolmus + yakin; bdg.textContent = n; bdg.style.display = n ? '' : 'none'; }
}
function delSigorta(id) { if(!confirm('Silinsin mi?'))return; S.sigortalar=S.sigortalar.filter(x=>x.id!==id); save(); toast('Silindi.','warn'); }

function sigortaYenilemeMetni(id) {
  const x = (S.sigortalar||[]).find(s=>s.id===id); if(!x) return;
  const d = dayDiff(x.bit);
  const turLbl = {dask:'DASK',konut:'Konut',yangin:'Yangın',sorumluluk:'Sorumluluk',asansor:'Asansör Muayene',diger:'Diğer'};
  const txt = `Sayın ${x.sirket},\n\n${x.aptAd} adresindeki ${turLbl[x.tur]||x.tur} poliçeniz (No: ${x.no||'—'}) ${d<0?Math.abs(d)+' gün önce sona erdi':'yaklaşık '+d+' gün içinde sona erecektir'}.\n\nPoliçe Bitiş: ${x.bit}\n\nYenileme için lütfen bizimle iletişime geçiniz.\n\nSaygılarımızla,\nSite Yönetimi`;
  navigator.clipboard.writeText(txt).then(()=>toast('Şablon kopyalandı!','ok')).catch(()=>{ alert(txt); });
}

// ===================================================
// TOPLANTI YÖNETİMİ
// ===================================================
let topEditId = null;

function saveToplanti() {
  const apt = aptById(document.getElementById('top-apt').value);
  if (!apt) { toast('Apartman seçin!', 'err'); return; }
  const tarih = document.getElementById('top-tarih').value;
  if (!tarih) { toast('Tarih zorunlu!', 'err'); return; }
  const rec = {
    id: topEditId || Date.now(),
    aptId: apt.id, aptAd: apt.ad,
    tur: document.getElementById('top-tur').value,
    tarih, saat: document.getElementById('top-saat').value,
    yer: document.getElementById('top-yer').value,
    gundem: document.getElementById('top-gundem').value,
    notlar: document.getElementById('top-notlar').value,
    katilim: parseInt(document.getElementById('top-katilim').value) || 0,
    katilimcilar: document.getElementById('top-katilimcilar')?.value || '',
    durum: document.getElementById('top-durum').value,
    kayitTarih: today()
  };
  if (topEditId) {
    const i = S.toplantılar.findIndex(x => x.id === topEditId);
    if (i >= 0) S.toplantılar[i] = rec;
  } else {
    S.toplantılar.push(rec);
  }
  topEditId = null;
  save(); toast('Toplantı kaydedildi.', 'ok'); goTab('top-liste');
}

function renderToplanti() {
  const s = (document.getElementById('top-srch')?.value || '').toLowerCase();
  const fa = document.getElementById('top-f-apt')?.value || '';
  const ft = document.getElementById('top-f-tur')?.value || '';
  let list = S.toplantılar || [];
  if (fa) list = list.filter(x => String(x.aptId) === String(fa));
  if (ft) list = list.filter(x => x.tur === ft);
  if (s) list = list.filter(x => (x.aptAd + ' ' + (x.gundem||'')).toLowerCase().includes(s));

  const plan = (S.toplantılar||[]).filter(x=>x.durum==='planli').length;
  const tam = (S.toplantılar||[]).filter(x=>x.durum==='tamamlandi').length;
  const statsEl = document.getElementById('top-stats');
  if (statsEl) statsEl.innerHTML = `<span class="b b-am">${plan} Planlı</span><span class="b b-gr">${tam} Tamamlandı</span>`;

  const turLbl = {olagan:'Olağan',olaganustu:'Olağanüstü',yonetim:'Yönetim Kurulu',diger:'Diğer'};
  const durLbl = {planli:'Planlandı',tamamlandi:'Tamamlandı',iptal:'İptal'};
  const durCls = {planli:'b-am',tamamlandi:'b-gr',iptal:'b-rd'};
  const tb = document.getElementById('top-tbody'); if (!tb) return;
  if (!list.length) { tb.innerHTML = `<tr><td colspan="8">${emp('📅','Toplantı kaydı bulunamadı. "Yeni Toplantı" ile ekleyin.')}</td></tr>`; return; }
  tb.innerHTML = list.slice().sort((a,b)=>b.tarih.localeCompare(a.tarih)).map(x => `<tr>
    <td>${x.aptAd}</td>
    <td style="font-size:12.5px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x.gundem||''}">${(x.gundem||'—').slice(0,60)}${(x.gundem||'').length>60?'…':''}</td>
    <td><span class="b b-bl">${turLbl[x.tur]||x.tur}</span></td>
    <td style="font-weight:700">${x.tarih||'—'}</td>
    <td>${x.saat||'—'}</td>
    <td>${x.katilim||'—'} kişi</td>
    <td><span class="b ${durCls[x.durum]||'b-gy'}">${durLbl[x.durum]||x.durum}</span></td>
    <td><div class="act">
      <button class="btn bg xs" onclick="editToplanti(${x.id})" title="Düzenle">✏️</button>
      <button class="btn bg xs" onclick="viewTopTutanak(${x.id})" title="Tutanak Görüntüle">📄</button>
      <button class="act-btn rd" onclick="delToplanti(${x.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
    </div></td>
  </tr>`).join('');

  // Takvim tab
  renderTopTakvim();

  const bdg = document.getElementById('bdg-top');
  if (bdg) { bdg.textContent = plan; bdg.style.display = plan ? '' : 'none'; }
}

function renderTopTakvim() {
  const el = document.getElementById('top-takvim-content'); if (!el) return;
  const upcoming = (S.toplantılar||[])
    .filter(x => x.durum === 'planli' && dayDiff(x.tarih) >= 0)
    .sort((a,b)=>a.tarih.localeCompare(b.tarih));
  if (!upcoming.length) { el.innerHTML = emp('📆','Yaklaşan planlı toplantı bulunmuyor.'); return; }
  el.innerHTML = upcoming.map(x => {
    const d = dayDiff(x.tarih);
    const turLbl = {olagan:'Olağan KMK',olaganustu:'Olağanüstü KMK',yonetim:'Yönetim Kurulu',diger:'Diğer'};
    return `<div class="card mb10" style="border-left:3px solid var(--brand)">
      <div class="fbc">
        <div>
          <div style="font-weight:700;font-size:14px">${x.aptAd} — ${turLbl[x.tur]||x.tur}</div>
          <div class="t3 mt4" style="font-size:12px">📅 ${x.tarih} ${x.saat?'🕐 '+x.saat:''} ${x.yer?'📍 '+x.yer:''}</div>
          ${x.gundem?`<div class="t3 mt4" style="font-size:11.5px">${(x.gundem||'').split('\n').map(g=>'• '+g.trim()).join(' ')}</div>`:''}
        </div>
        <div style="text-align:center;min-width:60px">
          <div style="font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:${d<3?'var(--err)':d<7?'var(--warn)':'var(--brand)'}">${d}</div>
          <div style="font-size:10px;color:var(--tx-3)">gün kaldı</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function editToplanti(id) {
  const x = S.toplantılar.find(t => t.id === id); if (!x) return;
  topEditId = id;
  document.getElementById('top-apt').value = x.aptId;
  document.getElementById('top-tur').value = x.tur;
  document.getElementById('top-tarih').value = x.tarih;
  document.getElementById('top-saat').value = x.saat || '';
  document.getElementById('top-yer').value = x.yer || '';
  document.getElementById('top-gundem').value = x.gundem || '';
  document.getElementById('top-notlar').value = x.notlar || '';
  document.getElementById('top-katilim').value = x.katilim || 0;
  const topKatilimcilarEl = document.getElementById('top-katilimcilar');
  if (topKatilimcilarEl) topKatilimcilarEl.value = x.katilimcilar || '';
  document.getElementById('top-durum').value = x.durum;
  goTab('top-yeni');
}

function viewTopTutanak(id) {
  const x = S.toplantılar.find(t => t.id === id); if (!x) return;
  const turLbl = {olagan:'Olağan Kat Malikleri Kurulu',olaganustu:'Olağanüstü Kat Malikleri Kurulu',yonetim:'Yönetim Kurulu Toplantısı',diger:'Toplantı'};
  const txt = `${turLbl[x.tur]||x.tur.toUpperCase()} TUTANAĞI\n\nApartman: ${x.aptAd}\nTarih: ${x.tarih}${x.saat?' Saat: '+x.saat:''}\nYer: ${x.yer||'—'}\nKatılım: ${x.katilim||'—'} kişi${x.katilimcilar?'\n\nKATILIMCILAR:\n'+x.katilimcilar:''}\n\nGÜNDEM:\n${x.gundem||'—'}\n\nALINAN KARARLAR / NOTLAR:\n${x.notlar||'—'}`;
  openPrint(txt);
}

function delToplanti(id) { if(!confirm('Silinsin mi?'))return; S.toplantılar=S.toplantılar.filter(x=>x.id!==id); save(); toast('Silindi.','warn'); }

function topSablon(tip) {
  const gnds = {
    olagan: '1. Yönetim kurulunun ibrası\n2. Yönetici seçimi\n3. Denetçi seçimi\n4. Yıllık işletme bütçesinin görüşülmesi\n5. Aidat miktarının belirlenmesi\n6. Dilek ve temenniler',
    butce: '1. Geçen dönem gelir-gider tablosunun incelenmesi\n2. Yeni dönem bütçe teklifinin görüşülmesi\n3. Aidat ve diğer katılım paylarının belirlenmesi\n4. Büyük onarım fonu tartışması',
    olaganustu: '1. Toplantı çağrısının nedeni\n2. Acil müdahale gerektiren konu\n3. Alınacak önlemler ve kararlar\n4. Masraf paylaşımı'
  };
  document.getElementById('top-gundem').value = gnds[tip] || '';
  toast('Şablon yüklendi.', 'ok');
}

async function genTopCantiAI() {
  const x = {
    apt: aptById(document.getElementById('top-apt').value),
    tur: document.getElementById('top-tur').value,
    tarih: document.getElementById('top-tarih').value,
    yer: document.getElementById('top-yer').value,
    gundem: document.getElementById('top-gundem').value,
    notlar: document.getElementById('top-notlar').value,
    katilim: document.getElementById('top-katilim').value
  };
  const outEl = document.getElementById('top-ai-out');
  outEl.style.display = 'block';
  outEl.innerHTML = '<div class="lds"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span style="margin-left:4px">Tutanak hazırlanıyor…</span></div>';
  const turLbl = {olagan:'Olağan Kat Malikleri Kurulu',olaganustu:'Olağanüstü KMK',yonetim:'Yönetim Kurulu',diger:'Toplantı'};
  try {
    const r = await callAI(`Profesyonel apartman toplantı tutanağı yaz:\nApartman: ${x.apt?.ad||'—'}\nToplantı Türü: ${turLbl[x.tur]||x.tur}\nTarih: ${x.tarih||'—'}\nYer: ${x.yer||'—'}\nKatılım: ${x.katilim||'—'} kişi\n\nGÜNDEM:\n${x.gundem||'—'}\n\nNOTLAR/KARARLAR:\n${x.notlar||'—'}\n\nResmi tutanak formatında, başlık, tarih, katılım, gündem maddeleri, kararlar ve kapanış bölümleri olacak şekilde Türkçe yaz.`);
    outEl.textContent = r;
  } catch(e) { outEl.textContent = 'API bağlantı hatası.'; }
}

// ===================================================
// FATURA YÖNETİMİ
// ===================================================
function saveFatura() {
  const apt = aptById(document.getElementById('fat-apt').value);
  if (!apt) { toast('Apartman seçin!', 'err'); return; }
  const tarih = document.getElementById('fat-tarih').value;
  const tutar = parseFloat(document.getElementById('fat-tutar').value);
  if (!tarih || !tutar) { toast('Tarih ve tutar zorunlu!', 'err'); return; }
  const rec = {
    id: Date.now(), aptId: apt.id, aptAd: apt.ad,
    tur: document.getElementById('fat-tur').value,
    firma: document.getElementById('fat-firma').value,
    donem: document.getElementById('fat-donem').value,
    tarih, son: document.getElementById('fat-son').value,
    tutar, durum: document.getElementById('fat-durum').value,
    no: document.getElementById('fat-no').value,
    not: document.getElementById('fat-not').value,
    kayitTarih: today()
  };
  S.faturalar.push(rec); save(); toast('Fatura kaydedildi.', 'ok'); goTab('fat-liste');
  ['fat-firma','fat-donem','fat-tarih','fat-son','fat-tutar','fat-no','fat-not'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
}

function renderFatura() {
  const s = (document.getElementById('fat-srch')?.value || '').toLowerCase();
  const fa = document.getElementById('fat-f-apt')?.value || '';
  const ft = document.getElementById('fat-f-tur')?.value || '';
  const fd = document.getElementById('fat-f-durum')?.value || '';
  let list = S.faturalar || [];
  if (fa) list = list.filter(x => String(x.aptId) === String(fa));
  if (ft) list = list.filter(x => x.tur === ft);
  if (fd) list = list.filter(x => x.durum === fd);
  if (s) list = list.filter(x => (x.aptAd + ' ' + (x.firma||'') + ' ' + (x.tur||'')).toLowerCase().includes(s));

  const bek = (S.faturalar||[]).filter(x=>x.durum==='bekliyor').length;
  const gec = (S.faturalar||[]).filter(x=>x.durum==='gecikti').length;
  const topTutar = (S.faturalar||[]).filter(x=>x.durum==='bekliyor').reduce((s,x)=>s+x.tutar,0);
  const miniEl = document.getElementById('fat-stats-mini');
  if (miniEl) miniEl.innerHTML = `<span class="b b-am">${bek} Bekleyen</span><span class="b b-rd">${gec} Gecikmiş</span><span style="font-size:12px;font-weight:700;color:var(--err)">₺${fmt(topTutar)} ödenmemiş</span>`;

  const turLbl = {elektrik:'⚡ Elektrik',dogalgaz:'🔥 Doğalgaz',su:'💧 Su',temizlik:'🧹 Temizlik',guvenlik:'🔒 Güvenlik',asansor:'🔼 Asansör',bahce:'🌿 Bahçe',internet:'🌐 İnternet',diger:'📦 Diğer'};
  const durLbl = {bekliyor:'Bekliyor',odendi:'Ödendi',gecikti:'Gecikti'};
  const durCls = {bekliyor:'b-am',odendi:'b-gr',gecikti:'b-rd'};
  const tb = document.getElementById('fat-tbody'); if (!tb) return;
  if (!list.length) { tb.innerHTML = `<tr><td colspan="8">${emp('📄','Fatura kaydı bulunamadı. "Yeni Fatura" ile ekleyin.')}</td></tr>`; return; }
  tb.innerHTML = list.slice().sort((a,b)=>b.tarih.localeCompare(a.tarih)).map(x => `<tr>
    <td>${x.aptAd}</td>
    <td>${turLbl[x.tur]||x.tur}</td>
    <td>${x.firma||'—'}</td>
    <td>${x.donem||'—'}</td>
    <td style="font-weight:700;color:${x.durum==='odendi'?'var(--ok)':'var(--err)'}">${x.tutar?'₺'+fmt(x.tutar):'—'}</td>
    <td style="font-size:11.5px;color:${x.son&&dayDiff(x.son)<0&&x.durum!='odendi'?'var(--err)':'var(--tx-2)'}">${x.son||'—'}</td>
    <td><span class="b ${durCls[x.durum]||'b-gy'}">${durLbl[x.durum]||x.durum}</span></td>
    <td><div class="act">
      ${x.durum!=='odendi'?`<button class="btn bgn xs" onclick="odeFatura(${x.id})" title="Ödendi olarak işaretle">✓ Ödendi</button>`:''}
      <button class="act-btn rd" onclick="delFatura(${x.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
    </div></td>
  </tr>`).join('');

  // Özet
  renderFaturaOzet();

  const bdg = document.getElementById('bdg-fat');
  if (bdg) { const n = bek + gec; bdg.textContent = n; bdg.style.display = n ? '' : 'none'; }
}

function renderFaturaOzet() {
  const el = document.getElementById('fat-ozet-content'); if (!el) return;
  const fins = S.faturalar || [];
  const byTur = {};
  fins.forEach(f => {
    if (!byTur[f.tur]) byTur[f.tur] = {toplam:0,bek:0,od:0,sayi:0};
    byTur[f.tur].toplam += f.tutar || 0;
    byTur[f.tur].sayi++;
    if (f.durum==='bekliyor'||f.durum==='gecikti') byTur[f.tur].bek += f.tutar;
    if (f.durum==='odendi') byTur[f.tur].od += f.tutar;
  });
  const turLbl = {elektrik:'⚡ Elektrik',dogalgaz:'🔥 Doğalgaz',su:'💧 Su',temizlik:'🧹 Temizlik',guvenlik:'🔒 Güvenlik',asansor:'🔼 Asansör',bahce:'🌿 Bahçe',internet:'🌐 İnternet',diger:'📦 Diğer'};
  el.innerHTML = `
    <div class="g2 mb16">
      <div class="card">
        <div class="card-t mb12">Hizmet Türü Bazlı Özet</div>
        <div class="tw"><table><thead><tr><th>Hizmet</th><th>Toplam (₺)</th><th>Ödenen (₺)</th><th>Bekleyen (₺)</th><th>Kayıt</th></tr></thead>
        <tbody>${Object.entries(byTur).sort((a,b)=>b[1].toplam-a[1].toplam).map(([k,v])=>`<tr>
          <td>${turLbl[k]||k}</td>
          <td style="font-weight:700">₺${fmt(v.toplam)}</td>
          <td style="color:var(--ok)">₺${fmt(v.od)}</td>
          <td style="color:var(--err)">₺${fmt(v.bek)}</td>
          <td>${v.sayi}</td>
        </tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="card-t mb12">Apartman Bazlı Özet</div>
        ${(()=>{const ba={}; fins.forEach(f=>{if(!ba[f.aptAd])ba[f.aptAd]={toplam:0,bek:0}; ba[f.aptAd].toplam+=f.tutar||0; if(f.durum!=='odendi')ba[f.aptAd].bek+=f.tutar||0;}); return Object.keys(ba).length?`<div class="tw"><table><thead><tr><th>Apartman</th><th>Toplam (₺)</th><th>Bekleyen (₺)</th></tr></thead><tbody>${Object.entries(ba).map(([n,v])=>`<tr><td>${n}</td><td style="font-weight:700">₺${fmt(v.toplam)}</td><td style="color:${v.bek>0?'var(--err)':'var(--ok)'}">₺${fmt(v.bek)}</td></tr>`).join('')}</tbody></table></div>`:emp('📊','Henüz kayıt yok');})()}
      </div>
    </div>`;
}

function odeFatura(id) {
  const f = S.faturalar.find(x => x.id === id);
  if (f) { f.durum = 'odendi'; save(); toast('Fatura ödendi olarak işaretlendi.', 'ok'); }
}
function delFatura(id) { if(!confirm('Silinsin mi?'))return; S.faturalar=S.faturalar.filter(x=>x.id!==id); save(); toast('Silindi.','warn'); }

// ===================================================
// DEMO VERİ YÜKLEYİCİ
// ===================================================
function loadDemoData() {
  if (!confirm('Mevcut tüm veriler silinecek ve demo veriler yüklenecek. Devam etmek istiyor musunuz?')) return;

  const t = Date.now();
  const AID = 1500; // aylık aidat

  // ── APARTMAN ──────────────────────────────
  const apt = {
    id:t+1, ad:'Göksu Sitesi', adres:'Yeşiltepe Mah. Gül Sok. No:5',
    mahalle:'Yeşiltepe', ilce:'Üsküdar', il:'İstanbul',
    daireSayisi:24, katSayisi:6, yon:'Kerem Aslan', yonTel:'0532 400 50 60',
    iban:'TR34 0001 0002 0003 0004 0005 06', insaatYili:'2008',
    aidat:AID, hizmetBedeli:4500, asansor:'var', durum:'aktif', bloklar:[], daireler:[]
  };

  // ── 24 SAKİN (4 daire/kat × 6 kat) ───────
  // [daire, kat, ad, tip, tel, giris, borc, ek_alanlar]
  const _sd = [
    ['1','1','Ahmet Yılmaz','malik','0532 101 11 11','2012-04-15',0,{tc:'11111111111',dogum:'1968-03-20',email:'ahmet.yilmaz@email.com',aidat:AID,arsa:112,tapu:'TK-0001',grup:'A'}],
    ['2','1','Fatma Kaya','malik','0533 102 22 22','2015-08-10',0,{tc:'22222222222',dogum:'1975-07-14',email:'fatma.kaya@email.com',aidat:AID,arsa:118,tapu:'TK-0002',grup:'A'}],
    ['3','1','Mehmet Çelik','malik','0544 103 33 33','2010-11-20',3000,{tc:'33333333333',dogum:'1962-12-05',aidat:AID,arsa:115,tapu:'TK-0003',grup:'A',not:'2 aylık aidat borcu mevcut'}],
    ['4','1','Emine Doğan','kiralik','0505 104 44 44','2024-02-01',0,{tc:'44444444444',dogum:'1991-05-18',aidat:AID,kira:9500,depozito:19000,sozlasmeBas:'2024-02-01',sozlasmeBit:'2026-02-01',evSahibi:'Ali Koç',evSahibiTel:'0532 200 10 11',grup:'A'}],
    ['5','2','Hasan Arslan','malik','0532 105 55 55','2011-06-30',0,{tc:'55555555555',dogum:'1970-09-22',aidat:AID,arsa:122,tapu:'TK-0005',grup:'B'}],
    ['6','2','Ayşe Şahin','malik','0533 106 66 66','2018-03-15',0,{tc:'66666666666',dogum:'1985-01-30',email:'ayse.sahin@email.com',aidat:AID,arsa:108,tapu:'TK-0006',grup:'B'}],
    ['7','2','Mustafa Öztürk','kiralik','0544 107 77 77','2025-04-01',1500,{tc:'77777777777',dogum:'1988-11-03',aidat:AID,kira:9000,depozito:18000,sozlasmeBas:'2025-04-01',sozlasmeBit:'2027-04-01',evSahibi:'Sema Şen',evSahibiTel:'0533 300 20 22',grup:'B',not:'Mart aidatı ödenmedi'}],
    ['8','2','Zeynep Yıldız','malik','0505 108 88 88','2009-12-01',0,{tc:'88888888888',dogum:'1960-04-08',aidat:AID,arsa:125,tapu:'TK-0008',grup:'B'}],
    ['9','3','İbrahim Güneş','malik','0532 109 99 99','2013-09-05',0,{tc:'99999999990',dogum:'1972-06-15',email:'ibrahim.gunes@email.com',aidat:AID,arsa:119,tapu:'TK-0009',grup:'C'}],
    ['10','3','Hatice Aydın','malik','0533 110 10 10','2016-05-20',6000,{tc:'10101010101',dogum:'1958-02-28',aidat:AID,arsa:116,tapu:'TK-0010',grup:'C',not:'4 aylık aidat borcu — icra sürecinde'}],
    ['11','3','Recep Aktaş','malik','0544 111 11 12','2014-07-10',0,{tc:'11011011011',dogum:'1966-10-18',aidat:AID,arsa:121,tapu:'TK-0011',grup:'C'}],
    ['12','3','Meryem Coşkun','kiralik','0505 112 12 13','2023-09-01',0,{tc:'12012012012',dogum:'1995-03-25',email:'meryem.coskun@email.com',aidat:AID,kira:8800,depozito:17600,sozlasmeBas:'2023-09-01',sozlasmeBit:'2025-09-01',evSahibi:'Bülent Ateş',evSahibiTel:'0544 400 30 33',grup:'C'}],
    ['13','4','Yusuf Kılıç','malik','0532 113 13 14','2017-02-28',0,{tc:'13013013013',dogum:'1979-08-07',email:'yusuf.kilic@email.com',aidat:AID,arsa:113,tapu:'TK-0013',grup:'D'}],
    ['14','4','Habibe Erdoğan','malik','0533 114 14 15','2020-10-15',0,{tc:'14014014014',dogum:'1983-12-20',aidat:AID,arsa:117,tapu:'TK-0014',grup:'D'}],
    ['15','4','Aliye Kaplan','malik','0544 115 15 16','2011-04-05',3000,{tc:'15015015015',dogum:'1965-07-11',aidat:AID,arsa:120,tapu:'TK-0015',grup:'D',not:'2 aylık aidat borcu'}],
    ['16','4','Kemal Özdemir','kiralik','0505 116 16 17','2024-06-01',0,{tc:'16016016016',dogum:'1990-09-30',email:'kemal.ozdemir@email.com',aidat:AID,kira:9200,depozito:18400,sozlasmeBas:'2024-06-01',sozlasmeBit:'2026-06-01',evSahibi:'Tuğba Yıldız',evSahibiTel:'0505 500 40 44',grup:'D'}],
    ['17','5','Sevgi Demirci','malik','0532 117 17 18','2019-01-20',0,{tc:'17017017017',dogum:'1977-04-14',aidat:AID,arsa:114,tapu:'TK-0017',grup:'E'}],
    ['18','5','Hüseyin Taş','malik','0533 118 18 19','2015-11-10',0,{tc:'18018018018',dogum:'1969-11-22',email:'huseyin.tas@email.com',aidat:AID,arsa:123,tapu:'TK-0018',grup:'E'}],
    ['19','5','Leyla Şimşek','malik','0544 119 19 20','2022-07-01',0,{tc:'19019019019',dogum:'1992-01-08',email:'leyla.simsek@email.com',aidat:AID,arsa:110,tapu:'TK-0019',grup:'E'}],
    ['20','5','Cemil Yıldırım','kiralik','0505 120 20 21','2025-01-15',1500,{tc:'20020020020',dogum:'1986-05-17',aidat:AID,kira:9300,depozito:18600,sozlasmeBas:'2025-01-15',sozlasmeBit:'2027-01-15',evSahibi:'Recep Tan',evSahibiTel:'0532 600 50 55',grup:'E',not:'Mart aidatı ödenmedi'}],
    ['21','6','Nermin Bulut','malik','0532 121 21 22','2013-03-08',0,{tc:'21021021021',dogum:'1974-08-19',aidat:AID,arsa:116,tapu:'TK-0021',grup:'F'}],
    ['22','6','Tekin Özcan','malik','0533 122 22 23','2016-09-12',0,{tc:'22022022022',dogum:'1980-02-25',email:'tekin.ozcan@email.com',aidat:AID,arsa:119,tapu:'TK-0022',grup:'F'}],
    ['23','6','Filiz Güler','malik','0544 123 23 24','2010-08-20',0,{tc:'23023023023',dogum:'1967-06-03',email:'filiz.guler@email.com',aidat:AID,arsa:124,tapu:'TK-0023',grup:'F'}],
    ['24','6','Ramazan Avcı','kiralik','0505 124 24 25','2024-10-01',0,{tc:'24024024024',dogum:'1993-10-15',aidat:AID,kira:9100,depozito:18200,sozlasmeBas:'2024-10-01',sozlasmeBit:'2026-10-01',evSahibi:'Dilek Yılmaz',evSahibiTel:'0533 700 60 66',grup:'F'}],
  ];
  const sakinler = _sd.map((d,i) => ({
    id:t+100+i+1, aptId:apt.id, aptAd:apt.ad,
    daire:d[0], kat:d[1], ad:d[2], tip:d[3], tel:d[4], giris:d[5], borc:d[6],
    durum:'aktif', ...d[7]
  }));

  // ── 6 AY AİDAT BORÇLANDIRMA ───────────────
  // Ekim 2025 → Mart 2026
  // sonOdeme: ay sonu (Excel modeliyle uyumlu)
  const _months = [
    {donem:'2025-10',label:'Ekim 2025',   tarih:'2025-10-01',sonOdeme:'2025-10-31'},
    {donem:'2025-11',label:'Kasım 2025',  tarih:'2025-11-01',sonOdeme:'2025-11-30'},
    {donem:'2025-12',label:'Aralık 2025', tarih:'2025-12-01',sonOdeme:'2025-12-31'},
    {donem:'2026-01',label:'Ocak 2026',   tarih:'2026-01-01',sonOdeme:'2026-01-31'},
    {donem:'2026-02',label:'Şubat 2026',  tarih:'2026-02-01',sonOdeme:'2026-02-28'},
    {donem:'2026-03',label:'Mart 2026',   tarih:'2026-03-01',sonOdeme:'2026-03-31'},
  ];
  let _bid = t + 500;
  const aidatBorclandir = _months.map(m => ({
    id: ++_bid,
    aptId:apt.id, aptAd:apt.ad, donem:m.donem, tarih:m.tarih,
    sonOdeme:m.sonOdeme,
    aciklama: m.label + ' Aidat Bedeli',
    sakinSayisi:24, toplamBorc:24*AID,
    detaylar: sakinler.map(s => ({sakId:s.id,ad:s.ad,daire:s.daire,tutar:AID,kategori:'Aidat'}))
  }));

  // ── TAHSİLATLAR ──────────────────────────
  // Her daire için ödenen ay indisleri (0=Ekim..5=Mart)
  // D3→[0,1,2,3]  D7→[0,1,2,3,4]  D10→[0,1]  D15→[0,1,2,3]  D20→[0,1,2,3,4]
  // Borçlu olmayan dairelar 6 ay tam öder
  const _paid = {'3':[0,1,2,3],'7':[0,1,2,3,4],'10':[0,1],'15':[0,1,2,3],'20':[0,1,2,3,4]};
  // Ödeme günü: ay ortası (10-20 arası) — borçlandırma ay başı, son ödeme ay sonu
  const _payDay = {'1':12,'2':10,'3':14,'4':15,'5':11,'6':13,'7':10,'8':16,'9':12,'10':15,
                   '11':10,'12':14,'13':11,'14':13,'15':16,'16':12,'17':10,'18':14,'19':15,
                   '20':11,'21':13,'22':10,'23':16,'24':12};
  const _yontem = ['havale','nakit','eft','havale','havale','eft','nakit','havale'];
  const tahsilatlar = [];
  let _tid = t+600;
  sakinler.forEach(s => {
    const paidIdx = _paid[s.daire] || [0,1,2,3,4,5];
    paidIdx.forEach((mi) => {
      const m = _months[mi];
      const day = String(_payDay[s.daire] || 12).padStart(2,'0');
      _tid++;
      tahsilatlar.push({
        id: _tid, aptId:apt.id, aptAd:apt.ad,
        sakId: s.id, sakinId: s.id, sakinAd: s.ad, daire: s.daire,
        tutar: AID, tarih: `${m.donem}-${day}`,
        tip: 'aidat', donem: m.label,
        kategori: 'Aidat',
        yontem: _yontem[(+s.daire + mi) % _yontem.length],
        not: `${m.label} Aidat Ödemesi`,
        aciklama: `${m.label} Aidat Ödemesi`
      });
    });
  });

  // ── PERSONEL ─────────────────────────────
  const personel = [
    {id:t+201,ad:'Faruk Demir',tc:'31111111111',gorev:'kapici',tel:'0532 201 01 02',email:'faruk.demir@email.com',aptId:apt.id,aptAd:apt.ad,maas:13500,bas:'2015-03-15',iban:'TR11 0001 0002 0003 0100 0000 01',durum:'aktif',not:'7/24 görev, bina yönetiminden sorumlu'},
    {id:t+202,ad:'Gülşen Yılmaz',tc:'32222222222',gorev:'temizlik',tel:'0533 202 02 03',aptId:apt.id,aptAd:apt.ad,maas:10500,bas:'2019-06-01',durum:'aktif',not:'Hafta içi 08:00-17:00'},
    {id:t+203,ad:'Selim Aksoy',tc:'33333333330',gorev:'teknisyen',tel:'0544 203 03 04',email:'selim.aksoy@email.com',aptId:apt.id,aptAd:apt.ad,maas:15000,bas:'2021-09-10',iban:'TR22 0001 0002 0003 0200 0000 02',durum:'aktif',not:'Elektrik ve sıhhi tesisat uzmanı'},
    {id:t+204,ad:'Dilek Çelik',tc:'34444444440',gorev:'muhasebe',tel:'0505 204 04 05',email:'dilek.celik@email.com',aptId:apt.id,aptAd:apt.ad,maas:18000,bas:'2022-01-03',durum:'aktif',not:'Haftalık aidat takibi ve raporlama'},
    {id:t+205,ad:'Hakan Kara',tc:'35555555550',gorev:'bahce',tel:'0532 205 05 06',aptId:apt.id,aptAd:apt.ad,maas:9500,bas:'2023-04-01',durum:'aktif',not:'Haftada 3 gün çalışır'},
  ];

  // ── GÖREVLER ─────────────────────────────
  const gorevler = [
    {id:t+301,baslik:'Çatı Akıntısı Onarımı',aptId:apt.id,aptAd:apt.ad,kat:'Çatı',atanan:'Selim Aksoy',atananId:t+203,oncelik:'acil',bas:'2026-03-05',son:'2026-03-20',aciklama:'6. kat koridorunda tavan akıntısı. Çatı izolasyonu hasarlı.',durum:'devam',ilerleme:35},
    {id:t+302,baslik:'Asansör Periyodik Bakım',aptId:apt.id,aptAd:apt.ad,kat:'Tüm Katlar',atanan:'Lift Teknik A.Ş.',oncelik:'yuksek',bas:'2026-03-15',son:'2026-03-16',aciklama:'Yıllık periyodik bakım ve TSE muayenesi.',durum:'bekliyor',ilerleme:0},
    {id:t+303,baslik:'Giriş Holü Boya Badana',aptId:apt.id,aptAd:apt.ad,kat:'Giriş',atanan:'Faruk Demir',atananId:t+201,oncelik:'normal',bas:'2026-04-01',son:'2026-04-07',aciklama:'Giriş holü ve 1. kat merdiven duvarları.',durum:'bekliyor',ilerleme:0},
    {id:t+304,baslik:'Kalorifer Sistemi Bakımı',aptId:apt.id,aptAd:apt.ad,kat:'Bodrum',atanan:'Selim Aksoy',atananId:t+203,oncelik:'yuksek',bas:'2026-03-10',son:'2026-03-14',aciklama:'Mevsim sonu kalorifer sistemi boşaltma ve bakımı.',durum:'tamamlandi',ilerleme:100},
    {id:t+305,baslik:'Otopark Şerit Boyama',aptId:apt.id,aptAd:apt.ad,kat:'-1',atanan:'Faruk Demir',atananId:t+201,oncelik:'normal',bas:'2026-04-10',son:'2026-04-12',aciklama:'Park yeri şerit boyaları yenileme.',durum:'bekliyor',ilerleme:0},
    {id:t+306,baslik:'Güvenlik Kamerası Güncellemesi',aptId:apt.id,aptAd:apt.ad,kat:'2. ve 4. Kat',atanan:'Güvenlik Pro A.Ş.',oncelik:'yuksek',bas:'2026-03-20',son:'2026-03-22',aciklama:'2. ve 4. kat kameralar görüntü vermiyor.',durum:'bekliyor',ilerleme:0},
    {id:t+307,baslik:'Bahçe İlkbahar Düzenlemesi',aptId:apt.id,aptAd:apt.ad,kat:'Zemin',atanan:'Hakan Kara',atananId:t+205,oncelik:'normal',bas:'2026-04-15',son:'2026-05-01',aciklama:'Çim ekimi, fidan dikimi ve sulama sistemi kontrolü.',durum:'bekliyor',ilerleme:0},
    {id:t+308,baslik:'Su Deposu Yıllık Temizliği',aptId:apt.id,aptAd:apt.ad,kat:'Çatı',atanan:'Selim Aksoy',atananId:t+203,oncelik:'normal',bas:'2026-03-25',son:'2026-03-26',aciklama:'Yıllık su deposu temizlik ve dezenfeksiyonu.',durum:'devam',ilerleme:50},
    {id:t+309,baslik:'Merdiven LED Dönüşümü',aptId:apt.id,aptAd:apt.ad,kat:'Tüm Katlar',atanan:'Selim Aksoy',atananId:t+203,oncelik:'normal',bas:'2025-12-10',son:'2025-12-15',aciklama:'Tüm merdiven ampulleri LED\'e dönüştürüldü. %40 enerji tasarrufu.',durum:'tamamlandi',ilerleme:100},
    {id:t+310,baslik:'Koridor Halı Yenileme',aptId:apt.id,aptAd:apt.ad,kat:'1-3. Katlar',atanan:'Faruk Demir',atananId:t+201,oncelik:'normal',bas:'2026-02-20',son:'2026-02-25',aciklama:'1-3. kat koridor halıları yıpranmış, değiştirildi.',durum:'tamamlandi',ilerleme:100},
  ];

  // ── DUYURULAR ────────────────────────────
  const duyurular = [
    {id:t+401,aptId:apt.id,aptAd:apt.ad,baslik:'Mart 2026 Aidat Bildirimi',icerik:'Değerli sakinlerimiz,\n\nMart 2026 dönemi aidat ödemesinin ₺1.500 olduğunu hatırlatırız.\nSon ödeme tarihi: 10 Mart 2026\n\nIBAN: TR34 0001 0002 0003 0004 0005 06\n\nYönetim Kurulu',tip:'aidat',tarih:'2026-03-01',bitis:'2026-03-31'},
    {id:t+402,aptId:apt.id,aptAd:apt.ad,baslik:'Çatı Onarım Çalışması (5-20 Mart)',icerik:'5-20 Mart 2026 tarihleri arasında çatı izolasyon onarımı yapılacaktır.\nÇalışma saatleri: 08:30-17:00\nGürültüden kaynaklanan rahatsızlık için özür dileriz.',tip:'bakim',tarih:'2026-03-03',bitis:'2026-03-20'},
    {id:t+403,aptId:apt.id,aptAd:apt.ad,baslik:'Su Deposu Temizliği (25-26 Mart)',icerik:'25-26 Mart 2026 tarihlerinde su deposu periyodik temizliği yapılacaktır. Bu süreçte su kesintisi yaşanmayacaktır.',tip:'duyuru',tarih:'2026-03-22',bitis:'2026-03-27'},
    {id:t+404,aptId:apt.id,aptAd:apt.ad,baslik:'Şubat 2026 Aidat Hatırlatması',icerik:'Şubat 2026 aidatını henüz ödemeyen sakinlerimizin ivedi ödeme yapması gerekmektedir. Son ödeme tarihi 10 Şubat 2026 geçmiştir.',tip:'aidat',tarih:'2026-02-12',bitis:'2026-02-28'},
    {id:t+405,aptId:apt.id,aptAd:apt.ad,baslik:'LED Dönüşümü Tamamlandı',icerik:'Tüm merdiven ve ortak alan aydınlatmaları LED sisteme dönüştürülmüştür. Aylık elektrik faturasında yaklaşık %40 tasarruf beklenmektedir.',tip:'duyuru',tarih:'2025-12-18',bitis:'2026-01-18'},
    {id:t+406,aptId:apt.id,aptAd:apt.ad,baslik:'Yeni Yıl 2026 Tebriği',icerik:'Göksu Sitesi Yönetim Kurulu olarak tüm sakinlerimizin yeni yılını kutlar, sağlık ve mutluluk dileriz.\n\nYönetim Kurulu',tip:'duyuru',tarih:'2025-12-31',bitis:'2026-01-07'},
    {id:t+407,aptId:apt.id,aptAd:apt.ad,baslik:'Otopark Kullanım Kuralları',icerik:'Otopark içinde tekrarlayan park ihlalleri tespit edilmektedir. Lütfen yalnızca kendi tahsis alanınıza park ediniz. İhlal durumunda araç çektirilecektir.',tip:'duyuru',tarih:'2026-01-15',bitis:'2026-02-15'},
    {id:t+408,aptId:apt.id,aptAd:apt.ad,baslik:'ACİL: Bodrum Kat Su Baskını',icerik:'18 Kasım 2025 gecesi yaşanan yoğun yağış nedeniyle bodrum katta su birikintisi oluşmuştur. Ekiplerimiz müdahale etmektedir. Bodrum kata inilmeyiniz.',tip:'acil',tarih:'2025-11-18',bitis:'2025-11-20'},
  ];

  // ── ARIZALAR ─────────────────────────────
  const arizalar = [
    {id:t+501,aptId:apt.id,aptAd:apt.ad,no:'ARZ-0501',baslik:'6. Kat Tavan Sızıntısı',aciklama:'6. kat B koridor tavanından su sızıyor, çatı izolasyonu bozulmuş',kat:'6',oncelik:'acil',durum:'devam',tarih:'2026-03-05',atanan:'Selim Aksoy',maliyetTahmini:8000,maliyetGercek:0},
    {id:t+502,aptId:apt.id,aptAd:apt.ad,no:'ARZ-0502',baslik:'Asansör Kapı Sensörü',aciklama:'Asansör 3. katta kapı tam kapanmıyor, açık kalıyor',kat:'3',oncelik:'yuksek',durum:'acik',tarih:'2026-03-12',atanan:'Faruk Demir',maliyetTahmini:1500,maliyetGercek:0},
    {id:t+503,aptId:apt.id,aptAd:apt.ad,no:'ARZ-0503',baslik:'Ana Elektrik Panosu',aciklama:'Bodrum elektrik panosunda sigortalar sık atıyor',kat:'Bodrum',oncelik:'acil',durum:'acik',tarih:'2026-03-08',atanan:'Selim Aksoy',maliyetTahmini:3500,maliyetGercek:0},
    {id:t+504,aptId:apt.id,aptAd:apt.ad,no:'ARZ-0504',baslik:'4. Kat Radyatör Isınmıyor',aciklama:'4. kat merdiven arasındaki radyatör ısınmıyor',kat:'4',oncelik:'normal',durum:'kapandi',tarih:'2026-02-15',hedef:'2026-02-18',atanan:'Selim Aksoy',maliyetTahmini:800,maliyetGercek:650,kapanis:'2026-02-17'},
    {id:t+505,aptId:apt.id,aptAd:apt.ad,no:'ARZ-0505',baslik:'Otopark Zemin Çatlağı',aciklama:'Otopark girişi zemin levhası çatlamış, tırmanma riski',kat:'-1',oncelik:'yuksek',durum:'acik',tarih:'2026-03-10',atanan:'Faruk Demir',maliyetTahmini:5000,maliyetGercek:0},
    {id:t+506,aptId:apt.id,aptAd:apt.ad,no:'ARZ-0506',baslik:'2. Kat Ortak Tuvalet',aciklama:'2. kat ortak tuvalet sifonu tıkalı, kötü koku var',kat:'2',oncelik:'normal',durum:'tamam',tarih:'2025-12-22',hedef:'2025-12-24',atanan:'Selim Aksoy',maliyetTahmini:400,maliyetGercek:300,kapanis:'2025-12-23'},
    {id:t+507,aptId:apt.id,aptAd:apt.ad,no:'ARZ-0507',baslik:'Bodrum Su Baskını Onarımı',aciklama:'Kasım yağışı sonrası bodrum zemin ve duvar hasarı tamiri',kat:'Bodrum',oncelik:'yuksek',durum:'kapandi',tarih:'2025-11-18',hedef:'2025-11-30',atanan:'Selim Aksoy',maliyetTahmini:12000,maliyetGercek:9800,kapanis:'2025-11-25'},
    {id:t+508,aptId:apt.id,aptAd:apt.ad,no:'ARZ-0508',baslik:'Çatı Yağmur Olukları',aciklama:'Çatı yağmur olukları yaprak ve çamurla tıkalı',kat:'Çatı',oncelik:'normal',durum:'tamam',tarih:'2025-10-20',hedef:'2025-10-23',atanan:'Faruk Demir',maliyetTahmini:500,maliyetGercek:400,kapanis:'2025-10-22'},
  ];

  // ── SİGORTALAR ───────────────────────────
  const sigortalar = [
    {id:t+1101,aptId:apt.id,aptAd:apt.ad,tur:'dask',sirket:'Allianz Sigorta',no:'DASK-2025-GKS-001',bas:'2025-06-01',bit:'2026-06-01',prim:4800,acenta:'Yeşiltepe Sigorta Acentalık',acentaTel:'0216 400 40 41',not:'Bina deprem + konut paketi',tarih:'2025-05-28'},
    {id:t+1102,aptId:apt.id,aptAd:apt.ad,tur:'asansor',sirket:'Mapfre Sigorta',no:'ASN-2025-GKS-002',bas:'2025-09-10',bit:'2026-03-10',prim:2200,acenta:'Yeşiltepe Sigorta Acentalık',acentaTel:'0216 400 40 41',not:'Muayene tarihi doldu — yenileme gerekli',tarih:'2025-09-05'},
    {id:t+1103,aptId:apt.id,aptAd:apt.ad,tur:'yangin',sirket:'Axa Sigorta',no:'YNG-2025-GKS-003',bas:'2025-11-15',bit:'2026-11-15',prim:1800,acenta:'Güven Sigorta Ltd.',acentaTel:'0216 500 50 51',not:'Yangın sigortası aktif',tarih:'2025-11-12'},
  ];

  // ── TOPLANTILAR ──────────────────────────
  const toplantılar = [
    {id:t+1001,aptId:apt.id,aptAd:apt.ad,tur:'olagan',tarih:'2025-10-15',saat:'19:00',yer:'Apartman Toplantı Salonu',gundem:'2024-2025 hesap ibrası\nAidat belirleme\nYönetici seçimi\nÇatı onarımı bütçesi',katilim:19,durum:'tamamlandi',notlar:'Kerem Aslan oybirliğiyle yönetici seçildi. Aidat ₺1.500 belirlendi. Çatı için ₺90.000 bütçe ayrıldı.',kayitTarih:'2025-10-15'},
    {id:t+1002,aptId:apt.id,aptAd:apt.ad,tur:'yonetim',tarih:'2025-12-05',saat:'20:00',yer:'Yönetim Ofisi',gundem:'Bodrum hasarı sigorta başvurusu\nKış bakım planı\nBorçlu sakinler görüşmesi',katilim:3,durum:'tamamlandi',notlar:'Sigorta başvurusu yapıldı. Hatice Aydın\'a yazılı uyarı gönderilmesine karar verildi.',kayitTarih:'2025-12-05'},
    {id:t+1003,aptId:apt.id,aptAd:apt.ad,tur:'yonetim',tarih:'2026-02-10',saat:'19:30',yer:'Yönetim Ofisi',gundem:'Çatı teklif değerlendirmesi\nMart dönemi bütçe\nHatice Aydın icra kararı',katilim:3,durum:'tamamlandi',notlar:'İzoBuild teklifi onaylandı. Hatice Aydın için icra yoluna gidilmesine karar verildi.',kayitTarih:'2026-02-10'},
    {id:t+1004,aptId:apt.id,aptAd:apt.ad,tur:'olaganustu',tarih:'2026-04-20',saat:'19:00',yer:'Apartman Toplantı Salonu',gundem:'Asansör modernizasyonu kararı\nOtopark zemin onarım paylaşımı\n2026 yılı 2. yarı bütçesi',katilim:0,durum:'planli',notlar:'',kayitTarih:'2026-03-15'},
  ];

  // ── FATURALAR (6 ay × 2) ─────────────────
  const _fatDefs = [
    ['2025-10','elektrik','İstanbul Elektrik Dağıtım A.Ş.',3800,'Ekim 2025 ortak alan elektriği','odendi'],
    ['2025-10','dogalgaz','İGDAŞ',12400,'Ekim 2025 kalorifer doğalgazı','odendi'],
    ['2025-11','elektrik','İstanbul Elektrik Dağıtım A.Ş.',4100,'Kasım 2025 ortak alan elektriği','odendi'],
    ['2025-11','su','İSKİ',1650,'Kasım 2025 ortak su kullanımı','odendi'],
    ['2025-12','elektrik','İstanbul Elektrik Dağıtım A.Ş.',4500,'Aralık 2025 ortak alan elektriği','odendi'],
    ['2025-12','dogalgaz','İGDAŞ',16800,'Aralık 2025 kalorifer doğalgazı','odendi'],
    ['2026-01','elektrik','İstanbul Elektrik Dağıtım A.Ş.',4300,'Ocak 2026 ortak alan elektriği','odendi'],
    ['2026-01','dogalgaz','İGDAŞ',15200,'Ocak 2026 kalorifer doğalgazı','odendi'],
    ['2026-02','elektrik','İstanbul Elektrik Dağıtım A.Ş.',4000,'Şubat 2026 ortak alan elektriği','odendi'],
    ['2026-02','dogalgaz','İGDAŞ',13500,'Şubat 2026 kalorifer doğalgazı','odendi'],
    ['2026-03','elektrik','İstanbul Elektrik Dağıtım A.Ş.',3600,'Mart 2026 ortak alan elektriği','bekliyor'],
    ['2026-03','asansor','Lift Teknik A.Ş.',3200,'Mart 2026 asansör bakım sözleşmesi','bekliyor'],
  ];
  const _mLbl = {'2025-10':'Ekim 2025','2025-11':'Kasım 2025','2025-12':'Aralık 2025','2026-01':'Ocak 2026','2026-02':'Şubat 2026','2026-03':'Mart 2026'};
  let _fid = t+1200;
  const faturalar = _fatDefs.map((f,i) => {
    _fid++;
    return {id:_fid,aptId:apt.id,aptAd:apt.ad,tur:f[1],firma:f[2],donem:_mLbl[f[0]],
      tarih:`${f[0]}-05`,son:`${f[0]}-20`,tutar:f[3],durum:f[5],
      no:`FAT-${f[0].replace('-','')}-${String(i+1).padStart(3,'0')}`,not:f[4],kayitTarih:`${f[0]}-05`};
  });

  // ── FİNANS İŞLEMLERİ ────────────────────
  const _finDefs = [
    ['2025-10-15','gelir','aidat','Ekim 2025 Aidat Tahsilatı',33000,'22 daireden tahsilat (2 gecikmiş)'],
    ['2025-10-31','gider','maas','Ekim 2025 Personel Maaşları',66500,'5 personel'],
    ['2025-11-15','gelir','aidat','Kasım 2025 Aidat Tahsilatı',33000,'22 daireden tahsilat'],
    ['2025-11-20','gider','onarim','Bodrum Su Baskını Onarımı',9800,'Sigorta başvurusu yapıldı'],
    ['2025-11-30','gider','maas','Kasım 2025 Personel Maaşları',66500,'5 personel'],
    ['2025-12-15','gelir','aidat','Aralık 2025 Aidat Tahsilatı',33000,'22 daireden tahsilat'],
    ['2025-12-31','gider','maas','Aralık 2025 Personel Maaşları',66500,'5 personel'],
    ['2026-01-15','gelir','aidat','Ocak 2026 Aidat Tahsilatı',33000,'22 daireden tahsilat'],
    ['2026-01-31','gider','maas','Ocak 2026 Personel Maaşları',66500,'5 personel'],
    ['2026-02-15','gelir','aidat','Şubat 2026 Aidat Tahsilatı',31500,'21 daireden tahsilat'],
    ['2026-02-28','gider','maas','Şubat 2026 Personel Maaşları',66500,'5 personel'],
    ['2026-03-15','gelir','aidat','Mart 2026 Aidat Tahsilatı',30000,'20 daireden tahsilat (4 gecikmiş)'],
    ['2026-03-31','gider','maas','Mart 2026 Personel Maaşları',66500,'5 personel'],
  ];
  let _finid = t+1300;
  const finansIslemler = _finDefs.map(f => ({
    id:++_finid,aptId:apt.id,aptAd:apt.ad,tarih:f[0],tur:f[1],kat:f[2],aciklama:f[3],tutar:f[4],not:f[5]
  }));

  // ── DENETİMLER ───────────────────────────
  const denetimler = [
    {id:t+901,aptId:apt.id,aptAd:apt.ad,tarih:'2025-10-20',denetci:'Kerem Aslan',temizlik:8,guvenlik:7,teknik:7,cevre:9,altyapi:7,puan:76,notlar:'Genel durum iyi. Asansör muayene tarihi yaklaşıyor. Bodrum hafif nem sorunu.',onlem:'Asansör muayenesi Kasım\'da yaptırılacak. Bodrum nem izolasyonu değerlendirilecek.',sonraki:'2026-04-20'},
    {id:t+902,aptId:apt.id,aptAd:apt.ad,tarih:'2026-01-10',denetci:'Kerem Aslan',temizlik:9,guvenlik:8,teknik:6,cevre:8,altyapi:7,puan:76,notlar:'Temizlik mükemmel. LED dönüşümü başarılı. Çatı izolasyonu hasarlı, onarım gerekli.',onlem:'Çatı izolasyon teklif alınması kararlaştırıldı.',sonraki:'2026-07-10'},
    {id:t+903,aptId:apt.id,aptAd:apt.ad,tarih:'2026-03-05',denetci:'Kerem Aslan',temizlik:8,guvenlik:7,teknik:5,cevre:8,altyapi:6,puan:68,notlar:'Çatı onarımı devam ediyor. Asansör muayene gecikmesi var. Elektrik panosu sorunlu.',onlem:'Asansör bakım firmasıyla randevu alındı. Elektrik ustası çağrıldı.',sonraki:'2026-09-05'},
  ];

  // ── TEKLİFLER ────────────────────────────
  const teklifler = [
    {id:t+801,aptId:apt.id,aptAd:apt.ad,tarih:'2026-01-25',konu:'Çatı Su Yalıtımı',firma:'İzoBuild İnşaat',tutar:72000,kdv:20,kdvli:86400,gecerli:'2026-02-25',aciklama:'10 yıl garantili poliüretan kaplama — 220 m²',durum:'onaylandi'},
    {id:t+802,aptId:apt.id,aptAd:apt.ad,tarih:'2026-01-28',konu:'Çatı Su Yalıtımı',firma:'ÇatıUsta Ltd.',tutar:81000,kdv:20,kdvli:97200,gecerli:'2026-02-28',aciklama:'8 yıl garantili bitümlü membran — 220 m²',durum:'reddedildi'},
    {id:t+803,aptId:apt.id,aptAd:apt.ad,tarih:'2026-03-10',konu:'Asansör Modernizasyonu',firma:'Lift Teknik A.Ş.',tutar:55000,kdv:20,kdvli:66000,gecerli:'2026-04-10',aciklama:'Frekans konvertörü + yeni kapı sistemi',durum:'bekliyor'},
  ];

  // ── KARARLAR ─────────────────────────────
  const kararlar = [
    {id:t+851,aptId:apt.id,aptAd:apt.ad,tarih:'2025-10-15',no:'2025/001',tur:'olagan',katilim:19,oy:19,gundem:'Yönetici seçimi, aidat belirleme, çatı bütçesi, personel zam',metin:'KARAR METNİ\n\nGöksu Sitesi Olağan Kat Malikleri Kurulu Toplantısı\nTarih: 15.10.2025 | Katılım: 19/24 kat maliki\n\n1. Kerem Aslan yönetici olarak oybirliğiyle seçildi (1 yıl görev süresi).\n2. 2025-2026 dönemi aylık aidat ₺1.500 olarak belirlendi.\n3. Çatı izolasyon onarımı için ₺90.000 bütçe ayrılmasına karar verildi.\n4. Tüm personele %10 zam yapılmasına oybirliğiyle karar verildi.'},
    {id:t+852,aptId:apt.id,aptAd:apt.ad,tarih:'2026-02-10',no:'2026/001',tur:'yonetim',katilim:3,oy:3,gundem:'Çatı teklif onayı, Hatice Aydın icra kararı',metin:'KARAR METNİ\n\nGöksu Sitesi Yönetim Kurulu Kararı\nTarih: 10.02.2026 | Katılım: 3 yönetim kurulu üyesi\n\n1. İzoBuild İnşaat\'ın ₺86.400 KDV dahil çatı izolasyon teklifi oybirliğiyle kabul edildi.\n2. Hatice Aydın (D.10) için birikmiş 4 aylık aidat borcu nedeniyle icra takibine başlanmasına karar verildi.'},
  ];

  // ── İCRA ─────────────────────────────────
  const icralar = [
    {id:t+861,aptId:apt.id,aptAd:apt.ad,borclu:'Hatice Aydın',daire:'10',avukat:'Av. Serdar Doğan',avukatTel:'0532 700 80 90',dosyaNo:'2026/İCR-0234',icraDairesi:'Üsküdar 2. İcra Müdürlüğü',tutar:6000,faiz:300,sebepTur:'aidat_borc',sebep:'Aidat Borcu',aciklama:'Aralık 2025 — Mart 2026 arası 4 aylık aidat borcu',durum:'devam',tarih:'2026-03-01',notlar:'Ödeme emri tebliğ edildi. Sakin itiraz etmedi.'},
  ];

  // ── ASANSÖRLER ───────────────────────────
  const asansorler = [
    {id:t+871,aptId:apt.id,aptAd:apt.ad,blok:'Ana Bina',asansorNo:'ASN-GKS-001',firma:'Lift Teknik A.Ş.',etiketTarih:'2025-09-10',sonTarih:'2026-03-10',bolum:'Muayene tarihi dolmuş — acil yenileme gerekli'},
  ];

  // ── STATE\'E YÜKLE ────────────────────────
  S.apartmanlar    = [apt];
  S.sakinler       = sakinler;
  S.personel       = personel;
  S.gorevler       = gorevler;
  S.duyurular      = duyurular;
  S.arizalar       = arizalar;
  S.tahsilatlar    = tahsilatlar;
  S.sigortalar     = sigortalar;
  S.toplantılar    = toplantılar;
  S.faturalar      = faturalar;
  S.finansIslemler = finansIslemler;
  S.denetimler     = denetimler;
  S.teklifler      = teklifler;
  S.kararlar       = kararlar;
  S.icralar        = icralar;
  S.asansorler     = asansorler;
  S.aidatBorclandir = aidatBorclandir;
  S.isletmeProjeler = [];
  S.gelirTanimlari = [];
  S.giderTanimlari = [];
  S.projeler       = [];
  S.gorevBildirimleri = [];
  S.ayarlar = {
    firma:'Göksu Sitesi Yönetimi', yonetici:'Kerem Aslan',
    unvan:'Apartman Yöneticisi', tel:'0532 400 50 60',
    mail:'yonetim@goksusitesi.com',
    adres:'Yeşiltepe Mah. Gül Sok. No:5, Üsküdar, İstanbul'
  };

  save();
  syncDropdowns();
  selectedAptId = apt.id;
  refreshUI();
  goPage('dashboard');
  toast('✅ Göksu Sitesi demo verisi yüklendi — 24 daire, 6 aylık kayıtlar hazır!', 'ok');
}

// ── ESKİ DEMO ARTIK KULLANILMIYOR (placeholder) ──
function loadDemoData_OLD() {
  const t = Date.now();
  const apt1 = { id: t+1, ad:'Yıldız Sitesi A Blok', adres:'Bağcılar Cad. No:12', mahalle:'Bağcılar', ilce:'Bağcılar', il:'İstanbul', daireSayisi:24, katSayisi:6, yon:'Ahmet Yıldız', yonTel:'0532 111 22 33', iban:'TR12 0001 0002 0003 0004 0005 06', insaatYili:'2005', aidat:1200, hizmetBedeli:3500, asansor:'var', durum:'aktif', bloklar:[{ad:'A Blok',asansorSayisi:1}], daireler:[] };
  const apt2 = { id: t+2, ad:'Güneş Residance', adres:'Atatürk Bul. No:45', mahalle:'Kadıköy', ilce:'Kadıköy', il:'İstanbul', daireSayisi:36, katSayisi:9, yon:'Fatma Demir', yonTel:'0533 222 33 44', iban:'TR34 0001 0002 0003 0004 0005 07', insaatYili:'2010', aidat:1800, hizmetBedeli:5200, asansor:'var', durum:'aktif', bloklar:[{ad:'B Blok',asansorSayisi:2}], daireler:[] };

  const sakinler = [
    {id:t+101,aptId:apt1.id,aptAd:apt1.ad,tip:'malik',ad:'Mehmet Kaya',tc:'12345678901',dogum:'1975-06-15',cinsiyet:'e',tel:'0532 100 11 22',email:'mkaya@email.com',daire:'3',kat:'1',giris:'2015-03-01',aidat:1200,borc:2400,arsa:125,tapu:'TR-1234',not:'Yönetim kurulu üyesi'},
    {id:t+102,aptId:apt1.id,aptAd:apt1.ad,tip:'malik',ad:'Ayşe Çelik',tc:'23456789012',dogum:'1982-09-20',cinsiyet:'k',tel:'0533 200 22 33',email:'acelik@email.com',daire:'7',kat:'2',giris:'2018-07-15',aidat:1200,borc:0,arsa:110},
    {id:t+103,aptId:apt1.id,aptAd:apt1.ad,tip:'kiralik',ad:'Hasan Şahin',tc:'34567890123',cinsiyet:'e',tel:'0544 300 33 44',daire:'12',kat:'3',giris:'2023-01-10',aidat:1200,borc:1200,kira:8500,depozito:17000,sozlasmeBas:'2023-01-10',sozlasmeBit:'2025-01-10',evSahibi:'Recep Aktaş',evSahibiTel:'0555 444 55 66'},
    {id:t+104,aptId:apt1.id,aptAd:apt1.ad,tip:'malik',ad:'Zeynep Arslan',tc:'45678901234',cinsiyet:'k',tel:'0505 400 44 55',daire:'15',kat:'4',giris:'2019-05-20',aidat:1200,borc:0,arsa:130},
    {id:t+105,aptId:apt2.id,aptAd:apt2.ad,tip:'malik',ad:'Ali Öztürk',tc:'56789012345',cinsiyet:'e',tel:'0532 500 55 66',email:'aozturk@email.com',daire:'5',kat:'2',giris:'2016-11-01',aidat:1800,borc:3600,arsa:145,tapu:'TR-5678'},
    {id:t+106,aptId:apt2.id,aptAd:apt2.ad,tip:'malik',ad:'Fatma Yılmaz',tc:'67890123456',cinsiyet:'k',tel:'0533 600 66 77',daire:'18',kat:'5',giris:'2020-03-15',aidat:1800,borc:0,arsa:120},
    {id:t+107,aptId:apt2.id,aptAd:apt2.ad,tip:'kiralik',ad:'Emre Doğan',tc:'78901234567',cinsiyet:'e',tel:'0544 700 77 88',daire:'22',kat:'6',giris:'2024-01-15',aidat:1800,borc:1800,kira:12000,depozito:24000,sozlasmeBas:'2024-01-15',sozlasmeBit:'2026-01-15',evSahibi:'Sema Koç',evSahibiTel:'0555 888 99 00'},
  ];

  const personel = [
    {id:t+201,ad:'Süleyman Temiz',tc:'11122233344',gorev:'kapici',tel:'0532 900 01 02',email:'stemiz@email.com',aptId:apt1.id,aptAd:apt1.ad,maas:12000,bas:'2018-04-01',iban:'TR12 0001 0002 0003',durum:'aktif',not:'7/24 nöbet tutar'},
    {id:t+202,ad:'Güler Aksoy',tc:'22233344455',gorev:'temizlik',tel:'0533 900 02 03',aptId:apt1.id,aptAd:apt1.ad,maas:9000,bas:'2020-09-01',durum:'aktif'},
    {id:t+203,ad:'Murat Özkan',tc:'33344455566',gorev:'kapici',tel:'0544 900 03 04',aptId:apt2.id,aptAd:apt2.ad,maas:13500,bas:'2017-06-15',durum:'aktif',not:'Teknik konularda deneyimli'},
    {id:t+204,ad:'Hülya Başaran',tc:'44455566677',gorev:'temizlik',tel:'0505 900 04 05',aptId:apt2.id,aptAd:apt2.ad,maas:9500,bas:'2021-02-01',durum:'aktif'},
    {id:t+205,ad:'Kemal Tunç',tc:'55566677788',gorev:'bahce',tel:'0532 900 05 06',aptId:null,aptAd:'Genel',maas:10000,bas:'2019-07-01',durum:'aktif',not:'Her iki apartmana bakım yapar'},
  ];

  const gorevler = [
    {id:t+301,baslik:'Çatı Onarımı',aptId:apt1.id,aptAd:apt1.ad,kat:'Çatı',atanan:'Süleyman Temiz',oncelik:'acil',bas:'2026-03-01',son:'2026-03-20',aciklama:'Çatı yalıtımı hasarlı, su sızıntısı var',durum:'devam',ilerleme:40},
    {id:t+302,baslik:'Asansör Bakımı',aptId:apt1.id,aptAd:apt1.ad,kat:'Tüm Katlar',atanan:'Lift Teknik',oncelik:'yuksek',bas:'2026-03-10',son:'2026-03-15',aciklama:'6 aylık periyodik bakım',durum:'bekliyor',ilerleme:0},
    {id:t+303,baslik:'Otopark Boya',aptId:apt1.id,aptAd:apt1.ad,kat:'-1',atanan:'Güler Aksoy',oncelik:'normal',bas:'2026-04-01',son:'2026-04-10',aciklama:'Otopark şerit boyaları yenileme',durum:'bekliyor',ilerleme:0},
    {id:t+304,baslik:'Giriş Kapısı Tamiri',aptId:apt2.id,aptAd:apt2.ad,kat:'Giriş',atanan:'Murat Özkan',oncelik:'yuksek',bas:'2026-03-05',son:'2026-03-12',aciklama:'Otomatik kapı sistemi arızalı',durum:'tamamlandi',ilerleme:100},
    {id:t+305,baslik:'Bahçe Düzenlemesi',aptId:apt2.id,aptAd:apt2.ad,kat:'Zemin',atanan:'Kemal Tunç',oncelik:'normal',bas:'2026-04-15',son:'2026-05-01',aciklama:'Bahçe yenileme ve çim ekimi',durum:'bekliyor',ilerleme:0},
    {id:t+306,baslik:'Güvenlik Kamerası Kurulumu',aptId:apt2.id,aptAd:apt2.ad,kat:'Tüm Katlar',atanan:'Güvenlik A.Ş.',oncelik:'yuksek',bas:'2026-03-15',son:'2026-03-25',aciklama:'8 adet HD kamera kurulumu',durum:'devam',ilerleme:60},
  ];

  const denetimler = [
    {id:t+401,aptId:apt1.id,aptAd:apt1.ad,tarih:'2026-01-15',denetci:'İbrahim Denet',temizlik:8,guvenlik:7,teknik:6,cevre:9,altyapi:7,puan:74,notlar:'Giriş holü temizliği iyi. Kalorifer tesisatında küçük sızıntı tespit edildi.',onlem:'Kalorifer tamiri acilen yaptırılacak.',sonraki:'2026-07-15'},
    {id:t+402,aptId:apt1.id,aptAd:apt1.ad,tarih:'2025-07-10',denetci:'İbrahim Denet',temizlik:7,guvenlik:8,teknik:7,cevre:8,altyapi:8,puan:76,notlar:'Genel durum iyi. Merdiven aydınlatması yetersiz.',onlem:'LED armatür değişimi planlandı.',sonraki:'2026-01-10'},
    {id:t+403,aptId:apt2.id,aptAd:apt2.ad,tarih:'2026-02-20',denetci:'Selma Kontrol',temizlik:9,guvenlik:9,teknik:8,cevre:9,altyapi:8,puan:86,notlar:'Mükemmel durum. Ortak alanlar çok temiz.',onlem:'Periyodik bakım takvimi güncellendi.',sonraki:'2026-08-20'},
    {id:t+404,aptId:apt2.id,aptAd:apt2.ad,tarih:'2025-09-05',denetci:'Selma Kontrol',temizlik:8,guvenlik:7,teknik:9,cevre:8,altyapi:9,puan:82,notlar:'Teknik altyapı çok iyi. Güvenlik kamerası eksik.',onlem:'Kamera kurulumu planlandı.'},
  ];

  const asansorler = [
    {id:t+501,aptId:apt1.id,aptAd:apt1.ad,blok:'A Blok',asansorNo:'ASN-001',firma:'Lift Teknik A.Ş.',etiketTarih:'2025-09-15',sonTarih:'2026-09-15',bolum:'Son bakımda kapı sensörü değiştirildi'},
    {id:t+502,aptId:apt2.id,aptAd:apt2.ad,blok:'B Blok',asansorNo:'ASN-002',firma:'Otis Servis',etiketTarih:'2026-02-01',sonTarih:'2026-04-15',bolum:'Yaklaşan muayene tarihine dikkat'},
    {id:t+503,aptId:apt2.id,aptAd:apt2.ad,blok:'B Blok',asansorNo:'ASN-003',firma:'Otis Servis',etiketTarih:'2025-12-10',sonTarih:'2026-03-05',bolum:'Muayene süresi yaklaşıyor'},
  ];

  const teklifler = [
    {id:t+601,aptId:apt1.id,aptAd:apt1.ad,tarih:'2026-02-10',konu:'Çatı Su Yalıtımı',firma:'İzoBuild İnş.',tutar:85000,kdv:20,kdvli:102000,gecerli:'2026-03-10',aciklama:'10 yıl garantili poliüretan kaplama',durum:'onaylandi'},
    {id:t+602,aptId:apt1.id,aptAd:apt1.ad,tarih:'2026-02-12',konu:'Çatı Su Yalıtımı',firma:'ÇatıPro Ltd.',tutar:92000,kdv:20,kdvli:110400,gecerli:'2026-03-12',aciklama:'8 yıl garantili bitümlü membran',durum:'reddedildi'},
    {id:t+603,aptId:apt1.id,aptAd:apt1.ad,tarih:'2026-03-01',konu:'Asansör Modernizasyonu',firma:'Lift Teknik A.Ş.',tutar:45000,kdv:20,kdvli:54000,gecerli:'2026-04-01',aciklama:'Frekans konvertörü ve yeni kapı sistemi',durum:'bekliyor'},
    {id:t+604,aptId:apt2.id,aptAd:apt2.ad,tarih:'2026-01-20',konu:'Güvenlik Kamerası',firma:'Güvenlik Sistemleri A.Ş.',tutar:38000,kdv:20,kdvli:45600,gecerli:'2026-02-20',aciklama:'8 adet 4MP kamera + NVR',durum:'onaylandi'},
    {id:t+605,aptId:apt2.id,aptAd:apt2.ad,tarih:'2026-03-05',konu:'Bahçe Düzenlemesi',firma:'Yeşil Peyzaj',tutar:22000,kdv:10,kdvli:24200,gecerli:'2026-04-05',aciklama:'Çim, fidan ve sulama sistemi',durum:'bekliyor'},
  ];

  const kararlar = [
    {id:t+701,aptId:apt1.id,aptAd:apt1.ad,tarih:'2026-01-10',no:'2026/001',tur:'olagan',katilim:18,oy:18,gundem:'Yönetici ibrası, bütçe onayı, aidat artışı',metin:`KARAR METNİ\n\nYıldız Sitesi A Blok Olağan Kat Malikleri Kurulu Toplantısı\nTarih: 10.01.2026 | Katılım: 18/24 kat maliki\n\n1. Yönetici Ahmet Yıldız oybirliğiyle ibra edildi.\n2. 2026 yılı işletme bütçesi ₺420.000 olarak onaylandı.\n3. Aylık aidat ₺1.200'e yükseltildi (oy çokluğu).`},
    {id:t+702,aptId:apt2.id,aptAd:apt2.ad,tarih:'2026-02-05',no:'2026/001',tur:'olagan',katilim:28,oy:28,gundem:'Güvenlik kamerası kurulumu, asansör bakım sözleşmesi',metin:`KARAR METNİ\n\nGüneş Residance Olağan Kat Malikleri Kurulu Toplantısı\nTarih: 05.02.2026 | Katılım: 28/36 kat maliki\n\n1. Güvenlik kamerası kurulumu için Güvenlik A.Ş. ile sözleşme yapılmasına oybirliğiyle karar verildi.\n2. Otis Servis ile 3 yıllık asansör bakım sözleşmesi imzalandı.\n3. Aylık aidat ₺1.800 olarak belirlendi.`},
  ];

  const icralar = [
    {id:t+801,aptId:apt1.id,aptAd:apt1.ad,borclu:'Hasan Şahin',daire:'12',avukat:'Av. Necip Doğru',avukatTel:'0532 800 11 22',dosyaNo:'2025/İCR-0892',icraDairesi:'Bağcılar 3. İcra Müdürlüğü',tutar:14400,faiz:720,sebepTur:'aidat_borc',sebep:'Aidat Borcu',aciklama:'12 aylık aidat birikimi',durum:'devam',tarih:'2025-12-15',notlar:'İcra takibi başlatıldı'},
    {id:t+802,aptId:apt2.id,aptAd:apt2.ad,borclu:'Ali Öztürk',daire:'5',avukat:'Av. Zehra Kılıç',avukatTel:'0533 900 22 33',dosyaNo:'2026/İCR-0115',icraDairesi:'Kadıköy 1. İcra Müdürlüğü',tutar:21600,faiz:1080,sebepTur:'aidat_borc',sebep:'Aidat Borcu',aciklama:'12 aylık aidat + gecikme zammı',durum:'devam',tarih:'2026-01-20',notlar:'Ödeme emri tebliğ edildi'},
  ];

  const finansIslemler = [
    {id:t+901,aptId:apt1.id,aptAd:apt1.ad,tarih:'2026-03-01',tur:'gelir',kat:'aidat',aciklama:'Mart 2026 aidat tahsilatı',tutar:21600,not:'18 daireden tahsilat'},
    {id:t+902,aptId:apt1.id,aptAd:apt1.ad,tarih:'2026-02-28',tur:'gider',kat:'bakim',aciklama:'Asansör aylık bakım',tutar:3500,not:'Lift Teknik fatura'},
    {id:t+903,aptId:apt1.id,aptAd:apt1.ad,tarih:'2026-02-25',tur:'gider',kat:'maas',aciklama:'Şubat maaş ödemeleri',tutar:21000,not:'Kapıcı + temizlik personeli'},
    {id:t+904,aptId:apt1.id,aptAd:apt1.ad,tarih:'2026-02-10',tur:'gider',kat:'elektrik',aciklama:'Ortak alan elektrik faturası',tutar:4200,not:'Şubat 2026 dönemi'},
    {id:t+905,aptId:apt2.id,aptAd:apt2.ad,tarih:'2026-03-01',tur:'gelir',kat:'aidat',aciklama:'Mart 2026 aidat tahsilatı',tutar:57600,not:'32 daireden tahsilat'},
    {id:t+906,aptId:apt2.id,aptAd:apt2.ad,tarih:'2026-02-28',tur:'gider',kat:'bakim',aciklama:'Asansör aylık bakım (2 asansör)',tutar:7000,not:'Otis Servis fatura'},
    {id:t+907,aptId:apt2.id,aptAd:apt2.ad,tarih:'2026-02-25',tur:'gider',kat:'maas',aciklama:'Şubat maaş ödemeleri',tutar:23000,not:'Kapıcı + temizlik personeli'},
    {id:t+908,aptId:apt2.id,aptAd:apt2.ad,tarih:'2026-02-15',tur:'gider',kat:'elektrik',aciklama:'Ortak alan elektrik faturası',tutar:7800,not:'Şubat 2026 dönemi'},
  ];

  const duyurular = [
    {id:t+1001,aptId:apt1.id,aptAd:apt1.ad,baslik:'Mart Ayı Aidat Ödemeleri',icerik:'Saygıdeğer Sakinlerimiz,\n\nMart 2026 dönemi aidat ödemelerinin en geç 10 Mart 2026 tarihine kadar yönetim hesabına yatırılması gerekmektedir. Gecikme halinde yasal faiz uygulanacaktır.\n\nYönetim Kurulu',tip:'aidat',tarih:'2026-03-01',bitis:'2026-03-31'},
    {id:t+1002,aptId:apt1.id,aptAd:apt1.ad,baslik:'Çatı Onarım Çalışmaları',icerik:'10-20 Mart tarihleri arasında çatı onarım çalışması yapılacaktır. Çalışma saatleri 09:00-17:00 arasındadır. Gürültüden kaynaklanan rahatsızlık için özür dileriz.',tip:'bakim',tarih:'2026-03-08',bitis:'2026-03-20'},
    {id:t+1003,aptId:apt2.id,aptAd:apt2.ad,baslik:'Güvenlik Kamerası Kurulumu',icerik:'15-20 Mart tarihleri arasında tüm katlara güvenlik kamerası kurulumu yapılacaktır. Teknisyenlerimizin kat koridorlarına erişmesi gerekebilecektir.',tip:'duyuru',tarih:'2026-03-12',bitis:'2026-03-25'},
    {id:t+1004,aptId:apt2.id,aptAd:apt2.ad,baslik:'Su Kesintisi Bildirimi',icerik:'25 Mart 2026 Çarşamba günü 10:00-15:00 saatleri arasında tesisat bakımı nedeniyle su kesintisi yaşanacaktır. Su ihtiyaçlarınızı önceden karşılamanızı öneririz.',tip:'bakim',tarih:'2026-03-20',bitis:'2026-03-26'},
  ];

  const arizalar = [
    {id:t+1101,aptId:apt1.id,aptAd:apt1.ad,baslik:'Zemin Kat Tuvalet Tıkanıklığı',aciklama:'Ortak tuvalet tıkanmış, pis koku var',kat:'Zemin',oncelik:'yuksek',durum:'acik',tarih:'2026-03-10',atanan:'Süleyman Temiz',no:'ARZ-1101'},
    {id:t+1102,aptId:apt1.id,aptAd:apt1.ad,baslik:'4. Kat Merdiven Lambası',aciklama:'Floresan lamba yanmış, karanlık',kat:'4',oncelik:'normal',durum:'acik',tarih:'2026-03-08',atanan:'Süleyman Temiz',no:'ARZ-1102'},
    {id:t+1103,aptId:apt1.id,aptAd:apt1.ad,baslik:'Kalorifer Pompa Arızası',aciklama:'Kalorifer ısınmıyor, pompa sesi geliyor',kat:'Bodrum',oncelik:'acil',durum:'kapandi',tarih:'2026-02-20',atanan:'Teknik Servis',kapanis:'2026-02-22',no:'ARZ-1103'},
    {id:t+1104,aptId:apt2.id,aptAd:apt2.ad,baslik:'B Blok Asansör Ses',aciklama:'Asansör hareket ederken gıcırdıyor',kat:'Tüm Katlar',oncelik:'yuksek',durum:'acik',tarih:'2026-03-12',atanan:'Murat Özkan',no:'ARZ-1104'},
    {id:t+1105,aptId:apt2.id,aptAd:apt2.ad,baslik:'Otopark Su Birikintisi',aciklama:'Yağmur sonrası otoparkta su birikti',kat:'-1',oncelik:'normal',durum:'acik',tarih:'2026-03-11',atanan:'Murat Özkan',no:'ARZ-1105'},
  ];

  const tahsilatlar = [
    {id:t+1201,aptId:apt1.id,aptAd:apt1.ad,sakinId:t+101,sakinAd:'Mehmet Kaya',daire:'3',tutar:1200,tarih:'2026-03-05',tip:'aidat',donem:'Mart 2026',yontem:'havale',not:''},
    {id:t+1202,aptId:apt1.id,aptAd:apt1.ad,sakinId:t+102,sakinAd:'Ayşe Çelik',daire:'7',tutar:1200,tarih:'2026-03-03',tip:'aidat',donem:'Mart 2026',yontem:'nakit',not:''},
    {id:t+1203,aptId:apt1.id,aptAd:apt1.ad,sakinId:t+104,sakinAd:'Zeynep Arslan',daire:'15',tutar:2400,tarih:'2026-03-07',tip:'gecmis_borc',donem:'Şubat-Mart 2026',yontem:'havale',not:'2 aylık birikmiş borç'},
    {id:t+1204,aptId:apt2.id,aptAd:apt2.ad,sakinId:t+106,sakinAd:'Fatma Yılmaz',daire:'18',tutar:1800,tarih:'2026-03-04',tip:'aidat',donem:'Mart 2026',yontem:'eft',not:''},
  ];

  const sigortalar = [
    {id:t+1301,aptId:apt1.id,aptAd:apt1.ad,tur:'dask',sirket:'Allianz Sigorta',no:'DASK-2025-001234',bas:'2025-09-01',bit:'2026-09-01',prim:2800,acenta:'ABC Acentalık',acentaTel:'0212 111 22 33',not:'DASK + Konut paketi'},
    {id:t+1302,aptId:apt1.id,aptAd:apt1.ad,tur:'yangin',sirket:'Mapfre Sigorta',no:'YNG-2025-005678',bas:'2025-10-15',bit:'2026-04-15',prim:1500,acenta:'DEF Sigorta',acentaTel:'0212 333 44 55',not:'30 gün içinde yenileme gerekli'},
    {id:t+1303,aptId:apt2.id,aptAd:apt2.ad,tur:'dask',sirket:'Axa Sigorta',no:'DASK-2025-009876',bas:'2025-11-01',bit:'2026-11-01',prim:4200,acenta:'GHI Acentalık',acentaTel:'0216 555 66 77',not:'Poliçe yenilenmiş'},
    {id:t+1304,aptId:apt2.id,aptAd:apt2.ad,tur:'asansor',sirket:'Generali Sigorta',no:'ASN-2025-003456',bas:'2025-08-20',bit:'2026-08-20',prim:3600,acenta:'GHI Acentalık',acentaTel:'0216 555 66 77',not:'2 asansör için birleşik poliçe'},
  ];

  const toplantılar = [
    {id:t+1401,aptId:apt1.id,aptAd:apt1.ad,tur:'olagan',tarih:'2026-01-10',saat:'19:00',yer:'Apartman Toplantı Salonu',gundem:'Yönetici ibrası\nYıllık bütçe onayı\nAidat artışı görüşmesi',katilim:18,durum:'tamamlandi',notlar:'Tüm maddeler oybirliğiyle kabul edildi.'},
    {id:t+1402,aptId:apt1.id,aptAd:apt1.ad,tur:'yonetim',tarih:'2026-03-20',saat:'20:00',yer:'Yönetim Ofisi',gundem:'Çatı onarımı sözleşmesi imzalama\nAsansör teklif değerlendirmesi',katilim:3,durum:'planli',notlar:''},
    {id:t+1403,aptId:apt2.id,aptAd:apt2.ad,tur:'olagan',tarih:'2026-02-05',saat:'19:30',yer:'Site Toplantı Odası',gundem:'Güvenlik kamerası kurulum kararı\nAsansör bakım sözleşmesi\nAidat belirleme',katilim:28,durum:'tamamlandi',notlar:'Güvenlik A.Ş. ile sözleşme imzalandı.'},
    {id:t+1404,aptId:apt2.id,aptAd:apt2.ad,tur:'olaganustu',tarih:'2026-04-10',saat:'19:00',yer:'Site Toplantı Odası',gundem:'Acil kazan dairesi onarımı\nMasraf paylaşımı',katilim:0,durum:'planli',notlar:''},
  ];

  const faturalar = [
    {id:t+1501,aptId:apt1.id,aptAd:apt1.ad,tur:'elektrik',firma:'İstanbul Elektrik',donem:'Mart 2026',tarih:'2026-03-10',son:'2026-03-25',tutar:4200,durum:'bekliyor',no:'ELEC-2026-0310',not:'Ortak alan elektriği'},
    {id:t+1502,aptId:apt1.id,aptAd:apt1.ad,tur:'dogalgaz',firma:'İGDAŞ',donem:'Şubat 2026',tarih:'2026-03-02',son:'2026-03-17',tutar:8900,durum:'odendi',no:'IGDAS-2026-0302',not:'Kalorifer doğalgazı'},
    {id:t+1503,aptId:apt1.id,aptAd:apt1.ad,tur:'su',firma:'İSKİ',donem:'Şubat 2026',tarih:'2026-03-05',son:'2026-03-20',tutar:1850,durum:'odendi',no:'ISKI-2026-0305',not:'Ortak su'},
    {id:t+1504,aptId:apt1.id,aptAd:apt1.ad,tur:'asansor',firma:'Lift Teknik A.Ş.',donem:'Mart 2026',tarih:'2026-03-01',son:'2026-03-15',tutar:3500,durum:'bekliyor',no:'LIFT-2026-0301',not:'Aylık bakım sözleşmesi'},
    {id:t+1505,aptId:apt2.id,aptAd:apt2.ad,tur:'elektrik',firma:'İstanbul Elektrik',donem:'Mart 2026',tarih:'2026-03-10',son:'2026-03-25',tutar:7800,durum:'bekliyor',no:'ELEC-2026-0311',not:'Ortak alan + aydınlatma'},
    {id:t+1506,aptId:apt2.id,aptAd:apt2.ad,tur:'dogalgaz',firma:'İGDAŞ',donem:'Şubat 2026',tarih:'2026-03-02',son:'2026-03-17',tutar:14200,durum:'odendi',no:'IGDAS-2026-0303',not:'Merkezi ısıtma sistemi'},
    {id:t+1507,aptId:apt2.id,aptAd:apt2.ad,tur:'guvenlik',firma:'Güvenlik Sistemleri A.Ş.',donem:'Mart 2026',tarih:'2026-03-01',son:'2026-03-15',tutar:5500,durum:'bekliyor',no:'GVN-2026-0301',not:'Kamera sistemi bakımı'},
    {id:t+1508,aptId:apt2.id,aptAd:apt2.ad,tur:'internet',firma:'Turkcell Superonline',donem:'Mart 2026',tarih:'2026-03-05',son:'2026-03-20',tutar:850,durum:'gecikti',no:'TCSO-2026-0305',not:'Site internet altyapısı'},
  ];

  const isletmeProjeler = [
    {id:t+1601,aptId:apt1.id,aptAd:apt1.ad,donem:'Mart 2026',dag:'esit',toplam:21000,giderler:[{kalem:'Personel Maaşları',tutar:21000}],dagitim:[],tarih:today()},
    {id:t+1602,aptId:apt2.id,aptAd:apt2.ad,donem:'Mart 2026',dag:'esit',toplam:36100,giderler:[{kalem:'Personel Maaşları',tutar:22500},{kalem:'Asansör Bakımı',tutar:7000},{kalem:'Güvenlik Hizm.',tutar:5500},{kalem:'İnternet',tutar:1100}],dagitim:[],tarih:today()},
  ];

  // State'e yükle
  S.apartmanlar = [apt1, apt2];
  S.sakinler = sakinler;
  S.personel = personel;
  S.gorevler = gorevler;
  S.denetimler = denetimler;
  S.asansorler = asansorler;
  S.teklifler = teklifler;
  S.kararlar = kararlar;
  S.icralar = icralar;
  S.finansIslemler = finansIslemler;
  S.duyurular = duyurular;
  S.arizalar = arizalar;
  S.tahsilatlar = tahsilatlar;
  S.sigortalar = sigortalar;
  S.toplantılar = toplantılar;
  S.faturalar = faturalar;
  S.isletmeProjeler = isletmeProjeler;
  if (!S.ayarlar || !S.ayarlar.firma) {
    S.ayarlar = { firma:'Metropol Site Yönetim A.Ş.', yonetici:'Recep Tuncer', unvan:'Genel Müdür', tel:'0212 500 60 70', mail:'info@metropolsite.com', adres:'Bağcılar Cad. No:12, İstanbul' };
  }

  save();
  syncDropdowns();
  selectedAptId = apt1.id;
  refreshUI();
  goPage('dashboard');
  toast('✅ Demo veriler başarıyla yüklendi! Tüm modüller hazır.', 'ok');
}

// ── APARTMAN DETAY SAYFASI ──────────────────
function goAptDetay(aptId) {
  const a = S.apartmanlar.find(x => x.id === +aptId);
  if (!a) { toast('Apartman bulunamadı.', 'err'); return; }
  if (!window._navRestoring) _navPush('apt-detay', +aptId);
  window._navRestoring = true;
  goPage('apt-detay');
  window._navRestoring = false;
  renderAptDetay(a);
}

function renderAptDetay(a) {
  const sakinler = S.sakinler.filter(s => s.aptId == a.id);
  const arizalar = S.arizalar.filter(ar => ar.aptId == a.id);
  const gorevler = S.gorevler.filter(g => g.aptId == a.id);
  const tahsilatlar = (S.tahsilatlar || []).filter(t => t.aptId == a.id);
  const toplamBorc = sakinler.reduce(function(s, sk) { return s + (sk.borc || 0); }, 0);
  const toplamTahsilat = tahsilatlar.reduce(function(s, t) { return s + (t.tutar || 0); }, 0);
  const acikAriza = arizalar.filter(function(ar) { return ar.durum === 'acik'; }).length;
  const acikGorev = gorevler.filter(function(g) { return g.durum !== 'tamamlandi'; }).length;

  var html = '';
  // Hero
  html += '<div class="apt-hero">' +
    '<div class="apt-hero-ico"><svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 11h1m5 0h-1M9 15h1m5 0h-1"/></svg></div>' +
    '<div class="apt-hero-info"><h1>' + a.ad + '</h1><p>' + (a.adres || '') + (a.ilce ? ', ' + a.ilce : '') + (a.il ? ', ' + a.il : '') + '</p>' +
    '<div class="apt-hero-stats">' +
    '<div class="apt-hero-stat"><div class="ahs-val">' + (a.daireSayisi || 0) + '</div><div class="ahs-lbl">Daire</div></div>' +
    '<div class="apt-hero-stat"><div class="ahs-val">' + sakinler.length + '</div><div class="ahs-lbl">Sakin</div></div>' +
    '<div class="apt-hero-stat"><div class="ahs-val">' + acikAriza + '</div><div class="ahs-lbl">Açık Arıza</div></div>' +
    '<div class="apt-hero-stat"><div class="ahs-val">' + acikGorev + '</div><div class="ahs-lbl">Açık Görev</div></div>' +
    '</div></div></div>';

  // Info Grid
  html += '<div class="daire-info-grid">' +
    '<div class="daire-info-item"><div class="dii-lbl">Yönetici</div><div class="dii-val">' + (a.yon || '—') + '</div></div>' +
    '<div class="daire-info-item"><div class="dii-lbl">Yönetici Tel</div><div class="dii-val">' + (a.yonTel || '—') + '</div></div>' +
    '<div class="daire-info-item"><div class="dii-lbl">Aylık Aidat</div><div class="dii-val" style="color:var(--ok)">' + (a.aidat ? '₺' + fmt(a.aidat) : '—') + '</div></div>' +
    '<div class="daire-info-item"><div class="dii-lbl">Hizmet Bedeli</div><div class="dii-val" style="color:var(--brand)">' + (a.hizmetBedeli ? '₺' + fmt(a.hizmetBedeli) : '—') + '</div></div>' +
    '<div class="daire-info-item"><div class="dii-lbl">Kat Sayısı</div><div class="dii-val">' + (a.katSayisi || '—') + '</div></div>' +
    '<div class="daire-info-item"><div class="dii-lbl">İnşaat Yılı</div><div class="dii-val">' + (a.insaatYili || '—') + '</div></div>' +
    '<div class="daire-info-item"><div class="dii-lbl">Asansör</div><div class="dii-val">' + (a.asansor === 'evet' ? 'Var' : 'Yok') + '</div></div>' +
    '<div class="daire-info-item"><div class="dii-lbl">IBAN</div><div class="dii-val" style="font-size:11px;font-family:monospace">' + (a.iban || '—') + '</div></div>' +
    '</div>';

  // Borç/Tahsilat Özet
  html += '<div class="borc-ozet">' +
    '<div class="borc-ozet-card"><div class="bol">Toplam Sakin</div><div class="bov" style="color:var(--brand)">' + sakinler.length + '</div></div>' +
    '<div class="borc-ozet-card"><div class="bol">Toplam Borç</div><div class="bov" style="color:' + (toplamBorc > 0 ? 'var(--err)' : 'var(--ok)') + '">₺' + fmt(toplamBorc) + '</div></div>' +
    '<div class="borc-ozet-card"><div class="bol">Toplam Tahsilat</div><div class="bov" style="color:var(--ok)">₺' + fmt(toplamTahsilat) + '</div></div>' +
    '<div class="borc-ozet-card"><div class="bol">Açık Arıza</div><div class="bov" style="color:' + (acikAriza > 0 ? 'var(--err)' : 'var(--ok)') + '">' + acikAriza + '</div></div>' +
    '</div>';

  // Bloklar
  if (a.bloklar && a.bloklar.length > 0) {
    html += '<div class="apt-section"><div class="apt-section-title"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> Blok Yapısı</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">' +
      a.bloklar.map(function(b) {
        return '<div class="card" style="padding:14px 16px;text-align:center"><div style="font-size:14px;font-weight:700">' + b.ad + '</div><div style="font-size:12px;color:var(--tx-3);margin-top:4px">' + (b.asansorSayisi || 0) + ' asansör</div></div>';
      }).join('') + '</div></div>';
  }

  // Sakinler
  html += '<div class="apt-section"><div class="apt-section-title"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> Sakinler (' + sakinler.length + ')</div>';
  if (sakinler.length) {
    html += '<div class="apt-resident-grid">';
    sakinler.sort(function(a, b) { return (parseInt(a.daire) || 0) - (parseInt(b.daire) || 0); }).forEach(function(sk) {
      var init = (sk.ad || ' ').split(' ').map(function(w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase();
      var borc = sk.borc || 0;
      html += '<div class="apt-resident-mini" onclick="goDaireDetay(' + sk.id + ')">' +
        '<div class="apt-res-av ' + sk.tip + '">' + init + '</div>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:600;font-size:13px">' + sk.ad + '</div>' +
        '<div style="font-size:11px;color:var(--tx-3)">D.' + (sk.daire || '?') + ' · ' + (sk.tip === 'malik' ? 'Malik' : 'Kiracı') + '</div>' +
        '</div>' +
        (borc > 0 ? '<div style="font-size:12px;font-weight:700;color:var(--err)">₺' + fmt(borc) + '</div>' : '<div style="font-size:11px;color:var(--ok)">✓</div>') +
        '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:20px;color:var(--tx-3)">Sakin kaydı bulunmuyor.</div>';
  }
  html += '</div>';

  // İşlem Butonları
  html += '<div class="fc g8" style="flex-wrap:wrap">' +
    '<button class="btn bp" onclick="openAptModal(' + a.id + ')">Düzenle</button>' +
    '<button class="btn bg" onclick="goAptSpecific(' + a.id + ',\'sakinler\')">Sakinler</button>' +
    '<button class="btn bg" onclick="goAptSpecific(' + a.id + ',\'tahsilat\')">Tahsilat</button>' +
    '<button class="btn bg" onclick="goAptSpecific(' + a.id + ',\'ariza\')">Arızalar</button>' +
    '<button class="btn bg" onclick="goAptSpecific(' + a.id + ',\'raporlar\')">Raporlar</button>' +
    '<button class="btn bg" onclick="goPage(\'apartmanlar\')">Geri Dön</button>' +
    '</div>';

  document.getElementById('apt-detay-content').innerHTML = html;
}

// ── DAİRE DETAY SAYFASI ──────────────────────
function goDaireDetay(sakId) {
  const sk = S.sakinler.find(s => s.id == sakId || +s.id === +sakId);
  if (!sk) { toast('Sakin bulunamadı.', 'err'); return; }
  if (!window._navRestoring) _navPush('daire-detay', +sakId);
  window._navRestoring = true;
  goPage('daire-detay');
  window._navRestoring = false;
  renderDaireDetay(sk, new Date().getFullYear());
}

function renderDaireDetay(sk, yil) {
  if (!yil) yil = new Date().getFullYear();
  const apt = S.apartmanlar.find(a => a.id == sk.aptId);
  const aptAd = apt ? apt.ad : '—';

  // Tüm bu dairedeki kişiler (aynı aptId + daire)
  const todayStr = new Date().toISOString().slice(0,10);
  const tumDaireKisi = (S.sakinler||[]).filter(s => s.aptId == sk.aptId && s.daire == sk.daire);
  const aktifKisi = tumDaireKisi.filter(s => isSakinAktif(s));
  const eskiKisi  = tumDaireKisi.filter(s => !isSakinAktif(s));
  const malik  = aktifKisi.find(s => s.tip === 'malik') || tumDaireKisi.find(s => s.tip === 'malik');
  const kiraci = aktifKisi.find(s => s.tip === 'kiralik');
  const mainSk = malik || sk;

  // Borç = tüm daire kişilerinin borcu toplamı
  const topBorc = tumDaireKisi.reduce((sum, s) => sum + (s.borc||0), 0);
  const aidat = mainSk.aidat || mainSk.aidatK || (apt ? apt.aidat : 0) || 0;

  // Blok / Daire kodu (blok nesneyse .ad'ını al)
  const blokStr = mainSk.blok && typeof mainSk.blok === 'object' ? (mainSk.blok.ad||'') : String(mainSk.blok||'');
  const blokHarf = blokStr.replace(/\s*blok\s*/i,'').trim();
  const daireKod = blokHarf ? `${blokHarf} / ${mainSk.daire||'?'}` : (mainSk.daire||'?');

  // Kullanım durumu
  const kullDurum = kiraci ? 'Kiracılı' : (aktifKisi.length > 0 ? 'Dolu' : 'Boş');
  const kullCls   = kiraci ? 'b-am'     : (aktifKisi.length > 0 ? 'b-gr' : 'b-rd');

  // Toplam tahsilat (borç banner için)
  const tumOdemeler = (S.tahsilatlar||[]).filter(t => t.sakId==mainSk.id||t.sakinId==mainSk.id);
  const toplamOdeme = tumOdemeler.reduce((s,t)=>s+(t.tutar||0),0);

  // Kişi satırı oluşturucu (aktif ve eski için ortak)
  const makeKisiRow = (kisi, isEski) => {
    const tipLbl = kisi.tip==='malik' ? 'Kat Maliki' : 'Kiracı';
    const tipCls = isEski ? 'eski' : (kisi.tip==='malik' ? 'malik' : 'kiralik');
    const borcVal = kisi.borc||0;
    const borcTxt = borcVal>0 ? `<span style="color:var(--err);font-weight:700">₺${fmt(borcVal)} (B)</span>` : `<span style="color:var(--ok)">₺0</span>`;
    const cikisCell = isEski
      ? `<span style="color:var(--tx-3);font-size:11px">${kisi.cikis||'—'}</span>`
      : `<button class="btn brd xs" onclick="daireKisiCikis(${kisi.id})">Çıkart</button>`;
    return `<tr style="${isEski?'opacity:.6':''}">
      <td><span class="bb-kisi-durum ${tipCls}">${tipLbl}${isEski?' <em style="font-weight:400;font-size:10px">(Eski)</em>':''}</span></td>
      <td style="font-weight:600;cursor:pointer;color:var(--brand)" onclick="goSakinCari(${kisi.id},true)">${kisi.ad} →</td>
      <td style="font-size:12px">${kisi.tel||'—'}</td>
      <td style="font-size:12px;color:var(--tx-3)">${kisi.giris||'—'}</td>
      <td>${cikisCell}</td>
      <td>${borcTxt}</td>
      <td style="display:flex;gap:4px">
        <button class="btn bg xs" onclick="goSakinCari(${kisi.id},true)" title="Cari Hesap" style="background:#eff6ff;color:#2563eb;border-color:#bfdbfe">
          <svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2"><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">&#8378;</text></svg>
        </button>
        ${!isEski ? `<button class="btn bg xs" onclick="editSakin(${kisi.id});goPage('sakinler');goTab('sak-tekil')" title="Düzenle"><svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>` : ''}
        ${isEski ? `<button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delSakin(${kisi.id})" title="Kaydı Sil"><svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>` : ''}
      </td>
    </tr>`;
  };
  const aktifKisiRows = aktifKisi.map(k=>makeKisiRow(k,false)).join('');
  const tumKisiRows   = [...aktifKisi,...eskiKisi].map(k=>makeKisiRow(k,!isSakinAktif(k))).join('');
  const THEAD = `<thead><tr><th>Durumu</th><th>Adı Soyadı</th><th>Telefon</th><th>Giriş Tarihi</th><th>Çıkış / İşlem</th><th>Bakiye</th><th>İşlemler</th></tr></thead>`;

  const el = document.getElementById('daire-detay-content');
  el.innerHTML = `<div class="dd-page">

  <!-- ── SOL PANEL ── -->
  <div class="dd-side">

    <div class="dd-profile-card">
      <svg class="dpc-bg-svg" viewBox="0 0 220 180" fill="none">
        <circle cx="185" cy="-15" r="100" fill="rgba(255,255,255,.07)"/>
        <circle cx="210" cy="155" r="80" fill="rgba(255,255,255,.04)"/>
      </svg>
      <div class="dpc-top">
        <div class="dd-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="1.8" width="26" height="26">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <div class="dpc-meta">
          <div class="dpc-no">Daire ${daireKod}</div>
          <div class="dpc-apt">${aptAd}</div>
        </div>
      </div>
      <div class="dpc-badges">
        <span class="dpc-badge ${kullCls==='b-rd'?'dpc-bos':kullCls==='b-am'?'dpc-kiraci':'dpc-dolu'}">${kullDurum}</span>
        ${mainSk.dairetipi||mainSk.tur?`<span class="dpc-badge dpc-tip">${mainSk.dairetipi||mainSk.tur}</span>`:''}
      </div>
      <div class="dpc-rows">
        ${blokStr?`<div class="dpc-row"><span>Blok</span><span>${blokStr}</span></div>`:''}
        ${mainSk.kat?`<div class="dpc-row"><span>Kat</span><span>${mainSk.kat}</span></div>`:''}
        <div class="dpc-row"><span>Aidat</span><span class="dpc-row-val">₺${fmt(aidat)}</span></div>
      </div>
    </div>

    <div class="dd-fin-card">
      <div class="dfc-item">
        <span class="dfc-lbl">Toplam Borç</span>
        <span class="dfc-val dfc-borc-val">₺${fmt(topBorc)}</span>
      </div>
      <div class="dfc-sep"></div>
      <div class="dfc-item">
        <span class="dfc-lbl">Toplam Tahsilat</span>
        <span class="dfc-val dfc-tahsil-val">₺${fmt(toplamOdeme)}</span>
      </div>
      <div class="dfc-sep"></div>
      <div class="dfc-item">
        <span class="dfc-lbl">Net Bakiye</span>
        <span class="dfc-val ${(topBorc-toplamOdeme)>0.01?'dfc-borclu':'dfc-alacakli'}">₺${fmt(Math.abs(topBorc-toplamOdeme))}</span>
      </div>
    </div>

    <div class="dd-side-btns">
      <button class="dsb-btn dsb-borc" onclick="openAidatBorcDaire(${mainSk.id})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Borçlandır
      </button>
      <button class="dsb-btn dsb-tahsil" onclick="openHizliOdeme(${mainSk.id},'')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M2 11h20"/><circle cx="6" cy="16" r="1.5"/></svg>
        Tahsil Et
      </button>
      <button class="dsb-btn dsb-edit" onclick="editSakin(${mainSk.id});goPage('sakinler');goTab('sak-tekil')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Düzenle
      </button>
      ${aktifKisi.map(kisi=>`
      <button class="dsb-btn dsb-cari" onclick="goSakinCari(${kisi.id},true)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        ${kisi.ad.split(' ')[0]} Finansal Durum
      </button>`).join('')}
    </div>

  </div>

  <!-- ── SAĞ ANA PANEL ── -->
  <div class="dd-main">

    <div class="dd-section">
      <div class="dds-head">
        <div class="dds-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Kişiler
          <span class="dds-count">${tumDaireKisi.length}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="dk-tabs">
            <button class="dk-tab on" id="dkt-guncel" onclick="daireKisiTab('guncel')">Güncel <span class="dk-badge ok">${aktifKisi.length}</span></button>
            <button class="dk-tab" id="dkt-hepsi" onclick="daireKisiTab('hepsi')">Hepsi <span class="dk-badge all">${tumDaireKisi.length}</span></button>
          </div>
          <button class="btn bp xs" onclick="addSakinToDaire('${mainSk.daire}',${mainSk.aptId})">
            <svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Kişi Ekle
          </button>
        </div>
      </div>
      <div id="dk-guncel-pane">
        <div class="tw"><table class="bb-kisi-table">${THEAD}<tbody>${aktifKisiRows||`<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx-3)">Bu dairede aktif kayıt bulunmuyor.</td></tr>`}</tbody></table></div>
      </div>
      <div id="dk-hepsi-pane" style="display:none">
        <div class="tw"><table class="bb-kisi-table">${THEAD}<tbody>${tumKisiRows||`<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx-3)">Kayıt bulunmuyor.</td></tr>`}</tbody></table></div>
      </div>
    </div>

    <div class="dd-section">
      <div class="dds-head">
        <div class="dds-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          Daire Bilgileri
        </div>
      </div>
      <div class="dd-info-grid">
        <div class="ddi-item"><div class="ddi-lbl">Kullanım Durumu</div><div class="ddi-val"><span class="b ${kullCls}">${kullDurum}</span></div></div>
        <div class="ddi-item"><div class="ddi-lbl">Daire Tipi</div><div class="ddi-val">${mainSk.dairetipi||mainSk.tur||'—'}</div></div>
        <div class="ddi-item"><div class="ddi-lbl">Bulunduğu Kat</div><div class="ddi-val">${mainSk.kat||'—'}</div></div>
        <div class="ddi-item"><div class="ddi-lbl">Blok</div><div class="ddi-val">${blokStr||'—'}</div></div>
        <div class="ddi-item"><div class="ddi-lbl">Grubu</div><div class="ddi-val">${mainSk.grup||'—'}</div></div>
        <div class="ddi-item"><div class="ddi-lbl">Aidat Tutarı</div><div class="ddi-val" style="color:var(--brand);font-weight:800">₺${fmt(aidat)}</div></div>
        <div class="ddi-item"><div class="ddi-lbl">Brüt m²</div><div class="ddi-val">${mainSk.brut||'—'}</div></div>
        <div class="ddi-item"><div class="ddi-lbl">Net m²</div><div class="ddi-val">${mainSk.net||'—'}</div></div>
        <div class="ddi-item"><div class="ddi-lbl">Arsa Payı</div><div class="ddi-val">${mainSk.arsa||'—'}</div></div>
      </div>
    </div>

    <div class="dd-section">
      <div class="dds-head">
        <div class="dds-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Notlar & Ekler
        </div>
        <div class="bb-right-tabs" style="border-bottom:none">
          <div class="bb-right-tab on" onclick="bbTab(this,'bb-np')">
            <svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Notlar
          </div>
          <div class="bb-right-tab" onclick="bbTab(this,'bb-ep')">
            <svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            Ekler
          </div>
        </div>
      </div>
      <div id="bb-np" style="padding:14px 16px">
        ${(mainSk.not||'').trim()?`<div class="bb-not-item"><div class="not-metin">${mainSk.not}</div></div>`:`<div class="bb-not-empty"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p style="font-size:12px;margin-top:6px">Gösterilecek not bulunmamaktadır.</p></div>`}
        <div style="margin-top:12px">
          <textarea class="dd-note-area" id="dd-note-input" placeholder="Not ekle…">${mainSk.not||''}</textarea>
          <button class="btn bp sm mt8" onclick="saveDaireNot(${mainSk.id})" style="width:100%">+ Yeni Not Kaydet</button>
        </div>
      </div>
      <div id="bb-ep" style="display:none;padding:14px 16px">
        <div class="bb-not-empty">
          <svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          <p style="font-size:12px;margin-top:6px">Ek bulunmamaktadır.</p>
        </div>
      </div>
    </div>

  </div>
</div>`;

}

function ddShowTab(el, paneId) {
  const bar = el.closest('.dd-tabs-bar');
  bar.querySelectorAll('.dd-tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  document.querySelectorAll('.dd-pane').forEach(p => p.classList.remove('on'));
  const pane = document.getElementById(paneId);
  if (pane) pane.classList.add('on');
}

// Sağ panel (Notlar/Ekler) sekme değiştirici
function daireKisiTab(which) {
  ['guncel','hepsi'].forEach(t => {
    const btn = document.getElementById('dkt-'+t);
    const pane = document.getElementById('dk-'+t+'-pane');
    if (btn) btn.classList.toggle('on', t===which);
    if (pane) pane.style.display = t===which ? '' : 'none';
  });
}

function addSakinToDaire(daireNo, aptId) {
  sakEditId = null;
  if (aptId && selectedAptId != aptId) selectedAptId = +aptId;
  goPage('sakinler');
  goTab('sak-tekil');
  setTimeout(() => {
    const daireEl = document.getElementById('sak-daire');
    if (daireEl) daireEl.value = daireNo;
    setSakinTip('malik');
  }, 250);
}

function bbTab(el, paneId) {
  el.closest('.bb-right-tabs').querySelectorAll('.bb-right-tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  ['bb-np','bb-ep'].forEach(id => {
    const p = document.getElementById(id);
    if (p) p.style.display = (id === paneId) ? '' : 'none';
  });
}

// Kişi çıkış tarihi kaydet
function daireKisiCikis(sakId) {
  const kisi = S.sakinler.find(s => s.id == sakId);
  if (!kisi) return;
  if (kisi.tip === 'malik') {
    const baskaAktifMalik = S.sakinler.find(s => s.id != sakId && s.aptId==kisi.aptId && s.daire==kisi.daire && s.tip==='malik' && isSakinAktif(s));
    if (!baskaAktifMalik) {
      toast('Daire ev sahibisiz kalamaz. "Kişi Ekle" ile yeni ev sahibini ekleyin — eski sahip otomatik pasife alınır.', 'err');
      return;
    }
  }
  const tipLbl = kisi.tip === 'malik' ? 'Ev Sahibi Çıkışı' : 'Kiracı Çıkışı';
  document.getElementById('cikis-modal-baslik').textContent = tipLbl;
  document.getElementById('cikis-sak-id').value = sakId;
  document.getElementById('cikis-mod').value = 'daire';
  document.getElementById('cikis-tarih').value = new Date().toISOString().slice(0,10);
  document.getElementById('cikis-modal-bilgi').innerHTML = `
    <strong>${kisi.ad}</strong> · Daire ${kisi.daire||'?'}<br>
    ${kisi.tip==='malik'?'Ev sahibi değişimi: eski sahibin çıkış tarihi kayıt altına alınır.':'Kiracı çıkışı: çıkış tarihi kayıt altına alınır. Yerine kiracı eklenmezse ev sahibi aktif görünür.'}`;
  openModal('mod-cikis-tarih');
}

function saveCikisTarih() {
  const sakId = document.getElementById('cikis-sak-id').value;
  const tarih = document.getElementById('cikis-tarih').value;
  const mod = document.getElementById('cikis-mod').value;
  if (!tarih) { toast('Çıkış tarihi seçin.', 'err'); return; }
  const kisi = S.sakinler.find(s => s.id == sakId);
  if (!kisi) return;
  kisi.cikis = tarih; kisi.durum = 'pasif';
  save();
  closeModal('mod-cikis-tarih');
  toast(`${kisi.ad} çıkışı ${tarih} olarak kaydedildi.`, 'ok');
  if (mod === 'daire') {
    // Dairenin yeni aktif malikini bul ve detayı yenile
    const yeniMain = S.sakinler.find(s => s.aptId==kisi.aptId && s.daire==kisi.daire && s.tip==='malik' && isSakinAktif(s))
      || S.sakinler.find(s => s.aptId==kisi.aptId && s.daire==kisi.daire && isSakinAktif(s))
      || kisi;
    const yr = document.querySelector('.dd-year-sel');
    renderDaireDetay(yeniMain, yr ? +yr.value : new Date().getFullYear());
  } else {
    renderSakinler();
  }
}

function goDaireAidatGecmis(sakId, yil) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (sk) renderDaireDetay(sk, yil);
}

// ===================================================
// KİŞİ CARİ SAYFA
// ===================================================
let _currentCariId = null;
function refreshCariIfOpen() {
  if (!_currentCariId) return;
  const pg = document.getElementById('page-sakin-cari');
  if (!pg || !pg.classList.contains('on')) return;
  const sk = S.sakinler.find(s => s.id === _currentCariId);
  if (sk && typeof renderSakinCari === 'function') renderSakinCari(sk);
}
window._cariFromDaire = false;

function goSakinCari(sakId, fromDaire) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk) { toast('Sakin bulunamadı.', 'err'); return; }
  _currentCariId = +sakId;
  window._cariFromDaire = !!fromDaire;
  if (!window._navRestoring) _navPush('sakin-cari', +sakId);
  window._navRestoring = true;
  goPage('sakin-cari');
  window._navRestoring = false;
  renderSakinCari(sk);
}

function renderSakinCari(sk, opts) {
  opts = opts || {};
  const apt = S.apartmanlar.find(a => a.id == sk.aptId);
  const aptAd = apt ? apt.ad : '—';
  const initials = (sk.ad || ' ').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  const tipSuffix = sk.tip === 'kiralik' ? ' (K)' : ' (M)';
  const blokPre = (sk.blok || '').replace(/\s*blok\s*/i, '').trim();
  const daireLabel = (blokPre ? blokPre + ' -' : '') + (sk.daire || '?') + tipSuffix;
  const thisYear = new Date().getFullYear();
  const startDate = opts.startDate || `${thisYear}-01-01`;
  const endDate = opts.endDate || `${thisYear}-12-31`;
  const sadecGeciken = opts.sadecGeciken || false;
  const tumKirilim = opts.tumKirilim || false;

  // ── AİDAT borçlandırmalar ──
  const aidatIslemler = [];
  (S.aidatBorclandir || []).forEach(kayit => {
    if (!kayit.detaylar) return;
    kayit.detaylar.forEach(d => {
      if (d.sakId == sk.id) {
        aidatIslemler.push({
          evrakTarih: d.tarih || kayit.tarih || '',
          sonOdeme: d.sonOdeme || kayit.sonOdeme || kayit.tarih || '',
          aciklama: d.aciklama || kayit.aciklama || `${kayit.donem || ''} Dönemi Aidat Borçlandırması / Borç mak.`,
          borcTutar: d.tutar || 0,
          alacakTutar: 0,
          tazminat: 0,
          kategori: d.kategori || 'Aidat',
          _srcType: 'borclandir',
          _srcId: d.id || kayit.id,
          _detayId: d.id,
          _sakId: sk.id
        });
      }
    });
  });

  // ── Ödemeler (alacak) ──
  const odemeler = (S.tahsilatlar || []).filter(t => t.sakId == sk.id || t.sakinId == sk.id);
  // tip veya kategori alanını kategori olarak kullan; yoksa 'Tahsilat'
  const tipToLabel = { aidat: 'Aidat', kira: 'Kira', diger: 'Diğer', genel: 'Genel Gider' };
  const genelIslemler = odemeler.map(o => ({
    evrakTarih: o.tarih || '',
    sonOdeme: '',
    aciklama: o.not || o.aciklama || `(BE) Gönderen: ${sk.ad} Sorgu...`,
    borcTutar: 0,
    alacakTutar: o.tutar || 0,
    tazminat: 0,
    kategori: o.kategori || tipToLabel[o.tip] || 'Tahsilat',
    _srcType: 'tahsilat',
    _srcId: o.id,
    _sakId: sk.id
  }));

  // ── Doğrudan borç kaydı (devir) ──
  const topAidatBorc = aidatIslemler.reduce((s, x) => s + x.borcTutar, 0);
  const topOdeme = odemeler.reduce((s, o) => s + (o.tutar || 0), 0);
  const skBorc = sk.borc || 0;
  // Devir: yalnızca sk.borc > 0 ve kayıtlar net borç gösteriyorsa hesapla.
  // topOdeme > topAidatBorc ise (net kredi) devir = 0; tahsilat veya borç ekleme deviri etkilemesin.
  const recordsNetDebt = topAidatBorc - topOdeme;
  const devirBorc = (skBorc > 0.01 && recordsNetDebt >= 0) ? Math.max(0, skBorc - recordsNetDebt) : 0;
  if (devirBorc > 0.01) {
    genelIslemler.unshift({
      evrakTarih: sk.giris || '',
      sonOdeme: '',
      aciklama: `Devir / Daire: ${daireLabel.replace(tipSuffix,'')} / Evr.No: 1`,
      borcTutar: devirBorc,
      alacakTutar: 0,
      tazminat: 0
    });
  }

  // ── Hesaplamalar ──
  const genelBorc   = genelIslemler.reduce((s, x) => s + x.borcTutar, 0);
  const genelAlacak = genelIslemler.reduce((s, x) => s + x.alacakTutar, 0);
  const genelBakiye = genelBorc - genelAlacak;
  const aidatBorc   = aidatIslemler.reduce((s, x) => s + x.borcTutar, 0);
  const aidatBakiye = aidatBorc;
  const topBorc     = genelBorc + aidatBorc;
  const topAlacak   = genelAlacak;
  const topBakiye   = topBorc - topAlacak;
  const fazlaOdeme  = topAlacak > topBorc ? topAlacak - topBorc : 0;

  // ── İşlem satırı builder ──
  // Klasik muhasebe defteri: 7 sütun, yeni→eski sıra, her satırda o ana kadar kümülatif bakiye.
  function islemSatiri(ix) {
    if (!ix.length) return `<div class="ci-empty">Bu kategoride işlem bulunmuyor.</div>`;
    const nowStr = new Date().toISOString().slice(0, 10);

    // ISO tarihi → Türkçe görünüm (G.AA.YYYY)
    const fmtD = d => {
      if (!d) return '—';
      const [y, m, g] = d.split('-');
      return `${+g}.${m}.${y}`;
    };

    // Tarihe göre eskiden yeniye sırala, kümülatif bakiye hesapla
    const sorted = [...ix].sort((a, b) => (a.evrakTarih || '') > (b.evrakTarih || '') ? 1 : -1);
    let cum = 0;
    const rows = sorted.map(x => {
      const tip = x.borcTutar > 0 ? 'borc' : 'alacak';
      const tutar = tip === 'borc' ? x.borcTutar : x.alacakTutar;
      cum += tip === 'borc' ? tutar : -tutar;
      return { ...x, _tip: tip, _tutar: tutar, _cum: cum };
    }).reverse(); // Ekranda yeni → eski

    // Para hücresi: sıfırsa "₺ —", değilse renkli tutar
    const mc = (val, cls) => val > 0.009
      ? `<span class="ci-tutar ${cls}">₺${fmt(val)}</span>`
      : '';
    const mcZ = (val, cls) => val > 0.009
      ? `<span class="ci-tutar ${cls}">₺${fmt(val)}</span>`
      : `<span class="ci-zero">₺ —</span>`;

    return `<div class="cari-islem-hdr">
      <div class="ci-hdr-tarih">Evrak Tarihi</div>
      <div class="ci-hdr-son-odeme">Son Ödeme Tarihi</div>
      <div>Açıklama</div>
      <div class="ci-hdr-borc">Borç</div>
      <div class="ci-hdr-tazminat">Tazminat</div>
      <div class="ci-hdr-alacak">Alacak</div>
      <div class="ci-hdr-bakiye">Bakiye</div>
    </div>` + rows.map(r => {
      const isOverdue = r._tip === 'borc' && r.sonOdeme && r.sonOdeme < nowStr;
      const bakCls = r._cum > 0.01 ? 'bak-d' : r._cum < -0.01 ? 'bak-a' : 'bak-z';

      // Son Ödeme Tarihi hücresi
      const sonOdemeEl = r._tip === 'borc' && r.sonOdeme
        ? `${isOverdue ? '<span class="ci-overdue-badge" style="margin-right:3px">GECİKTİ</span>' : ''}<span style="color:${isOverdue ? 'var(--err)' : 'inherit'}">${fmtD(r.sonOdeme)}</span>`
        : '';

      // Bakiye hücresi
      const bakVal = Math.abs(r._cum);
      const bakEl = bakVal < 0.01
        ? `<span class="ci-zero">₺ —</span>`
        : `<span class="ci-tutar ${bakCls === 'bak-d' ? 'borc' : 'alacak'}">₺${fmt(bakVal)}</span>`;

      const editClick = r._srcType ? `onclick="openCariKayitEdit('${r._srcType}','${r._srcId}','${r._sakId}')" title="Kaydı düzenle"` : '';
      const editCls = r._srcType ? ' ci-editable' : '';
      return `<div class="cari-islem-row ci-${r._tip}${isOverdue ? ' row-overdue' : ''}${editCls}" ${editClick}>
        <div class="ci-col-tarih">${fmtD(r.evrakTarih)}</div>
        <div class="ci-col-son-odeme">${sonOdemeEl}</div>
        <div class="ci-aciklama-cell" title="${r.aciklama || ''}">${r.aciklama || '—'}</div>
        <div class="ci-col-borc">${mc(r._tip === 'borc' ? r._tutar : 0, 'borc')}</div>
        <div class="ci-col-tazminat">${mcZ(r.tazminat || 0, 'tazminat')}</div>
        <div class="ci-col-alacak">${mc(r._tip === 'alacak' ? r._tutar : 0, 'alacak')}</div>
        <div class="ci-cumbal ${bakCls}">${bakEl}</div>
      </div>`;
    }).join('');
  }

  // ── Kategori (katlanabilir) HTML ──
  function kategoriBlok(label, islemler, borcT, alacakT, bakiyeT, uid) {
    const katIcon = label === 'Tahsilat'
      ? `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--ok);fill:none;stroke-width:2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M2 11h20"/><circle cx="6" cy="16" r="1.5" fill="var(--ok)" stroke="none"/></svg>`
      : label === 'Devir Borç'
      ? `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--err);fill:none;stroke-width:2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`
      : `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--brand);fill:none;stroke-width:2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    return `
    <div>
      <div class="cari-kat-hdr" onclick="cariToggle('kat-${uid}')">
        <div style="display:flex;align-items:center;gap:8px">
          <span id="kat-chev-${uid}" style="transition:transform .2s;display:inline-block;font-size:10px;color:var(--tx-3)">▼</span>
          ${katIcon}
          <strong style="font-size:12.5px;color:var(--tx)">${label}</strong>
        </div>
        <div class="cd-num red" style="text-align:right">${borcT>0?'₺'+fmt(borcT):'—'}</div>
        <div class="cd-num" style="text-align:right;color:var(--tx-3)">—</div>
        <div class="cd-num green" style="text-align:right">${alacakT>0?'₺'+fmt(alacakT):'—'}</div>
        <div class="cd-num bold ${bakiyeT>0?'red':'green'}" style="text-align:right">₺${fmt(Math.abs(bakiyeT))}</div>
      </div>
      <div id="kat-${uid}">
        ${islemSatiri(islemler, label)}
      </div>
    </div>`;
  }

  const uid = sk.id + '_' + Date.now();

  const el = document.getElementById('sakin-cari-content');
  const netCls = topBakiye>0.01?'err':fazlaOdeme>0?'ok':'neu';
  const netLbl = topBakiye>0.01?'BORÇLU':fazlaOdeme>0?'ALACAKLI':'KAPALI';
  const ico = (p) => `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0">${p}</svg>`;

  el.innerHTML = `<div class="cari-page">

  <!-- ══ SOL PANEL ══ -->
  <div class="cari-side">

    <!-- Profil kartı -->
    <div class="cari-profile-card">
      <svg class="cpc-bg" viewBox="0 0 220 180" fill="white">
        <rect x="0" y="60" width="32" height="120"/><rect x="4" y="46" width="6" height="14"/>
        <rect x="36" y="34" width="38" height="146"/><rect x="40" y="20" width="7" height="14"/><rect x="51" y="26" width="7" height="8"/>
        <rect x="80" y="22" width="34" height="158"/><rect x="84" y="8" width="7" height="14"/><rect x="95" y="14" width="7" height="8"/>
        <rect x="120" y="44" width="28" height="136"/>
        <rect x="154" y="10" width="44" height="170"/><rect x="159" y="0" width="8" height="10"/><rect x="172" y="4" width="8" height="6"/>
        <rect x="202" y="30" width="30" height="150"/>
      </svg>
      <div class="cpc-head">
        <div class="cari-avatar">${initials}</div>
        <div class="cpc-meta">
          <div class="cpc-name" onclick="goSakinProfil(${sk.id})" title="Sakin Profiline Git">
            ${sk.ad.toUpperCase()}
            <svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:rgba(255,255,255,.7);fill:none;stroke-width:2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </div>
          <div class="cpc-unit">${aptAd}</div>
          <div class="cpc-type">${sk.tip==='kiralik'?'Kiracı':'Malik'} · ${(sk.blok?(sk.blok.replace(/\s*blok\s*/i,'').trim()+' – '):'') + (sk.daire||'?')}</div>
        </div>
      </div>
      ${(sk.email||sk.tel)?`<div class="cpc-contact">
        ${sk.email?`<span><svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:rgba(255,255,255,.75);fill:none;stroke-width:2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>${sk.email}</span>`:''}
        ${sk.tel?`<span><svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:rgba(255,255,255,.75);fill:none;stroke-width:2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1.15h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.92-1.87a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.54 16z"/></svg>${sk.tel}</span>`:''}
      </div>`:''}
    </div>

    <!-- Net bakiye hero -->
    <div class="cari-net-card">
      <div class="cari-net-lbl">Net Bakiye</div>
      <div class="cari-net-val ${netCls}">₺${fmt(Math.abs(topBakiye))}</div>
      <div><span class="cari-net-badge ${netCls}">${netLbl}</span></div>
    </div>

    <!-- Finansal özet -->
    <div class="cari-fin-cards">
      <div class="cari-fin-card">
        <div class="cfc-lbl">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--err);fill:none;stroke-width:2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          Toplam Borç
        </div>
        <div class="cfc-val ${topBorc>0?'err':'muted'}">₺${fmt(topBorc)}</div>
      </div>
      <div class="cari-fin-card">
        <div class="cfc-lbl">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--ok);fill:none;stroke-width:2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M2 11h20"/><circle cx="6" cy="16" r="1.5" fill="var(--ok)" stroke="none"/></svg>
          Toplam Ödeme
        </div>
        <div class="cfc-val ${topAlacak>0?'ok':'muted'}">₺${fmt(topAlacak)}</div>
      </div>
      <div class="cari-fin-card">
        <div class="cfc-lbl" style="${fazlaOdeme>0?'color:var(--ok)':''}">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:${fazlaOdeme>0?'var(--ok)':'var(--brand)'};fill:none;stroke-width:2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          ${fazlaOdeme>0?'Alacaklı':'Fazla Ödeme'}
        </div>
        <div class="cfc-val ${fazlaOdeme>0?'ok':'muted'}" style="${fazlaOdeme>0?'font-weight:700;font-size:15px':''}">₺${fmt(fazlaOdeme)}</div>
        ${fazlaOdeme>0?`<div style="font-size:10px;color:var(--ok);margin-top:2px;font-weight:600">Fazla ödeme alacağı</div>`:''}
      </div>
    </div>

    <!-- Aksiyon butonları -->
    <div class="cari-side-btns">
      <button class="csb-btn cp" onclick="openAidatBorcDaire(${sk.id})">
        ${ico('<path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>')}
        Borçlandır
      </button>
      <button class="csb-btn cs" onclick="openHizliOdeme(${sk.id},'')">
        ${ico('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M2 11h20"/>')}
        Tahsil Et
      </button>
      <button class="csb-btn cs" onclick="openHizliOdeme(${sk.id},'')">
        ${ico('<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>')}
        Detaylı Tahsil
      </button>
      <button class="csb-btn cs" onclick="toast('Kart ile tahsilat yakında aktif olacak.','info')">
        ${ico('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M2 11h20"/><circle cx="6" cy="16" r="1.5"/>')}
        Kart ile Tahsil
      </button>
      <button class="csb-btn cd" onclick="downloadHesapEkstresi(${sk.id})">
        ${ico('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>')}
        Hesap Ekstresi İndir
      </button>
      <button class="csb-btn cg" onclick="window._cariFromDaire?goPage('daire-detay'):goPage('sakinler')">
        ${ico('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')}
        Kapat
      </button>
    </div>

  </div>

  <!-- ══ SAĞ ANA İÇERİK ══ -->
  <div class="cari-main">

    <!-- Filtre bar -->
    <div class="cari-filter-bar">
      <div class="cari-filter-left">
        <div class="cari-toggle" onclick="cariToggleOpt('tumKirilim',${sk.id})">
          <div class="cari-toggle-sw ${tumKirilim?'on':''}" id="cari-sw-tumKirilim"></div>
          <span>Tümünü Genişlet</span>
        </div>
        <div class="cari-filter-sep"></div>
        <div class="cari-toggle" onclick="cariToggleOpt('sadecGeciken',${sk.id})">
          <div class="cari-toggle-sw ${sadecGeciken?'on':''}" id="cari-sw-sadecGeciken"></div>
          <span>Sadece Geciken</span>
        </div>
      </div>
      <div class="cari-date-range">
        <label>Dönem</label>
        <input type="date" id="cari-dt-bas" value="${startDate}" onchange="cariDateChange(${sk.id})">
        <svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:var(--tx-3);fill:none;stroke-width:2;flex-shrink:0"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        <input type="date" id="cari-dt-bit" value="${endDate}" onchange="cariDateChange(${sk.id})">
      </div>
    </div>

    <!-- Akordiyön tablo -->
    <div class="cari-accordion">
      <div class="cari-acc-hdr">
        <div>Kalem / Daire</div>
        <div style="text-align:right">Borç</div>
        <div style="text-align:right">Tazminat</div>
        <div style="text-align:right">Alacak</div>
        <div style="text-align:right">Bakiye</div>
      </div>

      <div class="cari-daire-row" onclick="cariToggle('daire-${uid}')">
        <div class="cd-label">
          <span id="daire-chev-${uid}" style="transition:transform .2s;font-size:10px;color:var(--tx-3)">▼</span>
          <svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:var(--brand);fill:none;stroke-width:2;flex-shrink:0"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>${(sk.blok?(sk.blok.replace(/\s*blok\s*/i,'').trim()+' – '):'')+(sk.daire||'?')}</span>
          <span class="cd-type-badge">${sk.tip==='kiralik'?'Kiracı':'Malik'}</span>
        </div>
        <div class="cd-num red" style="text-align:right">${topBorc>0?'₺'+fmt(topBorc):'—'}</div>
        <div class="cd-num" style="text-align:right;color:var(--tx-3)">—</div>
        <div class="cd-num green" style="text-align:right">${topAlacak>0?'₺'+fmt(topAlacak):'—'}</div>
        <div class="cd-num bold ${topBakiye>0.01?'red':'green'}" style="text-align:right">₺${fmt(Math.abs(topBakiye))}</div>
      </div>

      <div id="daire-${uid}">
        ${(() => {
          // Borç (aidatIslemler) + Alacak (genelIslemler) TEK havuzda birleştir → kategoriye göre grupla
          const tumIslemler = [...aidatIslemler, ...genelIslemler];
          const byKat = {};
          tumIslemler.forEach(x => {
            const kat = x.kategori || (x.borcTutar > 0 ? 'Devir Borç' : 'Tahsilat');
            if (!byKat[kat]) byKat[kat] = [];
            byKat[kat].push(x);
          });
          return Object.entries(byKat).map(([kat, items]) => {
            const bT = items.reduce((s, x) => s + x.borcTutar, 0);
            const aT = items.reduce((s, x) => s + x.alacakTutar, 0);
            const bakT = bT - aT;
            return kategoriBlok(kat, items, bT, aT, bakT, uid + '_' + kat.replace(/\W+/g, '_'));
          }).join('');
        })()}
      </div>
    </div>

  </div>
  </div>`;

  // Store opts for toggles
  window._cariOpts = { startDate, endDate, sadecGeciken, tumKirilim };

  // Borçlandırma sonrası otomatik kategori vurgusu
  if (window._cariAutoOpenKat) {
    const hedefKat = window._cariAutoOpenKat;
    setTimeout(() => {
      document.querySelectorAll('.cari-kat-hdr').forEach(hdr => {
        const lbl = hdr.querySelector('strong');
        if (lbl && lbl.textContent.trim() === hedefKat) {
          hdr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          hdr.classList.add('kat-flash');
          setTimeout(() => hdr.classList.remove('kat-flash'), 2200);
        }
      });
    }, 120);
  }
}

function downloadHesapEkstresi(sakId) {
  const sk = (S.sakinler || []).find(s => s.id == sakId);
  if (!sk) { toast('Sakin bulunamadı', 'err'); return; }

  const apt = S.apartmanlar.find(a => a.id == sk.aptId);
  const ay  = S.ayarlar || {};
  const firmaAd  = ay.firma    || 'Site Yönetimi';
  const yonetici = ay.yonetici || '';
  const firmaAdr = ay.adres    || '';
  const firmaTel = ay.tel      || '';

  const blokPre  = (sk.blok || '').replace(/\s*blok\s*/i,'').trim();
  const daireNo  = (blokPre ? blokPre + ' – ' : '') + (sk.daire || '?');
  const aptAd    = apt ? apt.ad : '—';
  const tipLabel = sk.tip === 'kiralik' ? 'Kiracı' : 'Kat Maliki';
  const bugun    = new Date();
  const bugunStr = `${bugun.getDate().toString().padStart(2,'0')}.${(bugun.getMonth()+1).toString().padStart(2,'0')}.${bugun.getFullYear()}`;

  const fmtD = d => {
    if (!d) return '—';
    const [y,m,g] = d.split('-');
    return `${+g}.${m}.${y}`;
  };
  const fmtP = n => Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});

  // ── Veri toplama (renderSakinCari ile aynı mantık) ──
  const aidatIslemler = [];
  (S.aidatBorclandir || []).forEach(kayit => {
    if (!kayit.detaylar) return;
    kayit.detaylar.forEach(d => {
      if (d.sakId == sk.id) {
        aidatIslemler.push({
          tarih: kayit.tarih || '',
          sonOdeme: kayit.sonOdeme || kayit.tarih || '',
          aciklama: kayit.aciklama || `${kayit.donem || ''} Dönemi Aidat`,
          borc: d.tutar || 0,
          alacak: 0,
          kategori: d.kategori || 'Aidat'
        });
      }
    });
  });

  const tipToLabel = { aidat:'Aidat', kira:'Kira', diger:'Diğer', genel:'Genel' };
  const odemeler = (S.tahsilatlar || []).filter(t => t.sakId == sk.id || t.sakinId == sk.id);
  const tahsilatIslemler = odemeler.map(o => ({
    tarih: o.tarih || '',
    sonOdeme: '',
    aciklama: o.not || o.aciklama || 'Tahsilat',
    borc: 0,
    alacak: o.tutar || 0,
    kategori: o.kategori || tipToLabel[o.tip] || 'Tahsilat'
  }));

  // Devir borç varsa ekle
  const topAidat = aidatIslemler.reduce((s,x)=>s+x.borc,0);
  const topOdeme = odemeler.reduce((s,o)=>s+(o.tutar||0),0);
  const devirBorc = Math.max(0, (sk.borc||0) - topAidat + topOdeme);
  if (devirBorc > 0.01) {
    aidatIslemler.unshift({
      tarih: sk.giris || '',
      sonOdeme: '',
      aciklama: `Devir Borcu – Daire: ${daireNo}`,
      borc: devirBorc,
      alacak: 0,
      kategori: 'Devir'
    });
  }

  // Tüm işlemleri birleştir, tarihe göre eskiden yeniye sırala
  const tumIslemler = [...aidatIslemler, ...tahsilatIslemler]
    .sort((a,b) => (a.tarih||'') > (b.tarih||'') ? 1 : -1);

  // Kümülatif bakiye hesapla
  let cum = 0;
  const satirlar = tumIslemler.map(x => {
    cum += x.borc - x.alacak;
    return { ...x, _cum: cum };
  });

  const topBorc   = tumIslemler.reduce((s,x)=>s+x.borc,0);
  const topAlacak = tumIslemler.reduce((s,x)=>s+x.alacak,0);
  const netBakiye = topBorc - topAlacak;
  const netDurum  = netBakiye > 0.01 ? 'BORÇLU' : netBakiye < -0.01 ? 'ALACAKLI' : 'KAPALI';
  const netRenk   = netBakiye > 0.01 ? '#dc2626' : netBakiye < -0.01 ? '#16a34a' : '#6b7280';

  // ── HTML içerik ──
  const satirHTML = satirlar.map(r => {
    const bakRenk  = r._cum > 0.01 ? '#dc2626' : r._cum < -0.01 ? '#16a34a' : '#6b7280';
    const borcCell = r.borc > 0.009
      ? `<td style="text-align:right;color:#dc2626;font-weight:600">₺${fmtP(r.borc)}</td>`
      : `<td style="text-align:right;color:#9ca3af">—</td>`;
    const alacakCell = r.alacak > 0.009
      ? `<td style="text-align:right;color:#16a34a;font-weight:600">₺${fmtP(r.alacak)}</td>`
      : `<td style="text-align:right;color:#9ca3af">—</td>`;
    const bakCell = `<td style="text-align:right;color:${bakRenk};font-weight:700">₺${fmtP(Math.abs(r._cum))}</td>`;
    return `<tr>
      <td>${fmtD(r.tarih)}</td>
      <td>${r.sonOdeme ? fmtD(r.sonOdeme) : '<span style="color:#9ca3af">—</span>'}</td>
      <td>${r.aciklama || '—'}</td>
      <td><span style="background:#f3f4f6;color:#374151;padding:1px 7px;border-radius:10px;font-size:10px">${r.kategori||'—'}</span></td>
      ${borcCell}${alacakCell}${bakCell}
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Hesap Ekstresi – ${sk.ad}</title>
<style>
  @page { size: A4; margin: 15mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111827; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 2px solid #1d4ed8; }
  .logo-area h1 { font-size: 18px; font-weight: 800; color: #1d4ed8; letter-spacing: -.3px; }
  .logo-area p { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .header-right { text-align: right; font-size: 10px; color: #6b7280; line-height: 1.7; }
  .doc-title { text-align: center; margin-bottom: 16px; }
  .doc-title h2 { font-size: 15px; font-weight: 700; color: #111827; letter-spacing: 1px; text-transform: uppercase; }
  .doc-title p { font-size: 10px; color: #6b7280; margin-top: 3px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
  .info-cell { padding: 8px 12px; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
  .info-cell:nth-child(even) { border-right: none; }
  .info-cell:nth-last-child(-n+2) { border-bottom: none; }
  .info-label { font-size: 9px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
  .info-val { font-size: 11.5px; font-weight: 600; color: #111827; }
  .summary { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 16px; }
  .sum-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
  .sum-label { font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; }
  .sum-val { font-size: 14px; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #1d4ed8; color: #fff; }
  thead th { padding: 7px 8px; text-align: left; font-size: 9.5px; font-weight: 600; letter-spacing: .3px; text-transform: uppercase; white-space: nowrap; }
  thead th:nth-child(n+5) { text-align: right; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody tr:hover { background: #eff6ff; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; font-size: 10.5px; vertical-align: middle; }
  .total-row td { background: #f1f5f9; font-weight: 700; font-size: 11px; border-top: 2px solid #1d4ed8; padding: 8px; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; }
  .net-badge { display:inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; color: #fff; background: ${netRenk}; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <div class="logo-area">
      <h1>${firmaAd}</h1>
      <p>${firmaAdr || ''}</p>
      ${firmaTel ? `<p>Tel: ${firmaTel}</p>` : ''}
      ${yonetici ? `<p>Yönetici: ${yonetici}</p>` : ''}
    </div>
    <div class="header-right">
      <strong style="font-size:13px;color:#111827">HESAP EKSTRESİ</strong><br>
      Belge Tarihi: ${bugunStr}<br>
      Dönem: ${fmtD((new Date().getFullYear())+'-01-01')} – ${fmtD((new Date().getFullYear())+'-12-31')}
    </div>
  </div>

  <div class="info-grid">
    <div class="info-cell"><div class="info-label">Ad Soyad</div><div class="info-val">${sk.ad}</div></div>
    <div class="info-cell"><div class="info-label">Apartman</div><div class="info-val">${aptAd}</div></div>
    <div class="info-cell"><div class="info-label">Daire / Blok</div><div class="info-val">${daireNo}</div></div>
    <div class="info-cell"><div class="info-label">Durum</div><div class="info-val">${tipLabel}</div></div>
    ${sk.tel ? `<div class="info-cell"><div class="info-label">Telefon</div><div class="info-val">${sk.tel}</div></div>` : ''}
    ${sk.email ? `<div class="info-cell"><div class="info-label">E-posta</div><div class="info-val">${sk.email}</div></div>` : ''}
  </div>

  <div class="summary">
    <div class="sum-card">
      <div class="sum-label">Toplam Borç</div>
      <div class="sum-val" style="color:#dc2626">₺${fmtP(topBorc)}</div>
    </div>
    <div class="sum-card">
      <div class="sum-label">Toplam Ödeme</div>
      <div class="sum-val" style="color:#16a34a">₺${fmtP(topAlacak)}</div>
    </div>
    <div class="sum-card">
      <div class="sum-label">Net Bakiye</div>
      <div class="sum-val" style="color:${netRenk}">₺${fmtP(Math.abs(netBakiye))}</div>
    </div>
    <div class="sum-card" style="display:flex;align-items:center;justify-content:center">
      <span class="net-badge">${netDurum}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Evrak Tarihi</th>
        <th>Son Ödeme</th>
        <th>Açıklama</th>
        <th>Kategori</th>
        <th style="text-align:right">Borç (₺)</th>
        <th style="text-align:right">Alacak (₺)</th>
        <th style="text-align:right">Bakiye (₺)</th>
      </tr>
    </thead>
    <tbody>
      ${satirHTML || '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:20px">İşlem kaydı bulunamadı.</td></tr>'}
      <tr class="total-row">
        <td colspan="4" style="text-align:right">TOPLAM</td>
        <td style="text-align:right;color:#dc2626">₺${fmtP(topBorc)}</td>
        <td style="text-align:right;color:#16a34a">₺${fmtP(topAlacak)}</td>
        <td style="text-align:right;color:${netRenk}">₺${fmtP(Math.abs(netBakiye))}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <span>Bu belge ${bugunStr} tarihinde SiteYönet Pro sistemi tarafından oluşturulmuştur.</span>
    <span>${firmaAd} – ${yonetici}</span>
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { toast('Popup engellendi. Tarayıcı izin ayarlarını kontrol edin.', 'warn'); return; }
  w.document.write(html);
  w.document.close();
}

function cariToggle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : '';
  // Rotate chevron
  const parts = id.split('-');
  const chevKey = parts[0] + '-chev-' + parts.slice(1).join('-');
  const chev = document.getElementById(chevKey);
  if (chev) chev.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
}

function cariToggleOpt(key, sakId) {
  const opts = window._cariOpts || {};
  opts[key] = !opts[key];
  window._cariOpts = opts;
  const sw = document.getElementById('cari-sw-' + key);
  if (sw) sw.classList.toggle('on', opts[key]);
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (sk) renderSakinCari(sk, opts);
}

function cariDateChange(sakId) {
  const opts = window._cariOpts || {};
  opts.startDate = document.getElementById('cari-dt-bas')?.value || opts.startDate;
  opts.endDate   = document.getElementById('cari-dt-bit')?.value || opts.endDate;
  window._cariOpts = opts;
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (sk) renderSakinCari(sk, opts);
}

// ══════════════════════════════════════════════════════════════════════
// CARİ KAYIT DÜZENLEME
// ══════════════════════════════════════════════════════════════════════

function openCariKayitEdit(srcType, srcId, sakId) {
  srcId = +srcId; sakId = +sakId;
  let rec = null;

  if (srcType === 'borclandir') {
    // Detay id ile ara (yeni kayıtlar), bulamazsa kayit.id + sakId ile fallback (eski kayıtlar)
    let foundKayit = null, foundDetay = null;
    for (const k of (S.aidatBorclandir || [])) {
      const d = (k.detaylar || []).find(x => x.id == srcId);
      if (d) { foundKayit = k; foundDetay = d; break; }
    }
    if (!foundDetay) {
      // Eski kayıt: srcId = kayit.id, sakId ile ara
      foundKayit = (S.aidatBorclandir || []).find(k => k.id == srcId);
      foundDetay = foundKayit && (foundKayit.detaylar || []).find(d => d.sakId == sakId);
    }
    if (!foundKayit || !foundDetay) { toast('Kayıt bulunamadı.', 'err'); return; }
    rec = { srcType, kayit: foundKayit, detay: foundDetay, sakId };
  } else if (srcType === 'tahsilat') {
    const t = (S.tahsilatlar || []).find(x => x.id == srcId);
    if (!t) { toast('Kayıt bulunamadı.', 'err'); return; }
    rec = { srcType, tahsilat: t, sakId };
  }
  if (!rec) return;
  window._editingCariRec = rec;

  // Başlık
  document.getElementById('cke-tip').textContent = srcType === 'borclandir' ? '✏️ Borç Kaydı Düzenle' : '✏️ Tahsilat Kaydı Düzenle';

  // Alanları doldur
  const tarih = srcType === 'borclandir' ? (rec.detay.tarih || rec.kayit.tarih || '') : (rec.tahsilat.tarih || '');
  const tutar = srcType === 'borclandir' ? (rec.detay.tutar || 0) : (rec.tahsilat.tutar || 0);
  const aciklama = srcType === 'borclandir'
    ? (rec.detay.aciklama || rec.kayit.aciklama || '')
    : (rec.tahsilat.not || rec.tahsilat.aciklama || '');

  document.getElementById('cke-tarih').value = tarih;
  document.getElementById('cke-tutar').value = tutar;
  document.getElementById('cke-aciklama').value = aciklama;

  // Kategori — her iki kayıt tipinde de göster
  const katWrap = document.getElementById('cke-kat-wrap');
  const katEl = document.getElementById('cke-kategori');
  katWrap.style.display = '';
  if (srcType === 'borclandir') {
    const gelirler = getGelirTanimlari();
    katEl.innerHTML = gelirler.map(t => `<option value="${t.ad}">${t.ad}</option>`).join('');
    katEl.value = rec.detay.kategori || (gelirler[0]?.ad || '');
  } else {
    // Tahsilat: gelir + gider tanımları optgroup olarak
    const gelirOpts = getGelirTanimlari().map(t => `<option value="${t.ad}">${t.ad}</option>`).join('');
    const giderOpts = getGiderTanimlari().map(t => `<option value="${t.ad}">${t.ad}</option>`).join('');
    katEl.innerHTML = `<option value="">— Kategori seçin —</option><optgroup label="💰 Gelir Kategorileri">${gelirOpts}</optgroup><optgroup label="💸 Gider Kategorileri">${giderOpts}</optgroup>`;
    katEl.value = rec.tahsilat.kategori || '';
  }

  // Sakin transfer listesini doldur
  const transferEl = document.getElementById('cke-transfer-sak');
  if (transferEl) {
    const tumSakinler = (S.sakinler || []).slice().sort((a, b) => {
      const aptA = (S.apartmanlar.find(x => x.id == a.aptId)?.ad || '');
      const aptB = (S.apartmanlar.find(x => x.id == b.aptId)?.ad || '');
      return aptA.localeCompare(aptB) || (a.daire || '').localeCompare(b.daire || '');
    });
    transferEl.innerHTML = tumSakinler.map(s => {
      const aptAd = S.apartmanlar.find(x => x.id == s.aptId)?.ad || '?';
      const selected = s.id === sakId ? ' selected' : '';
      return `<option value="${s.id}"${selected}>${s.ad} — D.${s.daire || '?'} (${aptAd})</option>`;
    }).join('');
  }

  openModal('mod-cari-kayit-edit');
}

function saveCariKayitEdit() {
  const rec = window._editingCariRec;
  if (!rec) return;

  const tarih    = document.getElementById('cke-tarih').value;
  const tutar    = parseFloat(document.getElementById('cke-tutar').value) || 0;
  const aciklama = document.getElementById('cke-aciklama').value.trim();
  const kategori = document.getElementById('cke-kategori')?.value;
  const yeniSakId = +document.getElementById('cke-transfer-sak')?.value;
  const eskiSakId = rec.sakId;
  const isTransfer = yeniSakId && yeniSakId !== eskiSakId;

  if (tutar <= 0) { toast('Tutar sıfırdan büyük olmalı!', 'err'); return; }

  const eskiSk = S.sakinler.find(s => s.id === eskiSakId);
  const yeniSk = isTransfer ? S.sakinler.find(s => s.id === yeniSakId) : eskiSk;
  const yeniApt = S.apartmanlar.find(a => a.id == yeniSk?.aptId);

  if (rec.srcType === 'borclandir') {
    const eskiTutar = rec.detay.tutar || 0;
    rec.detay.tarih    = tarih;
    rec.detay.aciklama = aciklama;
    rec.detay.tutar    = tutar;
    if (kategori) rec.detay.kategori = kategori;

    if (isTransfer) {
      // Eski sakinden borcu düş
      if (eskiSk) eskiSk.borc = Math.max(0, (eskiSk.borc || 0) - eskiTutar);
      // Detayı yeni sakine aktar
      rec.detay.sakId = yeniSakId;
      rec.detay.ad    = yeniSk?.ad || '';
      rec.detay.daire = yeniSk?.daire || '';
      // Yeni sakine borcu yükle
      if (yeniSk) yeniSk.borc = (yeniSk.borc || 0) + tutar;
    } else {
      // Aynı sakin — tutar farkını güncelle
      if (eskiSk) eskiSk.borc = Math.max(0, (eskiSk.borc || 0) - eskiTutar + tutar);
    }
    rec.kayit.toplamBorc = (rec.kayit.detaylar || []).reduce((s, d) => s + (d.tutar || 0), 0);

  } else if (rec.srcType === 'tahsilat') {
    const eskiTutar = rec.tahsilat.tutar || 0;
    rec.tahsilat.tarih    = tarih;
    rec.tahsilat.tutar    = tutar;
    rec.tahsilat.not      = aciklama;
    rec.tahsilat.aciklama = aciklama;
    if (kategori) rec.tahsilat.kategori = kategori;

    if (isTransfer) {
      // Eski sakinin borcunu geri artır (tahsilat artık ona ait değil)
      if (eskiSk) eskiSk.borc = (eskiSk.borc || 0) + eskiTutar;
      // Tahsilatı yeni sakine transfer et
      rec.tahsilat.sakId  = yeniSakId;
      rec.tahsilat.sakAd  = yeniSk?.ad || '';
      rec.tahsilat.ad     = yeniSk?.ad || '';
      rec.tahsilat.daire  = yeniSk?.daire || '';
      rec.tahsilat.aptId  = yeniSk?.aptId;
      rec.tahsilat.aptAd  = yeniApt?.ad || '';
      // Yeni sakinin borcunu düş
      if (yeniSk) yeniSk.borc = Math.max(0, (yeniSk.borc || 0) - tutar);
    } else {
      // Aynı sakin — tutar değişti, borç farkını güncelle
      if (eskiSk) eskiSk.borc = Math.max(0, (eskiSk.borc || 0) + eskiTutar - tutar);
    }
  }

  const finalSakId = isTransfer ? yeniSakId : eskiSakId;
  rec.sakId = finalSakId;

  save();
  closeModal('mod-cari-kayit-edit');
  toast(isTransfer ? '↕ Transfer tamamlandı! Bakiyeler güncellendi.' : 'Kayıt güncellendi!', 'ok');

  // Cari sayfayı transfer yapılan sakin üzerinden yenile
  const sk = S.sakinler.find(s => s.id === finalSakId);
  if (sk) renderSakinCari(sk, window._cariOpts || {});
}

function deleteCariKayit() {
  const rec = window._editingCariRec;
  if (!rec) return;
  const tipAd = rec.srcType === 'borclandir' ? 'borç' : 'tahsilat';
  if (!confirm(`Bu ${tipAd} kaydı silinsin mi? Bu işlem geri alınamaz.`)) return;
  const sk = S.sakinler.find(s => s.id === rec.sakId);
  if (rec.srcType === 'borclandir') {
    const tutar = rec.detay.tutar || 0;
    rec.kayit.detaylar = (rec.kayit.detaylar || []).filter(d => d !== rec.detay);
    rec.kayit.toplamBorc = (rec.kayit.detaylar || []).reduce((s, d) => s + (d.tutar || 0), 0);
    if (!(rec.kayit.detaylar || []).length) S.aidatBorclandir = (S.aidatBorclandir || []).filter(k => k !== rec.kayit);
    if (sk) sk.borc = Math.max(0, (sk.borc || 0) - tutar);
  } else if (rec.srcType === 'tahsilat') {
    const tutar = rec.tahsilat.tutar || 0;
    rec.tahsilat.status = 'cancelled';
    rec.tahsilat.cancelledAt = new Date().toISOString();
    if (sk) sk.borc = (sk.borc || 0) + tutar;
  }
  save();
  closeModal('mod-cari-kayit-edit');
  toast(`Kayıt silindi.`, 'warn');
  if (sk) renderSakinCari(sk, window._cariOpts || {});
}

function openHizliOdeme(sakId, donem) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk) return;
  document.getElementById('ho-sak-id').value = sakId;
  document.getElementById('ho-sak-ad').value = sk.ad + ' — Daire ' + (sk.daire || '');
  document.getElementById('ho-tarih').value = today();
  document.getElementById('ho-donem').value = donem || '';
  document.getElementById('ho-tutar').value = sk.aidat || sk.aidatK || '';
  document.getElementById('ho-yontem').value = 'nakit';
  document.getElementById('ho-not').value = '';
  document.getElementById('ho-borc-dusu').checked = true;
  openModal('mod-hizli-odeme');
}

function saveHizliOdeme() {
  if (!_guardCheck()) return;
  const sakId = +document.getElementById('ho-sak-id').value;
  const tutar = parseFloat(document.getElementById('ho-tutar').value) || 0;
  const donem = document.getElementById('ho-donem').value.trim();
  const tarih = document.getElementById('ho-tarih').value || today();
  const yontem = document.getElementById('ho-yontem').value;
  const not = document.getElementById('ho-not').value.trim();
  const borcDus = document.getElementById('ho-borc-dusu').checked;
  if (tutar <= 0) { toast('Tutar giriniz!', 'err'); return; }
  const sk = S.sakinler.find(s => s.id === sakId);
  if (!sk) return;
  if (!S.tahsilatlar) S.tahsilatlar = [];
  if (!makbuzNo) makbuzNo = 5000; makbuzNo++;
  const apt = S.apartmanlar.find(a => a.id == sk.aptId);
  S.tahsilatlar.push({ id: Date.now(), no: 'M-'+makbuzNo, sakId, sakAd: sk.ad, aptId: sk.aptId, aptAd: apt ? apt.ad : (sk.aptAd||''), daire: sk.daire, tip: 'aidat', donem, tutar, tarih, yontem, not });
  if (borcDus && (sk.borc || 0) > 0) sk.borc = Math.max(0, (sk.borc || 0) - tutar);
  save();
  closeModal('mod-hizli-odeme');
  toast('Ödeme kaydedildi! ₺' + fmt(tutar), 'ok');
  if (typeof renderTahsilat === 'function') try { renderTahsilat(); } catch(e) {}
  // Re-render daire detay
  const yr = document.querySelector('.dd-year-sel');
  const yil = yr ? +yr.value : new Date().getFullYear();
  renderDaireDetay(sk, yil);
  refreshCariIfOpen();
}

// ══════════════════════════════════════════════════════════════════════
// TOPLU BORÇLANDIRMA SAYFASI (Standalone Page)
// ══════════════════════════════════════════════════════════════════════

function renderTopluBorcPage() {
  // İstatistik kartları
  const statsEl = document.getElementById('tbp-page-stats');
  if (statsEl) {
    const tumKayitlar = S.aidatBorclandir || [];
    const buAy = new Date().toISOString().slice(0,7);
    const buAyKayitlar = tumKayitlar.filter(k => k.donem === buAy);
    const buAyToplam = buAyKayitlar.reduce((s,k) => s+(k.toplamBorc||0), 0);
    const toplamKayit = tumKayitlar.length;
    const toplamBorc = tumKayitlar.reduce((s,k) => s+(k.toplamBorc||0), 0);
    const aktifAptlar = [...new Set(tumKayitlar.map(k=>k.aptId))].length;
    statsEl.innerHTML = `
      <div class="sc bar-bl" style="cursor:default">
        <div class="sc-ico ic-bl"><svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div>
        <div class="sc-lbl">Bu Ay Borçlandırılan</div>
        <div class="sc-val v-bl">₺${fmt(buAyToplam)}</div>
        <div class="sc-sub">${buAyKayitlar.length} kayıt</div>
      </div>
      <div class="sc bar-am" style="cursor:default">
        <div class="sc-ico ic-am"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="sc-lbl">Toplam Kayıt</div>
        <div class="sc-val v-am">${toplamKayit}</div>
      </div>
      <div class="sc bar-rd" style="cursor:default">
        <div class="sc-ico ic-rd"><svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">&#8378;</text></svg></div>
        <div class="sc-lbl">Toplam Borçlandırılan</div>
        <div class="sc-val v-rd">₺${fmt(toplamBorc)}</div>
      </div>
      <div class="sc bar-gr" style="cursor:default">
        <div class="sc-ico ic-gr"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div>
        <div class="sc-lbl">İşlem Yapılan Site</div>
        <div class="sc-val v-gr">${aktifAptlar}</div>
      </div>`;
  }

  // Apartman dropdown'ı doldur
  const aptEl = document.getElementById('tbp-apt');
  if (aptEl) {
    const cur = aptEl.value || (selectedAptId ? String(selectedAptId) : '');
    aptEl.innerHTML = '<option value="">— Seçin —</option>' +
      S.apartmanlar.filter(a=>a.durum==='aktif')
        .map(a=>`<option value="${a.id}">${a.ad}</option>`).join('');
    if (cur) aptEl.value = cur;
    if (!aptEl.value && selectedAptId) aptEl.value = selectedAptId;
  }

  // Dönem initialize
  const donemEl = document.getElementById('tbp-donem');
  if (donemEl && !donemEl.value) {
    const now = new Date();
    donemEl.value = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  }
  // Tarih alanları: ilk açılışta dönemden türet
  tbpDonemDateDefaults();

  // Kategori listesi — her açılışta gelir tanımlarından tazele
  const katEl = document.getElementById('tbp-kategori');
  if (katEl) {
    const curKat = katEl.value;
    katEl.innerHTML = getGelirTanimlari().map(t => `<option value="${t.ad}">${t.ad}</option>`).join('');
    if (curKat) katEl.value = curKat; // seçili değeri koru
  }
}

function tbpAptChange() {
  tbpCheckDuplicatePeriod();
  tbpClearPreview();
  tbpManuelTutarChange(); // apt değişince canlı hesabı güncelle
}

/**
 * Manuel tutar girilince daire sayısı × tutar = toplam hesaplar ve gösterir.
 * Aynı zamanda tbp-sabit-tutar + tbp-tutar-tur alanlarını senkronize eder.
 */
function tbpManuelTutarChange() {
  const ozet   = document.getElementById('tbp-manuel-ozet');
  const tutar  = parseFloat(document.getElementById('tbp-manuel-tutar')?.value) || 0;
  const aptId  = document.getElementById('tbp-apt')?.value;
  const kime   = document.getElementById('tbp-kime')?.value || 'malik';

  // Sabit tutar alanını senkronize et (önizle butonu bunu okur)
  const sabitEl = document.getElementById('tbp-sabit-tutar');
  const turEl   = document.getElementById('tbp-tutar-tur');
  if (tutar > 0) {
    if (sabitEl) sabitEl.value = tutar;
    if (turEl)   turEl.value   = 'sabit';
    if (typeof tbpTutarTurChange === 'function') tbpTutarTurChange();
  }

  if (!ozet) return;

  if (!tutar || !aptId) {
    ozet.style.display = 'none';
    return;
  }

  // Aktif sakinlerden hedef kişi sayısını hesapla
  const aktifSakinler = (S.sakinler || []).filter(s => s.aptId == aptId && isSakinAktif(s));
  const daireMap = {};
  aktifSakinler.forEach(s => {
    const d = s.daire || '?';
    if (!daireMap[d]) daireMap[d] = { malik: null, kiraci: null };
    if (s.tip === 'malik'    && !daireMap[d].malik)  daireMap[d].malik  = s;
    if (s.tip === 'kiralik'  && !daireMap[d].kiraci) daireMap[d].kiraci = s;
  });

  let hedefSayisi = 0;
  Object.values(daireMap).forEach(kisiler => {
    const hedef = kime === 'malik'
      ? kisiler.malik
      : (kisiler.kiraci || kisiler.malik);
    if (hedef) hedefSayisi++;
  });

  const toplam = tutar * hedefSayisi;
  const apt    = (S.apartmanlar || []).find(a => a.id == aptId);

  ozet.style.display = '';
  ozet.innerHTML = `
    <div style="font-size:10.5px;font-weight:700;color:var(--tx-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Canlı Hesap</div>
    <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-bottom:6px">
      <span style="font-size:22px;font-weight:800;color:var(--brand)">₺${fmt(toplam)}</span>
      <span style="font-size:11.5px;color:var(--tx-3)">toplam borçlandırılacak</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px">
      <div style="font-size:12px;color:var(--tx-2)">
        <span style="font-weight:600;color:var(--tx-1)">${hedefSayisi} daire</span>
        <span style="color:var(--tx-3)"> × </span>
        <span style="font-weight:600;color:var(--tx-1)">₺${fmt(tutar)}</span>
        <span style="color:var(--tx-3)"> = </span>
        <span style="font-weight:700;color:var(--brand)">₺${fmt(toplam)}</span>
      </div>
      <div style="font-size:11px;color:var(--tx-3)">${apt?.ad || ''} · ${kime === 'malik' ? 'Ev sahipleri' : 'Kiracı öncelikli'}</div>
    </div>
    ${hedefSayisi === 0 ? '<div style="font-size:11px;color:var(--warn);margin-top:6px">⚠️ Bu site için aktif sakin bulunamadı</div>' : ''}
  `;
}

/**
 * Dönem seçilince/değişince tahakkuk ve son ödeme tarihlerini otomatik doldurur.
 * - Tahakkuk tarihi → dönemin 1'i (örn: 2026-01 → 2026-01-01)
 * - Son ödeme tarihi → dönemin son günü (örn: 2026-01 → 2026-01-31)
 * Kullanıcı alanı elle değiştirmişse üzerine yazma.
 */
function tbpDonemDateDefaults() {
  const donem = document.getElementById('tbp-donem')?.value; // 'YYYY-MM'
  if (!donem) return;

  const [yil, ay] = donem.split('-').map(Number);
  const tahakkukEl  = document.getElementById('tbp-tahakkuk-tarih');
  const sonOdemeEl  = document.getElementById('tbp-son-odeme-tarih');

  // Tahakkuk tarihi: dönemin 1'i
  const tahakkukISO = donem + '-01';
  if (tahakkukEl && !tahakkukEl.dataset.manualEdit)
    tahakkukEl.value = tahakkukISO;

  // Son ödeme tarihi: dönemin son günü
  const sonGun = new Date(yil, ay, 0).getDate(); // ay=next month, 0=last day of this month
  const sonOdemeISO = donem + '-' + String(sonGun).padStart(2, '0');
  if (sonOdemeEl && !sonOdemeEl.dataset.manualEdit)
    sonOdemeEl.value = sonOdemeISO;
}

// Kullanıcı elle değiştirdiğinde default'un üzerine yazmasını engelle
document.addEventListener('DOMContentLoaded', () => {
  ['tbp-tahakkuk-tarih', 'tbp-son-odeme-tarih'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { el.dataset.manualEdit = '1'; });
  });
});

function tbpTutarTurChange() {
  const tur = document.getElementById('tbp-tutar-tur')?.value;
  const wrap = document.getElementById('tbp-sabit-wrap');
  if (wrap) wrap.style.display = tur === 'sabit' ? '' : 'none';
  tbpClearPreview();
}

function tbpSabitChange() { tbpClearPreview(); }
function tbpKimeChange() { tbpClearPreview(); tbpManuelTutarChange(); }

function tbpClearPreview() {
  const pw = document.getElementById('tbp-preview-wrap');
  if (pw) pw.innerHTML = '';
  const ab = document.getElementById('tbp-apply-bar');
  if (ab) ab.style.display = 'none';
  window._tbpHedefler = null;
}

function tbpCheckDuplicatePeriod() {
  const aptId = document.getElementById('tbp-apt')?.value;
  const donem = document.getElementById('tbp-donem')?.value;
  const uyariEl = document.getElementById('tbp-donem-uyari');
  if (!uyariEl) return;
  if (!aptId || !donem) { uyariEl.style.display='none'; return; }
  const varMi = (S.aidatBorclandir||[]).find(k => k.aptId==aptId && k.donem===donem);
  if (varMi) {
    const apt = S.apartmanlar.find(a=>a.id==aptId);
    uyariEl.style.display = '';
    uyariEl.innerHTML = `⚠️ <strong>${apt?.ad||'Bu site'}</strong> için <strong>${donem}</strong> döneminde zaten ${varMi.sakinSayisi} daire\u0435ye ₺${fmt(varMi.toplamBorc)} borçlandırma yapılmış. Tekrar borçlandırmak borçları çifte kaydeder!`;
  } else {
    uyariEl.style.display = 'none';
  }
}

function renderTopluBorcOnizle() {
  const aptId     = document.getElementById('tbp-apt')?.value;
  const donem     = document.getElementById('tbp-donem')?.value;
  const tutarTur  = document.getElementById('tbp-tutar-tur')?.value || 'aidat';
  const sabitTutar = parseFloat(document.getElementById('tbp-sabit-tutar')?.value) || 0;
  const kime      = document.getElementById('tbp-kime')?.value || 'malik';
  const tahakkukT = document.getElementById('tbp-tahakkuk-tarih')?.value || '';
  const sonOdemeT = document.getElementById('tbp-son-odeme-tarih')?.value || '';
  const pw = document.getElementById('tbp-preview-wrap');
  const ab = document.getElementById('tbp-apply-bar');

  if (!aptId) { toast('Önce bir site seçin.','warn'); return; }
  if (!donem) { toast('Dönem seçin.','warn'); return; }
  if (tutarTur === 'sabit' && sabitTutar <= 0) { toast('Sabit tutar giriniz.','warn'); return; }

  const apt = S.apartmanlar.find(a=>a.id==aptId);
  if (!apt) return;

  // Aktif sakinleri daire bazında grupla
  const aktifSakinler = S.sakinler.filter(s => s.aptId==aptId && isSakinAktif(s));
  const daireMap = {};
  aktifSakinler.forEach(s => {
    const d = s.daire || '?';
    if (!daireMap[d]) daireMap[d] = {malik:null, kiraci:null};
    if (s.tip==='malik' && !daireMap[d].malik) daireMap[d].malik = s;
    else if (s.tip==='kiralik' && !daireMap[d].kiraci) daireMap[d].kiraci = s;
  });

  const hedefler = [];
  Object.entries(daireMap).forEach(([daireNo, kisiler]) => {
    const hedef = kime==='malik' ? kisiler.malik : (kisiler.kiraci||kisiler.malik);
    if (!hedef) return;
    const tutar = tutarTur==='sabit' ? sabitTutar : (hedef.aidat||hedef.aidatK||apt.aidat||0);
    hedefler.push({sk:hedef, daire:daireNo, tutar, hedefTip: kime==='malik'?'malik':(kisiler.kiraci?'kiraci':'malik')});
  });

  hedefler.sort((a,b) => { const da=parseInt(a.daire)||0, db=parseInt(b.daire)||0; return da-db||a.daire?.localeCompare(b.daire)||0; });
  window._tbpHedefler = hedefler;

  const toplamTutar = hedefler.reduce((s,h)=>s+(h.tutar||0), 0);

  if (!hedefler.length) {
    if (pw) pw.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--tx-3)">Bu sitede aktif sakin kaydı bulunamadı.</div>`;
    if (ab) ab.style.display = 'none';
    return;
  }

  const rows = hedefler.map(h => {
    const tipCls = h.sk.tip==='malik' ? 'b-bl' : 'b-am';
    const tipLbl = h.sk.tip==='malik' ? 'Ev Sahibi' : 'Kiracı';
    const mevcutBorc = h.sk.borc||0;
    return `<tr>
      <td style="font-weight:700;color:var(--brand);width:60px">${h.daire}</td>
      <td style="font-weight:600">${h.sk.ad}</td>
      <td><span class="b ${tipCls}" style="font-size:10px;padding:2px 7px">${tipLbl}</span></td>
      <td style="font-size:11.5px;color:var(--tx-3)">${h.sk.tel||'—'}</td>
      <td style="color:${mevcutBorc>0?'var(--err)':'var(--ok)'}">₺${fmt(mevcutBorc)}</td>
      <td style="width:140px">
        <input type="number" class="fi tbp-tutar-inp"
          id="tbp-t-${h.sk.id}" value="${h.tutar}" min="0" step="0.01"
          style="padding:5px 8px;font-size:13px;font-weight:600;text-align:right"
          oninput="tbpUpdateToplam()">
      </td>
      <td style="color:var(--tx-3);font-size:11.5px">
        ₺${fmt(mevcutBorc)} → <strong style="color:var(--err)">₺${fmt(mevcutBorc+(h.tutar||0))}</strong>
      </td>
    </tr>`;
  }).join('');

  const fmtDate = iso => iso ? new Date(iso+'T00:00').toLocaleDateString('tr-TR') : '—';
  if (pw) pw.innerHTML = `<div class="card" style="padding:0">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:14px;font-weight:700">${apt.ad} — ${donem} Dönemi Önizleme</div>
        <div style="font-size:12px;color:var(--tx-3);margin-top:3px">
          ${hedefler.length} daire · Toplam:
          <strong style="color:var(--err);font-size:15px" id="tbp-toplam-lbl">₺${fmt(toplamTutar)}</strong>
        </div>
        <div style="display:flex;gap:14px;margin-top:6px;flex-wrap:wrap">
          <span style="font-size:11.5px;color:var(--tx-3)">📅 Tahakkuk: <strong style="color:var(--tx-1)">${fmtDate(tahakkukT)}</strong></span>
          ${sonOdemeT ? `<span style="font-size:11.5px;color:var(--tx-3)">⏰ Son Ödeme: <strong style="color:var(--warn)">${fmtDate(sonOdemeT)}</strong></span>` : ''}
        </div>
      </div>
      <div style="font-size:11px;color:var(--tx-3);text-align:right">
        Tutarları değiştirebilirsiniz<br>
        <span style="color:var(--brand)">Son sütun: Borç sonrası durum</span>
      </div>
    </div>
    <div class="tw">
      <table>
        <thead><tr>
          <th>Daire</th><th>Ad Soyad</th><th>Tip</th><th>Telefon</th>
          <th>Mevcut Borç</th><th style="text-align:right">Borçlandırılacak (₺)</th>
          <th>Borç Sonrası</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:var(--s2)">
          <td colspan="5" style="text-align:right;font-weight:700;font-size:13px;padding:10px 14px">Toplam Borçlandırma:</td>
          <td style="font-weight:800;font-size:15px;color:var(--err);text-align:right;padding:10px 14px" id="tbp-toplam-lbl2">₺${fmt(toplamTutar)}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>
  </div>`;

  // Uygula bar'ı güncelle
  if (ab) {
    ab.style.display = 'flex';
    const ozet = document.getElementById('tbp-apply-ozet');
    if (ozet) ozet.innerHTML = `${apt.ad} · ${donem} dönemi · ${hedefler.length} daire · <strong>₺${fmt(toplamTutar)}</strong>`;
  }
}

function tbpUpdateToplam() {
  let top = 0;
  (window._tbpHedefler||[]).forEach(h => {
    top += parseFloat(document.getElementById('tbp-t-'+h.sk.id)?.value)||0;
  });
  const l1 = document.getElementById('tbp-toplam-lbl'); if(l1) l1.textContent='₺'+fmt(top);
  const l2 = document.getElementById('tbp-toplam-lbl2'); if(l2) l2.textContent='₺'+fmt(top);
  // Güncelle satır "sonrası" kolonlarını
  (window._tbpHedefler||[]).forEach(h => {
    const tutar = parseFloat(document.getElementById('tbp-t-'+h.sk.id)?.value)||0;
    h.tutar = tutar; // önizleme verisini de güncelle
  });
  // Apply bar özetini güncelle
  const ozet = document.getElementById('tbp-apply-ozet');
  if (ozet) {
    const aptId = document.getElementById('tbp-apt')?.value;
    const apt = S.apartmanlar.find(a=>a.id==aptId);
    const donem = document.getElementById('tbp-donem')?.value||'';
    const n = (window._tbpHedefler||[]).filter(h=>h.tutar>0).length;
    ozet.innerHTML = `${apt?.ad||''} · ${donem} · ${n} daire · <strong>₺${fmt(top)}</strong>`;
  }
}

function tbpTemizle() {
  const aptEl = document.getElementById('tbp-apt'); if(aptEl) aptEl.value='';
  const acEl  = document.getElementById('tbp-aciklama'); if(acEl) acEl.value='';
  // Tarih alanlarını sıfırla ve manual-edit flag kaldır
  ['tbp-tahakkuk-tarih','tbp-son-odeme-tarih'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; delete el.dataset.manualEdit; }
  });
  // Manuel tutarı sıfırla
  const mEl = document.getElementById('tbp-manuel-tutar'); if (mEl) mEl.value = '';
  const oEl = document.getElementById('tbp-manuel-ozet');  if (oEl) oEl.style.display = 'none';
  tbpClearPreview();
  const uyari = document.getElementById('tbp-donem-uyari'); if(uyari) uyari.style.display='none';
}

function saveTopluBorcPage() {
  if (!_guardCheck()) return;
  const aptId = document.getElementById('tbp-apt')?.value;
  if (!aptId) { toast('Site seçin.','err'); return; }
  const donem = document.getElementById('tbp-donem')?.value;
  if (!donem) { toast('Dönem seçin.','err'); return; }
  const kategori  = document.getElementById('tbp-kategori')?.value || 'Aidat';
  const aciklama  = document.getElementById('tbp-aciklama')?.value?.trim() || '';
  const tahakkukT = document.getElementById('tbp-tahakkuk-tarih')?.value || (donem + '-01');
  const sonOdemeT = document.getElementById('tbp-son-odeme-tarih')?.value || '';
  const hedefler  = window._tbpHedefler || [];
  if (!hedefler.length) { toast('Önce "Önizle" butonuna basın.','warn'); return; }

  let ok=0, toplamBorc=0;
  const detaylar = [];
  const apt = S.apartmanlar.find(a=>a.id==aptId);

  hedefler.forEach(h => {
    const tutar = parseFloat(document.getElementById('tbp-t-'+h.sk.id)?.value)||0;
    if (tutar<=0) return;
    // Sakinin borcunu güncelle
    h.sk.borc = (h.sk.borc||0) + tutar;
    toplamBorc += tutar; ok++;
    detaylar.push({
      id: Date.now() + ok,
      sakId: h.sk.id,
      ad: h.sk.ad,
      daire: h.sk.daire,
      tutar,
      kategori,
      aciklama,
      tarih: tahakkukT,
      aptAd: apt?.ad||''
    });
  });

  if (!ok) { toast('Geçerli tutar bulunamadı.','err'); return; }

  // Cari kaydı oluştur (renderSakinCari tarafından okunur)
  if (!S.aidatBorclandir) S.aidatBorclandir = [];
  const kayitId = Date.now();
  S.aidatBorclandir.push({
    id: kayitId,
    aptId: +aptId,
    aptAd: apt?.ad||'',
    donem,
    tarih:        tahakkukT,   // borç tahakkuk tarihi (artık dönemin 1'i veya kullanıcı seçimi)
    sonOdeme:     sonOdemeT,   // son ödeme tarihi
    kategori,
    aciklama,
    sakinSayisi:  ok,
    toplamBorc,
    detaylar
  });

  save();
  refreshCariIfOpen();
  window._cariAutoOpenKat = kategori;

  // Başarı mesajı
  toast(`✅ ${ok} daire · ₺${fmt(toplamBorc)} borçlandırıldı. Tüm cariler güncellendi.`, 'ok');

  // Formu temizle ve geçmişe geç
  window._tbpHedefler = [];
  tbpClearPreview();
  document.getElementById('tbp-aciklama').value = '';
  const uyari = document.getElementById('tbp-donem-uyari'); if(uyari) uyari.style.display='none';

  // İstatistikleri yenile
  renderTopluBorcPage();

  // Geçmiş sekmesine geç
  setTimeout(() => { goTab('tbp-gecmis'); }, 300);
}

function renderTopluBorcGecmis() {
  const el = document.getElementById('tbp-gecmis-content');
  if (!el) return;

  const kayitlar = (S.aidatBorclandir||[]).slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||''));

  if (!kayitlar.length) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:48px;color:var(--tx-3)">
      <svg viewBox="0 0 24 24" style="width:40px;height:40px;stroke:var(--tx-4);fill:none;stroke-width:1.5;margin-bottom:12px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div style="font-weight:600;font-size:14px">Henüz borçlandırma kaydı yok</div>
      <div style="font-size:12px;margin-top:6px">Yeni Borçlandırma sekmesinden işlem başlatın.</div>
    </div>`;
    return;
  }

  // Ay bazında grupla
  const gruplar = {};
  kayitlar.forEach(k => {
    const ay = k.donem || (k.tarih||'').slice(0,7) || '?';
    if (!gruplar[ay]) gruplar[ay] = [];
    gruplar[ay].push(k);
  });

  let html = '';
  Object.entries(gruplar).sort((a,b)=>b[0].localeCompare(a[0])).forEach(([ay, liste]) => {
    const ayToplam = liste.reduce((s,k)=>s+(k.toplamBorc||0),0);
    const fmtD = iso => iso ? new Date(iso+'T00:00').toLocaleDateString('tr-TR') : '—';
    const rows = liste.map(k => {
      const aptAd = k.aptAd || S.apartmanlar.find(a=>a.id==k.aptId)?.ad || '—';
      const sonOdemeHtml = k.sonOdeme
        ? `<span style="color:var(--warn);font-weight:600">${fmtD(k.sonOdeme)}</span>`
        : '<span style="color:var(--tx-4)">—</span>';
      return `<tr>
        <td style="font-size:11.5px;color:var(--tx-3);white-space:nowrap">${fmtD(k.tarih)}</td>
        <td style="font-weight:600">${aptAd}</td>
        <td><span class="b b-bl" style="font-size:10px">${k.kategori||'Aidat'}</span></td>
        <td>${k.donem||'—'}</td>
        <td style="font-size:11.5px;color:var(--tx-3);white-space:nowrap">${sonOdemeHtml}</td>
        <td style="font-size:11.5px;color:var(--tx-3);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${k.aciklama||'—'}</td>
        <td style="text-align:center">${k.sakinSayisi||0} daire</td>
        <td style="font-weight:700;color:var(--err);text-align:right">₺${fmt(k.toplamBorc||0)}</td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:4px">
            <button class="btn bg xs" onclick="tbpGecmisDrilldown(${k.id||0},'${ay}')" title="Detay">
              <svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="tbpDeleteKayit(${k.id||0})" title="İptal Et / Geri Al">
              <svg viewBox="0 0 24 24" style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    html += `<div class="card mb16" style="padding:0">
      <div style="padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--s2)">
        <div style="font-weight:700;font-size:14px">${ay} Dönemi</div>
        <div style="font-size:13px;color:var(--tx-3)">${liste.length} kayıt · <strong style="color:var(--err)">₺${fmt(ayToplam)}</strong></div>
      </div>
      <div class="tw">
        <table>
          <thead><tr>
            <th>Tahakkuk Tarihi</th><th>Site</th><th>Kategori</th><th>Dönem</th>
            <th>Son Ödeme</th><th>Açıklama</th><th>Daire Sayısı</th><th style="text-align:right">Toplam</th><th>İşlem</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  });

  el.innerHTML = html;
}

function tbpGecmisDrilldown(kayitId, ay) {
  const kayit = (S.aidatBorclandir||[]).find(k=>k.id==kayitId || (!k.id && k.donem===ay));
  if (!kayit || !kayit.detaylar) { toast('Detay bulunamadı.','err'); return; }

  const aptAd = kayit.aptAd || S.apartmanlar.find(a=>a.id==kayit.aptId)?.ad||'—';
  const rows = kayit.detaylar.map(d => {
    const sk = S.sakinler.find(s=>s.id==d.sakId);
    const mevcutBorc = sk ? (sk.borc||0) : '?';
    return `<tr>
      <td style="font-weight:700;color:var(--brand)">${d.daire||'?'}</td>
      <td style="font-weight:600;cursor:pointer;color:var(--brand)" onclick="${sk?'goSakinCari('+d.sakId+');closeModal(\'mod-tbp-drill\')':''}">${d.ad||'?'}${sk?'<span style="font-size:10px;margin-left:4px;color:var(--tx-3)">→</span>':''}</td>
      <td><span class="b b-bl" style="font-size:10px">${d.kategori||'Aidat'}</span></td>
      <td style="font-weight:700;color:var(--err)">₺${fmt(d.tutar||0)}</td>
      <td style="color:${typeof mevcutBorc==='number'&&mevcutBorc>0?'var(--err)':'var(--ok)'}">₺${fmt(mevcutBorc||0)}</td>
    </tr>`;
  }).join('');

  // Modal yoksa oluştur
  let modal = document.getElementById('mod-tbp-drill');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'ov';
    modal.id = 'mod-tbp-drill';
    modal.innerHTML = `<div class="modal" style="max-width:600px">
      <div class="modal-h">
        <div class="modal-t" id="drill-title">Borçlandırma Detayı</div>
        <button class="modal-x" onclick="closeModal('mod-tbp-drill')"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div id="drill-body"></div>
      <div class="modal-f"><button class="btn bg" onclick="closeModal('mod-tbp-drill')">Kapat</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if(e.target===modal) modal.classList.remove('open'); });
  }

  document.getElementById('drill-title').textContent = `${aptAd} — ${kayit.donem||'?'} Detayı`;
  document.getElementById('drill-body').innerHTML = `
    <div style="padding:14px 18px;background:var(--s2);border-bottom:1px solid var(--border);font-size:12.5px;color:var(--tx-3)">
      Kayıt Tarihi: ${kayit.tarih||'—'} · Kategori: ${kayit.kategori||'Aidat'} · ${kayit.aciklama?'Açıklama: '+kayit.aciklama:''}
    </div>
    <div class="tw" style="padding:0 0 4px">
      <table>
        <thead><tr><th>Daire</th><th>Sakin</th><th>Kategori</th><th>Borçlandırılan</th><th>Güncel Borç</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:var(--s2)">
          <td colspan="3" style="text-align:right;font-weight:700;padding:10px 14px">Toplam:</td>
          <td style="font-weight:800;color:var(--err);padding:10px 14px">₺${fmt(kayit.toplamBorc||0)}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>`;

  modal.classList.add('open');
}

function tbpDeleteKayit(kayitId) {
  const kayit = (S.aidatBorclandir||[]).find(k=>k.id==kayitId);
  if (!kayit) { toast('Kayıt bulunamadı.','err'); return; }
  const aptAd = kayit.aptAd || S.apartmanlar.find(a=>a.id==kayit.aptId)?.ad||'?';
  if (!confirm(`${aptAd} — ${kayit.donem} dönemine ait ₺${fmt(kayit.toplamBorc)} tutarlı ${kayit.sakinSayisi} daire borçlandırması GERİ ALINSIN MI?\n\nSakinlerin borçlarından bu tutarlar düşülecek.`)) return;

  // Borçları geri al
  (kayit.detaylar||[]).forEach(d => {
    const sk = S.sakinler.find(s=>s.id==d.sakId);
    if (sk) sk.borc = Math.max(0, (sk.borc||0) - (d.tutar||0));
  });

  // Kaydı sil
  S.aidatBorclandir = (S.aidatBorclandir||[]).filter(k=>k.id!=kayitId);
  save();
  toast(`Borçlandırma geri alındı. ${kayit.sakinSayisi} dairenin borçları düşüldü.`, 'warn');
  renderTopluBorcGecmis();
  renderTopluBorcPage();
}

// ──────────────────────────────────────────────────────────

function openAidatBorcDaire(sakId) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk) return;
  const now = new Date();
  const donem = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('abd-sak-id').value = sakId;
  document.getElementById('abd-sak-ad').value = sk.ad + ' — Daire ' + (sk.daire || '');
  document.getElementById('abd-tarih').value = today();
  document.getElementById('abd-donem').value = donem;
  document.getElementById('abd-tutar').value = sk.aidat || sk.aidatK || '';
  document.getElementById('abd-aciklama').value = '';
  // Gelir tanımlarını kategori dropdownına yükle
  const katEl = document.getElementById('abd-kategori');
  if (katEl) {
    const gelirler = getGelirTanimlari();
    katEl.innerHTML = gelirler.map(t=>`<option value="${t.ad}">${t.ad}</option>`).join('');
  }
  openModal('mod-aidat-borc-daire');
}

function saveAidatBorcDaire() {
  const sakId = +document.getElementById('abd-sak-id').value;
  const donem = document.getElementById('abd-donem').value.trim();
  const tutar = parseFloat(document.getElementById('abd-tutar').value) || 0;
  const tarih = document.getElementById('abd-tarih')?.value || today();
  const aciklama = document.getElementById('abd-aciklama').value.trim();
  if (!donem) { toast('Dönem giriniz!', 'err'); return; }
  if (tutar <= 0) { toast('Tutar giriniz!', 'err'); return; }
  const sk = S.sakinler.find(s => s.id === sakId);
  if (!sk) return;
  // Mevcut kayıtlardan kredi hesapla (fazla ödeme varsa yeni borçla mahsup et)
  const prevTopAidatBorc = (S.aidatBorclandir || []).flatMap(k => k.detaylar || []).filter(d => d.sakId === sakId).reduce((s, d) => s + (d.tutar || 0), 0);
  const prevTopOdeme = (S.tahsilatlar || []).filter(t => t.sakId == sakId || t.sakinId == sakId).reduce((s, o) => s + (o.tutar || 0), 0);
  const netKredi = prevTopOdeme - prevTopAidatBorc;
  sk.borc = netKredi > 0 ? Math.max(0, (sk.borc || 0) + tutar - netKredi) : (sk.borc || 0) + tutar;
  const abdKat = document.getElementById('abd-kategori')?.value || 'Aidat';
  const detayId = Date.now();
  const yeniDetay = { id: detayId, sakId, ad: sk.ad, daire: sk.daire, tutar, tarih, kategori: abdKat, aciklama };
  if (!S.aidatBorclandir) S.aidatBorclandir = [];
  // Her borçlandırma kaydı ayrı bir detay satırı olarak eklenir (merge yapılmaz)
  const kayit = S.aidatBorclandir.find(k => k.donem === donem && k.aptId == sk.aptId);
  if (kayit) {
    if (!kayit.detaylar) kayit.detaylar = [];
    kayit.detaylar.push(yeniDetay);
    kayit.toplamBorc = (kayit.toplamBorc || 0) + tutar;
  } else {
    S.aidatBorclandir.push({ id: Date.now() + 1, aptId: sk.aptId, donem, tarih, sakinSayisi: 1, toplamBorc: tutar, detaylar: [yeniDetay] });
  }
  save();
  window._cariAutoOpenKat = abdKat;
  closeModal('mod-aidat-borc-daire');
  toast(`${sk.ad} için ${donem} dönemi ₺${fmt(tutar)} borçlandırıldı.`, 'ok');
  refreshCariIfOpen();
  const yr = document.querySelector('.dd-year-sel');
  const yil = yr ? +yr.value : new Date().getFullYear();
  renderDaireDetay(sk, yil);
}

function deleteTahsilat(id, sakId) {
  // Daire detay sayfasından soft cancel — aynı merkezi fonksiyonu kullan
  softCancelCollection(id);
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (sk) { const yr = document.querySelector('.dd-year-sel'); renderDaireDetay(sk, yr ? +yr.value : new Date().getFullYear()); }
}

function saveDaireNot(sakId) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk) return;
  sk.not = document.getElementById('dd-note-input')?.value || '';
  save();
  toast('Not kaydedildi.', 'ok');
}

// ── ROL SİSTEMİ ────────────────────────────────
let currentRole = sessionStorage.getItem('syp_role') || '';

function selectRole(role) {
  currentRole = role;
  window._initialHash = window.location.hash;
  sessionStorage.setItem('syp_role', role);
  document.getElementById('role-screen')?.classList.add('hidden');
  document.getElementById('main').style.display = '';
  applyRole(role);
  loadState();
  if (!S.apartmanlar || S.apartmanlar.length === 0) {
    const _orig = window.confirm; window.confirm = () => true; loadDemoData(); window.confirm = _orig;
  } else { initApp(); }
  if (role === 'superadmin') { goPage('superadmin'); return; }
  // Hash restore
  const raw = (window._initialHash || '').slice(1);
  window._initialHash = '';
  if (raw) {
    const parts = raw.split('/');
    const pg = parts[0];
    const id = parts[1] ? +parts[1] : null;
    if (PAGE_TITLES[pg]) {
      window._navStack = [{ page: pg, id, label: PAGE_TITLES[pg] || pg }];
      history.replaceState({ page: pg, id }, '', '#' + raw);
      window._navRestoring = true;
      _navRestorePage(pg, id);
      window._navRestoring = false;
      _navUpdateBreadcrumb();
      return;
    }
  }
  goPage('dashboard');
}

function applyRole(role) {
  // Sidebar menülerini role göre filtrele
  document.querySelectorAll('#sb .ni[data-role]').forEach(el => {
    const roles = el.getAttribute('data-role');
    el.style.display = roles.includes(role) ? '' : 'none';
  });
  // Section labels: boşsa gizle
  document.querySelectorAll('#sb .sb-sec').forEach(sec => {
    const visible = Array.from(sec.querySelectorAll('.ni[data-role]')).filter(n => n.style.display !== 'none');
    const lbl = sec.querySelector('.sb-sec-lbl');
    if (lbl && visible.length === 0) sec.style.display = 'none';
    else sec.style.display = '';
  });
  // Kullanıcı bilgisi güncelle
  const nameEl = document.getElementById('sb-user-name');
  const roleEl = document.getElementById('sb-user-role');
  const avEl = document.getElementById('sb-av-init');
  if (role === 'superadmin') {
    if (nameEl) nameEl.textContent = 'Süper Admin';
    if (roleEl) roleEl.textContent = 'Yazılım Yöneticisi';
    if (avEl) { avEl.textContent = 'SA'; avEl.style.background = '#7c3aed'; avEl.style.color = '#fff'; }
  } else if (role === 'sakin') {
    if (nameEl) nameEl.textContent = 'Site Sakini';
    if (roleEl) roleEl.textContent = 'Daire Sakini';
    if (avEl) { avEl.textContent = 'SK'; avEl.style.background = '#059669'; avEl.style.color = '#fff'; }
  } else {
    const nm = (S.ayarlar?.yonetici) || 'Yönetici';
    if (nameEl) nameEl.textContent = nm;
    if (roleEl) roleEl.textContent = S.ayarlar?.unvan || 'Site Yöneticisi';
    if (avEl) { avEl.textContent = nm.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); avEl.style.background = ''; avEl.style.color = ''; }
  }
}

function switchRole() {
  localStorage.removeItem('syp_role');
  currentRole = '';
  document.getElementById('main').style.display = 'none';
  document.getElementById('role-screen')?.classList.remove('hidden');
}

// ===================================================
// PROJE & TADİLAT TAKİBİ
// ===================================================
let projeEditId = null;

function openProjeModal(id=null) {
  projeEditId = id;
  document.getElementById('mod-proje-title').textContent = id ? '🏗️ Proje Düzenle' : '🏗️ Yeni Proje';
  const aptEl = document.getElementById('prj-apt');
  if (aptEl) aptEl.innerHTML = '<option value="">— Seçin —</option>' + S.apartmanlar.filter(a=>a.durum==='aktif').map(a=>`<option value="${a.id}">${a.ad}</option>`).join('');
  if (id) {
    const p = (S.projeler||[]).find(x=>x.id===id); if (!p) return;
    setTimeout(()=>{
      document.getElementById('prj-ad').value = p.ad||'';
      document.getElementById('prj-apt').value = p.aptId||'';
      document.getElementById('prj-tur').value = p.tur||'bakim';
      document.getElementById('prj-bas').value = p.bas||'';
      document.getElementById('prj-bit').value = p.bit||'';
      document.getElementById('prj-butce').value = p.butce||'';
      document.getElementById('prj-gercek').value = p.gercek||'';
      document.getElementById('prj-durum').value = p.durum||'planlama';
      document.getElementById('prj-firma').value = p.firma||'';
      document.getElementById('prj-aciklama').value = p.aciklama||'';
    },50);
  } else {
    ['prj-ad','prj-bas','prj-bit','prj-butce','prj-gercek','prj-firma','prj-aciklama'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  }
  openModal('mod-proje');
}

function saveProje() {
  const ad = document.getElementById('prj-ad').value.trim();
  const aptId = document.getElementById('prj-apt').value;
  if (!ad) { toast('Proje adı zorunludur.','err'); return; }
  const apt = S.apartmanlar.find(a=>a.id==aptId);
  const rec = {
    id: projeEditId || Date.now(),
    ad, aptId: aptId?+aptId:null, aptAd: apt?apt.ad:'Genel',
    tur: document.getElementById('prj-tur').value,
    bas: document.getElementById('prj-bas').value,
    bit: document.getElementById('prj-bit').value,
    butce: parseFloat(document.getElementById('prj-butce').value)||0,
    gercek: parseFloat(document.getElementById('prj-gercek').value)||0,
    durum: document.getElementById('prj-durum').value,
    firma: document.getElementById('prj-firma').value.trim(),
    aciklama: document.getElementById('prj-aciklama').value.trim(),
    kayit: today()
  };
  if (!S.projeler) S.projeler = [];
  if (projeEditId) { const i=S.projeler.findIndex(x=>x.id===projeEditId); if(i>=0) S.projeler[i]=rec; }
  else S.projeler.push(rec);
  projeEditId = null;
  closeModal('mod-proje'); save(); toast('Proje kaydedildi.','ok'); renderProjeler();
}

function delProje(id) {
  if(!confirm('Bu proje silinsin mi?')) return;
  S.projeler = (S.projeler||[]).filter(x=>x.id!==id);
  save(); toast('Silindi.','warn'); renderProjeler();
}

function renderProjeler() {
  const s = (document.getElementById('prj-srch')?.value||'').toLowerCase();
  const fd = document.getElementById('prj-f-durum')?.value||'';
  const fa = document.getElementById('prj-f-apt')?.value||'';
  // Sync apt dropdown
  const aptEl = document.getElementById('prj-f-apt');
  if (aptEl) { const cur=aptEl.value; aptEl.innerHTML='<option value="">Tüm Apartmanlar</option>'+S.apartmanlar.map(a=>`<option value="${a.id}">${a.ad}</option>`).join(''); aptEl.value=cur; }
  if (!S.projeler) S.projeler = [];
  let list = S.projeler;
  if (fd) list = list.filter(x=>x.durum===fd);
  if (fa) list = list.filter(x=>String(x.aptId)===String(fa));
  if (s) list = list.filter(x=>(x.ad+' '+(x.aptAd||'')+(x.firma||'')).toLowerCase().includes(s));

  // Stats
  const statsEl = document.getElementById('prj-stats');
  if (statsEl) {
    const toplam = (S.projeler||[]).length;
    const devam = (S.projeler||[]).filter(x=>x.durum==='devam').length;
    const tamam = (S.projeler||[]).filter(x=>x.durum==='tamamlandi').length;
    const topButce = (S.projeler||[]).reduce((s,x)=>s+(x.butce||0),0);
    const topGercek = (S.projeler||[]).reduce((s,x)=>s+(x.gercek||0),0);
    statsEl.innerHTML = `
      <div class="sc bar-bl" style="cursor:default"><div class="sc-lbl">Toplam Proje</div><div class="sc-val v-bl">${toplam}</div></div>
      <div class="sc bar-am" style="cursor:default"><div class="sc-lbl">Devam Eden</div><div class="sc-val v-am">${devam}</div></div>
      <div class="sc bar-gr" style="cursor:default"><div class="sc-lbl">Tamamlanan</div><div class="sc-val v-gr">${tamam}</div></div>
      <div class="sc bar-rd" style="cursor:default"><div class="sc-lbl">Toplam Bütçe</div><div class="sc-val v-rd" style="font-size:16px">₺${fmt(topButce)}</div></div>
      <div class="sc bar-gr" style="cursor:default"><div class="sc-lbl">Gerçekleşen</div><div class="sc-val v-gr" style="font-size:16px">₺${fmt(topGercek)}</div></div>`;
  }

  const cont = document.getElementById('prj-liste-icerik'); if (!cont) return;
  if (!list.length) { cont.innerHTML = `<div class="card">${emp('🏗️','Proje kaydı bulunamadı. "Yeni Proje" ile ekleyin.')}</div>`; return; }

  const turIco = {bakim:'🔧',tadilat:'🏗️',yenileme:'✨',guvenlik:'🔒',diger:'📦'};
  const turRenk = {bakim:'#fbbf24',tadilat:'#60a5fa',yenileme:'#34d399',guvenlik:'#a78bfa',diger:'#9ca3af'};
  const durumCls = {planlama:'b-gy',devam:'b-am',tamamlandi:'b-gr',iptal:'b-rd'};
  const durumLbl = {planlama:'Planlama',devam:'Devam Ediyor',tamamlandi:'Tamamlandı',iptal:'İptal'};

  cont.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">${
    list.slice().sort((a,b)=>{const p={devam:0,planlama:1,tamamlandi:2,iptal:3};return (p[a.durum]||0)-(p[b.durum]||0);}).map(p => {
      const pct = p.butce > 0 ? Math.min(100,Math.round((p.gercek/p.butce)*100)) : 0;
      const asimRenk = pct > 100 ? 'var(--err)' : pct > 80 ? 'var(--warn)' : 'var(--ok)';
      const bitGun = p.bit ? dayDiff(p.bit) : null;
      return `<div class="proje-kart" style="border-top:3px solid ${turRenk[p.tur]||'#9ca3af'}">
        <div class="proje-kart-head">
          <div class="proje-tur-ico" style="background:${turRenk[p.tur]||'#9ca3af'}22">${turIco[p.tur]||'📦'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:700;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.ad}</div>
            <div style="font-size:11.5px;color:var(--tx-3)">${p.aptAd||'Genel'} ${p.firma?'· '+p.firma:''}</div>
          </div>
          <span class="b ${durumCls[p.durum]||'b-gy'}">${durumLbl[p.durum]||p.durum}</span>
        </div>
        ${p.aciklama?`<div style="font-size:12px;color:var(--tx-2);margin-bottom:10px;line-height:1.4">${p.aciklama.slice(0,100)}${p.aciklama.length>100?'…':''}</div>`:''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin-bottom:10px">
          <div><span style="color:var(--tx-3)">Başlangıç:</span> <strong>${p.bas||'—'}</strong></div>
          <div><span style="color:var(--tx-3)">Bitiş:</span> <strong style="color:${bitGun!==null&&bitGun<0?'var(--err)':bitGun!==null&&bitGun<7?'var(--warn)':'inherit'}">${p.bit||'—'}${bitGun!==null?bitGun<0?' ('+Math.abs(bitGun)+' gün geçti)':' ('+bitGun+' gün)':''}</strong></div>
          <div><span style="color:var(--tx-3)">Bütçe:</span> <strong style="color:var(--brand)">₺${fmt(p.butce||0)}</strong></div>
          <div><span style="color:var(--tx-3)">Gerçekleşen:</span> <strong style="color:${asimRenk}">₺${fmt(p.gercek||0)}</strong></div>
        </div>
        ${p.butce>0?`<div>
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span style="color:var(--tx-3)">Bütçe Kullanımı</span><span style="font-weight:700;color:${asimRenk}">${pct}%</span></div>
          <div class="proje-progress"><div class="proje-progress-bar" style="width:${Math.min(pct,100)}%;background:${asimRenk}"></div></div>
        </div>`:''}
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button class="btn bg xs" onclick="openProjeModal(${p.id})">✏️ Düzenle</button>
          ${p.durum!=='tamamlandi'?`<button class="btn bgn xs" onclick="setProjeDurum(${p.id},'tamamlandi')">✅ Tamamla</button>`:''}
          ${p.durum==='planlama'?`<button class="btn xs" style="background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn-bd)" onclick="setProjeDurum(${p.id},'devam')">▶ Başlat</button>`:''}
          <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delProje(${p.id})">🗑️ Sil</button>
        </div>
      </div>`;
    }).join('')
  }</div>`;

  // Takvim
  renderProjeTakvim();
}

function setProjeDurum(id, durum) {
  const p = (S.projeler||[]).find(x=>x.id===id); if(!p) return;
  p.durum = durum; save(); toast('Durum güncellendi.','ok'); renderProjeler();
}

function renderProjeTakvim() {
  const el = document.getElementById('prj-takvim-icerik'); if (!el) return;
  const aktif = (S.projeler||[]).filter(x=>x.durum==='devam'||x.durum==='planlama').sort((a,b)=>(a.bas||'').localeCompare(b.bas||''));
  if (!aktif.length) { el.innerHTML = emp('📅','Aktif veya planlanan proje yok.'); return; }
  el.innerHTML = aktif.map(p => {
    const pct = p.butce>0?Math.min(100,Math.round((p.gercek/p.butce)*100)):0;
    return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div class="fbc mb4">
        <div><strong>${p.ad}</strong> <span class="t3" style="font-size:11px">— ${p.aptAd||'Genel'}</span></div>
        <div style="font-size:11.5px;color:var(--tx-3)">${p.bas||'?'} → ${p.bit||'?'}</div>
      </div>
      <div class="proje-progress" style="height:6px"><div class="proje-progress-bar" style="width:${pct}%;background:var(--brand)"></div></div>
    </div>`;
  }).join('');
}

// ===================================================
// İLETİŞİM MODÜLÜ
// ===================================================
let iletEditId = null;

function openIletisimModal() {
  // Populate sakin select
  const sakEl = document.getElementById('ilet-sak');
  if (sakEl) sakEl.innerHTML = '<option value="">— Sakin Seçin —</option>' + S.sakinler.map(sk=>`<option value="${sk.id}">${sk.ad} (${sk.aptAd||'?'} / ${sk.daire||'?'})</option>`).join('');
  const tarEl = document.getElementById('ilet-tarih');
  if (tarEl && !tarEl.value) tarEl.value = today();
  goTab('ilet-yeni');
}

function saveIletisimLog() {
  const sakId = document.getElementById('ilet-sak')?.value;
  const konu = document.getElementById('ilet-konu')?.value.trim();
  if (!sakId || !konu) { toast('Sakin ve konu zorunludur.','err'); return; }
  const sk = S.sakinler.find(x=>x.id==sakId);
  const rec = {
    id: iletEditId || Date.now(),
    sakId: +sakId, sakAd: sk?sk.ad:'', aptAd: sk?sk.aptAd:'', daire: sk?sk.daire:'',
    tip: document.getElementById('ilet-tip')?.value || 'arama',
    tarih: document.getElementById('ilet-tarih')?.value || today(),
    konu, not: document.getElementById('ilet-not')?.value.trim() || '',
    sonuc: document.getElementById('ilet-sonuc')?.value || 'tamamlandi'
  };
  if (!S.iletisimLoglari) S.iletisimLoglari = [];
  if (iletEditId) { const i=S.iletisimLoglari.findIndex(x=>x.id===iletEditId); if(i>=0) S.iletisimLoglari[i]=rec; }
  else S.iletisimLoglari.push(rec);
  iletEditId = null;
  ['ilet-konu','ilet-not'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  save(); toast('İletişim kaydı eklendi.','ok'); goTab('ilet-log'); renderIletisim();
}

function delIletisimLog(id) {
  if (!confirm('Silinsin mi?')) return;
  S.iletisimLoglari = (S.iletisimLoglari||[]).filter(x=>x.id!==id);
  save(); toast('Silindi.','warn'); renderIletisim();
}

function renderIletisim() {
  const s = (document.getElementById('ilet-srch')?.value||'').toLowerCase();
  const ft = document.getElementById('ilet-f-tip')?.value||'';
  const fa = document.getElementById('ilet-f-apt')?.value||'';
  // Sync apt dropdown
  const aptEl = document.getElementById('ilet-f-apt');
  if (aptEl) { const cur=aptEl.value; aptEl.innerHTML='<option value="">Tüm Apartmanlar</option>'+S.apartmanlar.map(a=>`<option value="${a.ad}">${a.ad}</option>`).join(''); aptEl.value=cur; }
  if (!S.iletisimLoglari) S.iletisimLoglari = [];
  let list = S.iletisimLoglari.slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||''));
  if (ft) list = list.filter(x=>x.tip===ft);
  if (fa) list = list.filter(x=>x.aptAd===fa);
  if (s) list = list.filter(x=>(x.sakAd+' '+x.konu+' '+(x.not||'')).toLowerCase().includes(s));
  const cont = document.getElementById('ilet-liste-icerik'); if (!cont) return;
  if (!list.length) { cont.innerHTML = `<div class="card">${emp('💬','İletişim kaydı bulunamadı. "Yeni Log" ile ekleyin.')}</div>`; return; }
  const tipIco = {arama:'📞',sms:'💬',ziyaret:'🚪',email:'📧',whatsapp:'📱'};
  const sonucCls = {tamamlandi:'b-gr',bekliyor:'b-am',cevapsiz:'b-rd'};
  const sonucLbl = {tamamlandi:'Tamamlandı',bekliyor:'Takip Gerekiyor',cevapsiz:'Cevapsız'};
  cont.innerHTML = `<div class="card"><div class="card-title">İletişim Geçmişi (${list.length} kayıt)</div>${
    list.map(x=>`<div class="ilet-item">
      <div class="ilet-tur-ico">${tipIco[x.tip]||'💬'}</div>
      <div class="ilet-body">
        <div class="ilet-konu">${x.konu}</div>
        <div class="ilet-meta">${x.sakAd} · ${x.aptAd||'?'} Daire ${x.daire||'?'} · ${x.tarih||'—'}</div>
        ${x.not?`<div style="font-size:12px;color:var(--tx-2);margin-top:3px;line-height:1.4">${x.not}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="b ${sonucCls[x.sonuc]||'b-gy'}" style="font-size:10px">${sonucLbl[x.sonuc]||x.sonuc}</span>
        <button class="btn xs" style="font-size:10px;background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delIletisimLog(${x.id})">🗑</button>
      </div>
    </div>`).join('')
  }</div>`;

  // Şablonlar
  renderIletisimSablonlar();
}

function renderIletisimSablonlar() {
  const el = document.getElementById('ilet-sablon-icerik'); if (!el) return;
  el.innerHTML = `<div class="card-title" style="margin-bottom:14px">Hazır İletişim Şablonları</div>
  <div class="export-grid">
    ${[
      {ikon:'💰',baslik:'Gecikmiş Aidat Hatırlatması',aciklama:'Borçlu sakin için SMS/WhatsApp mesajı',tip:'aidat'},
      {ikon:'📅',baslik:'Toplantı Daveti',aciklama:'Kat malikleri kurulu toplantısı daveti',tip:'toplanti'},
      {ikon:'🔧',baslik:'Bakım/Tadilat Bildirimi',aciklama:'Planlanan bakım/tadilat hakkında bilgilendirme',tip:'bakim'},
      {ikon:'📢',baslik:'Genel Duyuru',aciklama:'Tüm sakinlere genel bilgilendirme mesajı',tip:'genel'},
      {ikon:'📊',baslik:'Borç Durum Raporu',aciklama:'Sakin borç bilgisi içeren kişisel mesaj',tip:'borc'},
      {ikon:'🎉',baslik:'Hoş Geldin Mesajı',aciklama:'Yeni sakin için karşılama mesajı',tip:'hosgeldin'},
    ].map(s=>`<div class="export-card">
      <div class="export-card-ico">${s.ikon}</div>
      <div class="export-card-title">${s.baslik}</div>
      <div class="export-card-desc">${s.aciklama}</div>
      <button class="btn bp xs mt4" onclick="showIletisimSablon('${s.tip}')">Şablonu Görüntüle</button>
    </div>`).join('')}
  </div>`;
}

function showIletisimSablon(tip, sakId=null) {
  const sk = sakId ? S.sakinler.find(x=>x.id==sakId) : null;
  const aptAd = sk?.aptAd || '[Apartman Adı]';
  const sakAd = sk?.ad || '[Sakin Adı]';
  const borc = sk ? '₺'+fmt(sk.borc||0) : '[Borç Tutarı]';
  const sablonlar = {
    aidat: `Sayın ${sakAd},\n\n${aptAd} sakinlerimize ait aidat borcunuzun bulunduğunu hatırlatmak isteriz.\n\nBorç Tutarı: ${borc}\n\nÖdemenizi en kısa sürede yapmamızı rica ederiz.\n\nSaygılarımızla,\nSite Yönetimi`,
    toplanti: `Sayın Kat Maliki,\n\n${aptAd} Kat Malikleri Kurulu Toplantısı düzenlenecektir.\n\nTarih: [Tarih]\nSaat: [Saat]\nYer: [Yer]\n\nGündem:\n1. [Madde 1]\n2. [Madde 2]\n\nKatılımınızı bekleriz.\n\nSaygılarımızla,\nSite Yönetimi`,
    bakim: `Sayın ${sakAd},\n\n${aptAd} binasında aşağıdaki bakım/tadilat çalışması gerçekleştirilecektir.\n\nİş: [Bakım Türü]\nTarih: [Tarih]\nSüre: [Tahmini Süre]\n\nBu süre zarfında [etkilenen bölüm] kullanımı kısıtlanabilir.\n\nAnlayışınız için teşekkür ederiz.\n\nSaygılarımızla,\nSite Yönetimi`,
    genel: `Sayın ${sakAd},\n\n${aptAd} Yönetimi olarak bilginize sunmak istediğimiz konu:\n\n[Duyuru İçeriği]\n\nSorularınız için yönetici ile iletişime geçebilirsiniz.\n\nSaygılarımızla,\nSite Yönetimi`,
    borc: `Sayın ${sakAd},\n\n${aptAd} hesabınıza ilişkin güncel borç durumunuz aşağıdaki gibidir:\n\nToplam Borç: ${borc}\n\nDetaylı bilgi için lütfen site yönetimi ile iletişime geçiniz.\n\nSaygılarımızla,\nSite Yönetimi`,
    hosgeldin: `Sayın ${sakAd},\n\n${aptAd}'na hoş geldiniz!\n\nBize güvendiğiniz için teşekkür ederiz. Herhangi bir sorunuz veya talebiniz olduğunda yönetici ile iletişime geçmekten çekinmeyiniz.\n\nSite hakkında bilmeniz gerekenler:\n• Aidat ödeme tarihleri: Her ayın [gün]. günü\n• Yönetici telefonu: [Tel]\n• Acil durum: [Tel]\n\nHoş günler dileriz!\n\nSaygılarımızla,\nSite Yönetimi`
  };
  const txt = sablonlar[tip] || 'Şablon bulunamadı.';
  document.getElementById('mod-ilet-sablon-body').textContent = txt;
  window._currentSablon = txt;
  openModal('mod-ilet-sablon');
}

function copyIletisimSablon() {
  const txt = window._currentSablon || '';
  navigator.clipboard.writeText(txt).then(()=>toast('Şablon kopyalandı!','ok')).catch(()=>{ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Kopyalandı!','ok'); });
}

// ===================================================
// SAKİN PORTALI & QR KOD
// ===================================================
function openQrModal(sakId) {
  const sk = S.sakinler.find(x=>x.id==sakId); if (!sk) return;
  const token = btoa(String(sakId) + '_' + (sk.ad||'').replace(/\s/g,'') + '_syp').replace(/=/g,'');
  const url = window.location.href.split('?')[0] + '?portal=' + sakId + '&t=' + token;
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
  document.getElementById('mod-qr-body').innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">${sk.ad}</div>
      <div style="font-size:12px;color:var(--tx-3)">${sk.aptAd||'?'} · Daire ${sk.daire||'?'}</div>
    </div>
    <img src="${qrUrl}" alt="QR Kod" style="border-radius:12px;border:4px solid var(--border);display:block;margin:0 auto 14px" onerror="this.style.display='none'">
    <div style="font-size:10.5px;color:var(--tx-3);word-break:break-all;background:var(--s2);padding:8px;border-radius:6px;margin-bottom:10px">${url}</div>
    <button class="btn bg xs" onclick="navigator.clipboard.writeText('${url}').then(()=>toast('Link kopyalandı!','ok'))">📋 Linki Kopyala</button>
  `;
  openModal('mod-qr');
}

// ===================================================
// DUYURU — OKUNDU TAKİBİ
// ===================================================
function duyuruOkunduToggle(duyuruId) {
  if (!S.duyuruOkundu) S.duyuruOkundu = {};
  const key = String(duyuruId);
  S.duyuruOkundu[key] = !S.duyuruOkundu[key];
  save();
  const btn = document.querySelector(`[data-duyuru-okundu="${duyuruId}"]`);
  if (btn) { btn.textContent = S.duyuruOkundu[key] ? '✅ Okundu' : '○ Okunmadı'; btn.style.color = S.duyuruOkundu[key] ? 'var(--ok)' : 'var(--tx-3)'; }
}

// ===================================================
// RAPORLAMA — EXCEL EXPORT
// ===================================================
function exportSakinBorcRaporu() {
  const aptId = selectedAptId;
  let list = S.sakinler;
  if (aptId) list = list.filter(x=>x.aptId==aptId);
  const borcluList = list.filter(x=>(x.borc||0)>0).sort((a,b)=>(b.borc||0)-(a.borc||0));
  if (!borcluList.length) { toast('Borçlu sakin bulunamadı.','warn'); return; }
  const wb = XLSX.utils.book_new();
  const rows = [['Ad Soyad','Apartman','Daire','Kat','Tip','Telefon','Borç (₺)','Aidat (₺)']];
  borcluList.forEach(sk => rows.push([sk.ad, sk.aptAd||'', sk.daire||'', sk.kat||'', sk.tip==='malik'?'Kat Maliki':'Kiracı', sk.tel||'', sk.borc||0, sk.aidat||0]));
  rows.push(['']);
  rows.push(['Toplam Borç', '', '', '', '', '', borcluList.reduce((s,x)=>s+(x.borc||0),0), '']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:25},{wch:20},{wch:8},{wch:6},{wch:12},{wch:15},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, 'Borç Raporu');
  XLSX.writeFile(wb, 'sakin-borc-raporu-' + today() + '.xlsx');
  toast('Excel indiriliyor…','ok');
}

function exportFinansRaporu() {
  const aptId = selectedAptId;
  let list = S.finansIslemler || [];
  if (aptId) list = list.filter(x=>x.aptId==aptId);
  if (!list.length) { toast('Finansal işlem bulunamadı.','warn'); return; }
  const wb = XLSX.utils.book_new();
  const rows = [['Tarih','Tür','Kategori','Apartman','Açıklama','Tutar (₺)','Yöntem']];
  list.slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||'')).forEach(f => rows.push([f.tarih||'', f.tur==='gelir'?'Gelir':'Gider', f.kat||'', f.aptAd||'', f.aciklama||'', f.tutar||0, f.yontem||'']));
  const topGelir = list.filter(x=>x.tur==='gelir').reduce((s,x)=>s+(x.tutar||0),0);
  const topGider = list.filter(x=>x.tur==='gider').reduce((s,x)=>s+(x.tutar||0),0);
  rows.push(['']);
  rows.push(['Toplam Gelir','','','','',topGelir,'']);
  rows.push(['Toplam Gider','','','','',topGider,'']);
  rows.push(['Net Bakiye','','','','',topGelir-topGider,'']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:12},{wch:8},{wch:18},{wch:20},{wch:30},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, 'Finansal Rapor');
  XLSX.writeFile(wb, 'finans-raporu-' + today() + '.xlsx');
  toast('Excel indiriliyor…','ok');
}

function exportPersonelMaasRaporu() {
  if (!S.personel.length) { toast('Personel bulunamadı.','warn'); return; }
  const wb = XLSX.utils.book_new();
  const aktif = S.personel.filter(p=>p.durum==='aktif');
  const rows = [['Ad Soyad','Görev','Apartman','Telefon','Maaş (₺)','Başlangıç','Durum']];
  aktif.forEach(p => rows.push([p.ad, perGorevLbl[p.gorev]||p.gorev||'', p.aptAd||'Genel', p.tel||'', p.maas||0, p.bas||'', 'Aktif']));
  rows.push(['']);
  rows.push(['Toplam Maaş Gideri','','','','',aktif.reduce((s,p)=>s+(p.maas||0),0),'']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:25},{wch:18},{wch:20},{wch:15},{wch:12},{wch:12},{wch:10}];
  XLSX.utils.book_append_sheet(wb, ws, 'Personel Raporu');
  XLSX.writeFile(wb, 'personel-maas-raporu-' + today() + '.xlsx');
  toast('Excel indiriliyor…','ok');
}

function exportAidatTahsilatRaporu() {
  const aptId = selectedAptId;
  let sakinler = S.sakinler;
  if (aptId) sakinler = sakinler.filter(x=>x.aptId==aptId);
  if (!sakinler.length) { toast('Sakin bulunamadı.','warn'); return; }
  const wb = XLSX.utils.book_new();
  const rows = [['Ad Soyad','Apartman','Daire','Aylık Aidat (₺)','Toplam Borç (₺)','Durum']];
  sakinler.sort((a,b)=>(b.borc||0)-(a.borc||0)).forEach(sk => {
    rows.push([sk.ad, sk.aptAd||'', sk.daire||'', sk.aidat||0, sk.borc||0, (sk.borc||0)>0?'Borçlu':'0']);
  });
  rows.push(['']);
  rows.push(['Toplam Aidat Geliri (Aylık)','','','',sakinler.reduce((s,x)=>s+(x.aidat||0),0),'']);
  rows.push(['Toplam Gecikmiş Borç','','','',sakinler.reduce((s,x)=>s+(x.borc||0),0),'']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:25},{wch:20},{wch:8},{wch:16},{wch:16},{wch:10}];
  XLSX.utils.book_append_sheet(wb, ws, 'Aidat Tahsilat');
  XLSX.writeFile(wb, 'aidat-tahsilat-raporu-' + today() + '.xlsx');
  toast('Excel indiriliyor…','ok');
}

// ═══════════════════════════════════════════════════════════════════
// FİNANSAL ÇEKİRDEK — Sprint 1A
// LedgerService  : çift taraflı muhasebe defteri yazma/okuma
// AuditService   : kim/ne zaman/ne yaptı izleme
// ─────────────────────────────────────────────────────────────────
// TASARIM PRENSİBİ:
//   • Her finansal işlem (borç, tahsilat, ters kayıt) ledger_entries'e yazılır
//   • Supabase bağlıysa gerçek tabloya, değilse S.ledgerEntries[]'e yazar
//   • Okuma her zaman S.ledgerEntries'den yapılır (sync sonrası dolar)
//   • Eski sk.borc scalar'ı yedek olarak korunur, ledger yoksa fallback
// ═══════════════════════════════════════════════════════════════════

const LedgerService = {

  /** Benzersiz ID üretici — Date.now çakışmasını önler */
  _uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID)
      return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  },

  /**
   * Borçlandırma → DEBIT kaydı
   * @param {object} p
   * @param {number|string} p.siteId    - Apartman ID
   * @param {number|string} [p.personId]
   * @param {string}        [p.unitNo]
   * @param {number}        p.amount
   * @param {string}        p.category  - 'aidat', 'kira', vb.
   * @param {string}        p.period    - 'YYYY-MM'
   * @param {string}        [p.docNo]
   * @param {string}        [p.description]
   * @param {string}        [p.date]    - ISO YYYY-MM-DD
   * @param {string}        [p.refId]   - kaynak kayıt id
   * @param {string}        [p.source]  - 'manuel'|'toplu'|'otomasyon'
   * @returns {object}  yazılan entry
   */
  recordAccrual(p) {
    const entry = {
      id:          this._uid(),
      site_id:     p.siteId,
      person_id:   p.personId   || null,
      unit_no:     p.unitNo     || null,
      entry_type:  'accrual',
      ref_type:    'aidatBorclandir',
      ref_id:      p.refId      || null,
      debit:       Math.abs(p.amount),
      credit:      0,
      period:      p.period     || null,
      doc_no:      p.docNo      || null,
      description: p.description || `${p.category} — ${p.period || ''}`,
      date:        p.date       || today(),
      source:      p.source     || 'manuel',
      created_by:  _currentUser?.id || 'local',
      created_at:  new Date().toISOString(),
      status:      'active'
    };
    S.ledgerEntries = S.ledgerEntries || [];
    S.ledgerEntries.push(entry);
    // Supabase gerçek tablo yazımı (tablo mevcutsa)
    if (_supabase && _currentUser) {
      _supabase.from('ledger_entries').insert(entry)
        .then(({ error }) => { if (error) console.warn('[Ledger] accrual write:', error.message); });
    }
    return entry;
  },

  /**
   * Tahsilat → CREDIT kaydı
   */
  recordCollection(p) {
    const entry = {
      id:          this._uid(),
      site_id:     p.siteId,
      person_id:   p.personId   || null,
      unit_no:     p.unitNo     || null,
      entry_type:  'collection',
      ref_type:    'tahsilatlar',
      ref_id:      p.refId      || null,
      debit:       0,
      credit:      Math.abs(p.amount),
      period:      p.period     || null,
      doc_no:      p.receiptNo  || p.docNo || null,
      description: p.description || `Tahsilat — ${p.receiptNo || ''}`,
      date:        p.date       || today(),
      source:      p.source     || 'manuel',
      created_by:  _currentUser?.id || 'local',
      created_at:  new Date().toISOString(),
      status:      'active'
    };
    S.ledgerEntries = S.ledgerEntries || [];
    S.ledgerEntries.push(entry);
    if (_supabase && _currentUser) {
      _supabase.from('ledger_entries').insert(entry)
        .then(({ error }) => { if (error) console.warn('[Ledger] collection write:', error.message); });
    }
    return entry;
  },

  /**
   * Ters kayıt (iptal/iade) → karşı tarafı CREDIT/DEBIT ile sıfırlar
   */
  recordReversal(p) {
    const entry = {
      id:          this._uid(),
      site_id:     p.siteId,
      person_id:   p.personId   || null,
      unit_no:     p.unitNo     || null,
      entry_type:  'reversal',
      ref_type:    p.refType    || null,
      ref_id:      p.refId      || null,
      debit:       p.debit      || 0,
      credit:      p.credit     || 0,
      period:      p.period     || null,
      doc_no:      p.docNo      || null,
      description: p.description || `İptal — ${p.docNo || ''}`,
      date:        today(),
      source:      'reversal',
      created_by:  _currentUser?.id || 'local',
      created_at:  new Date().toISOString(),
      status:      'active'
    };
    S.ledgerEntries = S.ledgerEntries || [];
    S.ledgerEntries.push(entry);
    if (_supabase && _currentUser) {
      _supabase.from('ledger_entries').insert(entry)
        .then(({ error }) => { if (error) console.warn('[Ledger] reversal write:', error.message); });
    }
    return entry;
  },

  /**
   * Kişinin net bakiyesini hesapla
   * Ledger varsa ledger'dan, yoksa sk.borc scalar fallback
   */
  getPersonBalance(personId, siteId) {
    const entries = (S.ledgerEntries || []).filter(e =>
      String(e.person_id) === String(personId) &&
      String(e.site_id)   === String(siteId) &&
      e.status !== 'cancelled'
    );
    if (!entries.length) {
      const sk = (S.sakinler || []).find(x => x.id == personId);
      return sk ? Math.max(0, sk.borc || 0) : 0;
    }
    const debit  = entries.reduce((s, e) => s + (e.debit  || 0), 0);
    const credit = entries.reduce((s, e) => s + (e.credit || 0), 0);
    return Math.max(0, debit - credit);
  },

  /**
   * Kişi hesap ekstresi (kronolojik, birikimli bakiye ile)
   */
  getPersonStatement(personId, siteId, { startDate, endDate } = {}) {
    let entries = (S.ledgerEntries || []).filter(e =>
      String(e.person_id) === String(personId) &&
      String(e.site_id)   === String(siteId) &&
      e.status !== 'cancelled'
    );
    if (startDate) entries = entries.filter(e => e.date >= startDate);
    if (endDate)   entries = entries.filter(e => e.date <= endDate);
    entries.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    let balance = 0;
    return entries.map(e => {
      balance += (e.debit || 0) - (e.credit || 0);
      return { ...e, running_balance: balance };
    });
  }
};

// ─────────────────────────────────────────────────────────────────
const AuditService = {
  /**
   * Her kritik finansal işlemde çağrılır — asenkron, hata durumunda sessiz
   * @param {object} p
   * @param {'CREATE'|'UPDATE'|'DELETE'|'REVERSE'|'EXPORT'|'LOGIN'} p.action
   * @param {string}  p.entityType  - 'tahsilatlar'|'finansIslemler'|'aidatBorclandir'...
   * @param {*}       [p.entityId]
   * @param {object}  [p.oldValues]
   * @param {object}  [p.newValues]
   * @param {number|string} [p.siteId]
   */
  log(p) {
    const entry = {
      id:          Date.now().toString(36) + Math.random().toString(36).slice(2),
      user_id:     _currentUser?.id  || 'local',
      user_email:  _currentUser?.email || 'local',
      site_id:     p.siteId          || null,
      action:      p.action,
      entity_type: p.entityType      || null,
      entity_id:   String(p.entityId || ''),
      old_values:  p.oldValues       || null,
      new_values:  p.newValues       || null,
      created_at:  new Date().toISOString()
    };
    S.auditLogs = S.auditLogs || [];
    // Audit log max 500 kayıt (localStorage şişmesini önle)
    if (S.auditLogs.length >= 500) S.auditLogs.splice(0, 100);
    S.auditLogs.push(entry);
    if (_supabase && _currentUser) {
      _supabase.from('audit_logs').insert(entry)
        .then(({ error }) => { if (error) console.warn('[Audit] log write:', error.message); });
    }
  }
};

// ─────────────────────────────────────────────────────────────────
/**
 * migrateLegacyDataToLedger
 * Mevcut S.tahsilatlar + S.aidatBorclandir kayıtlarını
 * S.ledgerEntries'e CREDIT/DEBIT olarak tek seferlik aktar.
 * S._ledgerMigrated=true bayrağı ile tekrar çalışmaz.
 */
function migrateLegacyDataToLedger() {
  if (S._ledgerMigrated) return;
  S.ledgerEntries = S.ledgerEntries || [];
  let count = 0;

  // 1. Mevcut borçlandırmalar → DEBIT
  (S.aidatBorclandir || []).forEach(kayit => {
    (kayit.detaylar || []).forEach(d => {
      if (d._migrated) return;
      // Eğer zaten bu kaynak için ledger entry varsa atla
      const already = S.ledgerEntries.some(e =>
        e.ref_type === 'aidatBorclandir' && e.ref_id === String(kayit.aptId) + '_' + kayit.donem + '_' + d.sakId
      );
      if (already) return;
      S.ledgerEntries.push({
        id:          'mig_acc_' + (kayit.aptId || '') + '_' + (kayit.donem || '') + '_' + (d.sakId || '') + '_' + Date.now(),
        site_id:     kayit.aptId,
        person_id:   d.sakId,
        unit_no:     d.daire || null,
        entry_type:  'accrual',
        ref_type:    'aidatBorclandir',
        ref_id:      String(kayit.aptId) + '_' + kayit.donem + '_' + d.sakId,
        debit:       d.tutar || 0,
        credit:      0,
        period:      kayit.donem,
        doc_no:      null,
        description: `[Geçiş] ${d.kategori || 'Aidat'} — ${kayit.donem || ''}`,
        date:        kayit.tarih || today(),
        source:      'migration',
        created_by:  'migration',
        created_at:  new Date().toISOString(),
        status:      'active'
      });
      count++;
    });
  });

  // 2. Mevcut tahsilatlar → CREDIT
  (S.tahsilatlar || []).filter(t => t.status !== 'cancelled').forEach(t => {
    const already = S.ledgerEntries.some(e =>
      e.ref_type === 'tahsilatlar' && e.ref_id === String(t.id)
    );
    if (already) return;
    S.ledgerEntries.push({
      id:          'mig_col_' + t.id,
      site_id:     t.aptId,
      person_id:   t.sakId || t.sakinId,
      unit_no:     t.daire || null,
      entry_type:  'collection',
      ref_type:    'tahsilatlar',
      ref_id:      String(t.id),
      debit:       0,
      credit:      t.tutar || 0,
      period:      t.donem || null,
      doc_no:      t.no    || null,
      description: `[Geçiş] ${t.tip || 'Tahsilat'} — ${t.no || ''}`,
      date:        t.tarih || today(),
      source:      'migration',
      created_by:  'migration',
      created_at:  new Date().toISOString(),
      status:      'active'
    });
    count++;
  });

  S._ledgerMigrated = true;
  if (count > 0) {
    save();
    console.log(`[Migration] ${count} legacy kayıt ledger'a aktarıldı.`);
  }
}

// ══════════════════════════════════════════════════════════
// ALLOCATION SERVICE — FIFO Kısmi Ödeme & Borca Dağıtım
// ══════════════════════════════════════════════════════════
const AllocationService = {

  /**
   * Kişinin ödenmemiş borçlarını eskiden yeniye (FIFO) sıralar
   */
  getPendingDebts(personId, aptId) {
    const debts = [];
    (S.aidatBorclandir || []).forEach(kayit => {
      if (aptId && String(kayit.aptId) !== String(aptId)) return;
      (kayit.detaylar || []).forEach(d => {
        if (String(d.sakId) !== String(personId)) return;
        if (d.status === 'cancelled' || d.status === 'paid') return;
        const remaining = d.remaining !== undefined ? d.remaining : (d.tutar || 0);
        if (remaining <= 0.005) return;
        debts.push({
          kayitId:   String(kayit.aptId) + '_' + kayit.donem,
          donem:     kayit.donem || '',
          sonOdeme:  kayit.sonOdeme || '',
          kategori:  d.kategori || 'Aidat',
          tutar:     d.tutar || 0,
          remaining,
          _detayRef: d
        });
      });
    });
    // FIFO: en eski vade tarihi önce
    return debts.sort((a, b) =>
      (a.sonOdeme || a.donem || '').localeCompare(b.sonOdeme || b.donem || '')
    );
  },

  /**
   * Ödeme tutarını en eski borçtan başlayarak dağıtır.
   * Detay nesnelerini DOĞRUDAN günceller (S.aidatBorclandir üzerinde).
   * @returns {{ allocations: Array<{donem,kategori,applied}>, unallocated: number }}
   */
  allocate(personId, aptId, paymentAmount) {
    const debts = this.getPendingDebts(personId, aptId);
    let remaining = Math.round(paymentAmount * 100) / 100;
    const allocations = [];

    debts.forEach(d => {
      if (remaining < 0.01) return;
      const applied = Math.round(Math.min(remaining, d.remaining) * 100) / 100;
      d._detayRef.remaining = Math.round((d.remaining - applied) * 100) / 100;
      if (d._detayRef.remaining < 0.01) {
        d._detayRef.remaining = 0;
        d._detayRef.status = 'paid';
      }
      remaining = Math.round((remaining - applied) * 100) / 100;
      allocations.push({ donem: d.donem, kategori: d.kategori, applied });
    });

    return { allocations, unallocated: Math.max(0, remaining) };
  }
};

// ══════════════════════════════════════════════════════════
// LATE FEES SERVICE — Gecikme Faizi Hesaplama & Uygulama
// ══════════════════════════════════════════════════════════
const LateFeesService = {

  getRate() {
    return parseFloat(S.ayarlar && S.ayarlar.gecikme_faiz_orani ? S.ayarlar.gecikme_faiz_orani : 0) / 100;
  },

  /**
   * Kişi için bugün itibarıyla gecikme faizlerini hesaplar (uygulamaz, sadece hesaplar)
   * @returns {Array<{donem, kategori, remaining, gecikmeGun, faizTutar}>}
   */
  calculate(personId, aptId, asOfDate) {
    asOfDate = asOfDate || today();
    const rate = this.getRate();
    if (rate === 0) return [];

    return AllocationService.getPendingDebts(personId, aptId)
      .filter(d => d.sonOdeme && asOfDate > d.sonOdeme && d.remaining > 0.01)
      .map(d => {
        const gecikmeGun = Math.floor(
          (new Date(asOfDate) - new Date(d.sonOdeme)) / 86400000
        );
        const gecikmeAy  = gecikmeGun / 30;
        const faizTutar  = Math.round(d.remaining * rate * gecikmeAy * 100) / 100;
        return { ...d, gecikmeGun, faizTutar };
      })
      .filter(d => d.faizTutar >= 0.01);
  },

  /**
   * Hesaplanan faizleri S.aidatBorclandir'a gerçek borç kalemi olarak ekler.
   * İdempotent: aynı dönem için çift faiz eklenmez.
   * @returns {number} toplam uygulanan faiz
   */
  applyFees(personId, aptId) {
    const fees = this.calculate(personId, aptId);
    if (!fees.length) return 0;
    let total = 0;

    fees.forEach(fee => {
      // İlgili kayıt veya yeni kayıt
      let kayit = (S.aidatBorclandir || []).find(k =>
        String(k.aptId) === String(aptId) && k.donem === fee.donem
      );
      if (!kayit) {
        kayit = { aptId: +aptId, donem: fee.donem, tarih: today(), detaylar: [], toplamBorc: 0 };
        S.aidatBorclandir = S.aidatBorclandir || [];
        S.aidatBorclandir.push(kayit);
      }

      // Çift uygulama kontrolü
      const alreadyAdded = (kayit.detaylar || []).some(d =>
        String(d.sakId) === String(personId) &&
        d.kategori === 'Gecikme Faizi' &&
        d._feeForDonem === fee.donem
      );
      if (alreadyAdded) return;

      // Borç kalemi ekle
      kayit.detaylar = kayit.detaylar || [];
      kayit.detaylar.push({
        sakId:        +personId,
        tutar:        fee.faizTutar,
        kategori:     'Gecikme Faizi',
        _feeForDonem: fee.donem,
        _feeGun:      fee.gecikmeGun,
        createdAt:    today()
      });
      kayit.toplamBorc = (kayit.toplamBorc || 0) + fee.faizTutar;

      // Sakin borcunu güncelle
      const sk = (S.sakinler || []).find(s => s.id == personId);
      if (sk) sk.borc = Math.round(((sk.borc || 0) + fee.faizTutar) * 100) / 100;

      // Ledger kaydı
      if (typeof LedgerService !== 'undefined') {
        LedgerService.recordAccrual({
          siteId:      aptId,
          personId:    personId,
          amount:      fee.faizTutar,
          category:    'gecikme_faizi',
          period:      fee.donem,
          description: 'Gecikme faizi — ' + fee.gecikmeGun + ' gün (' + fee.kategori + ')'
        });
      }
      total += fee.faizTutar;
    });

    if (total > 0) save();
    return Math.round(total * 100) / 100;
  }
};

// ===================================================
// TEKRARLAYaN İŞLEM OTOMASYONU
// ===================================================
/**
 * Tekrarlayan işlemleri kontrol eder ve dönem başına bir kez çalıştırır.
 * İdempotent: S.tekrarKontrol haritası ile çift oluşturma engellenir.
 * ID çakışması: crypto.randomUUID() veya fallback kullanılır.
 */
function checkTekrarlayanIslemler() {
  if (!S.finansIslemler || !S.finansIslemler.length) return;
  if (!S.tekrarKontrol) S.tekrarKontrol = {};

  const now   = new Date();
  const buAy  = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const buYil = String(now.getFullYear());

  // Güvenli ID üreticisi (Date.now + random → çakışma riski yoktur)
  const genId = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);

  let eklendi = 0;

  // Temel tekrar kaynakları: cancelled olmayanlar ve kopyalar değil
  const kaynaklar = S.finansIslemler.filter(f =>
    f.tekrar && f.tekrar !== '' && f.status !== 'cancelled' && !f.kaynakId
  );

  kaynaklar.forEach(f => {
    // ── Aylık ──
    if (f.tekrar === 'aylik') {
      const key = `tekrar_aylik_${f.id}_${buAy}`;
      // Bitiş tarihi geçmişse atla
      if (f.tekrarBitis && buAy > f.tekrarBitis.slice(0,7)) return;
      if (!S.tekrarKontrol[key]) {
        const yeni = {
          ...f,
          id:       genId(),
          tarih:    buAy + '-01',
          tekrar:   '',
          tekrarBitis: '',
          kaynak:   'otomasyon',
          kaynakId: f.id,
          status:   'active'
        };
        S.finansIslemler.push(yeni);
        S.tekrarKontrol[key] = today();
        eklendi++;
      }
    }

    // ── Üç Aylık ──
    if (f.tekrar === 'uc_aylik') {
      const ceyrek = Math.ceil((now.getMonth() + 1) / 3);
      const key = `tekrar_uc_${f.id}_${buYil}_q${ceyrek}`;
      if (f.tekrarBitis && buAy > f.tekrarBitis.slice(0,7)) return;
      if (!S.tekrarKontrol[key]) {
        const yeni = { ...f, id: genId(), tarih: buAy + '-01', tekrar: '', tekrarBitis: '', kaynak: 'otomasyon', kaynakId: f.id, status: 'active' };
        S.finansIslemler.push(yeni);
        S.tekrarKontrol[key] = today();
        eklendi++;
      }
    }

    // ── Yıllık ──
    if (f.tekrar === 'yillik') {
      const key = `tekrar_yillik_${f.id}_${buYil}`;
      if (f.tekrarBitis && buYil > f.tekrarBitis.slice(0,4)) return;
      const origMonth = (f.tarih || '').slice(5, 7);
      if (String(now.getMonth()+1).padStart(2,'0') === origMonth && !S.tekrarKontrol[key]) {
        const yeni = { ...f, id: genId(), tarih: buYil + '-' + origMonth + '-01', tekrar: '', tekrarBitis: '', kaynak: 'otomasyon', kaynakId: f.id, status: 'active' };
        S.finansIslemler.push(yeni);
        S.tekrarKontrol[key] = today();
        eklendi++;
      }
    }
  });

  if (eklendi > 0) {
    save();
    toast(`${eklendi} tekrarlayan işlem otomatik oluşturuldu.`, 'ok');
  }
}

// ── SÜPER ADMİN FONKSİYONLARI ─────────────────
function renderSuperAdmin() {
  const filter = document.getElementById('sa-filter')?.value || '';
  // Stats
  const sites = S.apartmanlar || [];
  const totalDaire = sites.reduce((s,a)=>s+(a.daireSayisi||0),0);
  const aktifSites = sites.filter(a=>a.durum!=='pasif'&&a.durum!=='beklemede').length;
  const bekleyenSites = sites.filter(a=>a.durum==='beklemede').length;
  const aylikGelir = sites.reduce((s,a)=>s+calcAbonelik(a.daireSayisi||0),0);

  const statsEl = document.getElementById('sa-stats');
  if (statsEl) statsEl.innerHTML = `
    <div class="sa-stat"><div class="sa-lbl">Toplam Site</div><div class="sa-val">${sites.length}</div></div>
    <div class="sa-stat"><div class="sa-lbl">Toplam Daire</div><div class="sa-val">${totalDaire}</div></div>
    <div class="sa-stat"><div class="sa-lbl">Onay Bekleyen</div><div class="sa-val" style="color:var(--warn)">${bekleyenSites}</div></div>
    <div class="sa-stat"><div class="sa-lbl">Aylık Gelir</div><div class="sa-val" style="color:var(--ok)">₺${fmt(aylikGelir)}</div></div>`;

  // Site list
  let filtered = sites;
  if (filter === 'aktif') filtered = sites.filter(a=>a.durum!=='pasif'&&a.durum!=='beklemede');
  else if (filter === 'beklemede') filtered = sites.filter(a=>a.durum==='beklemede');
  else if (filter === 'pasif') filtered = sites.filter(a=>a.durum==='pasif');

  const listEl = document.getElementById('sa-site-list');
  if (!listEl) return;
  if (!filtered.length) { listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--tx-3)">Kayıtlı site bulunamadı.</div>'; return; }
  listEl.innerHTML = filtered.map(a => {
    const durum = a.durum || 'aktif';
    const cls = durum==='aktif'?'b-gr':durum==='beklemede'?'b-am':'b-rd';
    const lbl = durum==='aktif'?'Aktif':durum==='beklemede'?'Onay Bekliyor':'Pasif';
    const ucret = calcAbonelik(a.daireSayisi||0);
    return `<div class="sa-site-row">
      <div><strong>${a.ad}</strong><div class="t3" style="font-size:11px">${a.adres||''} · ${a.il||''}</div></div>
      <div style="font-weight:700;color:var(--brand)">${a.daireSayisi||0}</div>
      <div>${a.yon||'—'}</div>
      <div style="font-weight:600;color:var(--ok)">₺${fmt(ucret)}/ay</div>
      <div><span class="b ${cls}">${lbl}</span></div>
      <div class="act">
        ${durum==='beklemede'?`<button class="btn bg xs" onclick="saOnaylaSite(${a.id})" style="font-size:11px">✓ Onayla</button>`:''}
        <button class="btn xs" style="font-size:11px;background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="saToggleSite(${a.id})">${durum==='pasif'?'Aktifle':'Durdur'}</button>
      </div>
    </div>`;
  }).join('');
}

function calcAbonelik(daire) {
  if (daire <= 20) return 299;
  if (daire <= 50) return 499;
  if (daire <= 100) return 799;
  if (daire <= 200) return 1199;
  return 1799;
}

function saOnaylaSite(id) {
  const a = S.apartmanlar.find(x=>x.id===id);
  if (a) { a.durum = 'aktif'; save(); renderSuperAdmin(); toast(a.ad+' onaylandı!','ok'); }
}

function saToggleSite(id) {
  const a = S.apartmanlar.find(x=>x.id===id);
  if (a) { a.durum = a.durum==='pasif'?'aktif':'pasif'; save(); renderSuperAdmin(); toast(a.ad+' durumu güncellendi.','ok'); }
}

function saAddSite() {
  goPage('apartmanlar');
  setTimeout(()=>document.querySelector('[data-tab="apt-form"]')?.click(), 200);
}

// ── DASHBOARD KART BAĞLANTILARI ───────────────
function dashCardClick(page) {
  goPage(page);
}

// ══════════════════════════════════════════════════════════════════════
// SAKİN PROFİL SAYFASI
// ══════════════════════════════════════════════════════════════════════

let _currentProfilId = null;

function goSakinProfil(sakId) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk) { toast('Sakin bulunamadı.', 'err'); return; }
  _currentProfilId = +sakId;
  window._navStack = [{ page: 'sakin-profil', id: +sakId, label: 'Sakin Profili' }];
  _navUpdateBreadcrumb();
  window._navRestoring = true;
  goPage('sakin-profil');
  window._navRestoring = false;
  renderSakinProfil();
}

function renderSakinProfil() {
  const root = document.getElementById('sp-root');
  if (!root) return;
  const sk = S.sakinler.find(s => s.id === _currentProfilId);
  if (!sk) { root.innerHTML = '<div class="card" style="padding:32px;text-align:center;color:var(--tx-3)">Sakin bulunamadı.</div>'; return; }
  const apt = S.apartmanlar.find(a => a.id == sk.aptId);
  const aptAd = apt ? apt.ad : '—';
  const initials = (sk.ad || ' ').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  const tipRenk = sk.tip === 'kiralik' ? '#7c3aed' : '#2563eb';
  const tipLabel = sk.tip === 'kiralik' ? 'Kiracı' : 'Malik';
  const blokPre = (sk.blok || '').replace(/\s*blok\s*/i, '').trim();
  const daireLabel = (blokPre ? blokPre + ' – ' : '') + (sk.daire || '?');

  // Davet durumu
  const davetToken = sk.davetToken || null;
  const davetLink = davetToken ? (window.location.href.replace(/#.*$/, '') + '#davet-kayit/' + davetToken) : null;
  const bekleyen = (S.bekleyenKayitlar || []).find(r => r.sakId === sk.id && r.durum === 'bekliyor');
  const onaylandi = (S.bekleyenKayitlar || []).find(r => r.sakId === sk.id && r.durum === 'onaylandi');
  let davetDurumHtml = '';
  if (onaylandi) {
    davetDurumHtml = `<span style="background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">✓ Kayıtlı Kullanıcı</span>`;
  } else if (bekleyen) {
    davetDurumHtml = `<span style="background:#fef9c3;color:#b45309;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">⏳ Onay Bekliyor</span>`;
  } else if (davetToken) {
    davetDurumHtml = `<span style="background:#eff6ff;color:#2563eb;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">🔗 Davet Gönderildi</span>`;
  } else {
    davetDurumHtml = `<span style="background:var(--s2);color:var(--tx-3);padding:3px 10px;border-radius:20px;font-size:11px">Davet Gönderilmedi</span>`;
  }

  const fld = (label, val) => val ? `<div style="padding:9px 14px;border-bottom:1px solid var(--border)"><div style="font-size:10px;font-weight:600;color:var(--tx-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">${label}</div><div style="font-size:13px;color:var(--tx-1);font-weight:500">${he(String(val))}</div></div>` : '';

  root.innerHTML = `
  <!-- Profil Kartı -->
  <div style="background:linear-gradient(135deg,#3b5bdb 0%,#4c6ef5 60%,#7048e8 100%);border-radius:14px;padding:20px 22px 16px;color:#fff;margin-bottom:14px;position:relative;overflow:hidden">
    <svg style="position:absolute;right:-10px;top:-10px;opacity:.06;width:200px" viewBox="0 0 220 180" fill="white"><rect x="0" y="60" width="32" height="120"/><rect x="36" y="34" width="38" height="146"/><rect x="80" y="22" width="34" height="158"/><rect x="120" y="44" width="28" height="136"/><rect x="154" y="10" width="44" height="170"/></svg>
    <div style="display:flex;align-items:center;gap:14px;position:relative;flex-wrap:wrap">
      <div style="width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.22);border:2.5px solid rgba(255,255,255,.5);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;flex-shrink:0;letter-spacing:-1px">${initials}</div>
      <div style="flex:1;min-width:160px">
        <div style="font-size:18px;font-weight:800;letter-spacing:-.3px;margin-bottom:3px">${he(sk.ad)}</div>
        <div style="font-size:12.5px;opacity:.82;margin-bottom:6px">${he(aptAd)}</div>
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          <span style="background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">${tipLabel} · ${he(daireLabel)}</span>
          ${davetDurumHtml}
        </div>
      </div>
      <button onclick="openSakinProfilEdit()" style="background:rgba(255,255,255,.18);border:1.5px solid rgba(255,255,255,.4);color:#fff;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0">
        <svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Düzenle
      </button>
    </div>
    ${(sk.email || sk.tel) ? `<div style="display:flex;gap:14px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.2);flex-wrap:wrap;position:relative">
      ${sk.tel ? `<a href="tel:${sk.tel}" style="color:rgba(255,255,255,.9);text-decoration:none;font-size:12.5px;display:flex;align-items:center;gap:5px"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1.15h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.92-1.87a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.54 16z"/></svg>${he(sk.tel)}</a>` : ''}
      ${sk.email ? `<a href="mailto:${sk.email}" style="color:rgba(255,255,255,.9);text-decoration:none;font-size:12.5px;display:flex;align-items:center;gap:5px"><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>${he(sk.email)}</a>` : ''}
    </div>` : ''}
  </div>

  <div class="sp-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <!-- Sol: Kişi Bilgileri -->
    <div>
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:10px 14px;background:var(--s2);border-bottom:1px solid var(--border)"><strong style="font-size:12px;color:var(--tx-2)">👤 Kişi Bilgileri</strong></div>
        ${fld('Ad Soyad', sk.ad)}
        ${fld('TC Kimlik No', sk.tc)}
        ${fld('Doğum Tarihi', sk.dogum)}
        ${fld('Cinsiyet', sk.cinsiyet === 'e' ? 'Erkek' : sk.cinsiyet === 'k' ? 'Kadın' : sk.cinsiyet)}
        ${fld('Cep Telefonu', sk.tel)}
        ${fld('Ev Telefonu', sk.tel2)}
        ${fld('E-posta', sk.email)}
        ${fld('Acil Durum İletişim', sk.acil)}
      </div>
      <div class="card" style="padding:0;overflow:hidden;margin-top:12px">
        <div style="padding:10px 14px;background:var(--s2);border-bottom:1px solid var(--border)"><strong style="font-size:12px;color:var(--tx-2)">🏠 Daire & Konum</strong></div>
        ${fld('Apartman', aptAd)}
        ${fld('Daire No', sk.daire)}
        ${fld('Kat', sk.kat)}
        ${fld('Blok', sk.blok)}
        ${fld('Giriş Tarihi', sk.giris)}
        ${fld('Çıkış Tarihi', sk.cikis)}
        ${sk.tip === 'kiralik' ? fld('Kira (₺/ay)', sk.kira ? fmt(sk.kira) : '') : ''}
        ${sk.tip === 'kiralik' ? fld('Sözleşme Başlangıç', sk.sozlasmeBas) : ''}
        ${sk.tip === 'kiralik' ? fld('Sözleşme Bitiş', sk.sozlasmeBit) : ''}
        ${sk.tip === 'malik' ? fld('Tapu Bilgisi', sk.tapu) : ''}
        ${sk.tip === 'malik' ? fld('Aidat (₺/ay)', sk.aidat ? fmt(sk.aidat) : '') : ''}
        ${fld('Not', sk.not)}
      </div>
    </div>

    <!-- Sağ: Davet & Finansal -->
    <div>
      <!-- Hızlı Aksiyonlar -->
      <div class="card" style="padding:14px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:700;color:var(--tx-2);margin-bottom:10px">⚡ Hızlı İşlemler</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn bp" style="justify-content:flex-start;gap:8px" onclick="goSakinCari(${sk.id})">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Finansal Hesap Ekstresi
          </button>
          <button class="btn bg" style="justify-content:flex-start;gap:8px" onclick="openAidatBorcDaire(${sk.id})">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
            Borçlandır
          </button>
          <button class="btn bg" style="justify-content:flex-start;gap:8px" onclick="openHizliOdeme(${sk.id},'')">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M2 11h20"/></svg>
            Tahsil Et
          </button>
        </div>
      </div>

      <!-- Davet Linki -->
      <div class="card" style="padding:14px">
        <div style="font-size:12px;font-weight:700;color:var(--tx-2);margin-bottom:12px">🔗 Sisteme Davet</div>
        ${davetLink ? `
        <div style="background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--tx-3);word-break:break-all;margin-bottom:10px;font-family:monospace">${davetLink}</div>
        ` : `<div style="font-size:12px;color:var(--tx-3);margin-bottom:10px">Henüz davet linki oluşturulmadı. Aşağıdan oluşturun ve gönderin.</div>`}
        <div style="display:flex;flex-direction:column;gap:7px">
          <button class="btn bp" style="justify-content:flex-start;gap:8px;font-size:12px" onclick="generateAndCopyDavet(${sk.id})">
            <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            ${davetLink ? 'Linki Kopyala' : 'Link Oluştur & Kopyala'}
          </button>
          ${sk.tel ? `<button class="btn bg" style="justify-content:flex-start;gap:8px;font-size:12px;color:#25d366;border-color:#25d366" onclick="whatsappDavet(${sk.id})">
            <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            WhatsApp ile Gönder
          </button>` : ''}
          ${sk.email ? `<button class="btn bg" style="justify-content:flex-start;gap:8px;font-size:12px" onclick="emailDavet(${sk.id})">
            <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>
            E-posta ile Gönder
          </button>` : ''}
          ${sk.tel ? `<button class="btn bg" style="justify-content:flex-start;gap:8px;font-size:12px" onclick="smsDavet(${sk.id})">
            <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            SMS ile Gönder
          </button>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

function openSakinProfilEdit() {
  const sk = S.sakinler.find(s => s.id === _currentProfilId);
  if (!sk) return;
  const aptOpts = S.apartmanlar.map(a => `<option value="${a.id}"${a.id == sk.aptId ? ' selected' : ''}>${he(a.ad)}</option>`).join('');
  document.getElementById('sp-edit-title').textContent = `✏️ ${he(sk.ad)} — Bilgileri Düzenle`;
  document.getElementById('sp-edit-fields').innerHTML = `
    <input type="hidden" id="spe-id" value="${sk.id}">
    <div class="f2 fg">
      <div class="fgp"><label class="lbl">Ad Soyad *</label><input class="fi" id="spe-ad" value="${he(sk.ad||'')}"></div>
      <div class="fgp"><label class="lbl">TC Kimlik No</label><input class="fi" id="spe-tc" value="${he(sk.tc||'')}" maxlength="11"></div>
    </div>
    <div class="f2 fg">
      <div class="fgp"><label class="lbl">Cep Telefonu</label><input class="fi" id="spe-tel" value="${he(sk.tel||'')}" placeholder="05xx xxx xx xx"></div>
      <div class="fgp"><label class="lbl">E-posta</label><input class="fi" id="spe-email" type="email" value="${he(sk.email||'')}"></div>
    </div>
    <div class="f2 fg">
      <div class="fgp"><label class="lbl">Doğum Tarihi</label><input class="fi" id="spe-dogum" type="date" value="${sk.dogum||''}"></div>
      <div class="fgp"><label class="lbl">Cinsiyet</label>
        <select class="fs" id="spe-cinsiyet">
          <option value="">—</option>
          <option value="e"${sk.cinsiyet==='e'?' selected':''}>Erkek</option>
          <option value="k"${sk.cinsiyet==='k'?' selected':''}>Kadın</option>
        </select>
      </div>
    </div>
    <div class="f2 fg">
      <div class="fgp"><label class="lbl">Daire No *</label><input class="fi" id="spe-daire" value="${he(sk.daire||'')}"></div>
      <div class="fgp"><label class="lbl">Kat</label><input class="fi" id="spe-kat" value="${he(sk.kat||'')}"></div>
    </div>
    <div class="f2 fg">
      <div class="fgp"><label class="lbl">Blok</label><input class="fi" id="spe-blok" value="${he(sk.blok||'')}"></div>
      <div class="fgp"><label class="lbl">Apartman</label><select class="fs" id="spe-aptid">${aptOpts}</select></div>
    </div>
    <div class="f2 fg">
      <div class="fgp"><label class="lbl">Tip</label>
        <select class="fs" id="spe-tip">
          <option value="malik"${sk.tip==='malik'?' selected':''}>Malik</option>
          <option value="kiralik"${sk.tip==='kiralik'?' selected':''}>Kiracı</option>
        </select>
      </div>
      <div class="fgp"><label class="lbl">Aidat (₺/ay)</label><input class="fi" id="spe-aidat" type="number" value="${sk.aidat||0}" min="0"></div>
    </div>
    <div class="fgp"><label class="lbl">Not</label><input class="fi" id="spe-not" value="${he(sk.not||'')}"></div>
  `;
  openModal('mod-sp-edit');
}

function saveSakinProfilEdit() {
  const id = +document.getElementById('spe-id').value;
  const sk = S.sakinler.find(s => s.id === id);
  if (!sk) return;
  const ad = document.getElementById('spe-ad').value.trim();
  if (!ad) { toast('Ad Soyad zorunlu!', 'err'); return; }
  sk.ad      = ad;
  sk.tc      = document.getElementById('spe-tc').value.trim();
  sk.tel     = document.getElementById('spe-tel').value.trim();
  sk.email   = document.getElementById('spe-email').value.trim();
  sk.dogum   = document.getElementById('spe-dogum').value;
  sk.cinsiyet= document.getElementById('spe-cinsiyet').value;
  sk.daire   = document.getElementById('spe-daire').value.trim();
  sk.kat     = document.getElementById('spe-kat').value.trim();
  sk.blok    = document.getElementById('spe-blok').value.trim();
  sk.aptId   = +document.getElementById('spe-aptid').value || sk.aptId;
  sk.tip     = document.getElementById('spe-tip').value;
  sk.aidat   = parseFloat(document.getElementById('spe-aidat').value) || 0;
  sk.not     = document.getElementById('spe-not').value.trim();
  save();
  closeModal('mod-sp-edit');
  toast('Sakin bilgileri güncellendi.', 'ok');
  renderSakinProfil();
}

// ── DAVET LİNKİ SİSTEMİ ──────────────────────────────────────

function _getDavetBaseUrl() {
  return window.location.href.replace(/#.*$/, '');
}

function generateDavetToken(sakId) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk) return null;
  if (!sk.davetToken) {
    sk.davetToken = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    sk.davetOlusturmaTarihi = new Date().toISOString();
    save();
  }
  return sk.davetToken;
}

function getDavetLink(sakId) {
  const token = generateDavetToken(sakId);
  return token ? (_getDavetBaseUrl() + '#davet-kayit/' + token) : null;
}

function generateAndCopyDavet(sakId) {
  const link = getDavetLink(sakId);
  if (!link) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => toast('Davet linki kopyalandı!', 'ok'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast('Davet linki kopyalandı!', 'ok');
  }
  renderSakinProfil();
}

function whatsappDavet(sakId) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk || !sk.tel) { toast('Telefon numarası bulunamadı.', 'err'); return; }
  const link = getDavetLink(sakId);
  const tel = sk.tel.replace(/\D/g, '').replace(/^0/, '90');
  const mesaj = encodeURIComponent(
    `Sayın ${sk.ad},\n\nSite yönetim sistemine davet edildiniz. Aşağıdaki link ile kayıt olabilir, dairenize ait aidat bilgilerini takip edebilirsiniz.\n\n${link}\n\nİyi günler,\nYönetim`
  );
  window.open(`https://wa.me/${tel}?text=${mesaj}`, '_blank');
  sk.davetGonderildi = new Date().toISOString(); save();
  renderSakinProfil();
}

function emailDavet(sakId) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk || !sk.email) { toast('E-posta adresi bulunamadı.', 'err'); return; }
  const link = getDavetLink(sakId);
  const konu = encodeURIComponent('Site Yönetim Sistemi — Kayıt Daveti');
  const govde = encodeURIComponent(
    `Sayın ${sk.ad},\n\nSite yönetim sistemine kayıt olmanız için aşağıdaki linke tıklayın:\n\n${link}\n\nBu link size özel oluşturulmuştur. Kaydınız tamamlandıktan sonra yönetici onayı ile sisteme erişebilirsiniz.\n\nİyi günler,\nYönetim`
  );
  window.open(`mailto:${sk.email}?subject=${konu}&body=${govde}`, '_blank');
  sk.davetGonderildi = new Date().toISOString(); save();
  renderSakinProfil();
}

function smsDavet(sakId) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk || !sk.tel) { toast('Telefon numarası bulunamadı.', 'err'); return; }
  const link = getDavetLink(sakId);
  const mesaj = encodeURIComponent(`Sayın ${sk.ad}, site yönetim sistemine kayıt linkiniz: ${link}`);
  window.open(`sms:${sk.tel}?body=${mesaj}`, '_blank');
  sk.davetGonderildi = new Date().toISOString(); save();
  renderSakinProfil();
}

// ══════════════════════════════════════════════════════════════════════
// DAVET YÖNETİM SAYFASI
// ══════════════════════════════════════════════════════════════════════

function renderDavetYonetim() {
  const root = document.getElementById('dav-root');
  if (!root) return;
  if (!S.bekleyenKayitlar) S.bekleyenKayitlar = [];
  const sakinler = S.sakinler || [];
  const srch = (document.getElementById('dav-srch')?.value || '').toLowerCase();
  const filtre = document.getElementById('dav-filtre')?.value || '';
  const filtered = sakinler.filter(sk => {
    if (srch && !(sk.ad||'').toLowerCase().includes(srch) && !(sk.daire||'').includes(srch)) return false;
    if (filtre === 'davetli' && !sk.davetToken) return false;
    if (filtre === 'davet-yok' && sk.davetToken) return false;
    const onaylandi = (S.bekleyenKayitlar||[]).find(r=>r.sakId===sk.id&&r.durum==='onaylandi');
    if (filtre === 'kayitli' && !onaylandi) return false;
    return true;
  });
  const toplamDavetli = sakinler.filter(s=>s.davetToken).length;
  const toplamKayitli = (S.bekleyenKayitlar||[]).filter(r=>r.durum==='onaylandi').length;
  const toplamBekleyen = (S.bekleyenKayitlar||[]).filter(r=>r.durum==='bekliyor').length;

  root.innerHTML = `
  <div class="sg" style="grid-template-columns:repeat(4,1fr)">
    <div class="sc bar-bl"><div class="sc-ico ic-bl"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div class="sc-lbl">Toplam Sakin</div><div class="sc-val v-bl">${sakinler.length}</div><div class="sc-sub">Sistemde kayıtlı</div></div>
    <div class="sc bar-tl"><div class="sc-ico ic-tl"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div><div class="sc-lbl">Davet Gönderildi</div><div class="sc-val v-tl">${toplamDavetli}</div><div class="sc-sub">Link oluşturuldu</div></div>
    <div class="sc bar-am"><div class="sc-ico ic-am"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="sc-lbl">Onay Bekliyor</div><div class="sc-val v-am">${toplamBekleyen}</div><div class="sc-sub">İnceleme bekliyor</div></div>
    <div class="sc bar-gr"><div class="sc-ico ic-gr"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="sc-lbl">Kayıtlı Kullanıcı</div><div class="sc-val v-gr">${toplamKayitli}</div><div class="sc-sub">Onaylandı</div></div>
  </div>
  <div class="card" style="padding:14px;margin-bottom:12px">
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div class="srch" style="flex:1;min-width:200px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="dav-srch" placeholder="Ad veya daire ara…" oninput="renderDavetYonetim()" style="width:100%"></div>
      <select class="fs" id="dav-filtre" onchange="renderDavetYonetim()" style="width:auto;padding:6px 12px">
        <option value="">Tümü</option>
        <option value="davetli">Davet Gönderilmiş</option>
        <option value="davet-yok">Davet Gönderilmemiş</option>
        <option value="kayitli">Kayıtlı</option>
      </select>
      <button class="btn bp" onclick="topluDavetGonder()">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Toplu Link Oluştur
      </button>
    </div>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <div class="tw"><table>
      <thead><tr><th>Sakin</th><th>Apartman</th><th>Daire</th><th>Tip</th><th>Durum</th><th>İşlemler</th></tr></thead>
      <tbody>
        ${filtered.length ? filtered.map(sk => {
          const apt = S.apartmanlar.find(a=>a.id==sk.aptId);
          const onaylandi = (S.bekleyenKayitlar||[]).find(r=>r.sakId===sk.id&&r.durum==='onaylandi');
          const bekliyor = (S.bekleyenKayitlar||[]).find(r=>r.sakId===sk.id&&r.durum==='bekliyor');
          let durumBadge = '';
          if (onaylandi) durumBadge = '<span class="b b-ok" style="font-size:10px">✓ Kayıtlı</span>';
          else if (bekliyor) durumBadge = '<span class="b b-warn" style="font-size:10px">⏳ Onay Bekliyor</span>';
          else if (sk.davetToken) durumBadge = '<span class="b b-bl" style="font-size:10px">🔗 Davet Var</span>';
          else durumBadge = '<span class="b b-gy" style="font-size:10px">— Davet Yok</span>';
          return `<tr>
            <td><a href="javascript:void(0)" onclick="goSakinProfil(${sk.id})" style="color:var(--brand);font-weight:600">${he(sk.ad)}</a></td>
            <td>${he(apt?.ad||'—')}</td>
            <td>${he(sk.daire||'—')}</td>
            <td><span class="b ${sk.tip==='kiralik'?'b-warn':'b-bl'}" style="font-size:10px">${sk.tip==='kiralik'?'Kiracı':'Malik'}</span></td>
            <td>${durumBadge}</td>
            <td>
              <div class="act">
                <button class="btn bg xs" onclick="goSakinProfil(${sk.id})" title="Profil">👤 Profil</button>
                <button class="btn bp xs" onclick="generateAndCopyDavetFromTable(${sk.id})" title="Davet Linki Oluştur/Kopyala">🔗 Link</button>
                ${sk.tel ? `<button class="btn xs" style="background:#e7fbe9;color:#16a34a;border:1px solid #86efac" onclick="whatsappDavet(${sk.id})" title="WhatsApp">📱 WA</button>` : ''}
              </div>
            </td>
          </tr>`;
        }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--tx-3);padding:24px">Sakin bulunamadı.</td></tr>'}
      </tbody>
    </table></div>
  </div>`;
}

function generateAndCopyDavetFromTable(sakId) {
  const link = getDavetLink(sakId);
  if (!link) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => toast('Davet linki kopyalandı!', 'ok'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast('Davet linki kopyalandı!', 'ok');
  }
  renderDavetYonetim();
}

function topluDavetGonder() {
  const sakinler = S.sakinler || [];
  let count = 0;
  sakinler.forEach(sk => {
    if (!sk.davetToken) { generateDavetToken(sk.id); count++; }
  });
  save();
  toast(`${count} sakin için davet linki oluşturuldu.`, 'ok');
  renderDavetYonetim();
}

// ══════════════════════════════════════════════════════════════════════
// DAVET ONAY SAYFASI
// ══════════════════════════════════════════════════════════════════════

function renderDavetBekleyen() {
  const root = document.getElementById('dab-root');
  if (!root) return;
  if (!S.bekleyenKayitlar) S.bekleyenKayitlar = [];
  const bekleyen = S.bekleyenKayitlar.filter(r => r.durum === 'bekliyor');
  const oncekiler = S.bekleyenKayitlar.filter(r => r.durum !== 'bekliyor');
  updateDavetBekleyenBadge();

  root.innerHTML = `
  <div class="sg" style="grid-template-columns:1fr 1fr">
    <div class="sc bar-am"><div class="sc-ico ic-am"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="sc-lbl">Onay Bekliyor</div><div class="sc-val v-am">${bekleyen.length}</div><div class="sc-sub">İnceleme gerekiyor</div></div>
    <div class="sc bar-gr"><div class="sc-ico ic-gr"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="sc-lbl">Onaylandı</div><div class="sc-val v-gr">${oncekiler.filter(r=>r.durum==='onaylandi').length}</div><div class="sc-sub">Kayıt tamamlandı</div></div>
  </div>
  ${bekleyen.length ? `
  <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">
    <div style="padding:10px 16px;background:var(--s2);border-bottom:1px solid var(--border)">
      <strong style="font-size:12px;color:var(--tx-1)">⏳ Onay Bekleyen Başvurular</strong>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Başvuru Sahibi</th><th>Daire</th><th>E-posta</th><th>Telefon</th><th>Başvuru Tarihi</th><th>İşlem</th></tr></thead>
      <tbody>
        ${bekleyen.map(r => {
          const sk = S.sakinler.find(s=>s.id===r.sakId);
          const d = new Date(r.tarih||''); const dStr = isNaN(d)?r.tarih||'—':`${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`;
          return `<tr>
            <td><strong>${he(r.ad||'—')}</strong>${sk?`<div style="font-size:11px;color:var(--tx-3)">${he(sk.ad)} (mevcut kaydı)</div>`:''}</td>
            <td>${he(r.daire||'—')}</td>
            <td>${he(r.email||'—')}</td>
            <td>${he(r.tel||'—')}</td>
            <td style="font-size:12px;color:var(--tx-3)">${dStr}</td>
            <td>
              <div class="act">
                <button class="btn bp xs" onclick="onaylaKayit('${r.id}')">✓ Onayla</button>
                <button class="btn xs" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5" onclick="reddedKayit('${r.id}')">✗ Reddet</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>
  ` : '<div class="card" style="padding:32px;text-align:center;color:var(--tx-3)">Onay bekleyen başvuru yok.</div>'}
  ${oncekiler.length ? `
  <div class="card" style="padding:0;overflow:hidden">
    <div style="padding:10px 16px;background:var(--s2);border-bottom:1px solid var(--border)">
      <strong style="font-size:12px;color:var(--tx-1)">📋 Geçmiş Başvurular</strong>
    </div>
    <div class="tw"><table>
      <thead><tr><th>Başvuru Sahibi</th><th>Daire</th><th>Durum</th><th>Tarih</th></tr></thead>
      <tbody>
        ${oncekiler.slice().reverse().map(r => {
          const d = new Date(r.tarih||''); const dStr = isNaN(d)?r.tarih||'—':`${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`;
          const badge = r.durum==='onaylandi'?'<span class="b b-ok" style="font-size:10px">✓ Onaylandı</span>':'<span class="b b-err" style="font-size:10px">✗ Reddedildi</span>';
          return `<tr><td>${he(r.ad||'—')}</td><td>${he(r.daire||'—')}</td><td>${badge}</td><td style="font-size:12px;color:var(--tx-3)">${dStr}</td></tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>` : ''}`;
}

function onaylaKayit(id) {
  if (!S.bekleyenKayitlar) return;
  const r = S.bekleyenKayitlar.find(x => x.id === id);
  if (!r) return;
  r.durum = 'onaylandi';
  r.onayTarih = new Date().toISOString();
  const sk = S.sakinler.find(s => s.id === r.sakId);
  if (sk) {
    sk.kayitDurumu = 'onaylandi';
    if (r.email && !sk.email) sk.email = r.email;
    if (r.tel && !sk.tel) sk.tel = r.tel;
  }
  save();
  toast(`${r.ad} kayıt başvurusu onaylandı!`, 'ok');
  renderDavetBekleyen();
}

function reddedKayit(id) {
  if (!S.bekleyenKayitlar) return;
  const r = S.bekleyenKayitlar.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`${r.ad} adlı kişinin başvurusu reddedilsin mi?`)) return;
  r.durum = 'reddedildi';
  r.reddTarih = new Date().toISOString();
  save();
  toast('Başvuru reddedildi.', 'warn');
  renderDavetBekleyen();
}

function updateDavetBekleyenBadge() {
  const el = document.getElementById('nb-davet-bekleyen');
  if (!el) return;
  const n = (S.bekleyenKayitlar||[]).filter(r=>r.durum==='bekliyor').length;
  if (n > 0) { el.textContent = n; el.style.display = ''; }
  else el.style.display = 'none';
}

// ── DAVET KAYIT SAYFASI (Davet linki ile gelenlerin kayıt formu) ──────

function renderDavetKayitSayfasi(token) {
  const sk = S.sakinler.find(s => s.davetToken === token);
  const root = document.getElementById('dkayit-root');
  if (!root) return;
  if (!sk) {
    root.innerHTML = `<div style="text-align:center;padding:20px"><div style="font-size:40px;margin-bottom:12px">🔒</div><div style="font-size:16px;font-weight:700;color:var(--err)">Geçersiz veya Süresi Dolmuş Link</div><div style="font-size:13px;color:var(--tx-3);margin-top:8px">Bu davet linki geçerli değil. Yöneticinizle iletişime geçin.</div></div>`;
    return;
  }
  const apt = S.apartmanlar.find(a=>a.id==sk.aptId);
  const mevcutBaşvuru = (S.bekleyenKayitlar||[]).find(r=>r.sakId===sk.id);
  if (mevcutBaşvuru) {
    const durumMesaj = mevcutBaşvuru.durum === 'bekliyor'
      ? '⏳ Başvurunuz alındı, yönetici onayı bekleniyor.'
      : mevcutBaşvuru.durum === 'onaylandi'
      ? '✅ Başvurunuz onaylandı! Sisteme giriş yapabilirsiniz.'
      : '❌ Başvurunuz reddedildi. Yöneticinizle iletişime geçin.';
    root.innerHTML = `<div style="text-align:center;padding:20px">
      <div style="font-size:32px;margin-bottom:12px">${mevcutBaşvuru.durum==='onaylandi'?'🎉':mevcutBaşvuru.durum==='bekliyor'?'⏳':'😔'}</div>
      <div style="font-size:15px;font-weight:700;color:var(--tx-1)">${durumMesaj}</div>
    </div>`;
    return;
  }
  root.innerHTML = `
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:32px;margin-bottom:8px">🏠</div>
      <div style="font-size:18px;font-weight:800;color:var(--tx-1)">Sisteme Kayıt Ol</div>
      <div style="font-size:13px;color:var(--tx-3);margin-top:4px">${he(apt?.ad||'Apartman')} — Daire ${he(sk.daire||'?')}</div>
    </div>
    <div class="fg">
      <input type="hidden" id="dkayit-token" value="${token}">
      <div class="fgp"><label class="lbl">Adınız Soyadınız *</label><input class="fi" id="dkayit-ad" value="${he(sk.ad||'')}" placeholder="Ad Soyad"></div>
      <div class="fgp"><label class="lbl">E-posta *</label><input class="fi" id="dkayit-email" type="email" value="${he(sk.email||'')}" placeholder="ornek@email.com"></div>
      <div class="fgp"><label class="lbl">Telefon *</label><input class="fi" id="dkayit-tel" value="${he(sk.tel||'')}" placeholder="05xx xxx xx xx"></div>
      <div style="background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:12px;font-size:12px;color:var(--tx-3)">
        <strong>Daire Bilgileri:</strong> ${he(apt?.ad||'—')} · Daire ${he(sk.daire||'?')} · ${sk.tip==='kiralik'?'Kiracı':'Malik'}
      </div>
      <button class="btn bp" onclick="submitDavetKayit()" style="width:100%;padding:12px;font-size:14px">
        <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Kayıt Başvurusu Yap
      </button>
    </div>`;
}

function submitDavetKayit() {
  const token = document.getElementById('dkayit-token')?.value;
  const ad = document.getElementById('dkayit-ad')?.value.trim();
  const email = document.getElementById('dkayit-email')?.value.trim();
  const tel = document.getElementById('dkayit-tel')?.value.trim();
  if (!ad || !email || !tel) { toast('Tüm alanları doldurun!', 'err'); return; }
  const sk = S.sakinler.find(s => s.davetToken === token);
  if (!sk) { toast('Geçersiz davet.', 'err'); return; }
  if (!S.bekleyenKayitlar) S.bekleyenKayitlar = [];
  S.bekleyenKayitlar.push({
    id: 'bk-' + Date.now(),
    sakId: sk.id,
    daire: sk.daire,
    aptId: sk.aptId,
    ad, email, tel,
    tarih: new Date().toISOString(),
    durum: 'bekliyor'
  });
  save();
  toast('Kayıt başvurunuz alındı! Yönetici onayı bekleniyor.', 'ok');
  renderDavetKayitSayfasi(token);
  updateDavetBekleyenBadge();
}

// ── SUPABASE KREDENSİYELLER ──────────────────────
const _SB_URL = 'https://ohantorzzbxjkkgtspgn.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oYW50b3J6emJ4amtrZ3RzcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTcwMDQsImV4cCI6MjA5MDM3MzAwNH0.cDby1HJcvWu5XBCUSSJiOGncHk51rIzCpoMRO3toebI';

// STARTUP — Rol seçim ekranı ile başla
(function startup() {
  initSupabase(_SB_URL, _SB_KEY);
  const authEl = document.getElementById('auth-screen');
  if (authEl) authEl.classList.add('hidden');

  // Daha önce rol seçilmişse direkt giriş
  const savedRole = sessionStorage.getItem('syp_role');
  if (savedRole) {
    currentRole = savedRole;
    document.getElementById('role-screen')?.classList.add('hidden');
    document.getElementById('main').style.display = '';
    applyRole(savedRole);
    loadState();
    if (!S.apartmanlar || S.apartmanlar.length === 0) {
      const _orig = window.confirm; window.confirm = () => true; loadDemoData(); window.confirm = _orig;
    } else { initApp(); }
    if (savedRole === 'superadmin') goPage('superadmin');
  } else {
    // Rol seçim ekranını göster
    document.getElementById('main').style.display = 'none';
    document.getElementById('role-screen')?.classList.remove('hidden');
  }
})();
