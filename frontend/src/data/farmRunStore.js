import { studentStorageKey } from './mockStudents.js';

const BASE_KEY = 'scipath_farm_run';
const VERSION = 1;

function storageKey() {
  return studentStorageKey(BASE_KEY);
}

export function loadFarmRun() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (Number(data.version) !== VERSION) return null;
    const levelId = Math.max(1, Number(data.levelId) || 0);
    if (!levelId) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasFarmRun() {
  return Boolean(loadFarmRun());
}

export function saveFarmRun(snapshot) {
  if (!snapshot || !Number(snapshot.levelId)) return null;
  const record = {
    ...snapshot,
    version: VERSION,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(record));
  } catch {
    /* quota */
  }
  return record;
}

export function clearFarmRun() {
  try {
    localStorage.removeItem(storageKey());
  } catch {
    /* ignore */
  }
}

export function farmRunSummary(snapshot = loadFarmRun()) {
  if (!snapshot) return null;
  const levelId = Math.max(1, Number(snapshot.levelId) || 1);
  const carried = Number(snapshot.carriedCount) || 0;
  const harvested = Number(snapshot.cropsHarvestedTotal) || 0;
  return {
    levelId,
    cash: Math.max(0, Number(snapshot.currentMoney) || 0),
    carried,
    harvested,
    savedAt: snapshot.savedAt || null,
    label: `Level ${levelId} · $${Math.max(0, Number(snapshot.currentMoney) || 0)}`,
  };
}
