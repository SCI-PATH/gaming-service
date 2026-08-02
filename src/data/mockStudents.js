/**
 * Mock student accounts for local testing.
 * Each student gets isolated mastery + unlock storage.
 */

import { seedTestGameplayProfile } from './gameplayPerformance.js';

export const MOCK_STUDENTS = [
  {
    id: 'chris',
    username: 'weak',
    password: 'weak123',
    displayName: 'Chris · Weak',
    note: 'WEAK / DEVELOPING — slower enemies, longer timer, more hints',
    gameplayProfile: 'weak',
  },
  {
    id: 'bella',
    username: 'average',
    password: 'avg123',
    displayName: 'Bella · Average',
    note: 'AVERAGE — normal enemies, timer, and retries',
    gameplayProfile: 'average',
  },
  {
    id: 'alex',
    username: 'smart',
    password: 'smart123',
    displayName: 'Alex · Smart',
    note: 'STRONG / SMART — closer/faster enemies, shorter timer',
    gameplayProfile: 'strong',
  },
  {
    id: 'dana',
    username: 'dana',
    password: 'plant000',
    displayName: 'Dana Okoro',
    note: 'Neutral unlock / house testing (no seeded gameplay band)',
    gameplayProfile: null,
  },
];

const SESSION_KEY = 'scipath_session_student';
/** Bump to wipe all student progress on next app load. */
const PROGRESS_GEN_KEY = 'scipath_progress_generation';
export const STUDENT_PROGRESS_GENERATION = '4';

const STUDENT_DATA_BASE_KEYS = [
  'scipath_unlocks',
  'scipath_student_mastery',
  'scipath_gameplay_perf',
];

/** @type {{ id: string, username: string, displayName: string } | null} */
let currentStudent = null;

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const match = MOCK_STUDENTS.find((s) => s.id === data?.id);
    if (!match) return null;
    return {
      id: match.id,
      username: match.username,
      displayName: match.displayName,
      gameplayProfile: match.gameplayProfile ?? null,
    };
  } catch {
    return null;
  }
}

export function getCurrentStudent() {
  if (currentStudent) return currentStudent;
  currentStudent = loadSession();
  return currentStudent;
}

export function loginStudent(username, password) {
  const user = String(username || '').trim().toLowerCase();
  const pass = String(password || '');
  const match = MOCK_STUDENTS.find(
    (s) => s.username === user && s.password === pass,
  );
  if (!match) return null;

  currentStudent = {
    id: match.id,
    username: match.username,
    displayName: match.displayName,
    gameplayProfile: match.gameplayProfile ?? null,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentStudent));
  } catch {
    // ignore
  }

  // Seed gameplay band so level starts already adapted for this test path
  if (match.gameplayProfile) {
    try {
      seedTestGameplayProfile(match.gameplayProfile);
    } catch {
      // ignore storage failures
    }
  }

  return currentStudent;
}

/** One-click login for a known mock student (by id or username). */
export function loginTestStudent(idOrUsername) {
  const key = String(idOrUsername || '').trim().toLowerCase();
  const match = MOCK_STUDENTS.find(
    (s) => s.id === key || s.username === key,
  );
  if (!match) return null;
  return loginStudent(match.username, match.password);
}

export function logoutStudent() {
  currentStudent = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Wipe unlocks, mastery, and session for every mock student.
 * Leaves accounts themselves (login credentials) unchanged.
 */
export function resetAllStudentProgress() {
  currentStudent = null;
  try {
    localStorage.removeItem(SESSION_KEY);

    for (const base of STUDENT_DATA_BASE_KEYS) {
      localStorage.removeItem(base);
      for (const student of MOCK_STUDENTS) {
        localStorage.removeItem(`${base}__${student.id}`);
      }
    }

    // Catch any stray scipath_* progress keys
    const doomed = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === PROGRESS_GEN_KEY) continue;
      if (key.startsWith('scipath_')) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);

    localStorage.setItem(PROGRESS_GEN_KEY, STUDENT_PROGRESS_GENERATION);
  } catch {
    // ignore quota / private mode
  }
}

/**
 * If progress generation changed, treat every student as brand new.
 * Call once at app startup.
 */
export function ensureFreshStudentProgress() {
  try {
    const gen = localStorage.getItem(PROGRESS_GEN_KEY);
    if (gen === STUDENT_PROGRESS_GENERATION) return false;
    resetAllStudentProgress();
    return true;
  } catch {
    return false;
  }
}

/**
 * Per-student localStorage key so mastery / unlocks stay isolated.
 * @param {string} baseKey
 */
export function studentStorageKey(baseKey) {
  const student = getCurrentStudent();
  if (!student?.id) return baseKey;
  return `${baseKey}__${student.id}`;
}
