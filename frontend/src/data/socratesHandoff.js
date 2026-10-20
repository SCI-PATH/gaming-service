/**
 * Sage agent screen → Socrates (Component 4).
 *
 * On click, leave the farm and open SCI-PATH /tutor?from=farm on the same
 * origin that launched the game. The tutor page stores the frustration cue.
 * Do not POST analytics from here: the farm is HTTPS on Render and that
 * call blocks the navigation.
 */
import { getChapterLaunch } from './chapterPath.js';

const DEFAULT_SCIPATH_APP = 'http://127.0.0.1:3000';

function envUrl(key, fallback) {
  try {
    const raw = String(import.meta.env?.[key] || '').trim();
    if (raw) return raw.replace(/\/+$/, '');
  } catch {
    /* use fallback */
  }
  // Prefer explicit fallback (usually the deployed analytics host). Do NOT
  // rewrite :8003 to localhost — local C4 is often not running.
  if (key === 'VITE_SCIPATH_APP_URL') {
    try {
      if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
          return `${window.location.protocol}//${host}:3000`;
        }
      }
    } catch {
      /* use fallback */
    }
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
  // Farm scores are 0–100; the tutor query expects a 0–1 unit score.
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

/** Student id from whichever field the platform session stored. */
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

/** Origin of the SCI-PATH tab that launched this farm (localhost vs 127.0.0.1). */
function scipathAppOrigin() {
  try {
    const stored = String(getChapterLaunch()?.returnUrl || '').trim();
    if (stored) return new URL(stored).origin;
  } catch {
    /* fall through to the build-time default */
  }
  return envUrl('VITE_SCIPATH_APP_URL', DEFAULT_SCIPATH_APP);
}

function buildSocratesUrl({ frustrationScore, cuePosted } = {}) {
  const app = scipathAppOrigin();
  const url = new URL('/tutor', `${app}/`);
  url.searchParams.set('from', 'farm');
  const unit = toUnitScore(frustrationScore);
  if (unit != null) {
    url.searchParams.set('frustrationScore', String(unit));
  }
  if (cuePosted) {
    url.searchParams.set('cuePosted', '1');
  }
  return url.toString();
}

/**
 * @returns {Promise<{
 *   opened: boolean,
 *   cuePosted: boolean,
 *   frustrationScore: number | null,
 *   topicId: null,
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

  const unit = toUnitScore(live.frustrationScore);
  // Navigate immediately. Waiting on the farm API, then opening a popup,
  // drops the click. Render is also HTTPS, so it cannot POST the http
  // analytics host. /tutor stores the cue from SCI-PATH.
  const tutorUrl = buildSocratesUrl({
    frustrationScore: unit,
    cuePosted: false,
  });

  // No student id — stay on the farm instead of opening the tutor.
  if (!userId) {
    return {
      opened: false,
      cuePosted: false,
      frustrationScore: null,
      topicId: null,
      tutorUrl,
      error: 'No student id — relaunch the farm from SCI-PATH.',
    };
  }

  try {
    window.location.assign(tutorUrl);
  } catch (err) {
    return {
      opened: false,
      cuePosted: false,
      frustrationScore: unit,
      topicId: null,
      tutorUrl,
      error: err?.message || 'Could not open Socrates',
    };
  }

  return {
    opened: true,
    cuePosted: false,
    frustrationScore: unit,
    topicId: null,
    tutorUrl,
  };
}
