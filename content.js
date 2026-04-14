(function () {
  if (window.__wdyc_injected) return;
  window.__wdyc_injected = true;

  let modalOpen = false;

  // ─── Helpers ──────────────────────────────────────────────────────────────

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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Extract info from the clicked video card ──────────────────────────────

  function getVideoInfo(link, clickedEl) {
    const href = link.href;
    const videoId = extractVideoId(href);
    if (!videoId) return null;

    // Determine intent from which part of the card was clicked
    const isThumbClick = !!clickedEl.closest(
      'ytd-thumbnail, #thumbnail, .ytd-thumbnail, yt-image, ytd-rich-thumbnail'
    );
    const isTitleClick = !!clickedEl.closest(
      '#video-title, h3.ytd-video-renderer, .title.ytd-compact-video-renderer, yt-formatted-string#video-title'
    );

    // Walk up to the nearest video card container
    const container = link.closest([
      'ytd-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-reel-item-renderer',
      'ytd-playlist-panel-video-renderer',
      'ytd-movie-renderer',
    ].join(', '));

    // Fallback thumbnail from YouTube's CDN (always available)
    let thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    let title = '';

    if (container) {
      const titleEl = container.querySelector(
        '#video-title, yt-formatted-string#video-title, span.yt-formatted-string#video-title, a.yt-simple-endpoint'
      );
      if (titleEl) title = titleEl.textContent.trim();

      const thumbEl = container.querySelector('ytd-thumbnail img, #thumbnail img, yt-image img');
      if (thumbEl && thumbEl.src && !thumbEl.src.startsWith('data:')) {
        thumbnail = thumbEl.src;
      }
    }

    if (!title) {
      title = link.getAttribute('aria-label') || link.getAttribute('title') || '';
    }

    // Pre-check save options based on where the user clicked
    let defaultSaveTitle = true;
    let defaultSaveThumbnail = true;

    if (isThumbClick && !isTitleClick) {
      defaultSaveTitle = false;
    } else if (isTitleClick && !isThumbClick) {
      defaultSaveThumbnail = false;
    }
    // Clicking anywhere else (e.g. the card itself) → save both

    return { videoId, title, thumbnail, url: href, defaultSaveTitle, defaultSaveThumbnail };
  }

  // ─── Modal ─────────────────────────────────────────────────────────────────

  function showModal(videoInfo) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'wdyc-overlay';

      overlay.innerHTML = `
        <div class="wdyc-modal" role="dialog" aria-modal="true" aria-label="Why did you click this?">
          <div class="wdyc-header">
            <span class="wdyc-icon" aria-hidden="true">🤔</span>
            <h2>Why did you click this?</h2>
            <button class="wdyc-close" title="Close (Esc)">✕</button>
          </div>

          <div class="wdyc-preview">
            <img
              class="wdyc-thumb"
              src="${escapeHtml(videoInfo.thumbnail)}"
              alt="Video thumbnail"
              onerror="this.style.display='none'"
            />
            <span class="wdyc-video-title">
              ${escapeHtml(videoInfo.title) || '<em style="color:#999">Unknown title</em>'}
            </span>
          </div>

          <div class="wdyc-body">
            <label class="wdyc-label" for="wdyc-reason-input">Your reason</label>
            <textarea
              id="wdyc-reason-input"
              class="wdyc-reason"
              placeholder="I clicked this because…"
              rows="3"
            ></textarea>

            <div class="wdyc-save-options">
              <span class="wdyc-save-label">Save:</span>
              <label class="wdyc-checkbox-label">
                <input type="checkbox" class="wdyc-check-title" ${videoInfo.defaultSaveTitle ? 'checked' : ''}>
                Title
              </label>
              <label class="wdyc-checkbox-label">
                <input type="checkbox" class="wdyc-check-thumb" ${videoInfo.defaultSaveThumbnail ? 'checked' : ''}>
                Thumbnail
              </label>
            </div>
          </div>

          <div class="wdyc-footer">
            <button class="wdyc-btn wdyc-btn-skip">Just Watch</button>
            <button class="wdyc-btn wdyc-btn-save">Save &amp; Watch</button>
          </div>
        </div>
      `;

      const close = (result) => {
        overlay.remove();
        modalOpen = false;
        resolve(result);
      };

      const doSave = () => {
        const reason = overlay.querySelector('.wdyc-reason').value.trim();
        const saveTitle = overlay.querySelector('.wdyc-check-title').checked;
        const saveThumbnail = overlay.querySelector('.wdyc-check-thumb').checked;
        close({ save: true, reason, saveTitle, saveThumbnail });
      };

      overlay.querySelector('.wdyc-btn-save').addEventListener('click', doSave);
      overlay.querySelector('.wdyc-btn-skip').addEventListener('click', () => close({ save: false }));
      overlay.querySelector('.wdyc-close').addEventListener('click', () => close({ save: false }));

      // Click outside modal → dismiss
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close({ save: false });
      });

      // Keyboard shortcuts
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close({ save: false });
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doSave();
      });

      document.body.appendChild(overlay);

      // Focus textarea after paint
      requestAnimationFrame(() => {
        const ta = overlay.querySelector('.wdyc-reason');
        if (ta) ta.focus();
      });
    });
  }

  // ─── Persist entry ─────────────────────────────────────────────────────────

  function saveEntry(videoInfo, reason, saveTitle, saveThumbnail) {
    return new Promise((resolve) => {
      const entry = {
        id: Date.now(),
        videoId: videoInfo.videoId,
        url: videoInfo.url,
        reason: reason || '',
        date: new Date().toISOString(),
        title: saveTitle ? videoInfo.title : null,
        thumbnail: saveThumbnail ? videoInfo.thumbnail : null,
      };

      chrome.storage.local.get(['entries'], (result) => {
        const entries = result.entries || [];
        entries.unshift(entry);
        if (entries.length > 500) entries.splice(500); // rolling cap
        chrome.storage.local.set({ entries }, resolve);
      });
    });
  }

  // ─── Click interception ────────────────────────────────────────────────────

  document.addEventListener(
    'click',
    async function (e) {
      if (modalOpen) return;

      // Only plain left-clicks (no open-in-new-tab shortcuts)
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

      const link = e.target.closest('a[href*="/watch?v="], a[href*="/shorts/"]');
      if (!link) return;

      const videoInfo = getVideoInfo(link, e.target);
      if (!videoInfo) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      modalOpen = true;

      const result = await showModal(videoInfo);

      if (result.save) {
        await saveEntry(videoInfo, result.reason, result.saveTitle, result.saveThumbnail);
      }

      // Navigate to the video (full load — reliable across YouTube SPA state)
      window.location.href = videoInfo.url;
    },
    true // capture phase — fires before YouTube's own handlers
  );
})();
