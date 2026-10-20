/**
 * Grade-specific science farm challenge libraries (Grades 6–9).
 *
 * Farm job ids (crops / animals / cleaning) are partitioned so grades do not
 * share the same challenge set. Science entries bind CURRICULUM_TOPICS so
 * Assessment Engine questions stay grade-aligned.
 *
 * This module stays free of cropChallenges / masteryModel imports so Node
 * tests and the backend API can load it cleanly.
 */

import { CURRICULUM_TOPICS, getCurriculumTopic } from './curriculumTopics.js';

export const SUPPORTED_GRADES = Object.freeze([6, 7, 8, 9]);

/**
 * Distinct farm-job partitions + science focus per grade.
 * Crop / animal / clean ids are exclusive across grades.
 */
export const GRADE_LIBRARY_DEFS = Object.freeze({
  6: Object.freeze({
    grade: 6,
    label: 'Grade 6 Challenge Library',
    band: 'introductory',
    languageNote: 'Age-appropriate observation, identification, and classification.',
    cropIds: Object.freeze(['tomato', 'carrot', 'potato', 'lettuce', 'radish', 'pea']),
    animalIds: Object.freeze(['cow', 'calf', 'chick']),
    cleanIds: Object.freeze(['weed', 'rock', 'hay']),
  }),
  7: Object.freeze({
    grade: 7,
    label: 'Grade 7 Challenge Library',
    band: 'developing',
    languageNote: 'Compare observations, explain simple relationships, apply knowledge.',
    cropIds: Object.freeze(['corn', 'bean', 'chilli', 'spinach', 'cucumber', 'onion']),
    animalIds: Object.freeze(['chicken', 'duck', 'rabbit']),
    cleanIds: Object.freeze(['bucket', 'feed', 'bush']),
  }),
  8: Object.freeze({
    grade: 8,
    label: 'Grade 8 Challenge Library',
    band: 'investigative',
    languageNote: 'Interpretation, investigation, and reasoned application.',
    cropIds: Object.freeze(['cabbage', 'eggplant', 'beetroot', 'wheat', 'turnip', 'marigold']),
    animalIds: Object.freeze(['sheep', 'goat', 'pig']),
    cleanIds: Object.freeze(['mushroom', 'mud', 'crate']),
  }),
  9: Object.freeze({
    grade: 9,
    label: 'Grade 9 Challenge Library',
    band: 'advanced',
    languageNote: 'Multi-step reasoning, evidence interpretation, and concept application.',
    cropIds: Object.freeze([
      'pumpkin',
      'watermelon',
      'strawberry',
      'sunflower',
      'rose',
      'daisy',
    ]),
    animalIds: Object.freeze(['horse', 'buffalo', 'owl', 'parrot']),
    cleanIds: Object.freeze(['trough', 'compost', 'puddle']),
  }),
});

/** Grades 6–9 only. Anything else is unsupported and yields null. */
export function normalizeStudentGrade(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const grade = Math.trunc(n);
  return SUPPORTED_GRADES.includes(grade) ? grade : null;
}

/** Curriculum topics whose grade matches, used to bind science challenges. */
export function topicsForGrade(grade) {
  const g = normalizeStudentGrade(grade);
  if (g == null) return [];
  return CURRICULUM_TOPICS.filter((t) => t.grade === g);
}

function buildScienceEntries(grade) {
  const def = GRADE_LIBRARY_DEFS[grade];
  return topicsForGrade(grade).map((topic, index) => ({
    challengeId: `g${grade}_sci_${topic.topicId}`.toLowerCase(),
    grade,
    kind: 'science',
    subject: topic.chapterTitle,
    topicId: topic.topicId,
    chapter: topic.chapter,
    chapterTitle: topic.chapterTitle,
    learningObjective: topic.skillLabel,
    title: topic.curriculumTitle || topic.skillLabel,
    description: `Grade ${grade} science challenge: ${topic.skillLabel}.`,
    difficulty: def.band,
    requiredInteractions: ['answer_quiz'],
    mapMarkerLabel: null,
    rewardRefs: [],
    sortOrder: index,
  }));
}

function buildFarmEntries(grade) {
  const def = GRADE_LIBRARY_DEFS[grade];
  const topics = topicsForGrade(grade);
  const crops = def.cropIds.map((cropId, index) => {
    const topic = topics[index % Math.max(1, topics.length)];
    return {
      challengeId: `g${grade}_crop_${cropId}`,
      grade,
      kind: 'crop',
      subject: topic?.chapterTitle || 'Living World',
      topicId: topic?.topicId || null,
      learningObjective:
        topic?.skillLabel ||
        `Grow and identify ${cropId} using Grade ${grade} science ideas.`,
      title: `${cropId} bed`,
      description: `Plant ${cropId}, harvest, and sell while answering Grade ${grade} questions.`,
      difficulty: def.band,
      cropId,
      requiredInteractions: ['plant_quiz', 'harvest', 'sell_at_shop'],
      mapMarkerLabel: cropId,
      rewardRefs: ['cash', 'rp'],
      sortOrder: index,
    };
  });
  const animals = def.animalIds.map((animalId, index) => {
    // Offset into the topic list so animals do not all share the first crop’s topic.
    const topic = topics[(index + 2) % Math.max(1, topics.length)];
    return {
      challengeId: `g${grade}_animal_${animalId}`,
      grade,
      kind: 'animal',
      subject: topic?.chapterTitle || 'Living World',
      topicId: topic?.topicId || null,
      learningObjective:
        topic?.skillLabel || `Tend ${animalId} for Grade ${grade} science.`,
      title: `${animalId} paddock`,
      description: `Tend ${animalId} and sell produce at the shop.`,
      difficulty: def.band,
      animalId,
      requiredInteractions: ['tend_quiz', 'collect', 'sell_at_shop'],
      mapMarkerLabel: animalId,
      rewardRefs: ['cash', 'rp'],
      sortOrder: 100 + index,
    };
  });
  const cleans = def.cleanIds.map((cleanId, index) => {
    // Further offset so yard jobs rotate onto still other topics.
    const topic = topics[(index + 4) % Math.max(1, topics.length)];
    return {
      challengeId: `g${grade}_clean_${cleanId}`,
      grade,
      kind: 'clean',
      subject: topic?.chapterTitle || 'Environment',
      topicId: topic?.topicId || null,
      learningObjective:
        topic?.skillLabel || `Clean ${cleanId} for Grade ${grade} science.`,
      title: `${cleanId} yard`,
      description: `Clear ${cleanId} and sell recovered materials.`,
      difficulty: def.band,
      cleanId,
      requiredInteractions: ['clean_quiz', 'sweep', 'sell_at_shop'],
      mapMarkerLabel: cleanId,
      rewardRefs: ['cash', 'rp'],
      sortOrder: 200 + index,
    };
  });
  return [...crops, ...animals, ...cleans];
}

function buildLibrary(grade) {
  const def = GRADE_LIBRARY_DEFS[grade];
  const farm = buildFarmEntries(grade);
  const science = buildScienceEntries(grade);
  return Object.freeze({
    grade,
    label: def.label,
    band: def.band,
    languageNote: def.languageNote,
    cropIds: def.cropIds,
    animalIds: def.animalIds,
    cleanIds: def.cleanIds,
    topicCount: science.length,
    challenges: Object.freeze([...farm, ...science]),
    farmChallenges: Object.freeze(farm),
    scienceChallenges: Object.freeze(science),
  });
}

/** Farm jobs plus one science challenge per curriculum topic, built once per grade. */
export const GRADE_CHALLENGE_LIBRARIES = Object.freeze({
  6: buildLibrary(6),
  7: buildLibrary(7),
  8: buildLibrary(8),
  9: buildLibrary(9),
});

/** Full challenge library for a supported grade, or null. */
export function getGradeChallengeLibrary(grade) {
  const g = normalizeStudentGrade(grade);
  if (g == null) return null;
  return GRADE_CHALLENGE_LIBRARIES[g];
}

/** Every challenge id in that grade’s library. */
export function listGradeChallengeIds(grade) {
  const lib = getGradeChallengeLibrary(grade);
  return lib ? lib.challenges.map((c) => c.challengeId) : [];
}

/** True for this grade’s id prefix (`g6_`) or an id listed in its library. */
export function challengeBelongsToGrade(challengeId, grade) {
  const g = normalizeStudentGrade(grade);
  const id = String(challengeId || '').trim().toLowerCase();
  if (g == null || !id) return false;
  if (id.startsWith(`g${g}_`)) return true;
  return listGradeChallengeIds(g).includes(id);
}

/** Guard used before serving a challenge: unsupported grade, or id from another grade. */
export function assertChallengeBelongsToGrade(challengeId, grade) {
  const g = normalizeStudentGrade(grade);
  if (g == null) {
    return { ok: false, error: 'unsupported_grade' };
  }
  if (!challengeBelongsToGrade(challengeId, g)) {
    return { ok: false, error: 'challenge_grade_mismatch', grade: g };
  }
  return { ok: true, grade: g };
}

function setsAreExclusive(pickIds) {
  const sets = SUPPORTED_GRADES.map((g) => new Set(pickIds(GRADE_LIBRARY_DEFS[g])));
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      for (const id of sets[i]) {
        if (sets[j].has(id)) return false;
      }
    }
  }
  return true;
}

/** Crop, animal, and cleaning ids must not be shared across Grades 6–9. */
export function librariesAreGradeExclusive() {
  return (
    setsAreExclusive((def) => def.cropIds) &&
    setsAreExclusive((def) => def.animalIds) &&
    setsAreExclusive((def) => def.cleanIds)
  );
}

/** Short summary for research or admin views — counts and a few science topics. */
export function describeGradeLibrary(grade) {
  const lib = getGradeChallengeLibrary(grade);
  if (!lib) return null;
  return {
    grade: lib.grade,
    label: lib.label,
    band: lib.band,
    languageNote: lib.languageNote,
    farmChallengeCount: lib.farmChallenges.length,
    scienceChallengeCount: lib.scienceChallenges.length,
    topicSample: lib.scienceChallenges.slice(0, 3).map((c) => ({
      topicId: c.topicId,
      title: c.title,
      objective: c.learningObjective,
    })),
    cropIds: [...lib.cropIds],
    animalIds: [...lib.animalIds],
    cleanIds: [...lib.cleanIds],
  };
}

/** One crop, one animal, one cleaning job, and the first science challenge. */
export function featuredChallengesForGrade(grade) {
  const lib = getGradeChallengeLibrary(grade);
  if (!lib) return [];
  const crop = lib.farmChallenges.find((c) => c.kind === 'crop');
  const animal = lib.farmChallenges.find((c) => c.kind === 'animal');
  const clean = lib.farmChallenges.find((c) => c.kind === 'clean');
  const science = lib.scienceChallenges[0];
  return [crop, animal, clean, science].filter(Boolean);
}

/** Curriculum topic bound to a grade challenge id, searching Grades 6–9. */
export function resolveTopicForGradeChallenge(challengeId) {
  for (const g of SUPPORTED_GRADES) {
    const hit = GRADE_CHALLENGE_LIBRARIES[g].challenges.find(
      (c) => c.challengeId === String(challengeId || '').toLowerCase(),
    );
    if (hit?.topicId) return getCurriculumTopic(hit.topicId) || hit;
  }
  return null;
}
