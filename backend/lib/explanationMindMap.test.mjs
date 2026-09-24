/**
 * Run: node --test backend/lib/explanationMindMap.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generate_mindmap_data } from './explanationMindMap.mjs';
import { parseExplanationToTree, renderMindMapHtml, treeToMermaid } from './explanationMindMapFormat.mjs';

const EXPLANATION =
  'The temperature decreases when heat is removed from it. The measurement of warmness or coldness of a substance is known as its temperature.';

describe('generate_mindmap_data', () => {
  it('asks the model to structure the existing explanation and returns mermaid', async () => {
    let seen = null;
    const map = await generate_mindmap_data(
      EXPLANATION,
      'What happens to the temperature of an object when heat is removed from it?',
      'Measuring temperature',
      {
        grokJson: async (payload) => {
          seen = payload;
          return {
            provider: 'groq',
            content: JSON.stringify({
              root: 'Temperature',
              nodes: [
                {
                  label: 'Heat removed',
                  children: [{ label: 'Temperature decreases' }],
                },
                {
                  label: 'Temperature meaning',
                  children: [{ label: 'Warmness or coldness' }],
                },
              ],
            }),
          };
        },
      },
    );
    assert.match(seen.system, /finished science explanation/i);
    assert.match(seen.user, /temperature decreases when heat is removed/i);
    assert.equal(map.source, 'groq');
    assert.match(map.mermaid, /^mindmap\n {2}root\(\(Temperature\)\)\n/);
    assert.match(map.mermaid, /Heat removed\n {6}Temperature decreases/);
    assert.match(map.mermaid, /Warmness or coldness/);
    assert.doesNotMatch(map.mermaid, /```/);
    assert.match(map.svg, /<svg/);
    assert.match(map.svg, /Temperature/);
  });

  it('builds mermaid from the explanation when the model is unavailable', async () => {
    const map = await generate_mindmap_data(
      EXPLANATION,
      'What happens to the temperature when heat is removed?',
      'Measuring temperature',
      {
        grokJson: async () => {
          throw new Error('Mind map generation is temporarily unavailable');
        },
      },
    );
    assert.equal(map.source, 'parsed');
    assert.match(map.mermaid, /mindmap/);
    assert.match(map.mermaid, /root\(\(Measuring temperature\)\)/);
    assert.match(map.mermaid, /temperature/i);
    assert.doesNotMatch(map.mermaid, /G7_C14|\[____\]/);
  });

  it('parses a called-as phrase into a child node', () => {
    const tree = parseExplanationToTree(
      'Travelling of heat from one place to another place is called heat transfer.',
      'Heat travels from the sun to the earth by conduction.',
      'Heat transfer',
    );
    const mermaid = treeToMermaid(tree);
    assert.match(mermaid, /root\(\(Heat transfer\)\)/);
    assert.match(mermaid, /heat transfer/i);
  });

  it('shows the diagram only, not the mermaid source or the JSON', () => {
    const tree = parseExplanationToTree(EXPLANATION, 'What happens to the temperature?', 'Heat removal effect');
    const html = renderMindMapHtml([
      { concept: 'Measuring temperature and thermometers', question: 'What happens to the temperature?', tree, mermaid: treeToMermaid(tree) },
    ]);
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /<h3>Mermaid|<h3>JSON|<pre/);
  });
});
