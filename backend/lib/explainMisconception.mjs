/**
 * Contrastive elaborative feedback for Sage mind-map "why".
 * Backend copy — keep in sync with frontend/src/avatar/explainMisconception.js
 *
 * Knowledge-of-correct-response ("you picked X, the answer is Y") does not
 * repair a misconception. These helpers produce:
 *   why_wrong  — why the student's model fails this scientific job
 *   key_explain — causal / definitional account of why the correct idea is true
 */

function clip(text, n = 220) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1).trim()}…` : s;
}

function norm(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lower(text) {
  return norm(text).toLowerCase();
}

function isTrueFalseToken(text) {
  return /^(true|false|t|f|yes|no)$/i.test(norm(text));
}

function isAffirmative(text) {
  return /^(true|t|yes)$/i.test(norm(text));
}

function isNoPick(text) {
  const s = lower(text);
  if (!s) return true;
  return (
    s.startsWith('(') ||
    /ran out of time|no pick|no selection|timed out/.test(s) ||
    /^(id|guid|uuid)$/i.test(s)
  );
}

function isPlaceholderBlank(text) {
  return /^\s*n(\s*\|\s*n)*\s*$/i.test(norm(text)) || /^n+$/i.test(norm(text));
}

export function hasCausalLanguage(text) {
  return /because|so that|which means|named for|prefix|is for\b|job of|does not (fit|answer|make|do|mean|produce)|mix-?up|would mean|in nature|happens when|works by|defined as|stands for|not the same|different job|asking about|the claim|seed leaf|cotyledon|process of|function of|male part|female part|makes pollen|take in|released as|transfer of pollen/i.test(
    String(text || ''),
  );
}

export function looksLikeAnswerKeyRestatement(text, wrong = '', right = '') {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (
    /you (picked|chose|selected|answered)/i.test(raw) &&
    /but (the )?(better|correct|right) (idea|answer|one)/i.test(raw)
  ) {
    return true;
  }
  if (/on [“"'`].{6,}, you picked/i.test(raw)) return true;
  if (/you selected .{1,48} but the (answer|better idea) is/i.test(raw)) {
    return true;
  }
  if (/^correct for [“"'`]/i.test(raw) && /:\s*.+/.test(raw)) return true;
  if (/^for [“"'`].{6,}, the better idea is/i.test(raw)) return true;

  const t = lower(raw);
  const w = lower(wrong);
  const r = lower(right);
  const mentionsBoth =
    w.length >= 3 &&
    r.length >= 3 &&
    t.includes(w.slice(0, Math.min(24, w.length))) &&
    t.includes(r.slice(0, Math.min(24, r.length)));
  if (mentionsBoth && !hasCausalLanguage(raw) && raw.length < 200) return true;
  return false;
}

function stemIntent(prompt) {
  const p = lower(prompt);
  if (/\bcalled\b|\bknown as\b|\bnamed\b|\bterm for\b/.test(p)) {
    return {
      asking: 'This question is checking a science name or definition.',
      because: 'the words match how scientists name that idea',
    };
  }
  if (/\bfunction\b|\bjob\b|\brole\b|used for|purpose of|what does .+ do/.test(p)) {
    return {
      asking: 'This question is asking what that part or process is for.',
      because: 'that is the job it does in the living system',
    };
  }
  if (/\bhow do\b|\bhow does\b|\bprocess\b/.test(p)) {
    return {
      asking: 'This question is asking how the process works.',
      because: 'that is the step that actually makes the change happen',
    };
  }
  if (/\bwhy\b/.test(p)) {
    return {
      asking: 'This question is asking for a cause.',
      because: 'that cause produces the effect in the question',
    };
  }
  if (/\bwhich\b|\bwhat\b/.test(p)) {
    return {
      asking: 'This question is asking you to identify the matching science idea.',
      because: 'it matches the clues in the stem',
    };
  }
  return {
    asking: 'Check what science job the sentence is really testing.',
    because: 'it matches the science idea the sentence is testing',
  };
}

export function unpackScienceClaim(prompt, topic = '') {
  const blob = `${prompt} ${topic}`;
  if (/dicotyledon|dicot|\btwo seed|\btwo cotyledon|seed lobes?/i.test(blob)) {
    return {
      fact: '“Dicotyledonous” (dicot) plants are named for two seed leaves. The prefix “di-” means two, and cotyledons are those seed leaves (seed lobes).',
      rejectFalse:
        'Choosing False would mean that naming rule is wrong — but two seed lobes is exactly how dicots are defined.',
    };
  }
  if (/monocot|\bone seed leaf|\bone cotyledon/i.test(blob)) {
    return {
      fact: 'Monocots have one cotyledon (seed leaf). The prefix “mono-” means one.',
      rejectFalse:
        'Choosing False would deny that naming rule — one seed leaf is how monocots are defined.',
    };
  }
  if (/fibrous root/i.test(blob) && /monocot/i.test(blob)) {
    return {
      fact: 'Monocots usually have fibrous roots — many thin roots of similar size, not one thick taproot.',
      rejectFalse: 'A taproot is the dicot pattern, so swapping the two groups is the mix-up.',
    };
  }
  if (/taproot/i.test(blob) && /dicot/i.test(blob)) {
    return {
      fact: 'Dicots usually have a taproot — one main root with smaller side roots.',
      rejectFalse: 'Fibrous roots belong with most monocots, not dicots.',
    };
  }
  if (/photosynth|chlorophyll/i.test(blob) && /carbon dioxide|co2|oxygen/i.test(blob)) {
    return {
      fact: 'Photosynthesis builds sugar from carbon dioxide, water, and light. Oxygen is released as a leftover, not the main gas the leaf takes in.',
      rejectFalse: 'Mixing up oxygen-in vs carbon-dioxide-in is a common photosynthesis mix-up.',
    };
  }
  if (/photosynth/i.test(blob)) {
    return {
      fact: 'Photosynthesis is how green plants make food: light energy powers a reaction that turns carbon dioxide and water into sugar.',
      rejectFalse: 'That is a real plant process, not a trick wording.',
    };
  }
  if (/pollinat|pollen transfer/i.test(blob)) {
    return {
      fact: 'Pollination is the transfer of pollen from anther toward a pistil so seeds can form. It is not evaporation, erosion, or storing water in leaves.',
      rejectFalse: 'Those other words name different Earth or plant jobs.',
    };
  }
  if (/anther|stamen|pollen-maker|produces pollen/i.test(blob)) {
    return {
      fact: 'The anther (on the stamen) is the male part that makes pollen. Petals, leaves, and roots have other jobs.',
      rejectFalse: 'Attracting insects or making food is not the same as producing pollen.',
    };
  }
  if (/pistil|stigma|ovary/i.test(blob)) {
    return {
      fact: 'The pistil is the female flower part that can receive pollen and later form seeds or fruit.',
      rejectFalse: 'The pollen-maker is the anther, not the pistil.',
    };
  }
  if (/physical change/i.test(blob) && /chemical change/i.test(blob)) {
    return {
      fact: 'A physical change rearranges form (melt, freeze, crush) without making a new substance. A chemical change makes new substances (burn, rust, cook).',
      rejectFalse: 'The mix-up is treating a form change as if new matter were created, or the reverse.',
    };
  }
  if (/chlorophyll/i.test(blob)) {
    return {
      fact: 'Chlorophyll is the green pigment that captures light energy for photosynthesis.',
      rejectFalse: 'It is not a root, a seed, or a leftover gas.',
    };
  }
  if (/stomata|stoma/i.test(blob)) {
    return {
      fact: 'Stomata are tiny leaf pores that let gases in and out, including carbon dioxide for photosynthesis.',
      rejectFalse: 'They are openings, not the food the plant stores.',
    };
  }
  if (/xylem/i.test(blob)) {
    return {
      fact: 'Xylem is the plant “water highway” that moves water and minerals up from the roots.',
      rejectFalse: 'Food sugars usually travel in phloem, a different tissue.',
    };
  }
  if (/phloem/i.test(blob)) {
    return {
      fact: 'Phloem moves sugars made in the leaves to growing or storing parts of the plant.',
      rejectFalse: 'Water from the soil travels mainly in xylem, not phloem.',
    };
  }
  return null;
}

function contrastFromOptions(wrong, right, prompt) {
  const w = lower(wrong);
  const r = `${lower(right)} ${lower(prompt)}`;
  if (/petal|leaf tip|leaf vein/.test(w) && /pollen|anther|stamen/.test(r)) {
    return `${wrong} is a plant part, but it is not the pollen-maker. Petals attract visitors; pollen is produced on the anther (stamen).`;
  }
  if (/oxygen|nitrogen|helium/.test(w) && /carbon dioxide|co2|photosynth/.test(r)) {
    return `Leaves take in carbon dioxide to build sugar. ${wrong} is a different gas — oxygen is what photosynthesis usually releases, not the main gas taken in.`;
  }
  if (/evaporation|erosion|condensation/.test(w) && /pollen|pollinat/.test(r)) {
    return `${wrong} is an Earth/water process. Pollination is moving pollen so seeds can form — a different job.`;
  }
  if (/making metal|rocks|soil disappear|thunder/.test(w)) {
    return `${wrong} is not a job this farm-science idea does. Match the option to the living process in the question.`;
  }
  if (/fibrous/.test(w) && /taproot|dicot/.test(r)) {
    return `Fibrous roots are many thin similar roots (typical of monocots). A taproot is one thick main root (typical of dicots). Those two patterns belong to different plant groups.`;
  }
  if (/taproot/.test(w) && /fibrous|monocot/.test(r)) {
    return `A taproot is one main root with side branches (typical of dicots). Monocots usually have a fibrous bunch of thin roots instead.`;
  }
  return null;
}

function explainTrueFalse(attempt, right) {
  const prompt = norm(attempt.prompt || attempt.question || '');
  const intent = stemIntent(prompt);
  const claim = unpackScienceClaim(prompt, attempt.topic);
  const hint = norm(attempt.hint || '');
  const fact = claim?.fact || hint || clip(prompt, 160);

  if (isAffirmative(right)) {
    return `${intent.asking} ${fact} ${claim?.rejectFalse || 'Choosing False would reject a real science definition, not catch a trick.'}`.trim();
  }
  return `${intent.asking} The sentence is not accurate science. ${claim?.fact || hint || 'The wording does not match how the process actually works.'} Choosing True would treat an inaccurate claim as fact.`.trim();
}

export function explainWhyWrong(attempt = {}) {
  const wrong = norm(attempt.studentAnswer);
  const right = norm(attempt.correctAnswer);
  const prompt = norm(attempt.prompt || attempt.question || '');
  const hint = norm(attempt.hint || '');
  const intent = stemIntent(prompt);
  const claim = unpackScienceClaim(prompt, attempt.topic);

  if (isTrueFalseToken(wrong) && isTrueFalseToken(right)) {
    return clip(explainTrueFalse(attempt, right), 320);
  }

  if (isPlaceholderBlank(wrong)) {
    const fact = claim?.fact || hint;
    return clip(
      fact
        ? `Typing “N” is a placeholder, not a science word. ${intent.asking} ${fact}`
        : `Typing “N” does not name the structure or process. ${intent.asking} Use the real science words the sentence is asking for.`,
      320,
    );
  }

  if (isNoPick(wrong)) {
    const fact = claim?.fact || hint;
    return clip(
      fact
        ? `${intent.asking} ${fact}`
        : `${intent.asking} Name the idea that ${intent.because}.`,
      320,
    );
  }

  if (right && lower(wrong) === lower(right)) {
    return clip(
      `That choice already matches the science idea. ${claim?.fact || hint || 'Say it in your own words so it sticks.'}`,
      280,
    );
  }

  const fromOptions = contrastFromOptions(wrong, right, prompt);
  if (fromOptions) return clip(fromOptions, 320);

  if (claim?.fact) {
    return clip(
      `That choice answers a different science job. ${intent.asking} ${claim.fact}`,
      320,
    );
  }

  if (hint) {
    return clip(
      `${intent.asking} ${hint} “${clip(wrong, 48)}” does not do that job.`,
      300,
    );
  }

  return clip(
    `${intent.asking} “${clip(wrong, 48)}” belongs to a different job than this stem. Look for the idea that ${intent.because}.`,
    280,
  );
}

export function explainCorrectIdea(attempt = {}) {
  const right = norm(attempt.correctAnswer);
  const prompt = norm(attempt.prompt || attempt.question || '');
  const hint = norm(attempt.hint || '');
  const intent = stemIntent(prompt);
  const claim =
    unpackScienceClaim(prompt, attempt.topic) ||
    unpackScienceClaim(right, attempt.topic);

  if (isTrueFalseToken(right)) {
    const fact = claim?.fact || hint;
    if (isAffirmative(right)) {
      return clip(
        fact
          ? `${fact} That is why the statement is true.`
          : `The sentence matches a real scientific definition, so it is true.`,
        320,
      );
    }
    return clip(
      fact
        ? `${fact} The given sentence does not match that, so it is false.`
        : `The sentence does not match how the science actually works, so it is false.`,
      320,
    );
  }

  if (claim?.fact) {
    const extra = hint && !claim.fact.includes(hint) ? ` ${hint}` : '';
    return clip(`${claim.fact}${extra}`, 320);
  }

  if (hint) {
    return clip(right ? `${hint} Hold this idea: ${right}.` : hint, 300);
  }

  if (right) {
    return clip(
      `${right} fits because ${intent.because}. ${intent.asking}`,
      280,
    );
  }

  if (prompt) {
    return clip(
      `${intent.asking} Re-read the stem and name the process or structure it is really about.`,
      240,
    );
  }
  return 'Re-read the key idea and say why it works in nature, not only what the label is.';
}

export function preferConceptualText(aiText, localText, attempt = {}) {
  const ai = norm(aiText);
  const local = norm(localText);
  if (!ai) return local;
  if (
    looksLikeAnswerKeyRestatement(
      ai,
      attempt.studentAnswer || attempt.student_answer,
      attempt.correctAnswer || attempt.correct_answer,
    )
  ) {
    return local || ai;
  }
  if (ai.length < 48 && !hasCausalLanguage(ai)) return local || ai;
  return ai;
}
