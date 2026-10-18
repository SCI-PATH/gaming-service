/**
 * Run: node --test frontend/src/data/demoScenarios.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDemoRecordingPlan,
  readDemoLaunch,
  simulateDemoProfilePipeline,
} from './demoScenarios.js';
import { FRUSTRATION_LEVELS } from './frustrationModel.js';

describe('demo scenarios', () => {
  it('parses demo URL params without inventing scores', () => {
    const launch = readDemoLaunch(
      '?demoProfile=weak&demoGrade=8&researchOverlay=1',
    );
    assert.equal(launch.enabled, true);
    assert.equal(launch.profile, 'weak');
    assert.equal(launch.grade, 8);
    assert.equal(launch.researchOverlay, true);
  });

  it('runs smart / intermediate / weak inputs through the real scorer', () => {
    const smart = simulateDemoProfilePipeline('smart');
    const mid = simulateDemoProfilePipeline('intermediate');
    const weak = simulateDemoProfilePipeline('weak');
    assert.ok(smart.avgFrustrationScore != null);
    assert.ok(mid.avgFrustrationScore != null);
    assert.ok(weak.avgFrustrationScore != null);
    assert.ok(smart.avgFrustrationScore < mid.avgFrustrationScore);
    assert.ok(mid.avgFrustrationScore < weak.avgFrustrationScore);
    assert.ok(smart.shopOffer.prices.sheep > weak.shopOffer.prices.sheep);
    assert.ok(
      [FRUSTRATION_LEVELS.LOW, FRUSTRATION_LEVELS.MODERATE].includes(
        smart.rows.at(-1).smoothedLevel,
      ) || smart.finalSmoothedScore <= 60,
    );
  });

  it('builds a 48-slot recording plan across four grades', () => {
    const plan = buildDemoRecordingPlan();
    assert.equal(plan.length, 48);
    assert.equal(plan.filter((s) => s.grade === 6).length, 12);
    assert.equal(plan.filter((s) => s.profileId === 'smart').length, 16);
    assert.ok(plan.every((s) => s.recordingStatus === 'planned'));
    assert.ok(plan.every((s) => s.outputFilename.endsWith('.mp4')));
  });
});
