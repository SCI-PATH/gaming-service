/**
 * AI mind-map generator for Grade 6–9: every incorrect answer becomes a branch.
 * Uses Groq/LLM when available; always merges ground-truth misses so none are dropped.
 */
import { chatCompletion, getLlamaConfig } from './llamaClient.mjs';
import {
  explainWhyWrong,
  explainCorrectIdea,
  preferConceptualText,
} from './explainMisconception.mjs';

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
export function buildLocalMindMap(attempts) {
  const list = (attempts || []).map((a) => ({
    ...a,
    topic: topicFromAttempt(a),
    studentAnswer: cleanStudentAnswer(a.studentAnswer),
    correctAnswer: cleanCorrectAnswer(a.correctAnswer),
  }));
  const topics = [...new Set(list.map((a) => a.topic).filter(Boolean))];
  const title =
    topics.length === 1 ? topics[0] : 'Your Science Gaps';

  const branches = list.map((a, i) => {
    const topic = a.topic || 'Science';
    const right = a.correctAnswer;
    const q = clip(a.prompt || a.question, 140);
    return {
      miss_index: i + 1,
      topic,
      icon: iconFor(topic),
      question: a.prompt || a.question || '',
      student_answer: a.studentAnswer || 'no pick yet',
      correct_answer: right || '',
      why_wrong: explainWhyWrong(conceptualAttempt(a)),
      key_concept: clip(right || topic, 40) || 'Key idea',
      key_concept_explain: explainCorrectIdea(conceptualAttempt(a)),
      farm_link: q
        ? `On the farm, this idea shows up whenever the crop story needs: “${clip(q, 70)}”.`
        : `Use the ${topic} idea on your farm crop story.`,
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
function mergeAiOntoAttempts(attempts, ai) {
  const local = buildLocalMindMap(attempts);
  if (!ai || typeof ai !== 'object') return local;

  const aiBranches = Array.isArray(ai.branches) ? ai.branches : [];
  const mergedBranches = local.branches.map((base, i) => {
    const hint =
      aiBranches.find((b) => Number(b.miss_index) === i + 1) ||
      aiBranches[i] ||
      {};
    return {
      ...base,
      topic: base.topic || hint.topic || 'Science',
      icon: hint.icon || base.icon,
      // Ground truth Q/A never overridden by AI inventing different items
      question: base.question || hint.question || '',
      student_answer: base.student_answer || hint.student_answer || '',
      correct_answer: base.correct_answer || hint.correct_answer || '',
      why_wrong: preferConceptualText(
        hint.why_wrong || hint.whyWrong,
        base.why_wrong,
        {
          studentAnswer: base.student_answer,
          correctAnswer: base.correct_answer,
          prompt: base.question,
        },
      ),
      key_concept:
        String(hint.key_concept || hint.keyConcept || '').trim() ||
        base.key_concept,
      key_concept_explain: preferConceptualText(
        hint.key_concept_explain ||
          hint.keyConceptExplain ||
          hint.explanation,
        base.key_concept_explain,
        {
          studentAnswer: base.student_answer,
          correctAnswer: base.correct_answer,
          prompt: base.question,
        },
      ),
      farm_link:
        String(hint.farm_link || hint.farmLink || '').trim() || base.farm_link,
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

  const depthGuide = {
    micro:
      'Each branch: why_wrong = 1–2 short cause sentences (about 25–40 words). key_concept_explain = 1–2 short mechanism sentences. farm_link one short sentence. Never shrink into “you picked X, answer is Y”.',
    simple:
      'Each branch: why_wrong = 2 short sentences that name the mix-up. key_concept_explain = 2 sentences on how the correct idea works. farm_link one sentence.',
    medium:
      'Each branch: why_wrong = 2–3 sentences (discriminating feature + why the wrong model fails). key_concept_explain = 2–3 sentences teaching the mechanism. farm_link one sentence.',
    rich:
      'Each branch: fuller misconception repair (still Grade 6–9 words). Teach cause, definition, or structure–function. farm_link connects the idea to a crop story.',
  };

  const bandGuide = {
    low: 'Student is ready to explore. Allow richer connections. Encourage curiosity.',
    moderate: 'Balanced repair map. Clear and encouraging.',
    high: 'Gentle repair only. Fewer words. No shame. Focus on the correct idea first.',
    very_high:
      'Softest map. Tiny language. One step per branch. Reassure effort. Prefer the most important misses only.',
  };

  return `You are Sage, a research mentor for Grades 6–9. Your job is misconception repair: help the student learn WHY an idea fails and WHY the science is true. You are not an answer key.

Create ONE clear interactive mind map from EVERY incorrect answer below.
Personalization band (PRIVATE — never write these words on the map): frustration_level=${level}, tone=${tone}, explain_depth=${depth}.
${bandGuide[level] || bandGuide.moderate}
${depthGuide[depth] || depthGuide.medium}
${simplify ? 'Use very simple Grade-6 words. Avoid long clauses. Still include a real because/how sentence.' : 'Use clear school language.'}
This request is already capped to ${attempts.length} miss(es) for personalization (maxBranches=${maxBranches}).

Pedagogy (this is the contribution — follow it strictly):
- why_wrong MUST be a CONTRASTIVE EXPLANATION: name the scientific mix-up (what job the wrong idea actually does, or why it does not answer THIS stem) and the discriminating feature that separates it from the correct idea.
- key_concept_explain MUST be a MINI-LESSON: how the correct idea works in nature (definition, cause, structure–function, or process). Teach why it is true.
- For True/False: do NOT write “you selected False but the answer is True”. Unpack the claim (prefixes, definitions, processes) so the student can judge the sentence next time.
- Use because / which means / is for / named for / happens when. Farm analogies are welcome when they teach the mechanism.

FORBIDDEN in why_wrong and key_concept_explain (reject these patterns):
- “you picked/chose/selected X, but the (better/correct) idea/answer is Y”
- “On [question], you picked X, but …”
- “Correct for [question]: [answer]”
- Repeating the question plus both answers with no mechanism
- Shame words: frustrated, struggling, weak, dummy, stupid

GOOD example:
Q: Plants that have two seed lobes are called dicotyledonous plants.
Wrong: False. Right: True.
BAD why_wrong: You selected False, but the answer is True.
GOOD why_wrong: This question is checking a name. “Di-” means two, and cotyledons are seed leaves, so two seed lobes is exactly how dicots are defined. False would reject that naming rule, not catch a trick.
GOOD key_concept_explain: Dicotyledonous (dicot) plants are named for two seed leaves. That definition is why the statement is true.

GOOD example 2:
Q: How do flowering plants primarily reproduce?
Wrong: Using leaves to store water. Right: Through flowers that produce seeds.
BAD why_wrong: You picked leaves storing water, but the better idea is flowers that produce seeds.
GOOD why_wrong: Storing water in leaves is a survival job, not making offspring. Reproduction in flowering plants happens when flowers produce seeds (often after pollen moves).
GOOD key_concept_explain: Flowering plants make the next generation in the flower, where pollen and ovules meet and seeds form.

Rules:
1. Output ONLY valid JSON (no markdown, no prose outside JSON).
2. Include EXACTLY ${attempts.length} branches — one per miss, miss_index 1..${attempts.length}.
3. Do NOT invent extra mistakes. Do NOT drop any miss.
4. Keep language encouraging and age-appropriate.
5. Never invent a different correct answer than the one given — copy correct_answer from input when present.
6. Every why_wrong / key_concept_explain / farm_link MUST be about THAT branch's question — not a vague neighboring topic.
7. summary and big_picture must match the LIVE personalization band (${tone}, frustration_level=${level}).
8. If a correct_answer looks like an API/grading error, ignore it and explain from the question stem only.

Incorrect answers (ground truth — each branch is one student miss):
${JSON.stringify(payload, null, 2)}

JSON schema:
{
  "title": "short map title",
  "central_idea": "what this whole map is about",
  "summary": "1–2 sentences matching tone ${tone}",
  "big_picture": "how all misses connect in one story (2–3 sentences; shorter if high/very_high)",
  "study_path": ["Miss 1: …", "Miss 2: …"],
  "branches": [
    {
      "miss_index": 1,
      "topic": "…",
      "icon": "emoji",
      "question": "copy from input",
      "student_answer": "copy from input",
      "correct_answer": "copy from input",
      "why_wrong": "contrastive explanation of the mix-up (mechanism, not score restatement)",
      "key_concept": "short correct concept label",
      "key_concept_explain": "why that science idea is true (mini-lesson)",
      "farm_link": "how the mechanism shows up on a farm"
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

  const local = buildLocalMindMap(capped);
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
            'You design personalized student mind maps for misconception repair. Reply with JSON only. why_wrong must explain the scientific mix-up; key_concept_explain must teach why the correct idea is true. Never restate “you picked X, the answer is Y”. Always include one branch per incorrect answer given. Never mention frustration scores to students.',
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
    const merged = mergeAiOntoAttempts(capped, parsed);
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
    why: b.why_wrong,
    keyConcept: b.key_concept,
    keyExplain: b.key_concept_explain,
    farmLink: b.farm_link,
    summary: b.key_concept_explain,
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
