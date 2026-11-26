(function () {
  var STORAGE = 'edu-lang';
  var VALID = { en: 1, 'zh-hans': 1, 'zh-hk': 1, all: 1 };
  var select = document.getElementById('site-lang');
  var status = document.getElementById('lang-status');
  var form = document.getElementById('lang-filter');
  if (!select || !status) return;

  function browserPref() {
    var list = navigator.languages || [navigator.language || ''];
    var i;
    for (i = 0; i < list.length; i += 1) {
      var tag = String(list[i] || '').toLowerCase();
      if (
        tag === 'yue' ||
        tag.indexOf('yue-') === 0 ||
        tag === 'zh-hk' ||
        tag === 'zh-mo' ||
        tag === 'zh-tw' ||
        tag === 'zh-hant' ||
        tag.indexOf('zh-hant-') === 0
      ) {
        return 'zh-hk';
      }
      if (
        tag === 'zh-hans' ||
        tag.indexOf('zh-hans-') === 0 ||
        tag === 'zh-cn' ||
        tag === 'zh-sg'
      ) {
        return 'zh-hans';
      }
      if (tag === 'zh') continue;
      if (tag === 'en' || tag.indexOf('en-') === 0) return 'en';
    }
    return 'en';
  }

  function storedPref() {
    try {
      var value = localStorage.getItem(STORAGE);
      if (value && VALID[value]) return value;
    } catch (error) {
      return '';
    }
    return '';
  }

  function chosenPref() {
    var fromUrl = new URLSearchParams(location.search).get('lang');
    if (fromUrl && VALID[fromUrl]) return fromUrl;
    return storedPref() || browserPref();
  }

  function labelFor(value) {
    var option = select.querySelector('option[value="' + value + '"]');
    return option ? option.textContent : value;
  }

  function clearNote(item) {
    var note = item.querySelector('.lang-note');
    if (!note) return;
    note.hidden = true;
    note.textContent = '';
  }

  function showNote(item, pref) {
    var note = item.querySelector('.lang-note');
    if (!note) return;
    var shown = item.getAttribute('data-lang-label') || 'another language';
    note.hidden = false;
    note.textContent = 'No ' + labelFor(pref) + ' recording. Showing ' + shown + '.';
  }

  function passesSearch(item) {
    return item.getAttribute('data-search-match') !== '0';
  }

  function byRank(name) {
    return function (a, b) {
      return Number(a.getAttribute(name) || 0) - Number(b.getAttribute(name) || 0);
    };
  }

  function choose(group, pref) {
    if (pref === 'all') return group;
    var tagged = group.filter(function (item) {
      return item.getAttribute('data-pref');
    });
    if (!tagged.length) return group;
    var matches = tagged.filter(function (item) {
      return item.getAttribute('data-pref') === pref;
    });
    if (matches.length) {
      matches.sort(byRank('data-rank'));
      return [matches[0]];
    }
    var fallback = group.slice().sort(byRank('data-fallback'));
    return [fallback[0]];
  }

  function applySearchMatch() {
    var filters = document.getElementById('filters');
    var items = document.querySelectorAll('#results > li');
    if (!filters || !items.length) return;
    var query = document.getElementById('q');
    var collection = document.getElementById('collection');
    var moduleField = document.getElementById('module');
    var topic = document.getElementById('topic');
    var language = document.getElementById('language');
    var raw = query && 'value' in query ? String(query.value).trim() : '';
    var tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);
    var collectionValue = collection && 'value' in collection ? collection.value : '';
    var moduleValue = moduleField && 'value' in moduleField ? moduleField.value : '';
    var topicValue = topic && 'value' in topic ? topic.value : '';
    var languageValue = language && 'value' in language ? language.value : '';
    Array.prototype.forEach.call(items, function (item) {
      var hay = item.getAttribute('data-haystack') || '';
      var matches =
        (!collectionValue || item.getAttribute('data-collection') === collectionValue) &&
        (!moduleValue || item.getAttribute('data-module') === moduleValue) &&
        (!topicValue || item.getAttribute('data-topic') === topicValue) &&
        (!languageValue || item.getAttribute('data-language') === languageValue) &&
        tokens.every(function (token) {
          return hay.indexOf(token) !== -1;
        });
      item.setAttribute('data-search-match', matches ? '1' : '0');
    });
  }

  function writeUrl(pref) {
    var params = new URLSearchParams(location.search);
    var filters = document.getElementById('filters');
    if (filters) {
      ['q', 'collection', 'module', 'topic', 'language'].forEach(function (name) {
        var field = document.getElementById(name);
        var value = field && 'value' in field ? String(field.value).trim() : '';
        if (value) params.set(name, value);
        else params.delete(name);
      });
    }
    params.set('lang', pref);
    var query = params.toString();
    var next = location.pathname + (query ? '?' + query : '') + location.hash;
    if (next !== location.pathname + location.search + location.hash) {
      history.replaceState(null, '', next);
    }
    try {
      localStorage.setItem(STORAGE, pref);
    } catch (error) {
      /* storage can be blocked; the URL still carries the choice */
    }
    var prefix = '/educational-videos/';
    document.querySelectorAll('a[href]').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href || href.indexOf(prefix) !== 0) return;
      var url = new URL(href, location.origin);
      url.searchParams.set('lang', pref);
      link.setAttribute('href', url.pathname + url.search + url.hash);
    });
  }

  function apply() {
    var pref = VALID[select.value] ? select.value : 'en';
    applySearchMatch();
    var items = document.querySelectorAll('.video-grid > li');
    var groups = new Map();
    var visible = 0;
    var fallbacks = 0;
    Array.prototype.forEach.call(items, function (item) {
      if (!passesSearch(item)) {
        item.hidden = true;
        clearNote(item);
        return;
      }
      var lesson = item.getAttribute('data-lang-group');
      if (!lesson) {
        item.hidden = false;
        clearNote(item);
        visible += 1;
        return;
      }
      var parent = item.parentElement;
      var bucket = groups.get(parent);
      if (!bucket) {
        bucket = new Map();
        groups.set(parent, bucket);
      }
      var list = bucket.get(lesson) || [];
      list.push(item);
      bucket.set(lesson, list);
    });
    groups.forEach(function (lessons) {
      lessons.forEach(function (group) {
        var picked = choose(group, pref);
        var keep = new Set(picked);
        group.forEach(function (item) {
          var show = keep.has(item);
          item.hidden = !show;
          if (!show) {
            clearNote(item);
            return;
          }
          visible += 1;
          if (pref !== 'all' && item.getAttribute('data-pref') && item.getAttribute('data-pref') !== pref) {
            showNote(item, pref);
            fallbacks += 1;
          } else {
            clearNote(item);
          }
        });
      });
    });

    var lessons = status.getAttribute('data-lessons') || '';
    var recordings = status.getAttribute('data-recordings') || '';
    var catalog = lessons + ' lessons · ' + recordings + ' recordings';
    var text;
    if (!items.length) {
      text =
        pref === 'all'
          ? 'All languages. Catalog: ' + catalog + '.'
          : 'Language: ' + labelFor(pref) + '. Lists show one recording per lesson. Catalog: ' + catalog + '.';
    } else if (pref === 'all') {
      text = 'Showing all ' + visible + ' recordings on this page. Catalog: ' + catalog + '.';
    } else {
      text =
        'Filtered to ' +
        labelFor(pref) +
        ': ' +
        visible +
        ' recordings on this page' +
        (fallbacks ? ', ' + fallbacks + ' shown in another language' : '') +
        '. Catalog total: ' +
        catalog +
        '.';
    }
    status.textContent = text;
    var resultCount = document.getElementById('result-count');
    if (resultCount) resultCount.textContent = text;
    var empty = document.getElementById('empty');
    if (empty) empty.hidden = visible !== 0;
    writeUrl(pref);
  }

  var initial = new URLSearchParams(location.search);
  ['q', 'collection', 'module', 'topic', 'language'].forEach(function (name) {
    var field = document.getElementById(name);
    var value = initial.get(name);
    if (field && value != null && 'value' in field) field.value = value;
  });
  select.value = chosenPref();
  apply();
  select.addEventListener('change', apply);
  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      apply();
    });
  }
  var filters = document.getElementById('filters');
  if (filters) {
    filters.addEventListener('submit', function (event) {
      event.preventDefault();
      apply();
    });
    filters.addEventListener('input', apply);
    filters.addEventListener('change', apply);
  }
})();
