import './style.css';
import { Game } from './modules/Game.js';
import { SoundManager } from './modules/Audio.js';
import { registerPwa } from './pwa/registerPwa.js';

const init = () => {
    window.game = new Game();
    window.SoundManager = SoundManager;
    window.__toggleDevPerf__ = (force) => window.game.toggleDevPerfOverlay(force);
    console.log('Game initialized and attached to window.game');
    console.log('Dev perf overlay: press P or call __toggleDevPerf__() / set __DEV_PERF__=true before load');
    console.log('Replay export: Ctrl+Shift+R during an active session (dev mode)');

    const params = new URLSearchParams(window.location.search);
    const replayPath = params.get('replay');
    if (replayPath) {
        fetch(replayPath)
            .then((response) => {
                if (!response.ok) throw new Error(`Failed to load replay: ${response.status}`);
                return response.json();
            })
            .then((data) => {
                window.__pendingReplay__ = data;
                console.log(`Replay queued from ${replayPath} — press Start to play`);
            })
            .catch((err) => {
                console.warn('Replay preload failed:', err);
            });
    }
};

registerPwa();

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
