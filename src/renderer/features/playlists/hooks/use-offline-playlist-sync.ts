import type { OfflineAlbum, OfflinePlaylist } from '/@/shared/types/offline';
import type { QueryClient } from '@tanstack/react-query';

import isElectron from 'is-electron';
import { useEffect } from 'react';

import { api } from '/@/renderer/api';
import { refreshOfflineDownloads } from '/@/renderer/features/offline/offline-download.store';
import { createOfflineSyncScheduler } from '/@/renderer/features/offline/utils/offline-sync-scheduler';
import { getAlbumSongsById } from '/@/renderer/features/player/utils';
import { subscribePlayerStatus, usePlayerStoreBase } from '/@/renderer/store/player.store';
import { logger } from '/@/renderer/utils/logger';
import { LibraryItem, PlaylistSongListResponse, Song } from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

const syncing = new Set<string>();
const OFFLINE_SYNC_COOLDOWN_MS = 60 * 1000;

const syncTracks = async (playlist: OfflinePlaylist, songs: Song[], refreshSnapshot = false) => {
    const key = `playlist:${playlist.serverId}:${playlist.id}`;
    if (syncing.has(key)) return;
    syncing.add(key);

    try {
        const result = await window.api.offline.syncPlaylist({
            playlist,
            silent: true,
            tracks: songs.map((song) => ({
                song,
                url: api.controller.getDownloadUrl({
                    apiClientProps: { serverId: playlist.serverId },
                    query: { id: song.id },
                }),
            })),
        });
        usePlayerStoreBase
            .getState()
            .removeUnavailableSongs(playlist.serverId, result.removedSongIds, {
                id: playlist.id,
                type: LibraryItem.PLAYLIST,
            });
        if (result.downloaded || result.removed) {
            logger.info('Offline playlist synchronized', {
                downloaded: result.downloaded,
                playlistId: playlist.id,
                removed: result.removed,
                serverId: playlist.serverId,
            });
        }
    } finally {
        syncing.delete(key);
        if (refreshSnapshot) await refreshOfflineDownloads();
    }
};

const syncAlbumTracks = async (album: OfflineAlbum, songs: Song[]) => {
    const key = `album:${album.serverId}:${album.id}`;
    if (syncing.has(key)) return;
    syncing.add(key);

    try {
        const result = await window.api.offline.syncAlbum({
            album,
            silent: true,
            tracks: songs.map((song) => ({
                song,
                url: api.controller.getDownloadUrl({
                    apiClientProps: { serverId: album.serverId },
                    query: { id: song.id },
                }),
            })),
        });
        usePlayerStoreBase
            .getState()
            .removeUnavailableSongs(album.serverId, result.removedSongIds, {
                id: album.id,
                type: LibraryItem.ALBUM,
            });
        if (result.downloaded || result.removed) {
            logger.info('Offline album synchronized', {
                albumId: album.id,
                downloaded: result.downloaded,
                removed: result.removed,
                serverId: album.serverId,
            });
        }
    } finally {
        syncing.delete(key);
    }
};

export const syncManagedOfflinePlaylist = async (serverId: string, playlistId: string) => {
    if (!isElectron()) return;
    try {
        const playlist = (await window.api.offline.listPlaylists()).find(
            (item) => item.serverId === serverId && item.id === playlistId,
        );
        if (!playlist) return;

        const response = await api.controller.getPlaylistSongList({
            apiClientProps: { serverId },
            query: { id: playlistId },
        });
        await syncTracks(playlist, response.items, true);
    } catch (error) {
        logger.warn('Offline playlist synchronization failed', { error, playlistId, serverId });
    }
};

export const useOfflinePlaylistSync = (
    enabled: boolean,
    queryClient: QueryClient,
    serverId: string,
) => {
    useEffect(() => {
        if (!enabled || !isElectron() || !serverId) return;

        const syncAll = async () => {
            let attempted = false;
            try {
                const [albums, playlists] = await Promise.all([
                    window.api.offline.listAlbums(),
                    window.api.offline.listPlaylists(),
                ]);
                for (const playlist of playlists) {
                    if (playlist.serverId !== serverId) continue;
                    attempted = true;
                    try {
                        const response = await api.controller.getPlaylistSongList({
                            apiClientProps: { serverId },
                            query: { id: playlist.id },
                        });
                        await syncTracks(playlist, response.items);
                    } catch (error) {
                        logger.warn('Offline playlist synchronization failed', {
                            error,
                            playlistId: playlist.id,
                            serverId,
                        });
                    }
                }
                for (const album of albums) {
                    if (album.serverId !== serverId) continue;
                    attempted = true;
                    try {
                        const response = await getAlbumSongsById({
                            forceRefresh: true,
                            id: [album.id],
                            queryClient,
                            serverId,
                        });
                        await syncAlbumTracks(album, response.items);
                    } catch (error) {
                        logger.warn('Offline album synchronization failed', {
                            albumId: album.id,
                            error,
                            serverId,
                        });
                    }
                }
            } finally {
                if (attempted) {
                    await Promise.all([
                        refreshOfflineDownloads(),
                        queryClient.invalidateQueries({
                            queryKey: [serverId, 'offline-status'],
                        }),
                    ]);
                }
            }
            return attempted;
        };

        const scheduler = createOfflineSyncScheduler({
            cooldownMs: OFFLINE_SYNC_COOLDOWN_MS,
            isPlaying: () => usePlayerStoreBase.getState().player.status === PlayerStatus.PLAYING,
            onError: (error) => {
                logger.warn('Offline maintenance synchronization failed', { error, serverId });
            },
            runSync: syncAll,
        });

        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            const key = event.query.queryKey;
            if (
                event.type !== 'updated' ||
                event.action.type !== 'success' ||
                key[0] !== serverId ||
                key[1] !== 'playlists' ||
                key[2] !== 'songList' ||
                typeof key[3] !== 'string'
            ) {
                return;
            }

            const response = event.query.state.data as PlaylistSongListResponse | undefined;
            if (!response?.items) return;

            window.api.offline
                .listPlaylists()
                .then((playlists) =>
                    playlists.find(
                        (playlist) => playlist.serverId === serverId && playlist.id === key[3],
                    ),
                )
                .then((playlist) => playlist && syncTracks(playlist, response.items, true))
                .catch((error) =>
                    logger.warn('Offline playlist synchronization failed', {
                        error,
                        playlistId: key[3],
                        serverId,
                    }),
                );
        });

        const handleSync = () => void scheduler.request();
        const handleOnline = () => void scheduler.request({ immediate: true });
        const unsubscribePlayerStatus = subscribePlayerStatus(({ status }, previous) => {
            if (previous.status === PlayerStatus.PLAYING && status !== PlayerStatus.PLAYING) {
                scheduler.notifyPlaybackChanged();
            }
        });
        window.addEventListener('focus', handleSync);
        window.addEventListener('online', handleOnline);
        const interval = window.setInterval(handleSync, 15 * 60 * 1000);
        void scheduler.request({ immediate: true });

        return () => {
            scheduler.dispose();
            window.clearInterval(interval);
            unsubscribe();
            unsubscribePlayerStatus();
            window.removeEventListener('focus', handleSync);
            window.removeEventListener('online', handleOnline);
        };
    }, [enabled, queryClient, serverId]);
};
