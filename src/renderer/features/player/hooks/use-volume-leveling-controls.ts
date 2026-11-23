import isElectron from 'is-electron';
import { useCallback } from 'react';

import { eventEmitter } from '/@/renderer/events/event-emitter';
import {
    getMpvTrackAudioConfiguration,
    getMpvTrackAudioProperties,
    MPV_AUDIO_CONFIGURATION_CHANGED,
} from '/@/renderer/features/player/audio-player/utils/mpv-track-audio';
import {
    getReplayGainMode,
    type VenueOutputBoostDB,
    type VolumeLevelingMode,
} from '/@/renderer/features/player/audio-player/utils/volume-leveling';
import { usePlayerStore } from '/@/renderer/store/player.store';
import { useSettingsStore, useSettingsStoreActions } from '/@/renderer/store/settings.store';
import { PlayerType } from '/@/shared/types/types';

const mpvPlayer = isElectron() ? window.api.mpvPlayer : null;

const applyCurrentMpvAudioConfiguration = () => {
    const playback = useSettingsStore.getState().playback;
    if (playback.type !== PlayerType.LOCAL) return;

    const song = usePlayerStore.getState().getPlayerData().currentSong;
    const configuration = getMpvTrackAudioConfiguration(song, playback);
    mpvPlayer?.setProperties(getMpvTrackAudioProperties(configuration));
    eventEmitter.emit(MPV_AUDIO_CONFIGURATION_CHANGED, {});
};

export const useVolumeLevelingControls = () => {
    const { setSettings } = useSettingsStoreActions();

    const setVolumeLevelingMode = useCallback(
        (mode: VolumeLevelingMode) => {
            const replayGainMode = getReplayGainMode(mode);

            setSettings({
                playback: {
                    mpvProperties: {
                        replayGainClip: true,
                        replayGainMode,
                    },
                    volumeLevelingMode: mode,
                },
            });

            applyCurrentMpvAudioConfiguration();
        },
        [setSettings],
    );

    const setVenueOutputBoostDB = useCallback(
        (venueOutputBoostDB: VenueOutputBoostDB) => {
            setSettings({ playback: { venueOutputBoostDB } });
            applyCurrentMpvAudioConfiguration();
        },
        [setSettings],
    );

    return {
        setVenueOutputBoostDB,
        setVolumeLevelingMode,
    };
};
