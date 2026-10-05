import assert from 'node:assert/strict';
import test from 'node:test';

import { KATIESAMP_DEFAULT_UI_SETTINGS } from '../src/renderer/store/default-ui-settings.ts';

test('clean installs use the captured KatiesAmp navigation content', () => {
    assert.deepEqual(KATIESAMP_DEFAULT_UI_SETTINGS.sidebarEnabledItems, [
        'Home',
        'Albums',
        'Tracks',
        'Artists-all',
        'Settings',
    ]);
});

test('clean installs use the captured KatiesAmp presentation settings', () => {
    assert.deepEqual(KATIESAMP_DEFAULT_UI_SETTINGS.general, {
        combinedLyricsAndVisualizer: true,
        externalLinks: false,
        homeFeatureStyle: 'multiple',
        showRatings: false,
        showVisualizerInSidebar: false,
    });
    assert.deepEqual(KATIESAMP_DEFAULT_UI_SETTINGS.fullScreenPlayer, {
        activeTab: 'queue',
    });
});

test('clean installs use the captured album, artist, track, and queue columns', () => {
    const columnIds = (list) => [...list.enabledColumns];

    assert.deepEqual(columnIds(KATIESAMP_DEFAULT_UI_SETTINGS.lists.album), [
        'rowIndex',
        'titleCombined',
        'duration',
    ]);
    assert.equal(KATIESAMP_DEFAULT_UI_SETTINGS.lists.album.display, 'table');

    assert.deepEqual(columnIds(KATIESAMP_DEFAULT_UI_SETTINGS.lists.artist), ['imageUrl', 'name']);
    assert.equal(KATIESAMP_DEFAULT_UI_SETTINGS.lists.artist.display, 'table');

    assert.deepEqual(columnIds(KATIESAMP_DEFAULT_UI_SETTINGS.lists.song), [
        'rowIndex',
        'titleCombined',
        'duration',
        'album',
    ]);
    assert.deepEqual(columnIds(KATIESAMP_DEFAULT_UI_SETTINGS.lists.albumDetail), [
        'name',
        'artists',
        'duration',
    ]);
    assert.deepEqual(columnIds(KATIESAMP_DEFAULT_UI_SETTINGS.lists.sideQueue), [
        'rowIndex',
        'titleCombined',
        'duration',
    ]);
});

test('clean installs preserve the remaining captured list columns', () => {
    const listColumns = Object.fromEntries(
        Object.entries(KATIESAMP_DEFAULT_UI_SETTINGS.lists).map(([key, list]) => [
            key,
            [...list.enabledColumns],
        ]),
    );

    assert.deepEqual(listColumns, {
        album: ['rowIndex', 'titleCombined', 'duration'],
        albumArtist: ['rowIndex', 'imageUrl', 'name', 'userFavorite'],
        albumDetail: ['name', 'artists', 'duration'],
        artist: ['imageUrl', 'name'],
        fullScreen: ['titleCombined', 'duration', 'album', 'userFavorite'],
        genre: ['rowIndex', 'name', 'songCount', 'albumCount'],
        playlist: ['rowIndex', 'name', 'duration', 'songCount'],
        playlistAlbum: [
            'rowIndex',
            'titleCombined',
            'duration',
            'genres',
            'releaseYear',
            'userFavorite',
        ],
        playlistSong: ['rowIndex', 'titleCombined', 'duration', 'year', 'userFavorite'],
        queueSong: [
            'rowIndex',
            'titleCombined',
            'duration',
            'album',
            'genres',
            'year',
            'userFavorite',
        ],
        sideQueue: ['rowIndex', 'titleCombined', 'duration'],
        song: ['rowIndex', 'titleCombined', 'duration', 'album'],
    });
});

test('captured content defaults do not fix panel or column dimensions', () => {
    assert.equal('app' in KATIESAMP_DEFAULT_UI_SETTINGS, false);
    assert.doesNotMatch(JSON.stringify(KATIESAMP_DEFAULT_UI_SETTINGS), /"width"/i);
});
