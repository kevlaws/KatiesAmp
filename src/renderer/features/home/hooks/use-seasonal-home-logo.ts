import { useEffect, useState } from 'react';

import {
    getSeasonalHomeLogo,
    type SeasonalHomeLogo,
} from '/@/renderer/features/home/utils/seasonal-home-logo';
import { createSeasonalHomeLogoRefreshScheduler } from '/@/renderer/features/home/utils/seasonal-home-logo-refresh';

const previewLogo = import.meta.env.DEV
    ? (import.meta.env.VITE_KATIESAMP_SEASONAL_LOGO_PREVIEW as SeasonalHomeLogo | undefined)
    : undefined;

const getCurrentLogo = () => previewLogo || getSeasonalHomeLogo();

export const useSeasonalHomeLogo = (): SeasonalHomeLogo => {
    const [logo, setLogo] = useState<SeasonalHomeLogo>(getCurrentLogo);

    useEffect(() => {
        const scheduler = createSeasonalHomeLogoRefreshScheduler({
            cancelTimer: (timer) => window.clearTimeout(timer as number),
            onRefresh: () => setLogo(getCurrentLogo()),
            scheduleTimer: window.setTimeout,
        });

        const handleVisibilityChange = () => {
            scheduler.handleVisibilityChange(document.visibilityState);
        };

        scheduler.start();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            scheduler.dispose();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return logo;
};
