import './style.css';
import { Game } from './modules/Game.js';

const init = () => {
    window.game = new Game();
    console.log('Game initialized and attached to window.game');
};

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
