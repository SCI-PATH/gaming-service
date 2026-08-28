/**
 * Sage "why" = learn from the student's own idea.
 * Backend copy — keep in sync with frontend/src/avatar/explainMisconception.js
 *
 * Three beats, personalized by frustration / mind-map tone:
 *   1. Honour what they picked as a real-world idea (helium → balloons)
 *   2. Why the correct idea does THIS job (CO₂ for photosynthesis)
 *   3. Why their idea does not do that job
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

export function voiceBand(voice = {}) {
  const level = String(voice.frustrationLevel || voice.level || 'moderate').toLowerCase();
  const tone = String(voice.tone || 'practice').toLowerCase();
  const depth = String(voice.explainDepth || 'medium').toLowerCase();
  if (level === 'very_high' || depth === 'micro') return 'micro';
  if (level === 'high' || tone === 'support' || depth === 'simple') return 'simple';
  if (level === 'low' || tone === 'challenge' || depth === 'rich') return 'rich';
  return 'medium';
}

function bandClip(band) {
  if (band === 'micro') return 240;
  if (band === 'simple') return 320;
  if (band === 'rich') return 420;
  return 360;
}

export function hasCausalLanguage(text) {
  return /because|so that|which means|named for|prefix|is for\b|job of|does not (fit|answer|make|do|mean|produce)|mix-?up|would mean|in nature|happens when|works by|defined as|stands for|not the same|different job|asking about|the claim|seed leaf|cotyledon|process of|function of|male part|female part|makes pollen|take in|released as|transfer of pollen|balloons|react|raw material/i.test(
    String(text || ''),
  );
}

export function looksLikeGraderMeta(text) {
  return /placeholder|fills the blanks|the response fills|arbitrary symbols|categories the question asks|not a science word|typing [“"']n|blank [1-9]|pipe-separated/i.test(
    String(text || ''),
  );
}

export function looksLikeAnswerKeyRestatement(text, wrong = '', right = '') {
  const raw = String(text || '').trim();
  if (!raw) return true;
  if (looksLikeGraderMeta(raw)) return true;
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

function honorsStudentIdea(ai, wrong) {
  if (isPlaceholderBlank(wrong) || isNoPick(wrong) || isTrueFalseToken(wrong)) {
    return true;
  }
  const w = lower(wrong);
  const token = w.split(/[^a-z0-9]+/).find((t) => t.length >= 4) || w.slice(0, 8);
  if (!token || token.length < 3) return true;
  return lower(ai).includes(token);
}

function stemIntent(prompt) {
  const p = lower(prompt);
  if (/\bcalled\b|\bknown as\b|\bnamed\b|\bterm for\b/.test(p)) {
    return {
      asking: 'This question is checking a science name or definition.',
      because: 'the words match how scientists name that idea',
    };
  }
  if (/\bfunction\b|\bjob\b|\brole\b|used for|purpose of/.test(p)) {
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
      fact: 'Pollination is the transfer of pollen from anther toward a pistil so seeds can form.',
      rejectFalse: 'Evaporation or storing water is a different job.',
    };
  }
  if (/anther|stamen|pollen-maker|produces pollen/i.test(blob)) {
    return {
      fact: 'The anther (on the stamen) is the male part that makes pollen.',
      rejectFalse: 'Petals attract visitors; they do not produce pollen.',
    };
  }
  if (/fibrous root/i.test(blob) && /monocot/i.test(blob)) {
    return {
      fact: 'Monocots usually have fibrous roots — many thin roots of similar size, not one thick taproot.',
      rejectFalse: 'A taproot is the dicot pattern.',
    };
  }
  if (/taproot/i.test(blob) && /dicot/i.test(blob)) {
    return {
      fact: 'Dicots usually have a taproot — one main root with smaller side roots.',
      rejectFalse: 'Fibrous roots belong with most monocots.',
    };
  }
  return null;
}

const STUDENT_WORLD_IDEAS = [
  {
    test: /helium/,
    meetShort: 'Helium is the light gas that makes party balloons float.',
    meet: 'Helium is a very light gas. We fill party balloons with it so they float.',
    meetRich:
      'Helium is a light noble gas: it barely reacts with other chemicals, which is why balloons filled with it stay light and float.',
    mismatch:
      'Helium does not go into the leaf’s food-making reaction, so it cannot be the gas plants take in for photosynthesis.',
  },
  {
    test: /\boxygen\b|\bo2\b/,
    meetShort: 'Oxygen is the gas we breathe, and plants usually give it off in light.',
    meet: 'Oxygen is the gas animals breathe. Green plants usually release it during photosynthesis.',
    meetRich:
      'Oxygen is a product of photosynthesis: the leaf gives it off after using light to build sugar, which is why we often say plants “make oxygen”.',
    mismatch:
      'Oxygen is not the main gas the leaf takes in to build sugar — that intake gas is carbon dioxide.',
  },
  {
    test: /nitrogen|\bn2\b/,
    meetShort: 'Nitrogen makes up a lot of the air, and plants need it for proteins.',
    meet: 'Nitrogen is a big part of air. Plants need nitrogen for proteins, often from soil or fertilizer.',
    meetRich:
      'Nitrogen is about four-fifths of air and is a building block of proteins, usually entering plants from the soil rather than as a photosynthesis gas.',
    mismatch:
      'Nitrogen is not the gas the leaf takes in to make sugar during photosynthesis.',
  },
  {
    test: /hydrogen/,
    meetShort: 'Hydrogen is a very light gas; water is H₂O.',
    meet: 'Hydrogen is a light gas we meet in water (H₂O) and some fuels.',
    meetRich:
      'Hydrogen is the lightest element; in plants it arrives as part of water, not as a balloon-style gas the leaf “breathes in” to make food.',
    mismatch:
      'Leaves do not take in hydrogen gas the way they take in carbon dioxide for photosynthesis.',
  },
  {
    test: /petal/,
    meetShort: 'Petals are the colourful flower parts that attract visitors.',
    meet: 'Petals are the colourful parts of a flower. They often help attract bees and other visitors.',
    meetRich:
      'Petals advertise the flower to pollinators with colour and scent; that is a visitor-attraction job, not a pollen-making job.',
    mismatch: 'Petals do not make pollen — the anther on the stamen does that.',
  },
  {
    test: /evaporation/,
    meetShort: 'Evaporation is water turning into vapour, like puddles drying.',
    meet: 'Evaporation is when liquid water becomes vapour — puddles drying, or steam from a warm field.',
    meetRich:
      'Evaporation is a water-cycle change of state: liquid water gains energy and becomes gas. It moves water, not pollen.',
    mismatch: 'Evaporation does not transfer pollen, so it is not pollination.',
  },
  {
    test: /erosion/,
    meetShort: 'Erosion is soil or rock being worn away by wind or water.',
    meet: 'Erosion is when wind, water, or ice wear away soil or rock and carry it off.',
    meetRich:
      'Erosion reshapes land by moving particles. That is an Earth-surface job, not a flower-reproduction job.',
    mismatch: 'Erosion does not move pollen to make seeds.',
  },
  {
    test: /condensation/,
    meetShort: 'Condensation is vapour turning back into liquid, like dew.',
    meet: 'Condensation is when water vapour cools and becomes liquid — dew, clouds, a cold glass “sweating”.',
    meetRich:
      'Condensation is the water-cycle partner of evaporation: gas becomes liquid. It does not carry pollen.',
    mismatch: 'Condensation is not pollen transfer.',
  },
  {
    test: /fibrous/,
    meetShort: 'Fibrous roots are many thin roots of similar size.',
    meet: 'Fibrous roots look like a bunch of thin similar roots. They are typical of many monocots, like grasses.',
    meetRich:
      'A fibrous root system is a mat of similar thin roots, common in monocots. It is a different architecture from a single thick taproot.',
    mismatch: 'Fibrous roots are not the usual dicot / taproot pattern.',
  },
  {
    test: /taproot/,
    meetShort: 'A taproot is one thick main root with smaller side roots.',
    meet: 'A taproot is one main root with smaller branches — think carrot. Many dicots grow this way.',
    meetRich:
      'A taproot has one dominant axis with laterals. That is the typical dicot pattern, not the monocot fibrous bunch.',
    mismatch: 'A taproot is not the usual monocot root system.',
  },
];

function lookupStudentIdea(wrong) {
  const t = lower(wrong);
  if (!t) return null;
  return STUDENT_WORLD_IDEAS.find((row) => row.test.test(t)) || null;
}

function pickMeet(idea, band) {
  if (!idea) return '';
  if (band === 'micro' || band === 'simple') return idea.meetShort || idea.meet;
  if (band === 'rich') return idea.meetRich || idea.meet;
  return idea.meet || idea.meetShort;
}

function rightMechanism(attempt, band) {
  const right = norm(attempt.correctAnswer);
  const prompt = norm(attempt.prompt || attempt.question || '');
  const hint = norm(attempt.hint || '');
  const claim =
    unpackScienceClaim(prompt, attempt.topic) || unpackScienceClaim(right, attempt.topic);
  const blob = `${prompt} ${right} ${attempt.topic || ''}`;

  if (/carbon dioxide|co2/i.test(blob) && /photosynth|leaf|plant|gas/i.test(blob)) {
    if (band === 'micro' || band === 'simple') {
      return 'This question is about the gas a leaf uses to make food: carbon dioxide, with water and light.';
    }
    return 'This question is about photosynthesis: the leaf takes in carbon dioxide, plus water and light, to build sugar (food).';
  }
  if (claim?.fact) {
    if (band === 'micro') return clip(claim.fact, 120);
    return claim.fact;
  }
  if (hint) return hint;
  if (right) return `${right} is the idea that does this farm-science job.`;
  return stemIntent(prompt).asking;
}

function genericMeet(wrong, band) {
  const w = clip(wrong, 40);
  if (!w) return '';
  if (band === 'micro') return `${w} is a real idea — just for a different job.`;
  if (band === 'rich') {
    return `${w} is something real in science or everyday life; it has its own job.`;
  }
  return `${w} is a real idea in the world — it just does a different job than this question.`;
}

function composeThreeBeat({ meet, right, mismatch }, band) {
  const parts = [meet, right, mismatch].map((p) => norm(p)).filter(Boolean);
  return clip(parts.join(' '), bandClip(band));
}

export function explainWhyWrong(attempt = {}, voice = {}) {
  const band = voiceBand(voice);
  const wrong = norm(attempt.studentAnswer);
  const right = norm(attempt.correctAnswer);
  const prompt = norm(attempt.prompt || attempt.question || '');
  const idea = lookupStudentIdea(wrong);
  const rightText = rightMechanism(attempt, band);

  if (isPlaceholderBlank(wrong) || isNoPick(wrong)) {
    return clip(rightText, bandClip(band));
  }

  if (isTrueFalseToken(wrong) && isTrueFalseToken(right)) {
    const claim = unpackScienceClaim(prompt, attempt.topic);
    const meet = isAffirmative(wrong)
      ? 'True would mean this sentence is a real science fact.'
      : 'False would mean this science sentence is untrue.';
    const mismatch = isAffirmative(right)
      ? claim?.rejectFalse ||
        'The naming or process in the sentence really is how the science works, so False does not fit.'
      : 'The sentence does not match how the science works, so True does not fit.';
    return composeThreeBeat(
      { meet, right: claim?.fact || rightText, mismatch },
      band,
    );
  }

  const meet = pickMeet(idea, band) || genericMeet(wrong, band);
  const mismatch =
    idea?.mismatch ||
    `${clip(wrong, 40)} does not do that food-or-farm job here.`;

  return composeThreeBeat({ meet, right: rightText, mismatch }, band);
}

export function explainCorrectIdea(attempt = {}, voice = {}) {
  const band = voiceBand(voice);
  const right = norm(attempt.correctAnswer);
  const prompt = norm(attempt.prompt || attempt.question || '');
  const hint = norm(attempt.hint || '');
  const claim =
    unpackScienceClaim(prompt, attempt.topic) || unpackScienceClaim(right, attempt.topic);

  if (isTrueFalseToken(right)) {
    const fact = claim?.fact || hint;
    if (isAffirmative(right)) {
      return clip(
        fact ? `${fact} That is why the statement is true.` : rightMechanism(attempt, band),
        bandClip(band),
      );
    }
    return clip(
      fact
        ? `${fact} The given sentence does not match that, so it is false.`
        : rightMechanism(attempt, band),
      bandClip(band),
    );
  }

  if (claim?.fact) {
    const extra = hint && !claim.fact.includes(hint) ? ` ${hint}` : '';
    return clip(`${claim.fact}${extra}`, bandClip(band));
  }
  return clip(rightMechanism(attempt, band), bandClip(band));
}

export function preferConceptualText(aiText, localText, attempt = {}) {
  const ai = norm(aiText);
  const local = norm(localText);
  if (!ai) return local;
  const wrong = attempt.studentAnswer || attempt.student_answer || '';
  const right = attempt.correctAnswer || attempt.correct_answer || '';
  if (looksLikeAnswerKeyRestatement(ai, wrong, right)) return local || ai;
  if (!honorsStudentIdea(ai, wrong)) return local || ai;
  if (ai.length < 48 && !hasCausalLanguage(ai)) return local || ai;
  return ai;
}
