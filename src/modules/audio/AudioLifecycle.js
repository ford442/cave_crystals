// @ts-nocheck

/**
 * Wire browser lifecycle events so AudioContext resumes after tab switches / interruptions.
 * @param {{ resume: () => void | Promise<void> }} manager
 */
export function bindAudioLifecycle(manager) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (bindAudioLifecycle._bound) return;
    bindAudioLifecycle._bound = true;

    const resume = () => {
        try {
            const result = manager.resume();
            if (result && typeof result.then === 'function') {
                result.catch(() => { /* browser may reject without gesture */ });
            }
        } catch {
            // Ignore resume failures until the next user gesture.
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resume();
    });

    window.addEventListener('pageshow', resume);
    window.addEventListener('focus', resume);

    const unlockEvents = ['pointerdown', 'touchstart', 'keydown', 'click'];
    const unlock = () => resume();

    for (const eventName of unlockEvents) {
        document.addEventListener(eventName, unlock, { capture: true, passive: true });
    }
}

bindAudioLifecycle._bound = false;
