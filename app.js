// ═══════════════════════════════════════════
// SUPABASE ENTEGRASYONU
// ═══════════════════════════════════════════
let _supabase = null;
let _currentUser = null;

function getSupabaseConfig() {
  try {
    const cfg = localStorage.getItem('syp_sb_config');
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
  try {
    const { error } = await _supabase.from('syp_data').upsert({
      id: _currentUser.id,
      user_id: _currentUser.id,
      data: S,
      updated_at: new Date().toISOString()
    });
    if (error) console.error('Supabase save error:', error);
  } catch(e) { console.error('Supabase save exception:', e); }
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
  localStorage.setItem('syp_sb_config', JSON.stringify({ url, key }));
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
  localStorage.setItem('syp_sb_config', JSON.stringify({ url, key }));
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
  goPage('dashboard');
}

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
const DEF_STATE = { apartmanlar:[], denetimler:[], teklifler:[], gorevler:[], asansorler:[], isletmeProjeler:[], kararlar:[], icralar:[], sakinler:[], personel:[], duyurular:[], arizalar:[], tahsilatlar:[], sigortalar:[], toplantılar:[], faturalar:[], finansIslemler:[], ayarlar:{}, gelirTanimlari:[], giderTanimlari:[], projeler:[], iletisimLoglari:[], duyuruOkundu:{}, otomasyonKurallari:[] };
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
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="#fff" stroke-width="2" fill="none"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/></svg>
        <span class="gsb-btn-name">${apt.ad}</span>
        <svg class="gsb-btn-arrow" id="gsb-arrow" viewBox="0 0 24 24" width="14" height="14" stroke="#fff" stroke-width="2.5" fill="none"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="gsb-dropdown" id="gsb-dropdown">${items}</div>
    </div>
    <div class="gsb-divider"></div>
    <div class="gsb-stats">
      <div class="gsb-stat">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="#fff" stroke-width="2" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <span><strong>${sakinSayisi}</strong> Sakin</span>
      </div>
      ${borcluSayisi > 0 ? `<div class="gsb-stat"><svg viewBox="0 0 24 24" width="14" height="14" stroke="#fca5a5" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span style="color:#fca5a5"><strong>${borcluSayisi}</strong> Borçlu</span></div>` : ''}
      ${acikAriza > 0 ? `<div class="gsb-stat"><svg viewBox="0 0 24 24" width="14" height="14" stroke="#fcd34d" stroke-width="2" fill="none"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg><span style="color:#fcd34d"><strong>${acikAriza}</strong> Arıza</span></div>` : ''}
      <div class="gsb-stat">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="#fff" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        <span><strong>${daireSayisi}</strong> Daire</span>
      </div>
    </div>
    ${apts.length > 1 ? `<button class="gsb-all-btn" onclick="switchGlobalSite(null)" title="Tüm siteleri göster" id="gsb-all-btn" ${!selectedAptId?'style="background:rgba(255,255,255,.35)"':''}>Tümü</button>` : ''}
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

/** Geriye dönük uyumluluk: eski çağrılar hâlâ çalışsın */
function updateAptCtxTopbar() { updateGlobalSiteBar(); }

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

function toggleTopbarSwitcher(){ toggleGsbDropdown(); }

function topbarSwitchApt(aptId){ switchGlobalSite(aptId); }

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
 if (!S.icralar) S.icralar = [];
  if (!S.finansIslemler) S.finansIslemler = [];
  if (!S.ayarlar) S.ayarlar = {};
  if (!S.sakinler) S.sakinler = [];
  initTanimlar();
  if (!S.personel) S.personel = [];
  if (!S.duyurular) S.duyurular = [];
  if (!S.arizalar) S.arizalar = [];
  if (!S.tahsilatlar) S.tahsilatlar = [];
  if (!S.sigortalar) S.sigortalar = [];
  if (!S.toplantılar) S.toplantılar = [];
  if (!S.faturalar) S.faturalar = [];
}
function save() {
  try { localStorage.setItem('syp5', JSON.stringify(S)); } catch(e) {}
  saveToSupabase();
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
    else if (ap === 'finans') { renderFinans(); renderFinansRapor(); }
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
    else if (ap === 'apt-detay') { /* no refresh needed */ }
    else if (ap === 'daire-detay') { /* no refresh needed */ }
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
// NAVIGATION
// 
const PAGE_TITLES = { dashboard:'Anasayfa', apartmanlar:'Apartmanlar', karar:'Karar Metni Oluşturucu', isletme:'İşletme Projesi', 'isl-detay':'İşletme Projesi Detay', denetim:'Denetim Raporları', 'den-detay':'Denetim Raporu Detay', asansor:'Asansör Etiket Kontrolü', 'asan-detay':'Asansör Detay', teklifler:'Teklifler', gorevler:'Görev Yönetimi', icra:'İcra Listesi', finans:'Gelir / Gider Takibi', ayarlar:'Ayarlar', sakinler:'Sakin Yönetimi', personel:'Personel Yönetimi', duyurular:'Duyuru & İletişim', ariza:'Arıza & Bakım Yönetimi', tahsilat:'Tahsilat & Borç Takibi', raporlar:'Raporlar & Analitik', 'ai-asistan':'AI Yönetim Asistanı', sigorta:'Sigorta Takibi', toplanti:'Toplantı Yönetimi', fatura:'Fatura & Hizmet Yönetimi', superadmin:'Süper Admin Paneli', 'apt-detay':'Apartman Detay', 'daire-detay':'Daire Detay', 'sakin-cari':'Kişilere Göre Finansal Durum', 'tanimlama':'Tanımlama — Gelir & Gider Kategorileri', 'proje':'Proje & Tadilat Takibi', 'iletisim':'İletişim Merkezi', 'toplu-borc':'Toplu Borçlandırma' };

function goPage(p) {
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
 'apt-detay': '<button class="btn bg" onclick="goPage(\'apartmanlar\')"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 'daire-detay': '<button class="btn bg" onclick="goPage(\'sakinler\')"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 proje: '<button class="btn bp" onclick="openProjeModal()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Yeni Proje</button>',
 iletisim: '<button class="btn bp" onclick="openIletisimModal()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Yeni Log</button>',
'sakin-cari': '<button class="btn bg" onclick="window._cariFromDaire?goPage(\'daire-detay\'):goPage(\'sakinler\')"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 'isl-detay': '<button class="btn bg" onclick="goPage(\'isletme\');setTimeout(()=>goTab(\'isl-kayitli\'),50)"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 'den-detay': '<button class="btn bg" onclick="goPage(\'denetim\');setTimeout(()=>goTab(\'den-liste\'),50)"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 'asan-detay': '<button class="btn bg" onclick="goPage(\'asansor\')"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="15 18 9 12 15 6"/></svg> Geri</button>',
 'toplu-borc': '',
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
 if (p==='isl-detay') { /* rendered by goIslDetay */ }
 if (p==='karar') renderKararlar();
 if (p==='icra') { renderIcra(); renderIcraRapor(); }
  if (p==='finans') { renderFinans(); renderFinansRapor(); }
  if (p==='ayarlar') { loadSettings(); renderSetStats(); }
  if (p==='sakinler') { renderSakinler(); initTopluDaireForm(); }
  if (p==='toplu-borc') { renderTopluBorcPage(); }
  if (p==='tanimlama') renderTanimlama();
  if (p==='proje') renderProjeler();
  if (p==='iletisim') renderIletisim();
  if (p==='personel') { renderPersonel(); }
  if (p==='duyurular') { renderDuyurular(); }
  if (p==='ariza') { renderAriza(); }
  if (p==='tahsilat') { renderTahsilat(); }
  if (p==='raporlar') { renderRaporlar(); }
  if (p==='ai-asistan') { initAiAsistan(); }
  if (p==='sigorta') { renderSigorta(); }
  if (p==='toplanti') { renderToplanti(); }
  if (p==='fatura') { renderFatura(); }
  if (p==='apt-detay') { /* rendered by goAptDetay */ }
  if (p==='daire-detay') { /* rendered by goDaireDetay */ }
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
    if (id==='sak-toplu-borc') { try{renderTopluBorc();}catch(e){} }
    if (id==='tbp-gecmis') { try{renderTopluBorcGecmis();}catch(e){} }
    if (id==='sig-liste') { try{renderSigorta();}catch(e){} }
    if (id==='top-liste') { try{renderToplanti();}catch(e){} }
    if (id==='top-takvim') { try{renderTopTakvim();}catch(e){} }
    if (id==='fat-liste') { try{renderFatura();}catch(e){} }
    if (id==='fat-ozet') { try{renderFaturaOzet();}catch(e){} }
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
document.querySelectorAll('.ov').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));

// 
// DROPDOWNS — central sync
// 
const DD_IDS = ['kar-apt','isl-apt','den-apt','asan-apt','tek-apt','gov-apt','icra-apt','icra-f-apt','tek-f-apt','kar-f-apt','gov-f-apt', 'sak-apt', 'per-apt', 'duy-apt', 'arz-apt', 'arz-f-apt', 'tah-o-apt', 'sig-apt', 'top-apt', 'fat-apt', 'fin-apt', 'fin-f-apt', 'sig-f-apt', 'top-f-apt', 'fat-f-apt', 'toplu-blok'];

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

  // Stats row
  const asnIco = dolAsan
    ? '<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    : '<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/></svg>';
  // Welcome banner
  const now = new Date();
  const saat = now.getHours();
  const selamlama = saat < 12 ? 'Günaydın' : saat < 18 ? 'İyi günler' : 'İyi akşamlar';
  const yoneticiAd = S.ayarlar?.yonetici || 'Yönetici';
  const tarihStr = now.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const welcomeEl = document.getElementById('ds-welcome');
  if (welcomeEl) {
    welcomeEl.innerHTML = '<div class="welcome-banner"><h2>' + selamlama + ', ' + yoneticiAd + '!</h2><p>Bugün sistemde ' + aktif + ' aktif apartman, ' + acikGov + ' açık görev ve ' + acikAriza + ' bekleyen arıza bulunuyor.</p><div class="wb-date">' + tarihStr + '</div></div>';
  }

  const qaEl = document.getElementById('ds-quick-actions');
  if (qaEl) {
    qaEl.innerHTML = '<div class="quick-actions">' +
      '<div class="qa-btn" onclick="openAptModal()"><div class="qa-ico">🏢</div><div class="qa-lbl">Apartman Ekle</div></div>' +
      '<div class="qa-btn" onclick="goPage(\'sakinler\')"><div class="qa-ico">👤</div><div class="qa-lbl">Sakin Ekle</div></div>' +
      '<div class="qa-btn" onclick="goPage(\'ariza\');goTab(\'arz-yeni\')"><div class="qa-ico">🔧</div><div class="qa-lbl">Arıza Bildir</div></div>' +
      '<div class="qa-btn" onclick="goPage(\'tahsilat\')"><div class="qa-ico">💰</div><div class="qa-lbl">Tahsilat</div></div>' +
      '<div class="qa-btn" onclick="goPage(\'duyurular\');goTab(\'duy-yeni\')"><div class="qa-ico">📢</div><div class="qa-lbl">Duyuru Yaz</div></div>' +
      '<div class="qa-btn" onclick="goPage(\'fatura\');goTab(\'fat-yeni\')"><div class="qa-ico">📄</div><div class="qa-lbl">Fatura Ekle</div></div>' +
      '</div>';
  }

  document.getElementById('ds-stats').innerHTML =
    '<div class="sc" onclick="goPage(\'apartmanlar\')" style="cursor:pointer"><div class="sc-ico ic-bl"><svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/></svg></div><div class="sc-lbl">Aktif Apartman</div><div class="sc-val v-bl">' + aktif + '</div><div class="sc-sub">' + S.apartmanlar.length + ' toplam kayıt</div><div class="sc-bar bar-bl"></div></div>' +
    '<div class="sc" onclick="goPage(\'apartmanlar\')" style="cursor:pointer"><div class="sc-ico ic-pu"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div><div class="sc-lbl">Toplam Daire</div><div class="sc-val v-pu">' + topDaire + '</div><div class="sc-sub">Tüm apartmanlar</div><div class="sc-bar bar-pu"></div></div>' +
    '<div class="sc" onclick="goPage(\'gorevler\')" style="cursor:pointer"><div class="sc-ico ic-am"><svg viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div><div class="sc-lbl">Açık Görev</div><div class="sc-val v-am">' + acikGov + '</div><div class="sc-sub">' + tamGov + ' tamamlandı</div><div class="sc-bar bar-am"></div></div>' +
    '<div class="sc" onclick="goPage(\'asansor\')" style="cursor:pointer"><div class="sc-ico ' + (dolAsan?'ic-rd':'ic-tl') + '">' + asnIco + '</div><div class="sc-lbl">Asansör Uyarısı</div><div class="sc-val ' + (dolAsan?'v-rd':'v-tl') + '">' + dolAsan + '</div><div class="sc-sub">Süresi dolmuş etiket</div><div class="sc-bar ' + (dolAsan?'bar-rd':'bar-tl') + '"></div></div>' +
    '<div class="sc" onclick="goPage(\'finans\')" style="cursor:pointer"><div class="sc-ico ic-gr"><svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">&#8378;</text></svg></div><div class="sc-lbl">Toplam Hizmet Bedeli</div><div class="sc-val v-gr" style="font-size:18px">₺' + fmt(topHizmet) + '</div><div class="sc-sub">Aktif apartmanlar</div><div class="sc-bar bar-gr"></div></div>' +
    '<div class="sc" onclick="goPage(\'sakinler\')" style="cursor:pointer"><div class="sc-ico ic-bl"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div class="sc-lbl">Toplam Sakin</div><div class="sc-val v-bl">' + topSakin + '</div><div class="sc-sub">' + borcluSakin + ' borçlu</div><div class="sc-bar bar-bl"></div></div>' +
    '<div class="sc" onclick="goPage(\'ariza\')" style="cursor:pointer"><div class="sc-ico ic-rd"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div class="sc-lbl">Açık Arıza</div><div class="sc-val v-rd">' + acikAriza + '</div><div class="sc-sub">Bekleyen</div><div class="sc-bar bar-rd"></div></div>' +
    '<div class="sc" onclick="goPage(\'personel\')" style="cursor:pointer"><div class="sc-ico ic-am"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="sc-lbl">Aktif Personel</div><div class="sc-val v-am">' + aktifPer + '</div><div class="sc-sub">Toplam ' + S.personel.length + '</div><div class="sc-bar bar-am"></div></div>';

  // Helper: empty state
  function empState(txt) {
    return '<div class="emp"><div>' + txt + '</div></div>';
  }

  // Son Apartmanlar
  var apts = S.apartmanlar.slice(-5).reverse();
  if (!apts.length) {
    document.getElementById('ds-apts').innerHTML = empState('Apartman eklenmedi');
  } else {
    document.getElementById('ds-apts').innerHTML = apts.map(function(a) {
      return '<div class="fbc" style="padding:7px 0;border-bottom:1.5px solid var(--border)">' +
        '<div><div style="font-size:12.5px;font-weight:700">' + a.ad + '</div>' +
        '<div class="t3" style="font-size:11px">' + (a.daireSayisi||0) + ' daire · ' + (a.ilce||a.il||'—') + '</div></div>' +
        '<span class="b ' + (a.durum==='aktif'?'b-gr':'b-rd') + '">' + (a.durum||'—') + '</span></div>';
    }).join('');
  }

  // Açık Görevler
  var openG = S.gorevler.filter(function(g){ return g.durum!=='tamamlandi'; }).slice(-5);
  if (!openG.length) {
    document.getElementById('ds-govs').innerHTML = empState('Açık görev yok');
  } else {
    document.getElementById('ds-govs').innerHTML = openG.map(function(g) {
      return '<div class="fbc" style="padding:7px 0;border-bottom:1.5px solid var(--border)">' +
        '<div><div style="font-size:12.5px;font-weight:700">' + g.baslik + '</div>' +
        '<div class="t3" style="font-size:11px">' + (g.atanan||'Atanmamış') + ' · ' + (g.son||'—') + '</div></div>' +
        '<span class="b ' + onBadge(g.oncelik) + '">' + (g.oncelik||'—') + '</span></div>';
    }).join('');
  }

  // Asansör Uyarıları
  var warn = S.asansorler.filter(function(a){ return dayDiff(a.sonTarih)<30; })
    .sort(function(a,b){ return new Date(a.sonTarih)-new Date(b.sonTarih); }).slice(0,5);
  if (!warn.length) {
    document.getElementById('ds-asan').innerHTML = empState('Kritik asansör kaydı yok');
  } else {
    document.getElementById('ds-asan').innerHTML = warn.map(function(a) {
      var d = dayDiff(a.sonTarih);
      var asanLabel = a.blok && a.blok !== '—' ? a.blok + (a.asansorNo ? ' · Asansör '+a.asansorNo : '') : (a.bolum||'');
      return '<div class="fbc" style="padding:7px 0;border-bottom:1px solid var(--border)">' +
        '<div><div style="font-size:12.5px;font-weight:700">' + a.aptAd + '</div>' +
        '<div class="t3" style="font-size:11px">' + asanLabel + ' · ' + a.sonTarih + '</div></div>' +
        '<span class="b ' + (d<0?'b-rd':'b-am') + '">' + (d<0?(Math.abs(d)+' gün geçti'):(d+' gün')) + '</span></div>';
    }).join('');
  }

  // Aktif İcra Dosyaları
  var aktifDosyalar = (S.icralar||[]).filter(function(i){ return i.durum==='devam'; }).slice(-5);
  if (!aktifDosyalar.length) {
    document.getElementById('ds-icra').innerHTML = empState('Aktif icra dosyası yok');
  } else {
    document.getElementById('ds-icra').innerHTML = aktifDosyalar.map(function(i) {
      return '<div class="fbc" style="padding:7px 0;border-bottom:1.5px solid var(--border)">' +
        '<div><div style="font-size:12.5px;font-weight:700">' + (i.aptAd||'—') + '</div>' +
        '<div class="t3" style="font-size:11px">' + (i.borclu||'—') + ' · ' + (i.dosyaNo||'—') + '</div></div>' +
        '<span class="b b-rd">&#8378;' + fmt(i.tutar||0) + '</span></div>';
    }).join('');
  }

  // Hizmet Bedelleri listesi
  var hizmetApts = S.apartmanlar.filter(function(a){ return a.durum==='aktif' && a.hizmetBedeli > 0; })
    .sort(function(a,b){ return (b.hizmetBedeli||0)-(a.hizmetBedeli||0); });
  var toplamHizmet = hizmetApts.reduce(function(s,a){ return s+(a.hizmetBedeli||0); }, 0);
  var maxHizmet = hizmetApts.length ? hizmetApts[0].hizmetBedeli : 1;
  if (!hizmetApts.length) {
    document.getElementById('ds-hizmet').innerHTML = empState('Hizmet bedeli girilmiş aktif apartman yok');
  } else {
    document.getElementById('ds-hizmet').innerHTML =
      hizmetApts.map(function(a) {
        var pct = Math.round((a.hizmetBedeli / maxHizmet) * 100);
        return '<div style="padding:8px 0;border-bottom:1px solid var(--border)">' +
          '<div class="fbc mb4">' +
          '<div style="font-size:12.5px;font-weight:600">' + a.ad + '</div>' +
          '<div style="font-family:\'DM Mono\',monospace;font-size:13px;font-weight:700;color:var(--ok)">₺' + fmt(a.hizmetBedeli) + '</div>' +
          '</div>' +
          '<div style="height:4px;background:var(--s3);border-radius:4px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--brand),var(--accent));border-radius:4px;transition:.3s"></div>' +
          '</div></div>';
      }).join('') +
      '<div class="fbc" style="padding:10px 0 2px;margin-top:4px">' +
      '<span style="font-size:12px;font-weight:700;color:var(--tx-2)">Aylık Toplam</span>' +
      '<span style="font-family:\'DM Mono\',monospace;font-size:15px;font-weight:700;color:var(--ok)">₺' + fmt(toplamHizmet) + '</span>' +
      '</div>';
  }

  // Borçlu Sakinler
  var borcluEl = document.getElementById('ds-borclu');
  if (borcluEl) {
    var borcluList = S.sakinler.filter(function(x){ return (x.borc||0)>0; }).sort(function(a,b){ return (b.borc||0)-(a.borc||0); }).slice(0,7);
    if (!borcluList.length) {
      borcluEl.innerHTML = '<div class="emp"><span class="emp-i">✅</span><p>Borçlu sakin bulunmuyor!</p></div>';
    } else {
      borcluEl.innerHTML = borcluList.map(function(sk) {
        return '<div class="fbc" style="padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="goDaireDetay('+sk.id+')">' +
          '<div><div style="font-size:12.5px;font-weight:700">' + sk.ad + '</div>' +
          '<div style="font-size:11px;color:var(--tx-3)">' + (sk.aptAd||'—') + ' · Daire ' + (sk.daire||'?') + '</div></div>' +
          '<span style="font-family:\'DM Mono\',monospace;font-size:13px;font-weight:700;color:var(--err)">₺' + fmt(sk.borc||0) + '</span></div>';
      }).join('');
    }
  }

  // Son Tahsilatlar
  var tahsilEl = document.getElementById('ds-tahsilat');
  if (tahsilEl) {
    var sonTahsilatlar = (S.tahsilatlar||[]).slice().sort(function(a,b){ return (b.tarih||'').localeCompare(a.tarih||''); }).slice(0,7);
    if (!sonTahsilatlar.length) {
      tahsilEl.innerHTML = '<div class="emp"><span class="emp-i">💳</span><p>Henüz tahsilat kaydı yok.</p></div>';
    } else {
      tahsilEl.innerHTML = sonTahsilatlar.map(function(t) {
        var sakAd = t.sakAd || t.sakinAd || '—';
        return '<div class="fbc" style="padding:7px 0;border-bottom:1px solid var(--border)">' +
          '<div><div style="font-size:12.5px;font-weight:700">' + sakAd + '</div>' +
          '<div style="font-size:11px;color:var(--tx-3)">' + (t.aptAd||'—') + ' · ' + (t.tarih||'—') + '</div></div>' +
          '<span style="font-family:\'DM Mono\',monospace;font-size:13px;font-weight:700;color:var(--ok)">₺' + fmt(t.tutar||0) + '</span></div>';
      }).join('');
    }
  }

  // Uyarı Özeti
  const uyariEl = document.getElementById('ds-uyari-ozeti');
  if (uyariEl) {
    const notifItems = buildNotifs();
    const danger = notifItems.filter(x=>x.type==='danger');
    const warn = notifItems.filter(x=>x.type==='warn');
    const info = notifItems.filter(x=>x.type==='info');
    if (!notifItems.length) {
      uyariEl.innerHTML = '<div style="background:var(--ok-bg);border:1px solid var(--ok-bd);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:10px;font-size:13px"><span style="font-size:18px">✅</span><span style="color:var(--ok);font-weight:600">Her şey yolunda! Kritik uyarı bulunmuyor.</span></div>';
    } else {
      uyariEl.innerHTML = `<div style="background:var(--warn-bg);border:1px solid var(--warn-bd);border-radius:12px;padding:12px 18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;cursor:pointer" onclick="toggleNotifPanel()">
        <span style="font-size:18px">⚠️</span>
        <span style="font-weight:700;color:var(--warn);font-size:13px">Dikkat gerektiren durumlar:</span>
        ${danger.length?`<span style="background:var(--err-bg);color:var(--err);border:1px solid var(--err-bd);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700">🔴 ${danger.length} Kritik</span>`:''}
        ${warn.length?`<span style="background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn-bd);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700">🟡 ${warn.length} Uyarı</span>`:''}
        ${info.length?`<span style="background:var(--info-bg);color:var(--info);border:1px solid var(--info-bd);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700">🔵 ${info.length} Bilgi</span>`:''}
        <span style="margin-left:auto;font-size:12px;color:var(--tx-3)">Detaylar için tıklayın →</span>
      </div>`;
    }
    updateNotifDot();
  }

  // Son Finansal İşlemler
  const finListEl = document.getElementById('ds-fin-list');
  if (finListEl) {
    const finIslemler = (S.finansIslemler||[]).slice().sort((a,b)=>(b.tarih||'').localeCompare(a.tarih||'')).slice(0,6);
    if (!finIslemler.length) {
      finListEl.innerHTML = empState('Henüz finansal işlem kaydı yok');
    } else {
      finListEl.innerHTML = finIslemler.map(f => {
        const isGelir = f.tur === 'gelir';
        return `<div class="fbc" style="padding:7px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:12.5px;font-weight:600">${f.aciklama||f.kat||'—'}</div>
            <div style="font-size:11px;color:var(--tx-3)">${f.aptAd||'—'} · ${f.tarih||'—'} · <span class="b ${isGelir?'b-gr':'b-rd'}" style="font-size:10px">${isGelir?'Gelir':'Gider'}</span></div>
          </div>
          <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:${isGelir?'var(--ok)':'var(--err)'}">${isGelir?'+':'−'}₺${fmt(f.tutar||0)}</span>
        </div>`;
      }).join('') + `<div style="text-align:center;margin-top:8px"><button class="btn bg xs" onclick="goPage('finans')" style="font-size:11px">Tüm İşlemleri Gör →</button></div>`;
    }
  }
}

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
 tb.innerHTML = list.map(a => `<tr> <td><span style="cursor:pointer;font-weight:600;color:var(--brand)" onclick="goAptDetay(${a.id})">${a.ad}</span></td> <td class="t2" style="font-size:11.5px">${a.adres}${a.ilce?', '+a.ilce:''}${a.il?', '+a.il:''}</td> <td>${a.daireSayisi}</td> <td>${a.yon||'—'}</td> <td style="font-weight:700;color:var(--ok)">${a.aidat?'₺'+fmt(a.aidat):'—'}</td> <td style="font-weight:700;color:var(--brand)">${a.hizmetBedeli?'₺'+fmt(a.hizmetBedeli):'—'}</td> <td><span class="b ${a.asansor==='evet'?'b-gr':'b-gy'}">${a.asansor==='evet'?'Var':'Yok'}</span></td> <td><span class="b ${a.durum==='aktif'?'b-gr':'b-rd'}">${a.durum==='aktif'?' Aktif':' Pasif'}</span></td> <td><div class="act"> <button class="btn bg xs" onclick="goAptDetay(${a.id})" title="Sayfayı Aç" style="color:var(--brand)"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button> <button class="btn bg xs" onclick="openAptModal(${a.id})" title="Düzenle"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button> <button class="btn ${a.durum==='aktif'?'brd':'bgn'} xs" onclick="toggleApt(${a.id})" title="${a.durum==='aktif'?'Pasife Al':'Aktif Et'}">${a.durum==='aktif'?'Pasif':'Aktif'}</button> <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delApt(${a.id})" title="Sil"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button> </div></td> </tr>`).join('');
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
  const ad = document.getElementById('apt-ad').value.trim();
  const adres = document.getElementById('apt-adres').value.trim();
  const ds = parseInt(document.getElementById('apt-daire').value)||0;
  if (!ad || !adres || ds < 1) { toast('Ad, adres ve daire sayısı zorunlu!','err'); return; }
  // Blok verilerini topla
  const bloklar = blokRows.map(function(b, i) {
    const adEl = document.getElementById('blok-ad-' + i);
    const asEl = document.getElementById('blok-asan-' + i);
    return {
      ad: adEl ? adEl.value.trim() || b.ad : b.ad,
      asansorSayisi: asEl ? parseInt(asEl.value)||0 : (b.asansorSayisi||0)
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

  var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  // Header row
  html += '<div style="font-size:10px;font-weight:700;color:var(--tx-3);text-transform:uppercase;letter-spacing:.8px;padding:0 2px;">Blok Adı</div>';
  html += '<div style="font-size:10px;font-weight:700;color:var(--tx-3);text-transform:uppercase;letter-spacing:.8px;padding:0 2px;">Asansör Sayısı</div>';
  for (var j = 0; j < blokRows.length; j++) {
    var b = blokRows[j];
    html += '<input class="fi" id="blok-ad-' + j + '" value="' + (b.ad||'') + '" placeholder="A Blok" style="padding:8px 10px;font-size:13px;">';
    html += '<div style="display:flex;align-items:center;gap:6px;">'
          + '<button type="button" class="btn bg xs" onclick="adjBlokAsan(' + j + ',-1)" style="width:28px;height:28px;padding:0;justify-content:center;font-size:16px;flex-shrink:0">−</button>'
          + '<input type="number" class="fi" id="blok-asan-' + j + '" value="' + (b.asansorSayisi||0) + '" min="0" max="10" style="padding:8px;text-align:center;font-size:13px;font-weight:700;">'
          + '<button type="button" class="btn bg xs" onclick="adjBlokAsan(' + j + ',1)" style="width:28px;height:28px;padding:0;justify-content:center;font-size:16px;flex-shrink:0">+</button>'
          + '</div>';
  }
  html += '</div>';
  // Özet
  var toplamAsan = blokRows.reduce(function(s, b) { return s + (parseInt(b.asansorSayisi)||0); }, 0);
  html += '<div class="info-box mt8" style="font-size:11.5px;">'
        + '<strong>' + blokRows.length + ' blok</strong>, toplam <strong>' + toplamAsan + ' asansör</strong>'
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
        <button class="btn bp xs" onclick="topluDaireEkle(${bi})" style="font-size:11px;font-weight:600">+ Ekle</button>
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
          <span>Toplam: <strong style="color:var(--tx-1)">${blok.daireler.length} bağımsız bölüm</strong></span>
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
  renderIslDetay(p);
  goPage('isl-detay');
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
  renderDenDetay(d);
  goPage('den-detay');
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
  renderAsanDetay(a);
  goPage('asan-detay');
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
            <span>Etiket Tarihi: <strong style="color:var(--tx-1)">${a.etiketTarih}</strong></span>
            <span>Son Tarihi: <strong style="color:var(--tx-1)">${a.sonTarih}</strong></span>
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
 if (id) {
 const g=S.gorevler.find(x=>x.id===id);
 document.getElementById('gov-baslik').value=g.baslik;
 document.getElementById('gov-apt').value=g.aptId||'';
 document.getElementById('gov-kat').value=g.kat||'bakim';
 document.getElementById('gov-atanan').value=g.atanan||'';
 document.getElementById('gov-oncelik').value=g.oncelik;
 document.getElementById('gov-bas').value=g.bas||'';
 document.getElementById('gov-son').value=g.son||'';
 document.getElementById('gov-aciklama').value=g.aciklama||'';
 } else {
 ['gov-baslik','gov-atanan','gov-aciklama','gov-bas','gov-son'].forEach(id=>document.getElementById(id).value='');
 document.getElementById('gov-oncelik').value='normal';
 document.getElementById('gov-kat').value='bakim';
 document.getElementById('gov-apt').value='';
 }
 openModal('mod-gov');
}

function saveGov() {
 const b=document.getElementById('gov-baslik').value.trim();
 if (!b){toast('Başlık zorunlu!','err');return;}
 const apt=aptById(document.getElementById('gov-apt').value);
 const gov={
 id:editId||Date.now(), baslik:b, aptId:apt?.id||null, aptAd:apt?.ad||'—',
 kat:document.getElementById('gov-kat').value,
 atanan:document.getElementById('gov-atanan').value,
 oncelik:document.getElementById('gov-oncelik').value,
 bas:document.getElementById('gov-bas').value,
 son:document.getElementById('gov-son').value,
 aciklama:document.getElementById('gov-aciklama').value,
 durum:editId?S.gorevler.find(x=>x.id===editId)?.durum||'bekliyor':'bekliyor',
 ilerleme:editId?S.gorevler.find(x=>x.id===editId)?.ilerleme||0:0
 };
 if (editId){const i=S.gorevler.findIndex(x=>x.id===editId);if(i>=0)S.gorevler[i]=gov;}
 else S.gorevler.push(gov);
 save();closeModal('mod-gov');
 toast(editId?'Görev güncellendi.':'Görev eklendi.','ok');
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
 tb.innerHTML=list.slice().reverse().map(g=>`<tr> <td><div class="fc g8"><span>${kIco[g.kat]||''}</span><div><div style="font-weight:700;font-size:12.5px">${g.baslik}</div>${g.aciklama?`<div class="t3" style="font-size:10.5px">${g.aciklama.slice(0,50)}${g.aciklama.length>50?'…':''}</div>`:''}</div></div></td> <td>${g.aptAd||'—'}</td> <td>${g.atanan||'—'}</td> <td><span class="b ${onBadge(g.oncelik)}">${g.oncelik}</span></td> <td>${g.son?`<span style="color:${dayDiff(g.son)<0?'var(--err)':dayDiff(g.son)<3?'var(--warn)':'var(--tx-2)'}">${g.son}</span>`:'—'}</td> <td><span class="b ${dCls[g.durum]||'b-gy'}">${dLbl[g.durum]||g.durum}</span></td> <td> <div class="prog" style="min-width:55px"><div class="prog-fill" style="width:${g.ilerleme||0}%;background:${g.durum==='tamamlandi'?'var(--ok)':'var(--brand)'}"></div></div> <div class="t3" style="font-size:9.5px;margin-top:2px">${g.ilerleme||0}%</div> </td> <td><div class="act"><button class="btn bg xs" onclick="openGovModal(${g.id})" title="Düzenle">✏️ Düzenle</button><button class="btn bg xs" onclick="openIlerleme(${g.id})" title="İlerleme Güncelle">📊 İlerleme</button><button class="act-btn rd" onclick="delGov(${g.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></div></td> </tr>`).join('');
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


// 
// AI HELPER
// 
async function callAI(prompt) {
  const apiKey = localStorage.getItem('syp_apikey') || '';
  if (!apiKey) { toast('AI için Ayarlar sayfasından API anahtarı girin.','err'); throw new Error('API key missing'); }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000, messages:[{role:'user',content:prompt}] })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.map(c=>c.text||'').join('') || '';
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
          <td style="font-weight:700;color:var(--brand)">${sk.daire||'—'}</td>
          <td><strong>${sk.ad}</strong>${sk.kat?'<div class="t3" style="font-size:10.5px">Kat: '+sk.kat+'</div>':''}</td>
          <td><span class="b ${sk.tip==='malik'?'b-bl':'b-am'}">${sk.tip==='malik'?'Malik':'Kiracı'}</span></td>
          <td>${sk.tel||'—'}</td>
          <td class="t2" style="font-size:11px">${sk.email||'—'}</td>
          <td style="color:var(--ok)">${sk.aidat?'₺'+fmt(sk.aidat):'-'}</td>
          <td style="font-weight:700;color:${borc>0?'var(--err)':'var(--ok)'}">${borc>0?'₺'+fmt(borc):'Temiz'}</td>
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
              &nbsp;Daire: <strong style="color:var(--brand)">${sk.daire||'—'}</strong>${sk.kat?' · Kat '+sk.kat:''}
              ${!aptId?`<div style="font-size:10.5px;color:var(--tx-4);margin-top:2px">🏢 ${sk.aptAd||'—'}</div>`:''}
            </div>
          </div>
          ${borc>0?`<div style="font-size:11px;font-weight:700;color:var(--err);text-align:right">₺${fmt(borc)}<div style="font-size:10px;font-weight:400;color:var(--tx-3)">borç</div></div>`:'<div style="font-size:10px;color:var(--ok)">✓ Temiz</div>'}
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
        <button class="btn bp xs" style="margin-top:8px;font-size:11px" onclick="kaydedExcelSakinler(window._excelImportRows,${JSON.stringify({iDaireNo,iBlok,iMalik,iMalikTel,iKiraci,iKiraciTel,iTip}).replace(/"/g,'&quot;')})">
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


function saveSakin() {
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
    setV('sak-daire',sk.daire); setV('sak-kat',sk.kat);
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

function renderPersonel() {
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
            ${a.durum==='acik'?`<button class="btn bg xs" onclick="setArizaDurum(${a.id},'devam')">▶ Başlat</button>`:''}
            ${a.durum!=='tamam'?`<button class="btn bgn xs" onclick="setArizaDurum(${a.id},'tamam')">✓ Bitir</button>`:''}
            <button class="btn bg xs" onclick="editAriza(${a.id})">✏️</button>
            <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delAriza(${a.id})">🗑</button>
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
          ${a.durum==='acik'?`<button class="btn bg xs" style="font-size:10px" onclick="setArizaDurum(${a.id},'devam')">▶ Başlat</button>`:''}
          ${a.durum==='devam'?`<button class="btn bgn xs" style="font-size:10px" onclick="setArizaDurum(${a.id},'tamam')">✓ Tamamla</button>`:''}
          ${a.durum!=='tamam'?`<button class="btn xs" style="font-size:10px;background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok-bd)" onclick="setArizaDurum(${a.id},'tamam')">✓</button>`:''}
          <button class="btn bg xs" style="font-size:10px" onclick="editAriza(${a.id})">✏️</button>
        </div>
      </div>`;
    }
    cont.innerHTML=`<div class="kanban-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start">
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
      <td style="font-weight:700;color:${borc>0?'var(--err)':'var(--ok)'}">${borc>0?'₺'+fmt(borc):'Temiz'}</td>
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
  let ok=0;
  if(!makbuzNo)makbuzNo=5000;
  checked.forEach(id=>{
    const sk=S.sakinler.find(x=>x.id===id);if(!sk)return;
    if((sk.aidat||0)<=0)return;
    makbuzNo++;
    S.tahsilatlar.push({
      id:Date.now()+ok,no:'M-'+makbuzNo,sakId:sk.id,sakAd:sk.ad,
      aptId:+aptId,aptAd:sk.aptAd,daire:sk.daire,
      tip:'aidat',donem:'',tutar:sk.aidat||0,tarih,yontem,not:'Toplu tahsilat'
    });
    if((sk.borc||0)>0)sk.borc=Math.max(0,(sk.borc||0)-(sk.aidat||0));
    ok++;
  });
  if(ok)save();
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

  aidatliSakinler.forEach(sk=>{
    const aidat=sk.aidat||aptAidat;
    if(aidat>0){
      sk.borc=(sk.borc||0)+aidat;
      toplamBorc+=aidat;
      sakinSayisi++;
      detaylar.push({sakId:sk.id,ad:sk.ad,daire:sk.daire,tutar:aidat});
    }
  });

  // Borçlandırma kaydını tut
  S.aidatBorclandir.push({aptId:aptId,donem:donemStr,tarih:today(),sakinSayisi:sakinSayisi,toplamBorc:toplamBorc,detaylar:detaylar});

  save();
  toast(`${sakinSayisi} sakin için ${donemLabel} aidatı borçlandırıldı. Toplam: ₺${fmt(toplamBorc)}`,'ok');
  if(typeof renderTahsilat==='function') try{renderTahsilat();}catch(e){}
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
  if(ok){save();calcTopluToplam();}
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
  const reader=new FileReader();
  reader.onload=(e)=>{
    const text=e.target.result;
    bankRows=[];
    const lines=text.split('\n').filter(l=>l.trim());
    lines.forEach((line,i)=>{
      if(i===0&&(line.toLowerCase().includes('tarih')||line.toLowerCase().includes('date')))return;
      const parts=line.split(/[,;	]/).map(x=>x.trim().replace(/^"|"$/g,''));
      if(parts.length<2)return;
      const [tarih,aciklama,...rest]=parts;
      const tutarStr=rest.find(x=>x.replace(/[.,\-\s]/g,'').match(/^\d+$/));
      const tutar=parseFloat((tutarStr||'0').replace(',','.'));
      if(!tarih||!tutar)return;
      const esl=autoEslesir(aciklama||'');
      bankRows.push({id:Date.now()+i,tarih,aciklama:aciklama||'',tutar,eslesme:esl,tip:tutar>0?'gelir':'gider',durum:esl?'eslesemedi':'beklemede'});
    });
    renderBankRows();
    toast(`${bankRows.length} hareket yüklendi.`,'ok');
  };
  reader.readAsText(file,'UTF-8');
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
  const r=bankRows.find(x=>x.id===id);if(!r)return;
  r.durum='onaylandi';renderBankRows();
}

function bankSatirReddet(id){
  bankRows=bankRows.filter(x=>x.id!==id);renderBankRows();
}

function bankSatirAta(id,sakId){
  const r=bankRows.find(x=>x.id===id);if(!r)return;
  r.eslesme=S.sakinler.find(x=>x.id==sakId)||null;
  r.durum='onaylandi';renderBankRows();
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
  save();renderBankRows();toast(ok+' hareket kaydedildi.','ok');
}

function renderBankRows(){
  const el=document.getElementById('bank-hareket-liste');if(!el)return;
  const ozet=document.getElementById('bank-ozet');
  const gelir=bankRows.filter(r=>r.tutar>0).reduce((s,r)=>s+r.tutar,0);
  const gider=bankRows.filter(r=>r.tutar<0).reduce((s,r)=>s+Math.abs(r.tutar),0);
  const onaylanan=bankRows.filter(r=>r.durum==='onaylandi').length;
  if(ozet)ozet.textContent=`${bankRows.length} hareket · Gelir: ₺${fmt(gelir)} · Gider: ₺${fmt(gider)} · ${onaylanan} onaylı`;
  if(!bankRows.length){el.innerHTML='<div style="text-align:center;padding:24px;color:var(--tx-3);font-size:13px">Banka hareketi yüklenmedi</div>';return;}
  const aptId=selectedAptId;
  const sakinler=S.sakinler.filter(x=>x.aptId==aptId);
  el.innerHTML=bankRows.map(r=>{
    const cls=r.tip==='gelir'?'gelir-row':r.tip==='gider'?'gider-row':'bekle-row';
    const durumBadge=r.durum==='onaylandi'?'<span class="b b-gr" style="font-size:10px">Onaylı</span>':'<span class="b b-gy" style="font-size:10px">Beklemede</span>';
    const sakinSec=`<select class="fi" style="padding:3px 6px;font-size:10.5px;width:110px" onchange="bankSatirAta(${r.id},this.value)">
      <option value="">— Sakin —</option>
      ${sakinler.map(sk=>`<option value="${sk.id}"${r.eslesme?.id==sk.id?' selected':''}>${sk.ad} (D:${sk.daire||'?'})</option>`).join('')}
    </select>`;
    return `<div class="bank-row ${cls}">
      <div style="font-size:11px;color:var(--tx-3)">${r.tarih||'—'}</div>
      <div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.aciklama}">${r.aciklama}</div>
      <div style="font-weight:700;color:${r.tutar>0?'var(--ok)':'var(--err)'};font-size:12.5px">${r.tutar>0?'+':''}₺${fmt(Math.abs(r.tutar))}</div>
      ${sakinSec}
      <div><select class="fi" style="padding:3px 6px;font-size:10.5px;width:80px" onchange="bankRows.find(x=>x.id==${r.id}).tip=this.value"><option value="gelir"${r.tip==='gelir'?' selected':''}>Gelir</option><option value="gider"${r.tip==='gider'?' selected':''}>Gider</option></select></div>
      <div>${durumBadge}</div>
      <div class="act">
        ${r.durum!=='onaylandi'?`<button class="btn bgn xs" onclick="bankSatirOnayla(${r.id})" title="Onayla">✓</button>`:''}
        <button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="bankSatirReddet(${r.id})" title="Sil">✕</button>
      </div>
    </div>`;
  }).join('');
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
  const sakId=document.getElementById('tah-o-sakin')?.value;
  const tutar=parseFloat(document.getElementById('tah-o-tutar')?.value)||0;
  if(!sakId||!tutar){ toast('Sakin ve tutar zorunludur.','err'); return; }
  const sk=S.sakinler.find(x=>x.id==sakId);
  if(sk && (sk.borc||0)>0) {
    sk.borc=Math.max(0,(sk.borc||0)-tutar);
  }
  makbuzNo++;
  const aptId=document.getElementById('tah-o-apt')?.value;
  const apt=S.apartmanlar.find(a=>a.id==aptId);
  S.tahsilatlar.push({
    id:Date.now(), no:'M-'+makbuzNo,
    sakId:+sakId, sakAd:sk?sk.ad:'—',
    aptId:aptId?+aptId:null, aptAd:apt?apt.ad:'—',
    daire:sk?sk.daire:'—',
    tip:document.getElementById('tah-o-tip')?.value,
    donem:document.getElementById('tah-o-donem')?.value||'',
    tutar, tarih:document.getElementById('tah-o-tarih')?.value||today(),
    yontem:document.getElementById('tah-o-yontem')?.value,
    not:document.getElementById('tah-o-not')?.value||''
  });
  ['tah-o-tutar','tah-o-donem','tah-o-not'].forEach(i=>{ const el=document.getElementById(i); if(el) el.value=''; });
  save(); goTab('tah-liste'); toast('Ödeme kaydedildi. Makbuz: M-'+makbuzNo,'ok');
}

function renderOdemeGecmis() {
  const s=(document.getElementById('tah-g-srch')?.value||'').toLowerCase();
  const fApt=document.getElementById('tah-g-apt')?.value||'';
  let list=S.tahsilatlar;
  if(fApt) list=list.filter(x=>x.aptId==fApt);
  if(s) list=list.filter(x=>(x.sakAd+' '+x.no).toLowerCase().includes(s));
  const tb=document.getElementById('tah-g-tbody'); if(!tb) return;
  if(!list.length){ tb.innerHTML=`<tr><td colspan="10">${emp('📄','Ödeme kaydı bulunamadı')}</td></tr>`; return; }
  const tipLbl={aidat:'Aidat',borc:'Borç Ödemesi',avans:'Avans',diger:'Diğer'};
  const yonLbl={nakit:'Nakit',banka:'Banka',eft:'EFT',kredi:'K.Kartı'};
  tb.innerHTML=list.slice().reverse().map(o=>`<tr>
    <td style="font-family:monospace;font-size:11px;color:var(--brand)">${o.no}</td>
    <td>${o.sakAd}</td>
    <td>${o.aptAd}</td>
    <td>${o.daire||'—'}</td>
    <td><span class="b b-bl">${tipLbl[o.tip]||o.tip}</span></td>
    <td>${o.donem||'—'}</td>
    <td style="font-weight:700;color:var(--ok)">₺${fmt(o.tutar)}</td>
    <td>${yonLbl[o.yontem]||o.yontem}</td>
    <td class="t2" style="font-size:11px">${o.tarih}</td>
    <td><button class="btn xs" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err)" onclick="delOdeme(${o.id})" title="Sil"><svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></td>
  </tr>`).join('');
}

function delOdeme(id) {
  if(!confirm('Bu ödeme kaydı silinsin mi?')) return;
  S.tahsilatlar=S.tahsilatlar.filter(x=>x.id!==id);
  save(); toast('Silindi.','warn');
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
      <td style="color:${borc>0?'var(--err)':'var(--ok)'};font-weight:700">${borc>0?'₺'+fmt(borc):'Temiz'}</td>
      <td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;background:var(--s2);border-radius:3px;height:6px"><div style="background:${oran>80?'var(--ok)':oran>50?'var(--warn)':'var(--err)'};width:${Math.min(100,oran)}%;height:100%;border-radius:3px"></div></div><span style="font-size:11px;font-weight:700;width:36px">${oran}%</span></div></td>
      <td><span class="b ${borc>0?'b-rd':'b-gr'}">${borc>0?'Borçlu':'Temiz'}</span></td>
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

function renderMiniChart4Apt(id, aptId) {
  const el=document.getElementById(id); if(!el) return;
  const list=S.personel.filter(p=>p.aptId==aptId||!p.aptId);
  if(!list.length){ el.innerHTML=`<div class="t3" style="padding:20px;text-align:center">Personel verisi yok</div>`; return; }
  const lbl={kapici:'Kapıcı',temizlik:'Temizlik',guvenlik:'Güvenlik',teknisyen:'Teknisyen',muhasebe:'Muhasebe',yonetici:'Yönetici',diger:'Diğer'};
  el.innerHTML=list.slice(0,6).map(p=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px">
    <div style="width:30px;height:30px;border-radius:50%;background:var(--brand-10);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--brand);flex-shrink:0">${p.ad.charAt(0)}</div>
    <div><div style="font-weight:600">${p.ad}</div><div style="font-size:11px;color:var(--tx-3)">${lbl[p.gorev]||p.gorev}</div></div>
    <span class="b ${p.durum==='aktif'?'b-gr':'b-am'}" style="margin-left:auto;font-size:10px">${p.durum==='aktif'?'Aktif':'İzinli'}</span>
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

function renderMiniChart2(id) {
  const el=document.getElementById(id); if(!el) return;
  const apts=S.apartmanlar.filter(a=>a.durum==='aktif');
  if(!apts.length){ el.innerHTML=`<div class="t3" style="padding:20px;text-align:center">Apartman verisi yok</div>`; return; }
  el.innerHTML=apts.map(a=>{
    const sakinler=S.sakinler.filter(s=>s.aptId===a.id);
    const borclu=sakinler.filter(s=>(s.borc||0)>0).length;
    const oran=sakinler.length?Math.round(((sakinler.length-borclu)/sakinler.length)*100):100;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px">
      <div style="width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.ad}">${a.ad}</div>
      <div style="flex:1;background:var(--surface-2);border-radius:4px;height:8px">
        <div style="background:${oran>80?'var(--ok)':oran>50?'var(--warn)':'var(--err)'};width:${oran}%;height:100%;border-radius:4px;transition:width .3s"></div>
      </div>
      <div style="width:36px;text-align:right;font-weight:700;color:${oran>80?'var(--ok)':oran>50?'var(--warn)':'var(--err)'}">${oran}%</div>
    </div>`;
  }).join('');
}

function renderMiniChart3(id) {
  const el=document.getElementById(id); if(!el) return;
  const cats=['elektrik','su','asansor','cati','guvenlik','temizlik','diger'];
  const catLbl={elektrik:'Elektrik',su:'Su/Tesisat',asansor:'Asansör',cati:'Çatı',guvenlik:'Güvenlik',temizlik:'Temizlik',diger:'Diğer'};
  const counts=cats.map(c=>({c,n:S.arizalar.filter(a=>a.kat===c).length})).filter(x=>x.n>0);
  if(!counts.length){ el.innerHTML=`<div class="t3" style="padding:20px;text-align:center">Arıza verisi yok</div>`; return; }
  const max=Math.max(...counts.map(x=>x.n),1);
  el.innerHTML=counts.map(x=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px">
    <div style="width:80px">${catLbl[x.c]||x.c}</div>
    <div style="flex:1;background:var(--surface-2);border-radius:4px;height:8px">
      <div style="background:var(--warn);width:${Math.round((x.n/max)*100)}%;height:100%;border-radius:4px"></div>
    </div>
    <div style="width:24px;text-align:right;font-weight:700">${x.n}</div>
  </div>`).join('');
}

function renderMiniChart4(id) {
  const el=document.getElementById(id); if(!el) return;
  const gorevler=['kapici','temizlik','guvenlik','teknisyen','muhasebe','yonetici','diger'];
  const lbl={kapici:'Kapıcı',temizlik:'Temizlik',guvenlik:'Güvenlik',teknisyen:'Teknisyen',muhasebe:'Muhasebe',yonetici:'Yönetici',diger:'Diğer'};
  const counts=gorevler.map(g=>({g,n:S.personel.filter(p=>p.gorev===g).length})).filter(x=>x.n>0);
  if(!counts.length){ el.innerHTML=`<div class="t3" style="padding:20px;text-align:center">Personel verisi yok</div>`; return; }
  const max=Math.max(...counts.map(x=>x.n),1);
  el.innerHTML=counts.map(x=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px">
    <div style="width:80px">${lbl[x.g]||x.g}</div>
    <div style="flex:1;background:var(--surface-2);border-radius:4px;height:8px">
      <div style="background:var(--brand);width:${Math.round((x.n/max)*100)}%;height:100%;border-radius:4px"></div>
    </div>
    <div style="width:24px;text-align:right;font-weight:700">${x.n}</div>
  </div>`).join('');
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
  if(noSupport.includes(tip)) { toast('Bu sayfa için PDF çıktısı desteklenmez.','warn'); return; }
  const w = window.open('','_blank','width=1050,height=760');
  if(!w){ toast('Lütfen tarayıcı popup engelleyicisini kapatın!','warn'); return; }
  try {
    let html='';
    const map = {
      dashboard:_pdfDashboard, apartmanlar:_pdfApartmanlar, sakinler:_pdfSakinler,
      personel:_pdfPersonel, denetim:_pdfDenetim, asansor:_pdfAsansor,
      teklifler:_pdfTeklifler, gorevler:_pdfGorevler, isletme:_pdfIsletme, 'isl-detay':_pdfIslDetay, 'den-detay':_pdfDenDetay, 'asan-detay':_pdfAsanDetay,
      karar:_pdfKararlar, icra:_pdfIcra, finans:_pdfFinans,
      duyurular:_pdfDuyurular, ariza:_pdfAriza, tahsilat:_pdfTahsilat,
      raporlar:_pdfRaporlar, sigorta:_pdfSigorta, toplanti:_pdfToplanti, fatura:_pdfFatura
    };
    if(map[tip]) html=map[tip]();
    else html=_pdfOpen('PDF','') + '<p style="padding:20px;color:#9ca3af">Bu sayfa için PDF desteği yakında eklenecek.</p>' + _pdfClose();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(()=>w.print(),700);
    toast('PDF hazırlanıyor…','ok');
  } catch(e) {
    w.close();
    toast('PDF hatası: '+e.message,'err');
    console.error('PDF error:',e);
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
      <span class="tanim-ikon">${t.ikon||'📌'}</span>
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
      const borcDrm = (sk.borc||0)>0 ? `₺${fmt(sk.borc)} borç` : 'Temiz';
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
    list.innerHTML = items.map(i=>`<div class="notif-item" onclick="goPage('${i.page}');toggleNotifPanel()" style="cursor:pointer"><div class="notif-ico" style="background:${colors[i.type]};color:${txtColors[i.type]};font-size:${i.icon.startsWith('<')?'':'16px'}">${i.icon}</div><div class="notif-txt"><strong>${i.title}</strong><span>${i.sub}</span></div></div>`).join('');
  }
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
function updateFinKategori() {
  const tur = document.getElementById('fin-tur').value;
  const katSel = document.getElementById('fin-kat');
  const list = tur === 'gelir' ? getGelirTanimlari() : getGiderTanimlari();
  katSel.innerHTML = list.map(t=>`<option value="${t.ad}">${t.ikon||''} ${t.ad}</option>`).join('');
}

function saveFinans() {
  const apt = document.getElementById('fin-apt').value;
  const tarih = document.getElementById('fin-tarih').value;
  const tur = document.getElementById('fin-tur').value;
  const kat = document.getElementById('fin-kat').value;
  const tutar = parseFloat(document.getElementById('fin-tutar').value);
  if (!apt || !tarih || !kat || !tutar) { toast('Zorunlu alanları doldurun.','err'); return; }
  const aptObj = S.apartmanlar.find(a=>a.id==apt);
  const rec = {
    id: Date.now(), aptId: apt, aptAd: aptObj?aptObj.ad:'', tarih, tur, kat,
    tutar, belge: document.getElementById('fin-belge').value,
    aciklama: document.getElementById('fin-aciklama').value,
    tekrar: document.getElementById('fin-tekrar')?.value || ''
  };
  S.finansIslemler.push(rec); save(); finFormTemizle();
  toast('İşlem kaydedildi.','ok'); goTab('fin-liste');
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

function finFormTemizle() {
  ['fin-apt','fin-tur','fin-tutar','fin-belge','fin-aciklama'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = (el.tagName==='SELECT'?el.options[0]?.value:'');
  });
  document.getElementById('fin-tarih').value = today();
  updateFinKategori();
}

function delFinans(id) {
  if (!confirm('Silinsin mi?')) return;
  S.finansIslemler = S.finansIslemler.filter(f=>f.id!==id); save(); toast('Silindi.','warn');
}

function renderFinans() {
  const s = (document.getElementById('fin-srch')||{}).value||'';
  const fa = (document.getElementById('fin-f-apt')||{}).value||'';
  const ft = (document.getElementById('fin-f-tur')||{}).value||'';
  const fay = (document.getElementById('fin-f-ay')||{}).value||'';
  let list = [...(S.finansIslemler||[])].sort((a,b)=>b.tarih.localeCompare(a.tarih));
  if (s) list = list.filter(f=>(f.aciklama+' '+f.kat).toLowerCase().includes(s.toLowerCase()));
  if (fa) list = list.filter(f=>f.aptId==fa);
  if (ft) list = list.filter(f=>f.tur===ft);
  if (fay) list = list.filter(f=>f.tarih.startsWith(fay));
  
  // Month filter options
  const ayEl = document.getElementById('fin-f-ay');
  if (ayEl) {
    const months = [...new Set((S.finansIslemler||[]).map(f=>f.tarih.substring(0,7)))].sort().reverse();
    ayEl.innerHTML = '<option value="">Tüm Aylar</option>' + months.map(m=>`<option value="${m}" ${m===fay?'selected':''}>${m}</option>`).join('');
  }

  // Stats
  const gelir = (S.finansIslemler||[]).filter(f=>f.tur==='gelir').reduce((s,f)=>s+f.tutar,0);
  const gider = (S.finansIslemler||[]).filter(f=>f.tur==='gider').reduce((s,f)=>s+f.tutar,0);
  const net = gelir - gider;
  const grid = document.getElementById('fin-stats-grid');
  if (grid) grid.innerHTML = `
    <div class="fin-card fc-gelir"><h3>Toplam Gelir</h3><p class="fin-val" style="color:var(--ok)">${fmtMoney(gelir)} ₺</p></div>
    <div class="fin-card fc-gider"><h3>Toplam Gider</h3><p class="fin-val" style="color:var(--err)">${fmtMoney(gider)} ₺</p></div>
    <div class="fin-card fc-net"><h3>Net Bakiye</h3><p class="fin-val" style="color:${net>=0?'var(--ok)':'var(--err)'}">${net>=0?'+':''}${fmtMoney(net)} ₺</p></div>
    <div class="fin-card fc-bekleyen"><h3>İşlem Sayısı</h3><p class="fin-val" style="color:var(--brand)">${(S.finansIslemler||[]).length}</p></div>
  `;

  const tbody = document.getElementById('fin-tbody');
  if (!tbody) return;
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--tx-3)">Kayıt yok</td></tr>'; return; }
  tbody.innerHTML = list.map(f=>`<tr>
    <td>${f.tarih ? new Date(f.tarih).toLocaleDateString('tr-TR') : '—'}</td>
    <td>${f.aptAd||'—'}</td>
    <td><span class="badge ${f.tur==='gelir'?'gr':'rd'}">${f.tur==='gelir'?'Gelir':'Gider'}</span></td>
    <td>${f.kat}</td>
    <td>${f.aciklama||'—'}</td>
    <td style="font-weight:700;color:${f.tur==='gelir'?'var(--ok)':'var(--err)'}">${f.tur==='gelir'?'+':'-'}${fmtMoney(f.tutar)} ₺</td>
    <td><button class="act-btn rd" onclick="delFinans(${f.id})" title="Sil"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></td>
  </tr>`).join('');
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
  const apiKey = localStorage.getItem('syp_apikey')||'';
  document.getElementById('set-apikey').value = apiKey;
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
  const key = document.getElementById('set-apikey').value.trim();
  if (key) { localStorage.setItem('syp_apikey', key); toast('API anahtarı kaydedildi.','ok'); }
  else { localStorage.removeItem('syp_apikey'); toast('API anahtarı silindi.','warn'); }
}

function toggleApiKey() {
  const inp = document.getElementById('set-apikey');
  inp.type = inp.type === 'password' ? 'text' : 'password';
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
})();
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
      <td style="font-weight:700;color:${d<0?'var(--err)':d<30?'var(--warn)':'var(--tx-1)'}">${x.bit||'—'}</td>
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
  goPage('apt-detay');
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
  goPage('daire-detay');
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
  el.innerHTML =

  // ── HEADER ──
  `<div class="bb-header">
    <div class="bb-header-left">
      <div>
        <div class="bb-daire-kodu">${daireKod}</div>
        <div class="bb-apt-ad">${aptAd}</div>
      </div>
      <span class="b ${kullCls}" style="font-size:12px">${kullDurum}</span>
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button class="btn bg sm" onclick="editSakin(${mainSk.id});goPage('sakinler');goTab('sak-tekil')">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Düzenle
      </button>
      <button class="btn brd sm" onclick="openAidatBorcDaire(${mainSk.id})">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg> Borçlandır
      </button>
      <button class="btn bp sm" onclick="openHizliOdeme(${mainSk.id},'')">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Tahsil Et
      </button>
    </div>
  </div>` +

  // ── ANA BÖLÜM (Sol + Sağ) ──
  `<div class="bb-body">

    <div class="bb-left">

      <!-- Borç Banner -->
      <div class="bb-borc-banner">
        <div class="bb-borc-icon">
          <svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:${topBorc>0?'var(--err)':'var(--ok)'};fill:none;stroke-width:2">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <div style="flex:1">
          <div class="bb-borc-lbl">Toplam Borç</div>
          <div class="bb-borc-val" style="color:${topBorc>0?'var(--err)':'var(--ok)'}">
            ${topBorc>0 ? '₺'+fmt(topBorc) : '✓ Temiz'}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <div style="font-size:11px;color:var(--tx-3)">Toplam tahsilat</div>
          <div style="font-size:16px;font-weight:700;color:var(--ok)">₺${fmt(toplamOdeme)}</div>
        </div>
      </div>

      <!-- Bilgi Izgarası -->
      <div class="bb-info-grid">
        <div class="bb-info-item">
          <div class="bil">Kullanım Durumu</div>
          <div class="biv"><span class="b ${kullCls}">${kullDurum}</span></div>
        </div>
        <div class="bb-info-item">
          <div class="bil">Aidat Tutar</div>
          <div class="biv">₺${fmt(aidat)}</div>
        </div>
        <div class="bb-info-item">
          <div class="bil">Bulunduğu Kat</div>
          <div class="biv">${mainSk.kat||'—'}</div>
        </div>
        <div class="bb-info-item">
          <div class="bil">Tipi</div>
          <div class="biv">${mainSk.dairetipi||mainSk.tur||'—'}</div>
        </div>
        <div class="bb-info-item">
          <div class="bil">Grubu</div>
          <div class="biv">${mainSk.grup||'—'}</div>
        </div>
        <div class="bb-info-item">
          <div class="bil">Blok</div>
          <div class="biv">${blokStr||'—'}</div>
        </div>
        <div class="bb-info-item">
          <div class="bil">Brüt m²</div>
          <div class="biv">${mainSk.brut||'0'}</div>
        </div>
        <div class="bb-info-item">
          <div class="bil">Net m²</div>
          <div class="biv">${mainSk.net||'0'}</div>
        </div>
        <div class="bb-info-item">
          <div class="bil">Arsa Payı</div>
          <div class="biv">${mainSk.arsa||'0'}</div>
        </div>
      </div>

    </div><!-- /bb-left -->

    <!-- Notlar / Ekler (Sağ Panel) -->
    <div class="bb-right">
      <div class="bb-right-tabs">
        <div class="bb-right-tab on" onclick="bbTab(this,'bb-np')">
          <svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Notlar
        </div>
        <div class="bb-right-tab" onclick="bbTab(this,'bb-ep')">
          <svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          Ekler
        </div>
      </div>
      <div id="bb-np" class="bb-right-content">
        ${(mainSk.not||'').trim() ? `<div class="bb-not-item"><div class="not-metin">${mainSk.not}</div></div>` :
          `<div class="bb-not-empty">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <p style="font-size:12px;margin-top:6px">Gösterilecek not bulunmamaktadır.</p>
          </div>`}
        <div style="margin-top:10px">
          <textarea class="dd-note-area" id="dd-note-input" placeholder="Not ekle…" style="min-height:72px">${mainSk.not||''}</textarea>
          <button class="btn bp sm mt8" onclick="saveDaireNot(${mainSk.id})" style="width:100%">+ Yeni Not Kaydet</button>
        </div>
      </div>
      <div id="bb-ep" class="bb-right-content" style="display:none">
        <div class="bb-not-empty">
          <svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          <p style="font-size:12px;margin-top:6px">Ek bulunmamaktadır.</p>
        </div>
      </div>
    </div><!-- /bb-right -->

  </div>` + /* /bb-body */

  // ── KİŞİLER BÖLÜMÜ ──
  `<div class="bb-kisi-section">
    <div class="bb-kisi-header">
      <div style="font-size:13px;font-weight:700">Kişiler <span style="font-size:12px;color:var(--tx-3);font-weight:400">(${tumDaireKisi.length})</span></div>
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
      <div class="tw"><table class="bb-kisi-table">${THEAD}
        <tbody>${aktifKisiRows||`<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx-3)">Bu dairede aktif kayıt bulunmuyor.</td></tr>`}</tbody>
      </table></div>
    </div>
    <div id="dk-hepsi-pane" style="display:none">
      <div class="tw"><table class="bb-kisi-table">${THEAD}
        <tbody>${tumKisiRows||`<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx-3)">Kayıt bulunmuyor.</td></tr>`}</tbody>
      </table></div>
    </div>
  </div>` +

  // ── FİNANSAL DURUM YÖNLENDİRME ──
  `<div class="card" style="padding:18px 20px;display:flex;align-items:center;gap:16px;background:linear-gradient(135deg,var(--brand-10),#f5f3ff);border:1.5px solid var(--brand-20);">
    <div style="width:44px;height:44px;background:var(--brand);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#fff;fill:none;stroke-width:2"><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">&#8378;</text></svg>
    </div>
    <div style="flex:1">
      <div style="font-size:13.5px;font-weight:700;color:var(--tx);margin-bottom:3px">Finansal Detaylar</div>
      <div style="font-size:12px;color:var(--tx-3)">Aidat takibi, ödeme geçmişi ve borçlandırma kayıtları için Finansal Durum sayfasını kullanın.</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${aktifKisi.map(kisi=>`
        <button class="btn bp sm" onclick="goSakinCari(${kisi.id},true)">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><text x="12" y="17" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">&#8378;</text></svg>
          ${kisi.ad.split(' ')[0]} Finansal Durum
        </button>`).join('')}
    </div>
  </div>`; /* /finansal yönlendirme */
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
window._cariFromDaire = false;

function goSakinCari(sakId, fromDaire) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk) { toast('Sakin bulunamadı.', 'err'); return; }
  _currentCariId = +sakId;
  window._cariFromDaire = !!fromDaire;
  goPage('sakin-cari');
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
          evrakTarih: kayit.tarih || '',
          sonOdeme: kayit.sonOdeme || kayit.tarih || '',
          aciklama: `${kayit.donem || ''} Dönemi Aidat Borçlandırması / Borç mak.`,
          borcTutar: d.tutar || 0,
          alacakTutar: 0,
          tazminat: 0,
          kategori: d.kategori || 'Aidat'
        });
      }
    });
  });

  // ── Ödemeler (alacak) ──
  const odemeler = (S.tahsilatlar || []).filter(t => t.sakId == sk.id || t.sakinId == sk.id);
  const genelIslemler = odemeler.map(o => ({
    evrakTarih: o.tarih || '',
    sonOdeme: '',
    aciklama: o.not || o.aciklama || `(BE) Gönderen: ${sk.ad} Sorgu...`,
    borcTutar: 0,
    alacakTutar: o.tutar || 0,
    tazminat: 0
  }));

  // ── Doğrudan borç kaydı (devir) ──
  const topAidatBorc = aidatIslemler.reduce((s, x) => s + x.borcTutar, 0);
  const topOdeme = odemeler.reduce((s, o) => s + (o.tutar || 0), 0);
  const skBorc = sk.borc || 0;
  // Eğer toplam aidat + ödemelerle açıklanamayan bir borç varsa "Devir" olarak ekle
  const devirBorc = Math.max(0, skBorc - topAidatBorc + topOdeme);
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
  function islemSatiri(ix, kategori) {
    if (!ix.length) return `<div style="padding:12px 44px;font-size:12px;color:var(--tx-3)">Bu kategoride işlem bulunmuyor.</div>`;
    return `<div class="cari-islem-hdr">
      <div>Evrak T.</div><div>Son Ödeme T.</div><div>Açıklama</div><div></div>
      <div style="text-align:right">${kategori==='Genel'?'Alacak':'Borç'}</div>
      <div style="text-align:right">Bakiye</div>
    </div>` +
    ix.map((x, i) => {
      const runBorc   = ix.slice(0,i+1).reduce((s,r)=>s+r.borcTutar,0);
      const runAlacak = ix.slice(0,i+1).reduce((s,r)=>s+r.alacakTutar,0);
      const runBak    = runBorc - runAlacak;
      const hasBorc   = x.borcTutar > 0;
      const hasAlacak = x.alacakTutar > 0;
      return `<div class="cari-islem-row">
        <div class="ci-tarih">${x.evrakTarih || '—'}</div>
        <div class="ci-tarih" style="color:${x.sonOdeme?'var(--err)':'var(--tx-3)'}">${x.sonOdeme||'—'}</div>
        <div class="ci-aciklama" title="${x.aciklama}">
          <span class="cari-dot ${hasBorc?'red':'green'}"></span>${x.aciklama}
        </div>
        <div class="ci-icon">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:var(--tx-3);fill:none;stroke-width:1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div class="ci-tutar ${hasAlacak?'alacak':'borc'}" style="text-align:right">
          ${hasBorc?'₺'+fmt(x.borcTutar):''}${hasAlacak?'₺'+fmt(x.alacakTutar):''}${!hasBorc&&!hasAlacak?'—':''}
        </div>
        <div class="ci-tutar ${runBak>0?'borc':'alacak'}" style="text-align:right">
          ${runBak!==0?'₺'+fmt(Math.abs(runBak)):'₺0'}
        </div>
      </div>`;
    }).join('');
  }

  // ── Kategori (katlanabilir) HTML ──
  function kategoriBlok(label, islemler, borcT, alacakT, bakiyeT, uid) {
    return `
    <div>
      <div class="cari-kat-hdr" onclick="cariToggle('kat-${uid}')">
        <div style="display:flex;align-items:center;gap:7px">
          <span id="kat-chev-${uid}" style="transition:transform .2s;display:inline-block">▼</span>
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:var(--tx-3);fill:none;stroke-width:2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          <strong>${label}</strong>
        </div>
        <div class="cd-num red" style="text-align:right">${borcT>0?'₺'+fmt(borcT):'—'}</div>
        <div class="cd-num" style="text-align:right;color:var(--tx-3)">0,00 TL</div>
        <div class="cd-num green" style="text-align:right">${alacakT>0?'₺'+fmt(alacakT):'—'}</div>
        <div class="cd-num bold ${bakiyeT>0?'red':'green'}" style="text-align:right">₺${fmt(Math.abs(bakiyeT))}</div>
      </div>
      <div id="kat-${uid}" style="background:#fafbff">
        ${islemSatiri(islemler, label)}
      </div>
    </div>`;
  }

  const uid = sk.id + '_' + Date.now();

  const el = document.getElementById('sakin-cari-content');
  el.innerHTML = `<div class="cari-page">

    <!-- BANNER -->
    <div class="cari-banner">
      <div class="cari-avatar">${initials}</div>
      <div class="cari-banner-info">
        <div class="cari-banner-name" onclick="goDaireDetay(${sk.id});window._cariFromDaire=false">
          ${sk.ad.toUpperCase()} →
        </div>
        <div class="cari-banner-contact">
          ${sk.email ? `<span><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:rgba(255,255,255,.8);fill:none;stroke-width:2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>${sk.email}</span>` : ''}
          ${sk.tel   ? `<span><svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:rgba(255,255,255,.8);fill:none;stroke-width:2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1.15h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.92-1.87a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.54 16z"/></svg>${sk.tel}</span>` : ''}
        </div>
      </div>
      <div class="cari-banner-fin">
        <div class="cari-banner-fin-row">
          <span style="opacity:.8">Borç</span>
          <span style="font-family:'DM Mono',monospace">${fmt(topBorc)} TL</span>
        </div>
        <div class="cari-banner-fin-row">
          <span style="opacity:.8">Fazla Ödeme</span>
          <span style="font-family:'DM Mono',monospace">${fmt(fazlaOdeme)} TL</span>
        </div>
        <div class="cari-banner-fin-row bold">
          <span>Bakiye</span>
          <span style="font-family:'DM Mono',monospace">${fmt(topBakiye)} TL</span>
        </div>
      </div>
    </div>

    <!-- FİLTRE BAR -->
    <div class="cari-filter-bar">
      <div class="cari-toggle" onclick="cariToggleOpt('tumKirilim',${sk.id})">
        <div class="cari-toggle-sw ${tumKirilim?'on':''}" id="cari-sw-tumKirilim"></div>
        Bütün Kırılımları Göster
      </div>
      <div class="cari-toggle" onclick="cariToggleOpt('sadecGeciken',${sk.id})">
        <div class="cari-toggle-sw ${sadecGeciken?'on':''}" id="cari-sw-sadecGeciken"></div>
        Sadece Geciken
      </div>
      <div class="cari-date-range">
        <input type="date" id="cari-dt-bas" value="${startDate}" onchange="cariDateChange(${sk.id})">
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:var(--tx-3);fill:none;stroke-width:2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        <input type="date" id="cari-dt-bit" value="${endDate}" onchange="cariDateChange(${sk.id})">
        <svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:var(--tx-3);fill:none;stroke-width:2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </div>
    </div>

    <!-- AKORDİYON TABLO -->
    <div class="cari-accordion">
      <!-- Ana başlık -->
      <div class="cari-acc-hdr">
        <div>Daireler</div>
        <div style="text-align:right">Borç</div>
        <div style="text-align:right">Tazminat</div>
        <div style="text-align:right">Alacak</div>
        <div style="text-align:right">Bakiye</div>
      </div>

      <!-- Daire satırı -->
      <div class="cari-daire-row" onclick="cariToggle('daire-${uid}')">
        <div class="cd-label">
          <span id="daire-chev-${uid}" style="transition:transform .2s;font-size:11px">▼</span>
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:var(--tx-3);fill:none;stroke-width:2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          ${daireLabel}
        </div>
        <div class="cd-num red" style="text-align:right">${topBorc>0?'₺'+fmt(topBorc):'—'}</div>
        <div class="cd-num" style="text-align:right;color:var(--tx-3)">0,00 TL</div>
        <div class="cd-num green" style="text-align:right">${topAlacak>0?'₺'+fmt(topAlacak):'—'}</div>
        <div class="cd-num bold ${topBakiye>0?'red':'green'}" style="text-align:right">₺${fmt(Math.abs(topBakiye))}</div>
      </div>

      <!-- Kategoriler -->
      <div id="daire-${uid}">
        ${kategoriBlok('Genel', genelIslemler, genelBorc, genelAlacak, genelBakiye, uid+'_genel')}
        ${getGelirTanimlari().filter(t=>t.aktif!==false).map(gelirTanim => {
          const katIslemler = aidatIslemler.filter(x => (x.kategori||'Aidat') === gelirTanim.ad);
          if (!katIslemler.length) return '';
          const katBorc = katIslemler.reduce((s,x)=>s+x.borcTutar,0);
          const katBakiye = katBorc;
          return kategoriBlok(gelirTanim.ad, katIslemler, katBorc, 0, katBakiye, uid+'_kat_'+gelirTanim.id);
        }).join('')}
        ${aidatIslemler.filter(x=>!getGelirTanimlari().find(t=>t.ad===(x.kategori||'Aidat'))).length ?
          kategoriBlok('Diğer Tahakkuk', aidatIslemler.filter(x=>!getGelirTanimlari().find(t=>t.ad===(x.kategori||'Aidat'))),
            aidatIslemler.filter(x=>!getGelirTanimlari().find(t=>t.ad===(x.kategori||'Aidat'))).reduce((s,x)=>s+x.borcTutar,0), 0,
            aidatIslemler.filter(x=>!getGelirTanimlari().find(t=>t.ad===(x.kategori||'Aidat'))).reduce((s,x)=>s+x.borcTutar,0), uid+'_diger') : ''}
      </div>
    </div>

    <!-- İŞLEM BUTONLARI (alt) -->
    <div class="card" style="padding:14px 18px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <span style="font-size:12px;color:var(--tx-3);font-weight:600;margin-right:4px">İşlemler:</span>
      <button class="btn brd sm" onclick="openAidatBorcDaire(${sk.id})">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        Borçlandır
      </button>
      <button class="btn bp sm" onclick="openHizliOdeme(${sk.id},'')">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        Tahsil Et
      </button>
      <button class="btn bg sm" onclick="openHizliOdeme(${sk.id},'')">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Detaylı Tahsil Et
      </button>
      <button class="btn bg sm" onclick="toast('Kart ile tahsilat yakında','info')">
        <svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        Kart ile Tahsil Et
      </button>
      <button class="btn bg sm" style="margin-left:auto" onclick="window._cariFromDaire?goPage('daire-detay'):goPage('sakinler')">
        Kapat
      </button>
    </div>
  </div>`;

  // Store opts for toggles
  window._cariOpts = { startDate, endDate, sadecGeciken, tumKirilim };
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
  S.tahsilatlar.push({ id: Date.now(), sakId, aptId: sk.aptId, aptAd: sk.aptAd, ad: sk.ad, daire: sk.daire, tip: 'aidat', donem, tutar, tarih, yontem, not });
  if (borcDus && (sk.borc || 0) > 0) sk.borc = Math.max(0, (sk.borc || 0) - tutar);
  save();
  closeModal('mod-hizli-odeme');
  toast('Ödeme kaydedildi! ₺' + fmt(tutar), 'ok');
  // Re-render daire detay
  const yr = document.querySelector('.dd-year-sel');
  const yil = yr ? +yr.value : new Date().getFullYear();
  renderDaireDetay(sk, yil);
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

  // Kategori listesi doldur
  const katEl = document.getElementById('tbp-kategori');
  if (katEl && !katEl.options.length) {
    katEl.innerHTML = getGelirTanimlari().map(t=>`<option value="${t.ad}">${t.ikon||''} ${t.ad}</option>`).join('');
  }
}

function tbpAptChange() {
  tbpCheckDuplicatePeriod();
  tbpClearPreview();
}

function tbpTutarTurChange() {
  const tur = document.getElementById('tbp-tutar-tur')?.value;
  const wrap = document.getElementById('tbp-sabit-wrap');
  if (wrap) wrap.style.display = tur === 'sabit' ? '' : 'none';
  tbpClearPreview();
}

function tbpSabitChange() { tbpClearPreview(); }
function tbpKimeChange() { tbpClearPreview(); }

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
  const aptId = document.getElementById('tbp-apt')?.value;
  const donem = document.getElementById('tbp-donem')?.value;
  const tutarTur = document.getElementById('tbp-tutar-tur')?.value || 'aidat';
  const sabitTutar = parseFloat(document.getElementById('tbp-sabit-tutar')?.value) || 0;
  const kime = document.getElementById('tbp-kime')?.value || 'malik';
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

  if (pw) pw.innerHTML = `<div class="card" style="padding:0">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:14px;font-weight:700">${apt.ad} — ${donem} Dönemi Önizleme</div>
        <div style="font-size:12px;color:var(--tx-3);margin-top:3px">
          ${hedefler.length} daire · Toplam:
          <strong style="color:var(--err);font-size:15px" id="tbp-toplam-lbl">₺${fmt(toplamTutar)}</strong>
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
  const acEl = document.getElementById('tbp-aciklama'); if(acEl) acEl.value='';
  tbpClearPreview();
  const uyari = document.getElementById('tbp-donem-uyari'); if(uyari) uyari.style.display='none';
}

function saveTopluBorcPage() {
  const aptId = document.getElementById('tbp-apt')?.value;
  if (!aptId) { toast('Site seçin.','err'); return; }
  const donem = document.getElementById('tbp-donem')?.value;
  if (!donem) { toast('Dönem seçin.','err'); return; }
  const kategori = document.getElementById('tbp-kategori')?.value || 'Aidat';
  const aciklama = document.getElementById('tbp-aciklama')?.value?.trim() || '';
  const hedefler = window._tbpHedefler || [];
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
      sakId: h.sk.id,
      ad: h.sk.ad,
      daire: h.sk.daire,
      tutar,
      kategori,
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
    tarih: today(),
    kategori,
    aciklama,
    sakinSayisi: ok,
    toplamBorc,
    detaylar
  });

  save();

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
    const rows = liste.map(k => {
      const aptAd = k.aptAd || S.apartmanlar.find(a=>a.id==k.aptId)?.ad || '—';
      return `<tr>
        <td style="font-size:11.5px;color:var(--tx-3)">${k.tarih||'—'}</td>
        <td style="font-weight:600">${aptAd}</td>
        <td><span class="b b-bl" style="font-size:10px">${k.kategori||'Aidat'}</span></td>
        <td>${k.donem||'—'}</td>
        <td style="font-size:11.5px;color:var(--tx-3)">${k.aciklama||'—'}</td>
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
            <th>Kayıt Tarihi</th><th>Site</th><th>Kategori</th><th>Dönem</th>
            <th>Açıklama</th><th>Daire Sayısı</th><th style="text-align:right">Toplam</th><th>İşlem</th>
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

// ══════════════════════════════════════════════════════════
// TOPLU BORÇLANDIRMA
// ══════════════════════════════════════════════════════════

function renderTopluBorc() {
  // Dönem initialize
  const donemEl = document.getElementById('tb-donem');
  if (donemEl && !donemEl.value) {
    const now = new Date();
    donemEl.value = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  }
  // Gelir tanımlarını yükle
  const katEl = document.getElementById('tb-kategori');
  if (katEl) {
    const gelirler = getGelirTanimlari();
    katEl.innerHTML = gelirler.map(t=>`<option value="${t.ad}">${t.ikon||''} ${t.ad}</option>`).join('');
  }
  renderTopluBorcTablosu();
}

function renderTopluBorcTablosu() {
  const aptId = selectedAptId;
  const previewEl = document.getElementById('tb-preview');
  const butonWrap = document.getElementById('tb-buton-wrap');

  if (!aptId) {
    if (previewEl) previewEl.innerHTML = `<div class="card" style="text-align:center;padding:24px;color:var(--tx-3)">
      <svg viewBox="0 0 24 24" style="width:32px;height:32px;stroke:var(--tx-4);fill:none;stroke-width:1.5;margin-bottom:8px"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/></svg>
      <div>Üst menüden bir site seçin.</div></div>`;
    if (butonWrap) butonWrap.style.display = 'none';
    return;
  }
  const apt = S.apartmanlar.find(a=>a.id==aptId);
  if (!apt) return;

  const tutarTur = document.getElementById('tb-tutar-tur')?.value || 'aidat';
  const sabitTutar = parseFloat(document.getElementById('tb-sabit-tutar')?.value) || 0;
  const kime = document.getElementById('tb-kime')?.value || 'malik';

  // Sabit tutar alanını göster/gizle
  const sabitWrap = document.getElementById('tb-sabit-wrap');
  if (sabitWrap) sabitWrap.style.display = tutarTur === 'sabit' ? '' : 'none';

  // Aktif sakinleri daire bazında grupla
  const aktifSakinler = S.sakinler.filter(s => s.aptId == aptId && isSakinAktif(s));
  const daireMap = {};
  aktifSakinler.forEach(s => {
    const d = s.daire || '?';
    if (!daireMap[d]) daireMap[d] = { malik: null, kiraci: null };
    if (s.tip === 'malik' && !daireMap[d].malik) daireMap[d].malik = s;
    else if (s.tip === 'kiralik' && !daireMap[d].kiraci) daireMap[d].kiraci = s;
  });

  // Kime göre hedef sakin belirle
  const hedefler = [];
  Object.entries(daireMap).forEach(([daireNo, kisiler]) => {
    const hedef = kime === 'malik' ? kisiler.malik : (kisiler.kiraci || kisiler.malik);
    if (!hedef) return;
    let tutar = tutarTur === 'sabit' ? sabitTutar : (hedef.aidat || hedef.aidatK || apt.aidat || 0);
    hedefler.push({ sk: hedef, daire: daireNo, tutar, kiraci: !!kisiler.kiraci });
  });

  // Daire numarasına göre sırala
  hedefler.sort((a,b) => { const da=parseInt(a.daire)||0, db=parseInt(b.daire)||0; return da-db || a.daire?.localeCompare(b.daire)||0; });

  window._tbHedefIds = hedefler.map(h=>h.sk.id);
  const toplamTutar = hedefler.reduce((s,h)=>s+(h.tutar||0), 0);

  if (!previewEl) return;

  if (!hedefler.length) {
    previewEl.innerHTML = `<div class="card" style="text-align:center;padding:24px;color:var(--tx-3)">Bu sitede aktif sakin kaydı bulunmuyor.</div>`;
    if (butonWrap) butonWrap.style.display = 'none';
    return;
  }

  const rows = hedefler.map(h => {
    const tipLabel = h.sk.tip==='malik' ? 'Ev Sahibi' : 'Kiracı';
    const tipCls = h.sk.tip==='malik' ? 'b-bl' : 'b-am';
    const kimseSuffix = (kime==='kiraci-once' && h.kiraci && h.sk.tip==='kiralik')
      ? `<span style="font-size:10px;color:var(--tx-4);margin-left:4px">(kiracı var)</span>` : '';
    return `<tr>
      <td style="font-weight:700;color:var(--brand);width:60px">${h.daire}</td>
      <td><strong>${h.sk.ad}</strong>${kimseSuffix}</td>
      <td><span class="b ${tipCls}" style="font-size:10px;padding:2px 7px">${tipLabel}</span></td>
      <td style="font-size:12px;color:var(--tx-3)">${h.sk.tel||'—'}</td>
      <td style="width:130px">
        <input type="number" class="fi" style="padding:5px 8px;font-size:13px;font-weight:600;text-align:right"
          id="tb-tutar-${h.sk.id}" value="${h.tutar}" min="0" step="0.01"
          oninput="tbUpdateToplam()">
      </td>
    </tr>`;
  }).join('');

  previewEl.innerHTML = `<div class="card" style="padding:0">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:14px;font-weight:700">${apt.ad} — Borçlandırma Önizlemesi</div>
        <div style="font-size:12px;color:var(--tx-3);margin-top:3px">${hedefler.length} daire · Toplam:
          <strong style="color:var(--err);font-size:14px" id="tb-toplam-lbl">₺${fmt(toplamTutar)}</strong>
        </div>
      </div>
      <div style="font-size:11px;color:var(--tx-3);text-align:right">
        Tutarları değiştirebilirsiniz<br>
        <span style="color:var(--brand)">0 girilen daireler atlanır</span>
      </div>
    </div>
    <div class="tw">
      <table>
        <thead><tr>
          <th>Daire</th><th>Ad Soyad</th><th>Tip</th><th>Telefon</th>
          <th style="text-align:right">Borçlandırılacak Tutar (₺)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:var(--s2)">
          <td colspan="4" style="text-align:right;font-weight:700;font-size:13px;padding:10px 14px">Toplam:</td>
          <td style="font-weight:800;font-size:15px;color:var(--err);text-align:right;padding:10px 14px" id="tb-toplam-lbl2">₺${fmt(toplamTutar)}</td>
        </tr></tfoot>
      </table>
    </div>
  </div>`;

  if (butonWrap) butonWrap.style.display = 'flex';
}

function tbUpdateToplam() {
  let top = 0;
  (window._tbHedefIds||[]).forEach(id => {
    top += parseFloat(document.getElementById('tb-tutar-'+id)?.value)||0;
  });
  const fmt2 = v => fmt(v);
  const l1 = document.getElementById('tb-toplam-lbl'); if (l1) l1.textContent = '₺'+fmt2(top);
  const l2 = document.getElementById('tb-toplam-lbl2'); if (l2) l2.textContent = '₺'+fmt2(top);
}

function saveTopluBorc() {
  const aptId = selectedAptId;
  if (!aptId) { toast('Üst menüden bir site seçin.','err'); return; }
  const donem = document.getElementById('tb-donem')?.value;
  if (!donem) { toast('Dönem seçin.','err'); return; }
  const kategori = document.getElementById('tb-kategori')?.value || 'Aidat';
  const aciklama = document.getElementById('tb-aciklama')?.value?.trim() || '';
  const ids = window._tbHedefIds || [];
  if (!ids.length) { toast('Önce "Önizle" butonuna basın.','warn'); return; }

  let ok = 0, toplamBorc = 0;
  const detaylar = [];

  ids.forEach(id => {
    const tutar = parseFloat(document.getElementById('tb-tutar-'+id)?.value)||0;
    if (tutar <= 0) return; // 0 girilen daireler atlanır
    const sk = S.sakinler.find(s=>s.id===id);
    if (!sk) return;
    sk.borc = (sk.borc||0) + tutar;
    toplamBorc += tutar; ok++;
    detaylar.push({ sakId:id, ad:sk.ad, daire:sk.daire, tutar, kategori });
  });

  if (!ok) { toast('Geçerli tutar bulunamadı. En az bir daire için tutar girin.','err'); return; }

  if (!S.aidatBorclandir) S.aidatBorclandir = [];
  S.aidatBorclandir.push({
    id: Date.now(), aptId:+aptId, donem, tarih:today(),
    kategori, aciklama, sakinSayisi:ok, toplamBorc, detaylar
  });

  save();

  const sonucEl = document.getElementById('tb-sonuc');
  if (sonucEl) {
    sonucEl.innerHTML = `<div style="padding:14px 18px;border-radius:10px;background:var(--ok-bg);border:1px solid var(--ok-bd);color:var(--ok);font-weight:600;font-size:13px">
      ✅ ${ok} daire için toplam <strong>₺${fmt(toplamBorc)}</strong> borçlandırıldı. (${donem} — ${kategori})
    </div>`;
    sonucEl.style.display='';
    setTimeout(()=>{ sonucEl.style.display='none'; }, 6000);
  }
  toast(`✅ ${ok} daire · ₺${fmt(toplamBorc)} borçlandırıldı.`, 'ok');

  // Tabloyu sıfırla
  window._tbHedefIds = [];
  document.getElementById('tb-preview').innerHTML = '';
  const bw = document.getElementById('tb-buton-wrap'); if (bw) bw.style.display='none';
  // Yeniden önizle (güncel borçları göstermek için)
  setTimeout(renderTopluBorcTablosu, 400);
}

// ──────────────────────────────────────────────────────────

function openAidatBorcDaire(sakId) {
  const sk = S.sakinler.find(s => s.id === +sakId);
  if (!sk) return;
  const now = new Date();
  const donem = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('abd-sak-id').value = sakId;
  document.getElementById('abd-sak-ad').value = sk.ad + ' — Daire ' + (sk.daire || '');
  document.getElementById('abd-donem').value = donem;
  document.getElementById('abd-tutar').value = sk.aidat || sk.aidatK || '';
  document.getElementById('abd-aciklama').value = '';
  // Gelir tanımlarını kategori dropdownına yükle
  const katEl = document.getElementById('abd-kategori');
  if (katEl) {
    const gelirler = getGelirTanimlari();
    katEl.innerHTML = gelirler.map(t=>`<option value="${t.ad}">${t.ikon||''} ${t.ad}</option>`).join('');
  }
  openModal('mod-aidat-borc-daire');
}

function saveAidatBorcDaire() {
  const sakId = +document.getElementById('abd-sak-id').value;
  const donem = document.getElementById('abd-donem').value.trim();
  const tutar = parseFloat(document.getElementById('abd-tutar').value) || 0;
  const aciklama = document.getElementById('abd-aciklama').value.trim();
  if (!donem) { toast('Dönem giriniz!', 'err'); return; }
  if (tutar <= 0) { toast('Tutar giriniz!', 'err'); return; }
  const sk = S.sakinler.find(s => s.id === sakId);
  if (!sk) return;
  sk.borc = (sk.borc || 0) + tutar;
  if (!S.aidatBorclandir) S.aidatBorclandir = [];
  const kayit = S.aidatBorclandir.find(k => k.donem === donem && k.aptId == sk.aptId);
  if (kayit) {
    if (!kayit.detaylar) kayit.detaylar = [];
    const mevcut = kayit.detaylar.find(d => d.sakId === sakId);
    if (mevcut) mevcut.tutar = (mevcut.tutar || 0) + tutar;
    else kayit.detaylar.push({ sakId, ad: sk.ad, daire: sk.daire, tutar, kategori: document.getElementById('abd-kategori')?.value || 'Aidat' });
    kayit.toplamBorc = (kayit.toplamBorc || 0) + tutar;
  } else {
    S.aidatBorclandir.push({ aptId: sk.aptId, donem, tarih: today(), sakinSayisi: 1, toplamBorc: tutar, detaylar: [{ sakId, ad: sk.ad, daire: sk.daire, tutar, kategori: document.getElementById('abd-kategori')?.value || 'Aidat' }] });
  }
  save();
  closeModal('mod-aidat-borc-daire');
  toast(`${sk.ad} için ${donem} dönemi ₺${fmt(tutar)} borçlandırıldı.`, 'ok');
  const yr = document.querySelector('.dd-year-sel');
  const yil = yr ? +yr.value : new Date().getFullYear();
  renderDaireDetay(sk, yil);
}

function deleteTahsilat(id, sakId) {
  if (!id || !confirm('Bu ödeme kaydı silinsin mi?')) return;
  S.tahsilatlar = (S.tahsilatlar || []).filter(t => t.id != id);
  save();
  toast('Ödeme kaydı silindi.', 'warn');
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
let currentRole = localStorage.getItem('syp_role') || '';

function selectRole(role) {
  currentRole = role;
  localStorage.setItem('syp_role', role);
  document.getElementById('role-screen')?.classList.add('hidden');
  document.getElementById('main').style.display = '';
  applyRole(role);
  loadState();
  if (!S.apartmanlar || S.apartmanlar.length === 0) {
    const _orig = window.confirm; window.confirm = () => true; loadDemoData(); window.confirm = _orig;
  } else { initApp(); }
  if (role === 'superadmin') goPage('superadmin');
  else goPage('dashboard');
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
    rows.push([sk.ad, sk.aptAd||'', sk.daire||'', sk.aidat||0, sk.borc||0, (sk.borc||0)>0?'Borçlu':'Temiz']);
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

// ===================================================
// TEKRARLAYaN İŞLEM OTOMASYONU
// ===================================================
function checkTekrarlayanIslemler() {
  if (!S.finansIslemler || !S.finansIslemler.length) return;
  const now = new Date();
  const buAy = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  let eklendi = 0;
  S.finansIslemler.filter(f => f.tekrar === 'aylik').forEach(f => {
    const tekrarKey = 'tekrar_' + f.id + '_' + buAy;
    if (!(S.tekrarKontrol||{})[tekrarKey]) {
      const yeni = { ...f, id: Date.now() + Math.random(), tarih: buAy + '-01', tekrar: '', kaynak: 'otomasyon', kaynakId: f.id };
      S.finansIslemler.push(yeni);
      if (!S.tekrarKontrol) S.tekrarKontrol = {};
      S.tekrarKontrol[tekrarKey] = true;
      eklendi++;
    }
  });
  const buYil = now.getFullYear() + '-01';
  S.finansIslemler.filter(f => f.tekrar === 'yillik').forEach(f => {
    const tekrarKey = 'tekrar_y_' + f.id + '_' + now.getFullYear();
    if (!(S.tekrarKontrol||{})[tekrarKey]) {
      const origMonth = (f.tarih||'').slice(5,7);
      if (String(now.getMonth()+1).padStart(2,'0') === origMonth) {
        const yeni = { ...f, id: Date.now() + Math.random(), tarih: now.getFullYear()+'-'+origMonth+'-01', tekrar: '', kaynak: 'otomasyon', kaynakId: f.id };
        S.finansIslemler.push(yeni);
        if (!S.tekrarKontrol) S.tekrarKontrol = {};
        S.tekrarKontrol[tekrarKey] = true;
        eklendi++;
      }
    }
  });
  if (eklendi > 0) { save(); toast(eklendi + ' tekrarlayan işlem otomatik oluşturuldu.','ok'); }
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

// ── SUPABASE KREDENSİYELLER ──────────────────────
const _SB_URL = 'https://xmjaihxpuhygrjpghiww.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtamFpaHhwdWh5Z3JqcGdoaXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMzYyMzIsImV4cCI6MjA4ODkxMjIzMn0.DO1n4zrn8y60MBtNhRukGVL68k2oqq9Yqi4QobG_WTo';

// STARTUP — Rol seçim ekranı ile başla
(function startup() {
  initSupabase(_SB_URL, _SB_KEY);
  const authEl = document.getElementById('auth-screen');
  if (authEl) authEl.classList.add('hidden');

  // Daha önce rol seçilmişse direkt giriş
  const savedRole = localStorage.getItem('syp_role');
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
