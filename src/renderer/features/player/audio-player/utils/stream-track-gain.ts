// Only inspect the original file's header, including when playback is transcoded.
// Bound the request so a slow server or an untagged file cannot hold up playback.
const HEADER_LIMIT = 1024 * 1024;

export async function readStreamTrackGain(
    url: string,
    container: string,
): Promise<number | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    let gain: number | undefined;
    try {
        const { parseWebStream } = await import('music-metadata');
        const response = await fetch(url, {
            cache: 'no-store',
            headers: { Range: `bytes=0-${HEADER_LIMIT - 1}` },
            signal: controller.signal,
        });
        const length = Number(response.headers.get('Content-Length'));
        if (
            !response.ok ||
            !response.body ||
            length > HEADER_LIMIT ||
            (response.status !== 206 && !(length > 0))
        )
            return undefined;

        await parseWebStream(
            response.body,
            {
                mimeType: container === 'flac' ? 'audio/flac' : 'audio/mpeg',
                size: length || HEADER_LIMIT,
            },
            {
                observer: ({ metadata, tag }) => {
                    if (tag.id !== 'replaygain_track_gain') return;
                    const value = metadata.common.replaygain_track_gain?.dB;
                    if (Number.isFinite(value)) {
                        gain = value;
                        controller.abort();
                    }
                },
                skipCovers: true,
                skipPostHeaders: true,
            },
        );
    } catch {
        // Also reached when the tag has been found and the remaining transfer cancelled.
    } finally {
        clearTimeout(timer);
        controller.abort();
    }
    return gain;
}
