import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAutomaticAlbumInventory } from '../src/renderer/features/offline/utils/automatic-album-inventory.ts';

const album = (id, serverId = 'server-1') => ({ _serverId: serverId, id, name: id });
const track = (id, albumId, serverId = 'server-1') => ({
    _serverId: serverId,
    albumId,
    id,
    name: id,
});

const response = (items, totalRecordCount = items.length, startIndex = 0) => ({
    items,
    startIndex,
    totalRecordCount,
});

test('enumerates every accessible folder explicitly instead of inheriting the Home selection', async () => {
    const albumQueries = [];
    const songQueries = [];
    const client = {
        getAlbumList: async ({ query }) => {
            albumQueries.push(query);
            return response([album(`album-${query.musicFolderId}`)]);
        },
        getMusicFolderList: async () =>
            response([
                { id: 'library-a', name: 'Library A' },
                { id: 'library-b', name: 'Library B' },
            ]),
        getSongList: async ({ query }) => {
            songQueries.push(query);
            return response(query.albumIds.map((albumId) => track(`track-${albumId}`, albumId)));
        },
    };

    const inventory = await loadAutomaticAlbumInventory({
        client,
        serverId: 'server-1',
    });

    assert.deepEqual(
        albumQueries.map(({ musicFolderId }) => musicFolderId),
        ['library-a', 'library-b'],
    );
    assert.ok(albumQueries.every(({ musicFolderId }) => typeof musicFolderId === 'string'));
    assert.equal(songQueries.length, 1);
    assert.deepEqual(songQueries[0].albumIds, ['album-library-a', 'album-library-b']);
    assert.deepEqual(
        inventory.items.map(({ album: item }) => item.id),
        ['album-library-a', 'album-library-b'],
    );
});

test('paginates albums and fetches their tracks in bounded batches', async () => {
    const albumStarts = [];
    const songQueries = [];
    const client = {
        getAlbumList: async ({ query }) => {
            albumStarts.push(query.startIndex);
            if (query.startIndex === 0) {
                return response(
                    Array.from({ length: 200 }, (_, index) => album(`album-${index}`)),
                    201,
                );
            }
            return response([album('album-200')], 201, query.startIndex);
        },
        getMusicFolderList: async () => response([{ id: 'library-a', name: 'Library A' }]),
        getSongList: async ({ query }) => {
            songQueries.push(query);
            return response(query.albumIds.map((albumId) => track(`track-${albumId}`, albumId)));
        },
    };

    const inventory = await loadAutomaticAlbumInventory({ client, serverId: 'server-1' });

    assert.deepEqual(albumStarts, [0, 200]);
    assert.deepEqual(
        songQueries.map(({ albumIds }) => albumIds.length),
        [50, 50, 50, 50, 1],
    );
    assert.ok(songQueries.every(({ limit, startIndex }) => limit === -1 && startIndex === 0));
    assert.equal(inventory.items.length, 201);
    assert.equal(inventory.items[0].tracks.length, 1);
});

test('deduplicates albums across folders and duplicate tracks', async () => {
    const client = {
        getAlbumList: async ({ query }) =>
            response(
                query.musicFolderId === 'library-a'
                    ? [album('shared'), album('only-a')]
                    : [album('shared')],
            ),
        getMusicFolderList: async () =>
            response([
                { id: 'library-a', name: 'Library A' },
                { id: 'library-a', name: 'Duplicate Library A' },
                { id: 'library-b', name: 'Library B' },
            ]),
        getSongList: async () =>
            response([
                track('shared-track', 'shared'),
                track('shared-track', 'shared'),
                track('only-a-track', 'only-a'),
                track('unrelated-track', 'not-requested'),
            ]),
    };

    const inventory = await loadAutomaticAlbumInventory({ client, serverId: 'server-1' });
    const shared = inventory.items.find(({ album: item }) => item.id === 'shared');
    const onlyA = inventory.items.find(({ album: item }) => item.id === 'only-a');

    assert.deepEqual(inventory.musicFolders, [
        { id: 'library-a', name: 'Library A' },
        { id: 'library-b', name: 'Library B' },
    ]);
    assert.deepEqual(shared.musicFolderIds, ['library-a', 'library-b']);
    assert.deepEqual(
        shared.tracks.map((item) => item.id),
        ['shared-track'],
    );
    assert.deepEqual(
        onlyA.tracks.map((item) => item.id),
        ['only-a-track'],
    );
});

test('retries folder-backed albums through the single-album Jellyfin path', async () => {
    const songQueries = [];
    const client = {
        getAlbumList: async () => response([album('regular'), album('folder-view')]),
        getMusicFolderList: async () => response([{ id: 'library-a', name: 'Library A' }]),
        getSongList: async ({ query }) => {
            songQueries.push(query.albumIds);
            if (query.albumIds.length > 1) {
                return response([track('regular-track', 'regular')]);
            }
            return response([
                track('folder-track', 'canonical-album-id'),
                track('folder-track', 'canonical-album-id'),
            ]);
        },
    };

    const inventory = await loadAutomaticAlbumInventory({ client, serverId: 'server-1' });
    const folderView = inventory.items.find(({ album: item }) => item.id === 'folder-view');

    assert.deepEqual(songQueries, [['regular', 'folder-view'], ['folder-view']]);
    assert.deepEqual(
        folderView.tracks.map((item) => item.id),
        ['folder-track'],
    );
    assert.equal(folderView.tracks[0].albumId, 'canonical-album-id');
});

test('does not retain inventory from another server or invocation', async () => {
    const createClient = (serverId, folderId, albumId, trackId) => ({
        getAlbumList: async () => response([album(albumId, serverId)]),
        getMusicFolderList: async () => response([{ id: folderId, name: folderId }]),
        getSongList: async () => response([track(trackId, albumId, serverId)]),
    });

    const first = await loadAutomaticAlbumInventory({
        client: createClient('server-a', 'library-a', 'album-a', 'track-a'),
        serverId: 'server-a',
    });
    const second = await loadAutomaticAlbumInventory({
        client: createClient('server-b', 'library-b', 'album-b', 'track-b'),
        serverId: 'server-b',
    });

    assert.deepEqual(
        first.items.map(({ album: item }) => item.id),
        ['album-a'],
    );
    assert.deepEqual(
        second.items.map(({ album: item }) => item.id),
        ['album-b'],
    );
});

test('rejects cross-server items instead of leaking them into the current inventory', async () => {
    const client = {
        getAlbumList: async () => response([album('foreign-album', 'another-server')]),
        getMusicFolderList: async () => response([{ id: 'library-a', name: 'Library A' }]),
        getSongList: async () => response([]),
    };

    await assert.rejects(
        loadAutomaticAlbumInventory({ client, serverId: 'server-1' }),
        /item from another server/,
    );
});

test('propagates incomplete inventory failures instead of returning a destructive partial result', async () => {
    const failure = new Error('permission lookup failed');
    const client = {
        getAlbumList: async () => response([]),
        getMusicFolderList: async () => {
            throw failure;
        },
        getSongList: async () => response([]),
    };

    await assert.rejects(loadAutomaticAlbumInventory({ client, serverId: 'server-1' }), failure);
});

test('rejects a repeated full page rather than looping or treating it as complete', async () => {
    const repeatedAlbums = Array.from({ length: 200 }, (_, index) => album(`album-${index}`));
    const client = {
        getAlbumList: async () => response(repeatedAlbums, 400),
        getMusicFolderList: async () => response([{ id: 'library-a', name: 'Library A' }]),
        getSongList: async () => response([]),
    };

    await assert.rejects(
        loadAutomaticAlbumInventory({ client, serverId: 'server-1' }),
        /Album pagination did not advance/,
    );
});
