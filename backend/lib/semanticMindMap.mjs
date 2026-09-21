/**
 * Generic semantic mind-map helpers.
 * Facts come from retrieved textbook text. No chapter/subject hardcoding.
 */
import {
  cleanNodeLabel,
  isIncompleteLabel,
  isNoiseLabel,
  isPolarityLabel,
  studentConceptLabel,
} from '../../frontend/src/avatar/conceptMapQuality.js';

const QUESTION_LEAD =
  /^(what|which|who|when|where|why|how|name|list|state|give|explain|describe|define|identify)\b/i;

const STRUCTURAL =
  /^(examples?|types?|kinds?|groups?|categories|characteristics?|properties|causes?|effects?|results?|steps?|stages?|process|requirements?|needed|products?|produces?|similarities|differences|formula|definition|advantages?|disadvantages?|location|parts?|function|uses?|compared with|variables?|events?|people)$/i;

function compact(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function words(text) {
  return compact(text).split(/\s+/).filter(Boolean);
}

function contextBlob(chunks = [], extra = '') {
  return `${(chunks || []).map((c) => c.text || '').join('\n')}\n${extra}`.toLowerCase();
}

function tokens(text) {
  return (String(text || '').toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter(
    (t) => !/^(the|and|for|are|was|with|from|that|this|have|has)$/.test(t),
  );
}

export function isUsableNodeLabel(text) {
  const s = cleanNodeLabel(text);
  if (!s) return false;
  if (/^[.\d]/.test(s)) return false;
  if (isNoiseLabel(s) || isIncompleteLabel(s) || isPolarityLabel(s)) return false;
  if (/\b(do|does|did|get|make|use|to)$/i.test(s.split(/\s+/).pop() || '')) return false;
  if (QUESTION_LEAD.test(s) && (s.includes('?') || words(s).length > 8)) return false;
  if (s.length > 48) return false;
  return true;
}

export function isStructuralHub(text) {
  return STRUCTURAL.test(cleanNodeLabel(text));
}

function termInBlob(blob, term) {
  const t = String(term || '').toLowerCase();
  if (!t) return false;
  if (blob.includes(t)) return true;
  if (t.endsWith('y') && blob.includes(`${t.slice(0, -1)}ies`)) return true;
  if (t.endsWith('ies') && t.length > 4 && blob.includes(`${t.slice(0, -3)}y`)) return true;
  if (blob.includes(`${t}s`) || blob.includes(`${t}es`)) return true;
  if (t.endsWith('s') && t.length > 4 && blob.includes(t.slice(0, -1))) return true;
  return false;
}

/** A leaf/hub is grounded if its content words appear in retrieved text. */
export function isGroundedInContext(label, contextText) {
  const s = cleanNodeLabel(label);
  if (!s) return false;
  if (isStructuralHub(s)) return true;
  const blob = String(contextText || '').toLowerCase();
  if (!blob.trim()) return false;
  if (termInBlob(blob, s)) return true;
  const parts = tokens(s);
  if (!parts.length) return false;
  const hits = parts.filter((p) => termInBlob(blob, p));
  return hits.length >= Math.min(parts.length, Math.max(1, Math.ceil(parts.length * 0.6)));
}

function splitList(raw) {
  return String(raw || '')
    .replace(/[()]/g, ' ')
    .replace(/\s*(?:,|;|\/|&| and | or )\s*/gi, '|')
    .split('|')
    .map((p) => cleanNodeLabel(p))
    .filter((p) => isUsableNodeLabel(p) && words(p).length <= 6);
}

function uniqueByLabel(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = cleanNodeLabel(row.title || row.text || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function centralFromQuestion(question) {
  const q = compact(question).replace(/\?+$/, '');
  const stripped = q
    .replace(QUESTION_LEAD, '')
    .replace(/^(are|is|the|a|an)\s+/i, '')
    .replace(/\b(needed|required|used|called|known as)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const label = studentConceptLabel(stripped, 40) || studentConceptLabel(q, 40);
  if (label && !QUESTION_LEAD.test(label) && words(label).length <= 6) return label;
  return '';
}

function centralFromOverlap(text, question) {
  const blob = String(text || '').toLowerCase();
  const hits = [...new Set(tokens(question))]
    .filter((t) => t.length > 4 && blob.includes(t) && isUsableNodeLabel(t));
  hits.sort((a, b) => b.length - a.length);
  const best = hits[0];
  if (!best) return '';
  return best.charAt(0).toUpperCase() + best.slice(1);
}

function centralFromContext(text, question) {
  const called = String(text || '').match(/\b(?:is|are)\s+called\s+([^.,;]{3,48})/i);
  if (called?.[1] && isUsableNodeLabel(called[1])) return cleanNodeLabel(called[1]);
  const qTokens = new Set(tokens(question));
  const sentences = String(text || '').split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const lab = studentConceptLabel(sentence, 48);
    if (!lab || !isUsableNodeLabel(lab)) continue;
    const overlap = tokens(lab).filter((t) => qTokens.has(t));
    if (overlap.length) return lab;
  }
  return centralFromOverlap(text, question);
}

function pushBranch(branches, title, items, relationship) {
  const points = uniqueByLabel(
    (items || [])
      .map((text) => ({ text: cleanNodeLabel(text) }))
      .filter((p) => isUsableNodeLabel(p.text)),
  ).slice(0, 5);
  const hub = cleanNodeLabel(title);
  if (!isUsableNodeLabel(hub) && !isStructuralHub(hub)) return;
  if (!points.length && !isStructuralHub(hub) && !['STEP', 'CATEGORY'].includes(relationship)) {
    return;
  }
  branches.push({
    id: `branch-${branches.length + 1}`,
    title: hub,
    relationship,
    points: points.map((p, i) => ({
      id: `point-${branches.length}-${i + 1}`,
      text: p.text,
    })),
  });
}

/**
 * Fallback hierarchy from textbook prose using generic linguistic cues.
 * Does not encode any chapter or subject.
 */
export function mindMapFromContext({ question, chunks = [] } = {}) {
  const pool = (chunks || []).filter((c) => compact(c.text));
  if (!pool.length) return null;
  const text = pool.map((c) => String(c.text || '')).join(' ');
  const cleaned = text
    .replace(/\bScience\s*\|\s*[A-Za-z ]+\s*\d+/gi, ' ')
    .replace(/\b(activity|figure|table|exercise|assignment)\s*\d+(?:\.\d+)*/gi, ' ');
  const center =
    centralFromContext(cleaned, question) ||
    centralFromQuestion(question) ||
    cleanNodeLabel(pool[0]?.chapter) ||
    'Science';

  const branches = [];
  const classMatch = cleaned.match(
    /\b([\w][\w\s-]{1,40}?)\s+(?:is|are|can be)\s+(?:divided|classified|grouped)\s+into\s+(?:(?:two|three|four|\d+)\s+groups?\s+as\s+)?([^.]{6,160})/i,
  );
  if (classMatch) {
    const groups = splitList(classMatch[2]);
    for (const group of groups.slice(0, 4)) {
      const exampleBlock = cleaned.match(
        new RegExp(`${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]*\\b(?:such as|for example|e\\.g\\.)\\s+([^.]{3,80})`, 'i'),
      );
      pushBranch(branches, group, exampleBlock ? splitList(exampleBlock[1]) : [], 'CATEGORY');
    }
  }

  const needMatch = cleaned.match(
    /\b(?:requires?|needs?|needed|using|use)\s+([^.]{8,140})/i,
  );
  if (needMatch) pushBranch(branches, 'Requirements', splitList(needMatch[1]), 'REQUIRED_FOR');

  const produceMatch = cleaned.match(
    /\b(?:produces?|give off|gives off|results? in)\s+([^.]{6,100})/i,
  );
  if (produceMatch) pushBranch(branches, 'Products', splitList(produceMatch[1]), 'PRODUCES');

  const causeMatch = cleaned.match(/\b(?:caused by|causes of|because of)\s+([^.]{6,120})/i);
  if (causeMatch) pushBranch(branches, 'Causes', splitList(causeMatch[1]), 'CAUSES');

  const effectMatch = cleaned.match(/\b(?:effects? of|leads to|results? in)\s+([^.]{6,120})/i);
  if (effectMatch && !produceMatch) {
    pushBranch(branches, 'Effects', splitList(effectMatch[1]), 'RESULT_OF');
  }

  const stepMatch = cleaned.match(
    /\b(?:the\s+)?(?:stages?|steps?)\s+of\s+.+?\s+(?:are|is|:)\s+([^.]{8,160})/i,
  );
  if (stepMatch) {
    pushBranch(branches, 'Stages', splitList(stepMatch[1]), 'STEP');
  }

  const suchAs = cleaned.matchAll(/\b([\w][\w\s-]{1,30}?)\s+(?:such as|for example)\s+([^.]{3,80})/gi);
  for (const m of suchAs) {
    if (branches.length >= 5) break;
    pushBranch(branches, m[1], splitList(m[2]), 'EXAMPLE_OF');
  }

  if (!branches.length) {
    const qTokens = new Set(tokens(question));
    const facts = [];
    for (const sentence of cleaned.split(/(?<=[.!?])\s+/)) {
      const overlap = tokens(sentence).filter((t) => qTokens.has(t));
      if (!overlap.length) continue;
      const lab = studentConceptLabel(sentence, 48);
      if (isUsableNodeLabel(lab) && isGroundedInContext(lab, cleaned)) facts.push(lab);
    }
    pushBranch(branches, center, facts.slice(0, 4), 'RELATED');
  }

  if (!branches.length) return null;
  return {
    status: 'success',
    title: center,
    central_concept: center,
    summary: `Ideas from ${pool[0]?.textbook || 'the textbook'}${
      pool[0]?.chapter ? ` · ${pool[0].chapter}` : ''
    }.`,
    branches: uniqueByLabel(branches).slice(0, 5),
    key_terms: [],
    examples: [],
    remember_this: branches.slice(0, 3).map((b) => b.title),
    one_sentence_summary: center,
  };
}

export function applyFrustrationPresentation(mindMap, band) {
  if (!mindMap || mindMap.status !== 'success') return mindMap;
  const caps = {
    VERY_LOW: { branches: 5, points: 5 },
    LOW: { branches: 4, points: 4 },
    MODERATE: { branches: 4, points: 3 },
    HIGH: { branches: 3, points: 3 },
    VERY_HIGH: { branches: 3, points: 2 },
  };
  const cap = caps[band] || caps.MODERATE;
  return {
    ...mindMap,
    branches: (mindMap.branches || []).slice(0, cap.branches).map((b) => ({
      ...b,
      points: (b.points || []).slice(0, cap.points),
    })),
  };
}

function studentOnlyTerm(label, studentAnswer, contextText) {
  const s = cleanNodeLabel(label).toLowerCase();
  const answer = String(studentAnswer || '').toLowerCase();
  if (!s || !answer) return false;
  if (!answer.includes(s) && !tokens(s).some((t) => answer.includes(t))) return false;
  return !isGroundedInContext(label, contextText);
}

/**
 * Drop noise, ungrounded leaves, stray example-hubs, and student-answer inventions.
 */
export function sanitizeMindMap(mindMap, { chunks = [], question = '', studentAnswer = '' } = {}) {
  const removed = [];
  if (!mindMap || mindMap.status !== 'success') {
    return { mindMap, removed };
  }
  const context = contextBlob(chunks, question);
  const center = cleanNodeLabel(
    studentConceptLabel(mindMap.central_concept || mindMap.title, 48) ||
      mindMap.central_concept ||
      '',
  );
  const safeCenter =
    isUsableNodeLabel(center) && !QUESTION_LEAD.test(center)
      ? center
      : centralFromQuestion(question) || center || 'Science';

  const branches = [];
  for (const branch of mindMap.branches || []) {
    const title = cleanNodeLabel(branch.title);
    if (!isUsableNodeLabel(title) && !isStructuralHub(title)) {
      removed.push({ label: branch.title, reason: 'noise-or-incomplete-hub' });
      continue;
    }
    const points = [];
    for (const point of branch.points || []) {
      const text = cleanNodeLabel(point.text);
      if (!isUsableNodeLabel(text)) {
        removed.push({ label: point.text, reason: 'noise-or-incomplete-leaf' });
        continue;
      }
      if (!isGroundedInContext(text, context)) {
        removed.push({ label: text, reason: 'not-in-retrieved-context' });
        continue;
      }
      if (studentOnlyTerm(text, studentAnswer, context)) {
        removed.push({ label: text, reason: 'student-answer-not-in-context' });
        continue;
      }
      if (text.toLowerCase() === safeCenter.toLowerCase() || text.toLowerCase() === title.toLowerCase()) {
        continue;
      }
      points.push({ ...point, text });
    }
    const emptyStray =
      !points.length && words(title).length <= 2 && !isStructuralHub(title);
    if (emptyStray) {
      removed.push({ label: title, reason: 'ungrouped-example-as-hub' });
      continue;
    }
    if (!points.length && !isGroundedInContext(title, context) && !isStructuralHub(title)) {
      removed.push({ label: title, reason: 'ungrounded-empty-hub' });
      continue;
    }
    branches.push({
      ...branch,
      title,
      points: uniqueByLabel(points).slice(0, 6),
    });
  }

  const unique = uniqueByLabel(branches).slice(0, 6);
  if (!unique.length) {
    return { mindMap: null, removed };
  }
  return {
    mindMap: {
      ...mindMap,
      title: safeCenter,
      central_concept: safeCenter,
      branches: unique,
    },
    removed,
  };
}

export function debugMindMap(event, payload = {}) {
  if (!/^(1|true|yes)$/i.test(String(process.env.MIND_MAP_DEBUG || ''))) return;
  const safe = { event, ...payload };
  delete safe.studentId;
  try {
    console.info(`[mind-map] ${event} ${JSON.stringify(safe).slice(0, 3500)}`);
  } catch {
    console.info(`[mind-map] ${event}`);
  }
}
