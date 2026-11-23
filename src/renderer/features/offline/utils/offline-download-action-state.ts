export type OfflineCollectionActionKind =
    | 'download'
    | 'download-remaining'
    | 'downloading'
    | 'remove'
    | 'retry-remaining';

export type OfflineCollectionActionState = {
    downloaded: number;
    kind: OfflineCollectionActionKind;
    progress: number;
    remaining: number;
    total: number;
};

export type OfflineCollectionDownloadStatus = {
    downloaded: number;
    progress: number;
    state: 'complete' | 'downloading' | 'error' | 'none' | 'partial';
    total: number;
};

const clampCount = (value: number) => Math.max(0, Math.floor(value));
const clampProgress = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

export const combineOfflineCollectionDownloadStatuses = (
    statuses: OfflineCollectionDownloadStatus[],
): OfflineCollectionDownloadStatus => {
    const downloaded = statuses.reduce((sum, status) => sum + clampCount(status.downloaded), 0);
    const total = statuses.reduce((sum, status) => sum + clampCount(status.total), 0);
    const weightedProgress = statuses.reduce(
        (sum, status) => sum + clampProgress(status.progress) * clampCount(status.total),
        0,
    );
    const state = statuses.some((status) => status.state === 'downloading')
        ? 'downloading'
        : statuses.some((status) => status.state === 'error')
          ? 'error'
          : statuses.length > 0 && statuses.every((status) => status.state === 'complete')
            ? 'complete'
            : downloaded > 0
              ? 'partial'
              : 'none';

    return {
        downloaded,
        progress: total > 0 ? Math.round(weightedProgress / total) : 0,
        state,
        total,
    };
};

export const getOfflineCollectionActionState = (
    status: OfflineCollectionDownloadStatus,
): OfflineCollectionActionState => {
    const total = clampCount(status.total);
    const downloaded = Math.min(total || Number.MAX_SAFE_INTEGER, clampCount(status.downloaded));
    const remaining = Math.max(0, total - downloaded);
    const progress = clampProgress(status.progress);

    switch (status.state) {
        case 'complete':
            return { downloaded, kind: 'remove', progress: 100, remaining: 0, total };
        case 'downloading':
            return { downloaded, kind: 'downloading', progress, remaining, total };
        case 'error':
            return { downloaded, kind: 'retry-remaining', progress, remaining, total };
        case 'partial':
            return { downloaded, kind: 'download-remaining', progress, remaining, total };
        default:
            return { downloaded: 0, kind: 'download', progress: 0, remaining: total, total };
    }
};
