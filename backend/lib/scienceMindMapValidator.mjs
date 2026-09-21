/**
 * Validate structured mind-map JSON from Grok.
 */

const FENCE = /```(?:json)?\s*([\s\S]*?)```/i;

export function extractJsonObject(raw) {
  let text = String(raw || '').trim();
  if (!text) throw new Error('empty model output');
  const fenced = text.match(FENCE);
  if (fenced) text = fenced[1].trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (parsed && typeof parsed === 'object') return parsed;
  }
  throw new Error('model output was not valid JSON');
}

function asPoints(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === 'string' && item.trim()) {
        return { id: `point-${index + 1}`, text: item.trim() };
      }
      if (!item || typeof item !== 'object') return null;
      const text = String(item.text || item.label || item.point || '').trim();
      if (!text) return null;
      const point = { id: String(item.id || `point-${index + 1}`), text };
      if (item.relationship) point.relationship = String(item.relationship);
      if (item.source && typeof item.source === 'object') point.source = item.source;
      return point;
    })
    .filter(Boolean);
}

function asBranches(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const title = String(item.title || item.label || item.name || '').trim();
      if (!title) return null;
      const branch = {
        id: String(item.id || `branch-${index + 1}`),
        title,
        points: asPoints(item.points || item.children || []),
      };
      if (item.relationship) branch.relationship = String(item.relationship);
      return branch;
    })
    .filter(Boolean);
}

function asTerms(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string' && item.trim()) return { term: item.trim(), meaning: '' };
      if (!item || typeof item !== 'object') return null;
      const term = String(item.term || item.name || '').trim();
      if (!term) return null;
      return { term, meaning: String(item.meaning || item.definition || '').trim() };
    })
    .filter(Boolean);
}

function asStrings(raw) {
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item).trim()).filter(Boolean);
}

export function validateMindMap(raw) {
  const data = typeof raw === 'string' ? extractJsonObject(raw) : { ...raw };
  let status = String(data.status || 'success').toLowerCase();
  if (['insufficient', 'insufficient_context', 'not_enough', 'no_context'].includes(status)) {
    status = 'insufficient_context';
  } else {
    status = 'success';
  }
  const payload = {
    status,
    title: String(data.title || data.central_concept || 'Science').trim(),
    central_concept: String(data.central_concept || data.title || 'Science').trim(),
    summary: String(data.summary || '').trim(),
    branches: asBranches(data.branches || data.nodes || []),
    key_terms: asTerms(data.key_terms || data.keywords || []),
    examples: asStrings(data.examples),
    remember_this: asStrings(data.remember_this || data.rememberThis),
    one_sentence_summary: String(data.one_sentence_summary || data.oneSentence || '').trim(),
    message: data.message || null,
  };
  if (payload.status === 'insufficient_context') return payload;
  if (!payload.central_concept || !payload.branches.length) {
    throw new Error('mind map is missing a central concept or branches');
  }
  return payload;
}
