/**
 * Пробная категоризация: показать, как встроенные каналы раскладываются по группам,
 * без проверки потоков (работает за секунды).
 *
 * Запуск: node scripts/preview-categories.mjs
 */

import { fetchJson, cleanName, pickCategory, categoryTitle, slugify } from './lib.mjs';

const [channels, streams] = await Promise.all([
  fetchJson('https://iptv-org.github.io/api/channels.json'),
  fetchJson('https://iptv-org.github.io/api/streams.json'),
]);

const byId = new Map(channels.map((c) => [c.id, c]));
const ids = new Set(streams.filter((s) => /^https:\/\//i.test(s.url || '')).map((s) => s.channel));

const groups = new Map();
for (const id of ids) {
  const channel = byId.get(id);
  if (!channel) continue;
  const name = cleanName(channel.name);
  const category = pickCategory({ name, categories: channel.categories, countries: channel.countries });
  const list = groups.get(category) || [];
  list.push(name);
  groups.set(category, list);
}

for (const [id, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n=== ${categoryTitle(id)} (${list.length})`);
  console.log(list.sort((a, b) => a.localeCompare(b, 'ru')).slice(0, 80).join(' | '));
}
