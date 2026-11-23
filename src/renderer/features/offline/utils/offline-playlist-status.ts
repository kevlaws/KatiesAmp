export type OfflinePlaylistStatusCounts = {
    complete: boolean;
    downloaded: number;
    total: number;
};

type OfflinePlaylistStatusInput = {
    currentTrackCount?: null | number;
    downloadedUniqueTracks: number;
    storedTrackCount?: number;
    storedUniqueTracks: number;
};

const clampCount = (value: number) => Math.max(0, Math.floor(value));

export const getOfflinePlaylistStatusCounts = ({
    currentTrackCount,
    downloadedUniqueTracks,
    storedTrackCount,
    storedUniqueTracks,
}: OfflinePlaylistStatusInput): OfflinePlaylistStatusCounts => {
    const downloaded = clampCount(downloadedUniqueTracks);
    const storedUnique = clampCount(storedUniqueTracks);
    const syncedPositions = Math.max(storedUnique, clampCount(storedTrackCount ?? storedUnique));
    const currentPositions = clampCount(currentTrackCount ?? syncedPositions);
    const unsyncedPositions = Math.max(0, currentPositions - syncedPositions);

    return {
        complete: currentPositions <= syncedPositions && downloaded >= storedUnique,
        downloaded,
        total: storedUnique + unsyncedPositions,
    };
};
