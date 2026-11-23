import type { SettingsState } from '/@/renderer/store/settings.store';
import type { QueueSong, Song } from '/@/shared/types/domain-types';

import {
    buildMpvTrackAudioConfiguration,
    type MpvTrackAudioConfiguration,
} from './volume-leveling';

export const MPV_AUDIO_CONFIGURATION_CHANGED = 'MPV_AUDIO_CONFIGURATION_CHANGED';

/**
 * Resolve the authoritative per-track gain and the complete MPV filter chain.
 * Keeping this in one helper prevents queue insertion, automatic next, manual
 * next, and settings changes from silently using different normalisation rules.
 */
export const getMpvTrackAudioConfiguration = (
    song: QueueSong | Song | undefined,
    playback: SettingsState['playback'],
): MpvTrackAudioConfiguration =>
    buildMpvTrackAudioConfiguration({
        clip: playback.mpvProperties.replayGainClip,
        compressor: playback.compressor,
        equalizer: playback.equalizer,
        gainInfo: song?.gain,
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
