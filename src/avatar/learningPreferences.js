/**
 * Parse & store student learning preferences from chat / chips.
 */

export const QUESTION_FORMATS = [
  { id: 'mcq', label: 'Multiple-choice', text: 'I prefer multiple-choice questions.' },
  { id: 'puzzle', label: 'Puzzles', text: 'I enjoy puzzle-style science challenges.' },
  { id: 'matching', label: 'Matching', text: 'I prefer matching activities.' },
  { id: 'drag_drop', label: 'Drag-and-drop', text: 'I like drag-and-drop exercises.' },
  { id: 'image', label: 'Image-based', text: 'I prefer image-based questions.' },
  {
    id: 'scenario',
    label: 'Scenarios',
    text: 'I like scenario-based farm science challenges.',
  },
];

const FORMAT_PATTERNS = [
  { id: 'mcq', re: /multiple[-\s]?choice|mcq|a\/b\/c/i },
  { id: 'puzzle', re: /puzzle|riddle|word search/i },
  { id: 'matching', re: /match(ing)?/i },
  { id: 'drag_drop', re: /drag|drop|drag-and-drop/i },
  { id: 'image', re: /image|picture|photo|visual/i },
  { id: 'scenario', re: /scenario|story|case study|simulation/i },
];

/**
 * @param {string} message
 * @param {object} [prev]
 */
export function extractLearningPreferences(message, prev = {}) {
  const text = String(message || '');
  if (!text.trim()) return { ...emptyPreferences(), ...prev };

  const preferredFormats = new Set(prev.preferredFormats || []);
  for (const { id, re } of FORMAT_PATTERNS) {
    if (re.test(text)) preferredFormats.add(id);
  }

  let enjoyMost = prev.enjoyMost || null;
  if (/enjoy|favorite|like best|love/i.test(text)) {
    const hit = FORMAT_PATTERNS.find(({ re }) => re.test(text));
    if (hit) enjoyMost = hit.id;
  }

  let difficultyNote = prev.difficultyNote || null;
  if (/confus|hard|difficult|overwhelm|don't understand/i.test(text)) {
    difficultyNote = text.slice(0, 220);
  }
  if (/easy|bored|too simple|not challenge/i.test(text)) {
    difficultyNote = text.slice(0, 220);
  }

  let pacePref = prev.pacePref || null;
  if (/more challeng|harder|advance/i.test(text)) pacePref = 'stretch';
  if (/slower|easier|simplify|smaller step/i.test(text)) pacePref = 'scaffold';

  return {
    preferredFormats: [...preferredFormats],
    enjoyMost,
    difficultyNote,
    pacePref,
    lastUpdatedAt: Date.now(),
  };
}

export function emptyPreferences() {
  return {
    preferredFormats: [],
    enjoyMost: null,
    difficultyNote: null,
    pacePref: null,
    lastUpdatedAt: null,
  };
}

export function formatPreferencesForPayload(prefs = {}) {
  return {
    preferred_question_formats: prefs.preferredFormats || [],
    enjoys_most: prefs.enjoyMost || null,
    difficulty_self_report: prefs.difficultyNote || null,
    pace_preference: prefs.pacePref || null,
  };
}
