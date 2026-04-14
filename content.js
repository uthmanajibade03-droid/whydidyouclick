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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getVideoInfo(link) {
    const href = link.href;
    const videoId = extractVideoId(href);
    if (!videoId) return null;

    const container = link.closest([
      'ytd-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-reel-item-renderer',
      'ytd-playlist-panel-video-renderer',
      'ytd-movie-renderer',
    ].join(', '));

    let title = '';
    let thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

    if (container) {
      const titleEl = container.querySelector(
        '#video-title, yt-formatted-string#video-title, span.yt-formatted-string#video-title'
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

    return { videoId, title, thumbnail, url: href };
  }

  // ─── Modal ───────────────────────────────────────────────────────────────

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
            <img
              class="wdyc-thumb"
              src="${escapeHtml(videoInfo.thumbnail)}"
              alt="Thumbnail"
              onerror="this.style.display='none'"
            />
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
            <textarea
              id="wdyc-note"
              class="wdyc-note"
              placeholder="What specifically inspires you? e.g. "Love the color contrast" or "Bold curiosity gap""
              rows="2"
            ></textarea>
          </div>

          <div class="wdyc-footer">
            <button class="wdyc-btn-just-watch">Just Watch</button>
            <div class="wdyc-footer-main">
              <button class="wdyc-btn wdyc-btn-skip">Save &amp; Watch</button>
              <button class="wdyc-btn wdyc-btn-save" disabled>Save</button>
            </div>
          </div>
        </div>
      `;

      let selectedType = null;

      const saveBtn = overlay.querySelector('.wdyc-btn-save');

      // Type picker
      overlay.querySelectorAll('.wdyc-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.querySelectorAll('.wdyc-type-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedType = btn.dataset.type;
          saveBtn.disabled = false;
        });
      });

      const close = (result) => {
        overlay.remove();
        modalOpen = false;
        resolve(result);
      };

      const doSave = (andWatch) => {
        if (!selectedType) return;
        const note = overlay.querySelector('.wdyc-note').value.trim();
        close({ save: true, watch: !!andWatch, type: selectedType, note });
      };

      saveBtn.addEventListener('click', () => doSave(false));
      overlay.querySelector('.wdyc-btn-skip').addEventListener('click', () => doSave(true));
      overlay.querySelector('.wdyc-btn-just-watch').addEventListener('click', () => close({ save: false, watch: true }));
      overlay.querySelector('.wdyc-close').addEventListener('click', () => close({ save: false, watch: false }));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close({ save: false, watch: false }); });

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close({ save: false, watch: false });
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && selectedType) doSave(false);
        // Keyboard shortcut: T = title, H = thumbnail, B = both
        if (!e.target.matches('textarea')) {
          if (e.key.toLowerCase() === 't') overlay.querySelector('[data-type="title"]').click();
          if (e.key.toLowerCase() === 'h') overlay.querySelector('[data-type="thumbnail"]').click();
          if (e.key.toLowerCase() === 'b') overlay.querySelector('[data-type="both"]').click();
        }
      });

      document.body.appendChild(overlay);
    });
  }

  // ─── Persist ─────────────────────────────────────────────────────────────

  function saveEntry(videoInfo, type, note) {
    return new Promise((resolve) => {
      const entry = {
        id: Date.now(),
        videoId: videoInfo.videoId,
        url: videoInfo.url,
        type,                                                     // 'title' | 'thumbnail' | 'both'
        note,
        date: new Date().toISOString(),
        title: (type === 'title' || type === 'both') ? videoInfo.title : null,
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

  // ─── Intercept clicks ─────────────────────────────────────────────────────

  document.addEventListener(
    'click',
    async function (e) {
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

      if (result.save) {
        await saveEntry(videoInfo, result.type, result.note);
      }

      if (result.watch) {
        window.location.href = videoInfo.url;
      }
    },
    true
  );
})();
