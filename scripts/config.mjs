/**
 * Параметры проверки. Подбирались замерами: 10 запросов подряд,
 * таймаут 15 секунд (часть российских серверов отвечает медленно).
 */
export const CHECK = {
  concurrency: 10,
  timeoutMs: 15000,
  maxTotalMs: 20000,
  limitPerChannel: 4,
};

/** Проверка реального запуска видео в браузере (hls.js). */
export const PLAYBACK = {
  timeoutMs: 12000,
  maxStartMs: 6000,
};

/** Идентификаторы категорий и порядок в плейлисте. */
export const CATEGORY_IDS = [
  'basic', 'by', 'entertainment', 'education', 'movies', 'music', 'kids', 'sport', 'other',
];
