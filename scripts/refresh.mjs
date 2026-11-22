/**
 * РћР±РЅРѕРІР»РµРЅРёРµ РїР»РµР№Р»РёСЃС‚Р°: РїСЂРѕРІРµСЂРєР° РєР°РЅР°Р»РѕРІ Рё Р·Р°РјРµРЅР° РѕС‚РІР°Р»РёРІС€РёС…СЃСЏ.
 *
 * РџРѕС‡РµРјСѓ РїСЂРѕРІРµСЂРєР° РґРІСѓС…С€Р°РіРѕРІР°СЏ:
 *   1. Р‘С‹СЃС‚СЂС‹Р№ HTTP-С‚РµСЃС‚ (РјР°РЅРёС„РµСЃС‚ в†’ РІР°СЂРёР°РЅС‚ в†’ РїРµСЂРІС‹Р№ С„СЂР°РіРјРµРЅС‚, CORS) РѕС‚СЃРµРєР°РµС‚ РјС‘СЂС‚РІРѕРµ.
 *   2. РџСЂРѕРІРµСЂРєР° В«СЂРµР°Р»СЊРЅРѕРіРѕ Р·Р°РїСѓСЃРєР°В» РІ Р±СЂР°СѓР·РµСЂРµ (hls.js РІ Node): РєР°РЅР°Р» РґРѕР»Р¶РµРЅ РѕС‚РґР°С‚СЊ РІРёРґРµРѕ.
 *      РљР°РЅР°Р»С‹ РїСЂРѕРІРµСЂСЏСЋС‚СЃСЏ РїРѕ РѕС‡РµСЂРµРґРё вЂ” С‡С‚РѕР±С‹ Р·Р°РјРµСЂ СЃРєРѕСЂРѕСЃС‚Рё Р±С‹Р» С‡РµСЃС‚РЅС‹Рј.
 *      РћС‚РєР»РёРє Р±РѕР»СЊС€Рµ MAX_START_MS СЃС‡РёС‚Р°РµС‚СЃСЏ РјРµРґР»РµРЅРЅС‹Рј Рё РёС‰РµС‚СЃСЏ Р·Р°РјРµРЅР°.
 *
 * 1. Р§РёС‚Р°РµС‚ IPTV-playlist.m3u (С‡С‚Рѕ СЃРµР№С‡Р°СЃ Сѓ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№).
 * 2. РџСЂРѕРІРµСЂСЏРµС‚ РєР°Р¶РґС‹Р№ РєР°РЅР°Р».
 * 3. РћС‚РІР°Р»РёРІС€РёРµСЃСЏ Рё РјРµРґР»РµРЅРЅС‹Рµ: СЃРЅР°С‡Р°Р»Р° РґСЂСѓРіРѕР№ РїРѕС‚РѕРє С‚РѕРіРѕ Р¶Рµ РєР°РЅР°Р»Р°, Р·Р°С‚РµРј Р°РЅР°Р»РѕРіРёС‡РЅС‹Р№ РєР°РЅР°Р»
 *    РёР· С‚РѕР№ Р¶Рµ РєР°С‚РµРіРѕСЂРёРё РёР· РґСЂСѓРіРёС… РѕС‚РєСЂС‹С‚С‹С… РёСЃС‚РѕС‡РЅРёРєРѕРІ.
 * 4. РџРёС€РµС‚ РЅРѕРІС‹Рµ С„Р°Р№Р»С‹ Рё data/update-report.json (С‡С‚Рѕ СѓР±СЂР°РЅРѕ, С‡С‚Рѕ РїРѕСЃС‚Р°РІР»РµРЅРѕ РЅР° Р·Р°РјРµРЅСѓ).
 *
 * Р—Р°РїСѓСЃРє: node scripts/refresh.mjs
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  ROOT, CATEGORIES, categoryTitle, cleanName, ensureDir, fetchJson, fetchText,
  mapLimit, parseM3U, pickCategory, probeStream, slugify, writeFile,
} from './lib.mjs';
import { CHECK, PLAYBACK } from './config.mjs';
import { russianName } from './names.mjs';

const CONCURRENCY = CHECK.concurrency;
const TIMEOUT_MS = CHECK.timeoutMs;
const MAX_START_MS = PLAYBACK.maxStartMs;
const MIN_PER_CATEGORY = 3;
const MAX_EXTRAS = 40;

const SOURCES = [
  { id: 'ru', name: 'Р РѕСЃСЃРёСЏ', url: 'https://iptv-org.github.io/iptv/countries/ru.m3u' },
  { id: 'by', name: 'Р‘РµР»Р°СЂСѓСЃСЊ', url: 'https://iptv-org.github.io/iptv/countries/by.m3u' },
  { id: 'kz', name: 'РљР°Р·Р°С…СЃС‚Р°РЅ', url: 'https://iptv-org.github.io/iptv/countries/kz.m3u' },
  { id: 'rus', name: 'Р СѓСЃСЃРєРѕСЏР·С‹С‡РЅС‹Рµ', url: 'https://iptv-org.github.io/iptv/languages/rus.m3u' },
  { id: 'free-tv', name: 'Free-TV', url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8' },
];

/* ---------- РџСЂРѕРІРµСЂРєР° Р·Р°РїСѓСЃРєР° РІРёРґРµРѕ ---------- */

import { loadHls, playbackTest } from './playback.mjs';

/* ---------- Р§С‚РµРЅРёРµ С‚РµРєСѓС‰РµРіРѕ РїР»РµР№Р»РёСЃС‚Р° ---------- */

function readCurrent() {
  const file = path.join(ROOT, 'IPTV-playlist.m3u');
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const catchupUrls = new Set();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^#EXTVLCOPT:vlc-loop\s*$/i.test(lines[i].trim())) {
      const next = lines.slice(i + 1).find((line) => line.trim() && !line.startsWith('#'));
      if (next) catchupUrls.add(next.trim());
    }
  }

  return parseM3U(text).map((item) => ({
    name: cleanName(item.name),
    url: item.url,
    logo: item.attrs['tvg-logo'] || '',
    group: item.attrs['group-title'] || '',
    channelKey: item.attrs['tvg-id'] || slugify(item.name),
    catchup: catchupUrls.has(item.url) || item.catchup,
    ms: 0,
  }));
}

/* ---------- РћСЃРЅРѕРІРЅРѕР№ СЃС†РµРЅР°СЂРёР№ ---------- */

async function main() {
  const started = Date.now();
  const current = readCurrent();
  if (!current.length) {
    console.log('РќРµС‚ IPTV-playlist.m3u вЂ” СЃРЅР°С‡Р°Р»Р° Р·Р°РїСѓСЃС‚РёС‚Рµ node scripts/build.mjs');
    process.exit(1);
  }
  console.log(`РЁР°Рі 1/2. Р‘С‹СЃС‚СЂР°СЏ РїСЂРѕРІРµСЂРєР°: ${current.length} РєР°РЅР°Р»РѕРІвЂ¦`);

  const quick = await mapLimit(current, CONCURRENCY, async (channel) => ({
    channel,
    probe: await probeStream(channel.url, { timeoutMs: TIMEOUT_MS, maxTotalMs: CHECK.maxTotalMs }),
  }));
  const aliveQuick = quick.filter((item) => item.probe.alive).map((item) => item.channel);
  console.log(`  РїСЂРѕС€Р»Рё Р±С‹СЃС‚СЂС‹Р№ С‚РµСЃС‚: ${aliveQuick.length}, РѕС‚СЃРµСЏРЅРѕ: ${quick.length - aliveQuick.length}`);
  for (const item of quick.filter((i) => !i.probe.alive).slice(0, 15)) {
    console.log(`    вњ• ${item.channel.name} вЂ” ${item.probe.why}`);
  }

  console.log(`\nРЁР°Рі 2/2. РџСЂРѕРІРµСЂРєР° СЂРµР°Р»СЊРЅРѕРіРѕ Р·Р°РїСѓСЃРєР° (РїРѕ РѕС‡РµСЂРµРґРё, РґРѕ ${MAX_START_MS} РјСЃ): ${aliveQuick.length}`);
  const Hls = await loadHls();
  const playback = [];
  for (let i = 0; i < aliveQuick.length; i++) {
    const channel = aliveQuick[i];
    const result = await playbackTest(Hls, channel.url, { timeoutMs: PLAYBACK.timeoutMs, maxStartMs: MAX_START_MS });
    playback.push({ channel, result });
    process.stdout.write(`\r  ${i + 1}/${aliveQuick.length}   `);
  }
  process.stdout.write('\n');

  const good = playback.filter((p) => p.result.ok && p.result.ms <= MAX_START_MS).map((p) => ({ ...p.channel, ms: p.result.ms }));
  const slow = playback.filter((p) => p.result.ok && p.result.ms > MAX_START_MS);
  const broken = playback.filter((p) => !p.result.ok);
  console.log(`  Р·Р°РїСѓСЃРєР°СЋС‚СЃСЏ Р±С‹СЃС‚СЂРѕ: ${good.length}, РјРµРґР»РµРЅРЅС‹Рµ: ${slow.length}, РЅРµ Р·Р°РїСѓСЃРєР°СЋС‚СЃСЏ: ${broken.length}`);
  for (const item of [...slow, ...broken].slice(0, 20)) {
    console.log(`    вњ• ${item.channel.name} вЂ” ${item.result.note} (${item.result.ms} РјСЃ)`);
  }

  const needReplace = [...slow.map((p) => p.channel), ...broken.map((p) => p.channel)];
  const usedUrls = new Set(good.map((c) => c.url));
  const replacements = [];
  const removed = [];

  if (needReplace.length) {
    console.log(`\nРС‰Сѓ Р·Р°РјРµРЅС‹ (${needReplace.length}):`);
  }
  try {
    const [channelsApi, streamsApi, logos] = await Promise.all([
      fetchJson('https://iptv-org.github.io/api/channels.json'),
      fetchJson('https://iptv-org.github.io/api/streams.json'),
      fetchJson('https://iptv-org.github.io/api/logos.json'),
    ]);
    const logoByChannel = new Map();
    for (const logo of logos) {
      if (logo.in_use && logo.feed && !logoByChannel.has(logo.channel)) logoByChannel.set(logo.channel, logo.url);
    }
    const streamsByChannel = new Map();
    for (const stream of streamsApi) {
      if (!stream.channel || !/^https:\/\//i.test(stream.url || '')) continue;
      const list = streamsByChannel.get(stream.channel) || [];
      list.push(stream.url);
      streamsByChannel.set(stream.channel, list);
    }

    for (const channel of needReplace) {
      const baseId = String(channel.channelKey).split('@')[0];
      const own = (streamsByChannel.get(baseId) || []).filter((url) => !usedUrls.has(url) && url !== channel.url).slice(0, 4);
      let found = null;

      for (const url of own) {
        const quickProbe = await probeStream(url, { timeoutMs: TIMEOUT_MS, maxTotalMs: CHECK.maxTotalMs });
        if (!quickProbe.alive) continue;
        const play = await playbackTest(Hls, url, { timeoutMs: PLAYBACK.timeoutMs, maxStartMs: MAX_START_MS });
        if (!play.ok || play.ms > MAX_START_MS) continue;
        found = { ...channel, url, logo: logoByChannel.get(baseId) || channel.logo, ms: play.ms, replaced: channel.url };
        break;
      }

      if (found) {
        usedUrls.add(found.url);
        replacements.push(found);
        console.log(`    в†’ ${channel.name}: Р·Р°РјРµРЅР° (${found.ms} РјСЃ)`);
      } else {
        removed.push({ name: channel.name, url: channel.url, why: 'РЅРµС‚ СЂР°Р±РѕС‡РµРіРѕ РїРѕС‚РѕРєР°' });
        console.log(`    вњ• ${channel.name}: Р·Р°РјРµРЅС‹ РЅРµС‚`);
      }
    }
  } catch (error) {
    console.log(`  РѕС€РёР±РєР° РєР°С‚Р°Р»РѕРіР°: ${error.message}`);
    removed.push(...needReplace.map((channel) => ({ name: channel.name, url: channel.url, why: 'РєР°С‚Р°Р»РѕРі РЅРµРґРѕСЃС‚СѓРїРµРЅ' })));
  }

  // Р‘Р°Р»Р°РЅСЃ РєР°С‚РµРіРѕСЂРёР№: С‡РµРіРѕ РјР°Р»Рѕ вЂ” РґРѕР±РёСЂР°РµРј РёР· РѕС‚РєСЂС‹С‚С‹С… РїР»РµР№Р»РёСЃС‚РѕРІ.
  const counts = new Map(CATEGORIES.map((c) => [c.id, 0]));
  for (const channel of [...good, ...replacements]) {
    counts.set(channel.category, (counts.get(channel.category) || 0) + 1);
  }
  const low = CATEGORIES.filter((c) => c.id !== 'other' && (counts.get(c.id) || 0) < MIN_PER_CATEGORY);
  if (low.length) {
    console.log(`\nР”РѕР±РёСЂР°СЋ РєР°РЅР°Р»С‹ РґР»СЏ РєР°С‚РµРіРѕСЂРёР№: ${low.map((c) => c.title).join(', ')}`);
    const extras = [];
    for (const source of SOURCES) {
      if (extras.length >= MAX_EXTRAS || low.every((c) => (counts.get(c.id) || 0) >= MIN_PER_CATEGORY)) break;
      try {
        const text = await fetchText(source.url);
        for (const item of parseM3U(text, source.url)) {
          if (!/^https:\/\//i.test(item.url) || usedUrls.has(item.url)) continue;
          const name = cleanName(item.name);
          const country = source.id === 'by' ? ['BY'] : source.id === 'kz' ? ['KZ'] : ['RU'];
          const category = pickCategory({ name, categories: [], countries: country });
          if (!low.some((c) => c.id === category)) continue;
          extras.push({
            name, url: item.url, logo: item.attrs['tvg-logo'] || '', group: categoryTitle(category),
            catchup: Boolean(item.catchup), category, channelKey: item.attrs['tvg-id'] || slugify(name), source: source.name,
            replaced: 'РґРѕР±РѕСЂ РґР»СЏ Р±Р°Р»Р°РЅСЃР° РєР°С‚РµРіРѕСЂРёР№',
          });
          usedUrls.add(item.url);
          if (extras.length >= MAX_EXTRAS) break;
        }
      } catch (error) {
        console.log(`  ${source.name}: РѕС€РёР±РєР° (${error.message})`);
      }
    }

    for (const candidate of extras) {
      if ((counts.get(candidate.category) || 0) >= MIN_PER_CATEGORY + 2) continue;
      const quickProbe = await probeStream(candidate.url, { timeoutMs: TIMEOUT_MS, maxTotalMs: CHECK.maxTotalMs });
      if (!quickProbe.alive) continue;
      const play = await playbackTest(Hls, candidate.url, { timeoutMs: PLAYBACK.timeoutMs, maxStartMs: MAX_START_MS });
      if (!play.ok || play.ms > MAX_START_MS) continue;
      counts.set(candidate.category, (counts.get(candidate.category) || 0) + 1);
      replacements.push({ ...candidate, ms: play.ms });
    }
  }

  // РС‚РѕРі: Р¶РёРІС‹Рµ + Р·Р°РјРµРЅС‹, Р±РµР· РґСѓР±Р»РµР№, РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј.
  const merged = [...good, ...replacements].map((channel) => {
    const category = CATEGORIES.find((c) => c.title === channel.group)?.id
      || channel.category
      || pickCategory({ name: channel.name, categories: [], countries: [] });
    return { ...channel, category, categoryTitle: categoryTitle(category) };
  });

  const seenUrl = new Set();
  const unique = merged.filter((channel) => {
    if (seenUrl.has(channel.url)) return false;
    seenUrl.add(channel.url);
    return true;
  });
  unique.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  writeOutputs(unique);

  const report = {
    updatedAt: new Date().toISOString(),
    checked: current.length,
    quickAlive: aliveQuick.length,
    playingFast: good.length,
    playingSlow: slow.length,
    broken: broken.length,
    replaced: replacements.filter((r) => r.replaced && r.replaced !== 'РґРѕР±РѕСЂ РґР»СЏ Р±Р°Р»Р°РЅСЃР° РєР°С‚РµРіРѕСЂРёР№').length,
    added: replacements.filter((r) => r.replaced === 'РґРѕР±РѕСЂ РґР»СЏ Р±Р°Р»Р°РЅСЃР° РєР°С‚РµРіРѕСЂРёР№').length,
    removed: removed.length,
    removedList: removed,
    replacedList: replacements.map((r) => ({ name: r.name, newUrl: r.url, replacedUrl: r.replaced, source: r.source || 'iptv-org', ms: r.ms })),
    slowList: slow.map((p) => ({ name: p.channel.name, ms: p.result.ms })),
    brokenList: broken.map((p) => ({ name: p.channel.name, why: p.result.note })),
    durationSec: Math.round((Date.now() - started) / 1000),
  };
  writeFile(path.join(ROOT, 'data', 'update-report.json'), JSON.stringify(report, null, 2));

  console.log(`\nРС‚РѕРі: Р±С‹Р»Рѕ ${report.checked}, Р±С‹СЃС‚СЂРѕ РёРіСЂР°СЋС‚ ${report.playingFast}, Р·Р°РјРµРЅРµРЅРѕ ${report.replaced}, РґРѕР±Р°РІР»РµРЅРѕ ${report.added}, СѓР±СЂР°РЅРѕ ${report.removed}`);
  console.log(`Р’СЃРµРіРѕ РІ РїР»РµР№Р»РёСЃС‚Рµ: ${unique.length} (${Math.round((Date.now() - started) / 1000)} СЃ)`);
}

function m3uEntry(channel) {
  const attrs = [
    `tvg-id="${String(channel.channelKey || '').replace(/"/g, '')}"`,
    `tvg-logo="${String(channel.logo || '').replace(/"/g, '')}"`,
    `group-title="${channel.categoryTitle}"`,
    `tvg-name="${channel.name.replace(/"/g, "'")}"`,
  ];
  const lines = [`#EXTINF:-1 ${attrs.join(' ')},${channel.name}`];
  if (channel.catchup) lines.push('#EXTVLCOPT:vlc-loop');
  lines.push(channel.url);
  return lines;
}

function writeOutputs(channels) {
  const date = new Date().toISOString().slice(0, 10);
  const list = channels.map((channel) => ({
    ...channel,
    slug: channel.slug && /^[a-z0-9-]+$/.test(channel.slug) ? channel.slug : slugify(channel.channelKey || channel.name),
  }));

  const main = ['#EXTM3U', `# IPTV-playlist В· ${date} В· РєР°РЅР°Р»РѕРІ: ${list.length} В· РїСЂРѕРІРµСЂРµРЅРѕ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё`];
  for (const category of CATEGORIES) {
    const group = list.filter((channel) => channel.category === category.id);
    if (!group.length) continue;
    main.push('', `# ===== ${category.title} (${group.length}) =====`);
    for (const channel of group) main.push(...m3uEntry(channel));
  }
  writeFile(path.join(ROOT, 'IPTV-playlist.m3u'), main.join('\n'));

  for (const category of CATEGORIES) {
    const group = list.filter((channel) => channel.category === category.id);
    if (!group.length) continue;
    const lines = ['#EXTM3U', `# ${category.title} В· ${date} В· РєР°РЅР°Р»РѕРІ: ${group.length}`];
    for (const channel of group) lines.push(...m3uEntry(channel));
    writeFile(path.join(ROOT, 'playlists', `${category.id}.m3u`), lines.join('\n'));
  }

  const streamsDir = path.join(ROOT, 'streams');
  ensureDir(streamsDir);
  for (const file of fs.readdirSync(streamsDir)) {
    if (file.endsWith('.m3u')) fs.unlinkSync(path.join(streamsDir, file));
  }
  for (const channel of list) {
    writeFile(path.join(streamsDir, `${channel.slug}.m3u`), m3uEntry(channel).join('\n'));
  }

  writeFile(path.join(ROOT, 'data', 'channels.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    total: list.length,
    channels: list.map((channel) => ({
      n: channel.name,
      u: channel.url,
      l: channel.logo,
      c: channel.category,
      g: channel.categoryTitle,
      a: Boolean(channel.catchup),
      s: channel.slug,
      ms: channel.ms || 0,
    })),
  }, null, 2));

  const summary = CATEGORIES
    .map((category) => ({ id: category.id, title: category.title, count: list.filter((c) => c.category === category.id).length }))
    .filter((category) => category.count);

  writeFile(path.join(ROOT, 'data', 'summary.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    total: list.length,
    withArchive: list.filter((c) => c.catchup).length,
    categories: summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

