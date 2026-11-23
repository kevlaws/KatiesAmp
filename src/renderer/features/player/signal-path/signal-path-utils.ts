type PlaybackEngine = 'dlna' | 'jukebox' | 'local' | 'web';

export const linearGainToDecibels = (multiplier: number): null | number => {
    if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
    return 20 * Math.log10(multiplier);
};

export const formatDecibels = (decibels: null | number): string => {
    if (decibels === null || !Number.isFinite(decibels)) return 'Unavailable';
    const normalized = Math.abs(decibels) < 0.05 ? 0 : decibels;
    return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(1)} dB`;
};

export const formatSampleRate = (sampleRate: null | number | undefined): string => {
    if (!sampleRate || !Number.isFinite(sampleRate)) return 'Unavailable';
    const kiloHertz = sampleRate / 1000;
    return `${Number.isInteger(kiloHertz) ? kiloHertz : kiloHertz.toFixed(1)} kHz`;
};

export const formatChannels = (channels: null | number | undefined): string => {
    if (!channels || !Number.isFinite(channels)) return 'Unavailable';
    if (channels === 1) return 'Mono';
    if (channels === 2) return 'Stereo';
    return `${channels} channels`;
};

export const describePlaybackEngine = (playbackType: PlaybackEngine): string => {
    switch (playbackType) {
        case 'dlna':
            return 'Remote DLNA device';
        case 'jukebox':
            return 'Jellyfin jukebox';
        case 'local':
            return 'Local mpv / FFmpeg decoder';
        case 'web':
            return 'Chromium media decoder';
        default:
            return 'Unavailable';
    }
};

export const describeOutputSampleFormat = (
    playbackType: PlaybackEngine,
    webAudioActive: boolean,
): string => {
    if (playbackType === 'web' && webAudioActive) return '32-bit float (Web Audio)';
    return 'Unavailable';
};

export const describeResampling = (
    sourceSampleRate: null | number | undefined,
    outputSampleRate: null | number | undefined,
): string => {
    if (!sourceSampleRate || !outputSampleRate) return 'Unavailable';
    if (sourceSampleRate === outputSampleRate)
        return `No resampling (${formatSampleRate(outputSampleRate)})`;
    return `${formatSampleRate(sourceSampleRate)} to ${formatSampleRate(outputSampleRate)}`;
};
