import isElectron from 'is-electron';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import { useManualUpdateCheck } from '/@/renderer/features/settings/hooks/use-manual-update-check';
import { useSettingsStoreActions, useWindowSettings } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Select } from '/@/shared/components/select/select';
import { Switch } from '/@/shared/components/switch/switch';

const localSettings = isElectron() ? window.api.localSettings : null;

export const UpdateSettings = memo(() => {
    const { t } = useTranslation();
    const settings = useWindowSettings();
    const { setSettings } = useSettingsStoreActions();
    const { checkForUpdates, isChecking, isSupported, updateCheckResult } = useManualUpdateCheck();

    const updateOptions: SettingOption[] = [
        {
            control: (
                <Select
                    data={[
                        {
                            label: t('setting.releaseChannel', {
                                context: 'optionRelease',
                                defaultValue: 'Release',
                            }),
                            value: 'latest',
                        },
                        {
                            label: t('setting.releaseChannel', {
                                context: 'optionBeta',
                            }),
                            value: 'beta',
                        },
                    ]}
                    defaultValue={settings.releaseChannel || 'latest'}
                    onChange={(value) => {
                        if (!value) return;
                        localSettings?.set('release_channel', value);
                        setSettings({
                            window: {
                                releaseChannel: value as 'beta' | 'latest',
                            },
                        });
                    }}
                />
            ),
            description: t('setting.releaseChannel', {
                context: 'description',
            }),
            isHidden: !isSupported,
            title: t('setting.releaseChannel'),
        },
        {
            control: (
                <Button loading={isChecking} onClick={checkForUpdates}>
                    {isChecking
                        ? t('setting.manualUpdateCheck_checking', 'Checking…')
                        : t('setting.manualUpdateCheck_action', 'Check now')}
                </Button>
            ),
            description:
                updateCheckResult ||
                t(
                    'setting.manualUpdateCheck_description',
                    'Check your selected channel for a newer version of KatiesAmp.',
                ),
            isHidden: !isSupported,
            title: t('setting.manualUpdateCheck', 'Check for updates'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.automaticUpdates')}
                    defaultChecked={!settings.disableAutoUpdate}
                    disabled={!isSupported}
                    onChange={(e) => {
                        if (!e) return;
                        const enabled = e.currentTarget.checked;
                        localSettings?.set('disable_auto_updates', !enabled);
                        setSettings({
                            window: {
                                disableAutoUpdate: !enabled,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.automaticUpdates', {
                context: 'description',
            }),
            isHidden: !isSupported,
            title: t('setting.automaticUpdates'),
        },
    ];

    return <SettingsSection options={updateOptions} title={t('page.setting.updates')} />;
});
