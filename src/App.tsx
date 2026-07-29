import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameScene from './components/GameScene';
import InventoryBar from './components/InventoryBar';
import QuestionModal from './components/QuestionModal';
import SceneCompleteModal from './components/SceneCompleteModal';
import Toast from './components/Toast';
import gameData from './data/gameData.json';
import type {
  GameData,
  GameItem,
  InventorySlotItem,
  SceneCompletionStats,
  ToastMessage,
} from './types/game';

const data = gameData as GameData;
const COMPLETION_DELAY_MS = 1000;

function App() {
  const [currentSceneId, setCurrentSceneId] = useState(data.startSceneId);
  const [discoveredItemIds, setDiscoveredItemIds] = useState<Set<string>>(() => {
    const seeded = new Set<string>();
    for (const scene of data.scenes) {
      for (const item of scene.items) {
        if (item.isDiscovered) seeded.add(item.id);
      }
    }
    return seeded;
  });
  /** Items answered incorrectly at least once before unlocking */
  const [failedFirstAttemptIds, setFailedFirstAttemptIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [clearedSceneIds, setClearedSceneIds] = useState<Set<string>>(() => new Set());
  const [unlockedSceneIds, setUnlockedSceneIds] = useState<Set<string>>(
    () => new Set([data.startSceneId]),
  );
  const [isLevelCleared, setIsLevelCleared] = useState(false);
  const [completionStats, setCompletionStats] = useState<SceneCompletionStats | null>(null);
  const [lessonFinished, setLessonFinished] = useState(false);
  const [activeQuizItem, setActiveQuizItem] = useState<GameItem | null>(null);
  const [lightingUpItemId, setLightingUpItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const completionTimerRef = useRef<number | null>(null);

  const currentScene = useMemo(
    () => data.scenes.find((scene) => scene.id === currentSceneId),
    [currentSceneId],
  );

  const checklist = useMemo<InventorySlotItem[]>(() => {
    if (!currentScene) return [];
    return currentScene.items.map((item) => ({
      id: item.id,
      name: item.name,
      iconPath: item.iconPath,
      isDiscovered: discoveredItemIds.has(item.id),
    }));
  }, [currentScene, discoveredItemIds]);

  const isSceneComplete = useMemo(() => {
    if (!currentScene || currentScene.items.length === 0) return false;
    return currentScene.items.every((item) => discoveredItemIds.has(item.id));
  }, [currentScene, discoveredItemIds]);

  const showToast = useCallback((message: Omit<ToastMessage, 'id'>, durationMs = 2800) => {
    const next: ToastMessage = { ...message, id: `${Date.now()}` };
    setToast(next);
    window.setTimeout(() => {
      setToast((current) => (current?.id === next.id ? null : current));
    }, durationMs);
  }, []);

  /** After all items discovered → wait for light-up anim → open victory modal */
  useEffect(() => {
    if (!currentScene || !isSceneComplete) return;
    if (clearedSceneIds.has(currentScene.id) || isLevelCleared) return;

    if (completionTimerRef.current) {
      window.clearTimeout(completionTimerRef.current);
    }

    completionTimerRef.current = window.setTimeout(() => {
      const totalItems = currentScene.items.length;
      const firstTryCorrect = currentScene.items.filter(
        (item) => !failedFirstAttemptIds.has(item.id),
      ).length;

      setClearedSceneIds((prev) => new Set(prev).add(currentScene.id));

      if (currentScene.nextSceneId) {
        setUnlockedSceneIds((prev) => new Set(prev).add(currentScene.nextSceneId!));
      }

      setCompletionStats({
        sceneId: currentScene.id,
        sceneName: currentScene.name,
        totalItems,
        itemsFound: totalItems,
        firstTryCorrect,
        nextSceneId: currentScene.nextSceneId,
        ctaLabel:
          currentScene.completionCtaLabel ??
          (currentScene.isFinalScene
            ? 'Proceed to Final Escape Door →'
            : 'Unlock Next Room →'),
        isFinalScene: Boolean(currentScene.isFinalScene),
      });
      setIsLevelCleared(true);
    }, COMPLETION_DELAY_MS);

    return () => {
      if (completionTimerRef.current) {
        window.clearTimeout(completionTimerRef.current);
      }
    };
  }, [
    currentScene,
    isSceneComplete,
    clearedSceneIds,
    isLevelCleared,
    failedFirstAttemptIds,
  ]);

  const handleNavigate = useCallback(
    (sceneId: string) => {
      const target = data.scenes.find((scene) => scene.id === sceneId);
      if (!target) return;

      if (!unlockedSceneIds.has(sceneId)) {
        showToast(
          {
            text: 'Room locked — recover all artifacts in this scene first!',
            variant: 'denied',
          },
          3000,
        );
        return;
      }

      setIsLevelCleared(false);
      setCompletionStats(null);
      setCurrentSceneId(sceneId);
    },
    [unlockedSceneIds, showToast],
  );

  const handleInspectItem = useCallback(
    (item: GameItem) => {
      if (
        discoveredItemIds.has(item.id) ||
        lightingUpItemId ||
        activeQuizItem ||
        isLevelCleared
      ) {
        return;
      }
      setActiveQuizItem(item);
    },
    [discoveredItemIds, lightingUpItemId, activeQuizItem, isLevelCleared],
  );

  const handleQuizIncorrect = useCallback(
    (item: GameItem) => {
      setFailedFirstAttemptIds((prev) => new Set(prev).add(item.id));
      showToast(
        {
          text: `Access Denied — Hint: ${item.quiz.hint}`,
          variant: 'denied',
        },
        3500,
      );
    },
    [showToast],
  );

  const handleQuizCorrect = useCallback(
    (item: GameItem) => {
      setActiveQuizItem(null);
      if (discoveredItemIds.has(item.id)) return;

      setDiscoveredItemIds((prev) => new Set(prev).add(item.id));
      setLightingUpItemId(item.id);

      showToast({
        text: `Item Discovered: ${item.name}!`,
        variant: 'success',
      });

      window.setTimeout(() => setLightingUpItemId(null), 1200);
    },
    [discoveredItemIds, showToast],
  );

  const handleProceedFromVictory = useCallback(() => {
    if (!completionStats) return;

    setIsLevelCleared(false);
    setCompletionStats(null);

    if (completionStats.isFinalScene) {
      setLessonFinished(true);
      showToast({
        text: 'Escape Door Unlocked — Lesson Complete!',
        variant: 'success',
      });
      return;
    }

    if (completionStats.nextSceneId) {
      setUnlockedSceneIds((prev) => new Set(prev).add(completionStats.nextSceneId!));
      setCurrentSceneId(completionStats.nextSceneId);
    }
  }, [completionStats, showToast]);

  if (!currentScene) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-red-400">
        Scene &quot;{currentSceneId}&quot; not found in game data.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-28">
      <header className="border-b border-brass-800/40 bg-gradient-to-r from-[#0a0a0a] via-[#1a1408] to-[#0a0a0a] px-4 py-3 text-center">
        <h1 className="text-lg font-semibold tracking-wide text-brass-300 sm:text-xl">
          {data.title}
        </h1>
        <p className="mt-1 text-xs text-brass-600">
          {lessonFinished
            ? 'Lesson cleared — all science artifacts recovered!'
            : 'Match shadow shapes · Find them in the room · Unlock with science questions'}
        </p>
      </header>

      <main className="py-4">
        <GameScene
          scene={currentScene}
          discoveredItemIds={discoveredItemIds}
          onNavigate={handleNavigate}
          onInspectItem={handleInspectItem}
        />
      </main>

      {activeQuizItem && (
        <QuestionModal
          item={activeQuizItem}
          onCorrect={handleQuizCorrect}
          onIncorrect={handleQuizIncorrect}
          onClose={() => setActiveQuizItem(null)}
        />
      )}

      {isLevelCleared && completionStats && (
        <SceneCompleteModal
          stats={completionStats}
          onProceed={handleProceedFromVictory}
        />
      )}

      {lessonFinished && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4">
          <div className="animate-toast-in rounded-lg border border-amber-400/70 bg-black/85 px-6 py-3 text-center text-sm font-semibold text-amber-100 shadow-[0_0_28px_rgba(255,215,0,0.35)] backdrop-blur-sm">
            ✦ FINAL ESCAPE DOOR OPEN — Grade 6 Science Lesson Complete!
          </div>
        </div>
      )}

      <Toast toast={toast} />
      <InventoryBar
        checklist={checklist}
        maxSlots={data.maxInventorySlots}
        lightingUpItemId={lightingUpItemId}
        isSceneComplete={isSceneComplete}
      />
    </div>
  );
}

export default App;
