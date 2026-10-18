/**
 * Backend grade challenge enforcement (Grades 6–9).
 * Imports the frontend grade library (curriculum-only module) so API
 * callers cannot request another grade's challenge set.
 */

import {
  GRADE_CHALLENGE_LIBRARIES,
  SUPPORTED_GRADES,
  assertChallengeBelongsToGrade,
  describeGradeLibrary,
  getGradeChallengeLibrary,
  listGradeChallengeIds,
  normalizeStudentGrade,
  GRADE_LIBRARY_DEFS,
} from '../../frontend/src/data/gradeChallengeLibraries.js';

export {
  GRADE_CHALLENGE_LIBRARIES,
  SUPPORTED_GRADES,
  assertChallengeBelongsToGrade,
  describeGradeLibrary,
  getGradeChallengeLibrary,
  listGradeChallengeIds,
  normalizeStudentGrade,
  GRADE_LIBRARY_DEFS,
};

export function challengesPayloadForGrade(grade) {
  const g = normalizeStudentGrade(grade);
  if (g == null) {
    return {
      ok: false,
      error: 'unsupported_grade',
      supportedGrades: [...SUPPORTED_GRADES],
    };
  }
  const lib = getGradeChallengeLibrary(g);
  const def = GRADE_LIBRARY_DEFS[g];
  return {
    ok: true,
    grade: g,
    label: lib.label,
    band: lib.band,
    languageNote: lib.languageNote,
    farmChallengeCount: lib.farmChallenges.length,
    scienceChallengeCount: lib.scienceChallenges.length,
    challengeIds: listGradeChallengeIds(g),
    challenges: lib.challenges,
    levelPlanPreview: {
      grade: g,
      libraryLabel: lib.label,
      cropIds: [...def.cropIds],
      animalIds: [...def.animalIds],
      cleanIds: [...def.cleanIds],
      primaryScienceChallenge: lib.scienceChallenges[0] || null,
    },
  };
}

export function validateChallengeRequest({ grade, challengeId } = {}) {
  const g = normalizeStudentGrade(grade);
  if (g == null) {
    return {
      ok: false,
      error: 'unsupported_grade',
      supportedGrades: [...SUPPORTED_GRADES],
    };
  }
  if (!challengeId) {
    return { ok: true, grade: g };
  }
  return assertChallengeBelongsToGrade(challengeId, g);
}
