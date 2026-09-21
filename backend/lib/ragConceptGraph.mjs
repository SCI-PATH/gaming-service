/**
 * Turn Grok's RAG mind-map JSON into the farm concept-graph shape.
 * Labels stay short and complete; facts already came from Chroma chunks.
 */
import { PLACEHOLDER_NODE } from '../../frontend/src/avatar/conceptLessons.js';
import {
  isIncompleteLabel,
  polishConceptGraph,
  studentConceptLabel,
  studentPracticeQuestion,
  teachingStep,
} from '../../frontend/src/avatar/conceptMapQuality.js';

function addNode(nodes, id, label, extra = {}) {
  const lab = studentConceptLabel(label, extra.max || 40);
  if (!lab || PLACEHOLDER_NODE.test(lab) || isIncompleteLabel(lab)) return false;
  if (nodes.some((n) => n.id === id)) return true;
  if (nodes.some((n) => String(n.label).toLowerCase() === lab.toLowerCase())) return true;
  nodes.push({
    id,
    label: lab,
    kind: extra.kind || 'related',
    importance: extra.importance || 'supporting',
    explanation: String(extra.explanation || '').slice(0, 280),
  });
  return true;
}

export function ragMindMapToConceptGraph(mindMap = {}, miss = {}) {
  const nodes = [];
  const relationships = [];
  const central =
    studentConceptLabel(mindMap.central_concept || mindMap.title, 48) ||
    'Science';
  addNode(nodes, 'root', central, {
    kind: 'root',
    importance: 'key',
    explanation: mindMap.summary || mindMap.one_sentence_summary || '',
    max: 48,
  });

  for (const [i, branch] of (mindMap.branches || []).entries()) {
    if (nodes.length >= 14) break;
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
    for (const [j, point] of (branch.points || []).slice(0, 5).entries()) {
      if (nodes.length >= 16) break;
      const pid = String(point.id || `${bid}-p${j + 1}`);
      if (
        addNode(nodes, pid, point.text, {
          kind: 'related',
          explanation: point.text,
          max: 40,
        })
      ) {
        relationships.push({ from: bid, to: pid, label: 'has' });
      }
    }
  }

  for (const term of mindMap.key_terms || []) {
    if (nodes.length >= 16) break;
    if (nodes.length >= 6 && (mindMap.branches || []).length) break;
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
    if (nodes.length >= 4) break;
    const id = `remember-${nodes.length}`;
    if (addNode(nodes, id, line, { kind: 'related', explanation: line, max: 40 })) {
      relationships.push({ from: 'root', to: id, label: 'includes' });
    }
  }

  const learningPath = (mindMap.remember_this || [])
    .map((line) => teachingStep(line) || studentConceptLabel(line, 72))
    .filter(Boolean)
    .slice(0, 4);
  if (!learningPath.length) {
    (mindMap.branches || []).slice(0, 4).forEach((b) => {
      const title = studentConceptLabel(b.title, 48);
      if (title) learningPath.push(title);
    });
  }

  const practiceFromModel = String(mindMap.one_sentence_summary || '').trim();
  const graph = {
    concept: central,
    nodes,
    relationships,
    learningPath,
    example: (mindMap.examples || [])[0] || '',
    practice: {
      question: /\?$/.test(practiceFromModel)
        ? practiceFromModel
        : studentPracticeQuestion(miss, central),
      expectedConcept: central,
    },
    generatedBy: 'chroma-rag',
  };
  return polishConceptGraph(graph, miss);
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
  addNode(nodes, 'ask', studentConceptLabel(question, 36) || 'Science question', {
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
