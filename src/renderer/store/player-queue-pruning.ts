export type PruneUnavailableQueueInput = {
    currentIndex: number;
    defaultIds: string[];
    repeatAll: boolean;
    serverId: string;
    shuffledIndexes: number[];
    shuffleEnabled: boolean;
    songs: Record<string, QueueSongIdentity>;
    unavailableSongIds: string[];
};

export type PruneUnavailableQueueResult = {
    currentRemoved: boolean;
    defaultIds: string[];
    nextCurrentId?: string;
    nextCurrentIndex: number;
    removedUniqueIds: string[];
    shuffledIndexes: number[];
};

type QueueSongIdentity = {
    _serverId: string;
    id: string;
};

const getPlaybackIds = (
    defaultIds: string[],
    shuffledIndexes: number[],
    shuffleEnabled: boolean,
) => {
    if (!shuffleEnabled) return defaultIds;

    return shuffledIndexes
        .map((index) => defaultIds[index])
        .filter((id): id is string => id !== undefined);
};

const removeUnavailableIds = (
    defaultIds: string[],
    shuffledIndexes: number[],
    idsToRemove: string[],
) => {
    const removedIds = new Set(idsToRemove);
    const oldToNewIndexes = new Map<number, number>();
    const nextDefaultIds: string[] = [];

    defaultIds.forEach((id, oldIndex) => {
        if (!removedIds.has(id)) {
            oldToNewIndexes.set(oldIndex, nextDefaultIds.length);
            nextDefaultIds.push(id);
        }
    });

    return {
        defaultIds: nextDefaultIds,
        shuffledIndexes: shuffledIndexes
            .map((oldIndex) => oldToNewIndexes.get(oldIndex))
            .filter((index): index is number => index !== undefined),
    };
};

export function pruneUnavailableQueue({
    currentIndex,
    defaultIds,
    repeatAll,
    serverId,
    shuffledIndexes,
    shuffleEnabled,
    songs,
    unavailableSongIds,
}: PruneUnavailableQueueInput): PruneUnavailableQueueResult {
    const unavailableIds = new Set(unavailableSongIds);
    const removedUniqueIds = Object.entries(songs)
        .filter(([, song]) => song._serverId === serverId && unavailableIds.has(song.id))
        .map(([uniqueId]) => uniqueId);
    const removedIds = new Set(removedUniqueIds);
    const playbackBefore = getPlaybackIds(defaultIds, shuffledIndexes, shuffleEnabled);
    const currentId = playbackBefore[currentIndex];
    const currentRemoved = currentId !== undefined && removedIds.has(currentId);

    let nextCurrentId: string | undefined = currentId;
    if (currentRemoved) {
        nextCurrentId = playbackBefore
            .slice(currentIndex + 1)
            .find((uniqueId) => !removedIds.has(uniqueId));

        if (!nextCurrentId && repeatAll) {
            nextCurrentId = playbackBefore.find((uniqueId) => !removedIds.has(uniqueId));
        }
    }

    const nextOrder = removeUnavailableIds(defaultIds, shuffledIndexes, removedUniqueIds);
    const playbackAfter = getPlaybackIds(
        nextOrder.defaultIds,
        nextOrder.shuffledIndexes,
        shuffleEnabled,
    );
    const nextCurrentIndex = nextCurrentId ? playbackAfter.indexOf(nextCurrentId) : -1;

    return {
        currentRemoved,
        defaultIds: nextOrder.defaultIds,
        nextCurrentId,
        nextCurrentIndex,
        removedUniqueIds,
        shuffledIndexes: nextOrder.shuffledIndexes,
    };
}
