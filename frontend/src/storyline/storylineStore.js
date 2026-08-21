/**
 * Persist Level 1 storyline records per student (localStorage).
 * Later: Level 1 frustration → Level 2 storyline (not implemented yet).
 */

const BASE_KEY = 'scipath_storyline_level1';

function storageKey(studentId) {
  if (!studentId) return BASE_KEY;
  return `${BASE_KEY}__${studentId}`;
}

export function loadStoredStoryline(studentId) {
  try {
    const raw = localStorage.getItem(storageKey(studentId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.storyline || !data?.studentId) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveStoredStoryline(record) {
  if (!record?.studentId || !record?.storyline) return null;
  const packed = {
    studentId: record.studentId,
    studentName: record.studentName || null,
    level: record.level || 1,
    frustrationScore: record.frustrationScore,
    frustrationLevel: record.frustrationLevel,
    frustrationMetrics: record.frustrationMetrics || record.metrics || {},
    dominantIndicators: record.dominantIndicators || [],
    storyline: record.storyline,
    createdAt: record.createdAt || new Date().toISOString(),
    provider: record.provider || null,
    fallback: Boolean(record.fallback),
  };
  try {
    localStorage.setItem(storageKey(record.studentId), JSON.stringify(packed));
  } catch {
    // ignore quota
  }
  return packed;
}

export function clearStoredStoryline(studentId) {
  try {
    localStorage.removeItem(storageKey(studentId));
  } catch {
    // ignore
  }
}

const PROGRESS_KEY = 'scipath_storyline_progress';

function progressKey(studentId) {
  if (!studentId) return PROGRESS_KEY;
  return `${PROGRESS_KEY}__${studentId}`;
}

export function loadStorylineProgress(studentId) {
  try {
    const raw = localStorage.getItem(progressKey(studentId));
    if (!raw) return { title: null, completedIds: [] };
    const data = JSON.parse(raw);
    return {
      title: data?.title || null,
      completedIds: Array.isArray(data?.completedIds)
        ? data.completedIds.filter(Boolean)
        : [],
    };
  } catch {
    return { title: null, completedIds: [] };
  }
}

export function saveStorylineProgress(studentId, { title, completedIds } = {}) {
  try {
    localStorage.setItem(
      progressKey(studentId),
      JSON.stringify({
        title: title || null,
        completedIds: Array.isArray(completedIds) ? completedIds : [],
      }),
    );
  } catch {
    // ignore quota
  }
}

export function clearStorylineProgress(studentId) {
  try {
    localStorage.removeItem(progressKey(studentId));
  } catch {
    // ignore
  }
}
