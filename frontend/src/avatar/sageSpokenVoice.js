/**
 * Sage TTS: natural teacher talk, paced by CSF frustration (never spoken aloud).
 * Tone, rate, and sentence count change with the farm frustration score.
 * Scripts describe the missed science idea; the score itself is never said.
 */
import {
  buildFrustrationAdaptation,
  frustrationLevelFromScore,
} from '../data/frustrationModel.js';
import { compactText } from './assessmentMiss.js';
import { friendlyStudentName } from './kidFriendlySpeech.js';
import { explanationForMiss } from './textbookGraph.js';

const CHAPTER_TOPIC = /^(plant biology|science|biology|topic)$/i;

/** Short words for the recording so Sage's pace is visible, not only a voice rate. */
export function sageToneLabel(level) {
  const key = String(level || '').toLowerCase();
  if (key === 'low') return 'Upbeat';
  if (key === 'high') return 'Slow and gentle';
  if (key === 'very_high') return 'Very slow and gentle';
  return 'Steady';
}

/**
 * Map a frustration score onto pace, warmth, and how many sentences Sage may say.
 * High frustration shortens the script and slows the browser voice.
 */
export function resolveSageVoice(opts = {}) {
  const rawScore = Number(opts.frustrationScore);
  const score = Number.isFinite(rawScore) ? rawScore : null;
  const level =
    String(opts.frustrationLevel || '').toLowerCase() ||
    (score != null ? frustrationLevelFromScore(score) : 'moderate');
  const adapt = buildFrustrationAdaptation(score != null ? score : level);
  const sage = adapt.sage || {};
  const mm = adapt.mindMap || {};
  const sentenceMax =
    adapt.level === 'very_high'
      ? 3
      : adapt.level === 'high'
        ? 4
        : adapt.level === 'low'
          ? 5
          : 4;
  const rate =
    adapt.level === 'very_high'
      ? 0.82
      : adapt.level === 'high'
        ? 0.86
        : adapt.level === 'low'
          ? 0.94
          : 0.9;
  return {
    level: adapt.level,
    sentenceMax,
    pace: sage.pace || 'steady',
    warmth: sage.warmth || 'warm',
    microSteps: Boolean(sage.microSteps),
    celebrate: sage.celebrateSmallWins !== false,
    simplify: Boolean(mm.simplifyLanguage),
    rate,
    voiceHint: sage.voiceHint || '',
  };
}

/** Keep only the first few sentences so a high-frustration turn stays short. */
export function capSpokenSentences(text, max = 4) {
  const clean = compactText(text);
  if (!clean) return '';
  const parts = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const take = Math.max(1, Number(max) || 4);
  const kept = parts.slice(0, take);
  if (!kept.length) return '';
  const last = kept[kept.length - 1];
  if (!/[.!?]$/.test(last)) kept[kept.length - 1] = `${last}.`;
  return kept.join(' ');
}

/**
 * Make text easy for browser TTS (pauses, no symbols, say science words).
 */
export function prepareTtsText(raw) {
  let s = String(raw || '');
  s = s.replace(/\[object Object\]/gi, '');
  s = s.replace(/\[_{2,}\]|_{3,}|\[blank\]/gi, ' blank ');
  s = s.replace(/\s*\|\s*/g, ', ');
  s = s.replace(/\bCO\s*2\b|\bCO₂\b/gi, 'carbon dioxide');
  s = s.replace(/\bH\s*2\s*O\b|\bH₂O\b/gi, 'water');
  s = s.replace(/\bO\s*2\b|\bO₂\b/gi, 'oxygen');
  s = s.replace(/\be\.g\./gi, 'for example');
  s = s.replace(/\bi\.e\./gi, 'that is');
  s = s.replace(/\bvs\.?\b/gi, 'versus');
  s = s.replace(/\bw\/\b/gi, 'with');
  s = s.replace(/(\d)\s*[–—-]\s*(\d)/g, '$1 to $2');
  s = s.replace(/\s*[—–]\s*/g, ', ');
  s = s.replace(/;/g, ',');
  s = s.replace(/`+/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  if (s && !/[.!?]$/.test(s)) s = `${s}.`;
  return s;
}

function speakableTopic(raw) {
  const t = compactText(raw);
  if (!t || CHAPTER_TOPIC.test(t)) return '';
  return t;
}

function asSentence(raw) {
  const t = compactText(raw);
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function spokenFromGraph(graph, voice) {
  if (!graph) return '';
  const path = Array.isArray(graph.learningPath)
    ? graph.learningPath.map(compactText).filter(Boolean)
    : [];
  if (path.length) {
    const n = voice.microSteps ? 2 : Math.min(path.length, 3);
    return path.slice(0, n).map(asSentence).join(' ');
  }
  const example = compactText(graph.example);
  if (example && example.length <= 180) return asSentence(example);
  const summary = compactText(graph.misconception?.summary);
  if (summary && !/this question is checking|not the idea/i.test(summary)) {
    return asSentence(summary);
  }
  return '';
}

/** Greeting that slows down when frustration is high, using the farm student's name. */
export function sageGreeting(voice, studentName) {
  const name = friendlyStudentName(studentName);
  const hi = name ? `Hey ${name}.` : "Hey, I'm Sage.";
  if (voice.level === 'very_high') {
    return `${hi} We'll take this slowly. You're doing fine.`;
  }
  if (voice.level === 'high') {
    return `${hi} We'll go one idea at a time.`;
  }
  if (voice.level === 'low') {
    return `${hi} Let's look at this together.`;
  }
  return `${hi} Let's look at this together.`;
}

/** Closing line after she finishes a map card. Gentler when frustration is high. */
export function sageMapOutro(voice) {
  if (voice.level === 'very_high' || voice.level === 'high') {
    return 'I can say it again if you want.';
  }
  return 'Ask me if you want that again.';
}

/** Reserved hook for naming the student's mix-up. Currently silent so speech stays on the correct idea. */
function honourMixup() {
  return '';
}

/**
 * One card as a teacher would say it — not a graph dump.
 */
export function buildSageMissScript(branch, voice) {
  if (!branch) return '';
  const graph = branch.conceptGraph || branch.concept_graph;
  const textbook = compactText(branch.textbook_excerpt || branch.textbookExcerpt);
  const explained = explanationForMiss(branch);
  const idea =
    (explained ? asSentence(explained) : '') ||
    spokenFromGraph(graph, voice) ||
    (textbook ? asSentence(textbook.split(/(?<=[.!?])\s+/)[0]) : '') ||
    asSentence(branch.keyConcept || branch.key_concept);
  const mix = honourMixup(branch.studentAnswer, voice);
  const bits = [];

  if (mix) bits.push(mix);
  if (idea) {
    bits.push(idea);
  } else {
    const question = compactText(branch.prompt || branch.question);
    if (question && question.length <= 120 && !voice.microSteps) {
      bits.push(`The farm asked: ${asSentence(question)}`);
    }
  }

  const joined = bits.join(' ').replace(/\s+/g, ' ').trim();
  return prepareTtsText(capSpokenSentences(joined, voice.sentenceMax));
}

/** Short spoken path from a concept graph when the card has no textbook line. */
export function narrateConceptGraph(graph, voice) {
  return spokenFromGraph(graph, voice);
}
