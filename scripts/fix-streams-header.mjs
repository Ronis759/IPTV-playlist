/**
 * Разовая починка: добавляет строку #EXTM3U в начало файлов streams/*.m3u,
 * если её там нет. Нужна после ошибки в refresh.mjs (файлы писались без заголовка).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ensureDir } from './lib.mjs';

const streamsDir = path.join(ROOT, 'streams');
ensureDir(streamsDir);

let fixed = 0;
let ok = 0;

for (const file of fs.readdirSync(streamsDir)) {
  if (!file.endsWith('.m3u')) continue;
  const full = path.join(streamsDir, file);
  const text = fs.readFileSync(full, 'utf8');
  if (text.startsWith('#EXTM3U')) {
    ok++;
    continue;
  }
  fs.writeFileSync(full, `#EXTM3U\n${text.replace(/^\uFEFF/, '')}`, 'utf8');
  fixed++;
}

console.log(`Файлов каналов: исправлено ${fixed}, уже в порядке ${ok}`);
