import type { AutomaticDownloadWindow } from './automatic-download-window';

const DEVICE_ID_KEY = 'katiesamp-automatic-download-device-id';
const REMOVAL_PREFIX = 'katiesamp-automatic-album-removed';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const removalKey = (serverId: string, userId: null | string | undefined, albumId: string) =>
    `${REMOVAL_PREFIX}:${encodeURIComponent(JSON.stringify([serverId, userId || '', albumId]))}`;

export const getAutomaticDownloadDeviceId = (storage: StorageLike): string => {
    const existing = storage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const deviceId = crypto.randomUUID();
    storage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
};

export const suppressAutomaticAlbumForCurrentWindow = (
    storage: StorageLike,
    serverId: string,
    userId: null | string | undefined,
    albumId: string,
    removedAt = new Date(),
): void => {
    storage.setItem(removalKey(serverId, userId, albumId), removedAt.toISOString());
};

export const isAutomaticAlbumSuppressedForWindow = (
    storage: StorageLike,
    serverId: string,
    userId: null | string | undefined,
    albumId: string,
    window: AutomaticDownloadWindow,
): boolean => {
    const value = storage.getItem(removalKey(serverId, userId, albumId));
    if (!value) return false;

    const removedAt = new Date(value);
    if (Number.isNaN(removedAt.getTime())) return false;

    return removedAt >= window.startAt && removedAt < window.endAt;
};
