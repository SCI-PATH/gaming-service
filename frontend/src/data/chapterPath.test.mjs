import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chapterFarmCursor,
  displayFarmLevel,
  farmLevelFromLessonId,
  readChapterLaunchFromSearch,
} from './chapterPath.js';

describe('lesson level indexing', () => {
  it('starts Lesson 14 at relative Level 1', () => {
    assert.equal(farmLevelFromLessonId('g7_sci_14'), 1);
    const params = new URLSearchParams('lessonId=g7_sci_14&startLevel=14');
    const launch = readChapterLaunchFromSearch(params);
    assert.equal(launch.lessonId, 'g7_sci_14');
    assert.equal(launch.startLevel, 1);
  });

  it('does not render the lesson ordinal as the farm level', () => {
    assert.equal(displayFarmLevel(14, 'g7_sci_14'), 1);
    assert.equal(displayFarmLevel(1, 'g7_sci_14'), 1);
    assert.equal(displayFarmLevel(2, 'g7_sci_14'), 2);
    assert.deepEqual(
      chapterFarmCursor(
        { currentLevelId: 14, highestCompletedLevel: 13 },
        14,
        'g7_sci_14',
      ),
      { currentLevelId: 1, highestCompletedLevel: 0 },
    );
  });
});
