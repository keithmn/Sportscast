// X Watch admin page — see server/routes/watch.js. Posts come from the
// watcher script on an editor's machine (scripts/x-watch/watch.js); this
// page lists them, one row per score found, with what our own fixtures say.

const KIND_LABELS = { RESULT: 'Result', LIVE: 'Live', LINEUP: 'Line-up', FIXTURE: 'Fixture', TRANSFER: 'Transfer', INJURY: 'Injury', NEWS: 'News' };
const VERDICT_LABELS = {
  DIFFERS: 'Differs from ours',
  NOT_ENTERED: 'Not entered yet',
  NO_FIXTURE: 'No such fixture',
  LIVE: 'Live — ours not final',
  MATCHES: 'Matches',
};
// Stale if the watcher hasn't reported for this long while it's meant to be running.
const STALE_MS = 2 * 60 * 60 * 1000;

function timeAgo(date) {
  if (!date) return 'never';
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h ago` : formatDate(date);
}

function postTime(p) {
  const d = new Date(p.postedAt || p.fetchedAt);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}`;
}

function ourSideHtml(m) {
  const label = `<span class="verdict ${m.verdict}">${escapeHtml(VERDICT_LABELS[m.verdict] || m.verdict)}</span>`;
  if (!m.fixture) {
    return `${label}<br><span class="watch-text">We have no ${escapeHtml(m.item.homeTeam)} v ${escapeHtml(m.item.awayTeam)} fixture around this date.</span>`;
  }
  const f = m.fixture;
  const ours = f.status === 'FINISHED' && f.homeScore != null
    ? `${escapeHtml(f.homeTeam)} ${f.homeScore}–${f.awayScore} ${escapeHtml(f.awayTeam)}`
    : `${escapeHtml(f.homeTeam)} v ${escapeHtml(f.awayTeam)} · ${escapeHtml(fixtureDisplayStatus(f).label)}`;
  return `${label}<br><span class="watch-text">Ours: ${ours}<br>${escapeHtml(f.competition.name)}</span>
    <br><a href="/match.html?id=${encodeURIComponent(f.id)}" target="_blank" rel="noopener">Match page</a> · <a href="/admin/competitions.html">Enter in admin</a>`;
}

function actionsHtml(p) {
  return `<div class="watch-actions">
    ${p.status !== 'DONE' ? `<button class="btn-outline-sm post-status-btn" data-id="${p.id}" data-status="DONE">Done</button>` : ''}
    ${p.status !== 'DISMISSED' ? `<button class="btn-outline-sm post-status-btn" data-id="${p.id}" data-status="DISMISSED">Dismiss</button>` : ''}
    ${p.status !== 'NEW' ? `<button class="btn-outline-sm post-status-btn" data-id="${p.id}" data-status="NEW">Reopen</button>` : ''}
    ${p.parsedBy !== 'AI' ? `<button class="btn-outline-sm analyse-btn" data-id="${p.id}" title="Have Claude read this post (costs a fraction of a cent)">Ask Claude</button>` : ''}</div>`;
}

function postRowsHtml(p) {
  const author = `@${escapeHtml(p.account.handle)}${p.isRepost ? ' · repost' : ''}`;
  const link = /^https:\/\/x\.com\//.test(p.url) ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">Open post</a>` : '';
  const textCell = `<div class="watch-text">${escapeHtml(p.text.length > 280 ? `${p.text.slice(0, 280)}…` : p.text)}</div>${p.aiNote ? `<div class="watch-text"><em>Claude: ${escapeHtml(p.aiNote)}</em></div>` : ''}`;
  const head = `<td style="white-space:nowrap;">${postTime(p)}<br><span class="watch-text">${author}</span></td><td>${escapeHtml(KIND_LABELS[p.kind] || p.kind)}${p.parsedBy === 'AI' ? '<br><span class="watch-text">read by Claude</span>' : ''}</td>`;
  if (!p.matches.length) {
    return `<tr data-post-id="${p.id}">${head}<td colspan="3">${textCell}</td><td>${link}</td><td>${actionsHtml(p)}</td></tr>`;
  }
  return p.matches.map((m, i) => {
    const score = `${m.item.homeScore}–${m.item.awayScore}${m.item.penalties ? ` (${escapeHtml(m.item.penalties)} pens)` : ''}`;
    const status = m.item.status === 'LIVE' && m.item.minute ? `${escapeHtml(m.item.minute)}'` : escapeHtml(m.item.status === 'UNKNOWN' ? '' : m.item.status);
    return `
      <tr data-post-id="${p.id}">
        ${i === 0 ? head : '<td></td><td></td>'}
        <td>${escapeHtml(m.item.homeTeam)} v ${escapeHtml(m.item.awayTeam)}${i === 0 ? textCell : ''}</td>
        <td style="white-space:nowrap;"><strong>${score}</strong> ${status}</td>
        <td>${ourSideHtml(m)}</td>
        <td>${i === 0 ? link : ''}</td>
        <td>${i === 0 ? actionsHtml(p) : ''}</td>
      </tr>`;
  }).join('');
}

async function loadAccounts() {
  const { accounts } = await api('/api/watch/accounts');
  const list = document.getElementById('accounts-list');
  list.innerHTML = accounts.length
    ? accounts.map((a) => `
      <div class="watch-account">
        <span class="handle">@${escapeHtml(a.handle)}</span>
        ${a.displayName ? `<span>${escapeHtml(a.displayName)}</span>` : ''}
        <span class="meta">Last checked ${escapeHtml(timeAgo(a.lastCheckedAt))}${a.lastStatus ? ` · ${escapeHtml(a.lastStatus)}` : ''} · ${a._count.posts} posts</span>
        <label class="checkbox-row" style="margin-left:auto;"><input type="checkbox" class="account-active" data-id="${a.id}" ${a.isActive ? 'checked' : ''}> <span>Watching</span></label>
      </div>`).join('')
    : '<p class="empty-state">No accounts yet — add the journalists to follow below.</p>';

  // The watcher's health, as the editor needs to know it: is it blocked,
  // erroring, or silent?
  const banner = document.getElementById('watcher-banner');
  const active = accounts.filter((a) => a.isActive);
  const blocked = active.filter((a) => a.lastStatus === 'BLOCKED' || a.lastStatus === 'ERROR');
  const stale = active.filter((a) => !a.lastCheckedAt || Date.now() - new Date(a.lastCheckedAt).getTime() > STALE_MS);
  if (blocked.length) {
    banner.innerHTML = `<div class="watch-banner"><strong>The watcher stopped.</strong> ${blocked.map((a) => `@${escapeHtml(a.handle)}: ${escapeHtml(a.lastError || a.lastStatus)}`).join(' · ')} — open the watcher's Chrome window, sort it out by hand (log in again, or wait out a limit), then restart it.</div>`;
  } else if (active.length && stale.length) {
    banner.innerHTML = `<div class="watch-banner ok">Not checked in the last 2 hours: ${stale.map((a) => `@${escapeHtml(a.handle)}`).join(', ')}. Is the watcher running on the newsroom machine? (It also pauses outside its watch hours.)</div>`;
  } else {
    banner.innerHTML = '';
  }

  list.querySelectorAll('.account-active').forEach((box) => box.addEventListener('change', async () => {
    await api(`/api/watch/accounts/${box.dataset.id}`, { method: 'PUT', body: JSON.stringify({ isActive: box.checked }) });
    loadAccounts();
  }));
}

async function loadPosts() {
  const view = document.getElementById('view-filter').value;
  const kind = document.getElementById('kind-filter').value;
  const qs = view === 'attention' ? 'status=NEW&attention=1' : `status=${encodeURIComponent(view)}`;
  const tbody = document.getElementById('watch-tbody');
  try {
    const { posts } = await api(`/api/watch/posts?${qs}`);
    const shown = kind ? posts.filter((p) => p.kind === kind) : posts;
    tbody.innerHTML = shown.length
      ? shown.map(postRowsHtml).join('')
      : `<tr><td colspan="7" class="empty-state">${view === 'attention' ? 'Nothing needs attention — every score posted matches ours or is still live.' : 'No posts here.'}</td></tr>`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Could not load posts: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function initWatchPage() {
  const user = await requireLogin();
  if (!user) return;
  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('watch-app').style.display = 'block';

  document.getElementById('add-account-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('account-error');
    errorEl.style.display = 'none';
    try {
      await api('/api/watch/accounts', {
        method: 'POST',
        body: JSON.stringify({
          handle: document.getElementById('new-handle').value,
          displayName: document.getElementById('new-display-name').value,
        }),
      });
      document.getElementById('new-handle').value = '';
      document.getElementById('new-display-name').value = '';
      loadAccounts();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });

  document.getElementById('view-filter').addEventListener('change', loadPosts);
  document.getElementById('kind-filter').addEventListener('change', loadPosts);
  document.getElementById('refresh-btn').addEventListener('click', () => { loadAccounts(); loadPosts(); });

  document.getElementById('watch-tbody').addEventListener('click', async (e) => {
    const statusBtn = e.target.closest('.post-status-btn');
    const analyseBtn = e.target.closest('.analyse-btn');
    if (statusBtn) {
      await api(`/api/watch/posts/${statusBtn.dataset.id}`, { method: 'PUT', body: JSON.stringify({ status: statusBtn.dataset.status }) });
      loadPosts();
    } else if (analyseBtn) {
      analyseBtn.disabled = true;
      analyseBtn.textContent = 'Reading…';
      try {
        await api(`/api/watch/posts/${analyseBtn.dataset.id}/analyse`, { method: 'POST' });
        loadPosts();
      } catch (err) {
        analyseBtn.disabled = false;
        analyseBtn.textContent = 'Ask Claude';
        alert(err.message);
      }
    }
  });

  loadAccounts();
  loadPosts();
}

initWatchPage();
