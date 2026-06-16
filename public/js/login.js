'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // Tampilkan error jika callback dari Keycloak gagal
  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) {
    const el = document.getElementById('login-error');
    if (el) el.classList.remove('hidden');
  }

  // Feedback visual saat tombol diklik
  const btn = document.getElementById('kc-login-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      btn.textContent = 'Mengarahkan ke Keycloak...';
      btn.style.opacity = '0.7';
      btn.style.pointerEvents = 'none';
    });
  }
});
