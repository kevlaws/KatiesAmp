export type ManualUpdateCheckFeedback = {
    defaultMessage: string;
    translationKey: string;
    type: 'error' | 'info' | 'success';
};

export type ManualUpdateCheckResult = {
    status: 'available' | 'checking' | 'downloaded' | 'error' | 'idle' | 'not-available';
    version?: string;
};

export const getManualUpdateCheckFeedback = (
    result: ManualUpdateCheckResult,
): ManualUpdateCheckFeedback => {
    switch (result.status) {
        case 'available':
            return {
                defaultMessage: 'Version {{version}} is available and is downloading.',
                translationKey: 'setting.manualUpdateCheck_available',
                type: 'info',
            };
        case 'checking':
            return {
                defaultMessage: 'An update check is already in progress.',
                translationKey: 'setting.manualUpdateCheck_inProgress',
                type: 'info',
            };
        case 'downloaded':
            return {
                defaultMessage: 'Version {{version}} is ready to install.',
                translationKey: 'setting.manualUpdateCheck_ready',
                type: 'success',
            };
        case 'error':
            return {
                defaultMessage: 'Unable to check for updates.',
                translationKey: 'setting.manualUpdateCheck_error',
                type: 'error',
            };
        default:
            return {
                defaultMessage: 'KatiesAmp is up to date.',
                translationKey: 'setting.manualUpdateCheck_current',
                type: 'success',
            };
    }
};
