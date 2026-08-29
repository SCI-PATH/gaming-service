/**
 * Shared SAGE mind-map input: MCQ / True-False stay choice-shaped;
 * Fill-in-the-Blank uses typed text + canonical correct.
 * Run: node --test frontend/src/avatar/normalizeSageMindMapInput.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractFillInStudentAnswer,
  normalizeSageMindMapInput,
  SAGE_QUESTION_TYPES,
} from './normalizeSageMindMapInput.js';
import {
  scienceKeyIdea,
  teachingLessonFromMiss,
} from './explainMisconception.js';
import {
  buildMisconceptionMindMap,
  compactTeachingState,
  composeTutorTurn,
} from './sageTutorLoop.js';

describe('MCQ normalization (must stay choice-based)', () => {
  it('keeps selected option text and correct option text', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'MCQ',
      question: 'Which gas is required for photosynthesis?',
      options: ['Oxygen', 'Helium', 'Carbon dioxide', 'Nitrogen'],
      correctIndex: 2,
      selectedText: 'Helium',
      isCorrect: false,
      topic: 'Photosynthesis',
      frustrationScore: 40,
    });
    assert.equal(input.questionType, SAGE_QUESTION_TYPES.MCQ);
    assert.equal(input.studentAnswer, 'Helium');
    assert.equal(input.correctAnswer, 'Carbon dioxide');
    assert.equal(input.isCorrect, false);
    assert.ok(input.options.includes('Helium'));
  });
});

describe('True/False normalization (must stay TRUE/FALSE)', () => {
  it('keeps True/False tokens', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'TrueFalse',
      question: 'Plants use oxygen to make glucose during photosynthesis.',
      options: ['True', 'False'],
      selectedText: 'True',
      correctAnswer: 'False',
      isCorrect: false,
      topic: 'Photosynthesis',
      frustrationScore: 40,
    });
    assert.equal(input.questionType, SAGE_QUESTION_TYPES.TrueFalse);
    assert.equal(input.studentAnswer, 'True');
    assert.equal(input.correctAnswer, 'False');
  });
});

describe('Fill-in-the-Blank normalization', () => {
  const prompt = 'Plants take in ________ during photosynthesis.';

  it('uses the typed student text and canonical correct answer', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'MultiBlank',
      question: prompt,
      studentAnswer: [' Oxygen ', ''],
      selectedText: 'Oxygen | ',
      grade: {
        missed_blanks: { '0': 'carbon dioxide' },
        feedback: 'Incorrect. The blanks are: carbon dioxide.',
        detailed_explanation: 'Expected blanks: carbon dioxide.',
      },
      isCorrect: false,
      topic: 'Photosynthesis',
      concept: 'Gas exchange in photosynthesis',
      frustrationScore: 70,
    });
    assert.equal(input.questionType, SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK);
    assert.equal(input.studentAnswer, 'oxygen');
    assert.equal(input.correctAnswer, 'carbon dioxide');
    assert.equal(input.canonicalCorrectAnswer, 'carbon dioxide');
    assert.equal(input.isCorrect, false);
    assert.equal(input.options.length, 0);
    assert.ok(input.studentAnswer !== undefined && input.correctAnswer !== undefined);
  });

  it('does not read options or selectedIndex', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'FILL_IN_THE_BLANK',
      question: prompt,
      options: ['Oxygen', 'Carbon dioxide'],
      correctIndex: 0,
      selectedIndex: 0,
      selectedOption: 'Oxygen',
      studentAnswer: 'oxygen',
      correctAnswer: 'carbon dioxide',
      isCorrect: false,
    });
    assert.equal(input.studentAnswer, 'oxygen');
    assert.equal(input.correctAnswer, 'carbon dioxide');
    assert.equal(input.canonicalCorrectAnswer, 'carbon dioxide');
    assert.deepEqual(input.options, []);
  });

  it('normalizes spacing and capitalization without replacing the concept', () => {
    const typed = extractFillInStudentAnswer({ studentAnswer: ' Carbon dioxide ' });
    assert.equal(typed, 'carbon dioxide');
    const wrong = extractFillInStudentAnswer({ studentAnswer: 'oxygen' });
    assert.equal(wrong, 'oxygen');
    assert.notEqual(wrong, 'carbon dioxide');
  });

  it('preserves multiple accepted answers and keeps the student text', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'MultiBlank',
      question: prompt,
      studentAnswer: 'CO2',
      acceptedAnswers: ['carbon dioxide', 'CO2', 'COâ‚‚'],
      isCorrect: true,
    });
    assert.equal(input.studentAnswer, 'co2');
    assert.equal(input.canonicalCorrectAnswer, 'carbon dioxide');
    assert.ok(input.acceptedAnswers.includes('carbon dioxide'));
    assert.ok(input.acceptedAnswers.includes('co2'));
  });

  it('feeds the same SAGE mind-map pipeline as MCQ/T/F', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'MultiBlank',
      question: prompt,
      studentAnswer: ['oxygen', ''],
      selectedText: 'oxygen | ',
      correctAnswer: 'carbon dioxide',
      topic: 'Photosynthesis',
      isCorrect: false,
      frustrationScore: 40,
    });
    assert.equal(input.studentAnswer, 'oxygen');
    assert.equal(input.correctAnswer, 'carbon dioxide');
    assert.equal(input.questionType, SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK);

    const lesson = teachingLessonFromMiss(
      {
        prompt,
        studentAnswer: input.studentAnswer,
        correctAnswer: input.correctAnswer,
        topic: 'Photosynthesis',
      },
      { frustrationLevel: 'moderate' },
    );
    assert.ok(lesson?.sections?.length >= 4);
    assert.match(String(lesson.studentAnswer?.concept || ''), /oxygen/i);
    assert.match(String(lesson.correctAnswer?.concept || ''), /carbon dioxide/i);

    const map = buildMisconceptionMindMap(
      {
        questionText: prompt,
        studentAnswer: input.studentAnswer,
        correctAnswer: input.correctAnswer,
        topic: 'Photosynthesis',
        questionType: 'MultiBlank',
        frustrationScore: 40,
      },
      { mindMapComplexity: 'focused', level: 'moderate' },
    );
    assert.equal(map.enabled, true);
    assert.ok(map.nodes.length >= 2);
  });

  it('teaches a 5-blank plant-diversity miss without dumping the answer key', () => {
    const diversityPrompt =
      'Plants exhibit a remarkable diversity in their [____] and [____] which can vary widely in [____] and [____] depending on the species. This diversity allows plants to adapt to different [____].';
    const lesson = teachingLessonFromMiss(
      {
        prompt: diversityPrompt,
        questionType: 'MultiBlank',
        studentAnswer: 'flowers | seeds | colour | number | places',
        correctAnswer: 'leaves | stems | shape | size | environments',
        topic: 'Plant Biology',
      },
      { frustrationLevel: 'moderate' },
    );
    assert.ok(lesson?.sections?.length >= 4);
    const text = String(lesson.fullText || '').toLowerCase();
    assert.match(text, /flower|seed|reproduc/);
    assert.match(text, /leaf|stem|environment|diversity/);
    assert.equal(/this question is asking for leaves/i.test(text), false);
    const idea = scienceKeyIdea({
      prompt: diversityPrompt,
      correctAnswer: 'leaves | stems | shape | size | environments',
      topic: 'Plant Biology',
    });
    assert.equal(/this question is asking for leaves/i.test(String(idea)), false);
  });

  it('teaches a stem-function fill-in without using leaf-and-stem diversity', () => {
    const stemPrompt =
      'The stem of a plant serves multiple functions, including [____], which allows it to maintain its structure and support leaves and flowers. It also plays a crucial role in [____], transporting essential nutrients and water throughout the plant.';
    const lesson = teachingLessonFromMiss(
      {
        prompt: stemPrompt,
        questionType: 'MultiBlank',
        studentAnswer: 'flower | seed | fruits | root',
        correctAnswer: 'support | transport | unbranched | branched',
        topic: 'Plant Biology',
      },
      { frustrationLevel: 'moderate' },
    );
    assert.ok(lesson?.sections?.length >= 4);
    const text = String(lesson.fullText || '').toLowerCase();
    assert.match(text, /flower|seed|reproduc|root/);
    assert.match(text, /support|transport/);
    assert.equal(/leaf and stem diversity/i.test(text), false);
    const idea = scienceKeyIdea({
      prompt: stemPrompt,
      correctAnswer: 'support | transport | unbranched | branched',
      topic: 'Plant Biology',
    });
    assert.equal(/leaf and stem diversity/i.test(String(idea)), false);
    assert.match(String(idea), /support|transport|stem/i);
  });

  it('teaches main plant-part blanks, not leaf-and-stem diversity', () => {
    const partsPrompt =
      "The main parts of a plant include the [____], [____], and [____], which work together to support the plant's growth and reproduction. Each part has distinct functions, such as [____], which transports nutrients, and [____] which is involved in photosynthesis.";
    const lesson = teachingLessonFromMiss(
      {
        prompt: partsPrompt,
        questionType: 'MultiBlank',
        studentAnswer: 'flower | root | fruits | photosyntheis',
        correctAnswer: 'roots | stem | leaves',
        topic: 'Plant Biology',
      },
      { frustrationLevel: 'moderate' },
    );
    assert.ok(lesson?.sections?.length >= 4);
    const text = String(lesson.fullText || '').toLowerCase();
    assert.match(text, /flower|fruit|reproduc/);
    assert.match(text, /root|stem|leaf/);
    assert.equal(/leaf and stem diversity/i.test(text), false);
    const idea = scienceKeyIdea({
      prompt: partsPrompt,
      correctAnswer: 'roots | stem | leaves',
      topic: 'Plant Biology',
    });
    assert.equal(/leaf and stem diversity/i.test(String(idea)), false);
    assert.match(String(idea), /root|stem|leaf|plant part|organ/i);
  });
});

describe('compactTeachingState fill-in path', () => {
  it('does not rewrite typed answers into blank-N labels before SAGE', () => {
    const state = compactTeachingState({
      current_question: {
        question_text: 'Plants take in ________ during photosynthesis.',
        question_type: 'MultiBlank',
        student_last_wrong_answer: 'oxygen | ',
        correct_answer: 'carbon dioxide',
        topic: 'Photosynthesis',
      },
      frustration_score: 70,
    });
    assert.equal(state.studentAnswer, 'oxygen');
    assert.equal(state.correctAnswer, 'carbon dioxide');
    assert.equal(state.questionType, 'MultiBlank');
  });
});

describe('SAGE tutor still teaches fill-in misses', () => {
  it('builds a mind map for an oxygen vs carbon dioxide miss', () => {
    const turn = composeTutorTurn({
      studentMessage: 'explain the idea',
      context: {
        student_profile: { display_name: 'Maya' },
        frustration_score: 70,
        current_question: {
          question_text: 'Plants take in ________ during photosynthesis.',
          question_type: 'FILL_IN_THE_BLANK',
          student_last_wrong_answer: 'oxygen',
          correct_answer: 'carbon dioxide',
          topic: 'Photosynthesis',
        },
        intervention_focus: {
          concept_topic: 'Photosynthesis',
          conversation_session: { phase: 'support', student_reason_key: 'mixes_ideas' },
        },
      },
      session: {
        phase: 'support',
        student_reason_key: 'mixes_ideas',
        student_name: 'Maya',
        evidence: {
          farm_question: 'Plants take in ________ during photosynthesis.',
          last_wrong: 'oxygen',
          correct_answer: 'carbon dioxide',
        },
      },
    });
    assert.equal(turn.structured.assessment.studentAnswer, 'oxygen');
    assert.equal(turn.structured.assessment.correctAnswer, 'carbon dioxide');
    assert.ok(turn.structured.mindMap.nodes.length >= 2);
    assert.equal(turn.nextAction !== 'INSUFFICIENT_KNOWLEDGE', true);
  });
});

describe('Typed Answer normalization (must NOT use fill-in or MCQ)', () => {
  const prompt = 'Explain why plants need sunlight for photosynthesis.';

  it('keeps the student sentence and the model answer', () => {
    const student =
      'Plants need sunlight because it gives them energy to make food.';
    const input = normalizeSageMindMapInput({
      questionType: 'ShortAnswer',
      question: prompt,
      studentAnswer: student,
      selectedText: student,
      grade: {
        ideal_answer:
          'Plants use sunlight as an energy source during photosynthesis.',
        accuracy_score: 0.9,
        is_correct: true,
        missing_keywords: [],
      },
      isCorrect: true,
      topic: 'Photosynthesis',
      concept: 'Role of sunlight in photosynthesis',
      frustrationScore: 40,
    });
    assert.equal(input.questionType, SAGE_QUESTION_TYPES.TYPED_ANSWER);
    assert.equal(input.studentAnswer, student);
    assert.match(input.correctAnswer, /sunlight|energy|photosynthesis/i);
    assert.equal(input.options.length, 0);
    assert.equal(input.studentAnswer.toLowerCase() === input.studentAnswer, false);
  });

  it('does not lowercase, split, or replace the typed response', () => {
    const long =
      'Oxygen because plants need oxygen to make food, and that is why I think the gas they take in is oxygen.';
    const input = normalizeSageMindMapInput({
      questionType: 'TYPED_ANSWER',
      question: 'What gas do plants take in during photosynthesis?',
      studentAnswer: long,
      options: ['Oxygen', 'Carbon dioxide'],
      correctIndex: 1,
      selectedIndex: 0,
      grade: { ideal_answer: 'Carbon dioxide' },
      isCorrect: false,
    });
    assert.equal(input.studentAnswer, long);
    assert.equal(input.correctAnswer, 'Carbon dioxide');
    assert.equal(input.studentAnswer.includes('|'), false);
  });

  it('treats CO2 wording as the same scientific idea as carbon dioxide', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'ShortAnswer',
      question: 'What gas do plants take in during photosynthesis?',
      studentAnswer: 'CO2 is absorbed by plants',
      correctAnswer: 'carbon dioxide',
      isCorrect: true,
    });
    assert.equal(input.studentAnswer, 'CO2 is absorbed by plants');
    assert.match(input.correctAnswer, /carbon dioxide/i);
  });

  it('marks a sunlight-only photosynthesis answer as partial', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'ShortAnswer',
      question: 'What is photosynthesis?',
      studentAnswer: 'Plants use sunlight to make food.',
      grade: {
        ideal_answer:
          'Photosynthesis is how plants make glucose from carbon dioxide and water using light.',
        accuracy_score: 0.55,
        error_category: 'MISSING_KEYWORDS',
        missing_keywords: ['carbon dioxide', 'water'],
      },
      isCorrect: false,
      topic: 'Photosynthesis',
    });
    assert.equal(input.completeness, 'partial');
    assert.equal(input.studentAnswer, 'Plants use sunlight to make food.');
  });
});

describe('Typed Answer SAGE teaching', () => {
  it('teaches an incorrect oxygen sentence without requiring exact wording', () => {
    const prompt = 'What gas do plants take in during photosynthesis?';
    const student = 'Oxygen because plants need oxygen to make food.';
    const input = normalizeSageMindMapInput({
      questionType: 'ShortAnswer',
      question: prompt,
      studentAnswer: student,
      grade: { ideal_answer: 'Carbon dioxide' },
      isCorrect: false,
      topic: 'Photosynthesis',
    });
    const lesson = teachingLessonFromMiss(
      {
        prompt,
        questionType: input.questionType,
        studentAnswer: input.studentAnswer,
        correctAnswer: input.correctAnswer,
        topic: 'Photosynthesis',
      },
      { frustrationLevel: 'moderate' },
    );
    assert.ok(lesson?.sections?.length >= 4);
    const text = String(lesson.fullText || '').toLowerCase();
    assert.match(text, /oxygen/);
    assert.match(text, /carbon dioxide|co2/);
    assert.equal(/your answer is wrong\. the correct answer is carbon dioxide/i.test(text), false);
    const map = buildMisconceptionMindMap(
      {
        questionText: prompt,
        studentAnswer: input.studentAnswer,
        correctAnswer: input.correctAnswer,
        topic: 'Photosynthesis',
        questionType: 'ShortAnswer',
        frustrationScore: 40,
      },
      { mindMapComplexity: 'focused', level: 'moderate' },
    );
    assert.equal(map.enabled, true);
    assert.ok(map.nodes.length >= 2);
  });

  it('recognizes a partially correct photosynthesis sentence', () => {
    const prompt = 'What is photosynthesis?';
    const student = 'Plants use sunlight to make food.';
    const lesson = teachingLessonFromMiss(
      {
        prompt,
        questionType: 'TYPED_ANSWER',
        studentAnswer: student,
        correctAnswer:
          'Photosynthesis is the process by which plants use light energy to make glucose from carbon dioxide and water.',
        completeness: 'partial',
        missingKeywords: ['carbon dioxide', 'water'],
        topic: 'Photosynthesis',
      },
      { frustrationLevel: 'moderate' },
    );
    assert.ok(lesson?.sections?.length >= 4);
    const text = String(lesson.fullText || '').toLowerCase();
    assert.match(text, /sunlight|right track|correctly identified/);
    assert.match(text, /carbon dioxide|water/);
  });

  it('recognizes a conceptually correct paraphrase', () => {
    const prompt = 'Explain why plants need sunlight for photosynthesis.';
    const student = 'Sunlight gives plants the energy they need to make food.';
    const input = normalizeSageMindMapInput({
      questionType: 'ShortAnswer',
      question: prompt,
      studentAnswer: student,
      correctAnswer: 'Plants use sunlight as an energy source during photosynthesis.',
      isCorrect: true,
      topic: 'Photosynthesis',
    });
    assert.equal(input.studentAnswer, student);
    assert.equal(input.completeness, 'correct');
    const lesson = teachingLessonFromMiss(
      {
        prompt,
        questionType: input.questionType,
        studentAnswer: input.studentAnswer,
        correctAnswer: input.correctAnswer,
        topic: 'Photosynthesis',
      },
      { frustrationLevel: 'moderate' },
    );
    assert.ok(lesson?.sections?.length >= 4);
    const text = String(lesson.fullText || '').toLowerCase();
    assert.match(text, /sunlight|energy/);
  });

  it('preserves a short typed answer and a long typed answer', () => {
    const short = normalizeSageMindMapInput({
      questionType: 'ShortAnswer',
      question: 'What gas do plants take in during photosynthesis?',
      studentAnswer: 'CO2',
      correctAnswer: 'carbon dioxide',
      isCorrect: true,
    });
    assert.equal(short.studentAnswer, 'CO2');
    const longText =
      'Plants take in carbon dioxide from the air so they can use it, together with water and sunlight, to make food during photosynthesis.';
    const long = normalizeSageMindMapInput({
      questionType: 'typed',
      question: 'What is photosynthesis?',
      studentAnswer: longText,
      correctAnswer:
        'Photosynthesis is how plants make glucose from carbon dioxide and water using light.',
      isCorrect: true,
    });
    assert.equal(long.studentAnswer, longText);
  });
});

describe('compactTeachingState typed path', () => {
  it('does not rewrite a typed sentence into fill-in tokens', () => {
    const sentence = 'Oxygen because plants need oxygen to make food.';
    const state = compactTeachingState({
      current_question: {
        question_text: 'What gas do plants take in during photosynthesis?',
        question_type: 'ShortAnswer',
        student_last_wrong_answer: sentence,
        correct_answer: 'Carbon dioxide',
        topic: 'Photosynthesis',
      },
      frustration_score: 65,
    });
    assert.equal(state.studentAnswer, sentence);
    assert.equal(state.correctAnswer, 'Carbon dioxide');
    assert.equal(state.questionType, 'ShortAnswer');
  });
});

describe('SAGE tutor still teaches typed-answer misses', () => {
  it('builds a mind map for a typed oxygen vs carbon dioxide miss', () => {
    const turn = composeTutorTurn({
      studentMessage: 'explain the idea',
      context: {
        student_profile: { display_name: 'Maya' },
        frustration_score: 65,
        current_question: {
          question_text: 'What gas do plants take in during photosynthesis?',
          question_type: 'ShortAnswer',
          student_last_wrong_answer:
            'Oxygen because plants need oxygen to make food.',
          correct_answer: 'Carbon dioxide',
          topic: 'Photosynthesis',
        },
        intervention_focus: {
          concept_topic: 'Photosynthesis',
          conversation_session: { phase: 'support', student_reason_key: 'mixes_ideas' },
        },
      },
      session: {
        phase: 'support',
        student_reason_key: 'mixes_ideas',
        student_name: 'Maya',
        evidence: {
          farm_question: 'What gas do plants take in during photosynthesis?',
          last_wrong: 'Oxygen because plants need oxygen to make food.',
          correct_answer: 'Carbon dioxide',
        },
      },
    });
    assert.equal(
      turn.structured.assessment.studentAnswer,
      'Oxygen because plants need oxygen to make food.',
    );
    assert.equal(turn.structured.assessment.correctAnswer, 'Carbon dioxide');
    assert.ok(turn.structured.mindMap.nodes.length >= 2);
    assert.equal(turn.nextAction !== 'INSUFFICIENT_KNOWLEDGE', true);
  });
});
