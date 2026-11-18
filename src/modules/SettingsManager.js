/** @import { Game } from './Game.js' */
/** @import { SaveManager } from './SaveManager.js' */
/** @import { GameSettings, RawGameSettings } from './types.js' */
import { SoundManager } from './Audio.js';
import { getActivePalette } from './ColorPalettes.js';
import { normalizeSettings } from './SaveManager.js';

const MOTION_SCALE_REDUCED = 0.2;
const MOTION_SCALE_NORMAL = 1.0;

/** Volume sliders bound through `data-audio`, in the order they are synced. */
const VOLUME_CONTROLS = /** @type {const} */ (['master', 'music', 'sfx']);

/**
 * First element under `root` that matches `selector` and is a `Type`, or null.
 * @template {Element} T
 * @param {ParentNode} root
 * @param {string} selector
 * @param {new (...args: any[]) => T} Type
 * @returns {T | null}
 */
function findControl(root, selector, Type) {
    const el = root.querySelector(selector);
    return el instanceof Type ? el : null;
}

export class SettingsManager {
    /**
     * @param {SaveManager} saveManager
     */
    constructor(saveManager) {
        this.saveManager = saveManager;
        this._uiBound = false;
        /** @type {Game | null} */
        this._game = null;
    }

    load() {
        this.saveManager.load();
    }

    /** @returns {GameSettings} */
    get settings() {
        return this.saveManager.getSettings();
    }

    /** @returns {GameSettings} */
    get() {
        return this.saveManager.getSettings();
    }

    getMotionScale() {
        return this.get().reducedMotion ? MOTION_SCALE_REDUCED : MOTION_SCALE_NORMAL;
    }

    /**
     * @param {Game} game
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
     * @param {Game} game
     */
    bindUI(roots, game) {
        if (this._uiBound) return;
        this._game = game;
        const groups = [roots.startRoot, roots.pauseRoot].filter((root) => root != null);
        if (groups.length === 0) return;
        this._uiBound = true;

        for (const root of groups) {
            root.addEventListener('input', (e) => this._onUIChange(e));
            root.addEventListener('change', (e) => this._onUIChange(e));
        }

        this.syncAllUI();
    }

    /** @param {Event} e */
    _onUIChange(e) {
        const target = e.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
        const settingKey = target.getAttribute('data-setting');
        const audioKey = target.getAttribute('data-audio');
        if (!settingKey && !audioKey) return;

        const value = target.value;
        const checked = target instanceof HTMLInputElement && target.checked;
        /** @type {RawGameSettings} */
        const settings = { ...this.get() };

        if (settingKey === 'graphics' || settingKey === 'gameMode') {
            settings[settingKey] = value;
        } else if (settingKey === 'reducedMotion' || settingKey === 'colorBlindMode' || settingKey === 'showTutorial') {
            settings[settingKey] = checked;
            if (settingKey === 'showTutorial' && settings.showTutorial) {
                settings.tutorialCompleted = false;
            }
        } else if (settingKey === 'input.keyboard' || settingKey === 'input.gamepad') {
            const field = settingKey === 'input.keyboard' ? 'keyboard' : 'gamepad';
            settings.input = { ...settings.input, [field]: checked };
        } else if (audioKey) {
            const audio = { ...settings.audio };
            if (audioKey === 'master' || audioKey === 'music' || audioKey === 'sfx') {
                audio[audioKey] = Number(value) / 100;
            } else if (audioKey === 'mute') {
                audio.muted = checked;
            } else if (audioKey === 'reduced') {
                audio.reducedIntensity = checked;
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

            const graphics = findControl(root, '[data-setting="graphics"]', HTMLSelectElement);
            const gameMode = findControl(root, '[data-setting="gameMode"]', HTMLSelectElement);
            const reducedMotion = findControl(root, '[data-setting="reducedMotion"]', HTMLInputElement);
            const colorBlind = findControl(root, '[data-setting="colorBlindMode"]', HTMLInputElement);
            const showTutorial = findControl(root, '[data-setting="showTutorial"]', HTMLInputElement);
            const keyboard = findControl(root, '[data-setting="input.keyboard"]', HTMLInputElement);
            const gamepad = findControl(root, '[data-setting="input.gamepad"]', HTMLInputElement);

            if (graphics) graphics.value = settings.graphics;
            if (gameMode) gameMode.value = settings.gameMode;
            if (reducedMotion) reducedMotion.checked = settings.reducedMotion;
            if (colorBlind) colorBlind.checked = settings.colorBlindMode;
            if (showTutorial) showTutorial.checked = settings.showTutorial;
            if (keyboard) keyboard.checked = settings.input.keyboard;
            if (gamepad) gamepad.checked = settings.input.gamepad;

            for (const key of VOLUME_CONTROLS) {
                const slider = findControl(root, `[data-audio="${key}"]`, HTMLInputElement);
                const label = root.querySelector(`[data-audio-label="${key}"]`);
                if (slider) {
                    slider.value = String(Math.round(settings.audio[key] * 100));
                    if (label) label.textContent = `${slider.value}%`;
                }
            }
            const mute = findControl(root, '[data-audio="mute"]', HTMLInputElement);
            const reduced = findControl(root, '[data-audio="reduced"]', HTMLInputElement);
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
        this._game.systems?.achievements?.renderPanel();
    }
}
