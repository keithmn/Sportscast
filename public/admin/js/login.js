async function checkExistingSession() {
  const { user } = await api('/api/auth/me');
  if (user) window.location.href = '/admin/dashboard.html';
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.style.display = 'none';

  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    window.location.href = '/admin/dashboard.html';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

checkExistingSession();
