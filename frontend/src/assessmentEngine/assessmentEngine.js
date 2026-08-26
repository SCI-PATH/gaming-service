/**
 * Assessment Engine HTTP bases and path builders only.
 * No chapter / grade business logic.
 *
 * Bases come from Vite env (repo-root .env):
 *   VITE_ASSESSMENT_DEPLOYED_BASE
 *   VITE_ASSESSMENT_LOCAL_BASE
 *   VITE_ASSESSMENT_API_BASE (optional override tried first)
 *
 * Browser default: same-origin `/assessment-api` (Vite proxy → IAE :8004).
 */

function trimBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function envBase(key) {
  if (typeof import.meta === 'undefined') return '';
  return trimBase(import.meta.env?.[key]);
}

export const ASSESSMENT_ENGINE = Object.freeze({
  SAME_ORIGIN_BASE: '/assessment-api',
  DEPLOYED_BASE_URL:
    envBase('VITE_ASSESSMENT_DEPLOYED_BASE') || 'http://43.204.6.115:8004',
  LOCAL_BASE_URL:
    envBase('VITE_ASSESSMENT_LOCAL_BASE') || 'http://localhost:8004',
  API_PREFIX: '/api/v1/assessment-engine',
});

export function getAssessmentBaseCandidates() {
  const override = envBase('VITE_ASSESSMENT_API_BASE');
  const sameOrigin = ASSESSMENT_ENGINE.SAME_ORIGIN_BASE;
  const deployed = ASSESSMENT_ENGINE.DEPLOYED_BASE_URL;
  const local = ASSESSMENT_ENGINE.LOCAL_BASE_URL;

  /** @type {string[]} */
  const bases = [];
  if (override) bases.push(override);
  else bases.push(sameOrigin, deployed);

  const host =
    typeof window !== 'undefined' ? String(window.location.hostname || '') : '';
  const onLocalHost = host === 'localhost' || host === '127.0.0.1';
  if (local && onLocalHost && !bases.includes(local)) bases.push(local);
  return [...new Set(bases.filter(Boolean))];
}

export const ASSESSMENT_PATHS = Object.freeze({
  postLesson: () => `${ASSESSMENT_ENGINE.API_PREFIX}/quizzes/post-lesson`,
  next: (sessionId) =>
    `${ASSESSMENT_ENGINE.API_PREFIX}/quizzes/${encodeURIComponent(sessionId)}/next`,
  answer: (sessionId) =>
    `${ASSESSMENT_ENGINE.API_PREFIX}/quizzes/${encodeURIComponent(sessionId)}/answer`,
  terminate: (sessionId) =>
    `${ASSESSMENT_ENGINE.API_PREFIX}/quizzes/${encodeURIComponent(sessionId)}/terminate`,
});
