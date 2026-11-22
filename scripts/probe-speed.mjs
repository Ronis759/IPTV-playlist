/**
 * Замер: сколько канал реально грузится через hls.js (как в браузере).
 * Запуск: node scripts/probe-speed.mjs [limit]
 */

import fs from 'node:fs';
import { loadHls, playbackTest } from './playback.mjs';

const limit = Number(process.argv[2] || 0);
const data = JSON.parse(fs.readFileSync(new URL('../data/channels.json', import.meta.url), 'utf8'));
let channels = data.channels || [];
if (limit) channels = channels.slice(0, limit);

const Hls = await loadHls();
console.log(`Проверяю по очереди: ${channels.length}`);

const results = [];
for (let i = 0; i < channels.length; i++) {
  const channel = channels[i];
  const result = await playbackTest(Hls, channel.u, { timeoutMs: 12000, maxStartMs: 6000 });
  results.push({ channel, result });
  process.stdout.write(`\r${i + 1}/${channels.length}   `);
}
process.stdout.write('\n');

const ok = results.filter((r) => r.result.ok).sort((a, b) => a.result.ms - b.result.ms);
console.log(`\nЗапускаются: ${ok.length}/${results.length}`);
for (const { channel, result } of ok) {
  console.log(`${String(result.ms).padStart(6)} мс (манифест ${result.manifest}, фрагмент ${result.fragment}) | ${channel.n} [${channel.g}]`);
}
console.log('\nПроблемные:');
for (const { channel, result } of results.filter((r) => !r.result.ok)) {
  console.log(`  ${channel.n} — ${result.why} (${result.ms} мс)`);
}
