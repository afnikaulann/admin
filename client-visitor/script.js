// Pelacak Pengunjung & Sinkronisasi API Realtime
const API_BASE = window.location.origin;

// Inisialisasi ID Pengunjung Unik (Disimpan di localStorage)
function getVisitorId() {
  let vid = localStorage.getItem('gtc_visitor_id');
  if (!vid) {
    vid = 'vis_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    localStorage.setItem('gtc_visitor_id', vid);
  }
  return vid;
}

const VISITOR_ID = getVisitorId();

// State Global Pengunjung
let concertData = null;
let selectedCategory = null;
let selectedSeat = null;

// 1. Kirim Pelacakan Kunjungan Halaman (Page View)
function trackPageView() {
  fetch(`${API_BASE}/api/public/track/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitorId: VISITOR_ID,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent
    })
  }).catch(e => console.warn('Visitor tracking error:', e));
}

// 2. Kirim Pelacakan Klik Aktivitas Pengunjung
function trackClick(elementType, elementLabel, metadata = {}) {
  fetch(`${API_BASE}/api/public/track/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitorId: VISITOR_ID,
      elementType,
      elementLabel,
      metadata
    })
  }).catch(e => console.warn('Click tracking error:', e));
}

// 3. Mengambil Data Konser & Kategori Tiket dari Backend API
async function loadConcertData() {
  try {
    const res = await fetch(`${API_BASE}/api/public/concert-info`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    concertData = data;
    renderConcertInfo(data.settings);
    renderTicketCards(data.categories);
    populateCategoryDropdown(data.categories);

    // Default pilih kategori pertama (VIP Soundcheck)
    if (data.categories.length > 0) {
      selectCategory(data.categories[0].id);
    }
  } catch (err) {
    console.error('Gagal memuat data konser:', err);
  }
}

// Render Konten Acara Dinamis
function renderConcertInfo(settings) {
  if (settings.concert_title) {
    document.title = `${settings.concert_title} - Official Ticketing`;
  }
  if (settings.concert_date) {
    const dateEl = document.getElementById('event-date');
    if (dateEl) dateEl.innerText = settings.concert_date;
  }
  if (settings.concert_venue) {
    const venueEl = document.getElementById('event-venue');
    if (venueEl) venueEl.innerText = settings.concert_venue;
  }
}

// Render Kartu Tiket
function renderTicketCards(categories) {
  const container = document.getElementById('ticket-cards-container');
  if (!container) return;

  container.innerHTML = categories.map((cat, idx) => {
    const isFeatured = idx === 0;
    const remaining = Math.max(0, cat.quota - cat.sold);
    const pct = Math.min(100, Math.round((cat.sold / cat.quota) * 100));

    return `
      <div class="ticket-card ${isFeatured ? 'featured' : ''}" id="card-${cat.id}">
        <div class="card-top">
          <span class="cat-badge" style="background-color: ${cat.color};">${cat.name.split('(')[0]}</span>
          <span style="font-size: 0.75rem; color: #a78bfa; font-weight:700;">PRESALE</span>
        </div>
        <div class="ticket-price">Rp ${cat.price.toLocaleString('id-ID')}</div>
        <p class="ticket-desc">${cat.description || 'Akses resmi konser BTS Live in Jakarta.'}</p>
        
        <div class="quota-indicator">
          <div class="quota-bar">
            <div class="quota-fill" style="width: ${pct}%;"></div>
          </div>
          <div class="quota-text">
            <span>Terjual: ${pct}%</span>
            <span>Tersisa: ${remaining} tiket</span>
          </div>
        </div>

        <button class="btn btn-primary track-btn" onclick="selectCategoryAndScroll('${cat.id}')" data-label="Pilih Tiket: ${cat.name}">
          <i class="fa-solid fa-chair"></i> Pilih Kursi Kategori Ini
        </button>
      </div>
    `;
  }).join('');
}

// Isi Dropdown Kategori
function populateCategoryDropdown(categories) {
  const sel = document.getElementById('form-category');
  if (!sel) return;

  sel.innerHTML = '<option value="">-- Pilih Kategori Tiket --</option>' +
    categories.map(c => `<option value="${c.id}">${c.name} - Rp ${c.price.toLocaleString('id-ID')}</option>`).join('');

  sel.addEventListener('change', (e) => {
    if (e.target.value) {
      selectCategory(e.target.value);
      trackClick('DROPDOWN_CATEGORY', `Ganti Kategori ke ${e.target.value}`);
    }
  });
}

// Pemilihan Kategori
function selectCategory(catId) {
  if (!concertData) return;
  const cat = concertData.categories.find(c => c.id === catId);
  if (!cat) return;

  selectedCategory = cat;
  
  // Update badge di panel kursi
  const badge = document.getElementById('selected-cat-badge');
  if (badge) {
    badge.innerText = cat.name;
    badge.style.backgroundColor = cat.color;
    badge.style.color = '#fff';
  }

  // Sinkronisasi dropdown form
  const sel = document.getElementById('form-category');
  if (sel && sel.value !== catId) {
    sel.value = catId;
  }

  // Update ringkasan harga
  document.getElementById('summary-price').innerText = `Rp ${cat.price.toLocaleString('id-ID')}`;
  document.getElementById('summary-total').innerText = `Rp ${cat.price.toLocaleString('id-ID')}`;

  // Render kursi sesuai kategori
  renderSeatMatrix(cat);
}

function selectCategoryAndScroll(catId) {
  selectCategory(catId);
  trackClick('CARD_CATEGORY_SELECT', `Klik Pilih Kursi: ${catId}`);
  const bookingEl = document.getElementById('booking-section');
  if (bookingEl) bookingEl.scrollIntoView({ behavior: 'smooth' });
}

// Render Kursi Interaktif
function renderSeatMatrix(category) {
  const matrix = document.getElementById('seat-matrix');
  if (!matrix) return;

  matrix.innerHTML = '';
  selectedSeat = null;
  document.getElementById('form-seat').value = '';

  const prefix = category.id.split('_')[0]; // e.g. VIP, CAT1, CAT2
  const bookedList = concertData.bookedSeats || [];

  // Generate 48 kursi per blok
  for (let row = 1; row <= 6; row++) {
    const rowChar = String.fromCharCode(64 + row); // A, B, C, D...
    for (let col = 1; col <= 8; col++) {
      const seatCode = `${prefix}-${rowChar}-${col < 10 ? '0' + col : col}`;
      const isBooked = bookedList.includes(seatCode);

      const seatDiv = document.createElement('div');
      seatDiv.className = `seat-item ${isBooked ? 'booked' : ''}`;
      seatDiv.innerText = `${rowChar}${col}`;
      seatDiv.title = `Kursi ${seatCode} ${isBooked ? '(Sudah Dipesan)' : '(Tersedia)'}`;

      if (!isBooked) {
        seatDiv.addEventListener('click', () => {
          // Deselect sebelumnya
          document.querySelectorAll('.seat-item.active').forEach(s => s.classList.remove('active'));
          seatDiv.classList.add('active');
          selectedSeat = seatCode;
          document.getElementById('form-seat').value = seatCode;
          
          document.getElementById('selected-seat-info').innerHTML = 
            `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Anda memilih <strong>${seatCode}</strong> (${category.name}).`;
          
          trackClick('SEAT_SELECT', `Pilih Kursi ${seatCode}`, { category: category.id, seat: seatCode });
        });
      }

      matrix.appendChild(seatDiv);
    }
  }
}

// Setup Event Listener Klik Interaktif
function setupClickTracking() {
  // Lacak semua tombol dengan class .track-btn
  document.querySelectorAll('.track-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const label = btn.getAttribute('data-label') || btn.innerText.trim();
      trackClick('BUTTON_CLICK', label);
    });
  });

  // Lacak klik denah stadion
  document.querySelectorAll('.seat-block.track-click').forEach(block => {
    block.addEventListener('click', () => {
      const catId = block.getAttribute('data-cat');
      const label = block.getAttribute('data-label') || catId;
      trackClick('STADIUM_MAP_CLICK', label, { category: catId });

      selectCategory(catId);
      const bookingEl = document.getElementById('booking-section');
      if (bookingEl) bookingEl.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// 4. Form Submission (Kirim ke API Backend & Arahkan ke WhatsApp)
function setupOrderForm() {
  const form = document.getElementById('order-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const categoryId = document.getElementById('form-category').value;
    const seatNumber = document.getElementById('form-seat').value;
    const customerName = document.getElementById('form-name').value.trim();
    const customerWhatsapp = document.getElementById('form-whatsapp').value.trim();
    const customerEmail = document.getElementById('form-email').value.trim();

    if (!selectedSeat || !seatNumber) {
      alert('Silakan pilih nomor kursi terlebih dahulu pada denah kursi interaktif.');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-order');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses Pesanan Tiket...';

    // Pelacakan klik submit formulir
    trackClick('FORM_SUBMIT_ORDER', `Submit Pesanan: ${seatNumber}`, {
      name: customerName,
      whatsapp: customerWhatsapp,
      category: categoryId,
      seat: seatNumber
    });

    try {
      const res = await fetch(`${API_BASE}/api/public/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerWhatsapp,
          customerEmail,
          categoryId,
          seatNumber,
          ticketCount: 1
        })
      });

      const result = await res.json();
      if (!result.success) {
        alert(result.message || 'Gagal memproses pemesanan.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i> Pesan Tiket & Dapatkan Invoice WhatsApp';
        return;
      }

      // Tampilkan Modal Sukses & Instruksi Rekening
      document.getElementById('modal-order-id').innerText = result.orderId;
      document.getElementById('modal-bank-name').innerText = result.paymentInfo.bankName || 'BCA (Bank Central Asia)';
      document.getElementById('modal-bank-account').innerText = result.paymentInfo.bankAccount || '8830129481';
      document.getElementById('modal-bank-holder').innerText = result.paymentInfo.bankHolder || 'GLOBAL TICKET CENTER';
      document.getElementById('modal-total-pay').innerText = `Rp ${result.totalPrice.toLocaleString('id-ID')}`;

      // Set link tombol WhatsApp
      const waBtn = document.getElementById('modal-wa-btn');
      waBtn.href = result.waLink;
      waBtn.onclick = () => {
        trackClick('WHATSAPP_REDIRECT', `Konfirmasi WA Order ${result.orderId}`);
      };

      // Buka modal
      document.getElementById('order-success-modal').classList.add('show');

      // Refresh data tiket agar kursi yang baru dipesan terkunci
      await loadConcertData();
      selectCategory(categoryId);

      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i> Pesan Tiket & Dapatkan Invoice WhatsApp';

    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan koneksi server saat memesan.');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i> Pesan Tiket & Dapatkan Invoice WhatsApp';
    }
  });
}

function copyAccountNumber() {
  const acc = document.getElementById('modal-bank-account').innerText;
  navigator.clipboard.writeText(acc).then(() => {
    alert('Nomor rekening berhasil disalin!');
  });
}

function closeOrderModal() {
  document.getElementById('order-success-modal').classList.remove('show');
}

// Inisialisasi Saat Dokumen Siap
document.addEventListener('DOMContentLoaded', () => {
  trackPageView();
  loadConcertData();
  setupClickTracking();
  setupOrderForm();
});
