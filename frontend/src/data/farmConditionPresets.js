/**
 * Performance → farm look. Phaser-free so the generator and game share it.
 * Weak / high frustration: farm looks in trouble.
 * Medium: split healthy / struggling beds.
 * Smart / low frustration: mostly healthy with one problem left to solve.
 */
import { normalizePerformanceCategory } from './performanceCategories.js';

export const PLOT_STATES = ['wilted', 'dry', 'shaded', 'healthy'];

const SITUATION_TO_STATE = {
  wilted_flower: 'wilted',
  young_sprout: 'wilted',
  dry_crop: 'dry',
  diverted_water: 'dry',
  shaded_plant: 'shaded',
  broken_fence: 'wilted',
  blocked_path: 'dry',
  hungry_animal: 'wilted',
};

const STATE_TO_SITUATION = {
  wilted: 'wilted_flower',
  dry: 'dry_crop',
  shaded: 'shaded_plant',
  healthy: 'wilted_flower',
};

export function plotStateForSituation(situationId) {
  return SITUATION_TO_STATE[String(situationId || '')] || 'wilted';
}

export function situationForPlotState(state) {
  return STATE_TO_SITUATION[String(state || '')] || 'wilted_flower';
}

function highFrustration(level) {
  const lv = String(level || '').toUpperCase();
  return lv === 'HIGH' || lv === 'VERY_HIGH';
}

function lowFrustration(level) {
  const lv = String(level || '').toUpperCase();
  return lv === 'LOW' || lv === 'MILD';
}

/**
 * @param {{ performanceBand?: string, gameplayBand?: string, frustrationLevel?: string }} input
 */
export function farmConditionFromPerformance(input = {}) {
  const band = normalizePerformanceCategory(
    input.performanceBand || input.gameplayBand,
  );
  const fr = input.frustrationLevel;

  if (band === 'weak' || highFrustration(fr)) {
    return {
      id: 'struggling_farm',
      band: 'weak',
      healthyRatio: 0.15,
      plotStates: {
        bed_west: 'wilted',
        bed_east: 'dry',
        bed_north_west: 'wilted',
        bed_north_east: 'dry',
        bed_mid_west: 'shaded',
        bed_mid_east: 'wilted',
        bed_south_west: 'wilted',
        bed_south_east: 'shaded',
      },
    };
  }

  if (band === 'smart' && (lowFrustration(fr) || !fr)) {
    return {
      id: 'thriving_farm',
      band: 'smart',
      healthyRatio: 0.75,
      plotStates: {
        bed_west: 'healthy',
        bed_east: 'healthy',
        bed_north_west: 'healthy',
        bed_north_east: 'healthy',
        bed_mid_west: 'healthy',
        bed_mid_east: 'shaded',
        bed_south_west: 'shaded',
        bed_south_east: 'healthy',
      },
    };
  }

  return {
    id: 'split_farm',
    band: 'medium',
    healthyRatio: 0.5,
    plotStates: {
      bed_west: 'healthy',
      bed_east: 'wilted',
      bed_north_west: 'healthy',
      bed_north_east: 'dry',
      bed_mid_west: 'healthy',
      bed_mid_east: 'wilted',
      bed_south_west: 'healthy',
      bed_south_east: 'dry',
    },
  };
}
