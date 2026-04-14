'use strict';

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(isoDate) {
  const d = new Date(isoDate);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1)   return 'Just now';
  if (diffMins < 60)  return `${diffMins}m ago`;
  if (diffDays === 0) return 'Today at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// ─── Render ──────────────────────────────────────────────────────────────────

function buildEntryEl(entry) {
  const div = document.createElement('div');
  div.className = 'entry';
  div.dataset.id = entry.id;

  const thumbHtml = entry.thumbnail
    ? `<img class="entry-thumb" src="${escapeHtml(entry.thumbnail)}" alt="Thumbnail" onerror="this.style.display='none'">`
    : `<div class="entry-thumb entry-thumb-placeholder">▶</div>`;

  const titleHtml = entry.title
    ? `<div class="entry-title">${escapeHtml(entry.title)}</div>`
    : '';

  const reasonHtml = entry.reason
    ? `<div class="entry-reason">"${escapeHtml(entry.reason)}"</div>`
    : `<div class="entry-reason entry-reason-empty">(no reason given)</div>`;

  // Badge: what was saved
  const badges = [];
  if (entry.title)     badges.push('title');
  if (entry.thumbnail) badges.push('thumbnail');
  const badgeHtml = badges.map(b => `<span class="badge">${b}</span>`).join('');

  div.innerHTML = `
    <div class="entry-preview">
      ${thumbHtml}
      <div class="entry-meta">
        ${titleHtml}
        ${reasonHtml}
        <div class="entry-footer">
          <span class="entry-date">${formatDate(entry.date)}</span>
          <div class="entry-badges">${badgeHtml}</div>
        </div>
      </div>
    </div>
    <div class="entry-actions">
      <a href="${escapeHtml(entry.url)}" target="_blank" class="btn-watch" title="Watch video">▶ Watch</a>
      <button class="btn-delete" data-id="${entry.id}" title="Delete entry">✕</button>
    </div>
  `;

  return div;
}

function renderEntries(entries, filter = '') {
  const list = document.getElementById('entries-list');
  const q = filter.toLowerCase().trim();

  const filtered = q
    ? entries.filter(e =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.reason || '').toLowerCase().includes(q)
      )
    : entries;

  list.innerHTML = '';

  if (filtered.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.innerHTML = q
      ? `<span>No matches for "<strong>${escapeHtml(filter)}</strong>"</span>`
      : `<span>No saved reasons yet.<br>Click a YouTube video to get started! 🎬</span>`;
    list.appendChild(msg);
    return;
  }

  filtered.forEach(entry => list.appendChild(buildEntryEl(entry)));
}

function updateCount(entries) {
  const el = document.getElementById('entry-count');
  el.textContent = entries.length > 0 ? entries.length : '';
  el.title = `${entries.length} saved reason${entries.length !== 1 ? 's' : ''}`;
}

// ─── State ───────────────────────────────────────────────────────────────────

let allEntries = [];

function load() {
  chrome.storage.local.get(['entries'], (result) => {
    allEntries = result.entries || [];
    renderEntries(allEntries);
    updateCount(allEntries);
  });
}

load();

// ─── Event handlers ──────────────────────────────────────────────────────────

const searchInput = document.getElementById('search');
const clearSearchBtn = document.getElementById('btn-clear-search');

searchInput.addEventListener('input', () => {
  const q = searchInput.value;
  clearSearchBtn.hidden = !q;
  renderEntries(allEntries, q);
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.hidden = true;
  searchInput.focus();
  renderEntries(allEntries);
});

// Delete a single entry
document.getElementById('entries-list').addEventListener('click', (e) => {
  if (!e.target.classList.contains('btn-delete')) return;
  const id = Number(e.target.dataset.id);
  allEntries = allEntries.filter(entry => entry.id !== id);
  chrome.storage.local.set({ entries: allEntries }, () => {
    updateCount(allEntries);
    renderEntries(allEntries, searchInput.value);
  });
});

// Clear all
document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (!allEntries.length) return;
  if (!confirm(`Delete all ${allEntries.length} saved reason${allEntries.length !== 1 ? 's' : ''}?`)) return;
  allEntries = [];
  chrome.storage.local.set({ entries: [] }, () => {
    updateCount([]);
    renderEntries([]);
  });
});
