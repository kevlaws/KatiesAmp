import { t } from 'i18next';
import isElectron from 'is-electron';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { eventEmitter } from '/@/renderer/events/event-emitter';
import {
    type AudioDeviceOption,
    getAudioOutputPreference,
    getWebAudioDevices,
    includeUnavailableAudioDevice,
    resolveAudioOutputDeviceId,
} from '/@/renderer/features/player/audio-player/utils/audio-output';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import { useCurrentServer, useMpvInitialized, usePlayerStatus } from '/@/renderer/store';
import {
    usePlaybackSettings,
    usePlaybackType,
    useSettingsStoreActions,
} from '/@/renderer/store/settings.store';
import { logger } from '/@/renderer/utils/logger';
import { hasFeature } from '/@/shared/api/utils';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Group } from '/@/shared/components/group/group';
import { Select } from '/@/shared/components/select/select';
import { Switch } from '/@/shared/components/switch/switch';
import { toast } from '/@/shared/components/toast/toast';
import { ServerFeature } from '/@/shared/types/features-types';
import { PlayerStatus, PlayerType } from '/@/shared/types/types';

const ipc = isElectron() ? window.api.ipc : null;
const mpvPlayer = isElectron() ? window.api.mpvPlayer : null;

const getMpvAudioDevices = async () => {
    if (!mpvPlayer) {
        return [];
    }

    try {
        return await mpvPlayer.getAudioDevices();
    } catch (error) {
        logger.error('Failed to get MPV audio devices:', error);
        return [];
    }
};

export const getDefaultAudioDevice = (
    devices: AudioDeviceOption[],
    playbackType: PlayerType,
): null | string => {
    const defaultId = playbackType === PlayerType.LOCAL ? 'auto' : 'default';
    return devices.find((d) => d.value === defaultId)?.value ?? devices[0]?.value ?? null;
};

export const useAudioDevices = (playbackType: PlayerType) => {
    const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([]);
    const mpvInitialized = useMpvInitialized();

    useEffect(() => {
        let isCancelled = false;

        const fetchAudioDevices = async () => {
            if (!isElectron()) {
                return;
            }

            if (playbackType === PlayerType.WEB) {
                try {
                    const devices = await getWebAudioDevices();
                    if (!isCancelled) {
                        setAudioDevices(devices);
                    }
                } catch {
                    if (!isCancelled) {
                        toast.error({
                            message: t('error.audioDeviceFetchError'),
                        });
                    }
                }
            } else if (playbackType === PlayerType.LOCAL && mpvPlayer && mpvInitialized) {
                try {
                    const devices = await getMpvAudioDevices();
                    const uniqueDevices = devices.filter(
                        (d, index, self) => index === self.findIndex((t) => t.value === d.value),
                    );
                    if (!isCancelled) {
                        setAudioDevices(uniqueDevices);
                    }
                } catch {
                    if (!isCancelled) {
                        toast.error({
                            message: t('error.audioDeviceFetchError'),
                        });
                    }
                }
            }
        };

        void fetchAudioDevices();

        const mediaDevices = navigator.mediaDevices;
        if (playbackType === PlayerType.WEB) {
            mediaDevices?.addEventListener?.('devicechange', fetchAudioDevices);
        }

        return () => {
            isCancelled = true;
            mediaDevices?.removeEventListener?.('devicechange', fetchAudioDevices);
        };
    }, [mpvInitialized, playbackType]);

    return audioDevices;
};

export const AudioSettings = memo(() => {
    const { t } = useTranslation();
    const settings = usePlaybackSettings();
    const { setSettings } = useSettingsStoreActions();
    const status = usePlayerStatus();
    const playbackType = usePlaybackType();
    const { mediaStop } = usePlayer();

    // Cleaned up server feature logic via requested hooks/utilities
    const currentServer = useCurrentServer();
    const isJukeboxSupported = hasFeature(currentServer, ServerFeature.JUKEBOX);
    const showRefreshButton = settings.type === PlayerType.LOCAL;

    const audioDevices = useAudioDevices(playbackType);
    const audioDeviceId =
        playbackType === PlayerType.LOCAL ? settings.mpvAudioDeviceId : settings.audioDeviceId;
    const audioDeviceLabel =
        playbackType === PlayerType.LOCAL
            ? settings.mpvAudioDeviceLabel
            : settings.audioDeviceLabel;
    const isCasting = settings.type === PlayerType.DLNA;
    const audioDeviceOptions = includeUnavailableAudioDevice(audioDevices, {
        deviceId: audioDeviceId,
        deviceLabel: audioDeviceLabel,
    });
    const resolvedAudioDeviceId = resolveAudioOutputDeviceId(
        { deviceId: audioDeviceId, deviceLabel: audioDeviceLabel },
        audioDevices,
    );

    // Dynamically build the options for the dropdown
    const selectData = [
        {
            disabled: !isElectron(),
            label: 'MPV',
            value: PlayerType.LOCAL,
        },
        { label: 'Web', value: PlayerType.WEB },
    ];

    if (isJukeboxSupported) {
        selectData.push({ label: 'Jukebox', value: PlayerType.JUKEBOX });
    }

    if (isCasting) {
        selectData.push({ disabled: true, label: 'DLNA', value: PlayerType.DLNA });
    }

    const audioOptions: SettingOption[] = [
        {
            control: (
                <Group gap="xs" wrap="nowrap">
                    <Select
                        aria-label={t('setting.audioPlayer')}
                        data={selectData}
                        defaultValue={settings.type}
                        disabled={status === PlayerStatus.PLAYING || isCasting}
                        onChange={(e) => {
                            setSettings({ playback: { type: e as PlayerType } });
                            ipc?.send('settings-set', { property: 'playbackType', value: e });
                        }}
                    />
                    {showRefreshButton && (
                        <ActionIcon
                            icon="refresh"
                            iconProps={{ size: 'md' }}
                            onClick={() => {
                                mediaStop();
                                eventEmitter.emit('MPV_RELOAD', {});
                            }}
                            tooltip={{ label: t('common.reload') }}
                            variant="transparent"
                        />
                    )}
                </Group>
            ),
            description: t('setting.audioPlayer', { context: 'description' }),
            isHidden: !isElectron() && !isJukeboxSupported,
            note: status === PlayerStatus.PLAYING ? t('common.playerMustBePaused') : undefined,
            title: t('setting.audioPlayer'),
        },
        {
            control: (
                <Select
                    clearable
                    data={audioDeviceOptions}
                    disabled={!isElectron()}
                    onChange={(e) => {
                        const preference = getAudioOutputPreference(e, audioDevices);
                        setSettings({
                            playback:
                                playbackType === PlayerType.LOCAL
                                    ? {
                                          mpvAudioDeviceId: preference.deviceId,
                                          mpvAudioDeviceLabel: preference.deviceLabel,
                                      }
                                    : {
                                          audioDeviceId: preference.deviceId,
                                          audioDeviceLabel: preference.deviceLabel,
                                      },
                        });
                    }}
                    value={
                        resolvedAudioDeviceId ?? getDefaultAudioDevice(audioDevices, playbackType)
                    }
                />
            ),
            description: t('setting.audioDevice', { context: 'description' }),
            isHidden: !isElectron(),
            title: t('setting.audioDevice'),
        },
        {
            control: (
                <Switch
                    defaultChecked={settings.webAudio}
                    onChange={(e) => {
                        setSettings({
                            playback: { webAudio: e.currentTarget.checked },
                        });
                    }}
                />
            ),
            description: t('setting.webAudio', { context: 'description' }),
            isHidden: settings.type !== PlayerType.WEB,
            note: t('common.restartRequired'),
            title: t('setting.webAudio'),
        },
        {
            control: (
                <Switch
                    defaultChecked={settings.preservePitch}
                    onChange={(e) => {
                        setSettings({
                            playback: { preservePitch: e.currentTarget.checked },
                        });
                    }}
                />
            ),
            description: t('setting.preservePitch', { context: 'description' }),
            isHidden: settings.type !== PlayerType.WEB,
            title: t('setting.preservePitch'),
        },
        {
            control: (
                <Switch
                    defaultChecked={settings.audioFadeOnStatusChange}
                    onChange={(e) => {
                        setSettings({
                            playback: { audioFadeOnStatusChange: e.currentTarget.checked },
                        });
                    }}
                />
            ),
            description: t('setting.audioFadeOnStatusChange', { context: 'description' }),
            title: t('setting.audioFadeOnStatusChange'),
        },
        {
            control: (
                <Switch
                    checked={settings.consumeQueue}
                    onChange={(e) => {
                        setSettings({
                            playback: { consumeQueue: e.currentTarget.checked },
                        });
                    }}
                />
            ),
            description: t('setting.consumeQueue', { context: 'description' }),
            title: t('setting.consumeQueue'),
        },
    ];

    return <SettingsSection options={audioOptions} title={t('page.setting.audio')} />;
});
