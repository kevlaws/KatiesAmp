export const KATIESAMP_DEFAULT_SERVER_NAME = 'KATIESMEDIASERVER';
export const KATIESAMP_LEGACY_SERVER_NAME = 'KATIESMUSICSERVER';

export const resolveKatiesAmpServerName = (
    currentName: string,
    reportedName?: null | string,
    previousReportedName?: null | string,
): string => {
    const normalizedReportedName = reportedName?.trim();
    const normalizedPreviousReportedName = previousReportedName?.trim();

    if (!normalizedReportedName) {
        return currentName;
    }

    if (
        currentName === KATIESAMP_LEGACY_SERVER_NAME ||
        currentName === KATIESAMP_DEFAULT_SERVER_NAME ||
        currentName === normalizedPreviousReportedName
    ) {
        return normalizedReportedName;
    }

    return currentName;
};
