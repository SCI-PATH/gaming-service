/**
 * Contextual E-key prompt for crop / shop interactions.
 * Harvest must not start until the harvest quiz unlocks; prompts never imply auto-pick.
 */

export function resolveCropInteractPrompt({
  farmInputLocked = false,
  quizOpen = false,
  nearShop = false,
  carriedCount = 0,
  hasReadyCrops = false,
  harvestUnlocked = false,
  onPlantableBed = false,
  canPlant = false,
} = {}) {
  if (farmInputLocked || quizOpen) return null;

  if (nearShop) {
    if ((carriedCount || 0) > 0) return 'Press E to unload';
    return 'Farm Shop — bring harvests here';
  }

  if (hasReadyCrops) {
    return harvestUnlocked
      ? 'Press E to harvest'
      : 'Press E to interact';
  }

  if (onPlantableBed && canPlant) {
    return 'Press E to plant';
  }

  return null;
}
