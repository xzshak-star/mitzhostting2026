const toggle = document.getElementById('mobileToggle');
const menu = document.getElementById('mobileMenu');
if (toggle && menu) toggle.addEventListener('click', () => menu.classList.toggle('active'));

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'same-origin',
    ...opts
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
  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm').value;
  const token = document.getElementById('token').value.trim();
  try {
    await api('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, confirm, token })
    });
    window.location.href = '/dashboard';
  } catch (err) {
    showError('formError', err.message);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    window.location.href = '/dashboard';
  } catch (err) {
    showError('formError', err.message);
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signupForm');
  const loginForm = document.getElementById('loginForm');
  if (signupForm) signupForm.addEventListener('submit', handleSignup);
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
});
