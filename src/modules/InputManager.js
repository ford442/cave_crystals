// @ts-nocheck

const LANE_LEFT = new Set(['ArrowLeft', 'KeyA']);
const LANE_RIGHT = new Set(['ArrowRight', 'KeyD']);
const FIRE_KEYS = new Set(['Space', 'Enter']);

export class InputManager {
    constructor() {
        /** @type {Set<string>} */
        this._keysDown = new Set();
        /** @type {Set<string>} */
        this._keysPressed = new Set();
        /** @type {boolean} */
        this._fireBuffered = false;
        /** @type {number} */
        this._laneRepeatTimer = 0;
        /** @type {number} */
        this._laneRepeatDelay = 180;
        /** @type {boolean} */
        this._prevGamepadFire = false;
        /** @type {number} */
        this._prevGamepadLane = 0;

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', this._onKeyDown);
            window.addEventListener('keyup', this._onKeyUp);
        }
    }

    /** @param {KeyboardEvent} e */
    _onKeyDown(e) {
        if (!e.repeat) {
            this._keysPressed.add(e.code);
        }
        this._keysDown.add(e.code);
    }

    /** @param {KeyboardEvent} e */
    _onKeyUp(e) {
        this._keysDown.delete(e.code);
    }

    /**
     * @param {{ keyboard?: boolean, gamepad?: boolean }} inputSettings
     * @param {number} dt
     * @returns {{ laneDelta: number, fire: boolean }}
     */
    poll(inputSettings, dt) {
        let laneDelta = 0;

        if (inputSettings.keyboard !== false) {
            const leftDown = [...LANE_LEFT].some((k) => this._keysDown.has(k));
            const rightDown = [...LANE_RIGHT].some((k) => this._keysDown.has(k));

            for (const code of this._keysPressed) {
                if (LANE_LEFT.has(code)) {
                    laneDelta = -1;
                    this._laneRepeatTimer = 0;
                    this._laneRepeatDelay = 180;
                } else if (LANE_RIGHT.has(code)) {
                    laneDelta = 1;
                    this._laneRepeatTimer = 0;
                    this._laneRepeatDelay = 180;
                } else if (FIRE_KEYS.has(code)) {
                    this._fireBuffered = true;
                }
            }

            if (laneDelta === 0 && (leftDown || rightDown)) {
                this._laneRepeatTimer += dt;
                if (this._laneRepeatTimer >= this._laneRepeatDelay) {
                    if (leftDown && !rightDown) laneDelta = -1;
                    else if (rightDown && !leftDown) laneDelta = 1;
                    this._laneRepeatTimer = 0;
                    this._laneRepeatDelay = 80;
                }
            } else if (!leftDown && !rightDown) {
                this._laneRepeatTimer = 0;
                this._laneRepeatDelay = 180;
            }
        }

        if (inputSettings.gamepad !== false && typeof navigator !== 'undefined' && navigator.getGamepads) {
            const pads = navigator.getGamepads();
            for (const pad of pads) {
                if (!pad) continue;
                const axisX = pad.axes[0] || 0;
                const dpadLeft = pad.buttons[14]?.pressed;
                const dpadRight = pad.buttons[15]?.pressed;
                const gamepadFire = pad.buttons[0]?.pressed;

                if (Math.abs(axisX) > 0.45) {
                    const dir = axisX > 0 ? 1 : -1;
                    if (dir !== this._prevGamepadLane) {
                        laneDelta = dir;
                        this._prevGamepadLane = dir;
                    }
                } else if (dpadLeft && !dpadRight) {
                    laneDelta = -1;
                } else if (dpadRight && !dpadLeft) {
                    laneDelta = 1;
                } else {
                    this._prevGamepadLane = 0;
                }

                if (gamepadFire && !this._prevGamepadFire) {
                    this._fireBuffered = true;
                }
                this._prevGamepadFire = Boolean(gamepadFire);
                break;
            }
        }

        this._keysPressed.clear();
        return { laneDelta, fire: this._fireBuffered };
    }

    consumeFire() {
        this._fireBuffered = false;
    }

    dispose() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', this._onKeyDown);
            window.removeEventListener('keyup', this._onKeyUp);
        }
    }
}
