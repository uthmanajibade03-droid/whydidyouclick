// Open the side panel when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ─── Shared eviction ──────────────────────────────────────────────────────────

function evictOldTranscripts(transcripts) {
  const keys = Object.keys(transcripts);
  if (keys.length >= 50) {
    keys
      .sort((a, b) => (transcripts[a].fetchedAt > transcripts[b].fetchedAt ? 1 : -1))
      .slice(0, 5)
      .forEach(k => delete transcripts[k]);
  }
}

async function writeTranscript(videoId, text) {
  const stored = await chrome.storage.local.get(['transcripts']);
  const transcripts = stored.transcripts || {};
  evictOldTranscripts(transcripts);
  transcripts[videoId] = text
    ? { text, fetchedAt: new Date().toISOString() }
    : { text: '', fetchedAt: new Date().toISOString(), unavailable: true };
  await chrome.storage.local.set({ transcripts });
}

// ─── FETCH_TRANSCRIPT — background fetches from YouTube timedtext API ─────────

async function fetchTranscript(videoId) {
  const base = `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3`;
  async function tryFetch(url) {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const text = (json.events || [])
      .flatMap(e => (e.segs || []).map(s => s.utf8 || ''))
      .join(' ').replace(/\s+/g, ' ').trim();
    return text || null;
  }
  let text = await tryFetch(base + '&lang=en');
  if (!text) text = await tryFetch(base + '&tlang=en');
  return text;
}

async function handleFetchTranscript(videoId, sendResponse) {
  try {
    const text = await fetchTranscript(videoId);
    await writeTranscript(videoId, text);
    sendResponse({ ok: true, unavailable: !text });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── STORE_TRANSCRIPT — content.js already fetched it, just persist ───────────

async function handleStoreTranscript(videoId, text, sendResponse) {
  try {
    await writeTranscript(videoId, text || null);
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── CLAUDE_API — proxy AI calls (background has host_permissions) ────────────

async function handleClaudeApi(payload, sendResponse) {
  try {
    const stored = await chrome.storage.local.get(['settings']);
    const { claudeApiKey: apiKey, claudeModel: model } = stored.settings || {};
    if (!apiKey) {
      sendResponse({ ok: false, error: 'No API key configured. Add it in Settings ⚙.' });
      return;
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: payload.maxTokens || 1024,
        messages: payload.messages,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      sendResponse({ ok: false, error: err.error?.message || `API error ${res.status}` });
      return;
    }
    const data = await res.json();
    sendResponse({ ok: true, content: data.content[0].text });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'FETCH_TRANSCRIPT') {
    handleFetchTranscript(msg.videoId, sendResponse);
    return true;
  }
  if (msg.action === 'STORE_TRANSCRIPT') {
    handleStoreTranscript(msg.videoId, msg.text, sendResponse);
    return true;
  }
  if (msg.action === 'CLAUDE_API') {
    handleClaudeApi(msg.payload, sendResponse);
    return true;
  }
});
