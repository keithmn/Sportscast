// Include on every admin page. Redirects to login if there's no session,
// exposes window.currentUser, and wires up the logout link if present.

let currentUser = null;

async function requireLogin() {
  const { user } = await api('/api/auth/me');
  if (!user) {
    window.location.href = '/admin/index.html';
    return null;
  }
  currentUser = user;
  const who = document.getElementById('whoami');
  if (who) who.textContent = `${user.name} · ${user.role}`;

  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) {
    logoutLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await api('/api/auth/logout', { method: 'POST' });
      window.location.href = '/admin/index.html';
    });
  }
  return user;
}

function canManageArticles(user) {
  return user && ['ADMIN', 'EDITOR'].includes(user.role);
}
