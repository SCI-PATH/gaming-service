/**
 * AI mind-map generator for Grade 6–9: every incorrect answer becomes a branch.
 * Uses Groq/LLM when available; always merges ground-truth misses so none are dropped.
 */
import { chatCompletion, getLlamaConfig } from './llamaClient.mjs';
import {
  explainCorrectIdea,
  scienceKeyIdea,
  looksLikeSymbolicTypedAnswer,
} from '../../frontend/src/avatar/explainMisconception.js';
import {
  buildTypeAwareLesson,
  collectAssessmentMisses,
  scoredConceptList,
  validateMindMapAgainstAssessments,
} from '../../frontend/src/avatar/assessmentMiss.js';
import {
  buildConceptGraph,
  validateConceptGraph,
} from '../../frontend/src/avatar/conceptGraph.js';
import { attachTextbookGrounding } from './textbookRetrieve.mjs';

const TOPIC_ICONS = {
  photosynthesis: '☀️',
  pollination: '🐝',
  'plant biology': '🌿',
  'water cycle': '💧',
  soil: '🌱',
  ecology: '🌍',
  nutrition: '🍎',
  default: '🔬',
};

function iconFor(topic) {
  const t = String(topic || '').toLowerCase();
  for (const [k, v] of Object.entries(TOPIC_ICONS)) {
    if (k !== 'default' && t.includes(k)) return v;
  }
  return TOPIC_ICONS.default;
}

function normalizeAttempts(body = {}) {
  return collectAssessmentMisses(body).map((a) => ({
    questionId: a.questionId,
    topic: a.topic || topicFromAttempt(a),
    prompt: a.question || a.prompt || '',
    question: a.question || a.prompt || '',
    studentAnswer: cleanStudentAnswer(a.studentAnswer),
    correctAnswer: cleanCorrectAnswer(a.correctAnswer),
    canonicalCorrectAnswer: a.canonicalCorrectAnswer || a.correctAnswer,
    acceptedAnswers: a.acceptedAnswers || [],
    missedBlanks: a.missedBlanks || [],
    blankIndex: a.blankIndex || null,
    questionType: a.questionType,
    options: a.options || [],
    hint: a.hint || null,
    completeness: a.completeness,
    missingKeywords: a.missingKeywords || [],
    isCorrect: Boolean(a.isCorrect),
    chapter: a.chapter || a.chapter_name,
    chapter_name: a.chapter || a.chapter_name,
    chapter_id: a.chapter_id || a.chapterId,
    topic_id: a.topic_id || a.topicId,
    grade: a.grade,
  }));
}

function clip(text, n = 120) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1).trim()}…` : s;
}

function sameRough(a, b) {
  const left = String(a || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const right = String(b || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 24 && right.includes(left)) return true;
  if (right.length >= 24 && left.includes(right)) return true;
  return false;
}

function looksLikeMetaAnswer(raw) {
  const s = String(raw || '').trim();
  if (!s) return true;
  if (/^(id|guid|uuid|null|undefined|nan)$/i.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{10,}$/i.test(s)) return true;
  if (/^\[object object\]$/i.test(s)) return true;
  return false;
}

function topicFromAttempt(a) {
  const topic = String(a.topic || '').trim();
  if (topic && !/^science$/i.test(topic)) return topic;
  const prompt = String(a.prompt || a.question || '');
  if (/photosynth|chlorophyll|light.*plant/i.test(prompt)) return 'Photosynthesis';
  if (/pollinat|pollen|bee/i.test(prompt)) return 'Pollination';
  if (/physical change|chemical change/i.test(prompt)) return 'Physical & Chemical Changes';
  if (/soil|nutrient|fertiliz/i.test(prompt)) return 'Soil Science';
  if (/water cycle|evaporat|condens/i.test(prompt)) return 'Water Cycle';
  if (/food chain|ecosystem|habitat/i.test(prompt)) return 'Ecology';
  return topic || 'Science';
}

function cleanStudentAnswer(raw) {
  const s = String(raw || '').trim();
  if (!s || looksLikeMetaAnswer(s)) return '';
  return s;
}

function cleanCorrectAnswer(raw) {
  const s = String(raw || '').trim();
  if (!s || looksLikeMetaAnswer(s)) return '';
  if (/^\d+\s+of\s+\d+\s+blanks/i.test(s)) return '';
  if (/^no answer provided/i.test(s)) return '';
  if (/^correct\.?$/i.test(s)) return '';
  return s;
}

function conceptualAttempt(a) {
  return {
    topic: a.topic,
    prompt: a.prompt || a.question || '',
    question: a.prompt || a.question || '',
    studentAnswer: cleanStudentAnswer(a.studentAnswer),
    correctAnswer: cleanCorrectAnswer(a.correctAnswer),
    hint: a.hint || null,
  };
}

/**
 * Deterministic map guaranteed to include every miss (local fallback).
 */
export function buildLocalMindMap(attempts, adaptation = null) {
  const list = (attempts || []).map((a) => ({
    ...a,
    topic: topicFromAttempt(a),
    studentAnswer: cleanStudentAnswer(a.studentAnswer),
    correctAnswer: cleanCorrectAnswer(a.correctAnswer),
  }));
  const topics = [...new Set(list.map((a) => a.topic).filter(Boolean))];
  const title =
    topics.length === 1 ? topics[0] : 'Your Science Gaps';
  const voice = {
    tone: adaptation?.mindMap?.tone || 'practice',
    frustrationLevel: adaptation?.level || 'moderate',
    explainDepth: adaptation?.mindMap?.explainDepth || 'medium',
  };

  const branches = list.map((a, i) => {
    const topic = a.topic || 'Science';
    const right = a.correctAnswer || '';
    const conceptual = {
      ...conceptualAttempt(a),
      correctAnswer: right,
      studentAnswer: a.studentAnswer,
      prompt: a.prompt || a.question,
      questionType: a.questionType,
      completeness: a.completeness,
      missingKeywords: a.missingKeywords,
      missedBlanks: a.missedBlanks || [],
      acceptedAnswers: a.acceptedAnswers || [],
      frustrationLevel: adaptation?.level,
    };
    const noUsable =
      looksLikeSymbolicTypedAnswer(a.studentAnswer) ||
      /ran out of time|no pick yet|nothing typed|left blank/i.test(
        String(a.studentAnswer || ''),
      );
    const lesson = noUsable ? null : buildTypeAwareLesson(a, voice);
    const lessonOk = Boolean(lesson && !lesson.insufficientKnowledge && lesson.sections?.length);
    const keyConcept = lessonOk
      ? clip(lesson.correctAnswer.concept, 90)
      : clip(scienceKeyIdea(conceptual), 90) || clip(topic, 40) || 'Key idea';
    const keyExplain = lessonOk
      ? lesson.correctAnswer.scientificDefinition
      : explainCorrectIdea(conceptual, voice);
    const whyWrong = lessonOk
      ? lesson.comparisonFields?.keyScientificDifference || lesson.comparison || ''
      : '';
    const branch = {
      miss_index: i + 1,
      questionId: a.questionId || null,
      questionType: a.questionType || '',
      blankIndex: a.blankIndex || null,
      topic,
      icon: iconFor(topic),
      question: a.prompt || a.question || '',
      student_answer: a.studentAnswer || 'no pick yet',
      correct_answer: right || '',
      missed_blanks: a.missedBlanks || [],
      options: Array.isArray(a.options) ? a.options : [],
      why_wrong: whyWrong,
      key_concept:
        sameRough(keyConcept, right) || /flowers that produce seeds/i.test(keyConcept)
          ? clip(scienceKeyIdea(conceptual), 90) || clip(topic, 40) || 'Key idea'
          : keyConcept,
      key_concept_explain:
        sameRough(keyExplain, right) ||
        sameRough(keyExplain, keyConcept) ||
        /flowers that produce seeds/i.test(keyExplain)
          ? explainCorrectIdea(conceptual, voice)
          : keyExplain,
      lesson: lessonOk ? lesson : null,
      concept_graph: buildConceptGraph({
        ...a,
        frustrationLevel: adaptation?.level,
      }),
      farm_link: (() => {
        const idea = scienceKeyIdea(conceptual);
        if (idea && !sameRough(idea, right)) {
          return `Hold this idea for the farm question: ${clip(idea, 80)}.`;
        }
        return `Come back to this miss and try the farm question with one clear idea.`;
      })(),
      color_index: i % 6,
    };
    return attachTextbookGrounding(branch, a);
  });

  return {
    title,
    central_idea: title,
    summary:
      list.length === 0
        ? 'No incorrect answers yet.'
        : `Mind map of all ${list.length} incorrect answer${list.length === 1 ? '' : 's'} — one branch per miss.`,
    big_picture:
      topics.length > 1
        ? `These ${list.length} misses cover: ${topics.join(', ')}. Each branch repairs one wrong answer, then links them as one farm-science story.`
        : `All of these misses are about ${title}. Study each branch, then say the correct idea out loud.`,
    study_path: branches.map((b) => `Miss ${b.miss_index}: ${b.topic}`),
    branches,
    missCount: list.length,
    conceptCount: topics.length || 1,
    sourceAttempts: list,
    generatedBy: 'local',
  };
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* try fence / slice */
  }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Merge AI enrichments onto ground-truth attempts so every miss is present.
 */
function mergeAiOntoAttempts(attempts, ai, adaptation = null) {
  const local = buildLocalMindMap(attempts, adaptation);
  if (!ai || typeof ai !== 'object') return local;
  const voice = {
    tone: adaptation?.mindMap?.tone || 'practice',
    frustrationLevel: adaptation?.level || 'moderate',
    explainDepth: adaptation?.mindMap?.explainDepth || 'medium',
  };

  const aiBranches = Array.isArray(ai.branches) ? ai.branches : [];
  const mergedBranches = local.branches.map((base, i) => {
    const hint =
      aiBranches.find((b) => Number(b.miss_index) === i + 1) ||
      aiBranches[i] ||
      {};
    const ground = {
      topic: base.topic,
      prompt: base.question,
      question: base.question,
      studentAnswer: base.student_answer,
      correctAnswer: base.correct_answer,
      hint: attempts[i]?.hint || null,
    };
    const farm = String(hint.farm_link || hint.farmLink || '').trim();
    const farmOk =
      farm.length >= 12 &&
      farm.length <= 180 &&
      !/placeholder|frustrat|you picked|the response fills/i.test(farm);
    const hintedGraph = hint.concept_graph || hint.conceptGraph || null;
    const graphCheck = hintedGraph
      ? validateConceptGraph(hintedGraph, {
          correctAnswer: base.correct_answer,
          studentAnswer: base.student_answer,
          missedBlanks: attempts[i]?.missedBlanks || base.missed_blanks,
          acceptedAnswers: attempts[i]?.acceptedAnswers,
        })
      : { ok: false };
    const localGraph = base.concept_graph;
    const conceptGraph = graphCheck.ok ? hintedGraph : localGraph;
    return {
      ...base,
      topic: base.topic || hint.topic || 'Science',
      icon: hint.icon || base.icon,
      question: base.question || '',
      student_answer: base.student_answer,
      correct_answer: base.correct_answer,
      why_wrong: '',
      lesson: base.lesson || null,
      concept_graph: conceptGraph,
      key_concept: (() => {
        const hinted = String(hint.key_concept || hint.keyConcept || '').trim();
        if (hinted && !/^(true|false|t|f|yes|no)$/i.test(hinted) && hinted.length > 4) {
          return clip(hinted, 48);
        }
        return base.key_concept;
      })(),
      key_concept_explain: base.key_concept_explain,
      farm_link: farmOk ? farm : base.farm_link,
      color_index: i % 6,
      miss_index: i + 1,
    };
  });

  // If AI returned extras beyond attempts, ignore them (strict all-misses list)
  // If AI returned fewer, we still have local full set from ground truth.

  const topics = [
    ...new Set(mergedBranches.map((b) => b.topic).filter(Boolean)),
  ];

  return {
    title:
      String(ai.title || ai.central_idea || local.title).slice(0, 60) ||
      local.title,
    central_idea:
      String(ai.central_idea || ai.title || local.central_idea).slice(0, 80) ||
      local.central_idea,
    summary:
      String(ai.summary || local.summary).slice(0, 280) || local.summary,
    big_picture:
      String(ai.big_picture || ai.bigPicture || local.big_picture).slice(
        0,
        400,
      ) || local.big_picture,
    study_path: Array.isArray(ai.study_path)
      ? ai.study_path.map(String).slice(0, 10)
      : local.study_path,
    branches: mergedBranches,
    missCount: attempts.length,
    conceptCount: topics.length || 1,
    sourceAttempts: attempts,
    generatedBy: 'ai',
  };
}

function buildPrompt(attempts, adaptation = null) {
  const payload = attempts.map((a, i) => ({
    miss_number: i + 1,
    question_id: a.questionId || null,
    question_type: a.questionType || 'unknown',
    blank_index: a.blankIndex || null,
    topic: a.topic,
    question: a.prompt,
    student_wrong_answer: a.studentAnswer,
    correct_answer: a.correctAnswer,
    missed_blanks: a.missedBlanks || [],
    scored_concepts: scoredConceptList(a),
    hint: a.hint || null,
  }));

  const level = String(adaptation?.level || 'moderate').toLowerCase();
  const map = adaptation?.mindMap || {};
  const maxBranches = map.maxBranches || attempts.length;
  const depth = map.explainDepth || 'medium';
  const simplify = Boolean(map.simplifyLanguage);
  const tone = map.tone || 'practice';

  const sageHint =
    adaptation?.sage?.voiceHint ||
    {
      low: 'Upbeat farm buddy. Honour their idea with extra science colour, then the mechanism.',
      moderate:
        'Warm coach. Honour their idea in everyday life, then the farm-science job, then why it does not fit.',
      high: 'Gentle. Short. Everyday image first, then one sentence on the correct idea, then one on why theirs does not fit.',
      very_high:
        'Softest. Two or three short sentences. Everyday image first. No extra vocabulary. No shame.',
    }[level] ||
    'Warm coach. Honour the student’s idea, then teach the correct job.';

  const depthGuide = {
    micro:
      'student_idea_in_the_world: at most 1 short everyday sentence, or empty. Server writes the science lesson.',
    simple:
      'student_idea_in_the_world: 1 everyday sentence if you know the term, else empty.',
    medium:
      'student_idea_in_the_world: 1–2 everyday sentences if you know the term, else empty.',
    rich:
      'student_idea_in_the_world: 1 richer everyday sentence if you know the term (e.g. helium barely reacts), else empty.',
  };

  const bandGuide = {
    low: 'Student is ready to explore. Allow richer connections. Encourage curiosity.',
    moderate: 'Balanced repair map. Clear and encouraging.',
    high: 'Gentle repair. Honour their idea in one everyday image first, then the correct job. No shame.',
    very_high:
      'Softest map. Tiny language. One step per branch. Reassure effort. Prefer the most important misses only.',
  };

  return `You are Sage's research helper. You do NOT write the science lesson and you do NOT decide the quiz key. The server will compose the lesson from ground truth.

AUTHORITATIVE RULES (must follow):
- The assessment engine's correct_answer / scored_concepts are authoritative.
- Do not replace, reinterpret, infer, or invent another correct answer.
- Each string in scored_concepts MUST be its own node with kind "correct".
- Use textbook language only in node explanations, never as chopped sentence labels.
- Never make a node from activity verbs (tabulate, collect, compare) or from a lone number.
- Never use a blank index as a mix-up node.
- Explain the student's answer only in relation to this specific question.
- Do not introduce an unrelated misconception.
- If the student's answer is a valid scientific concept but does not answer this question, explain that distinction.
- For fill-in questions, keep one branch per question (do not clone a branch per blank).
- Never use another question from answer history. Only the questions in this payload exist.
- Copy question, student_answer, and correct_answer exactly from input.

Create ONE mind map JSON from EVERY incorrect answer below.
Personalization (PRIVATE — never write these words on the map): frustration_level=${level}, mind_map_tone=${tone}, sage_voice=${tone}, explain_depth=${depth}.
Sage voice: ${sageHint}
${bandGuide[level] || bandGuide.moderate}
${depthGuide[depth] || depthGuide.medium}
${simplify ? 'Use very simple Grade-6 words.' : 'Use clear school language.'}
${level === 'high' || level === 'very_high' ? 'Fewer supporting nodes. Keep only the scored concepts plus at most one helper.' : 'You may add 1–3 textbook helper nodes that mention the scored concepts.'}
Capped to ${attempts.length} miss(es).

Incorrect answers:
${JSON.stringify(payload, null, 2)}

The server already built a local concept graph. You may refine node explanations only.
Return a concept_graph per branch:
- 4 to 10 short keyword nodes (labels 1–4 words, not sentences)
- NEVER use placeholder labels like Function, Job, Claim, Correct idea, Plant Biology, Example
- NEVER use meta edges like "asks" or "does not" pointing at empty nodes
- Draw a real concept tree (e.g. Plant → Leaves / Stem, Leaves → Photosynthesis → Food)
- If the student mixed parts, put the mix-up as a sibling with ITS real job (Stem → Transport)
- Labeled relationships (from, to, label) such as has, do, absorb, transport
- Mark the student mix-up node kind as "mixup" — never as if it were true
- Include a node for EVERY scored_concept (kind "correct")
- Write learningPath as spoken kid sentences (no "Miss 1", no "Learning path")
- Do not invent a different correct answer

JSON schema:
{
  "title": "short map title",
  "central_idea": "what this whole map is about",
  "summary": "1–2 sentences matching tone ${tone}",
  "big_picture": "how misses connect (2–3 sentences; shorter if high/very_high)",
  "study_path": ["Flowering plants make flowers", "Non-flowering plants make spores"],
  "branches": [
    {
      "miss_index": 1,
      "question": "copy from input",
      "student_answer": "copy from input",
      "correct_answer": "copy from input",
      "concept_graph": {
        "concept": "Plant water absorption",
        "misconception": { "summary": "…", "type": "related_concept_confusion" },
        "nodes": [{ "id": "roots", "label": "Roots", "kind": "correct", "explanation": "…" }],
        "relationships": [{ "from": "roots", "to": "water", "label": "absorb" }],
        "learningPath": ["…"],
        "practice": { "question": "…", "expectedConcept": "…" }
      }
    }
  ]
}`;
}

/**
 * Generate mind map for all misses (AI + guaranteed merge), personalized by frustration.
 */
export async function generateMindMapFromMistakes(body = {}) {
  const attempts = normalizeAttempts(body);
  if (!attempts.length) {
    return {
      ok: true,
      mindMap: buildLocalMindMap([]),
      provider: 'none',
      note: 'No incorrect answers provided.',
    };
  }

  const frustrationScore = Number(body.frustrationScore ?? body.frustration_score);
  const frustrationLevel = String(
    body.frustrationLevel || body.frustration_level || '',
  ).toLowerCase();
  const adaptation =
    body.frustrationAdaptation ||
    body.frustration_adaptation ||
    buildAdaptationFromScore(frustrationScore, frustrationLevel);

  // Cap attempts for very high frustration (still keep earliest misses)
  const capped = attempts.slice(0, adaptation.mindMap.maxBranches || attempts.length);

  const local = buildLocalMindMap(capped, adaptation);
  const cfg = getLlamaConfig();

  if (cfg.provider === 'offline' || cfg.provider === 'fallback') {
    return {
      ok: true,
      mindMap: toClientShape({
        ...local,
        summary: `${adaptation.mindMap.label}: ${local.summary}`,
      }),
      provider: 'offline',
      note: 'Local mind map (set GROQ_API_KEY for AI enrichment).',
      frustrationLevel: adaptation.level,
    };
  }

  try {
    const result = await chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'The assessment engine owns the correct answer. Copy student_answer and correct_answer exactly. Never invent a different key. Never mix questions. Leave student_idea_in_the_world empty if unsure. JSON only. Never mention frustration.',
        },
        { role: 'user', content: buildPrompt(capped, adaptation) },
      ],
      maxTokens: Math.max(
        1400,
        Number(process.env.MINDMAP_MAX_TOKENS || 1800) || 1800,
      ),
      temperature: adaptation.level === 'very_high' ? 0.25 : 0.35,
    });

    const parsed = extractJson(result.content);
    const merged = mergeAiOntoAttempts(capped, parsed, adaptation);
    const check = validateMindMapAgainstAssessments(toClientShape(merged), capped);
    const safe = check.ok ? merged : local;
    return {
      ok: true,
      mindMap: toClientShape({
        ...safe,
        summary: safe.summary || `${adaptation.mindMap.label} map`,
      }),
      provider: check.ok ? result.provider : 'local-fallback',
      model: check.ok ? result.model : undefined,
      note: check.ok
        ? `AI personalized mind map (${adaptation.mindMap.label}).`
        : 'AI map did not match the assessment result — showing the local lesson.',
      frustrationLevel: adaptation.level,
      frustrationScore: Number.isFinite(frustrationScore)
        ? frustrationScore
        : null,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err || '');
    const soft =
      /model_not_found|does not exist|404|rate.?limit|429|GROQ|timeout/i.test(
        raw,
      )
        ? 'AI map unavailable — showing a clear local map of every miss.'
        : 'AI unavailable — using local map of every miss.';
    return {
      ok: true,
      mindMap: toClientShape(local),
      provider: 'local-fallback',
      note: soft,
      aiError: true,
      frustrationLevel: adaptation.level,
    };
  }
}

function buildAdaptationFromScore(score, levelIn) {
  const s = Number(score);
  let level = String(levelIn || '').toLowerCase();
  if (!level || level === 'null') {
    if (!Number.isFinite(s)) level = 'moderate';
    else if (s <= 30) level = 'low';
    else if (s <= 60) level = 'moderate';
    else if (s <= 80) level = 'high';
    else level = 'very_high';
  }
  const mindMapByLevel = {
    low: {
      maxBranches: 8,
      extraLinks: true,
      explainDepth: 'rich',
      tone: 'challenge',
      simplifyLanguage: false,
      label: 'Explore connections',
    },
    moderate: {
      maxBranches: 5,
      extraLinks: false,
      explainDepth: 'medium',
      tone: 'practice',
      simplifyLanguage: false,
      label: 'Repair practice',
    },
    high: {
      maxBranches: 3,
      extraLinks: false,
      explainDepth: 'simple',
      tone: 'support',
      simplifyLanguage: true,
      label: 'Gentle repair',
    },
    very_high: {
      maxBranches: 2,
      extraLinks: false,
      explainDepth: 'micro',
      tone: 'support',
      simplifyLanguage: true,
      label: 'One step at a time',
    },
  };
  return {
    level,
    score: Number.isFinite(s) ? s : null,
    mindMap: mindMapByLevel[level] || mindMapByLevel.moderate,
  };
}

/** Shape used by the React mind-map component */
export function toClientShape(map) {
  const branches = (map.branches || []).map((b, i) => ({
    id: `miss-${i}`,
    index: b.miss_index || i + 1,
    questionId: b.questionId || null,
    questionType: b.questionType || '',
    blankIndex: b.blankIndex || null,
    topic: b.topic,
    label: b.topic,
    shortLabel: String(b.topic || 'Science').slice(0, 18),
    icon: b.icon || iconFor(b.topic),
    colorIndex: b.color_index ?? i % 6,
    prompt: b.question,
    studentAnswer: b.student_answer,
    correctAnswer: b.correct_answer,
    missedBlanks: b.missed_blanks || [],
    options: b.options || [],
    why: b.why_wrong,
    keyConcept: b.key_concept,
    keyExplain: b.key_concept_explain,
    farmLink: b.farm_link,
    summary: b.key_concept_explain,
    lesson: b.lesson || null,
    conceptGraph: b.concept_graph || b.conceptGraph || null,
  }));

  return {
    topic: map.title,
    root: map.title || map.central_idea,
    title: map.title,
    centralIdea: map.central_idea,
    summary: map.summary,
    bigPicture: map.big_picture,
    studyPath: map.study_path || [],
    branches,
    missCount: map.missCount ?? branches.length,
    conceptCount: map.conceptCount ?? 1,
    sourceAttempts: map.sourceAttempts || [],
    personalizedNote:
      map.summary ||
      `Every wrong answer is on this map (${branches.length} miss${branches.length === 1 ? '' : 'es'}).`,
    layout: 'all-misses-ai',
    generatedBy: map.generatedBy || 'local',
  };
}
