/**
 * Concept mind map: assessment-engine knowledge, no student wrong answers.
 * Highlights only the word currently being spoken by Sage (reading-flow sync).
 */
import { Component, useEffect, useMemo, useRef, useState } from 'react';
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
import { getCurrentStudent } from '../data/mockStudents.js';
import {
  displayTopic,
  explanationForMiss,
  scopeAttemptForRetrieval,
} from './textbookGraph.js';

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

function normalizeAnswerKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[|·•]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The question stem and the blank answers are not an explanation. */
function explanationText(text, correctAnswer) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw || /_{2,}|\[\s*_{0,4}\s*\]/.test(raw)) return '';
  const body = normalizeAnswerKey(raw);
  const key = normalizeAnswerKey(correctAnswer);
  if (key && (body === key || (key.length >= 8 && body.includes(key) && body.length < key.length + 20))) {
    return '';
  }
  return raw;
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
    const mapped = map.branches.map((b, i) => {
      const question = b.prompt || b.question || '';
      const correctAnswer =
        safeScienceLine(b.correctAnswer || b.correct_answer, null) || '';
      const source = {
        ...b,
        question,
        prompt: question,
        correctAnswer,
        grade: b.grade || map.grade,
      };
      return {
      id: b.id || `concept-${i}`,
      index: b.index || i + 1,
      topic: displayTopic(source),
      icon: b.icon || '🔬',
      question,
      studentAnswer: '',
      correctAnswer,
      why: '',
      keyConcept: '',
      keyExplain: explanationForMiss(source),
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
    };
    });
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
  const cardRefs = useRef({});
  const focusPaneRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const fallback =
      seedMap?.layout === 'concept-map' || seedMap?.layout === 'all-misses-ai'
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
    setNote('Writing a short explanation from textbooks…');

    (async () => {
      try {
        const student = getCurrentStudent();
        const grade =
          Number(seedAttempts[0]?.grade) ||
          Number(student?.grade) ||
          6;
        const result = await fetchAiMindMap({
          attempts: seedAttempts.map(scopeAttemptForRetrieval),
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
            `Short explanation for ${seedAttempts.length} missed idea${seedAttempts.length === 1 ? '' : 's'}.`,
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
    const el = cardRefs.current[id];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    window.setTimeout(() => {
      focusPaneRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 200);
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
        { key: 'explain', text: b.keyExplain },
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
            Writing a short explanation from textbooks…
          </div>
        ) : (
          <p className="mm-lead">
            {note ||
              'Sage will explain this miss when the textbook search is ready.'}
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

  const goNext = () => {
    const idx = branches.findIndex((b) => b.id === active?.id);
    const next = branches[(idx + 1) % branches.length];
    if (next) select(next);
  };

  const n = branches.length;
  const gridColumns =
    n <= 1
      ? '1fr'
      : n === 2
        ? '1fr 1fr'
        : compact && n >= 5
          ? '1fr 1fr 1fr'
          : n === 3 && !compact
            ? '1fr 1fr 1fr'
            : '1fr 1fr';
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
      aria-label={`Science explanation of ${n} missed idea${n === 1 ? '' : 's'}`}
    >
      <header className="mm-top">
        <p className="mm-kicker">
          Miss review · {n} idea{n === 1 ? '' : 's'}
          {map.conceptCount > 1 ? ` · ${map.conceptCount} topics` : ''}
          {status === 'loading' ? ' · generating with AI…' : ''}
          {map.generatedBy === 'ai' || (status === 'ready' && note.includes('AI'))
            ? ' · AI map'
            : ''}
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
                `A short textbook paragraph for each missed question.`
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
            Writing a short explanation from textbooks…
          </div>
        ) : null}
        {!compact && note && status !== 'loading' && softProviderNote(note) ? (
          <p className="mm-note">{softProviderNote(note)}</p>
        ) : null}
        <button
          type="button"
          className={`mm-download${downloadState === 'done' ? ' is-done' : ''}`}
          aria-label="Download explanation as an image"
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
              : 'Download'}
        </button>
      </header>

      <div className="mm-hub-row" role="tablist" aria-label="Concepts">
        <div
          className={`mm-hub-core${overviewOn ? ' is-speech' : ''}`}
          aria-hidden
        >
          <span>🔬</span>
          <strong>{n === 1 ? 'Idea' : `${n} ideas`}</strong>
        </div>
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

      <div
        className="mm-grid"
        style={{
          gridTemplateColumns: compact
            ? n <= 1
              ? '1fr'
              : '1fr 1fr'
            : gridColumns,
        }}
      >
        {branches.map((b) => {
          const c = COLORS[b.colorIndex % COLORS.length];
          const selected = b.id === active?.id;
          const speechOn = speechBranchId === b.id;
          return (
            <article
              key={`card-${b.id}`}
              ref={(el) => {
                if (el) cardRefs.current[b.id] = el;
              }}
              data-mm-id={b.id}
              className={`mm-card${selected ? ' is-on' : ''}${speechOn ? ' is-speech' : ''}`}
              style={{ '--mm-c': c.bar, '--mm-f': c.fill }}
              onClick={() => select(b)}
            >
              <header>
                <span className="mm-card-num">
                  {b.icon} {b.topic}
                  {b.questionType ? (
                    <span className="mm-card-type">{String(b.questionType).replace(/_/g, ' ')}</span>
                  ) : null}
                  {speechOn ? (
                    <span className="mm-card-live">Speaking</span>
                  ) : null}
                </span>
                <span className="mm-card-topic">
                  {speechOn ? (
                    <Sync fieldKey="topic" text={b.topic} on />
                  ) : (
                    b.topic
                  )}
                </span>
              </header>
              {explanationText(b.keyExplain, b.correctAnswer) ? (
                <p className="mm-card-para">
                  <span className="mm-card-kicker">Explanation</span>{' '}
                  {speechOn ? (
                    <Sync
                      fieldKey="explain"
                      text={explanationText(b.keyExplain, b.correctAnswer)}
                      on
                    />
                  ) : (
                    explanationText(b.keyExplain, b.correctAnswer)
                  )}
                </p>
              ) : null}
              {b.question && !/_{2,}|\[\s*_{0,6}\s*\]/.test(b.question) ? (
                <p className="mm-card-q">
                  {speechOn ? (
                    <Sync fieldKey="question" text={b.question} on />
                  ) : (
                    b.question
                  )}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      {active && !compact ? (
        <article
          ref={focusPaneRef}
          className={`mm-focus${speechBranchId === active.id ? ' is-speech' : ''}`}
          aria-live="polite"
        >
          <p className="mm-focus-kicker">
            Focus · {active.index} of {n} · {active.topic}
          </p>
          <h4>
            {active.icon} {active.conceptGraph?.concept || active.topic}
          </h4>
          {explanationText(active.keyExplain, active.correctAnswer) ? (
            <p className="mm-focus-p">
              {speechBranchId === active.id ? (
                <Sync
                  fieldKey="explain"
                  text={explanationText(active.keyExplain, active.correctAnswer)}
                  on
                />
              ) : (
                explanationText(active.keyExplain, active.correctAnswer)
              )}
            </p>
          ) : null}
          {active.farmLink ? (
            <p className="mm-focus-p is-farm">
              <strong>Farm link:</strong>{' '}
              {speechBranchId === active.id ? (
                <Sync fieldKey="farm" text={active.farmLink} on />
              ) : (
                active.farmLink
              )}
            </p>
          ) : null}
          <div className="mm-focus-actions">
            <button type="button" className="mm-btn" onClick={goNext}>
              Next idea →
            </button>
            <span>
              Explored {explored.size}/{n}
            </span>
          </div>
        </article>
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
            Sage could not write this explanation. Close Sage and miss the question again.
          </p>
        </section>
      );
    }
    return <ConceptMindMap {...this.props} />;
  }
}

export default ConceptMindMapBoundary;
