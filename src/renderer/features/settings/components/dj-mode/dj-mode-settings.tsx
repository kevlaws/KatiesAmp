import { t } from 'i18next';
import isElectron from 'is-electron';
import { memo, useEffect, useState } from 'react';

import { openDjPasswordSettingsModal } from '/@/renderer/features/dj/components/dj-access-modal';
import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import { useGeneralSettings, useSettingsStoreActions } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Switch } from '/@/shared/components/switch/switch';

const localSettings = isElectron() ? window.api.localSettings : null;

export const DjModeSettings = memo(() => {
    const settings = useGeneralSettings();
    const { setSettings } = useSettingsStoreActions();
    const [passwordConfigured, setPasswordConfigured] = useState(false);

    useEffect(() => {
        void localSettings?.djPasswordIsSet().then(setPasswordConfigured);
    }, []);

    const setEnabled = (enabled: boolean) => {
        setSettings({ general: { djModeEnabled: enabled } });
    };

    const options: SettingOption[] = [
        {
            control: (
                <Switch
                    aria-label={t('setting.djModeEnabled')}
                    checked={settings.djModeEnabled}
                    disabled={!passwordConfigured}
                    onChange={(event) => setEnabled(event.currentTarget.checked)}
                />
            ),
            description: passwordConfigured
                ? t('setting.djModeEnabledDescription')
                : t('setting.djModePasswordRequired'),
            isHidden: !isElectron(),
            title: t('setting.djModeEnabled'),
        },
        {
            control: (
                <Button
                    onClick={() =>
                        openDjPasswordSettingsModal(() => {
                            setPasswordConfigured(true);
                            setEnabled(true);
                        })
                    }
                    size="compact-sm"
                    variant="filled"
                >
                    {passwordConfigured
                        ? t('setting.djModeChangePassword')
                        : t('setting.djModeSetPassword')}
                </Button>
            ),
            description: t('setting.djModePasswordSettingsDescription'),
            isHidden: !isElectron(),
            title: passwordConfigured
                ? t('setting.djModeChangePassword')
                : t('setting.djModeSetPassword'),
        },
    ];

    return <SettingsSection options={options} title={t('setting.djModeSettingsTitle')} />;
});
