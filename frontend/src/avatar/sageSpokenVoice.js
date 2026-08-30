/**
 * Sage TTS: Grade 6–9 wording, paced by CSF frustration (never spoken aloud).
 */
import {
  buildFrustrationAdaptation,
  frustrationLevelFromScore,
} from '../data/frustrationModel.js';
import { layoutConceptTree } from './conceptGraph.js';
import { compactText } from './assessmentMiss.js';
import { friendlyStudentName } from './kidFriendlySpeech.js';

const CHAPTER_TOPIC = /^(plant biology|science|biology|topic)$/i;

const EDGE_SPEAK = {
  include: 'include',
  has: 'have',
  make: 'make',
  'can form': 'can form',
  hold: 'hold',
  do: 'do',
  involve: 'involve',
  from: 'take from',
  needs: 'need',
  'lead to': 'lead to',
  with: 'and',
  and: 'and',
  'checked by': 'are checked by',
  scores: 'score as',
  uses: 'use',
  'stored by': 'are stored by',
  'not stored by': 'are not stored by',
  'confused with': 'is not the same as',
  'not grouped by': 'are not grouped by',
  'belongs to': 'belongs with',
};

export function resolveSageVoice(opts = {}) {
  const rawScore = Number(opts.frustrationScore);
  const score = Number.isFinite(rawScore) ? rawScore : null;
  const level =
    String(opts.frustrationLevel || '').toLowerCase() ||
    (score != null ? frustrationLevelFromScore(score) : 'moderate');
  const adapt = buildFrustrationAdaptation(score != null ? score : level);
  const sage = adapt.sage || {};
  const mm = adapt.mindMap || {};
  const sentenceMax = Math.max(1, Number(sage.sentenceMax) || 3);
  const rate =
    adapt.level === 'very_high'
      ? 0.78
      : adapt.level === 'high'
        ? 0.84
        : adapt.level === 'low'
          ? 1.02
          : 0.95;
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

export function capSpokenSentences(text, max = 3) {
  const clean = compactText(text);
  if (!clean) return '';
  const parts = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const take = Math.max(1, Number(max) || 3);
  const kept = parts.slice(0, take);
  if (!kept.length) return '';
  const last = kept[kept.length - 1];
  if (!/[.!?]$/.test(last)) kept[kept.length - 1] = `${last}.`;
  return kept.join(' ');
}

function speakableTopic(raw) {
  const t = compactText(raw);
  if (!t || CHAPTER_TOPIC.test(t)) return '';
  return t;
}

function kidEdge(from, edge, to) {
  const e = compactText(edge).toLowerCase();
  if (!from || !to) return '';
  if (/^(centers on|asks|tests|means|does not)$/i.test(e)) return '';
  const verb = EDGE_SPEAK[e] || (e.length <= 12 ? e : '');
  if (!verb) return '';
  return `${from} ${verb} ${to}.`;
}

function walkGraphLines(node, voice, acc = [], depth = 0) {
  if (!node || acc.length >= (voice.microSteps ? 3 : 8)) return acc;
  if (node.kind === 'mixup' && (voice.level === 'high' || voice.level === 'very_high')) {
    return acc;
  }
  const kids = Array.isArray(node.children) ? node.children : [];
  for (const child of kids) {
    if (acc.length >= (voice.microSteps ? 3 : 8)) break;
    if (child.kind === 'mixup' && (voice.level === 'high' || voice.level === 'very_high')) {
      continue;
    }
    const line = kidEdge(node.label, child.edge, child.label);
    if (line) acc.push(line);
    walkGraphLines(child, voice, acc, depth + 1);
  }
  return acc;
}

export function narrateConceptGraph(graph, voice) {
  if (!graph?.nodes?.length) return '';
  const layout = layoutConceptTree(graph);
  const lines = walkGraphLines(layout.tree, voice);
  if (!lines.length && graph.learningPath?.length) {
    return capSpokenSentences(graph.learningPath.join('. '), voice.sentenceMax);
  }
  return capSpokenSentences(lines.join(' '), voice.sentenceMax);
}

export function sageGreeting(voice, studentName) {
  const name = friendlyStudentName(studentName);
  const hi = name ? `Hi ${name}.` : "Hi, I'm Sage.";
  if (voice.level === 'very_high') {
    return `${hi} We'll go one tiny step. You're doing fine.`;
  }
  if (voice.level === 'high') {
    return `${hi} We'll go slowly, one idea at a time.`;
  }
  if (voice.level === 'low') {
    return `${hi} Let's look at this farm science idea together.`;
  }
  return `${hi} Let's look at this idea together.`;
}

export function sageMapOutro(voice) {
  if (voice.level === 'very_high' || voice.level === 'high') {
    return 'Tap a card if you want to hear it again. Take your time.';
  }
  if (voice.level === 'low') {
    return 'Tap a card if you want that part again — then try the farm when you are ready.';
  }
  return 'Tap a card if you want me to say that part again.';
}

function mixupLine(wrong, voice) {
  const w = compactText(wrong);
  if (!w || /no pick|no answer|unclear/i.test(w)) return '';
  if (voice.level === 'very_high') return '';
  if (voice.level === 'high') return `You wrote ${w}. That's okay.`;
  if (voice.level === 'low') return `You tried ${w} — close, but not this job.`;
  return `You answered ${w}.`;
}

/**
 * One card in kid speech. Never says "Miss N", "learning path", or frustration.
 */
export function buildSageMissScript(branch, voice) {
  if (!branch) return '';
  const graph = branch.conceptGraph || branch.concept_graph;
  const graphTalk = narrateConceptGraph(graph, voice);
  const key = compactText(branch.keyConcept || branch.key_concept);
  const wrong = mixupLine(branch.studentAnswer, voice);
  const bits = [];

  if (voice.level === 'low' && speakableTopic(branch.topic)) {
    bits.push(`This is about ${speakableTopic(branch.topic)}.`);
  }

  if (graphTalk) {
    bits.push(graphTalk);
  } else {
    const question = compactText(branch.prompt || branch.question);
    if (question && !voice.microSteps && question.length <= 140) {
      bits.push(`The question asked: ${/[.!?]$/.test(question) ? question : `${question}.`}`);
    }
    if (wrong) bits.push(wrong);
    if (key && !/see the lesson|the idea in this farm question/i.test(key)) {
      bits.push(`Remember: ${key}.`);
    }
  }

  if (wrong && graphTalk && voice.level !== 'very_high') {
    bits.unshift(wrong);
  }

  if (
    graph?.practice?.question &&
    voice.level === 'low' &&
    !voice.microSteps
  ) {
    bits.push(`Quick check: ${graph.practice.question}`);
  }

  const joined = bits.join(' ').replace(/\s+/g, ' ').trim();
  return capSpokenSentences(joined, voice.sentenceMax);
}
