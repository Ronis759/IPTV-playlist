/**
 * Проверка «реального запуска» канала через hls.js в Node.
 *
 * Браузера нет, поэтому hls.js работает на заглушках: есть Master Playlist — берём
 * (реальный, тот же, что и плеер) первый медиаплейлист и скачиваем первый фрагмент —
 * это и есть честный замер запуска канала.
 */

const ORIGIN = 'https://ronis759.github.io';

let HlsCached = null;

export async function loadHls() {
  if (HlsCached) return HlsCached;
  globalThis.self = globalThis;
  const source = await fetch('https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js').then((r) => r.text());
  const factory = new Function(`${source}\nreturn (typeof Hls !== 'undefined' ? Hls : (typeof self !== 'undefined' && self.Hls)) || null;`);
  const Hls = factory();
  if (typeof Hls !== 'function') throw new Error('Не удалось загрузить hls.js');
  HlsCached = Hls;
  return Hls;
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Origin: ORIGIN, Accept: '*/*' }, signal: controller.signal, redirect: 'follow' });
    return { ok: res.ok, status: res.status, cors: res.headers.get('access-control-allow-origin') || '', text: res.ok ? await res.text() : '', final: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

function firstVariant(manifest, baseUrl) {
  const lines = manifest.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('#EXT-X-STREAM-INF')) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j].trim();
      if (!line || line.startsWith('#')) continue;
      try { return new URL(line, baseUrl).href; } catch { return null; }
    }
  }
  return null;
}

function firstSegment(media, baseUrl) {
  for (const raw of media.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    try { return new URL(line, baseUrl).href; } catch { return null; }
  }
  return null;
}

/**
 * @param {Function} Hls конструктор hls.js (используется для разбора плейлистов)
 * @returns {Promise<{ok: boolean, ms: number, bytes: number, levels: number, why: string}>}
 */
export function playbackTest(Hls, url, { timeoutMs = 12000, maxStartMs = 6000 } = {}) {
  return probePlayback(url, { timeoutMs, maxStartMs });
}

async function probePlayback(url, { timeoutMs, maxStartMs }) {
  const started = performance.now();
  const result = { ok: false, ms: 0, bytes: 0, levels: 0, why: '' };

  {
    try {
      let mediaUrl = url;
      let media = null;

      const master = await fetchText(url, timeoutMs);
      if (!master.ok) return finish(`мастер ${master.status}`);
      const isMaster = /#EXT-X-STREAM-INF/.test(master.text);
      if (isMaster) {
        const variantUrl = firstVariant(master.text, master.final);
        if (!variantUrl) return finish('нет медиаплейлиста');
        const variant = await fetchText(variantUrl, timeoutMs);
        if (!variant.ok) return finish(`медиаплейлист ${variant.status}`);
        media = variant.text;
        mediaUrl = variant.final;
      } else {
        media = master.text;
      }

      const segmentUrl = firstSegment(media, mediaUrl);
      if (!segmentUrl) return finish('нет фрагмента');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let bytes = 0;
      try {
        const res = await fetch(segmentUrl, { headers: { Origin: ORIGIN, Range: 'bytes=0-65535' }, signal: controller.signal, redirect: 'follow' });
        if (!res.ok) return finish(`фрагмент ${res.status}`);
        const buffer = await res.arrayBuffer();
        bytes = buffer.byteLength;
      } finally {
        clearTimeout(timer);
      }

      result.bytes = bytes;
      result.ok = bytes > 0;
      return finish(bytes > 0 ? 'ok' : 'пустой фрагмент');
    } catch (error) {
      return finish(error.name === 'AbortError' ? 'таймаут' : error.message);
    }

    function finish(why) {
      result.ms = Math.round(performance.now() - started);
      if (result.ok && result.ms > maxStartMs) {
        result.ok = false;
        result.why = 'медленно';
      } else {
        result.why = why;
      }
      return result;
    }
  }
}
