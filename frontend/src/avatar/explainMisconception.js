/**
 * Sage teaching = independent scientific descriptions, then comparison:
 *   YOUR ANSWER → CORRECT ANSWER → SCIENTIFIC COMPARISON → KEY CONNECTION → QUICK CHECK
 * Wrong-for-this-question is not the same as scientifically false.
 * Never invent a function or example. Never dump a one-line key.
 */
import { CONCEPT_CATALOG, resolveTopicKey } from './conceptMaps.js';

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

/** Grader/UI talk — not a science lesson. */
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

/** Everyday science identity of a typical wrong pick. */
const STUDENT_WORLD_IDEAS = [
  {
    test: /helium/,
    label: 'helium',
    purpose: 'a light unreactive gas used in balloons',
    bodyShort: 'Helium is a very light gas. We normally use it to fill party balloons so they float.',
    bodyFull:
      'Helium is a very light gas. We normally use it to fill party balloons so they float. A birthday balloon filled with helium floats to the ceiling.',
    what: 'Helium is a very light gas.',
    means: 'It is a noble gas, which means it barely reacts with other chemicals.',
    usedFor: 'We normally use it to fill party balloons so they float.',
    how: 'Because it is lighter than air and unreactive, a helium balloon stays up.',
    example: 'A birthday balloon filled with helium floats to the ceiling.',
    meetShort: 'Helium is the light gas that makes party balloons float.',
    meet: 'Helium is a very light gas. We fill party balloons with it so they float.',
    meetRich:
      'Helium is a light noble gas: it barely reacts with other chemicals, which is why balloons filled with it stay light and float.',
    mismatch:
      'Helium does not go into the leaf’s food-making reaction, so it cannot be the gas plants take in for photosynthesis.',
  },
  {
    test: /\boxygen\b|\bo2\b/,
    label: 'oxygen',
    purpose: 'the gas animals breathe; plants usually give it off in light',
    bodyShort: 'Oxygen is the gas animals breathe. Green plants usually release it during photosynthesis.',
    bodyFull:
      'Oxygen is the gas animals breathe. Green plants usually release it during photosynthesis after they build sugar. That released oxygen is a product of food-making.',
    what: 'Oxygen is a gas in the air that living things use.',
    means: 'It is the gas animals breathe in to release energy from food.',
    usedFor: 'We use oxygen for breathing; green plants usually give it off in light.',
    how: 'During photosynthesis the leaf builds sugar, then releases oxygen as a product.',
    example: 'You breathe oxygen; a sunlit leaf is often giving oxygen off, not taking it in to make food.',
    meetShort: 'Oxygen is the gas we breathe, and plants usually give it off in light.',
    meet: 'Oxygen is the gas animals breathe. Green plants usually release it during photosynthesis.',
    meetRich:
      'Oxygen is a product of photosynthesis: the leaf gives it off after using light to build sugar, which is why we often say plants “make oxygen”.',
    mismatch:
      'Oxygen is not the main gas the leaf takes in to build sugar — that intake gas is carbon dioxide.',
  },
  {
    test: /nitrogen|\bn2\b/,
    what: 'Nitrogen is a gas that makes up most of the air.',
    means: 'It is a building-block element for proteins, not a balloon gas and not the leaf’s food-making intake.',
    usedFor: 'Plants usually get nitrogen from soil or fertilizer to build proteins.',
    how: 'Roots take in nitrogen compounds; the leaf does not take in nitrogen gas to make sugar.',
    example: 'Fertilizer on a farm field is feeding nitrogen for proteins, not for the photosynthesis gas job.',
    meetShort: 'Nitrogen makes up a lot of the air, and plants need it for proteins.',
    meet: 'Nitrogen is a big part of air. Plants need nitrogen for proteins, often from soil or fertilizer.',
    meetRich:
      'Nitrogen is about four-fifths of air and is a building block of proteins, usually entering plants from the soil rather than as a photosynthesis gas.',
    mismatch:
      'Nitrogen is not the gas the leaf takes in to make sugar during photosynthesis.',
  },
  {
    test: /hydrogen/,
    what: 'Hydrogen is the lightest element, often met as a gas.',
    means: 'In water it is the H in H₂O; as a free gas it is used in some fuels, not as the leaf’s intake gas.',
    usedFor: 'We meet it in water and some energy discussions.',
    how: 'In plants, hydrogen arrives as part of water, not as a gas the leaf “breathes in” to make food.',
    example: 'A water molecule H₂O already contains hydrogen; that is not the same as taking in hydrogen gas.',
    meetShort: 'Hydrogen is a very light gas; water is H₂O.',
    meet: 'Hydrogen is a light gas we meet in water (H₂O) and some fuels.',
    meetRich:
      'Hydrogen is the lightest element; in plants it arrives as part of water, not as a balloon-style gas the leaf “breathes in” to make food.',
    mismatch:
      'Leaves do not take in hydrogen gas the way they take in carbon dioxide for photosynthesis.',
  },
  {
    test: /store water|storing water|leaves that store|leaves to store|water in leaves|succulent|fleshy leaf/,
    label: 'leaves that store water',
    purpose: 'water storage and survival',
    bodyShort:
      'Some plants have leaves that can store water. This helps them survive where water is limited.',
    bodyFull:
      'Some plants have leaves adapted to store water. Those leaves retain water so the plant can survive where water is limited. This is a plant adaptation related to water storage and survival.',
    what: 'Some plants have leaves adapted to store water.',
    means: 'Those leaves hold extra water so the plant can last through dry times.',
    usedFor: 'This is a plant adaptation related to water storage and survival.',
    how: 'Fleshy or thickened leaves keep water inside the plant instead of losing it quickly.',
    example: 'A succulent plant can live through dry days because its leaves hold water.',
    mismatch: 'Storing water helps the plant survive. It does not produce seeds.',
  },
  {
    test: /flower.{0,80}seed|produce seeds|through flowers/,
    label: 'flowers that produce seeds',
    purpose: 'reproduction and seed formation',
    bodyShort:
      'Flowers are reproductive structures in flowering plants. Reproduction can result in seeds, which can grow into new plants.',
    bodyFull:
      'Flowers are reproductive structures in flowering plants. They are involved in reproduction that can lead to seed formation. A seed contains a developing embryo and can grow into a new plant under suitable conditions. This is related to plant reproduction and seed formation.',
    what: 'Flowers are reproductive structures in flowering plants.',
    means: 'They are involved in reproduction that can lead to seed formation.',
    usedFor: 'This is related to plant reproduction and seed formation.',
    how: 'After pollination, a flower can form a seed that holds a developing embryo.',
    example: 'A mango flower can lead to a fruit with a seed inside.',
    mismatch: 'Flowers making seeds is reproduction, not water storage.',
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
    meetShort: 'Thunder is the sound from a storm, not a plant or harvest job.',
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

export function lookupStudentIdea(wrong) {
  const t = lower(wrong);
  if (!t) return null;
  return STUDENT_WORLD_IDEAS.find((row) => row.test.test(t)) || null;
}

const CORRECT_WORLD_IDEAS = [
  {
    test: /carbon dioxide|co2|co₂/,
    what: 'Carbon dioxide is a gas found in air.',
    means: 'It is the gas that gives plants the carbon they pack into food.',
    usedFor: 'Leaves take it in during photosynthesis.',
    how: 'Together with water and light, carbon dioxide is used to build glucose.',
    example: 'A green leaf in sunlight is taking in carbon dioxide from the air.',
    purpose: 'the gas plants take in to make food',
    bodyShort:
      'Carbon dioxide is a gas in the air. Leaves take it in during photosynthesis to build food.',
    bodyFull:
      'Carbon dioxide is a gas found in air. Leaves take it in during photosynthesis and use it, with water and light, to build glucose. This is the plant’s food-making intake gas.',
    label: 'carbon dioxide',
  },
  {
    test: /flower.{0,80}seed|produce seeds|through flowers/,
    label: 'flowers that produce seeds',
    purpose: 'reproduction and seed formation',
    what: 'Flowers are reproductive structures in flowering plants.',
    means: 'They are involved in reproduction that can lead to seed formation.',
    usedFor: 'This is related to plant reproduction and seed formation.',
    how: 'After pollination, a flower can form a seed that holds a developing embryo.',
    example: 'A mango flower can lead to a fruit with a seed inside.',
    bodyShort:
      'Flowers are reproductive structures in flowering plants. Reproduction can result in seeds, which can grow into new plants.',
    bodyFull:
      'Flowers are reproductive structures in flowering plants. They are involved in reproduction that can lead to seed formation. A seed contains a developing embryo and can grow into a new plant under suitable conditions. This is related to plant reproduction and seed formation.',
  },
  {
    test: /store water|storing water|leaves that store|leaves to store|succulent/,
    label: 'leaves that store water',
    purpose: 'water storage and survival',
    what: 'Some plants have leaves adapted to store water.',
    means: 'Those leaves hold extra water so the plant can last through dry times.',
    usedFor: 'This is a plant adaptation related to water storage and survival.',
    how: 'Fleshy or thickened leaves keep water inside the plant instead of losing it quickly.',
    example: 'A succulent plant can live through dry days because its leaves hold water.',
    bodyShort:
      'Some plants have leaves that can store water. This helps them survive where water is limited.',
    bodyFull:
      'Some plants have leaves adapted to store water. Those leaves retain water so the plant can survive where water is limited. This is a plant adaptation related to water storage and survival.',
  },
  {
    test: /photosynthesis/,
    what: 'Photosynthesis is how green plants make food.',
    means: 'Light energy powers a reaction that builds sugar.',
    usedFor: 'It is the plant’s food-making job in leaves.',
    how: 'The leaf uses carbon dioxide, water, and light, and usually gives off oxygen.',
    example: 'A crop leaf in the sun is running photosynthesis.',
  },
  {
    test: /anther|stamen/,
    what: 'The anther is the male part of a flower, on the stamen.',
    means: 'It is the pollen-maker.',
    usedFor: 'Flowers use it to produce pollen for reproduction.',
    how: 'Pollen forms in the anther and can then be moved to a pistil.',
    example: 'Dusty yellow anthers in a hibiscus are making pollen.',
  },
  {
    test: /dicotyledon|dicot/,
    what: 'Dicotyledonous plants (dicots) are a plant group named for two seed leaves.',
    means: 'The prefix “di-” means two; cotyledons are seed leaves (seed lobes).',
    usedFor: 'We use that name to group beans, tomato, and mango-type plants.',
    how: 'A dicot seed typically opens with two seed lobes.',
    example: 'A bean seed split into two halves is a simple dicot example.',
  },
  {
    test: /monocot/,
    what: 'Monocots are plants with one seed leaf.',
    means: 'The prefix “mono-” means one; that seed leaf is a cotyledon.',
    usedFor: 'We use that name for grasses, rice, and maize.',
    how: 'A monocot seed has one cotyledon and often fibrous roots.',
    example: 'A maize seedling with one seed leaf is a monocot.',
  },
  {
    test: /\bglucose\b|sugar/,
    what: 'Glucose is a sugar — the food plants build.',
    means: 'It is the carbohydrate made during photosynthesis.',
    usedFor: 'Plants use it as food energy and to build other materials.',
    how: 'Leaves combine carbon dioxide and water using light to make glucose.',
    example: 'The sugar stored in a leaf after a sunny day started as glucose.',
  },
];

function lookupCorrectIdea(right, prompt = '', topic = '') {
  const r = lower(right);
  const hit = CORRECT_WORLD_IDEAS.find((row) => row.test.test(r));
  if (hit) return hit;
  const blob = lower(`${right} ${prompt}`);
  return CORRECT_WORLD_IDEAS.find((row) => row.test.test(blob)) || null;
}

function pickMeet(idea, band) {
  if (!idea) return '';
  if (band === 'micro' || band === 'simple') return idea.meetShort || idea.meet;
  if (band === 'rich') return idea.meetRich || idea.meet;
  return idea.meet || idea.meetShort;
}

function ideaBody(idea, band) {
  if (!idea) return '';
  if (band === 'micro' || band === 'simple') {
    return idea.bodyShort || [idea.what, idea.usedFor || idea.means].map(norm).filter(Boolean).join(' ');
  }
  let text =
    idea.bodyFull ||
    idea.bodyShort ||
    [idea.what, idea.means, idea.usedFor, idea.how].map(norm).filter(Boolean).join(' ');
  if (band === 'rich' && idea.example) {
    const marker = lower(idea.example).slice(0, 24);
    if (marker && !lower(text).includes(marker)) text = `${text} ${idea.example}`;
  }
  return text;
}

function hasWholeWord(haystack, word) {
  const w = lower(word).replace(/[()]/g, '').trim();
  if (w.length < 5) return false;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp(`\\b${escaped}s?\\b`, 'i').test(haystack);
  } catch {
    return false;
  }
}

function findCatalogNode(catalog, text) {
  const t = lower(text);
  if (!catalog?.nodes?.length || t.length < 3) return null;
  let best = null;
  let bestScore = 0;
  for (const node of catalog.nodes) {
    const label = lower(node.label).replace(/\s*\(.*\)\s*/, '').trim();
    let score = 0;
    if (t === label) score = 8;
    else if (hasWholeWord(t, label)) score = 6;
    for (const hint of node.relatedWrongHints || []) {
      if (hasWholeWord(t, hint) || t.includes(lower(hint))) score = Math.max(score, 5);
    }
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return bestScore >= 6 ? best : null;
}

function catalogForAttempt(attempt) {
  const key =
    resolveTopicKey(attempt.topic) ||
    resolveTopicKey(
      `${attempt.prompt || attempt.question || ''} ${attempt.correctAnswer || ''}`,
    );
  return key && CONCEPT_CATALOG[key] ? CONCEPT_CATALOG[key] : null;
}

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
      purpose: 'photosynthesis',
      asking: 'which gas plants take in to make food',
      examRemember:
        'the gas plants TAKE IN for photosynthesis is carbon dioxide — not oxygen, not helium',
      rightHow:
        'The leaf takes in carbon dioxide, plus water and light, to build sugar. Oxygen is given off.',
    };
  }
  if (/produce seeds|new plants|reproduc/.test(p) && /flower|plant|seed/.test(p)) {
    return {
      verbPhrase: 'produce seeds',
      purpose: 'reproduction',
      asking: 'how flowering plants produce seeds',
      rightHow: 'Flowering plants produce seeds through their flowers.',
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
      rightHow: hint || 'Plants need water for photosynthesis and to move nutrients.',
    };
  }
  if (/underground|takes in water/.test(p) && /part/.test(p)) {
    return {
      verbPhrase: 'name the part that takes in water from soil',
      rightHow: hint || claim?.fact || 'Roots grow underground and take in water and minerals.',
    };
  }
  if (/stores energy|nutrient/.test(p) && /corn/.test(p)) {
    return {
      verbPhrase: 'name the main energy-store nutrient',
      rightHow: hint || claim?.fact || 'Corn stores energy mainly as carbohydrates (starch).',
    };
  }
  if (/water moving from plant leaves|transpiration|into the air/.test(p)) {
    return {
      verbPhrase: 'name water leaving leaves into the air',
      rightHow: hint || claim?.fact || 'That process is transpiration.',
    };
  }
  if (/captures most sunlight|food-making/.test(p)) {
    return {
      verbPhrase: 'name the part that captures sunlight for food-making',
      rightHow: hint || 'Leaves hold chlorophyll and capture most sunlight for photosynthesis.',
    };
  }
  if (/dicotyledon|two seed|seed lobes?|cotyledon/.test(p)) {
    return {
      verbPhrase: 'name plants with two seed leaves',
      rightHow:
        'Dicotyledonous (dicot) plants have two cotyledons — seed leaves. The prefix “di-” means two.',
    };
  }
  if (claim?.fact) {
    return {
      verbPhrase: 'match the science idea in the sentence',
      rightHow: hint || claim.fact,
    };
  }
  if (hint && right) {
    return {
      verbPhrase: `match “${clip(right, 48)}”`,
      rightHow: `${hint} That is why “${clip(right, 60)}” fits this question.`,
    };
  }
  if (hint) {
    return { verbPhrase: 'match the science job in the question', rightHow: hint };
  }
  if (right) {
    return {
      verbPhrase: `match “${clip(right, 48)}”`,
      rightHow: `This question is asking for ${right}. ${clip(prompt, 110)}`,
    };
  }
  return {
    verbPhrase: 'answer this farm question',
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

function rightMechanism(attempt, band) {
  const job = questionJob(attempt);
  const cat = catalogForAttempt(attempt);
  const rightNode =
    findCatalogNode(cat, attempt.correctAnswer) ||
    findCatalogNode(cat, attempt.prompt || attempt.question);
  const text = job.rightHow || rightNode?.explanation || '';
  if (band === 'micro') return clip(text, 140);
  return text;
}

function genericMeet(wrong, band) {
  const w = clip(wrong, 48);
  if (!w) return '';
  if (band === 'micro' || band === 'simple') {
    return `You used “${w}”. That idea belongs to a different science job than this question.`;
  }
  return `You used “${w}”. Keep that word in mind — it is a real idea, but it does a different job than this farm question is asking.`;
}

function mismatchLine(wrong, attempt, idea, wrongNode) {
  if (idea?.mismatch) return idea.mismatch;
  if (wrongNode) {
    return `${wrongNode.label} is for ${String(wrongNode.role || 'another job').toLowerCase()}, so it does not do this question’s job.`;
  }
  const job = questionJob(attempt);
  return `“${clip(wrong, 48)}” does not ${job.verbPhrase}.`;
}

function composeThreeBeat({ meet, right, mismatch }, band) {
  const parts = [meet, right, mismatch].map((p) => norm(p)).filter(Boolean);
  return clip(parts.join(' '), bandClip(band));
}

function firstSentence(text) {
  const s = norm(text);
  if (!s) return '';
  const bit = s.split(/(?<=[.!?])\s+/)[0] || s;
  return clip(bit, 90);
}

function fiveStepClip(band) {
  if (band === 'micro') return 420;
  if (band === 'simple') return 520;
  if (band === 'rich') return 720;
  return 640;
}

/** Strip MCQ letters like "B." so we never shout the option key. */
export function displayChoice(text) {
  return norm(String(text || '').replace(/^\(?[A-Da-d]\)?[.)]\s+/, ''));
}

export function shortConceptLabel(text, max = 42) {
  const idea =
    lookupStudentIdea(text) || lookupCorrectIdea(text, text, '');
  if (idea?.label) return clip(idea.label, max);
  const cleaned = displayChoice(text);
  if (!cleaned) return '';
  return clip(cleaned, max);
}

function conceptPurpose(text, attempt, side) {
  const idea = verifiedIdeaFor(text, attempt, side);
  if (idea?.purpose) return idea.purpose;
  if (idea?.usedFor) return idea.usedFor;
  const job = questionJob(attempt);
  if (side === 'correct' && job?.purpose) return job.purpose;
  const t = lower(text);
  if (/store water|storing water|leaves that store|succulent/.test(t)) {
    return 'water storage and survival';
  }
  if (/flower|seed|reproduc/.test(t) && !/store water/.test(t)) {
    return 'reproduction and seed formation';
  }
  if (/helium/.test(t)) return 'a light unreactive gas used in balloons';
  if (/carbon dioxide|co2|co₂/.test(t)) return 'the gas plants take in to make food';
  if (/oxygen/.test(t)) return 'the gas animals breathe; plants usually give it off in light';
  return '';
}

/** Short science idea for map "Key idea" — never just True/False. */
export function scienceKeyIdea(attempt = {}) {
  const prompt = norm(attempt.prompt || attempt.question || '');
  const right = displayChoice(attempt.correctAnswer);
  const claim = unpackScienceClaim(prompt, attempt.topic);
  if (isTrueFalseToken(right) && claim?.fact) return firstSentence(claim.fact);
  const idea = isTrueFalseToken(right)
    ? null
    : lookupCorrectIdea(right, prompt, attempt.topic);
  if (idea?.label) return idea.label;
  if (idea?.what) return firstSentence(idea.what);
  if (claim?.fact) return firstSentence(claim.fact);
  const job = questionJob(attempt);
  if (job?.purpose) return job.purpose;
  if (job?.rightHow) return firstSentence(job.rightHow);
  if (right && !isTrueFalseToken(right)) return clip(right, 48);
  return clip(attempt.topic || 'This science idea', 40);
}

function catalogAsIdea(text, attempt) {
  const node = findCatalogNode(catalogForAttempt(attempt), text);
  if (!node?.explanation) return null;
  return {
    label: node.label,
    purpose: String(node.role || '').toLowerCase(),
    what: node.explanation,
    bodyShort: node.explanation,
    bodyFull: node.explanation,
  };
}

export function verifiedIdeaFor(text, attempt = {}, side = 'student') {
  const cleaned = displayChoice(text);
  if (!cleaned || isTrueFalseToken(cleaned) || isNoPick(cleaned) || isPlaceholderBlank(cleaned)) {
    return null;
  }
  const fromStudent = lookupStudentIdea(cleaned);
  const fromCorrect = lookupCorrectIdea(cleaned, cleaned, '');
  const fromCatalog = catalogAsIdea(cleaned, attempt);
  if (side === 'correct') return fromCorrect || fromStudent || fromCatalog;
  return fromStudent || fromCorrect || fromCatalog;
}

function statementScience(attempt, band) {
  const prompt = norm(attempt.prompt || attempt.question || '');
  const topic = attempt.topic || '';
  const idea =
    lookupCorrectIdea(prompt, prompt, topic) || lookupStudentIdea(prompt);
  const taught = ideaBody(idea, band);
  if (taught) return { idea, text: taught };
  const claim = unpackScienceClaim(prompt, topic);
  if (claim?.fact) {
    const text =
      band === 'micro' || band === 'simple' ? firstSentence(claim.fact) : claim.fact;
    return {
      idea: { label: scienceKeyIdea(attempt), what: claim.fact, purpose: 'the science in this statement' },
      text,
    };
  }
  const how = questionJob(attempt)?.rightHow;
  if (how) {
    const text = band === 'micro' || band === 'simple' ? firstSentence(how) : how;
    return { idea: { what: how }, text };
  }
  return { idea: null, text: '' };
}

/**
 * Ground a scientific description in verified curriculum facts.
 * Do not guess a function or example for an unknown option.
 */
export function canDescribeScientifically(text, attempt = {}, side = 'student') {
  const raw = norm(text);
  if (!raw) return false;
  if (isNoPick(raw) || isPlaceholderBlank(raw)) return false;
  if (isTrueFalseToken(raw)) return Boolean(statementScience(attempt, 'medium').text);
  return Boolean(verifiedIdeaFor(raw, attempt, side));
}

function descriptionCard(title, idea, body, band) {
  const example = idea?.example || idea?.how || firstSentence(body);
  return {
    title,
    concept: idea?.label || firstSentence(idea?.what || body) || '',
    scientificDescription: body,
    scientificDefinition: body,
    function: idea?.purpose || idea?.usedFor || '',
    example: example || firstSentence(body),
  };
}

const VAGUE_SCIENCE = /\b(one is about|the other is about|this thing|that concept|the former|the latter)\b/i;

export function isVagueOrIncomplete(text) {
  const s = norm(text);
  if (!s) return true;
  if (VAGUE_SCIENCE.test(s)) return true;
  if (/this is a (science|plant|biological) (concept|function|idea)/i.test(s)) return true;
  if (/related to plants\.?$/i.test(s) && s.length < 48) return true;
  return false;
}

function completeConcept(text, attempt, side, band) {
  const title = side === 'student' ? 'Your Answer' : 'Correct Answer';
  if (isTrueFalseToken(text)) {
    const science = statementScience(attempt, band);
    const idea = science.idea;
    const fact = firstSentence(science.text || idea?.what || '');
    if (side === 'correct') {
      const trueKey = isAffirmative(text);
      const definition = trueKey
        ? `The statement is scientifically true. The specific claim that holds is: ${fact}`
        : `A key scientific claim in the sentence does not hold. The scientifically correct process is: ${science.text || fact}`;
      const scientificFunction = trueKey
        ? 'this sentence is a scientifically accurate claim'
        : 'this sentence is not a scientifically accurate claim';
      return {
        title,
        concept: idea?.label || scienceKeyIdea(attempt) || displayChoice(text),
        scientificDefinition: definition,
        scientificFunction,
        example: idea?.example || idea?.how || fact,
      };
    }
    const definition = science.text;
    const scientificFunction =
      idea?.purpose || idea?.usedFor || 'the science named in this sentence';
    const example = idea?.example || idea?.how || firstSentence(definition);
    return {
      title,
      concept: idea?.label || scienceKeyIdea(attempt) || displayChoice(text),
      scientificDefinition: definition,
      scientificFunction,
      example: example || firstSentence(definition),
    };
  }
  const idea = verifiedIdeaFor(text, attempt, side);
  const definition = ideaBody(idea, band);
  const scientificFunction =
    idea?.purpose || idea?.usedFor || conceptPurpose(text, attempt, side);
  const example = idea?.example || idea?.how || firstSentence(definition);
  return {
    title,
    concept: idea?.label || shortConceptLabel(text, 72) || displayChoice(text),
    scientificDefinition: definition,
    scientificFunction,
    example: example || firstSentence(definition),
  };
}

export function validateStructuredLesson(lesson) {
  if (!lesson || lesson.insufficientKnowledge) return false;
  const student = lesson.studentAnswer;
  const correct = lesson.correctAnswer;
  const comparison = lesson.comparisonFields || lesson.scientificComparison;
  if (!student || !correct || !comparison || typeof student === 'string') return false;
  const why =
    comparison.whyCorrectAnswerFitsQuestion || comparison.whyCorrectAnswerFits;
  const required = [
    student.scientificDefinition,
    student.scientificFunction,
    student.example,
    student.concept,
    correct.scientificDefinition,
    correct.scientificFunction,
    correct.example,
    correct.concept,
    comparison.studentConcept,
    comparison.studentConceptFunction,
    comparison.correctConcept,
    comparison.correctConceptFunction,
    comparison.keyScientificDifference,
    why,
  ];
  if (required.some((v) => !norm(v))) return false;
  if (required.some((v) => isVagueOrIncomplete(v))) return false;
  if (student.scientificDefinition.length < 24 || correct.scientificDefinition.length < 24) {
    return false;
  }
  return true;
}

function selectedConceptBlock(attempt, band) {
  const wrong = displayChoice(attempt.studentAnswer);
  if (isTrueFalseToken(wrong)) {
    return statementScience(attempt, band).text;
  }
  const idea = verifiedIdeaFor(wrong, attempt, 'student');
  return ideaBody(idea, band);
}

function correctConceptBlock(attempt, band) {
  const right = displayChoice(attempt.correctAnswer);
  const prompt = norm(attempt.prompt || attempt.question || '');
  const claim = unpackScienceClaim(prompt, attempt.topic);
  const job = questionJob(attempt);

  if (isTrueFalseToken(right)) {
    const fact = firstSentence(claim?.fact || job.rightHow || scienceKeyIdea(attempt));
    if (isAffirmative(right)) {
      return band === 'micro' || band === 'simple'
        ? `The statement is scientifically true. ${fact}`
        : `The statement is scientifically true. The specific claim that holds is: ${fact}`;
    }
    return band === 'micro' || band === 'simple'
      ? `A key claim in the sentence does not hold. ${fact}`
      : `A key scientific claim in the sentence does not hold. The scientifically correct process is: ${fact}`;
  }

  const idea = verifiedIdeaFor(right, attempt, 'correct');
  return ideaBody(idea, band);
}

function scientificSimilarity(studentIdea, correctIdea, attempt) {
  const blob = lower(
    `${studentIdea?.concept || studentIdea?.label || ''} ${studentIdea?.scientificFunction || studentIdea?.purpose || ''} ${correctIdea?.concept || correctIdea?.label || ''} ${correctIdea?.scientificFunction || correctIdea?.purpose || ''} ${attempt.topic || ''}`,
  );
  if (/helium|oxygen|nitrogen|hydrogen|carbon dioxide|co2|\bgas/.test(blob)) {
    return 'Both are real gases, but they perform different scientific jobs.';
  }
  if (/leaf|flower|plant|seed|root|water storage|reproduc/.test(blob)) {
    return 'Both concepts involve structures found in plants, but they perform different biological functions.';
  }
  return 'Both are real science ideas, but they do different jobs.';
}

function buildNamedComparison(student, correct, attempt) {
  const studentConcept = student.concept;
  const correctConcept = correct.concept;
  const studentFn = student.scientificFunction;
  const correctFn = correct.scientificFunction;
  if (!studentConcept || !studentFn || !correctConcept || !correctFn) return null;
  if (isVagueOrIncomplete(studentFn) || isVagueOrIncomplete(correctFn)) return null;

  const job = questionJob(attempt);
  const asking = job?.asking || scienceKeyIdea(attempt);
  const keyScientificDifference =
    `${studentConcept} is primarily associated with ${studentFn}. ${correctConcept} is primarily associated with ${correctFn}.`;
  const whyCorrectAnswerFitsQuestion =
    `The question asks about ${asking}. ${correctConcept} satisfies this because it is ${correctFn}. ${studentConcept} does not satisfy this because it is ${studentFn}.`;
  const body = [
    `${studentConcept} ${studentFn}.`,
    `${correctConcept} ${correctFn}.`,
    `The key scientific difference is: ${studentConcept} → ${studentFn}. ${correctConcept} → ${correctFn}.`,
  ].join(' ');
  return {
    studentConcept,
    studentConceptFunction: studentFn,
    correctConcept,
    correctConceptFunction: correctFn,
    keyScientificDifference,
    whyCorrectAnswerFitsQuestion,
    similarity: scientificSimilarity(student, correct, attempt),
    body,
  };
}

function buildComparison(attempt, band) {
  const student = completeConcept(attempt.studentAnswer, attempt, 'student', band);
  const correct = completeConcept(attempt.correctAnswer, attempt, 'correct', band);
  return buildNamedComparison(student, correct, attempt);
}

function connectionBlock(attempt, band, comparison) {
  const job = questionJob(attempt);
  const asking = job?.asking || scienceKeyIdea(attempt);
  const studentPurpose =
    comparison?.wrongConcept ||
    conceptPurpose(attempt.studentAnswer, attempt, 'student') ||
    'your pick';
  const correctPurpose =
    comparison?.correctConcept ||
    conceptPurpose(attempt.correctAnswer, attempt, 'correct') ||
    job?.purpose ||
    'the quiz idea';
  if (isTrueFalseToken(attempt.studentAnswer) && isTrueFalseToken(attempt.correctAnswer)) {
    const claim = unpackScienceClaim(attempt.prompt || attempt.question, attempt.topic);
    const fact = firstSentence(claim?.fact || asking);
    if (isAffirmative(attempt.correctAnswer)) {
      return `The question asks whether this science sentence holds. ${fact} That is why True matches.`;
    }
    return `The question asks whether this science sentence holds. ${fact} That is why False matches.`;
  }
  if (band === 'micro' || band === 'simple') {
    return `The question asks about ${asking}. That matches ${correctPurpose}, not ${studentPurpose}.`;
  }
  return `The question asks about ${asking}. ${correctPurpose} answers that job. ${studentPurpose} is a real science idea, but it is not what this question is asking.`;
}

function checkQuestion(attempt) {
  const studentPurpose =
    conceptPurpose(attempt.studentAnswer, attempt, 'student') || 'your pick';
  const correctPurpose =
    conceptPurpose(attempt.correctAnswer, attempt, 'correct') || 'the quiz idea';
  const prompt = lower(attempt.prompt || attempt.question || '');
  if (isTrueFalseToken(attempt.studentAnswer) && isTrueFalseToken(attempt.correctAnswer)) {
    return 'Which part of this sentence decides whether it is true or false?';
  }
  if (/helium/.test(lower(attempt.studentAnswer)) && /photosynth/.test(prompt)) {
    return 'Is helium mainly a balloon gas, or the gas plants take in to make food?';
  }
  if (/oxygen/.test(lower(attempt.studentAnswer)) && /photosynth/.test(prompt)) {
    return 'Do plants mainly take in oxygen to make food, or give oxygen off?';
  }
  if (/water/.test(studentPurpose) && /reproduc/.test(correctPurpose)) {
    return 'If a plant produces seeds through its flowers, is this mainly related to water storage or reproduction?';
  }
  return `Is this question mainly about ${studentPurpose} or ${correctPurpose}?`;
}

function countPhrase(haystack, needle) {
  const h = lower(haystack);
  const n = lower(needle);
  if (!n || n.length < 8) return 0;
  let count = 0;
  let idx = 0;
  while (n && (idx = h.indexOf(n, idx)) !== -1) {
    count += 1;
    idx += n.length;
  }
  return count;
}

export function formatLessonSpeech(lesson) {
  if (!lesson?.sections?.length) return lesson?.fullText || '';
  return lesson.sections
    .map((s) => {
      if (s.id === 'your_answer' || s.id === 'correct_answer') {
        const quote = s.quote ? `${s.quote}. ` : '';
        const def = s.scientificDefinition || s.body || '';
        const fn = s.scientificFunction ? ` Function: ${s.scientificFunction}.` : '';
        return `${s.title}. ${quote}Scientifically: ${def}${fn}`.replace(/\s+/g, ' ').trim();
      }
      if (s.id === 'difference') {
        const a = s.studentConcept
          ? `${s.studentConcept} → ${s.studentConceptFunction || ''}. `
          : '';
        const b = s.correctConcept
          ? `${s.correctConcept} → ${s.correctConceptFunction || ''}. `
          : '';
        const diff = s.keyScientificDifference || s.body || '';
        return `${s.title}. ${a}${b}The key scientific difference is: ${diff}`.replace(/\s+/g, ' ').trim();
      }
      const quote = s.quote ? `${s.quote}. ` : '';
      return `${s.title}. ${quote}${s.body}`.replace(/\s+/g, ' ').trim();
    })
    .join(' ');
}

/**
 * Define both answers scientifically, then compare. Never emit incomplete comparison.
 */
export function composeFiveStepLesson(attempt = {}, voice = {}) {
  const band = voiceBand(voice);
  const student = completeConcept(attempt.studentAnswer, attempt, 'student', band);
  const correctObj = completeConcept(attempt.correctAnswer, attempt, 'correct', band);
  if (
    isVagueOrIncomplete(student.scientificDefinition) ||
    isVagueOrIncomplete(correctObj.scientificDefinition) ||
    !norm(student.scientificDefinition) ||
    !norm(correctObj.scientificDefinition) ||
    !norm(student.scientificFunction) ||
    !norm(correctObj.scientificFunction)
  ) {
    return {
      insufficientKnowledge: true,
      sections: [],
      selected: '',
      correct: '',
      comparison: '',
      connection: '',
      check: '',
      fullText: '',
      studentAnswer: null,
      correctAnswer: null,
    };
  }

  const comparison = buildNamedComparison(student, correctObj, attempt);
  if (!comparison || isVagueOrIncomplete(comparison.keyScientificDifference)) {
    return {
      insufficientKnowledge: true,
      sections: [],
      selected: '',
      correct: '',
      comparison: '',
      connection: '',
      check: '',
      fullText: '',
      studentAnswer: null,
      correctAnswer: null,
    };
  }

  const selected = student.scientificDefinition;
  const correct = correctObj.scientificDefinition;
  const connection = comparison.whyCorrectAnswerFitsQuestion;
  const check = checkQuestion(attempt);

  const wrongAnswerDescription = {
    title: student.title,
    concept: student.concept,
    scientificDescription: student.scientificDefinition,
    scientificDefinition: student.scientificDefinition,
    function: student.scientificFunction,
    example: student.example,
  };
  const correctAnswerDescription = {
    title: correctObj.title,
    concept: correctObj.concept,
    scientificDescription: correctObj.scientificDefinition,
    scientificDefinition: correctObj.scientificDefinition,
    function: correctObj.scientificFunction,
    example: correctObj.example,
  };
  const scientificComparison = {
    title: 'Scientific Comparison',
    studentConcept: comparison.studentConcept,
    studentConceptFunction: comparison.studentConceptFunction,
    correctConcept: comparison.correctConcept,
    correctConceptFunction: comparison.correctConceptFunction,
    keyScientificDifference: comparison.keyScientificDifference,
    whyCorrectAnswerFits: comparison.whyCorrectAnswerFitsQuestion,
    similarity: comparison.similarity,
    difference: comparison.keyScientificDifference,
    wrongConcept: comparison.studentConcept,
  };

  const sections = [
    {
      id: 'your_answer',
      title: 'YOUR ANSWER',
      quote: student.concept,
      scientificDefinition: student.scientificDefinition,
      scientificFunction: student.scientificFunction,
      example: student.example,
      body: student.scientificDefinition,
      concept: student.concept,
      function: student.scientificFunction,
    },
    {
      id: 'correct_answer',
      title: 'CORRECT ANSWER',
      quote: correctObj.concept,
      scientificDefinition: correctObj.scientificDefinition,
      scientificFunction: correctObj.scientificFunction,
      example: correctObj.example,
      body: correctObj.scientificDefinition,
      concept: correctObj.concept,
      function: correctObj.scientificFunction,
    },
    {
      id: 'difference',
      title: 'SCIENTIFIC COMPARISON',
      studentConcept: comparison.studentConcept,
      studentConceptFunction: comparison.studentConceptFunction,
      correctConcept: comparison.correctConcept,
      correctConceptFunction: comparison.correctConceptFunction,
      keyScientificDifference: comparison.keyScientificDifference,
      similarity: comparison.similarity,
      difference: comparison.keyScientificDifference,
      wrongConcept: comparison.studentConcept,
      studentPurpose: comparison.studentConceptFunction,
      correctPurpose: comparison.correctConceptFunction,
      body: comparison.body,
    },
    {
      id: 'connection',
      title: 'KEY CONNECTION',
      body: connection,
    },
    {
      id: 'check',
      title: 'QUICK CHECK',
      body: check,
    },
  ];

  const packed = {
    selected,
    correct,
    comparison: comparison.body,
    connection,
    check,
    sections,
    band,
    insufficientKnowledge: false,
    studentAnswer: student,
    correctAnswer: correctObj,
    wrongAnswerDescription,
    correctAnswerDescription,
    scientificComparison,
    comparisonFields: comparison,
    questionConnection: connection,
    interactiveCheck: check,
  };
  packed.fullText = formatLessonSpeech(packed);
  if (!validateStructuredLesson(packed) || isVagueOrIncomplete(packed.fullText)) {
    return {
      insufficientKnowledge: true,
      sections: [],
      selected: '',
      correct: '',
      comparison: '',
      connection: '',
      check: '',
      fullText: '',
      studentAnswer: null,
      correctAnswer: null,
    };
  }
  return packed;
}

function composeTutorMiss(attempt, voice) {
  const band = voiceBand(voice);
  const wrong = norm(attempt.studentAnswer);

  if (isPlaceholderBlank(wrong) || isNoPick(wrong)) {
    return clip(
      band === 'micro'
        ? `Let's look at the sentence itself. ${scienceKeyIdea(attempt)}`
        : `No pick yet — start with the idea in the sentence. ${scienceKeyIdea(attempt)}`,
      fiveStepClip(band),
    );
  }

  const lesson = composeFiveStepLesson(attempt, voice);
  if (!validateStructuredLesson(lesson)) return '';
  return '';
}

export function explainWhyWrong(attempt = {}, voice = {}) {
  return composeTutorMiss(attempt, voice);
}

export function explainCorrectIdea(attempt = {}, voice = {}) {
  const band = voiceBand(voice);
  const idea = scienceKeyIdea(attempt);
  return clip(idea, band === 'micro' ? 160 : 260);
}

/** Build the five SAGE teaching sections from a farm miss. */
export function teachingLessonFromMiss(input = {}, voice = {}) {
  const prompt = norm(input.prompt || input.question || input.questionText);
  const studentAnswer = norm(
    input.studentAnswer || input.lastWrong || input.student_last_wrong_answer,
  );
  const correctAnswer = norm(input.correctAnswer || input.correct_answer);
  const topic = norm(input.topic || '');
  if (!prompt || !studentAnswer || !correctAnswer) return null;
  if (isPlaceholderBlank(studentAnswer) || isNoPick(studentAnswer)) return null;
  const attempt = {
    prompt,
    question: prompt,
    studentAnswer,
    correctAnswer,
    topic,
    hint: input.hint,
  };
  if (
    !canDescribeScientifically(studentAnswer, attempt, 'student') ||
    !canDescribeScientifically(correctAnswer, attempt, 'correct')
  ) {
    return null;
  }
  const lesson = composeFiveStepLesson(attempt, voice);
  if (!validateStructuredLesson(lesson)) return null;
  return lesson;
}

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

