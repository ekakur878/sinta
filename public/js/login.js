'use strict';

// Jika sudah login, langsung ke app
if (sessionStorage.getItem('sinta_auth')) {
  window.location.href = '/';
}

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

document.addEventListener('DOMContentLoaded', () => {

  // Tampilkan pesan dari app.js (misal sesi berakhir)
  const msg = sessionStorage.getItem('sinta_login_msg');
  if (msg) {
    sessionStorage.removeItem('sinta_login_msg');
    const el = $('#login-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  // Tombol demo login
  $$('.demo-login').forEach(btn => {
    btn.onclick = () => {
      $('#login-username').value = btn.dataset.user;
      $('#login-password').value = btn.dataset.pass;
    };
  });

  // Form login
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#login-btn');
    const errEl = $('#login-error');

    btn.disabled = true;
    btn.textContent = 'Memuat...';
    errEl.classList.add('hidden');

    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;

    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || 'Username atau password salah!');

      sessionStorage.setItem('sinta_auth', JSON.stringify(json));
      window.location.href = '/';
    } catch (err) {
      errEl.textContent = '❌ ' + err.message;
      errEl.classList.remove('hidden');
      setTimeout(() => errEl.classList.add('hidden'), 4000);
      btn.disabled = false;
      btn.textContent = 'Masuk →';
    }
  });
});
