export type OfflineSyncScheduler = {
    dispose: () => void;
    notifyPlaybackChanged: () => void;
    request: (request?: OfflineSyncRequest) => Promise<void>;
};

type OfflineSyncRequest = {
    immediate?: boolean;
};

type OfflineSyncSchedulerOptions = {
    cancelTimer?: (timer: unknown) => void;
    cooldownMs: number;
    isPlaying: () => boolean;
    now?: () => number;
    onError?: (error: unknown) => void;
    runSync: () => Promise<boolean>;
    scheduleTimer?: (callback: () => void, delay: number) => unknown;
};

export const createOfflineSyncScheduler = ({
    cancelTimer = (timer) => window.clearTimeout(timer as number),
    cooldownMs,
    isPlaying,
    now = Date.now,
    onError,
    runSync,
    scheduleTimer = (callback, delay) => window.setTimeout(callback, delay),
}: OfflineSyncSchedulerOptions): OfflineSyncScheduler => {
    let activeRun: null | Promise<void> = null;
    let cooldownTimer: null | unknown = null;
    let disposed = false;
    let lastCompletedAt: null | number = null;
    let pending = false;
    let pendingFromPlayback = false;
    let pendingImmediate = false;

    const clearCooldownTimer = () => {
        if (cooldownTimer === null) return;
        cancelTimer(cooldownTimer);
        cooldownTimer = null;
    };

    const schedulePending = (delay: number) => {
        if (cooldownTimer !== null) return;
        cooldownTimer = scheduleTimer(() => {
            cooldownTimer = null;
            drainPending();
        }, delay);
    };

    const startRun = () => {
        pending = false;
        pendingFromPlayback = false;
        pendingImmediate = false;

        activeRun = Promise.resolve()
            .then(runSync)
            .then((attempted) => {
                if (attempted) lastCompletedAt = now();
            })
            .catch((error) => {
                try {
                    onError?.(error);
                } catch {
                    return;
                }
            })
            .finally(() => {
                activeRun = null;
                drainPending();
            });
    };

    function drainPending() {
        if (disposed || activeRun || !pending) return;
        if (isPlaying()) {
            pendingFromPlayback = true;
            return;
        }

        const bypassCooldown = pendingImmediate || pendingFromPlayback;
        if (bypassCooldown) clearCooldownTimer();

        if (!bypassCooldown && lastCompletedAt !== null) {
            const remaining = cooldownMs - (now() - lastCompletedAt);
            if (remaining > 0) {
                schedulePending(remaining);
                return;
            }
        }

        startRun();
    }

    return {
        dispose: () => {
            disposed = true;
            pending = false;
            clearCooldownTimer();
        },
        notifyPlaybackChanged: () => {
            if (disposed || isPlaying() || !pending) return;
            if (pendingFromPlayback) pendingImmediate = true;
            drainPending();
        },
        request: ({ immediate = false } = {}) => {
            if (disposed) return Promise.resolve();
            pending = true;
            pendingImmediate ||= immediate;
            if (isPlaying()) pendingFromPlayback = true;
            if (immediate) clearCooldownTimer();
            drainPending();
            return activeRun ?? Promise.resolve();
        },
    };
};
