/**
 * Проверка формата всех M3U-файлов: заголовок, EXTINF, ссылки https, категории.
 * Запуск: node scripts/validate.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CATEGORIES, parseM3U } from './lib.mjs';

const problems = [];
const report = [];

function check(file, { allowEmpty = false } = {}) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    problems.push(`${file}: файла нет`);
    return;
  }
  const text = fs.readFileSync(full, 'utf8');
  if (!text.startsWith('#EXTM3U')) problems.push(`${file}: нет #EXTM3U`);

  const items = parseM3U(text);
  if (!items.length && !allowEmpty) problems.push(`${file}: нет каналов`);

  const seen = new Set();
  for (const item of items) {
    if (!/^https:\/\//i.test(item.url)) problems.push(`${file}: не https — ${item.url}`);
    if (!item.name) problems.push(`${file}: пустое название — ${item.url}`);
    if (seen.has(item.url)) problems.push(`${file}: дубль — ${item.url}`);
    seen.add(item.url);
    if (!item.attrs['group-title']) problems.push(`${file}: нет группы — ${item.name}`);
  }

  report.push({ file, count: items.length });
}

check('IPTV-playlist.m3u');
for (const category of CATEGORIES) {
  const file = `playlists/${category.id}.m3u`;
  if (fs.existsSync(path.join(ROOT, file))) check(file);
}

const streamsDir = path.join(ROOT, 'streams');
if (fs.existsSync(streamsDir)) {
  const files = fs.readdirSync(streamsDir).filter((f) => f.endsWith('.m3u'));
  for (const file of files) check(`streams/${file}`);
  report.push({ file: `streams/ (${files.length} каналов)`, count: files.length });
}

for (const row of report) console.log(`${row.file}: ${row.count}`);

if (problems.length) {
  console.error(`\nПроблемы (${problems.length}):`);
  for (const problem of problems.slice(0, 40)) console.error(`  ${problem}`);
  process.exit(1);
}

console.log('\nВсе файлы в порядке.');
