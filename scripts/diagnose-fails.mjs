/**
 * Глубокая диагностика отказов: подробная причина на каждом шаге.
 * Запуск: node scripts/diagnose-fails.mjs
 */

import { fetchText, parseM3U, cleanName, mapLimit } from './lib.mjs';

const ORIGIN = 'https://ronis759.github.io';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

async function step(target, { text = false, range = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const started = performance.now();
  try {
    const headers = { Origin: ORIGIN, 'User-Agent': UA, Accept: '*/*' };
    if (range) headers.Range = 'bytes=0-2047';
    const res = await fetch(target, { headers, signal: controller.signal, redirect: 'follow' });
    const allow = res.headers.get('access-control-allow-origin') || '';
    const entry = {
      status: res.status,
      ok: res.ok,
      cors: allow,
      type: res.headers.get('content-type') || '',
      final: res.url,
      ms: Math.round(performance.now() - started),
      body: '',
    };
    if (text && res.ok) entry.body = await res.text();
    else { try { await res.body?.cancel(); } catch { /* ignore */ } }
    return entry;
  } catch (error) {
    return { error: error.name === 'AbortError' ? 'таймаут' : error.message, ms: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

function first(text, base, prefix) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith(prefix)) continue;
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

const text = await fetchText('https://iptv-org.github.io/iptv/countries/ru.m3u');
const items = parseM3U(text).filter((i) => i.url.startsWith('https://'));

const results = await mapLimit(items, 20, async (item) => {
  const m = await step(item.url, { text: true });
  if (m.error) return { name: cleanName(item.name), url: item.url, why: `манифест: ${m.error}` };
  if (!m.ok) return { name: cleanName(item.name), url: item.url, why: `манифест HTTP ${m.status}` };
  if (!/^#EXTM3U/i.test(m.body.trim())) return { name: cleanName(item.name), url: item.url, why: `манифест не m3u8 (${m.type})` };
  const corsOk = m.cors === '*' || m.cors.includes('ronis759');
  if (!corsOk) return { name: cleanName(item.name), url: item.url, why: `CORS: "${m.cors || 'нет'}"` };

  let mediaUrl = m.final;
  let media = m.body;
  if (/#EXT-X-STREAM-INF/i.test(m.body)) {
    const vUrl = first(m.body, m.final, '#EXT-X-STREAM-INF');
    if (!vUrl) return { name: cleanName(item.name), url: item.url, why: 'нет варианта' };
    const v = await step(vUrl, { text: true });
    if (v.error || !v.ok) return { name: cleanName(item.name), url: item.url, why: `вариант: ${v.error || v.status}` };
    const vCors = v.cors === '*' || v.cors.includes('ronis759');
    if (!vCors) return { name: cleanName(item.name), url: item.url, why: `CORS варианта: "${v.cors || 'нет'}"` };
    mediaUrl = v.final;
    media = v.body;
  }
  const segUrl = firstUri(media, mediaUrl);
  if (!segUrl) return { name: cleanName(item.name), url: item.url, why: 'нет фрагмента' };
  const s = await step(segUrl, { range: true });
  if (s.error) return { name: cleanName(item.name), url: item.url, why: `фрагмент: ${s.error}` };
  if (!s.ok) return { name: cleanName(item.name), url: item.url, why: `фрагмент HTTP ${s.status}`, segUrl };
  const sCors = s.cors === '*' || s.cors.includes('ronis759');
  if (!sCors) return { name: cleanName(item.name), url: item.url, why: `CORS фрагмента: "${s.cors || 'нет'}"`, segUrl };
  if (/text\/html/i.test(s.type)) return { name: cleanName(item.name), url: item.url, why: 'фрагмент — html', segUrl };
  return { name: cleanName(item.name), url: item.url, why: `OK ${m.ms + s.ms} мс`, segUrl, ok: true };
});

const fails = results.filter((r) => !r.ok);
const groups = new Map();
for (const f of fails) {
  const key = f.why.split(':')[0];
  groups.set(key, (groups.get(key) || 0) + 1);
}
console.log(`Проверено https-каналов: ${results.length}, OK: ${results.filter((r) => r.ok).length}`);
console.log('Причины отказов:');
for (const [k, v] of [...groups.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log('\nПримеры отказов:');
for (const f of fails.slice(0, 25)) console.log(`  ${f.name} — ${f.why}\n      ${f.url.slice(0, 110)}`);

console.log('\nCORS-заголовки по доменам (фрагменты):');
const domains = new Map();
for (const r of results) {
  try {
    const host = new URL(r.segUrl || r.url).host;
    if (!domains.has(host)) domains.set(host, r.why.startsWith('OK') || !r.why.includes('CORS') ? 'cors-ok' : r.why);
  } catch { /* ignore */ }
}
for (const [host, status] of [...domains.entries()].slice(0, 25)) console.log(`  ${host} → ${status}`);
