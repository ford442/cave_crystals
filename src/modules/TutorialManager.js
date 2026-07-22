// @ts-nocheck

/** @typedef {'idle' | 'aim' | 'match' | 'mismatch' | 'hints' | 'complete'} TutorialStep */

const HINTS_DURATION_MS = 60_000;

const STEP_COPY = {
    aim: 'Move your cursor (or tap a lane) to aim the launcher.',
    aimKeyboard: 'Move your cursor, tap a lane, or use arrow keys to aim the launcher.',
    match: 'Shoot when your spore color matches the crystal!',
    mismatch: 'Try shooting a different color — mismatches make crystals grow.',
    hints: 'Keep playing — combo and danger hints will appear as you go.',
    combo: 'Chain matches before the timer runs out for combo bonus.',
    critical: 'Red glow means crystals are dangerously close — match fast!',
};

export class TutorialManager {
    /**
     * @param {import('./Game.js').Game} game
     * @param {import('./SaveManager.js').SaveManager} saveManager
     */
    constructor(game, saveManager) {
        this.game = game;
        this.saveManager = saveManager;

        /** @type {TutorialStep} */
        this.step = 'idle';
        /** @type {number} */
        this._initialLane = 0;
        /** @type {boolean} */
        this._sessionSkipped = false;
        /** @type {number} */
        this._hintsElapsed = 0;
        /** @type {boolean} */
        this._comboHintShown = false;
        /** @type {boolean} */
        this._criticalHintShown = false;
        /** @type {string} */
        this._contextHint = '';

        this.layer = document.getElementById('tutorialLayer');
        this.spotlights = document.getElementById('tutorialSpotlights');
        this.textEl = document.getElementById('tutorialText');
        this.skipBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('tutorialSkipBtn'));
        this.dismissCheckbox = /** @type {HTMLInputElement | null} */ (
            document.getElementById('tutorialDismissForever')
        );

        if (this.skipBtn) {
            this.skipBtn.addEventListener('click', () => {
                this.skip(Boolean(this.dismissCheckbox?.checked));
            });
        }
    }

    shouldRun() {
        if (this._sessionSkipped) return false;
        const settings = this.saveManager.getSettings();
        return settings.showTutorial && !settings.tutorialCompleted;
    }

    isActive() {
        return this.step !== 'idle' && this.step !== 'complete';
    }

    /** @returns {TutorialStep} */
    getStep() {
        return this.step;
    }

    start() {
        if (!this.shouldRun()) return;

        this.step = 'aim';
        this._initialLane = this.game.launcher.targetLane;
        this._hintsElapsed = 0;
        this._comboHintShown = false;
        this._criticalHintShown = false;
        this._contextHint = '';

        if (this.dismissCheckbox) this.dismissCheckbox.checked = false;
        this._showLayer();
        this._setStepText();
        this.updateLayout();
    }

    /**
     * @param {boolean} [dismissForever]
     */
    skip(dismissForever = false) {
        if (dismissForever) {
            this._persistDismissal();
        } else {
            this._sessionSkipped = true;
        }
        this._complete();
    }

    onMatch() {
        if (this.step === 'match') {
            this._advanceTo('mismatch');
        }
    }

    onMismatch() {
        if (this.step === 'mismatch') {
            this._advanceTo('hints');
        }
    }

    /** @param {number} dt */
    update(dt) {
        if (!this.isActive()) return;

        const game = this.game;
        const state = game.state;

        if (this.step === 'aim' && game.launcher.targetLane !== this._initialLane) {
            this._advanceTo('match');
        }

        if (this.step === 'hints') {
            this._hintsElapsed += dt;

            if (!this._comboHintShown && state.comboTimer > 0 && state.combo > 0) {
                this._comboHintShown = true;
                this._contextHint = STEP_COPY.combo;
                this._setStepText();
            }

            if (!this._criticalHintShown && state.criticalIntensity > 0.1) {
                this._criticalHintShown = true;
                this._contextHint = STEP_COPY.critical;
                this._setStepText();
            }

            const bothShown = this._comboHintShown && this._criticalHintShown;
            if (this._hintsElapsed >= HINTS_DURATION_MS || bothShown) {
                this._persistCompletion();
                this._complete();
            }
        }

        this.updateLayout();
    }

    updateLayout() {
        if (!this.isActive() || !this.spotlights || !this.layer) return;

        const game = this.game;
        const canvasRect = game.canvas.getBoundingClientRect();
        const laneWidth = game.renderer.laneWidth;
        const height = game.renderer.height;
        const lane = game.launcher.targetLane;

        this.spotlights.innerHTML = '';
        this._applyMotionClass();

        const rings = [];

        if (this.step === 'aim' || this.step === 'match' || this.step === 'mismatch') {
            rings.push(this._laneRect(canvasRect, lane, laneWidth, height));
        }

        if (this.step === 'match') {
            const matchRects = this._matchingCrystalRects(canvasRect, lane, laneWidth, height);
            rings.push(...matchRects);
        }

        if (this.step === 'mismatch') {
            const growthRects = this._laneCrystalRects(canvasRect, lane, laneWidth, height);
            rings.push(...growthRects);
        }

        if (this.step === 'hints') {
            if (this._criticalHintShown) {
                const criticalRects = this._criticalCrystalRects(canvasRect, laneWidth, height);
                rings.push(...criticalRects);
            }
            if (this._comboHintShown) {
                const scoreBoard = document.getElementById('scoreBoard');
                if (scoreBoard) {
                    rings.push(this._elementRect(scoreBoard, canvasRect));
                }
            }
        }

        for (const ring of rings) {
            this.spotlights.appendChild(ring);
        }
    }

    _applyMotionClass() {
        if (!this.layer) return;
        const reduced = this.game.state.reducedMotion
            || (typeof window !== 'undefined'
                && window.matchMedia
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        this.layer.classList.toggle('tutorial-reduced-motion', reduced);
    }

    _showLayer() {
        if (this.layer) this.layer.classList.remove('hidden');
    }

    _hideLayer() {
        if (this.layer) this.layer.classList.add('hidden');
        if (this.spotlights) this.spotlights.innerHTML = '';
    }

    /** @param {TutorialStep} step */
    _advanceTo(step) {
        this.step = step;
        this._contextHint = '';
        this._setStepText();
        this.updateLayout();
    }

    _setStepText() {
        if (!this.textEl) return;

        if (this.step === 'hints' && this._contextHint) {
            this.textEl.textContent = this._contextHint;
            return;
        }

        if (this.step === 'aim') {
            const keyboard = this.game.settings.get().input.keyboard;
            this.textEl.textContent = keyboard ? STEP_COPY.aimKeyboard : STEP_COPY.aim;
            return;
        }

        const copy = STEP_COPY[this.step];
        if (copy) this.textEl.textContent = copy;
    }

    _persistDismissal() {
        this.saveManager.updateSettings({
            tutorialCompleted: true,
            showTutorial: false,
        });
        this.saveManager.save();
        this.game.settings.syncAllUI();
    }

    _persistCompletion() {
        if (this.dismissCheckbox?.checked) {
            this._persistDismissal();
            return;
        }
        this.saveManager.updateSettings({ tutorialCompleted: true });
        this.saveManager.save();
    }

    _complete() {
        this.step = 'complete';
        this._hideLayer();
    }

    /**
     * @param {DOMRect} canvasRect
     * @param {number} lane
     * @param {number} laneWidth
     * @param {number} height
     */
    _laneRect(canvasRect, lane, laneWidth, height) {
        const el = document.createElement('div');
        el.className = 'tutorial-focus-ring';
        el.style.left = `${canvasRect.left + lane * laneWidth}px`;
        el.style.top = `${canvasRect.top}px`;
        el.style.width = `${laneWidth}px`;
        el.style.height = `${height}px`;
        return el;
    }

    /**
     * @param {DOMRect} canvasRect
     * @param {number} lane
     * @param {number} laneWidth
     * @param {number} height
     * @returns {HTMLElement[]}
     */
    _laneCrystalRects(canvasRect, lane, laneWidth, height) {
        const laneCrystals = this.game.state.laneMap.get(lane);
        if (!laneCrystals) return [];

        const rects = [];
        if (laneCrystals.top) {
            rects.push(this._crystalRect(canvasRect, lane, laneWidth, laneCrystals.top.height, 'top', height));
        }
        if (laneCrystals.bottom) {
            rects.push(this._crystalRect(canvasRect, lane, laneWidth, laneCrystals.bottom.height, 'bottom', height));
        }
        return rects;
    }

    /**
     * @param {DOMRect} canvasRect
     * @param {number} lane
     * @param {number} laneWidth
     * @param {number} height
     * @returns {HTMLElement[]}
     */
    _matchingCrystalRects(canvasRect, lane, laneWidth, height) {
        const colorIdx = this.game.state.nextSporeColorIdx;
        const laneCrystals = this.game.state.laneMap.get(lane);
        if (!laneCrystals) return this._laneCrystalRects(canvasRect, lane, laneWidth, height);

        const rects = [];
        for (const crystal of [laneCrystals.top, laneCrystals.bottom]) {
            if (crystal && crystal.colorIdx === colorIdx) {
                rects.push(this._crystalRect(canvasRect, lane, laneWidth, crystal.height, crystal.type, height));
            }
        }
        return rects.length ? rects : this._laneCrystalRects(canvasRect, lane, laneWidth, height);
    }

    /**
     * @param {DOMRect} canvasRect
     * @param {number} laneWidth
     * @param {number} height
     * @returns {HTMLElement[]}
     */
    _criticalCrystalRects(canvasRect, laneWidth, height) {
        const rects = [];
        for (const crystal of this.game.state.crystals) {
            if (!crystal.isCritical) continue;
            rects.push(this._crystalRect(canvasRect, crystal.lane, laneWidth, crystal.height, crystal.type, height));
        }
        return rects;
    }

    /**
     * @param {DOMRect} canvasRect
     * @param {number} lane
     * @param {number} laneWidth
     * @param {number} crystalHeight
     * @param {'top' | 'bottom'} type
     * @param {number} canvasHeight
     */
    _crystalRect(canvasRect, lane, laneWidth, crystalHeight, type, canvasHeight) {
        const padding = 8;
        const bandHeight = Math.max(crystalHeight + padding * 2, 40);
        const el = document.createElement('div');
        el.className = 'tutorial-focus-ring tutorial-focus-ring--crystal';
        el.style.left = `${canvasRect.left + lane * laneWidth + padding}px`;
        el.style.width = `${laneWidth - padding * 2}px`;
        if (type === 'top') {
            el.style.top = `${canvasRect.top}px`;
            el.style.height = `${bandHeight}px`;
        } else {
            el.style.top = `${canvasRect.top + canvasHeight - bandHeight}px`;
            el.style.height = `${bandHeight}px`;
        }
        return el;
    }

    /**
     * @param {HTMLElement} element
     * @param {DOMRect} canvasRect
     */
    _elementRect(element, canvasRect) {
        const rect = element.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = 'tutorial-focus-ring tutorial-focus-ring--hud';
        el.style.left = `${rect.left - 6}px`;
        el.style.top = `${rect.top - 6}px`;
        el.style.width = `${rect.width + 12}px`;
        el.style.height = `${rect.height + 12}px`;
        return el;
    }
}
