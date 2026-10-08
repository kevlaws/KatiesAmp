import type { CrossfadeStyle } from '/@/shared/types/types';

export type CrossfadeTransitionSettings = {
    duration: number;
    style: CrossfadeStyle;
};

export const captureCrossfadeTransitionSettings = (
    duration: number,
    style: CrossfadeStyle,
): CrossfadeTransitionSettings => ({ duration, style });

export const resolveCrossfadeTransitionSettings = (
    isTransitioning: boolean,
    activeSettings: CrossfadeTransitionSettings | null,
    duration: number,
    style: CrossfadeStyle,
): CrossfadeTransitionSettings =>
    isTransitioning && activeSettings
        ? activeSettings
        : captureCrossfadeTransitionSettings(duration, style);
