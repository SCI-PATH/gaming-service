/**
 * The only student performance categories in SCI_PATH.
 * Weak / Medium / Smart — no other ranks.
 */
export const PERFORMANCE_CATEGORIES = Object.freeze({
  WEAK: 'weak',
  MEDIUM: 'medium',
  SMART: 'smart',
});

export const PERFORMANCE_LABELS = Object.freeze({
  weak: 'Weak',
  medium: 'Medium',
  smart: 'Smart',
});

const ALIASES = Object.freeze({
  weak: PERFORMANCE_CATEGORIES.WEAK,
  struggling: PERFORMANCE_CATEGORIES.WEAK,
  emerging: PERFORMANCE_CATEGORIES.WEAK,
  beginner: PERFORMANCE_CATEGORIES.WEAK,
  needs_support: PERFORMANCE_CATEGORIES.WEAK,
  medium: PERFORMANCE_CATEGORIES.MEDIUM,
  average: PERFORMANCE_CATEGORIES.MEDIUM,
  developing: PERFORMANCE_CATEGORIES.MEDIUM,
  mediate: PERFORMANCE_CATEGORIES.MEDIUM,
  proficient: PERFORMANCE_CATEGORIES.MEDIUM,
  smart: PERFORMANCE_CATEGORIES.SMART,
  strong: PERFORMANCE_CATEGORIES.SMART,
  advanced: PERFORMANCE_CATEGORIES.SMART,
  expert: PERFORMANCE_CATEGORIES.SMART,
});

export function normalizePerformanceCategory(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return ALIASES[key] || PERFORMANCE_CATEGORIES.MEDIUM;
}

export function performanceLabel(raw) {
  const cat = normalizePerformanceCategory(raw);
  return PERFORMANCE_LABELS[cat];
}

/**
 * Classify from accuracy + retries + consecutive fails.
 * Needs a few answers before leaving Medium.
 */
export function classifyPerformanceCategory({
  accuracyPct = 100,
  correct = 0,
  incorrect = 0,
  consecutiveIncorrect = 0,
  retries = 0,
  avgAnswerTimeMs = 0,
  baselineAnswerTimeMs = 0,
} = {}) {
  const total = (Number(correct) || 0) + (Number(incorrect) || 0);
  const acc = Number.isFinite(Number(accuracyPct)) ? Number(accuracyPct) : 100;
  const slower =
    baselineAnswerTimeMs > 0 &&
    avgAnswerTimeMs > baselineAnswerTimeMs * 1.45;

  if (total < 3) {
    if (consecutiveIncorrect >= 2 || retries >= 3) return PERFORMANCE_CATEGORIES.WEAK;
    return PERFORMANCE_CATEGORIES.MEDIUM;
  }

  if (
    acc <= 50 ||
    consecutiveIncorrect >= 3 ||
    (retries >= 4 && acc < 65) ||
    (acc < 58 && slower)
  ) {
    return PERFORMANCE_CATEGORIES.WEAK;
  }

  if (acc >= 82 && consecutiveIncorrect === 0 && retries <= 1 && !slower) {
    return PERFORMANCE_CATEGORIES.SMART;
  }

  return PERFORMANCE_CATEGORIES.MEDIUM;
}
