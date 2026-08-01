/**
 * Mock student accounts for local testing.
 * Each student gets isolated mastery + unlock storage.
 */

export const MOCK_STUDENTS = [
  {
    id: 'alex',
    username: 'alex',
    password: 'farm123',
    displayName: 'Alex Rivera',
    note: 'Test strong / fast path',
  },
  {
    id: 'bella',
    username: 'bella',
    password: 'grow456',
    displayName: 'Bella Chen',
    note: 'Test developing path',
  },
  {
    id: 'chris',
    username: 'chris',
    password: 'quiz789',
    displayName: 'Chris Patel',
    note: 'Test emerging / slower path',
  },
  {
    id: 'dana',
    username: 'dana',
    password: 'plant000',
    displayName: 'Dana Okoro',
    note: 'Test unlocks across levels',
  },
];

const SESSION_KEY = 'scipath_session_student';

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
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentStudent));
  } catch {
    // ignore
  }
  return currentStudent;
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
 * Per-student localStorage key so mastery / unlocks stay isolated.
 * @param {string} baseKey
 */
export function studentStorageKey(baseKey) {
  const student = getCurrentStudent();
  if (!student?.id) return baseKey;
  return `${baseKey}__${student.id}`;
}
