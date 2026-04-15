(function () {
  if (window.__wdyc_injected) return;
  window.__wdyc_injected = true;

  let modalOpen = false;

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function extractVideoId(href) {
    let m = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    m = href.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    return null;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function cleanText(t) {
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  // ─── Video info (title + thumbnail) ──────────────────────────────────────

  const CONTAINER_SEL = [
    'ytd-rich-grid-media',           // home page inner media (closer to content)
    'ytd-video-renderer',
    'ytd-rich-item-renderer',
    'ytd-compact-video-renderer',    // watch page sidebar
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-movie-renderer',
    'ytd-radio-renderer',
  ].join(', ');

  function getVideoInfo(link) {
    const href = link.href;
    const videoId = extractVideoId(href);
    if (!videoId) return null;

    const container = link.closest(CONTAINER_SEL);
    let title = '';
    let thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

    if (container) {
      // ── A: attributes on known anchor elements ──────────────────────────
      for (const sel of ['a#video-title-link', 'a#video-title', 'a#thumbnail', 'ytd-thumbnail a']) {
        const el = container.querySelector(sel);
        const t = cleanText(el && (el.getAttribute('aria-label') || el.getAttribute('title')));
        if (t) { title = t; break; }
      }

      // ── B: innerText on title/heading elements (pierces open shadow DOM) ─
      if (!title) {
        for (const sel of ['h3 #video-title', 'h4 #video-title', '#video-title', 'h3', 'h4']) {
          const el = container.querySelector(sel);
          if (!el) continue;
          const t = cleanText(el.innerText || el.textContent);
          if (t) { title = t; break; }
        }
      }

      // ── C: open shadow root text on #video-title ─────────────────────────
      if (!title) {
        const el = container.querySelector('#video-title');
        if (el && el.shadowRoot) {
          title = cleanText(el.shadowRoot.textContent);
        }
      }

      // Thumbnail
      const thumbEl = container.querySelector('ytd-thumbnail img, #thumbnail img, yt-image img');
      if (thumbEl && thumbEl.src && !thumbEl.src.startsWith('data:')) {
        thumbnail = thumbEl.src;
      }
    }

    // ── D: walk up from the clicked link checking aria-label at each level ─
    if (!title) {
      let el = link;
      for (let i = 0; i < 12 && el && el !== document.body; i++, el = el.parentElement) {
        const t = cleanText(
          el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))
        );
        if (t && t.length > 3) { title = t; break; }
      }
    }

    // ── E: scan every link on the page that points to this video ─────────
    if (!title) {
      const candidates = document.querySelectorAll(
        `a[href*="v=${videoId}"][aria-label], a[href*="v=${videoId}"][title],` +
        `a[href*="/shorts/${videoId}"][aria-label], a[href*="/shorts/${videoId}"][title]`
      );
      for (const a of candidates) {
        const t = cleanText(a.getAttribute('aria-label') || a.getAttribute('title'));
        if (t && t.length > 3) { title = t; break; }
      }
    }

    // ── F: duration from thumbnail overlay (the badge on the card image) ──
    let duration = null;
    const container2 = link.closest(CONTAINER_SEL);
    if (container2) {
      // ytd-thumbnail-overlay-time-status-renderer holds the duration badge
      const durEl = container2.querySelector(
        'ytd-thumbnail-overlay-time-status-renderer span, ' +
        '#overlays .ytd-thumbnail-overlay-time-status-renderer, ' +
        'span.ytd-thumbnail-overlay-time-status-renderer'
      );
      if (durEl) {
        // aria-label has verbose text like "14 minutes, 41 seconds" — use textContent for "14:41"
        duration = cleanText(durEl.textContent) || null;
      }
    }

    return { videoId, title, thumbnail, url: href, duration };
  }

  // ─── Stats extraction (watch page only) ──────────────────────────────────

  function extractWatchPageStats(videoId) {
    try {
      const data = window.ytInitialData;
      const contents = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
      const primary = contents.find(c => c.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer;
      const secondary = contents.find(c => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;

      const views = primary?.viewCount?.videoViewCountRenderer?.viewCount?.simpleText || null;
      let likes = null;
      try {
        const btns = primary?.videoActions?.menuRenderer?.topLevelButtons || [];
        const likeBtn = btns[0];
        likes =
          likeBtn?.segmentedLikeDislikeButtonViewModel?.likeButtonViewModel
            ?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel
            ?.defaultButtonViewModel?.buttonViewModel?.title ||
          likeBtn?.toggleButtonRenderer?.defaultText?.accessibility?.accessibilityData?.label ||
          null;
      } catch (_) {}

      const channelName =
        secondary?.owner?.videoOwnerRenderer?.title?.runs?.[0]?.text || null;

      // Only read player duration when we're watching THIS exact video —
      // otherwise .ytp-time-duration shows the currently-playing video's length,
      // not the video being saved (causing every sidebar save to copy that duration).
      const currentId = new URLSearchParams(window.location.search).get('v');
      const duration = (currentId && currentId === videoId)
        ? (document.querySelector('.ytp-time-duration')?.textContent?.trim() || null)
        : null;

      return { views, likes, channelName, duration };
    } catch (_) {
      return { views: null, likes: null, channelName: null, duration: null };
    }
  }

  // ─── Persist ─────────────────────────────────────────────────────────────

  function saveEntry(videoInfo, type, note) {
    return new Promise((resolve) => {
      const entry = {
        id: Date.now(),
        videoId: videoInfo.videoId,
        url: videoInfo.url,
        type,
        note,
        date: new Date().toISOString(),
        title:     (type === 'title'     || type === 'both') ? videoInfo.title     : null,
        thumbnail: (type === 'thumbnail' || type === 'both') ? videoInfo.thumbnail : null,
      };
      chrome.storage.local.get(['entries'], (result) => {
        const entries = result.entries || [];
        entries.unshift(entry);
        if (entries.length > 1000) entries.splice(1000);
        chrome.storage.local.set({ entries }, resolve);
      });
    });
  }

  // ─── Direct transcript fetch (runs in YouTube page context — has user cookies) ─

  async function fetchTranscriptFromPage(videoId) {
    // Strategy 1: ytInitialPlayerResponse caption URL — instant on watch pages
    try {
      const tracks = window.ytInitialPlayerResponse
        ?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length) {
        const track = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
          || tracks.find(t => t.languageCode === 'en') || tracks[0];
        if (track?.baseUrl) {
          const res = await fetch(track.baseUrl + '&fmt=json3');
          if (res.ok) {
            const json = await res.json();
            const text = (json.events || [])
              .flatMap(e => (e.segs || []).map(s => s.utf8 || ''))
              .join(' ').replace(/\s+/g, ' ').trim();
            if (text) return text;
          }
        }
      }
    } catch (_) {}

    // Strategy 2: InnerTube API — called FROM the YT page so user cookies travel
    // with the request; background.js can't do this (different cookie context).
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          context: {
            client: { clientName: 'WEB', clientVersion: '2.20231121.01.00', hl: 'en', gl: 'US' },
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks?.length) {
          const track = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
            || tracks.find(t => t.languageCode === 'en') || tracks[0];
          if (track?.baseUrl) {
            const capRes = await fetch(track.baseUrl + '&fmt=json3');
            if (capRes.ok) {
              const json = await capRes.json();
              const text = (json.events || [])
                .flatMap(e => (e.segs || []).map(s => s.utf8 || ''))
                .join(' ').replace(/\s+/g, ' ').trim();
              if (text) return text;
            }
          }
        }
      }
    } catch (_) {}

    return null;
  }

  // ─── Message handler — background can ask us to fetch on its behalf ────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'FETCH_TRANSCRIPT_IN_PAGE') {
      fetchTranscriptFromPage(msg.videoId).then(text => {
        if (text) {
          chrome.runtime.sendMessage({ action: 'STORE_TRANSCRIPT', videoId: msg.videoId, text });
        }
        sendResponse({ ok: true, found: !!text });
      });
      return true;
    }
  });

  async function saveLabEntry(videoInfo) {
    const stats = extractWatchPageStats(videoInfo.videoId);
    const entry = {
      id: Date.now(),
      videoId: videoInfo.videoId,
      url: videoInfo.url,
      date: new Date().toISOString(),
      title: videoInfo.title,
      thumbnail: videoInfo.thumbnail,
      views: stats.views,
      likes: stats.likes,
      channelName: stats.channelName,
      // Card thumbnail overlay is the accurate source; player duration only
      // used when we're actually on this video's own watch page.
      duration: videoInfo.duration || stats.duration,
      transcriptStatus: 'pending',
    };

    // Persist the lab entry immediately so the panel shows it right away
    await new Promise(resolve => {
      chrome.storage.local.get(['labEntries'], (result) => {
        const labEntries = result.labEntries || [];
        const filtered = labEntries.filter(e => e.videoId !== entry.videoId);
        filtered.unshift(entry);
        if (filtered.length > 200) filtered.splice(200);
        chrome.storage.local.set({ labEntries: filtered }, resolve);
      });
    });

    // Fetch transcript in page context (has YouTube cookies — much faster)
    const text = await fetchTranscriptFromPage(videoInfo.videoId);
    if (text !== null) {
      // Send fetched text to background to store (or mark unavailable if empty)
      chrome.runtime.sendMessage({
        action: 'STORE_TRANSCRIPT',
        videoId: videoInfo.videoId,
        text: text || '',
      });
    } else {
      // Fallback: let background service worker try its own fetch
      chrome.runtime.sendMessage({ action: 'FETCH_TRANSCRIPT', videoId: videoInfo.videoId });
    }
  }

  // ─── Drop zone ────────────────────────────────────────────────────────────

  let dropZoneEl = null;
  let draggedInfo = null;

  function getDropZone() {
    if (dropZoneEl) return dropZoneEl;

    dropZoneEl = document.createElement('div');
    dropZoneEl.className = 'wdyc-drop-zone';
    dropZoneEl.innerHTML = `
      <div class="wdyc-dz-idle">
        <span class="wdyc-dz-icon">💡</span>
        <p class="wdyc-dz-label">Drop to save</p>
        <p class="wdyc-dz-sub">Saves title &amp; thumbnail</p>
      </div>
      <div class="wdyc-dz-saved">
        <span class="wdyc-dz-icon">✅</span>
        <p class="wdyc-dz-label">Saved!</p>
      </div>
    `;

    dropZoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dropZoneEl.classList.add('wdyc-dz-over');
    });
    dropZoneEl.addEventListener('dragleave', (e) => {
      if (!dropZoneEl.contains(e.relatedTarget)) {
        dropZoneEl.classList.remove('wdyc-dz-over');
      }
    });
    dropZoneEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZoneEl.classList.remove('wdyc-dz-over');
      if (!draggedInfo) return;
      await saveEntry(draggedInfo, 'both', '');
      draggedInfo = null;
      dropZoneEl.classList.add('wdyc-dz-success');
      setTimeout(() => dropZoneEl.classList.remove('wdyc-dz-success', 'wdyc-dz-visible'), 1200);
    });

    document.body.appendChild(dropZoneEl);
    return dropZoneEl;
  }

  // ─── Drag — card selector ─────────────────────────────────────────────────

  const CARD_SEL = [
    'ytd-rich-grid-media',
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-playlist-panel-video-renderer',
  ].join(', ');

  // Stamp draggable=true on every video card (and its thumbnail link)
  function makeDraggable() {
    document.querySelectorAll(CARD_SEL + ':not([data-wdyc-drag])').forEach(card => {
      card.dataset.wdycDrag = '1';
      card.setAttribute('draggable', 'true');
      // Also stamp the thumbnail <a> so dragging the image works reliably
      const thumbA = card.querySelector('a#thumbnail, ytd-thumbnail a');
      if (thumbA) thumbA.setAttribute('draggable', 'true');
    });
  }

  // ─── Drag events — document capture phase ────────────────────────────────
  // composedPath() pierces shadow DOM so we find the card even when the drag
  // starts from inside a yt-image or yt-formatted-string shadow root.

  function cardFromEvent(e) {
    // composedPath is the full path including shadow-DOM internals
    for (const el of (e.composedPath ? e.composedPath() : [])) {
      if (el.matches && el.matches(CARD_SEL)) return el;
    }
    // Fallback for browsers where composedPath isn't available
    return e.target.closest && e.target.closest(CARD_SEL);
  }

  document.addEventListener('dragstart', (e) => {
    const card = cardFromEvent(e);
    if (!card) return;

    const link = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    if (!link) return;

    const info = getVideoInfo(link);
    if (!info) return;

    draggedInfo = info;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', info.videoId);

    // Show the thumbnail as the drag ghost
    const thumb = card.querySelector('ytd-thumbnail img, #thumbnail img, yt-image img');
    if (thumb && thumb.naturalWidth) {
      try { e.dataTransfer.setDragImage(thumb, thumb.offsetWidth / 2, thumb.offsetHeight / 2); }
      catch (_) {}
    }

    requestAnimationFrame(() => getDropZone().classList.add('wdyc-dz-visible'));
  }, true);

  document.addEventListener('dragend', (e) => {
    if (!cardFromEvent(e)) return;
    const dz = getDropZone();
    setTimeout(() => {
      if (!dz.classList.contains('wdyc-dz-success')) {
        dz.classList.remove('wdyc-dz-visible', 'wdyc-dz-over');
      }
      draggedInfo = null;
    }, 80);
  }, true);

  // Re-stamp on SPA navigation + infinite scroll (shorter debounce = faster)
  let debounce = null;
  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(makeDraggable, 200);
  }).observe(document.body, { childList: true, subtree: true });

  makeDraggable();

  // ─── Modal ────────────────────────────────────────────────────────────────

  function showModal(videoInfo) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'wdyc-overlay';

      overlay.innerHTML = `
        <div class="wdyc-modal" role="dialog" aria-modal="true">
          <div class="wdyc-header">
            <span class="wdyc-header-icon">💡</span>
            <h2>Save to Inspiration Board</h2>
            <button class="wdyc-close" title="Close (Esc)">✕</button>
          </div>
          <div class="wdyc-preview">
            <img class="wdyc-thumb" src="${escapeHtml(videoInfo.thumbnail)}"
              alt="Thumbnail" onerror="this.style.display='none'"/>
            <span class="wdyc-video-title">
              ${escapeHtml(videoInfo.title) || '<em style="color:#999">Unknown title</em>'}
            </span>
          </div>
          <div class="wdyc-body">
            <p class="wdyc-section-label">What's inspiring you?</p>
            <div class="wdyc-type-picker">
              <button class="wdyc-type-btn" data-type="title">
                <span class="wdyc-type-icon">📝</span>
                <span class="wdyc-type-name">Title</span>
                <span class="wdyc-type-desc">The wording caught my eye</span>
              </button>
              <button class="wdyc-type-btn" data-type="thumbnail">
                <span class="wdyc-type-icon">🖼</span>
                <span class="wdyc-type-name">Thumbnail</span>
                <span class="wdyc-type-desc">The visual design is great</span>
              </button>
              <button class="wdyc-type-btn" data-type="both">
                <span class="wdyc-type-icon">✨</span>
                <span class="wdyc-type-name">Both</span>
                <span class="wdyc-type-desc">The full package works</span>
              </button>
            </div>
            <label class="wdyc-section-label" for="wdyc-note">
              Note <span class="wdyc-optional">(optional)</span>
            </label>
            <textarea id="wdyc-note" class="wdyc-note"
              placeholder='What specifically inspires you? e.g. "Love the color contrast"'
              rows="2"></textarea>
          </div>
          <div class="wdyc-footer">
            <button class="wdyc-btn-just-watch">Just Watch</button>
            <div class="wdyc-footer-main">
              <button class="wdyc-btn wdyc-btn-lab" title="Save to Content Lab (gets transcript + stats)">🧪 Save to Lab</button>
              <button class="wdyc-btn wdyc-btn-skip">Save &amp; Watch</button>
              <button class="wdyc-btn wdyc-btn-save" disabled>Save</button>
            </div>
          </div>
        </div>
      `;

      let selectedType = null;
      const saveBtn = overlay.querySelector('.wdyc-btn-save');

      overlay.querySelectorAll('.wdyc-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.querySelectorAll('.wdyc-type-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedType = btn.dataset.type;
          saveBtn.disabled = false;
        });
      });

      const close = (r) => { overlay.remove(); modalOpen = false; resolve(r); };
      const doSave = (watch) => {
        if (!selectedType) return;
        const note = overlay.querySelector('.wdyc-note').value.trim();
        close({ save: true, watch: !!watch, type: selectedType, note });
      };

      saveBtn.addEventListener('click', () => doSave(false));
      overlay.querySelector('.wdyc-btn-skip').addEventListener('click', () => doSave(true));
      overlay.querySelector('.wdyc-btn-lab').addEventListener('click', () => close({ save: false, lab: true, watch: false }));
      overlay.querySelector('.wdyc-btn-just-watch').addEventListener('click', () => close({ save: false, watch: true }));
      overlay.querySelector('.wdyc-close').addEventListener('click', () => close({ save: false, watch: false }));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close({ save: false, watch: false }); });
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close({ save: false, watch: false });
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && selectedType) doSave(false);
        if (!e.target.matches('textarea')) {
          if (e.key.toLowerCase() === 't') overlay.querySelector('[data-type="title"]').click();
          if (e.key.toLowerCase() === 'h') overlay.querySelector('[data-type="thumbnail"]').click();
          if (e.key.toLowerCase() === 'b') overlay.querySelector('[data-type="both"]').click();
        }
      });

      document.body.appendChild(overlay);
    });
  }

  // ─── Click intercept ──────────────────────────────────────────────────────

  document.addEventListener('click', async function (e) {
    if (modalOpen) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

    const link = e.target.closest('a[href*="/watch?v="], a[href*="/shorts/"]');
    if (!link) return;

    const videoInfo = getVideoInfo(link);
    if (!videoInfo) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    modalOpen = true;

    const result = await showModal(videoInfo);
    if (result.save) await saveEntry(videoInfo, result.type, result.note);
    if (result.lab)  await saveLabEntry(videoInfo);
    if (result.watch) window.location.href = videoInfo.url;
  }, true);

})();
