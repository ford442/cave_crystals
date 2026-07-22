// @ts-nocheck

/**
 * Procedural cave drone with layers driven by game state.
 */
export class AmbientMusic {
    constructor() {
        /** @type {AudioContext | null} */
        this.ctx = null;
        /** @type {GainNode | null} */
        this.musicBus = null;
        /** @type {Array<{ osc: OscillatorNode, filter: BiquadFilterNode, gain: GainNode }>} */
        this.layers = [];
        this.running = false;
        this.disposed = false;
        this.reducedIntensity = false;
        this._fadeTimer = null;
    }

    /**
     * @param {AudioContext} ctx
     * @param {GainNode} musicBus
     * @param {boolean} [reducedIntensity]
     */
    start(ctx, musicBus, reducedIntensity = false) {
        this.dispose();
        this.ctx = ctx;
        this.musicBus = musicBus;
        this.disposed = false;
        this.reducedIntensity = reducedIntensity;
        this.running = true;

        const t0 = ctx.currentTime;
        const layerDefs = [
            { type: 'sine', freq: 55, q: 0.7, baseGain: 0.12 },
            { type: 'triangle', freq: 82.5, q: 1.0, baseGain: 0.08 },
            { type: 'sine', freq: 110, q: 1.2, baseGain: 0.05 },
        ];

        for (const def of layerDefs) {
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            osc.type = /** @type {OscillatorType} */ (def.type);
            osc.frequency.value = def.freq;
            filter.type = 'lowpass';
            filter.frequency.value = 320;
            filter.Q.value = def.q;
            gain.gain.value = 0;

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(musicBus);

            osc.start(t0);
            gain.gain.setValueAtTime(0, t0);
            gain.gain.linearRampToValueAtTime(def.baseGain, t0 + 1.5);

            this.layers.push({ osc, filter, gain });
        }
    }

    /**
     * @param {{ active?: boolean, criticalIntensity?: number, combo?: number, level?: number, reducedIntensity?: boolean }} state
     */
    update(state) {
        if (!this.running || !this.ctx || this.layers.length === 0) return;

        const active = state.active !== false;
        const critical = Math.min(1, Math.max(0, state.criticalIntensity || 0));
        const combo = Math.min(1, Math.max(0, (state.combo || 0) / 8));
        const levelBoost = Math.min(0.15, ((state.level || 1) - 1) * 0.02);
        this.reducedIntensity = Boolean(state.reducedIntensity);

        const base = active ? 0.12 + levelBoost : 0;
        const tension = this.reducedIntensity ? 0 : critical * 0.14;
        const harmonic = this.reducedIntensity ? 0 : combo * 0.1;

        const targets = [base, tension, harmonic];
        const cutoffs = [
            280 + levelBoost * 200,
            420 + critical * 900,
            520 + combo * 600,
        ];

        const t = this.ctx.currentTime;
        this.layers.forEach((layer, i) => {
            layer.gain.gain.setTargetAtTime(targets[i] || 0, t, 0.12);
            layer.filter.frequency.setTargetAtTime(cutoffs[i] || 300, t, 0.15);
        });
    }

    /**
     * @param {number} [durationSec]
     * @returns {Promise<void>}
     */
    fadeOutAndStop(durationSec = 0.8) {
        if (!this.running || !this.ctx) {
            this.dispose();
            return Promise.resolve();
        }

        const ctx = this.ctx;
        const t0 = ctx.currentTime;
        for (const layer of this.layers) {
            layer.gain.gain.cancelScheduledValues(t0);
            layer.gain.gain.setValueAtTime(layer.gain.gain.value, t0);
            layer.gain.gain.linearRampToValueAtTime(0, t0 + durationSec);
        }

        return new Promise((resolve) => {
            if (this._fadeTimer) clearTimeout(this._fadeTimer);
            this._fadeTimer = setTimeout(() => {
                this._fadeTimer = null;
                this.dispose();
                resolve();
            }, durationSec * 1000 + 50);
        });
    }

    dispose() {
        if (this._fadeTimer) {
            clearTimeout(this._fadeTimer);
            this._fadeTimer = null;
        }

        for (const layer of this.layers) {
            try {
                layer.gain.gain.cancelScheduledValues(0);
                layer.osc.stop();
            } catch {
                // Oscillator may already be stopped.
            }
            try { layer.osc.disconnect(); } catch { /* noop */ }
            try { layer.filter.disconnect(); } catch { /* noop */ }
            try { layer.gain.disconnect(); } catch { /* noop */ }
        }

        this.layers = [];
        this.running = false;
        this.disposed = true;
        this.ctx = null;
        this.musicBus = null;
    }

    /** @returns {number} */
    getLayerCount() {
        return this.layers.length;
    }
}
