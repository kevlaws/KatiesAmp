import type { SettingsState } from '/@/renderer/store/settings.store';
import type { QueueSong } from '/@/shared/types/domain-types';

import {
    buildMpvTrackAudioConfiguration,
    type MpvTrackAudioConfiguration,
} from './volume-leveling';

export const MPV_AUDIO_CONFIGURATION_CHANGED = 'MPV_AUDIO_CONFIGURATION_CHANGED';

// MPV can advance to its preloaded file before the renderer receives auto-next.
// Keep the selected gains for exactly the two entries accepted into its queue.
const fileGains = new Map<string, number | undefined>();
export const hasMpvQueueEntry = (song: QueueSong) => fileGains.has(song._uniqueId);
export const setMpvQueueGains = (
    current: QueueSong | undefined,
    next: QueueSong | undefined,
    nextSource: undefined | { trackGainDB?: number },
    currentSource?: { trackGainDB?: number },
) => {
    const currentGain = currentSource
        ? currentSource.trackGainDB
        : current && fileGains.get(current._uniqueId);
    fileGains.clear();
    if (next) fileGains.set(next._uniqueId, nextSource?.trackGainDB);
    if (current) fileGains.set(current._uniqueId, currentGain);
};

/**
 * Resolve the authoritative per-track gain and the complete MPV filter chain.
 * Keeping this in one helper prevents queue insertion, automatic next, manual
 * next, and settings changes from silently using different normalisation rules.
 */
export const getMpvTrackAudioConfiguration = (
    song: QueueSong | undefined,
    playback: SettingsState['playback'],
): MpvTrackAudioConfiguration =>
    buildMpvTrackAudioConfiguration({
        clip: playback.mpvProperties.replayGainClip,
        compressor: playback.compressor,
        equalizer: playback.equalizer,
        gainInfo: song && {
            ...song.gain,
            track: fileGains.get(song._uniqueId) ?? song.gain?.track,
        },
        peakInfo: song?.peak,
        preampDB: playback.mpvProperties.replayGainPreampDB,
        venueOutputBoostDB: playback.venueOutputBoostDB,
        volumeLevelingMode: playback.volumeLevelingMode,
    });

export const getMpvTrackAudioProperties = (
    configuration: MpvTrackAudioConfiguration,
): Record<string, string> => ({
    af: configuration.audioFilters,
    replaygain: configuration.replayGainMode,
});
