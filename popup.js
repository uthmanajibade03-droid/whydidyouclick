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
  if (isNaN(d)) return '';
  const now = new Date();
  const diffSecs = Math.floor((now - d) / 1000);
  if (diffSecs < 60)   return 'Just now';
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0)  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diffDays === 1)  return 'Yesterday ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diffDays < 7)   return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const TYPE_LABEL = { title: '📝 Title', thumbnail: '🖼 Thumbnail', both: '✨ Both' };

// ─── Mode switching ───────────────────────────────────────────────────────────

const PANELS = { inspiration: 'panel-inspiration', lab: 'panel-lab', settings: 'panel-settings' };
let activeMode = 'inspiration';

function switchToMode(mode) {
  activeMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  Object.values(PANELS).forEach(id => {
    document.getElementById(id).hidden = (id !== PANELS[mode]);
  });
}

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => switchToMode(btn.dataset.mode));
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

// Cleans raw transcript text for display — strips <c> word-timing tags and
// metadata lines that may be present in transcripts saved before the fetch fix.
function cleanTranscript(raw) {
  return (raw || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\n/g, ' ')
    .replace(/Kind:\s*captions\s*/gi, '')
    .replace(/Language:\s*[a-z-]+\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLabCard(entry, transcripts) {
  const tr = transcripts[entry.videoId];
  const status = tr
    ? (tr.unavailable ? 'unavailable' : 'fetched')
    : entry.transcriptStatus;

  const statusLabel = { pending: '⏳ Fetching…', fetched: '✅ Transcript ready', unavailable: '⚠️ No transcript' };
  const statusClass = { pending: 'ts-pending', fetched: 'ts-fetched', unavailable: 'ts-unavailable' };

  const transcriptText = tr && tr.text ? cleanTranscript(tr.text) : '';

  const statsHtml = [
    entry.views        && `<span class="lab-stat">👁 ${escapeHtml(entry.views)}</span>`,
    entry.likes        && `<span class="lab-stat">👍 ${escapeHtml(entry.likes)}</span>`,
    entry.duration     && `<span class="lab-stat">⏱ ${escapeHtml(entry.duration)}</span>`,
    entry.channelName  && `<span class="lab-stat">📺 ${escapeHtml(entry.channelName)}</span>`,
  ].filter(Boolean).join('');

  const hasTranscript = tr && tr.text;
  const isSelected = selectedLabIds.has(entry.id);

  const div = document.createElement('div');
  div.className = `lab-card${selectMode ? ' selectable' : ''}${isSelected ? ' selected' : ''}`;
  div.dataset.id = entry.id;
  div.innerHTML = `
    <div class="lab-card-top">
      ${selectMode ? `<div class="lab-select-chip${isSelected ? ' checked' : ''}" aria-hidden="true"><span class="lab-select-icon">${isSelected ? '✓' : ''}</span></div>` : ''}
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
    ${transcriptText ? `
      <details class="lab-transcript">
        <summary>Transcript</summary>
        <p class="lab-transcript-text">${escapeHtml(transcriptText)}</p>
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

// Shows an inline form asking what the user is repurposing the video for.
// Resolves with the intent string (may be empty) or null if cancelled.
function collectIntent(outEl, action) {
  return new Promise(resolve => {
    const actionLabel = action === 'analyse' ? 'Analyse' : 'Rewrite';
    outEl.style.display = 'block';
    outEl.innerHTML = `
      <div class="lab-intent-form">
        <p class="lab-intent-label">What are you repurposing this for?</p>
        <p class="lab-intent-sub">Tell the AI your goal — same format, different angle, short-form, etc.</p>
        <textarea class="lab-intent-input" rows="3"
          placeholder="e.g. A YouTube Short targeting beginners who want to learn AI without coding…"></textarea>
        <div class="lab-intent-actions">
          <button class="lab-intent-submit">${actionLabel} →</button>
          <button class="lab-intent-cancel">Cancel</button>
        </div>
      </div>
    `;
    const input  = outEl.querySelector('.lab-intent-input');
    const submit = outEl.querySelector('.lab-intent-submit');
    const cancel = outEl.querySelector('.lab-intent-cancel');
    input.focus();
    const done = (val) => { submit.removeEventListener('click', onSubmit); cancel.removeEventListener('click', onCancel); resolve(val); };
    const onSubmit = () => done(input.value.trim());
    const onCancel = () => { outEl.style.display = 'none'; done(null); };
    submit.addEventListener('click', onSubmit);
    cancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSubmit(); });
  });
}

async function handleAiAction(action, entry, btn) {
  const outEl = document.getElementById(`ai-out-${entry.id}`);
  if (!outEl) return;

  const tr = transcriptCache[entry.videoId];
  const transcript = cleanTranscript(tr?.text);

  // Collect repurposing intent before calling the API
  const intent = await collectIntent(outEl, action);
  if (intent === null) return; // user cancelled

  let messages;
  if (action === 'analyse') {
    messages = [{
      role: 'user',
      content: `You are a YouTube content strategist. Analyse this video and explain in 4–5 bullet points why it performs well and what creators can learn from it.

Title: ${entry.title || 'Unknown'}
Views: ${entry.views || '?'} | Likes: ${entry.likes || '?'} | Channel: ${entry.channelName || '?'} | Duration: ${entry.duration || '?'}
${transcript ? `\nTranscript (excerpt):\n${transcript.slice(0, 3000)}` : '(No transcript available)'}
${intent ? `\nRepurposing goal: ${intent}` : ''}

Tailor your analysis to help achieve the stated goal. Be concise and actionable.`,
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
${intent ? `\nI'm creating: ${intent}` : ''}

Original transcript:
${transcript.slice(0, 4000)}

Format with clearly labelled sections (Intro, Main Points, CTA, etc.). Write in first person, conversational tone. Adapt the depth, tone, and format to suit the stated goal.`,
    }];
  }

  // Show loading state
  const origLabel = btn.textContent;
  btn.disabled = true;
  btn.classList.add('lab-ai-btn--loading');
  outEl.style.display = 'block';
  outEl.innerHTML = '<div class="lab-ai-loading"><span class="lab-ai-spinner"></span> Thinking…</div>';

  const result = await new Promise(resolve =>
    chrome.runtime.sendMessage({ action: 'CLAUDE_API', payload: { messages, maxTokens: 1500 } }, resolve)
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

// ─── Batch repurpose ──────────────────────────────────────────────────────────

async function handleBatchRepurpose(entries) {
  // Show intent form in a dedicated overlay div
  const batchOutEl = document.getElementById('lab-batch-output');
  const intent = await collectIntent(batchOutEl, 'batch');
  if (intent === null) return;

  const btn = document.getElementById('btn-batch-repurpose');
  const origLabel = btn.textContent;
  btn.disabled = true;
  batchOutEl.style.display = 'block';
  batchOutEl.innerHTML = '<div class="lab-ai-loading"><span class="lab-ai-spinner"></span> Synthesising…</div>';

  // Build per-video context, sharing token budget evenly
  const perBudget = Math.floor(5400 / entries.length);
  const videosContext = entries.map((entry, i) => {
    const tr = cleanTranscript(transcriptCache[entry.videoId]?.text || '');
    const trExcerpt = tr ? `\nTranscript:\n${tr.slice(0, perBudget)}${tr.length > perBudget ? '…' : ''}` : '\n(No transcript available)';
    return `--- Video ${i + 1}: ${entry.title || 'Unknown'} ---\nChannel: ${entry.channelName || '?'} | Views: ${entry.views || '?'} | Duration: ${entry.duration || '?'}${trExcerpt}`;
  }).join('\n\n');

  const messages = [{
    role: 'user',
    content: `You are a YouTube content strategist. I've selected ${entries.length} videos as reference material for creating new content.
${intent ? `\nMy goal: ${intent}\n` : ''}
Here are the reference videos:

${videosContext}

Based on ALL these videos:
1. Identify the strongest ideas, hooks, angles, and structures they share or each uniquely offer
2. Synthesise a content outline that combines the best elements
3. Write a working script or detailed outline I can record from

Format with clearly labelled sections (Hook, Intro, Main Points, CTA, etc.). Write in first person, conversational tone. Tailor everything to the stated goal.`,
  }];

  const result = await new Promise(resolve =>
    chrome.runtime.sendMessage({ action: 'CLAUDE_API', payload: { messages, maxTokens: 2000 } }, resolve)
  );

  btn.disabled = false;
  btn.textContent = origLabel;

  if (result?.ok) {
    const uid = `batch-${Date.now()}`;
    batchOutEl.innerHTML = `
      <div class="lab-ai-content">
        <div class="lab-ai-header">
          <span class="lab-ai-label">🔄 Batch Script (${entries.length} videos)</span>
          <button class="lab-ai-copy" data-uid="${uid}">Copy</button>
        </div>
        <pre class="lab-ai-text" id="ai-text-${uid}">${escapeHtml(result.content)}</pre>
      </div>
    `;
  } else {
    batchOutEl.innerHTML = `<p class="lab-ai-error">⚠ ${escapeHtml(result?.error || 'Request failed')}</p>`;
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

let allEntries    = [];
let allLabEntries = [];
let transcriptCache = {};
let activeFilter  = 'all';
let searchQuery   = '';
let labQuery      = '';
let selectMode    = false;
let selectedLabIds = new Set();

function refresh()    { renderInspiration(allEntries, activeFilter, searchQuery); }
function refreshLab() { renderLab(allLabEntries, transcriptCache, labQuery); }

function updateBatchBar() {
  const bar   = document.getElementById('lab-batch-bar');
  const count = document.getElementById('lab-batch-count');
  const n = selectedLabIds.size;
  bar.hidden = n === 0;
  count.textContent = `${n} video${n !== 1 ? 's' : ''} selected`;
}

function toggleSelectMode(on) {
  selectMode = on;
  const btn = document.getElementById('btn-lab-select');
  btn.classList.toggle('active', on);
  btn.textContent = on ? 'Done' : 'Select';
  if (!on) {
    selectedLabIds.clear();
    updateBatchBar();
  }
  refreshLab();
}

function sendToLab(entry, btn) {
  const labEntry = {
    id: Date.now(),
    videoId: entry.videoId,
    url: entry.url,
    date: entry.date,   // preserve original discovery date
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
      switchToMode('lab');
      if (btn) { btn.textContent = '✅'; btn.disabled = true; }
    });
  });
}

// Initial load
chrome.storage.local.get(['entries', 'labEntries', 'transcripts', 'settings', 'pendingMode'], (result) => {
  allEntries      = result.entries      || [];
  allLabEntries   = result.labEntries   || [];
  transcriptCache = result.transcripts  || {};
  refresh();
  refreshLab();
  const s = result.settings || {};
  document.getElementById('settings-api-key').value = s.claudeApiKey || '';
  document.getElementById('settings-model').value   = s.claudeModel  || 'claude-sonnet-4-6';
  // Auto-switch to Content Lab if triggered by a "Save to Lab" action
  if (result.pendingMode === 'lab') {
    switchToMode('lab');
    chrome.storage.local.remove('pendingMode');
  }
});

// Real-time updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.entries)     { allEntries      = changes.entries.newValue      || []; refresh(); }
  if (changes.labEntries)  { allLabEntries   = changes.labEntries.newValue   || []; refreshLab(); }
  if (changes.transcripts) { transcriptCache = changes.transcripts.newValue  || {}; refreshLab(); }
  // Switch to Content Lab when content.js signals a new save
  if (changes.pendingMode?.newValue === 'lab') {
    switchToMode('lab');
    chrome.storage.local.remove('pendingMode');
  }
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

document.getElementById('btn-lab-select').addEventListener('click', () => {
  toggleSelectMode(!selectMode);
});

document.getElementById('lab-board').addEventListener('click', async (e) => {
  // In select mode, clicking anywhere on the card (except action buttons) toggles selection
  if (selectMode) {
    const skip = e.target.closest('.lab-actions, .lab-transcript, .lab-ai-output, a');
    if (!skip) {
      const card = e.target.closest('.lab-card');
      if (card) {
        const id = Number(card.dataset.id);
        if (selectedLabIds.has(id)) selectedLabIds.delete(id);
        else selectedLabIds.add(id);
        // Re-render just this card's classes and chip
        card.classList.toggle('selected', selectedLabIds.has(id));
        const chip = card.querySelector('.lab-select-chip');
        const icon = card.querySelector('.lab-select-icon');
        if (chip) chip.classList.toggle('checked', selectedLabIds.has(id));
        if (icon) icon.textContent = selectedLabIds.has(id) ? '✓' : '';
        updateBatchBar();
        return;
      }
    }
  }
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
    selectedLabIds.delete(id);
    allLabEntries = allLabEntries.filter(entry => entry.id !== id);
    chrome.storage.local.set({ labEntries: allLabEntries }, () => { updateBatchBar(); refreshLab(); });
  }
});

document.getElementById('btn-batch-repurpose').addEventListener('click', () => {
  const entries = allLabEntries.filter(e => selectedLabIds.has(e.id));
  if (entries.length) handleBatchRepurpose(entries);
});

document.getElementById('btn-batch-deselect').addEventListener('click', () => {
  selectedLabIds.clear();
  updateBatchBar();
  refreshLab();
});

document.getElementById('btn-clear-lab').addEventListener('click', () => {
  if (!allLabEntries.length) return;
  if (!confirm(`Delete all ${allLabEntries.length} Content Lab entries?`)) return;
  allLabEntries = [];
  chrome.storage.local.set({ labEntries: [] }, refreshLab);
});

// ─── Settings — server status check ──────────────────────────────────────────

async function checkServerStatus() {
  const dot   = document.getElementById('server-dot');
  const label = document.getElementById('server-label');
  dot.className   = 'server-dot dot-checking';
  label.textContent = 'Checking…';
  try {
    const res = await fetch('http://localhost:3000/', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.className   = 'server-dot dot-online';
      label.textContent = 'Server running — transcripts will use yt_dlp';
    } else {
      throw new Error();
    }
  } catch (_) {
    dot.className   = 'server-dot dot-offline';
    label.textContent = 'Server offline — run launch.command to start it';
  }
}

// Check on open and on button click
checkServerStatus();
document.getElementById('btn-check-server').addEventListener('click', checkServerStatus);

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
