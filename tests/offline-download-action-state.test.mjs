import assert from 'node:assert/strict';
import test from 'node:test';

import {
    combineOfflineCollectionDownloadStatuses,
    getOfflineCollectionActionState,
} from '../src/renderer/features/offline/utils/offline-download-action-state.ts';

test('offers an initial download when a collection has no offline tracks', () => {
    assert.deepEqual(
        getOfflineCollectionActionState({
            downloaded: 0,
            progress: 0,
            state: 'none',
            total: 12,
        }),
        {
            downloaded: 0,
            kind: 'download',
            progress: 0,
            remaining: 12,
            total: 12,
        },
    );
});

test('offers to download only the remaining tracks for a partial collection', () => {
    assert.deepEqual(
        getOfflineCollectionActionState({
            downloaded: 8,
            progress: 67,
            state: 'partial',
            total: 12,
        }),
        {
            downloaded: 8,
            kind: 'download-remaining',
            progress: 67,
            remaining: 4,
            total: 12,
        },
    );
});

test('reports active collection downloads without offering a duplicate action', () => {
    assert.deepEqual(
        getOfflineCollectionActionState({
            downloaded: 3,
            progress: 42.4,
            state: 'downloading',
            total: 7,
        }),
        {
            downloaded: 3,
            kind: 'downloading',
            progress: 42,
            remaining: 4,
            total: 7,
        },
    );
});

test('retries only the remaining tracks after an error', () => {
    assert.deepEqual(
        getOfflineCollectionActionState({
            downloaded: 5,
            progress: 50,
            state: 'error',
            total: 10,
        }),
        {
            downloaded: 5,
            kind: 'retry-remaining',
            progress: 50,
            remaining: 5,
            total: 10,
        },
    );
});

test('offers removal only when the collection is complete', () => {
    assert.deepEqual(
        getOfflineCollectionActionState({
            downloaded: 12,
            progress: 100,
            state: 'complete',
            total: 12,
        }),
        {
            downloaded: 12,
            kind: 'remove',
            progress: 100,
            remaining: 0,
            total: 12,
        },
    );
});

test('normalizes stale counts so a partial action never reports negative remaining tracks', () => {
    assert.deepEqual(
        getOfflineCollectionActionState({
            downloaded: 14,
            progress: 110,
            state: 'partial',
            total: 12,
        }),
        {
            downloaded: 12,
            kind: 'download-remaining',
            progress: 100,
            remaining: 0,
            total: 12,
        },
    );
});

test('combines mixed collection selections without treating them as removable', () => {
    assert.deepEqual(
        combineOfflineCollectionDownloadStatuses([
            { downloaded: 6, progress: 100, state: 'complete', total: 6 },
            { downloaded: 0, progress: 0, state: 'none', total: 4 },
        ]),
        { downloaded: 6, progress: 60, state: 'partial', total: 10 },
    );
});

test('keeps active progress ahead of mixed terminal states', () => {
    assert.deepEqual(
        combineOfflineCollectionDownloadStatuses([
            { downloaded: 1, progress: 25, state: 'downloading', total: 4 },
            { downloaded: 2, progress: 50, state: 'error', total: 4 },
        ]),
        { downloaded: 3, progress: 38, state: 'downloading', total: 8 },
    );
});
