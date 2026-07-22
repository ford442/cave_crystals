// @ts-check

import { QualitySystem } from './QualitySystem.js';
import { JuiceSystem } from './JuiceSystem.js';
import { CollisionSystem } from './CollisionSystem.js';
import { ComboSystem } from './ComboSystem.js';
import { GameLoop } from './GameLoop.js';

/**
 * Wire explicit game subsystems. Called from the Game constructor.
 *
 * @param {import('../Game.js').Game} game
 */
export function registerSystems(game) {
    const quality = new QualitySystem(game);
    const juice = new JuiceSystem(game, quality);
    const collision = new CollisionSystem();
    const combo = new ComboSystem(game, juice);
    const loop = new GameLoop(game, { quality, juice, collision, combo });

    game.systems = { quality, juice, collision, combo, loop };
    return game.systems;
}
