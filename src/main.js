import './style.css';
import { Game } from './modules/Game.js';

const init = () => {
    window.game = new Game();
    window.__toggleDevPerf__ = (force) => window.game.toggleDevPerfOverlay(force);
    console.log('Game initialized and attached to window.game');
    console.log('Dev perf overlay: press P or call __toggleDevPerf__() / set __DEV_PERF__=true before load');
};

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
