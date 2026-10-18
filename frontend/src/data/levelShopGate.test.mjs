import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  farmObjectivesReadyForShop,
  shouldFinishLevelForShop,
} from './levelShopGate.js';

describe('farmObjectivesReadyForShop', () => {
  it('allows the shop when there is no crop plan', () => {
    assert.equal(farmObjectivesReadyForShop({ levelCrops: [] }), true);
  });

  it('blocks the shop until every crop sell target is met', () => {
    assert.equal(
      farmObjectivesReadyForShop({
        levelCrops: [{ cropId: 'tomato', harvestCount: 4 }],
        cropSoldMap: { tomato: 2 },
        harvestTarget: 4,
      }),
      false,
    );
    assert.equal(
      farmObjectivesReadyForShop({
        levelCrops: [{ cropId: 'tomato', harvestCount: 4 }],
        cropSoldMap: { tomato: 4 },
        harvestTarget: 4,
      }),
      true,
    );
  });

  it('treats levelCropComplete as ready', () => {
    assert.equal(
      farmObjectivesReadyForShop({
        levelCrops: [{ cropId: 'potato' }],
        levelCropComplete: true,
      }),
      true,
    );
  });
});

describe('shouldFinishLevelForShop', () => {
  it('opens on time expiry or wrong answers even if farm targets remain', () => {
    assert.equal(shouldFinishLevelForShop('time_expired', false), true);
    assert.equal(shouldFinishLevelForShop('wrong_answers', false), true);
  });

  it('requires farm readiness for question_quota endings', () => {
    assert.equal(shouldFinishLevelForShop('question_quota', false), false);
    assert.equal(shouldFinishLevelForShop('question_quota', true), true);
  });
});
