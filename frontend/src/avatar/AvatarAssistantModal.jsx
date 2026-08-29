/**
 * Personalized AI Learning Companion — tier dialogue, incorrect-answer maps, fresh sessions.
 * Active modal never shows prior chat or history maps; history lives in a separate drawer.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AVATAR_MOODS,
  INTERVENTION_MODES,
} from './avatarConstants.js';
import { buildContextPayload } from './buildContextPayload.js';
import { streamAvatarChat } from './avatarChatClient.js';
import {
  createRealtimeSpeechCapture,
  ensureMicrophonePermission,
} from './createRealtimeSpeechCapture.js';
import {
  buildMindMapNarration,
  buildMissCardNarration,
  buildSubtitleCues,
  createSpeechEngine,
  cueAtWordIndex,
  uniqueHighlightTerms,
} from './createSpeechEngine.js';
import ConceptMindMap from './ConceptMindMap.jsx';
import SageAvatar from './SageAvatar.jsx';
import SageLessonPanel from './SageLessonPanel.jsx';
import {
  formatLessonSpeech,
  teachingLessonFromMiss,
} from './explainMisconception.js';
import MindMapHistoryDrawer from './MindMapHistoryDrawer.jsx';
import { buildPersonalizedMindMap } from './buildMindMap.js';
import {
  classifyPerformanceTier,
  shouldGenerateMindMap,
} from './performanceTier.js';
import { recordIncorrectMindMap } from './mindMapHistoryStore.js';
import {
  buildFocusedSpokenOpener,
  buildInterventionFocus,
  describeFocusCode,
} from './interventionFocus.js';
import {
  asQuestionText,
  friendlyStudentName,
  friendlyWhyOpened,
  sanitizeKidSpeech,
  softProviderNote,
} from './kidFriendlySpeech.js';
import {
  freezeInterventionSession,
  resolvePerformanceReply,
  sessionToFocusPatch,
} from './mentorConversationSession.js';
import {
  formatDiagnosticText,
  getBehaviorProbe,
} from './behaviorDiagnostics.js';
import { inferConceptFromText } from './conceptMaps.js';
import { handoffToSocrates } from '../data/socratesHandoff.js';

function choiceText(opt) {
  if (opt == null) return '';
  if (typeof opt === 'string') return opt.replace(/\s+/g, ' ').trim();
  return String(opt.text || opt.label || opt.value || opt.option || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameChoice(a, b) {
  const x = choiceText(a)
    .replace(/^\(?[A-Da-d]\)?[.)]\s+/, '')
    .toLowerCase();
  const y = choiceText(b)
    .replace(/^\(?[A-Da-d]\)?[.)]\s+/, '')
    .toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 8 && y.length >= 8 && (x.includes(y) || y.includes(x))) return true;
  return false;
}

function quizChoicesForMiss(miss) {
  if (!miss) return [];
  const raw = miss.options || miss.attempt?.options || [];
  const labels = (Array.isArray(raw) ? raw : []).map(choiceText).filter(Boolean);
  const student = choiceText(miss.studentAnswer);
  const correct = choiceText(miss.correctAnswer);
  if (labels.length) {
    return labels.map((text, i) => ({
      letter: String.fromCharCode(65 + i),
      text,
      isStudent: sameChoice(text, student),
      isCorrect: sameChoice(text, correct),
    }));
  }
  if (/^(true|false|t|f)$/i.test(student) || /^(true|false|t|f)$/i.test(correct)) {
    return ['True', 'False'].map((text) => ({
      letter: text[0],
      text,
      isStudent: sameChoice(text, student),
      isCorrect: sameChoice(text, correct),
    }));
  }
  const rows = [];
  if (student) {
    rows.push({ letter: '', text: student, isStudent: true, isCorrect: false });
  }
  if (correct && !sameChoice(correct, student)) {
    rows.push({ letter: '', text: correct, isStudent: false, isCorrect: true });
  }
  return rows;
}

function ActiveMissQuiz({ miss }) {
  if (!miss) return null;
  const question = asQuestionText(miss.prompt || miss.question, 280);
  const choices = quizChoicesForMiss(miss);
  if (!question && !choices.length) return null;
  return (
    <div className="avatar-active-miss" aria-label="This miss">
      <p className="avatar-active-miss-kicker">
        {miss.index ? `Miss ${miss.index}` : 'This miss'}
        {miss.topic ? ` · ${miss.topic}` : ''}
      </p>
      {question ? <p className="avatar-active-miss-q">{question}</p> : null}
      {choices.length ? (
        <ul className="avatar-active-miss-choices">
          {choices.map((c, i) => (
            <li
              key={`${c.letter || i}-${c.text.slice(0, 24)}`}
              className={
                c.isStudent ? 'is-yours' : c.isCorrect ? 'is-ok' : ''
              }
            >
              {c.letter ? (
                <span className="avatar-active-miss-letter">{c.letter}</span>
              ) : null}
              <span className="avatar-active-miss-text">{c.text}</span>
              {c.isStudent ? (
                <em>Your pick</em>
              ) : c.isCorrect ? (
                <em>Correct</em>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function AvatarAssistantModal({
  open = false,
  student = null,
  farm = {},
  gameplay = {},
  quiz = null,
  telemetry = {},
  metrics = null,
  triggerReason = null,
  interventionMode = null,
  perceivedState = null,
  scenario = null,
  offerMindMap: offerMindMapProp = null,
  misconceptions = [],
  learningPrefs = null,
  mindMap: mindMapProp = null,
  onLearningMessage = null,
  onShowMindMap = null,
  onClose,
}) {
  const titleId = useId();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const abortRef = useRef(null);
  const speechRef = useRef(null);
  const ttsRef = useRef(null);
  const captureBaseRef = useRef('');
  const autoFetchedRef = useRef(false);
  const narratedMapKeyRef = useRef('');
  const mutedRef = useRef(false);
  /** Always points at latest sendMessage (mic stop-to-send). */
  const sendMessageRef = useRef(null);
  /** Latest chat log for API history (avoids stale closures). */
  const messagesRef = useRef([]);
  /** Increments so in-flight requests can be superseded without dropping busy early. */
  const sendGenRef = useRef(0);
  const busyRef = useRef(false);
  /** Track open sessions so telemetry churn doesn't wipe an in-progress conversation. */
  const conversationSessionRef = useRef(0);
  const lastOpenSessionRef = useRef(0);
  /** Frozen performance intervention cause for this open (does not re-rank mid-chat). */
  const performanceSessionRef = useRef(null);

  const resolvedMode =
    interventionMode ||
    telemetry.lastInterventionMode ||
    INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD;

  const resolvedScenario =
    scenario || telemetry.scenario || null;

  const m = metrics || telemetry.metrics || {};
  const evaluatedTier = useMemo(
    () =>
      m.evaluated_tier ||
      classifyPerformanceTier(m, {
        band: farm?.performanceBand || gameplay?.band,
      }),
    [m, farm?.performanceBand, gameplay?.band],
  );

  const interventionFocus = useMemo(() => {
    const fromTrigger =
      telemetry.intervention_focus || metrics?.intervention_focus || null;
    const name =
      friendlyStudentName(student?.displayName || student?.username) ||
      'friend';
    // Always rebuild from live misconceptions + quiz so concept is never empty/generic
    return buildInterventionFocus({
      scenarioCode:
        fromTrigger?.code ||
        fromTrigger?.focus_code ||
        telemetry.non_wrong_scenario_code ||
        telemetry.scenarioCode ||
        metrics?.non_wrong_scenario_code,
      reason: triggerReason || fromTrigger?.problem_statement,
      scenario: resolvedScenario || fromTrigger?.scenario,
      indicators: fromTrigger?.indicators || [],
      misconceptions,
      quiz,
      mindMap: mindMapProp || telemetry.mindMap,
      lastWrongAnswer:
        telemetry.lastWrongAnswer || fromTrigger?.last_wrong_answer || null,
      correctAnswer:
        telemetry.lastCorrectAnswer ||
        fromTrigger?.correct_answer ||
        quiz?.correctAnswer ||
        null,
      metrics: {
        ...m,
        evaluated_tier: null,
      },
      priorFocus: fromTrigger,
      isEscalation:
        String(fromTrigger?.code || '').includes('ESCALAT') ||
        fromTrigger?.assistance_level === 'escalated',
      compoundSignals: fromTrigger?.compound_signals || [],
      studentName: name,
    });
  }, [
    telemetry.intervention_focus,
    telemetry.non_wrong_scenario_code,
    telemetry.scenarioCode,
    telemetry.mindMap,
    telemetry.lastWrongAnswer,
    metrics?.intervention_focus,
    metrics?.non_wrong_scenario_code,
    triggerReason,
    resolvedScenario,
    misconceptions,
    quiz,
    mindMapProp,
    m,
    student?.displayName,
    student?.username,
  ]);

  const shouldOfferMap = useMemo(() => {
    if (interventionFocus?.require_mind_map) return true;
    if (typeof offerMindMapProp === 'boolean' && offerMindMapProp) return true;
    if (telemetry.offerMindMap === true) return true;
    const code = String(
      interventionFocus?.code ||
        interventionFocus?.underlying_code ||
        telemetry.non_wrong_scenario_code ||
        telemetry.scenarioCode ||
        '',
    ).toUpperCase();
    // Wrong / concept struggle always warrants the incorrect-answer mind map
    if (
      code.includes('REPEATED_WRONG') ||
      code.includes('SAME_CONCEPT') ||
      code.includes('SLOW_AND_WRONG') ||
      code.includes('CONCEPT')
    ) {
      return (misconceptions?.length || 0) > 0 || Number(m.incorrect_answers) > 0;
    }
    const reason = String(triggerReason || '').toLowerCase();
    if (
      reason.includes('incorrect') ||
      reason.includes('misconception') ||
      reason.includes('repeated')
    ) {
      return (misconceptions?.length || 0) > 0 || Number(m.incorrect_answers) > 0;
    }
    // Pure delay/pause without concept map — no mind map
    if (
      code.includes('SLOW_ANSWERS') ||
      code.includes('LONG_PAUSE') ||
      code.includes('HINT_USAGE') ||
      code.includes('SELECTION_SWITCH')
    ) {
      if (!code.includes('WRONG') && !code.includes('CONCEPT')) return false;
    }
    const incorrect =
      Number(m.incorrect_answers ?? m.answer_accuracy_counts?.incorrect) || 0;
    return shouldGenerateMindMap({
      interventionMode: resolvedMode,
      triggerReason,
      scenario: resolvedScenario,
      incorrectCount: incorrect,
      misconceptionCount: misconceptions?.length || 0,
      offerMindMap:
        typeof offerMindMapProp === 'boolean'
          ? offerMindMapProp
          : typeof telemetry.offerMindMap === 'boolean'
            ? telemetry.offerMindMap
            : undefined,
    });
  }, [
    m,
    resolvedMode,
    triggerReason,
    resolvedScenario,
    misconceptions,
    offerMindMapProp,
    telemetry.offerMindMap,
    telemetry.non_wrong_scenario_code,
    telemetry.scenarioCode,
    interventionFocus,
  ]);

  const nonWrongCode = useMemo(() => {
    const raw =
      telemetry.non_wrong_scenario_code ||
      telemetry.scenarioCode ||
      metrics?.non_wrong_scenario_code ||
      null;
    if (raw) return String(raw);
    // Trigger reason may be the scenario code (e.g. repeated_slow_answers)
    const r = String(triggerReason || '').toUpperCase().replace(/-/g, '_');
    if (
      r.includes('REPEATED_SLOW') ||
      r.includes('SELECTION_SWITCH') ||
      r.includes('LONG_PAUSE') ||
      r.includes('HINT') ||
      r.includes('COMPOUND') ||
      r.includes('DDA') ||
      r.includes('ESCALATED')
    ) {
      return r;
    }
    return null;
  }, [
    telemetry.non_wrong_scenario_code,
    telemetry.scenarioCode,
    metrics?.non_wrong_scenario_code,
    triggerReason,
  ]);

  const [mood, setMood] = useState(AVATAR_MOODS.empathetic);
  const [socratesBusy, setSocratesBusy] = useState(false);
  const [socratesNote, setSocratesNote] = useState(null);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [liveCaption, setLiveCaption] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [providerNote, setProviderNote] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  /** A–D choices while we learn why the student is stuck */
  const [behaviorOptions, setBehaviorOptions] = useState([]);
  const [probePrompt, setProbePrompt] = useState('');
  // Session map only — never preload history store into live view
  const [mapVisible, setMapVisible] = useState(false);
  const [localMap, setLocalMap] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [spokenSubtitle, setSpokenSubtitle] = useState('');
  const [spokenCaption, setSpokenCaption] = useState('');
  const [spokenSoFar, setSpokenSoFar] = useState('');
  const [spokenCurrentWord, setSpokenCurrentWord] = useState('');
  const [speechMapFocus, setSpeechMapFocus] = useState(null);
  const [activeMissId, setActiveMissId] = useState(null);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [tutorTurn, setTutorTurn] = useState(null);
  const subtitleCuesRef = useRef([]);
  const focusTermsRef = useRef([]);
  const spokenWordsRef = useRef([]);
  const narratingRef = useRef(false);
  const narrationSessionRef = useRef(0);

  const mindMap = useMemo(() => {
    // Only expose maps in live view when this session allows incorrect-answer maps
    if (!shouldOfferMap) return localMap || null;
    if (misconceptions?.length) {
      return (
        localMap ||
        buildPersonalizedMindMap({
          misconceptions,
          frustrationScore:
            telemetry.frustrationScore ?? m.frustration_score ?? null,
          frustrationLevel:
            telemetry.frustrationLevel || m.frustration_level || null,
        }) ||
        mindMapProp ||
        telemetry.mindMap
      );
    }
    return localMap || mindMapProp || telemetry.mindMap || null;
  }, [
    shouldOfferMap,
    localMap,
    misconceptions,
    mindMapProp,
    telemetry.mindMap,
  ]);

  const activeMiss = useMemo(() => {
    const branches = mindMap?.branches || [];
    if (!branches.length || !activeMissId) return null;
    return (
      branches.find(
        (b) =>
          b.id === activeMissId ||
          `miss-${Number(b.index) - 1}` === activeMissId,
      ) || null
    );
  }, [mindMap, activeMissId]);

  const sageLesson = useMemo(() => {
    const voice = {
      frustrationLevel:
        telemetry.frustrationLevel || m.frustration_level || 'moderate',
    };
    if (activeMiss) {
      if (activeMiss.lesson?.sections?.length) return activeMiss.lesson;
      return teachingLessonFromMiss(
        {
          prompt: activeMiss.prompt || activeMiss.question,
          studentAnswer: activeMiss.studentAnswer,
          correctAnswer: activeMiss.correctAnswer,
          topic: activeMiss.topic,
          hint: activeMiss.hint,
        },
        voice,
      );
    }
    const fromTurn =
      tutorTurn?.structured?.teaching?.sections ||
      tutorTurn?.teaching_session?.sections;
    if (Array.isArray(fromTurn) && fromTurn.length) {
      return { sections: fromTurn, check: tutorTurn.interactionQuestion };
    }
    const q = quiz?.questionData || quiz || {};
    const b = mindMap?.branches?.[0] || {};
    const ev = performanceSessionRef.current?.evidence || {};
    return teachingLessonFromMiss(
      {
        prompt:
          interventionFocus?.current_question ||
          ev.farm_question ||
          q.prompt ||
          q.question ||
          b.prompt ||
          b.question,
        studentAnswer:
          interventionFocus?.last_wrong_answer ||
          ev.last_wrong ||
          b.studentAnswer ||
          q.studentAnswer,
        correctAnswer:
          interventionFocus?.correct_answer ||
          ev.correct_answer ||
          b.correctAnswer ||
          q.correctAnswer,
        topic: interventionFocus?.concept_topic || q.topic || b.topic,
        hint: q.hint || b.hint,
      },
      voice,
    );
  }, [
    activeMiss,
    tutorTurn,
    quiz,
    mindMap,
    interventionFocus,
    telemetry.frustrationLevel,
    m.frustration_level,
  ]);

  // Keep latest input for stop-to-send (avoids stale React state on Mic release)
  const inputValueRef = useRef('');
  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!activeMiss) return;
    const probe = getBehaviorProbe(
      performanceSessionRef.current?.code ||
        interventionFocus?.code ||
        'SAME_CONCEPT_STRUGGLE',
      {
        concept: activeMiss.topic,
        concept_topic: activeMiss.topic,
        last_wrong: activeMiss.studentAnswer,
        miss_count: 1,
        farm_question: activeMiss.prompt || activeMiss.question,
        questionText: activeMiss.prompt || activeMiss.question,
      },
    );
    if (probe?.prompt) setProbePrompt(probe.prompt);
    setBehaviorOptions((prev) =>
      prev?.length && probe?.options?.length ? probe.options : prev,
    );
  }, [activeMiss, interventionFocus?.code]);

  useEffect(() => {
    const capture = createRealtimeSpeechCapture({
      onUpdate: ({ listening: isOn, fullText, interim }) => {
        setListening(isOn);
        setLiveCaption(interim || '');
        if (isOn) {
          const base = captureBaseRef.current;
          const next = [base, fullText].filter(Boolean).join(' ').trim();
          inputValueRef.current = next;
          setInput(next);
        }
      },
      onError: (msg) => {
        setError(msg);
        setListening(false);
      },
    });
    speechRef.current = capture;
    setSpeechSupported(Boolean(capture.supported));

    const tts = createSpeechEngine({
      onStart: ({ text, words }) => {
        setSpeaking(true);
        const full = text || '';
        setSpokenCaption(full);
        const cues = buildSubtitleCues(full);
        subtitleCuesRef.current = cues;
        setSpokenSubtitle(cues[0]?.text || full || '');
        spokenWordsRef.current = [];
        setSpokenSoFar('');
        setSpokenCurrentWord('');
        if (!words?.length && full) {
          setSpokenSubtitle(cues[0]?.text || full);
        }
      },
      onWord: ({ word, text, index }) => {
        setSpeaking(true);
        if (text) setSpokenCaption(text);
        let cues = subtitleCuesRef.current;
        if (!cues.length && text) {
          cues = buildSubtitleCues(text);
          subtitleCuesRef.current = cues;
        }
        const line = cueAtWordIndex(cues, index);
        if (line) setSpokenSubtitle(line);
        else if (word) setSpokenSubtitle(word);

        if (word) {
          const bare = String(word).replace(/[.,!?;:]+$/g, '');
          setSpokenCurrentWord(bare);
          spokenWordsRef.current = [...spokenWordsRef.current, bare];
          setSpokenSoFar(spokenWordsRef.current.join(' '));
        }
      },
      onEnd: () => {
        setSpeaking(false);
        setSpokenSubtitle('');
        setSpokenSoFar('');
        setSpokenCurrentWord('');
        spokenWordsRef.current = [];
        subtitleCuesRef.current = [];
        if (!narratingRef.current) {
          setSpeechMapFocus(null);
          focusTermsRef.current = [];
        }
      },
      onError: () => {
        setSpeaking(false);
        setSpokenSubtitle('');
        setSpokenSoFar('');
        setSpokenCurrentWord('');
        spokenWordsRef.current = [];
        subtitleCuesRef.current = [];
        if (!narratingRef.current) {
          setSpeechMapFocus(null);
          focusTermsRef.current = [];
        }
      },
    });
    ttsRef.current = tts;
    setTtsSupported(tts.supported);

    const tick = window.setInterval(() => tts.tick(), 12000);

    return () => {
      capture.stop();
      tts.stop();
      window.clearInterval(tick);
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    narrationSessionRef.current += 1;
    narratingRef.current = false;
    ttsRef.current?.stop();
    setSpeaking(false);
    setSpokenSubtitle('');
    setSpokenSoFar('');
    spokenWordsRef.current = [];
    subtitleCuesRef.current = [];
    setSpeechMapFocus(null);
    focusTermsRef.current = [];
    setSpokenCurrentWord('');
  }, []);

  const applySpeechFocus = useCallback((segment) => {
    if (!segment) {
      setSpeechMapFocus(null);
      focusTermsRef.current = [];
      return;
    }
    const highlights = uniqueHighlightTerms(segment.highlights || []);
    focusTermsRef.current = highlights;
    if (segment.kind === 'branch' && segment.branchId) {
      setActiveMissId(segment.branchId);
    }
    setSpeechMapFocus({
      kind: segment.kind || 'branch',
      branchId: segment.branchId || null,
      highlights,
    });
  }, []);

  const speakText = useCallback(
    async (text) => {
      if (mutedRef.current || voiceMuted) {
        // Silent read time so auto-return can still wait a beat
        return { spoken: false, reason: 'muted' };
      }
      const t = sanitizeKidSpeech(String(text || '').trim());
      if (!t || !ttsRef.current?.supported) {
        return { spoken: false, reason: 'unsupported' };
      }
      // TTS and mic cannot run together — stop capture cleanly first
      if (speechRef.current?.isListening?.()) {
        speechRef.current.stop();
        setListening(false);
        setLiveCaption('');
      }
      setSpokenCaption(t);
      return ttsRef.current.speak(t);
    },
    [voiceMuted],
  );

  /** Speak advice (or wait so silent mode can finish), then return to the farm. */
  const speakAdviceThenReturn = useCallback(
    async (text, { gen = sendGenRef.current } = {}) => {
      const t = sanitizeKidSpeech(String(text || '').trim());
      const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
      const silentMs = Math.min(14000, Math.max(2800, words * 340));

      try {
        if (t) {
          // Show caption even when muted so the student can read before return
          setSpokenCaption(t);
          if (mutedRef.current || voiceMuted || !ttsRef.current?.supported) {
            setSpeaking(false);
            setSpokenSubtitle(t);
            await new Promise((r) => window.setTimeout(r, silentMs));
          } else {
            const result = await speakText(t);
            if (!result?.spoken) {
              setSpokenSubtitle(t);
              await new Promise((r) => window.setTimeout(r, silentMs));
            } else {
              await new Promise((r) => window.setTimeout(r, 450));
            }
          }
        }
      } catch {
        await new Promise((r) => window.setTimeout(r, silentMs));
      }

      if (gen !== sendGenRef.current) return;
      stopSpeaking();
      onClose?.();
    },
    [speakText, stopSpeaking, onClose, voiceMuted],
  );

  const speakQueue = useCallback(
    async (parts) => {
      if (mutedRef.current || voiceMuted) return;
      if (!ttsRef.current?.supported) return;
      if (speechRef.current?.listening) {
        speechRef.current.stop();
        setListening(false);
      }
      await ttsRef.current.speakQueue(parts);
    },
    [voiceMuted],
  );

  const narrateMindMap = useCallback(
    async (map) => {
      if (!map || mutedRef.current || voiceMuted) return;
      const key = `${map.missCount}|${(map.sourceAttempts || map.branches || [])
        .map((a) => a.prompt || a.question || a.topic)
        .join('|')}`;
      if (narratedMapKeyRef.current === key) return;
      narratedMapKeyRef.current = key;

      const segments = buildMindMapNarration(map);
      if (!segments.length) return;

      const session = narrationSessionRef.current + 1;
      narrationSessionRef.current = session;
      narratingRef.current = true;
      try {
        for (const seg of segments) {
          if (
            narrationSessionRef.current !== session ||
            mutedRef.current ||
            voiceMuted
          ) {
            break;
          }
          applySpeechFocus(seg);
          const res = await ttsRef.current.speak(seg.text);
          if (
            narrationSessionRef.current !== session ||
            res?.reason === 'cancelled' ||
            res?.reason === 'error'
          ) {
            break;
          }
        }
      } finally {
        if (narrationSessionRef.current === session) {
          narratingRef.current = false;
          setSpeechMapFocus(null);
          focusTermsRef.current = [];
        }
      }
    },
    [applySpeechFocus, voiceMuted],
  );

  const handleMapChange = useCallback(
    (map) => {
      if (!map || !mapVisible) return;
      window.setTimeout(() => {
        narrateMindMap(map);
      }, 2200);
    },
    [mapVisible, narrateMindMap],
  );

  const handleMissSelect = useCallback(
    async (branch) => {
      if (!branch) return;
      setActiveMissId(branch.id || null);
      if (voiceMuted || mutedRef.current) return;
      const segment = buildMissCardNarration(branch);
      if (!segment?.text) return;

      const session = narrationSessionRef.current + 1;
      narrationSessionRef.current = session;
      narratingRef.current = true;
      ttsRef.current?.stop();
      applySpeechFocus(segment);
      try {
        await speakText(segment.text);
      } finally {
        if (narrationSessionRef.current === session) {
          narratingRef.current = false;
          setSpeechMapFocus(null);
          focusTermsRef.current = [];
        }
      }
    },
    [applySpeechFocus, speakText, voiceMuted],
  );
  useEffect(() => {
    if (!open) {
      setInput('');
      setError(null);
      setBusy(false);
      setListening(false);
      setLiveCaption('');
      // Fresh session: wipe live chat + session map (history store stays separate)
      setMessages([]);
      messagesRef.current = [];
      setProviderNote(null);
      setStreamingText('');
      setBehaviorOptions([]);
      setProbePrompt('');
      setMood(moodForMode(resolvedMode, evaluatedTier));
      setLocalMap(null);
      setMapVisible(false);
      setHistoryOpen(false);
      setSpeaking(false);
      setSpokenSubtitle('');
      setSpokenCaption('');
      setSpokenSoFar('');
      setSpokenCurrentWord('');
      setSpeechMapFocus(null);
      setActiveMissId(null);
      subtitleCuesRef.current = [];
      focusTermsRef.current = [];
      narratingRef.current = false;
      narratedMapKeyRef.current = '';
      abortRef.current?.abort();
      speechRef.current?.stop();
      speechRef.current?.resetText?.();
      ttsRef.current?.stop();
      captureBaseRef.current = '';
      autoFetchedRef.current = false;
      // Mark closed so the next open can reseed the opener once
      lastOpenSessionRef.current = 0;
      performanceSessionRef.current = null;
      return undefined;
    }

    // Only seed the opener once per open session.
    // Do NOT re-run when interventionFocus/metrics change mid-conversation
    // (that was wiping student answers and replaying the fixed opening).
    if (lastOpenSessionRef.current !== 0) {
      return undefined;
    }
    conversationSessionRef.current += 1;
    lastOpenSessionRef.current = conversationSessionRef.current;

    // —— Fresh open: freeze performance cause, empty chat, trigger opener ——
    setMessages([]);
    setStreamingText('');
    setLocalMap(null);
    setMapVisible(false);
    setHistoryOpen(false);
    setMood(moodForMode(resolvedMode, evaluatedTier));

    const displayName = friendlyStudentName(
      student?.displayName || student?.username,
    );
    const frozenFocus = {
      ...interventionFocus,
      student_name: displayName,
    };
    const frozen = freezeInterventionSession(frozenFocus, {
      sessionId: `open_${lastOpenSessionRef.current}`,
      studentName: displayName,
      farmQuestion:
        interventionFocus?.current_question ||
        quiz?.prompt ||
        quiz?.question ||
        quiz?.questionData?.prompt ||
        quiz?.questionData?.question ||
        null,
      lastWrong:
        interventionFocus?.last_wrong_answer ||
        telemetry.lastWrongAnswer ||
        null,
      correctAnswer:
        interventionFocus?.correct_answer ||
        telemetry.lastCorrectAnswer ||
        quiz?.correctAnswer ||
        quiz?.questionData?.correctAnswer ||
        null,
    });
    if (frozen && !frozen.correct_answer) {
      frozen.correct_answer =
        interventionFocus?.correct_answer ||
        telemetry.lastCorrectAnswer ||
        quiz?.correctAnswer ||
        null;
    }
    if (frozen?.evidence) {
      frozen.evidence.frustration_score =
        telemetry.frustrationScore ?? m.frustration_score ?? null;
      frozen.evidence.question_type =
        quiz?.questionType || quiz?.questionData?.questionType || null;
      frozen.evidence.options =
        quiz?.options || quiz?.questionData?.options || [];
      frozen.evidence.hint = quiz?.hint || quiz?.questionData?.hint || null;
    }
    performanceSessionRef.current = frozen;
    setTutorTurn(null);

    const liveStem =
      frozen.evidence?.farm_question ||
      frozen.current_question ||
      interventionFocus?.current_question ||
      quiz?.prompt ||
      quiz?.question ||
      quiz?.questionData?.prompt ||
      quiz?.questionData?.question ||
      null;
    const liveTopic = inferConceptFromText(liveStem);
    if (liveTopic) frozen.concept_topic = liveTopic;

    // Mind map for wrong-answer / concept struggle — show it with the mentor
    const focusCode = String(
      frozen.code || frozen.underlying_code || interventionFocus?.code || '',
    ).toUpperCase();
    const wantsWrongMap =
      shouldOfferMap ||
      frozen.require_mind_map ||
      interventionFocus?.require_mind_map ||
      focusCode.includes('REPEATED_WRONG') ||
      focusCode.includes('SAME_CONCEPT') ||
      focusCode.includes('SLOW_AND_WRONG') ||
      String(triggerReason || '').includes('incorrect') ||
      String(triggerReason || '').includes('misconception');

    const sessionMap = wantsWrongMap
      ? mindMapProp ||
        (misconceptions?.length
          ? buildPersonalizedMindMap({
              topic:
                frozen.concept_topic ||
                interventionFocus?.concept_topic ||
                misconceptions[0]?.topic ||
                null,
              misconceptions,
              attempts: misconceptions.flatMap((x) => x.attempts || []),
              frustrationScore:
                telemetry.frustrationScore ?? m.frustration_score ?? null,
              frustrationLevel:
                telemetry.frustrationLevel || m.frustration_level || null,
            })
          : null)
      : null;
    setLocalMap(sessionMap);
    // Auto-open map when this open is about wrong answers
    setMapVisible(Boolean(sessionMap && wantsWrongMap));

    // Always ensure A–D options match real evidence (wrongs → concept probe, not pure DDA)
    const probeEvidence = {
      concept: frozen.concept_topic,
      concept_topic: frozen.concept_topic,
      last_wrong:
        frozen.evidence?.last_wrong ||
        frozen.last_wrong_answer ||
        interventionFocus?.last_wrong_answer ||
        telemetry.lastWrongAnswer ||
        null,
      miss_count:
        frozen.evidence?.miss_count ||
        frozen.concept_miss_count ||
        interventionFocus?.concept_miss_count ||
        0,
      farm_question: liveStem,
      questionText: liveStem,
      skill: quiz?.skill || quiz?.questionData?.skill || frozen.skill || null,
      sub_concept:
        quiz?.sub_concept ||
        quiz?.questionData?.sub_concept ||
        frozen.sub_concept ||
        null,
      chapter_name:
        quiz?.chapter_name ||
        quiz?.chapter ||
        quiz?.questionData?.chapter_name ||
        null,
    };
    const probeCode =
      frozen.code ||
      frozen.underlying_code ||
      interventionFocus?.underlying_code ||
      interventionFocus?.code;
    const probe = getBehaviorProbe(probeCode, probeEvidence);
    // Prefer concept/wrong probe when map is up or wrongs exist — even if DDA options arrived
    const preferConceptProbe =
      wantsWrongMap ||
      Boolean(probeEvidence.last_wrong) ||
      Number(probeEvidence.miss_count) >= 1 ||
      frozen.require_mind_map;
    const options =
      preferConceptProbe ||
      !(Array.isArray(frozen.diagnostic_options) && frozen.diagnostic_options.length)
        ? probe.options
        : frozen.diagnostic_options;
    const diagnosticText = formatDiagnosticText({
      prompt: probe.prompt || frozen.diagnostic_prompt,
      options,
    });
    frozen.diagnostic_options = options;
    frozen.diagnostic_question = diagnosticText;
    frozen.diagnostic_prompt = probe.prompt || frozen.diagnostic_prompt;
    frozen.phase = frozen.phase || 'behavior_probe';

    const opener = sanitizeKidSpeech(
      frozen.spoken_opener ||
        buildFocusedSpokenOpener(
          {
            ...interventionFocus,
            ...sessionToFocusPatch(frozen),
            diagnostic_question: frozen.diagnostic_question,
            diagnostic_prompt: frozen.diagnostic_prompt,
            concept_topic: frozen.concept_topic,
            code: frozen.code,
          },
          {
            name: displayName,
            evidence: frozen.evidence,
          },
        ),
    );
    // Keep conversation history in memory (not shown) — voice shell only
    frozen.spoken_opener = opener;
    frozen.last_mentor_message = opener;
    performanceSessionRef.current = frozen;

    setBusy(false);
    setMessages([{ role: 'assistant', content: opener }]);
    messagesRef.current = [{ role: 'assistant', content: opener }];
    setBehaviorOptions(options);
    setProbePrompt(probe.prompt || frozen.diagnostic_prompt || '');
    setProviderNote(null);

    // Speak opener + brief read of A–D so kids hear choices without chat dump
    const spokenChoices = options
      .map((o) => `${o.letter}: ${o.label}`)
      .join('. ');
    const spokenOpen = spokenChoices
      ? `${opener} ${spokenChoices}.`
      : opener;
    window.setTimeout(() => {
      if (!mutedRef.current) speakText(spokenOpen);
    }, 350);

    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      window.clearTimeout(t);
    };
    // Intentionally only [open]: conversation must stay live after the opener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // No silent Groq bootstrap — opener is deterministic from trigger evidence.
  // AI is used only for student follow-up turns (still locked to intervention_focus).

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy, streamingText, mapVisible]);

  const stopMicAndMaybeSend = useCallback(() => {
    const cap = speechRef.current;
    // Snapshot text BEFORE stop so trailing interim is kept (stop folds interim into finals)
    const fromApi = String(cap?.getFullText?.() || '').trim();
    const preStop = String(
      inputValueRef.current ||
        inputRef.current?.value ||
        [captureBaseRef.current, fromApi].filter(Boolean).join(' ') ||
        '',
    ).trim();
    const text =
      preStop ||
      [String(captureBaseRef.current || '').trim(), fromApi]
        .filter(Boolean)
        .join(' ')
        .trim();

    cap?.stop();
    setListening(false);
    setLiveCaption('');

    // After stop, getFullText may include last interim folded in
    const afterStop = String(cap?.getFullText?.() || '').trim();
    const finalText = text || afterStop;

    captureBaseRef.current = finalText;
    inputValueRef.current = finalText;
    setInput(finalText);

    if (finalText) {
      window.setTimeout(() => {
        sendMessageRef.current?.(finalText);
      }, 40);
    } else {
      setError(
        'No speech heard. Tap Mic, speak clearly, then tap Mic again to send.',
      );
    }
  }, []);

  const toggleLiveCapture = async () => {
    const cap = speechRef.current;
    if (!cap?.supported) {
      setError(
        'Voice chat needs Chrome or Edge with microphone permission (Web Speech).',
      );
      return;
    }
    // Stop Sage's voice so the student can talk clearly
    stopSpeaking();

    const isOn = Boolean(listening || cap.isListening?.());
    if (isOn) {
      stopMicAndMaybeSend();
      return;
    }

    if (busyRef.current) {
      abortRef.current?.abort();
      busyRef.current = false;
      setBusy(false);
    }

    setError(null);
    const perm = await ensureMicrophonePermission();
    if (!perm.ok) {
      setError(perm.error || 'Microphone permission required.');
      return;
    }

    captureBaseRef.current = String(
      inputRef.current?.value || inputValueRef.current || '',
    ).trim();
    cap.resetText?.();
    setListening(true);
    window.setTimeout(() => {
      if (!speechRef.current) return;
      try {
        speechRef.current.start();
        inputRef.current?.focus();
      } catch (err) {
        setListening(false);
        setError(
          err instanceof Error
            ? err.message
            : 'Could not start the microphone.',
        );
      }
    }, 120);
  };

  const revealMindMap = () => {
    if (!shouldOfferMap) {
      const line =
        'Mind maps are only created when an answer is incorrect—not for correct answers, challenge boosts, or milestones.';
      setMessages((prev) => [...prev, { role: 'assistant', content: line }]);
      speakText(line);
      return;
    }
    let map =
      (misconceptions?.length
        ? buildPersonalizedMindMap({
            misconceptions,
            frustrationScore:
              telemetry.frustrationScore ?? m.frustration_score ?? null,
            frustrationLevel:
              telemetry.frustrationLevel || m.frustration_level || null,
          })
        : null) || mindMap;
    if (!map && onShowMindMap) {
      map = onShowMindMap();
    }
    if (map) setLocalMap(map);
    setMapVisible(true);
    if (map) {
      const n = map.missCount || map.sourceAttempts?.length || 1;
      const line = `Here’s a mind map for ${n} incorrect answer${n === 1 ? '' : 's'} — each card is a miss to repair.`;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: line,
        },
      ]);
      narratedMapKeyRef.current = '';
      recordIncorrectMindMap({
        lessonTopic:
          map.topic || misconceptions?.[0]?.topic || farm?.cropName || 'Science',
        structuredMap: map,
        studentWrongAnswer: telemetry.lastWrongAnswer || null,
        evaluatedTier,
        timestamp: Date.now(),
      });
      speakText(line).then(() => narrateMindMap(map));
    }
  };

  const sendMessage = async (rawText, { silentUser = false } = {}) => {
    const studentMessage = String(rawText || '').trim();
    if (!studentMessage) return;

    // Never drop a real student prompt while personalizing / prior reply in flight
    if (busyRef.current) {
      if (silentUser) return;
      abortRef.current?.abort();
    }

    const gen = (sendGenRef.current += 1);
    busyRef.current = true;

    // Stop mic if still open so TTS/STT don't fight
    if (speechRef.current?.isListening?.()) {
      speechRef.current.stop();
      setListening(false);
      setLiveCaption('');
    }

    setError(null);
    speechRef.current?.stop();
    captureBaseRef.current = '';
    setLiveCaption('');
    setInput('');
    inputValueRef.current = '';

    // Silent coach cues stay off-screen; real student lines always show
    onLearningMessage?.(studentMessage);

    const wantsMap =
      /mind map|concept map|show map|relationships/i.test(studentMessage);
    if (wantsMap && !silentUser) {
      revealMindMap();
    }

    const userMsg = { role: 'user', content: studentMessage };
    if (!silentUser) {
      setMessages((prev) => {
        const next = [...prev, userMsg];
        messagesRef.current = next;
        return next;
      });
    }
    setBusy(true);
    setStreamingText('');

    // Every student turn talks to AI (Groq when live; offline adaptive as safety net).
    const mapForPayload =
      shouldOfferMap ||
      performanceSessionRef.current?.require_mind_map ||
      Boolean(localMap || mindMap || mindMapProp)
        ? localMap ||
          mindMap ||
          mindMapProp ||
          (misconceptions?.length
            ? buildPersonalizedMindMap({
                topic:
                  performanceSessionRef.current?.concept_topic ||
                  interventionFocus?.concept_topic ||
                  null,
                misconceptions,
                attempts: misconceptions.flatMap((x) => x.attempts || []),
                frustrationScore:
                  telemetry.frustrationScore ?? m.frustration_score ?? null,
                frustrationLevel:
                  telemetry.frustrationLevel || m.frustration_level || null,
              })
            : null)
        : null;

    // Lock follow-ups to the frozen performance cause for this open session
    if (!performanceSessionRef.current) {
      performanceSessionRef.current = freezeInterventionSession(
        {
          ...interventionFocus,
          student_name:
            friendlyStudentName(student?.displayName || student?.username) ||
            null,
        },
        {
          farmQuestion:
            interventionFocus?.current_question ||
            quiz?.prompt ||
            quiz?.question ||
            quiz?.questionData?.prompt ||
            quiz?.questionData?.question ||
            null,
          lastWrong:
            interventionFocus?.last_wrong_answer ||
            telemetry.lastWrongAnswer ||
            null,
          correctAnswer:
            interventionFocus?.correct_answer ||
            telemetry.lastCorrectAnswer ||
            quiz?.correctAnswer ||
            quiz?.questionData?.correctAnswer ||
            null,
        },
      );
    }
    const frozenPatch = sessionToFocusPatch(performanceSessionRef.current);

    const contextPayload = buildContextPayload({
      student,
      farm,
      gameplay,
      telemetry: {
        ...telemetry,
        offerMindMap: Boolean(
          shouldOfferMap ||
            mapForPayload ||
            performanceSessionRef.current?.require_mind_map,
        ),
        teaching_session: performanceSessionRef.current?.teaching_session || null,
        scenario: resolvedScenario,
        non_wrong_scenario_code:
          performanceSessionRef.current?.code || nonWrongCode,
        scenarioCode: performanceSessionRef.current?.code || nonWrongCode,
      },
      metrics: metrics || telemetry.metrics,
      quiz,
      triggerReason:
        performanceSessionRef.current?.friendly_why || triggerReason,
      interventionMode: resolvedMode,
      perceivedState,
      misconceptions: misconceptions || [],
      learningPrefs,
      mindMap: mapForPayload,
      evaluatedTier,
      nonWrongScenarioCode:
        performanceSessionRef.current?.code ||
        nonWrongCode ||
        interventionFocus?.code,
      interventionFocus: {
        ...interventionFocus,
        ...frozenPatch,
        spoken_opener:
          performanceSessionRef.current?.spoken_opener ||
          interventionFocus?.spoken_opener ||
          messagesRef.current?.[0]?.content ||
          null,
        conversation_session: {
          phase: performanceSessionRef.current?.phase || 'behavior_probe',
          student_reason_key:
            performanceSessionRef.current?.student_reason_key || null,
          student_reason_label:
            performanceSessionRef.current?.student_reason_label || null,
          guidance_level: performanceSessionRef.current?.guidance_level,
          turn_index: performanceSessionRef.current?.turn_index,
          evaluations: performanceSessionRef.current?.evaluations || [],
          evidence: performanceSessionRef.current?.evidence || {},
          diagnostic_options:
            performanceSessionRef.current?.diagnostic_options || [],
          diagnostic_prompt:
            performanceSessionRef.current?.diagnostic_prompt || null,
          spoken_opener: performanceSessionRef.current?.spoken_opener || null,
          teaching_session:
            performanceSessionRef.current?.teaching_session || null,
        },
        require_mind_map: Boolean(
          performanceSessionRef.current?.require_mind_map ||
            interventionFocus?.require_mind_map ||
            mapForPayload,
        ),
        last_wrong_answer:
          performanceSessionRef.current?.evidence?.last_wrong ||
          interventionFocus?.last_wrong_answer ||
          telemetry.lastWrongAnswer ||
          null,
      },
    });

    const history = [...(messagesRef.current || [])]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter(
        (m) =>
          m.content &&
          m.content !== '…' &&
          !String(m.content).includes('one moment') &&
          !/^auto-signal:/i.test(String(m.content || '')),
      )
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    // Local performance-mentor is applied ONCE in resolvePerformanceReply
    // (do not pre-advance guidance_level before the API round-trip).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await streamAvatarChat({
        contextPayload,
        studentMessage,
        history,
        signal: controller.signal,
        onMeta: (meta) => {
          if (meta.avatarMood) setMood(meta.avatarMood);
        },
        onToken: (_chunk, full) => {
          if (gen !== sendGenRef.current) return;
          setStreamingText(full);
        },
      });

      if (gen !== sendGenRef.current) return;

      // Single evaluation turn: model only if it respects cause + student answer
      const resolved = resolvePerformanceReply({
        studentMessage: silentUser ? '' : studentMessage,
        session: performanceSessionRef.current,
        modelReply: result.reply || '',
        focus: contextPayload.intervention_focus,
        history,
      });
      if (resolved.session && !silentUser) {
        performanceSessionRef.current = resolved.session;
        setTutorTurn(resolved.tutor_turn || resolved.session.last_tutor_turn || null);
        setBehaviorOptions(
          resolved.session.phase === 'behavior_probe' &&
            !resolved.session.student_reason_key
            ? resolved.session.diagnostic_options || []
            : [],
        );
        setProbePrompt(
          resolved.session.phase === 'behavior_probe' &&
            !resolved.session.student_reason_key
            ? resolved.session.diagnostic_prompt || ''
            : '',
        );
      }
      let reply = sanitizeKidSpeech(
        resolved.reply ||
          "I'm still with you. Say that idea again in one short sentence?",
      );
      if (
        sageLesson?.sections?.length &&
        resolved.session?.phase === 'support'
      ) {
        reply = sanitizeKidSpeech(formatLessonSpeech(sageLesson));
      }

      if (result.avatarMood) setMood(result.avatarMood);

      // Voice shell: keep meta quiet; still soft-note offline only when needed
      if (result.fallback || resolved.source !== 'model') {
        setProviderNote(
          softProviderNote(result.error) ||
            (result.provider === 'offline' ? 'Offline mentor' : null),
        );
      } else {
        setProviderNote(null);
      }
      setMessages((prev) => {
        const base =
          silentUser &&
          prev.length === 1 &&
          prev[0]?.role === 'assistant' &&
          (prev[0].content === '…' ||
            String(prev[0].content || '').includes('one moment'))
            ? []
            : prev;
        const next = [...base, { role: 'assistant', content: reply }];
        messagesRef.current = next;
        return next;
      });
      setStreamingText('');

      const gaveAdvice =
        !silentUser &&
        reply &&
        (resolved.session?.phase === 'support' ||
          resolved.understanding === 'behavior_answered' ||
          Boolean(resolved.session?.student_reason_key) ||
          resolved.source === 'model' ||
          resolved.source === 'session_behavior' ||
          resolved.source === 'session_adaptive');

      // After student pick / free reply: AI advice → speak → return to farm
      if (gaveAdvice && !silentUser) {
        const stillNeedPick =
          resolved.understanding === 'need_choice' ||
          (resolved.session?.phase === 'behavior_probe' &&
            !resolved.session?.student_reason_key);
        if (stillNeedPick) {
          await speakText(reply);
        } else {
          await speakAdviceThenReturn(reply, { gen });
        }
      } else if (reply) {
        await speakText(reply);
      }
    } catch (err) {
      if (err?.name === 'AbortError' || gen !== sendGenRef.current) return;
      setError(softProviderNote(err?.message) || 'Avatar chat failed');
      // Still answer from performance session on error
      const recovered = resolvePerformanceReply({
        studentMessage: silentUser ? '' : studentMessage,
        session: performanceSessionRef.current,
        modelReply: '',
        focus: interventionFocus,
        history,
      });
      if (recovered.session && !silentUser) {
        performanceSessionRef.current = recovered.session;
        setBehaviorOptions(
          recovered.session.phase === 'behavior_probe' &&
            !recovered.session.student_reason_key
            ? recovered.session.diagnostic_options || []
            : [],
        );
        setProbePrompt(
          recovered.session.phase === 'behavior_probe' &&
            !recovered.session.student_reason_key
            ? recovered.session.diagnostic_prompt || ''
            : '',
        );
      }
      const failLine =
        recovered.reply ||
        "I'm still with you. Type a message or tap Mic to try again.";
      setMessages((prev) => {
        const base =
          silentUser &&
          prev.length === 1 &&
          prev[0]?.role === 'assistant' &&
          (prev[0].content === '…' ||
            String(prev[0].content || '').includes('one moment'))
            ? []
            : prev;
        const next = [...base, { role: 'assistant', content: failLine }];
        messagesRef.current = next;
        return next;
      });
      const recoveredAdvice =
        !silentUser &&
        (recovered.session?.phase === 'support' ||
          recovered.understanding === 'behavior_answered' ||
          Boolean(recovered.session?.student_reason_key));
      if (recoveredAdvice) {
        await speakAdviceThenReturn(failLine, { gen });
      } else {
        await speakText(failLine);
      }
      setStreamingText('');
    } finally {
      if (gen === sendGenRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  sendMessageRef.current = sendMessage;

  const handleAskSocrates = async () => {
    if (socratesBusy) return;
    setSocratesBusy(true);
    setSocratesNote(null);
    try {
      const result = await handoffToSocrates({
        student,
        farm,
        quiz,
        telemetry,
        metrics: m,
      });
      if (!result?.cuePosted && result?.error) {
        setSocratesNote(
          result.opened
            ? `Socrates is opening. Frustration cue: ${result.error}`
            : result.error,
        );
      } else if (!result?.opened) {
        setSocratesNote(
          result?.error ||
            'Could not open Socrates. Make sure SCI-PATH is running on port 3000.',
        );
      }
    } catch (err) {
      setSocratesNote(err?.message || 'Could not open Socrates.');
    } finally {
      setSocratesBusy(false);
    }
  };

  if (!open) return null;

  // Live caption under face while speaking (or last short reply still landing)
  const speechLine = speaking
    ? spokenSubtitle || spokenCaption || streamingText
    : listening
      ? liveCaption
        ? `Listening: ${liveCaption}`
        : 'Listening…'
      : '';

  const focusQuestion = asQuestionText(
    activeMiss?.prompt ||
      activeMiss?.question ||
      interventionFocus?.current_question ||
      quiz?.questionData?.prompt ||
      quiz?.questionData?.question ||
      quiz?.prompt ||
      quiz?.question ||
      quiz?.question_text ||
      mindMap?.branches?.[0]?.prompt ||
      mindMap?.branches?.[0]?.question ||
      misconceptions?.[0]?.attempts?.[0]?.prompt ||
      null,
    280,
  );

  return (
    <div
      className={`avatar-assistant-overlay${
        mapVisible && mindMap ? ' has-map-split' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`avatar-assistant-card is-voice-shell is-mood-${mood}${
          mapVisible && mindMap ? ' has-map-split' : ''
        }`}
      >
        <h2 id={titleId} className="avatar-sr-only">
          Sage, science mentor
        </h2>
        <button
          type="button"
          className="avatar-close is-voice-close"
          onClick={() => {
            stopSpeaking();
            onClose?.();
          }}
          aria-label="Close mentor"
        >
          Close
        </button>

        {/* Optional mind map stays side-stage only when student opens it */}
        {mapVisible && mindMap ? (
          <div className="avatar-split-stage" aria-label="Mind map and mentor">
            <section className="avatar-split-left" aria-label="Mind map">
              <div className="avatar-split-map-scroll">
                <ConceptMindMap
                  map={mindMap}
                  misconceptions={misconceptions}
                  compact
                  onNodeSelect={handleMissSelect}
                  onMapChange={handleMapChange}
                  speechFocus={speechMapFocus}
                  spokenSoFar={spokenSoFar}
                  currentWord={spokenCurrentWord}
                  activePhrase={spokenSubtitle}
                  segmentText={spokenCaption}
                  frustrationScore={
                    telemetry.frustrationScore ??
                    m.frustration_score ??
                    null
                  }
                  frustrationLevel={
                    telemetry.frustrationLevel ||
                    m.frustration_level ||
                    null
                  }
                />
              </div>
              <button
                type="button"
                className="avatar-mindmap-toggle is-subtle"
                onClick={() => setMapVisible(false)}
              >
                Hide map
              </button>
            </section>
            <aside className="avatar-split-right is-sage-only" aria-label="Sage">
              <SageAvatar
                speaking={speaking}
                listening={listening}
                subtitle={spokenSubtitle}
                caption={spokenCaption || streamingText}
                mood={mood}
                muted={voiceMuted}
                figureOnly
                voiceOnly
                onToggleMute={() => {
                  const next = !voiceMuted;
                  setVoiceMuted(next);
                  mutedRef.current = next;
                  if (next) stopSpeaking();
                }}
                onStop={stopSpeaking}
                size="hero"
              />
              {sageLesson?.sections?.length ? (
                <SageLessonPanel sections={sageLesson.sections} />
              ) : null}
            </aside>
          </div>
        ) : (
          <div className="avatar-solo-sage is-voice-only">
            <SageAvatar
              speaking={speaking}
              listening={listening}
              subtitle={spokenSubtitle}
              caption={spokenCaption || streamingText}
              mood={mood}
              muted={voiceMuted}
              voiceOnly
              onToggleMute={() => {
                const next = !voiceMuted;
                setVoiceMuted(next);
                mutedRef.current = next;
                if (next) stopSpeaking();
              }}
              onStop={stopSpeaking}
              size="lg"
            />
            {sageLesson?.sections?.length ? (
              <SageLessonPanel sections={sageLesson.sections} />
            ) : null}
          </div>
        )}

        {/* Screen-reader + live region only — no chat history UI */}
        <div className="avatar-sr-only" aria-live="polite" ref={listRef}>
          {speechLine ||
            (busy ? 'Sage is thinking…' : '') ||
            messages[messages.length - 1]?.content ||
            ''}
        </div>

        {listening ? (
          <p className="avatar-live-caption is-listen-banner" aria-live="polite">
            <span className="avatar-live-dot is-on" />
            {liveCaption
              ? `Listening: ${liveCaption}`
              : 'Listening… tap Mic again to send.'}
          </p>
        ) : null}

        {focusQuestion && !activeMiss ? (
          <section
            className="avatar-focus-question"
            aria-label="Farm science question"
          >
            <p className="avatar-focus-question-kicker">
              {quiz?.questionData?.chapter_name ||
                quiz?.chapter_name ||
                quiz?.chapter ||
                inferConceptFromText(focusQuestion) ||
                (interventionFocus?.concept_topic &&
                !/science idea|^science$/i.test(
                  String(interventionFocus.concept_topic),
                )
                  ? interventionFocus.concept_topic
                  : 'Farm question')}
            </p>
            <p className="avatar-focus-question-text">{focusQuestion}</p>
          </section>
        ) : null}

        <div className="avatar-action-dock">
        {/* Compact letter picks during behavior probe (not science answers) */}
        {behaviorOptions?.length && !busy ? (
          <div
            className="avatar-letter-row"
            role="group"
            aria-label="Tell Sage what you need"
          >
            <ActiveMissQuiz miss={activeMiss} />
            {probePrompt ? (
              <p className="avatar-probe-prompt">{probePrompt}</p>
            ) : null}
            <p className="avatar-probe-hint">
              These choices tell Sage how to help — they are not answers to the
              farm question.
            </p>
            {behaviorOptions.map((opt) => (
              <button
                key={opt.id || opt.letter}
                type="button"
                className="avatar-letter-chip is-labeled"
                title={opt.label}
                disabled={busy}
                onClick={() => {
                  void sendMessage(`${opt.letter}. ${opt.label}`);
                }}
              >
                <span className="avatar-letter-chip-key">{opt.letter}</span>
                <span className="avatar-letter-chip-text">{opt.label}</span>
              </button>
            ))}
          </div>
        ) : activeMiss ? (
          <div className="avatar-letter-row is-miss-only" aria-label="This miss">
            <ActiveMissQuiz miss={activeMiss} />
          </div>
        ) : null}

        {tutorTurn && !behaviorOptions.length ? (
          <div className="avatar-tutor-panel" aria-live="polite">
            {tutorTurn.nextAction === 'INSUFFICIENT_KNOWLEDGE' ? (
              <p className="avatar-tutor-fallback">
                Sage will not guess a new science fact here. Re-read the farm
                question, or try a different angle.
              </p>
            ) : null}
            <div className="avatar-tutor-actions">
              {tutorTurn.nextAction !== 'INSUFFICIENT_KNOWLEDGE' &&
              tutorTurn.nextAction !== 'CONTINUE' ? (
                <button
                  type="button"
                  className="avatar-tutor-chip"
                  disabled={busy}
                  onClick={() => {
                    void sendMessage('I need a hint');
                  }}
                >
                  Hint
                </button>
              ) : null}
              <button
                type="button"
                className="avatar-tutor-chip"
                disabled={busy}
                onClick={() => {
                  void sendMessage('I am ready to try the farm question again');
                }}
              >
                Try the farm again
              </button>
            </div>
          </div>
        ) : null}

        <div className="avatar-action-bar">
        <div className="avatar-socrates-row">
          <button
            type="button"
            className="avatar-socrates-btn"
            onClick={() => {
              void handleAskSocrates();
            }}
            disabled={socratesBusy}
            title="Ask Socrates about this science idea"
          >
            <span className="avatar-socrates-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path
                  d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5a3.5 3.5 0 0 1-3.5 3.5H12l-4 3.5V15H8.5A3.5 3.5 0 0 1 5 11.5v-5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="9" r="1" fill="currentColor" />
                <circle cx="12" cy="9" r="1" fill="currentColor" />
                <circle cx="15" cy="9" r="1" fill="currentColor" />
              </svg>
            </span>
            {socratesBusy ? 'Opening Socrates…' : 'Ask Socrates'}
          </button>
          {socratesNote ? (
            <p className="avatar-socrates-note" role="status">
              {socratesNote}
            </p>
          ) : (
            <p className="avatar-socrates-hint">
              Chat with your science tutor about this lesson
            </p>
          )}
        </div>

        <form
          className="avatar-compose is-voice-compose"
          onSubmit={(e) => {
            e.preventDefault();
            const text = String(
              inputRef.current?.value || inputValueRef.current || input,
            ).trim();
            if (text) sendMessage(text);
          }}
        >
          <label className="avatar-sr-only" htmlFor="avatar-input">
            Talk or type to Sage
          </label>
          <input
            id="avatar-input"
            ref={inputRef}
            type="text"
            value={input}
            placeholder={
              listening
                ? 'Listening… tap Mic again to send'
                : speechSupported
                  ? 'Type or use Mic…'
                  : 'Type a message…'
            }
            onChange={(e) => {
              const v = e.target.value;
              inputValueRef.current = v;
              setInput(v);
              if (!listening) captureBaseRef.current = v;
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === ' ' || e.code === 'Space') {
                e.stopPropagation();
              }
            }}
            onKeyUp={(e) => e.stopPropagation()}
            onKeyPress={(e) => e.stopPropagation()}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            className={`avatar-mic${listening ? ' is-on' : ''}`}
            disabled={!speechSupported && !listening}
            title={
              speechSupported
                ? listening
                  ? 'Stop and send'
                  : 'Speak'
                : 'Mic needs Chrome or Edge'
            }
            onClick={() => {
              void toggleLiveCapture();
            }}
          >
            {listening ? 'Done' : 'Mic'}
          </button>
          <button
            type="submit"
            className="avatar-send"
            disabled={!String(input || '').trim()}
          >
            Send
          </button>
        </form>
        </div>
        </div>

        {error ? (
          <p className="avatar-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <MindMapHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}

function moodForMode(mode, tier = 'AVERAGE') {
  if (
    mode === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE ||
    tier === 'SMART'
  ) {
    return AVATAR_MOODS.proud;
  }
  if (mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE) {
    return AVATAR_MOODS.encouraging;
  }
  if (tier === 'WEAK') return AVATAR_MOODS.empathetic;
  return AVATAR_MOODS.empathetic;
}

function modeLabel(mode) {
  switch (mode) {
    case INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE:
      return 'Enrichment & Challenge';
    case INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE:
      return 'Congratulate & Advance';
    default:
      return 'Support & Concept Repair';
  }
}

function bootstrapMessage(
  mode,
  mindMap,
  scenario,
  tier = 'AVERAGE',
  nonWrongCode = null,
  metrics = null,
  focus = null,
) {
  if (focus?.coach_auto_signal) return focus.coach_auto_signal;

  const code = String(nonWrongCode || focus?.code || '').toUpperCase();
  const concept =
    focus?.concept_topic || mindMap?.topic || 'the science idea in this farm question';
  const problem =
    focus?.problem_statement ||
    describeFocusCode(code) ||
    'a detected learning difficulty';

  return (
    `Private coach note. ` +
    `Why opened: ${problem}. ` +
    `${focus?.mentor_brief || 'Help the student recover the science idea.'} ` +
    `Greet with the student's first name. Explain why you came. ` +
    `If you know the correct quiz answer, do not dump it on open. First understand the hang-up.` +
    `Do NOT open with another science quiz. Never rank the student.`
  );
}

function greetingFor(
  reason,
  mode,
  mindMap,
  scenario,
  tier = 'AVERAGE',
  nonWrongCode = null,
  focus = null,
) {
  const concept =
    focus?.concept_topic || mindMap?.topic || 'this farm science idea';
  const why =
    focus?.friendly_why ||
    focus?.problem_statement_friendly ||
    friendlyWhyOpened(focus?.code || nonWrongCode || reason);

  if (mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE || scenario === 'bored') {
    return `You are doing great with farm science. Want a fun extra challenge on ${concept}?`;
  }
  if (mode === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE) {
    return `Wonderful work! What should we try next on the farm?`;
  }
  if (focus?.assistance_level === 'escalated') {
    return `I'm still with you on ${concept}. We'll take tiny steps. What part feels stickiest right now?`;
  }
  return `I came over because ${why}. Let's talk about ${concept}. What part still feels fuzzy?`;
}

function reasonCopy(reason, mode, focus = null) {
  if (focus?.friendly_why || focus?.problem_statement_friendly) {
    const why = focus.friendly_why || focus.problem_statement_friendly;
    const c = focus.concept_topic ? ` · ${focus.concept_topic}` : '';
    return `I came over because ${why}${c}`;
  }
  const why = friendlyWhyOpened(focus?.code || reason);
  const c = focus?.concept_topic ? ` · ${focus.concept_topic}` : '';
  if (mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE) {
    return 'You are ready for a fun extra challenge';
  }
  if (mode === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE) {
    return 'Celebrating your great farm work';
  }
  if (reason === 'manual') return 'You asked Sage for help';
  return `I came over because ${why}${c}`;
}

