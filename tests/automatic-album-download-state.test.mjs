import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getAutomaticDownloadDeviceId,
    isAutomaticAlbumSuppressedForWindow,
    suppressAutomaticAlbumForCurrentWindow,
} from '../src/renderer/features/offline/utils/automatic-album-download-state.ts';

const createStorage = () => {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
};

const window = {
    endAt: new Date('2026-11-04T09:00:00.000Z'),
    offsetMinutes: 7,
    startAt: new Date('2026-11-04T04:07:00.000Z'),
};

test('persists a stable per-installation device id', () => {
    const storage = createStorage();
    const first = getAutomaticDownloadDeviceId(storage);
    const second = getAutomaticDownloadDeviceId(storage);

    assert.ok(first);
    assert.equal(second, first);
});

test('a removal during a window suppresses only that album for that window', () => {
    const storage = createStorage();
    suppressAutomaticAlbumForCurrentWindow(
        storage,
        'server-a',
        'user-a',
        'album-a',
        new Date('2026-11-04T06:00:00.000Z'),
    );

    assert.equal(
        isAutomaticAlbumSuppressedForWindow(storage, 'server-a', 'user-a', 'album-a', window),
        true,
    );
    assert.equal(
        isAutomaticAlbumSuppressedForWindow(storage, 'server-a', 'user-a', 'album-b', window),
        false,
    );
    assert.equal(
        isAutomaticAlbumSuppressedForWindow(storage, 'server-a', 'user-b', 'album-a', window),
        false,
    );
});

test('an earlier removal becomes eligible again in the next window', () => {
    const storage = createStorage();
    suppressAutomaticAlbumForCurrentWindow(
        storage,
        'server-a',
        'user-a',
        'album-a',
        new Date('2026-11-04T06:00:00.000Z'),
    );

    const nextWindow = {
        ...window,
        endAt: new Date('2026-11-05T09:00:00.000Z'),
        startAt: new Date('2026-11-05T04:07:00.000Z'),
    };
    assert.equal(
        isAutomaticAlbumSuppressedForWindow(storage, 'server-a', 'user-a', 'album-a', nextWindow),
        false,
    );
});
