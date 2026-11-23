import assert from 'node:assert/strict';
import test from 'node:test';

import { getOfflinePlaylistStatusCounts } from '../src/renderer/features/offline/utils/offline-playlist-status.ts';

test('treats duplicate playlist positions as complete after they have been synced', () => {
    assert.deepEqual(
        getOfflinePlaylistStatusCounts({
            currentTrackCount: 7,
            downloadedUniqueTracks: 6,
            storedTrackCount: 7,
            storedUniqueTracks: 6,
        }),
        { complete: true, downloaded: 6, total: 6 },
    );
});

test('offers one remaining track when the server reports a new playlist position', () => {
    assert.deepEqual(
        getOfflinePlaylistStatusCounts({
            currentTrackCount: 8,
            downloadedUniqueTracks: 6,
            storedTrackCount: 7,
            storedUniqueTracks: 6,
        }),
        { complete: false, downloaded: 6, total: 7 },
    );
});

test('migrated playlists resync once before accepting duplicate positions', () => {
    assert.deepEqual(
        getOfflinePlaylistStatusCounts({
            currentTrackCount: 7,
            downloadedUniqueTracks: 6,
            storedUniqueTracks: 6,
        }),
        { complete: false, downloaded: 6, total: 7 },
    );
});

test('keeps a playlist partial when one of its unique files is missing', () => {
    assert.deepEqual(
        getOfflinePlaylistStatusCounts({
            currentTrackCount: 7,
            downloadedUniqueTracks: 5,
            storedTrackCount: 7,
            storedUniqueTracks: 6,
        }),
        { complete: false, downloaded: 5, total: 6 },
    );
});
