/**
 * Диагностика источников: что каталог iptv-org реально знает про RU/BY/KZ.
 * Запуск: node scripts/diagnose.mjs
 */

import { fetchJson, fetchText, parseM3U, cleanName } from './lib.mjs';

const channels = await fetchJson('https://iptv-org.github.io/api/channels.json');
const streams = await fetchJson('https://iptv-org.github.io/api/streams.json');

const ruChannelId = /\.(ru|by|kz)$/;
const cat = channels.filter((c) => (c.id || '').match(ruChannelId));
console.log('Каналов с id *.ru/.by/.kz:', cat.length);

const byId = new Map(channels.map((c) => [c.id, c]));
const httpsStreams = streams.filter((s) => /^https:\/\//i.test(s.url || ''));
console.log('Потоков https:', httpsStreams.length);

const ruStreams = httpsStreams.filter((s) => (s.channel || '').match(ruChannelId));
console.log('https-потоков у них:', ruStreams.length);

const withChannel = new Map();
for (const s of ruStreams) withChannel.set(s.channel, (withChannel.get(s.channel) || 0) + 1);
console.log('каналов с https-потоком:', withChannel.size);

const sample = [...withChannel.entries()].slice(0, 15).map(([id, n]) => `${id} (${n}) → ${byId.get(id)?.name}`);
console.log(sample.join('\n'));

const counts = new Map();
for (const s of httpsStreams) {
  if (s.channel) counts.set(s.channel, (counts.get(s.channel) || 0) + 1);
}
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log('\nТОП каналов по числу https-потоков (любая страна):');
console.log(top.map(([id, n]) => `${n}  ${id}  ${byId.get(id)?.name || ''}`).join('\n'));

// Плейлисты RU
for (const url of [
  'https://iptv-org.github.io/iptv/countries/ru.m3u',
  'https://iptv-org.github.io/iptv/countries/by.m3u',
  'https://iptv-org.github.io/iptv/languages/rus.m3u',
]) {
  const text = await fetchText(url);
  const items = parseM3U(text);
  const https = items.filter((i) => i.url.startsWith('https://'));
  const uniqueNames = new Set(items.map((i) => cleanName(i.name)));
  console.log(`\n${url}: строк ${items.length}, https ${https.length}, уникальных названий ${uniqueNames.size}`);
  console.log('  https примеры:', https.slice(0, 6).map((i) => `${cleanName(i.name)} → ${i.url.slice(0, 70)}`).join('\n                 '));
}
