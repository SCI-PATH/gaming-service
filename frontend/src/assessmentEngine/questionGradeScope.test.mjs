/**
 * Run: node --test frontend/src/assessmentEngine/questionGradeScope.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessQuestionGradeScope } from './questionGradeScope.js';

describe('question grade scope', () => {
  it('rejects a question that echoes another grade', () => {
    const scope = assessQuestionGradeScope(
      { chapterId: 'G7_C1', topicId: 'G7_C1_PLA_DIVER' },
      { grade: 9 },
    );
    assert.equal(scope.ok, false);
    assert.equal(scope.reason, 'grade_mismatch');
    assert.equal(scope.expected, 9);
    assert.equal(scope.actual, 7);
  });

  it('accepts a matching chapter and an untagged item for the requested grade', () => {
    const match = assessQuestionGradeScope(
      { topicId: 'G8_C1_ORG_CHARS' },
      { grade: 8 },
    );
    const untagged = assessQuestionGradeScope({ id: 'q1' }, { grade: 8 });
    assert.equal(match.ok, true);
    assert.equal(match.actual, 8);
    assert.equal(untagged.ok, true);
    assert.equal(untagged.scope, 'requested_only');
  });
});
