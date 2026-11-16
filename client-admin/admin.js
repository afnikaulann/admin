const API_BASE = window.location.origin;

// State Token Admin
let adminToken = localStorage.getItem('gtc_admin_token') || null;
let currentFilter = 'ALL';
let searchTimeout = null;

// ==========================================
// 1. OTENTIKASI & INITIAL SETUP
// ==========================================

function checkAuth() {
  if (adminToken) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-app').style.display = 'block';
    initDashboard();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-app').style.display = 'none';
  }
}

function setupLoginForm() {
  const form = document.getElementById('admin-login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const btn = document.getElementById('btn-do-login');
    const errBox = document.getElementById('login-error-msg');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifikasi...';
    errBox.style.display = 'none';

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        adminToken = data.token;
        localStorage.setItem('gtc_admin_token', adminToken);
        checkAuth();
      } else {
        errBox.innerText = data.message || 'Login gagal';
        errBox.style.display = 'block';
      }
    } catch (err) {
      errBox.innerText = 'Gagal menghubungi server.';
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Masuk ke Dashboard';
    }
  });
}

function logoutAdmin() {
  if (confirm('Apakah Anda yakin ingin keluar dari Admin Dashboard?')) {
    adminToken = null;
    localStorage.removeItem('gtc_admin_token');
    checkAuth();
  }
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };
}

// Inisialisasi Dashboard
function initDashboard() {
  loadOverviewStats();
  loadTransactions();
  loadAnalytics();
  loadCategories();
  loadSettings();

  // Polling data transaksi & live analytics setiap 8 detik agar sinkron realtime
  setInterval(() => {
    if (adminToken) {
      loadOverviewStats();
      loadAnalytics();
    }
  }, 8000);
}

// Ganti Tab Antarmuka
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  event.currentTarget.classList.add('active');
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');

  if (tabId === 'tab-transaksi') loadTransactions();
  if (tabId === 'tab-analytics') loadAnalytics();
  if (tabId === 'tab-tickets') loadCategories();
  if (tabId === 'tab-payment' || tabId === 'tab-settings') loadSettings();
}

// ==========================================
// 2. KARTU STATISTIK UTAMA (OVERVIEW)
// ==========================================
async function loadOverviewStats() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/overview`, { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) {
      logoutAdmin();
      return;
    }
    const data = await res.json();
    if (!data.success) return;

    const s = data.stats;
    document.getElementById('stat-total-tx').innerText = s.totalTransactions.toLocaleString('id-ID');
    document.getElementById('stat-revenue').innerText = `Rp ${s.paidRevenue.toLocaleString('id-ID')}`;
    document.getElementById('stat-sold-tickets').innerText = s.soldTickets.toLocaleString('id-ID');
    document.getElementById('stat-pending').innerText = s.pendingCount.toLocaleString('id-ID');

    document.getElementById('analytic-total-views').innerText = s.totalViews.toLocaleString('id-ID');
    document.getElementById('analytic-unique-visitors').innerText = s.uniqueVisitors.toLocaleString('id-ID');
    document.getElementById('analytic-total-clicks').innerText = s.totalClicks.toLocaleString('id-ID');
  } catch (err) {
    console.error(err);
  }
}

// ==========================================
// 3. TAB TRANSAKSI (Filter, Search, Status Update, Delete)
// ==========================================
async function loadTransactions() {
  const tbody = document.getElementById('transaction-table-body');
  const searchVal = document.getElementById('tx-search-input').value.trim();

  let url = `${API_BASE}/api/admin/transactions?status=${currentFilter}`;
  if (searchVal) url += `&search=${encodeURIComponent(searchVal)}`;

  try {
    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    if (data.transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:2rem; color:#94a3b8;">Tidak ada data transaksi ditemukan.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.transactions.map(t => {
      return `
        <tr>
          <td><span class="tx-id">${t.id}</span></td>
          <td>
            <strong>${t.customer_name}</strong>
            ${t.customer_email ? `<br><small style="color:#94a3b8;">${t.customer_email}</small>` : ''}
          </td>
          <td>
            <a href="https://wa.me/${t.customer_whatsapp.replace(/^0/, '62')}" target="_blank" style="color:#38bdf8; text-decoration:none;">
              <i class="fa-brands fa-whatsapp"></i> ${t.customer_whatsapp}
            </a>
          </td>
          <td>
            <span style="font-weight:600;">${t.category_name}</span><br>
            <small style="color:#a78bfa;">Kursi: <strong>${t.seat_number}</strong> (${t.ticket_count} pcs)</small>
          </td>
          <td><strong>Rp ${t.total_price.toLocaleString('id-ID')}</strong></td>
          <td><span class="status-badge ${t.status}">${t.status}</span></td>
          <td><small style="color:#64748b; font-family:monospace;">${t.created_at}</small></td>
          <td>
            <div class="action-btn-group">
              ${t.status !== 'PAID' ? `<button class="btn-action paid" onclick="updateTxStatus('${t.id}', 'PAID')" title="Tandai Lunas"><i class="fa-solid fa-check"></i> Lunas</button>` : ''}
              ${t.status !== 'PENDING' ? `<button class="btn-action pending" onclick="updateTxStatus('${t.id}', 'PENDING')" title="Set Pending"><i class="fa-solid fa-clock"></i> Pending</button>` : ''}
              <button class="btn-action del" onclick="deleteTransaction('${t.id}')" title="Hapus"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:#f87171;">Gagal memuat transaksi.</td></tr>`;
  }
}

function filterTransactions(status, btn) {
  currentFilter = status;
  document.querySelectorAll('.pill-btn').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  loadTransactions();
}

function handleSearchTx() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadTransactions();
  }, 350);
}

async function updateTxStatus(txId, status) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/transactions/${txId}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (data.success) {
      loadOverviewStats();
      loadTransactions();
    } else {
      alert(data.message || 'Gagal mengubah status.');
    }
  } catch (err) {
    alert('Terjadi kesalahan jaringan.');
  }
}

async function deleteTransaction(txId) {
  if (!confirm(`Hapus transaksi ${txId}? Kursi akan kembali kosong.`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/transactions/${txId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json();
    if (data.success) {
      loadOverviewStats();
      loadTransactions();
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Gagal menghapus.');
  }
}

// Ekspor CSV
function exportCSV() {
  window.open(`${API_BASE}/api/admin/export-csv?auth=${adminToken}`, '_blank');
}

let selectedAnalyticsDomain = 'ALL';

function filterAnalyticsDomain(val) {
  selectedAnalyticsDomain = val;
  loadAnalytics();
}

// ==========================================
// 4. TAB PENGUNJUNG & KLIK (LIVE ANALYTICS)
// ==========================================
async function loadAnalytics() {
  try {
    let url = `${API_BASE}/api/admin/analytics`;
    if (selectedAnalyticsDomain !== 'ALL') {
      url += `?domain=${encodeURIComponent(selectedAnalyticsDomain)}`;
    }

    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) return;

    const { totalViews, uniqueVisitors, recentClicks, clickSummary, sourceDomains } = data.analytics;

    // Update Angka
    document.getElementById('analytic-total-views').innerText = totalViews.toLocaleString('id-ID');
    document.getElementById('analytic-unique-visitors').innerText = uniqueVisitors.toLocaleString('id-ID');
    document.getElementById('analytic-total-clicks').innerText = recentClicks.length.toLocaleString('id-ID');

    // Render Sumber Domain Pengunjung
    const domainListEl = document.getElementById('domain-source-list');
    if (domainListEl && sourceDomains) {
      if (sourceDomains.length === 0) {
        domainListEl.innerHTML = '<p style="color:#64748b; font-size:0.85rem;">Belum ada trafik pengunjung terdeteksi.</p>';
      } else {
        domainListEl.innerHTML = sourceDomains.map(d => {
          const isVercel = d.domain_source.includes('vercel.app');
          return `
            <div style="background:#0f172a; border:1px solid ${isVercel ? '#4f46e5' : '#334155'}; border-radius:0.6rem; padding:0.9rem;">
              <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem;">
                <i class="fa-solid fa-earth-americas" style="color:${isVercel ? '#818cf8' : '#38bdf8'};"></i>
                <strong style="font-size:0.85rem;">${d.domain_source}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#94a3b8;">
                <span>Total Kunjungan: <b style="color:#fff;">${d.total_hits}</b></span>
                <span>Unik: <b style="color:#34d399;">${d.unique_hits}</b></span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Render Ringkasan Klik
    const summaryContainer = document.getElementById('click-summary-list');
    if (clickSummary.length === 0) {
      summaryContainer.innerHTML = '<p style="color:#64748b; font-size:0.85rem;">Belum ada interaksi klik pengunjung.</p>';
    } else {
      const maxClick = Math.max(...clickSummary.map(c => c.click_count), 1);
      summaryContainer.innerHTML = clickSummary.map(item => {
        const pct = Math.round((item.click_count / maxClick) * 100);
        return `
          <div class="summary-bar-item">
            <div class="summary-bar-header">
              <span>${item.element_label}</span>
              <strong>${item.click_count}x</strong>
            </div>
            <div class="summary-bar-track">
              <div class="summary-bar-progress" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Render Stream Log Terakhir
    const streamContainer = document.getElementById('live-click-stream');
    if (recentClicks.length === 0) {
      streamContainer.innerHTML = '<p style="color:#64748b; font-size:0.85rem;">Menunggu aktivitas klik pengunjung...</p>';
    } else {
      streamContainer.innerHTML = recentClicks.map(c => {
        let metaObj = {};
        try { metaObj = JSON.parse(c.metadata || '{}'); } catch(e) {}
        const pageSrc = metaObj.hostname || (metaObj.pageUrl ? new URL(metaObj.pageUrl).hostname : '');

        return `
          <div class="stream-item">
            <div>
              <span class="stream-type">${c.element_type}</span>: 
              <span class="stream-label">${c.element_label}</span>
              ${pageSrc ? `<br><small style="color:#818cf8; font-size:0.7rem;"><i class="fa-solid fa-link"></i> ${pageSrc}</small>` : ''}
            </div>
            <span class="stream-time">${c.created_at.split(' ')[1] || c.created_at}</span>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

function copyTrackerScript() {
  const code = document.getElementById('tracker-code-snippet').innerText;
  navigator.clipboard.writeText(code).then(() => {
    alert('Kode Tracker Pixel berhasil disalin! Silakan tempelkan di file index.html web Vercel Anda sebelum </body>.');
  });
}

// ==========================================
// 5. TAB KELOLA HARGA & TIKET
// ==========================================
async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/categories`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) return;

    const container = document.getElementById('category-manage-list');
    container.innerHTML = data.categories.map(c => {
      return `
        <div class="cat-edit-card">
          <div class="cat-card-header">
            <strong>${c.id}</strong>
            <input type="color" id="cat-color-${c.id}" value="${c.color}" class="cat-color-badge" title="Ubah Warna Badge">
          </div>
          <div class="form-group">
            <label>Nama Kategori</label>
            <input type="text" id="cat-name-${c.id}" value="${c.name}">
          </div>
          <div class="form-group">
            <label>Harga Tiket (Rp)</label>
            <input type="number" id="cat-price-${c.id}" value="${c.price}">
          </div>
          <div class="form-group">
            <label>Deskripsi & Fasilitas</label>
            <textarea id="cat-desc-${c.id}" rows="2">${c.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Total Kuota Kursi</label>
            <input type="number" id="cat-quota-${c.id}" value="${c.quota || 100}">
          </div>
          <button type="button" class="btn btn-primary btn-block" onclick="saveCategory('${c.id}')">
            <i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

async function saveCategory(id) {
  const name = document.getElementById(`cat-name-${id}`).value;
  const price = document.getElementById(`cat-price-${id}`).value;
  const color = document.getElementById(`cat-color-${id}`).value;
  const description = document.getElementById(`cat-desc-${id}`).value;
  const quota = document.getElementById(`cat-quota-${id}`).value;

  try {
    const res = await fetch(`${API_BASE}/api/admin/categories/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ name, price, color, description, quota })
    });
    const data = await res.json();
    if (data.success) {
      alert('Kategori tiket berhasil diperbarui dan tersinkron ke website pengunjung!');
      loadCategories();
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Gagal menyimpan kategori.');
  }
}

// ==========================================
// 6. TAB REKENING, QRIS, & PENGATURAN KONSER
// ==========================================
async function loadSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/settings`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) return;

    const s = data.settings;
    if (s.bank_name) document.getElementById('setting-bank-name').value = s.bank_name;
    if (s.bank_account_number) document.getElementById('setting-bank-account').value = s.bank_account_number;
    if (s.bank_account_holder) document.getElementById('setting-bank-holder').value = s.bank_account_holder;

    if (s.concert_title) document.getElementById('setting-concert-title').value = s.concert_title;
    if (s.concert_date) document.getElementById('setting-concert-date').value = s.concert_date;
    if (s.concert_venue) document.getElementById('setting-concert-venue').value = s.concert_venue;
    if (s.whatsapp_number) document.getElementById('setting-wa-number').value = s.whatsapp_number;
  } catch (err) {
    console.error(err);
  }
}

function setupSettingsForms() {
  // Form Rekening
  const payForm = document.getElementById('payment-settings-form');
  if (payForm) {
    payForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        bank_name: document.getElementById('setting-bank-name').value,
        bank_account_number: document.getElementById('setting-bank-account').value,
        bank_account_holder: document.getElementById('setting-bank-holder').value
      };
      await saveSettingsAPI(payload, 'Data rekening bank berhasil disimpan!');
    });
  }

  // Form Konser & Ganti Password
  const concertForm = document.getElementById('concert-settings-form');
  if (concertForm) {
    concertForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        concert_title: document.getElementById('setting-concert-title').value,
        concert_date: document.getElementById('setting-concert-date').value,
        concert_venue: document.getElementById('setting-concert-venue').value,
        whatsapp_number: document.getElementById('setting-wa-number').value
      };

      const newPass = document.getElementById('setting-new-password').value.trim();
      if (newPass) {
        if (newPass.length < 5) {
          alert('Password minimal 5 karakter!');
          return;
        }
        payload.new_password = newPass;
      }

      await saveSettingsAPI(payload, 'Pengaturan konser & kredensial berhasil disimpan!');
      document.getElementById('setting-new-password').value = '';
    });
  }
}

async function saveSettingsAPI(payload, successMsg) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/settings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(successMsg);
      loadSettings();
    } else {
      alert(data.message || 'Gagal menyimpan.');
    }
  } catch (err) {
    alert('Terjadi kendala jaringan saat menyimpan pengaturan.');
  }
}

// Inisialisasi Saat Load
document.addEventListener('DOMContentLoaded', () => {
  setupLoginForm();
  setupSettingsForms();
  checkAuth();
});
