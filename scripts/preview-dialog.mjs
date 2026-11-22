/**
 * One YouTube preview player, created only after a click.
 * Listing pages do not include an iframe. The lesson page player is paused
 * while a preview is open so only one embed is loaded.
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const EMBED_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

export function embedUrl(youtubeId) {
  if (typeof youtubeId !== 'string' || !YOUTUBE_ID.test(youtubeId)) return null;
  return `https://www.youtube.com/embed/${youtubeId}?autoplay=1`;
}

/** Catalog lesson path. Rejects protocol-relative and off-site values. */
export function lessonPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '';
  return value;
}

/** Standard watch URL only. Embed URLs and other hosts are not accepted. */
export function watchUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || url.pathname !== '/watch') {
      return '';
    }
    if (!YOUTUBE_ID.test(url.searchParams.get('v') ?? '')) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function bindPreview(doc, win) {
  const dialog = doc.querySelector('#quick-preview');
  if (!dialog || dialog.getAttribute('data-bound') === 'true') return null;
  dialog.setAttribute('data-bound', 'true');

  const frame = dialog.querySelector('[data-preview-frame]');
  const title = dialog.querySelector('#quick-preview-title');
  const fallback = dialog.querySelector('[data-preview-fallback]');
  const closeButton = dialog.querySelector('[data-preview-close]');
  if (!frame || !title || !fallback || !closeButton) return null;

  let opener = null;
  let scrollY = 0;
  let stashed = [];
  let inerted = [];

  function releaseBackground() {
    for (const node of inerted) node.removeAttribute('inert');
    inerted = [];
  }

  function inertBackground() {
    releaseBackground();
    const children = doc.body?.children;
    if (!children) return;
    for (const child of children) {
      if (child === dialog || child.hasAttribute('inert')) continue;
      child.setAttribute('inert', '');
      inerted.push(child);
    }
  }

  function focusable() {
    return [...dialog.querySelectorAll('button, a[href], iframe')].filter((node) => !node.hidden);
  }

  function clearFrame() {
    for (const iframe of frame.querySelectorAll('iframe')) iframe.removeAttribute('src');
    frame.replaceChildren();
  }

  function restoreOtherPlayers() {
    for (const item of stashed) {
      if (item.frame.isConnected) item.frame.setAttribute('src', item.src);
    }
    stashed = [];
  }

  function quiesceOtherPlayers() {
    stashed = [];
    for (const other of doc.querySelectorAll('iframe')) {
      if (dialog.contains(other)) continue;
      const src = other.getAttribute('src');
      if (!src || !src.startsWith('https://www.youtube.com/embed/')) continue;
      stashed.push({ frame: other, src });
      other.removeAttribute('src');
    }
  }

  function showFallback(show) {
    fallback.hidden = !show;
    frame.hidden = show;
  }

  function setLinks(lesson, watch) {
    for (const link of dialog.querySelectorAll('[data-preview-lesson]')) {
      if (lesson) link.setAttribute('href', lesson);
    }
    for (const link of dialog.querySelectorAll('[data-preview-watch]')) {
      if (watch) link.setAttribute('href', watch);
      link.hidden = !watch;
    }
  }

  function shutdown() {
    if (!dialog.open) return;
    dialog.close();
  }

  dialog.addEventListener('close', () => {
    clearFrame();
    showFallback(false);
    restoreOtherPlayers();
    releaseBackground();
    title.textContent = '';
    win.scrollTo(0, scrollY);
    const target = opener;
    opener = null;
    const restoreFocus = () => {
      if (target && target.isConnected && !target.closest('[hidden]')) target.focus();
    };
    restoreFocus();
    win.requestAnimationFrame?.(restoreFocus);
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !dialog.open) return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) shutdown();
  });

  closeButton.addEventListener('click', () => shutdown());

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dialog.open) shutdown();
  });

  doc.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-preview]');
    if (!button || dialog.contains(button)) return;
    event.preventDefault();

    const src = embedUrl(button.getAttribute('data-preview'));
    const lesson = lessonPath(button.getAttribute('data-catalog-path'));
    const watch = watchUrl(button.getAttribute('data-watch'));
    const label = button.getAttribute('data-title') || '';

    if (dialog.open) shutdown();
    button.focus();
    opener = button;
    scrollY = win.scrollY || 0;
    title.textContent = label;
    setLinks(lesson, watch);
    frame.classList.toggle('portrait', button.getAttribute('data-portrait') === 'true');
    clearFrame();
    quiesceOtherPlayers();

    if (!src) {
      showFallback(true);
    } else {
      showFallback(false);
      const iframe = doc.createElement('iframe');
      iframe.setAttribute('src', src);
      iframe.setAttribute('title', label || 'Quick preview');
      iframe.setAttribute('allow', EMBED_ALLOW);
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      iframe.addEventListener('error', () => {
        clearFrame();
        showFallback(true);
      });
      frame.append(iframe);
    }

    inertBackground();
    dialog.showModal();
    win.scrollTo(0, scrollY);
    closeButton.focus();
  });

  return dialog;
}
