// Wave 7 — the client side of the new fan-account system (server/routes/
// fanAuth.js). Deliberately plain: no framework, matches every other
// page's vanilla-JS-against-innerHTML convention. api()/escapeHtml() come
// from site.js, loaded before this file.

async function loadAccount() {
  const root = document.getElementById('account-root');
  try {
    const { account } = await api('/api/fan-auth/me');
    if (account) {
      renderSignedIn(root, account);
    } else {
      renderForms(root);
    }
  } catch {
    root.innerHTML = '<p class="empty-state">Something went wrong loading your account. Try reloading the page.</p>';
  }
}

function renderSignedIn(root, account) {
  root.innerHTML = `
    <p>Signed in as <strong>${escapeHtml(account.name || account.email)}</strong> (${escapeHtml(account.email)}).</p>
    <p class="empty-state">Your follows on this device stay attached to this account. Cross-device sync isn't built yet — signing in on a different device won't bring your follows with it.</p>
    <button type="button" class="btn-outline-sm" id="logout-btn">Log Out</button>
  `;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/fan-auth/logout', { method: 'POST' }).catch(() => {});
    loadAccount();
  });
}

function renderForms(root) {
  root.innerHTML = `
    <div id="account-error" class="form-error" style="display:none;"></div>
    <form id="login-form">
      <h2 style="font-size:1.1rem;">Sign In</h2>
      <input type="email" name="email" placeholder="Email" required autocomplete="email" style="width:100%;">
      <input type="password" name="password" placeholder="Password" required autocomplete="current-password" style="width:100%; margin-top:0.5rem;">
      <button type="submit" class="btn-outline-sm" style="margin-top:0.5rem;">Sign In</button>
    </form>
    <hr style="margin:1.5rem 0;">
    <form id="register-form">
      <h2 style="font-size:1.1rem;">Create Account</h2>
      <p class="empty-state" style="margin-top:0;">Keeps your follows on this device attached to an account you can sign back into. No password reset yet — pick something you'll remember.</p>
      <input type="text" name="name" placeholder="Name (optional)" style="width:100%;">
      <input type="email" name="email" placeholder="Email" required autocomplete="email" style="width:100%; margin-top:0.5rem;">
      <input type="password" name="password" placeholder="Password (min 8 characters)" required minlength="8" autocomplete="new-password" style="width:100%; margin-top:0.5rem;">
      <button type="submit" class="btn-outline-sm" style="margin-top:0.5rem;">Create Account</button>
    </form>
  `;

  const errorBox = document.getElementById('account-error');
  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    const form = new FormData(e.target);
    try {
      await api('/api/fan-auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      loadAccount();
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    const form = new FormData(e.target);
    try {
      await api('/api/fan-auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          name: form.get('name') || undefined,
          anonymousId: getAnonymousId(),
        }),
      });
      loadAccount();
    } catch (err) {
      showError(err.message);
    }
  });
}

loadAccount();
