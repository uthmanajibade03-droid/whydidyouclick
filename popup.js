'use strict';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMins = Math.floor((now - d) / 60000);
  if (diffMins < 1)  return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const TYPE_LABEL = { title: '📝 Title', thumbnail: '🖼 Thumbnail', both: '✨ Both' };

// ─── Card builders ───────────────────────────────────────────────────────────

function buildThumbnailCard(entry) {
  // Large thumbnail tile — shown in thumbnail & both views
  const div = document.createElement('div');
  div.className = 'card card-thumb';
  div.dataset.id = entry.id;

  div.innerHTML = `
    <div class="card-img-wrap">
      <img src="${escapeHtml(entry.thumbnail)}" alt="Thumbnail" onerror="this.closest('.card-img-wrap').classList.add('img-error')">
      <div class="card-overlay">
        <a href="${escapeHtml(entry.url)}" target="_blank" class="btn-watch">▶ Watch</a>
        <button class="btn-delete" data-id="${entry.id}">✕</button>
      </div>
    </div>
    ${entry.title ? `<p class="card-title-small">${escapeHtml(entry.title)}</p>` : ''}
    ${entry.note ? `<p class="card-note">"${escapeHtml(entry.note)}"</p>` : ''}
    <div class="card-footer">
      <span class="type-badge type-${entry.type}">${TYPE_LABEL[entry.type]}</span>
      <span class="card-date">${formatDate(entry.date)}</span>
    </div>
  `;

  return div;
}

function buildTitleCard(entry) {
  // Text-focused row — shown in title-only view
  const div = document.createElement('div');
  div.className = 'card card-title-row';
  div.dataset.id = entry.id;

  div.innerHTML = `
    <div class="title-row-body">
      <p class="title-text">${escapeHtml(entry.title) || '<em>Untitled</em>'}</p>
      ${entry.note ? `<p class="card-note">"${escapeHtml(entry.note)}"</p>` : ''}
      <div class="card-footer">
        <span class="type-badge type-${entry.type}">${TYPE_LABEL[entry.type]}</span>
        <span class="card-date">${formatDate(entry.date)}</span>
      </div>
    </div>
    <div class="title-row-actions">
      <a href="${escapeHtml(entry.url)}" target="_blank" class="btn-watch-sm" title="Watch">▶</a>
      <button class="btn-delete" data-id="${entry.id}" title="Delete">✕</button>
    </div>
  `;

  return div;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function buildCard(entry) {
  // Show thumbnail card if the entry has a thumbnail saved; title row otherwise
  if (entry.thumbnail) return buildThumbnailCard(entry);
  return buildTitleCard(entry);
}

function countFor(entries, filter) {
  if (filter === 'all') return entries.length;
  return entries.filter(e => e.type === filter || (filter === 'thumbnail' && e.type === 'both') || (filter === 'title' && e.type === 'both')).length;
}

function filterEntries(entries, filter, query) {
  let list = entries;

  if (filter !== 'all') {
    list = list.filter(e =>
      e.type === filter ||
      e.type === 'both'
    );
  }

  if (query) {
    const q = query.toLowerCase();
    list = list.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.note  || '').toLowerCase().includes(q)
    );
  }

  return list;
}

function render(entries, filter, query) {
  const board = document.getElementById('board');
  board.innerHTML = '';

  // Update tab counts
  document.getElementById('count-all').textContent       = entries.length || '';
  document.getElementById('count-thumbnail').textContent = entries.filter(e => e.thumbnail).length || '';
  document.getElementById('count-title').textContent     = entries.filter(e => e.title).length || '';

  const list = filterEntries(entries, filter, query);

  if (!list.length) {
    board.innerHTML = `<div class="empty">
      ${query ? `No matches for "<strong>${escapeHtml(query)}</strong>"` : 'Nothing saved yet — browse YouTube and save what inspires you! 🎬'}
    </div>`;
    return;
  }

  // Split into thumb cards (grid) and title-only rows (list)
  const thumbCards  = list.filter(e => e.thumbnail);
  const titleOnlyCards = list.filter(e => !e.thumbnail && e.title);

  if (thumbCards.length) {
    const grid = document.createElement('div');
    grid.className = 'thumb-grid';
    thumbCards.forEach(e => grid.appendChild(buildCard(e)));
    board.appendChild(grid);
  }

  if (titleOnlyCards.length) {
    if (thumbCards.length) {
      const sep = document.createElement('div');
      sep.className = 'section-label';
      sep.textContent = '📝 Title references';
      board.appendChild(sep);
    }
    const titleList = document.createElement('div');
    titleList.className = 'title-list';
    titleOnlyCards.forEach(e => titleList.appendChild(buildCard(e)));
    board.appendChild(titleList);
  }
}

// ─── State & events ───────────────────────────────────────────────────────────

let allEntries = [];
let activeFilter = 'all';
let searchQuery = '';

function refresh() {
  render(allEntries, activeFilter, searchQuery);
}

chrome.storage.local.get(['entries'], (result) => {
  allEntries = result.entries || [];
  refresh();
});

// Real-time update — fires the moment a drag-save or modal-save writes to storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.entries) {
    allEntries = changes.entries.newValue || [];
    refresh();
  }
});

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter;
    refresh();
  });
});

// Search
document.getElementById('search').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  refresh();
});

// Delete (event delegation)
document.getElementById('board').addEventListener('click', (e) => {
  if (!e.target.classList.contains('btn-delete')) return;
  const id = Number(e.target.dataset.id);
  allEntries = allEntries.filter(entry => entry.id !== id);
  chrome.storage.local.set({ entries: allEntries }, refresh);
});

// Clear all
document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (!allEntries.length) return;
  if (!confirm(`Delete all ${allEntries.length} saved inspiration${allEntries.length !== 1 ? 's' : ''}?`)) return;
  allEntries = [];
  chrome.storage.local.set({ entries: [] }, refresh);
});
