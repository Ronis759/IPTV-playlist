/**
 * Замер: сколько параллельных запросов терпят серверы и что меняет таймаут.
 * Запуск: node scripts/diagnose-timing.mjs [concurrency]
 */

import { fetchText, parseM3U, cleanName, mapLimit } from './lib.mjs';

const ORIGIN = 'https://ronis759.github.io';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const concurrency = Number(process.argv[2] || 8);

async function step(target, { text = false, range = false, timeout = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const started = performance.now();
  try {
    const headers = { Origin: ORIGIN, 'User-Agent': UA, Accept: '*/*' };
    if (range) headers.Range = 'bytes=0-4095';
    const res = await fetch(target, { headers, signal: controller.signal, redirect: 'follow' });
    const keepAlive = res.headers.get('access-control-allow-origin') || '';
    const entry = { ok: res.ok, status: res.status, cors: keepAlive, body: '', final: res.url, ms: 0 };
    if (text && res.ok) entry.body = await res.text();
    else { try { await res.body?.cancel(); } catch { /* ignore */ } }
    entry.ms = Math.round(performance.now() - started);
    return entry;
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'таймаут' : error.message, ms: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

function firstVariant(text, base) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('#EXT-X-STREAM-INF')) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j].trim();
      if (!l || l.startsWith('#')) continue;
      try { return new URL(l, base).href; } catch { return null; }
    }
  }
  return null;
}
function firstUri(text, base) {
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    try { return new URL(l, base).href; } catch { return null; }
  }
  return null;
}

async function probe(url) {
  const t0 = performance.now();
  const m = await step(url, { text: true });
  if (!m.ok) return { ok: false, why: m.error || `манифест ${m.status}`, ms: Math.round(performance.now() - t0) };
  if (!/^#EXTM3U/i.test(m.body.trim())) return { ok: false, why: 'не m3u8', ms: 0 };
  if (!(m.cors === '*' || m.cors.includes('ronis759'))) return { ok: false, why: 'CORS', ms: 0 };

  let mediaUrl = m.final;
  let media = m.body;
  if (/#EXT-X-STREAM-INF/i.test(m.body)) {
    const vUrl = firstVariant(m.body, m.final);
    if (!vUrl) return { ok: false, why: 'нет варианта', ms: 0 };
    const v = await step(vUrl, { text: true });
    if (!v.ok) return { ok: false, why: `вариант ${v.error || v.status}`, ms: 0 };
    mediaUrl = v.final;
    media = v.body;
  }
  const seg = firstUri(media, mediaUrl);
  if (!seg) return { ok: false, why: 'нет фрагмента', ms: 0 };
  const s = await step(seg, { range: true });
  if (!s.ok) return { ok: false, why: `фрагмент ${s.error || s.status}`, ms: 0 };
  if (!(s.cors === '*' || s.cors.includes('ronis759'))) return { ok: false, why: 'CORS фрагмента', ms: 0 };
  if (/text\/html/i.test(s.type || '')) return { ok: false, why: 'фрагмент html', ms: 0 };
  return { ok: true, ms: Math.round(performance.now() - t0) };
}

const text = await fetchText('https://iptv-org.github.io/iptv/countries/ru.m3u');
const items = parseM3U(text).filter((i) => i.url.startsWith('https://'));
console.log(`Каналов https: ${items.length}, параллелизм: ${concurrency}`);

const started = Date.now();
const results = await mapLimit(items, concurrency, async (item) => ({ name: cleanName(item.name), url: item.url, ...(await probe(item.url)) }));
console.log(`Время: ${Math.round((Date.now() - started) / 1000)} с`);

const ok = results.filter((r) => r.ok);
console.log(`\nВсего OK: ${ok.length}/${results.length}`);
const byName = new Map();
for (const r of ok) {
  const key = r.name.toLowerCase();
  if (!byName.has(key)) byName.set(key, r);
}
console.log(`Уникальных каналов OK: ${byName.size}`);
const slow = ok.filter((r) => r.ms > 3000).length;
console.log(`Медленнее 3 с: ${slow}; медиана OK: ${ok.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(ok.length / 2)]} мс`);

const groups = new Map();
for (const r of results.filter((x) => !x.ok)) {
  const key = (r.why || 'другое').split(' ')[0];
  groups.set(key, (groups.get(key) || 0) + 1);
}
console.log('\nОтказы:', [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', '));
