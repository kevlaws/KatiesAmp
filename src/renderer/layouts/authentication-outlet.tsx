import { useQueryClient } from '@tanstack/react-query';
import { Outlet } from 'react-router';

import { useAutomaticAlbumDownloads } from '/@/renderer/features/offline/hooks/use-automatic-album-downloads';
import { useOfflinePlaylistSync } from '/@/renderer/features/playlists/hooks/use-offline-playlist-sync';
import { useServerLibraryAccessSync } from '/@/renderer/features/shared/hooks/use-server-library-controls';
import { useServerAuthenticated } from '/@/renderer/hooks/use-server-authenticated';
import { useCurrentServerId, useIsAdmin } from '/@/renderer/store';
import { useAutomaticAlbumDownloadSettings } from '/@/renderer/store/settings.store';
import { Center } from '/@/shared/components/center/center';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { AuthState } from '/@/shared/types/types';

export const AuthenticationOutlet = () => {
    const authState = useServerAuthenticated();
    const automaticAlbumDownloads = useAutomaticAlbumDownloadSettings();
    const queryClient = useQueryClient();
    const serverId = useCurrentServerId();
    const { userId } = useIsAdmin();
    useAutomaticAlbumDownloads({
        enabled: authState === AuthState.VALID && automaticAlbumDownloads.enabled,
        endTime: automaticAlbumDownloads.endTime,
        queryClient,
        serverId,
        startTime: automaticAlbumDownloads.startTime,
        userId,
    });
    useOfflinePlaylistSync(authState === AuthState.VALID, queryClient, serverId);
    useServerLibraryAccessSync(authState === AuthState.VALID);

    if (authState === AuthState.LOADING) {
        return (
            <Center h="100vh" w="100%">
                <Spinner container />
            </Center>
        );
    }

    return <Outlet />;
};
