const toggle = document.getElementById('mobileToggle');
const menu = document.getElementById('mobileMenu');
if (toggle && menu) toggle.addEventListener('click', () => menu.classList.toggle('active'));

async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const headers = isForm ? { ...(opts.headers || {}) } : { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(path, {
    headers,
    credentials: 'same-origin',
    ...opts,
    body: isForm ? opts.body : (opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

async function handleSignup(e) {
  e.preventDefault();
  const telegramId = document.getElementById('telegramId').value.trim();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm').value;
  const token = document.getElementById('token').value.trim();
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }
  try {
    await api('/api/auth/signup', {
      method: 'POST',
      body: { telegramId, password, confirm, token }
    });
    window.location.href = '/dashboard';
  } catch (err) {
    showError('formError', err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const telegramId = document.getElementById('telegramId').value.trim();
  const password = document.getElementById('password').value;
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: { telegramId, password }
    });
    window.location.href = '/dashboard';
  } catch (err) {
    showError('formError', err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
  window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signupForm');
  const loginForm = document.getElementById('loginForm');
  if (signupForm) signupForm.addEventListener('submit', handleSignup);
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
});
