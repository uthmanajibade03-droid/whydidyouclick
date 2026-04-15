// Open the side panel when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ─── Transcript fetch ─────────────────────────────────────────────────────────

async function fetchTranscript(videoId) {
  const base = `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3`;

  async function tryFetch(url) {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const events = json.events || [];
    const text = events
      .flatMap(e => (e.segs || []).map(s => s.utf8 || ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text || null;
  }

  let text = await tryFetch(base + '&lang=en');
  if (!text) text = await tryFetch(base + '&tlang=en'); // auto-translate fallback
  return text;
}

async function handleFetchTranscript(videoId, sendResponse) {
  try {
    const text = await fetchTranscript(videoId);
    const fetchedAt = new Date().toISOString();

    // Evict oldest entries if over 50
    const stored = await chrome.storage.local.get(['transcripts']);
    const transcripts = stored.transcripts || {};
    const keys = Object.keys(transcripts);
    if (keys.length >= 50) {
      keys
        .sort((a, b) => (transcripts[a].fetchedAt > transcripts[b].fetchedAt ? 1 : -1))
        .slice(0, 5)
        .forEach(k => delete transcripts[k]);
    }

    if (text) {
      transcripts[videoId] = { text, fetchedAt };
    } else {
      transcripts[videoId] = { text: '', fetchedAt, unavailable: true };
    }

    await chrome.storage.local.set({ transcripts });
    sendResponse({ ok: true, unavailable: !text });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'FETCH_TRANSCRIPT') {
    handleFetchTranscript(msg.videoId, sendResponse);
    return true; // async response
  }
});
