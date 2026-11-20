import isElectron from 'is-electron';
import { useCallback } from 'react';

import {
    buildMpvAudioFilters,
    getReplayGainMode,
    type VolumeLevelingMode,
} from '/@/renderer/features/player/audio-player/utils/volume-leveling';
import { getMpvSetting } from '/@/renderer/features/settings/components/playback/mpv-properties';
import { useSettingsStore, useSettingsStoreActions } from '/@/renderer/store/settings.store';
import { PlayerType } from '/@/shared/types/types';

const mpvPlayer = isElectron() ? window.api.mpvPlayer : null;

export const useVolumeLevelingControls = () => {
    const { setSettings } = useSettingsStoreActions();

    const setVolumeLevelingMode = useCallback(
        (mode: VolumeLevelingMode) => {
            const settings = useSettingsStore.getState().playback;
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

            mpvPlayer?.setProperties({
                ...getMpvSetting('replayGainMode', replayGainMode),
                ...getMpvSetting('replayGainClip', true),
            });

            if (settings.type === PlayerType.LOCAL) {
                mpvPlayer?.setProperties({
                    af: buildMpvAudioFilters(
                        settings.equalizer,
                        settings.compressor,
                        mode,
                        settings.venueOutputBoostDB,
                    ),
                });
            }
        },
        [setSettings],
    );

    const setVenueOutputBoostDB = useCallback(
        (venueOutputBoostDB: 3 | 6) => {
            const settings = useSettingsStore.getState().playback;
            setSettings({ playback: { venueOutputBoostDB } });

            if (settings.type === PlayerType.LOCAL) {
                mpvPlayer?.setProperties({
                    af: buildMpvAudioFilters(
                        settings.equalizer,
                        settings.compressor,
                        settings.volumeLevelingMode,
                        venueOutputBoostDB,
                    ),
                });
            }
        },
        [setSettings],
    );

    return {
        setVenueOutputBoostDB,
        setVolumeLevelingMode,
    };
};
