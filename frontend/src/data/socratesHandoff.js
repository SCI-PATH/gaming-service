/**
 * Sage agent screen → Socrates (Component 4).
 *
 * On click:
 *  1. Flush the live farm score to gaming-service (0–100)
 *  2. GET /api/engagement/frustration (per student — not per topic)
 *  3. POST that score to Component 4 as a user-level tone cue (topic_id USER)
 *  4. Open SCI-PATH /tutor?from=farm with the lesson unlocked so Socrates
 *     can infer the real topic from the student's question
 */
import {
  fetchFrustration,
  getEngagementSessionId,
  syncFrustration,
} from './engagementSync.js';

const DEFAULT_ANALYTICS_API = 'http://127.0.0.1:8003';
const DEFAULT_SCIPATH_APP = 'http://127.0.0.1:3000';
/** Matches Component 4 USER_LEVEL_FRUSTRATION_TOPIC — not a curriculum skill. */
const USER_LEVEL_TOPIC_ID = 'USER';

function envUrl(key, fallback) {
  try {
    const raw = String(import.meta.env?.[key] || '').trim();
    if (raw) return raw.replace(/\/+$/, '');
  } catch {
    /* use fallback */
  }
  try {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        if (fallback.includes(':3000')) {
          return `${window.location.protocol}//${host}:3000`;
        }
        if (fallback.includes(':8003')) {
          return `${window.location.protocol}//${host}:8003`;
        }
      }
    }
  } catch {
    /* use fallback */
  }
  return fallback.replace(/\/+$/, '');
}

function pickText(...candidates) {
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function toUnitScore(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

export function resolveHandoffStudentId(student) {
  return pickText(student?.id, student?.studentId, student?.userId);
}

function liveFrustration(telemetry = {}, metrics = {}) {
  const scoreRaw =
    telemetry.frustrationScore ??
    telemetry.frustration_score ??
    metrics.frustration_score ??
    metrics.frustrationScore;
  const score100 = Number(scoreRaw);
  return {
    frustrationScore: Number.isFinite(score100) ? score100 : null,
    frustrationLevel: pickText(
      telemetry.frustrationLevel,
      telemetry.frustration_level,
      metrics.frustration_level,
      metrics.frustrationLevel,
    ),
  };
}

async function postFrustrationCue({ userId, frustrationScore, source }) {
  const base = envUrl('VITE_LEARNER_ANALYTICS_API_BASE', DEFAULT_ANALYTICS_API);
  const res = await fetch(`${base}/api/v1/engagement/frustration-cue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      topic_id: USER_LEVEL_TOPIC_ID,
      frustration_score: frustrationScore,
      source,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const detail =
      data?.detail || data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(
      typeof detail === 'string' ? detail : 'Frustration cue was not stored',
    );
  }
  return data;
}

function buildSocratesUrl({ frustrationScore } = {}) {
  const app = envUrl('VITE_SCIPATH_APP_URL', DEFAULT_SCIPATH_APP);
  const url = new URL('/tutor', `${app}/`);
  url.searchParams.set('from', 'farm');
  const unit = toUnitScore(frustrationScore);
  if (unit != null) {
    // SCI-PATH /tutor posts this to Component 4 if the gaming GET is empty.
    url.searchParams.set('frustrationScore', String(unit));
  }
  return url.toString();
}

/**
 * @returns {Promise<{
 *   opened: boolean,
 *   cuePosted: boolean,
 *   frustrationScore: number | null,
 *   topicId: string,
 *   tutorUrl: string,
 *   error?: string
 * }>}
 */
export async function handoffToSocrates({
  student = null,
  farm = {},
  quiz = null,
  telemetry = {},
  metrics = {},
} = {}) {
  const userId = resolveHandoffStudentId(student);
  const live = liveFrustration(telemetry, metrics);

  if (!userId) {
    const tutorUrl = buildSocratesUrl({
      frustrationScore: live.frustrationScore,
    });
    return {
      opened: false,
      cuePosted: false,
      frustrationScore: null,
      topicId: USER_LEVEL_TOPIC_ID,
      tutorUrl,
      error: 'No student id — relaunch the farm from SCI-PATH.',
    };
  }

  try {
    await syncFrustration(
      {
        frustrationScore: live.frustrationScore ?? 0,
        frustrationLevel: live.frustrationLevel || 'low',
        levelNumber: farm?.levelId ?? telemetry?.levelNumber ?? null,
        source: 'gameplay',
      },
      student,
    );
  } catch {
    /* live GET / POST below still run */
  }

  let score100 = live.frustrationScore;
  try {
    let remote = await fetchFrustration(student, {
      sessionId: getEngagementSessionId(),
      limit: 1,
    });
    if (!remote?.ok || remote.frustrationScore == null) {
      remote = await fetchFrustration(student, { sessionId: '', limit: 1 });
    }
    if (remote?.ok && remote.frustrationScore != null) {
      score100 = Number(remote.frustrationScore);
    }
  } catch {
    /* keep live score */
  }

  const unit = toUnitScore(score100) ?? 0;
  const tutorUrl = buildSocratesUrl({ frustrationScore: unit });
  let cuePosted = false;
  let cueError = '';
  try {
    await postFrustrationCue({
      userId,
      frustrationScore: unit,
      source: 'gaming_socrates_unlock',
    });
    cuePosted = true;
  } catch (err) {
    cueError = err?.message || 'Could not send frustration cue';
    console.warn('[socratesHandoff] cue', cueError);
  }

  let opened = false;
  try {
    const popup = window.open(tutorUrl, '_blank', 'noopener,noreferrer');
    opened = Boolean(popup);
    if (!opened) {
      window.location.assign(tutorUrl);
      opened = true;
    }
  } catch (err) {
    return {
      opened: false,
      cuePosted,
      frustrationScore: unit,
      topicId: USER_LEVEL_TOPIC_ID,
      tutorUrl,
      error: err?.message || 'Could not open Socrates',
    };
  }

  return {
    opened,
    cuePosted,
    frustrationScore: unit,
    topicId: USER_LEVEL_TOPIC_ID,
    tutorUrl,
    ...(cuePosted ? {} : { error: cueError }),
  };
}
