/**
 * Contextual E-key prompt for crop / shop interactions.
 * Ready crops auto-collect on walk-over — E is for plant / shop unload only.
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
  // Overlays hide the prompt. E is only for the shop or an empty bed.
  if (farmInputLocked || quizOpen) return null;

  if (nearShop) {
    if ((carriedCount || 0) > 0) return 'Press E to unload';
    return 'Farm Shop — bring harvests here';
  }

  // Ready crops: walk over to collect — do not ask for E
  if (hasReadyCrops) {
    void harvestUnlocked;
    return null;
  }

  if (onPlantableBed && canPlant) {
    return 'Press E to plant';
  }

  return null;
}
