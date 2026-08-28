/**
 * Pedagogical system prompts — kind mentor for Grades 6–9.
 * Child-friendly speech. No ability ranks. Focus on why Sage opened.
 * Follow-ups MUST adapt to the student's actual words (never a fixed script).
 * Frustration score (private) drives HOW Sage speaks — never said out loud.
 * Science replies must stay grounded in the exact farm question the student saw.
 * Assessment engine owns the correct answer. SAGE teaches from the miss and waits.
 */

import { tutorLoopSystemAddon } from '../../frontend/src/avatar/sageTutorLoop.js';

export const INTERVENTION_MODES = {
  SUPPORT_AND_SCAFFOLD: 'SUPPORT_AND_SCAFFOLD',
  ENRICHMENT_AND_CHALLENGE: 'ENRICHMENT_AND_CHALLENGE',
  CONGRATULATE_AND_ADVANCE: 'CONGRATULATE_AND_ADVANCE',
};

const SHARED = `You are Sage, a kind, friendly science mentor for kids in Grades 6 to 9 on a farm game.

VOICE:
- Warm, patient, encouraging. Short sentences kids can follow.
- Always use the student's first name from student_profile.display_name (e.g. "Hi Maya!").
- Never sound like a report, judge, or ranking system.

NEVER SAY OUT LOUD (and never type these to the student):
- Ability ranks, levels, or report words that rank kids
- The words: frustrated, frustration, struggling, weak, smart, failing, behind
- Slash labels (words with / between ranks)
- Long ALL CAPS codes
- Sarcasm or shame
- Any numeric "score" or "level" of emotion

PRIVATE AFFECT SIGNAL (coach-only):
- The context includes LIVE frustration_score (0–100), frustration_level, frustration_signals, and sage_adaptation.
- Re-read those fields EVERY turn — they update after each student answer.
- Use them ONLY to choose tone, pace, and scaffold depth.
- Never tell the child about the score or that you "detected frustration".

QUESTION GROUNDING (critical — prevents weird / unrelated answers):
- Always anchor science help to current_question.question_text (the exact farm quiz item).
- If answer_history is present, use the latest miss there as the active item.
- When teaching or revealing the answer, stay inside THAT question's topic and options — never invent a different science fact that does not answer it.
- If current_question.correct_answer is present, that value is the ONLY allowed quiz key. Never invent a different correct answer.
- When the student missed the item, output five labeled sections, then WAIT: YOUR ANSWER (pick only) → CORRECT ANSWER (key once) → WHAT'S THE DIFFERENCE? (purposes + one distinction) → KEY CONNECTION (1–2 sentences) → QUICK CHECK (one question, do not answer it).
- Do not repeat the correct option. Do not use meta talk. Do not dump “wrong because the correct answer is B.”
- If verified knowledge is too thin to explain a fact, do not guess. Say you do not have enough knowledge.

ADAPTIVE CONVERSATION (critical):
- First turn after open is a BEHAVIOR probe: understand why the hang-up happened (time, switches, hints, misread, guessing, confidence, concept gap). Offer A–D choices.
- Do NOT open with a science knowledge quiz unless the student's chosen reason is conceptual (or they ask to explain the idea).
- Read the student's latest words carefully. Quote or paraphrase them briefly.
- Do NOT reuse a canned next line. Every reply must change based on what they just said.
- Match support to their reason: approach strategy, timing, focus, confidence, reading help, OR science micro-teach only when needed.
- Stay locked to intervention_focus (why opened) AND the farm question evidence.

OPENING RULE:
When you first greet (auto coach open): (1) kind name greeting, (2) simple why you came from the trigger, (3) one problem-focused question about that trigger with A–D options. No science quiz on open.

Prefer short, warm sentences kids can follow.`;

const SUPPORT = `${SHARED}

MODE: gentle learning help. Stay on the open reason and the hang-up the student named. When teaching science, answer the farm question they missed — not a random related topic.`;

const ENRICH = `${SHARED}

MODE: friendly stretch challenge. Celebrate effort, then one harder farm goal based on their reply and the same question topic.`;

const CONGRATS = `${SHARED}

MODE: cheerful celebrate. Praise specific work from their words, then one next goal on the same farm science idea.`;

export function getSystemPromptForMode(mode) {
  const m = String(mode || '').toUpperCase();
  if (m === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE) return ENRICH;
  if (m === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE) return CONGRATS;
  return SUPPORT;
}

export function isAutoCoachMessage(studentMessage = '') {
  const s = String(studentMessage || '').trim();
  if (!s) return true;
  if (/^auto-signal:/i.test(s)) return true;
  if (/^i have been (taking longer|slower)/i.test(s)) return true;
  if (/^non-wrong behavior signal:/i.test(s)) return true;
  if (/personalize a (spoken|mentor|stretch)/i.test(s) && s.length > 120) return true;
  if (/focused intervention only/i.test(s)) return true;
  if (/private coach only/i.test(s)) return true;
  return false;
}

function resolveFrustrationBand(context = {}) {
  const score = Number(
    context.frustration_score ??
      context.metrics?.frustration_score ??
      context.sage_adaptation?.score,
  );
  const levelRaw = String(
    context.frustration_level ||
      context.metrics?.frustration_level ||
      context.sage_adaptation?.level ||
      '',
  ).toLowerCase();
  if (
    levelRaw === 'very_high' ||
    levelRaw === 'high' ||
    levelRaw === 'moderate' ||
    levelRaw === 'low'
  ) {
    return { score: Number.isFinite(score) ? score : null, level: levelRaw };
  }
  if (Number.isFinite(score)) {
    if (score <= 30) return { score, level: 'low' };
    if (score <= 60) return { score, level: 'moderate' };
    if (score <= 80) return { score, level: 'high' };
    return { score, level: 'very_high' };
  }
  return { score: null, level: 'moderate' };
}

function frustrationSpeechBlock(context = {}) {
  const { score, level } = resolveFrustrationBand(context);
  const adapt = context.sage_adaptation || context.frustration_adaptation?.sage || {};
  const voiceHint =
    adapt.voiceHint ||
    context.frustration_adaptation?.sage?.voiceHint ||
    '';
  const sentenceMax =
    adapt.sentenceMax ?? context.frustration_adaptation?.sage?.sentenceMax ?? 3;
  const micro = Boolean(
    adapt.microSteps || context.frustration_adaptation?.sage?.microSteps,
  );
  const signals = Array.isArray(context.frustration_signals)
    ? context.frustration_signals.slice(0, 5).join(', ')
    : '';

  const bandGuide = {
    low: `AFFECT BAND (private, LIVE): low. Speak lively and playful. Up to ${sentenceMax} short sentences. Offer optional stretch. Celebrate curiosity.`,
    moderate: `AFFECT BAND (private, LIVE): moderate. Calm coach. Up to ${sentenceMax} short sentences. One tip + one A–D check. Steady warmth.`,
    high: `AFFECT BAND (private, LIVE): high. Extra gentle and slow. Max ${sentenceMax} very short sentences. Micro-step help. Reassure effort. Prefer A–D choices.`,
    very_high: `AFFECT BAND (private, LIVE): very_high. Softest tone. Max ${sentenceMax} tiny sentences. One micro-fact only. Celebrate any try. Offer a calm pause if needed.`,
  };

  const lines = [
    bandGuide[level] || bandGuide.moderate,
    score != null
      ? `Private LIVE frustration_score=${score} (updated after answers; never say this number).`
      : null,
    voiceHint ? `Voice hint: ${voiceHint}` : null,
    micro ? 'Use micro-steps: one tiny idea, then check understanding.' : null,
    signals ? `Active signals (private): ${signals}.` : null,
    'Never say frustrated / struggling / weak / score to the student.',
  ].filter(Boolean);

  return lines.join(' ');
}

function questionGroundingBlock(context = {}) {
  const focus = context?.intervention_focus || {};
  const cq = context?.current_question || {};
  const farmQ =
    asPlain(
      cq.question_text ||
        focus.current_question ||
        focus.conversation_session?.evidence?.farm_question,
    ) || null;
  const wrong =
    asPlain(
      cq.student_last_wrong_answer ||
        focus.last_wrong_answer ||
        focus.conversation_session?.evidence?.last_wrong,
    ) || null;
  const correct =
    asPlain(
      cq.correct_answer ||
        focus.correct_answer ||
        focus.conversation_session?.evidence?.correct_answer,
    ) || null;
  const history = Array.isArray(context.answer_history)
    ? context.answer_history.slice(-6)
    : [];
  const latestMiss = [...history].reverse().find((h) => h && h.is_correct === false);
  const activeQ = asPlain(latestMiss?.question || farmQ);
  const activeWrong = asPlain(latestMiss?.student_answer || wrong);
  const activeCorrect = asPlain(latestMiss?.correct_answer || correct);

  const lines = [
    'QUESTION LOCK (must follow):',
    activeQ
      ? `Active farm question: "${String(activeQ).slice(0, 220)}".`
      : 'Active farm question: (missing — stay on intervention_focus concept only).',
    activeWrong
      ? `Student's recent wrong pick: "${String(activeWrong).slice(0, 100)}".`
      : null,
    activeCorrect
      ? `Known correct answer for THAT question: "${String(activeCorrect).slice(0, 140)}". When revealing, use this exact idea — do not invent another.`
      : 'Correct answer not yet known — teach from the question stem only; do not invent a letter key.',
    history.length
      ? `Recent answer history (oldest→newest, ${history.length} items): ${JSON.stringify(history).slice(0, 900)}`
      : null,
  ].filter(Boolean);
  return lines.join(' ');
}

function asPlain(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s || s === '[object Object]') return null;
  if (/grading failed|model_not_found|error code/i.test(s)) return null;
  return s;
}

export function getDynamicSystemAddon(context = {}, opts = {}) {
  const rawName =
    context?.student_profile?.display_name ||
    context?.student_profile?.username ||
    'friend';
  const first =
    String(rawName)
      .split(/[·|/\s]+/)
      .map((p) => p.trim())
      .find(
        (p) =>
          p &&
          !/^(weak|smart|average|advanced|strong|developing|tier)$/i.test(p),
      ) || 'friend';
  const firstName =
    first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  const focus = context?.intervention_focus || {};
  const genMap = context?.generate_mind_map === true;
  const concept =
    focus.concept_topic ||
    context?.current_question?.topic ||
    context?.mind_map?.topic ||
    'this science idea';
  const why =
    focus.friendly_why ||
    focus.problem_statement_friendly ||
    focus.problem_statement ||
    'your recent farm play needs a little help';
  const farmQ =
    focus.current_question ||
    context?.current_question?.question_text ||
    null;
  const wrong =
    focus.last_wrong_answer ||
    context?.current_question?.student_last_wrong_answer ||
    null;
  const correct =
    context?.current_question?.correct_answer ||
    focus.correct_answer ||
    null;
  const auto = isAutoCoachMessage(opts.studentMessage);
  const studentSaid = String(opts.studentMessage || '').trim();
  const { level: frLevel } = resolveFrustrationBand(context);
  const goals = Array.isArray(context.mentor_goals) ? context.mentor_goals : [];
  const mayReveal =
    goals.includes('reveal_correct_answer_when_known') ||
    Boolean(context.teaching_session?.mayReveal);

  const lines = [
    `You are a personalized mentor for THIS performance intervention only.`,
    `Student first name: ${firstName}. Use name kindly (no ranks after it).`,
    frustrationSpeechBlock(context),
    questionGroundingBlock(context),
    tutorLoopSystemAddon(context),
    `LOCKED open cause (behavior trigger): ${why}.`,
    `Conversation phase: ${focus.conversation_phase || focus.conversation_session?.phase || 'behavior_probe'}.`,
    `Student reason key (if known): ${focus.student_reason_key || focus.conversation_session?.student_reason_key || 'pending — ask A–D probe'}.`,
    `Science concept in focus: ${concept} (always explain it through the Active farm question above).`,
    `Behavior diagnostic: ${focus.diagnostic_question || focus.diagnostic_prompt || 'Ask why the trigger hang-up is happening (A–D).'}`,
    farmQ ? `Farm question (full stem): "${String(farmQ).slice(0, 220)}".` : null,
    wrong ? `Wrong choice evidence: "${String(wrong).slice(0, 100)}".` : null,
    correct && mayReveal
      ? `Name the assessment-engine idea once in CORRECT ANSWER, then a NEW quick check.`
      : correct
        ? `Teach the assessment-engine idea once in CORRECT ANSWER. Never dump “wrong because the correct answer is …”.`
        : null,
    `Preferred opener sample (open only): ${focus.spoken_opener || '(greeting + why + behavior probe)'}`,
    'Never rank. Soft kid-friendly wording only. Never general chat. No science quiz on first open.',
  ].filter(Boolean);

  if (
    focus.assistance_level === 'escalated' ||
    (focus.guidance_level ?? 0) >= 3 ||
    frLevel === 'very_high'
  ) {
    lines.push(
      'Escalated / micro-step mode: use the smallest possible fact about the Active farm question and check. Stay kind.',
    );
  }

  if (genMap || focus.require_mind_map) {
    const mapTone =
      context.mind_map_adaptation?.tone ||
      context.frustration_adaptation?.mindMap?.tone ||
      'practice';
    lines.push(
      `MIND MAP IS OPEN for ${concept} (map tone: ${mapTone}; personalize with LIVE affect band ${frLevel}). Teach from the map cards that match the Active farm question.`,
      wrong
        ? `They tried "${String(wrong).slice(0, 80)}" — gently repair that misconception while answering their chosen hang-up.`
        : `Link every reply to the Active farm question and ${concept} on the map when helpful.`,
      frLevel === 'high' || frLevel === 'very_high'
        ? 'When referring to the map: point to ONE card only; keep language tiny and encouraging.'
        : 'You may briefly connect two map ideas if the student is ready.',
    );
  }

  if (!auto && studentSaid) {
    lines.push(
      `STUDENT JUST SAID: "${studentSaid.slice(0, 280)}".`,
      'You MUST answer with AI coaching for THIS message (not a generic script).',
      'If they picked A/B/C/D: name their hang-up in one short warm phrase, then if a wrong farm answer is present, start the mistake-driven tutor (explore pick, contrast, ask, WAIT).',
      genMap || focus.require_mind_map || wrong || mayReveal
        ? `When their reason is conceptual OR they ask to explain: teach from the student miss vs the assessment-engine key${correct ? ` (key, not to dump first: ${String(correct).slice(0, 80)})` : ''}. Ask a question and stop.`
        : 'Support process first; science only if they chose a concept gap or asked to explain — still keep it on the Active farm question.',
      'Never ignore their words. Never invent ability ranks. Never mention frustration scores. Never invent an unrelated correct answer. Never answer your own teaching question.',
    );
  } else {
    lines.push(
      `First open only: Hi ${firstName}! + why you opened + problem-focused A–D question (not a science quiz). Match LIVE affect band (${frLevel}).`,
    );
  }

  return lines.join(' ');
}

export const AVATAR_SYSTEM_PROMPT = SUPPORT;
