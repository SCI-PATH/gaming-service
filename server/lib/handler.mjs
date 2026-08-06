import {
  getSystemPromptForMode,
  INTERVENTION_MODES,
} from './systemPrompt.mjs';
import {
  chatCompletion,
  getLlamaConfig,
  streamChatCompletion,
} from './llamaClient.mjs';

/**
 * Offline / failed-provider fallback — mode-aware, no direct answer.
 */
export function buildFallbackReply(context = {}, studentMessage = '') {
  const mode =
    context?.intervention_mode ||
    INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD;
  const story =
    context?.game_state?.current_story ||
    'your farm quest';
  const name =
    context?.student_profile?.display_name || 'friend';
  const mapTopic =
    context?.mind_map?.topic ||
    context?.misconceptions?.[0]?.topic ||
    null;
  const accuracy =
    context?.metrics?.accuracy_percentage ??
    context?.student_profile?.historical_accuracy_pct;
  const formats =
    context?.learning_preferences?.preferred_question_formats || [];
  const msg = String(studentMessage || '').toLowerCase();

  if (mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE) {
    return `${name}, your science run looks strong${accuracy != null ? ` (~${accuracy}% accuracy)` : ''}—you're under-challenged on ${story}. Want stretch scenarios or puzzles next, or a tougher cash goal? Which format fires you up most?`;
  }

  if (mode === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE) {
    return `Yes, ${name}—that mastery move counts! Keep the first-try focus, then pick a bigger farm challenge${formats.length ? ` (I heard you like ${formats.join(', ')})` : ''}. What should we level up next?`;
  }

  if (mapTopic || msg.includes('mind map') || msg.includes('concept')) {
    return `It's okay to stumble on ${mapTopic || 'this idea'}—I built a concept map of the linked pieces for you. Trace two nodes and how they connect on the farm. Which part still feels foggy?`;
  }
  if (msg.includes('format') || msg.includes('multiple') || msg.includes('puzzle')) {
    return `Great self-knowledge—preferring a format is a real learning strategy. We'll lean that style while you rebuild concepts. For now: which part of the lesson still confuses you most?`;
  }
  if (msg.includes('too hard') || msg.includes('difficult') || msg.includes('confus')) {
    return `Feeling overwhelmed on ${story} is valid. Let's shrink it to one idea${mapTopic ? ` in ${mapTopic}` : ''}, then re-link it on your mind map. What single word in the lesson feels newest?`;
  }
  return `I'm here as your learning companion—not another quiz. We'll rebuild ideas with a map, a gentle hint, and a confidence boost. What part of this lesson feels hardest right now?`;
}

/**
 * Build Groq messages: mode system prompt + full context JSON + student turn.
 */
export function buildMessages(body = {}) {
  const context = body.contextPayload || body.context || {};
  const studentMessage = String(
    body.studentMessage || body.message || body.quickPrompt || '',
  ).trim();
  const history = Array.isArray(body.history) ? body.history.slice(-4) : [];
  const mode =
    body.intervention_mode ||
    context?.intervention_mode ||
    INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD;

  const system = getSystemPromptForMode(mode);

  const userBlock = [
    `Context payload:\n${JSON.stringify(context, null, 0)}`,
    `Student message: ${
      studentMessage ||
      defaultStudentMessage(mode)
    }`,
    'Act as a personalized learning companion: motivation + concept mind-map coaching + optional format preferences. Under 3 sentences. Never give the MCQ answer.',
  ].join('\n\n');

  return [
    { role: 'system', content: system },
    ...history
      .filter(
        (m) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string',
      )
      .map((m) => ({ role: m.role, content: m.content.slice(0, 600) })),
    { role: 'user', content: userBlock },
  ];
}

function defaultStudentMessage(mode) {
  if (mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE) {
    return 'I seem under-challenged—ask what formats I like and push me higher.';
  }
  if (mode === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE) {
    return 'Celebrate my progress and help me choose what to advance next.';
  }
  return 'I missed some concepts—help me learn with the mind map and motivation, not the answer key.';
}

/**
 * Core handler — returns JSON-serializable result.
 */
export async function handleAvatarChat(body = {}) {
  const context = body.contextPayload || body.context || {};
  const studentMessage = String(
    body.studentMessage || body.message || body.quickPrompt || '',
  ).trim();
  const cfg = getLlamaConfig();
  const mode =
    body.intervention_mode ||
    context?.intervention_mode ||
    INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD;
  const mood = inferMood(mode, context, studentMessage);

  if (cfg.provider === 'offline' || cfg.provider === 'fallback') {
    return {
      ok: true,
      reply: buildFallbackReply(context, studentMessage),
      provider: 'offline',
      model: null,
      fallback: true,
      avatarMood: mood,
      intervention_mode: mode,
    };
  }

  const messages = buildMessages(body);

  try {
    const result = await chatCompletion({ messages, stream: false });
    return {
      ok: true,
      reply: result.content,
      provider: result.provider,
      model: result.model,
      fallback: false,
      avatarMood: mood,
      intervention_mode: mode,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const soft =
      message === 'OFFLINE_MODE'
        ? 'Offline mentor mode (no Groq call).'
        : message;
    return {
      ok: true,
      reply: buildFallbackReply(context, studentMessage),
      provider: 'fallback',
      model: null,
      fallback: true,
      error: soft,
      avatarMood: mood,
      intervention_mode: mode,
    };
  }
}

function inferMood(mode, context, studentMessage) {
  if (mode === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE) return 'proud';
  if (mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE) {
    return 'encouraging';
  }
  const fr = String(
    context?.game_state?.frustration_level ||
      context?.metrics?.click_pattern_density ||
      '',
  ).toLowerCase();
  const msg = String(studentMessage || '').toLowerCase();
  if (
    fr.includes('high') ||
    fr.includes('rage') ||
    msg.includes('too hard') ||
    msg.includes('frustrated')
  ) {
    return 'empathetic';
  }
  return 'empathetic';
}

/**
 * SSE stream: data: {"type":"meta"|"token"|"done"|"error", ...}
 */
export async function handleAvatarChatStream(body = {}, write) {
  const context = body.contextPayload || body.context || {};
  const studentMessage = String(
    body.studentMessage || body.message || body.quickPrompt || '',
  ).trim();
  const cfg = getLlamaConfig();
  const mode =
    body.intervention_mode ||
    context?.intervention_mode ||
    INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD;
  const mood = inferMood(mode, context, studentMessage);

  const send = (obj) => {
    write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  send({
    type: 'meta',
    provider: cfg.provider,
    model: cfg.provider === 'offline' ? null : cfg.model,
    avatarMood: mood,
    intervention_mode: mode,
    fallback: cfg.provider === 'offline' || cfg.provider === 'fallback',
  });

  if (cfg.provider === 'offline' || cfg.provider === 'fallback') {
    const reply = buildFallbackReply(context, studentMessage);
    await streamTextChunks(reply, (t) => send({ type: 'token', text: t }));
    send({
      type: 'done',
      reply,
      provider: 'offline',
      fallback: true,
      avatarMood: mood,
      intervention_mode: mode,
    });
    return;
  }

  const messages = buildMessages(body);
  let full = '';

  try {
    await streamChatCompletion({
      messages,
      onMeta: (m) =>
        send({
          type: 'meta',
          provider: m.provider,
          model: m.model,
          fallback: false,
          avatarMood: mood,
          intervention_mode: mode,
        }),
      onToken: (t) => {
        full += t;
        send({ type: 'token', text: t });
      },
    });
    if (!full.trim()) {
      full = buildFallbackReply(context, studentMessage);
      send({ type: 'token', text: full });
      send({
        type: 'done',
        reply: full,
        provider: 'fallback',
        fallback: true,
        error: 'Empty model stream',
        avatarMood: mood,
        intervention_mode: mode,
      });
      return;
    }
    send({
      type: 'done',
      reply: full.trim(),
      provider: cfg.provider,
      model: cfg.model,
      fallback: false,
      avatarMood: mood,
      intervention_mode: mode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reply = buildFallbackReply(context, studentMessage);
    if (!full.trim()) {
      await streamTextChunks(reply, (t) => send({ type: 'token', text: t }));
    }
    send({
      type: 'done',
      reply: full.trim() || reply,
      provider: 'fallback',
      fallback: true,
      error: message,
      avatarMood: mood,
      intervention_mode: mode,
    });
  }
}

function streamTextChunks(text, onToken) {
  const words = String(text).split(/(\s+)/).filter(Boolean);
  return new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      if (i >= words.length) {
        resolve();
        return;
      }
      onToken(words[i]);
      i += 1;
      setTimeout(tick, 28);
    };
    tick();
  });
}
