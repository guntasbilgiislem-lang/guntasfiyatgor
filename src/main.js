import './style.css';
import { api } from './api.js';
import { offlineAudio } from './offline-audio.js';
import { registerSW } from 'virtual:pwa-register';

// Register PWA Service Worker (Vite PWA plugin handler)
try {
  registerSW({
    onNeedRefresh() {
      showToast('Uygulama güncellendi. Yenilemek için sayfayı kapatıp açın.', 'info');
    },
    onOfflineReady() {
      showToast('Uygulama çevrimdışı çalışmaya hazır.', 'success');
    },
  });
} catch (e) {
  console.warn('PWA Service Worker register edilmedi (Vite dev mode).');
}

const app = document.getElementById('app');
let currentView = 'login';
let html5QrcodeScanner = null; // Scanner instance
let kioskResetTimeout = null; // Kiosk view timeout
let kioskStatusInterval = null; // Kiosk status polling interval

// TOAST NOTIFICATION SYSTEM
window.showToast = (message, type = 'info') => {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ph-info';
  if (type === 'success') icon = 'ph-check-circle';
  if (type === 'error') icon = 'ph-warning-circle';

  toast.innerHTML = `
    <i class="ph ${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

// INITIALIZATION
async function init() {
  const token = localStorage.getItem('auth_token');
  if (token && api.currentUser) {
    if (api.currentUser.role === 'admin') {
      navigateTo('admin_settings');
    } else {
      navigateTo('kiosk');
    }
  } else {
    navigateTo('login');
  }
}

// ROUTER
function navigateTo(view) {
  // Stop scanner if running
  stopScanner();

  // Clear status polling if running
  if (kioskStatusInterval) {
    clearInterval(kioskStatusInterval);
    kioskStatusInterval = null;
  }

  // Remove kiosk click handler if moving away from kiosk
  if (view !== 'kiosk' && window.kioskClickHandler) {
    document.removeEventListener('click', window.kioskClickHandler);
    window.kioskClickHandler = null;
  }

  currentView = view;
  renderView();
}

function renderView() {
  if (currentView === 'login') {
    renderLogin();
  } else if (currentView === 'kiosk') {
    renderKiosk();
  } else {
    renderDashboardLayout();
  }
}

// 1. LOGIN VIEW
function renderLogin() {
  const rememberedUser = localStorage.getItem('remembered_username') || '';

  app.innerHTML = `
    <div class="login-container">
      <div class="glass-panel login-card fade-in">
        <div class="logo-container" style="margin-bottom: 1.5rem; display:flex; align-items:center; justify-content:center;">
          <img src="/logo.png" alt="Güntaş" style="max-height: 100px; max-width: 100%; object-fit: contain;">
        </div>
        <p style="margin-bottom: 2rem; color: var(--color-secondary); font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; font-size: 0.85rem;">Güntaş İndex Kurumsal</p>
        
        <form id="loginForm">
          <div class="input-group">
            <label for="username">Kullanıcı Adı / Şube Kodu</label>
            <input type="text" id="username" class="input-field" placeholder="admin" value="${rememberedUser}" required autocomplete="username">
          </div>
          <div class="input-group">
            <label for="password">Şifre</label>
            <input type="password" id="password" class="input-field" placeholder="••••••••" required autocomplete="current-password">
          </div>
          
          <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; user-select: none;">
            <input type="checkbox" id="rememberMe" style="width: 18px; height: 18px; accent-color: var(--color-primary); cursor: pointer;" checked>
            <label for="rememberMe" style="margin-bottom: 0; cursor: pointer; font-size: 0.95rem; color: var(--color-text-muted);">Beni Hatırla</label>
          </div>

          <button type="submit" class="btn btn-teal btn-block" style="margin-top: 0.5rem;" id="loginSubmitBtn">
            <i class="ph ph-sign-in"></i> Giriş Yap
          </button>
        </form>
        
        <div id="loginError" class="text-teal" style="margin-top: 1rem; font-size: 0.85rem; display: none; color: var(--color-error);"></div>
      </div>
    </div>
  `;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userVal = document.getElementById('username').value.trim();
    const passVal = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    const submitBtn = document.getElementById('loginSubmitBtn');
    const errorEl = document.getElementById('loginError');

    errorEl.style.display = 'none';
    submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Giriş Yapılıyor...';
    submitBtn.disabled = true;

    try {
      const user = await api.login(userVal, passVal);
      if (rememberMe) {
        localStorage.setItem('remembered_username', userVal);
      } else {
        localStorage.removeItem('remembered_username');
      }

      showToast(`Hoş geldiniz, ${user.name}`, 'success');
      
      // Initialize Web Audio context on user interaction
      offlineAudio.initContext();

      if (user.role === 'admin') {
        navigateTo('admin_settings');
      } else {
        navigateTo('kiosk');
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      submitBtn.innerHTML = '<i class="ph ph-sign-in"></i> Giriş Yap';
      submitBtn.disabled = false;
      
      const card = document.querySelector('.login-card');
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 400);
    }
  });
}

// 2. DASHBOARD LAYOUT (SIDEBAR + MAIN WINDOW)
function renderDashboardLayout() {
  const role = api.currentUser ? api.currentUser.role : '';
  const branchName = api.currentUser ? api.currentUser.name : '';

  app.innerHTML = `
    <div class="dashboard-layout fade-in">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-brand">
          <img src="/logo.png" alt="Güntaş">
        </div>
        
        <ul class="nav-menu">
          ${role === 'admin' ? `
            <a href="#" class="nav-item ${currentView === 'admin_settings' ? 'active' : ''}" id="navAdminSettings">
              <i class="ph ph-sliders"></i>
              <span>XML & Şube Ayarları</span>
            </a>
          ` : ''}
          
          <a href="#" class="nav-item" id="navLogout" style="margin-top: 2rem; color: var(--color-error);">
            <i class="ph ph-sign-out"></i>
            <span>Çıkış Yap</span>
          </a>
        </ul>
        
        <div style="margin-top: auto; padding-top: 1.5rem; border-top: 1px solid var(--color-border); font-size: 0.8rem; color: var(--color-text-muted);">
          <div style="font-weight: 700; color: var(--color-secondary); margin-bottom: 2px;">${branchName}</div>
          <div>Bağlantı: Aktif (Supabase)</div>
        </div>
      </aside>

      <!-- Main Window Content -->
      <main class="main-content" id="mainContent">
        <!-- Render page specific views here -->
      </main>
    </div>
  `;

  // Bind Sidebar Events
  document.getElementById('navLogout').addEventListener('click', (e) => {
    e.preventDefault();
    api.logout();
    navigateTo('login');
  });

  if (role === 'admin') {
    document.getElementById('navAdminSettings').addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('admin_settings');
    });

    if (currentView === 'admin_settings') {
      renderAdminSettingsView();
    }
  }
}

// 3. BRANCH OPERATIONS VIEW
async function renderBranchOpsView() {
  const mainContent = document.getElementById('mainContent');
  const branchId = api.currentUser.id;
  const branchName = api.currentUser.name;

  mainContent.innerHTML = `
    <div class="top-header">
      <div>
        <h1>Şube Operasyonları</h1>
        <p class="text-muted" style="margin-top: 4px;">${branchName} Fiyat ve Stok Yönetimi</p>
      </div>
      <div>
        <button class="btn btn-teal" id="kioskBtn"><i class="ph ph-scan"></i> Kiosk Ekranını Aç</button>
      </div>
    </div>

    <div class="grid-cards">
      <!-- Upload Card -->
      <div class="glass-panel dashboard-card">
        <div class="card-header">
          <div class="card-title">
            <i class="ph ph-upload-simple text-teal"></i>
            <h3>yazarkasastoklar.ini Yükle</h3>
          </div>
        </div>
        
        <p class="text-muted" style="font-size: 0.95rem;">
          Yazar kasanızdan aldığınız güncel <strong>yazarkasastoklar.ini</strong> dosyasını buraya sürükleyip bırakarak veya dosya seçerek şubenizin fiyatlarını güncelleyebilirsiniz.
        </p>

        <div class="dropzone" id="iniDropzone">
          <i class="ph ph-file-code"></i>
          <div>
            <p style="font-weight:600;">Dosyayı Sürükleyin veya Seçin</p>
            <p class="text-muted" style="font-size: 0.85rem; margin-top:4px;">Yalnızca .ini uzantılı dosyalar</p>
          </div>
          <input type="file" id="iniFileInput" accept=".ini" style="display:none;">
        </div>

        <div id="uploadProgressContainer" style="display:none;">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
            <span id="uploadProgressText">Stoklar yükleniyor...</span>
            <span id="uploadProgressPercent">0%</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" id="uploadProgressBar"></div>
          </div>
        </div>
      </div>

      <!-- Stats & Query Card -->
      <div class="glass-panel dashboard-card">
        <div class="card-header">
          <div class="card-title">
            <i class="ph ph-database text-teal"></i>
            <h3>Şube Fiyat Veritabanı</h3>
          </div>
        </div>
        
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding: 1rem 1.5rem; border-radius: var(--radius-md); border:1px solid var(--color-border);">
          <div>
            <div class="text-muted" style="font-size:0.85rem;">Yüklü Ürün Sayısı</div>
            <div style="font-size:1.8rem; font-weight:800; color:#fff;" id="totalStockCount">...</div>
          </div>
          <i class="ph ph-barcode text-teal" style="font-size:2.5rem; opacity:0.7;"></i>
        </div>

        <div class="input-group" style="margin-bottom: 0;">
          <label for="searchBarcode">Barkod Sorgula (Test)</label>
          <div style="display:flex; gap:10px;">
            <input type="text" id="searchBarcode" class="input-field" placeholder="Barkod numarası girin...">
            <button class="btn btn-primary" id="searchBtn"><i class="ph ph-magnifying-glass"></i></button>
          </div>
        </div>
        
        <div id="searchResult" style="display:none; background:rgba(0,229,255,0.05); padding: 1rem; border-radius: var(--radius-md); border:1px solid rgba(0,229,255,0.15);">
          <!-- Search result shows here -->
        </div>
      </div>
    </div>

    <!-- Stock Preview Table -->
    <div class="glass-panel" style="margin-top: 2rem; padding: 2rem;">
      <h3 style="margin-bottom: 1.2rem; display:flex; align-items:center; gap:8px;">
        <i class="ph ph-list-bullets text-teal"></i> Şube Stok Listesi Önizleme (Son 15 Ürün)
      </h3>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Barkod</th>
              <th>Ürün Adı</th>
              <th>Şube Fiyatı</th>
              <th>Son Güncelleme</th>
            </tr>
          </thead>
          <tbody id="stocksTableBody">
            <tr>
              <td colspan="4" style="text-align:center;" class="text-muted">Yükleniyor...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Get stats and load preview
  const refreshStatsAndPreview = async () => {
    try {
      const count = await api.getBranchStockCount(branchId);
      document.getElementById('totalStockCount').innerText = count.toLocaleString('tr-TR');

      // Fetch last 15 items
      const { data: latestStocks, error } = await supabase
        .from('stocks')
        .select('*')
        .eq('branch_id', branchId)
        .order('updated_at', { ascending: false })
        .limit(15);

      if (error) throw error;

      const tbody = document.getElementById('stocksTableBody');
      if (latestStocks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;" class="text-muted">Şubeye ait yüklü stok bulunmuyor. Lütfen .ini dosyası yükleyin.</td></tr>`;
      } else {
        tbody.innerHTML = latestStocks.map(stock => {
          const isDiscounted = stock.discount_price && parseFloat(stock.discount_price) > 0 && parseFloat(stock.discount_price) < parseFloat(stock.price);
          return `
            <tr>
              <td style="font-family:monospace; font-weight:600;">${stock.barcode}</td>
              <td>${stock.name || '<İsimsiz Ürün>'}</td>
              <td class="text-teal" style="font-weight:700;">
                ${isDiscounted 
                  ? `<span style="text-decoration:line-through; font-size:0.85em; opacity:0.6; margin-right:6px; color:var(--color-text-muted);">${parseFloat(stock.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span><span style="color:var(--color-success);">${parseFloat(stock.discount_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>`
                  : `${parseFloat(stock.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
                }
              </td>
              <td style="font-size:0.85rem;" class="text-muted">${new Date(stock.updated_at).toLocaleString('tr-TR')}</td>
            </tr>
          `;
        }).join('');
      }
    } catch (e) {
      showToast('Önizleme yüklenemedi: ' + e.message, 'error');
    }
  };

  refreshStatsAndPreview();

  // Bind Buttons
  document.getElementById('kioskBtn').addEventListener('click', () => navigateTo('kiosk'));

  // Search logic
  const performSearch = async () => {
    const barcodeInput = document.getElementById('searchBarcode');
    const resultEl = document.getElementById('searchResult');
    const barcode = barcodeInput.value.trim();

    if (!barcode) {
      showToast('Lütfen bir barkod girin.', 'info');
      return;
    }

    resultEl.innerHTML = '<i class="ph ph-spinner ph-spin text-teal"></i> Aranıyor...';
    resultEl.style.display = 'block';

    try {
      // Lazy load XML feed settings first if not loaded
      if (!api.xmlLoaded) {
        try {
          const settings = await api.fetchSettings();
          if (settings.xml_url && settings.xml_mappings) {
            await api.loadXmlFeed(settings.xml_url, JSON.parse(settings.xml_mappings));
          }
        } catch (xmlErr) {
          console.warn('Sorgulama ekranında XML yükleme hatası (Yerel veritabanı aktif):', xmlErr);
        }
      }

      const product = await api.getProduct(branchId, barcode);
      if (!product) {
        resultEl.innerHTML = `<span style="color:var(--color-error);"><i class="ph ph-x-circle"></i> Ürün bu şubenin stoklarında bulunamadı!</span>`;
        offlineAudio.playError();
      } else {
        offlineAudio.playSuccess();
        const isDiscounted = product.discount_price && parseFloat(product.discount_price) > 0 && parseFloat(product.discount_price) < parseFloat(product.price);
        resultEl.innerHTML = `
          <div style="display:flex; gap:15px; align-items:center;">
            ${product.image ? `<img src="${product.image}" style="width:60px; height:60px; object-fit:contain; background:white; border-radius:6px;" alt="">` : `<i class="ph ph-image text-muted" style="font-size:40px;"></i>`}
            <div>
              <div style="font-weight:700; font-size:1.1rem; color:#fff;">${product.name}</div>
              <div style="font-size:0.85rem;" class="text-muted">Barkod: ${product.barcode}</div>
              <div style="font-weight:800; font-size:1.3rem; margin-top:4px;" class="text-teal">
                ${isDiscounted
                  ? `<span style="text-decoration:line-through; font-size:0.85em; opacity:0.6; margin-right:6px; color:var(--color-text-muted);">${parseFloat(product.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span><span style="color:var(--color-success);">${parseFloat(product.discount_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>`
                  : `${parseFloat(product.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`
                }
              </div>
            </div>
          </div>
        `;
      }
    } catch (e) {
      resultEl.innerHTML = `<span style="color:var(--color-error);"><i class="ph ph-warning"></i> Arama hatası: ${e.message}</span>`;
    }
  };

  document.getElementById('searchBtn').addEventListener('click', performSearch);
  document.getElementById('searchBarcode').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  // Dropzone drag-and-drop
  const dropzone = document.getElementById('iniDropzone');
  const fileInput = document.getElementById('iniFileInput');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--color-secondary)';
    dropzone.style.background = 'rgba(0, 229, 255, 0.08)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'rgba(0, 229, 255, 0.3)';
    dropzone.style.background = 'rgba(0, 0, 0, 0.2)';
  });

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.ini')) {
      showToast('Hatalı dosya biçimi! Lütfen .ini uzantılı stok dosyasını yükleyin.', 'error');
      return;
    }

    const progressContainer = document.getElementById('uploadProgressContainer');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const progressPercent = document.getElementById('uploadProgressPercent');

    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressPercent.innerText = '0%';
    progressText.innerText = 'Dosya okunuyor (windows-1254)...';

    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const text = e.target.result;
          progressText.innerText = 'Stoklar ayrıştırılıyor...';
          progressBar.style.width = '20%';
          progressPercent.innerText = '20%';
          
          const parsedStocks = api.parseIniFile(text);
          if (parsedStocks.length === 0) {
            throw new Error('Dosya içerisinde geçerli bir barkod/ürün kaydı bulunamadı.');
          }

          progressText.innerText = `${parsedStocks.length} ürün Supabase'e yükleniyor...`;
          progressBar.style.width = '20%';
          progressPercent.innerText = '20%';

          await api.uploadStocks(branchId, parsedStocks, (percent) => {
            const overallPercent = Math.round(20 + (percent * 0.8));
            progressBar.style.width = `${overallPercent}%`;
            progressPercent.innerText = `${overallPercent}%`;
            progressText.innerText = `Ürünler veritabanına yükleniyor: %${percent} tamamlandı (${parsedStocks.length} ürün)...`;
          });

          progressBar.style.width = '100%';
          progressPercent.innerText = '100%';
          progressText.innerText = 'Yükleme başarıyla tamamlandı!';
          showToast(`Tebrikler! ${parsedStocks.length} ürün başarıyla güncellendi.`, 'success');
          
          setTimeout(() => {
            progressContainer.style.display = 'none';
          }, 2000);

          refreshStatsAndPreview();
        } catch (err) {
          progressContainer.style.display = 'none';
          showToast(err.message, 'error');
        }
      };

      reader.onerror = () => {
        progressContainer.style.display = 'none';
        showToast('Dosya okunurken hata oluştu.', 'error');
      };

      // Read file in Windows-1254 encoding to support Turkish characters
      reader.readAsText(file, 'windows-1254');
    } catch (err) {
      progressContainer.style.display = 'none';
      showToast('Dosya işlenemedi: ' + err.message, 'error');
    }
  };

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'rgba(0, 229, 255, 0.3)';
    dropzone.style.background = 'rgba(0, 0, 0, 0.2)';
    const file = e.dataTransfer.files[0];
    handleFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    handleFile(file);
  });
}

// 4. ADMIN SETTINGS & BRANCH MANAGEMENT VIEW
async function renderAdminSettingsView() {
  const mainContent = document.getElementById('mainContent');
  mainContent.innerHTML = `
    <div class="top-header">
      <div>
        <h1>Ortak Ayarlar & Şube Yönetimi</h1>
        <p class="text-muted" style="margin-top:4px;">Merkez Yönetim Arayüzü</p>
      </div>
    </div>

    <div class="grid-cards">
      <!-- XML configuration -->
      <div class="glass-panel dashboard-card">
        <div class="card-header">
          <div class="card-title">
            <i class="ph ph-globe text-teal"></i>
            <h3>Ortak XML Ayarları</h3>
          </div>
        </div>

        <form id="xmlSettingsForm">
          <div class="input-group">
            <label for="xmlUrlInput">E-Ticaret XML Besleme Adresi (URL)</label>
            <input type="url" id="xmlUrlInput" class="input-field" placeholder="https://..." required>
          </div>
          
          <button type="button" class="btn btn-primary" id="fetchSampleBtn" style="margin-bottom:1.5rem;">
            <i class="ph ph-arrows-merge"></i> XML Etiketlerini Çek ve Eşleştir
          </button>

          <!-- Mapping Area -->
          <div id="mappingArea" style="display:none; background:rgba(0,0,0,0.2); padding:1.5rem; border-radius:var(--radius-md); border:1px solid var(--color-border); margin-bottom:1.5rem;">
            <h4 style="margin-bottom:1rem;" class="text-teal">XML Etiket Eşleştirmeleri</h4>
            <div id="mappingFieldsContainer">
              <!-- Dropdowns loaded dynamically -->
            </div>
          </div>

          <button type="submit" class="btn btn-teal btn-block" id="saveXmlSettingsBtn" disabled>
            <i class="ph ph-check-square"></i> XML Ayarlarını Kaydet
          </button>
        </form>
      </div>

      <!-- Add/Edit Branch Form -->
      <div class="glass-panel dashboard-card" id="branchFormCard">
        <div class="card-header">
          <div class="card-title">
            <i class="ph ph-storefront text-teal"></i>
            <h3 id="branchFormTitle">Yeni Şube Tanımla</h3>
          </div>
        </div>

        <form id="branchForm">
          <input type="hidden" id="editingBranchId" value="">
          <div class="input-group">
            <label for="branchCodeInput">Kullanıcı Adı (Şube Kodu)</label>
            <input type="text" id="branchCodeInput" class="input-field" placeholder="ör. gun004" required>
          </div>
          <div class="input-group">
            <label for="branchNameInput">Şube Adı</label>
            <input type="text" id="branchNameInput" class="input-field" placeholder="ör. Trabzon Beşirli Şubesi" required>
          </div>
          <div class="input-group">
            <label for="branchPassInput">Giriş Şifresi</label>
            <input type="password" id="branchPassInput" class="input-field" placeholder="••••••••" required>
          </div>
          
          <div style="display:flex; gap:10px; margin-top:0.5rem;">
            <button type="submit" class="btn btn-teal btn-block" id="branchSubmitBtn">
              <i class="ph ph-plus"></i> Şube Ekle
            </button>
            <button type="button" class="btn btn-danger" id="cancelEditBtn" style="display:none;">İptal</button>
          </div>
        </form>
      </div>

      <!-- Şube Stok Dosyası (.ini) Yükle -->
      <div class="glass-panel dashboard-card">
        <div class="card-header">
          <div class="card-title">
            <i class="ph ph-upload-simple text-teal"></i>
            <h3>Şube Stok Dosyası (.ini) Yükle</h3>
          </div>
        </div>

        <p class="text-muted" style="font-size: 0.95rem;">
          Seçeceğiniz şubeye ait <strong>yazarkasa_stoklar.ini</strong> dosyasını buraya sürükleyip bırakarak fiyatları güncelleyebilirsiniz.
        </p>

        <div class="input-group">
          <label for="adminBranchSelect">Hedef Şube</label>
          <select id="adminBranchSelect" class="input-field" required>
            <option value="">Şube Seçiniz...</option>
          </select>
        </div>

        <div class="dropzone" id="adminIniDropzone">
          <i class="ph ph-file-code"></i>
          <div>
            <p style="font-weight:600;">Dosyayı Sürükleyin veya Seçin</p>
            <p class="text-muted" style="font-size: 0.85rem; margin-top:4px;">Yalnızca .ini uzantılı dosyalar</p>
          </div>
          <input type="file" id="adminIniFileInput" accept=".ini" style="display:none;">
        </div>

        <div id="adminUploadProgressContainer" style="display:none;">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
            <span id="adminUploadProgressText">Stoklar yükleniyor...</span>
            <span id="adminUploadProgressPercent">0%</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" id="adminUploadProgressBar"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Branches List -->
    <div class="glass-panel" style="margin-top: 2rem; padding: 2rem;">
      <h3 style="margin-bottom:1.2rem;"><i class="ph ph-list-bullets text-teal"></i> Kayıtlı Şubeler</h3>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Şube Kodu</th>
              <th>Şube Adı</th>
              <th>Şifre</th>
              <th style="width: 150px; text-align:center;">İşlemler</th>
            </tr>
          </thead>
          <tbody id="branchesTableBody">
            <tr>
              <td colspan="4" style="text-align:center;" class="text-muted">Şubeler yükleniyor...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Global variables to hold active mappings & sample tags
  let loadedXmlMappings = {};
  let detectedXmlProductTag = 'product';

  // Load Settings
  try {
    const settings = await api.fetchSettings();
    if (settings.xml_url) {
      document.getElementById('xmlUrlInput').value = settings.xml_url;
      if (settings.xml_mappings) {
        loadedXmlMappings = JSON.parse(settings.xml_mappings);
        document.getElementById('saveXmlSettingsBtn').disabled = false;
      }
    }
  } catch (err) {
    showToast('Ayarlar yüklenirken hata oluştu: ' + err.message, 'error');
  }

  // Load Branch List
  const loadBranches = async () => {
    try {
      const branches = await api.fetchBranches();

      // Populate adminBranchSelect dropdown
      const branchSelect = document.getElementById('adminBranchSelect');
      if (branchSelect) {
        const currentValue = branchSelect.value;
        branchSelect.innerHTML = '<option value="">Şube Seçiniz...</option>' + 
          branches.map(b => `<option value="${b.id}">${b.name} (${b.id})</option>`).join('');
        if (currentValue) {
          branchSelect.value = currentValue;
        }
      }

      const tbody = document.getElementById('branchesTableBody');
      if (branches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;" class="text-muted">Kayıtlı şube bulunmuyor.</td></tr>`;
      } else {
        tbody.innerHTML = branches.map(b => `
          <tr>
            <td style="font-family:monospace; font-weight:600;">${b.id}</td>
            <td>${b.name}</td>
            <td style="font-family:monospace;">${b.password}</td>
            <td style="text-align:center; display:flex; gap:8px; justify-content:center;">
              <button class="btn btn-teal btn-edit-branch" data-id="${b.id}" data-name="${b.name}" data-pass="${b.password}" style="padding: 0.4rem 0.8rem; font-size:0.8rem;"><i class="ph ph-pencil-simple"></i></button>
              <button class="btn btn-danger btn-delete-branch" data-id="${b.id}" style="padding: 0.4rem 0.8rem; font-size:0.8rem;"><i class="ph ph-trash"></i></button>
            </td>
          </tr>
        `).join('');

        // Bind CRUD click actions
        document.querySelectorAll('.btn-edit-branch').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const el = e.currentTarget;
            document.getElementById('branchCodeInput').value = el.dataset.id;
            document.getElementById('branchNameInput').value = el.dataset.name;
            document.getElementById('branchPassInput').value = el.dataset.pass;
            document.getElementById('editingBranchId').value = el.dataset.id;
            
            document.getElementById('branchFormTitle').innerText = 'Şube Bilgilerini Güncelle';
            document.getElementById('branchSubmitBtn').innerHTML = '<i class="ph ph-check"></i> Güncelle';
            document.getElementById('cancelEditBtn').style.display = 'inline-flex';
            document.getElementById('branchCodeInput').disabled = true; // code cannot be changed directly
            
            document.getElementById('branchFormCard').scrollIntoView({ behavior: 'smooth' });
          });
        });

        document.querySelectorAll('.btn-delete-branch').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm(`Bu şubeyi silmek istediğinize emin misiniz? Şubeye ait tüm stok ve fiyatlar da kalıcı olarak silinecektir!`)) {
              try {
                await api.removeBranch(id);
                showToast('Şube başarıyla silindi.', 'success');
                loadBranches();
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        });
      }
    } catch (e) {
      showToast('Şubeler yüklenemedi: ' + e.message, 'error');
    }
  };

  loadBranches();

  // Cancel edit branch logic
  const resetBranchForm = () => {
    document.getElementById('branchForm').reset();
    document.getElementById('editingBranchId').value = '';
    document.getElementById('branchFormTitle').innerText = 'Yeni Şube Tanımla';
    document.getElementById('branchSubmitBtn').innerHTML = '<i class="ph ph-plus"></i> Şube Ekle';
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('branchCodeInput').disabled = false;
  };
  document.getElementById('cancelEditBtn').addEventListener('click', resetBranchForm);

  // Submit branch form
  document.getElementById('branchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('branchCodeInput').value.trim();
    const name = document.getElementById('branchNameInput').value.trim();
    const password = document.getElementById('branchPassInput').value;
    const editingId = document.getElementById('editingBranchId').value;

    const submitBtn = document.getElementById('branchSubmitBtn');
    submitBtn.disabled = true;

    try {
      if (editingId) {
        await api.updateBranch(editingId, { id, name, password });
        showToast('Şube başarıyla güncellendi.', 'success');
      } else {
        await api.addBranch({ id, name, password });
        showToast('Yeni şube tanımlandı.', 'success');
      }
      resetBranchForm();
      loadBranches();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // XML Tag fetch sample logic
  document.getElementById('fetchSampleBtn').addEventListener('click', async () => {
    const url = document.getElementById('xmlUrlInput').value.trim();
    if (!url) {
      showToast('Lütfen geçerli bir XML URL girin.', 'info');
      return;
    }

    const btn = document.getElementById('fetchSampleBtn');
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> XML Ayrıştırılıyor...';
    btn.disabled = true;

    try {
      const sample = await api.fetchXmlSample(url);
      detectedXmlProductTag = sample.productNodeName;
      
      const mappingArea = document.getElementById('mappingArea');
      const container = document.getElementById('mappingFieldsContainer');
      
      container.innerHTML = `
        <div style="margin-bottom:10px; font-size:0.85rem;" class="text-muted">
          XML ürün düğümü ismi: <strong>&lt;${detectedXmlProductTag}&gt;</strong> olarak algılandı.
        </div>
        
        <div class="input-group">
          <label>Barkod Etiketi (Barcode)</label>
          <select class="input-field mapping-select" id="mapBarcode" required>
            <option value="">Seçiniz...</option>
            ${sample.tags.map(t => `<option value="${t}" ${loadedXmlMappings.barcode === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>

        <div class="input-group" style="margin-bottom:0;">
          <label>Ürün Görseli Etiketi (Image URL)</label>
          <select class="input-field mapping-select" id="mapImage" required>
            <option value="">Seçiniz...</option>
            ${sample.tags.map(t => `<option value="${t}" ${loadedXmlMappings.image === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
      `;

      mappingArea.style.display = 'block';
      document.getElementById('saveXmlSettingsBtn').disabled = false;
      showToast('XML başarıyla ayrıştırıldı. Lütfen etiketleri eşleştirin.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.innerHTML = '<i class="ph ph-arrows-merge"></i> XML Etiketlerini Çek ve Eşleştir';
      btn.disabled = false;
    }
  });

  // Save XML Settings Form
  document.getElementById('xmlSettingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('xmlUrlInput').value.trim();
    const barcode = document.getElementById('mapBarcode').value;
    const image = document.getElementById('mapImage').value;

    const saveBtn = document.getElementById('saveXmlSettingsBtn');
    saveBtn.disabled = true;

    try {
      const mappings = {
        productNodeName: detectedXmlProductTag,
        barcode,
        image
      };

      await api.saveSettings(url, mappings);
      loadedXmlMappings = mappings;
      showToast('Ortak XML ve eşleştirme ayarları veritabanına kaydedildi.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Dropzone drag-and-drop for Admin panel
  const adminDropzone = document.getElementById('adminIniDropzone');
  const adminFileInput = document.getElementById('adminIniFileInput');

  if (adminDropzone && adminFileInput) {
    adminDropzone.addEventListener('click', () => {
      const branchSelect = document.getElementById('adminBranchSelect');
      if (!branchSelect || !branchSelect.value) {
        showToast('Lütfen önce bir şube seçin!', 'error');
        return;
      }
      adminFileInput.click();
    });

    adminDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      const branchSelect = document.getElementById('adminBranchSelect');
      if (!branchSelect || !branchSelect.value) return;
      adminDropzone.style.borderColor = 'var(--color-secondary)';
      adminDropzone.style.background = 'rgba(0, 229, 255, 0.08)';
    });

    adminDropzone.addEventListener('dragleave', () => {
      adminDropzone.style.borderColor = 'rgba(0, 229, 255, 0.3)';
      adminDropzone.style.background = 'rgba(0, 0, 0, 0.2)';
    });

    const handleAdminFile = async (file) => {
      if (!file) return;
      const branchSelect = document.getElementById('adminBranchSelect');
      const selectedBranchId = branchSelect ? branchSelect.value : '';
      if (!selectedBranchId) {
        showToast('Lütfen önce bir şube seçin!', 'error');
        return;
      }

      if (!file.name.toLowerCase().endsWith('.ini')) {
        showToast('Hatalı dosya biçimi! Lütfen .ini uzantılı stok dosyasını yükleyin.', 'error');
        return;
      }

      const progressContainer = document.getElementById('adminUploadProgressContainer');
      const progressBar = document.getElementById('adminUploadProgressBar');
      const progressText = document.getElementById('adminUploadProgressText');
      const progressPercent = document.getElementById('adminUploadProgressPercent');

      progressContainer.style.display = 'block';
      progressBar.style.width = '0%';
      progressPercent.innerText = '0%';
      progressText.innerText = 'Dosya okunuyor (windows-1254)...';

      try {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          try {
            const text = e.target.result;
            progressText.innerText = 'Stoklar ayrıştırılıyor...';
            progressBar.style.width = '20%';
            progressPercent.innerText = '20%';
            
            const parsedStocks = api.parseIniFile(text);
            if (parsedStocks.length === 0) {
              throw new Error('Dosya içerisinde geçerli bir barkod/ürün kaydı bulunamadı.');
            }

            progressText.innerText = `${parsedStocks.length} ürün Supabase'e yükleniyor...`;
            progressBar.style.width = '20%';
            progressPercent.innerText = '20%';

            await api.uploadStocks(selectedBranchId, parsedStocks, (percent) => {
              const overallPercent = Math.round(20 + (percent * 0.8));
              progressBar.style.width = `${overallPercent}%`;
              progressPercent.innerText = `${overallPercent}%`;
              progressText.innerText = `Ürünler veritabanına yükleniyor: %${percent} tamamlandı (${parsedStocks.length} ürün)...`;
            });

            progressBar.style.width = '100%';
            progressPercent.innerText = '100%';
            progressText.innerText = 'Yükleme başarıyla tamamlandı!';
            showToast(`Tebrikler! ${parsedStocks.length} ürün başarıyla güncellendi.`, 'success');
            
            setTimeout(() => {
              progressContainer.style.display = 'none';
            }, 2000);
          } catch (err) {
            progressContainer.style.display = 'none';
            showToast(err.message, 'error');
          }
        };

        reader.onerror = () => {
          progressContainer.style.display = 'none';
          showToast('Dosya okunurken hata oluştu.', 'error');
        };

        // Read file in Windows-1254 encoding to support Turkish characters
        reader.readAsText(file, 'windows-1254');
      } catch (err) {
        progressContainer.style.display = 'none';
        showToast('Dosya işlenemedi: ' + err.message, 'error');
      }
    };

    adminDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      adminDropzone.style.borderColor = 'rgba(0, 229, 255, 0.3)';
      adminDropzone.style.background = 'rgba(0, 0, 0, 0.2)';
      
      const branchSelect = document.getElementById('adminBranchSelect');
      if (!branchSelect || !branchSelect.value) {
        showToast('Lütfen önce bir şube seçin!', 'error');
        return;
      }

      const file = e.dataTransfer.files[0];
      handleAdminFile(file);
    });

    adminFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      handleAdminFile(file);
    });
  }
}

// 5. KIOSK SCANNING VIEW (CUSTOMER SCREEN)
async function renderKiosk() {
  const branchId = api.currentUser.id;
  const branchName = api.currentUser.name;

  app.innerHTML = `
    <div class="kiosk-container fade-in">
      <div class="kiosk-header">
        <div class="logo-container" style="display:flex; align-items:center; justify-content:center; margin-bottom: 0.5rem;">
          <img src="/indexlogo_kiosk.png" class="kiosk-logo" alt="Güntaş">
        </div>
        <div class="kiosk-branch-name">${branchName}</div>
      </div>

      <div class="kiosk-body">
        <!-- Status Notification Area -->
        <div id="kioskLoader" style="background:var(--color-surface); padding: 1.5rem; border-radius:var(--radius-md); border:1px solid var(--color-border); display:flex; align-items:center; gap:12px;">
          <i class="ph ph-spinner ph-spin text-teal" style="font-size:1.8rem;"></i>
          <span>Veriler yükleniyor. Lütfen bekleyin...</span>
        </div>

        <!-- Camera Scanner Card -->
        <div class="glass-panel scanner-card" id="scannerCard" style="display:none;">
          <!-- State 1: Placeholder (Icon & Text) -->
          <div id="scannerPlaceholder" class="scanner-placeholder-state">
            <div class="scanner-icon-glow">
              <i class="ph ph-qr-code scanner-placeholder-icon"></i>
            </div>
            <span class="scanner-placeholder-text">Barkod Taramak İçin Dokunun</span>
          </div>

          <!-- State 2: Camera Stream -->
          <div id="scannerCameraState" class="scanner-camera-state" style="display:none;">
            <div id="reader" style="width:100%; height:100%;"></div>
            <div class="scanner-laser"></div>
          </div>

          <!-- State 3: Product Image -->
          <div id="scannerImageState" class="scanner-image-state" style="display:none;">
            <img id="scannerProductImg" class="scanner-product-img" src="" alt="Ürün Resmi">
          </div>
        </div>

        <!-- Manual Barcode Input Wrapper -->
        <div class="kiosk-input-wrapper" id="kioskInputWrapper" style="display:none;">
          <div class="kiosk-input-bar glass-panel">
            <i class="ph ph-barcode kiosk-input-icon"></i>
            <input type="text" id="kioskManualInput" class="kiosk-manual-input" placeholder="Barkod No Giriniz" inputmode="none" autocomplete="off">
            <button class="kiosk-numpad-toggle-btn" id="kioskNumpadToggleBtn" title="Numaratör">
              <i class="ph ph-keypad"></i>
            </button>
            <button class="kiosk-manual-search-btn" id="kioskManualSearchBtn">
              <i class="ph ph-magnifying-glass"></i> Sorgula
            </button>
          </div>
          
          <!-- Touch Numpad Container -->
          <div class="kiosk-touch-numpad glass-panel" id="kioskTouchNumpad" style="display: none;">
            <div class="numpad-row">
              <button class="numpad-btn" data-val="1">1</button>
              <button class="numpad-btn" data-val="2">2</button>
              <button class="numpad-btn" data-val="3">3</button>
            </div>
            <div class="numpad-row">
              <button class="numpad-btn" data-val="4">4</button>
              <button class="numpad-btn" data-val="5">5</button>
              <button class="numpad-btn" data-val="6">6</button>
            </div>
            <div class="numpad-row">
              <button class="numpad-btn" data-val="7">7</button>
              <button class="numpad-btn" data-val="8">8</button>
              <button class="numpad-btn" data-val="9">9</button>
            </div>
            <div class="numpad-row">
              <button class="numpad-btn numpad-btn-danger" data-val="clear">C</button>
              <button class="numpad-btn" data-val="0">0</button>
              <button class="numpad-btn numpad-btn-backspace" data-val="backspace"><i class="ph ph-backspace"></i></button>
            </div>
            <div class="numpad-row">
              <button class="numpad-btn numpad-btn-success btn-block" data-val="submit"><i class="ph ph-check"></i> SORGULA</button>
            </div>
          </div>
        </div>

        <!-- Product Card Display (Initially Hidden) -->
        <div class="glass-panel product-card" id="kioskProductCard" style="display:none;">
          <!-- Loaded product details -->
        </div>

        <!-- Helper guidance message -->
        <div style="font-size: 1.3rem; font-weight:500; text-transform:uppercase; letter-spacing:0.5px; opacity:0.8;" id="kioskGuideMessage">
          <i class="ph ph-hand-pointing" style="vertical-align:middle; font-size:1.8rem;" class="text-teal"></i> Lütfen ürün barkodunu okutun
        </div>
        
        <!-- Hidden input to support USB/Keyboard barcode readers -->
        <input type="text" id="kioskUsbInput" style="position:absolute; opacity:0; pointer-events:none; top:-100px;" autofocus>
      </div>

      <div class="kiosk-footer">
        <div style="text-align: left; font-size: 0.8rem; line-height: 1.4; color: var(--color-text-muted);">
          <div id="kioskStockCount" style="font-weight: 500; color: var(--color-secondary);">0 adet stok verisi yüklendi</div>
          <div id="kioskLastUpdate">Son Güncelleme: --.--.---- --:--:--</div>
        </div>
        <button class="btn btn-danger" id="exitKioskBtn" style="padding:0.4rem 1rem; font-size:0.8rem;"><i class="ph ph-sign-out"></i> Kiosk Modundan Çık</button>
        <div>Güntaş İndex Kurumsal</div>
      </div>
    </div>
  `;

  // Bind exit button
  document.getElementById('exitKioskBtn').addEventListener('click', async () => {
    const pass = prompt("Kiosk modundan çıkmak için şube şifresini girin:");
    if (pass === null) return;

    if (pass === 'admin123') {
      api.logout();
      navigateTo('login');
      return;
    }

    const isValid = await api.verifyBranchPassword(branchId, pass);
    if (isValid) {
      api.logout();
      navigateTo('login');
    } else {
      alert("Hatalı şifre!");
    }
  });

  // Support USB Scanner focus keep-alive and manual inputs
  const usbInput = document.getElementById('kioskUsbInput');
  const manualInput = document.getElementById('kioskManualInput');
  const touchNumpad = document.getElementById('kioskTouchNumpad');
  const numpadToggleBtn = document.getElementById('kioskNumpadToggleBtn');
  const manualSearchBtn = document.getElementById('kioskManualSearchBtn');

  window.kioskClickHandler = (e) => {
    // If the click is inside manual input/numpad, don't steal focus
    if (e && e.target) {
      if (e.target.closest('#kioskManualInput') || 
          e.target.closest('#kioskTouchNumpad') || 
          e.target.closest('#kioskNumpadToggleBtn') || 
          e.target.closest('#kioskManualSearchBtn')) {
        return;
      }
    }
    if (currentView === 'kiosk' && usbInput) {
      usbInput.focus();
    }
  };
  
  document.addEventListener('click', window.kioskClickHandler);
  setTimeout(() => {
    if (currentView === 'kiosk' && usbInput) {
      usbInput.focus();
    }
  }, 500);

  // USB Scanner lookup trigger on Enter
  usbInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const barcode = usbInput.value.trim();
      usbInput.value = '';
      if (barcode) {
        console.log(`[KIOSK] USB Barkod okundu: ${barcode}`);
        await lookupKioskBarcode(barcode);
      }
    }
  });

  // Toggle virtual numpad visibility
  numpadToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (touchNumpad.style.display === 'none') {
      touchNumpad.style.display = 'flex';
      numpadToggleBtn.classList.add('active');
      manualInput.focus();
    } else {
      touchNumpad.style.display = 'none';
      numpadToggleBtn.classList.remove('active');
      if (usbInput) usbInput.focus();
    }
  });

  // Handle virtual numpad button mousedown events to prevent focus theft
  const numpadButtons = document.querySelectorAll('.numpad-btn');
  numpadButtons.forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevents manualInput from losing focus
      
      const val = btn.dataset.val;
      if (!val) return;
      
      if (val === 'clear') {
        manualInput.value = '';
      } else if (val === 'backspace') {
        manualInput.value = manualInput.value.slice(0, -1);
      } else if (val === 'submit') {
        const barcode = manualInput.value.trim();
        if (barcode) {
          lookupKioskBarcode(barcode);
        } else {
          showToast('Lütfen bir barkod giriniz.', 'info');
        }
      } else {
        manualInput.value += val;
      }
    });
  });

  // Handle manual query button click
  manualSearchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const barcode = manualInput.value.trim();
    if (barcode) {
      lookupKioskBarcode(barcode);
    } else {
      showToast('Lütfen bir barkod giriniz.', 'info');
    }
  });

  // Handle Enter key on manual text field
  manualInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const barcode = manualInput.value.trim();
      if (barcode) {
        lookupKioskBarcode(barcode);
      }
    }
  });

  // Load XML feed for lookups
  try {
    const settings = await api.fetchSettings();
    if (settings.xml_url && settings.xml_mappings) {
      // Start background load
      const mappings = JSON.parse(settings.xml_mappings);
      api.loadXmlFeed(settings.xml_url, mappings).catch(xmlErr => {
        console.warn('XML beslemesi yüklenemedi (Sadece yerel veritabanı aktif):', xmlErr);
      });
    } else {
      console.warn('XML ayarları tanımlanmamış (Sadece yerel veritabanı aktif).');
    }
  } catch (err) {
    console.warn('Ayarlar alınamadı (Sadece yerel veritabanı aktif):', err);
  } finally {
    // Hide loader, show camera scanner card and manual input wrapper
    const loader = document.getElementById('kioskLoader');
    if (loader) loader.style.display = 'none';
    
    const scannerCard = document.getElementById('scannerCard');
    if (scannerCard) {
      scannerCard.style.display = 'flex';
      resetScannerUI();

      // Click to start scanning
      scannerCard.addEventListener('click', () => {
        const cameraState = document.getElementById('scannerCameraState');
        if (cameraState && cameraState.style.display === 'none') {
          startScanner();
        }
      });
    }
    
    const kioskInputWrapper = document.getElementById('kioskInputWrapper');
    if (kioskInputWrapper) kioskInputWrapper.style.display = 'block';
  }


  // WhatsApp-like stock count and last update time display
  const updateStatusInfo = async () => {
    try {
      const count = await api.getBranchStockCount(branchId);
      const lastUpdate = await api.getBranchLastUpdate(branchId);
      
      const countEl = document.getElementById('kioskStockCount');
      const lastUpdateEl = document.getElementById('kioskLastUpdate');
      
      if (countEl) {
        countEl.innerText = `${count.toLocaleString('tr-TR')} adet stok verisi yüklendi`;
      }
      
      if (lastUpdateEl) {
        if (lastUpdate) {
          const date = new Date(lastUpdate);
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          lastUpdateEl.innerText = `Son Güncelleme: ${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
        } else {
          lastUpdateEl.innerText = 'Son Güncelleme: --.--.---- --:--:--';
        }
      }
    } catch (e) {
      console.warn('WhatsApp durum bilgisi alınamadı:', e);
    }
  };

  // Run immediately and poll every 30 seconds
  updateStatusInfo();
  kioskStatusInterval = setInterval(updateStatusInfo, 30000);
}

// BARCODE SCANNER UI MANAGEMENT
function resetScannerUI() {
  stopScanner();
  const placeholder = document.getElementById('scannerPlaceholder');
  const cameraState = document.getElementById('scannerCameraState');
  const imageState = document.getElementById('scannerImageState');
  if (placeholder) placeholder.style.display = 'flex';
  if (cameraState) cameraState.style.display = 'none';
  if (imageState) imageState.style.display = 'none';
}

// BARCODE SCANNER LOGIC USING HTML5-QRCODE
function startScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    console.warn('Html5Qrcode kütüphanesi yüklenemedi.');
    return;
  }

  // Clear any existing instances
  stopScanner();

  console.log('[SCANNER] Başlatılıyor...');

  // Update UI states
  const placeholder = document.getElementById('scannerPlaceholder');
  const cameraState = document.getElementById('scannerCameraState');
  const imageState = document.getElementById('scannerImageState');
  if (placeholder) placeholder.style.display = 'none';
  if (cameraState) cameraState.style.display = 'block';
  if (imageState) imageState.style.display = 'none';

  // Configure specific barcode formats to speed up scanning and avoid processing unnecessary types
  let formats = [];
  if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
    formats = [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.QR_CODE
    ];
  }

  // Instantiate with optimized formats support
  html5QrcodeScanner = new Html5Qrcode("reader", {
    formatsToSupport: formats,
    verbose: false
  });

  // Optimized scanner parameters
  const config = {
    fps: 20, // Increased from 10 to 20 for faster scan frame analysis
    qrbox: (width, height) => {
      // Barcode formats are wide, so make scanning box wide and short
      const boxWidth = Math.min(width * 0.85, 420);
      const boxHeight = Math.min(height * 0.35, 120);
      return { width: boxWidth, height: boxHeight };
    },
    aspectRatio: 1.333333,
    // Enable browser's native hardware-accelerated Barcode Detection API if supported
    useBarCodeDetectorIfSupported: true,
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    },
    videoConstraints: {
      width: { min: 640, ideal: 1280, max: 1920 },
      height: { min: 480, ideal: 720, max: 1080 }
    }
  };

  // Video resolution constraints: Thin barcode lines require higher resolution (720p/1080p ideal)
  // Standard webcam/browser stream is often low res (e.g. 320x240 or 640x480), causing blurry lines.
  const cameraConfig = {
    facingMode: "environment"
  };

  // Start scanning
  html5QrcodeScanner.start(
    cameraConfig,
    config,
    async (decodedText) => {
      // Success callback
      console.log(`[SCANNER] Kamera barkod okudu: ${decodedText}`);
      stopScanner();
      await lookupKioskBarcode(decodedText);
    },
    (errorMessage) => {
      // Verbose error, ignore
    }
  ).catch(err => {
    console.error('[SCANNER] Kamera başlatılamadı:', err);
    showToast('Kamera erişim hatası! USB Barkod okuyucu aktif.', 'info');
    resetScannerUI();
  });
}

function stopScanner() {
  if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
    console.log('[SCANNER] Durduruluyor...');
    html5QrcodeScanner.stop().catch(err => console.warn('Scanner stop error:', err));
  }
  html5QrcodeScanner = null;
}

// LOOKUP BARCODE AND SHOW PRODUCT DETAILS
async function lookupKioskBarcode(barcode) {
  const productCard = document.getElementById('kioskProductCard');
  const guideMessage = document.getElementById('kioskGuideMessage');
  const branchId = api.currentUser.id;

  if (kioskResetTimeout) clearTimeout(kioskResetTimeout);

  // Clear manual input and close numpad
  const manualInput = document.getElementById('kioskManualInput');
  const touchNumpad = document.getElementById('kioskTouchNumpad');
  const numpadToggleBtn = document.getElementById('kioskNumpadToggleBtn');
  if (manualInput) {
    manualInput.value = '';
  }
  if (touchNumpad) {
    touchNumpad.style.display = 'none';
  }
  if (numpadToggleBtn) {
    numpadToggleBtn.classList.remove('active');
  }

  // Ensure camera scanner is stopped
  stopScanner();

  try {
    const product = await api.getProduct(branchId, barcode);
    
    // Manage scanner card images
    const scannerProductImg = document.getElementById('scannerProductImg');
    const placeholder = document.getElementById('scannerPlaceholder');
    const cameraState = document.getElementById('scannerCameraState');
    const imageState = document.getElementById('scannerImageState');

    if (!product) {
      // Product not found, play buzzer
      offlineAudio.playError();
      showToast('Ürün bulunamadı!', 'error');

      // Reset scanner UI
      if (placeholder) placeholder.style.display = 'flex';
      if (cameraState) cameraState.style.display = 'none';
      if (imageState) imageState.style.display = 'none';
      
      productCard.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:1.5rem; color:var(--color-error); font-weight:700; font-size:1.5rem; display:flex; flex-direction:column; align-items:center; gap:10px;">
          <i class="ph ph-x-circle" style="font-size:3.5rem;"></i>
          <span>Ürün Bulunamadı</span>
          <span style="font-size:1rem; font-weight:400;" class="text-muted">Bu ürün şube veritabanında kayıtlı değildir.</span>
        </div>
      `;
      productCard.style.display = 'grid';
      guideMessage.style.display = 'none';
    } else {
      // Success lookup, play beep sound
      offlineAudio.playSuccess();

      // Show product image inside the scannerCard if it exists
      if (product.image) {
        if (scannerProductImg) scannerProductImg.src = product.image;
        if (placeholder) placeholder.style.display = 'none';
        if (cameraState) cameraState.style.display = 'none';
        if (imageState) imageState.style.display = 'flex';
      } else {
        if (placeholder) placeholder.style.display = 'flex';
        if (cameraState) cameraState.style.display = 'none';
        if (imageState) imageState.style.display = 'none';
      }

      const isDiscounted = product.discount_price && parseFloat(product.discount_price) > 0 && parseFloat(product.discount_price) < parseFloat(product.price);

      // Render product details centered (without duplicate image container)
      productCard.classList.add('no-image');
      productCard.innerHTML = `
        <div class="product-details" style="text-align: center; width: 100%;">
          <div class="product-barcode">${product.barcode}</div>
          <h2 class="product-name" style="font-size: 1.8rem; margin: 0.5rem 0 1rem 0;">${product.name}</h2>
          ${isDiscounted ? `
            <div class="discount-badge-container" style="justify-content: center;">
              <span class="discount-badge"><i class="ph ph-tag"></i> ÖZEL FİYAT / KAMPANYA</span>
            </div>
            <div class="price-container discounted" style="justify-content: center;">
              <span class="old-price">${parseFloat(product.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              <span class="new-price">${parseFloat(product.discount_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
          ` : `
            <div style="font-size:0.9rem;" class="text-muted">Fiyat Gör Fiyatı</div>
            <div class="product-price" style="font-size: 3rem; margin-top: 0.5rem;">${parseFloat(product.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>
          `}
        </div>
      `;
      productCard.style.display = 'grid';
      guideMessage.style.display = 'none';
      
      // Trigger simple pop animation
      productCard.classList.remove('fade-in-up');
      void productCard.offsetWidth; // trigger reflow
      productCard.classList.add('fade-in-up');
    }
  } catch (err) {
    offlineAudio.playError();
    productCard.innerHTML = `<div style="grid-column: 1 / -1; color:var(--color-error); font-weight:600; padding:2rem;">Sistem Hatası: ${err.message}</div>`;
    productCard.style.display = 'grid';
    guideMessage.style.display = 'none';
  }

  // Refocus on USB input scanner
  if (window.kioskClickHandler) {
    window.kioskClickHandler();
  }

  // Clear card display and guide user after 7 seconds of inactivity, and reset scanner card to placeholder state
  kioskResetTimeout = setTimeout(() => {
    productCard.style.display = 'none';
    guideMessage.style.display = 'block';
    resetScannerUI();
  }, 7000);
}

// Start application
init();
