'use strict';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Mode switching ───────────────────────────────────────────────────────────

const PANELS = { inspiration: 'panel-inspiration', lab: 'panel-lab', settings: 'panel-settings' };
let activeMode = 'inspiration';

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeMode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(PANELS).forEach(id => {
      document.getElementById(id).hidden = (id !== PANELS[activeMode]);
    });
  });
});

// ─── Inspiration Board — card builders ───────────────────────────────────────

function buildThumbnailCard(entry) {
  const div = document.createElement('div');
  div.className = 'card card-thumb';
  div.dataset.id = entry.id;
  div.innerHTML = `
    <div class="card-img-wrap">
      <img src="${escapeHtml(entry.thumbnail)}" alt="Thumbnail" onerror="this.closest('.card-img-wrap').classList.add('img-error')">
      <div class="card-overlay">
        <a href="${escapeHtml(entry.url)}" target="_blank" class="btn-watch">▶ Watch</a>
        <button class="btn-send-lab" data-id="${entry.id}" title="Send to Content Lab">🧪</button>
        <button class="btn-delete" data-id="${entry.id}">✕</button>
      </div>
    </div>
    ${entry.title ? `<p class="card-title-small">${escapeHtml(entry.title)}</p>` : ''}
    ${entry.note  ? `<p class="card-note">"${escapeHtml(entry.note)}"</p>` : ''}
    <div class="card-footer">
      <span class="type-badge type-${entry.type}">${TYPE_LABEL[entry.type]}</span>
      <span class="card-date">${formatDate(entry.date)}</span>
    </div>
  `;
  return div;
}

function buildTitleCard(entry) {
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
      <button class="btn-send-lab" data-id="${entry.id}" title="Send to Content Lab">🧪</button>
      <button class="btn-delete" data-id="${entry.id}" title="Delete">✕</button>
    </div>
  `;
  return div;
}

function buildInspirationCard(entry) {
  return entry.thumbnail ? buildThumbnailCard(entry) : buildTitleCard(entry);
}

function filterEntries(entries, filter, query) {
  let list = filter === 'all' ? entries : entries.filter(e => e.type === filter || e.type === 'both');
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.note  || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderInspiration(entries, filter, query) {
  const board = document.getElementById('board');
  board.innerHTML = '';
  document.getElementById('count-all').textContent       = entries.length || '';
  document.getElementById('count-thumbnail').textContent = entries.filter(e => e.thumbnail).length || '';
  document.getElementById('count-title').textContent     = entries.filter(e => e.title).length || '';

  const list = filterEntries(entries, filter, query);
  if (!list.length) {
    board.innerHTML = `<div class="empty">${query ? `No matches for "<strong>${escapeHtml(query)}</strong>"` : 'Nothing saved yet — browse YouTube and save what inspires you! 🎬'}</div>`;
    return;
  }
  const thumbCards     = list.filter(e => e.thumbnail);
  const titleOnlyCards = list.filter(e => !e.thumbnail && e.title);
  if (thumbCards.length) {
    const grid = document.createElement('div');
    grid.className = 'thumb-grid';
    thumbCards.forEach(e => grid.appendChild(buildInspirationCard(e)));
    board.appendChild(grid);
  }
  if (titleOnlyCards.length) {
    if (thumbCards.length) {
      const sep = document.createElement('div');
      sep.className = 'section-label';
      sep.textContent = '📝 Title references';
      board.appendChild(sep);
    }
    const tList = document.createElement('div');
    tList.className = 'title-list';
    titleOnlyCards.forEach(e => tList.appendChild(buildInspirationCard(e)));
    board.appendChild(tList);
  }
}

// ─── Content Lab — card builder ───────────────────────────────────────────────

function buildLabCard(entry, transcripts) {
  const tr = transcripts[entry.videoId];
  const status = tr
    ? (tr.unavailable ? 'unavailable' : 'fetched')
    : entry.transcriptStatus;

  const statusLabel = { pending: '⏳ Fetching…', fetched: '✅ Transcript ready', unavailable: '⚠️ No transcript' };
  const statusClass = { pending: 'ts-pending', fetched: 'ts-fetched', unavailable: 'ts-unavailable' };

  const transcriptPreview = tr && tr.text
    ? tr.text.slice(0, 500) + (tr.text.length > 500 ? '…' : '')
    : '';

  const statsHtml = [
    entry.views        && `<span class="lab-stat">👁 ${escapeHtml(entry.views)}</span>`,
    entry.likes        && `<span class="lab-stat">👍 ${escapeHtml(entry.likes)}</span>`,
    entry.duration     && `<span class="lab-stat">⏱ ${escapeHtml(entry.duration)}</span>`,
    entry.channelName  && `<span class="lab-stat">📺 ${escapeHtml(entry.channelName)}</span>`,
  ].filter(Boolean).join('');

  const div = document.createElement('div');
  div.className = 'lab-card';
  div.dataset.id = entry.id;
  div.innerHTML = `
    <div class="lab-card-top">
      <img class="lab-thumb" src="${escapeHtml(entry.thumbnail)}"
        alt="Thumbnail" onerror="this.style.display='none'">
      <div class="lab-card-meta">
        <p class="lab-title">${escapeHtml(entry.title) || '<em>Unknown title</em>'}</p>
        ${statsHtml ? `<div class="lab-stats">${statsHtml}</div>` : ''}
        <div class="lab-card-footer">
          <span class="transcript-badge ${statusClass[status] || 'ts-pending'}">${statusLabel[status] || statusLabel.pending}</span>
          <span class="card-date">${formatDate(entry.date)}</span>
        </div>
      </div>
    </div>
    ${transcriptPreview ? `
      <details class="lab-transcript">
        <summary>Transcript preview</summary>
        <p class="lab-transcript-text">${escapeHtml(transcriptPreview)}</p>
      </details>
    ` : ''}
    <div class="lab-actions">
      <a href="${escapeHtml(entry.url)}" target="_blank" class="btn-watch">▶ Watch</a>
      <button class="lab-ai-btn" disabled title="AI features coming in Phase 2">✨ Analyse</button>
      <button class="lab-ai-btn" disabled title="AI features coming in Phase 2">📝 Rewrite</button>
      <button class="btn-delete-lab" data-id="${entry.id}" title="Delete">🗑</button>
    </div>
  `;
  return div;
}

function renderLab(labEntries, transcripts, query) {
  const board = document.getElementById('lab-board');
  board.innerHTML = '';

  const countEl = document.getElementById('lab-count');
  countEl.textContent = labEntries.length ? `${labEntries.length} saved` : '';

  let list = labEntries;
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.channelName || '').toLowerCase().includes(q)
    );
  }

  if (!list.length) {
    board.innerHTML = `<div class="empty">${query ? `No matches for "<strong>${escapeHtml(query)}</strong>"` : 'No videos saved yet.<br>Click a video and choose 🧪 <strong>Save to Lab</strong>.'}</div>`;
    return;
  }

  list.forEach(e => board.appendChild(buildLabCard(e, transcripts)));
}

// ─── State ────────────────────────────────────────────────────────────────────

let allEntries    = [];
let allLabEntries = [];
let transcriptCache = {};
let activeFilter  = 'all';
let searchQuery   = '';
let labQuery      = '';

function refresh()    { renderInspiration(allEntries, activeFilter, searchQuery); }
function refreshLab() { renderLab(allLabEntries, transcriptCache, labQuery); }

function sendToLab(entry, btn) {
  const labEntry = {
    id: Date.now(),
    videoId: entry.videoId,
    url: entry.url,
    date: new Date().toISOString(),
    title: entry.title || '',
    thumbnail: entry.thumbnail || `https://i.ytimg.com/vi/${entry.videoId}/mqdefault.jpg`,
    views: null,
    likes: null,
    channelName: null,
    duration: null,
    transcriptStatus: 'pending',
  };
  chrome.storage.local.get(['labEntries'], (result) => {
    const labEntries = result.labEntries || [];
    const filtered = labEntries.filter(e => e.videoId !== labEntry.videoId);
    filtered.unshift(labEntry);
    if (filtered.length > 200) filtered.splice(200);
    chrome.storage.local.set({ labEntries: filtered }, () => {
      chrome.runtime.sendMessage({ action: 'FETCH_TRANSCRIPT', videoId: labEntry.videoId });
      allLabEntries = filtered;
      refreshLab();
      if (btn) { btn.textContent = '✅'; btn.disabled = true; }
    });
  });
}

// Initial load
chrome.storage.local.get(['entries', 'labEntries', 'transcripts', 'settings'], (result) => {
  allEntries      = result.entries      || [];
  allLabEntries   = result.labEntries   || [];
  transcriptCache = result.transcripts  || {};
  refresh();
  refreshLab();
  // Populate settings fields
  const s = result.settings || {};
  document.getElementById('settings-api-key').value = s.claudeApiKey || '';
  document.getElementById('settings-model').value   = s.claudeModel  || 'claude-sonnet-4-6';
});

// Real-time updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.entries)     { allEntries      = changes.entries.newValue      || []; refresh(); }
  if (changes.labEntries)  { allLabEntries   = changes.labEntries.newValue   || []; refreshLab(); }
  if (changes.transcripts) { transcriptCache = changes.transcripts.newValue  || {}; refreshLab(); }
});

// ─── Inspiration Board events ─────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter;
    refresh();
  });
});

document.getElementById('search').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  refresh();
});

document.getElementById('board').addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-send-lab')) {
    const id = Number(e.target.dataset.id);
    const entry = allEntries.find(en => en.id === id);
    if (entry) sendToLab(entry, e.target);
    return;
  }
  if (!e.target.classList.contains('btn-delete')) return;
  const id = Number(e.target.dataset.id);
  allEntries = allEntries.filter(entry => entry.id !== id);
  chrome.storage.local.set({ entries: allEntries }, refresh);
});

document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (!allEntries.length) return;
  if (!confirm(`Delete all ${allEntries.length} saved inspiration${allEntries.length !== 1 ? 's' : ''}?`)) return;
  allEntries = [];
  chrome.storage.local.set({ entries: [] }, refresh);
});

// ─── Content Lab events ───────────────────────────────────────────────────────

document.getElementById('lab-search').addEventListener('input', (e) => {
  labQuery = e.target.value;
  refreshLab();
});

document.getElementById('lab-board').addEventListener('click', (e) => {
  if (!e.target.classList.contains('btn-delete-lab')) return;
  const id = Number(e.target.dataset.id);
  allLabEntries = allLabEntries.filter(entry => entry.id !== id);
  chrome.storage.local.set({ labEntries: allLabEntries }, refreshLab);
});

document.getElementById('btn-clear-lab').addEventListener('click', () => {
  if (!allLabEntries.length) return;
  if (!confirm(`Delete all ${allLabEntries.length} Content Lab entries?`)) return;
  allLabEntries = [];
  chrome.storage.local.set({ labEntries: [] }, refreshLab);
});

// ─── Settings events ──────────────────────────────────────────────────────────

document.getElementById('btn-save-settings').addEventListener('click', () => {
  const key   = document.getElementById('settings-api-key').value.trim();
  const model = document.getElementById('settings-model').value;
  const status = document.getElementById('settings-status');
  chrome.storage.local.set({ settings: { claudeApiKey: key || null, claudeModel: model } }, () => {
    status.textContent = 'Saved!';
    status.style.color = '#22c55e';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
});
