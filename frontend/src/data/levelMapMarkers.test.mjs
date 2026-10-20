import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assembleMapMarkers, bedLabelForCrop } from './levelMapLabels.js';
import { buildLevelMapMarkers } from './levelMapMarkers.js';

const zones = {
  plots: [
    { id: 'bed_a', x: 1, y: 2, w: 3, h: 4 },
    { id: 'bed_b', x: 5, y: 6, w: 3, h: 4 },
  ],
  animal: { id: 'pen', x: 1, y: 1, w: 2, h: 2 },
  clean: { id: 'yard', x: 3, y: 3, w: 2, h: 2 },
  shop: { id: 'shop', x: 4, y: 4, w: 2, h: 2 },
};

describe('level map markers', () => {
  it('names the beds from that level instead of a generic plant label', () => {
    const carrots = assembleMapMarkers(
      {
        level: 1,
        crops: [{ id: 'veg_001', cropId: 'carrot', cropName: 'carrots', harvestCount: 4 }],
        animal: { id: 'cow', animalName: 'cows', produceName: 'milk' },
        clean: { id: 'weed', messName: 'weeds', verb: 'Pull' },
      },
      zones,
      { activeCropIndex: 0 },
    );
    const pumpkins = assembleMapMarkers(
      {
        level: 2,
        crops: [{ id: 'veg_008', cropId: 'pumpkin', cropName: 'pumpkins', harvestCount: 5 }],
      },
      zones,
      { activeCropIndex: 0 },
    );
    assert.equal(carrots.beds[0].label, 'Carrot Bed');
    assert.equal(carrots.beds[0].shortLabel, 'Carrot');
    assert.equal(carrots.beds[0].status, 'active');
    assert.equal(carrots.places[0].label, 'Milk Collection Point');
    assert.equal(carrots.places[0].shortLabel, 'Milk');
    assert.equal(pumpkins.beds[0].label, 'Pumpkin Patch');
    assert.notEqual(carrots.beds[0].challengeId, pumpkins.beds[0].challengeId);
    assert.equal(bedLabelForCrop('tomato', 'tomatoes'), 'Tomato Bed');
    assert.equal(carrots.beds.some((bed) => bed.label === 'PLANT'), false);
  });

  it('marks completed beds and skips a bed with no crop', () => {
    const markers = assembleMapMarkers(
      {
        level: 3,
        crops: [
          { id: 'a', cropId: 'corn', cropName: 'corn', harvestCount: 4 },
          { id: 'b', cropId: 'lettuce', cropName: 'lettuce', harvestCount: 4 },
        ],
      },
      zones,
      { activeCropIndex: 1 },
    );
    assert.equal(markers.beds[0].status, 'completed');
    assert.equal(markers.beds[1].status, 'active');
    assert.equal(markers.beds.length, 2);
  });

  it('uses the same grade plan as the farm', () => {
    const grade6 = buildLevelMapMarkers(1, { grade: 6 });
    const grade9 = buildLevelMapMarkers(1, { grade: 9 });
    assert.equal(grade6.beds[0].label, 'Tomato Bed');
    assert.equal(grade9.beds[0].label, 'Pumpkin Patch');
    assert.notEqual(grade6.places[0].label, grade9.places[0].label);
  });
});
