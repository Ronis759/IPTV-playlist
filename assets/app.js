/**
 * Страница витрины: читает data/channels.json и рисует каталог по категориям.
 */

const PAGE_SIZE = 120;

const els = {
  stats: {
    total: document.getElementById('statTotal'),
    archive: document.getElementById('statArchive'),
    groups: document.getElementById('statGroups'),
    date: document.getElementById('statDate'),
  },
  tabs: document.getElementById('tabs'),
  search: document.getElementById('search'),
  counter: document.getElementById('counter'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  files: document.getElementById('files'),
  copyBtn: document.getElementById('copyBtn'),
  toast: document.getElementById('toast'),
};

const state = {
  channels: [],
  category: 'all',
  query: '',
  shown: 0,
  categories: [],
};

const PLAYLIST_URL = new URL('IPTV-playlist.m3u', window.location.href).href;

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { els.toast.hidden = true; }, 2600);
}

function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function renderStats(data) {
  els.stats.total.textContent = data.total || data.channels.length;
  els.stats.archive.textContent = data.channels.filter((c) => c.a).length;
  els.stats.groups.textContent = new Set(data.channels.map((c) => c.c || 'other')).size;
  els.stats.date.textContent = formatDate(data.updatedAt);
}

function renderTabs() {
  const counts = new Map();
  for (const channel of state.channels) counts.set(channel.c || 'other', (counts.get(channel.c || 'other') || 0) + 1);

  const items = [{ id: 'all', title: 'Все каналы', count: state.channels.length }];
  for (const category of state.categories) {
    const count = counts.get(category.id) || 0;
    if (count) items.push({ id: category.id, title: category.title, count });
  }

  els.tabs.innerHTML = '';
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tab${state.category === item.id ? ' is-active' : ''}`;
    button.innerHTML = `${item.title}<small>${item.count}</small>`;
    button.addEventListener('click', () => {
      state.category = item.id;
      state.shown = 0;
      renderTabs();
      renderGrid();
    });
    els.tabs.appendChild(button);
  }
}

function renderFiles() {
  const counts = new Map();
  for (const channel of state.channels) counts.set(channel.c || 'other', (counts.get(channel.c || 'other') || 0) + 1);

  els.files.innerHTML = '';
  const all = document.createElement('li');
  all.innerHTML = `<a href="IPTV-playlist.m3u">Все каналы <small>${state.channels.length}</small></a>`;
  els.files.appendChild(all);

  for (const category of state.categories) {
    const count = counts.get(category.id) || 0;
    if (!count) continue;
    const li = document.createElement('li');
    li.innerHTML = `<a href="playlists/${category.id}.m3u">${category.title} <small>${count}</small></a>`;
    els.files.appendChild(li);
  }
}

function card(channel) {
  const li = document.createElement('li');
  li.className = 'card';

  if (channel.l) {
    const img = document.createElement('img');
    img.src = channel.l;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'logo-fallback';
      fallback.textContent = initials(channel.n);
      img.replaceWith(fallback);
    });
    li.appendChild(img);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'logo-fallback';
    fallback.textContent = initials(channel.n);
    li.appendChild(fallback);
  }

  const text = document.createElement('div');
  text.className = 'card-text';
  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = channel.n;
  const meta = document.createElement('span');
  meta.className = 'card-meta';
  meta.textContent = `${channel.g || '—'} · ${channel.ms ? `${channel.ms} мс` : 'проверен'}`;
  text.append(name, meta);
  li.appendChild(text);

  if (channel.a) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = 'архив';
    li.appendChild(tag);
  }

  return li;
}

function matches(channel) {
  if (state.category !== 'all' && (channel.c || 'other') !== state.category) return false;
  if (!state.query) return true;
  return channel.n.toLowerCase().includes(state.query);
}

function renderGrid() {
  const list = state.channels.filter(matches);
  els.counter.textContent = `Показано ${Math.min(state.shown + PAGE_SIZE, list.length)} из ${list.length}`;
  els.empty.hidden = list.length > 0;

  els.grid.innerHTML = '';
  const slice = list.slice(0, PAGE_SIZE);
  const fragment = document.createDocumentFragment();
  for (const channel of slice) fragment.appendChild(card(channel));
  els.grid.appendChild(fragment);
  state.shown = slice.length;

  if (state.shown < list.length) {
    const more = document.createElement('li');
    more.className = 'card';
    more.style.justifyContent = 'center';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = `Показать ещё ${Math.min(PAGE_SIZE, list.length - state.shown)}`;
    button.addEventListener('click', () => {
      const next = list.slice(state.shown, state.shown + PAGE_SIZE);
      const frag = document.createDocumentFragment();
      for (const channel of next) frag.appendChild(card(channel));
      els.grid.insertBefore(frag, more);
      state.shown += next.length;
      els.counter.textContent = `Показано ${state.shown} из ${list.length}`;
      if (state.shown >= list.length) more.remove();
    });
    more.appendChild(button);
    els.grid.appendChild(more);
  }
}

async function copyLink() {
  const current = new URL('IPTV-playlist.m3u', window.location.href).href;
  const known = current.includes('localhost') || current.startsWith('file:') ? 'https://ronis759.github.io/IPTV-playlist/IPTV-playlist.m3u' : current;
  try {
    await navigator.clipboard.writeText(known);
    toast('Ссылка на плейлист скопирована');
  } catch {
    toast(known);
  }
}

async function init() {
  els.copyBtn.addEventListener('click', copyLink);

  els.search.addEventListener('input', () => {
    state.query = els.search.value.trim().toLowerCase();
    state.shown = 0;
    renderGrid();
  });

  try {
    const [data, summary] = await Promise.all([
      fetch('data/channels.json', { cache: 'no-store' }).then((r) => r.json()),
      fetch('data/summary.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]);

    state.channels = data.channels || [];
    state.channels.sort((a, b) => Number(b.a) - Number(a.a) || a.n.localeCompare(b.n, 'ru'));
    state.categories = (summary && summary.categories) || [];

    renderStats(data);
    renderTabs();
    renderFiles();
    renderGrid();
  } catch (error) {
    els.counter.textContent = 'Не удалось загрузить данные каталога';
    console.error(error);
  }
}

init();
