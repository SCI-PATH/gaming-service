/**
 * Sage agent screen → Socrates (Component 4).
 *
 * On click:
 *  1. Flush the live farm score to gaming-service (0–100)
 *  2. GET /api/engagement/frustration (Sachini's open API)
 *  3. POST that score to Component 4 /api/v1/engagement/frustration-cue (0–1)
 *  4. Open the SCI-PATH Socrates screen so the first tutor turn can soften tone
 */
import {
  fetchFrustration,
  getEngagementSessionId,
  syncFrustration,
} from './engagementSync.js';

const DEFAULT_ANALYTICS_API = 'http://127.0.0.1:8003';
const DEFAULT_SCIPATH_APP = 'http://127.0.0.1:3000';
const FALLBACK_TOPIC_ID = 'G6_S1_ORG_CHARS';

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

export function resolveHandoffTopicId({ student, farm, quiz, telemetry } = {}) {
  return (
    pickText(
      student?.topicId,
      student?.topic_id,
      farm?.topicId,
      farm?.topic_id,
      quiz?.topicId,
      quiz?.topic_id,
      quiz?.skillId,
      quiz?.skill_id,
      telemetry?.topicId,
      telemetry?.topic_id,
    ) || FALLBACK_TOPIC_ID
  );
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

async function postFrustrationCue({ userId, topicId, frustrationScore, source }) {
  const base = envUrl('VITE_LEARNER_ANALYTICS_API_BASE', DEFAULT_ANALYTICS_API);
  const res = await fetch(`${base}/api/v1/engagement/frustration-cue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      topic_id: topicId,
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

function buildSocratesUrl(topicId) {
  const app = envUrl('VITE_SCIPATH_APP_URL', DEFAULT_SCIPATH_APP);
  const url = new URL('/tutor', `${app}/`);
  url.searchParams.set('from', 'farm');
  if (topicId) url.searchParams.set('topicId', topicId);
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
  const topicId = resolveHandoffTopicId({ student, farm, quiz, telemetry });
  const tutorUrl = buildSocratesUrl(topicId);
  const live = liveFrustration(telemetry, metrics);

  if (!userId) {
    return {
      opened: false,
      cuePosted: false,
      frustrationScore: null,
      topicId,
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
  let cuePosted = false;
  let cueError = '';
  try {
    await postFrustrationCue({
      userId,
      topicId,
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
      topicId,
      tutorUrl,
      error: err?.message || 'Could not open Socrates',
    };
  }

  return {
    opened,
    cuePosted,
    frustrationScore: unit,
    topicId,
    tutorUrl,
    ...(cuePosted ? {} : { error: cueError }),
  };
}
