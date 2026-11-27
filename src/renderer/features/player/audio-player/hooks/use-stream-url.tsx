import { useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useEffect, useRef } from 'react';

import { api } from '/@/renderer/api';
import { readStreamTrackGain } from '/@/renderer/features/player/audio-player/utils/stream-track-gain';
import { TranscodingConfig } from '/@/renderer/store';
import { QueueSong } from '/@/shared/types/domain-types';
import { ServerType } from '/@/shared/types/types';

export type SongSource = { trackGainDB?: number; url: string | undefined };

type SourceOptions = {
    allowOffline?: boolean;
    forRenderer?: boolean;
    readTrackGain?: boolean;
    skipAutoTranscode?: boolean;
    startTime?: number;
};

export function useSongSource(
    song: QueueSong | undefined,
    current: boolean,
    transcode: Partial<TranscodingConfig>,
    readTrackGain = true,
): SongSource | undefined {
    const prior = useRef<undefined | { id: string; source: SongSource }>(undefined);
    const shouldReusePrior = Boolean(
        song?._serverId &&
        current &&
        prior.current?.id === song._uniqueId &&
        prior.current?.source.url,
    );

    const { data: queryStreamUrl } = useQuery({
        enabled: Boolean(song?._serverId) && !shouldReusePrior,
        networkMode: 'always',
        queryFn: () => getSongSource(song!, transcode, { forRenderer: true, readTrackGain }),
        queryKey: [
            song?._serverId,
            'stream-url',
            song?.id,
            song?._uniqueId,
            readTrackGain,
            shouldReusePrior ? 'reuse-prior' : transcode.bitrate,
            shouldReusePrior ? 'reuse-prior' : transcode.format,
            shouldReusePrior ? 'reuse-prior' : transcode.maxSampleRate,
            shouldReusePrior ? 'reuse-prior' : transcode.enabled,
        ] as const,
        staleTime: 60 * 1000,
    });

    useEffect(() => {
        if (!song?._serverId) {
            prior.current = undefined;
            return;
        }

        if (!queryStreamUrl) {
            return;
        }

        // Save resolved URL to avoid restarting current track on transcode setting changes.
        prior.current = { id: song._uniqueId, source: queryStreamUrl };
    }, [song?._serverId, song?._uniqueId, queryStreamUrl]);

    return shouldReusePrior ? prior.current?.source : queryStreamUrl;
}

export const getSongSource = async (
    song: QueueSong,
    transcode: Partial<TranscodingConfig>,
    {
        allowOffline = true,
        forRenderer,
        readTrackGain = true,
        skipAutoTranscode,
        startTime,
    }: SourceOptions = {},
): Promise<SongSource> => {
    const readFileGain = readTrackGain && song._serverType === ServerType.JELLYFIN;
    if (allowOffline && isElectron()) {
        const source = await window.api.offline.resolve(song._serverId, song.id, readFileGain);
        if (source)
            return {
                trackGainDB: source.trackGainDB,
                url: forRenderer ? source.url : source.filePath,
            };
    }

    const url = await api.controller.getStreamUrl({
        apiClientProps: { serverId: song._serverId },
        query: {
            bitrate: transcode.bitrate,
            container: song.container,
            format: transcode.format,
            forRenderer,
            id: song.id,
            maxSampleRate: transcode.maxSampleRate,
            sampleRate: song.sampleRate,
            skipAutoTranscode,
            startTime,
            transcode: transcode.enabled ?? false,
        },
    });

    const container = (song.container || song.codec)?.toLowerCase();
    if (url && readFileGain && (container === 'mp3' || container === 'flac')) {
        const original = api.controller.getDownloadUrl({
            apiClientProps: { serverId: song._serverId },
            query: { id: song.id },
        });
        if (original) {
            const trackGainDB = await readStreamTrackGain(original, container);
            if (trackGainDB !== undefined) {
                // A stable Jellyfin URL may still have audio cached from before retagging.
                const playbackUrl = new URL(url);
                playbackUrl.searchParams.set('katiesAmpTrackGain', String(trackGainDB));
                return { trackGainDB, url: playbackUrl.href };
            }
        }
    }
    return { url };
};

// Remote renderers perform their own audio processing.
export const getSongUrl = async (
    song: QueueSong,
    transcode: Partial<TranscodingConfig>,
    skipAutoTranscode?: boolean,
    forRenderer?: boolean,
    startTime?: number,
    allowOffline = true,
) =>
    (
        await getSongSource(song, transcode, {
            allowOffline,
            forRenderer,
            readTrackGain: false,
            skipAutoTranscode,
            startTime,
        })
    ).url;
