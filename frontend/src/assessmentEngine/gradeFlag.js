/**
 * Read the Assessment Engine grade flag without treating the string "false" as true.
 * Boolean("false") is true, which marked wrong answers correct and hid real misses.
 */

export function readGradeIsCorrect(grade, data = null) {
  const source = grade && typeof grade === 'object' ? grade : null;
  const raw =
    source?.is_correct ??
    source?.isCorrect ??
    (data && typeof data === 'object' ? data.is_correct ?? data.isCorrect : undefined);
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1;
  if (typeof raw === 'string') {
    const text = raw.trim().toLowerCase();
    if (text === 'true' || text === '1') return true;
    if (text === 'false' || text === '0' || text === '') return false;
  }
  return false;
}
