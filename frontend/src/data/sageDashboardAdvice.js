/**
 * Personalized Sage advice for the student learning dashboard.
 * Kid-friendly, specific to score + recent behavior + sticky topic.
 */
import { frustrationLevelFromScore } from './frustrationModel.js';

function firstName(raw) {
  const n = String(raw || '')
    .split(/[·|]/)[0]
    .trim()
    .split(/\s+/)[0];
  if (!n || n.length > 24) return 'friend';
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function topicLabel(topic) {
  const t = String(topic || '').trim();
  if (!t || /^this /i.test(t) || /^science$/i.test(t)) return null;
  return t;
}

/**
 * @param {{
 *   name?: string,
 *   score?: number,
 *   level?: string,
 *   consecutiveFails?: number,
 *   accuracyPct?: number | null,
 *   avgTimeSec?: number | null,
 *   hints?: number,
 *   retries?: number,
 *   stickyTopic?: string | null,
 *   streak?: number,
 * }} input
 */
export function buildSageDashboardAdvice(input = {}) {
  const name = firstName(input.name);
  const score = Math.max(0, Math.min(100, Math.round(Number(input.score) || 0)));
  const level = String(input.level || frustrationLevelFromScore(score)).toLowerCase();
  const topic = topicLabel(input.stickyTopic);
  const fails = Number(input.consecutiveFails) || 0;
  const accuracy = input.accuracyPct;
  const avgTime = Number(input.avgTimeSec);
  const hints = Number(input.hints) || 0;
  const retries = Number(input.retries) || 0;
  const streak = Number(input.streak) || 0;

  const band =
    level === 'very_high' || level === 'high'
      ? 'high'
      : level === 'moderate'
        ? 'moderate'
        : 'low';

  let headline = 'You are in a calm learning zone.';
  let body = '';
  let nextAction = 'Keep playing the farm and try one slightly trickier science question.';
  let mood = 'proud';

  if (band === 'low') {
    headline = `${name}, your frustration score is low — that means your brain is ready.`;
    const stretch = topic
      ? `You could try a tougher question on ${topic} to keep growing.`
      : 'You could try a slightly harder farm question to keep growing.';
    body =
      accuracy != null
        ? `You are answering about ${accuracy}% correctly. ${stretch}`
        : `The farm feels manageable right now. ${stretch}`;
    if (streak >= 2) {
      body += ` Nice ${streak}-day learning streak!`;
    }
    nextAction = topic
      ? `Challenge yourself: one extra ${topic} question, then keep farming.`
      : 'Challenge yourself with one extra science question, then keep farming.';
    mood = 'proud';
  } else if (band === 'moderate') {
    headline = `${name}, your frustration score is in the middle — a little stuck is normal.`;
    if (fails >= 2) {
      body = `A few misses in a row can make science feel heavier. Slow down, read the last sentence twice, then pick.`;
    } else if (hints >= 2) {
      body = `You have been using hints — that is smart, not “cheating.” Try one question with the hint first, then one without.`;
    } else if (Number.isFinite(avgTime) && avgTime >= 25) {
      body = `You are taking extra time, which often means careful thinking. Pause between questions so your brain can reset.`;
    } else {
      body = `This is a good moment to review, not to rush. A short break or a hint can bring the score back down.`;
    }
    if (topic) {
      body += ` ${topic} looks like the sticky topic right now.`;
    }
    nextAction = topic
      ? `Take a 1-minute break, then review ${topic} with Sage or a hint before the next farm question.`
      : 'Take a short break, then use a hint on the next farm question if it feels tricky.';
    mood = 'encouraging';
  } else {
    headline = `${name}, your frustration score is high — that is a signal to be kind to yourself, not to give up.`;
    body =
      `You do not need to rush. Breathe, skip the timer in your head, and go back to the idea in tiny steps.`;
    if (retries >= 2) {
      body += ` Extra retries mean the question was tough, not that you “can’t do science.”`;
    }
    if (topic) {
      body += ` Let’s revisit ${topic} before jumping into a new farm challenge.`;
    }
    nextAction = topic
      ? `Stop the current grind: review ${topic} with Sage, then return to the farm when you feel 10% calmer.`
      : 'Pause the farm for a moment, talk to Sage, then try one easier question first.';
    mood = 'empathetic';
  }

  const whyItMatters =
    'Frustration score is how Discovery Grove notices when learning starts to feel heavy. Sage uses it to slow down, explain, or cheer you on — so the farm stays fair.';

  return {
    name,
    score,
    band,
    level,
    headline,
    body,
    nextAction,
    whyItMatters,
    spoken: `${headline} ${body} Next: ${nextAction}`,
    mood,
    topic,
  };
}
