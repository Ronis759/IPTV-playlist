import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const CYRILLIC = /[а-яё]/i;

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/channels.json'), 'utf8'));
let channels = data.channels || [];

const before = channels.length;
channels = channels.filter((ch) => CYRILLIC.test(ch.n));
channels.sort((a, b) => a.n.localeCompare(b.n, 'ru'));

console.log('Было каналов: ' + before + ', осталось с кириллицей: ' + channels.length);

const date = new Date().toISOString().slice(0, 10);

function m3uEntry(channel) {
  var attrs = [
    'tvg-id="' + (channel.s || '').replace(/"/g, '') + '"',
    'tvg-logo="' + (channel.l || '').replace(/"/g, '') + '"',
    'group-title="' + (channel.g || 'Разное') + '"',
    'tvg-name="' + channel.n.replace(/"/g, "'") + '"'
  ];
  var lines = ['#EXTINF:-1 ' + attrs.join(' ') + ', ' + channel.n];
  if (channel.a) lines.push('#EXTVLCOPT:vlc-loop');
  lines.push(channel.u);
  return lines.join('\n');
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function writeFile(file, text) { ensureDir(path.dirname(file)); fs.writeFileSync(file, text, 'utf8'); }

var main = ['#EXTM3U', '# IPTV-playlist · ' + date + ' · каналов: ' + channels.length + ' · только русскоязычные'];
var cats = {basic:'Базовые', by:'Беларусь', entertainment:'Развлекательные', education:'Познавательные', movies:'Кино', music:'Музыка', kids:'Детские', sport:'Спорт', other:'Разное'};
for (var cid in cats) {
  var list = channels.filter(function(ch){return ch.c === cid;});
  if (!list.length) continue;
  main.push('');
  main.push('# ===== ' + cats[cid] + ' (' + list.length + ') =====');
  for (var i = 0; i < list.length; i++) main.push(m3uEntry(list[i]));
}
writeFile(path.join(ROOT, 'IPTV-playlist.m3u'), main.join('\n'));

for (var cid in cats) {
  var list = channels.filter(function(ch){return ch.c === cid;});
  if (!list.length) continue;
  var lines = ['#EXTM3U', '# ' + cats[cid] + ' · ' + date + ' · каналов: ' + list.length];
  for (var i = 0; i < list.length; i++) lines.push(m3uEntry(list[i]));
  writeFile(path.join(ROOT, 'playlists', cid + '.m3u'), lines.join('\n'));
}

var streamsDir = path.join(ROOT, 'streams');
ensureDir(streamsDir);
var files = fs.readdirSync(streamsDir);
for (var i = 0; i < files.length; i++) {
  if (files[i].endsWith('.m3u')) fs.unlinkSync(path.join(streamsDir, files[i]));
}
for (var i = 0; i < channels.length; i++) {
  var ch = channels[i];
  var slug = (ch.s || ch.n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g,'')) || 'channel';
  writeFile(path.join(streamsDir, slug + '.m3u'), '#EXTM3U\n' + m3uEntry(ch));
}

var outChannels = channels.map(function(ch){return {n:ch.n, u:ch.u, l:ch.l, c:ch.c, g:cats[ch.c]||'Разное', a:Boolean(ch.a), s:ch.s, ms:ch.ms||0};});
writeFile(path.join(ROOT, 'data/channels.json'), JSON.stringify({updatedAt:new Date().toISOString(), total:channels.length, stats:data.stats, channels:outChannels}, null, 2));

var summary = [];
for (var cid in cats) {
  var cnt = channels.filter(function(ch){return ch.c === cid;}).length;
  if (cnt) summary.push({id:cid, title:cats[cid], count:cnt});
}
writeFile(path.join(ROOT, 'data/summary.json'), JSON.stringify({updatedAt:new Date().toISOString(), total:channels.length, withArchive:channels.filter(function(c){return c.a;}).length, categories:summary}, null, 2));

console.log('Готово:');
for (var cid in cats) {
  var cnt = channels.filter(function(ch){return ch.c === cid;}).length;
  if (cnt) console.log('  ' + cats[cid] + ': ' + cnt);
}
