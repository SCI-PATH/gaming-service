/**
 * Hands-off demo recording: pick the scripted choice, and describe the live world
 * in words a camera can read. The key is used only to click. It is not shown.
 */
import { getShopDifficulty } from './farmCustomerShop.js';
import { buildFrustrationAdaptation, frustrationLevelLabel } from './frustrationModel.js';
import { DEMO_PROFILES } from './demoScenarios.js';
import { sageToneLabel } from '../avatar/sageSpokenVoice.js';

const CORRECT_FIELDS = [
  'correct_answer',
  'correctAnswer',
  'ideal_answer',
  'answer',
  'correct_option',
  'correctOption',
  'correct_index',
  'correctIndex',
];

function findCorrectField(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 5) return null;
  for (const key of CORRECT_FIELDS) {
    if (node[key] != null && node[key] !== '') return node[key];
  }
  for (const child of ['payload', 'body', 'question', 'data', 'prompt']) {
    if (node[child] && typeof node[child] === 'object') {
      const found = findCorrectField(node[child], depth + 1);
      if (found != null) return found;
    }
  }
  return null;
}

function flattenCorrect(value) {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => flattenCorrect(item))
      .filter((item) => item != null && item !== '');
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    return parts.map((item) => String(item));
  }
  if (typeof value === 'object') {
    if (value.index != null) return value.index;
    if (value.correctIndex != null) return value.correctIndex;
    const token = value.letter || value.key || value.option || value.text || value.answer || value.value;
    if (token != null && token !== '') return token;
  }
  return null;
}

function optionText(opt) {
  if (typeof opt === 'string') return opt;
  return String(opt?.text || opt?.label || opt?.value || '');
}

function matchIndex(correct, options, letters) {
  if (correct == null) return null;
  if (typeof correct === 'number' && Number.isInteger(correct)) {
    if (correct >= 0 && correct < options.length) return correct;
    if (correct >= 1 && correct <= options.length) return correct - 1;
  }
  const raw = String(correct).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 0 && n < options.length) return n;
    if (n >= 1 && n <= options.length) return n - 1;
  }
  const letterIdx = (letters || []).findIndex(
    (letter) => String(letter).trim().toLowerCase() === raw.toLowerCase(),
  );
  if (letterIdx >= 0) return letterIdx;
  const textIdx = options.findIndex(
    (opt) => optionText(opt).trim().toLowerCase() === raw.toLowerCase(),
  );
  return textIdx >= 0 ? textIdx : null;
}

function indexFromFlags(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 5) return null;
  const opts = node.options || node.choices;
  if (Array.isArray(opts)) {
    const hit = opts.findIndex(
      (opt) => opt && (opt.is_correct === true || opt.isCorrect === true || opt.correct === true),
    );
    if (hit >= 0) return hit;
  }
  for (const child of ['payload', 'body', 'question', 'data']) {
    if (node[child] && typeof node[child] === 'object') {
      const found = indexFromFlags(node[child], depth + 1);
      if (found != null) return found;
    }
  }
  return null;
}

function stringListAt(node, field, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  const value = node[field];
  if (Array.isArray(value)) {
    const texts = value
      .map((item) => {
        if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
        if (item && typeof item === 'object') {
          const token = item.text || item.answer || item.value || item.word;
          return token != null ? String(token).trim() : '';
        }
        return '';
      })
      .filter(Boolean);
    if (texts.length) return texts;
  }
  for (const child of ['payload', 'body', 'question', 'data']) {
    if (node[child] && typeof node[child] === 'object') {
      const found = stringListAt(node[child], field, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Index of the real answer, taken before the quiz hides it. Null when unknown. */
export function demoKeyFromRaw(raw, options = [], letters = [], questionType = '') {
  const type = String(
    questionType || raw?.question_type || raw?.questionType || raw?.type || raw?.payload?.type || '',
  ).toLowerCase();
  // Fill-in questions carry text, not a single option index.
  if (type.includes('blank') || type.includes('multi')) {
    const texts = stringListAt(raw, 'answers');
    if (texts?.length) return { index: null, text: texts.join(' | '), texts };
  }
  const flat = flattenCorrect(findCorrectField(raw));
  if (Array.isArray(flat)) {
    const texts = flat.map((part) => String(part).trim()).filter(Boolean);
    return { index: null, text: texts.join(' | '), texts };
  }
  let index = flat != null ? matchIndex(flat, options, letters) : null;
  if (index == null) index = indexFromFlags(raw);
  const text = typeof flat === 'string' ? flat : null;
  return { index, text };
}

/**
 * Option the recorder should click.
 * A miss picks the first index that is not the real answer.
 */
export function pickDemoOptionIndex({ wantCorrect, keyIndex, optionCount }) {
  const count = Number(optionCount) || 0;
  if (count < 1) return null;
  const key = Number(keyIndex);
  if (!Number.isInteger(key) || key < 0 || key >= count) return null;
  if (wantCorrect) return key;
  for (let i = 0; i < count; i += 1) {
    if (i !== key) return i;
  }
  return null;
}

/**
 * What the controller should submit. `unmatched` means the question did not
 * include an answer key, so the click cannot follow the script.
 */
export function planDemoSubmission(question, attempt) {
  if (!question || !attempt) return { kind: 'wait' };
  const type = question.questionType;
  if (type === 'ShortAnswer' || type === 'MultiBlank') {
    const keyed = Array.isArray(question.demoKeyTexts)
      ? question.demoKeyTexts.map((part) => String(part).trim()).filter(Boolean)
      : [];
    const keyText = keyed.length
      ? keyed.join(' | ')
      : String(question.demoKeyText || '').trim();
    if (!keyText) {
      return { kind: 'text', text: 'unsure', texts: ['unsure'], unmatched: true };
    }
    // Scripted miss: submit "unsure" so the real scorer records a wrong answer.
    if (!attempt.wasCorrect) {
      const misses = (keyed.length ? keyed : keyText.split(' | ')).map(() => 'unsure');
      return { kind: 'text', text: misses.join(' | '), texts: misses };
    }
    return {
      kind: 'text',
      text: keyText,
      texts: keyed.length ? keyed : keyText.split(' | '),
    };
  }
  const optionCount =
    Array.isArray(question.options) && question.options.length
      ? question.options.length
      : type === 'TrueFalse'
        ? 2
        : 0;
  const index = pickDemoOptionIndex({
    wantCorrect: Boolean(attempt.wasCorrect),
    keyIndex: question.demoKeyIndex,
    optionCount,
  });
  // No key — click the first option and mark the take as unmatched.
  if (index == null) return { kind: 'choice', index: 0, unmatched: true };
  return { kind: 'choice', index };
}

/**
 * When the recording should open Sage.
 * Weak profiles surface sooner; smart profiles wait unless the live band matches.
 */
export function shouldPresentDemoSage({
  profileId,
  answeredCount = 0,
  liveLevel = '',
  alreadyShown = false,
} = {}) {
  if (alreadyShown || answeredCount < 1) return false;
  const profile = DEMO_PROFILES[profileId];
  if (!profile) return false;
  // Weak recordings show Sage after fewer misses than a smart profile.
  const minAnswers = profileId === 'weak' ? 4 : profileId === 'intermediate' ? 5 : 7;
  if (answeredCount < minAnswers) return false;
  const target = profile.targetFrustrationLevel;
  const level = String(liveLevel || '').toLowerCase();
  if (level === target) return true;
  // A weak profile's target is high; very_high still counts as that scene.
  if (target === 'high' && (level === 'high' || level === 'very_high')) return true;
  return answeredCount >= 10;
}

function customerMoodLine(level, shop) {
  const count = shop?.maxCustomers ?? '—';
  if (level === 'very_high') {
    return `Angry queue · ${count} at the counter · anger shows very fast`;
  }
  if (level === 'high') {
    return `Short tempers · ${count} at the counter · anger shows sooner`;
  }
  if (level === 'moderate') {
    return `Waiting · ${count} at the counter · mood is mixed`;
  }
  return `Patient queue · ${count} at the counter · staying calm`;
}

/** Readable world state for the recording banner. Uses the live score only. */
export function demoReadout(score) {
  const n = Number(score);
  const s = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  const adapt = buildFrustrationAdaptation(s);
  const shop = getShopDifficulty(s, adapt.level);
  return {
    score: s,
    level: adapt.level,
    levelLabel: frustrationLevelLabel(adapt.level),
    sageTone: sageToneLabel(adapt.level),
    sageHint: adapt.sage?.voiceHint || '',
    enemy: `${adapt.combat.label} · speed ×${adapt.combat.speedMult} · count ×${adapt.combat.countMult}`,
    customers: customerMoodLine(adapt.level, shop),
    mindMap: `${adapt.mindMap.label} · ${adapt.mindMap.maxBranches} branches`,
    shopPrices: adapt.shop.label,
  };
}

/** Cheapest unlocks this cash can buy, in the order the shop script should click. */
export function pickDemoUnlockPurchases(items = [], cash = 0, limit = 2) {
  let remaining = Math.max(0, Number(cash) || 0);
  const picks = [];
  const ranked = [...items]
    .filter((item) => item && !item.owned && Number(item.price) > 0)
    .sort((a, b) => a.price - b.price || String(a.id).localeCompare(String(b.id)));
  for (const item of ranked) {
    if (picks.length >= limit) break;
    if (item.price > remaining) continue;
    remaining -= item.price;
    picks.push(item);
  }
  return picks;
}
