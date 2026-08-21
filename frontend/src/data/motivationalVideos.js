/**
 * Interactive motivational stories matched to frustration bands.
 * Tap-to-advance narration + choice moments — no external video.
 */
import {
  FRUSTRATION_LEVELS,
  frustrationLevelFromScore,
  frustrationLevelLabel,
} from './frustrationModel.js';

/** @type {readonly object[]} */
export const MOTIVATIONAL_SKETCHES = Object.freeze([
  {
    id: 'edison-persist',
    person: 'Thomas Edison',
    era: 'past',
    field: 'Invention',
    frustrationLevels: [FRUSTRATION_LEVELS.HIGH, FRUSTRATION_LEVELS.VERY_HIGH],
    title: 'A thousand dark lamps',
    message:
      'Edison treated each failed trial as useful data — not a verdict on his ability.',
    linkReason:
      'High frustration often means many retries. Edison’s path shows that repeats can be progress.',
    accent: '#c9a227',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '💡',
        title: 'The dream',
        text: 'Young Edison wanted a light that would not die when night fell.',
      },
      {
        type: 'narrate',
        mood: 'struggle',
        icon: '⚡',
        title: 'The struggle',
        text: 'Filament after filament failed. People laughed. He wrote every miss in a notebook.',
      },
      {
        type: 'choice',
        mood: 'struggle',
        icon: '❓',
        title: 'Your move',
        text: 'If your experiment failed for the 100th time, what would you do?',
        choices: [
          {
            id: 'quit',
            label: 'I’d feel done for today',
            reply:
              'Fair. Edison rested too — then returned. Stopping to breathe is not quitting.',
          },
          {
            id: 'note',
            label: 'I’d write what didn’t work',
            reply:
              'That’s Edison’s move. Every “wrong” answer can become a map.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'turn',
        icon: '📓',
        title: 'The lesson',
        text: '“I have not failed. I have found what will not work.”',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'Your retries in this level are data — not a label on you.',
        choices: [
          { id: 'ready', label: 'I’m ready for the next level', reply: null },
          { id: 'try', label: 'I’ll treat mistakes as clues', reply: null },
        ],
      },
    ],
  },
  {
    id: 'curie-perseverance',
    person: 'Marie Curie',
    era: 'past',
    field: 'Physics & Chemistry',
    frustrationLevels: [FRUSTRATION_LEVELS.HIGH, FRUSTRATION_LEVELS.MODERATE],
    title: 'Glow in a cold shed',
    message:
      'Curie worked through poverty and doubt to open new scientific frontiers.',
    linkReason:
      'When learning feels unfairly hard, Curie’s story models quiet, stubborn curiosity.',
    accent: '#7eb8ff',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '🧳',
        title: 'Beginning',
        text: 'Marie left home with almost nothing but questions she refused to drop.',
      },
      {
        type: 'narrate',
        mood: 'struggle',
        icon: '🔬',
        title: 'Hard work',
        text: 'In a drafty shed she stirred tons of ore — day after freezing day.',
      },
      {
        type: 'choice',
        mood: 'struggle',
        icon: '❓',
        title: 'Your move',
        text: 'When people doubt you can do science, what helps most?',
        choices: [
          {
            id: 'prove',
            label: 'Keep measuring anyway',
            reply: 'Curie did exactly that. Proof is quieter than arguments.',
          },
          {
            id: 'ally',
            label: 'Find one person who believes',
            reply: 'Support matters. Curie also leaned on partners who respected the work.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '🌟',
        title: 'Discovery',
        text: 'Radium glowed. Two Nobel Prizes later, the world glowed with her.',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'Hard levels do not erase curiosity. They train it.',
        choices: [
          { id: 'ready', label: 'Keep my curiosity', reply: null },
          { id: 'try', label: 'One careful try at a time', reply: null },
        ],
      },
    ],
  },
  {
    id: 'einstein-school',
    person: 'Albert Einstein',
    era: 'past',
    field: 'Physics',
    frustrationLevels: [FRUSTRATION_LEVELS.MODERATE, FRUSTRATION_LEVELS.HIGH],
    title: 'The slow student who raced light',
    message:
      'Einstein struggled with rigid schooling — yet kept asking his own questions.',
    linkReason:
      'Feeling “slow” is not the same as being unable. Einstein shows pace ≠ potential.',
    accent: '#9ad0ff',
    steps: [
      {
        type: 'narrate',
        mood: 'struggle',
        icon: '📚',
        title: 'School',
        text: 'Teachers called him quiet, stubborn, even slow.',
      },
      {
        type: 'narrate',
        mood: 'hope',
        icon: '🧠',
        title: 'Curiosity',
        text: 'At home he chased thought experiments no exam asked for.',
      },
      {
        type: 'choice',
        mood: 'turn',
        icon: '❓',
        title: 'Your move',
        text: 'If a quiz feels slower than classmates, what is still true?',
        choices: [
          {
            id: 'pace',
            label: 'My pace is still learning',
            reply: 'Yes. Einstein’s breakthroughs came from patient wondering.',
          },
          {
            id: 'ask',
            label: 'I can ask better questions',
            reply: 'That skill is how science moves — not only speed.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '🌌',
        title: 'Breakthrough',
        text: 'From that patience came E=mc² — and a new map of the universe.',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'You do not need to be the fastest to be a thinker.',
        choices: [
          { id: 'ready', label: 'I’ll trust my thinking', reply: null },
          { id: 'try', label: 'I’ll keep asking “why?”', reply: null },
        ],
      },
    ],
  },
  {
    id: 'faraday-self-taught',
    person: 'Michael Faraday',
    era: 'past',
    field: 'Electromagnetism',
    frustrationLevels: [FRUSTRATION_LEVELS.MODERATE, FRUSTRATION_LEVELS.HIGH],
    title: 'Pages before power',
    message:
      'Faraday had little formal schooling and still reshaped physics through practice.',
    linkReason:
      'When mistakes pile up, Faraday’s climb from beginner to expert is a useful mirror.',
    accent: '#e0b35a',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '📖',
        title: 'Start',
        text: 'A bookbinder’s apprentice, he read every science book he bound.',
      },
      {
        type: 'narrate',
        mood: 'struggle',
        icon: '🧪',
        title: 'Apprentice',
        text: 'He cleaned bottles in a lab — watching, failing, learning.',
      },
      {
        type: 'choice',
        mood: 'turn',
        icon: '❓',
        title: 'Your move',
        text: 'You are early in a skill. What’s the honest next step?',
        choices: [
          {
            id: 'practice',
            label: 'Practice one more try',
            reply: 'Faraday’s power came from patient reps, not a perfect start.',
          },
          {
            id: 'watch',
            label: 'Watch carefully, then try',
            reply: 'Observation first — then action. Classic science.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '💡',
        title: 'Legacy',
        text: 'His work on electricity still powers the modern world.',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'Beginners who keep practicing write the future.',
        choices: [
          { id: 'ready', label: 'I’ll keep practicing', reply: null },
          { id: 'try', label: 'I’m allowed to be new', reply: null },
        ],
      },
    ],
  },
  {
    id: 'dweck-growth',
    person: 'Carol Dweck',
    era: 'living',
    field: 'Psychology',
    frustrationLevels: [FRUSTRATION_LEVELS.LOW, FRUSTRATION_LEVELS.MODERATE],
    title: 'The mind that grows',
    message:
      'Dweck’s research shows effort and strategy — not fixed talent — grow skill.',
    linkReason:
      'Low-to-moderate frustration is a good moment to reinforce a growth mindset.',
    accent: '#6bcf8e',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '🔎',
        title: 'Observe',
        text: 'Dweck watched how students talked about hard problems.',
      },
      {
        type: 'choice',
        mood: 'turn',
        icon: '❓',
        title: 'Your move',
        text: 'Which thought helps you learn more?',
        choices: [
          {
            id: 'fixed',
            label: '“I’m just not a science person”',
            reply:
              'That thought closes the door. Dweck found it predicts giving up sooner.',
          },
          {
            id: 'grow',
            label: '“I can get better at this”',
            reply:
              'That’s growth mindset. It keeps practice alive when things get hard.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '🌱',
        title: 'Takeaway',
        text: 'Belief in growth changes how long we stay with a challenge.',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'This level was practice for a stronger next one.',
        choices: [
          { id: 'ready', label: 'I’m growing', reply: null },
          { id: 'try', label: 'Effort counts', reply: null },
        ],
      },
    ],
  },
  {
    id: 'duckworth-grit',
    person: 'Angela Duckworth',
    era: 'living',
    field: 'Psychology',
    frustrationLevels: [FRUSTRATION_LEVELS.MODERATE, FRUSTRATION_LEVELS.HIGH],
    title: 'Grit over glitter',
    message:
      'Duckworth’s work links long-term goals with sticking through hard practice.',
    linkReason:
      'When the level felt grinding, grit explains why finishing still matters.',
    accent: '#d4a017',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '🏁',
        title: 'Question',
        text: 'Duckworth studied who finishes hard paths — and who stops.',
      },
      {
        type: 'narrate',
        mood: 'struggle',
        icon: '🧱',
        title: 'Surprise',
        text: 'Talent helped — but quitters with talent still quit.',
      },
      {
        type: 'choice',
        mood: 'turn',
        icon: '❓',
        title: 'Your move',
        text: 'The level felt grinding. What is grit here?',
        choices: [
          {
            id: 'finish',
            label: 'Finish this session’s goal',
            reply: 'Grit is often just the next honest step — not a dramatic speech.',
          },
          {
            id: 'return',
            label: 'Return after a short break',
            reply: 'Rest can be grit too — as long as you return.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '🔥',
        title: 'Insight',
        text: 'Passion + perseverance beat flashy talent alone.',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'You already showed grit by completing the level.',
        choices: [
          { id: 'ready', label: 'On to the shop', reply: null },
          { id: 'try', label: 'I’ll keep showing up', reply: null },
        ],
      },
    ],
  },
  {
    id: 'hawking-resilience',
    person: 'Stephen Hawking',
    era: 'past',
    field: 'Cosmology',
    frustrationLevels: [FRUSTRATION_LEVELS.HIGH, FRUSTRATION_LEVELS.VERY_HIGH],
    title: 'Stars beyond the wheelchair',
    message:
      'Hawking faced extreme barriers and still pursued cosmic questions.',
    linkReason:
      'Very high frustration can feel like a wall. Hawking’s life reframes walls as detours.',
    accent: '#8ab4ff',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '🌌',
        title: 'Dream',
        text: 'As a young physicist he fell in love with black holes and time.',
      },
      {
        type: 'narrate',
        mood: 'struggle',
        icon: '🌊',
        title: 'Barrier',
        text: 'Illness stole easy speech and movement — not his mind.',
      },
      {
        type: 'choice',
        mood: 'turn',
        icon: '❓',
        title: 'Your move',
        text: 'When the path gets blocked, what still belongs to you?',
        choices: [
          {
            id: 'mind',
            label: 'My questions',
            reply: 'Hawking kept asking the universe questions anyway.',
          },
          {
            id: 'adapt',
            label: 'A new way to try',
            reply: 'He adapted tools. Adaptation is intelligence in action.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '📘',
        title: 'Reach',
        text: 'A Brief History of Time carried his curiosity to millions.',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'A hard level is a barrier — not the end of your story.',
        choices: [
          { id: 'ready', label: 'I’ll adapt and continue', reply: null },
          { id: 'try', label: 'My mind still works', reply: null },
        ],
      },
    ],
  },
  {
    id: 'johnson-hidden-figures',
    person: 'Katherine Johnson',
    era: 'past',
    field: 'Mathematics / NASA',
    frustrationLevels: [FRUSTRATION_LEVELS.MODERATE, FRUSTRATION_LEVELS.HIGH],
    title: 'Numbers that flew',
    message:
      'Johnson’s precise math powered missions while she faced systemic barriers.',
    linkReason:
      'Hard quizzes are temporary; careful thinking still moves the mission forward.',
    accent: '#6ec6ff',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '🧮',
        title: 'Gift',
        text: 'Katherine loved numbers the way pilots love the sky.',
      },
      {
        type: 'narrate',
        mood: 'struggle',
        icon: '🚪',
        title: 'Barrier',
        text: 'Doors closed because of race and gender. She calculated anyway.',
      },
      {
        type: 'choice',
        mood: 'turn',
        icon: '❓',
        title: 'Your move',
        text: 'What makes careful work powerful?',
        choices: [
          {
            id: 'check',
            label: 'Checking again',
            reply: 'Astronauts trusted her because she checked — then checked again.',
          },
          {
            id: 'calm',
            label: 'Staying calm under pressure',
            reply: 'Calm precision is a superpower in science and in quizzes.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '🚀',
        title: 'Legacy',
        text: 'Moon missions rose on the quiet courage of correct work.',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'Your careful answers matter — even when no one cheers yet.',
        choices: [
          { id: 'ready', label: 'I’ll stay precise', reply: null },
          { id: 'try', label: 'Quiet work still counts', reply: null },
        ],
      },
    ],
  },
  {
    id: 'tu-youyou',
    person: 'Tu Youyou',
    era: 'living',
    field: 'Medicine',
    frustrationLevels: [FRUSTRATION_LEVELS.HIGH, FRUSTRATION_LEVELS.VERY_HIGH],
    title: 'Two hundred tries',
    message:
      'Tu screened hundreds of approaches before a breakthrough against malaria.',
    linkReason:
      'Many wrong answers before a right one is how real research often works.',
    accent: '#5fbf8a',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '🌿',
        title: 'Search',
        text: 'Tu searched ancient texts for a clue against a deadly fever.',
      },
      {
        type: 'narrate',
        mood: 'struggle',
        icon: '🧪',
        title: 'Fail forward',
        text: 'Extract after extract failed. She numbered them and continued.',
      },
      {
        type: 'choice',
        mood: 'turn',
        icon: '❓',
        title: 'Your move',
        text: 'You missed several questions this level. What does research say?',
        choices: [
          {
            id: 'normal',
            label: 'Wrong tries are normal',
            reply: 'Tu’s breakthrough came near try two hundred. Science is a long count.',
          },
          {
            id: 'next',
            label: 'The next try can be different',
            reply: 'Yes — change one variable, try again. That’s the method.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '💚',
        title: 'Gift',
        text: 'Artemisinin saved countless lives — born from patient retries.',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'Your next correct answer can grow from today’s misses.',
        choices: [
          { id: 'ready', label: 'I’ll keep counting tries', reply: null },
          { id: 'try', label: 'Retries are research', reply: null },
        ],
      },
    ],
  },
  {
    id: 'ndgt-curiosity',
    person: 'Neil deGrasse Tyson',
    era: 'living',
    field: 'Astrophysics',
    frustrationLevels: [FRUSTRATION_LEVELS.LOW, FRUSTRATION_LEVELS.MODERATE],
    title: 'Look up',
    message:
      'Tyson models joyful curiosity — learning as exploration, not only grading.',
    linkReason:
      'When frustration is low, keep the spark: curiosity compounds across levels.',
    accent: '#6aa8ff',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '🌠',
        title: 'Spark',
        text: 'A planetarium visit made a boy fall in love with the cosmos.',
      },
      {
        type: 'choice',
        mood: 'turn',
        icon: '❓',
        title: 'Your move',
        text: 'What do you want learning to feel like?',
        choices: [
          {
            id: 'explore',
            label: 'Exploration',
            reply: 'That’s Tyson’s vibe — wonder first, grades second.',
          },
          {
            id: 'share',
            label: 'Something I can explain',
            reply: 'Teaching what you learn locks it in. Cosmic habit.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '🔭',
        title: 'Share',
        text: 'He invites everyone to ask better questions about the universe.',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'Protect your curiosity — it is fuel for every level.',
        choices: [
          { id: 'ready', label: 'Stay curious', reply: null },
          { id: 'try', label: 'Look up and continue', reply: null },
        ],
      },
    ],
  },
  {
    id: 'goodall-patience',
    person: 'Jane Goodall',
    era: 'living',
    field: 'Primatology',
    frustrationLevels: [FRUSTRATION_LEVELS.LOW, FRUSTRATION_LEVELS.MODERATE],
    title: 'Sit still, see more',
    message:
      'Goodall’s discoveries came from long, careful watching — not instant wins.',
    linkReason:
      'Steady sessions beat perfect ones. Patience is a scientific skill.',
    accent: '#7dcf7a',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '🌳',
        title: 'Wait',
        text: 'Jane sat in the forest for months, notebook ready.',
      },
      {
        type: 'choice',
        mood: 'turn',
        icon: '❓',
        title: 'Your move',
        text: 'When progress feels slow, what helps?',
        choices: [
          {
            id: 'patient',
            label: 'Stay patient one more round',
            reply: 'Goodall’s breakthroughs came from staying longer than others.',
          },
          {
            id: 'notice',
            label: 'Notice one small detail',
            reply: 'Science often starts with a tiny, careful observation.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '🐒',
        title: 'See',
        text: 'She saw chimps use tools — rewriting what “human” meant.',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'Slow attention can change the world. Your next try counts.',
        choices: [
          { id: 'ready', label: 'I’ll be patient', reply: null },
          { id: 'try', label: 'Small details matter', reply: null },
        ],
      },
    ],
  },
  {
    id: 'rowling-rejection',
    person: 'J.K. Rowling',
    era: 'living',
    field: 'Writing',
    frustrationLevels: [FRUSTRATION_LEVELS.VERY_HIGH, FRUSTRATION_LEVELS.HIGH],
    title: 'The letter that said no',
    message:
      'Rowling faced repeated rejection before her work found readers.',
    linkReason:
      'Very high frustration after setbacks is common — so is starting again.',
    accent: '#c9a227',
    steps: [
      {
        type: 'narrate',
        mood: 'hope',
        icon: '✍️',
        title: 'Write',
        text: 'She wrote on trains and café tables when life felt heavy.',
      },
      {
        type: 'narrate',
        mood: 'struggle',
        icon: '📭',
        title: 'Rejection',
        text: 'Publisher after publisher sent the same cold “no.”',
      },
      {
        type: 'choice',
        mood: 'turn',
        icon: '❓',
        title: 'Your move',
        text: 'After many “wrong” answers, what is still possible?',
        choices: [
          {
            id: 'again',
            label: 'Send one more try',
            reply: 'She did. The story that changed millions started after “no.”',
          },
          {
            id: 'belief',
            label: 'Believe the work still matters',
            reply: 'Belief does not erase hard days — it funds the next draft.',
          },
        ],
      },
      {
        type: 'narrate',
        mood: 'win',
        icon: '🪄',
        title: 'Yes',
        text: 'A whole world opened — because she did not stop at “no.”',
      },
      {
        type: 'reflect',
        mood: 'win',
        icon: '✨',
        title: 'Carry this forward',
        text: 'Frustration is a chapter, not your whole book.',
        choices: [
          { id: 'ready', label: 'Turn the page', reply: null },
          { id: 'try', label: 'One more try', reply: null },
        ],
      },
    ],
  },
]);

/**
 * @param {{
 *   frustrationScore?: number,
 *   frustrationLevel?: string,
 *   studentId?: string,
 *   levelId?: number,
 * }} opts
 */
export function suggestMotivationalVideo(opts = {}) {
  const score = Math.max(
    0,
    Math.min(100, Math.round(Number(opts.frustrationScore) || 0)),
  );
  const level =
    opts.frustrationLevel || frustrationLevelFromScore(score);
  const pool = MOTIVATIONAL_SKETCHES.filter((v) =>
    v.frustrationLevels.includes(level),
  );
  const list = pool.length ? pool : MOTIVATIONAL_SKETCHES.slice();
  const seed = hashSeed(
    `${opts.studentId || 'student'}|${opts.levelId || 0}|${level}|${score}`,
  );
  const video = list[seed % list.length];

  return {
    score,
    level,
    levelLabel: frustrationLevelLabel(level),
    video,
  };
}

export const MOTIVATIONAL_VIDEOS = MOTIVATIONAL_SKETCHES;

function hashSeed(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}
