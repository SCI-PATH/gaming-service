/**
 * Personalized AI Learning Companion — mind maps, motivation, adaptive chat.
 * Sage portrait avatar speaks (TTS word-by-word) while the mind map stays interactive.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ADAPTIVE_PROBES,
  AVATAR_MOODS,
  DEFAULT_QUICK_PROMPTS,
  INTERVENTION_MODES,
  QUICK_PROMPTS,
} from './avatarConstants.js';
import { buildContextPayload } from './buildContextPayload.js';
import { streamAvatarChat } from './avatarChatClient.js';
import { createRealtimeSpeechCapture } from './createRealtimeSpeechCapture.js';
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
import { QUESTION_FORMATS,
} from './learningPreferences.js';
import { buildPersonalizedMindMap } from './buildMindMap.js';

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

  const resolvedMode =
    interventionMode ||
    telemetry.lastInterventionMode ||
    INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD;

  const resolvedScenario =
    scenario || telemetry.scenario || null;

  const shouldOfferMap =
    offerMindMapProp ??
    telemetry.offerMindMap ??
    triggerReason === 'concept_misconceptions' ??
    false;

  const [mood, setMood] = useState(AVATAR_MOODS.empathetic);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [liveCaption, setLiveCaption] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [providerNote, setProviderNote] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  // Mind map hidden until needed — avoid interrupting free play with wall of UI
  const [mapVisible, setMapVisible] = useState(false);
  const [localMap, setLocalMap] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [spokenSubtitle, setSpokenSubtitle] = useState('');
  const [spokenCaption, setSpokenCaption] = useState('');
  const [spokenSoFar, setSpokenSoFar] = useState('');
  const [spokenCurrentWord, setSpokenCurrentWord] = useState('');
  const [speechMapFocus, setSpeechMapFocus] = useState(null);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const subtitleCuesRef = useRef([]);
  const focusTermsRef = useRef([]);
  const spokenWordsRef = useRef([]);
  const narratingRef = useRef(false);
  const narrationSessionRef = useRef(0);

  const mindMap = useMemo(() => {
    // Prefer a map rebuilt from the full misconception history (every miss)
    if (misconceptions?.length) {
      return (
        localMap ||
        buildPersonalizedMindMap({ misconceptions }) ||
        mindMapProp ||
        telemetry.mindMap
      );
    }
    return localMap || mindMapProp || telemetry.mindMap || null;
  }, [localMap, misconceptions, mindMapProp, telemetry.mindMap]);

  const quickPrompts =
    QUICK_PROMPTS[resolvedMode] || DEFAULT_QUICK_PROMPTS;

  useEffect(() => {
    const capture = createRealtimeSpeechCapture({
      onUpdate: ({ listening: isOn, fullText, interim }) => {
        setListening(isOn);
        setLiveCaption(interim || '');
        if (isOn) {
          const base = captureBaseRef.current;
          const next = [base, fullText].filter(Boolean).join(' ').trim();
          setInput(next);
        }
      },
      onError: (msg) => setError(msg),
    });
    speechRef.current = capture;
    setSpeechSupported(capture.supported);

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
    setSpeechMapFocus({
      kind: segment.kind || 'branch',
      branchId: segment.branchId || null,
      highlights,
    });
  }, []);

  const speakText = useCallback(
    async (text) => {
      if (mutedRef.current || voiceMuted) return;
      const t = String(text || '').trim();
      if (!t || !ttsRef.current?.supported) return;
      if (speechRef.current?.listening) {
        speechRef.current.stop();
        setListening(false);
      }
      setSpokenCaption(t);
      await ttsRef.current.speak(t);
    },
    [voiceMuted],
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
      if (!branch || voiceMuted || mutedRef.current) return;
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
      setMessages([]);
      setProviderNote(null);
      setStreamingText('');
      setMood(moodForMode(resolvedMode));
      setLocalMap(null);
      setMapVisible(false);
      setSpeaking(false);
      setSpokenSubtitle('');
      setSpokenCaption('');
      setSpokenSoFar('');
      setSpokenCurrentWord('');
      setSpeechMapFocus(null);
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
      return undefined;
    }

    setMood(moodForMode(resolvedMode));

    // Rebuild full multi-miss map on open (never show a single-miss partial map)
    const fullMap = misconceptions?.length
      ? buildPersonalizedMindMap({ misconceptions })
      : mindMapProp || telemetry.mindMap || null;
    if (fullMap) setLocalMap(fullMap);

    setMessages([
      {
        role: 'assistant',
        content: greetingFor(
          triggerReason,
          resolvedMode,
          fullMap || mindMap,
          resolvedScenario,
        ),
      },
    ]);
    setProviderNote(
      'Intelligent intervention · appears only when multi-metric signals show real need.',
    );
    // Auto-show comprehensive map when support + any mind map of misses is available
    const openMap =
      shouldOfferMap ||
      triggerReason === 'concept_misconceptions' ||
      triggerReason === 'repeated_incorrect' ||
      resolvedScenario === 'struggling_concept' ||
      resolvedScenario === 'struggling';
    setMapVisible(Boolean(openMap && (fullMap || mindMap)));

    // Speak greeting when there is no map; map narration is handled by ConceptMindMap
    const greeting = greetingFor(
      triggerReason,
      resolvedMode,
      fullMap || mindMap,
      resolvedScenario,
    );
    const willShowMap = Boolean(openMap && (fullMap || mindMap));
    if (!willShowMap) {
      window.setTimeout(() => {
        if (!mutedRef.current) speakText(greeting);
      }, 450);
    } else {
      // Light intro once; full walkthrough starts when map mounts
      window.setTimeout(() => {
        if (mutedRef.current) return;
        speakText(
          "I'm Sage. While I explain your mind map, you can still tap every miss card.",
        );
      }, 400);
    }

    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      window.clearTimeout(t);
      speechRef.current?.stop();
      ttsRef.current?.stop();
    };
    // misconceptions read once on open — avoid resetting chat on every array identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, triggerReason, resolvedMode, resolvedScenario]);

  useEffect(() => {
    if (!open || autoFetchedRef.current) return;
    if (triggerReason === 'manual' || !triggerReason) return;
    autoFetchedRef.current = true;
    const bootstrap = bootstrapMessage(
      resolvedMode,
      mindMap,
      resolvedScenario,
    );
    const t = window.setTimeout(() => {
      sendMessage(bootstrap, { silentUser: false });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, triggerReason, resolvedMode]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy, streamingText, mapVisible]);

  const toggleLiveCapture = () => {
    const cap = speechRef.current;
    if (!cap?.supported) {
      setError(
        'Live voice capture needs Chrome/Edge with microphone permission.',
      );
      return;
    }
    // Stop Sage's voice so the student can talk clearly
    stopSpeaking();
    if (listening || cap.listening) {
      cap.stop();
      setListening(false);
      setLiveCaption('');
      captureBaseRef.current = input.trim();
      return;
    }
    setError(null);
    captureBaseRef.current = input.trim();
    cap.resetText?.();
    cap.start();
  };

  const revealMindMap = () => {
    // Always rebuild from all known misconceptions so every miss appears
    let map =
      (misconceptions?.length
        ? buildPersonalizedMindMap({ misconceptions })
        : null) ||
      mindMap;
    if (!map && onShowMindMap) {
      map = onShowMindMap();
    }
    if (map) setLocalMap(map);
    setMapVisible(true);
    if (map) {
      const n = map.missCount || map.sourceAttempts?.length || 1;
      const line = `Here’s one mind map for all ${n} wrong answer${n === 1 ? '' : 's'} — each card is a different miss. I’ll explain them while you browse.`;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: line,
        },
      ]);
      narratedMapKeyRef.current = '';
      speakText(line).then(() => narrateMindMap(map));
    }
  };

  const sendMessage = async (rawText, { silentUser = false } = {}) => {
    const studentMessage = String(rawText || '').trim();
    if (!studentMessage || busy) return;

    setError(null);
    speechRef.current?.stop();
    captureBaseRef.current = '';
    setLiveCaption('');
    setInput('');

    onLearningMessage?.(studentMessage);

    const wantsMap =
      /mind map|concept map|show map|relationships/i.test(studentMessage);
    if (wantsMap) {
      revealMindMap();
    }

    const userMsg = { role: 'user', content: studentMessage };
    if (!silentUser) {
      setMessages((prev) => [...prev, userMsg]);
    }
    setBusy(true);
    setStreamingText('');

    const mapForPayload =
      mindMap ||
      (misconceptions?.length
        ? buildPersonalizedMindMap({ misconceptions })
        : null);

    const contextPayload = buildContextPayload({
      student,
      farm,
      gameplay,
      telemetry,
      metrics: metrics || telemetry.metrics,
      quiz,
      triggerReason,
      interventionMode: resolvedMode,
      perceivedState,
      misconceptions,
      learningPrefs,
      mindMap: mapForPayload,
    });

    const history = [...messages, userMsg]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

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
          setStreamingText(full);
        },
      });

      if (result.avatarMood) setMood(result.avatarMood);
      if (result.fallback) {
        setProviderNote(
          result.error ||
            (result.provider === 'offline'
              ? 'Offline mentor (set GROQ_API_KEY for cloud).'
              : 'Mentor stream used safe fallback text.'),
        );
      } else {
        setProviderNote(
          result.provider
            ? `Groq · ${result.model || 'llama'} · ${modeLabel(resolvedMode)}`
            : 'Live mentor stream',
        );
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.reply },
      ]);
      setStreamingText('');
      if (result.reply && !silentUser) {
        speakText(result.reply);
      } else if (result.reply && silentUser && !mapVisible) {
        speakText(result.reply);
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Avatar chat failed');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            "I'm still with you. Use a probe chip, open the mind map, or speak with Live capture.",
        },
      ]);
      setStreamingText('');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const moodLabel =
    mood === AVATAR_MOODS.empathetic
      ? 'Supporting your learning'
      : mood === AVATAR_MOODS.encouraging
        ? 'Stretching your challenge'
        : mood === AVATAR_MOODS.proud
          ? 'Celebrating your growth'
          : 'Your learning companion';

  return (
    <div
      className="avatar-assistant-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`avatar-assistant-card is-mood-${mood} is-companion${
          mapVisible && mindMap ? ' has-map-split' : ''
        }`}
      >
        <header className="avatar-assistant-topbar">
          <div className="avatar-assistant-titles">
            <p className="avatar-kicker">Sage · live mentor voice</p>
            <h2 id={titleId}>Your farm science companion</h2>
            <p className="avatar-mood-label">{moodLabel}</p>
          </div>
          <button
            type="button"
            className="avatar-close"
            onClick={() => {
              stopSpeaking();
              onClose?.();
            }}
            aria-label="Close mentor"
          >
            Close
          </button>
        </header>

        <p className="avatar-reason" aria-live="polite">
          {reasonCopy(triggerReason, resolvedMode)}
        </p>
        <p className="avatar-mode-badge" data-mode={resolvedMode}>
          Mode: {modeLabel(resolvedMode)}
          {misconceptions?.length
            ? ` · ${misconceptions.length} concept gap${misconceptions.length === 1 ? '' : 's'}`
            : ''}
          {speaking ? ' · Sage is speaking' : ''}
        </p>

        {/* Vertical split: mind map LEFT · speaking avatar RIGHT */}
        {mapVisible && mindMap ? (
          <div className="avatar-split-stage" aria-label="Mind map and mentor">
            <section className="avatar-split-left" aria-label="Mind map">
              <p className="avatar-split-label">Mind map · all incorrect answers</p>
              <div className="avatar-split-map-scroll">
                <ConceptMindMap
                  map={mindMap}
                  misconceptions={misconceptions}
                  onNodeSelect={handleMissSelect}
                  onMapChange={handleMapChange}
                  speechFocus={speechMapFocus}
                  spokenSoFar={spokenSoFar}
                  currentWord={spokenCurrentWord}
                  activePhrase={spokenSubtitle}
                  segmentText={spokenCaption}
                />
              </div>
              <p className="avatar-map-voice-note">
                Tap any card while Sage talks — the map stays interactive.
              </p>
              <button
                type="button"
                className="avatar-mindmap-toggle is-subtle"
                onClick={() => setMapVisible(false)}
              >
                Hide mind map
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
                onToggleMute={() => {
                  const next = !voiceMuted;
                  setVoiceMuted(next);
                  mutedRef.current = next;
                  if (next) stopSpeaking();
                }}
                onStop={stopSpeaking}
                size="hero"
              />
            </aside>
          </div>
        ) : (
          <div className="avatar-solo-sage">
            <SageAvatar
              speaking={speaking}
              listening={listening}
              subtitle={spokenSubtitle}
              caption={spokenCaption || streamingText}
              mood={mood}
              muted={voiceMuted}
              onToggleMute={() => {
                const next = !voiceMuted;
                setVoiceMuted(next);
                mutedRef.current = next;
                if (next) stopSpeaking();
              }}
              onStop={stopSpeaking}
              size="lg"
            />
            <p className="avatar-voice-hint">
              {ttsSupported
                ? 'I speak each word aloud. Open the mind map anytime after wrong answers.'
                : 'Voice read-aloud needs Chrome or Edge. You can still chat.'}
            </p>
          </div>
        )}

        {!mapVisible && (mindMap || misconceptions?.length) ? (
          <button
            type="button"
            className="avatar-mindmap-toggle"
            onClick={revealMindMap}
          >
            Show concept mind map
          </button>
        ) : null}

        <div
          className={`avatar-live-capture${listening ? ' is-live' : ''}`}
          aria-live="polite"
        >
          <div className="avatar-live-row">
            <span className={`avatar-live-dot${listening ? ' is-on' : ''}`} />
            <strong>{listening ? 'LIVE CAPTURE' : 'Voice capture ready'}</strong>
            <button
              type="button"
              className={`avatar-live-btn${listening ? ' is-on' : ''}`}
              disabled={!speechSupported || busy}
              onClick={toggleLiveCapture}
            >
              {listening ? 'Stop capture' : 'Start live capture'}
            </button>
          </div>
          {listening ? (
            <p className="avatar-live-caption">
              {liveCaption ||
                'Listening… talk about what confuses you or what format you like.'}
            </p>
          ) : (
            <p className="avatar-live-caption is-muted">
              Adaptive chat: motivation, concepts, and preferences—not another quiz sheet.
            </p>
          )}
        </div>

        <div className="avatar-chat-log" ref={listRef}>
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`avatar-bubble is-${m.role}`}
            >
              {m.content}
            </div>
          ))}
          {busy && streamingText ? (
            <div className="avatar-bubble is-assistant is-streaming">
              {streamingText}
              <span className="avatar-stream-caret" aria-hidden />
            </div>
          ) : null}
          {busy && !streamingText ? (
            <div className="avatar-bubble is-assistant is-typing">
              Personalizing mentor reply…
            </div>
          ) : null}
        </div>

        <div className="avatar-section-label">Adaptive probes</div>
        <div className="avatar-quick-prompts">
          {quickPrompts.map((p) => (
            <button
              key={p.id}
              type="button"
              className="avatar-chip"
              disabled={busy}
              onClick={() => {
                if (p.id === 'mind-map') revealMindMap();
                sendMessage(p.text);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="avatar-section-label">Preferred question formats</div>
        <div className="avatar-quick-prompts avatar-formats">
          {QUESTION_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`avatar-chip is-format${
                learningPrefs?.preferredFormats?.includes(f.id) ? ' is-on' : ''
              }`}
              disabled={busy}
              onClick={() => sendMessage(f.text)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {resolvedMode !== INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD ? (
          <div className="avatar-quick-prompts">
            {ADAPTIVE_PROBES.formats.map((p) => (
              <button
                key={p.id}
                type="button"
                className="avatar-chip"
                disabled={busy}
                onClick={() => sendMessage(p.text)}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="avatar-compose"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
        >
          <label className="avatar-sr-only" htmlFor="avatar-input">
            Tell your mentor how you feel or prefer to learn
          </label>
          <input
            id="avatar-input"
            ref={inputRef}
            type="text"
            value={input}
            disabled={busy}
            placeholder={
              listening
                ? 'Capturing your words…'
                : 'Share confusion, motivation, or format preference…'
            }
            onChange={(e) => {
              setInput(e.target.value);
              if (!listening) captureBaseRef.current = e.target.value;
            }}
            autoComplete="off"
          />
          <button
            type="button"
            className={`avatar-mic${listening ? ' is-on' : ''}`}
            disabled={!speechSupported || busy}
            title="Toggle live voice capture"
            onClick={toggleLiveCapture}
          >
            {listening ? 'Live' : 'Mic'}
          </button>
          <button
            type="submit"
            className="avatar-send"
            disabled={busy || !input.trim()}
          >
            Send
          </button>
        </form>

        {error ? (
          <p className="avatar-error" role="alert">
            {error}
          </p>
        ) : null}
        {providerNote ? (
          <p className="avatar-provider-note">{providerNote}</p>
        ) : null}
        <p className="avatar-guardrail">
          Sage is a learning companion: mind maps from your mistakes teach the
          correct idea for those items, then motivate and personalize—without
          spoiling new, unanswered questions.
        </p>
      </div>
    </div>
  );
}

function moodForMode(mode) {
  if (mode === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE) {
    return AVATAR_MOODS.proud;
  }
  if (mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE) {
    return AVATAR_MOODS.encouraging;
  }
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

function bootstrapMessage(mode, mindMap, scenario) {
  if (
    scenario === 'struggling_concept' ||
    (mindMap?.topic && mode === INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD)
  ) {
    return `It looks like I'm having difficulty with ${mindMap?.topic || 'this topic'}. I'd like a simplified explanation or to walk the mind map.`;
  }
  if (scenario === 'frustrated' || scenario === 'struggling') {
    return "I'm having some difficulty. Which part of this lesson is confusing, and could I get a hint before the next try?";
  }
  if (
    mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE ||
    scenario === 'bored' ||
    scenario === 'preference_check'
  ) {
    return 'I seem to be mastering this quickly. Want more challenging questions or a different activity type?';
  }
  if (mode === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE) {
    return 'Celebrate my strong progress and recommend what I should unlock next.';
  }
  return "I'm ready for support if you think I need it—help me learn without spoiling brand-new questions.";
}

function greetingFor(reason, mode, mindMap, scenario) {
  const missN = mindMap?.missCount || mindMap?.sourceAttempts?.length || 0;
  const mapBit =
    missN > 0
      ? ` I built a mind map with ${missN} arm${missN === 1 ? '' : 's'}—one for every wrong answer—so you can repair each idea.`
      : '';

  if (
    scenario === 'struggling_concept' ||
    reason === 'concept_misconceptions'
  ) {
    return `It looks like you're having difficulty with ${mindMap?.topic || 'this topic'} after several tries.${mapBit} Tap each colored arm: your pick → correct idea.`;
  }
  if (reason === 'repeated_incorrect') {
    return `This stretch has been tough—several incorrect farm challenges.${mapBit} Every miss is a branch you can explore.`;
  }
  if (scenario === 'frustrated' || reason === 'frustration_pattern') {
    return `You seem to be having some difficulty—and that's okay.${mapBit} Which branch still confuses you?`;
  }
  if (scenario === 'struggling' || reason === 'struggling_metrics') {
    return `A few learning signals say this stretch is tough—not just one wrong answer.${mapBit} Want a simplified explanation after you explore a branch?`;
  }
  if (
    mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE ||
    scenario === 'bored'
  ) {
    return "You seem to be mastering this topic quickly. Would you like to try more challenging questions or a different activity—puzzles, scenarios, or stretch goals?";
  }
  if (mode === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE) {
    return "Milestone energy! Let's celebrate the habit that worked, then choose your next advance.";
  }
  switch (reason) {
    case 'manual':
      return "You called me in—great self-advocacy. We can map every missed concept, boost motivation, or set activity preferences.";
    default:
      return "I'm Sage. I only auto-join when multi-metric signals show real need—so you can keep farming and learning independently.";
  }
}

function reasonCopy(reason, mode) {
  if (reason === 'concept_misconceptions') {
    return 'Smart check-in: 4+ misses on the same concept · mind map ready';
  }
  if (reason === 'repeated_incorrect') {
    return 'Smart check-in: 4 incorrect answers · support offered';
  }
  if (reason === 'frustration_pattern') {
    return 'Smart check-in: frustration pattern (retries / rage / declining performance)';
  }
  if (reason === 'struggling_metrics') {
    return 'Smart check-in: multi-signal struggle (not a single wrong answer)';
  }
  if (mode === INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE) {
    return 'Smart check-in: high mastery + idle (may be under-challenged)';
  }
  if (mode === INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE) {
    return 'Smart check-in: clear mastery milestone';
  }
  switch (reason) {
    case 'manual':
      return 'You opened your learning companion';
    default:
      return 'Intelligent mentor · intervenes only when support is genuinely needed';
  }
}
