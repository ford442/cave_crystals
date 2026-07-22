declare module '*.png' {
    const src: string;
    export default src;
}

declare module '*.wasm' {
    const src: string;
    export default src;
}

interface ImportMeta {
    readonly env?: {
        readonly DEV?: boolean;
        readonly PROD?: boolean;
        readonly MODE?: string;
    };
}

interface Document {
    webkitFullscreenEnabled?: boolean;
    mozFullScreenEnabled?: boolean;
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
    mozCancelFullScreen?: () => Promise<void>;
}

interface HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
}

interface Window {
    __DEV_PERF__?: boolean;
    __PARTICLE_WORKER__?: boolean;
    __WASM_VERBOSE__?: boolean;
    __FORCE_WEBGL_POSTFX__?: boolean;
    __FORCE_CANVAS_POSTFX__?: boolean;
    __toggleDevPerf__?: (force?: boolean) => boolean;
    game?: import('./modules/Game.js').Game;
    SoundManager?: import('./modules/Audio.js').SoundManager;
    __pendingReplay__?: {
        version: number;
        seed: number;
        config: { gameMode: 'campaign' | 'endless'; graphics: string; levelIndex: number };
        events: Array<{ t: number; type: string; lane?: number; kind?: string; score?: number }>;
        expect?: { finalScore: number; tolerance?: number };
    };
    webkitAudioContext?: typeof AudioContext;
}
