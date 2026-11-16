const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Database SQLite
const db = new Database(path.join(__dirname, 'tickets_database.sqlite'));

// Inisialisasi Tabel
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS ticket_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    quota INTEGER DEFAULT 100,
    sold INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_whatsapp TEXT NOT NULL,
    customer_email TEXT,
    category_id TEXT NOT NULL,
    category_name TEXT NOT NULL,
    seat_number TEXT NOT NULL,
    ticket_count INTEGER DEFAULT 1,
    total_price INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING', -- PENDING, PAID, CANCEL
    payment_method TEXT DEFAULT 'BANK_TRANSFER',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS visitor_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    page_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS click_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    element_type TEXT NOT NULL, -- CATEGORY_CLICK, SEAT_SELECT, TAB_CLICK, WHATSAPP_ORDER, etc.
    element_label TEXT NOT NULL,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Inisialisasi data bawaan jika tabel settings kosong
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
if (!getSettingStmt.get('admin_password')) {
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('admin_username', 'admin');
  insertSetting.run('admin_password', 'btsadmin2026');
  insertSetting.run('concert_title', 'BTS WORLD TOUR "YOUTH & BEYOND" LIVE IN JAKARTA');
  insertSetting.run('concert_date', '28 - 29 November 2026');
  insertSetting.run('concert_venue', 'Gelora Bung Karno (GBK) Main Stadium, Jakarta');
  insertSetting.run('whatsapp_number', '6281234567890');
  insertSetting.run('whatsapp_template', 'Halo Admin GTC, saya ingin konfirmasi pemesanan tiket BTS konser: [ID_PESANAN] atas nama [NAMA] kategori [KATEGORI] kursi [KURSI].');
  
  // Rekening Bank
  insertSetting.run('bank_name', 'BCA (Bank Central Asia)');
  insertSetting.run('bank_account_number', '8830129481');
  insertSetting.run('bank_account_holder', 'GLOBAL TICKET CENTER');
  insertSetting.run('qris_image_url', '/public-assets/sample-qris.png');
}

// Inisialisasi kategori tiket VIP s/d CAT 7 jika belum ada
const catCount = db.prepare('SELECT COUNT(*) as count FROM ticket_categories').get().count;
if (catCount === 0) {
  const insertCat = db.prepare(`
    INSERT INTO ticket_categories (id, name, color, price, description, quota, sold, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialCategories = [
    { id: 'VIP_SOUNDCHECK', name: 'VIP SOUNDCHECK (Numbered Seating)', color: '#9333ea', price: 4250000, description: 'Akses soundcheck eksklusif, lanyard festival + laminate VIP, gift set photocard khusus, antrean gerbang masuk prioritas.', quota: 400, sold: 124, sort_order: 1 },
    { id: 'CAT_1', name: 'CAT 1 (Standing Festival)', color: '#3b82f6', price: 3450000, description: 'Festival terdekat dari panggung utama dan panggung hidrolik tengah.', quota: 800, sold: 310, sort_order: 2 },
    { id: 'CAT_2', name: 'CAT 2 (Numbered Seating)', color: '#06b6d4', price: 2850000, description: 'Kursi tribun bawah tengah dengan sudut pandang frontal panggung spektakuler.', quota: 600, sold: 245, sort_order: 3 },
    { id: 'CAT_3', name: 'CAT 3 (Numbered Seating)', color: '#10b981', price: 2350000, description: 'Kursi tribun sayap kiri & kanan sudut ideal pandang layar LED raksasa.', quota: 500, sold: 190, sort_order: 4 },
    { id: 'CAT_4', name: 'CAT 4 (Numbered Seating)', color: '#eab308', price: 1850000, description: 'Kursi bertingkat tribun barat & timur elevasi sedang.', quota: 400, sold: 88, sort_order: 5 },
    { id: 'CAT_5', name: 'CAT 5 (Numbered Seating)', color: '#f97316', price: 1450000, description: 'Tribun atas tengah (Upper Tribune) pemandangan panorama stadion 360°.', quota: 500, sold: 140, sort_order: 6 },
    { id: 'CAT_6', name: 'CAT 6 (Numbered Seating)', color: '#ec4899', price: 1100000, description: 'Tribun atas sayap kiri/kanan atmosfer ribuan ARMY lightstick bomb.', quota: 400, sold: 95, sort_order: 7 },
    { id: 'CAT_7', name: 'CAT 7 (Restricted View)', color: '#64748b', price: 850000, description: 'Tribun paling atas dengan pembatasan sudut pandang tiang tata panggung.', quota: 300, sold: 50, sort_order: 8 }
  ];

  for (const cat of initialCategories) {
    insertCat.run(cat.id, cat.name, cat.color, cat.price, cat.description, cat.quota, cat.sold, cat.sort_order);
  }

  // Masukkan sampel transaksi awal untuk admin overview
  const insertTx = db.prepare(`
    INSERT INTO transactions (id, customer_name, customer_whatsapp, customer_email, category_id, category_name, seat_number, ticket_count, total_price, status, payment_method, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  insertTx.run('GTC-BTS-7819', 'Nabila Zahra', '081299883344', 'nabila.zahra@gmail.com', 'VIP_SOUNDCHECK', 'VIP SOUNDCHECK (Numbered Seating)', 'VIP-A-12', 1, 4250000, 'PAID', 'BCA Transfer', '-2 hours');
  insertTx.run('GTC-BTS-7820', 'Tiara Putri', '085711223399', 'tiaraputri@yahoo.com', 'CAT_1', 'CAT 1 (Standing Festival)', 'FEST-B-089', 2, 6900000, 'PAID', 'BCA Transfer', '-5 hours');
  insertTx.run('GTC-BTS-7821', 'Kevin Sanjaya', '081377884455', 'kevin.s@gmail.com', 'CAT_2', 'CAT 2 (Numbered Seating)', 'CAT2-C-45', 1, 2850000, 'PENDING', 'Bank Transfer', '-30 minutes');
  insertTx.run('GTC-BTS-7822', 'Rara Larasati', '089612345678', 'rara.laras@gmail.com', 'CAT_3', 'CAT 3 (Numbered Seating)', 'CAT3-L-19', 1, 2350000, 'PENDING', 'Bank Transfer', '-10 minutes');
}

// Middleware
app.use(cors());
app.use(express.json());

// Serving File Statis Website Terpisah
// Website 1: Pengunjung (Konser Landing Page) -> Langsung aktif di root '/' dan '/visitor'
app.use(express.static(path.join(__dirname, 'client-visitor')));
app.use('/visitor', express.static(path.join(__dirname, 'client-visitor')));

// Website 2: Admin Dashboard (GTC Admin) -> Diakses terpisah di '/gtc-admin'
app.use('/gtc-admin', express.static(path.join(__dirname, 'client-admin')));

// Aset Bersama
app.use('/assets', express.static(path.join(__dirname, 'public-assets')));

// ==========================================
// API PUBLIC UNTUK WEBSITE PENGUNJUNG
// ==========================================

// 1. Ambil data konser, tiket, dan info kontak secara dinamis
app.get('/api/public/concert-info', (req, res) => {
  try {
    const settingsRows = db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'admin_%'").all();
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    const categories = db.prepare('SELECT id, name, color, price, description, quota, sold FROM ticket_categories ORDER BY sort_order ASC').all();

    // Data kursi terisi / sudah dipesan
    const bookedSeats = db.prepare("SELECT seat_number, category_id FROM transactions WHERE status != 'CANCEL'").all();

    res.json({
      success: true,
      settings,
      categories,
      bookedSeats: bookedSeats.map(b => b.seat_number)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Track Kunjungan Halaman (Page View & Unique Visitor)
app.post('/api/public/track/view', (req, res) => {
  try {
    const { visitorId, pageUrl, userAgent } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    if (visitorId) {
      db.prepare(`
        INSERT INTO visitor_logs (visitor_id, ip_address, user_agent, page_url)
        VALUES (?, ?, ?, ?)
      `).run(visitorId, String(ip), String(userAgent || ''), String(pageUrl || ''));
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Track Klik & Aktivitas Pengunjung
app.post('/api/public/track/click', (req, res) => {
  try {
    const { visitorId, elementType, elementLabel, metadata } = req.body;

    if (visitorId && elementType && elementLabel) {
      db.prepare(`
        INSERT INTO click_logs (visitor_id, element_type, element_label, metadata)
        VALUES (?, ?, ?, ?)
      `).run(
        visitorId,
        elementType,
        elementLabel,
        typeof metadata === 'object' ? JSON.stringify(metadata) : String(metadata || '')
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Submit Formulir Pemesanan Tiket Pengunjung
app.post('/api/public/order', (req, res) => {
  try {
    const {
      customerName,
      customerWhatsapp,
      customerEmail,
      categoryId,
      seatNumber,
      ticketCount
    } = req.body;

    if (!customerName || !customerWhatsapp || !categoryId || !seatNumber) {
      return res.status(400).json({ success: false, message: 'Harap lengkapi semua data formulir!' });
    }

    // Periksa kategori
    const category = db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori tiket tidak ditemukan.' });
    }

    // Periksa ketersediaan kursi
    const seatCheck = db.prepare("SELECT id FROM transactions WHERE seat_number = ? AND status != 'CANCEL'").get(seatNumber);
    if (seatCheck) {
      return res.status(400).json({ success: false, message: `Maaf, kursi ${seatNumber} baru saja dipesan oleh orang lain. Silakan pilih kursi lain.` });
    }

    const count = parseInt(ticketCount, 10) || 1;
    const totalPrice = category.price * count;
    const orderId = `GTC-BTS-${Math.floor(1000 + Math.random() * 9000)}`;

    db.prepare(`
      INSERT INTO transactions (id, customer_name, customer_whatsapp, customer_email, category_id, category_name, seat_number, ticket_count, total_price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(orderId, customerName, customerWhatsapp, customerEmail || '', category.id, category.name, seatNumber, count, totalPrice);

    // Update jumlah tiket terjual sementara
    db.prepare('UPDATE ticket_categories SET sold = sold + ? WHERE id = ?').run(count, category.id);

    // Ambil info WhatsApp Admin & Rekening untuk instruksi pembayaran
    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    // Buat format pesan WhatsApp
    const waText = encodeURIComponent(
      `Halo Global Ticket Center (GTC),\n\nSaya ingin konfirmasi pemesanan tiket:\n` +
      `🎫 *No. Pesanan:* ${orderId}\n` +
      `👤 *Nama:* ${customerName}\n` +
      `📱 *WhatsApp:* ${customerWhatsapp}\n` +
      `🎟️ *Kategori:* ${category.name}\n` +
      `💺 *Nomor Kursi:* ${seatNumber}\n` +
      `💰 *Total Tagihan:* Rp ${totalPrice.toLocaleString('id-ID')}\n\n` +
      `Mohon info rekening dan petunjuk konfirmasi pembayaran. Terima kasih!`
    );

    const waLink = `https://wa.me/${settings.whatsapp_number || '6281234567890'}?text=${waText}`;

    res.json({
      success: true,
      orderId,
      totalPrice,
      waLink,
      paymentInfo: {
        bankName: settings.bank_name,
        bankAccount: settings.bank_account_number,
        bankHolder: settings.bank_account_holder,
        qrisUrl: settings.qris_image_url
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ==========================================
// API PRIVATE UNTUK ADMIN PANEL (GTC)
// ==========================================

// Middleware otentikasi sederhana token admin
function verifyAdminToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token || !token.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Akses ditolak. Token tidak valid.' });
  }
  const rawToken = token.replace('Bearer ', '');
  const passRow = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
  // Valid token token format: admin:password
  if (rawToken === `auth_${passRow.value}`) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Autentikasi gagal. Silakan login kembali.' });
  }
}

// 1. Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const userRow = db.prepare("SELECT value FROM settings WHERE key = 'admin_username'").get();
  const passRow = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();

  if (username === userRow.value && password === passRow.value) {
    res.json({
      success: true,
      token: `auth_${passRow.value}`,
      admin: { username }
    });
  } else {
    res.status(401).json({ success: false, message: 'Username atau Password salah!' });
  }
});

// 2. Admin Dashboard Stats & Overview
app.get('/api/admin/overview', verifyAdminToken, (req, res) => {
  try {
    const totalTransactions = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
    const paidRevenue = db.prepare("SELECT SUM(total_price) as sum FROM transactions WHERE status = 'PAID'").get().sum || 0;
    const soldTickets = db.prepare("SELECT SUM(ticket_count) as sum FROM transactions WHERE status = 'PAID'").get().sum || 0;
    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status = 'PENDING'").get().count;

    // Analytics Kunjungan
    const totalViews = db.prepare('SELECT COUNT(*) as count FROM visitor_logs').get().count;
    const uniqueVisitors = db.prepare('SELECT COUNT(DISTINCT visitor_id) as count FROM visitor_logs').get().count;
    const totalClicks = db.prepare('SELECT COUNT(*) as count FROM click_logs').get().count;

    res.json({
      success: true,
      stats: {
        totalTransactions,
        paidRevenue,
        soldTickets,
        pendingCount,
        totalViews,
        uniqueVisitors,
        totalClicks
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Admin Transaksi: List, Filter, Status Update, Delete
app.get('/api/admin/transactions', verifyAdminToken, (req, res) => {
  try {
    const { status, search } = req.query;
    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];

    if (status && status !== 'ALL') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (id LIKE ? OR customer_name LIKE ? OR customer_whatsapp LIKE ? OR seat_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';
    const list = db.prepare(query).all(...params);
    res.json({ success: true, transactions: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update Status Transaksi (Tandai Lunas / Set Pending / Set Cancel)
app.patch('/api/admin/transactions/:id/status', verifyAdminToken, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['PAID', 'PENDING', 'CANCEL'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    }

    db.prepare('UPDATE transactions SET status = ? WHERE id = ?').run(status, id);
    res.json({ success: true, message: `Status transaksi berhasil diubah ke ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Hapus Transaksi
app.delete('/api/admin/transactions/:id', verifyAdminToken, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    res.json({ success: true, message: 'Transaksi berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Admin Live Analytics (Pengunjung & Log Klik)
app.get('/api/admin/analytics', verifyAdminToken, (req, res) => {
  try {
    const { domain } = req.query;
    let viewFilter = '';
    let clickFilter = '';
    const params = [];

    if (domain && domain !== 'ALL') {
      viewFilter = ' WHERE page_url LIKE ?';
      clickFilter = ' WHERE metadata LIKE ?';
      params.push(`%${domain}%`);
    }

    const totalViews = db.prepare(`SELECT COUNT(*) as count FROM visitor_logs ${viewFilter}`).get(...params).count;
    const uniqueVisitors = db.prepare(`SELECT COUNT(DISTINCT visitor_id) as count FROM visitor_logs ${viewFilter}`).get(...params).count;

    // 60 Log Klik Terakhir
    const recentClicks = db.prepare(`SELECT * FROM click_logs ${clickFilter} ORDER BY created_at DESC LIMIT 60`).all(...params);

    // Rangkuman per label klik
    const clickSummary = db.prepare(`
      SELECT element_label, COUNT(*) as click_count
      FROM click_logs ${clickFilter}
      GROUP BY element_label
      ORDER BY click_count DESC
      LIMIT 12
    `).all(...params);

    // Daftar Domain Sumber Pengunjung
    const sourceDomains = db.prepare(`
      SELECT 
        CASE 
          WHEN page_url LIKE '%vercel.app%' THEN 'livenation-bts-ticket.vercel.app'
          WHEN page_url LIKE '%localhost%' THEN 'localhost (Lokal)'
          ELSE 'Lainnya / Eksternal'
        END as domain_source,
        COUNT(*) as total_hits,
        COUNT(DISTINCT visitor_id) as unique_hits
      FROM visitor_logs
      GROUP BY domain_source
    `).all();

    res.json({
      success: true,
      analytics: {
        totalViews,
        uniqueVisitors,
        recentClicks,
        clickSummary,
        sourceDomains
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Admin Kelola Harga & Kategori Tiket
app.get('/api/admin/categories', verifyAdminToken, (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM ticket_categories ORDER BY sort_order ASC').all();
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/categories/:id', verifyAdminToken, (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, price, description, quota } = req.body;

    db.prepare(`
      UPDATE ticket_categories
      SET name = ?, color = ?, price = ?, description = ?, quota = ?
      WHERE id = ?
    `).run(name, color, Number(price), description || '', Number(quota || 100), id);

    res.json({ success: true, message: 'Kategori tiket berhasil diperbarui!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Admin Settings (Rekening, WhatsApp, Info Konser, Ganti Password)
app.get('/api/admin/settings', verifyAdminToken, (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => {
      if (r.key !== 'admin_password') {
        settings[r.key] = r.value;
      }
    });
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/settings', verifyAdminToken, (req, res) => {
  try {
    const entries = req.body;
    const updateStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

    for (const [key, val] of Object.entries(entries)) {
      if (key === 'new_password') {
        if (val && val.trim().length >= 5) {
          updateStmt.run('admin_password', val.trim());
        }
      } else if (key !== 'admin_password') {
        updateStmt.run(key, String(val));
      }
    }

    res.json({ success: true, message: 'Pengaturan berhasil disimpan!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Ekspor Data Transaksi ke CSV
app.get('/api/admin/export-csv', verifyAdminToken, (req, res) => {
  try {
    const txs = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all();
    let csv = 'ID Transaksi,Nama Pemesan,WhatsApp,Email,Kategori,Nomor Kursi,Jumlah Tiket,Total Bayar,Status,Waktu\n';
    
    txs.forEach(t => {
      csv += `"${t.id}","${t.customer_name}","${t.customer_whatsapp}","${t.customer_email || ''}","${t.category_name}","${t.seat_number}",${t.ticket_count},${t.total_price},"${t.status}","${t.created_at}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="gtc-transaksi-bts.csv"');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).send('Gagal mengekspor CSV: ' + err.message);
  }
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 BTS Concert Dual Web Server is Running on Port ${PORT}`);
  console.log(`🌐 Website Pengunjung (Landing Page): http://localhost:${PORT}/visitor/`);
  console.log(`🔒 Website Admin Panel (GTC Dashboard): http://localhost:${PORT}/gtc-admin/`);
  console.log(`=======================================================`);
});
