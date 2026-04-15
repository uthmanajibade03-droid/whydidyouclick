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
  const diffSecs = Math.floor((now - d) / 1000);
  if (diffSecs < 60)   return 'Just now';
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0)  return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (diffDays === 1)  return 'Yesterday';
  if (diffDays < 7)   return `${diffDays} days ago`;
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

  const hasTranscript = tr && tr.text;

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
      <button class="lab-ai-btn" data-action="analyse" data-id="${entry.id}"
        ${hasTranscript ? '' : 'title="Save transcript first"'}>✨ Analyse</button>
      <button class="lab-ai-btn" data-action="rewrite" data-id="${entry.id}"
        ${hasTranscript ? '' : 'disabled title="Transcript required"'}>📝 Rewrite</button>
      <button class="btn-delete-lab" data-id="${entry.id}" title="Delete">🗑</button>
    </div>
    <div class="lab-ai-output" id="ai-out-${entry.id}" style="display:none"></div>
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

// ─── AI actions ───────────────────────────────────────────────────────────────

async function handleAiAction(action, entry, btn) {
  const outEl = document.getElementById(`ai-out-${entry.id}`);
  if (!outEl) return;

  const tr = transcriptCache[entry.videoId];
  const transcript = tr?.text || '';

  let messages;
  if (action === 'analyse') {
    messages = [{
      role: 'user',
      content: `You are a YouTube content strategist. Analyse this video and explain in 4–5 bullet points why it performs well and what creators can learn from it.

Title: ${entry.title || 'Unknown'}
Views: ${entry.views || '?'} | Likes: ${entry.likes || '?'} | Channel: ${entry.channelName || '?'} | Duration: ${entry.duration || '?'}
${transcript ? `\nTranscript (excerpt):\n${transcript.slice(0, 3000)}` : '(No transcript available)'}

Be concise and actionable.`,
    }];
  } else {
    if (!transcript) {
      outEl.style.display = 'block';
      outEl.innerHTML = '<p class="lab-ai-error">No transcript available to rewrite.</p>';
      return;
    }
    messages = [{
      role: 'user',
      content: `Rewrite this YouTube video transcript as a clean recording script I can use to create my own video on this topic. Keep the key ideas but use fresh language and clear structure.

Original transcript:
${transcript.slice(0, 4000)}

Format with clearly labelled sections (Intro, Main Points, CTA, etc.). Write in first person, conversational tone.`,
    }];
  }

  // Show loading state
  const origLabel = btn.textContent;
  btn.disabled = true;
  btn.classList.add('lab-ai-btn--loading');
  outEl.style.display = 'block';
  outEl.innerHTML = '<div class="lab-ai-loading"><span class="lab-ai-spinner"></span> Thinking…</div>';

  const result = await new Promise(resolve =>
    chrome.runtime.sendMessage({ action: 'CLAUDE_API', payload: { messages, maxTokens: 1024 } }, resolve)
  );

  btn.disabled = false;
  btn.classList.remove('lab-ai-btn--loading');
  btn.textContent = origLabel;

  if (result?.ok) {
    const uid = `${entry.id}-${action}`;
    outEl.innerHTML = `
      <div class="lab-ai-content">
        <div class="lab-ai-header">
          <span class="lab-ai-label">${action === 'analyse' ? '✨ Analysis' : '📝 Script'}</span>
          <button class="lab-ai-copy" data-uid="${uid}">Copy</button>
        </div>
        <pre class="lab-ai-text" id="ai-text-${uid}">${escapeHtml(result.content)}</pre>
      </div>
    `;
  } else {
    outEl.innerHTML = `<p class="lab-ai-error">⚠ ${escapeHtml(result?.error || 'Request failed')}</p>`;
  }
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
    views: null, likes: null, channelName: null, duration: null,
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
  if (e.target.classList.contains('btn-delete')) {
    const id = Number(e.target.dataset.id);
    allEntries = allEntries.filter(entry => entry.id !== id);
    chrome.storage.local.set({ entries: allEntries }, refresh);
  }
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

document.getElementById('lab-board').addEventListener('click', async (e) => {
  // Copy AI output
  if (e.target.classList.contains('lab-ai-copy')) {
    const uid = e.target.dataset.uid;
    const textEl = document.getElementById(`ai-text-${uid}`);
    if (textEl) {
      navigator.clipboard.writeText(textEl.textContent).then(() => {
        e.target.textContent = 'Copied!';
        setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
      });
    }
    return;
  }
  // AI action buttons
  if (e.target.classList.contains('lab-ai-btn') && !e.target.disabled) {
    const action = e.target.dataset.action;
    const id = Number(e.target.dataset.id);
    const entry = allLabEntries.find(en => en.id === id);
    if (entry) await handleAiAction(action, entry, e.target);
    return;
  }
  // Delete
  if (e.target.classList.contains('btn-delete-lab')) {
    const id = Number(e.target.dataset.id);
    allLabEntries = allLabEntries.filter(entry => entry.id !== id);
    chrome.storage.local.set({ labEntries: allLabEntries }, refreshLab);
  }
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
