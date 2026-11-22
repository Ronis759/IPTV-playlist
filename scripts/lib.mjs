/**
 * Общие утилиты для сборки и обновления IPTV-playlist.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Идентификаторы категорий и порядок в плейлисте. */
export const CATEGORY_IDS = [
  'basic', 'by', 'entertainment', 'education', 'movies', 'music', 'kids', 'sport', 'other',
];

/** Кириллица для распознавания русскоязычных названий. */
export const CYRILLIC_RE = /[а-яё]/i;

/** Названия категорий. */
export const CATEGORIES = [
  { id: 'basic', title: 'Базовые', keywords: ['general', 'news', 'public', 'legislative', 'government'] },
  { id: 'by', title: 'Беларусь', keywords: ['belarus'] },
  { id: 'entertainment', title: 'Развлекательные', keywords: ['entertainment', 'comedy', 'lifestyle', 'shop', 'relax', 'family', 'series', 'auto'] },
  { id: 'education', title: 'Познавательные', keywords: ['documentary', 'education', 'science', 'culture', 'weather', 'history', 'travel', 'cooking', 'business', 'outdoor', 'nature'] },
  { id: 'movies', title: 'Кино', keywords: ['movies', 'movie'] },
  { id: 'music', title: 'Музыка', keywords: ['music'] },
  { id: 'kids', title: 'Детские', keywords: ['kids', 'children'] },
  { id: 'sport', title: 'Спорт', keywords: ['sports', 'sport'] },
  { id: 'other', title: 'Разное', keywords: [] },
];

export function categoryTitle(id) {
  const found = CATEGORIES.find((c) => c.id === id);
  return found ? found.title : 'Разное';
}

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

const EXTRA_ATTR_RE = /\s+(catchup|catchup-source|catchup-days|catchup-correction|timeshift|shift|radio|stream-type|user-agent|http-referrer|http-user-agent|x-tvg-url)="[^"]*"/gi;
const NAME_SUFFIX_RE = /\s*\[[^\]]*\]\s*/g;

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function translit(value) {
  return String(value)
    .toLowerCase()
    .split('')
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join('');
}

export function slugify(value) {
  return translit(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'channel';
}

const GROUP_RULES = [
  ['by', /belarus|бел[а-я]*|столичное|\bонт\b|\bстб\b|vitebsk|gomel|brest|grodno|mogilev/i],
  ['kids', /детск|мульт|cartoon|carousel|карусел|baby|малыш|kids|sonic|nick|disney|toon|тип-тип|мама|gulli|multilandia|\bmult\b|smotrim 100% detskoe|balapan/i],
  ['sport', /спорт|sport|match|football|футбол|хокке|arena|fight|ufc|\bbox\b|бокс|basket|баскет|volleyball|eurosport|setanta|mma/i],
  ['music', /музык|music|mtv|радио|radio|\bхит|\bhit\b|hits|дискоте|\bclub\b|shanson|шансон|songtv|viva|strana fm|\bfm\b|muz soyuz|muzyka/i],
  ['movies', /кино|cinema|movie|film|боевик|комеди|сериал|serial|детектив|thriller|viju|премиум|индийское|dorama|kinopremyera|kinoseriya|dom kino|start world|star family|mirovoe kino|horoshee kino|nashe novoe kino|silk way cinema|priklyucheniya|nashe kino|city eden kino|smotrim chestnyy/i],
  ['education', /наук|science|документ|docu|history|истори|animal|живая планета|планета|nat geo|discovery|культур|познава|путешеств|travel|погод|weather|природ|эксперт|autopsy|лекц|love nature|the explorers|myzen|zhivaya|zoopark|domashnie zhivotnye|ohotnik|rybalka|dikij|\bistoki\b|ugra|univer|pro business|otkritiy mir|glazami turista|zdorovoe tv/i],
  ['entertainment', /развлек|entertainment|comedy|юмор|\bтнт4\b|тнт4|пятниц|shopping|\bshop\b|style|мода|дача|кухня|friday|че\b|телепутешеств|ювелир|fashion|vitrina|\bntv\b sledstviye|smotrim 100% (talk|prazdnik|lyubov)|tsv|\bza!\b|tnt4|muzhskoy|salyam|ryzhiy/i],
  ['basic', /первый|россия\b|россия[- ]24|russia[- ]?24|\bнтв\b|\bтв центр|\bтвц\b|\bрен\b|звезда|\bмир\b|обществен|общерос|general|\bnews\b|новост|публиц|союз|360|москва 24|рубль|rtr-planeta|tv rain|current time|freedom|rada|dw |euronews|rtvi|france 24|channel one|perviy|pervyy|khabar|qazaqstan international|24kz|jibek joly|sever|surgut|telekanal krasnodar|samara|novgorod|kuban|ntk|otv|prima|s1|sankt-peterburg|tv centr|vmeste/i],
];

export function pickCategory(channel) {
  const name = String(channel.name || '').toLowerCase();
  const cats = (channel.categories || []).map((c) => String(c).toLowerCase());
  const countries = (channel.countries || []).map((c) => String(c).toUpperCase());

  if (countries.includes('BY') && !/(музык|music)/.test(name)) return 'by';

  for (const [id, re] of GROUP_RULES) {
    if (re.test(name)) return id;
  }

  if (!CYRILLIC_RE.test(name) && name.length < 14) return 'other';

  for (const category of CATEGORIES) {
    if (!category.keywords.length) continue;
    for (const keyword of category.keywords) {
      if (cats.some((c) => c.includes(keyword))) return category.id;
    }
  }

  return 'other';
}
const RU_NAMES = {
  'first channel': 'Первый канал',
  'channel one': 'Первый канал',
  'channel one cis': 'Первый канал СНГ',
  'channel one eurasia': 'Первый канал Евразия',
  'channel one russia': 'Первый канал',
  'russia-1': 'Россия 1',
  'russia 1': 'Россия 1',
  'rossiya 1': 'Россия 1',
  'russia-24': 'Россия 24',
  'russia 24': 'Россия 24',
  'russia-k': 'Россия К',
  'russia k': 'Россия К',
  'russia-kultura': 'Россия К',
  ntv: 'НТВ',
  'ntv sledstviye veli': 'НТВ «Следствие вели»',
  'ntv mir': 'НТВ Мир',
  'tv centr': 'ТВ Центр',
  'tv centr international': 'ТВ Центр International',
  '5 kanal': 'Пятый канал',
  'channel 5': 'Пятый канал',
  'channel 5 international': 'Пятый канал International',
  'tv rain': 'Дождь',
  'zvezda': 'Звезда',
  'carousel': 'Карусель',
  'carousel international': 'Карусель International',
  'match tv': 'Матч ТВ',
  'rtr-planeta': 'РТР-Планета',
  'rtr-planeta europe': 'РТР-Планета Европа',
  'rtr-planeta asia': 'РТР-Планета Азия',
  'mir': 'МИР',
  'mir 24': 'МИР 24',
  'tnt': 'ТНТ',
  'tnt4': 'ТНТ4',
  'tnt4 international': 'ТНТ4 International',
  'ctc': 'СТС',
  'ren tv': 'РЕН ТВ',
  'rbc': 'РБК',
  'rbctv': 'РБК',
  'ntv belarus': 'НТВ-Беларусь',
  'sobchak live': 'Собчак Live',
  'dobro': 'Добро',
  'belarus-1': 'Беларусь 1',
  'belarus-2': 'Беларусь 2',
  'belarus-3': 'Беларусь 3',
  'belarus-4': 'Беларусь 4',
  'belarus-5': 'Беларусь 5',
  'belarus-24': 'Беларусь 24',
  'belarus 24': 'Беларусь 24',
  'vitebsk': 'Витебск',
  'stv': 'СТВ',
  'ont': 'ОНТ',
  'plustv': 'Плюс ТВ',
  'peh': 'Первый информационный',
  'perviy informationniy': 'Первый информационный',
  'pervyy respublikanskiy': 'Первый республиканский',
  'khabar': 'Хабар',
  'habar': 'Хабар',
  'habar 24': 'Хабар 24',
  'kazakhstan': 'Казахстан',
  'abai': 'Абай ТВ',
  'jibek joly': 'Жибек Жолы',
  'jibek joly hd': 'Жибек Жолы HD',
  'almaty tv': 'Алматы ТВ',
  'atameken business': 'Атамекен Business',
  'balapan': 'Балапан',
  'balapan hd': 'Балапан HD',
  'silk way': 'Silk Way',
  'silk way cinema': 'Silk Way Cinema',
  'turan tv': 'Туран ТВ',
  'sport+ qazaqstan': 'Sport+ Qazaqstan',
  'ulytau': 'Улытау',
  'rika tv': 'Рика ТВ',
  'novoe televidenie': 'Новое телевидение',
  'dom kino': 'Дом Кино',
  'dom kino international': 'Дом Кино International',
  'kinopremyera': 'Кинопремьера',
  'kinoseriya': 'Киносерия',
  'kinoboevik': 'Кинобоевик',
  'nashe novoe kino': 'Наше новое кино',
  'horoshee kino': 'Хорошее кино',
  'mirovoe kino': 'Мировое кино',
  'start world': 'START World',
  'star family': 'Star Family',
  'viju': 'VIJU',
  'dorama': 'Дорама',
  'priklyucheniya': 'Приключения',
  'smotrim chestnyy detektiv': 'Смотрим Честный детектив',
  'v gostyakh u skazki': 'В гостях у сказки',
  'city eden kinodok': 'City Eden КиноДок',
  'city eden kinodrama': 'City Eden КиноДрама',
  'city eden kinofantastika': 'City Eden КиноФантастика',
  'city eden kinoklassika': 'City Eden КиноКлассика',
  'city eden kinokomediya': 'City Eden КиноКомедия',
  'city eden kinomistika': 'City Eden КиноМистика',
  'muzyka 1': 'Музыка 1',
  'muz soyuz': 'Муз-ТВ Союз',
  'muz tv': 'Муз-ТВ',
  'viva russia': 'VIVA Russia',
  'songtv russia': 'SONGTV Russia',
  'strana fm': 'Страна FM',
  'hit fm': 'Хит FM',
  'vesti fm': 'Вести FM',
  'radio rossii': 'Радио России',
  'radio mir': 'Радио Мир',
  'radio 1': 'Радио 1',
  '1hd music television': '1HD Music Television',
  '15+ music': '15+ Music',
  'maidan': 'Майдан',
  'muzyka kino': 'Музыка Кино',
  'detskiy': 'Детский',
  'mult international': 'Мульт International',
  'multilandia': 'Мультиландия',
  'gulli girl': 'Gulli Girl',
  'nickelodeon cis': 'Nickelodeon CIS',
  'nicktoons cis': 'Nicktoons CIS',
  'babyfirst': 'BabyFirst',
  'baby time': 'Baby Time',
  'smotrim 100% detskoe': 'Смотрим 100% Детское',
  'volleyball': 'Волейбол',
  'eurosport 1 russia': 'Eurosport 1 Россия',
  'eurosport 2 russia': 'Eurosport 2 Россия',
  'trace sport stars russia': 'Trace Sport Stars Россия',
  'mma-tv.com': 'MMA-TV.com',
  'fon tv': 'FON TV',
  'zhivaya planeta': 'Живая Планета',
  'zoopark': 'Зоопарк',
  'domashnie zhivotnye': 'Домашние животные',
  'rybalka i okhota': 'Рыбалка и охота',
  'ohotnik i rybolov': 'Охотник и рыболов',
  'glazami turista': 'Глазами туриста',
  'istoriya': 'История',
  'istoki': 'Истоки',
  'kulinar tv': 'Кулинар ТВ',
  'zdorovoe tv': 'Здоровое ТВ',
  'pro business': 'Pro Business',
  'otkritiy mir. zdorove': 'Открытый мир. Здоровье',
  'univer tv': 'Универ ТВ',
  'ugra-tv': 'Югра-ТВ',
  'love nature': 'Love Nature',
  'love nature hd': 'Love Nature HD',
  'national geographic wild (russia)': 'Nat Geo Wild Россия',
  'smotrim 100% fakty': 'Смотрим 100% Факты',
  'smotrim 100% klassika': 'Смотрим 100% Классика',
  'shopping live': 'Shopping Live',
  'vitrina tv': 'Витрина ТВ',
  'yuvelirochka': 'Ювелирочка',
  'friday! international kazakhstan': 'Пятница! International',
  'muzhskoy hd': 'Мужской HD',
  'salyam': 'Салам',
  'ryzhiy': 'Рыжий',
  'za! tv': 'Za! TV',
  'tsv': 'ТСВ',
  'smotrim 100% prazdnik': 'Смотрим 100% Праздник',
  'smotrim 100% lyubov': 'Смотрим 100% Любовь',
  'smotrim 100% muzhskoe': 'Смотрим 100% Мужское',
  'smotrim 100% k 1': 'Смотрим 100% К-1',
  'smotrim 100% gorkogo': 'Смотрим 100% Горького',
  'moskva 24': 'Москва 24',
  'moskva. doveriye': 'Москва. Доверие',
  'sankt-peterburg hd': 'Санкт-Петербург HD',
  'telekanal krasnodar': 'Телеканал Краснодар',
  'novgorobltv': 'Новгородское областное ТВ',
  'surgut 24': 'Сургут 24',
  'sever': 'Север',
  's1': 'С1',
  'ntk 21': 'НТК 21',
  'otv-prim': 'ОТВ-Прим',
  'prima (russia)': 'Прима',
  'kuban 24 sd': 'Кубань 24',
  'samara-gis': 'Самара-ГИС',
  'lugansk 24': 'Луганск 24',
  'tavriya': 'Таврия',
  'tele dom': 'ТелеДом',
  'teledom': 'ТелеДом',
  'vmeste-rf': 'Вместе-РФ',
  'kuraj-tv': 'Курай-ТВ',
  'nasha tema': 'Наша тема',
  'svoyo tv': 'Своё ТВ',
  'novoe televidenie (kz)': 'Новое телевидение',
  'magnat': 'Магнат',
  'ingushetia': 'Ингушетия',
  'dagestan': 'Дагестан',
  'nvk sakha': 'НВК Саха',
  'rossiya 1 vainah': 'Россия 1 Вайнах',
  'kazan': 'Казань',
  'tnv-tatarstan': 'ТНВ-Татарстан',
  'tnv-planet': 'ТНВ-Планета',
  'current time tv': 'Настоящее Время',
  'freedom': 'FREEDOM',
  'rada tv': 'Рада',
  'dw russian': 'DW на русском',
  'euronews russian': 'Euronews на русском',
  'rtvi us': 'RTVi',
  'rt documentary russian': 'RT Documentary',
  'rtvi': 'RTVi',
  'moldova 1': 'Молдова 1',
  'moldova 2': 'Молдова 2',
  "o'zbekiston": 'Узбекистан',
  'uzreport tv': 'UzReport TV',
  'dasturxon tv': 'Дастурхон ТВ',
};
export function nameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\((?:sd|hd|[0-9]{3,4}[pi]|[0-9]{3,4}x[0-9]{3,4})\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function russianName(name) {
  return RU_NAMES[nameKey(name)] || null;
}

export function cleanName(name) {
  return String(name || '')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function fetchText(url, { timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' }, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url) {
  return JSON.parse(await fetchText(url, { timeoutMs: 60000 }));
}

export function parseM3U(text, baseUrl = '') {
  const items = [];
  let current = null;
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^#EXTINF/i.test(line)) {
      const comma = lastCommaOutsideQuotes(line);
      const head = comma === -1 ? line : line.slice(0, comma);
      const name = comma === -1 ? '' : line.slice(comma + 1).trim();
      const attrs = {};
      const re = /([\w-]+)\s*=\s*"([^"]*)"/g;
      let m;
      while ((m = re.exec(head))) attrs[m[1].toLowerCase()] = m[2].trim();
      current = { name, attrs, catchup: false };
      continue;
    }

    if (/^#EXTGRP\s*:/i.test(line)) {
      if (current) current.attrs['group-title'] = line.slice(line.indexOf(':') + 1).trim();
      continue;
    }

    if (/^#VLCORE\s*:\s*loop/i.test(line) || /^#EXTVLCOPT\s*:\s*vlc-loop/i.test(line)) {
      if (current) current.catchup = true;
      continue;
    }

    if (/^#KODIPROP\s*:\s*inputstream\.adaptive\.(manifest_type|catchup)/i.test(line)) {
      if (current && /manifest_type\s*=\s*\w+/i.test(line)) current.catchup = true;
      continue;
    }

    if (line.startsWith('#')) continue;
    if (!/^https?:\/\//i.test(line)) continue;

    let url = line;
    if (baseUrl && !/^https?:\/\//i.test(url)) {
      try { url = new URL(url, baseUrl).href; } catch { /* ignore */ }
    }

    items.push({ ...(current || { name: '', attrs: {}, catchup: false }), url });
    current = null;
  }

  return items;
}

function lastCommaOutsideQuotes(line) {
  let inQuotes = false;
  let index = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) index = i;
  }
  return index;
}

export async function mapLimit(list, limit, worker) {
  const out = new Array(list.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (index < list.length) {
      const current = index++;
      out[current] = await worker(list[current], current);
    }
  });
  await Promise.all(runners);
  return out;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeFile(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}
/** Источник для проверки CORS (сайт IPTV-playlist на GitHub Pages). */
export const ORIGIN = 'https://ronis759.github.io';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** Быстрая HTTP-проверка потока: манифест → вариант → первый фрагмент, наличие CORS и скорость. */
export async function probeStream(url, { timeoutMs = 15000, maxTotalMs = 20000 } = {}) {
  const started = performance.now();
  const result = { alive: false, cors: false, ms: 0, why: '' };

  async function get(target, { text = false, range = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Origin: ORIGIN, 'User-Agent': UA, Accept: '*/*' };
      if (range) headers.Range = 'bytes=0-2047';
      const res = await fetch(target, { headers, signal: controller.signal, redirect: 'follow' });
      const entry = {
        ok: res.ok,
        status: res.status,
        cors: corsOk(res.headers.get('access-control-allow-origin')),
        type: res.headers.get('content-type') || '',
        finalUrl: res.url || target,
        body: '',
      };
      if (text && res.ok) entry.body = await res.text();
      else { try { await res.body?.cancel(); } catch { /* ignore */ } }
      return entry;
    } finally { clearTimeout(timer); }
  }

  function corsOk(value) {
    const v = (value || '').toLowerCase();
    return v === '*' || v.includes('ronis759');
  }

  function firstMatch(text, baseUrl, prefix) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim().startsWith(prefix)) continue;
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j].trim();
        if (!line || line.startsWith('#')) continue;
        try { return new URL(line, baseUrl).href; } catch { return null; }
      }
    }
    return null;
  }

  function firstUri(text, baseUrl) {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      try { return new URL(line, baseUrl).href; } catch { return null; }
    }
    return null;
  }

  try {
    const manifest = await get(url, { text: true });
    if (!manifest.ok) { result.why = `манифест ${manifest.status}`; return finish(); }
    if (!/^#EXTM3U/i.test(manifest.body.trim())) { result.why = 'не m3u8'; return finish(); }
    if (!manifest.cors) { result.why = 'CORS манифеста'; return finish(); }

    let mediaUrl = manifest.finalUrl;
    let mediaText = manifest.body;

    if (/#EXT-X-STREAM-INF/i.test(manifest.body)) {
      const variantUrl = firstMatch(manifest.body, manifest.finalUrl, '#EXT-X-STREAM-INF');
      if (!variantUrl) { result.why = 'нет варианта'; return finish(); }
      const variant = await get(variantUrl, { text: true });
      if (!variant.ok || !variant.cors || !/^#EXTM3U/i.test(variant.body.trim())) {
        result.why = 'вариант'; return finish();
      }
      mediaUrl = variant.finalUrl;
      mediaText = variant.body;
    }

    const segmentUrl = firstUri(mediaText, mediaUrl);
    if (!segmentUrl) { result.why = 'нет фрагмента'; return finish(); }
    const segment = await get(segmentUrl, { range: true });
    if (!segment.ok || !segment.cors || /text\/html/i.test(segment.type)) {
      result.why = 'фрагмент'; return finish();
    }

    result.alive = true;
    result.cors = true;
    return finish();
  } catch (error) {
    result.why = error.name === 'AbortError' ? 'таймаут' : error.name;
    return finish();
  }

  function finish() {
    result.ms = Math.round(performance.now() - started);
    if (result.alive && result.ms > maxTotalMs) {
      result.alive = false;
      result.why = 'медленно';
    }
    return result;
  }
}
