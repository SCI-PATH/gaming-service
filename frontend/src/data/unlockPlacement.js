/**
 * Shop items bought on farm level P appear once the student reaches a later
 * farm (level P+1) or a later learning-path chapter.
 * Learning Path rewards with availableAtLevel can appear on the granting chapter.
 */

/** Lesson ids end in _N. That N is the learning-path chapter order. */
export function chapterOrdinalFromId(lessonId) {
  const match = String(lessonId || '')
    .trim()
    .match(/_(\d+)$/);
  const n = Number(match?.[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Whether a bought unlock or a learning-path reward should appear on this farm.
 * Shop buys wait until a later level or a later chapter.
 */
export function shouldPlaceOwnedUnlock(
  meta = {},
  { levelId = 1, chapterOrdinal = 0 } = {},
) {
  const source = String(meta?.source || '');
  const availableAt = Number(meta?.availableAtLevel) || 0;
  const level = Math.max(1, Number(levelId) || 1);
  if (source === 'learning_path' && availableAt > 0) {
    return level >= availableAt;
  }

  const purchasedAt = Number(meta?.purchasedAtLevel) || 0;
  const purchaseChapter = Number(meta?.purchaseChapterOrdinal) || 0;
  const currentChapter = Number(chapterOrdinal) || 0;

  // Later chapter always shows prior shop purchases (every chapter can start at Level 1).
  if (purchaseChapter > 0 && currentChapter > purchaseChapter) {
    return true;
  }

  // Same chapter (or standalone): show once the farm level advances past purchase.
  if (purchasedAt > 0) {
    if (level > purchasedAt) return true;
    // Legacy rows without chapter ordinal: Level-1 buys still appear on a later chapter.
    if (purchasedAt <= 1 && currentChapter > 1 && !(purchaseChapter > 0)) {
      return true;
    }
    return false;
  }

  if (availableAt > 0) return level >= availableAt;
  return true;
}
