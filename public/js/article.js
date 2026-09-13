async function loadArticle() {
  const slug = qs('slug');
  const root = document.getElementById('article-root');
  if (!slug) {
    root.innerHTML = '<div class="empty-state">No article specified.</div>';
    return;
  }

  let article;
  try {
    ({ article } = await api(`/api/articles/${encodeURIComponent(slug)}`));
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Article not found.</div>`;
    return;
  }

  document.title = `${article.title} — The Sportscast`;
  if (article.coverImageUrl) document.getElementById('og-image').setAttribute('content', article.coverImageUrl);

  const bodyHtml = article.body
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para)}</p>`)
    .join('');

  const videoHtml = article.contentType === 'VIDEO_POST' && article.youtubeId
    ? `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(article.youtubeId)}" title="${escapeHtml(article.title)}" allowfullscreen></iframe></div>`
    : '';

  const coverHtml = !videoHtml && article.coverImageUrl
    ? `<img class="article-cover" src="${escapeHtml(article.coverImageUrl)}" alt="${escapeHtml(article.title)}">`
    : '';

  // Fails soft server-side (see server/lib/canonicalData.js) — a Data
  // Platform outage or an unlinked article just means this is absent,
  // never a broken page.
  const ce = article.canonicalEvent;
  const canonicalEventHtml = ce
    ? `<p class="source-note">Related to: ${escapeHtml(ce.competitionName || ce.teamName || ce.athleteName || ce.title)}${ce.competitionName || ce.teamName || ce.athleteName ? ` — ${escapeHtml(ce.title)}` : ''}</p>`
    : '';

  root.innerHTML = `
    <div class="article-header">
      <span class="section-label">${escapeHtml(article.sport.name)}${article.videoSeries ? ' · ' + escapeHtml(article.videoSeries) : ''}</span>
      <h1 class="page-title" style="font-size: var(--text-display);">${escapeHtml(article.title)}</h1>
      <p class="page-sub">${escapeHtml(article.dek)}</p>
      <div class="story-foot" style="border-top:none; margin-top:1rem; padding-top:0;">
        <span class="story-author">${escapeHtml(article.author.name)}</span>
        <span class="story-dot">·</span>
        <span class="story-time">${formatDate(article.publishedAt)}</span>
        <span class="story-dot">·</span>
        <span class="story-time">${readTime(article.body)} min read</span>
      </div>
    </div>
    <div class="article-body">
      ${videoHtml}
      ${coverHtml}
      ${bodyHtml}
      ${article.tags && article.tags.length ? `<p class="source-note">Tagged: ${article.tags.map((t) => escapeHtml(t.name)).join(', ')}</p>` : ''}
      ${article.competitions && article.competitions.length ? `<p class="source-note">Competitions: ${article.competitions.map((c) => `<a href="/competition.html?slug=${encodeURIComponent(c.slug)}">${escapeHtml(c.name)}</a>`).join(', ')}</p>` : ''}
      ${article.clubs && article.clubs.length ? `<p class="source-note">Clubs: ${article.clubs.map((c) => `<a href="/club.html?slug=${encodeURIComponent(c.slug)}">${escapeHtml(c.name)}</a>`).join(', ')}</p>` : ''}
      ${article.players && article.players.length ? `<p class="source-note">Players: ${article.players.map((p) => `<a href="/player.html?slug=${encodeURIComponent(p.slug)}">${escapeHtml(p.name)}</a>`).join(', ')}</p>` : ''}
      ${canonicalEventHtml}
      <div id="poll-root"></div>
    </div>`;

  loadPoll(article.id);
}

// Fan engagement (Poll model — server/routes/polls.js), e.g. "Player of
// the Match". Anonymous voting: one vote per device (getAnonymousId(),
// site.js), enforced server-side too, not just by hiding the buttons
// after voting.
function pollOptionBarHtml(option, totalVotes, isMine) {
  const pct = totalVotes ? Math.round((option.votes / totalVotes) * 100) : 0;
  return `
    <div class="poll-result-row${isMine ? ' poll-result-mine' : ''}" style="margin-bottom:0.5rem;">
      <div style="display:flex; justify-content:space-between; font-size:var(--text-small);">
        <span>${escapeHtml(option.label)}${isMine ? ' ✓' : ''}</span>
        <span>${pct}% (${option.votes})</span>
      </div>
      <div style="background:var(--sc-rule); height:8px; border-radius:4px; overflow:hidden;">
        <div style="background:var(--brand-gold); height:100%; width:${pct}%;"></div>
      </div>
    </div>`;
}

function renderPoll(poll, articleId) {
  const root = document.getElementById('poll-root');
  if (!root) return;
  if (!poll) {
    root.innerHTML = '';
    return;
  }

  if (poll.myOptionId) {
    root.innerHTML = `
      <div class="poll-card card" style="margin-top:1.5rem;">
        <h3 style="margin-top:0; font-size:1rem;">${escapeHtml(poll.question)}</h3>
        ${poll.options.map((o) => pollOptionBarHtml(o, poll.totalVotes, o.id === poll.myOptionId)).join('')}
        <p class="source-note">${poll.totalVotes} vote${poll.totalVotes === 1 ? '' : 's'} so far</p>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="poll-card card" style="margin-top:1.5rem;">
      <h3 style="margin-top:0; font-size:1rem;">${escapeHtml(poll.question)}</h3>
      <div class="poll-options" style="display:flex; flex-direction:column; gap:0.5rem;">
        ${poll.options.map((o) => `<button type="button" class="btn-outline-sm poll-vote-btn" data-option-id="${o.id}" style="text-align:left; width:100%;">${escapeHtml(o.label)}</button>`).join('')}
      </div>
      <p class="form-error" id="poll-vote-error" style="display:none;"></p>
    </div>`;

  root.querySelectorAll('.poll-vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => submitPollVote(poll.id, btn.dataset.optionId, articleId));
  });
}

async function loadPoll(articleId) {
  try {
    const anonymousId = getAnonymousId();
    const { poll } = await api(`/api/articles/${articleId}/poll${anonymousId ? `?anonymousId=${encodeURIComponent(anonymousId)}` : ''}`);
    renderPoll(poll, articleId);
  } catch {
    // No poll, or the fetch failed — a poll is a nice-to-have, never
    // worth breaking the rest of the article page over.
  }
}

async function submitPollVote(pollId, pollOptionId, articleId) {
  const anonymousId = getAnonymousId();
  const errorEl = document.getElementById('poll-vote-error');
  if (!anonymousId) {
    if (errorEl) { errorEl.textContent = 'Voting needs local storage enabled in your browser.'; errorEl.style.display = 'block'; }
    return;
  }
  try {
    const { poll } = await api(`/api/polls/${pollId}/vote`, { method: 'POST', body: JSON.stringify({ anonymousId, pollOptionId }) });
    renderPoll(poll, articleId);
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message; errorEl.style.display = 'block'; }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadArticle();
});
