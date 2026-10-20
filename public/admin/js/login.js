async function checkExistingSession() {
  const { user } = await api('/api/auth/me');
  if (user) window.location.href = user.mustChangePassword ? '/admin/account.html' : landingFor(user);
}

// Correspondents only enter results; everyone else starts on the dashboard.
function landingFor(user) {
  return user.role === 'CORRESPONDENT' ? '/admin/results.html' : '/admin/dashboard.html';
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const codeField = document.getElementById('code-field');
  const code = document.getElementById('code').value.trim();
  const errorEl = document.getElementById('login-error');
  errorEl.style.display = 'none';

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, ...(codeField.hidden ? {} : { code }) }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    window.location.href = data.user.mustChangePassword ? '/admin/account.html' : landingFor(data.user);
    return;
  }
  // Two-step accounts: the password was right, now the code.
  if (data.needCode) {
    codeField.hidden = false;
    document.getElementById('code').focus();
  }
  errorEl.textContent = data.error || 'Could not sign in';
  errorEl.style.display = 'block';
});

checkExistingSession();
