/**
 * Run: node --test backend/lib/levelOutcome.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideLevelOutcome,
  frustrationScoreFromSnapshots,
  LEVEL_OUTCOME,
  masteryPercentage,
} from './levelOutcome.mjs';

describe('decideLevelOutcome', () => {
  it('repeats the topic when frustration is high even if accuracy is strong', () => {
    const decision = decideLevelOutcome({
      frustrationScore: 72,
      correct: 12,
      incorrect: 3,
    });
    assert.equal(decision.outcome, LEVEL_OUTCOME.REMEDIATION_REQUIRED);
    assert.equal(decision.status, 'needs_repeat');
    assert.equal(decision.retryLesson, true);
    assert.equal(decision.reason, 'high_frustration');
  });

  it('repeats the topic when mastery is below the pass line', () => {
    const decision = decideLevelOutcome({
      frustrationScore: 40,
      correct: 4,
      incorrect: 11,
    });
    assert.equal(decision.outcome, LEVEL_OUTCOME.REMEDIATION_REQUIRED);
    assert.equal(decision.reason, 'low_mastery');
    assert.ok(decision.masteryPercentage < 0.65);
  });

  it('unlocks the next level when frustration is low and mastery is solid', () => {
    const decision = decideLevelOutcome({
      frustrationScore: 22,
      correct: 13,
      incorrect: 2,
    });
    assert.equal(decision.outcome, LEVEL_OUTCOME.LEVEL_PASSED);
    assert.equal(decision.status, 'completed');
    assert.equal(decision.retryLesson, false);
    assert.equal(masteryPercentage(13, 2) > 0.65, true);
  });

  it('uses the average snapshot score for the attempt', () => {
    const score = frustrationScoreFromSnapshots([
      { frustration_score: 80 },
      { frustration_score: 40 },
    ]);
    assert.equal(score, 60);
    const decision = decideLevelOutcome({
      frustrationScore: score,
      correct: 10,
      incorrect: 2,
    });
    assert.equal(decision.outcome, LEVEL_OUTCOME.LEVEL_PASSED);
  });
});
