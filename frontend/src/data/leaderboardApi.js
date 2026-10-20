/**
 * Global arena leaderboard (top students via engagement DB).
 */

const LEADERBOARD_LIMIT = 10;

/** Arena points from correct answers, farm level, research points, and cash. */
export function computeArenaScore({
  rpEarned = 0,
  earnings = 0,
  levelId = 1,
  questionsAnswered = 0,
  quizCorrect = 0,
} = {}) {
  const correct = Math.max(Number(quizCorrect) || 0, Number(questionsAnswered) || 0);
  const level = Math.max(1, Number(levelId) || 1);
  return Math.round(correct * 10 + level * 50 + (Number(rpEarned) || 0) + (Number(earnings) || 0));
}

/**
 * Top students from the engagement API.
 * A missing database is a soft skip so the farm can still be played.
 */
export async function fetchLeaderboard({
  period = 'all',
  studentId = null,
  limit = LEADERBOARD_LIMIT,
} = {}) {
  const params = new URLSearchParams({
    period,
    limit: String(limit),
  });
  if (studentId) params.set('studentId', studentId);

  try {
    const res = await fetch(`/api/engagement/leaderboard?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const raw = data?.error || `HTTP ${res.status}`;
      // "incorrect scheme" means ranking storage is not configured yet.
      const schemeError = /incorrect scheme/i.test(String(raw));
      return {
        ok: false,
        skipped: Boolean(data?.skipped) || schemeError,
        error: schemeError
          ? 'Leaderboard storage is not configured. Rankings will appear after you play.'
          : raw,
        period,
        entries: [],
        you: null,
      };
    }
    return {
      ok: true,
      period: data.period || period,
      entries: Array.isArray(data.entries) ? data.entries : [],
      you: data.you || null,
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err),
      period,
      entries: [],
      you: null,
    };
  }
}

/** Post this run’s arena score. A skipped database does not fail the level. */
export async function submitLeaderboardScore(payload = {}) {
  try {
    const res = await fetch('/api/engagement/leaderboard/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, skipped: Boolean(data?.skipped), error: data?.error };
    }
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export { LEADERBOARD_LIMIT };
