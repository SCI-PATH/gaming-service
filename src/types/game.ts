/** Percentage-based bounding box for positioning elements on a scene */
export interface PercentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Clickable area that navigates the player to another scene */
export interface Hotspot {
  id: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetSceneId: string;
}

/** Grade 6 science quiz attached to a locked item */
export interface ItemQuiz {
  question: string;
  options: string[];
  /** Zero-based index of the correct option */
  correctIndex: number;
  hint: string;
}

/** Collectible hidden object placed on a scene (quiz-gated) */
export interface GameItem {
  id: string;
  name: string;
  iconPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Initial discovery state in data (runtime overrides via discoveredItemIds) */
  isDiscovered: boolean;
  quiz: ItemQuiz;
}

/** A single playable scene (main room or sub-scene closeup) */
export interface Scene {
  id: string;
  name: string;
  backgroundPath: string;
  parentSceneId?: string;
  /** Scene unlocked after this one is cleared (omit for final scene) */
  nextSceneId?: string;
  /** CTA label on the Scene Completed modal */
  completionCtaLabel?: string;
  /** True when clearing this scene finishes the lesson */
  isFinalScene?: boolean;
  hotspots: Hotspot[];
  items: GameItem[];
}

/** Root configuration loaded from gameData.json */
export interface GameData {
  title: string;
  startSceneId: string;
  maxInventorySlots: number;
  scenes: Scene[];
}

/** Checklist slot shown in the inventory bar */
export interface InventorySlotItem {
  id: string;
  name: string;
  iconPath: string;
  isDiscovered: boolean;
}

/** Stats shown on the Scene Completed modal */
export interface SceneCompletionStats {
  sceneId: string;
  sceneName: string;
  totalItems: number;
  itemsFound: number;
  firstTryCorrect: number;
  nextSceneId?: string;
  ctaLabel: string;
  isFinalScene: boolean;
}

/** Global game state managed by App.tsx */
export interface GameState {
  currentSceneId: string;
  discoveredItemIds: Set<string>;
  clearedSceneIds: Set<string>;
  unlockedSceneIds: Set<string>;
  isLevelCleared: boolean;
}

/** Toast notification shown for discovery / access-denied feedback */
export interface ToastMessage {
  id: string;
  text: string;
  variant?: 'success' | 'denied';
}
