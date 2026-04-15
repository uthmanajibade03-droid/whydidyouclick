// Open the side panel when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

// ─── Transcript fetch — watch page parsing (most reliable) ───────────────────
//
// YouTube's /api/timedtext endpoint requires signed params we don't have.
// The real caption track URLs live inside the page's ytInitialPlayerResponse.
// We fetch the watch page, find "captionTracks":[…] with a bracket-counter
// (regex fails on large nested JSON), parse the array, then fetch the real URL.

function extractJsonArray(html, marker) {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  if (html[start] !== '[') return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (esc)        { esc = false; continue; }
    if (c === '\\') { esc = true;  continue; }
    if (c === '"')  { inStr = !inStr; continue; }
    if (inStr)      continue;
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      if (--depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); }
        catch (_) { return null; }
      }
    }
  }
  return null;
}

async function fetchTranscriptViaPage(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const tracks = extractJsonArray(html, '"captionTracks":');
    if (!tracks?.length) return null;

    // Prefer manual English > auto-generated English > any English > first track
    const track =
      tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr') ||
      tracks.find(t => t.languageCode === 'en') ||
      tracks.find(t => t.languageCode?.startsWith('en')) ||
      tracks[0];

    if (!track?.baseUrl) return null;

    const capRes = await fetch(track.baseUrl + '&fmt=json3');
    if (!capRes.ok) return null;
    const json = await capRes.json();
    const text = (json.events || [])
      .flatMap(e => (e.segs || []).map(s => s.utf8 || ''))
      .join(' ').replace(/\s+/g, ' ').trim();
    return text || null;
  } catch (_) {
    return null;
  }
}

async function handleFetchTranscript(videoId, sendResponse) {
  try {
    const text = await fetchTranscriptViaPage(videoId);
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
