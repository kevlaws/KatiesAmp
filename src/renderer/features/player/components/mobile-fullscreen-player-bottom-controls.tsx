import clsx from 'clsx';
import { memo, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './mobile-fullscreen-player.module.css';

import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { usePlayerRepeat, usePlayerShuffle } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Group } from '/@/shared/components/group/group';
import { PlayerRepeat, PlayerShuffle } from '/@/shared/types/types';

interface MobileFullscreenPlayerBottomControlsProps {
    isLyricsActive: boolean;
    isQueueActive: boolean;
    onToggleContextMenu: (e: MouseEvent<HTMLButtonElement | HTMLDivElement>) => void;
    onToggleLyrics: () => void;
    onToggleQueue: () => void;
}

export const MobileFullscreenPlayerBottomControls = memo(
    ({
        isLyricsActive,
        isQueueActive,
        onToggleContextMenu,
        onToggleLyrics,
        onToggleQueue,
    }: MobileFullscreenPlayerBottomControlsProps) => {
        const { t } = useTranslation();
        const repeat = usePlayerRepeat();
        const shuffle = usePlayerShuffle();
        const { toggleRepeat, toggleShuffle } = usePlayer();
        const repeatLabel =
            repeat === PlayerRepeat.NONE
                ? t('player.repeat', { context: 'off' })
                : repeat === PlayerRepeat.ALL
                  ? t('player.repeat', { context: 'all' })
                  : t('player.repeat', { context: 'one' });

        return (
            <div className={styles.bottomControlsBar}>
                <Group className={styles.bottomControlsGroup} gap={0}>
                    <ActionIcon
                        className={styles.bottomControlIcon}
                        icon="mediaShuffle"
                        iconProps={{
                            fill: shuffle === PlayerShuffle.NONE ? 'default' : 'primary',
                            size: 'xl',
                        }}
                        onClick={toggleShuffle}
                        variant="transparent"
                    />
                    <ActionIcon
                        aria-label={repeatLabel}
                        aria-pressed={repeat !== PlayerRepeat.NONE}
                        className={clsx(styles.bottomControlIcon, {
                            [styles.bottomControlIconActive]: repeat !== PlayerRepeat.NONE,
                        })}
                        icon={repeat === PlayerRepeat.ONE ? 'mediaRepeatOne' : 'mediaRepeat'}
                        iconProps={{
                            fill: repeat === PlayerRepeat.NONE ? 'default' : 'contrast',
                            size: 'xl',
                        }}
                        onClick={toggleRepeat}
                        variant="transparent"
                    />
                    <ActionIcon
                        className={styles.bottomControlIcon}
                        icon="queue"
                        iconProps={{
                            fill: isQueueActive ? 'primary' : undefined,
                            size: 'xl',
                        }}
                        onClick={onToggleQueue}
                        variant="transparent"
                    />
                    <ActionIcon
                        className={styles.bottomControlIcon}
                        icon="metadata"
                        iconProps={{
                            fill: isLyricsActive ? 'primary' : undefined,
                            size: 'xl',
                        }}
                        onClick={onToggleLyrics}
                        variant="transparent"
                    />
                    <ActionIcon
                        className={styles.bottomControlIcon}
                        icon="ellipsisVertical"
                        iconProps={{
                            size: 'xl',
                        }}
                        onClick={onToggleContextMenu}
                        variant="transparent"
                    />
                </Group>
            </div>
        );
    },
);

MobileFullscreenPlayerBottomControls.displayName = 'MobileFullscreenPlayerBottomControls';
