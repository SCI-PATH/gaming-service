/**
 * Run: node --test frontend/src/data/demoScenarios.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDemoRecordingPlan,
  buildDemoStudent,
  demoAdaptationSeed,
  demoShopPerformance,
  installDemoLaunch,
  readDemoAdaptationSeed,
  readDemoLaunch,
  simulateDemoProfilePipeline,
} from './demoScenarios.js';
import { FRUSTRATION_LEVELS } from './frustrationModel.js';
import { priceForItem } from './unlockShop.js';
import {
  getCurrentStudent,
  loginMockStorylineStudent,
  restoreHeldStudent,
} from './mockStudents.js';

describe('demo scenarios', () => {
  it('parses demo URL params without inventing scores', () => {
    const launch = readDemoLaunch(
      '?demoProfile=weak&demoGrade=8&researchOverlay=1',
    );
    assert.equal(launch.enabled, true);
    assert.equal(launch.isolated, true);
    assert.equal(launch.profile, 'weak');
    assert.equal(launch.grade, 8);
    assert.equal(launch.researchOverlay, true);
  });

  it('starts a grade 6 shop recording without a profile param', () => {
    const launch = readDemoLaunch('?demoAct=shop&demoGrade=6');
    assert.equal(launch.act, 'shop');
    assert.equal(launch.profile, 'smart');
    assert.equal(launch.grade, 6);
    assert.equal(launch.enabled, true);
    assert.equal(launch.isolated, true);
    const boot = installDemoLaunch('?demoAct=shop&demoGrade=6');
    assert.equal(boot.student.grade, 6);
    assert.equal(boot.student.id, 'demo_g6_smart');
    installDemoLaunch('');
  });

  it('does not treat a platform grade param as a demo session', () => {
    const launch = readDemoLaunch('?grade=7&studentId=abc');
    assert.equal(launch.isolated, false);
    assert.equal(launch.enabled, false);
  });

  it('holds a saved grade-7 student and applies demoGrade 9', () => {
    loginMockStorylineStudent('mock_student_1');
    const before = getCurrentStudent();
    assert.equal(before.grade, 7);
    const boot = installDemoLaunch('?demoProfile=weak&demoGrade=9');
    assert.equal(boot.student.grade, 9);
    assert.equal(boot.student.isDemoSession, true);
    assert.equal(String(boot.student.id).startsWith('demo_'), true);
    assert.equal(boot.student.chapterId.startsWith('G9_'), true);
    assert.equal(getCurrentStudent().id, boot.student.id);
    assert.notEqual(getCurrentStudent().id, before.id);
    assert.equal(boot.seed?.pinned, false);
    assert.equal(boot.seed?.autoplay, true);
    assert.equal(readDemoAdaptationSeed()?.profileId, 'weak');
    const restored = installDemoLaunch('');
    assert.equal(restored.student?.id, before.id);
    assert.equal(restored.student?.grade, 7);
    assert.equal(readDemoAdaptationSeed(), null);
    restoreHeldStudent();
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
    const smartSeed = demoAdaptationSeed('smart');
    const weakSeed = demoAdaptationSeed('weak');
    const smartPrice = priceForItem(
      { basePrice: 280 },
      demoShopPerformance(smartSeed),
    );
    const weakPrice = priceForItem(
      { basePrice: 280 },
      demoShopPerformance(weakSeed),
    );
    assert.ok(smartPrice > weakPrice);
    assert.equal(buildDemoStudent({ grade: 6, profile: 'smart' }).grade, 6);
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
