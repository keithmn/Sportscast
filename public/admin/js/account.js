// Account & team page (2026-10-19) — your password and two-step login;
// for admins, the team: add people, set roles, deactivate, reset links.
// Server side: server/routes/auth.js.

const ROLE_LABELS = { ADMIN: 'Admin', EDITOR: 'Editor', CORRESPONDENT: 'Correspondent' };
let me = null;
let competitionsList = [];

function show(el, message) {
  el.textContent = message;
  el.hidden = false;
}

// A one-time link, with a copy button and a WhatsApp share.
function linkShareHtml(title, link, hours) {
  const text = `Your Sportscast newsroom link (works once, for ${hours} hours): ${link}`;
  return `
    <div class="link-share" role="status">
      <strong>${escapeHtml(title)}</strong>
      <input type="text" readonly value="${escapeHtml(link)}" aria-label="One-time link" class="share-link-input">
      <div class="person-actions">
        <button type="button" class="btn-outline-sm copy-link-btn">Copy link</button>
        <a class="btn-outline-sm" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Send on WhatsApp</a>
      </div>
      <span class="hint">Works once, for ${hours} hours. Anyone with the link can set this password, so send it only to them.</span>
    </div>`;
}

// ---------- your password ----------
document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('pw-error');
  const ok = document.getElementById('pw-ok');
  err.hidden = true;
  ok.hidden = true;
  const next = document.getElementById('pw-next').value;
  if (next !== document.getElementById('pw-confirm').value) { show(err, "The two new passwords don't match."); return; }
  try {
    const { user } = await api('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ current: document.getElementById('pw-current').value, next }),
    });
    e.target.reset();
    ok.hidden = false;
    if (me.mustChangePassword && !user.mustChangePassword) {
      // Released: carry on to where they were going.
      window.location.href = user.role === 'CORRESPONDENT' ? '/admin/results.html' : '/admin/dashboard.html';
    }
    me = user;
  } catch (error) {
    show(err, error.message);
  }
});

// ---------- two-step login ----------
function renderTotp(setup) {
  const panel = document.getElementById('totp-panel');
  if (me.totpEnabled) {
    panel.innerHTML = `
      <p>On — signing in asks for a code from your authenticator app.</p>
      <form id="totp-off-form" class="account-form">
        <div class="form-field"><label for="totp-off-pw">Your password, to turn it off</label><input type="password" id="totp-off-pw" required></div>
        <button type="submit" class="btn-outline-sm">Turn off two-step login</button>
        <p class="form-error" id="totp-error" hidden></p>
      </form>`;
    return;
  }
  if (!setup) {
    panel.innerHTML = `
      <p class="hint">Adds a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator, Authy) to signing in, so a leaked password alone can't get into the newsroom. Recommended for admins.</p>
      <button type="button" class="btn-outline-sm" id="totp-start">Set up two-step login</button>`;
    return;
  }
  panel.innerHTML = `
    <ol class="hint" style="padding-left:1.2rem; display:grid; gap:0.4rem;">
      <li>In your authenticator app, add an account. On this phone you can <a href="${escapeHtml(setup.uri)}">open it in the app</a>; otherwise choose "enter a setup key" and type:</li>
    </ol>
    <div class="totp-key" id="totp-key">${escapeHtml(setup.secret.match(/.{1,4}/g).join(' '))}</div>
    <form id="totp-on-form" class="account-form" style="margin-top:0.9rem;">
      <div class="form-field"><label for="totp-code">2. The 6-digit code the app shows</label><input type="text" id="totp-code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required></div>
      <button type="submit" class="btn-red">Turn on</button>
      <p class="form-error" id="totp-error" hidden></p>
    </form>`;
}

document.getElementById('totp-panel').addEventListener('click', async (e) => {
  if (e.target.id !== 'totp-start') return;
  renderTotp(await api('/api/auth/totp/setup', { method: 'POST' }));
});
document.getElementById('totp-panel').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('totp-error');
  try {
    const route = e.target.id === 'totp-on-form' ? 'enable' : 'disable';
    const body = route === 'enable' ? { code: document.getElementById('totp-code').value } : { password: document.getElementById('totp-off-pw').value };
    ({ user: me } = await api(`/api/auth/totp/${route}`, { method: 'POST', body: JSON.stringify(body) }));
    renderTotp();
  } catch (error) {
    show(err, error.message);
  }
});

// ---------- team ----------
function competitionOptions(selectedIds) {
  return competitionsList.map((c) => `<option value="${c.id}" ${selectedIds.includes(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
}

function personHtml(u) {
  const last = u.lastLoginAt ? `last in ${formatDate(u.lastLoginAt)}` : 'never signed in';
  return `
    <div class="person ${u.isActive ? '' : 'inactive'}" data-user-id="${u.id}">
      <div class="person-head">
        <strong>${escapeHtml(u.name)}</strong>
        <span class="person-meta">${escapeHtml(u.email)} · ${escapeHtml(last)}${u.totpEnabled ? ' · two-step on' : ''}${u.isActive ? '' : ' · deactivated'}${u.id === me.id ? ' · you' : ''}</span>
      </div>
      <div class="person-actions">
        <label class="sr-only" for="role-${u.id}">Role</label>
        <select id="role-${u.id}" class="role-select" ${u.id === me.id ? 'disabled' : ''}>
          ${Object.entries(ROLE_LABELS).map(([k, label]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <button type="button" class="btn-outline-sm reset-link-btn">New password link</button>
        ${u.id === me.id ? '' : `<button type="button" class="btn-outline-sm active-btn" data-active="${u.isActive ? 'false' : 'true'}">${u.isActive ? 'Deactivate' : 'Reactivate'}</button>`}
      </div>
      ${u.role === 'CORRESPONDENT' ? `
        <div class="form-field"><label for="comps-${u.id}">Competitions they report on</label>
          <select id="comps-${u.id}" class="comps-select" multiple size="5">${competitionOptions(u.competitionIds)}</select>
          <button type="button" class="btn-outline-sm save-comps-btn" style="margin-top:0.4rem;">Save competitions</button>
        </div>` : ''}
      <div class="person-link"></div>
    </div>`;
}

async function loadTeam() {
  const { users } = await api('/api/auth/users');
  document.getElementById('team-list').innerHTML = users.map(personHtml).join('');
}

document.getElementById('team-section').addEventListener('click', async (e) => {
  if (e.target.closest('.copy-link-btn')) {
    const input = e.target.closest('.link-share').querySelector('.share-link-input');
    input.select();
    try { await navigator.clipboard.writeText(input.value); e.target.textContent = 'Copied'; } catch { document.execCommand('copy'); }
    return;
  }
  const person = e.target.closest('.person');
  if (!person) return;
  const id = person.dataset.userId;
  try {
    if (e.target.closest('.reset-link-btn')) {
      const { link, validHours } = await api(`/api/auth/users/${id}/reset-link`, { method: 'POST' });
      person.querySelector('.person-link').innerHTML = linkShareHtml('Password link', link, validHours);
    } else if (e.target.closest('.active-btn')) {
      const activate = e.target.dataset.active === 'true';
      if (!activate && !confirm('Deactivate this person? They are signed out and can no longer sign in. Their name stays in the change log.')) return;
      await api(`/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: activate }) });
      loadTeam();
    } else if (e.target.closest('.save-comps-btn')) {
      const ids = [...person.querySelectorAll('.comps-select option:checked')].map((o) => o.value);
      await api(`/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify({ competitionIds: ids }) });
      e.target.textContent = 'Saved';
    }
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById('team-section').addEventListener('change', async (e) => {
  if (!e.target.matches('.role-select')) return;
  const id = e.target.closest('.person').dataset.userId;
  try {
    await api(`/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify({ role: e.target.value }) });
  } catch (error) {
    alert(error.message);
  }
  loadTeam();
});

document.getElementById('np-role').addEventListener('change', (e) => {
  document.getElementById('np-comps-field').hidden = e.target.value !== 'CORRESPONDENT';
});

document.getElementById('add-person-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('np-error');
  err.hidden = true;
  try {
    const role = document.getElementById('np-role').value;
    const { user, setupLink, validHours } = await api('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('np-name').value,
        email: document.getElementById('np-email').value,
        role,
        competitionIds: role === 'CORRESPONDENT' ? [...document.querySelectorAll('#np-comps option:checked')].map((o) => o.value) : [],
      }),
    });
    e.target.reset();
    document.getElementById('np-comps-field').hidden = true;
    document.getElementById('link-box').innerHTML = linkShareHtml(`Send ${user.name} this link to set their password`, setupLink, validHours);
    loadTeam();
  } catch (error) {
    show(err, error.message);
  }
});

async function initAccountPage() {
  me = await requireLogin();
  if (!me) return;
  document.getElementById('account-app').style.display = 'block';
  document.getElementById('must-change').hidden = !me.mustChangePassword;
  renderTotp();
  if (me.role === 'ADMIN' && !me.mustChangePassword) {
    document.getElementById('team-section').hidden = false;
    const { competitions } = await api('/api/competitions');
    competitionsList = competitions.filter((c) => c.region === 'KENYA').sort(compareByName);
    document.getElementById('np-comps').innerHTML = competitionOptions([]);
    loadTeam();
  }
}

function compareByName(a, b) {
  return a.name.localeCompare(b.name);
}

initAccountPage();
