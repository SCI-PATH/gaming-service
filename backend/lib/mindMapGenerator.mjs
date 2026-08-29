/**
 * AI mind-map generator for Grade 6–9: every incorrect answer becomes a branch.
 * Uses Groq/LLM when available; always merges ground-truth misses so none are dropped.
 */
import { chatCompletion, getLlamaConfig } from './llamaClient.mjs';
import {
  explainCorrectIdea,
  scienceKeyIdea,
  composeFiveStepLesson,
  validateStructuredLesson,
} from '../../frontend/src/avatar/explainMisconception.js';

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
  const out = [];
  const attempts = body.attempts || body.sourceAttempts || [];
  if (Array.isArray(attempts)) {
    for (const a of attempts) {
      if (!a) continue;
      out.push({
        questionId: a.questionId || a.id || null,
        topic: a.topic || 'Science',
        prompt: a.prompt || a.question || '',
        studentAnswer: a.studentAnswer || a.student_answer || a.wrong || '',
        correctAnswer: a.correctAnswer || a.correct_answer || a.right || '',
        hint: a.hint || null,
      });
    }
  }

  const misc = body.misconceptions || [];
  if (Array.isArray(misc)) {
    for (const m of misc) {
      if (Array.isArray(m.attempts)) {
        for (const a of m.attempts) {
          out.push({
            questionId: a.questionId || null,
            topic: a.topic || m.topic || 'Science',
            prompt: a.prompt || '',
            studentAnswer: a.studentAnswer || '',
            correctAnswer: a.correctAnswer || m.lastCorrectAnswer || '',
            hint: a.hint || m.hint || null,
          });
        }
      } else if (m.prompts?.length) {
        m.prompts.forEach((p, i) => {
          out.push({
            questionId: `${m.topic}-${i}`,
            topic: m.topic || 'Science',
            prompt: p,
            studentAnswer: m.wrongAnswers?.[i] || m.wrongAnswers?.[0] || '',
            correctAnswer:
              m.correctAnswers?.[i] || m.lastCorrectAnswer || '',
            hint: m.hint || null,
          });
        });
      }
    }
  }

  const seen = new Set();
  return out.filter((a) => {
    const key = `${a.prompt}|${a.studentAnswer}|${a.correctAnswer}|${a.topic}`;
    if (!a.prompt && !a.correctAnswer) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function clip(text, n = 120) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1).trim()}…` : s;
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
    const right = a.correctAnswer;
    const q = clip(a.prompt || a.question, 140);
    const conceptual = conceptualAttempt(a);
    const lesson = composeFiveStepLesson(conceptual, voice);
    const lessonOk = validateStructuredLesson(lesson);
    return {
      miss_index: i + 1,
      topic,
      icon: iconFor(topic),
      question: a.prompt || a.question || '',
      student_answer: a.studentAnswer || 'no pick yet',
      correct_answer: right || '',
      options: Array.isArray(a.options) ? a.options : [],
      why_wrong: '',
      key_concept: lessonOk
        ? clip(lesson.studentAnswer.concept, 90)
        : clip(scienceKeyIdea(conceptual), 90) || clip(right || topic, 40) || 'Key idea',
      key_concept_explain: lessonOk
        ? lesson.correctAnswer.scientificDefinition
        : explainCorrectIdea(conceptual, voice),
      lesson: lessonOk ? lesson : null,
      farm_link: scienceKeyIdea(conceptual)
        ? `Hold this idea for the farm question: ${clip(scienceKeyIdea(conceptual), 80)}.`
        : `Come back to this miss and try the farm question with one clear idea.`,
      color_index: i % 6,
    };
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
    return {
      ...base,
      topic: base.topic || hint.topic || 'Science',
      icon: hint.icon || base.icon,
      question: base.question || hint.question || '',
      student_answer: base.student_answer || hint.student_answer || '',
      correct_answer: base.correct_answer || hint.correct_answer || '',
      why_wrong: '',
      lesson: base.lesson || null,
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
    topic: a.topic,
    question: a.prompt,
    student_wrong_answer: a.studentAnswer,
    correct_answer: a.correctAnswer,
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

  return `You are Sage's research helper. You do NOT write the science lesson. The server will compose a 3-beat why from ground truth (question, student answer, correct answer, hint). You only help name what the student's WRONG word means in everyday life — and only if you are certain.

Create ONE mind map JSON from EVERY incorrect answer below.
Personalization (PRIVATE — never write these words on the map): frustration_level=${level}, mind_map_tone=${tone}, sage_voice=${tone}, explain_depth=${depth}.
Sage voice: ${sageHint}
${bandGuide[level] || bandGuide.moderate}
${depthGuide[depth] || depthGuide.medium}
${simplify ? 'Use very simple Grade-6 words.' : 'Use clear school language.'}
Capped to ${attempts.length} miss(es).

student_idea_in_the_world rules:
- ONE sentence about the student's wrong term as a real-world idea (helium → balloons; petal → colourful flower part).
- If you are not 100% sure what that term is, output empty string "". Never guess.
- Do NOT mention the correct_answer. Do NOT teach photosynthesis/the lesson in this field.
- Do NOT talk about placeholders, blanks, or typing.

The server writes why_wrong and key_concept_explain. You may leave them as "".
Copy question, student_answer, and correct_answer exactly from input. Never invent a different correct answer.

GOLDEN shape the SERVER will build (for your understanding only):
Wrong helium / right carbon dioxide → Helium is the light balloon gas. Leaves take in carbon dioxide to make food. Helium does not join that reaction.

FORBIDDEN: guessing facts, “you picked X but the answer is Y”, placeholder talk, shame words.

Rules:
1. Output ONLY valid JSON.
2. EXACTLY ${attempts.length} branches, miss_index 1..${attempts.length}.
3. Do not drop or invent misses.

Incorrect answers:
${JSON.stringify(payload, null, 2)}

JSON schema:
{
  "title": "short map title",
  "central_idea": "what this whole map is about",
  "summary": "1–2 sentences matching tone ${tone}",
  "big_picture": "how misses connect (2–3 sentences; shorter if high/very_high)",
  "study_path": ["Miss 1: …", "Miss 2: …"],
  "branches": [
    {
      "miss_index": 1,
      "topic": "…",
      "icon": "emoji",
      "question": "copy from input",
      "student_answer": "copy from input",
      "correct_answer": "copy from input",
      "student_idea_in_the_world": "everyday sentence about the WRONG term, or empty",
      "why_wrong": "",
      "key_concept": "short correct concept label",
      "key_concept_explain": "",
      "farm_link": "one sentence how the CORRECT idea shows up on a farm"
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
            'You only name what the student’s wrong word means in everyday life if you are certain. Leave student_idea_in_the_world empty if unsure. Never invent science. The server writes the lesson. JSON only. One branch per miss. Never mention frustration.',
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
    return {
      ok: true,
      mindMap: toClientShape({
        ...merged,
        summary: merged.summary || `${adaptation.mindMap.label} map`,
      }),
      provider: result.provider,
      model: result.model,
      note:
        merged.generatedBy === 'ai'
          ? `AI personalized mind map (${adaptation.mindMap.label}).`
          : 'Mind map of every incorrect answer.',
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
    topic: b.topic,
    label: b.topic,
    shortLabel: String(b.topic || 'Science').slice(0, 18),
    icon: b.icon || iconFor(b.topic),
    colorIndex: b.color_index ?? i % 6,
    prompt: b.question,
    studentAnswer: b.student_answer,
    correctAnswer: b.correct_answer,
    options: b.options || [],
    why: b.why_wrong,
    keyConcept: b.key_concept,
    keyExplain: b.key_concept_explain,
    farmLink: b.farm_link,
    summary: b.key_concept_explain,
    lesson: b.lesson || null,
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
