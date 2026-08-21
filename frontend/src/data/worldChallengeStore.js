/**
 * Per-student progress for farm-life world clusters.
 * Science questions stay in the DDA layer — this only stores gameplay completion.
 */
import { studentStorageKey } from './mockStudents.js';

const BASE_KEY = 'scipath_world_challenges';

function storageKey() {
  return studentStorageKey(BASE_KEY);
}

function emptyState() {
  return { pickups: {}, tasks: {} };
}

function readAll() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyState();
    return {
      pickups: data.pickups && typeof data.pickups === 'object' ? data.pickups : {},
      tasks: data.tasks && typeof data.tasks === 'object' ? data.tasks : {},
    };
  } catch {
    return emptyState();
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export function isPickupCollected(nodeId) {
  return Boolean(readAll().pickups[nodeId]);
}

export function isWorldChallengeComplete(challengeId) {
  return Boolean(readAll().tasks[challengeId]?.done);
}

export function getTaskRecord(challengeId) {
  return readAll().tasks[challengeId] || { done: false, collected: {} };
}

export function getCollectedCount(challengeId, itemKey = null) {
  const rec = getTaskRecord(challengeId);
  const collected = rec.collected || {};
  if (itemKey) return Number(collected[itemKey]) || 0;
  return Object.values(collected).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

export function markPickupCollected(nodeId, { taskId, itemKey } = {}) {
  const all = readAll();
  all.pickups[nodeId] = { at: Date.now(), taskId, itemKey };
  if (taskId) {
    const rec = all.tasks[taskId] || { done: false, collected: {} };
    rec.collected = rec.collected || {};
    if (itemKey) {
      rec.collected[itemKey] = (Number(rec.collected[itemKey]) || 0) + 1;
    }
    all.tasks[taskId] = rec;
  }
  writeAll(all);
  return all.tasks[taskId] || null;
}

export function isTaskGathered(challengeId) {
  const rec = getTaskRecord(challengeId);
  return Boolean(rec.gathered) || Boolean(rec.done);
}

export function markTaskGathered(challengeId, { itemCounts = {}, nodeIds = [] } = {}) {
  const all = readAll();
  const rec = all.tasks[challengeId] || { done: false, collected: {} };
  rec.gathered = true;
  rec.collected = { ...(rec.collected || {}) };
  for (const [key, count] of Object.entries(itemCounts)) {
    rec.collected[key] = Number(count) || 0;
  }
  all.tasks[challengeId] = rec;
  for (const nodeId of nodeIds) {
    all.pickups[nodeId] = { at: Date.now(), taskId: challengeId, gathered: true };
  }
  writeAll(all);
  return rec;
}

export function markWorldChallengeComplete(challengeId, extra = {}) {
  const all = readAll();
  const prev = all.tasks[challengeId] || { done: false, collected: {} };
  all.tasks[challengeId] = {
    ...prev,
    done: true,
    gathered: true,
    completedAt: Date.now(),
    ...extra,
  };
  writeAll(all);
  return all.tasks[challengeId];
}
