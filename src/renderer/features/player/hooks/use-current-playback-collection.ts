import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { generatePath } from 'react-router';

import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import { AppRoute } from '/@/renderer/router/routes';
import {
    updateQueueAlbumContextName,
    updateQueuePlaylistContextName,
    usePlayerSong,
} from '/@/renderer/store';

export const useCurrentPlaybackCollection = () => {
    const currentSong = usePlayerSong();
    const serverId = currentSong?._serverId ?? '';
    const playlistId = currentSong?._contextPlaylistId ?? '';
    const albumId = currentSong?.albumId ?? '';

    const playlistQuery = useQuery({
        ...playlistsQueries.detail({ query: { id: playlistId }, serverId }),
        enabled: Boolean(serverId && playlistId),
    });
    const albumQuery = useQuery({
        ...albumQueries.detail({ query: { id: albumId }, serverId }),
        enabled: Boolean(serverId && albumId && !playlistId),
    });

    useEffect(() => {
        if (playlistId && playlistQuery.data?.name) {
            updateQueuePlaylistContextName(playlistId, playlistQuery.data.name);
        }
    }, [playlistId, playlistQuery.data?.name]);

    useEffect(() => {
        if (!playlistId && albumId && albumQuery.data?.name) {
            updateQueueAlbumContextName(albumId, albumQuery.data.name);
        }
    }, [albumId, albumQuery.data?.name, playlistId]);

    if (playlistId) {
        return {
            name: playlistQuery.data?.name || currentSong?._contextPlaylistName?.trim() || '-',
            to: generatePath(AppRoute.PLAYLISTS_DETAIL_SONGS, { playlistId }),
        };
    }

    if (albumId) {
        return {
            name: albumQuery.data?.name || currentSong?._contextAlbumName?.trim() || '-',
            to: generatePath(AppRoute.LIBRARY_ALBUMS_DETAIL, { albumId }),
        };
    }

    return { name: '-', to: '' };
};
