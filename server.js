'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));  // besar karena gambar base64
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ─────────────────────────────────────────────────────────────────
function dataFile(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readDB(name) {
  try {
    const raw = fs.readFileSync(dataFile(name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeDB(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(dataFile(name), JSON.stringify(data, null, 2), 'utf8');
}

function nextId(items) {
  return items.length ? Math.max(0, ...items.map(i => i.id || 0)) + 1 : 1;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Seed data awal ──────────────────────────────────────────────────────────
function seed() {
  if (readDB('users').length > 0) return;

  console.log('🌱 Membuat data awal...');

  writeDB('users', [
    { id:1, username:'admin',  password:'admin123', nama:'Administrator',     email:'admin@sinta.local',  role:'admin',    aktif:true, createdAt:'2024-01-01' },
    { id:2, username:'budi',   password:'user123',  nama:'Budi Santoso',      email:'budi@sinta.local',   role:'pengambil',aktif:true, createdAt:'2024-01-01' },
    { id:3, username:'sari',   password:'user123',  nama:'Sari Dewi Pratiwi', email:'sari@sinta.local',   role:'pengambil',aktif:true, createdAt:'2024-01-15' },
    { id:4, username:'rahman', password:'user123',  nama:'Ahmad Rahman',      email:'rahman@sinta.local', role:'pengambil',aktif:true, createdAt:'2024-02-01' },
  ]);

  writeDB('assets', [
    // ── SERVER (aset) ──────────────────────────────────────────────────────
    { id:1,  kodeAset:'SRV-001', namaAset:'Server Dell PowerEdge R740',        jenis:'aset', kategori:'Server',    merk:'Dell',     model:'PowerEdge R740',      serialNumber:'SN-DELL-001', lokasi:'Server Room A - Rack 1', status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-03-15', spesifikasi:'2x Intel Xeon Gold 6226R, 64GB DDR4, 4x 2TB SAS RAID-5', keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:2,  kodeAset:'SRV-002', namaAset:'Server HP ProLiant DL380 Gen10',    jenis:'aset', kategori:'Server',    merk:'HP',       model:'ProLiant DL380 G10',  serialNumber:'SN-HP-001',   lokasi:'Server Room A - Rack 2', status:'dipinjam',    kondisi:'baik',       tanggalPengadaan:'2022-06-20', spesifikasi:'2x Intel Xeon Silver 4210, 32GB DDR4, 2x 1TB SSD',      keterangan:'',                        stok:0, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:3,  kodeAset:'SRV-003', namaAset:'Server Lenovo ThinkSystem SR650',   jenis:'aset', kategori:'Server',    merk:'Lenovo',   model:'ThinkSystem SR650',   serialNumber:'SN-LNV-001',  lokasi:'Server Room B - Rack 1', status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2023-01-10', spesifikasi:'2x Xeon Gold 5218, 128GB DDR4, 8x 1TB HDD RAID-6',     keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:4,  kodeAset:'SRV-004', namaAset:'Server Cisco UCS C240 M5',          jenis:'aset', kategori:'Server',    merk:'Cisco',    model:'UCS C240 M5',         serialNumber:'SN-CSC-001',  lokasi:'Server Room B - Rack 2', status:'maintenance', kondisi:'kurang_baik', tanggalPengadaan:'2021-08-05', spesifikasi:'2x Xeon Gold 6130, 64GB DDR4, 24x 1.2TB SAS',           keterangan:'Dalam perbaikan RAM slot', stok:0, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:5,  kodeAset:'SRV-005', namaAset:'Server IBM System x3650 M5',        jenis:'aset', kategori:'Server',    merk:'IBM',      model:'System x3650 M5',     serialNumber:'SN-IBM-001',  lokasi:'Server Room A - Rack 3', status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2021-05-20', spesifikasi:'2x Xeon E5-2620 v4, 32GB DDR4, 4x 600GB SAS',           keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    // ── NETWORK (aset) ─────────────────────────────────────────────────────
    { id:6,  kodeAset:'NET-001', namaAset:'Router Cisco ASR 1001-X',           jenis:'aset', kategori:'Network',   merk:'Cisco',    model:'ASR 1001-X',          serialNumber:'SN-CSC-R01',  lokasi:'Network Rack - Lt.1',    status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-11-01', spesifikasi:'10G Ports, 2x 10GE SFP+, Advanced Security',            keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:7,  kodeAset:'NET-002', namaAset:'Switch Cisco Catalyst 9300-48P',    jenis:'aset', kategori:'Network',   merk:'Cisco',    model:'Catalyst 9300-48P',   serialNumber:'SN-CSC-S01',  lokasi:'Network Rack - Lt.1',    status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-11-01', spesifikasi:'48x PoE+ Ports, 4x 1G SFP Uplinks, StackPower',         keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:8,  kodeAset:'NET-003', namaAset:'Switch HP Aruba 2530-48G',          jenis:'aset', kategori:'Network',   merk:'HP',       model:'Aruba 2530-48G',      serialNumber:'SN-HP-S01',   lokasi:'Network Rack - Lt.2',    status:'dipinjam',    kondisi:'baik',       tanggalPengadaan:'2021-09-15', spesifikasi:'48x 10/100/1000 Ports, 4x Dual Personality Ports',       keterangan:'',                        stok:0, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:9,  kodeAset:'NET-004', namaAset:'Firewall Fortinet FortiGate 100F',  jenis:'aset', kategori:'Network',   merk:'Fortinet', model:'FortiGate 100F',      serialNumber:'SN-FTN-001',  lokasi:'Network Rack - Lt.1',    status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2023-03-10', spesifikasi:'10 Gbps Firewall, SSL Inspection, Threat Protection',   keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:10, kodeAset:'NET-005', namaAset:'Access Point Ubiquiti UniFi AC Pro', jenis:'aset', kategori:'Network',  merk:'Ubiquiti', model:'UniFi AP AC Pro',     serialNumber:'SN-UBQ-001',  lokasi:'Lantai 1 - Lobby',       status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2023-01-20', spesifikasi:'802.11ac, 2.4GHz 450Mbps & 5GHz 1300Mbps, PoE',        keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:11, kodeAset:'NET-006', namaAset:'Router MikroTik RB1100AHx4',        jenis:'aset', kategori:'Network',   merk:'MikroTik', model:'RB1100AHx4',          serialNumber:'SN-MTK-001',  lokasi:'Network Rack - Lt.3',    status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2021-07-12', spesifikasi:'13x Gigabit Ethernet, RouterOS Level 6',                keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:12, kodeAset:'NET-007', namaAset:'Switch Juniper EX4300-48T',         jenis:'aset', kategori:'Network',   merk:'Juniper',  model:'EX4300-48T',          serialNumber:'SN-JNP-001',  lokasi:'Network Rack - Lt.2',    status:'rusak',       kondisi:'rusak',      tanggalPengadaan:'2020-04-05', spesifikasi:'48x 1GbE, 4x 10GbE SFP+ Uplinks',                      keterangan:'Port SFP+ rusak',         stok:0, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:13, kodeAset:'NET-008', namaAset:'Firewall Palo Alto PA-220',         jenis:'aset', kategori:'Network',   merk:'Palo Alto',model:'PA-220',              serialNumber:'SN-PAL-001',  lokasi:'Network Rack - Lt.1',    status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-08-30', spesifikasi:'500 Mbps Firewall, WildFire Threat Prevention',          keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:14, kodeAset:'NET-009', namaAset:'Access Point Cisco AIR-AP3802I',    jenis:'aset', kategori:'Network',   merk:'Cisco',    model:'AIR-AP3802I',         serialNumber:'SN-CSC-AP1',  lokasi:'Lantai 2 - Meeting Room',status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2021-11-08', spesifikasi:'802.11ac Wave 2, 4x4 MIMO, 2.5Gbps Throughput',         keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    // ── COMPUTING (aset) ───────────────────────────────────────────────────
    { id:15, kodeAset:'CMP-001', namaAset:'Laptop Dell Latitude 5420',         jenis:'aset', kategori:'Computing', merk:'Dell',     model:'Latitude 5420',       serialNumber:'SN-DLL-L01',  lokasi:'Gudang IT',              status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2023-02-14', spesifikasi:'Intel i7-1185G7, 16GB RAM, 512GB NVMe, 14 inch FHD',   keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:16, kodeAset:'CMP-002', namaAset:'Laptop HP EliteBook 840 G8',        jenis:'aset', kategori:'Computing', merk:'HP',       model:'EliteBook 840 G8',    serialNumber:'SN-HP-L01',   lokasi:'Gudang IT',              status:'dipinjam',    kondisi:'baik',       tanggalPengadaan:'2023-04-20', spesifikasi:'Intel i5-1135G7, 8GB RAM, 256GB SSD, 14 inch FHD',     keterangan:'',                        stok:0, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:17, kodeAset:'CMP-003', namaAset:'Workstation Dell Precision 7920',   jenis:'aset', kategori:'Computing', merk:'Dell',     model:'Precision 7920',      serialNumber:'SN-DLL-W01',  lokasi:'Ruang Engineer',         status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-10-01', spesifikasi:'2x Xeon Gold 5218, 64GB ECC, NVIDIA Quadro RTX 4000',   keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    // ── STORAGE ────────────────────────────────────────────────────────────
    { id:18, kodeAset:'STR-001', namaAset:'NAS Synology DS3617xs',             jenis:'aset', kategori:'Storage',   merk:'Synology', model:'DS3617xs',            serialNumber:'SN-SYN-001',  lokasi:'Server Room A',          status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-05-10', spesifikasi:'12-Bay NAS, Xeon D-1527, 16GB ECC, DSM 7.2',           keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    // ── UPS ────────────────────────────────────────────────────────────────
    { id:19, kodeAset:'UPS-001', namaAset:'UPS APC Smart-UPS 3000VA',          jenis:'aset', kategori:'UPS/Power', merk:'APC',      model:'Smart-UPS 3000VA',    serialNumber:'SN-APC-001',  lokasi:'Server Room A',          status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2021-12-01', spesifikasi:'3000VA/2700W, 230V, USB & RS232 Management',            keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:20, kodeAset:'UPS-002', namaAset:'UPS Eaton 9PX 3000i',               jenis:'aset', kategori:'UPS/Power', merk:'Eaton',    model:'9PX 3000i',           serialNumber:'SN-ETN-001',  lokasi:'Server Room B',          status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-07-15', spesifikasi:'3000VA/2700W, Network Management Card',                 keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    // ── CONSUMABLE: Network ────────────────────────────────────────────────
    { id:21, kodeAset:'NET-010', namaAset:'Konektor RJ45 Cat6',                jenis:'consumable', kategori:'Network',   merk:'Belden',  model:'Cat6 RJ45 Unshielded', serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2024-01-05', spesifikasi:'RJ45 Unshielded, Category 6, 250MHz, Gold Plated',   keterangan:'Per biji',    stok:320, stokMin:50,  gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:22, kodeAset:'NET-011', namaAset:'Patch Cable Cat6 0.5m',             jenis:'consumable', kategori:'Network',   merk:'Belden',  model:'Cat6 Patch 0.5m',      serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2024-01-05', spesifikasi:'UTP Cat6, 0.5m, RJ45-RJ45, berbagai warna',          keterangan:'Per pcs',     stok:45,  stokMin:10,  gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:23, kodeAset:'NET-012', namaAset:'Patch Cable Cat6 2m',               jenis:'consumable', kategori:'Network',   merk:'Belden',  model:'Cat6 Patch 2m',        serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2024-01-05', spesifikasi:'UTP Cat6, 2m, RJ45-RJ45',                            keterangan:'Per pcs',     stok:28,  stokMin:5,   gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:24, kodeAset:'NET-013', namaAset:'Kabel UTP Cat6 Box 305m',           jenis:'consumable', kategori:'Network',   merk:'Belden',  model:'1583A Cat6',           serialNumber:'', lokasi:'Gudang IT - Rak Besar',      status:'tersedia', kondisi:'baik', tanggalPengadaan:'2024-01-10', spesifikasi:'UTP Cat6, 305m/box, 23 AWG, 4-pair',                 keterangan:'Per box',     stok:3,   stokMin:1,   gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:25, kodeAset:'NET-014', namaAset:'SFP Module 1GbE LC SX',             jenis:'consumable', kategori:'Network',   merk:'Cisco',   model:'GLC-SX-MMD',           serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2023-09-01', spesifikasi:'1000BASE-SX SFP, LC, 550m, Multi-mode',              keterangan:'Per pcs',     stok:8,   stokMin:2,   gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    // ── CONSUMABLE: Peripheral ─────────────────────────────────────────────
    { id:26, kodeAset:'PER-001', namaAset:'Flash Drive USB 32GB',              jenis:'consumable', kategori:'Peripheral',merk:'SanDisk', model:'Cruzer Blade 32GB',    serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2024-02-01', spesifikasi:'USB 3.0, 32GB, Read 100MB/s',                        keterangan:'Per pcs',     stok:15,  stokMin:5,   gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:27, kodeAset:'PER-002', namaAset:'Thermal Paste Arctic MX-4',         jenis:'consumable', kategori:'Peripheral',merk:'Arctic',  model:'MX-4',                 serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2023-11-15', spesifikasi:'4g tube, Thermal conductivity 8.5 W/(m·K)',           keterangan:'Per tube',    stok:5,   stokMin:2,   gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:28, kodeAset:'PER-003', namaAset:'Cable Tie Klem Kabel 20cm',         jenis:'consumable', kategori:'Peripheral',merk:'OEM',     model:'Cable Tie 20cm',       serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2023-12-01', spesifikasi:'Nylon 66, 20cm x 2.5mm, Max 8kg',                    keterangan:'Per 100 pcs', stok:800, stokMin:100, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:29, kodeAset:'PER-004', namaAset:'Label Printer Tape 12mm',           jenis:'consumable', kategori:'Peripheral',merk:'Brother', model:'TZe-231',              serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2024-01-20', spesifikasi:'TZe tape 12mm, Hitam di Putih, 8m/roll',             keterangan:'Per roll',    stok:6,   stokMin:2,   gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
  ]);

  writeDB('transactions', [
    { id:1, asetId:2,  userId:2, jenis:'peminjaman',  jumlah:1,  tanggalPinjam:'2024-06-01', tanggalAmbil:null,         tanggalRencanaKembali:'2024-06-15', tanggalKembali:null,         keperluan:'Testing konfigurasi server baru untuk project migrasi', keterangan:'', status:'aktif',   createdAt:'2024-06-01' },
    { id:2, asetId:8,  userId:3, jenis:'peminjaman',  jumlah:1,  tanggalPinjam:'2024-06-05', tanggalAmbil:null,         tanggalRencanaKembali:'2024-06-12', tanggalKembali:null,         keperluan:'Konfigurasi VLAN untuk lantai 2', keterangan:'', status:'aktif',   createdAt:'2024-06-05' },
    { id:3, asetId:16, userId:4, jenis:'peminjaman',  jumlah:1,  tanggalPinjam:'2024-06-08', tanggalAmbil:null,         tanggalRencanaKembali:'2024-06-18', tanggalKembali:null,         keperluan:'Presentasi ke klien di luar kantor', keterangan:'', status:'aktif',   createdAt:'2024-06-08' },
    { id:4, asetId:15, userId:2, jenis:'peminjaman',  jumlah:1,  tanggalPinjam:'2024-05-10', tanggalAmbil:null,         tanggalRencanaKembali:'2024-05-17', tanggalKembali:'2024-05-16', keperluan:'Instalasi software di site client', keterangan:'', status:'selesai', createdAt:'2024-05-10' },
    { id:5, asetId:6,  userId:3, jenis:'peminjaman',  jumlah:1,  tanggalPinjam:'2024-05-20', tanggalAmbil:null,         tanggalRencanaKembali:'2024-05-27', tanggalKembali:'2024-05-26', keperluan:'Penggantian router backup', keterangan:'', status:'selesai', createdAt:'2024-05-20' },
    { id:6, asetId:21, userId:2, jenis:'pengambilan', jumlah:20, tanggalPinjam:'2024-06-10', tanggalAmbil:'2024-06-10', tanggalRencanaKembali:null,          tanggalKembali:'2024-06-10', keperluan:'Instalasi jaringan lantai 3 - 20 titik', keterangan:'', status:'selesai', createdAt:'2024-06-10' },
    { id:7, asetId:22, userId:4, jenis:'pengambilan', jumlah:5,  tanggalPinjam:'2024-06-11', tanggalAmbil:'2024-06-11', tanggalRencanaKembali:null,          tanggalKembali:'2024-06-11', keperluan:'Koneksi patch panel rack server room', keterangan:'', status:'selesai', createdAt:'2024-06-11' },
    { id:8, asetId:26, userId:3, jenis:'pengambilan', jumlah:2,  tanggalPinjam:'2024-06-12', tanggalAmbil:'2024-06-12', tanggalRencanaKembali:null,          tanggalKembali:'2024-06-12', keperluan:'Backup data migrasi server', keterangan:'', status:'selesai', createdAt:'2024-06-12' },
  ]);

  console.log('✅ Data awal selesai dibuat (29 barang, 4 pengguna)');
}

seed();

// ── API Routes ───────────────────────────────────────────────────────────────

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const users = readDB('users');
  const user  = users.find(u => u.username === username && u.password === password && u.aktif);
  if (!user) return res.status(401).json({ error: 'Username atau password salah' });
  const { password: _pw, ...safe } = user;
  res.json(safe);
});

// Users
app.get('/api/users', (_req, res) => {
  const users = readDB('users').map(({ password: _pw, ...u }) => u);
  res.json(users);
});

app.post('/api/users', (req, res) => {
  const users = readDB('users');
  if (users.find(u => u.username === req.body.username)) {
    return res.status(400).json({ error: 'Username sudah digunakan' });
  }
  const user = { id: nextId(users), ...req.body, createdAt: todayStr() };
  users.push(user);
  writeDB('users', users);
  const { password: _pw, ...safe } = user;
  res.status(201).json(safe);
});

app.put('/api/users/:id', (req, res) => {
  const id    = parseInt(req.params.id);
  const users = readDB('users');
  const idx   = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
  const updated = { ...users[idx], ...req.body };
  if (!req.body.password) updated.password = users[idx].password; // keep old pw if not changed
  users[idx] = updated;
  writeDB('users', users);
  const { password: _pw, ...safe } = updated;
  res.json(safe);
});

app.delete('/api/users/:id', (req, res) => {
  const id  = parseInt(req.params.id);
  const arr = readDB('users');
  const fil = arr.filter(u => u.id !== id);
  if (fil.length === arr.length) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
  writeDB('users', fil);
  res.json({ ok: true });
});

// Assets
app.get('/api/assets', (_req, res) => res.json(readDB('assets')));

app.post('/api/assets', (req, res) => {
  const assets = readDB('assets');
  if (assets.find(a => a.kodeAset === req.body.kodeAset)) {
    return res.status(400).json({ error: 'Kode barang sudah digunakan' });
  }
  const asset = { id: nextId(assets), ...req.body, createdAt: todayStr(), updatedAt: todayStr() };
  assets.push(asset);
  writeDB('assets', assets);
  res.status(201).json(asset);
});

app.put('/api/assets/:id', (req, res) => {
  const id     = parseInt(req.params.id);
  const assets = readDB('assets');
  const idx    = assets.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Barang tidak ditemukan' });
  assets[idx] = { ...assets[idx], ...req.body, updatedAt: todayStr() };
  writeDB('assets', assets);
  res.json(assets[idx]);
});

app.delete('/api/assets/:id', (req, res) => {
  const id  = parseInt(req.params.id);
  const arr = readDB('assets');
  const fil = arr.filter(a => a.id !== id);
  if (fil.length === arr.length) return res.status(404).json({ error: 'Barang tidak ditemukan' });
  writeDB('assets', fil);
  res.json({ ok: true });
});

// Transactions
app.get('/api/transactions', (_req, res) => res.json(readDB('transactions')));

app.post('/api/transactions', (req, res) => {
  const txs = readDB('transactions');
  const tx  = { id: nextId(txs), ...req.body, createdAt: todayStr() };
  txs.push(tx);
  writeDB('transactions', txs);
  res.status(201).json(tx);
});

app.put('/api/transactions/:id', (req, res) => {
  const id  = parseInt(req.params.id);
  const txs = readDB('transactions');
  const idx = txs.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
  txs[idx] = { ...txs[idx], ...req.body };
  writeDB('transactions', txs);
  res.json(txs[idx]);
});

// ── HTML page routes ─────────────────────────────────────────────────────────
app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🖥️  SINTA berjalan di  http://localhost:${PORT}`);
  console.log(`📁  Data tersimpan di  ${DATA_DIR}\n`);
});
