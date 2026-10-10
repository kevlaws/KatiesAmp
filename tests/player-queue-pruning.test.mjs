import assert from 'node:assert/strict';
import test from 'node:test';

import { pruneUnavailableQueue } from '../src/renderer/store/player-queue-pruning.ts';

const songs = {
    first: { _serverId: 'server-1', id: 'song-1' },
    fourth: { _serverId: 'server-1', id: 'song-4' },
    second: { _serverId: 'server-1', id: 'song-2' },
    third: { _serverId: 'server-1', id: 'song-3' },
};

const prune = (overrides = {}) =>
    pruneUnavailableQueue({
        currentIndex: 0,
        defaultIds: ['first', 'second', 'third', 'fourth'],
        repeatAll: false,
        serverId: 'server-1',
        shuffledIndexes: [],
        shuffleEnabled: false,
        songs,
        unavailableSongIds: ['song-3'],
        ...overrides,
    });

test('removes a future unavailable track without changing the current track', () => {
    const result = prune();

    assert.deepEqual(result.defaultIds, ['first', 'second', 'fourth']);
    assert.equal(result.currentRemoved, false);
    assert.equal(result.nextCurrentId, 'first');
    assert.equal(result.nextCurrentIndex, 0);
    assert.deepEqual(result.removedUniqueIds, ['third']);
});

test('remaps shuffled indexes while retaining the current shuffled track', () => {
    const result = prune({
        currentIndex: 1,
        shuffledIndexes: [3, 0, 2, 1],
        shuffleEnabled: true,
    });

    assert.deepEqual(result.defaultIds, ['first', 'second', 'fourth']);
    assert.deepEqual(result.shuffledIndexes, [2, 0, 1]);
    assert.equal(result.nextCurrentId, 'first');
    assert.equal(result.nextCurrentIndex, 1);
});

test('advances to the next valid track when the current track was deleted', () => {
    const result = prune({ currentIndex: 1, unavailableSongIds: ['song-2'] });

    assert.equal(result.currentRemoved, true);
    assert.equal(result.nextCurrentId, 'third');
    assert.equal(result.nextCurrentIndex, 1);
});

test('wraps to the first valid track when repeat all loses its final current track', () => {
    const result = prune({
        currentIndex: 3,
        repeatAll: true,
        unavailableSongIds: ['song-4'],
    });

    assert.equal(result.currentRemoved, true);
    assert.equal(result.nextCurrentId, 'first');
    assert.equal(result.nextCurrentIndex, 0);
});

test('stops when repeat is off and the deleted current track has no successor', () => {
    const result = prune({ currentIndex: 3, unavailableSongIds: ['song-4'] });

    assert.equal(result.currentRemoved, true);
    assert.equal(result.nextCurrentId, undefined);
    assert.equal(result.nextCurrentIndex, -1);
});

test('does not remove the same song id from a different server', () => {
    const result = prune({
        defaultIds: ['first', 'other-server'],
        songs: {
            first: songs.first,
            'other-server': { _serverId: 'server-2', id: 'song-2' },
        },
        unavailableSongIds: ['song-2'],
    });

    assert.deepEqual(result.defaultIds, ['first', 'other-server']);
    assert.deepEqual(result.removedUniqueIds, []);
});
