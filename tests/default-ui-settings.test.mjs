import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addLiveMusicSidebarItem,
    KATIESAMP_DEFAULT_UI_SETTINGS,
    KATIESAMP_SIDEBAR_MIGRATION_VERSION,
    migrateKatiesAmpSidebarSettings,
} from '../src/renderer/store/default-ui-settings.ts';

test('clean installs use the captured KatiesAmp navigation content', () => {
    assert.deepEqual(KATIESAMP_DEFAULT_UI_SETTINGS.sidebarEnabledItems, [
        'Home',
        'Tracks',
        'Artists-all',
        'Live music',
        'Settings',
    ]);
});

const sidebarState = (enabledIds) => ({
    general: {
        sidebarItems: ['Home', 'Albums', 'Tracks', 'Artists-all', 'Settings', 'Playlists'].map(
            (id) => ({
                disabled: !enabledIds.includes(id),
                id,
            }),
        ),
    },
});

test('upgrading adds Live music before Settings once and preserves customised navigation', () => {
    const original = [
        { disabled: true, id: 'Artists' },
        { disabled: false, id: 'Settings' },
        { disabled: false, id: 'Home' },
    ];
    const items = [...original];
    const entry = { disabled: false, id: 'Live music', route: '/live-music' };
    addLiveMusicSidebarItem(items, entry);
    addLiveMusicSidebarItem(items, entry);
    assert.deepEqual(items, [original[0], entry, original[1], original[2]]);
    const minimal = [original[0]];
    addLiveMusicSidebarItem(minimal, entry);
    assert.deepEqual(minimal, [original[0], entry]);
});

test('v1.2.0 sidebar defaults migrate without Albums', () => {
    const state = sidebarState(['Home', 'Albums', 'Tracks', 'Artists-all', 'Settings']);

    migrateKatiesAmpSidebarSettings(state, KATIESAMP_SIDEBAR_MIGRATION_VERSION - 1);

    assert.deepEqual(
        state.general.sidebarItems.filter((item) => !item.disabled).map((item) => item.id),
        ['Home', 'Tracks', 'Artists-all', 'Settings'],
    );
});

test('sidebar migration preserves an administrator-customised layout', () => {
    const state = sidebarState([
        'Home',
        'Albums',
        'Tracks',
        'Artists-all',
        'Settings',
        'Playlists',
    ]);

    migrateKatiesAmpSidebarSettings(state, KATIESAMP_SIDEBAR_MIGRATION_VERSION - 1);

    assert.equal(state.general.sidebarItems.find((item) => item.id === 'Albums').disabled, false);
});

test('current sidebar settings are not remigrated', () => {
    const state = sidebarState(['Home', 'Albums', 'Tracks', 'Artists-all', 'Settings']);

    migrateKatiesAmpSidebarSettings(state, KATIESAMP_SIDEBAR_MIGRATION_VERSION);

    assert.equal(state.general.sidebarItems.find((item) => item.id === 'Albums').disabled, false);
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
        dynamicBackground: false,
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
