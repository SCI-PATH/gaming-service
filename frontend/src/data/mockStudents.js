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
const HELD_SESSION_KEY = 'scipath_session_student_held';
/** In-memory copy so a demo can restore the real student even if storage fails. */
let heldStudent = null;
/** Bump to wipe all student progress on next app load. */
const PROGRESS_GEN_KEY = 'scipath_progress_generation';
export const STUDENT_PROGRESS_GENERATION = '6';

const STUDENT_DATA_BASE_KEYS = [
  'scipath_unlocks',
  'scipath_student_mastery',
  'scipath_gameplay_perf',
  'scipath_farm_progress',
  'scipath_frustration_history',
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
      topicId: data.topicId ?? null,
      chapterId: data.chapterId ?? null,
      chapterTitle: data.chapterTitle ?? null,
      sessionId: data.sessionId ?? null,
      fromPlatform: Boolean(data.fromPlatform || data.sessionId),
      isDemoSession: Boolean(data.isDemoSession),
      demoProfile: data.demoProfile || null,
    };
  } catch {
    return null;
  }
}

/** Active student for this tab: memory first, then the saved session. */
export function getCurrentStudent() {
  if (currentStudent) return currentStudent;
  currentStudent = loadSession();
  return currentStudent;
}

/** Free-form name login (at least two characters). Not a platform student id. */
export function loginStudent(displayName) {
  const name = String(displayName || '').trim();
  if (name.length < 2) return null;

  const id = slugifyName(name);
  currentStudent = {
    id,
    username: id,
    displayName: name,
    fromPlatform: false,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentStudent));
  } catch {
    // ignore
  }
  return currentStudent;
}

/**
 * Parent app (SCI-PATH Next.js) passed real student id + display name.
 */
export function loginStudentFromPlatform({
  id,
  username,
  displayName,
  grade = null,
  topicId = null,
  sessionId = null,
} = {}) {
  const studentId = String(id || '').trim();
  const name = String(displayName || '').trim();
  const user = String(username || studentId || '').trim();
  if (!studentId || name.length < 1) return null;

  currentStudent = {
    id: studentId,
    username: user,
    displayName: name,
    grade: grade != null ? Number(grade) : null,
    topicId: topicId ? String(topicId) : null,
    sessionId: sessionId ? String(sessionId) : null,
    fromPlatform: true,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentStudent));
  } catch {
    // ignore
  }
  return currentStudent;
}

/** Log in one of the three aptitude prototypes (Alex, Jordan, Sam) for the storyline. */
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

function writeSession(student) {
  try {
    if (!student) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(student));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Switch the active session to an isolated demo student.
 * The previous real student is held and is not overwritten.
 */
export function beginDemoStudent(next) {
  const existing = currentStudent || loadSession();
  if (existing && !existing.isDemoSession) {
    heldStudent = existing;
    try {
      localStorage.setItem(HELD_SESSION_KEY, JSON.stringify(existing));
    } catch {
      // memory hold still restores this tab
    }
  }
  currentStudent = {
    ...next,
    isDemoSession: true,
  };
  writeSession(currentStudent);
  return currentStudent;
}

/** Leave a demo session and return the student that was active before it. */
export function restoreHeldStudent() {
  let held = heldStudent;
  if (!held?.id) {
    try {
      held = JSON.parse(localStorage.getItem(HELD_SESSION_KEY) || 'null');
    } catch {
      held = null;
    }
  }
  heldStudent = null;
  try {
    localStorage.removeItem(HELD_SESSION_KEY);
  } catch {
    // ignore
  }
  if (held?.id && !held.isDemoSession) {
    currentStudent = held;
    writeSession(currentStudent);
    return currentStudent;
  }
  // Demo ended with nobody to restore — drop the demo session.
  if (currentStudent?.isDemoSession) {
    currentStudent = null;
    writeSession(null);
  }
  return getCurrentStudent();
}

/** Demo flag, or an id that starts with demo_. */
export function isDemoStudent(student = getCurrentStudent()) {
  return Boolean(student?.isDemoSession) || String(student?.id || '').startsWith('demo_');
}

/** Clear the active session. A student held for a demo stays until restore. */
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
      // Any other scipath_ cache in this browser goes too.
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
