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
  if (/transpir/i.test(blob)) {
    return {
      fact: 'Transpiration is water leaving the plant through leaves into the air — like a plant version of sweating.',
      rejectFalse: 'Precipitation is water falling from clouds, not leaving the leaf.',
    };
  }
  if (/starch|carbohydrate/i.test(blob)) {
    return {
      fact: 'Corn and many crops store energy as carbohydrates (starch). That starch is food energy when we eat it.',
      rejectFalse: 'Salt or vitamins are not the main energy store in corn kernels.',
    };
  }
  if (/root/i.test(blob) && /water|underground/i.test(blob)) {
    return {
      fact: 'Roots usually grow underground and take in water and minerals from the soil.',
      rejectFalse: 'Petals and anthers are flower parts, not the water-takers in the soil.',
    };
  }
  if (/gravity/i.test(blob)) {
    return {
      fact: 'Gravity is the force that pulls objects toward Earth — it is why arrows and rain fall down.',
      rejectFalse: 'Magnetism and sound do not pull everything toward the ground.',
    };
  }
  if (/habitat/i.test(blob)) {
    return {
      fact: 'A habitat is the natural place where a plant or animal lives.',
      rejectFalse: 'A molecule or fossil is not a home.',
    };
  }
  if (/respirat/i.test(blob) && /photosynth/i.test(blob)) {
    return {
      fact: 'Photosynthesis makes food using light. Respiration releases energy from food. They are different jobs.',
      rejectFalse: 'Calling food-making “respiration” mixes up two processes.',
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
  {
    test: /respirat/,
    meetShort: 'Respiration is how living things release energy from food.',
    meet: 'Respiration is the process that releases energy from food inside living cells.',
    meetRich:
      'Respiration breaks down food to release usable energy. It is not the same as making new food with light.',
    mismatch: 'Respiration does not make plant food from sunlight — that job is photosynthesis.',
  },
  {
    test: /ferment/,
    meetShort: 'Fermentation is a way some cells get energy without much oxygen.',
    meet: 'Fermentation is an energy process used by some microbes (and in making yogurt or bread).',
    meetRich:
      'Fermentation releases energy without using oxygen the way respiration does. It is not how green leaves make sugar from light.',
    mismatch: 'Fermentation is not how plants make food in sunlight.',
  },
  {
    test: /digest/,
    meetShort: 'Digestion is breaking food into smaller bits an animal can use.',
    meet: 'Digestion happens in animals: food is broken down so the body can use it.',
    meetRich:
      'Digestion is an animal process for breaking food. Green plants make food; they do not digest a meal the way we do.',
    mismatch: 'Digestion is not the leaf’s food-making process.',
  },
  {
    test: /habitat/,
    meetShort: 'A habitat is the natural home of a plant or animal.',
    meet: 'A habitat is the place where an organism lives — forest, pond, soil.',
    meetRich:
      'Habitat means the living place with the food, water, and shelter that species need.',
    mismatch: 'Habitat is a home, not a molecule, planet, or fossil.',
  },
  {
    test: /molecule/,
    meetShort: 'A molecule is a tiny group of atoms bonded together.',
    meet: 'A molecule is a very small particle made of atoms joined together, like CO₂ or water.',
    meetRich:
      'Molecules are the tiny building pieces of substances. They are not a place an animal lives.',
    mismatch: 'A molecule is not a habitat.',
  },
  {
    test: /\bplanet\b/,
    meetShort: 'A planet is a large world in space, like Earth.',
    meet: 'A planet is a large body in space that orbits a star.',
    meetRich: 'Planets are worlds in space. That is astronomy, not the home of a forest animal.',
    mismatch: 'A planet is not the word for an organism’s living place.',
  },
  {
    test: /fossil/,
    meetShort: 'A fossil is a trace of ancient life in rock.',
    meet: 'Fossils are remains or traces of living things from long ago, often in rock.',
    meetRich: 'Fossils record past life. They are not the living home of today’s moles or trees.',
    mismatch: 'A fossil is not a habitat.',
  },
  {
    test: /magnet/,
    meetShort: 'Magnetism is the push or pull between magnets and some metals.',
    meet: 'Magnetism pulls some metals toward a magnet. It is not the force that makes everything fall.',
    meetRich:
      'Magnetic force acts on certain materials. Gravity, not magnetism, pulls arrows and rain toward Earth.',
    mismatch: 'Magnetism is not the force that pulls everything toward the ground.',
  },
  {
    test: /gravity/,
    meetShort: 'Gravity pulls objects toward Earth.',
    meet: 'Gravity is the force that pulls things down toward Earth.',
    meetRich: 'Gravity acts on every mass near Earth, which is why thrown things eventually fall.',
    mismatch: 'If the question is not about falling, gravity is the wrong job.',
  },
  {
    test: /friction/,
    meetShort: 'Friction is the rub between surfaces that can slow things down.',
    meet: 'Friction resists sliding when two surfaces rub. It can slow a cart or an arrow, but it is not gravity.',
    meetRich:
      'Friction is a contact force. Gravity still pulls even when surfaces are not rubbing.',
    mismatch: 'Friction is not the main force that pulls an arrow to the ground.',
  },
  {
    test: /\bsound\b/,
    meetShort: 'Sound is vibration travelling through air (or water) that we hear.',
    meet: 'Sound is a wave we hear. It does not pull objects to the ground.',
    meetRich: 'Sound is energy as vibration. It is not a downward pull like gravity.',
    mismatch: 'Sound does not make arrows fall.',
  },
  {
    test: /root hair/,
    meetShort: 'Root hairs are tiny root extensions that help take in water.',
    meet: 'Root hairs are tiny outgrowths on roots that increase water and mineral uptake.',
    meetRich:
      'Root hairs help absorption in soil. They are not the flower part that makes pollen.',
    mismatch: 'Root hairs do not produce pollen.',
  },
  {
    test: /leaf vein/,
    meetShort: 'Leaf veins carry water and food through the leaf.',
    meet: 'Leaf veins are the leaf’s transport lines for water and sugars.',
    meetRich:
      'Veins support the leaf and move materials. Making pollen happens in the flower, not in a vein.',
    mismatch: 'Leaf veins do not produce pollen.',
  },
  {
    test: /transpiration/,
    meetShort: 'Transpiration is water leaving the plant through leaves.',
    meet: 'Transpiration is water vapour leaving leaves into the air — a bit like plant sweating.',
    meetRich:
      'Transpiration moves water out through stomata. Precipitation is the opposite direction: water falling from clouds.',
    mismatch: 'Transpiration is not rain falling from the sky.',
  },
  {
    test: /precipitation/,
    meetShort: 'Precipitation is water falling from clouds as rain, snow, or hail.',
    meet: 'Precipitation is rain, snow, or hail falling from clouds.',
    meetRich:
      'Precipitation is the water-cycle step where water returns from sky to ground. It is not water leaving a leaf.',
    mismatch: 'Precipitation is not water moving out of leaves.',
  },
  {
    test: /freezing/,
    meetShort: 'Freezing is liquid turning into ice when it gets cold enough.',
    meet: 'Freezing is a change of state from liquid to solid.',
    meetRich: 'Freezing is a physical change of water. It is not how leaves lose water into the air.',
    mismatch: 'Freezing is not transpiration.',
  },
  {
    test: /combustion|\bburn/,
    meetShort: 'Combustion is burning — a chemical change that needs fuel and oxygen.',
    meet: 'Combustion means burning. It is a chemical change, not water leaving a leaf.',
    meetRich:
      'Combustion releases energy by burning. That is not the quiet water-loss process in leaves.',
    mismatch: 'Burning is not transpiration.',
  },
  {
    test: /starch|carbohydrate/,
    meetShort: 'Carbohydrates (starch) are the main energy-store nutrient in foods like corn.',
    meet: 'Starch is a carbohydrate — a store of food energy in corn and many plants.',
    meetRich:
      'Plants pack extra sugar into starch. People then use that starch as food energy.',
    mismatch: 'If the question asked for another nutrient, starch is the wrong label.',
  },
  {
    test: /protein only|\bprotein\b/,
    meetShort: 'Protein helps build body tissues; it is not corn’s main energy store.',
    meet: 'Protein is a building nutrient for bodies. Corn stores most of its energy as starch, not protein.',
    meetRich:
      'Proteins are made of amino acids and build structures. Energy in corn kernels is stored mainly as carbohydrate.',
    mismatch: 'Protein is not the main energy store in corn.',
  },
  {
    test: /vitamin/,
    meetShort: 'Vitamins are helper nutrients needed in small amounts.',
    meet: 'Vitamins help body processes but are not the main energy store in corn.',
    meetRich: 'Vitamins support health in tiny amounts. They are not the bulk energy in a kernel.',
    mismatch: 'Vitamins are not corn’s main stored energy.',
  },
  {
    test: /\bsalt\b/,
    meetShort: 'Salt is a mineral flavouring, not a plant energy-store nutrient.',
    meet: 'Table salt is a mineral. It is not how corn stores energy.',
    meetRich: 'Salt is sodium chloride, not a carbohydrate energy reserve.',
    mismatch: 'Salt is not the energy nutrient stored in corn.',
  },
  {
    test: /making metal|metal ore|\bmetal\b/,
    meetShort: 'Metal comes from rocks and industry, not from this plant process.',
    meet: 'Metals are materials from ores and factories. Plants do not make metal as their main job here.',
    meetRich: 'Metallurgy is not photosynthesis, pollination, or storing harvests.',
    mismatch: 'Making metal is not the farm-science job in this question.',
  },
  {
    test: /thunder|thundercloud/,
    meetShort: 'Thunder is sound from a storm, not a plant or harvest job.',
    meet: 'Thunder is the sound of lightning. It is not how farmers store crops or how plants make food.',
    meetRich: 'Weather sounds are not a plant function or a farm storage reason.',
    mismatch: 'Thunder is not the idea this farm question is testing.',
  },
  {
    test: /cart wheels/,
    meetShort: 'Cart wheels help move the harvest; they do not catch sunlight.',
    meet: 'Cart wheels are for moving loads. Leaves, not wheels, capture sunlight for food-making.',
    meetRich: 'Wheels are tools. Chlorophyll lives in leaves, which is where most photosynthesis happens.',
    mismatch: 'Cart wheels do not capture sunlight for photosynthesis.',
  },
  {
    test: /soil stones?/,
    meetShort: 'Stones in soil are rock bits, not the green sunlight-catchers.',
    meet: 'Soil stones are minerals. They do not do the leaf’s sunlight job.',
    meetRich: 'Rocks do not hold chlorophyll. Leaves do.',
    mismatch: 'Soil stones do not capture sunlight for food-making.',
  },
  {
    test: /\borbit\b/,
    meetShort: 'Orbit is the path a planet or moon takes in space.',
    meet: 'Orbit is an astronomy path in space, not a plant food-making process.',
    meetRich: 'Orbital motion is physics of space. Photosynthesis is chemistry in leaves.',
    mismatch: 'Orbit is not photosynthesis.',
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

/** Job this question is testing — taken from the stem, not invented. */
export function questionJob(attempt = {}) {
  const prompt = norm(attempt.prompt || attempt.question || '');
  const right = norm(attempt.correctAnswer);
  const hint = norm(attempt.hint || '');
  const p = lower(prompt);
  const claim = unpackScienceClaim(prompt, attempt.topic) || unpackScienceClaim(right, attempt.topic);

  if (
    /(produces|produce|makes|making) pollen|which part of the flower/.test(p) &&
    !/moving pollen|transfer of pollen/.test(p)
  ) {
    return {
      verbPhrase: 'produce pollen',
      examRemember:
        'the flower part that MAKES pollen is the anther (stamen), not the petal',
      rightHow: 'The anther on the stamen is the male part that produces pollen.',
    };
  }
  if (/gas/.test(p) && /photosynth|take in/.test(p)) {
    return {
      verbPhrase: 'get taken in by the leaf to make food',
      examRemember:
        'the gas plants TAKE IN for photosynthesis is carbon dioxide — not oxygen, not helium',
      rightHow:
        'The leaf takes in carbon dioxide, plus water and light, to build sugar. Oxygen is given off.',
    };
  }
  if (/photosynth/.test(p) && !/gas/.test(p)) {
    return {
      verbPhrase: 'name the process that makes plant food with light',
      examRemember:
        'the process that makes plant food with light is photosynthesis',
      rightHow:
        'Photosynthesis is how green plants make food from light, water, and carbon dioxide.',
    };
  }
  if (/pollen from one flower|bees moving pollen|pollinat/.test(p)) {
    return {
      verbPhrase: 'move pollen so seeds can form',
      examRemember:
        'bees moving pollen is pollination — not evaporation, erosion, or condensation',
      rightHow: 'Pollination is moving pollen from anther toward a pistil so seeds can form.',
    };
  }
  if (/need water for|mainly need water/.test(p)) {
    return {
      verbPhrase: 'say what plants use water for',
      examRemember:
        'plants need water for photosynthesis and to move nutrients',
      rightHow: 'Water helps make food and move minerals through the plant.',
    };
  }
  if (/load harvested|cart or barn/.test(p)) {
    return {
      verbPhrase: 'say why harvests are loaded and stored',
      examRemember: 'farmers load crops to store and move the harvest safely',
      rightHow: 'Harvests are moved and stored so they can be sold or used later.',
    };
  }
  if (/underground|takes in water/.test(p) && /part/.test(p)) {
    return {
      verbPhrase: 'name the part that takes in water from soil',
      examRemember: 'roots grow underground and take in water and minerals',
      rightHow: 'Roots, not petals or anthers, take in water from the soil.',
    };
  }
  if (/stores energy|nutrient/.test(p) && /corn/.test(p)) {
    return {
      verbPhrase: 'name the main energy-store nutrient',
      examRemember:
        'corn stores energy mainly as carbohydrates (starch), not protein, vitamins, or salt',
      rightHow: 'Starch is the carbohydrate energy store in corn kernels.',
    };
  }
  if (/water moving from plant leaves|transpiration|into the air/.test(p)) {
    return {
      verbPhrase: 'name water leaving leaves into the air',
      examRemember:
        'water leaving leaves into the air is transpiration, not precipitation or freezing',
      rightHow: 'Transpiration is water vapour leaving the leaf — like plant sweating.',
    };
  }
  if (/captures most sunlight|food-making/.test(p)) {
    return {
      verbPhrase: 'name the part that captures sunlight for food-making',
      examRemember: 'leaves capture most sunlight for photosynthesis, not roots or cart wheels',
      rightHow: 'Leaves hold chlorophyll, so they catch the light for food-making.',
    };
  }
  if (claim?.fact) {
    return {
      verbPhrase: 'match the science idea in the sentence',
      examRemember: clip(claim.fact.replace(/^“/, '').replace(/^\w/, (c) => c.toLowerCase()), 160),
      rightHow: claim.fact,
    };
  }
  if (right) {
    return {
      verbPhrase: `match “${clip(right, 48)}”`,
      examRemember: `the scoring idea is ${right}`,
      rightHow: hint
        ? `${right}. ${hint}`
        : `This question is asking for ${right}.`,
    };
  }
  return {
    verbPhrase: 'answer this farm question',
    examRemember: 'name the process or part the stem is really asking for',
    rightHow: stemIntent(prompt).asking,
  };
}

export function isUsableStudentIdea(sentence, attempt = {}) {
  const s = norm(sentence);
  const wrong = attempt.studentAnswer || attempt.student_answer || '';
  const right = attempt.correctAnswer || attempt.correct_answer || '';
  if (!s || s.length < 12 || s.length > 220) return false;
  if (looksLikeGraderMeta(s)) return false;
  if (looksLikeAnswerKeyRestatement(s, wrong, right)) return false;
  if (!honorsStudentIdea(s, wrong)) return false;
  const r = lower(right);
  if (r.length >= 6 && lower(s).includes(r) && !lower(wrong).includes(r)) return false;
  if (/as an ai|i think|maybe|might be|possibly|not sure|in some cases plants use/i.test(s)) {
    return false;
  }
  if (/helium/.test(lower(wrong)) && /photosynth|make food|take in helium/.test(lower(s)) && !/not|cannot|does not/.test(lower(s))) {
    return false;
  }
  return true;
}

function examLock(attempt) {
  const job = questionJob(attempt);
  if (job.examRemember) return job.examRemember;
  const right = norm(attempt.correctAnswer);
  if (right && !isTrueFalseToken(right)) return `the scoring idea is ${right}`;
  return job.rightHow || 'name the process or part the stem is really asking for';
}

function rightMechanism(attempt, band) {
  const lock = examLock(attempt);
  const job = questionJob(attempt);
  const text = job.rightHow && job.rightHow !== lock ? `${lock}. ${job.rightHow}` : lock;
  if (band === 'micro') return clip(`You know that ${lock}.`, 200);
  return `You know that ${lock}.`;
}

function trapLine(wrong, attempt, idea) {
  if (idea?.mismatch) return idea.mismatch;
  const job = questionJob(attempt);
  return `“${clip(wrong, 40)}” will not score — it does not ${job.verbPhrase}.`;
}

function composeExamCoach(attempt, voice) {
  const band = voiceBand(voice);
  const wrong = norm(attempt.studentAnswer);
  const right = norm(attempt.correctAnswer);
  const prompt = norm(attempt.prompt || attempt.question || '');
  const idea = lookupStudentIdea(wrong);
  const extraMeet = norm(attempt.extraMeet || '');
  const lock = examLock(attempt);
  const know = `You know that ${lock}.`;

  if (isPlaceholderBlank(wrong) || isNoPick(wrong)) {
    return clip(`${know} Hold that line for the exam.`, bandClip(band));
  }

  if (isTrueFalseToken(wrong) && isTrueFalseToken(right)) {
    const claim = unpackScienceClaim(prompt, attempt.topic);
    const fact = claim?.fact || lock;
    const knowTf = isAffirmative(right)
      ? `You know that this sentence is true. ${fact}`
      : `You know that this sentence is false. ${fact}`;
    const trap = isAffirmative(wrong)
      ? 'True only scores if the science in the sentence is actually right.'
      : claim?.rejectFalse || 'False would throw away a real definition — that loses the mark.';
    return clip(`${knowTf} ${trap}`, bandClip(band));
  }

  const identity = pickMeet(idea, band) || extraMeet;
  const trap = trapLine(wrong, attempt, idea);
  if (band === 'micro') {
    return clip(`${know} You chose ${clip(wrong, 36)}. ${trap}`, 240);
  }
  if (band === 'simple') {
    return clip(`${know} You chose ${clip(wrong, 40)}. ${trap}`, 300);
  }
  const colour = identity ? `${identity}` : '';
  return clip(
    `${know} You chose ${clip(wrong, 48)}. ${colour} ${trap}`.replace(/\s+/g, ' '),
    bandClip(band),
  );
}

export function explainWhyWrong(attempt = {}, voice = {}) {
  return composeExamCoach(attempt, voice);
}

export function explainCorrectIdea(attempt = {}, voice = {}) {
  const band = voiceBand(voice);
  const lock = examLock(attempt);
  const line = `Write this: ${lock.replace(/^the /, 'The ')}.`;
  return clip(line, band === 'micro' ? 180 : 280);
}

/**
 * Never paste a free-form model essay as the lesson.
 * Optionally keep ONE validated everyday sentence about the student's word, then compose locally.
 */
export function composeWhyWithOptionalAiMeet(attempt, voice, ai = {}) {
  const fromField = norm(ai.studentIdea || ai.student_idea_in_the_world || '');
  const fromWhy = norm(String(ai.whyWrong || ai.why_wrong || '').split(/(?<=[.!?])\s+/)[0] || '');
  let extraMeet = '';
  if (isUsableStudentIdea(fromField, attempt)) extraMeet = fromField;
  else if (isUsableStudentIdea(fromWhy, attempt)) extraMeet = fromWhy;
  return explainWhyWrong({ ...attempt, extraMeet }, voice);
}

export function preferConceptualText(aiText, localText, attempt = {}, voice = {}) {
  return composeWhyWithOptionalAiMeet(attempt, voice, { whyWrong: aiText }) || localText;
}
