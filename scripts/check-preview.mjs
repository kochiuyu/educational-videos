/**
 * Preview behavior and markup.
 * Opening a preview creates one embed. Closing it removes that embed,
 * returns focus, and restores scroll. Navigation tiles do not preview.
 */

import { bindPreview, embedUrl, lessonPath, watchUrl } from './preview-dialog.mjs';

const errors = [];
function fail(message) {
  errors.push(message);
}

function makeDom() {
  const listeners = new Map();
  const root = {
    tag: 'document',
    parent: null,
    children: [],
    attrs: new Map(),
    hidden: false,
    listeners: new Map(),
    classList: classList(),
  };
  root.root = root;

  function classList() {
    const names = new Set();
    return {
      toggle(name, force) {
        if (force) names.add(name);
        else names.delete(name);
      },
      contains(name) {
        return names.has(name);
      },
    };
  }

  function matches(el, sel) {
    if (sel.startsWith('#')) return el.attrs.get('id') === sel.slice(1);
    if (sel === 'iframe') return el.tag === 'iframe';
    if (sel.startsWith('[') && sel.endsWith(']')) {
      const name = sel.slice(1, -1);
      if (name === 'hidden') return el.hidden === true;
      return el.attrs.has(name);
    }
    return false;
  }

  function walk(el, visit) {
    for (const child of el.children) {
      visit(child);
      walk(child, visit);
    }
  }

  function enhance(el) {
    el.root = root;
    el.attrs = new Map();
    el.children = [];
    el.parent = null;
    el.hidden = false;
    el.open = false;
    el.listeners = new Map();
    el.classList = classList();
    el.textContent = '';
    el.getAttribute = (name) => (el.attrs.has(name) ? el.attrs.get(name) : null);
    el.setAttribute = (name, value) => el.attrs.set(name, String(value));
    el.removeAttribute = (name) => el.attrs.delete(name);
    el.addEventListener = (type, fn) => {
      const list = el.listeners.get(type) ?? [];
      list.push(fn);
      el.listeners.set(type, list);
    };
    el.dispatch = (type, extra = {}) => {
      const event = {
        type,
        target: extra.target ?? el,
        key: extra.key,
        preventDefault() {},
      };
      const chain = [];
      let current = event.target;
      while (current) {
        chain.push(current);
        current = current.parent;
      }
      for (const node of chain) {
        for (const fn of node.listeners.get(type) ?? []) fn(event);
      }
    };
    el.closest = (sel) => {
      let current = el;
      while (current && current !== root) {
        if (matches(current, sel)) return current;
        current = current.parent;
      }
      return null;
    };
    el.contains = (node) => {
      let current = node;
      while (current) {
        if (current === el) return true;
        current = current.parent;
      }
      return false;
    };
    Object.defineProperty(el, 'isConnected', {
      get() {
        let current = el;
        while (current) {
          if (current === root) return true;
          current = current.parent;
        }
        return false;
      },
    });
    el.append = (child) => {
      child.parent = el;
      el.children.push(child);
    };
    el.replaceChildren = () => {
      for (const child of el.children) child.parent = null;
      el.children = [];
    };
    el.focus = () => {
      root.active = el;
    };
    el.showModal = () => {
      el.open = true;
    };
    el.close = () => {
      if (!el.open) return;
      el.open = false;
      el.dispatch('close');
    };
    el.querySelector = (sel) => {
      let found = null;
      walk(el, (child) => {
        if (!found && matches(child, sel)) found = child;
      });
      return found;
    };
    el.querySelectorAll = (sel) => {
      const found = [];
      walk(el, (child) => {
        if (matches(child, sel)) found.push(child);
      });
      return found;
    };
    return el;
  }

  function create(tag) {
    return enhance({ tag });
  }

  root.createElement = create;
  root.addEventListener = (type, fn) => {
    const list = listeners.get(type) ?? [];
    list.push(fn);
    listeners.set(type, list);
  };
  root.listeners = listeners;
  root.querySelector = (sel) => {
    let found = null;
    walk(root, (child) => {
      if (!found && matches(child, sel)) found = child;
    });
    return found;
  };
  root.querySelectorAll = (sel) => {
    const found = [];
    walk(root, (child) => {
      if (matches(child, sel)) found.push(child);
    });
    return found;
  };
  root.dispatch = (type, extra = {}) => {
    const event = {
      type,
      target: extra.target ?? root,
      key: extra.key,
      preventDefault() {},
    };
    const chain = [];
    let current = event.target;
    while (current) {
      chain.push(current);
      current = current.parent;
    }
    for (const node of chain) {
      for (const fn of node.listeners.get(type) ?? []) fn(event);
    }
  };
  root.append = (child) => {
    child.parent = root;
    root.children.push(child);
  };

  const win = {
    scrollY: 0,
    scrollTo(_x, y) {
      this.scrollY = y;
    },
  };
  return { root, win, create };
}

function field(el, name, value) {
  el.setAttribute(name, value);
  return el;
}

function buildDialog(create) {
  const dialog = field(create('dialog'), 'id', 'quick-preview');
  const close = field(create('button'), 'data-preview-close', '');
  const title = field(create('p'), 'id', 'quick-preview-title');
  const frame = field(create('div'), 'data-preview-frame', '');
  const fallback = field(create('p'), 'data-preview-fallback', '');
  const lesson = field(create('a'), 'data-preview-lesson', '');
  const watch = field(create('a'), 'data-preview-watch', '');
  dialog.append(close);
  dialog.append(title);
  dialog.append(frame);
  dialog.append(fallback);
  dialog.append(lesson);
  dialog.append(watch);
  return { dialog, close, title, frame, fallback, lesson, watch };
}

function buttonFor(create, id, { hidden = false, watch = `https://www.youtube.com/watch?v=${id}` } = {}) {
  const item = create('li');
  item.hidden = hidden;
  const button = create('button');
  const icon = create('span');
  button.append(icon);
  field(button, 'data-preview', id);
  field(button, 'data-title', `Title ${id}`);
  field(button, 'data-catalog-path', `/educational-videos/videos/${id}/`);
  field(button, 'data-watch', watch);
  field(button, 'data-portrait', id.startsWith('S') ? 'true' : 'false');
  item.append(button);
  return { item, button, icon };
}

if (embedUrl('VS7Qbq07ATM') !== 'https://www.youtube.com/embed/VS7Qbq07ATM?autoplay=1') {
  fail('preview embed URL is not a standard autoplay embed');
}
if (embedUrl('short') !== null || embedUrl('https://evil.example/VS7Qbq07ATM') !== null) {
  fail('preview embed URL accepted a value that is not a video id');
}
if (lessonPath('//evil.example') || lessonPath('https://evil.example/videos/x/')) {
  fail('preview lesson path accepted an off-site URL');
}
if (watchUrl('https://www.youtube.com/embed/VS7Qbq07ATM') || watchUrl('https://evil.example/watch?v=VS7Qbq07ATM')) {
  fail('preview watch link accepted a non-watch URL');
}

{
  const { root, win, create } = makeDom();
  const { dialog, close, frame, fallback, lesson, watch } = buildDialog(create);
  const pageFrame = field(create('iframe'), 'src', 'https://www.youtube.com/embed/AAAAAAAAAAA');
  const first = buttonFor(create, 'VS7Qbq07ATM');
  const second = buttonFor(create, 'dgh99RbB43s');
  const hidden = buttonFor(create, 'Yb4eqJPlp5g', { hidden: true });
  const bad = buttonFor(create, 'not-an-id!!', { watch: 'notaurl' });
  root.append(dialog);
  root.append(pageFrame);
  root.append(first.item);
  root.append(second.item);
  root.append(hidden.item);
  root.append(bad.item);
  bindPreview(root, win);
  bindPreview(root, win);

  win.scrollY = 480;
  first.icon.dispatch('click');
  const opened = frame.querySelectorAll('iframe');
  if (!dialog.open || opened.length !== 1) fail('opening a preview did not create one player');
  if (opened[0]?.getAttribute('src') !== 'https://www.youtube.com/embed/VS7Qbq07ATM?autoplay=1') {
    fail(`preview iframe src was ${opened[0]?.getAttribute('src')}`);
  }
  if (opened[0]?.getAttribute('title') !== 'Title VS7Qbq07ATM') fail('preview iframe title is not the recording title');
  if (pageFrame.getAttribute('src') !== null) fail('opening a preview left another YouTube player loaded');
  if (lesson.getAttribute('href') !== '/educational-videos/videos/VS7Qbq07ATM/') {
    fail('preview lesson link does not open the catalog recording');
  }
  if (root.active !== close) fail('preview did not move focus into the dialog');
  if (win.scrollY !== 480) fail('opening a preview changed the scroll position');
  if (frame.classList.contains('portrait')) fail('landscape recording was marked portrait');
  if ((dialog.listeners.get('click') ?? []).length !== 1) fail('preview dialog was bound more than once');

  second.button.dispatch('click');
  const replaced = frame.querySelectorAll('iframe');
  if (replaced.length !== 1 || !replaced[0].getAttribute('src').includes('dgh99RbB43s')) {
    fail('a second preview left more than one player or kept the first video');
  }
  if (root.querySelectorAll('iframe').filter((node) => node.getAttribute('src')).length !== 1) {
    fail('two preview players were loaded at once');
  }

  win.scrollY = 480;
  close.dispatch('click');
  if (dialog.open || frame.querySelector('iframe')) fail('Close left the preview player in the page');
  if (pageFrame.getAttribute('src') !== 'https://www.youtube.com/embed/AAAAAAAAAAA') {
    fail('closing the preview did not restore the lesson player');
  }
  if (root.active !== second.button) fail('closing the preview did not restore focus');
  if (win.scrollY !== 480) fail('closing the preview did not restore scroll');

  hidden.button.dispatch('click');
  if (!frame.querySelector('iframe')?.getAttribute('src')?.includes('Yb4eqJPlp5g')) {
    fail('the preview used a card other than the one that was activated');
  }
  close.dispatch('click');
  if (root.active === hidden.button) fail('focus returned to a filtered-out card');

  const before = root.querySelectorAll('iframe').length;
  bad.button.dispatch('click');
  if (frame.querySelector('iframe') || fallback.hidden) fail('an invalid id still created a player');
  if (watch.hidden !== true) fail('an invalid watch URL was still offered');
  if (root.querySelectorAll('iframe').length !== before) fail('invalid preview created an iframe');
  close.dispatch('click');

  first.button.dispatch('click');
  dialog.dispatch('click', { target: dialog });
  if (dialog.open || frame.querySelector('iframe')) fail('the backdrop click did not close the preview');

  first.button.dispatch('click');
  root.dispatch('keydown', { key: 'Escape', target: root });
  if (dialog.open || frame.querySelector('iframe')) fail('Escape did not close the preview and remove its player');

  second.button.dispatch('click');
  const live = frame.querySelector('iframe');
  live.dispatch('error');
  if (frame.querySelector('iframe') || fallback.hidden) fail('an embed error did not remove the player');
}

export function assertPreviewMarkup(pages, catalog) {
  const problems = [];
  const bad = (message) => problems.push(message);
  for (const [rel, html] of pages) {
    const dialogs = html.match(/<dialog\b[^>]*\bid="quick-preview"/g) ?? [];
    if (dialogs.length !== 1) bad(`${rel} should have one preview dialog`);
    const start = html.indexOf('<dialog');
    const end = html.indexOf('</dialog>');
    const dialogHtml = start >= 0 && end > start ? html.slice(start, end) : '';
    if (dialogHtml.includes('<iframe')) bad(`${rel} puts an iframe in the preview before a click`);
    const cards = html.match(/<article class="video-card[\s\S]*?<\/article>/g) ?? [];
    for (const card of cards) {
      if (/<a\b[^>]*>[\s\S]*?data-preview=/.test(card)) bad(`${rel} nests a preview button inside a link`);
      if (!card.includes('type="button"') || !card.includes('>Quick preview<') && !card.includes('Quick preview')) {
        bad(`${rel} preview control is missing its visible label`);
      }
      if (!card.includes('View lesson')) bad(`${rel} recording card is missing View lesson`);
      if (!card.includes('aria-label="Quick preview:')) bad(`${rel} preview label is not video-specific`);
    }
  }

  const home = pages.get('index.html') ?? '';
  if (/<button\b[^>]*\bdata-preview="/.test(home)) {
    bad('homepage navigation tiles offer a recording preview');
  }
  const statModules = pages.get('collections/stat-lessons/index.html') ?? '';
  if (/<button\b[^>]*\bdata-preview="/.test(statModules)) bad('STAT module tiles offer a recording preview');

  const search = pages.get('search/index.html') ?? '';
  const searchIds = [...search.matchAll(/data-preview="([A-Za-z0-9_-]{11})"/g)].map((match) => match[1]);
  if (searchIds.length !== catalog.videos.length) {
    bad(`search page has ${searchIds.length} preview controls for ${catalog.videos.length} recordings`);
  }
  const viewLessons = search.match(/View lesson/g) ?? [];
  if (viewLessons.length !== catalog.videos.length) {
    bad(`search page has ${viewLessons.length} View lesson links`);
  }
  for (const id of ['VS7Qbq07ATM', 'dgh99RbB43s']) {
    if (!search.includes(`data-preview="${id}"`)) bad(`search page cannot preview ${id}`);
    if (!search.includes(`href="/educational-videos/videos/${id}/"`)) {
      bad(`search page title link for ${id} is missing`);
    }
  }

  const modulePage = pages.get('stat-lessons/m01/index.html') ?? '';
  for (const video of catalog.videos.filter((item) => item.module === 'M01')) {
    if (!modulePage.includes(`data-preview="${video.youtube_id}"`)) {
      bad(`M01 listing cannot preview ${video.youtube_id}`);
    }
  }

  const shorts = pages.get('economics-shorts/experimental-economics/index.html') ?? '';
  const shortCount = catalog.videos.filter(
    (video) => video.collection_slug === 'economics-shorts' && video.topic === 'Experimental Economics',
  ).length;
  const shortPreviews = shorts.match(/data-preview="/g) ?? [];
  if (shortPreviews.length !== shortCount) {
    bad(`Experimental Economics has ${shortPreviews.length} previews for ${shortCount} recordings`);
  }
  if (!shorts.includes('data-portrait="true"')) bad('Shorts previews are not marked portrait');

  return problems;
}

if (errors.length) {
  console.error(`Preview check failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Preview behavior OK.');
