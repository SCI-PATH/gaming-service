/**
 * AI mind-map generator for Grade 6–9: every incorrect answer becomes a branch.
 * Uses Groq/LLM when available; always merges ground-truth misses so none are dropped.
 */
import { chatCompletion, getLlamaConfig } from './llamaClient.mjs';

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

function fallbackWhyWrong(a) {
  const w = String(a.studentAnswer || '').trim();
  const r = String(a.correctAnswer || '').trim();
  if (!w || w.startsWith('(')) {
    return `The key idea is: ${r || 'review the farm science lesson'}.`;
  }
  if (r) {
    return `You picked "${w}", but the better science idea is "${r}".`;
  }
  return `Think again about why "${w}" does not fit this plant/farm process.`;
}

/**
 * Deterministic map guaranteed to include every miss (local fallback).
 */
export function buildLocalMindMap(attempts) {
  const list = attempts || [];
  const topics = [...new Set(list.map((a) => a.topic).filter(Boolean))];
  const title =
    topics.length === 1 ? topics[0] : 'Your Science Gaps';

  const branches = list.map((a, i) => ({
    miss_index: i + 1,
    topic: a.topic || 'Science',
    icon: iconFor(a.topic),
    question: a.prompt || '',
    student_answer: a.studentAnswer || '',
    correct_answer: a.correctAnswer || '',
    why_wrong: fallbackWhyWrong(a),
    key_concept: a.correctAnswer || a.topic || 'Key idea',
    key_concept_explain:
      a.hint ||
      `Remember: ${a.correctAnswer || a.topic} matters for plants on the farm.`,
    farm_link: `Use the ${a.topic || 'science'} idea on your farm crop story.`,
    color_index: i % 6,
  }));

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
      why_wrong:
        String(hint.why_wrong || hint.whyWrong || '').trim() || base.why_wrong,
      key_concept:
        String(hint.key_concept || hint.keyConcept || '').trim() ||
        base.key_concept,
      key_concept_explain:
        String(
          hint.key_concept_explain ||
            hint.keyConceptExplain ||
            hint.explanation ||
            '',
        ).trim() || base.key_concept_explain,
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

function buildPrompt(attempts) {
  const payload = attempts.map((a, i) => ({
    miss_number: i + 1,
    topic: a.topic,
    question: a.prompt,
    student_wrong_answer: a.studentAnswer,
    correct_answer: a.correctAnswer,
    hint: a.hint || null,
  }));

  return `You are an expert educational mind-map designer for students in Grades 6–9.

Create ONE clear interactive mind map from EVERY incorrect answer below.
Rules:
1. Output ONLY valid JSON (no markdown, no prose outside JSON).
2. Include EXACTLY ${attempts.length} branches — one per miss, miss_index 1..${attempts.length}.
3. Do NOT invent extra mistakes. Do NOT drop any miss.
4. Keep language simple, encouraging, short (school-aged).
5. Use farm / plants analogies when natural.
6. Never invent a different correct answer than the one given.

Incorrect answers (ground truth):
${JSON.stringify(payload, null, 2)}

JSON schema:
{
  "title": "short map title",
  "central_idea": "what this whole map is about",
  "summary": "1–2 sentences",
  "big_picture": "how all misses connect in one story (2–3 sentences)",
  "study_path": ["Miss 1: …", "Miss 2: …"],
  "branches": [
    {
      "miss_index": 1,
      "topic": "…",
      "icon": "emoji",
      "question": "copy from input",
      "student_answer": "copy from input",
      "correct_answer": "copy from input",
      "why_wrong": "friendly why their pick was weak",
      "key_concept": "short correct concept label",
      "key_concept_explain": "simple explanation",
      "farm_link": "how it shows up on a farm"
    }
  ]
}`;
}

/**
 * Generate mind map for all misses (AI + guaranteed merge).
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

  // Always start from full local list — AI only enriches
  const local = buildLocalMindMap(attempts);
  const cfg = getLlamaConfig();

  if (cfg.provider === 'offline' || cfg.provider === 'fallback') {
    return {
      ok: true,
      mindMap: toClientShape(local),
      provider: 'offline',
      note: 'Local mind map (set GROQ_API_KEY for AI enrichment).',
    };
  }

  try {
    const result = await chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You design student mind maps. Reply with JSON only. Always include one branch per incorrect answer given.',
        },
        { role: 'user', content: buildPrompt(attempts) },
      ],
      maxTokens: Math.max(
        900,
        Number(process.env.MINDMAP_MAX_TOKENS || 1200) || 1200,
      ),
      temperature: 0.35,
    });

    const parsed = extractJson(result.content);
    const merged = mergeAiOntoAttempts(attempts, parsed);
    return {
      ok: true,
      mindMap: toClientShape(merged),
      provider: result.provider,
      model: result.model,
      note:
        merged.generatedBy === 'ai'
          ? 'AI mind map covering every incorrect answer.'
          : 'Mind map of every incorrect answer.',
    };
  } catch (err) {
    return {
      ok: true,
      mindMap: toClientShape(local),
      provider: 'local-fallback',
      note: err instanceof Error ? err.message : 'AI unavailable; used local map.',
      aiError: true,
    };
  }
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
