/**
 * Per-student local gameplay cache. Shared config and other students' keys stay.
 * Historical database rows are not touched here.
 */

const FRESH_PREFIX = 'scipath_fresh_login__';

const GAMEPLAY_BASES = [
  'scipath_unlocks',
  'scipath_student_mastery',
  'scipath_gameplay_perf',
  'scipath_farm_progress',
  'scipath_farm_run',
  'scipath_world_challenges',
  'scipath_crop_challenges',
  'scipath_animal_challenges',
  'scipath_cleaning_challenges',
  'scipath_frustration_history',
];

function localStore() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function sessionStore() {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

/** Flag this student so the next platform launch starts the chapter at Level 1. */
export function markFreshLogin(studentId) {
  const id = String(studentId || '').trim();
  const store = localStore();
  if (!id || !store) return;
  store.setItem(`${FRESH_PREFIX}${id}`, '1');
}

/** True while a fresh-login flag is set and has not been consumed. */
export function peekFreshLogin(studentId) {
  const id = String(studentId || '').trim();
  const store = localStore();
  if (!id || !store) return false;
  return store.getItem(`${FRESH_PREFIX}${id}`) === '1';
}

/** Read and clear the fresh-login flag. Platform launch uses this once. */
export function consumeFreshLogin(studentId) {
  const id = String(studentId || '').trim();
  const store = localStore();
  if (!id || !store) return false;
  const key = `${FRESH_PREFIX}${id}`;
  const on = store.getItem(key) === '1';
  if (on) store.removeItem(key);
  return on;
}

/** Remove this student's gameplay cache only. */
export function clearStudentLocalGameplay(studentId) {
  const id = String(studentId || '').trim();
  const store = localStore();
  if (!id || !store) return;
  for (const base of GAMEPLAY_BASES) {
    store.removeItem(`${base}__${id}`);
  }
  const shopKeys = [];
  // Frozen shop prices put the student id in the middle of the key, not as a simple suffix.
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key) continue;
    if (key.includes(`__${id}`) && key.includes('scipath_shop_prices')) {
      shopKeys.push(key);
    }
  }
  for (const key of shopKeys) store.removeItem(key);

  const session = sessionStore();
  if (!session) return;
  const clocks = [];
  // Question countdown keys live in sessionStorage and are not named per student.
  for (let i = 0; i < session.length; i += 1) {
    const key = session.key(i);
    if (!key) continue;
    if (
      key.startsWith('scipath_question_deadline:') ||
      key.startsWith('scipath_question_clock:') ||
      key === 'scipath_engagement_session_id'
    ) {
      clocks.push(key);
    }
  }
  for (const key of clocks) session.removeItem(key);
}
