// @ts-nocheck
import { SoundManager } from './Audio.js';
import { getActivePalette } from './ColorPalettes.js';
import { normalizeSettings } from './SaveManager.js';

const MOTION_SCALE_REDUCED = 0.2;
const MOTION_SCALE_NORMAL = 1.0;

export class SettingsManager {
    /**
     * @param {SaveManager} saveManager
     */
    constructor(saveManager) {
        this.saveManager = saveManager;
        this._uiBound = false;
        /** @type {import('./Game.js').Game | null} */
        this._game = null;
    }

    load() {
        this.saveManager.load();
    }

    /** @returns {import('./SaveManager.js').GameSettings} */
    get settings() {
        return this.saveManager.getSettings();
    }

    /** @returns {import('./SaveManager.js').GameSettings} */
    get() {
        return this.saveManager.getSettings();
    }

    getMotionScale() {
        return this.get().reducedMotion ? MOTION_SCALE_REDUCED : MOTION_SCALE_NORMAL;
    }

    /**
     * @param {import('./Game.js').Game} game
     */
    apply(game) {
        this._game = game;
        const settings = this.get();
        const motionScale = this.getMotionScale();

        game.state.reducedMotion = settings.reducedMotion;
        game.state.motionScale = motionScale;
        game.state.colorBlindMode = settings.colorBlindMode;
        game.state.colorPalette = getActivePalette(settings.colorBlindMode);

        game.setQualityMode(settings.graphics);
        SoundManager.applySettings(settings.audio);
        this.syncAllUI();
        this.updateGameOverStats();
    }

    /**
     * @param {{ startRoot?: HTMLElement | null, pauseRoot?: HTMLElement | null }} roots
     * @param {import('./Game.js').Game} game
     */
    bindUI(roots, game) {
        if (this._uiBound) return;
        this._game = game;
        const groups = [roots.startRoot, roots.pauseRoot].filter(Boolean);
        if (groups.length === 0) return;
        this._uiBound = true;

        for (const root of groups) {
            root.addEventListener('input', (e) => this._onUIChange(/** @type {Event} */ (e)));
            root.addEventListener('change', (e) => this._onUIChange(/** @type {Event} */ (e)));
        }

        this.syncAllUI();
    }

    /** @param {Event} e */
    _onUIChange(e) {
        const target = /** @type {HTMLElement} */ (e.target);
        const settingKey = target.getAttribute('data-setting');
        const audioKey = target.getAttribute('data-audio');
        if (!settingKey && !audioKey) return;

        const settings = { ...this.get() };

        if (settingKey === 'graphics' || settingKey === 'gameMode') {
            settings[settingKey] = /** @type {HTMLSelectElement} */ (target).value;
        } else if (settingKey === 'reducedMotion' || settingKey === 'colorBlindMode' || settingKey === 'showTutorial') {
            settings[settingKey] = /** @type {HTMLInputElement} */ (target).checked;
            if (settingKey === 'showTutorial' && settings.showTutorial) {
                settings.tutorialCompleted = false;
            }
        } else if (settingKey === 'input.keyboard' || settingKey === 'input.gamepad') {
            const field = settingKey.split('.')[1];
            settings.input = { ...settings.input, [field]: /** @type {HTMLInputElement} */ (target).checked };
        } else if (audioKey) {
            const audio = { ...settings.audio };
            if (audioKey === 'master' || audioKey === 'music' || audioKey === 'sfx') {
                audio[audioKey] = Number(/** @type {HTMLInputElement} */ (target).value) / 100;
            } else if (audioKey === 'mute') {
                audio.muted = /** @type {HTMLInputElement} */ (target).checked;
            } else if (audioKey === 'reduced') {
                audio.reducedIntensity = /** @type {HTMLInputElement} */ (target).checked;
            }
            settings.audio = audio;
        }

        this.saveManager.updateSettings(normalizeSettings(settings));
        this.saveManager.save();
        if (this._game) this.apply(this._game);
    }

    syncAllUI() {
        const settings = this.get();
        for (const root of [document.getElementById('startScreen'), document.getElementById('pauseScreen')]) {
            if (!root) continue;

            const graphics = root.querySelector('[data-setting="graphics"]');
            const gameMode = root.querySelector('[data-setting="gameMode"]');
            const reducedMotion = root.querySelector('[data-setting="reducedMotion"]');
            const colorBlind = root.querySelector('[data-setting="colorBlindMode"]');
            const showTutorial = root.querySelector('[data-setting="showTutorial"]');
            const keyboard = root.querySelector('[data-setting="input.keyboard"]');
            const gamepad = root.querySelector('[data-setting="input.gamepad"]');

            if (graphics) graphics.value = settings.graphics;
            if (gameMode) gameMode.value = settings.gameMode;
            if (reducedMotion) reducedMotion.checked = settings.reducedMotion;
            if (colorBlind) colorBlind.checked = settings.colorBlindMode;
            if (showTutorial) showTutorial.checked = settings.showTutorial;
            if (keyboard) keyboard.checked = settings.input.keyboard;
            if (gamepad) gamepad.checked = settings.input.gamepad;

            for (const key of ['master', 'music', 'sfx']) {
                const slider = root.querySelector(`[data-audio="${key}"]`);
                const label = root.querySelector(`[data-audio-label="${key}"]`);
                if (slider) {
                    slider.value = String(Math.round(settings.audio[key] * 100));
                    if (label) label.textContent = `${slider.value}%`;
                }
            }
            const mute = root.querySelector('[data-audio="mute"]');
            const reduced = root.querySelector('[data-audio="reduced"]');
            if (mute) mute.checked = settings.audio.muted;
            if (reduced) reduced.checked = settings.audio.reducedIntensity;
        }
    }

    updateGameOverStats() {
        if (!this._game) return;
        const stats = this.saveManager.getStats();
        const ui = this._game.ui;
        if (ui.finalScore) ui.finalScore.textContent = String(this._game.state.score);
        if (ui.highScoreVal) ui.highScoreVal.textContent = String(stats.highScore);
        if (ui.bestComboVal) ui.bestComboVal.textContent = String(stats.bestCombo);
        if (ui.accuracyVal) {
            const acc = this.saveManager.getAccuracy();
            ui.accuracyVal.textContent = `${Math.round(acc * 100)}%`;
        }
    }
}
