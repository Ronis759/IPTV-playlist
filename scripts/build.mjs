/**
 * РЎР±РѕСЂРєР° СЂСѓСЃСЃРєРѕСЏР·С‹С‡РЅРѕРіРѕ РїР»РµР№Р»РёСЃС‚Р° В«IPTV-playlistВ».
 *
 * РљР°Рє СЂР°Р±РѕС‚Р°РµС‚:
 *   1. РљР°С‚Р°Р»РѕРі РєР°РЅР°Р»РѕРІ iptv-org (channels.json) РґР°С‘С‚ РЅР°Р·РІР°РЅРёСЏ, СЃС‚СЂР°РЅС‹, РєР°С‚РµРіРѕСЂРёРё, Р»РѕРіРѕС‚РёРїС‹.
 *   2. РџРѕС‚РѕРєРё iptv-org (streams.json) вЂ” РІСЃРµ РІР°СЂРёР°РЅС‚С‹ СЃСЃС‹Р»РѕРє РЅР° РєР°Р¶РґС‹Р№ РєР°РЅР°Р».
 *   3. Р—Р°РїР°СЃРЅС‹Рµ РёСЃС‚РѕС‡РЅРёРєРё (RU/BY/KZ РїР»РµР№Р»РёСЃС‚С‹) РґРѕР±Р°РІР»СЏСЋС‚ РїРѕС‚РѕРєРё, РєРѕС‚РѕСЂС‹С… РЅРµС‚ РІ РєР°С‚Р°Р»РѕРіРµ.
 *   4. РћС‚РґРµР»СЊРЅРѕ РїРѕРґР±РёСЂР°СЋС‚СЃСЏ СЂСѓСЃСЃРєРёРµ РЅР°Р·РІР°РЅРёСЏ РєР°РЅР°Р»РѕРІ РёР· РїР»РµР№Р»РёСЃС‚РѕРІ СЃС‚СЂР°РЅ (РєР°С‚Р°Р»РѕРі РґР°С‘С‚ Р»Р°С‚РёРЅРёС†Сѓ).
 *   5. РљР°Р¶РґС‹Р№ РїРѕС‚РѕРє РїСЂРѕРІРµСЂСЏРµС‚СЃСЏ РІР¶РёРІСѓСЋ: https, CORS, РјР°РЅРёС„РµСЃС‚, РІР°СЂРёР°РЅС‚, РІРёРґРµРѕС„СЂР°РіРјРµРЅС‚, СЃРєРѕСЂРѕСЃС‚СЊ.
 *   6. Р Р°Р±РѕС‡РёРµ РїРѕС‚РѕРєРё СЂР°СЃРєР»Р°РґС‹РІР°СЋС‚СЃСЏ РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј, СЃ Р°СЂС…РёРІРѕРј вЂ” РїРµСЂРІС‹РјРё.
 *   7. РџРёС€РµС‚СЃСЏ IPTV-playlist.m3u + РїР°РїРєР° playlists/ Рё streams/ (РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј Рё РїРѕ РѕРґРЅРѕРјСѓ РєР°РЅР°Р»Сѓ).
 *
 * Р—Р°РїСѓСЃРє:  node scripts/build.mjs [--limit-per-channel=4] [--concurrency=10] [--timeout=15000]
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  ROOT, CATEGORIES, categoryTitle, cleanName, ensureDir, fetchJson, fetchText,
  mapLimit, parseM3U, pickCategory, probeStream, slugify, writeFile,
} from './lib.mjs';
import { CHECK } from './config.mjs';
import { russianName } from './names.mjs';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
      return [key, value];
    }),
);

const LIMIT_PER_CHANNEL = Number(args['limit-per-channel'] || CHECK.limitPerChannel);
const CONCURRENCY = Number(args.concurrency || CHECK.concurrency);
const TIMEOUT_MS = Number(args.timeout || CHECK.timeoutMs);
const MAX_TOTAL_MS = CHECK.maxTotalMs;

/** Р—Р°РїР°СЃРЅС‹Рµ РёСЃС‚РѕС‡РЅРёРєРё: С‚РѕР»СЊРєРѕ РѕС‚РєСЂС‹С‚С‹Рµ РїР»РµР№Р»РёСЃС‚С‹ СЃС‚СЂР°РЅ. */
const SOURCES = [
  { id: 'ru', name: 'Р РѕСЃСЃРёСЏ', url: 'https://iptv-org.github.io/iptv/countries/ru.m3u' },
  { id: 'by', name: 'Р‘РµР»Р°СЂСѓСЃСЊ', url: 'https://iptv-org.github.io/iptv/countries/by.m3u' },
  { id: 'kz', name: 'РљР°Р·Р°С…СЃС‚Р°РЅ', url: 'https://iptv-org.github.io/iptv/countries/kz.m3u' },
  { id: 'rus', name: 'Р СѓСЃСЃРєРѕСЏР·С‹С‡РЅС‹Рµ', url: 'https://iptv-org.github.io/iptv/languages/rus.m3u' },
  { id: 'free-tv', name: 'Free-TV', url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8' },
];

const CYRILLIC = /[Р°-СЏС‘]/i;

/** Р СѓСЃСЃРєРѕСЏР·С‹С‡РЅРѕСЃС‚СЊ: РєРёСЂРёР»Р»РёС†Р° РІ РЅР°Р·РІР°РЅРёРё, СЃС‚СЂР°РЅР° RU/BY/KZ РёР»Рё СЏР·С‹Рє rus. */
function isRussian(channel) {
  const countries = (channel.countries || []).map((c) => String(c).toUpperCase());
  if (countries.some((c) => ['RU', 'BY', 'KZ'].includes(c))) return true;
  if ((channel.languages || []).some((l) => String(l).toLowerCase() === 'rus')) return true;
  return CYRILLIC.test(channel.name || '');
}

async function loadCatalog() {
  console.log('Р—Р°РіСЂСѓР¶Р°СЋ РєР°С‚Р°Р»РѕРі iptv-org (channels, streams, logos)вЂ¦');
  const [channels, streams, logos] = await Promise.all([
    fetchJson('https://iptv-org.github.io/api/channels.json'),
    fetchJson('https://iptv-org.github.io/api/streams.json'),
    fetchJson('https://iptv-org.github.io/api/logos.json'),
  ]);

  const channelsById = new Map(channels.map((c) => [c.id, c]));

  const streamsByChannel = new Map();
  for (const stream of streams) {
    if (!stream.channel) continue;
    if (stream.status && stream.status !== 'online') continue;
    if (!/^https:\/\//i.test(stream.url || '')) continue;
    if (!channelsById.has(stream.channel)) continue;
    const list = streamsByChannel.get(stream.channel) || [];
    list.push(stream.url);
    streamsByChannel.set(stream.channel, list);
  }

  const logoByChannel = new Map();
  for (const logo of logos) {
    if (!logo.channel || !logo.feed || !logo.in_use) continue;
    if (!logoByChannel.has(logo.channel)) logoByChannel.set(logo.channel, logo.url);
  }

  console.log(`  РєР°РЅР°Р»РѕРІ: ${channels.length}, РєР°РЅР°Р»РѕРІ СЃ https-РїРѕС‚РѕРєР°РјРё: ${streamsByChannel.size}`);
  return { channelsById, streamsByChannel, logoByChannel };
}

async function loadExtraSources(catalog, names) {
  const extras = [];

  for (const source of SOURCES) {
    try {
      const text = await fetchText(source.url);
      const items = parseM3U(text, source.url);
      console.log(`  ${source.name}: ${items.length} СЃС‚СЂРѕРє`);
      for (const item of items) {
        if (!/^https:\/\//i.test(item.url)) continue;
        const tvgId = item.attrs['tvg-id'] || '';
        const baseId = tvgId.split('@')[0];
        const catalogEntry = baseId ? catalog.channelsById.get(baseId) : null;
        const name = cleanName(item.name || catalogEntry?.name || '');
        if (!name) continue;
        const key = baseId || slugify(name);

        if (baseId && CYRILLIC.test(name) && !names.has(baseId)) names.set(baseId, name);

        extras.push({
          channelKey: key,
          name,
          catalogName: catalogEntry?.name || name,
          logo: item.attrs['tvg-logo'] || (baseId ? catalog.logoByChannel.get(baseId) : '') || '',
          countries: catalogEntry ? catalogEntry.countries || [] : source.id === 'by' ? ['BY'] : source.id === 'kz' ? ['KZ'] : ['RU'],
          categories: catalogEntry ? catalogEntry.categories || [] : [],
          languages: catalogEntry ? catalogEntry.languages || [] : ['rus'],
          url: item.url,
          catchup: Boolean(item.catchup),
          source: source.name,
        });
      }
    } catch (error) {
      console.log(`  ${source.name}: РѕС€РёР±РєР° (${error.message})`);
    }
  }

  return extras;
}

function buildCandidates(catalog, extras) {
  const byKey = new Map();

  const add = (candidate) => {
    const key = candidate.channelKey;
    const entry = byKey.get(key) || {
      key,
      catalogName: candidate.catalogName,
      logo: candidate.logo,
      countries: candidate.countries,
      categories: candidate.categories,
      languages: candidate.languages,
      flows: [],
      sources: new Set(),
      names: new Set(),
    };

    if (candidate.logo && !entry.logo) entry.logo = candidate.logo;
    if (candidate.categories && candidate.categories.length) entry.categories = candidate.categories;
    if (candidate.languages && candidate.languages.length) entry.languages = candidate.languages;
    entry.sources.add(candidate.source);
    if (candidate.name) entry.names.add(cleanName(candidate.name));

    const known = entry.flows.find((flow) => flow.url === candidate.url);
    if (known) known.catchup = known.catchup || candidate.catchup;
    else entry.flows.push({ url: candidate.url, catchup: candidate.catchup, source: candidate.source });

    byKey.set(key, entry);
  };

  for (const [id, urls] of catalog.streamsByChannel) {
    const channel = catalog.channelsById.get(id);
    if (!channel) continue;
    const candidate = {
      channelKey: id,
      name: channel.name,
      catalogName: channel.name,
      logo: catalog.logoByChannel.get(id) || '',
      countries: channel.countries || [],
      categories: channel.categories || [],
      languages: channel.languages || [],
      source: 'iptv-org',
    };
    if (!isRussian(candidate)) continue;
    for (const url of urls) add({ ...candidate, url, catchup: false });
  }

  for (const item of extras) {
    if (!isRussian(item)) continue;
    add(item);
  }

  return [...byKey.values()];
}

/** РРјСЏ РєР°РЅР°Р»Р° РґР»СЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ: СЂСѓСЃСЃРєРѕРµ РЅР°Р·РІР°РЅРёРµ, РµСЃР»Рё РѕРЅРѕ РµСЃС‚СЊ, РёРЅР°С‡Рµ РёР· РєР°С‚Р°Р»РѕРіР°. */
function pickDisplayName(entry, names) {
  const ru = names.get(entry.key);
  if (ru) return cleanName(ru);
  const cyr = [...entry.names].find((name) => CYRILLIC.test(name));
  if (cyr) return cleanName(cyr);
  const base = cleanName(entry.catalogName || entry.key);
  return russianName(base) || base;
}

async function main() {
  const started = Date.now();
  const catalog = await loadCatalog();
  console.log('Р—Р°РіСЂСѓР¶Р°СЋ Р·Р°РїР°СЃРЅС‹Рµ РёСЃС‚РѕС‡РЅРёРєРёвЂ¦');
  const names = new Map();
  const extras = await loadExtraSources(catalog, names);

  const entries = buildCandidates(catalog, extras);
  console.log(`\nРљР°РЅРґРёРґР°С‚РѕРІ (СѓРЅРёРєР°Р»СЊРЅС‹С… РєР°РЅР°Р»РѕРІ): ${entries.length}`);

  const tasks = [];
  for (const entry of entries) {
    const flows = [...entry.flows]
      .sort((a, b) => Number(b.catchup) - Number(a.catchup) || a.url.length - b.url.length)
      .slice(0, LIMIT_PER_CHANNEL);
    for (const flow of flows) tasks.push({ entry, flow });
  }
  console.log(`РџРѕС‚РѕРєРѕРІ Рє РїСЂРѕРІРµСЂРєРµ: ${tasks.length}\n`);

  let done = 0;
  const results = await mapLimit(tasks, CONCURRENCY, async ({ entry, flow }) => {
    const probe = await probeStream(flow.url, { timeoutMs: TIMEOUT_MS, maxTotalMs: MAX_TOTAL_MS });
    done++;
    if (done % 25 === 0 || done === tasks.length) process.stdout.write(`\r  РїСЂРѕРІРµСЂРµРЅРѕ ${done}/${tasks.length}   `);
    return { entry, flow, probe };
  });
  process.stdout.write('\n');

  const alive = results.filter((result) => result.probe.alive);
  console.log(`Р–РёРІС‹С… РїРѕС‚РѕРєРѕРІ: ${alive.length} РёР· ${results.length}`);

  // Р”Р»СЏ РєР°Р¶РґРѕРіРѕ РєР°РЅР°Р»Р° вЂ” Р»СѓС‡С€РёР№ РїРѕС‚РѕРє (СЃ Р°СЂС…РёРІРѕРј РІ РїСЂРёРѕСЂРёС‚РµС‚Рµ, Р·Р°С‚РµРј РїРѕ СЃРєРѕСЂРѕСЃС‚Рё).
  const bestByKey = new Map();
  for (const result of alive) {
    const key = result.entry.key;
    const current = bestByKey.get(key);
    if (!current) { bestByKey.set(key, result); continue; }
    if (result.flow.catchup && !current.flow.catchup) { bestByKey.set(key, result); continue; }
    if (!result.flow.catchup && current.flow.catchup) continue;
    if (result.probe.ms < current.probe.ms) bestByKey.set(key, result);
  }

  const channels = [...bestByKey.values()].map(({ entry, flow, probe }) => {
    const name = pickDisplayName(entry, names);
    const category = pickCategory({ name, categories: entry.categories, countries: entry.countries });
    return {
      name,
      url: flow.url,
      logo: entry.logo,
      category,
      categoryTitle: categoryTitle(category),
      catchup: Boolean(flow.catchup),
      ms: probe.ms,
      sources: [...entry.sources],
      countries: entry.countries,
      slug: slugify(entry.key),
      channelKey: entry.key,
    };
  });

  channels.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  console.log(`\nР Р°Р±РѕС‡РёС… РєР°РЅР°Р»РѕРІ: ${channels.length}`);
  for (const category of CATEGORIES) {
    const count = channels.filter((channel) => channel.category === category.id).length;
    console.log(`  ${category.title}: ${count}`);
  }
  const withArchive = channels.filter((channel) => channel.catchup).length;
  const sortedMs = channels.map((c) => c.ms).sort((a, b) => a - b);
  console.log(`  СЃ Р°СЂС…РёРІРѕРј: ${withArchive}, РјРµРґРёР°РЅР° РѕС‚РєР»РёРєР°: ${sortedMs[Math.floor(sortedMs.length / 2)] || 0} РјСЃ`);

  writeOutputs(channels, { tasks: tasks.length, checked: results.length, alive: alive.length });
  console.log(`\nР“РѕС‚РѕРІРѕ Р·Р° ${Math.round((Date.now() - started) / 1000)} СЃ. Р¤Р°Р№Р»С‹: ${ROOT}`);
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

function writeOutputs(channels, stats) {
  const date = new Date().toISOString().slice(0, 10);

  // 1) РћР±С‰РёР№ РїР»РµР№Р»РёСЃС‚ РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј.
  const main = ['#EXTM3U', `# IPTV-playlist В· ${date} В· РєР°РЅР°Р»РѕРІ: ${channels.length} В· РїСЂРѕРІРµСЂРµРЅРѕ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё`];
  for (const category of CATEGORIES) {
    const list = channels.filter((channel) => channel.category === category.id);
    if (!list.length) continue;
    main.push('', `# ===== ${category.title} (${list.length}) =====`);
    for (const channel of list) main.push(...m3uEntry(channel));
  }
  writeFile(path.join(ROOT, 'IPTV-playlist.m3u'), main.join('\n'));

  // 2) РџР»РµР№Р»РёСЃС‚С‹ РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј.
  for (const category of CATEGORIES) {
    const list = channels.filter((channel) => channel.category === category.id);
    if (!list.length) continue;
    const lines = ['#EXTM3U', `# ${category.title} В· ${date} В· РєР°РЅР°Р»РѕРІ: ${list.length}`];
    for (const channel of list) lines.push(...m3uEntry(channel));
    writeFile(path.join(ROOT, 'playlists', `${category.id}.m3u`), lines.join('\n'));
  }

  // 3) РћРґРёРЅ РєР°РЅР°Р» вЂ” РѕРґРёРЅ С„Р°Р№Р».
  const streamsDir = path.join(ROOT, 'streams');
  ensureDir(streamsDir);
  for (const file of fs.readdirSync(streamsDir)) {
    if (file.endsWith('.m3u')) fs.unlinkSync(path.join(streamsDir, file));
  }
  for (const channel of channels) {
    if (!channel.slug || !/^[a-z0-9-]+$/.test(channel.slug)) channel.slug = slugify(channel.name);
    writeFile(path.join(streamsDir, `${channel.slug}.m3u`), ['#EXTM3U', ...m3uEntry(channel)].join('\n'));
  }

  // 4) Р”Р°РЅРЅС‹Рµ РґР»СЏ СЃР°Р№С‚Р° Рё Р°РІС‚РѕРѕР±РЅРѕРІР»РµРЅРёСЏ.
  writeFile(path.join(ROOT, 'data', 'channels.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    total: channels.length,
    stats,
    channels: channels.map((channel) => ({
      n: channel.name,
      u: channel.url,
      l: channel.logo,
      c: channel.category,
      g: channel.categoryTitle,
      a: channel.catchup,
      s: channel.slug,
      ms: channel.ms,
      src: channel.sources,
    })),
  }, null, 2));

  const summary = CATEGORIES
    .map((category) => ({ id: category.id, title: category.title, count: channels.filter((c) => c.category === category.id).length }))
    .filter((category) => category.count);

  writeFile(path.join(ROOT, 'data', 'summary.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    total: channels.length,
    withArchive: channels.filter((c) => c.catchup).length,
    categories: summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});




