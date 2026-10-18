/**
 * Run: node --test frontend/src/data/gradeChallengeLibraries.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_GRADES,
  getGradeChallengeLibrary,
  challengeBelongsToGrade,
  librariesAreGradeExclusive,
  listGradeChallengeIds,
  topicsForGrade,
  GRADE_LIBRARY_DEFS,
} from './gradeChallengeLibraries.js';

describe('grade challenge libraries', () => {
  it('exposes four exclusive crop libraries for grades 6–9', () => {
    assert.deepEqual([...SUPPORTED_GRADES], [6, 7, 8, 9]);
    assert.equal(librariesAreGradeExclusive(), true);
    for (const grade of SUPPORTED_GRADES) {
      const lib = getGradeChallengeLibrary(grade);
      assert.ok(lib.farmChallenges.length >= 4, `grade ${grade} farm jobs`);
      assert.ok(lib.scienceChallenges.length >= 8, `grade ${grade} science`);
      assert.equal(lib.grade, grade);
    }
  });

  it('keeps science topics inside the requested grade only', () => {
    for (const grade of SUPPORTED_GRADES) {
      const topics = topicsForGrade(grade);
      assert.ok(topics.every((t) => t.grade === grade));
      const ids = listGradeChallengeIds(grade);
      assert.ok(ids.every((id) => id.startsWith(`g${grade}_`)));
    }
  });

  it('does not let a grade 6 student claim a grade 9 challenge id', () => {
    const g9 = listGradeChallengeIds(9)[0];
    assert.equal(challengeBelongsToGrade(g9, 6), false);
    assert.equal(challengeBelongsToGrade(g9, 9), true);
  });

  it('partitions farm crop ids so grades do not share plants', () => {
    assert.notDeepEqual(
      [...GRADE_LIBRARY_DEFS[6].cropIds],
      [...GRADE_LIBRARY_DEFS[8].cropIds],
    );
    assert.ok(!GRADE_LIBRARY_DEFS[6].cropIds.includes('cabbage'));
    assert.ok(GRADE_LIBRARY_DEFS[8].cropIds.includes('cabbage'));
  });
});
