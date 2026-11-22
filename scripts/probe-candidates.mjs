/**
 * Поиск рабочих источников для конкретных телеканалов (Беларусь и др.).
 * Запуск: node scripts/probe-candidates.mjs
 */

import { fetchText, parseM3U, cleanName, mapLimit, probeStream } from './lib.mjs';

const EXTRA_SOURCES = [
  { id: 'plustv', name: 'plusTV', url: 'https://stream.plustv.by/plustv-web/plustv/playlist.m3u8' },
  { id: 'ru', name: 'Россия', url: 'https://iptv-org.github.io/iptv/countries/ru.m3u' },
  { id: 'by', name: 'Беларусь', url: 'https://iptv-org.github.io/iptv/countries/by.m3u' },
  { id: 'kz', name: 'Казахстан', url: 'https://iptv-org.github.io/iptv/countries/kz.m3u' },
  { id: 'rus', name: 'Русскоязычные', url: 'https://iptv-org.github.io/iptv/languages/rus.m3u' },
];

const seen = new Set();
const items = [];
for (const source of EXTRA_SOURCES) {
  try {
    const text = await fetchText(source.url);
    for (const item of parseM3U(text, source.url)) {
      if (!item.url.startsWith('https://')) continue;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push({ source: source.name, name: cleanName(item.name), url: item.url, catchup: item.catchup, attrs: item.attrs });
    }
  } catch (error) {
    console.log(`${source.name}: ошибка ${error.message}`);
  }
}

const unique = new Map();
for (const item of items) {
  const key = item.name.toLowerCase();
  const entry = unique.get(key) || { name: item.name, flows: [], sources: new Set() };
  entry.flows.push({ url: item.url, source: item.source, catchup: item.catchup });
  entry.sources.add(item.source);
  unique.set(key, entry);
}
console.log(`Уникальных названий: ${unique.size}, потоков: ${items.length}`);

const results = await mapLimit(items, 10, async (item) => ({ item, probe: await probeStream(item.url, { maxTotalMs: 15000 }) }));
const alive = results.filter((r) => r.probe.alive);
console.log(`\nРабочих потоков: ${alive.length}/${items.length}`);

const aliveByKey = new Map();
for (const { item, probe } of alive) {
  const key = item.name.toLowerCase();
  const list = aliveByKey.get(key) || [];
  list.push({ ...item, ms: probe.ms });
  aliveByKey.set(key, list);
}
console.log(`Уникальных рабочих каналов: ${aliveByKey.size}`);

const sorted = [...aliveByKey.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
console.log('\nСписок рабочих каналов:');
for (const [key, list] of sorted) {
  const best = list.sort((a, b) => a.ms - b.ms)[0];
  console.log(`${key} | ${best.name} | ${best.source} | ${best.ms} мс | ${best.catchup ? 'archive' : ''} | ${best.url.slice(0, 90)}`);
}
