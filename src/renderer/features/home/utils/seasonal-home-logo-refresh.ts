export type SeasonalHomeLogoRefreshScheduler = {
    dispose: () => void;
    handleVisibilityChange: (visibilityState: DocumentVisibilityState) => void;
    start: () => void;
};

type SeasonalHomeLogoRefreshSchedulerOptions = {
    cancelTimer?: (timer: unknown) => void;
    now?: () => Date;
    onRefresh: () => void;
    scheduleTimer?: (callback: () => void, delay: number) => unknown;
};

const getNextLocalMidnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

export const createSeasonalHomeLogoRefreshScheduler = ({
    cancelTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    now = () => new Date(),
    onRefresh,
    scheduleTimer = (callback, delay) => setTimeout(callback, delay),
}: SeasonalHomeLogoRefreshSchedulerOptions): SeasonalHomeLogoRefreshScheduler => {
    let disposed = false;
    let started = false;
    let timer: null | unknown = null;

    const clearTimer = () => {
        if (timer === null) return;
        cancelTimer(timer);
        timer = null;
    };

    const scheduleMidnightRefresh = () => {
        if (disposed || !started) return;
        clearTimer();

        const currentTime = now();
        const delay = Math.max(
            1_000,
            getNextLocalMidnight(currentTime).getTime() - currentTime.getTime(),
        );
        timer = scheduleTimer(() => {
            timer = null;
            refreshAndSchedule();
        }, delay);
    };

    function refreshAndSchedule() {
        if (disposed || !started) return;

        try {
            onRefresh();
        } finally {
            scheduleMidnightRefresh();
        }
    }

    return {
        dispose: () => {
            if (disposed) return;
            disposed = true;
            clearTimer();
        },
        handleVisibilityChange: (visibilityState) => {
            if (visibilityState === 'visible') {
                refreshAndSchedule();
            }
        },
        start: () => {
            if (disposed || started) return;
            started = true;
            scheduleMidnightRefresh();
        },
    };
};
