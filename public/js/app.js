// ============================================================
// SINTA — Frontend Application (Node.js API version)
// ============================================================
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const STATUS_LABEL = {
  tersedia:'Tersedia', dipinjam:'Dipinjam', maintenance:'Maintenance',
  rusak:'Rusak', tidak_aktif:'Tidak Aktif', habis:'Stok Habis',
};
const TRANS_STATUS_LABEL = { aktif:'Aktif', selesai:'Selesai', terlambat:'Terlambat' };
const TRANS_JENIS_LABEL  = { peminjaman:'Peminjaman', pengambilan:'Pengambilan' };
const CATEGORIES = ['Server','Network','Computing','Storage','UPS/Power','Peripheral'];
const CAT_ICON   = { Server:'🖥️', Network:'🔌', Computing:'💻', Storage:'💾', 'UPS/Power':'⚡', Peripheral:'🖨️' };

// ── API Client ───────────────────────────────────────────────────────────────
const API = {
  async req(method, url, body) {
    const opts = { method, headers: {'Content-Type':'application/json'} };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || r.statusText);
    return json;
  },
  get:  (url)       => API.req('GET',    url),
  post: (url, body) => API.req('POST',   url, body),
  put:  (url, body) => API.req('PUT',    url, body),
  del:  (url)       => API.req('DELETE', url),
};

// ── In-memory Store (loaded once, kept in sync) ───────────────────────────────
const Store = {
  users: [], assets: [], transactions: [],

  async load() {
    const [u, a, t] = await Promise.all([
      API.get('/api/users'),
      API.get('/api/assets'),
      API.get('/api/transactions'),
    ]);
    this.users        = u;
    this.assets       = a;
    this.transactions = t;
  },

  userById(id)    { return this.users.find(u => u.id === id); },
  assetById(id)   { return this.assets.find(a => a.id === id); },
  transByAsset(id){ return this.transactions.filter(t => t.asetId === id); },
};

// ── Auth ─────────────────────────────────────────────────────────────────────
const Auth = {
  user: null,

  async login(username, password) {
    try {
      this.user = await API.post('/api/login', { username, password });
      sessionStorage.setItem('sinta_auth', JSON.stringify(this.user));
      return true;
    } catch {
      return false;
    }
  },

  logout() {
    this.user = null;
    sessionStorage.removeItem('sinta_auth');
  },

  restore() {
    const s = sessionStorage.getItem('sinta_auth');
    if (s) { this.user = JSON.parse(s); return true; }
    return false;
  },

  isAdmin() { return this.user?.role === 'admin'; },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function fmt(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'});
}
function today() { return new Date().toISOString().slice(0,10); }
function initials(n) { return (n||'').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function esc(s) {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type='success') {
  const ic = {success:'✓',danger:'✕',warning:'⚠'};
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${ic[type]||'ℹ'}</span><span>${msg}</span>`;
  $('#toast-container').appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}

function loading(show) {
  $('#loading-overlay').classList.toggle('hidden', !show);
}

function statusBadge(s) { return `<span class="badge badge-${s}">${STATUS_LABEL[s]||s}</span>`; }
function transBadge(s)  { return `<span class="badge badge-${s}">${TRANS_STATUS_LABEL[s]||s}</span>`; }
function jenisBadge(j)  {
  return j==='consumable'
    ? `<span class="badge badge-consumable">🔩 Consumable</span>`
    : `<span class="badge badge-aset">📦 Aset</span>`;
}
function catBadge(c) {
  const map={server:'server',network:'network',computing:'computing',storage:'storage',upspower:'ups',peripheral:'peripheral'};
  const key=(c||'').toLowerCase().replace(/[^a-z]/g,'');
  return `<span class="badge badge-${map[key]||'peripheral'}">${esc(c)}</span>`;
}
function stokChip(a) {
  if (a.stok<=0) return `<span class="stok-chip empty">✕ Habis</span>`;
  if (a.jenis==='consumable' && a.stokMin>0 && a.stok<=a.stokMin) return `<span class="stok-chip low">⚠ ${a.stok}</span>`;
  return `<span class="stok-chip ok">${a.stok}</span>`;
}
function thumbHtml(gambar, kategori) {
  const icon = CAT_ICON[kategori]||'📦';
  return gambar
    ? `<img src="${gambar}" class="asset-thumb" alt="foto">`
    : `<div class="asset-thumb-ph">${icon}</div>`;
}

// ── Image compression ─────────────────────────────────────────────────────────
let _formImage = null;

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject('Bukan file gambar'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX=700; let w=img.width, h=img.height;
        if (w>h) { if(w>MAX){h=Math.round(h*MAX/w);w=MAX;} }
        else     { if(h>MAX){w=Math.round(w*MAX/h);h=MAX;} }
        const c=document.createElement('canvas');
        c.width=w; c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        resolve(c.toDataURL('image/jpeg',0.78));
      };
      img.onerror=reject; img.src=e.target.result;
    };
    reader.onerror=reject; reader.readAsDataURL(file);
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const Modal = {
  show(title, bodyHtml, footerHtml='', size='') {
    $('#modal-title').textContent  = title;
    $('#modal-body').innerHTML     = bodyHtml;
    $('#modal-footer').innerHTML   = footerHtml;
    $('#modal-box').className      = 'modal-box'+(size?` modal-${size}`:'');
    $('#modal-overlay').classList.remove('hidden');
  },
  hide() { $('#modal-overlay').classList.add('hidden'); },
  confirm(title, msg, sub, onOk, danger=true) {
    this.show(title,
      `<div class="confirm-icon">${danger?'🗑️':'❓'}</div>
       <p class="confirm-text">${esc(msg)}</p>
       <p class="confirm-sub">${esc(sub)}</p>`,
      `<button class="btn btn-outline" onclick="Modal.hide()">Batal</button>
       <button class="btn ${danger?'btn-danger':'btn-primary'}" id="modal-ok">Konfirmasi</button>`,
      'sm'
    );
    $('#modal-ok').onclick = () => { Modal.hide(); onOk(); };
  },
};

// ── Router ────────────────────────────────────────────────────────────────────
const Router = {
  go(viewId, params={}) {
    $$('.view').forEach(v=>v.classList.add('hidden'));
    const view = $(`#view-${viewId}`);
    if (!view) return;
    view.classList.remove('hidden');

    $$('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.view===viewId));

    const TITLES = {
      dashboard:'Dashboard', assets:'Manajemen Barang', 'asset-form':'Form Barang',
      'asset-detail':'Detail Barang', users:'Manajemen Pengguna', 'user-form':'Form Pengguna',
      transactions:'Histori Transaksi', reports:'Laporan & Statistik',
      'browse-assets':'Lihat Barang Tersedia', 'my-transactions':'Riwayat Saya',
      'borrow-form':'Form Pengambilan / Peminjaman',
    };
    $('#page-title').textContent = TITLES[viewId]||'SINTA';

    const map = {
      dashboard:        Pages.dashboard,
      assets:           Pages.assets,
      'asset-form':     Pages.assetForm,
      'asset-detail':   Pages.assetDetail,
      users:            Pages.users,
      'user-form':      Pages.userForm,
      transactions:     Pages.transactions,
      reports:          Pages.reports,
      'browse-assets':  Pages.browseAssets,
      'my-transactions':Pages.myTransactions,
      'borrow-form':    Pages.borrowForm,
    };
    if (map[viewId]) map[viewId](params);
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// PAGES
// ═════════════════════════════════════════════════════════════════════════════
const Pages = {

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  dashboard() {
    Auth.isAdmin() ? Pages._adminDash() : Pages._userDash();
  },

  _adminDash() {
    const assets = Store.assets;
    const txs    = Store.transactions;
    const users  = Store.users;

    const asetItems = assets.filter(a=>a.jenis!=='consumable');
    const csm       = assets.filter(a=>a.jenis==='consumable');
    const lowStock  = csm.filter(a=>a.stokMin>0 && a.stok<=a.stokMin && a.stok>0);
    const habis     = csm.filter(a=>a.stok<=0);

    const stat = {
      totalAset:   asetItems.length,
      tersedia:    asetItems.filter(a=>a.stok>0&&!['rusak','maintenance','tidak_aktif'].includes(a.status)).length,
      dipinjam:    asetItems.filter(a=>a.stok<=0&&!['rusak','maintenance','tidak_aktif'].includes(a.status)).length,
      totalCsm:    csm.length,
      alert:       lowStock.length + habis.length,
      activeTx:    txs.filter(t=>t.status==='aktif').length,
      totalUsers:  users.filter(u=>u.aktif).length,
      totalTx:     txs.length,
    };

    // Category counts
    const cats = {};
    CATEGORIES.forEach(c=>cats[c]=0);
    assets.forEach(a=>{ if(cats[a.kategori]!==undefined) cats[a.kategori]++; });
    const maxCat = Math.max(...Object.values(cats), 1);

    // Top 5 aset paling banyak dipinjam
    const asetTxCount = {};
    txs.filter(t=>t.jenis==='peminjaman').forEach(t=>{
      asetTxCount[t.asetId] = (asetTxCount[t.asetId]||0) + 1;
    });
    const top5Aset = [...asetItems]
      .map(a=>({...a, txCount: asetTxCount[a.id]||0}))
      .sort((a,b)=>b.txCount-a.txCount)
      .slice(0,5);

    // Top 5 consumable paling banyak diambil
    const csmTxCount  = {};
    const csmQtyTotal = {};
    txs.filter(t=>t.jenis==='pengambilan').forEach(t=>{
      csmTxCount[t.asetId]  = (csmTxCount[t.asetId]||0)  + 1;
      csmQtyTotal[t.asetId] = (csmQtyTotal[t.asetId]||0) + (t.jumlah||1);
    });
    const top5Csm = [...csm]
      .map(a=>({...a, txCount: csmTxCount[a.id]||0, totalAmbil: csmQtyTotal[a.id]||0}))
      .sort((a,b)=>b.txCount-a.txCount || b.totalAmbil-a.totalAmbil)
      .slice(0,5);

    const recentTx = [...txs].sort((a,b)=>b.id-a.id).slice(0,8);

    const rankColors = ['#f59e0b','#94a3b8','#b45309','#64748b','#64748b'];
    const rankIcons  = ['🥇','🥈','🥉','4','5'];
    const rankBadge  = i => `<span class="rank-badge" style="background:${rankColors[i]}">${rankIcons[i]}</span>`;

    const stokChip = a => {
      const cls = a.stok<=0 ? 'empty' : (a.stokMin>0&&a.stok<=a.stokMin) ? 'low' : 'ok';
      return `<span class="stok-chip ${cls}">Stok: ${a.stok}</span>`;
    };

    $('#view-dashboard').innerHTML = `
      <div class="page-header">
        <div><h3>Dashboard</h3><p>Selamat datang, ${esc(Auth.user.nama)}</p></div>
        <span class="badge badge-admin">Administrator</span>
      </div>

      ${[...habis,...lowStock].length ? `<div class="low-stock-banner">
        ⚠️ <strong>${[...habis,...lowStock].length} barang consumable</strong> perlu perhatian:
        ${[...habis,...lowStock].map(a=>`<strong>${esc(a.namaAset)}</strong> (stok: ${a.stok})`).join(', ')}
      </div>` : ''}

      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon blue">📦</div>
          <div><div class="stat-value">${stat.totalAset}</div><div class="stat-label">Total Aset</div></div></div>
        <div class="stat-card"><div class="stat-icon green">✅</div>
          <div><div class="stat-value">${stat.tersedia}</div><div class="stat-label">Aset Tersedia</div></div></div>
        <div class="stat-card"><div class="stat-icon yellow">🔄</div>
          <div><div class="stat-value">${stat.dipinjam}</div><div class="stat-label">Sedang Dipinjam</div></div></div>
        <div class="stat-card"><div class="stat-icon cyan">🔩</div>
          <div><div class="stat-value">${stat.totalCsm}</div><div class="stat-label">Jenis Consumable</div></div></div>
        <div class="stat-card"><div class="stat-icon ${stat.alert>0?'red':'purple'}">📉</div>
          <div><div class="stat-value">${stat.alert}</div><div class="stat-label">Stok Rendah/Habis</div></div></div>
        <div class="stat-card"><div class="stat-icon yellow">📋</div>
          <div><div class="stat-value">${stat.activeTx}</div><div class="stat-label">Peminjaman Aktif</div></div></div>
        <div class="stat-card"><div class="stat-icon purple">👥</div>
          <div><div class="stat-value">${stat.totalUsers}</div><div class="stat-label">Pengguna Aktif</div></div></div>
        <div class="stat-card"><div class="stat-icon blue">🔢</div>
          <div><div class="stat-value">${stat.totalTx}</div><div class="stat-label">Total Transaksi</div></div></div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header"><span class="card-title">🏆 Top 5 Aset Terbanyak Dipinjam</span></div>
          <div class="top-list">
            ${top5Aset.every(a=>a.txCount===0)
              ? '<div class="empty-state"><div class="empty-icon">📦</div><p>Belum ada data peminjaman</p></div>'
              : top5Aset.map((a,i)=>`
                <div class="top-item">
                  ${rankBadge(i)}
                  <div class="top-item-info">
                    <div class="top-item-name">${esc(a.namaAset)}</div>
                    <div class="top-item-meta">${esc(a.kodeAset)} · ${esc(a.kategori)}</div>
                  </div>
                  <div class="top-item-stat">
                    <div class="top-count">${a.txCount}</div>
                    <div class="top-label">peminjaman</div>
                  </div>
                  ${stokChip(a)}
                </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">🏆 Top 5 Consumable Terbanyak Diambil</span></div>
          <div class="top-list">
            ${top5Csm.every(a=>a.txCount===0)
              ? '<div class="empty-state"><div class="empty-icon">🔩</div><p>Belum ada data pengambilan</p></div>'
              : top5Csm.map((a,i)=>`
                <div class="top-item">
                  ${rankBadge(i)}
                  <div class="top-item-info">
                    <div class="top-item-name">${esc(a.namaAset)}</div>
                    <div class="top-item-meta">${esc(a.kodeAset)} · ${a.totalAmbil} pcs diambil</div>
                  </div>
                  <div class="top-item-stat">
                    <div class="top-count">${a.txCount}</div>
                    <div class="top-label">transaksi</div>
                  </div>
                  ${stokChip(a)}
                </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="dashboard-grid" style="margin-top:20px">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Transaksi Terbaru</span>
            <button class="btn btn-sm btn-outline" onclick="Router.go('transactions')">Lihat Semua</button>
          </div>
          ${recentTx.length===0
            ? '<div class="empty-state"><div class="empty-icon">📋</div><p>Belum ada transaksi</p></div>'
            : `<table><thead><tr><th>Barang</th><th>Pengguna</th><th>Jenis</th><th>Tgl</th><th>Status</th></tr></thead><tbody>
               ${recentTx.map(t=>{
                 const a=Store.assetById(t.asetId), u=Store.userById(t.userId);
                 return `<tr>
                   <td><div class="cell-bold">${esc(a?.namaAset||'-')}</div></td>
                   <td>${esc(u?.nama||'-')}</td>
                   <td style="font-size:11px;color:var(--gray-500)">${TRANS_JENIS_LABEL[t.jenis]||'-'}</td>
                   <td>${fmt(t.tanggalPinjam||t.tanggalAmbil)}</td>
                   <td>${transBadge(t.status)}</td></tr>`;
               }).join('')}
               </tbody></table>`}
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Barang per Kategori</span></div>
          <div class="card-body">
            <div class="category-bars">
              ${Object.entries(cats).map(([c,n])=>`
                <div class="cat-row">
                  <div class="cat-header">
                    <span class="cat-name">${CAT_ICON[c]||''} ${c}</span>
                    <span class="cat-count">${n}</span>
                  </div>
                  <div class="cat-bar"><div class="cat-fill" style="width:${Math.round(n/maxCat*100)}%"></div></div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>

      ${[...habis,...lowStock].length ? `
      <div class="card" style="margin-top:20px">
        <div class="card-header">
          <span class="card-title">⚠️ Daftar Stok Rendah / Habis</span>
          <button class="btn btn-sm btn-outline" onclick="Router.go('assets')">Kelola Barang</button>
        </div>
        <table>
          <thead><tr><th>Barang</th><th>Kategori</th><th>Stok Saat Ini</th><th>Stok Minimum</th><th>Status</th></tr></thead>
          <tbody>
            ${[...habis,...lowStock].map(a=>`<tr>
              <td><div class="cell-bold">${esc(a.namaAset)}</div><div class="cell-sub">${esc(a.kodeAset)}</div></td>
              <td>${esc(a.kategori)}</td>
              <td><span class="stok-chip ${a.stok<=0?'empty':'low'}">${a.stok}</span></td>
              <td>${a.stokMin||'-'}</td>
              <td>${statusBadge(a.status)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
    `;
  },

  _userDash() {
    const myTxs   = Store.transactions.filter(t=>t.userId===Auth.user.id);
    const active  = myTxs.filter(t=>t.status==='aktif');
    const selesai = myTxs.filter(t=>t.status==='selesai');
    const avail   = Store.assets.filter(a=>a.stok>0&&!['rusak','tidak_aktif','habis'].includes(a.status));
    const late    = active.filter(t=>t.tanggalRencanaKembali&&t.tanggalRencanaKembali<today());

    const recentMy = [...myTxs].sort((a,b)=>b.id-a.id).slice(0,5);

    $('#view-dashboard').innerHTML = `
      <div class="page-header">
        <div><h3>Dashboard</h3><p>Selamat datang, ${esc(Auth.user.nama)}</p></div>
        <span class="badge badge-pengambil">Pengambil Barang</span>
      </div>

      ${late.length ? `<div class="low-stock-banner" style="background:#fee2e2;border-color:#fca5a5;color:#7f1d1d">
        ⚠️ <strong>${late.length} peminjaman terlambat</strong> dikembalikan:
        ${late.map(t=>`<strong>${esc(Store.assetById(t.asetId)?.namaAset||'-')}</strong>`).join(', ')}
      </div>` : ''}

      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon green">📦</div>
          <div><div class="stat-value">${avail.length}</div><div class="stat-label">Barang Tersedia</div></div></div>
        <div class="stat-card"><div class="stat-icon yellow">🔄</div>
          <div><div class="stat-value">${active.length}</div><div class="stat-label">Sedang Dipinjam</div></div></div>
        <div class="stat-card"><div class="stat-icon ${late.length>0?'red':'purple'}">⏰</div>
          <div><div class="stat-value">${late.length}</div><div class="stat-label">Terlambat Kembali</div></div></div>
        <div class="stat-card"><div class="stat-icon blue">📋</div>
          <div><div class="stat-value">${myTxs.length}</div><div class="stat-label">Total Transaksi Saya</div></div></div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Peminjaman Aktif Saya</span>
            <button class="btn btn-sm btn-primary" onclick="Router.go('browse-assets')">+ Ambil / Pinjam</button>
          </div>
          ${active.length===0
            ? '<div class="empty-state"><div class="empty-icon">✅</div><p>Tidak ada peminjaman aktif</p></div>'
            : `<table><thead><tr><th>Barang</th><th>Tgl Pinjam</th><th>Rencana Kembali</th><th>Status</th></tr></thead><tbody>
               ${active.map(t=>{
                 const a=Store.assetById(t.asetId);
                 const isLate=t.tanggalRencanaKembali&&t.tanggalRencanaKembali<today();
                 return `<tr>
                   <td><div class="cell-bold">${esc(a?.namaAset||'-')}</div>
                       <div class="cell-sub">${esc(a?.kodeAset||'')}</div></td>
                   <td>${fmt(t.tanggalPinjam)}</td>
                   <td class="${isLate?'text-danger':''}">${fmt(t.tanggalRencanaKembali)}</td>
                   <td>${transBadge(isLate?'terlambat':t.status)}</td></tr>`;
               }).join('')}
               </tbody></table>`}
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Riwayat Transaksi Saya</span>
            <button class="btn btn-sm btn-outline" onclick="Router.go('my-transactions')">Lihat Semua</button>
          </div>
          ${recentMy.length===0
            ? '<div class="empty-state"><div class="empty-icon">📋</div><p>Belum ada transaksi</p></div>'
            : `<div class="top-list">
               ${recentMy.map(t=>{
                 const a=Store.assetById(t.asetId);
                 const icon=t.jenis==='peminjaman'?'🔄':'📤';
                 return `<div class="top-item">
                   <span style="font-size:20px">${icon}</span>
                   <div class="top-item-info">
                     <div class="top-item-name">${esc(a?.namaAset||'-')}</div>
                     <div class="top-item-meta">${TRANS_JENIS_LABEL[t.jenis]||''} · ${fmt(t.tanggalPinjam||t.tanggalAmbil)}</div>
                   </div>
                   ${transBadge(t.status)}
                 </div>`;
               }).join('')}
               </div>`}
        </div>
      </div>`;
  },

  // ── ASSETS LIST ───────────────────────────────────────────────────────────
  assets(params={}) {
    const { search='', cat='', status='', jenis='', page=1 } = params;
    const perPage = 10;

    let rows = Store.assets;
    if (search) {
      const s=search.toLowerCase();
      rows=rows.filter(a=>a.namaAset.toLowerCase().includes(s)||a.kodeAset.toLowerCase().includes(s)||(a.merk||'').toLowerCase().includes(s));
    }
    if (cat)    rows=rows.filter(a=>a.kategori===cat);
    if (status) rows=rows.filter(a=>a.status===status);
    if (jenis)  rows=rows.filter(a=>a.jenis===jenis);

    const total=rows.length, pages=Math.max(1,Math.ceil(total/perPage));
    const pageRows=rows.slice((page-1)*perPage, page*perPage);

    $('#view-assets').innerHTML = `
      <div class="page-header">
        <div><h3>Manajemen Barang</h3><p>${total} barang ditemukan</p></div>
        <button class="btn btn-primary" onclick="Router.go('asset-form',{mode:'add'})">+ Tambah Barang</button>
      </div>
      <div class="filter-bar">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input type="text" id="as-search" placeholder="Cari nama, kode, merk..." value="${esc(search)}">
        </div>
        <select id="as-jenis">
          <option value="">Semua Jenis</option>
          <option value="aset"       ${jenis==='aset'?'selected':''}>📦 Aset</option>
          <option value="consumable" ${jenis==='consumable'?'selected':''}>🔩 Consumable</option>
        </select>
        <select id="as-cat">
          <option value="">Semua Kategori</option>
          ${CATEGORIES.map(c=>`<option value="${c}" ${cat===c?'selected':''}>${c}</option>`).join('')}
        </select>
        <select id="as-status">
          <option value="">Semua Status</option>
          ${Object.entries(STATUS_LABEL).map(([v,l])=>`<option value="${v}" ${status===v?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:44px"></th><th>Kode</th><th>Nama Barang</th>
            <th>Jenis</th><th>Kategori</th><th>Stok</th><th>Status</th><th>Aksi</th>
          </tr></thead>
          <tbody>
          ${pageRows.length===0
            ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📦</div><p>Tidak ada barang ditemukan</p></div></td></tr>`
            : pageRows.map(a=>`<tr>
                <td>${thumbHtml(a.gambar,a.kategori)}</td>
                <td><span class="asset-code">${esc(a.kodeAset)}</span></td>
                <td><div class="cell-bold">${esc(a.namaAset)}</div>
                    <div class="cell-sub">${esc(a.merk||'')} ${esc(a.model||'')}</div></td>
                <td>${jenisBadge(a.jenis)}</td>
                <td>${catBadge(a.kategori)}</td>
                <td>${stokChip(a)}${a.jenis==='consumable'&&a.stokMin>0?`<div class="cell-sub">min:${a.stokMin}</div>`:''}</td>
                <td>${statusBadge(a.status)}</td>
                <td><div class="actions">
                  <button class="btn btn-sm btn-outline btn-icon" title="Detail" onclick="Router.go('asset-detail',{id:${a.id}})">👁</button>
                  <button class="btn btn-sm btn-outline btn-icon" title="Edit"   onclick="Router.go('asset-form',{mode:'edit',id:${a.id}})">✏️</button>
                  <button class="btn btn-sm btn-outline btn-icon" title="Hapus"  onclick="Pages.deleteAsset(${a.id})">🗑️</button>
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${Pages._pages(page,pages,p=>`Router.go('assets',{search:'${esc(search)}',cat:'${cat}',status:'${status}',jenis:'${jenis}',page:${p}})`)}
      </div>`;

    let deb;
    $('#as-search').oninput=function(){clearTimeout(deb);deb=setTimeout(()=>Router.go('assets',{search:this.value,cat,status,jenis,page:1}),350);};
    $('#as-jenis').onchange =function(){Router.go('assets',{search,cat,status,jenis:this.value,page:1});};
    $('#as-cat').onchange   =function(){Router.go('assets',{search,cat:this.value,status,jenis,page:1});};
    $('#as-status').onchange=function(){Router.go('assets',{search,cat,status:this.value,jenis,page:1});};
  },

  deleteAsset(id) {
    const a = Store.assetById(id);
    if (!a) return;
    if (Store.transactions.some(t=>t.asetId===id&&t.status==='aktif')) {
      toast('Tidak bisa hapus barang yang sedang dipinjam!','danger'); return;
    }
    Modal.confirm('Hapus Barang',`Hapus "${a.namaAset}"?`,'Data dihapus permanen.', async ()=>{
      try {
        loading(true);
        await API.del(`/api/assets/${id}`);
        Store.assets       = Store.assets.filter(x=>x.id!==id);
        Store.transactions = Store.transactions.filter(t=>t.asetId!==id);
        toast('Barang berhasil dihapus');
        Router.go('assets');
      } catch(e){ toast(e.message,'danger'); } finally{ loading(false); }
    });
  },

  // ── ASSET FORM ────────────────────────────────────────────────────────────
  assetForm(params={}) {
    _formImage = null;
    const isEdit = params.mode==='edit';
    const a = isEdit ? Store.assetById(params.id) : null;
    const v = a || {};
    if (isEdit && a?.gambar) _formImage = a.gambar;

    $('#view-asset-form').innerHTML = `
      <div class="page-header">
        <div><h3>${isEdit?'Edit Barang':'Tambah Barang Baru'}</h3>
          <p>${isEdit?`Mengedit: ${esc(v.namaAset||'')}` : 'Isi data barang IT baru'}</p></div>
        <button class="btn btn-outline" onclick="Router.go('assets')">← Kembali</button>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Data Barang</span></div>
        <div class="card-body">
          <form id="af" onsubmit="Pages.submitAsset(event,${isEdit?v.id:'null'})">
            <div class="form-grid">
              <div class="form-group">
                <label class="required">Jenis Barang</label>
                <select id="af-jenis" required onchange="Pages.onJenisChange()">
                  <option value="aset"       ${(v.jenis||'aset')==='aset'?'selected':''}>📦 Aset (perlu dikembalikan)</option>
                  <option value="consumable" ${v.jenis==='consumable'?'selected':''}>🔩 Consumable (habis pakai)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="required">Kategori</label>
                <select id="af-kategori" required onchange="Pages.updateCode()">
                  ${CATEGORIES.map(c=>`<option value="${c}" ${v.kategori===c?'selected':''}>${c}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="required">Kode Barang</label>
                <input type="text" id="af-kode" value="${esc(v.kodeAset||'')}" required readonly
                  style="background:var(--gray-50);font-family:monospace;font-weight:600">
                <span class="form-hint">Otomatis berdasarkan kategori</span>
              </div>
              <div class="form-group">
                <label class="required">Nama Barang</label>
                <input type="text" id="af-nama" value="${esc(v.namaAset||'')}" required
                  placeholder="cth: Konektor RJ45 Cat6, Server Dell R740">
              </div>
              <div class="form-group">
                <label>Merk / Brand</label>
                <input type="text" id="af-merk" value="${esc(v.merk||'')}" placeholder="cth: Belden, Dell, Cisco">
              </div>
              <div class="form-group">
                <label>Model / Tipe</label>
                <input type="text" id="af-model" value="${esc(v.model||'')}" placeholder="cth: Cat6 UTP, PowerEdge R740">
              </div>
              <div class="form-group" id="af-sn-group">
                <label>Serial Number</label>
                <input type="text" id="af-sn" value="${esc(v.serialNumber||'')}" placeholder="cth: SN1234567">
              </div>
              <div class="form-group">
                <label class="required">Lokasi / Tempat Penyimpanan</label>
                <input type="text" id="af-lokasi" value="${esc(v.lokasi||'')}" required
                  placeholder="cth: Gudang IT Rak-A, Server Room Rack-1">
              </div>
              <div class="form-group">
                <label class="required">Jumlah / Stok</label>
                <input type="number" id="af-stok" value="${v.stok??1}" required min="0" placeholder="cth: 1">
                <span class="form-hint" id="af-stok-hint">Jumlah unit yang tersedia</span>
              </div>
              <div class="form-group" id="af-stokmin-group">
                <label>Stok Minimum (Alert)</label>
                <input type="number" id="af-stokmin" value="${v.stokMin??0}" min="0" placeholder="cth: 10">
                <span class="form-hint">Alert muncul jika stok ≤ nilai ini</span>
              </div>
              <div class="form-group">
                <label class="required">Status</label>
                <select id="af-status" required>
                  <option value="tersedia"    ${(v.status||'tersedia')==='tersedia'?'selected':''}>Tersedia</option>
                  <option value="maintenance" ${v.status==='maintenance'?'selected':''}>Maintenance</option>
                  <option value="rusak"       ${v.status==='rusak'?'selected':''}>Rusak</option>
                  <option value="tidak_aktif" ${v.status==='tidak_aktif'?'selected':''}>Tidak Aktif</option>
                </select>
              </div>
              <div class="form-group">
                <label>Kondisi Fisik</label>
                <select id="af-kondisi">
                  <option value="baik"        ${(v.kondisi||'baik')==='baik'?'selected':''}>Baik</option>
                  <option value="kurang_baik" ${v.kondisi==='kurang_baik'?'selected':''}>Kurang Baik</option>
                  <option value="rusak"       ${v.kondisi==='rusak'?'selected':''}>Rusak</option>
                </select>
              </div>
              <div class="form-group">
                <label>Tanggal Pengadaan</label>
                <input type="date" id="af-tgl" value="${esc(v.tanggalPengadaan||'')}">
              </div>
              <div class="form-group span-2">
                <label>Spesifikasi</label>
                <textarea id="af-spek" placeholder="cth: Cat6 Unshielded, 250MHz, Gold Plated">${esc(v.spesifikasi||'')}</textarea>
              </div>
              <div class="form-group span-2">
                <label>Keterangan</label>
                <textarea id="af-ket" placeholder="Catatan tambahan...">${esc(v.keterangan||'')}</textarea>
              </div>
              <div class="form-group span-2">
                <label>Foto Barang</label>
                <div class="img-upload-area">
                  <div id="af-img-preview">${Pages.imgPreviewHtml(_formImage, v.kategori)}</div>
                  <input type="file" id="af-gambar" accept="image/*" style="display:none" onchange="Pages.handleImg(this)">
                  <div style="display:flex;gap:8px;justify-content:center;margin-top:8px;flex-wrap:wrap">
                    <label for="af-gambar" class="btn btn-outline btn-sm" style="cursor:pointer">📷 Pilih Gambar</label>
                    <button type="button" class="btn btn-outline btn-sm" onclick="Pages.clearImg()">✕ Hapus Foto</button>
                  </div>
                </div>
                <span class="form-hint">JPG/PNG/WEBP, maks 5MB. Dikompres otomatis.</span>
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-outline" onclick="Router.go('assets')">Batal</button>
              <button type="submit" class="btn btn-primary" id="af-submit">${isEdit?'💾 Simpan Perubahan':'+ Tambah Barang'}</button>
            </div>
          </form>
        </div>
      </div>`;

    if (!isEdit) Pages.updateCode();
    Pages.onJenisChange();
  },

  imgPreviewHtml(img, kategori) {
    if (img) return `<img src="${img}" class="img-preview-box" alt="Preview">`;
    return `<div class="img-placeholder"><div class="icon">${CAT_ICON[kategori]||'📦'}</div><p>Belum ada foto</p><span>Klik Pilih Gambar untuk upload</span></div>`;
  },

  async handleImg(input) {
    if (!input.files||!input.files[0]) return;
    if (input.files[0].size>5*1024*1024){ toast('File terlalu besar (maks 5MB)','danger'); return; }
    try {
      _formImage = await compressImage(input.files[0]);
      const p = $('#af-img-preview');
      if (p) p.innerHTML = `<img src="${_formImage}" class="img-preview-box" alt="Preview">`;
      toast('Gambar dimuat');
    } catch(e){ toast('Gagal memuat gambar','danger'); }
  },

  clearImg() {
    _formImage = null;
    const p=$('#af-img-preview'), cat=$('#af-kategori')?.value;
    if (p) p.innerHTML = Pages.imgPreviewHtml(null, cat);
    const inp=$('#af-gambar'); if(inp) inp.value='';
  },

  onJenisChange() {
    const isC = $('#af-jenis')?.value==='consumable';
    const snGrp=$('#af-sn-group'), minGrp=$('#af-stokmin-group'), hint=$('#af-stok-hint');
    if (snGrp)  snGrp.style.display  = isC ? 'none' : '';
    if (minGrp) minGrp.style.display = isC ? '' : 'none';
    if (hint)   hint.textContent = isC ? 'Jumlah stok saat ini' : 'Jumlah unit yang tersedia';
  },

  updateCode() {
    const kode=$('#af-kode'); if(!kode) return;
    const cat=$('#af-kategori')?.value||'Server';
    const pref={Server:'SRV',Network:'NET',Computing:'CMP',Storage:'STR','UPS/Power':'UPS',Peripheral:'PER'};
    const p=pref[cat]||'AST';
    const nums=Store.assets.filter(a=>a.kodeAset.startsWith(p+'-')).map(a=>parseInt(a.kodeAset.slice(p.length+1))||0);
    kode.value=`${p}-${String((nums.length?Math.max(...nums):0)+1).padStart(3,'0')}`;
  },

  async submitAsset(e, id) {
    e.preventDefault();
    const jenis=$('#af-jenis').value;
    const stok=parseInt($('#af-stok').value)||0;
    let status=$('#af-status').value;
    if (!['rusak','maintenance','tidak_aktif'].includes(status)) {
      status = jenis==='consumable' ? (stok<=0?'habis':'tersedia') : (stok<=0?'dipinjam':'tersedia');
    }
    const data = {
      jenis, stok, status,
      kodeAset:         $('#af-kode').value.trim(),
      namaAset:         $('#af-nama').value.trim(),
      kategori:         $('#af-kategori').value,
      merk:             $('#af-merk').value.trim(),
      model:            $('#af-model').value.trim(),
      serialNumber:     jenis==='consumable'? '' : ($('#af-sn')?.value?.trim()||''),
      lokasi:           $('#af-lokasi').value.trim(),
      stokMin:          jenis==='consumable'? (parseInt($('#af-stokmin').value)||0) : 0,
      kondisi:          $('#af-kondisi').value,
      tanggalPengadaan: $('#af-tgl').value,
      spesifikasi:      $('#af-spek').value.trim(),
      keterangan:       $('#af-ket').value.trim(),
      gambar:           _formImage,
    };

    const btn=$('#af-submit'); if(btn) btn.disabled=true;
    loading(true);
    try {
      if (id) {
        const updated = await API.put(`/api/assets/${id}`, data);
        Store.assets = Store.assets.map(a=>a.id===id?updated:a);
        toast('Barang berhasil diperbarui');
      } else {
        const created = await API.post('/api/assets', data);
        Store.assets.push(created);
        toast('Barang berhasil ditambahkan');
      }
      _formImage = null;
      Router.go('assets');
    } catch(err){
      toast(err.message,'danger');
      if(btn) btn.disabled=false;
    } finally{ loading(false); }
  },

  // ── ASSET DETAIL ──────────────────────────────────────────────────────────
  assetDetail(params={}) {
    const a = Store.assetById(params.id);
    if (!a) { Router.go('assets'); return; }
    const txs = Store.transByAsset(a.id).sort((x,y)=>y.id-x.id);
    const back = Auth.isAdmin() ? 'assets' : 'browse-assets';

    $('#view-asset-detail').innerHTML = `
      <div class="page-header">
        <div><h3>${esc(a.namaAset)}</h3>
          <p><span class="asset-code">${esc(a.kodeAset)}</span> · ${esc(a.kategori)} · ${a.jenis==='consumable'?'Consumable':'Aset'}</p></div>
        <div style="display:flex;gap:8px">
          ${Auth.isAdmin()?`<button class="btn btn-outline" onclick="Router.go('asset-form',{mode:'edit',id:${a.id}})">✏️ Edit</button>`:''}
          <button class="btn btn-outline" onclick="Router.go('${back}')">← Kembali</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:20px;align-items:start">
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card"><div class="card-body" style="padding:16px">
            ${a.gambar
              ? `<img src="${a.gambar}" class="detail-img" alt="foto">`
              : `<div class="detail-img-ph">${CAT_ICON[a.kategori]||'📦'}<p>Belum ada foto</p></div>`}
          </div></div>
          <div class="card">
            <div class="card-header"><span class="card-title">Stok & Status</span></div>
            <div class="card-body" style="text-align:center;padding:16px 20px">
              <div style="font-size:40px;font-weight:700;color:${a.stok>0?'var(--success)':'var(--danger)'}">${a.stok}</div>
              <div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">${a.jenis==='consumable'?'unit tersisa':'unit tersedia'}</div>
              ${statusBadge(a.status)}&nbsp;${jenisBadge(a.jenis)}
              ${a.jenis==='consumable'&&a.stokMin>0
                ? `<div style="margin-top:8px;font-size:12px;color:${a.stok<=a.stokMin?'var(--warning)':'var(--gray-400)'}">Stok min: <strong>${a.stokMin}</strong> ${a.stok<=a.stokMin?'⚠️':''}</div>`:''}
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <div class="card-header"><span class="card-title">Informasi Barang</span></div>
            <div class="card-body">
              <div class="info-list">
                <div class="info-row"><span class="info-key">Kode</span>      <span class="info-val"><span class="asset-code">${esc(a.kodeAset)}</span></span></div>
                <div class="info-row"><span class="info-key">Nama</span>      <span class="info-val"><strong>${esc(a.namaAset)}</strong></span></div>
                <div class="info-row"><span class="info-key">Jenis</span>     <span class="info-val">${jenisBadge(a.jenis)}</span></div>
                <div class="info-row"><span class="info-key">Kategori</span>  <span class="info-val">${catBadge(a.kategori)}</span></div>
                <div class="info-row"><span class="info-key">Merk</span>      <span class="info-val">${esc(a.merk||'-')}</span></div>
                <div class="info-row"><span class="info-key">Model</span>     <span class="info-val">${esc(a.model||'-')}</span></div>
                ${a.serialNumber?`<div class="info-row"><span class="info-key">Serial No.</span><span class="info-val">${esc(a.serialNumber)}</span></div>`:''}
                <div class="info-row"><span class="info-key">Lokasi</span>    <span class="info-val">${esc(a.lokasi||'-')}</span></div>
                ${a.jenis!=='consumable'?`<div class="info-row"><span class="info-key">Kondisi</span><span class="info-val">${esc(a.kondisi||'-')}</span></div>`:''}
                <div class="info-row"><span class="info-key">Tgl Pengadaan</span><span class="info-val">${fmt(a.tanggalPengadaan)}</span></div>
                ${a.spesifikasi?`<div class="info-row"><span class="info-key">Spesifikasi</span><span class="info-val">${esc(a.spesifikasi)}</span></div>`:''}
                ${a.keterangan?`<div class="info-row"><span class="info-key">Keterangan</span><span class="info-val">${esc(a.keterangan)}</span></div>`:''}
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">Histori Transaksi</span><span style="font-size:12px;color:var(--gray-500)">${txs.length}</span></div>
            ${txs.length===0
              ? '<div class="empty-state" style="padding:24px"><div class="empty-icon">📋</div><p>Belum ada histori</p></div>'
              : `<table><thead><tr><th>Pengguna</th><th>Jenis</th><th>Jml</th><th>Tanggal</th><th>Status</th></tr></thead><tbody>
                 ${txs.slice(0,8).map(t=>{const u=Store.userById(t.userId);return`<tr>
                   <td>${esc(u?.nama||'-')}</td>
                   <td style="font-size:11px;color:var(--gray-500)">${TRANS_JENIS_LABEL[t.jenis]||'-'}</td>
                   <td><strong>${t.jumlah||1}</strong></td>
                   <td>${fmt(t.tanggalPinjam||t.tanggalAmbil)}</td>
                   <td>${transBadge(t.status)}</td></tr>`;}).join('')}
                 </tbody></table>`}
          </div>
        </div>
      </div>`;
  },

  // ── USERS ─────────────────────────────────────────────────────────────────
  users(params={}) {
    const { search='', role='' } = params;
    let rows = Store.users;
    if (search){ const s=search.toLowerCase(); rows=rows.filter(u=>u.nama.toLowerCase().includes(s)||u.username.toLowerCase().includes(s)); }
    if (role) rows=rows.filter(u=>u.role===role);

    $('#view-users').innerHTML = `
      <div class="page-header">
        <div><h3>Manajemen Pengguna</h3><p>${rows.length} pengguna</p></div>
        <button class="btn btn-primary" onclick="Router.go('user-form',{mode:'add'})">+ Tambah Pengguna</button>
      </div>
      <div class="filter-bar">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input type="text" id="us-search" placeholder="Cari nama / username..." value="${esc(search)}">
        </div>
        <select id="us-role">
          <option value="">Semua Role</option>
          <option value="admin"    ${role==='admin'?'selected':''}>Admin</option>
          <option value="pengambil" ${role==='pengambil'?'selected':''}>Pengambil Barang</option>
        </select>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Nama</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Terdaftar</th><th>Aksi</th></tr></thead>
        <tbody>
        ${rows.length===0?`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👤</div><p>Tidak ada pengguna</p></div></td></tr>`:
          rows.map(u=>`<tr>
            <td><div class="cell-bold">${esc(u.nama)}</div></td>
            <td><span class="asset-code">${esc(u.username)}</span></td>
            <td>${esc(u.email||'-')}</td>
            <td><span class="badge badge-${u.role}">${u.role==='admin'?'Admin':'Pengambil Barang'}</span></td>
            <td><span class="badge ${u.aktif?'badge-tersedia':'badge-rusak'}">${u.aktif?'Aktif':'Nonaktif'}</span></td>
            <td>${fmt(u.createdAt)}</td>
            <td><div class="actions">
              <button class="btn btn-sm btn-outline btn-icon" onclick="Router.go('user-form',{mode:'edit',id:${u.id}})">✏️</button>
              ${u.id!==Auth.user.id
                ?`<button class="btn btn-sm btn-outline btn-icon" onclick="Pages.deleteUser(${u.id})">🗑️</button>`
                :`<span style="font-size:11px;color:var(--gray-400);padding:0 8px">Anda</span>`}
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

    let deb;
    $('#us-search').oninput=function(){clearTimeout(deb);deb=setTimeout(()=>Router.go('users',{search:this.value,role}),350);};
    $('#us-role').onchange=function(){Router.go('users',{search,role:this.value});};
  },

  deleteUser(id) {
    const u=Store.userById(id); if(!u) return;
    if (Store.transactions.some(t=>t.userId===id&&t.status==='aktif')){
      toast('Tidak bisa hapus pengguna dengan peminjaman aktif!','danger'); return;
    }
    Modal.confirm('Hapus Pengguna',`Hapus akun "${u.nama}"?`,'Akun dihapus permanen.',async()=>{
      try{loading(true);await API.del(`/api/users/${id}`);Store.users=Store.users.filter(x=>x.id!==id);toast('Pengguna berhasil dihapus');Router.go('users');}
      catch(e){toast(e.message,'danger');}finally{loading(false);}
    });
  },

  // ── USER FORM ─────────────────────────────────────────────────────────────
  userForm(params={}) {
    const isEdit=params.mode==='edit', u=isEdit?Store.userById(params.id):null, v=u||{};
    $('#view-user-form').innerHTML = `
      <div class="page-header">
        <div><h3>${isEdit?'Edit Pengguna':'Tambah Pengguna'}</h3></div>
        <button class="btn btn-outline" onclick="Router.go('users')">← Kembali</button>
      </div>
      <div class="card"><div class="card-header"><span class="card-title">Data Pengguna</span></div>
      <div class="card-body">
        <form id="uf" onsubmit="Pages.submitUser(event,${isEdit?v.id:'null'})">
          <div class="form-grid">
            <div class="form-group">
              <label class="required">Nama Lengkap</label>
              <input type="text" id="uf-nama" value="${esc(v.nama||'')}" required placeholder="cth: Budi Santoso">
            </div>
            <div class="form-group">
              <label class="required">Username</label>
              <input type="text" id="uf-username" value="${esc(v.username||'')}" required placeholder="cth: budi"
                ${isEdit?'readonly style="background:var(--gray-50)"':''}>
            </div>
            <div class="form-group">
              <label ${!isEdit?'class="required"':''}>Password ${isEdit?'(kosongkan jika tidak diubah)':''}</label>
              <input type="password" id="uf-password" ${!isEdit?'required':''} placeholder="${isEdit?'Password baru (opsional)':'Buat password'}">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="uf-email" value="${esc(v.email||'')}" placeholder="cth: budi@perusahaan.com">
            </div>
            <div class="form-group">
              <label class="required">Role</label>
              <select id="uf-role" required>
                <option value="admin"    ${v.role==='admin'?'selected':''}>Admin</option>
                <option value="pengambil" ${(v.role==='pengambil'||!v.role)?'selected':''}>Pengambil Barang</option>
              </select>
            </div>
            <div class="form-group">
              <label>Status Akun</label>
              <select id="uf-aktif">
                <option value="true"  ${v.aktif!==false?'selected':''}>Aktif</option>
                <option value="false" ${v.aktif===false?'selected':''}>Nonaktif</option>
              </select>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-outline" onclick="Router.go('users')">Batal</button>
            <button type="submit" class="btn btn-primary" id="uf-submit">${isEdit?'💾 Simpan':'+ Tambah'}</button>
          </div>
        </form>
      </div></div>`;
  },

  async submitUser(e, id) {
    e.preventDefault();
    const username=$('#uf-username').value.trim(), password=$('#uf-password').value;
    const data={
      nama:$('#uf-nama').value.trim(), username,
      email:$('#uf-email').value.trim(), role:$('#uf-role').value,
      aktif:$('#uf-aktif').value==='true',
    };
    if (password) data.password=password;
    const btn=$('#uf-submit'); if(btn) btn.disabled=true;
    loading(true);
    try{
      if(id){
        const updated=await API.put(`/api/users/${id}`,data);
        Store.users=Store.users.map(u=>u.id===id?{...u,...updated}:u);
        if(id===Auth.user.id){Auth.user={...Auth.user,...updated};sessionStorage.setItem('sinta_auth',JSON.stringify(Auth.user));}
        toast('Pengguna berhasil diperbarui');
      }else{
        if(!password){toast('Password wajib diisi!','danger');return;}
        const created=await API.post('/api/users',data);
        Store.users.push(created);
        toast('Pengguna berhasil ditambahkan');
      }
      Router.go('users');
    }catch(err){toast(err.message,'danger');if(btn)btn.disabled=false;}
    finally{loading(false);}
  },

  // ── TRANSACTIONS ──────────────────────────────────────────────────────────
  transactions(params={}) {
    const {search='',status='',jenis='',page=1}=params;
    const perPage=12;

    // auto mark overdue
    let changed=false;
    Store.transactions.forEach(t=>{
      if(t.status==='aktif'&&t.tanggalRencanaKembali&&t.tanggalRencanaKembali<today()){
        t.status='terlambat'; changed=true;
      }
    });
    if(changed) Store.transactions.forEach(async t=>{if(t.status==='terlambat') await API.put(`/api/transactions/${t.id}`,{status:'terlambat'}).catch(()=>{});});

    let rows=[...Store.transactions].sort((a,b)=>b.id-a.id);
    if(status) rows=rows.filter(t=>t.status===status);
    if(jenis)  rows=rows.filter(t=>t.jenis===jenis);
    if(search){const s=search.toLowerCase();rows=rows.filter(t=>{const a=Store.assetById(t.asetId),u=Store.userById(t.userId);return(a?.namaAset||'').toLowerCase().includes(s)||(u?.nama||'').toLowerCase().includes(s);});}

    const total=rows.length,pages=Math.max(1,Math.ceil(total/perPage));
    const pageRows=rows.slice((page-1)*perPage,page*perPage);

    $('#view-transactions').innerHTML = `
      <div class="page-header"><div><h3>Histori Transaksi</h3><p>${total} transaksi</p></div></div>
      <div class="filter-bar">
        <div class="search-input-wrap"><span class="search-icon">🔍</span>
          <input type="text" id="tx-search" placeholder="Cari barang / pengguna..." value="${esc(search)}">
        </div>
        <select id="tx-jenis">
          <option value="">Semua Jenis</option>
          <option value="peminjaman"  ${jenis==='peminjaman'?'selected':''}>Peminjaman (Aset)</option>
          <option value="pengambilan" ${jenis==='pengambilan'?'selected':''}>Pengambilan (Consumable)</option>
        </select>
        <select id="tx-status">
          <option value="">Semua Status</option>
          ${Object.entries(TRANS_STATUS_LABEL).map(([v,l])=>`<option value="${v}" ${status===v?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Barang</th><th>Pengguna</th><th>Jenis</th><th>Jml</th><th>Tgl Ambil/Pinjam</th><th>Rencana Kembali</th><th>Tgl Kembali</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
        ${pageRows.length===0?`<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">📋</div><p>Tidak ada transaksi</p></div></td></tr>`:
          pageRows.map(t=>{const a=Store.assetById(t.asetId),u=Store.userById(t.userId);return`<tr>
            <td style="color:var(--gray-400);font-size:11px">#${t.id}</td>
            <td><div class="cell-bold">${esc(a?.namaAset||'Dihapus')}</div>
                <div class="cell-sub">${esc(a?.kodeAset||'')}</div></td>
            <td>${esc(u?.nama||'Dihapus')}</td>
            <td style="font-size:11px;color:${t.jenis==='pengambilan'?'var(--warning)':'var(--primary)'}">${TRANS_JENIS_LABEL[t.jenis]||'-'}</td>
            <td><strong>${t.jumlah||1}</strong></td>
            <td>${fmt(t.tanggalPinjam||t.tanggalAmbil)}</td>
            <td>${t.tanggalRencanaKembali?fmt(t.tanggalRencanaKembali):'<span style="font-size:11px;color:var(--gray-400)">Tidak perlu</span>'}</td>
            <td>${t.tanggalKembali?fmt(t.tanggalKembali):'-'}</td>
            <td>${transBadge(t.status)}</td>
            <td>${(t.status==='aktif'||t.status==='terlambat')&&t.jenis==='peminjaman'
              ?`<button class="btn btn-sm btn-success" onclick="Pages.returnAsset(${t.id})">↩ Kembali</button>`
              :'-'}</td>
          </tr>`;}).join('')}
        </tbody>
      </table>
      ${Pages._pages(page,pages,p=>`Router.go('transactions',{search:'${esc(search)}',status:'${status}',jenis:'${jenis}',page:${p}})`)}
      </div>`;

    let deb;
    $('#tx-search').oninput=function(){clearTimeout(deb);deb=setTimeout(()=>Router.go('transactions',{search:this.value,status,jenis,page:1}),350);};
    $('#tx-jenis').onchange=function(){Router.go('transactions',{search,status,jenis:this.value,page:1});};
    $('#tx-status').onchange=function(){Router.go('transactions',{search,status:this.value,jenis,page:1});};
  },

  returnAsset(txId) {
    Modal.confirm('Konfirmasi Pengembalian','Tandai aset dikembalikan?','Stok akan bertambah dan status selesai.',async()=>{
      loading(true);
      try{
        const tx=Store.transactions.find(t=>t.id===txId); if(!tx) return;
        const updTx=await API.put(`/api/transactions/${txId}`,{status:'selesai',tanggalKembali:today()});
        const txIdx=Store.transactions.findIndex(t=>t.id===txId);
        if(txIdx!==-1) Store.transactions[txIdx]=updTx;

        const a=Store.assetById(tx.asetId);
        if(a){
          const newStok=(a.stok||0)+(tx.jumlah||1);
          const newStatus=['rusak','maintenance','tidak_aktif'].includes(a.status)?a.status:'tersedia';
          const updA=await API.put(`/api/assets/${a.id}`,{...a,stok:newStok,status:newStatus});
          const aIdx=Store.assets.findIndex(x=>x.id===a.id);
          if(aIdx!==-1) Store.assets[aIdx]=updA;
        }
        toast('Aset berhasil dikembalikan ✅');
        Router.go('transactions');
      }catch(e){toast(e.message,'danger');}finally{loading(false);}
    },false);
  },

  // ── REPORTS ───────────────────────────────────────────────────────────────
  reports() {
    const assets=Store.assets, txs=Store.transactions;
    const csm=assets.filter(a=>a.jenis==='consumable');
    const byCategory={};
    CATEGORIES.forEach(c=>{const cat=assets.filter(a=>a.kategori===c);byCategory[c]={total:cat.length,aset:cat.filter(a=>a.jenis!=='consumable').length,consumable:cat.filter(a=>a.jenis==='consumable').length,tersedia:cat.filter(a=>a.stok>0&&!['rusak','maintenance','tidak_aktif'].includes(a.status)).length,rusak:cat.filter(a=>a.status==='rusak').length};});

    const borrow={},uBorrow={};
    txs.forEach(t=>{borrow[t.asetId]=(borrow[t.asetId]||0)+(t.jumlah||1);uBorrow[t.userId]=(uBorrow[t.userId]||0)+1;});
    const topA=Object.entries(borrow).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const topU=Object.entries(uBorrow).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const lowCsm=csm.filter(a=>a.stokMin>0&&a.stok<=a.stokMin&&a.stok>0);
    const habitCsm=csm.filter(a=>a.stok<=0);

    $('#view-reports').innerHTML = `
      <div class="page-header"><div><h3>Laporan & Statistik</h3><p>Per ${fmt(today())}</p></div></div>
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-icon blue">📊</div><div><div class="stat-value">${txs.length}</div><div class="stat-label">Total Transaksi</div></div></div>
        <div class="stat-card"><div class="stat-icon yellow">🔄</div><div><div class="stat-value">${txs.filter(t=>t.status==='aktif').length}</div><div class="stat-label">Dipinjam Aktif</div></div></div>
        <div class="stat-card"><div class="stat-icon red">⏰</div><div><div class="stat-value">${txs.filter(t=>t.status==='terlambat').length}</div><div class="stat-label">Terlambat</div></div></div>
        <div class="stat-card"><div class="stat-icon green">✅</div><div><div class="stat-value">${txs.filter(t=>t.status==='selesai').length}</div><div class="stat-label">Selesai</div></div></div>
      </div>
      ${[...habitCsm,...lowCsm].length?`
      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><span class="card-title">⚠️ Alert Stok Consumable</span></div>
        <div><table><thead><tr><th>Barang</th><th>Stok</th><th>Min</th><th>Kondisi</th></tr></thead><tbody>
        ${[...habitCsm,...lowCsm].map(a=>`<tr>
          <td><div class="cell-bold">${esc(a.namaAset)}</div><div class="cell-sub">${esc(a.kodeAset)}</div></td>
          <td><strong style="color:${a.stok<=0?'var(--danger)':'var(--warning)'}">${a.stok}</strong></td>
          <td>${a.stokMin}</td>
          <td>${a.stok<=0?'<span style="color:var(--danger);font-weight:600">HABIS</span>':'<span style="color:var(--warning);font-weight:600">RENDAH</span>'}</td>
        </tr>`).join('')}
        </tbody></table></div>
      </div>`:''}
      <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px">
        <div class="card">
          <div class="card-header"><span class="card-title">Ringkasan per Kategori</span></div>
          <div><table><thead><tr><th>Kategori</th><th>Total</th><th>Aset</th><th>Consumable</th><th>Tersedia</th><th>Rusak</th></tr></thead><tbody>
          ${Object.entries(byCategory).map(([c,d])=>`<tr><td>${catBadge(c)}</td><td><strong>${d.total}</strong></td><td>${d.aset}</td><td>${d.consumable}</td><td style="color:var(--success)">${d.tersedia}</td><td style="color:var(--danger)">${d.rusak}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <div class="card-header"><span class="card-title">Paling Sering Diambil</span></div>
            <div>${topA.length===0?'<div class="empty-state" style="padding:16px"><p>Belum ada data</p></div>':
              `<table><thead><tr><th>Barang</th><th>Jml</th></tr></thead><tbody>
               ${topA.map(([aid,cnt])=>{const a=Store.assetById(parseInt(aid));return`<tr><td><div class="cell-bold">${esc(a?.namaAset||'Dihapus')}</div><div class="cell-sub">${esc(a?.kodeAset||'')}</div></td><td><strong>${cnt}</strong></td></tr>`;}).join('')}
               </tbody></table>`}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">Pengguna Teraktif</span></div>
            <div>${topU.length===0?'<div class="empty-state" style="padding:16px"><p>Belum ada data</p></div>':
              `<table><thead><tr><th>Pengguna</th><th>Tx</th></tr></thead><tbody>
               ${topU.map(([uid,cnt])=>{const u=Store.userById(parseInt(uid));return`<tr><td>${esc(u?.nama||'Dihapus')}</td><td><strong>${cnt}x</strong></td></tr>`;}).join('')}
               </tbody></table>`}
            </div>
          </div>
        </div>
      </div>`;
  },

  // ── BROWSE ASSETS (user) ──────────────────────────────────────────────────
  browseAssets(params={}) {
    const {search='',cat='',jenis='',page=1}=params;
    const perPage=10;

    let rows=Store.assets.filter(a=>a.stok>0&&!['rusak','tidak_aktif'].includes(a.status));
    if(search){const s=search.toLowerCase();rows=rows.filter(a=>a.namaAset.toLowerCase().includes(s)||a.kodeAset.toLowerCase().includes(s));}
    if(cat)   rows=rows.filter(a=>a.kategori===cat);
    if(jenis) rows=rows.filter(a=>a.jenis===jenis);

    const total=rows.length,pages=Math.max(1,Math.ceil(total/perPage));
    const pageRows=rows.slice((page-1)*perPage,page*perPage);

    $('#view-browse-assets').innerHTML = `
      <div class="page-header"><div><h3>Lihat Barang</h3><p>${total} barang tersedia</p></div></div>
      <div class="filter-bar">
        <div class="search-input-wrap"><span class="search-icon">🔍</span>
          <input type="text" id="ba-search" placeholder="Cari barang..." value="${esc(search)}">
        </div>
        <select id="ba-jenis">
          <option value="">Semua Jenis</option>
          <option value="aset"       ${jenis==='aset'?'selected':''}>📦 Aset</option>
          <option value="consumable" ${jenis==='consumable'?'selected':''}>🔩 Consumable</option>
        </select>
        <select id="ba-cat">
          <option value="">Semua Kategori</option>
          ${CATEGORIES.map(c=>`<option value="${c}" ${cat===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th style="width:44px"></th><th>Kode</th><th>Nama Barang</th><th>Jenis</th><th>Stok</th><th>Lokasi</th><th>Aksi</th></tr></thead>
        <tbody>
        ${pageRows.length===0?`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📦</div><p>Tidak ada barang tersedia</p></div></td></tr>`:
          pageRows.map(a=>`<tr>
            <td>${thumbHtml(a.gambar,a.kategori)}</td>
            <td><span class="asset-code">${esc(a.kodeAset)}</span></td>
            <td><div class="cell-bold">${esc(a.namaAset)}</div>
                <div class="cell-sub">${esc((a.spesifikasi||'').slice(0,50))}</div></td>
            <td>${jenisBadge(a.jenis)}</td>
            <td>${stokChip(a)}</td>
            <td>${esc(a.lokasi||'-')}</td>
            <td><div class="actions">
              <button class="btn btn-sm btn-outline" onclick="Router.go('asset-detail',{id:${a.id}})">👁</button>
              <button class="btn btn-sm btn-primary" onclick="Router.go('borrow-form',{id:${a.id}})">
                ${a.jenis==='consumable'?'📤 Ambil':'📋 Pinjam'}
              </button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${Pages._pages(page,pages,p=>`Router.go('browse-assets',{search:'${esc(search)}',cat:'${cat}',jenis:'${jenis}',page:${p}})`)}
      </div>`;

    let deb;
    $('#ba-search').oninput=function(){clearTimeout(deb);deb=setTimeout(()=>Router.go('browse-assets',{search:this.value,cat,jenis,page:1}),350);};
    $('#ba-jenis').onchange=function(){Router.go('browse-assets',{search,cat,jenis:this.value,page:1});};
    $('#ba-cat').onchange  =function(){Router.go('browse-assets',{search,cat:this.value,jenis,page:1});};
  },

  // ── BORROW / TAKE FORM ────────────────────────────────────────────────────
  borrowForm(params={}) {
    const a=Store.assetById(params.id);
    if (!a){ Router.go('browse-assets'); return; }
    const isC=a.jenis==='consumable';
    const alreadyActive=!isC&&Store.transactions.find(t=>t.userId===Auth.user.id&&t.asetId===a.id&&t.status==='aktif');

    $('#view-borrow-form').innerHTML = `
      <div class="page-header">
        <div><h3>${isC?'📤 Form Pengambilan':'📋 Form Peminjaman'}</h3>
          <p>${isC?'Barang consumable tidak perlu dikembalikan':'Isi tanggal rencana pengembalian'}</p></div>
        <button class="btn btn-outline" onclick="Router.go('browse-assets')">← Kembali</button>
      </div>
      ${alreadyActive?`<div class="alert alert-warning">⚠️ Anda masih memiliki peminjaman aktif untuk aset ini.</div>`:''}
      <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:20px;align-items:start">
        <div class="card"><div class="card-header"><span class="card-title">Informasi Barang</span></div>
        <div class="card-body">
          ${a.gambar?`<img src="${a.gambar}" class="detail-img" style="margin-bottom:14px" alt="foto">`:`<div class="detail-img-ph" style="height:110px;margin-bottom:14px">${CAT_ICON[a.kategori]||'📦'}</div>`}
          <div class="info-list">
            <div class="info-row"><span class="info-key">Kode</span>    <span class="info-val"><span class="asset-code">${esc(a.kodeAset)}</span></span></div>
            <div class="info-row"><span class="info-key">Nama</span>    <span class="info-val"><strong>${esc(a.namaAset)}</strong></span></div>
            <div class="info-row"><span class="info-key">Jenis</span>   <span class="info-val">${jenisBadge(a.jenis)}</span></div>
            <div class="info-row"><span class="info-key">Lokasi</span>  <span class="info-val">${esc(a.lokasi||'-')}</span></div>
            <div class="info-row"><span class="info-key">Stok</span>
              <span class="info-val" style="font-size:22px;font-weight:700;color:var(--success)">${a.stok}
                <span style="font-size:12px;font-weight:400;color:var(--gray-500)">unit</span></span></div>
            ${a.spesifikasi?`<div class="info-row"><span class="info-key">Spesifikasi</span><span class="info-val">${esc(a.spesifikasi)}</span></div>`:''}
          </div>
        </div></div>

        <div class="card"><div class="card-header"><span class="card-title">${isC?'Data Pengambilan':'Data Peminjaman'}</span></div>
        <div class="card-body">
          <form id="bf" onsubmit="Pages.submitBorrow(event,${a.id})">
            <div class="form-group" style="margin-bottom:14px">
              <label>Peminjam / Pengambil</label>
              <input type="text" value="${esc(Auth.user.nama)}" readonly style="background:var(--gray-50)">
            </div>
            ${isC?`
            <div class="form-group" style="margin-bottom:14px">
              <label class="required">Jumlah yang Diambil</label>
              <div class="qty-stepper">
                <button type="button" onclick="Pages.qtyStep(-1)">−</button>
                <input type="number" id="bf-jumlah" value="1" min="1" max="${a.stok}" required oninput="Pages.qtyClamp(${a.stok})">
                <button type="button" onclick="Pages.qtyStep(1,${a.stok})">+</button>
                <span style="font-size:12px;color:var(--gray-500)">maks: ${a.stok}</span>
              </div>
            </div>`:`<input type="hidden" id="bf-jumlah" value="1">`}
            <div class="form-group" style="margin-bottom:14px">
              <label class="required">Tanggal ${isC?'Pengambilan':'Pinjam'}</label>
              <input type="date" id="bf-tgl-pinjam" value="${today()}" required>
            </div>
            ${!isC?`
            <div class="form-group" style="margin-bottom:14px">
              <label class="required">Rencana Tanggal Kembali</label>
              <input type="date" id="bf-tgl-kembali" required min="${today()}">
            </div>`:`<div class="alert alert-info" style="margin-bottom:14px">ℹ️ Consumable <strong>tidak perlu dikembalikan</strong>. Stok langsung berkurang.</div>`}
            <div class="form-group" style="margin-bottom:14px">
              <label class="required">Keperluan / Tujuan</label>
              <textarea id="bf-keperluan" required placeholder="${isC?'cth: Untuk instalasi jaringan di lantai 3':'cth: Testing konfigurasi server baru'}"></textarea>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label>Keterangan Tambahan</label>
              <textarea id="bf-ket" placeholder="Opsional..."></textarea>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-outline" onclick="Router.go('browse-assets')">Batal</button>
              <button type="submit" class="btn btn-primary" id="bf-submit" ${alreadyActive?'disabled':''}>
                ${isC?'📤 Konfirmasi Pengambilan':'📋 Ajukan Peminjaman'}
              </button>
            </div>
          </form>
        </div></div>
      </div>`;
  },

  qtyStep(delta, max) {
    const inp=$('#bf-jumlah'); if(!inp) return;
    inp.value=Math.max(1,Math.min(max||9999,(parseInt(inp.value)||1)+delta));
  },
  qtyClamp(max) {
    const inp=$('#bf-jumlah'); if(!inp) return;
    inp.value=Math.max(1,Math.min(max,parseInt(inp.value)||1));
  },

  async submitBorrow(e, asetId) {
    e.preventDefault();
    const a=Store.assetById(asetId); if(!a){toast('Barang tidak ditemukan','danger');return;}
    const isC=a.jenis==='consumable';
    const jumlah=parseInt($('#bf-jumlah')?.value)||1;
    const tglPinjam=$('#bf-tgl-pinjam').value;
    const tglKembali=!isC?$('#bf-tgl-kembali')?.value:null;
    const keperluan=$('#bf-keperluan').value.trim();
    const ket=$('#bf-ket').value.trim();

    if(jumlah<1||jumlah>a.stok){toast(`Stok tidak mencukupi (tersedia: ${a.stok})`,'danger');return;}
    if(!isC&&(!tglKembali||tglKembali<=tglPinjam)){toast('Tanggal kembali harus setelah tanggal pinjam!','warning');return;}

    const btn=$('#bf-submit'); if(btn) btn.disabled=true;
    loading(true);
    try{
      const txData={
        asetId, userId:Auth.user.id,
        jenis: isC?'pengambilan':'peminjaman',
        jumlah,
        tanggalPinjam: tglPinjam,
        tanggalAmbil:  isC?tglPinjam:null,
        tanggalRencanaKembali: isC?null:tglKembali,
        tanggalKembali: isC?tglPinjam:null,
        keperluan, keterangan:ket,
        status: isC?'selesai':'aktif',
      };
      const tx=await API.post('/api/transactions',txData);
      Store.transactions.push(tx);

      const newStok=(a.stok||0)-jumlah;
      const newStatus=['rusak','maintenance','tidak_aktif'].includes(a.status)?a.status:(isC?(newStok<=0?'habis':'tersedia'):(newStok<=0?'dipinjam':'tersedia'));
      const updA=await API.put(`/api/assets/${asetId}`,{...a,stok:newStok,status:newStatus});
      const aIdx=Store.assets.findIndex(x=>x.id===asetId);
      if(aIdx!==-1) Store.assets[aIdx]=updA;

      toast(isC?`✅ ${jumlah} unit berhasil diambil! Stok berkurang.`:'✅ Peminjaman berhasil dicatat!');
      Router.go('my-transactions');
    }catch(err){toast(err.message,'danger');if(btn)btn.disabled=false;}
    finally{loading(false);}
  },

  // ── MY TRANSACTIONS ───────────────────────────────────────────────────────
  myTransactions(params={}) {
    const {page=1}=params, perPage=10;
    const myTxs=[...Store.transactions.filter(t=>t.userId===Auth.user.id)].sort((a,b)=>b.id-a.id);
    const pages=Math.max(1,Math.ceil(myTxs.length/perPage));
    const pageRows=myTxs.slice((page-1)*perPage,page*perPage);

    $('#view-my-transactions').innerHTML = `
      <div class="page-header">
        <div><h3>Riwayat Transaksi Saya</h3><p>${myTxs.length} total transaksi</p></div>
        <button class="btn btn-primary" onclick="Router.go('browse-assets')">+ Ambil / Pinjam</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th style="width:44px"></th><th>Barang</th><th>Jenis</th><th>Jml</th><th>Tanggal</th><th>Rencana Kembali</th><th>Keperluan</th><th>Status</th></tr></thead>
        <tbody>
        ${pageRows.length===0?`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><p>Belum ada transaksi</p></div></td></tr>`:
          pageRows.map(t=>{
            const a=Store.assetById(t.asetId);
            const isLate=t.status==='aktif'&&t.tanggalRencanaKembali&&t.tanggalRencanaKembali<today();
            return`<tr>
              <td>${thumbHtml(a?.gambar,a?.kategori)}</td>
              <td><div class="cell-bold">${esc(a?.namaAset||'Barang dihapus')}</div>
                  <div class="cell-sub">${esc(a?.kodeAset||'')}</div></td>
              <td style="font-size:11px;color:${t.jenis==='pengambilan'?'var(--warning)':'var(--primary)'}">${TRANS_JENIS_LABEL[t.jenis]||'-'}</td>
              <td><strong>${t.jumlah||1}</strong></td>
              <td>${fmt(t.tanggalPinjam||t.tanggalAmbil)}</td>
              <td>${t.tanggalRencanaKembali?fmt(t.tanggalRencanaKembali):'<span style="font-size:11px;color:var(--gray-400)">Tidak perlu</span>'}</td>
              <td style="max-width:160px;font-size:12px;color:var(--gray-600)">${esc((t.keperluan||'').slice(0,60))}</td>
              <td>${transBadge(isLate?'terlambat':t.status)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${Pages._pages(page,pages,p=>`Router.go('my-transactions',{page:${p}})`)}
      </div>`;
  },

  // ── Pagination ─────────────────────────────────────────────────────────────
  _pages(cur, total, fn) {
    if (total<=1) return '';
    let h='<div class="pagination">';
    h+=`<button onclick="${fn(Math.max(1,cur-1))}" ${cur===1?'disabled':''}>‹</button>`;
    for(let p=1;p<=total;p++){
      if(p===1||p===total||Math.abs(p-cur)<=1) h+=`<button class="${p===cur?'active':''}" onclick="${fn(p)}">${p}</button>`;
      else if(Math.abs(p-cur)===2) h+=`<button disabled>…</button>`;
    }
    h+=`<button onclick="${fn(Math.min(total,cur+1))}" ${cur===total?'disabled':''}>›</button>`;
    return h+'</div>';
  },
};

// ── Sidebar nav ───────────────────────────────────────────────────────────────
function buildNav() {
  const adminNav=[
    {section:'UTAMA'},{view:'dashboard',icon:'🏠',label:'Dashboard'},
    {section:'INVENTARIS'},{view:'assets',icon:'📦',label:'Manajemen Barang'},
    {section:'PENGGUNA'},{view:'users',icon:'👥',label:'Manajemen Pengguna'},
    {section:'LAPORAN'},{view:'transactions',icon:'📋',label:'Histori Transaksi'},{view:'reports',icon:'📊',label:'Laporan & Statistik'},
  ];
  const userNav=[
    {section:'UTAMA'},{view:'dashboard',icon:'🏠',label:'Dashboard'},
    {section:'INVENTARIS'},{view:'browse-assets',icon:'🔍',label:'Lihat Barang'},{view:'my-transactions',icon:'📋',label:'Riwayat Saya'},
  ];
  const nav=Auth.isAdmin()?adminNav:userNav;
  $('#sidebar-nav').innerHTML=nav.map(item=>{
    if(item.section) return`<div class="nav-section-label">${item.section}</div>`;
    return`<div class="nav-item" data-view="${item.view}" onclick="Router.go('${item.view}')"><span class="nav-icon">${item.icon}</span><span>${item.label}</span></div>`;
  }).join('');
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function updateClock() {
  const now=new Date(), el=$('#topbar-datetime');
  if(el) el.innerHTML=`${now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}<br><span style="font-size:10px">${now.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>`;
}

// ── App init ──────────────────────────────────────────────────────────────────
function showApp() {
  const u=Auth.user;
  $('#app').classList.remove('hidden');
  $('#sidebar-name').textContent=$('#topbar-username').textContent=u.nama;
  $('#sidebar-role').textContent=u.role==='admin'?'Administrator':'Pengambil Barang';
  $('#sidebar-avatar').textContent=$('#topbar-avatar').textContent=initials(u.nama);
  buildNav();
  setInterval(updateClock,1000);
  updateClock();
  Router.go('dashboard');
}

function goLogin(msg='') {
  Auth.logout();
  if (msg) sessionStorage.setItem('sinta_login_msg', msg);
  window.location.href = '/login';
}

// ── Event Listeners ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  // Logout
  $('#logout-btn').addEventListener('click', () => {
    Modal.confirm('Konfirmasi Keluar','Apakah Anda yakin ingin keluar?','Sesi Anda akan diakhiri.',
      () => goLogin(), false);
  });

  // Modal close
  $('#modal-close').addEventListener('click', Modal.hide.bind(Modal));
  $('#modal-overlay').addEventListener('click', e => { if(e.target===$('#modal-overlay')) Modal.hide(); });

  // Cek sesi — jika tidak ada, redirect ke login
  if (!Auth.restore()) {
    window.location.href = '/login';
    return;
  }

  loading(true);
  try {
    await Store.load();
    loading(false);
    showApp();
  } catch(err) {
    loading(false);
    goLogin('Sesi berakhir, silakan login kembali');
  }
});
