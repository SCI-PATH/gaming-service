/**
 * Per-student frustration history for the learning dashboard.
 * Daily buckets + topic averages + recent performance points, plus
 * question-by-question samples for the play-journey view.
 */
import { studentStorageKey } from './mockStudents.js';
import { frustrationLevelFromScore } from './frustrationModel.js';
import {
  chapterDisplayName,
  chapterIdFromTopicId,
  resolveChapterFromEngine,
} from './curriculumTopics.js';

const BASE_KEY = 'scipath_frustration_history';
const VERSION = 1;
const MAX_SAMPLES = 240;

function storageKey() {
  return studentStorageKey(BASE_KEY);
}

function dayKey(date = new Date()) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    return date.trim();
  }
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyState() {
  return {
    version: VERSION,
    days: [],
    topics: {},
    points: [],
    streak: 0,
    lastPlayDate: null,
    samples: [],
  };
}

export function loadFrustrationHistory() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyState();
    return {
      ...emptyState(),
      ...data,
      days: Array.isArray(data.days) ? data.days : [],
      topics: data.topics && typeof data.topics === 'object' ? data.topics : {},
      points: Array.isArray(data.points) ? data.points : [],
      samples: Array.isArray(data.samples) ? data.samples : [],
      streak: Number(data.streak) || 0,
      lastPlayDate: data.lastPlayDate || null,
    };
  } catch {
    return emptyState();
  }
}

function saveState(data) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(data));
  } catch {
    /* quota */
  }
  return data;
}

function yesterdayKey(from = dayKey()) {
  const d = new Date(`${from}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

function clipPrompt(value, max = 220) {
  const t = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function isGenericTopic(value) {
  const t = String(value || '').trim().toLowerCase();
  return !t || t === 'science' || t === 'general science' || t === 'general';
}

function sampleTopicId(row) {
  return String(row?.chapterId || row?.chapter_id || row?.topicId || row?.topic || '').trim();
}

function sampleMatchesChapter(row, filterId) {
  const wanted = String(filterId || '').trim();
  if (!wanted) return true;
  const raw = sampleTopicId(row);
  if (raw === wanted) return true;
  const wantedChapter = chapterIdFromTopicId(wanted) || (/^G[6-9]_C\d+$/i.test(wanted) ? wanted.toUpperCase() : '');
  const rowChapter =
    chapterIdFromTopicId(raw) ||
    chapterIdFromTopicId(row?.chapterId || row?.chapter_id);
  return Boolean(wantedChapter && rowChapter && wantedChapter === rowChapter);
}

/**
 * Record one quiz / session sample. Safe to call after every answer.
 */
export function recordFrustrationSample(sample = {}) {
  const data = loadFrustrationHistory();
  const date = dayKey();
  const score = clampScore(sample.score);
  const isCorrect = Boolean(sample.isCorrect);
  const timeSec = Number(sample.timeSec) || 0;
  const hints = Number(sample.hints) || 0;
  const retries = Number(sample.retries) || 0;

  let day = data.days.find((row) => row.date === date);
  if (!day) {
    day = {
      date,
      n: 0,
      score,
      answered: 0,
      correct: 0,
      incorrect: 0,
      hints: 0,
      retries: 0,
      timeSum: 0,
    };
    data.days.push(day);
  }
  const n = day.n + 1;
  day.score = Math.round((day.score * day.n + score) / n);
  day.n = n;
  day.answered += 1;
  if (isCorrect) day.correct += 1;
  else day.incorrect += 1;
  day.hints += hints;
  day.retries += retries;
  day.timeSum += timeSec;
  day.avgTimeSec = day.answered ? Math.round((day.timeSum / day.answered) * 10) / 10 : 0;
  day.accuracyPct =
    day.answered > 0 ? Math.round((day.correct / day.answered) * 100) : null;
  day.level = frustrationLevelFromScore(day.score);
  data.days = data.days
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-30);

  const answered = (Number(sample.correctTotal) || 0) + (Number(sample.incorrectTotal) || 0);
  const accuracyPct =
    answered > 0
      ? Math.round(((Number(sample.correctTotal) || 0) / answered) * 100)
      : day.accuracyPct;
  data.points.push({
    at: Date.now(),
    score,
    accuracyPct,
    retries,
    avgTimeSec: timeSec,
    incorrect: isCorrect ? 0 : 1,
    topicId: String(sample.topicId || sample.topic || '').trim() || null,
    chapterId:
      resolveChapterFromEngine(sample).chapterId ||
      chapterIdFromTopicId(sample.topicId || sample.topic) ||
      null,
    chapter_name: String(sample.chapter_name || sample.chapterName || '').trim() || null,
    prompt: clipPrompt(sample.prompt || sample.question),
    questionType: String(sample.questionType || sample.question_type || '').trim() || null,
    options: Array.isArray(sample.options) ? sample.options.slice(0, 8) : undefined,
    isCorrect: Boolean(sample.isCorrect),
  });
  data.points = data.points.slice(-48);

  const topic = String(sample.topicId || sample.topic || '').trim();
  if (topic && !isGenericTopic(topic)) {
    const prev = data.topics[topic] || {
      topic,
      topicId: topic,
      title: chapterDisplayName(topic, sample.chapter_name || topic),
      n: 0,
      avgScore: score,
      answered: 0,
      misses: 0,
      lastScore: score,
    };
    const tn = prev.n + 1;
    prev.avgScore = Math.round((prev.avgScore * prev.n + score) / tn);
    prev.n = tn;
    prev.answered += 1;
    if (!isCorrect) prev.misses += 1;
    prev.lastScore = score;
    prev.level = frustrationLevelFromScore(prev.avgScore);
    const chapter = resolveChapterFromEngine({
      ...sample,
      topicId: topic,
      topic,
    });
    prev.chapterId = chapter.chapterId || prev.chapterId || chapterIdFromTopicId(topic);
    prev.chapter_name = chapter.chapterName || prev.chapter_name || sample.chapter_name;
    prev.title = chapterDisplayName(
      prev.chapterId || topic,
      prev.chapter_name || prev.title || topic,
    );
    data.topics[topic] = prev;
  }

  if (data.lastPlayDate === date) {
    /* same day — streak unchanged */
  } else if (data.lastPlayDate === yesterdayKey(date)) {
    data.streak = (Number(data.streak) || 0) + 1;
  } else {
    data.streak = 1;
  }
  data.lastPlayDate = date;
  data.version = VERSION;
  return saveState(data);
}

function shouldApplyLive(live) {
  if (!live || !Number.isFinite(Number(live.score))) return false;
  return (Number(live.answered) || 0) > 0 || Number(live.score) > 0;
}

/** Last `count` calendar days ending today. Leading empty days are dropped. */
export function frustrationDaySeries(count = 14, live = null, filters = {}) {
  const data = loadFrustrationHistory();
  const { topicId, fromKey, toKey } = normalizeFilters(filters);
  const days = applyLiveToDays(
    topicId ? daysFromSamples(data.samples, topicId) : [...data.days],
    live,
    topicId,
  );

  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    if (fromKey && key < fromKey) continue;
    if (toKey && key > toKey) continue;
    const hit = days.find((row) => row.date === key);
    out.push({
      date: key,
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      score: hit ? Number(hit.score) : null,
      level: hit?.level || null,
      accuracyPct: hit?.accuracyPct ?? null,
      answered: hit?.answered || 0,
    });
  }
  const first = out.findIndex((row) => row.score != null);
  return first < 0 ? [] : out.slice(first);
}

function daysFromSamples(samples = [], topicId = '') {
  const byDay = new Map();
  for (const sample of samples || []) {
    if (topicId && !sampleMatchesChapter(sample, topicId)) continue;
    const key = dayKey(sample.at || Date.now());
    const prev = byDay.get(key) || { date: key, n: 0, score: 0, answered: 0 };
    const n = prev.n + 1;
    prev.score = Math.round((prev.score * prev.n + clampScore(sample.score)) / n);
    prev.n = n;
    prev.answered = n;
    prev.level = frustrationLevelFromScore(prev.score);
    byDay.set(key, prev);
  }
  return [...byDay.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function applyLiveToDays(days, live, topicId = '') {
  if (!shouldApplyLive(live)) return days;
  if (topicId && live.topicId && !sampleMatchesChapter(live, topicId)) return days;
  const today = dayKey();
  const existing = days.find((row) => row.date === today);
  if (existing) {
    existing.score = Math.round(Number(live.score));
    existing.level = live.level || frustrationLevelFromScore(existing.score);
    if (live.answered) existing.answered = Math.max(existing.answered || 0, live.answered);
    if (live.accuracyPct != null) existing.accuracyPct = live.accuracyPct;
    return days;
  }
  days.push({
    date: today,
    n: 1,
    score: Math.round(Number(live.score)),
    level: live.level || frustrationLevelFromScore(live.score),
    answered: Number(live.answered) || 0,
    correct: Number(live.correct) || 0,
    incorrect: Number(live.incorrect) || 0,
    accuracyPct: live.accuracyPct ?? null,
  });
  return days;
}

function filterSamples(samples = [], filters = {}) {
  const { topicId, fromMs, toMs } = normalizeFilters(filters);
  return (samples || []).filter((sample) => {
    if (topicId && !sampleMatchesChapter(sample, topicId)) return false;
    const at = Number(sample.at);
    if (fromMs != null && Number.isFinite(at) && at < fromMs) return false;
    if (toMs != null && Number.isFinite(at) && at > toMs) return false;
    return true;
  });
}

export function dateRangeFromPreset(preset = 'all', customDate = '') {
  if (customDate) {
    const key = dayKey(customDate);
    const fromMs = new Date(`${key}T00:00:00`).getTime();
    const toMs = new Date(`${key}T23:59:59.999`).getTime();
    return { fromMs, toMs, fromKey: key, toKey: key };
  }
  if (preset === 'today') {
    const key = dayKey();
    return {
      fromMs: new Date(`${key}T00:00:00`).getTime(),
      toMs: Date.now(),
      fromKey: key,
      toKey: key,
    };
  }
  if (preset === '7d' || preset === '14d') {
    const span = preset === '7d' ? 7 : 14;
    const start = new Date();
    start.setDate(start.getDate() - (span - 1));
    const fromKey = dayKey(start);
    return {
      fromMs: new Date(`${fromKey}T00:00:00`).getTime(),
      toMs: Date.now(),
      fromKey,
      toKey: dayKey(),
    };
  }
  return { fromMs: null, toMs: null, fromKey: null, toKey: null };
}

function normalizeFilters(filters = {}) {
  const topicId = String(filters.topicId || '').trim();
  if (filters.fromMs != null || filters.toMs != null || filters.fromKey || filters.toKey) {
    return {
      topicId,
      fromMs: filters.fromMs ?? null,
      toMs: filters.toMs ?? null,
      fromKey: filters.fromKey || null,
      toKey: filters.toKey || null,
    };
  }
  return {
    topicId,
    ...dateRangeFromPreset(filters.preset || 'all', filters.customDate || ''),
  };
}

/** Question-by-question scores for first-day / sparse calendars. */
export function frustrationQuestionSeries(limit = 24, live = null, filters = {}) {
  const samples = filterSamples(loadFrustrationHistory().samples || [], filters);
  const slice = samples.slice(-Math.max(2, limit));
  const out = slice.map((s, i) => ({
    date: `q-${s.seq || s.globalIndex || i}`,
    label: `Q${s.globalIndex || s.seq || i + 1}`,
    score: clampScore(s.score),
    level: s.band || frustrationLevelFromScore(s.score),
  }));
  if (shouldApplyLive(live) && out.length) {
    if (!filters.topicId || !live.topicId || live.topicId === filters.topicId) {
      const last = out[out.length - 1];
      last.score = clampScore(live.score);
      last.level = live.level || last.level;
    }
  }
  return out;
}

/**
 * Pick a chart that actually has a line: daily history when it exists,
 * otherwise the question journey from this session.
 */
export function buildFrustrationChartModel(live = null, filters = {}) {
  const daySeries = frustrationDaySeries(14, live, filters);
  const scoredDays = daySeries.filter((row) => row.score != null);
  const samples = filterSamples(loadFrustrationHistory().samples || [], filters);
  const filtered = Boolean(
    String(filters.topicId || '').trim() ||
      (filters.preset && filters.preset !== 'all') ||
      filters.customDate ||
      filters.fromMs != null,
  );

  if (scoredDays.length < 2 && samples.length >= 2) {
    return {
      mode: 'question',
      series: frustrationQuestionSeries(24, live, filters),
      subtitle: filtered
        ? 'Question by question for this filter — green is calm, gold is stuck, coral is high'
        : 'Question by question — green is calm, gold is stuck, coral is high',
      note: null,
    };
  }

  const emptyFilterNote =
    filtered && scoredDays.length === 0
      ? 'No play matches this topic or date yet. Try All topics, or pick another day.'
      : null;

  return {
    mode: 'day',
    series: daySeries,
    subtitle: filtered
      ? 'Day by day for this filter — green is calm, gold is stuck, coral is high'
      : 'Day by day — green is calm, gold is stuck, coral is high',
    note:
      emptyFilterNote ||
      (scoredDays.length === 1
        ? 'Only one play day in this filter. The line fills in as you play more.'
        : null),
  };
}

export function listFrustrationTopics() {
  const data = loadFrustrationHistory();
  const ids = new Set();
  const add = (raw, extra = {}) => {
    const chapter = resolveChapterFromEngine({ ...extra, topicId: raw, topic: raw });
    const id = chapter.chapterId || String(raw || '').trim();
    if (!id || isGenericTopic(id)) return;
    ids.add(id);
  };
  for (const [key, row] of Object.entries(data.topics || {})) {
    add(key, row);
  }
  for (const sample of data.samples || []) {
    add(sampleTopicId(sample), sample);
  }
  for (const point of data.points || []) {
    add(sampleTopicId(point), point);
  }
  return [...ids]
    .sort((a, b) =>
      chapterDisplayName(a, a).localeCompare(chapterDisplayName(b, b)),
    )
    .map((topicId) => ({
      topicId,
      title: chapterDisplayName(topicId, topicId),
    }));
}

export function frustrationByTopic(misconceptions = []) {
  const data = loadFrustrationHistory();
  const map = {};

  const merge = (rawId, row = {}) => {
    const chapter = resolveChapterFromEngine({
      ...row,
      topicId: rawId,
      topic: rawId,
    });
    const key = chapter.chapterId || String(rawId || '').trim();
    if (!key || isGenericTopic(key)) return;
    const title =
      chapter.label ||
      chapterDisplayName(key, row.chapter_name || row.title || key);
    const prev = map[key];
    const n = Number(row.n) || 0;
    const avgScore = Number(row.avgScore) || 0;
    const misses = Number(row.misses) || 0;
    const answered = Number(row.answered) || 0;
    if (!prev) {
      map[key] = {
        topic: title,
        topicId: key,
        title,
        chapterId: key,
        chapter_name: chapter.chapterName || row.chapter_name || '',
        n,
        avgScore,
        answered,
        misses,
        lastScore: Number(row.lastScore) || avgScore,
        level: frustrationLevelFromScore(avgScore),
      };
      return;
    }
    const tn = (prev.n || 0) + n;
    if (tn) {
      prev.avgScore = Math.round(
        ((prev.avgScore || 0) * (prev.n || 0) + avgScore * n) / tn,
      );
    }
    prev.n = tn;
    prev.misses = (prev.misses || 0) + misses;
    prev.answered = (prev.answered || 0) + answered;
    prev.title = title || prev.title;
    prev.topic = prev.title;
    prev.chapter_name = chapter.chapterName || prev.chapter_name;
    prev.level = frustrationLevelFromScore(prev.avgScore);
  };

  for (const [key, row] of Object.entries(data.topics || {})) {
    merge(key, row);
  }

  const liveByChapter = {};
  for (const m of misconceptions || []) {
    const attempt = (m.attempts || []).find(
      (a) => a?.chapter_name || a?.chapter_id || a?.topicId,
    ) || m.attempts?.[0] || {};
    const chapter = resolveChapterFromEngine({
      ...m,
      ...attempt,
      topicId: m.topicId || m.topic,
      topic: m.topicId || m.topic,
    });
    const key = chapter.chapterId || String(m.topicId || m.topic || '').trim();
    if (!key || isGenericTopic(key)) continue;
    const misses = Number(m.missCount) || (m.attempts || []).length || 0;
    const prev = liveByChapter[key] || { misses: 0, title: chapter.label, chapter };
    prev.misses += misses;
    prev.title = chapter.label || prev.title;
    prev.chapter = chapter;
    liveByChapter[key] = prev;
  }

  for (const [key, live] of Object.entries(liveByChapter)) {
    const prev = map[key];
    if (prev) {
      prev.misses = Math.max(prev.misses || 0, live.misses || 0);
      prev.title = live.title || prev.title;
      prev.topic = prev.title;
      if (!prev.n && live.misses) {
        prev.avgScore = Math.min(100, 28 + live.misses * 14);
        prev.level = frustrationLevelFromScore(prev.avgScore);
      }
      continue;
    }
    map[key] = {
      topic: live.title,
      topicId: key,
      title: live.title,
      chapterId: key,
      chapter_name: live.chapter?.chapterName || '',
      n: 0,
      avgScore: Math.min(100, 28 + live.misses * 14),
      answered: 0,
      misses: live.misses,
      lastScore: 0,
      level: frustrationLevelFromScore(Math.min(100, 28 + live.misses * 14)),
    };
  }

  return Object.values(map)
    .filter((row) => row.topic)
    .map((row) => ({
      ...row,
      topic: chapterDisplayName(row.topicId || row.chapterId, row.chapter_name || row.title),
    }))
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0) || (b.misses || 0) - (a.misses || 0))
    .slice(0, 8);
}

export function frustrationPerformancePoints(filters = {}) {
  const { topicId, fromMs, toMs } = normalizeFilters(filters);
  return loadFrustrationHistory()
    .points.filter((p) => {
      if (topicId && !sampleMatchesChapter(p, topicId)) return false;
      const at = Number(p.at);
      if (fromMs != null && Number.isFinite(at) && at < fromMs) return false;
      if (toMs != null && Number.isFinite(at) && at > toMs) return false;
      return true;
    })
    .slice(-24);
}

export function learningStreak() {
  return loadFrustrationHistory().streak || 0;
}

/**
 * If the student has lesson records but no daily history yet, seed days from
 * those saves so the graph is not empty on first dashboard open.
 */
export function seedHistoryFromLessons(lessonProgress = [], liveScore = 0) {
  const data = loadFrustrationHistory();
  if (data.days.length >= 3) return data;
  const rows = (lessonProgress || []).filter((r) => r.savedAt);
  if (!rows.length && !liveScore) return data;

  for (const row of rows) {
    const date = dayKey(row.savedAt);
    if (data.days.some((d) => d.date === date)) continue;
    const accuracy = Number(row.accuracyPct);
    const score =
      Number.isFinite(accuracy)
        ? Math.max(8, Math.min(88, Math.round(100 - accuracy * 0.7)))
        : Math.round(Number(liveScore) || 20);
    data.days.push({
      date,
      n: 1,
      score,
      level: frustrationLevelFromScore(score),
      answered: Number(row.questionsAnswered) || 0,
      correct: Number(row.quizCorrect) || 0,
      incorrect: Number(row.quizIncorrect) || 0,
      accuracyPct: Number.isFinite(accuracy) ? accuracy : null,
      hints: 0,
      retries: Number(row.retries) || 0,
      timeSum: 0,
      avgTimeSec: row.avgResponseMs ? Math.round(row.avgResponseMs / 100) / 10 : 0,
    });
  }
  data.days = data.days
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-30);
  return saveState(data);
}

export function getFrustrationHistory() {
  return loadFrustrationHistory().samples;
}

export function appendFrustrationSample(sample = {}) {
  const store = loadFrustrationHistory();
  const prev = store.samples[store.samples.length - 1];
  const seq = (Number(prev?.seq) || 0) + 1;
  const levelId = Math.max(1, Number(sample.levelId) || 1);
  const inLevel =
    store.samples.filter((s) => Number(s.levelId) === levelId).length + 1;
  const topicId = String(sample.topicId || sample.topic || '').trim() || null;
  const next = {
    seq,
    globalIndex: seq,
    levelId,
    questionIndex: Math.max(1, Number(sample.questionIndex) || inLevel),
    score: clampScore(sample.score),
    band: String(sample.level || sample.band || 'low').toLowerCase(),
    correct: Boolean(sample.correct),
    signals: Array.isArray(sample.signals) ? sample.signals.slice(0, 8) : [],
    topicId,
    topic: topicId,
    chapterId:
      resolveChapterFromEngine(sample).chapterId ||
      chapterIdFromTopicId(topicId) ||
      null,
    chapter_name: String(sample.chapter_name || sample.chapterName || '').trim() || null,
    at: Date.now(),
  };
  store.samples = [...store.samples, next].slice(-MAX_SAMPLES);
  saveState(store);
  return store.samples;
}

function avgScore(list) {
  if (!list.length) return null;
  const total = list.reduce((sum, item) => {
    const n = typeof item === 'number' ? item : Number(item?.score);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  return Math.round(total / list.length);
}

function bandLabel(band) {
  const key = String(band || 'low').toLowerCase();
  if (key === 'very_high') return 'very high';
  if (key === 'high') return 'high';
  if (key === 'moderate') return 'moderate';
  return 'low';
}

/**
 * Collapse consecutive same-band samples into play phases + a short story.
 */
export function summarizeFrustrationJourney(samples = []) {
  if (!samples.length) {
    return {
      segments: [],
      headline: null,
      firstWindow: null,
      laterWindow: null,
    };
  }

  const segments = [];
  for (const sample of samples) {
    const last = segments[segments.length - 1];
    if (last && last.band === sample.band) {
      last.end = sample.globalIndex;
      last.endQuestion = sample.questionIndex;
      last.endLevelId = sample.levelId;
      last.scores.push(sample.score);
    } else {
      segments.push({
        band: sample.band,
        start: sample.globalIndex,
        end: sample.globalIndex,
        startQuestion: sample.questionIndex,
        endQuestion: sample.questionIndex,
        startLevelId: sample.levelId,
        endLevelId: sample.levelId,
        scores: [sample.score],
      });
    }
  }

  const labeled = segments.map((seg) => ({
    ...seg,
    avgScore: avgScore(seg.scores),
    label: bandLabel(seg.band),
    questionRange:
      seg.start === seg.end
        ? `Q${seg.start}`
        : `Q${seg.start}–Q${seg.end}`,
  }));

  const firstWindow = samples.slice(0, 5);
  const laterWindow = samples.slice(5);
  const earlyAvg = avgScore(firstWindow);
  const laterAvg = avgScore(laterWindow);
  const overallAvg = avgScore(samples);

  let headline = `Play so far averages ${overallAvg}/100 frustration.`;
  if (firstWindow.length >= 3 && laterWindow.length >= 3) {
    if (earlyAvg - laterAvg >= 12) {
      headline = `The first ${firstWindow.length} questions felt tougher (${earlyAvg}/100). Later play eased to ${laterAvg}/100.`;
    } else if (laterAvg - earlyAvg >= 12) {
      headline = `Play started calmer (${earlyAvg}/100). Later questions rose to ${laterAvg}/100.`;
    } else {
      headline = `Play stayed fairly steady — early ${earlyAvg}/100, later ${laterAvg}/100.`;
    }
  } else if (labeled.length >= 2) {
    const first = labeled[0];
    const last = labeled[labeled.length - 1];
    headline = `Started ${first.label} (${first.questionRange}), ended ${last.label} (${last.questionRange}).`;
  }

  return {
    segments: labeled,
    headline,
    firstWindow: earlyAvg == null ? null : { count: firstWindow.length, avg: earlyAvg },
    laterWindow: laterAvg == null ? null : { count: laterWindow.length, avg: laterAvg },
    overallAvg,
  };
}
