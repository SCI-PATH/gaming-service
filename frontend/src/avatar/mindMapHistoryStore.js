/**
 * Persistent mind-map history for incorrect-answer maps only.
 * Stored in localStorage; reviewed in a separate history UI (not live modal chat).
 */

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
  return full;
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
