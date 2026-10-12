import clsx from 'clsx';
import isElectron from 'is-electron';

import styles from './default-layout.module.css';

import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { MainContent } from '/@/renderer/layouts/default-layout/main-content';
import { PlayerBar } from '/@/renderer/layouts/default-layout/player-bar';
import { WindowBar } from '/@/renderer/layouts/window-bar';
import { useDjModeExpanded } from '/@/renderer/store';
import { useSettingsStore, useWindowBarStyle } from '/@/renderer/store/settings.store';
import { Platform, PlayerType } from '/@/shared/types/types';

if (!isElectron()) {
    useSettingsStore.getState().actions.setSettings({
        playback: {
            type: PlayerType.WEB,
        },
    });
}

interface DefaultLayoutProps {
    shell?: boolean;
}

export const DefaultLayout = ({ shell }: DefaultLayoutProps) => {
    const djModeExpanded = useDjModeExpanded();
    const windowBarStyle = useWindowBarStyle();

    return (
        <>
            <div
                className={clsx(styles.layout, {
                    [styles.djMode]: djModeExpanded,
                    [styles.macos]: windowBarStyle === Platform.MACOS,
                    [styles.windows]: windowBarStyle === Platform.WINDOWS,
                })}
                id="default-layout"
            >
                <WindowBar />
                <MainContent shell={shell} />
                {!djModeExpanded && <PlayerBar />}
            </div>
            <ContextMenuController.Root />
        </>
    );
};
