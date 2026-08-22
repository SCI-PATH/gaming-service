/**
 * Streaming + timed client for avatar chat.
 * Supports JSON (legacy) and SSE stream from /api/avatar-chat?stream=1
 */

import { sanitizeKidSpeech, softProviderNote } from './kidFriendlySpeech.js';
import {
  freezeInterventionSession,
  resolvePerformanceReply,
} from './mentorConversationSession.js';
import { buildAdaptiveFollowUp } from './adaptiveMentorReply.js';
import { syncMentorIntervention } from '../data/engagementSync.js';

const CLIENT_TIMEOUT_MS = 45000;

function logMentorExchange(opts, result) {
  if (!result?.reply) return;
  syncMentorIntervention({
    contextPayload: opts.contextPayload,
    studentMessage: opts.studentMessage || opts.quickPrompt || '',
    mentorReply: result.reply,
    provider: result.provider,
    model: result.model,
    interventionMode: opts.contextPayload?.intervention_mode,
    frustrationScore: opts.contextPayload?.frustration_score,
    perceivedState: opts.contextPayload?.perceived_state,
    triggerReason: opts.contextPayload?.intervention_focus?.reason || null,
    focusPayload: opts.contextPayload?.intervention_focus || {},
    telemetrySnapshot: opts.contextPayload || {},
  });
}

function isAutoCoachMessage(studentMessage = '') {
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

/**
 * Always produce a performance-aware reply for student turns.
 */
function resolveStudentAwareReply(
  studentMessage = '',
  contextPayload = null,
  history = [],
  modelReply = '',
) {
  const msg = String(studentMessage || '').trim();
  const focus = contextPayload?.intervention_focus || {};

  if (!msg || isAutoCoachMessage(msg)) {
    if (focus?.spoken_opener) return sanitizeKidSpeech(focus.spoken_opener);
    return buildAdaptiveFollowUp({
      studentMessage: msg,
      context: contextPayload || {},
      chatHistory: history,
    });
  }

  // Prefer frozen conversation_session when present (client open freeze)
  const sessionHint = focus.conversation_session
    ? freezeInterventionSession(focus, {
        studentName: contextPayload?.student_profile?.display_name,
      })
    : freezeInterventionSession(focus, {
        studentName: contextPayload?.student_profile?.display_name,
      });

  // Merge live turn state from payload
  if (focus.conversation_session) {
    sessionHint.guidance_level =
      focus.conversation_session.guidance_level ?? sessionHint.guidance_level;
    sessionHint.turn_index =
      focus.conversation_session.turn_index ?? sessionHint.turn_index;
    sessionHint.evaluations =
      focus.conversation_session.evaluations || sessionHint.evaluations;
    if (focus.conversation_session.evidence) {
      sessionHint.evidence = {
        ...sessionHint.evidence,
        ...focus.conversation_session.evidence,
      };
    }
  }

  const resolved = resolvePerformanceReply({
    studentMessage: msg,
    session: sessionHint,
    modelReply,
    focus,
    history,
  });
  return resolved.reply;
}

function localFallback(
  studentMessage = '',
  contextPayload = null,
  history = [],
) {
  return resolveStudentAwareReply(
    studentMessage,
    contextPayload,
    history,
    '',
  );
}

/**
 * Stream mentor reply. Calls onToken as text arrives (real-time capture of AI response).
 * @param {object} opts
 * @param {(chunk: string, full: string) => void} [opts.onToken]
 * @param {(meta: object) => void} [opts.onMeta]
 */
export async function streamAvatarChat({
  contextPayload,
  studentMessage,
  quickPrompt,
  history = [],
  signal,
  onToken,
  onMeta,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  let full = '';

  try {
    const res = await fetch('/api/avatar-chat?stream=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        contextPayload,
        studentMessage,
        quickPrompt,
        history,
        stream: true,
        intervention_mode: contextPayload?.intervention_mode,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Fall back to non-stream endpoint
      return requestAvatarChatOnce({
        contextPayload,
        studentMessage,
        quickPrompt,
        history,
        signal: controller.signal,
      });
    }

    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('text/event-stream') && !ctype.includes('ndjson')) {
      const data = await res.json().catch(() => null);
      if (data?.reply) {
        const reply = resolveStudentAwareReply(
          studentMessage,
          contextPayload,
          history,
          data.reply,
        );
        onToken?.(reply, reply);
        onMeta?.(data);
        return {
          reply,
          provider: data.provider,
          model: data.model,
          fallback: Boolean(data.fallback),
          avatarMood: data.avatarMood || 'neutral',
          error: data.error || null,
        };
      }
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No stream body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let meta = {
      provider: 'unknown',
      model: null,
      fallback: false,
      avatarMood: 'neutral',
      error: null,
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() || '';

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        const payload = trimmed.startsWith('data:')
          ? trimmed.slice(5).trim()
          : trimmed;
        if (payload === '[DONE]') continue;
        let evt;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        if (evt.type === 'meta') {
          meta = { ...meta, ...evt };
          onMeta?.(meta);
        } else if (evt.type === 'token' && evt.text) {
          full += evt.text;
          onToken?.(evt.text, full);
        } else if (evt.type === 'done' && evt.reply) {
          full = evt.reply;
          onToken?.('', full);
          meta = { ...meta, ...evt };
        } else if (evt.type === 'error') {
          meta.error = evt.error || 'stream error';
        }
      }
    }

    if (!full.trim()) {
      full = localFallback(studentMessage, contextPayload, history);
      meta.fallback = true;
      meta.provider = meta.provider || 'fallback';
      onToken?.(full, full);
    } else {
      // Guard: never accept a re-opener that ignored the student’s answer
      full = resolveStudentAwareReply(
        studentMessage,
        contextPayload,
        history,
        full,
      );
    }

    const streamResult = {
      reply: sanitizeKidSpeech(full.trim()),
      provider: meta.provider,
      model: meta.model,
      fallback: Boolean(meta.fallback),
      avatarMood: meta.avatarMood || 'neutral',
      error: softProviderNote(meta.error) || meta.error || null,
    };
    logMentorExchange(
      { contextPayload, studentMessage, quickPrompt },
      streamResult,
    );
    return streamResult;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const reply = sanitizeKidSpeech(
        full.trim() ||
          localFallback(studentMessage, contextPayload, history),
      );
      return {
        reply,
        provider: full ? 'partial' : 'client-timeout',
        model: null,
        fallback: true,
        avatarMood: 'empathetic',
        error: softProviderNote(
          full
            ? 'Stream interrupted — showing what arrived.'
            : 'Request timed out. Using fast mentor mode.',
        ),
      };
    }
    const reply = localFallback(studentMessage, contextPayload, history);
    onToken?.(reply, reply);
    return {
      reply: sanitizeKidSpeech(reply),
      provider: 'client-error',
      model: null,
      fallback: true,
      avatarMood: 'empathetic',
      error: softProviderNote(
        err instanceof Error ? err.message : 'Avatar chat failed',
      ),
    };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}

/** Non-stream POST (backup) */
export async function requestAvatarChat(opts) {
  return streamAvatarChat(opts);
}

async function requestAvatarChatOnce({
  contextPayload,
  studentMessage,
  quickPrompt,
  history,
  signal,
}) {
  const res = await fetch('/api/avatar-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextPayload,
      studentMessage,
      quickPrompt,
      history,
      intervention_mode: contextPayload?.intervention_mode,
    }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Avatar chat failed (${res.status})`);
  }
  const onceResult = {
    reply: resolveStudentAwareReply(
      studentMessage,
      contextPayload,
      history,
      data?.reply || '',
    ),
    provider: data?.provider || 'unknown',
    model: data?.model || null,
    fallback: Boolean(data?.fallback),
    avatarMood: data?.avatarMood || 'neutral',
    error: softProviderNote(data?.error) || data?.error || null,
  };
  logMentorExchange(
    { contextPayload, studentMessage, quickPrompt },
    onceResult,
  );
  return onceResult;
}
