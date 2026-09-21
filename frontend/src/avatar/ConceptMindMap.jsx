/**
 * Concept mind map: assessment-engine knowledge, no student wrong answers.
 * Highlights only the word currently being spoken by Sage (reading-flow sync).
 */
import { Component, useEffect, useMemo, useState } from 'react';
import { fetchAiMindMap } from './fetchAiMindMap.js';
import { buildPersonalizedMindMap } from './buildMindMap.js';
import { softProviderNote, safeScienceLine } from './kidFriendlySpeech.js';
import {
  alignSpeechToText,
  buildReadingTimeline,
  resolveLiveSpeechIndex,
  tokenizeMapText,
} from './speechSync.js';
import { downloadMindMap } from './downloadMindMap.js';
import RadialMindMap from './RadialMindMap.jsx';
import { getCurrentStudent } from '../data/mockStudents.js';

const COLORS = [
  { stroke: '#c45c5c', fill: '#fde8e8', bar: '#c45c5c' },
  { stroke: '#3a7fb8', fill: '#dceefb', bar: '#3a7fb8' },
  { stroke: '#d4892a', fill: '#fff0d6', bar: '#d4892a' },
  { stroke: '#2f8a7a', fill: '#d8f3ee', bar: '#2f8a7a' },
  { stroke: '#7a5aa8', fill: '#efe8f8', bar: '#7a5aa8' },
  { stroke: '#5a6570', fill: '#e8ecef', bar: '#5a6570' },
];

function attemptsFromProps(map, misconceptions) {
  if (Array.isArray(map?.sourceAttempts) && map.sourceAttempts.length) {
    return map.sourceAttempts;
  }
  if (Array.isArray(map?.branches) && map.branches[0]?.prompt) {
    return map.branches.map((b) => ({
      topic: b.topic || b.label,
      prompt: b.prompt,
      studentAnswer: b.studentAnswer,
      correctAnswer: b.correctAnswer,
      hint: b.hint,
    }));
  }
  if (Array.isArray(misconceptions) && misconceptions.length) {
    return misconceptions.flatMap((m) =>
      (m.attempts || []).map((a) => ({
        topic: a.topic || m.topic,
        prompt: a.prompt,
        studentAnswer: a.studentAnswer,
        correctAnswer: a.correctAnswer,
        hint: a.hint || m.hint,
        questionType: a.questionType,
        questionId: a.questionId,
      })),
    );
  }
  return [];
}

function localMapFromAttempts(attempts, misconceptions, frustration = {}) {
  if (attempts.length) {
    return buildPersonalizedMindMap({
      attempts,
      misconceptions,
      frustrationScore: frustration.score ?? null,
      frustrationLevel: frustration.level || null,
    });
  }
  return null;
}

function uniqueQuestionBranches(branches) {
  const seen = new Set();
  const out = [];
  for (const b of branches) {
    const key = String(b.question || b.prompt || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
        out.push({ ...b, index: out.length + 1, id: b.id || `concept-${out.length}` });
  }
  return out;
}

function toDisplayBranches(map) {
  if (!map) return [];
  if (Array.isArray(map.branches) && map.branches.length) {
    const mapped = map.branches.map((b, i) => ({
      id: b.id || `concept-${i}`,
      index: b.index || i + 1,
      topic: b.topic || b.label || 'Science',
      icon: b.icon || '🔬',
      question: b.prompt || b.question || '',
      studentAnswer: '',
      correctAnswer:
        safeScienceLine(b.correctAnswer || b.correct_answer, null) ||
        '',
      why: '',
      keyConcept:
        safeScienceLine(
          b.keyConcept || b.key_concept || b.topic,
          b.topic || 'Science',
        ),
      keyExplain:
        safeScienceLine(
          b.keyExplain || b.key_concept_explain || b.summary,
          '',
        ) || '',
      farmLink: b.farmLink || b.farm_link || '',
      colorIndex: b.colorIndex ?? b.color_index ?? i % 6,
      lesson: null,
      pedagogy: Array.isArray(b.pedagogy) ? b.pedagogy : [],
      options: [],
      hint: b.hint || null,
      prompt: b.prompt || b.question || '',
      questionType: b.questionType || b.question_type || '',
      blankIndex: b.blankIndex || b.blank_index || null,
      blankIndexes: Array.isArray(b.blankIndexes)
        ? b.blankIndexes
        : Array.isArray(b.blank_indexes)
          ? b.blank_indexes
          : [],
      conceptGraph: b.conceptGraph || b.concept_graph || null,
      keywords: Array.isArray(b.keywords) ? b.keywords : [],
    }));
    return uniqueQuestionBranches(mapped);
  }
  return [];
}

/**
 * Only lights the currently spoken map token (optional short phrase tail).
 */
function LiveSyncText({
  text,
  enabled = false,
  globalCurrentIndex = -1,
  tokenOffset = 0,
  phraseWindow = 1,
  empty = '—',
}) {
  const raw = String(text || '');
  const { tokens, states } = useMemo(
    () =>
      alignSpeechToText({
        text: raw,
        enabled:
          enabled &&
          globalCurrentIndex >= 0 &&
          tokenizeMapText(raw).length > 0,
        globalCurrentIndex,
        tokenOffset,
        phraseWindow,
      }),
    [raw, enabled, globalCurrentIndex, tokenOffset, phraseWindow],
  );

  if (!raw) return empty;
  if (!enabled) return raw;

  return (
    <span className="mm-sync">
      {tokens.map((tok, i) => {
        const st = states[i];
        const cls =
          st === 'current'
            ? 'mm-w is-current'
            : st === 'phrase'
              ? 'mm-w is-phrase'
              : 'mm-w';
        return (
          <span key={`${tok.word}-${i}`}>
            <span className={cls}>{tok.word}</span>
            {tok.sep}
          </span>
        );
      })}
    </span>
  );
}

function ConceptMindMap({
  map: seedMap = null,
  misconceptions = [],
  compact = false,
  onNodeSelect = null,
  onMapChange = null,
  enableAi = true,
  speechFocus = null,
  spokenSoFar = '',
  currentWord = '',
  /** Current subtitle sentence being spoken */
  activePhrase = '',
  segmentText = '',
  frustrationScore = null,
  frustrationLevel = null,
}) {
  const seedAttempts = useMemo(
    () => attemptsFromProps(seedMap, misconceptions),
    [seedMap, misconceptions],
  );

  const resolvedFrustrationScore =
    frustrationScore ??
    seedMap?.frustrationScore ??
    null;
  const resolvedFrustrationLevel =
    frustrationLevel ||
    seedMap?.frustrationLevel ||
    null;

  const attemptKey = useMemo(
    () =>
      seedAttempts
        .map((a) => `${a.prompt}|${a.studentAnswer}|${a.correctAnswer}`)
        .join('||') +
      `|fr:${resolvedFrustrationScore ?? ''}:${resolvedFrustrationLevel || ''}`,
    [seedAttempts, resolvedFrustrationScore, resolvedFrustrationLevel],
  );

  const [liveMap, setLiveMap] = useState(null);
  const [status, setStatus] = useState('idle');
  const [note, setNote] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [explored, setExplored] = useState(() => new Set());
  const [downloadState, setDownloadState] = useState('idle');

  useEffect(() => {
    let cancelled = false;
    const fallback =
      seedMap?.layout === 'concept-map' ||
      seedMap?.layout === 'all-misses-ai' ||
      seedMap?.layout === 'radial'
        ? seedMap
        : localMapFromAttempts(seedAttempts, misconceptions, {
            score: resolvedFrustrationScore,
            level: resolvedFrustrationLevel,
          }) || seedMap;

    if (!seedAttempts.length && !seedMap) {
      setLiveMap(null);
      setStatus('idle');
      return undefined;
    }

    if (fallback && !enableAi) {
      setLiveMap(fallback);
      setStatus('ready');
      setNote('Saved concept map.');
      const first = toDisplayBranches(fallback)[0];
      setActiveId(first?.id || null);
      setExplored(new Set());
      onMapChange?.(fallback);
      return undefined;
    }

    if (!enableAi || !seedAttempts.length) {
      setStatus('ready');
      return undefined;
    }

    setStatus('loading');
    setNote('Building mind map from textbook chunks…');

    (async () => {
      try {
        const student = getCurrentStudent();
        const grade =
          Number(seedAttempts[0]?.grade) ||
          Number(student?.grade) ||
          6;
        const result = await fetchAiMindMap({
          attempts: seedAttempts,
          misconceptions,
          frustrationScore: resolvedFrustrationScore,
          frustrationLevel: resolvedFrustrationLevel,
          studentId: student?.id || '',
          grade,
        });
        if (cancelled) return;
        if (result.mindMap) {
          setLiveMap(result.mindMap);
          const first = toDisplayBranches(result.mindMap)[0];
          setActiveId(first?.id || null);
          onMapChange?.(result.mindMap);
        } else if (!cancelled) {
          setLiveMap(fallback || seedMap);
        }
        setNote(
          softProviderNote(result.note) ||
            `Concept map for ${seedAttempts.length} assessed idea${seedAttempts.length === 1 ? '' : 's'}.`,
        );
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (fallback || seedMap) setLiveMap(fallback || seedMap);
        setNote(
          softProviderNote(err?.message) ||
            'Textbook search could not build this map. Try the question again after Sage is ready.',
        );
        setStatus('ready');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptKey, enableAi]);

  useEffect(() => {
    const id = speechFocus?.branchId;
    if (!id) return;
    setActiveId(id);
    setExplored((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (compact) return;
  }, [speechFocus?.branchId, compact]);

  const map = liveMap || seedMap;
  const branches = toDisplayBranches(map);

  // Reading timeline for the content Sage is currently addressing
  const readingFields = useMemo(() => {
    if (!map || !speechFocus) return [];
    const kind = speechFocus.kind;
    if (kind === 'overview' || kind === 'intro') {
      return [
        { key: 'root', text: map.root || map.title || map.topic || '' },
        { key: 'summary', text: map.summary || map.personalizedNote || '' },
        { key: 'big', text: map.bigPicture || map.centralIdea || '' },
      ].filter((f) => f.text.trim());
    }
    if (kind === 'branch' && speechFocus.branchId) {
      const b = branches.find((x) => x.id === speechFocus.branchId);
      if (!b) return [];
      return [
        { key: 'topic', text: b.topic },
        { key: 'question', text: b.question },
        { key: 'key', text: b.keyConcept },
        { key: 'explain', text: b.keyExplain },
        { key: 'farm', text: b.farmLink },
      ].filter((f) => String(f.text || '').trim());
    }
    return [];
  }, [map, speechFocus, branches]);

  const timeline = useMemo(
    () => buildReadingTimeline(readingFields),
    [readingFields],
  );

  const liveIndex = useMemo(() => {
    if (!speechFocus || !timeline.tokens.length) return -1;
    if (!spokenSoFar && !currentWord) return -1;
    return resolveLiveSpeechIndex({
      timelineTokens: timeline.tokens,
      spokenSoFar,
      currentWord,
      activePhrase: activePhrase || segmentText,
    });
  }, [
    speechFocus,
    timeline.tokens,
    spokenSoFar,
    currentWord,
    activePhrase,
    segmentText,
  ]);

  if (!map || !branches.length) {
    return (
      <section
        className={`mm${compact ? ' is-compact' : ''}`}
        aria-label="Science mind map"
      >
        {status === 'loading' ? (
          <div className="mm-load" role="status">
            <span className="mm-load-dot" />
            Building mind map from textbooks…
          </div>
        ) : (
          <p className="mm-lead">
            {note ||
              'Sage will open a textbook mind map when this miss is ready.'}
          </p>
        )}
      </section>
    );
  }

  const active =
    branches.find((b) => b.id === activeId) || branches[0] || null;

  const select = (b) => {
    setActiveId(b.id);
    setExplored((prev) => new Set(prev).add(b.id));
    onNodeSelect?.(b);
  };

  const n = branches.length;
  const speechBranchId = speechFocus?.branchId || null;
  const overviewOn =
    speechFocus?.kind === 'overview' || speechFocus?.kind === 'intro';
  const speechLive = Boolean(speechFocus && liveIndex >= 0);
  // Only the live spoken word (no accumulating trail)
  const phraseWindow = 1;

  const offsets = timeline.offsets || {};

  const Sync = ({ fieldKey, text, on = false, empty = '—' }) => {
    if (!on || !speechLive) {
      return text || empty;
    }
    const offset = offsets[fieldKey] ?? -1;
    if (offset < 0) return text || empty;
    return (
      <LiveSyncText
        text={text}
        enabled
        globalCurrentIndex={liveIndex}
        tokenOffset={offset}
        phraseWindow={phraseWindow}
        empty={empty}
      />
    );
  };

  return (
    <section
      className={`mm${compact ? ' is-compact' : ''}${speechFocus ? ' is-speech-linked' : ''}`}
      aria-label={`Concept map of ${n} science idea${n === 1 ? '' : 's'}`}
    >
      <header className="mm-top">
        <p className="mm-kicker">
          Mind map · keywords from your textbook
          {status === 'loading' ? ' · generating with AI…' : ''}
          {speechFocus ? ' · following Sage’s voice' : ''}
        </p>
        <h3>
          <Sync
            fieldKey="root"
            text={map.root || map.title || map.topic || 'Science'}
            on={overviewOn}
          />
        </h3>
        {compact ? null : (
          <p className="mm-lead">
            <Sync
              fieldKey="summary"
              text={
                map.summary ||
                map.personalizedNote ||
                'One radial keyword map for this Science idea.'
              }
              on={overviewOn}
            />
          </p>
        )}
        {!compact && (map.bigPicture || map.centralIdea) ? (
          <p
            className={`mm-big${speechFocus?.kind === 'overview' ? ' is-speech' : ''}`}
          >
            <strong>Big picture:</strong>{' '}
            <Sync
              fieldKey="big"
              text={map.bigPicture || map.centralIdea}
              on={overviewOn}
            />
          </p>
        ) : null}
        {status === 'loading' ? (
          <div className="mm-load" role="status">
            <span className="mm-load-dot" />
            Building mind map from textbooks…
          </div>
        ) : null}
        {!compact && note && status !== 'loading' && softProviderNote(note) ? (
          <p className="mm-note">{softProviderNote(note)}</p>
        ) : null}
        <button
          type="button"
          className={`mm-download${downloadState === 'done' ? ' is-done' : ''}`}
          aria-label="Download mind map as an image"
          disabled={!branches.length || downloadState === 'saving'}
          onClick={() => {
            if (downloadState === 'saving') return;
            setDownloadState('saving');
            void downloadMindMap(map, branches)
              .then(() => {
                setDownloadState('done');
                window.setTimeout(() => setDownloadState('idle'), 1800);
              })
              .catch(() => {
                setDownloadState('idle');
              });
          }}
        >
          {downloadState === 'saving'
            ? 'Saving…'
            : downloadState === 'done'
              ? 'Saved'
              : 'Download map'}
        </button>
      </header>

      <RadialMindMap
        map={map}
        branches={branches}
        activeId={active?.id}
        speechWord={currentWord || spokenSoFar}
        compact={compact}
        onHubSelect={select}
      />

      {!compact && n > 1 ? (
        <div className="mm-hub-row" role="tablist" aria-label="Concepts">
          {branches.map((b) => {
            const c = COLORS[b.colorIndex % COLORS.length];
            const selected = b.id === active?.id;
            const seen = explored.has(b.id);
            const speechOn = speechBranchId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`mm-hub-chip${selected ? ' is-on' : ''}${seen ? ' is-seen' : ''}${speechOn ? ' is-speech' : ''}`}
                style={{ '--mm-c': c.bar, '--mm-f': c.fill }}
                onClick={() => select(b)}
              >
                <span aria-hidden>{b.icon}</span>
                <span className="mm-hub-chip-text">
                  <em>Concept {b.index}</em>
                  <strong>{b.topic}</strong>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {!compact && Array.isArray(map.studyPath) && map.studyPath.length ? (
        <ol className="mm-path">
          {map.studyPath.map((step, i) => (
            <li key={`${step}-${i}`}>{step}</li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

class ConceptMindMapBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="mm" aria-label="Science mind map">
          <p className="mm-lead">
            Sage could not draw this map. Close Sage and miss the question again.
          </p>
        </section>
      );
    }
    return <ConceptMindMap {...this.props} />;
  }
}

export default ConceptMindMapBoundary;
