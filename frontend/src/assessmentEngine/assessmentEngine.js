/**
 * Assessment Engine HTTP bases and path builders only.
 * No chapter / grade business logic.
 *
 * Bases come from Vite env (repo-root .env):
 *   VITE_ASSESSMENT_DEPLOYED_BASE
 *   VITE_ASSESSMENT_LOCAL_BASE
 *   VITE_ASSESSMENT_API_BASE (optional override tried first)
 */

function trimBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function envBase(key) {
  if (typeof import.meta === 'undefined') return '';
  return trimBase(import.meta.env?.[key]);
}

export const ASSESSMENT_ENGINE = Object.freeze({
  DEPLOYED_BASE_URL:
    envBase('VITE_ASSESSMENT_DEPLOYED_BASE') || 'http://43.204.6.115:8004',
  LOCAL_BASE_URL:
    envBase('VITE_ASSESSMENT_LOCAL_BASE') || 'http://localhost:8004',
  API_PREFIX: '/api/v1/assessment-engine',
});

export function getAssessmentBaseCandidates() {
  const override = envBase('VITE_ASSESSMENT_API_BASE');
  const deployed = ASSESSMENT_ENGINE.DEPLOYED_BASE_URL;
  const local = ASSESSMENT_ENGINE.LOCAL_BASE_URL;

  if (override) {
    return override === local ? [override] : [override, local];
  }
  if (deployed === local) return [deployed];
  return [deployed, local];
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
