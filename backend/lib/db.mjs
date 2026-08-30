/**
 * File-backed JSON store for the backend (prototype database).
 * Lives at backend/data/app.json — not in the frontend.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DB_PATH = resolve(DATA_DIR, 'app.json');

function emptyDb() {
  return {
    storylines: {},
    leaderboard: {},
  };
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function dbPath() {
  return DB_PATH;
}

export function readDb() {
  ensureDir();
  if (!existsSync(DB_PATH)) {
    return emptyDb();
  }
  try {
    const raw = readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      storylines:
        parsed?.storylines && typeof parsed.storylines === 'object'
          ? parsed.storylines
          : {},
      leaderboard:
        parsed?.leaderboard && typeof parsed.leaderboard === 'object'
          ? parsed.leaderboard
          : {},
    };
  } catch {
    return emptyDb();
  }
}

export function writeDb(next) {
  ensureDir();
  const payload = {
    storylines: next?.storylines && typeof next.storylines === 'object'
      ? next.storylines
      : {},
    leaderboard:
      next?.leaderboard && typeof next.leaderboard === 'object'
        ? next.leaderboard
        : {},
  };
  writeFileSync(DB_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export function saveStorylineRecord(record) {
  if (!record?.studentId) return null;
  const db = readDb();
  const packed = {
    studentId: record.studentId,
    studentName: record.studentName || null,
    level: record.level || 1,
    frustrationScore: record.frustrationScore ?? null,
    frustrationLevel: record.frustrationLevel || null,
    frustrationMetrics: record.frustrationMetrics || record.metrics || {},
    dominantIndicators: record.dominantIndicators || [],
    storyline: record.storyline,
    createdAt: record.createdAt || new Date().toISOString(),
    provider: record.provider || null,
    fallback: Boolean(record.fallback),
  };
  db.storylines[record.studentId] = packed;
  writeDb(db);
  return packed;
}

export function getStorylineRecord(studentId) {
  if (!studentId) return null;
  const db = readDb();
  return db.storylines[studentId] || null;
}

function utcDayStartIso(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export function rankLeaderboardEntries(rawEntries, opts = {}) {
  const period = opts.period === 'today' ? 'today' : 'all';
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 10));
  const studentId = String(opts.studentId || '').trim();
  const dayStart = utcDayStartIso(opts.now);
  const list = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries || {});

  const filtered =
    period === 'today'
      ? list.filter((row) => String(row?.updatedAt || '') >= dayStart)
      : list.slice();

  filtered.sort((a, b) => {
    const score = (Number(b?.score) || 0) - (Number(a?.score) || 0);
    if (score) return score;
    const quiz = (Number(b?.quizCorrect) || 0) - (Number(a?.quizCorrect) || 0);
    if (quiz) return quiz;
    return String(a?.displayName || '').localeCompare(String(b?.displayName || ''));
  });

  const toRow = (row, rank) => ({
    rank,
    studentId: row.studentId,
    displayName: row.displayName || row.studentName || 'Player',
    currentLevel: Number(row.currentLevel) || 1,
    score: Number(row.score) || 0,
    quizCorrect: Number(row.quizCorrect) || 0,
  });

  const entries = filtered.slice(0, limit).map((row, index) => toRow(row, index + 1));
  let you = null;
  if (studentId) {
    you = entries.find((entry) => entry.studentId === studentId) || null;
    if (!you) {
      const idx = filtered.findIndex((row) => row.studentId === studentId);
      if (idx >= 0) you = toRow(filtered[idx], idx + 1);
    }
  }
  return { period, limit, entries, you };
}

export function upsertLeaderboardEntry(entry = {}) {
  const studentId = String(entry.studentId || '').trim();
  if (!studentId) return null;
  const db = readDb();
  const prev = db.leaderboard[studentId] || {};
  const packed = {
    studentId,
    displayName: String(
      entry.displayName || entry.studentName || prev.displayName || 'Player',
    ).trim(),
    currentLevel: Math.max(
      1,
      Number(entry.currentLevel) || Number(prev.currentLevel) || 1,
    ),
    score: Math.max(Number(entry.score) || 0, Number(prev.score) || 0),
    quizCorrect: Math.max(
      Number(entry.quizCorrect) || 0,
      Number(prev.quizCorrect) || 0,
    ),
    updatedAt: new Date().toISOString(),
  };
  db.leaderboard[studentId] = packed;
  writeDb(db);
  return packed;
}

export function getFileLeaderboard(opts = {}) {
  const db = readDb();
  return rankLeaderboardEntries(db.leaderboard, opts);
}
