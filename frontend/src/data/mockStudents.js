/**
 * Per-student local progress.
 * Free-form name login, plus three mock aptitude profiles for the
 * adaptive-storyline prototype.
 */

import {
  MOCK_STORYLINE_STUDENTS,
  getMockStorylineStudent,
} from '../storyline/aptitude/mockStudentProfiles.js';

const SESSION_KEY = 'scipath_session_student';
/** Bump to wipe all student progress on next app load. */
const PROGRESS_GEN_KEY = 'scipath_progress_generation';
export const STUDENT_PROGRESS_GENERATION = '6';

const STUDENT_DATA_BASE_KEYS = [
  'scipath_unlocks',
  'scipath_student_mastery',
  'scipath_gameplay_perf',
  'scipath_world_challenges',
  'scipath_crop_challenges',
  'scipath_animal_challenges',
  'scipath_cleaning_challenges',
];

/** @type {{ id: string, username: string, displayName: string } | null} */
let currentStudent = null;

function slugifyName(name) {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return slug || 'student';
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.id || !data?.displayName) return null;
    return {
      id: String(data.id),
      username: String(data.username || data.id),
      displayName: String(data.displayName),
      isMockAptitudeStudent: Boolean(data.isMockAptitudeStudent),
      performanceLabel: data.performanceLabel || null,
      grade: data.grade ?? null,
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

export function loginStudent(displayName) {
  const name = String(displayName || '').trim();
  if (name.length < 2) return null;

  const id = slugifyName(name);
  currentStudent = {
    id,
    username: id,
    displayName: name,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentStudent));
  } catch {
    // ignore
  }
  return currentStudent;
}

export function loginMockStorylineStudent(studentId) {
  const profile = getMockStorylineStudent(studentId);
  if (!profile) return null;

  currentStudent = {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    isMockAptitudeStudent: true,
    performanceLabel: profile.performanceLabel,
    grade: profile.grade,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentStudent));
  } catch {
    // ignore
  }
  return currentStudent;
}

export { MOCK_STORYLINE_STUDENTS };

export function logoutStudent() {
  currentStudent = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Wipe unlocks, mastery, and session for local students.
 */
export function resetAllStudentProgress() {
  currentStudent = null;
  try {
    localStorage.removeItem(SESSION_KEY);

    for (const base of STUDENT_DATA_BASE_KEYS) {
      localStorage.removeItem(base);
    }

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
