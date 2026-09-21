/**
 * Turn Grok's RAG mind-map JSON into the farm concept-graph shape.
 * Labels stay short; facts already came from Chroma chunks.
 */
import { PLACEHOLDER_NODE } from '../../frontend/src/avatar/conceptLessons.js';

function clipLabel(text, n = 36) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  const words = s.split(' ').filter(Boolean);
  let out = '';
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > n) break;
    out = next;
  }
  return out || words[0].slice(0, n);
}

function addNode(nodes, id, label, extra = {}) {
  const lab = clipLabel(label, extra.max || 36);
  if (!lab || PLACEHOLDER_NODE.test(lab)) return false;
  if (nodes.some((n) => n.id === id)) return true;
  nodes.push({
    id,
    label: lab,
    kind: extra.kind || 'related',
    importance: extra.importance || 'supporting',
    explanation: String(extra.explanation || '').slice(0, 280),
  });
  return true;
}

export function ragMindMapToConceptGraph(mindMap = {}) {
  const nodes = [];
  const relationships = [];
  const central = mindMap.central_concept || mindMap.title || 'Science';
  addNode(nodes, 'root', central, {
    kind: 'root',
    importance: 'key',
    explanation: mindMap.summary || mindMap.one_sentence_summary || '',
    max: 40,
  });

  for (const [i, branch] of (mindMap.branches || []).entries()) {
    if (nodes.length >= 10) break;
    const bid = String(branch.id || `branch-${i + 1}`);
    if (
      !addNode(nodes, bid, branch.title, {
        kind: 'correct',
        importance: 'key',
        explanation: (branch.points || []).map((p) => p.text).join(' '),
      })
    ) {
      continue;
    }
    relationships.push({ from: 'root', to: bid, label: 'includes' });
    for (const [j, point] of (branch.points || []).slice(0, 2).entries()) {
      if (nodes.length >= 12) break;
      const pid = String(point.id || `${bid}-p${j + 1}`);
      if (
        addNode(nodes, pid, point.text, {
          kind: 'related',
          explanation: point.text,
          max: 32,
        })
      ) {
        relationships.push({ from: bid, to: pid, label: 'has' });
      }
    }
  }

  for (const term of mindMap.key_terms || []) {
    if (nodes.length >= 12) break;
    if (nodes.length >= 3 && (mindMap.branches || []).length) break;
    const id = `term-${nodes.length}`;
    if (
      addNode(nodes, id, term.term, {
        kind: 'correct',
        explanation: term.meaning || '',
      })
    ) {
      relationships.push({ from: 'root', to: id, label: 'includes' });
    }
  }

  for (const line of mindMap.remember_this || []) {
    if (nodes.length >= 3) break;
    const id = `remember-${nodes.length}`;
    if (addNode(nodes, id, line, { kind: 'related', explanation: line, max: 32 })) {
      relationships.push({ from: 'root', to: id, label: 'includes' });
    }
  }

  const learningPath = (mindMap.remember_this || [])
    .map((line) => String(line).trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!learningPath.length) {
    (mindMap.branches || []).slice(0, 4).forEach((b) => {
      if (b.title) learningPath.push(String(b.title));
    });
  }

  return {
    concept: clipLabel(central, 48) || 'Science',
    nodes,
    relationships,
    learningPath,
    example: (mindMap.examples || [])[0] || '',
    practice: {
      question: mindMap.one_sentence_summary || '',
      expectedConcept: clipLabel(central, 48),
    },
    generatedBy: 'chroma-rag',
  };
}

export function insufficientConceptGraph(message, question) {
  const nodes = [];
  const relationships = [];
  const grokFail = /temporarily unavailable|timed out|not configured|empty mind map|generation failed/i.test(
    message || '',
  );
  addNode(nodes, 'root', grokFail ? 'Map delayed' : 'Textbook needed', {
    kind: 'root',
    importance: 'key',
    explanation: message || 'No matching textbook chunks were found.',
  });
  addNode(nodes, 'ask', clipLabel(question, 32) || 'Science question', {
    kind: 'related',
    explanation: question || '',
  });
  addNode(nodes, 'next', grokFail ? 'Try this miss again' : 'Search textbooks again', {
    kind: 'related',
    explanation: grokFail
      ? 'Sage could not finish drawing the map this time.'
      : 'No matching Grade 6–9 Science textbook chunks were found for this question.',
  });
  relationships.push({ from: 'root', to: 'ask', label: 'about' });
  relationships.push({ from: 'root', to: 'next', label: 'needs' });
  return {
    concept: grokFail ? 'Map not ready yet' : 'Not enough textbook content',
    nodes,
    relationships,
    learningPath: grokFail
      ? [
          message || 'Mind map generation is temporarily unavailable',
          'Close Sage and miss the question once more.',
        ]
      : [
          message || 'No matching textbook chunks were found.',
          'Try a clearer Science question from your Grade 6–9 textbook.',
        ],
    practice: { question: '', expectedConcept: '' },
    generatedBy: 'chroma-rag',
  };
}
