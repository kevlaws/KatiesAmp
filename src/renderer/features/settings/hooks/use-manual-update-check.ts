import isElectron from 'is-electron';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    getManualUpdateCheckFeedback,
    type ManualUpdateCheckFeedback,
} from '/@/renderer/features/settings/utils/manual-update-check';

const utils = isElectron() ? window.api.utils : null;

interface TranslatedUpdateCheckFeedback extends ManualUpdateCheckFeedback {
    message: string;
}

export const useManualUpdateCheck = () => {
    const { t } = useTranslation();
    const [isChecking, setIsChecking] = useState(false);
    const [updateCheckResult, setUpdateCheckResult] = useState<string>();
    // Automation disables startup update traffic and replaces manual checks with a local stub.
    const isSupported = Boolean(utils && (utils.automation || !utils.disableAutoUpdates()));

    const checkForUpdates = useCallback(async (): Promise<
        TranslatedUpdateCheckFeedback | undefined
    > => {
        if (!utils) return undefined;

        setIsChecking(true);
        setUpdateCheckResult(undefined);

        try {
            const result = await utils.checkForUpdates();
            const feedback = getManualUpdateCheckFeedback(result);
            const message = t(feedback.translationKey, {
                defaultValue: feedback.defaultMessage,
                version: result.version,
            });
            setUpdateCheckResult(message);
            return { ...feedback, message };
        } catch {
            const feedback = getManualUpdateCheckFeedback({ status: 'error' });
            const message = t(feedback.translationKey, {
                defaultValue: feedback.defaultMessage,
            });
            setUpdateCheckResult(message);
            return { ...feedback, message };
        } finally {
            setIsChecking(false);
        }
    }, [t]);

    return {
        checkForUpdates,
        isChecking,
        isSupported,
        updateCheckResult,
    };
};
