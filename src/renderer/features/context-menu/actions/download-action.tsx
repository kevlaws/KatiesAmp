import { useQuery, useQueryClient } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { Fragment, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shallow } from 'zustand/shallow';

import { api } from '/@/renderer/api';
import {
    getOfflineItemStatus,
    refreshOfflineDownloads,
    useOfflineDownloadStore,
} from '/@/renderer/features/offline/offline-download.store';
import { suppressAutomaticAlbumForCurrentWindow } from '/@/renderer/features/offline/utils/automatic-album-download-state';
import {
    combineOfflineCollectionDownloadStatuses,
    getOfflineCollectionActionState,
} from '/@/renderer/features/offline/utils/offline-download-action-state';
import {
    getAlbumArtistSongsById,
    getAlbumSongsById,
    getArtistSongsById,
    getPlaylistSongsById,
    getSongsByFolder,
} from '/@/renderer/features/player/utils';
import { useCurrentServer } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { Album, LibraryItem, Playlist, Song } from '/@/shared/types/domain-types';

interface DownloadActionProps {
    items: { _serverId?: string; id: string; name?: string; songCount?: null | number }[];
    itemType: LibraryItem;
}

const songItemTypes = new Set([
    LibraryItem.PLAYLIST_SONG,
    LibraryItem.QUEUE_SONG,
    LibraryItem.SONG,
]);

export const useDownloadAction = ({ items, itemType }: DownloadActionProps) => {
    const { t } = useTranslation();
    const server = useCurrentServer();
    const queryClient = useQueryClient();
    const [isPending, setIsPending] = useState(false);
    const isAlbumSelection = itemType === LibraryItem.ALBUM;
    const isSongSelection = songItemTypes.has(itemType);
    const isPlaylistSelection = itemType === LibraryItem.PLAYLIST;
    const isCollectionSelection = isAlbumSelection || isPlaylistSelection;
    const collectionStatus = useOfflineDownloadStore(
        (state) =>
            combineOfflineCollectionDownloadStatuses(
                isCollectionSelection
                    ? items.map((item) =>
                          getOfflineItemStatus(
                              state,
                              { ...item, _serverId: item._serverId ?? server.id },
                              itemType,
                          ),
                      )
                    : [],
            ),
        shallow,
    );
    const collectionAction = getOfflineCollectionActionState(collectionStatus);
    const offlineStatusQuery = useQuery({
        enabled: isElectron() && isSongSelection && items.length > 0,
        queryFn: async () => {
            const sources = await Promise.all(
                items.map((item) => window.api.offline.resolve(server.id, item.id)),
            );
            return sources.every(Boolean);
        },
        queryKey: [server.id, 'offline-status', ...items.map((item) => item.id)],
    });

    const resolveSongs = useCallback(async (): Promise<Song[]> => {
        if (songItemTypes.has(itemType)) return items as Song[];

        const ids = items.map((item) => item.id);
        if (itemType === LibraryItem.ALBUM) {
            const response = await getAlbumSongsById({
                id: ids,
                queryClient,
                serverId: server.id,
            });
            return response?.items ?? [];
        }
        if (itemType === LibraryItem.PLAYLIST) {
            const responses = await Promise.all(
                ids.map((id) => getPlaylistSongsById({ id, queryClient, serverId: server.id })),
            );
            return responses.flatMap((response) => response?.items ?? []);
        }
        if (itemType === LibraryItem.ALBUM_ARTIST) {
            const response = await getAlbumArtistSongsById({
                id: ids,
                queryClient,
                serverId: server.id,
            });
            return response?.items ?? [];
        }
        if (itemType === LibraryItem.ARTIST) {
            const response = await getArtistSongsById({
                id: ids,
                queryClient,
                serverId: server.id,
            });
            return response?.items ?? [];
        }
        if (itemType === LibraryItem.FOLDER) {
            return (await getSongsByFolder({ id: ids, queryClient, serverId: server.id })).items;
        }

        return [];
    }, [itemType, items, queryClient, server.id]);

    const removeCollectionDownload = useCallback(async () => {
        const collectionType = isAlbumSelection ? 'album' : 'playlist';
        const collectionIds = new Set(items.map((item) => item.id));
        const activeTasks = (await window.api.offline.listDownloadTasks()).filter(
            (task) =>
                task.serverId === server.id &&
                task.itemType === collectionType &&
                (task.state === 'downloading' || task.state === 'queued') &&
                task.itemIds.some((id) => collectionIds.has(id)),
        );
        await Promise.all(activeTasks.map((task) => window.api.offline.cancelDownload(task.id)));

        if (isPlaylistSelection) {
            await Promise.all(
                items.map((item) => window.api.offline.removePlaylist(server.id, item.id)),
            );
            await refreshOfflineDownloads();
            toast.success({
                message: t('action.offlinePlaylistRemoveComplete', {
                    defaultValue: 'Stopped keeping playlist offline',
                }),
            });
            return;
        }

        if (!isAlbumSelection) return;

        for (const item of items) {
            suppressAutomaticAlbumForCurrentWindow(
                window.localStorage,
                server.id,
                server.userId,
                item.id,
            );
        }
        await Promise.all(items.map((item) => window.api.offline.removeAlbum(server.id, item.id)));
        await refreshOfflineDownloads();
        toast.success({
            message: t('action.offlineAlbumRemoveComplete', {
                defaultValue: 'Stopped keeping album offline',
            }),
        });
    }, [isAlbumSelection, isPlaylistSelection, items, server.id, server.userId, t]);

    const onRemove = useCallback(async () => {
        if (isPending || !isElectron() || !isCollectionSelection) return;
        setIsPending(true);
        try {
            await removeCollectionDownload();
        } catch {
            toast.error({
                message: t('action.offlineRemoveFailed', {
                    defaultValue: 'Could not remove the offline download',
                }),
            });
        } finally {
            setIsPending(false);
        }
    }, [isCollectionSelection, isPending, removeCollectionDownload, t]);

    const onSelect = useCallback(async () => {
        if (isPending) return;
        setIsPending(true);

        try {
            if (!isElectron()) {
                for (const item of items) {
                    const downloadUrl = api.controller.getDownloadUrl({
                        apiClientProps: { serverId: server.id },
                        query: { id: item.id },
                    });
                    window.open(downloadUrl, '_blank');
                }
                return;
            }

            if (isSongSelection && offlineStatusQuery.data) {
                await Promise.all(
                    items.map((item) => window.api.offline.remove(server.id, item.id)),
                );
                await refreshOfflineDownloads();
                await offlineStatusQuery.refetch();
                toast.success({
                    message: t('action.offlineRemoveComplete', {
                        count: items.length,
                        defaultValue: 'Removed {{count}} offline item',
                    }),
                });
                return;
            }

            if (isCollectionSelection && collectionAction.kind === 'downloading') return;

            if (isCollectionSelection && collectionAction.kind === 'remove') {
                await removeCollectionDownload();
                return;
            }

            let downloaded = 0;
            if (isCollectionSelection) {
                const collectionType = isAlbumSelection ? 'album' : 'playlist';
                const itemIds = new Set(items.map((item) => item.id));
                const activeTask = (await window.api.offline.listDownloadTasks()).some(
                    (task) =>
                        task.serverId === server.id &&
                        task.itemType === collectionType &&
                        (task.state === 'downloading' || task.state === 'queued') &&
                        task.itemIds.some((id) => itemIds.has(id)),
                );
                if (activeTask) {
                    toast.info({
                        message: t('offline.downloadAlreadyRunning', {
                            defaultValue: 'This download is already in progress',
                        }),
                    });
                    return;
                }
            }

            if (isPlaylistSelection) {
                for (const playlist of items as Playlist[]) {
                    const response = await getPlaylistSongsById({
                        forceRefresh: true,
                        id: playlist.id,
                        queryClient,
                        serverId: server.id,
                    });
                    const songs = response?.items ?? [];
                    if (
                        !response ||
                        (response.totalRecordCount ?? songs.length) > songs.length ||
                        (collectionAction.remaining > 0 && songs.length === 0)
                    ) {
                        throw new Error('Playlist track inventory is incomplete');
                    }
                    const result = await window.api.offline.syncPlaylist({
                        playlist: { id: playlist.id, name: playlist.name, serverId: server.id },
                        preserveExisting: true,
                        tracks: songs.map((song) => ({
                            song,
                            url: api.controller.getDownloadUrl({
                                apiClientProps: { serverId: server.id },
                                query: { id: song.id },
                            }),
                        })),
                    });
                    downloaded += result.downloaded;
                }
                await refreshOfflineDownloads();
            } else if (isAlbumSelection) {
                for (const album of items as Album[]) {
                    const response = await getAlbumSongsById({
                        forceRefresh: true,
                        id: [album.id],
                        queryClient,
                        serverId: server.id,
                    });
                    const songs = response?.items ?? [];
                    if (
                        !response ||
                        (response.totalRecordCount ?? songs.length) > songs.length ||
                        (collectionAction.remaining > 0 && songs.length === 0)
                    ) {
                        throw new Error('Album track inventory is incomplete');
                    }
                    const result = await window.api.offline.syncAlbum({
                        album: { id: album.id, name: album.name, serverId: server.id },
                        preserveExisting: true,
                        tracks: songs.map((song) => ({
                            song,
                            url: api.controller.getDownloadUrl({
                                apiClientProps: { serverId: server.id },
                                query: { id: song.id },
                            }),
                        })),
                    });
                    downloaded += result.downloaded;
                }
                await refreshOfflineDownloads();
            } else {
                const songs = await resolveSongs();
                if (songs.length === 0) return;

                const itemName =
                    items.length === 1 && 'name' in items[0] && typeof items[0].name === 'string'
                        ? items[0].name
                        : t('offline.itemCount', {
                              count: songs.length,
                              defaultValue: '{{count}} tracks',
                          });
                await window.api.offline.downloadBatch({
                    item: {
                        ids: items.map((item) => item.id),
                        name: itemName,
                        serverId: server.id,
                        type: 'track',
                    },
                    tracks: songs.map((song) => ({
                        song,
                        url: api.controller.getDownloadUrl({
                            apiClientProps: { serverId: server.id },
                            query: { id: song.id },
                        }),
                    })),
                });
                await refreshOfflineDownloads();
                await offlineStatusQuery.refetch();
            }

            if (downloaded > 0) {
                toast.success({
                    message: t('offline.downloadedRemaining', {
                        count: downloaded,
                        defaultValue: 'Downloaded {{count}} remaining track',
                    }),
                });
            }
        } catch {
            toast.error({
                message: t('action.offlineDownloadFailed', {
                    defaultValue: 'Could not save items for offline playback',
                }),
            });
        } finally {
            setIsPending(false);
        }
    }, [
        isAlbumSelection,
        isCollectionSelection,
        isPending,
        isPlaylistSelection,
        isSongSelection,
        items,
        collectionAction.kind,
        collectionAction.remaining,
        offlineStatusQuery,
        queryClient,
        removeCollectionDownload,
        resolveSongs,
        server.id,
        t,
    ]);

    const isAvailableOffline =
        (isSongSelection && offlineStatusQuery.data) ||
        (isCollectionSelection && collectionAction.kind === 'remove');
    const remainingLabel =
        collectionAction.remaining > 0
            ? t('page.contextMenu.downloadRemaining', {
                  count: collectionAction.remaining,
                  defaultValue: 'Download remaining track ({{count}})',
              })
            : t('page.contextMenu.finishOfflineDownload', {
                  defaultValue: 'Finish offline download',
              });
    const retryLabel =
        collectionAction.remaining > 0
            ? t('page.contextMenu.retryRemaining', {
                  count: collectionAction.remaining,
                  defaultValue: 'Retry remaining track ({{count}})',
              })
            : t('offline.retry', { defaultValue: 'Retry' });
    const removeCollectionLabel = isPlaylistSelection
        ? t('page.contextMenu.stopOfflinePlaylistSync', {
              defaultValue: 'Stop keeping playlist offline',
          })
        : t('page.contextMenu.stopOfflineAlbumSync', {
              defaultValue: 'Stop keeping album offline',
          });
    const collectionLabel =
        collectionAction.kind === 'remove'
            ? removeCollectionLabel
            : collectionAction.kind === 'download-remaining'
              ? remainingLabel
              : collectionAction.kind === 'retry-remaining'
                ? retryLabel
                : collectionAction.kind === 'downloading'
                  ? t('offline.downloading', {
                        defaultValue: 'Downloading {{progress}}%',
                        progress: collectionAction.progress,
                    })
                  : isPlaylistSelection
                    ? t('page.contextMenu.keepPlaylistOffline', {
                          defaultValue: 'Keep playlist available offline',
                      })
                    : t('page.contextMenu.keepAlbumOffline', {
                          defaultValue: 'Keep album available offline',
                      });
    const compactLabel = isCollectionSelection
        ? collectionAction.kind === 'remove'
            ? t('page.contextMenu.removeOffline', {
                  defaultValue: 'Remove offline download',
              })
            : collectionAction.kind === 'download'
              ? t('page.contextMenu.download')
              : collectionLabel
        : isElectron() && isAvailableOffline
          ? t('page.contextMenu.removeOffline', {
                defaultValue: 'Remove offline download',
            })
          : t('page.contextMenu.download');
    const label = isCollectionSelection
        ? collectionLabel
        : isElectron() && offlineStatusQuery.data
          ? t('page.contextMenu.removeOffline', {
                defaultValue: 'Remove offline download',
            })
          : isElectron()
            ? t('page.contextMenu.downloadOffline', {
                  defaultValue: 'Download for offline use',
              })
            : t('page.contextMenu.download');
    const isDownloadPending = isPending || collectionAction.kind === 'downloading';
    const showRemoveAction =
        isCollectionSelection &&
        collectionAction.downloaded > 0 &&
        (collectionAction.kind === 'download-remaining' ||
            collectionAction.kind === 'retry-remaining');
    const removePartialLabel = t('page.contextMenu.removePartialOffline', {
        defaultValue: 'Remove downloaded tracks',
    });

    return {
        compactLabel,
        isAvailableOffline,
        isDownloadPending,
        isPending,
        label,
        onRemove,
        onSelect,
        removePartialLabel,
        showRemoveAction,
    };
};

export const DownloadAction = ({ items, itemType }: DownloadActionProps) => {
    const { isDownloadPending, label, onRemove, onSelect, removePartialLabel, showRemoveAction } =
        useDownloadAction({ items, itemType });

    if (items.length === 0) return null;

    return (
        <Fragment>
            <ContextMenu.Item disabled={isDownloadPending} leftIcon="download" onSelect={onSelect}>
                {label}
            </ContextMenu.Item>
            {showRemoveAction && (
                <ContextMenu.Item leftIcon="remove" onSelect={onRemove}>
                    {removePartialLabel}
                </ContextMenu.Item>
            )}
        </Fragment>
    );
};
