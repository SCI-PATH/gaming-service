/** Shared adventure storyline shape: validation + fallbacks. */
import {
  DEFAULT_VISUALS,
  isChallengeType,
  isCreatureId,
  isPropId,
  visualsForFrustration,
} from '../data/assetLibrary.js';
import { isSituationId } from './storylineSituations.js';

export function toneForLevel(level) {
  const lv = String(level || '').toUpperCase();
  if (lv === 'LOW' || lv === 'MILD') return 'exploratory';
  if (lv === 'MODERATE') return 'balanced';
  return 'supportive';
}

export function extractJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function field(value, min = 8) {
  const s = String(value || '').trim();
  return s.length >= min ? s : '';
}

function validateStage(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const title = field(raw.title, 3);
  const narrative = field(raw.narrative, 40);
  const objective = field(raw.objective, 8);
  const transition = String(raw.transition || '').trim();
  if (!title || !narrative || !objective) return null;
  const extra = {};
  if (isCreatureId(raw.creatureId)) extra.creatureId = raw.creatureId;
  if (isChallengeType(raw.challengeType)) extra.challengeType = raw.challengeType;
  if (isPropId(raw.propId)) extra.propId = raw.propId;
  if (isSituationId(raw.situation)) extra.situation = raw.situation;
  return {
    stage: Number(raw.stage) || index + 1,
    title,
    narrative,
    objective,
    transition,
    ...extra,
  };
}

function validateVisuals(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    guide: isCreatureId(src.guide) ? src.guide : DEFAULT_VISUALS.guide,
    helper: isCreatureId(src.helper) ? src.helper : DEFAULT_VISUALS.helper,
    obstacle: isCreatureId(src.obstacle) ? src.obstacle : DEFAULT_VISUALS.obstacle,
    climaxCreature: isCreatureId(src.climaxCreature)
      ? src.climaxCreature
      : DEFAULT_VISUALS.climaxCreature,
    settingProp: isPropId(src.settingProp)
      ? src.settingProp
      : DEFAULT_VISUALS.settingProp,
  };
}

/**
 * Accept the full adventure JSON. Reject short / disconnected payloads.
 */
export function validateStoryline(raw, level = 1) {
  if (!raw || typeof raw !== 'object') return null;

  const title = field(raw.title, 3);
  const setting = field(raw.setting || raw.theme, 8);
  const introduction = field(raw.introduction || raw.story, 40);
  const mainProblem = field(raw.mainProblem, 12);
  const mainObjective = field(raw.mainObjective || raw.objective, 8);
  const narrativeTone =
    field(raw.narrativeTone, 3) || toneForLevel('MODERATE');
  const resolution = field(raw.resolution, 20);
  const ending = field(raw.ending, 20);
  const levelSummary = field(raw.levelSummary, 20);

  const stagesSource = Array.isArray(raw.storyProgression)
    ? raw.storyProgression
    : [];
  const storyProgression = stagesSource
    .map((stage, i) => validateStage(stage, i))
    .filter(Boolean);

  const complicationRaw = raw.complication && typeof raw.complication === 'object'
    ? raw.complication
    : {};
  const climaxRaw = raw.climax && typeof raw.climax === 'object' ? raw.climax : {};
  const complication = {
    description: field(complicationRaw.description, 12),
    impactOnStory: field(complicationRaw.impactOnStory, 12),
  };
  const climax = {
    description: field(climaxRaw.description, 12),
    objective: field(climaxRaw.objective, 8),
  };
  if (isSituationId(climaxRaw.situation)) climax.situation = climaxRaw.situation;

  if (!title || !setting || !introduction || !mainProblem || !mainObjective) {
    return null;
  }
  if (storyProgression.length < 5) return null;
  if (!complication.description || !complication.impactOnStory) return null;
  if (!climax.description || !climax.objective) return null;
  if (!resolution || !ending || !levelSummary) return null;

  return {
    level: Number(raw.level) || level || 1,
    title,
    setting,
    introduction,
    mainProblem,
    mainObjective,
    storyProgression: storyProgression.slice(0, 5),
    complication,
    climax,
    resolution,
    ending,
    narrativeTone,
    levelSummary,
    visuals: validateVisuals(raw.visuals),
  };
}

function stage(n, title, narrative, objective, transition, extra = {}) {
  return { stage: n, title, narrative, objective, transition, ...extra };
}

export function buildFallbackStoryline(body = {}) {
  const level = Number(body.level) || 1;
  const topic = body.scienceTopic || 'Plant Biology';
  const fr = String(body.frustrationLevel || 'MODERATE').toUpperCase();
  const name = body.studentName || 'the farmer';
  const tone = toneForLevel(fr);

  if (fr === 'HIGH' || fr === 'VERY_HIGH') {
    return {
      level,
      title: 'The Quiet Flower Path',
      setting: `A small grove beside the farm, where ${topic.toLowerCase()} shows itself in thirsty blossoms and slow bees.`,
      introduction: `${name} steps onto a short, well-marked path at the edge of the farm. A farm guide waits at the first gate and points to a row of pale flowers. The air is still. One blossom droops, then another. Nothing is rushing, but something in the grove is clearly not well, and the flowers cannot wait forever.`,
      mainProblem: `The grove's flowers are fading because they are not getting what they need to live and make food, and if the row fails, the bees will leave.`,
      mainObjective: `Help the grove recover, one clear step at a time, until the flowers can stand and feed the bees again.`,
      storyProgression: [
        stage(
          1,
          'The Pale Row',
          `${name} walks the marked path with the guide. They stop at a single wilted flower instead of trying to fix the whole grove. The soil is dry at the surface. The leaves look tired. The guide asks what a plant might be asking for when it droops like this.`,
          `Notice the first wilted flower and name what seems missing.`,
          `Because the first flower is dry and tired, they need to look more closely at water, light, and care before touching the rest of the row.`,
          { situation: 'wilted_flower' },
        ),
        stage(
          2,
          'What the Plant Needs',
          `Together they check three simple things: sunlight on the leaves, moisture in the soil, and whether bees still visit. The science of ${topic.toLowerCase()} is right here — plants need water and light to make food. The guide never hurries. Each check is one idea, spoken plainly.`,
          `Discover which need is missing for this flower.`,
          `Because the checks show the soil is too dry, the next step is a small, careful watering — not a guess at everything at once.`,
          { situation: 'dry_crop' },
        ),
        stage(
          3,
          'One Helpful Action',
          `${name} waters the first flower slowly. They wait. A leaf lifts a little. The guide smiles and says they will do the same for the next plant only after this one is steady. Progress is visible and kind.`,
          `Give the first flower the missing need and watch it respond.`,
          `Because the first flower improved, they can try the same care on the next two plants in the row.`,
          { situation: 'wilted_flower' },
        ),
        stage(
          4,
          'The Next Two Plants',
          `The next two flowers look similar, but one sits in deeper shade. After watering, that shaded flower still looks dull. Something extra is going on. The guide stays calm: the story is still about helping the row, just with one new detail to notice.`,
          `Apply the same care and notice if one flower still struggles.`,
          `Because the shaded flower did not recover the same way, they must adjust light and water together before the whole row can be saved.`,
          { situation: 'shaded_plant' },
        ),
        stage(
          5,
          'The Row Depends on Both',
          `Now it is clear: most of the row needed water, and the last flower also needed a little more light. The grove is counting on this last choice. If they get it right, the bees will have a reason to return.`,
          `Combine water and light so the last flower can recover.`,
          `Because the last flower is the key to the whole row, the grove's hardest moment is deciding how to help it now.`,
          { situation: 'shaded_plant' },
        ),
      ],
      complication: {
        description: `The last flower sits in shade, so water alone is not enough. The row will still fail if that plant cannot make food.`,
        impactOnStory: `The stakes rise from helping one blossom to saving the whole path for the bees, which leads to the final careful choice.`,
      },
      climax: {
        description: `${name} and the guide open a little more light to the last flower and give it a slow drink. They wait together. This is the moment that decides whether the grove stays alive.`,
        objective: `Help the last flower with both water and light.`,
        situation: 'wilted_flower',
      },
      resolution: `The last flower steadies. The row looks alive again. Bees begin to drift back. The main problem — fading flowers that could not make food — is eased by the same clear needs they discovered at the start.`,
      ending: `${name} leaves the quiet path with a finished grove and a simple truth: plants live when their needs are met. The farm is calm and ready for whatever comes next, without starting a new story today.`,
      narrativeTone: tone,
      levelSummary: `${name} follows a short grove path, learns that fading flowers need water and light, meets a last shaded blossom that needs both, and restores the row so bees can return.`,
      visuals: visualsForFrustration(fr),
    };
  }

  if (fr === 'MODERATE') {
    return {
      level,
      title: 'The Meadow Out of Balance',
      setting: `A split meadow beyond the flower fields, where healthy beds and tired beds sit side by side and ${topic.toLowerCase()} shows in pollen, water, and light.`,
      introduction: `${name} crosses a wooden bridge into a meadow that should be buzzing. Half the blossoms stand bright. The other half look uneven, as if the meadow forgot how to share. A torn page from a farm journal lies on a stone: "If the tired beds fail, the bees will not stay." The first event is small — a bee lifts off a healthy flower and will not land on the pale ones.`,
      mainProblem: `Part of the meadow is no longer supporting flowers and pollinators, so the whole field is drifting out of balance.`,
      mainObjective: `Restore balance across the meadow so flowers and bees can thrive together again.`,
      storyProgression: [
        stage(
          1,
          'Two Kinds of Beds',
          `${name} walks the healthy side first, then the tired side. Color, soil, and insect visits are not the same. The journal asks for careful notes, not speed. Something started this split, and it is still happening.`,
          `Compare the thriving beds with the tired beds and see what differs.`,
          `Because the two sides of the meadow do not match, they must find what the tired flowers are missing before anyone can repair them.`,
          { situation: 'wilted_flower' },
        ),
        stage(
          2,
          'The Missing Piece',
          `A closer look shows dry soil in the tired beds and fewer bees carrying pollen. ${topic} is in the meadow itself: plants need water to move nutrients, and flowers need pollinators to continue. The healthy beds have both. The tired beds have neither working well.`,
          `Discover that water and pollination have fallen out of rhythm on the tired side.`,
          `Because water and bees are both thin on the tired side, the next work is to test one change and watch what the meadow does.`,
          { situation: 'dry_crop' },
        ),
        stage(
          3,
          'A Careful Test',
          `${name} restores moisture to one tired bed and watches. Leaves brighten. A single bee visits. Progress is real, but it is only one bed. The meadow is larger than one experiment, and the journal warns that a single success is not yet balance.`,
          `Test one repair on a tired bed and record the change.`,
          `Because one bed responded, they can carry the same repair farther — until something in the meadow does not behave as expected.`,
          { situation: 'wilted_flower' },
        ),
        stage(
          4,
          'The Bed That Will Not Rise',
          `The next tired bed stays dull even after watering. Pollen clings to nearby healthy flowers but never reaches this patch. A low fence of weeds is blocking the flight path. The problem is still the meadow's balance, now with a new wrinkle that grew from the same story.`,
          `Find why one bed still fails after the first repair.`,
          `Because the blocked path keeps bees away, watering alone cannot finish the work — the meadow's pressure is about to peak.`,
          { situation: 'blocked_path' },
        ),
        stage(
          5,
          'When Water Is Not Enough',
          `Now both needs are visible at once: thirsty soil and a broken pollinator path. If ${name} leaves either one, the tired half of the meadow will fade again by evening. The field is waiting on one complete choice.`,
          `Face both the water gap and the blocked bee path together.`,
          `Because the meadow will not recover unless both parts are restored, the highest moment of the level is here.`,
          { situation: 'broken_fence' },
        ),
      ],
      complication: {
        description: `One bed stays pale after watering because weeds block the bees, so pollination cannot reach the flowers that just got moisture.`,
        impactOnStory: `The goal is no longer a simple drink of water. The meadow's balance depends on reconnecting pollinators, which drives the climax.`,
      },
      climax: {
        description: `${name} clears a narrow path for the bees and tends the last tired bed. For a breath the meadow is silent. Then a bee crosses from the bright side to the pale side, and the two halves of the field are talking again.`,
        objective: `Reconnect pollinators and finish restoring the tired beds.`,
        situation: 'wilted_flower',
      },
      resolution: `Moisture holds. Bees travel both sides. The central problem — a meadow split between thriving and failing flowers — eases because water and pollination work together again.`,
      ending: `${name} closes the journal on the stone. The bridge back to the farm is open, the meadow is one place again, and the original worry about the bees has been answered. The level is complete, ready for a later adventure another day.`,
      narrativeTone: tone,
      levelSummary: `${name} finds a meadow split into healthy and tired beds, learns that water and pollination are out of rhythm, meets a blocked bee path, and restores both so the field can live as one.`,
      visuals: visualsForFrustration(fr),
    };
  }

  return {
    level,
    title: 'The Lost Edge of the Forest',
    setting: `A layered forest edge behind the flower fields — canopy, understory, and a stream — where ${topic.toLowerCase()} hides in roots, light, pollen, and moving water.`,
    introduction: `${name} notices a trail the farm maps do not name. Past the last flower cart, the path slips under older trees. A stream that used to feed the fields sounds thinner. Pioneer plants have claimed a clearing that once held a mix of blossoms and bees. The first event is a fallen marker stone: "Edge Grove — keep the layers living." Someone meant this place to stay connected to the farm, and it is drifting.`,
    mainProblem: `The forest-edge ecosystem is falling out of rhythm — light, water, plants, and pollinators no longer support one another — and the farm's flower fields will feel it if the edge fails.`,
    mainObjective: `Understand how the forest edge works as one system and restore the clearing so the layers live together again.`,
    storyProgression: [
      stage(
        1,
        'Three Layers, One Place',
        `${name} maps what they can see: bright canopy, a dim understory, and a stream that should stitch them together. Birds still call, but fewer bees cross from the farm. The edge is not a backdrop. It is a living machine with missing pieces, and the missing pieces are not yet obvious.`,
          `Enter the unnamed trail and map canopy, understory, and stream.`,
          `Because the three layers do not look equally alive, they must find which relationship broke first — light, water, or the plants between them.`,
          { situation: 'shaded_plant' },
        ),
      stage(
        2,
        'A Pattern in the Clearing',
        `In the clearing, fast-growing pioneer plants crowd the ground. Shade and thirst have pushed other flowers out. Tracing the stream shows less water reaching the roots. ${topic} is not a lecture here; it is the reason some plants win and others vanish when light and water change.`,
          `Discover how light, water, and plant competition reshaped the clearing.`,
          `Because the clearing's new plants are winning for a reason, the next step is to test a change in the system rather than pulling everything up at once.`,
          { situation: 'dry_crop' },
        ),
      stage(
        3,
        'A Change That Helps — Partway',
        `${name} opens a little light and guides a trickle of stream water toward the thirsty roots. A few native blossoms answer. Progress is real, and so is uncertainty: the pioneer plants still hold the center, and the bees still hesitate at the tree line. The system is moving, but it is not whole.`,
          `Begin restoring light and water and watch which plants respond.`,
          `Because a partial repair worked, they push farther into the clearing — and the forest answers in a way they did not expect.`,
          { situation: 'young_sprout' },
        ),
      stage(
        4,
        "The Stream's Hidden Turn",
        `Farther in, the stream is not merely low. A jam of branches has sent water around the clearing instead of through it. The pioneer plants were not a random invasion; they followed the new dry patch. Restoring flowers without the water path would only delay the same ending.`,
          `Uncover why the water left the clearing and how that invited the new plants.`,
          `Because the diverted stream is the hidden engine of the problem, the edge's tension is about to peak: fix the flow, or lose the layers.`,
          { situation: 'diverted_water' },
        ),
      stage(
        5,
        'When the System Pushes Back',
        `Clearing the jam will flood the pioneer patch and feed the native roots — but it will also change the understory in a hurry. The farm's flower fields downstream depend on this choice. The forest edge, the bees, and the stream are one story now, waiting on a single courageous act.`,
          `Face the diverted stream as the key to the whole edge.`,
          `Because every earlier discovery points at the water's true path, the climax is restoring that path.`,
          { situation: 'diverted_water' },
        ),
    ],
    complication: {
      description: `The stream was diverted by a hidden jam, so the clearing dried and pioneer plants took over. A surface fix to the flowers cannot last while the water still goes around them.`,
      impactOnStory: `The adventure shifts from tending plants to restoring the system's water path, which raises the stakes for the farm fields and forces the climax.`,
    },
    climax: {
        description: `${name} frees the jammed branches. Water returns to the clearing in a bright, uncertain rush. Native roots drink. Pioneer plants lose their dry advantage. For a moment the whole edge holds its breath — then bees cross the tree line toward blossoms that have a future again.`,
        objective: `Restore the stream's path so the clearing can live as part of the forest edge.`,
        situation: 'diverted_water',
    },
    resolution: `Light, water, and plants begin to share the clearing again. The main problem — an edge out of rhythm — eases because the relationships that make ${topic.toLowerCase()} work were put back in conversation, not because one plant was forced to win.`,
    ending: `${name} sets the marker stone upright. The unnamed trail has a name again in their mind: a living edge that protects the farm. The adventure is complete. Tomorrow can wait; this level's story has a true end, and the next one can begin later from a healthier grove.`,
    narrativeTone: tone,
    levelSummary: `${name} follows a hidden forest-edge trail, maps failing layers, discovers diverted water behind a pioneer clearing, restores the stream, and brings plants, pollinators, and the farm back into one living system.`,
    visuals: visualsForFrustration(fr),
  };
}
