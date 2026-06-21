'use strict';

require('dotenv').config();

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const http     = require('http');
const https    = require('https');
const session  = require('express-session');
const { Issuer, generators } = require('openid-client');

// POST ke Keycloak tanpa redirect browser (back-channel)
function kcPost(urlStr, params) {
  return new Promise((resolve) => {
    const u    = new URL(urlStr);
    const lib  = u.protocol === 'https:' ? https : http;
    const body = new URLSearchParams(params).toString();
    const req  = lib.request({
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.resume(); resolve(); });
    req.on('error', resolve);
    req.write(body);
    req.end();
  });
}

const app      = express();
const PORT     = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

const KC_URL     = process.env.KEYCLOAK_URL            || 'http://10.16.1.224:8080';
const KC_REALM   = process.env.KEYCLOAK_REALM          || 'sinta';
const KC_CLIENT  = process.env.KEYCLOAK_CLIENT_ID      || 'sinta-app';
const KC_SECRET  = process.env.KEYCLOAK_CLIENT_SECRET  || '';
const APP_URL    = process.env.APP_URL                 || `http://localhost:${PORT}`;
const SES_SECRET = process.env.SESSION_SECRET          || 'sinta-default-secret';

let oidcClient;

async function initOIDC() {
  const issuer = await Issuer.discover(`${KC_URL}/realms/${KC_REALM}`);
  oidcClient = new issuer.Client({
    client_id:      KC_CLIENT,
    client_secret:  KC_SECRET,
    redirect_uris:  [`${APP_URL}/auth/callback`],
    response_types: ['code'],
  });
  console.log(`✅ Keycloak terhubung → realm: ${KC_REALM}`);
}

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));
app.use(session({
  secret:            SES_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }, // 8 jam
}));

// ── Auth helpers ─────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.redirect('/login');
}

function requireAuthApi(req, res, next) {
  if (req.session?.user) return next();
  res.status(401).json({ error: 'Tidak terautentikasi' });
}

// ── Auth routes ───────────────────────────────────────────────────────────────
app.get('/auth/login', (req, res) => {
  const state = generators.state();
  req.session.oidcState = state;

  const url = oidcClient.authorizationUrl({
    scope: 'openid profile email',
    state,
  });

  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const params   = oidcClient.callbackParams(req);
    const tokenSet = await oidcClient.callback(
      `${APP_URL}/auth/callback`,
      params,
      { state: req.session.oidcState }
    );

    const claims = tokenSet.claims();

    // Roles ada di access token, bukan ID token — decode manual
    const accessClaims = JSON.parse(
      Buffer.from(tokenSet.access_token.split('.')[1], 'base64url').toString('utf8')
    );

    const username = accessClaims.preferred_username || claims.preferred_username || claims.sub;
    const name     = accessClaims.name  || claims.name  || username;
    const email    = accessClaims.email || claims.email || '';

    // Baca roles dari access token
    const realmRoles  = accessClaims.realm_access?.roles           || [];
    const clientRoles = accessClaims.resource_access?.[KC_CLIENT]?.roles || [];
    const allRoles    = [...realmRoles, ...clientRoles];
    const kcRole      = allRoles.includes('admin') ? 'admin' : allRoles.includes('user') ? 'pengambil' : null;

    console.log(`✅ Login: ${username} | roles dari Keycloak: [${allRoles.join(', ')}] → SINTA role: ${kcRole || '(pakai DB)'}`);

    // Cari atau buat user di DB lokal
    const users = readDB('users');
    let user = users.find(u => u.username === username);
    if (!user) {
      // User baru — role wajib ada di Keycloak
      const role = kcRole || 'pengambil';
      user = { id: nextId(users), username, nama: name, email, role, aktif: true, createdAt: todayStr() };
      users.push(user);
      writeDB('users', users);
    } else if (kcRole && user.role !== kcRole) {
      // Sinkronisasi role hanya jika Keycloak memberikan role yang valid
      user.role = kcRole;
      const idx = users.findIndex(u => u.username === username);
      users[idx] = user;
      writeDB('users', users);
    }

    req.session.user         = { ...user };
    req.session.refreshToken = tokenSet.refresh_token;
    delete req.session.oidcState;
    res.redirect('/');
  } catch (err) {
    console.error('Keycloak callback error:', err.message);
    res.redirect('/login?error=1');
  }
});

app.get('/auth/logout', async (req, res) => {
  const refreshToken = req.session.refreshToken;
  const loginMethod  = req.session.loginMethod;

  if (refreshToken) {
    try {
      await kcPost(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/logout`, {
        client_id:     KC_CLIENT,
        client_secret: KC_SECRET,
        refresh_token: refreshToken,
      });
    } catch (err) {
      console.error('Keycloak back-channel logout error:', err.message);
    }
  }

  req.session.destroy(() => {
    if (loginMethod === 'sso-relay') return res.redirect(WEBAPP_URL);
    res.redirect('/login');
  });
});

const crypto = require('crypto');
const SSO_RELAY_SECRET = process.env.SSO_RELAY_SECRET || 'sso-relay-rahasia-2024';
const WEBAPP_URL       = process.env.WEBAPP_URL        || 'http://localhost:3000';

// ── SSO Token relay (dari SSO Portal) ────────────────────────────────────────
// TIDAK dilindungi requireAuth
app.get('/auth/sso-token', (req, res) => {
  const { data, sig } = req.query;
  if (!data || !sig) return res.redirect('/login?error=no_token');

  // Verifikasi tanda tangan HMAC
  const expectedSig = crypto.createHmac('sha256', SSO_RELAY_SECRET).update(data).digest('hex');
  if (sig !== expectedSig) {
    console.error('SSO: tanda tangan tidak valid');
    return res.redirect('/login?error=invalid_sig');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString());
  } catch (e) {
    return res.redirect('/login?error=invalid_data');
  }

  // Cek kedaluwarsa — berlaku 60 detik
  if (Date.now() - payload.ts > 60_000) {
    console.error('SSO: payload kedaluwarsa');
    return res.redirect('/login?error=expired');
  }

  const { username, email, name, role: ssoRole } = payload;

  // Map role dari webapp SSO → role SINTA
  const roleMap = { admin: 'admin', user: 'pengambil' };
  const mappedRole = roleMap[ssoRole] || 'pengambil';

  const users = readDB('users');
  let user = users.find(u => u.username === username || (email && u.email === email));

  if (!user) {
    user = {
      id:        nextId(users),
      username,
      nama:      name || username,
      email:     email || '',
      role:      mappedRole,
      aktif:     true,
      createdAt: todayStr()
    };
    users.push(user);
    writeDB('users', users);
    console.log(`✅ SSO: user baru dibuat: ${username} | role: ${mappedRole}`);
  } else if (ssoRole && user.role !== mappedRole) {
    user.role = mappedRole;
    writeDB('users', users);
    console.log(`✅ SSO: role ${username} diupdate → ${mappedRole}`);
  }

  if (!user.aktif) return res.redirect('/login?error=akun_nonaktif');

  req.session.user        = { ...user };
  req.session.loginMethod = 'sso-relay';
  console.log(`✅ SSO login: ${username} | role: ${user.role}`);
  res.redirect('/');
});

// ── HTML routes (didefinisikan sebelum static agar bisa diproteksi) ─────────
app.get('/', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── DB Helpers ────────────────────────────────────────────────────────────────
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
    { id:1, username:'admin',  nama:'Administrator',     email:'admin@sinta.local',  role:'admin',    aktif:true, createdAt:'2024-01-01' },
    { id:2, username:'budi',   nama:'Budi Santoso',      email:'budi@sinta.local',   role:'pengambil',aktif:true, createdAt:'2024-01-01' },
    { id:3, username:'sari',   nama:'Sari Dewi Pratiwi', email:'sari@sinta.local',   role:'pengambil',aktif:true, createdAt:'2024-01-15' },
    { id:4, username:'rahman', nama:'Ahmad Rahman',      email:'rahman@sinta.local', role:'pengambil',aktif:true, createdAt:'2024-02-01' },
  ]);

  writeDB('assets', [
    { id:1,  kodeAset:'SRV-001', namaAset:'Server Dell PowerEdge R740',        jenis:'aset', kategori:'Server',    merk:'Dell',     model:'PowerEdge R740',      serialNumber:'SN-DELL-001', lokasi:'Server Room A - Rack 1', status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-03-15', spesifikasi:'2x Intel Xeon Gold 6226R, 64GB DDR4, 4x 2TB SAS RAID-5', keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:2,  kodeAset:'SRV-002', namaAset:'Server HP ProLiant DL380 Gen10',    jenis:'aset', kategori:'Server',    merk:'HP',       model:'ProLiant DL380 G10',  serialNumber:'SN-HP-001',   lokasi:'Server Room A - Rack 2', status:'dipinjam',    kondisi:'baik',       tanggalPengadaan:'2022-06-20', spesifikasi:'2x Intel Xeon Silver 4210, 32GB DDR4, 2x 1TB SSD',      keterangan:'',                        stok:0, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:3,  kodeAset:'SRV-003', namaAset:'Server Lenovo ThinkSystem SR650',   jenis:'aset', kategori:'Server',    merk:'Lenovo',   model:'ThinkSystem SR650',   serialNumber:'SN-LNV-001',  lokasi:'Server Room B - Rack 1', status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2023-01-10', spesifikasi:'2x Xeon Gold 5218, 128GB DDR4, 8x 1TB HDD RAID-6',     keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:4,  kodeAset:'SRV-004', namaAset:'Server Cisco UCS C240 M5',          jenis:'aset', kategori:'Server',    merk:'Cisco',    model:'UCS C240 M5',         serialNumber:'SN-CSC-001',  lokasi:'Server Room B - Rack 2', status:'maintenance', kondisi:'kurang_baik', tanggalPengadaan:'2021-08-05', spesifikasi:'2x Xeon Gold 6130, 64GB DDR4, 24x 1.2TB SAS',           keterangan:'Dalam perbaikan RAM slot', stok:0, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:5,  kodeAset:'SRV-005', namaAset:'Server IBM System x3650 M5',        jenis:'aset', kategori:'Server',    merk:'IBM',      model:'System x3650 M5',     serialNumber:'SN-IBM-001',  lokasi:'Server Room A - Rack 3', status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2021-05-20', spesifikasi:'2x Xeon E5-2620 v4, 32GB DDR4, 4x 600GB SAS',           keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:6,  kodeAset:'NET-001', namaAset:'Router Cisco ASR 1001-X',           jenis:'aset', kategori:'Network',   merk:'Cisco',    model:'ASR 1001-X',          serialNumber:'SN-CSC-R01',  lokasi:'Network Rack - Lt.1',    status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-11-01', spesifikasi:'10G Ports, 2x 10GE SFP+, Advanced Security',            keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:7,  kodeAset:'NET-002', namaAset:'Switch Cisco Catalyst 9300-48P',    jenis:'aset', kategori:'Network',   merk:'Cisco',    model:'Catalyst 9300-48P',   serialNumber:'SN-CSC-S01',  lokasi:'Network Rack - Lt.1',    status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-11-01', spesifikasi:'48x PoE+ Ports, 4x 1G SFP Uplinks, StackPower',         keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:8,  kodeAset:'NET-003', namaAset:'Switch HP Aruba 2530-48G',          jenis:'aset', kategori:'Network',   merk:'HP',       model:'Aruba 2530-48G',      serialNumber:'SN-HP-S01',   lokasi:'Network Rack - Lt.2',    status:'dipinjam',    kondisi:'baik',       tanggalPengadaan:'2021-09-15', spesifikasi:'48x 10/100/1000 Ports, 4x Dual Personality Ports',       keterangan:'',                        stok:0, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:9,  kodeAset:'NET-004', namaAset:'Firewall Fortinet FortiGate 100F',  jenis:'aset', kategori:'Network',   merk:'Fortinet', model:'FortiGate 100F',      serialNumber:'SN-FTN-001',  lokasi:'Network Rack - Lt.1',    status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2023-03-10', spesifikasi:'10 Gbps Firewall, SSL Inspection, Threat Protection',   keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:10, kodeAset:'NET-005', namaAset:'Access Point Ubiquiti UniFi AC Pro', jenis:'aset', kategori:'Network',  merk:'Ubiquiti', model:'UniFi AP AC Pro',     serialNumber:'SN-UBQ-001',  lokasi:'Lantai 1 - Lobby',       status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2023-01-20', spesifikasi:'802.11ac, 2.4GHz 450Mbps & 5GHz 1300Mbps, PoE',        keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:11, kodeAset:'NET-006', namaAset:'Router MikroTik RB1100AHx4',        jenis:'aset', kategori:'Network',   merk:'MikroTik', model:'RB1100AHx4',          serialNumber:'SN-MTK-001',  lokasi:'Network Rack - Lt.3',    status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2021-07-12', spesifikasi:'13x Gigabit Ethernet, RouterOS Level 6',                keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:12, kodeAset:'NET-007', namaAset:'Switch Juniper EX4300-48T',         jenis:'aset', kategori:'Network',   merk:'Juniper',  model:'EX4300-48T',          serialNumber:'SN-JNP-001',  lokasi:'Network Rack - Lt.2',    status:'rusak',       kondisi:'rusak',      tanggalPengadaan:'2020-04-05', spesifikasi:'48x 1GbE, 4x 10GbE SFP+ Uplinks',                      keterangan:'Port SFP+ rusak',         stok:0, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:13, kodeAset:'NET-008', namaAset:'Firewall Palo Alto PA-220',         jenis:'aset', kategori:'Network',   merk:'Palo Alto',model:'PA-220',              serialNumber:'SN-PAL-001',  lokasi:'Network Rack - Lt.1',    status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-08-30', spesifikasi:'500 Mbps Firewall, WildFire Threat Prevention',          keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:14, kodeAset:'NET-009', namaAset:'Access Point Cisco AIR-AP3802I',    jenis:'aset', kategori:'Network',   merk:'Cisco',    model:'AIR-AP3802I',         serialNumber:'SN-CSC-AP1',  lokasi:'Lantai 2 - Meeting Room',status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2021-11-08', spesifikasi:'802.11ac Wave 2, 4x4 MIMO, 2.5Gbps Throughput',         keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:15, kodeAset:'CMP-001', namaAset:'Laptop Dell Latitude 5420',         jenis:'aset', kategori:'Computing', merk:'Dell',     model:'Latitude 5420',       serialNumber:'SN-DLL-L01',  lokasi:'Gudang IT',              status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2023-02-14', spesifikasi:'Intel i7-1185G7, 16GB RAM, 512GB NVMe, 14 inch FHD',   keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:16, kodeAset:'CMP-002', namaAset:'Laptop HP EliteBook 840 G8',        jenis:'aset', kategori:'Computing', merk:'HP',       model:'EliteBook 840 G8',    serialNumber:'SN-HP-L01',   lokasi:'Gudang IT',              status:'dipinjam',    kondisi:'baik',       tanggalPengadaan:'2023-04-20', spesifikasi:'Intel i5-1135G7, 8GB RAM, 256GB SSD, 14 inch FHD',     keterangan:'',                        stok:0, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:17, kodeAset:'CMP-003', namaAset:'Workstation Dell Precision 7920',   jenis:'aset', kategori:'Computing', merk:'Dell',     model:'Precision 7920',      serialNumber:'SN-DLL-W01',  lokasi:'Ruang Engineer',         status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-10-01', spesifikasi:'2x Xeon Gold 5218, 64GB ECC, NVIDIA Quadro RTX 4000',   keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:18, kodeAset:'STR-001', namaAset:'NAS Synology DS3617xs',             jenis:'aset', kategori:'Storage',   merk:'Synology', model:'DS3617xs',            serialNumber:'SN-SYN-001',  lokasi:'Server Room A',          status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-05-10', spesifikasi:'12-Bay NAS, Xeon D-1527, 16GB ECC, DSM 7.2',           keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:19, kodeAset:'UPS-001', namaAset:'UPS APC Smart-UPS 3000VA',          jenis:'aset', kategori:'UPS/Power', merk:'APC',      model:'Smart-UPS 3000VA',    serialNumber:'SN-APC-001',  lokasi:'Server Room A',          status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2021-12-01', spesifikasi:'3000VA/2700W, 230V, USB & RS232 Management',            keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:20, kodeAset:'UPS-002', namaAset:'UPS Eaton 9PX 3000i',               jenis:'aset', kategori:'UPS/Power', merk:'Eaton',    model:'9PX 3000i',           serialNumber:'SN-ETN-001',  lokasi:'Server Room B',          status:'tersedia',    kondisi:'baik',       tanggalPengadaan:'2022-07-15', spesifikasi:'3000VA/2700W, Network Management Card',                 keterangan:'',                        stok:1, stokMin:0, gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:21, kodeAset:'NET-010', namaAset:'Konektor RJ45 Cat6',                jenis:'consumable', kategori:'Network',   merk:'Belden',  model:'Cat6 RJ45 Unshielded', serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2024-01-05', spesifikasi:'RJ45 Unshielded, Category 6, 250MHz, Gold Plated',   keterangan:'Per biji',    stok:320, stokMin:50,  gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:22, kodeAset:'NET-011', namaAset:'Patch Cable Cat6 0.5m',             jenis:'consumable', kategori:'Network',   merk:'Belden',  model:'Cat6 Patch 0.5m',      serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2024-01-05', spesifikasi:'UTP Cat6, 0.5m, RJ45-RJ45, berbagai warna',          keterangan:'Per pcs',     stok:45,  stokMin:10,  gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:23, kodeAset:'NET-012', namaAset:'Patch Cable Cat6 2m',               jenis:'consumable', kategori:'Network',   merk:'Belden',  model:'Cat6 Patch 2m',        serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2024-01-05', spesifikasi:'UTP Cat6, 2m, RJ45-RJ45',                            keterangan:'Per pcs',     stok:28,  stokMin:5,   gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:24, kodeAset:'NET-013', namaAset:'Kabel UTP Cat6 Box 305m',           jenis:'consumable', kategori:'Network',   merk:'Belden',  model:'1583A Cat6',           serialNumber:'', lokasi:'Gudang IT - Rak Besar',      status:'tersedia', kondisi:'baik', tanggalPengadaan:'2024-01-10', spesifikasi:'UTP Cat6, 305m/box, 23 AWG, 4-pair',                 keterangan:'Per box',     stok:3,   stokMin:1,   gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
    { id:25, kodeAset:'NET-014', namaAset:'SFP Module 1GbE LC SX',             jenis:'consumable', kategori:'Network',   merk:'Cisco',   model:'GLC-SX-MMD',           serialNumber:'', lokasi:'Gudang IT - Rak Consumable', status:'tersedia', kondisi:'baik', tanggalPengadaan:'2023-09-01', spesifikasi:'1000BASE-SX SFP, LC, 550m, Multi-mode',              keterangan:'Per pcs',     stok:8,   stokMin:2,   gambar:null, createdAt:'2024-01-01', updatedAt:'2024-01-01' },
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

  console.log('✅ Data awal selesai dibuat');
}

seed();

// ── API Routes ────────────────────────────────────────────────────────────────

// Endpoint info user yang sedang login
app.get('/api/me', requireAuthApi, (req, res) => {
  res.json(req.session.user);
});

// Semua /api/* route wajib login
app.use('/api', requireAuthApi);

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

// ── Start server ──────────────────────────────────────────────────────────────
initOIDC()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🖥️  SINTA berjalan di  http://localhost:${PORT}`);
      console.log(`🔐  Keycloak          http://${KC_URL.replace('http://','')}/realms/${KC_REALM}`);
      console.log(`📁  Data tersimpan di  ${DATA_DIR}\n`);
    });
  })
  .catch(err => {
    console.error('❌ Gagal terhubung ke Keycloak:', err.message);
    console.error('   Pastikan Keycloak berjalan di:', KC_URL);
    process.exit(1);
  });
