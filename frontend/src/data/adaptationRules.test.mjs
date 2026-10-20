/**
 * Run: node --test frontend/src/data/adaptationRules.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFrustrationAdaptation } from './frustrationModel.js';
import { getShopDifficulty } from './farmCustomerShop.js';
import { priceForItem } from './unlockShop.js';
import { resolveSageVoice } from '../avatar/sageSpokenVoice.js';

describe('frustration adaptation rules', () => {
  it('softens sage, enemies, shop, and the sage mind map as the score rises', () => {
    const low = buildFrustrationAdaptation(10);
    const high = buildFrustrationAdaptation(75);
    assert.equal(low.sage.pace, 'lively');
    assert.equal(high.sage.pace, 'slow');
    assert.ok(low.combat.speedMult > high.combat.speedMult);
    assert.ok(low.combat.countMult > high.combat.countMult);
    assert.ok(low.mindMap.maxBranches > high.mindMap.maxBranches);
    assert.equal(low.mindMap.tone, 'challenge');
    assert.equal(high.mindMap.tone, 'support');
    assert.ok(low.shop.priceMult > high.shop.priceMult);

    const busy = getShopDifficulty(10);
    const calm = getShopDifficulty(75);
    assert.ok(busy.maxCustomers > calm.maxCustomers);
    assert.ok(busy.patienceDrainPerTick > calm.patienceDrainPerTick);

    const lowVoice = resolveSageVoice({ frustrationScore: 10 });
    const highVoice = resolveSageVoice({ frustrationScore: 75 });
    assert.ok(lowVoice.rate > highVoice.rate);
    assert.equal(highVoice.warmth, 'extra_warm');
  });

  it('prices a smart low-frustration student above a weak high-frustration student', () => {
    const item = { basePrice: 280 };
    const smart = priceForItem(item, {
      band: 'smart',
      frustrationScore: 10,
      frustrationLevel: 'low',
    });
    const weak = priceForItem(item, {
      band: 'weak',
      frustrationScore: 75,
      frustrationLevel: 'high',
    });
    assert.ok(smart > weak);
  });
});
