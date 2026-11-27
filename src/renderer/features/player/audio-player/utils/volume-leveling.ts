export const VOLUME_LEVELING_MODE = {
    NATURAL: 'natural',
    OFF: 'off',
    TAVERN: 'tavern',
} as const;

export type CompressorParameters = {
    attack: number;
    knee: number;
    makeup: number;
    ratio: number;
    release: number;
    threshold: number;
};

export interface CompressorSettings extends CompressorParameters {
    enabled: boolean;
}

export interface EqBand {
    freq: number;
    gain: number;
}

export interface EqSettings {
    bands: EqBand[];
    enabled: boolean;
    preamp: number;
}

export type ReplayGainAdjustment = {
    adjustmentDB: number;
    multiplier: number;
    peakLimited: boolean;
    source: ReplayGainSource;
};

export type ReplayGainInfo = {
    album?: number;
    track?: number;
};

export type ReplayGainMode = 'album' | 'no' | 'track';

export type ReplayGainSource = 'album' | 'disabled' | 'fallback' | 'none' | 'track';

export type VenueOutputBoostDB = 3 | 6 | 12;

export type VolumeLevelingMode = (typeof VOLUME_LEVELING_MODE)[keyof typeof VOLUME_LEVELING_MODE];

export const VOLUME_LEVELING_MIGRATION_VERSION = 37;

type VolumeLevelingMigrationState = {
    playback: {
        mpvProperties: {
            replayGainClip: boolean;
            replayGainMode: ReplayGainMode;
        };
        volumeLevelingMode: VolumeLevelingMode;
    };
};

export const migrateVolumeLevelingSettings = (
    state: VolumeLevelingMigrationState,
    version: number,
): void => {
    if (version >= VOLUME_LEVELING_MIGRATION_VERSION) return;

    state.playback.volumeLevelingMode = VOLUME_LEVELING_MODE.NATURAL;
    state.playback.mpvProperties.replayGainMode = 'track';
    state.playback.mpvProperties.replayGainClip = true;
};

export const TAVERN_LEVELER: CompressorParameters = {
    attack: 50,
    knee: 6,
    makeup: 2,
    ratio: 1.5,
    release: 500,
    threshold: -15,
};

export const OUTPUT_LIMITER: CompressorParameters = {
    attack: 3,
    knee: 0,
    makeup: 0,
    ratio: 20,
    release: 100,
    threshold: -1,
};

export const decibelsToLinear = (decibels: number): number => 10 ** (decibels / 20);

export const linearToDecibels = (linear: number): number =>
    linear > 0 && Number.isFinite(linear) ? 20 * Math.log10(linear) : 0;

export const isVolumeLevelingEnabled = (mode: VolumeLevelingMode): boolean =>
    mode !== VOLUME_LEVELING_MODE.OFF;

export const getReplayGainMode = (mode: VolumeLevelingMode): ReplayGainMode =>
    isVolumeLevelingEnabled(mode) ? 'track' : 'no';

export const getVolumeLevelerParameters = (
    mode: VolumeLevelingMode,
): CompressorParameters | null => (mode === VOLUME_LEVELING_MODE.TAVERN ? TAVERN_LEVELER : null);

export const shouldEnableOutputLimiter = (
    mode: VolumeLevelingMode,
    compressorEnabled: boolean,
    venueOutputBoostDB = 0,
): boolean => isVolumeLevelingEnabled(mode) || compressorEnabled || venueOutputBoostDB > 0;

export const configureCompressorNode = (
    node: DynamicsCompressorNode,
    parameters: CompressorParameters | null,
) => {
    if (parameters) {
        node.threshold.value = parameters.threshold;
        node.ratio.value = parameters.ratio;
        node.attack.value = parameters.attack / 1000;
        node.release.value = parameters.release / 1000;
        node.knee.value = parameters.knee;
        return;
    }

    node.threshold.value = 0;
    node.ratio.value = 1;
    node.attack.value = 0;
    node.release.value = 0.25;
    node.knee.value = 0;
};

export const resolveReplayGainAdjustment = ({
    clip,
    fallbackDB,
    gainInfo,
    mode,
    peakInfo,
    preampDB,
}: {
    clip: boolean;
    fallbackDB?: number;
    gainInfo?: null | ReplayGainInfo;
    mode: ReplayGainMode;
    peakInfo?: null | ReplayGainInfo;
    preampDB?: number;
}): ReplayGainAdjustment => {
    if (mode === 'no') {
        return {
            adjustmentDB: 0,
            multiplier: 1,
            peakLimited: false,
            source: 'disabled',
        };
    }

    const preferTrack = mode === 'track';
    const gainCandidates: Array<[number | undefined, ReplayGainSource]> = preferTrack
        ? [
              [gainInfo?.track, 'track'],
              [gainInfo?.album, 'album'],
              [fallbackDB, 'fallback'],
          ]
        : [
              [gainInfo?.album, 'album'],
              [gainInfo?.track, 'track'],
              [fallbackDB, 'fallback'],
          ];
    const resolvedGain = gainCandidates.find(([value]) => Number.isFinite(value));

    if (!resolvedGain) {
        return {
            adjustmentDB: 0,
            multiplier: 1,
            peakLimited: false,
            source: 'none',
        };
    }

    const [gain, source] = resolvedGain as [number, ReplayGainSource];
    const peakCandidates = preferTrack
        ? [peakInfo?.track, peakInfo?.album]
        : [peakInfo?.album, peakInfo?.track];
    const peak = peakCandidates.find(
        (value): value is number => Number.isFinite(value) && (value ?? 0) > 0,
    );

    const expectedGain = decibelsToLinear(gain + (preampDB ?? 0));
    if (!Number.isFinite(expectedGain)) {
        return {
            adjustmentDB: 0,
            multiplier: 1,
            peakLimited: false,
            source: 'none',
        };
    }

    // Only use peak-based clipping prevention when the server supplied a real
    // peak value. Jellyfin usually supplies LUFS gain without peak metadata, so
    // treating an unknown peak as 1 would prevent quiet tracks from being raised.
    if (clip && peak !== undefined && Number.isFinite(peak) && peak > 0) {
        const multiplier = Math.min(expectedGain, 1 / peak);
        return {
            adjustmentDB: linearToDecibels(multiplier),
            multiplier,
            peakLimited: multiplier < expectedGain,
            source,
        };
    }

    return {
        adjustmentDB: linearToDecibels(expectedGain),
        multiplier: expectedGain,
        peakLimited: false,
        source,
    };
};

export const calculateReplayGainMultiplier = (
    options: Parameters<typeof resolveReplayGainAdjustment>[0],
): number => resolveReplayGainAdjustment(options).multiplier;

export const buildMpvVolumeLevelingFilters = (
    mode: VolumeLevelingMode,
    compressorEnabled: boolean,
    venueOutputBoostDB?: VenueOutputBoostDB,
): string[] => {
    const filters: string[] = [];
    const leveler = getVolumeLevelerParameters(mode);

    if (leveler) {
        filters.push(
            `lavfi=[acompressor=` +
                `threshold=${decibelsToLinear(leveler.threshold).toFixed(6)}:` +
                `ratio=${leveler.ratio}:` +
                `attack=${leveler.attack}:` +
                `release=${leveler.release}:` +
                `makeup=${decibelsToLinear(leveler.makeup).toFixed(6)}:` +
                `knee=${leveler.knee}` +
                `]`,
        );
    }

    // Venue gain is deliberately before the final limiter. The selected boost is
    // predictable, while the last stage still catches peaks produced by any
    // combination of normalisation, EQ, compression, and venue gain.
    if (venueOutputBoostDB !== undefined) {
        filters.push(`volume=${venueOutputBoostDB}dB`);
    }

    if (shouldEnableOutputLimiter(mode, compressorEnabled, venueOutputBoostDB)) {
        filters.push(
            `lavfi=[alimiter=` +
                `limit=${decibelsToLinear(OUTPUT_LIMITER.threshold).toFixed(6)}:` +
                `attack=${OUTPUT_LIMITER.attack}:` +
                `release=${OUTPUT_LIMITER.release}:` +
                `level=false:` +
                `latency=true` +
                `]`,
        );
    }

    return filters;
};

const MPV_EQ_BAND_WIDTHS: Record<number, number> = {
    31.5: 1.9,
    63: 1.3,
    125: 1,
    250: 1,
    500: 1,
    1000: 1,
    2000: 1,
    3000: 1,
    4000: 1,
    6300: 1.2,
    10000: 1.2,
    16000: 1.5,
};

export const buildMpvAudioFilters = (
    eq: EqSettings,
    compressor: CompressorSettings,
    volumeLevelingMode: VolumeLevelingMode = VOLUME_LEVELING_MODE.OFF,
    venueOutputBoostDB: VenueOutputBoostDB = 3,
    trackNormalizationDB = 0,
): string => {
    const filters: string[] = [];

    if (Number.isFinite(trackNormalizationDB) && Math.abs(trackNormalizationDB) > 0.000001) {
        filters.push(`volume=${trackNormalizationDB.toFixed(6)}dB`);
    }

    if (eq.enabled) {
        if (eq.preamp !== 0) {
            filters.push(`volume=${eq.preamp}dB`);
        }

        for (const band of eq.bands) {
            if (band.gain === 0) continue;
            const width = MPV_EQ_BAND_WIDTHS[band.freq] ?? 1;
            filters.push(`lavfi=[equalizer=f=${band.freq}:width_type=o:w=${width}:g=${band.gain}]`);
        }
    }

    if (compressor.enabled) {
        filters.push(
            `lavfi=[acompressor=` +
                `threshold=${decibelsToLinear(compressor.threshold).toFixed(6)}:` +
                `ratio=${compressor.ratio}:` +
                `attack=${compressor.attack}:` +
                `release=${compressor.release}:` +
                `makeup=${decibelsToLinear(compressor.makeup).toFixed(6)}:` +
                `knee=${compressor.knee}` +
                `]`,
        );
    }

    filters.push(
        ...buildMpvVolumeLevelingFilters(
            volumeLevelingMode,
            compressor.enabled,
            venueOutputBoostDB,
        ),
    );

    return filters.join(',');
};

export type MpvTrackAudioConfiguration = {
    adjustment: ReplayGainAdjustment;
    audioFilters: string;
    loadOptions: string[];
    replayGainMode: ReplayGainMode;
};

/**
 * Builds the complete, file-local MPV audio configuration for one queue entry.
 * Prefer the resolved file gain. MPV can read ReplayGain itself if the
 * application could resolve neither file nor catalogue gain.
 */
export const buildMpvTrackAudioConfiguration = ({
    clip,
    compressor,
    equalizer,
    gainInfo,
    peakInfo,
    preampDB,
    venueOutputBoostDB,
    volumeLevelingMode,
}: {
    clip: boolean;
    compressor: CompressorSettings;
    equalizer: EqSettings;
    gainInfo?: null | ReplayGainInfo;
    peakInfo?: null | ReplayGainInfo;
    preampDB?: number;
    venueOutputBoostDB: VenueOutputBoostDB;
    volumeLevelingMode: VolumeLevelingMode;
}): MpvTrackAudioConfiguration => {
    const requestedReplayGainMode = getReplayGainMode(volumeLevelingMode);
    const adjustment = resolveReplayGainAdjustment({
        clip,
        // When server metadata is unavailable, MPV remains responsible for
        // reading embedded ReplayGain and applying its configured fallback.
        // Baking fallbackDB into the filter here would incorrectly override a
        // valid tag that only MPV can see.
        fallbackDB: undefined,
        gainInfo,
        mode: requestedReplayGainMode,
        peakInfo,
        preampDB,
    });
    const replayGainMode =
        adjustment.source === 'none' ? requestedReplayGainMode : ('no' as ReplayGainMode);
    const audioFilters = buildMpvAudioFilters(
        equalizer,
        compressor,
        volumeLevelingMode,
        venueOutputBoostDB,
        adjustment.adjustmentDB,
    );

    return {
        adjustment,
        audioFilters,
        loadOptions: [`af=${audioFilters}`, `replaygain=${replayGainMode}`],
        replayGainMode,
    };
};
