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

// ─── Transcript fetch ─────────────────────────────────────────────────────────
//
// Background service workers use the extension's own cookie jar — NOT the user's
// browser session. InnerTube requires YouTube session cookies, so it only works
// when called from a content script (content.js fetchTranscriptFromPage Strategy 2).
// From background, the reliable fallback is watch-page HTML parsing.
//
// Primary path: background delegates to an open YouTube tab via
// chrome.tabs.sendMessage → content script calls fetchTranscriptFromPage() with
// the user's cookies. The code below is only reached when no YT tab is available.

function pickTrack(tracks) {
  return (
    tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr') || // manual EN
    tracks.find(t => t.languageCode === 'en') ||                      // auto-gen EN
    tracks.find(t => t.languageCode?.startsWith('en')) ||             // en-GB etc.
    tracks[0]                                                         // whatever exists
  );
}

// Parses YouTube json3 caption events into clean plain text.
// Strips <c> word-timing tags and "Kind: captions / Language:" metadata lines.
function parseTranscriptEvents(events) {
  return (events || [])
    .flatMap(e => (e.segs || []).map(s =>
      (s.utf8 || '').replace(/<[^>]*>/g, '').replace(/\n/g, ' ')
    ))
    .filter(s => s && !s.startsWith('Kind:') && !s.startsWith('Language:'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

async function trackToText(track) {
  if (!track?.baseUrl) return null;
  const res = await fetch(track.baseUrl + '&fmt=json3');
  if (!res.ok) return null;
  const json = await res.json();
  return parseTranscriptEvents(json.events);
}

// Strategy 1 — InnerTube API (fast, structured, same API yt-dlp uses)
async function fetchViaInnerTube(videoId) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20231121.01.00',
          hl: 'en',
          gl: 'US',
        },
      },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) return null;
  return trackToText(pickTrack(tracks));
}

// Strategy 2 — Watch-page HTML parsing (fallback)
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

async function fetchViaPageParse(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const tracks = extractJsonArray(html, '"captionTracks":');
  if (!tracks?.length) return null;
  return trackToText(pickTrack(tracks));
}

// Strategy 0 — local transcript-getter server (yt_dlp, most reliable)
// User runs launch.command from the transcript-getter folder first.
// Falls back silently if server isn't running.
async function fetchViaLocalServer(videoId) {
  const res = await fetch('http://localhost:3000/get-transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error || !data.transcript?.length) return null;
  // data.transcript is [{timestamp, end_time, text}, ...]  — join paragraphs
  return data.transcript.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim() || null;
}

async function fetchTranscript(videoId) {
  // 1. Local yt_dlp server (best — if running)
  try {
    const text = await fetchViaLocalServer(videoId);
    if (text) return text;
  } catch (_) {}
  // 2. Watch-page HTML parse (background has no user session cookies so
  //    InnerTube is skipped here — it's used in content.js instead)
  try {
    return await fetchViaPageParse(videoId);
  } catch (_) {}
  return null;
}

async function handleFetchTranscript(videoId, sendResponse) {
  // Prefer delegating to an open YouTube tab — content scripts have the user's
  // cookies and can call the InnerTube API successfully where background can't.
  try {
    const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' });
    for (const tab of tabs) {
      try {
        const result = await chrome.tabs.sendMessage(tab.id, {
          action: 'FETCH_TRANSCRIPT_IN_PAGE', videoId,
        });
        if (result?.found) { sendResponse({ ok: true }); return; }
      } catch (_) {}
    }
  } catch (_) {}

  // No YouTube tab available — try from background (cookies may be absent)
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
  if (msg.action === 'OPEN_SIDE_PANEL_LAB') {
    // Set a flag so the popup switches to Content Lab when it (re)opens
    chrome.storage.local.set({ pendingMode: 'lab' });
    // Also try to open the panel immediately (requires user gesture propagation)
    if (_sender.tab?.windowId) {
      chrome.sidePanel.open({ windowId: _sender.tab.windowId }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }
});
