type MpvQueueEntry = {
    options?: string[];
    url?: string;
};

type MpvQueueLoadTarget = {
    load: (source: string, mode: 'append' | 'replace', options?: string[]) => Promise<void>;
};

export const replaceMpvQueueEntries = async (
    mpv: MpvQueueLoadTarget,
    current: MpvQueueEntry,
    next: MpvQueueEntry,
    onCurrentError: (error: unknown) => Promise<void> | void,
) => {
    if (!current.url) return;

    try {
        await mpv.load(current.url, 'replace', current.options);
    } catch (error) {
        await onCurrentError(error);
    }

    if (next.url) {
        await mpv.load(next.url, 'append', next.options);
    }
};

const appendMpvQueueEntry = async (mpv: MpvQueueLoadTarget, entry: MpvQueueEntry) => {
    if (entry.url) {
        await mpv.load(entry.url, 'append', entry.options);
    }
};

// Separate named contracts make it harder for either queue route to silently
// drop its file-local loudness options during future refactors.
export const appendInsertedMpvQueueEntry = appendMpvQueueEntry;
export const appendAutoNextMpvQueueEntry = appendMpvQueueEntry;
