/**
 * Per-student frustration history for the learning dashboard.
 * Daily buckets + topic averages + recent performance points.
 */
import { studentStorageKey } from './mockStudents.js';
import { frustrationLevelFromScore } from './frustrationModel.js';

const BASE_KEY = 'scipath_frustration_history';
const VERSION = 1;

function storageKey() {
  return studentStorageKey(BASE_KEY);
}

function dayKey(date = new Date()) {
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

/**
 * Record one quiz / session sample. Safe to call after every answer.
 */
export function recordFrustrationSample(sample = {}) {
  const data = loadFrustrationHistory();
  const date = dayKey();
  const score = Math.max(0, Math.min(100, Math.round(Number(sample.score) || 0)));
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
  });
  data.points = data.points.slice(-48);

  const topic = String(sample.topic || '').trim();
  if (topic && topic !== 'Science') {
    const prev = data.topics[topic] || {
      topic,
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

/** Last `count` calendar days, including today (missing days are null). */
export function frustrationDaySeries(count = 14, live = null) {
  const data = loadFrustrationHistory();
  const days = [...data.days];
  if (live && Number.isFinite(Number(live.score))) {
    const today = dayKey();
    const existing = days.find((row) => row.date === today);
    if (existing) {
      existing.score = Math.round(Number(live.score));
      existing.level = live.level || frustrationLevelFromScore(existing.score);
      if (live.answered) existing.answered = Math.max(existing.answered || 0, live.answered);
      if (live.accuracyPct != null) existing.accuracyPct = live.accuracyPct;
    } else {
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
    }
  }

  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
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
  return out;
}

export function frustrationByTopic(misconceptions = []) {
  const data = loadFrustrationHistory();
  const map = { ...data.topics };

  for (const m of misconceptions || []) {
    const topic = String(m.topic || '').trim();
    if (!topic) continue;
    const misses = Number(m.missCount) || (m.attempts || []).length || 0;
    const prev = map[topic] || {
      topic,
      n: 0,
      avgScore: 0,
      answered: 0,
      misses: 0,
      lastScore: 0,
    };
    prev.misses = Math.max(prev.misses, misses);
    if (!prev.n && misses) {
      prev.avgScore = Math.min(100, 28 + misses * 14);
      prev.level = frustrationLevelFromScore(prev.avgScore);
    }
    map[topic] = prev;
  }

  return Object.values(map)
    .filter((row) => row.topic)
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0) || (b.misses || 0) - (a.misses || 0))
    .slice(0, 8);
}

export function frustrationPerformancePoints() {
  return loadFrustrationHistory().points.slice(-24);
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
