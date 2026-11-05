import type { QueryClient } from '@tanstack/react-query';

import isElectron from 'is-electron';
import { useEffect } from 'react';

import { api } from '/@/renderer/api';
import { refreshOfflineDownloads } from '/@/renderer/features/offline/offline-download.store';
import {
    getAutomaticDownloadDeviceId,
    isAutomaticAlbumSuppressedForWindow,
} from '/@/renderer/features/offline/utils/automatic-album-download-state';
import { loadAutomaticAlbumInventory } from '/@/renderer/features/offline/utils/automatic-album-inventory';
import { createAutomaticDownloadWindowScheduler } from '/@/renderer/features/offline/utils/automatic-download-window';
import { usePlayerStoreBase } from '/@/renderer/store/player.store';
import { logger } from '/@/renderer/utils/logger';
import { LibraryItem } from '/@/shared/types/domain-types';

type UseAutomaticAlbumDownloadsOptions = {
    enabled: boolean;
    endTime: string;
    queryClient: QueryClient;
    serverId: string;
    startTime: string;
    userId?: null | string;
};

const cancelAutomaticDownloads = async (serverId: string) => {
    const tasks = await window.api.offline.listDownloadTasks();
    const activeTasks = tasks.filter(
        (task) =>
            task.automatic &&
            task.serverId === serverId &&
            (task.state === 'downloading' || task.state === 'queued'),
    );
    await Promise.all(activeTasks.map((task) => window.api.offline.cancelDownload(task.id)));
};

export const useAutomaticAlbumDownloads = ({
    enabled,
    endTime,
    queryClient,
    serverId,
    startTime,
    userId,
}: UseAutomaticAlbumDownloadsOptions) => {
    useEffect(() => {
        if (!enabled || !isElectron() || !serverId) return;

        let disposed = false;
        const deviceId = `${getAutomaticDownloadDeviceId(window.localStorage)}:${serverId}`;
        const scheduler = createAutomaticDownloadWindowScheduler({
            deviceId,
            endTime,
            onError: (error) => {
                logger.warn('Automatic album download window failed', { error, serverId });
            },
            onWindowClose: () => {
                void cancelAutomaticDownloads(serverId).catch((error) => {
                    logger.warn('Failed to stop automatic album downloads', { error, serverId });
                });
            },
            onWindowOpen: async (downloadWindow, signal) => {
                logger.info('Automatic album download window opened', {
                    endAt: downloadWindow.endAt.toISOString(),
                    offsetMinutes: downloadWindow.offsetMinutes,
                    serverId,
                    startAt: downloadWindow.startAt.toISOString(),
                });

                const inventory = await loadAutomaticAlbumInventory({
                    client: api.controller,
                    serverId,
                    signal,
                });
                let attempted = false;

                for (const { album, tracks } of inventory.items) {
                    if (disposed || signal.aborted) break;
                    if (
                        isAutomaticAlbumSuppressedForWindow(
                            window.localStorage,
                            serverId,
                            userId,
                            album.id,
                            downloadWindow,
                        )
                    ) {
                        continue;
                    }

                    attempted = true;
                    try {
                        const result = await window.api.offline.syncAlbum({
                            album: {
                                automatic: true,
                                id: album.id,
                                name: album.name,
                                serverId,
                            },
                            silent: true,
                            tracks: tracks.map((song) => ({
                                song,
                                url: api.controller.getDownloadUrl({
                                    apiClientProps: { serverId },
                                    query: { id: song.id },
                                }),
                            })),
                        });
                        usePlayerStoreBase
                            .getState()
                            .removeUnavailableSongs(serverId, result.removedSongIds, {
                                id: album.id,
                                type: LibraryItem.ALBUM,
                            });
                        if (result.downloaded || result.removed) {
                            logger.info('Automatic album synchronized', {
                                albumId: album.id,
                                downloaded: result.downloaded,
                                removed: result.removed,
                                serverId,
                            });
                        }
                    } catch (error) {
                        if (signal.aborted) break;
                        logger.warn('Automatic album synchronization failed', {
                            albumId: album.id,
                            error,
                            serverId,
                        });
                    }
                }

                if (!disposed && attempted) {
                    await Promise.all([
                        refreshOfflineDownloads(),
                        queryClient.invalidateQueries({
                            queryKey: [serverId, 'offline-status'],
                        }),
                        queryClient.invalidateQueries({
                            queryKey: [serverId, 'offline-album-status'],
                        }),
                    ]);
                }
            },
            startTime,
        });

        const refreshSchedule = () => scheduler.refresh();
        const handleVisibilityChange = () => {
            if (!document.hidden) scheduler.refresh();
        };
        window.addEventListener('focus', refreshSchedule);
        window.addEventListener('online', refreshSchedule);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        scheduler.start();

        return () => {
            disposed = true;
            scheduler.dispose();
            window.removeEventListener('focus', refreshSchedule);
            window.removeEventListener('online', refreshSchedule);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [enabled, endTime, queryClient, serverId, startTime, userId]);
};
