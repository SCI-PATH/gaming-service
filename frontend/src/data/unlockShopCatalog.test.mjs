/**
 * Run: node --test frontend/src/data/unlockShopCatalog.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildShopCatalog } from './unlockShop.js';
import { freezeShopOffer } from './questionFrustration.js';

describe('buildShopCatalog after level completion', () => {
  it('marks owned items without treating every unlock as purchased', () => {
    const catalog = buildShopCatalog(
      {
        questionFrustrationScores: [20, 25, 30],
        avgFrustrationScore: 25,
        frozenPrices: { sheep: 200 },
        levelId: 1,
      },
      ['well'],
    );
    const well = catalog.items.find((item) => item.id === 'well');
    const sheep = catalog.items.find((item) => item.id === 'sheep');
    assert.equal(well?.owned, true);
    assert.equal(sheep?.owned, false);
    assert.equal(sheep?.price, 200);
  });

  it('keeps frozen frustration prices stable for the shop screen', () => {
    const offer = freezeShopOffer({
      levelId: 2,
      sessionId: 'test-session',
      scores: [10, 20, 30],
    });
    assert.ok(offer.avgFrustration != null);
    assert.ok(offer.prices?.sheep > 0);
    const catalog = buildShopCatalog(
      {
        questionFrustrationScores: [10, 20, 30],
        avgFrustrationScore: offer.avgFrustration,
        frozenPrices: offer.prices,
        levelId: 2,
        sessionId: 'test-session',
      },
      [],
    );
    assert.equal(catalog.items.find((i) => i.id === 'sheep')?.price, offer.prices.sheep);
  });
});
