/**
 * Save and restore the active lesson inside engagement_gaming.
 * Level number stays relative (Level 1 of this lesson).
 */

async function readResume(path, params) {
  const res = await fetch(`${path}?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false || !data?.resume) return null;
  return data.resume;
}

export async function fetchLessonResume(studentId, lessonId = '') {
  const id = String(studentId || '').trim();
  if (!id) return null;
  const params = new URLSearchParams({ studentId: id });
  if (lessonId) params.set('lessonId', lessonId);
  try {
    return (
      (await readResume('/api/game/resume', params)) ||
      (await readResume('/api/engagement/resume', params))
    );
  } catch {
    return null;
  }
}

export function saveLessonCheckpoint(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) return Promise.resolve({ ok: false });
  return fetch('/api/engagement/checkpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      studentId,
      levelNumber: 1,
    }),
  })
    .then((res) => res.json().catch(() => ({})))
    .catch(() => ({ ok: false }));
}
