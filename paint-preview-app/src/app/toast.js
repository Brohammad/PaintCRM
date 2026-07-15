// Brief toast notification used across modals and forms.

export function showTransientToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText =
    'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#1d1d1f;color:#fff;padding:10px 16px;border-radius:999px;font-size:0.9rem;box-shadow:0 10px 30px rgba(0,0,0,0.25);z-index:2000;';
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity 160ms ease';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 160);
  }, 1600);
}
