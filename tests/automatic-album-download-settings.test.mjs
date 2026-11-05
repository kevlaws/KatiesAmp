import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AUTOMATIC_ALBUM_DOWNLOAD_DEFAULTS,
    AUTOMATIC_ALBUM_DOWNLOAD_SETTINGS_MIGRATION_VERSION,
    AutomaticAlbumDownloadSettingsSchema,
    isValidAutomaticAlbumDownloadTime,
    migrateAutomaticAlbumDownloadSettings,
} from '../src/renderer/features/offline/utils/automatic-album-download-settings.ts';

test('automatic album downloads use the safe opt-in 04:00 to 09:00 defaults', () => {
    assert.deepEqual(AUTOMATIC_ALBUM_DOWNLOAD_DEFAULTS, {
        enabled: false,
        endTime: '09:00',
        startTime: '04:00',
    });
});

test('automatic album download times use canonical local 24-hour values', () => {
    for (const value of ['00:00', '04:00', '09:00', '23:59']) {
        assert.equal(isValidAutomaticAlbumDownloadTime(value), true);
    }

    for (const value of ['', '4:00', '09:60', '24:00', 'noon']) {
        assert.equal(isValidAutomaticAlbumDownloadTime(value), false);
    }
});

test('automatic album download windows allow overnight ranges but not equal times', () => {
    assert.equal(
        AutomaticAlbumDownloadSettingsSchema.safeParse({
            enabled: true,
            endTime: '02:00',
            startTime: '22:00',
        }).success,
        true,
    );
    assert.equal(
        AutomaticAlbumDownloadSettingsSchema.safeParse({
            enabled: true,
            endTime: '04:00',
            startTime: '04:00',
        }).success,
        false,
    );
});

test('existing settings migrate to automatic album download defaults', () => {
    const state = { general: {} };

    migrateAutomaticAlbumDownloadSettings(
        state,
        AUTOMATIC_ALBUM_DOWNLOAD_SETTINGS_MIGRATION_VERSION - 1,
    );

    assert.deepEqual(state.general.automaticAlbumDownloads, AUTOMATIC_ALBUM_DOWNLOAD_DEFAULTS);
});

test('migration fills a partial automatic album download policy without losing choices', () => {
    const state = {
        general: {
            automaticAlbumDownloads: {
                enabled: true,
                startTime: '03:30',
            },
        },
    };

    migrateAutomaticAlbumDownloadSettings(
        state,
        AUTOMATIC_ALBUM_DOWNLOAD_SETTINGS_MIGRATION_VERSION - 1,
    );

    assert.deepEqual(state.general.automaticAlbumDownloads, {
        enabled: true,
        endTime: '09:00',
        startTime: '03:30',
    });
});

test('current automatic album download settings are not remigrated', () => {
    const automaticAlbumDownloads = {
        enabled: true,
        endTime: '08:30',
        startTime: '01:30',
    };
    const state = { general: { automaticAlbumDownloads } };

    migrateAutomaticAlbumDownloadSettings(
        state,
        AUTOMATIC_ALBUM_DOWNLOAD_SETTINGS_MIGRATION_VERSION,
    );

    assert.equal(state.general.automaticAlbumDownloads, automaticAlbumDownloads);
});
