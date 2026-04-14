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
      'ytd-radio-renderer',
      'ytd-channel-video-player-renderer',
    ].join(', '));

    let title = '';
    let thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

    if (container) {
      const titleSelectors = [
        'h3 #video-title', 'h4 #video-title', '#video-title',
        'yt-formatted-string#video-title', 'span#video-title', 'h3', 'h4',
      ];
      for (const sel of titleSelectors) {
        const el = container.querySelector(sel);
        const text = el && (el.innerText || el.textContent || '').trim();
        if (text) { title = text; break; }
      }

      const thumbEl = container.querySelector('ytd-thumbnail img, #thumbnail img, yt-image img');
      if (thumbEl && thumbEl.src && !thumbEl.src.startsWith('data:')) {
        thumbnail = thumbEl.src;
      }
    }

    if (!title) {
      const thumbLink = container ? container.querySelector('a#thumbnail, ytd-thumbnail a') : null;
      title = (thumbLink || link).getAttribute('aria-label') || '';
    }
    if (!title) {
      title = link.getAttribute('title') || link.getAttribute('aria-label') || '';
    }

    return { videoId, title, thumbnail, url: href };
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

  // ─── Drop zone ───────────────────────────────────────────────────────────

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
      setTimeout(() => {
        dropZoneEl.classList.remove('wdyc-dz-success', 'wdyc-dz-visible');
      }, 1200);
    });

    document.body.appendChild(dropZoneEl);
    return dropZoneEl;
  }

  // ─── Make cards draggable ────────────────────────────────────────────────

  const CARD_SELECTOR = [
    'ytd-video-renderer',
    'ytd-rich-item-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
  ].join(', ');

  function makeDraggable() {
    document.querySelectorAll(CARD_SELECTOR + ':not([data-wdyc-drag])').forEach(card => {
      card.dataset.wdycDrag = '1';
      card.setAttribute('draggable', 'true');

      card.addEventListener('dragstart', (e) => {
        const link = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
        if (!link) { e.preventDefault(); return; }

        const info = getVideoInfo(link);
        if (!info) { e.preventDefault(); return; }

        draggedInfo = info;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', info.videoId);

        const dz = getDropZone();
        requestAnimationFrame(() => dz.classList.add('wdyc-dz-visible'));
      });

      card.addEventListener('dragend', () => {
        const dz = getDropZone();
        // Give the drop handler time to fire first
        setTimeout(() => {
          if (!dz.classList.contains('wdyc-dz-success')) {
            dz.classList.remove('wdyc-dz-visible', 'wdyc-dz-over');
          }
          draggedInfo = null;
        }, 80);
      });
    });
  }

  // Re-run whenever YouTube adds new video cards (SPA navigation / infinite scroll)
  let debounceTimer = null;
  new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(makeDraggable, 400);
  }).observe(document.body, { childList: true, subtree: true });

  makeDraggable();

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
        if (!e.target.matches('textarea')) {
          if (e.key.toLowerCase() === 't') overlay.querySelector('[data-type="title"]').click();
          if (e.key.toLowerCase() === 'h') overlay.querySelector('[data-type="thumbnail"]').click();
          if (e.key.toLowerCase() === 'b') overlay.querySelector('[data-type="both"]').click();
        }
      });

      document.body.appendChild(overlay);
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
