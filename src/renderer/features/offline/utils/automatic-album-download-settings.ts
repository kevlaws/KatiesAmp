import { z } from 'zod';

export const AUTOMATIC_ALBUM_DOWNLOAD_SETTINGS_MIGRATION_VERSION = 39;

export const AUTOMATIC_ALBUM_DOWNLOAD_DEFAULTS = {
    enabled: false,
    endTime: '09:00',
    startTime: '04:00',
} as const;

export const AUTOMATIC_ALBUM_DOWNLOAD_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const isValidAutomaticAlbumDownloadTime = (value: string): boolean =>
    AUTOMATIC_ALBUM_DOWNLOAD_TIME_PATTERN.test(value);

export const AutomaticAlbumDownloadSettingsSchema = z
    .object({
        enabled: z.boolean(),
        endTime: z.string().regex(AUTOMATIC_ALBUM_DOWNLOAD_TIME_PATTERN),
        startTime: z.string().regex(AUTOMATIC_ALBUM_DOWNLOAD_TIME_PATTERN),
    })
    .refine(({ endTime, startTime }) => endTime !== startTime, {
        message: 'Automatic album download start and end times must be different',
        path: ['endTime'],
    });

export type AutomaticAlbumDownloadSettings = z.infer<typeof AutomaticAlbumDownloadSettingsSchema>;

type AutomaticAlbumDownloadMigrationState = {
    general?: {
        automaticAlbumDownloads?: Partial<AutomaticAlbumDownloadSettings>;
    };
};

export const migrateAutomaticAlbumDownloadSettings = (
    state: AutomaticAlbumDownloadMigrationState,
    version: number,
): void => {
    if (version >= AUTOMATIC_ALBUM_DOWNLOAD_SETTINGS_MIGRATION_VERSION || !state.general) return;

    state.general.automaticAlbumDownloads = {
        ...AUTOMATIC_ALBUM_DOWNLOAD_DEFAULTS,
        ...state.general.automaticAlbumDownloads,
    };
};
