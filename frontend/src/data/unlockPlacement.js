/**
 * Shop items bought in chapter N appear on chapter N+1.
 * Relative farm Level 1 is not used for that check, because every chapter starts at 1.
 * A Learning Path reward with availableAtLevel still appears on the chapter that granted it.
 */

export function chapterOrdinalFromId(lessonId) {
  const match = String(lessonId || '')
    .trim()
    .match(/_(\d+)$/);
  const n = Number(match?.[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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

  const purchaseChapter = Number(meta?.purchaseChapterOrdinal) || 0;
  const currentChapter = Number(chapterOrdinal) || 0;
  if (purchaseChapter > 0 && currentChapter > 0) {
    return currentChapter > purchaseChapter;
  }

  const purchasedAt = Number(meta?.purchasedAtLevel) || 0;
  // Older shop rows only stored relative Level 1. A later chapter should still show them.
  if (purchasedAt > 0 && purchasedAt <= 1 && currentChapter > 1) return true;
  if (purchasedAt > 0) return level > purchasedAt;
  if (availableAt > 0) return level >= availableAt;
  return true;
}
