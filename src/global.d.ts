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

interface Window {
    __DEV_PERF__?: boolean;
    __WASM_VERBOSE__?: boolean;
    game?: import('./modules/Game.js').Game;
    webkitAudioContext?: typeof AudioContext;
}
