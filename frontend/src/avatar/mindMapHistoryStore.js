/**
 * Persistent mind-map history for incorrect-answer maps only.
 * Stored in localStorage; reviewed in a separate history UI (not live modal chat).
 */

import { getCurrentStudent } from '../data/mockStudents.js';
import { getChapterLaunch } from '../data/chapterPath.js';
import { getEngagementSessionId } from '../data/engagementSync.js';

const STORAGE_KEY = 'gaming-service.mindMapHistory.v1';
const MAX_ENTRIES = 40;

/**
 * @typedef {object} MindMapHistoryEntry
 * @property {string} id
 * @property {string} lessonTopic
 * @property {number} timestamp
 * @property {object|null} structuredMap
 * @property {string|null} studentWrongAnswer
 * @property {string|null} evaluatedTier
 */

function safeParse(raw) {
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** @returns {MindMapHistoryEntry[]} */
export function loadMindMapHistory() {
  if (typeof localStorage === 'undefined') return [];
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

/** @param {MindMapHistoryEntry[]} entries */
export function saveMindMapHistory(entries) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify((entries || []).slice(0, MAX_ENTRIES)),
    );
  } catch {
    /* private mode / quota */
  }
}

/**
 * Save a mind map created after an incorrect answer.
 * @param {object} entry
 * @returns {MindMapHistoryEntry|null}
 */
export function recordIncorrectMindMap(entry) {
  if (!entry?.structuredMap && !entry?.mermaid) return null;

  const full = {
    id:
      entry.id ||
      `mm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lessonTopic:
      entry.lessonTopic ||
      entry.misconceptionConcept ||
      entry.topic ||
      'Farm science',
    timestamp: entry.timestamp || Date.now(),
    structuredMap: entry.structuredMap || null,
    mermaid: entry.mermaid || null,
    studentWrongAnswer: entry.studentWrongAnswer || null,
    evaluatedTier: entry.evaluatedTier || null,
  };

  const next = [full, ...loadMindMapHistory()].slice(0, MAX_ENTRIES);
  saveMindMapHistory(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mindmap-history-updated'));
  }
  const student = getCurrentStudent();
  const map = full.structuredMap;
  persistExplanation({
    studentId: student?.id,
    sessionId: student?.sessionId || getEngagementSessionId(),
    questionId: entry.questionId || map?.questionId || '',
    lessonId: getChapterLaunch().lessonId,
    explanation:
      entry.explanation ||
      map?.keyExplain ||
      map?.branches?.[0]?.keyExplain ||
      '',
    structuredMap: map,
    mermaid: full.mermaid,
  });
  return full;
}

/** Restore explanations saved in quiz_attempts after a login on another device. */
export function mergeRemoteMindMaps(history = []) {
  const incoming = (Array.isArray(history) ? history : [])
    .filter((row) => row && (row.mindmap || row.explanation || row.mermaid))
    .map((row) => ({
      id: String(row.attemptId || row.questionId || ''),
      lessonTopic: row.mindmap?.topic || 'Farm science',
      timestamp: row.answeredAt ? Date.parse(row.answeredAt) || Date.now() : Date.now(),
      structuredMap: row.mindmap || null,
      mermaid: row.mermaid || null,
      studentWrongAnswer: null,
      evaluatedTier: null,
      explanation: row.explanation || '',
    }))
    .filter((entry) => entry.id && (entry.structuredMap || entry.mermaid || entry.explanation));
  if (!incoming.length) return loadMindMapHistory();
  const existing = loadMindMapHistory();
  const seen = new Set(existing.map((entry) => entry.id));
  const fresh = incoming.filter((entry) => !seen.has(entry.id));
  if (!fresh.length) return existing;
  const next = [...fresh, ...existing].slice(0, MAX_ENTRIES);
  saveMindMapHistory(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mindmap-history-updated'));
  }
  return next;
}

function persistExplanation(entry) {
  if (typeof fetch === 'undefined') return;
  const studentId = entry.studentId;
  if (!studentId) return;
  void fetch('/api/engagement/quiz-explanation', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId,
      sessionId: entry.sessionId || null,
      questionId: entry.questionId || '',
      lessonId: entry.lessonId || '',
      explanation: entry.explanation || '',
      mindmap: entry.structuredMap || null,
      mermaid: entry.mermaid || null,
    }),
  }).catch(() => {});
}

export function clearMindMapHistory() {
  saveMindMapHistory([]);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mindmap-history-updated'));
  }
}

/** @param {(entries: MindMapHistoryEntry[]) => void} listener */
export function subscribeMindMapHistory(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener(loadMindMapHistory());
  window.addEventListener('mindmap-history-updated', handler);
  return () => window.removeEventListener('mindmap-history-updated', handler);
}
