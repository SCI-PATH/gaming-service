import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import BootScene from '../scenes/BootScene';
import LoadScene from '../scenes/LoadScene';
import MenuScene from '../scenes/MenuScene';
import GuideScene from '../scenes/GuideScene';
import GameScene from '../scenes/GameScene';
import GameOverScene from '../scenes/GameOverScene';
import LeaderBoardScene from '../scenes/LeaderBoardScene';
import FarmingVisualPlugin from '../plugins/FarmingVisualPlugin.js';

/**
 * Phaser 3 ForestRPG config — parent is the React-mounted DOM node.
 */
export function createGameConfig(parent) {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#0b1a12',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    dom: {
      createContainer: true,
    },
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
      },
    },
    plugins: {
      scene: [
        {
          key: 'FarmingVisualPlugin',
          plugin: FarmingVisualPlugin,
          mapping: 'farming',
        },
      ],
    },
    scene: [
      BootScene,
      LoadScene,
      MenuScene,
      GuideScene,
      GameScene,
      GameOverScene,
      LeaderBoardScene,
    ],
  };
}

/** Create a ForestRPG Phaser.Game instance inside a DOM parent. */
export function createForestGame(parent) {
  return new Phaser.Game(createGameConfig(parent));
}
