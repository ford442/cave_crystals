// @ts-nocheck
import { AmbientMusic } from './audio/AmbientMusic.js';
import { bindAudioLifecycle } from './audio/AudioLifecycle.js';
import { loadPersistedAudioSettings, persistAudioSettings } from './audio/AudioPersistence.js';
import {
    applyToBuses,
    getIntensityMultiplier,
    normalizeSettings,
} from './audio/AudioSettings.js';

// --- AUDIO SYSTEM (WEB AUDIO API) ---
export const SoundManager = {
    ctx: null,
    masterGain: null,
    sfxGain: null,
    musicGain: null,
    uiGain: null,
    ambient: new AmbientMusic(),
    settings: normalizeSettings(),
    /** @type {Set<AudioNode>} */
    _activeVoices: new Set(),
    _musicDuck: 1,
    _sessionActive: false,
    _lifecycleBound: false,
    /** @type {((audio: import('./audio/AudioSettings.js').AudioSettingsData) => void) | null} */
    _persistHook: null,

    /**
     * Register a callback invoked when volume/mute changes are persisted (e.g. sync SaveManager).
     * @param {(audio: import('./audio/AudioSettings.js').AudioSettingsData) => void} hook
     */
    onPersist(hook) {
        this._persistHook = hook;
    },

    /**
     * Initialize the audio graph and restore persisted volume/mute preferences.
     * @param {import('./audio/AudioSettings.js').AudioSettingsData} [audioSettings]
     */
    init(audioSettings) {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.sfxGain = this.ctx.createGain();
            this.musicGain = this.ctx.createGain();
            this.uiGain = this.ctx.createGain();

            this.sfxGain.connect(this.masterGain);
            this.musicGain.connect(this.masterGain);
            this.uiGain.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);

            this._bindLifecycle();
        }

        if (audioSettings) {
            this.settings = normalizeSettings(audioSettings);
        } else {
            const persisted = loadPersistedAudioSettings();
            if (persisted) this.settings = persisted;
        }

        this.resume();
        this._applySettings();
    },

    /**
     * Resume the AudioContext after browser suspension (tab switch, interruption).
     * @returns {Promise<void> | void}
     */
    resume() {
        if (!this.ctx || this.ctx.state === 'closed') return;
        if (this.ctx.state === 'suspended') {
            return this.ctx.resume();
        }
    },

    _bindLifecycle() {
        if (this._lifecycleBound) return;
        this._lifecycleBound = true;
        bindAudioLifecycle(this);
    },

    /**
     * Master output volume (0..1). Clears mute when volume is set.
     * @param {number} volume
     * @returns {number}
     */
    setVolume(volume) {
        this.applySettings(
            { ...this.settings, master: volume, muted: false },
            { persist: true }
        );
        return this.getVolume();
    },

    /** @returns {number} */
    getVolume() {
        return this.settings.master;
    },

    /** @returns {boolean} */
    isMuted() {
        return this.settings.muted;
    },

    mute() {
        this.applySettings({ ...this.settings, muted: true }, { persist: true });
    },

    unmute() {
        this.applySettings({ ...this.settings, muted: false }, { persist: true });
    },

    /**
     * Channel bus for routing synthesized audio (future per-channel mixer can replace these nodes).
     * @param {'master' | 'music' | 'sfx' | 'ui'} channel
     * @returns {GainNode | null}
     */
    getChannelBus(channel) {
        switch (channel) {
            case 'master': return this.masterGain;
            case 'music': return this.musicGain;
            case 'sfx': return this.sfxGain;
            case 'ui': return this.uiGain;
            default: return this.sfxGain;
        }
    },

    _persistSettings() {
        persistAudioSettings(this.settings);
        this._persistHook?.(this.settings);
    },

    /**
     * @param {import('./audio/AudioSettings.js').AudioSettingsData} audioSettings
     * @param {{ persist?: boolean }} [options]
     */
    applySettings(audioSettings, options = {}) {
        this.settings = normalizeSettings(audioSettings);
        this._applySettings();
        if (this.ambient.running) {
            this.ambient.reducedIntensity = this.settings.reducedIntensity;
        }
        if (options.persist) this._persistSettings();
    },

    _applySettings() {
        if (!this.masterGain) return;
        applyToBuses(
            {
                masterGain: this.masterGain,
                musicGain: this.musicGain,
                sfxGain: this.sfxGain,
                uiGain: this.uiGain,
            },
            this.settings,
            { musicDuck: this._musicDuck }
        );
    },

    setMusicDuck(duck) {
        this._musicDuck = duck;
        this._applySettings();
    },

    async startSession() {
        this.init();
        if (this.ambient.running) {
            this.ambient.dispose();
        }
        this._sessionActive = true;
        this.ambient.start(this.ctx, this.musicGain, this.settings.reducedIntensity);
    },

    /**
     * @param {{ active?: boolean, criticalIntensity?: number, combo?: number, level?: number }} state
     */
    updateSession(state) {
        if (!this._sessionActive) return;
        this.ambient.update({
            ...state,
            reducedIntensity: this.settings.reducedIntensity,
        });
    },

    stopSession() {
        this._sessionActive = false;
        this.ambient.fadeOutAndStop(0.8);
    },

    _intensityVol(vol) {
        return vol * getIntensityMultiplier(this.settings);
    },

    /**
     * @param {GainNode} bus
     * @param {OscillatorNode} osc
     * @param {GainNode} gain
     */
    _trackVoice(bus, osc, gain) {
        this._activeVoices.add(osc);
        this._activeVoices.add(gain);
        const cleanup = () => {
            try { osc.disconnect(); } catch { /* noop */ }
            try { gain.disconnect(); } catch { /* noop */ }
            this._activeVoices.delete(osc);
            this._activeVoices.delete(gain);
        };
        osc.onended = cleanup;
    },

    /**
     * @param {number} freq
     * @param {OscillatorType} type
     * @param {number} duration
     * @param {number} [vol]
     * @param {number} [delaySec]
     * @param {GainNode} [bus]
     */
    scheduleTone(freq, type, duration, vol = 0.1, delaySec = 0, bus = null) {
        if (!this.ctx || !this.sfxGain) return;
        const targetBus = bus || this.sfxGain;
        const t0 = this.ctx.currentTime + delaySec;
        const scaledVol = this._intensityVol(vol);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(scaledVol, t0);
        gain.gain.exponentialRampToValueAtTime(0.01, t0 + duration);

        osc.connect(gain);
        gain.connect(targetBus);
        this._trackVoice(targetBus, osc, gain);

        osc.start(t0);
        osc.stop(t0 + duration);
    },

    playTone(freq, type, duration, vol = 0.1) {
        this.scheduleTone(freq, type, duration, vol, 0, this.sfxGain);
    },

    shoot() {
        if (!this.ctx || !this.sfxGain) return;
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const vol = this._intensityVol(0.1);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, t0);
        osc.frequency.exponentialRampToValueAtTime(100, t0 + 0.2);
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.2);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        this._trackVoice(this.sfxGain, osc, gain);
        osc.start(t0);
        osc.stop(t0 + 0.2);
    },

    match(pitchMultiplier = 1.0) {
        if (!this.ctx) return;
        const base = (400 + Math.random() * 200) * pitchMultiplier;
        [base, base * 1.25, base * 1.5].forEach((freq, i) => {
            this.scheduleTone(freq, 'sine', 0.6, 0.1, i * 0.05, this.sfxGain);
        });
    },

    mismatch() {
        if (!this.ctx || !this.sfxGain) return;
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const vol = this._intensityVol(0.1);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t0);
        osc.frequency.linearRampToValueAtTime(50, t0 + 0.3);
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.linearRampToValueAtTime(0.01, t0 + 0.3);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        this._trackVoice(this.sfxGain, osc, gain);
        osc.start(t0);
        osc.stop(t0 + 0.3);
    },

    gameOver() {
        if (!this.ctx || !this.uiGain) return;
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const vol = this._intensityVol(0.3);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, t0);
        osc.frequency.exponentialRampToValueAtTime(10, t0 + 2.0);
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.linearRampToValueAtTime(0.01, t0 + 2.0);

        osc.connect(gain);
        gain.connect(this.uiGain);
        this._trackVoice(this.uiGain, osc, gain);
        osc.start(t0);
        osc.stop(t0 + 2.0);
    },

    levelUp() {
        if (!this.ctx || !this.uiGain) return;
        const freqs = [261.63, 329.63, 392.00, 523.25];
        freqs.forEach((freq, i) => {
            this.scheduleTone(freq, 'triangle', 0.8, 0.15, i * 0.1, this.uiGain);
        });
        this.scheduleTone(1046.50, 'sine', 1.0, 0.1, 0.4, this.uiGain);
    },

    heartbeat() {
        if (!this.ctx || !this.sfxGain) return;
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const vol = this._intensityVol(0.5);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, t0);
        osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.1);
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        this._trackVoice(this.sfxGain, osc, gain);
        osc.start(t0);
        osc.stop(t0 + 0.15);
    },

    powerUpPickup() {
        if (!this.ctx) return;
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            this.scheduleTone(freq, 'sine', 0.25, 0.12, i * 0.06, this.sfxGain);
        });
    },

    powerUpActivate() {
        if (!this.ctx) return;
        this.scheduleTone(880, 'triangle', 0.35, 0.14, 0, this.sfxGain);
        this.scheduleTone(1320, 'sine', 0.25, 0.1, 0.08, this.sfxGain);
    },

    getActiveVoiceCount() {
        return this._activeVoices.size + this.ambient.getLayerCount();
    },
};
