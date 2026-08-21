/**
 * Grok/Groq Level 1 storyline generator.
 * Returns validated JSON only — no images, assets, or game objects.
 */
import { chatCompletion, getLlamaConfig } from './llamaClient.mjs';
import {
  CHALLENGE_TYPES,
  CREATURE_IDS,
  PROP_IDS,
  ROLE_POOLS,
} from '../../frontend/src/data/assetLibrary.js';
import { SITUATION_IDS } from '../../frontend/src/storyline/storylineSituations.js';
import {
  buildFallbackStoryline,
  validateStoryline,
  toneForLevel,
  extractJson,
} from '../../frontend/src/storyline/adventureFormat.js';

function buildSystemPrompt() {
  const creatures = CREATURE_IDS.join(', ');
  const props = PROP_IDS.join(', ');
  const types = CHALLENGE_TYPES.join(', ');
  const situations = SITUATION_IDS.join(', ');
  const guide = ROLE_POOLS.guide.join(', ');
  const helper = ROLE_POOLS.helper.join(', ');
  const obstacle = ROLE_POOLS.obstacle.join(', ');
  const climax = ROLE_POOLS.climax.join(', ');

  return `You are a Grade 6–9 science adventure storyline writer for SCI_PATH, a farm / forest learning game.

Write ONE complete game-level adventure. This is not a short scene, not a single event, and not a list of mini-stories. It is one coherent journey from opening to level completion.

OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no commentary, no reasoning, no suggestions, no code, no science questions, no difficulty explanations.
- Do not mention frustration, ability, struggling, weak, smart, or ranks.
- Do not generate quiz items or question text.
- The science topic must live inside the world as story, not as a lesson list.

NARRATIVE ARC (one connected adventure):
Opening Situation → Main Problem → Motivation / Goal → Progression → Discovery → Development → Complication → Escalation → Climax → Resolution → Level Completion

Every stage must follow from the previous stage. The transition field must explain WHY the next stage happens.

STORYLINE JSON SHAPE (required):
{
  "level": 1,
  "title": "string",
  "setting": "string",
  "introduction": "string (where they are, the situation, the first event, why it matters)",
  "mainProblem": "string (ONE central problem that drives the whole level)",
  "mainObjective": "string (what they ultimately must accomplish; stays relevant throughout)",
  "storyProgression": [
    {
      "stage": 1,
      "title": "string",
      "narrative": "string (this stage of the adventure, 1–3 short paragraphs)",
      "objective": "string (what this stage is trying to achieve in the story)",
      "transition": "string (because of what happened here, the next stage begins because...)",
      "creatureId": "optional creatureId from the allowed list",
      "challengeType": "optional: ${types}",
      "propId": "optional propId from the allowed list",
      "situation": "optional visual situation from the allowed list — MUST match this stage's event (example: a dying flower → wilted_flower)"
    },
    { "stage": 2, "title": "...", "narrative": "...", "objective": "...", "transition": "..." },
    { "stage": 3, "title": "...", "narrative": "...", "objective": "...", "transition": "..." },
    { "stage": 4, "title": "...", "narrative": "...", "objective": "...", "transition": "..." },
    { "stage": 5, "title": "...", "narrative": "...", "objective": "...", "transition": "..." }
  ],
  "complication": {
    "description": "string (a meaningful turn that grows from the story, not a random twist)",
    "impactOnStory": "string (how this raises the stakes and leads toward the climax)"
  },
  "climax": {
    "description": "string (highest tension; earned by everything before it)",
    "objective": "string",
    "situation": "optional visual situation for the climax"
  },
  "resolution": "string (how the main problem is resolved; earned, not sudden)",
  "ending": "string (clear conclusion, accomplishment, ties back to the original problem, ready for a later level without starting a new story now)",
  "narrativeTone": "exploratory" | "balanced" | "supportive",
  "levelSummary": "string (one short paragraph of the whole adventure)",
  "visuals": {
    "guide": "creatureId from the allowed list (opening companion)",
    "helper": "creatureId (farm helper)",
    "obstacle": "creatureId (complication creature)",
    "climaxCreature": "creatureId (climax encounter)",
    "settingProp": "propId from the allowed list (farm scenery near stage 1)"
  }
}

STAGE MAP (use these narrative jobs, still as story — not gameplay instructions):
- Stage 1: opening situation and first investigation
- Stage 2: discovery that changes what they understand
- Stage 3: development / progress using that discovery
- Stage 4: unexpected development that sets up the complication
- Stage 5: escalation that delivers the student into the climax

Stage 5 transition should lead into the climax, not into a sixth disconnected scene.

QUALITY CHECK BEFORE YOU RETURN:
- One complete adventure, not disconnected scenes
- Main problem stays relevant from start to end
- Each stage advances the story and is caused by the previous stage
- Meaningful complication, clear climax, earned resolution, complete ending
- Appropriate for the given grade
- Science topic is woven into the world
- Story remains interesting

VISUAL IDS (JSON fields only — never describe file paths, images, or sprites):
- Allowed creatureId values: ${creatures}
- Allowed propId values: ${props}
- Allowed challengeType values: ${types}
- Role hints (prefer these pools, still using only allowed IDs):
  - guide: ${guide}
  - helper: ${helper}
  - obstacle: ${obstacle}
  - climax: ${climax}
- Stage 1: guide creature, challengeType "investigate"
- Stage 2: helper creature, challengeType "discover"
- Stage 3: helper creature, challengeType "tend"
- Stage 4: obstacle creature, challengeType "obstacle"
- Stage 5: helper creature, challengeType "tend"
- Climax uses visuals.climaxCreature
- Pick distinct creatureIds across stages when possible
- Allowed situation values: ${situations}
- Each stage MUST pick a situation that visually matches the event in that stage. Examples:
  - a flower is dying, drooping, pale, or thirsty → wilted_flower
  - dry soil, thirsty crops, missing water → dry_crop
  - too much shade, missing sunlight → shaded_plant
  - a broken fence or gap → broken_fence
  - weeds or piles blocking bees / a path → blocked_path
  - a hungry animal or empty trough → hungry_animal
  - a diverted stream or water that cannot reach roots → diverted_water
  - a sprout or seedling that needs to grow → young_sprout
- The game turns that situation into an interactive scene. Do not write quiz questions.

FRUSTRATION ADAPTATION (tone and complexity only — same adventure type):
- LOW / MILD: more layered progression, more exploration, more uncertainty, richer connections
- MODERATE: balanced complexity, clear path, moderate uncertainty
- HIGH / VERY_HIGH: clearer progression, supportive tone, less extra complexity, more predictable development — still a full adventure, never a tiny event`;
}

const SYSTEM = buildSystemPrompt();

function buildUserPrompt(body = {}) {
  const indicators = Array.isArray(body.dominantIndicators)
    ? body.dominantIndicators
    : [];
  const tone = toneForLevel(body.frustrationLevel);
  return [
    `Student Grade: ${body.grade ?? 7}`,
    `Level: ${body.level ?? 1}`,
    `Science Topic: ${body.scienceTopic || 'Plant Biology'}`,
    `Frustration Score: ${body.frustrationScore}`,
    `Frustration Level: ${body.frustrationLevel}`,
    `Dominant Indicators:\n${
      indicators.length
        ? indicators.map((s) => `- ${s}`).join('\n')
        : '- None significant'
    }`,
    `Normalized Metrics (0–100):\n${JSON.stringify(body.metrics || {}, null, 2)}`,
    `Preferred narrativeTone: ${tone}`,
    `Write ONE complete Level ${body.level ?? 1} adventure in the required JSON shape.`,
    `Use narrativeTone "${tone}". Keep the same kind of farm/forest science adventure; only change complexity and clarity to match frustration.`,
    `Do not output anything except the JSON object.`,
  ].join('\n\n');
}

export async function generateLevelStoryline(body = {}) {
  const level = Number(body.level) || 1;
  const cfg = getLlamaConfig();
  const fallback = buildFallbackStoryline(body);

  if (cfg.provider === 'offline' || cfg.provider === 'fallback') {
    return {
      ok: true,
      storyline: fallback,
      provider: 'offline',
      fallback: true,
    };
  }

  try {
    const result = await chatCompletion({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserPrompt(body) },
      ],
      maxTokens: 3200,
      temperature: 0.7,
      responseFormat: { type: 'json_object' },
    });
    const parsed = validateStoryline(extractJson(result.content), level);
    if (!parsed) {
      return {
        ok: true,
        storyline: fallback,
        provider: 'fallback',
        fallback: true,
        error: 'invalid_json',
      };
    }
    return {
      ok: true,
      storyline: parsed,
      provider: result.provider,
      model: result.model,
      fallback: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: true,
      storyline: fallback,
      provider: 'fallback',
      fallback: true,
      error: message.slice(0, 180),
    };
  }
}
