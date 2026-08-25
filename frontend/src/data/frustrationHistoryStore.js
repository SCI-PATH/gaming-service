/**
 * Per-student frustration snapshots after each quiz answer.
 * Lets the dashboard show how play felt over time, not only the latest score.
 */

import { studentStorageKey } from './mockStudents.js';

const BASE_STORAGE_KEY = 'scipath_frustration_history';
const MAX_SAMPLES = 240;

function storageKey() {
  return studentStorageKey(BASE_STORAGE_KEY);
}

function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

function readStore() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return { samples: [] };
    const data = JSON.parse(raw);
    return {
      samples: Array.isArray(data?.samples) ? data.samples : [],
    };
  } catch {
    return { samples: [] };
  }
}

function writeStore(data) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(data));
  } catch {
    // ignore quota / private mode
  }
}

export function getFrustrationHistory() {
  return readStore().samples;
}

export function appendFrustrationSample(sample = {}) {
  const store = readStore();
  const prev = store.samples[store.samples.length - 1];
  const seq = (Number(prev?.seq) || 0) + 1;
  const levelId = Math.max(1, Number(sample.levelId) || 1);
  const inLevel =
    store.samples.filter((s) => Number(s.levelId) === levelId).length + 1;
  const next = {
    seq,
    globalIndex: seq,
    levelId,
    questionIndex: Math.max(1, Number(sample.questionIndex) || inLevel),
    score: clampScore(sample.score),
    band: String(sample.level || sample.band || 'low').toLowerCase(),
    correct: Boolean(sample.correct),
    signals: Array.isArray(sample.signals) ? sample.signals.slice(0, 8) : [],
    at: Date.now(),
  };
  store.samples = [...store.samples, next].slice(-MAX_SAMPLES);
  writeStore(store);
  return store.samples;
}

function avgScore(list) {
  if (!list.length) return null;
  const total = list.reduce((sum, item) => {
    const n = typeof item === 'number' ? item : Number(item?.score);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  return Math.round(total / list.length);
}

function bandLabel(band) {
  const key = String(band || 'low').toLowerCase();
  if (key === 'very_high') return 'very high';
  if (key === 'high') return 'high';
  if (key === 'moderate') return 'moderate';
  return 'low';
}

/**
 * Collapse consecutive same-band samples into play phases + a short story.
 */
export function summarizeFrustrationJourney(samples = []) {
  if (!samples.length) {
    return {
      segments: [],
      headline: null,
      firstWindow: null,
      laterWindow: null,
    };
  }

  const segments = [];
  for (const sample of samples) {
    const last = segments[segments.length - 1];
    if (last && last.band === sample.band) {
      last.end = sample.globalIndex;
      last.endQuestion = sample.questionIndex;
      last.endLevelId = sample.levelId;
      last.scores.push(sample.score);
    } else {
      segments.push({
        band: sample.band,
        start: sample.globalIndex,
        end: sample.globalIndex,
        startQuestion: sample.questionIndex,
        endQuestion: sample.questionIndex,
        startLevelId: sample.levelId,
        endLevelId: sample.levelId,
        scores: [sample.score],
      });
    }
  }

  const labeled = segments.map((seg) => ({
    ...seg,
        avgScore: avgScore(seg.scores),
    label: bandLabel(seg.band),
    questionRange:
      seg.start === seg.end
        ? `Q${seg.start}`
        : `Q${seg.start}–Q${seg.end}`,
  }));

  const firstWindow = samples.slice(0, 5);
  const laterWindow = samples.slice(5);
  const earlyAvg = avgScore(firstWindow);
  const laterAvg = avgScore(laterWindow);
  const overallAvg = avgScore(samples);

  let headline = `Play so far averages ${overallAvg}/100 frustration.`;
  if (firstWindow.length >= 3 && laterWindow.length >= 3) {
    if (earlyAvg - laterAvg >= 12) {
      headline = `The first ${firstWindow.length} questions felt tougher (${earlyAvg}/100). Later play eased to ${laterAvg}/100.`;
    } else if (laterAvg - earlyAvg >= 12) {
      headline = `Play started calmer (${earlyAvg}/100). Later questions rose to ${laterAvg}/100.`;
    } else {
      headline = `Play stayed fairly steady — early ${earlyAvg}/100, later ${laterAvg}/100.`;
    }
  } else if (labeled.length >= 2) {
    const first = labeled[0];
    const last = labeled[labeled.length - 1];
    headline = `Started ${first.label} (${first.questionRange}), ended ${last.label} (${last.questionRange}).`;
  }

  return {
    segments: labeled,
    headline,
    firstWindow: earlyAvg == null ? null : { count: firstWindow.length, avg: earlyAvg },
    laterWindow: laterAvg == null ? null : { count: laterWindow.length, avg: laterAvg },
    overallAvg,
  };
}
