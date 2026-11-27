import { t as translate } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './signal-path-modal.module.css';
import {
    describeOutputSampleFormat,
    describePlaybackEngine,
    describeResampling,
    formatChannels,
    formatDecibels,
    formatSampleRate,
    linearGainToDecibels,
} from './signal-path-utils';

import { useOfflineItemStatus } from '/@/renderer/features/offline/offline-download.store';
import { useWebPlaybackSource } from '/@/renderer/features/player/audio-player/engine/web-player-engine';
import {
    supportsAudioSinkSelection,
    toAudioSinkId,
} from '/@/renderer/features/player/audio-player/utils/audio-output';
import {
    getReplayGainMode,
    OUTPUT_LIMITER,
    resolveReplayGainAdjustment,
    shouldEnableOutputLimiter,
    VOLUME_LEVELING_MODE,
} from '/@/renderer/features/player/audio-player/utils/volume-leveling';
import { useWebAudio } from '/@/renderer/features/player/hooks/use-webaudio';
import {
    usePlaybackSettings,
    usePlaybackType,
    usePlayerProperties,
    usePlayerSong,
} from '/@/renderer/store';
import { useMpvLoudnessTelemetry } from '/@/renderer/store/loudness-telemetry.store';
import { type AppIconSelection, Icon } from '/@/shared/components/icon/icon';
import { LibraryItem } from '/@/shared/types/domain-types';
import { PlayerStatus, PlayerStyle, PlayerType } from '/@/shared/types/types';

type SignalStageProps = {
    detail?: string;
    icon: AppIconSelection;
    label: string;
    unavailable?: boolean;
    value: string;
};

const SignalStage = ({ detail, icon, label, unavailable, value }: SignalStageProps) => (
    <div className={styles.stage}>
        <div className={styles.stageIcon}>
            <Icon icon={icon} size="md" />
        </div>
        <div className={styles.stageContent}>
            <div className={styles.stageLabel}>{label}</div>
            <div className={`${styles.stageValue} ${unavailable ? styles.unavailable : ''}`.trim()}>
                {value}
            </div>
            {detail && <div className={styles.stageDetail}>{detail}</div>}
        </div>
    </div>
);

const formatBitRate = (bitRate: null | number | undefined) =>
    bitRate && Number.isFinite(bitRate) ? `${Math.round(bitRate)} kbps` : 'Unavailable';

const formatBitDepth = (bitDepth: null | number | undefined) =>
    bitDepth && Number.isFinite(bitDepth) ? `${bitDepth}-bit` : 'Unavailable';

const SignalPathPanelContent = () => {
    const { t } = useTranslation();
    const song = usePlayerSong();
    const playbackType = usePlaybackType();
    const playback = usePlaybackSettings();
    const mpvLoudnessTelemetry = useMpvLoudnessTelemetry();
    const { crossfadeDuration, crossfadeStyle, playerNum, status, transitionType } =
        usePlayerProperties();
    const { webAudio } = useWebAudio();
    const webPlaybackSource = useWebPlaybackSource(
        playerNum,
        playbackType === PlayerType.WEB ? song?._uniqueId : undefined,
    );
    const offlineStatus = useOfflineItemStatus(song ?? { id: '' }, LibraryItem.SONG);
    const offlineCopyAvailable =
        (playbackType === PlayerType.LOCAL || playbackType === PlayerType.WEB) &&
        offlineStatus.downloaded > 0;
    const [limiterReduction, setLimiterReduction] = useState<null | number>(null);
    const [webTrackGainDB, setWebTrackGainDB] = useState<null | number>(null);
    const [fileTrackGainDB, setFileTrackGainDB] = useState<number | undefined>();

    const limiterEnabled = shouldEnableOutputLimiter(
        playback.volumeLevelingMode,
        playback.compressor.enabled,
        playback.venueOutputBoostDB,
    );

    useEffect(() => {
        const limiter = limiterEnabled ? webAudio?.dsp?.limiter : null;
        const trackGain =
            playbackType === PlayerType.WEB ? webAudio?.gains[playerNum - 1]?.gain : null;

        const readLiveTelemetry = () => {
            const reduction = limiter?.reduction;
            const multiplier = trackGain?.value;
            setLimiterReduction(
                reduction !== undefined && Number.isFinite(reduction) ? reduction : null,
            );
            setWebTrackGainDB(multiplier !== undefined ? linearGainToDecibels(multiplier) : null);
            const slot = document.getElementById(`web-player-${playerNum}`);
            const tag =
                webPlaybackSource && slot?.dataset.songUniqueId === song?._uniqueId
                    ? slot?.dataset.trackGainDb
                    : undefined;
            setFileTrackGainDB(tag === undefined ? undefined : Number(tag));
        };
        readLiveTelemetry();
        const interval = window.setInterval(readLiveTelemetry, 500);
        return () => window.clearInterval(interval);
    }, [limiterEnabled, playbackType, playerNum, song?._uniqueId, webAudio, webPlaybackSource]);

    const gainAdjustment = useMemo(() => {
        if (!song) return null;
        return resolveReplayGainAdjustment({
            clip: playback.mpvProperties.replayGainClip,
            fallbackDB: playback.mpvProperties.replayGainFallbackDB,
            gainInfo: { ...song.gain, track: fileTrackGainDB ?? song.gain?.track },
            mode: getReplayGainMode(playback.volumeLevelingMode),
            peakInfo: song.peak,
            preampDB: playback.mpvProperties.replayGainPreampDB,
        });
    }, [
        fileTrackGainDB,
        playback.mpvProperties.replayGainClip,
        playback.mpvProperties.replayGainFallbackDB,
        playback.mpvProperties.replayGainPreampDB,
        playback.volumeLevelingMode,
        song,
    ]);

    if (!song) {
        return <div className={styles.empty}>{t('page.signalPath.noTrack')}</div>;
    }

    const librarySourceFormat = (song.codec || song.container || 'Unknown format').toUpperCase();
    const librarySourceDetails = [
        formatBitRate(song.bitRate),
        formatSampleRate(song.sampleRate),
        formatBitDepth(song.bitDepth),
        formatChannels(song.channels),
    ].join(' · ');
    const transcodeTarget = playback.transcode.enabled
        ? [
              playback.transcode.format?.toUpperCase() || 'automatic format',
              playback.transcode.bitrate ? `${playback.transcode.bitrate} kbps` : null,
              playback.transcode.maxSampleRate
                  ? formatSampleRate(playback.transcode.maxSampleRate)
                  : null,
          ]
              .filter(Boolean)
              .join(' · ')
        : null;
    const playbackSource =
        playbackType === PlayerType.WEB
            ? webPlaybackSource
            : offlineCopyAvailable
              ? null
              : 'server';
    const sourceValue =
        playbackSource === 'offline'
            ? t('page.signalPath.offlineCopy')
            : playbackSource === 'server'
              ? t('page.signalPath.serverStream')
              : t('page.signalPath.sourceNotReported');
    const libraryDetails = `library source ${librarySourceFormat} · ${librarySourceDetails}`;
    const formatDetail =
        playbackSource === 'offline'
            ? libraryDetails
            : `Received format is not reported · ${transcodeTarget ? `configured target ${transcodeTarget}` : libraryDetails}`;
    const sourceDetails =
        offlineCopyAvailable && playbackSource !== 'offline'
            ? `${t('page.signalPath.offlineCopyAvailable')} · ${formatDetail}`
            : formatDetail;
    const levellingProfile =
        playback.volumeLevelingMode === VOLUME_LEVELING_MODE.OFF
            ? 'Off'
            : playback.volumeLevelingMode === VOLUME_LEVELING_MODE.TAVERN
              ? 'Tavern'
              : 'Natural';
    const currentMpvTelemetry =
        playbackType === PlayerType.LOCAL &&
        mpvLoudnessTelemetry?.songId === song.id &&
        (!mpvLoudnessTelemetry.songUniqueId || mpvLoudnessTelemetry.songUniqueId === song._uniqueId)
            ? mpvLoudnessTelemetry
            : null;
    const liveAdjustment =
        playbackType === PlayerType.LOCAL ? currentMpvTelemetry?.adjustment : gainAdjustment;
    const gainSourceLabel =
        liveAdjustment?.source === 'track'
            ? fileTrackGainDB !== undefined && playbackType === PlayerType.WEB
                ? 'embedded track tag'
                : 'track metadata'
            : liveAdjustment?.source === 'album'
              ? 'album metadata'
              : liveAdjustment?.source === 'fallback'
                ? 'configured fallback'
                : null;
    const appliedTrackGainDB =
        playbackType === PlayerType.WEB
            ? webTrackGainDB
            : playbackType === PlayerType.LOCAL
              ? (currentMpvTelemetry?.adjustment.adjustmentDB ?? null)
              : null;
    const dspRuntimeAvailable =
        (playbackType === PlayerType.WEB && Boolean(webAudio?.dsp)) ||
        (playbackType === PlayerType.LOCAL && Boolean(currentMpvTelemetry));
    const gainDetail =
        playback.volumeLevelingMode === VOLUME_LEVELING_MODE.OFF
            ? 'Track gain is bypassed.'
            : appliedTrackGainDB === null
              ? 'This playback engine does not report its live applied track gain.'
              : gainSourceLabel
                ? `Live applied gain · ${gainSourceLabel}${liveAdjustment?.peakLimited ? ' · peak limited' : ''}.`
                : 'Live applied gain · no ReplayGain metadata adjustment.';
    const transitionRuntimeAvailable =
        playbackType === PlayerType.LOCAL || playbackType === PlayerType.WEB;
    const mixerValue = !transitionRuntimeAvailable
        ? 'Unavailable'
        : transitionType === PlayerStyle.CROSSFADE
          ? `Crossfade · ${crossfadeDuration}s`
          : 'Normal transition';
    const mixerDetail = !transitionRuntimeAvailable
        ? 'The remote playback engine does not report its transition path.'
        : transitionType === PlayerStyle.CROSSFADE
          ? `${String(crossfadeStyle).replaceAll('_', ' ')} curve`
          : 'One playback source is active at a time.';
    const eqValue = !dspRuntimeAvailable
        ? 'Unavailable'
        : playback.equalizer.enabled
          ? 'Enabled'
          : 'Bypassed';
    const eqDetail = !dspRuntimeAvailable
        ? 'The current playback engine does not expose a KatiesAmp EQ stage.'
        : playback.equalizer.enabled
          ? `${playback.equalizer.bands.length} bands · ${formatDecibels(playback.equalizer.preamp)} preamp`
          : 'No equalizer changes are being applied.';
    const webVenueBoostDB = webAudio?.dsp
        ? linearGainToDecibels(webAudio.dsp.venueOutputGain.gain.value)
        : null;
    const mpvVenueBoostIsConfirmed = Boolean(
        currentMpvTelemetry?.audioFilters
            .split(',')
            .includes(`volume=${playback.venueOutputBoostDB}dB`),
    );
    const appliedVenueBoostDB =
        playbackType === PlayerType.WEB
            ? webVenueBoostDB
            : playbackType === PlayerType.LOCAL && mpvVenueBoostIsConfirmed
              ? playback.venueOutputBoostDB
              : null;
    const runtimeLimiterEnabled =
        playbackType === PlayerType.WEB
            ? Boolean(webAudio?.dsp && limiterEnabled)
            : Boolean(currentMpvTelemetry?.audioFilters.includes('alimiter='));
    const limiterValue = !dspRuntimeAvailable
        ? 'Unavailable'
        : runtimeLimiterEnabled
          ? playbackType === PlayerType.WEB
              ? `Enabled · ${formatDecibels(OUTPUT_LIMITER.threshold)} compressor target`
              : `Enabled · ${formatDecibels(OUTPUT_LIMITER.threshold)} limiter ceiling`
          : 'Bypassed';
    const limiterDetail = !dspRuntimeAvailable
        ? 'The current playback engine does not expose a KatiesAmp peak-protection stage.'
        : !runtimeLimiterEnabled
          ? 'Final peak protection is not active.'
          : playbackType === PlayerType.WEB
            ? limiterReduction === null
                ? 'Fast 20:1 browser peak protection is active; brief transients can exceed its target.'
                : `${Math.abs(limiterReduction).toFixed(1)} dB reduction at this instant. Fast browser compression is not a mathematical brick-wall limiter.`
            : limiterReduction === null
              ? 'MPV final limiting is active; live reduction is unavailable.'
              : `${Math.abs(limiterReduction).toFixed(1)} dB reduction at this instant.`;
    const outputSampleRate =
        playbackType === PlayerType.WEB ? webAudio?.context.sampleRate : undefined;
    // An offline copy being present does not prove that the already-playing
    // media element or MPV instance is using it. Keep the decoded input rate
    // unknown until the playback engines expose their active source telemetry.
    const decodedSourceSampleRate: number | undefined = undefined;
    const webSinkId =
        webAudio?.context && supportsAudioSinkSelection(webAudio.context)
            ? webAudio.context.sinkId
            : undefined;
    const expectedWebSinkId = toAudioSinkId(playback.audioDeviceId);
    const webDeviceIsConfirmed =
        playbackType === PlayerType.WEB &&
        webSinkId !== undefined &&
        webSinkId === expectedWebSinkId;
    const outputDevice =
        playbackType === PlayerType.WEB && webDeviceIsConfirmed
            ? playback.audioDeviceLabel || 'System default'
            : describePlaybackEngine(playbackType);
    const outputDeviceDetail =
        playbackType === PlayerType.WEB && webDeviceIsConfirmed
            ? 'The Web Audio output selection is confirmed.'
            : playbackType === PlayerType.LOCAL && playback.mpvAudioDeviceLabel
              ? `Configured device: ${playback.mpvAudioDeviceLabel}. Runtime confirmation is unavailable.`
              : 'The playback engine does not report its active output device.';
    const reportedLatencySeconds =
        playbackType === PlayerType.WEB
            ? (webAudio?.context.outputLatency ?? webAudio?.context.baseLatency)
            : undefined;
    const latencyDetail =
        reportedLatencySeconds && Number.isFinite(reportedLatencySeconds)
            ? `${Math.round(reportedLatencySeconds * 1000)} ms reported output latency`
            : 'Output latency is unavailable.';

    return (
        <div>
            <div className={styles.summary}>
                <div className={styles.status}>
                    {status === PlayerStatus.PLAYING && <span className={styles.statusDot} />}
                    {status === PlayerStatus.PLAYING ? 'Live signal' : 'Current signal path'}
                </div>
                <div className={styles.summaryTitle}>{song.name}</div>
                <div className={styles.summaryDetail}>{song.artistName || 'Unknown artist'}</div>
            </div>
            <div className={styles.path}>
                <SignalStage
                    detail={sourceDetails}
                    icon="track"
                    label="Source"
                    unavailable={!playbackSource}
                    value={sourceValue}
                />
                <SignalStage
                    detail={describeOutputSampleFormat(playbackType, Boolean(webAudio?.context))}
                    icon="audioLines"
                    label="Decoder"
                    value={describePlaybackEngine(playbackType)}
                />
                <SignalStage
                    detail={gainDetail}
                    icon="mediaSettings"
                    label="Volume levelling"
                    unavailable={
                        playback.volumeLevelingMode !== VOLUME_LEVELING_MODE.OFF &&
                        appliedTrackGainDB === null
                    }
                    value={
                        playback.volumeLevelingMode === VOLUME_LEVELING_MODE.OFF
                            ? 'Off · Bypassed'
                            : `${levellingProfile} · ${formatDecibels(appliedTrackGainDB)}`
                    }
                />
                <SignalStage
                    detail={mixerDetail}
                    icon="mediaShuffle"
                    label="Mixer"
                    unavailable={!transitionRuntimeAvailable}
                    value={mixerValue}
                />
                <SignalStage
                    detail={eqDetail}
                    icon="mediaSettings"
                    label="Equalizer"
                    unavailable={!dspRuntimeAvailable}
                    value={eqValue}
                />
                <SignalStage
                    detail={
                        appliedVenueBoostDB === null
                            ? 'The current playback engine does not report an applied venue boost.'
                            : 'Applied after track levelling and before final peak protection.'
                    }
                    icon="volumeMax"
                    label="Venue output boost"
                    unavailable={appliedVenueBoostDB === null}
                    value={formatDecibels(appliedVenueBoostDB)}
                />
                <SignalStage
                    detail={limiterDetail}
                    icon="mediaSpeed"
                    label="Final peak protection"
                    unavailable={!dspRuntimeAvailable}
                    value={limiterValue}
                />
                <SignalStage
                    detail={
                        decodedSourceSampleRate && outputSampleRate
                            ? `Offline source and Web Audio output rates are reported.`
                            : outputSampleRate
                              ? `Decoded source rate is not reported · output rate ${formatSampleRate(outputSampleRate)}.`
                              : 'Neither the decoded source nor output rate is reported.'
                    }
                    icon="arrowRight"
                    label="Resampler"
                    unavailable={!decodedSourceSampleRate || !outputSampleRate}
                    value={describeResampling(decodedSourceSampleRate, outputSampleRate)}
                />
                <SignalStage
                    detail={`${outputDeviceDetail} ${latencyDetail}`}
                    icon="lastPlayed"
                    label="Output"
                    value={outputDevice}
                />
            </div>
        </div>
    );
};

export const SignalPathPanel = () => {
    return (
        <section
            aria-label={translate('page.signalPath.title')}
            className={styles.panel}
            data-testid="signal-path-panel"
        >
            <div className={styles.panelTitle}>{translate('page.signalPath.title')}</div>
            <div className={styles.panelScroll}>
                <SignalPathPanelContent />
            </div>
        </section>
    );
};
