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
