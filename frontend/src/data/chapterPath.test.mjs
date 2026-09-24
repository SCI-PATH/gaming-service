import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { farmLevelFromLessonId, readChapterLaunchFromSearch } from './chapterPath.js';

describe('lesson level indexing', () => {
  it('starts Lesson 14 at relative Level 1', () => {
    assert.equal(farmLevelFromLessonId('g7_sci_14'), 1);
    const params = new URLSearchParams('lessonId=g7_sci_14&startLevel=14');
    const launch = readChapterLaunchFromSearch(params);
    assert.equal(launch.lessonId, 'g7_sci_14');
    assert.equal(launch.startLevel, 1);
  });
});
