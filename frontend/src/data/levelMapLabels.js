/**
 * Pure map labels. The farm plan is passed in so tests do not load Phaser data.
 */

const BED_NAME = {
  tomato: 'Tomato Bed',
  carrot: 'Carrot Bed',
  potato: 'Potato Bed',
  pumpkin: 'Pumpkin Patch',
  onion: 'Onion Bed',
  cabbage: 'Cabbage Bed',
  lettuce: 'Lettuce Bed',
  corn: 'Corn Bed',
  bean: 'Bean Bed',
  chilli: 'Chilli Bed',
  cucumber: 'Cucumber Bed',
  eggplant: 'Eggplant Bed',
  spinach: 'Spinach Bed',
  radish: 'Radish Bed',
  beetroot: 'Beetroot Bed',
  pea: 'Pea Bed',
  watermelon: 'Watermelon Patch',
  strawberry: 'Strawberry Bed',
  sunflower: 'Sunflower Bed',
  rose: 'Rose Bed',
  daisy: 'Daisy Bed',
  marigold: 'Marigold Bed',
  flower: 'Flower Bed',
  wheat: 'Wheat Bed',
  turnip: 'Turnip Bed',
};

function titleWord(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function bedLabelForCrop(cropId, cropName) {
  const id = String(cropId || '').trim();
  if (BED_NAME[id]) return BED_NAME[id];
  const name = titleWord(String(cropName || id).replace(/s$/, ''));
  return name ? `${name} Bed` : null;
}

export function animalMarkerLabel(animal) {
  if (!animal) return null;
  const produce = String(animal.produceName || '').toLowerCase();
  if (produce === 'milk') return 'Milk Collection Point';
  if (produce === 'eggs') return 'Egg Collection Point';
  const name = titleWord(animal.animalName || animal.id);
  return name ? `${name} Pen` : null;
}

export function cleaningMarkerLabel(clean) {
  if (!clean) return null;
  const name = titleWord(clean.messName || clean.id);
  return name ? `${name} Yard` : null;
}

export function assembleMapMarkers(plan, zones, progress = {}) {
  const plots = zones?.plots || [];
  const activeIndex = Math.max(0, Number(progress.activeCropIndex) || 0);
  const activeId = String(progress.activeCropId || progress.activeCropName || '')
    .trim()
    .toLowerCase();
  const beds = plots.map((plot, index) => {
    const crop = plan?.crops?.[index];
    if (!crop) return null;
    const label = bedLabelForCrop(crop.cropId, crop.cropName);
    if (!label) return null;
    let status = 'upcoming';
    if (activeId) {
      const names = [crop.cropId, crop.id, crop.cropName].map((value) =>
        String(value || '').toLowerCase(),
      );
      if (names.includes(activeId)) status = 'active';
      else if (index < activeIndex) status = 'completed';
    } else if (index < activeIndex) status = 'completed';
    else if (index === activeIndex) status = 'active';
    return {
      id: plot.id,
      challengeId: crop.id,
      kind: 'crop',
      cropId: crop.cropId,
      label,
      shortLabel: label.replace(/ Bed$| Patch$/, ''),
      instruction: `Plant ${crop.cropName}, then pick ${crop.harvestCount}.`,
      x: plot.x,
      y: plot.y,
      w: plot.w,
      h: plot.h,
      status,
    };
  }).filter(Boolean);

  const places = [];
  const animalLabel = animalMarkerLabel(plan?.animal);
  if (plan?.animal && animalLabel && zones?.animal) {
    places.push({
      id: zones.animal.id,
      challengeId: plan.animal.id,
      kind: 'animal',
      label: animalLabel,
      shortLabel: animalLabel,
      instruction: `Tend ${plan.animal.animalName} and collect ${plan.animal.produceName}.`,
      x: zones.animal.x,
      y: zones.animal.y,
      w: zones.animal.w,
      h: zones.animal.h,
      status: 'upcoming',
    });
  }
  const cleanLabel = cleaningMarkerLabel(plan?.clean);
  if (plan?.clean && cleanLabel && zones?.clean) {
    places.push({
      id: zones.clean.id,
      challengeId: plan.clean.id,
      kind: 'clean',
      label: cleanLabel,
      shortLabel: cleanLabel,
      instruction: `${plan.clean.verb || 'Clear'} ${plan.clean.messName}.`,
      x: zones.clean.x,
      y: zones.clean.y,
      w: zones.clean.w,
      h: zones.clean.h,
      status: 'upcoming',
    });
  }
  if (zones?.shop) {
    places.push({
      id: zones.shop.id,
      challengeId: 'farm_shop',
      kind: 'shop',
      label: 'Farm Shop',
      shortLabel: 'Shop',
      instruction: 'Unload harvest here and serve customers.',
      x: zones.shop.x,
      y: zones.shop.y,
      w: zones.shop.w,
      h: zones.shop.h,
      status: 'upcoming',
    });
  }
  return {
    levelId: plan?.level || 1,
    beds,
    places,
    summary: plan?.summary || [],
  };
}
