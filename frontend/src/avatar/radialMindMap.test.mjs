/**
 * Run: node --test frontend/src/avatar/radialMindMap.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { layoutRadialMap, toRadialModel } from './radialMindMap.js';

describe('radial keyword mind map', () => {
  it('builds a Sports-style centre plus coloured keyword hubs for any chapter', () => {
    const model = toRadialModel(
      { title: 'Photosynthesis', root: 'Photosynthesis' },
      [
        {
          id: 'concept-0',
          topic: 'Photosynthesis',
          question: 'Why do plants need sunlight?',
          pedagogy: [
            { title: 'What Plants Need', children: ['Sunlight', 'Water', 'Carbon Dioxide'] },
            { title: 'What They Make', children: ['Food', 'Oxygen'] },
            { title: 'Where It Happens', children: ['Leaves', 'Chlorophyll'] },
            { title: 'Related Terms', children: ['Green Plants'] },
          ],
        },
      ],
    );
    assert.equal(model.center, 'Photosynthesis');
    assert.equal(model.hubs.length, 4);
    assert.ok(model.hubs.every((h) => h.label.split(/\s+/).length <= 6));
    assert.ok(model.hubs.some((h) => h.children.includes('Sunlight')));
    const layout = layoutRadialMap(model);
    assert.ok(layout.hubs[0].x !== layout.cx);
    assert.ok(layout.hubs[0].children.length);
  });

  it('uses one shared centre for several rock questions', () => {
    const model = toRadialModel(
      { title: 'Metamorphic rocks · Types of rocks' },
      [
        {
          id: 'a',
          topic: 'Metamorphic rocks',
          question: 'What process causes sedimentary rocks to transform into metamorphic rocks?',
          pedagogy: [{ title: 'Metamorphic Rocks', children: ['Pressure', 'Temperature'] }],
        },
        {
          id: 'b',
          topic: 'Types of rocks',
          question: 'Limestone is classified as a sedimentary rock.',
          pedagogy: [{ title: 'Types of Rocks', children: ['Limestone', 'Igneous'] }],
        },
      ],
    );
    assert.equal(model.center, 'Metamorphic rocks');
    assert.ok(model.hubs.length >= 2);
  });
});
