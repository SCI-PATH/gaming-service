/**
 * Run: node --test backend/lib/gradeChallenges.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  challengesPayloadForGrade,
  validateChallengeRequest,
} from './gradeChallenges.mjs';

describe('backend grade challenge API helpers', () => {
  it('returns only the requested grade library', () => {
    const g6 = challengesPayloadForGrade(6);
    const g9 = challengesPayloadForGrade(9);
    assert.equal(g6.ok, true);
    assert.equal(g9.ok, true);
    assert.equal(g6.grade, 6);
    assert.equal(g9.grade, 9);
    assert.ok(g6.challengeIds.every((id) => id.startsWith('g6_')));
    assert.ok(g9.challengeIds.every((id) => id.startsWith('g9_')));
    assert.notDeepEqual(g6.levelPlanPreview.cropIds, g9.levelPlanPreview.cropIds);
  });

  it('rejects cross-grade challenge ids', () => {
    const g6 = challengesPayloadForGrade(6);
    const foreign = challengesPayloadForGrade(8).challengeIds[0];
    const denied = validateChallengeRequest({
      grade: 6,
      challengeId: foreign,
    });
    const allowed = validateChallengeRequest({
      grade: 6,
      challengeId: g6.challengeIds[0],
    });
    assert.equal(denied.ok, false);
    assert.equal(allowed.ok, true);
  });

  it('rejects unsupported grades', () => {
    const bad = challengesPayloadForGrade(5);
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'unsupported_grade');
  });
});
