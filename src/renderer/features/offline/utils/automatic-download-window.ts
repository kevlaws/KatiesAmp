const MINUTE_MS = 60_000;
const MAX_DEVICE_OFFSET_MINUTES = 15;

export type AutomaticDownloadWindow = {
    endAt: Date;
    offsetMinutes: number;
    startAt: Date;
};

export type AutomaticDownloadWindowPlan = {
    active: boolean;
    nextTransitionAt: Date;
    window: AutomaticDownloadWindow;
};

export type AutomaticDownloadWindowScheduler = {
    dispose: () => void;
    refresh: () => void;
    start: () => void;
};

type AutomaticDownloadWindowSchedulerOptions = {
    cancelTimer?: (timer: unknown) => void;
    deviceId: string;
    endTime: string;
    now?: () => Date;
    onError?: (error: unknown) => void;
    onWindowClose: (window: AutomaticDownloadWindow) => void;
    onWindowOpen: (window: AutomaticDownloadWindow, signal: AbortSignal) => Promise<void> | void;
    scheduleTimer?: (callback: () => void, delay: number) => unknown;
    startTime: string;
};

type GetAutomaticDownloadWindowPlanOptions = {
    deviceId: string;
    endTime: string;
    now: Date;
    startTime: string;
};

const parseTime = (value: string): number => {
    const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(value);
    if (!match) throw new Error(`Invalid automatic download time: ${value}`);
    return Number(match[1]) * 60 + Number(match[2]);
};

const localDateAtMinutes = (date: Date, minutes: number, dayOffset: number): Date =>
    new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + dayOffset,
        Math.floor(minutes / 60),
        minutes % 60,
        0,
        0,
    );

const createWindow = ({
    date,
    dayOffset,
    endMinutes,
    offsetMinutes,
    startMinutes,
}: {
    date: Date;
    dayOffset: number;
    endMinutes: number;
    offsetMinutes: number;
    startMinutes: number;
}): AutomaticDownloadWindow => {
    const configuredStartAt = localDateAtMinutes(date, startMinutes, dayOffset);
    const crossesMidnight = endMinutes <= startMinutes;
    const endAt = localDateAtMinutes(date, endMinutes, dayOffset + Number(crossesMidnight));
    const durationMinutes = Math.max(
        1,
        (endAt.getTime() - configuredStartAt.getTime()) / MINUTE_MS,
    );
    const effectiveOffsetMinutes = offsetMinutes % Math.min(16, durationMinutes);
    const startAt = new Date(configuredStartAt.getTime() + effectiveOffsetMinutes * MINUTE_MS);

    return { endAt, offsetMinutes: effectiveOffsetMinutes, startAt };
};

export const getAutomaticDownloadOffsetMinutes = (deviceId: string): number => {
    if (!deviceId) return 0;

    let hash = 2_166_136_261;
    for (let index = 0; index < deviceId.length; index += 1) {
        hash ^= deviceId.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619) >>> 0;
    }

    return hash % (MAX_DEVICE_OFFSET_MINUTES + 1);
};

export const getAutomaticDownloadWindowPlan = ({
    deviceId,
    endTime,
    now,
    startTime,
}: GetAutomaticDownloadWindowPlanOptions): AutomaticDownloadWindowPlan => {
    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);
    if (startMinutes === endMinutes) {
        throw new Error('Automatic download start and end times must be different');
    }

    const offsetMinutes = getAutomaticDownloadOffsetMinutes(deviceId);
    const windows = [-1, 0, 1, 2].map((dayOffset) =>
        createWindow({
            date: now,
            dayOffset,
            endMinutes,
            offsetMinutes,
            startMinutes,
        }),
    );
    const activeWindow = windows.find(
        (candidate) => now >= candidate.startAt && now < candidate.endAt,
    );

    if (activeWindow) {
        return {
            active: true,
            nextTransitionAt: activeWindow.endAt,
            window: activeWindow,
        };
    }

    const nextWindow = windows.find((candidate) => candidate.startAt > now);
    if (!nextWindow) throw new Error('Unable to determine the next automatic download window');

    return {
        active: false,
        nextTransitionAt: nextWindow.startAt,
        window: nextWindow,
    };
};

export const createAutomaticDownloadWindowScheduler = ({
    cancelTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    deviceId,
    endTime,
    now = () => new Date(),
    onError,
    onWindowClose,
    onWindowOpen,
    scheduleTimer = (callback, delay) => setTimeout(callback, delay),
    startTime,
}: AutomaticDownloadWindowSchedulerOptions): AutomaticDownloadWindowScheduler => {
    let activeController: AbortController | null = null;
    let activeWindow: AutomaticDownloadWindow | null = null;
    let disposed = false;
    let started = false;
    let timer: null | unknown = null;

    const reportError = (error: unknown) => {
        try {
            onError?.(error);
        } catch {
            return;
        }
    };

    const clearTimer = () => {
        if (timer === null) return;
        cancelTimer(timer);
        timer = null;
    };

    const closeWindow = () => {
        if (!activeWindow || !activeController) return;

        const closingWindow = activeWindow;
        activeWindow = null;
        activeController.abort();
        activeController = null;

        try {
            onWindowClose(closingWindow);
        } catch (error) {
            reportError(error);
        }
    };

    const openWindow = (window: AutomaticDownloadWindow) => {
        activeWindow = window;
        activeController = new AbortController();
        const signal = activeController.signal;

        try {
            Promise.resolve(onWindowOpen(window, signal)).catch((error) => {
                if (!signal.aborted) reportError(error);
            });
        } catch (error) {
            if (!signal.aborted) reportError(error);
        }
    };

    const sameWindow = (
        left: AutomaticDownloadWindow | null,
        right: AutomaticDownloadWindow,
    ): boolean =>
        left?.startAt.getTime() === right.startAt.getTime() &&
        left.endAt.getTime() === right.endAt.getTime();

    const scheduleEvaluation = (transitionAt: Date) => {
        const delay = Math.max(0, transitionAt.getTime() - now().getTime());
        timer = scheduleTimer(() => {
            timer = null;
            evaluate();
        }, delay);
    };

    function evaluate() {
        if (disposed || !started) return;
        clearTimer();

        let plan: AutomaticDownloadWindowPlan;
        try {
            plan = getAutomaticDownloadWindowPlan({ deviceId, endTime, now: now(), startTime });
        } catch (error) {
            closeWindow();
            reportError(error);
            return;
        }

        if (!plan.active) {
            closeWindow();
        } else if (!sameWindow(activeWindow, plan.window)) {
            closeWindow();
            openWindow(plan.window);
        }

        scheduleEvaluation(plan.nextTransitionAt);
    }

    return {
        dispose: () => {
            if (disposed) return;
            disposed = true;
            clearTimer();
            closeWindow();
        },
        refresh: () => evaluate(),
        start: () => {
            if (disposed || started) return;
            started = true;
            evaluate();
        },
    };
};
