import { promises as fs } from 'node:fs';

import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const tasks = (page) => page.evaluate(() => window.api.offline.listDownloadTasks());

const waitForLatestTask = (page, state) =>
    expect.poll(async () => (await tasks(page)).at(-1)?.state, { timeout: 20_000 }).toBe(state);

const waitForOfflineEntryCount = (page, count) =>
    expect
        .poll(() => page.evaluate(() => window.api.offline.list().then((items) => items.length)))
        .toBe(count);

const downloadRequestCount = (mockJellyfin, songId) =>
    mockJellyfin.state.requests.filter(
        (request) => request.pathname.toLowerCase() === `/items/${songId.toLowerCase()}/download`,
    ).length;

const resolveOfflineSong = (page, songId) =>
    page.evaluate(async (id) => {
        const entry = (await window.api.offline.list()).find((item) => item.song.id === id);
        return entry ? window.api.offline.resolve(entry.song._serverId, id) : null;
    }, songId);

const downloadAlbum = async (page) => {
    await navigateTo(page, '/library/albums/album-1');
    const heading = page.getByRole('heading', { level: 1, name: 'Automation Album' });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await heading
        .locator('..')
        .getByRole('button', { name: /^Download(?: for offline use)?$/ })
        .click();
    await waitForLatestTask(page, 'complete');
    await waitForOfflineEntryCount(page, 6);
    await expect(
        heading.locator('..').getByRole('button', { name: 'Remove offline download' }),
    ).toBeVisible();
    return heading;
};

const removeOfflineTrack = async (page, name) => {
    const song = getSongCell(page, name);
    await expect(song).toBeVisible({ timeout: 15_000 });
    await song.click({ button: 'right' });
    await page.getByRole('menuitem', { exact: true, name: 'Remove offline download' }).click();
};

test('@full completes a partial album without re-downloading valid tracks', async ({
    mockJellyfin,
    page,
}) => {
    await login(page);
    const heading = await downloadAlbum(page);
    const retainedSource = await resolveOfflineSong(page, 'song-1');
    expect(retainedSource).not.toBeNull();
    const retainedStatBefore = await fs.stat(retainedSource.filePath);
    const requestCountsBefore = Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => {
            const songId = `song-${index + 1}`;
            return [songId, downloadRequestCount(mockJellyfin, songId)];
        }),
    );

    await removeOfflineTrack(page, 'Automation Track 6');
    await waitForOfflineEntryCount(page, 5);
    expect(
        await page.evaluate(() =>
            window.api.offline.listAlbums().then((albums) => albums[0]?.songIds.length),
        ),
    ).toBe(6);

    const completeButton = heading
        .locator('..')
        .getByRole('button', { name: 'Download remaining track (1)' });
    await expect(completeButton).toBeVisible();
    await completeButton.click();

    await waitForOfflineEntryCount(page, 6);
    await expect(
        heading.locator('..').getByRole('button', { name: 'Remove offline download' }),
    ).toBeVisible();
    expect((await tasks(page)).at(-1)?.automatic).not.toBe(true);
    expect(downloadRequestCount(mockJellyfin, 'song-6')).toBe(requestCountsBefore['song-6'] + 1);
    for (const songId of ['song-1', 'song-2', 'song-3', 'song-4', 'song-5']) {
        expect(downloadRequestCount(mockJellyfin, songId)).toBe(requestCountsBefore[songId]);
    }

    const retainedSourceAfter = await resolveOfflineSong(page, 'song-1');
    expect(retainedSourceAfter?.filePath).toBe(retainedSource.filePath);
    expect((await fs.stat(retainedSourceAfter.filePath)).mtimeMs).toBe(retainedStatBefore.mtimeMs);
});

test('@nightly restores a missing middle track in server order', async ({ mockJellyfin, page }) => {
    await login(page);
    await downloadAlbum(page);

    const result = await page.evaluate(
        async ({ serverUrl }) => {
            const [album] = await window.api.offline.listAlbums();
            const entries = await window.api.offline.list();
            const originalOrder = album.songIds;
            const tracks = entries.map((entry) => ({
                song: entry.song,
                url: `${serverUrl}/Items/${entry.song.id}/Download`,
            }));
            await window.api.offline.syncAlbum({
                album,
                tracks: tracks.filter((track) => track.song.id !== 'song-3'),
            });
            const reducedOrder = (await window.api.offline.listAlbums())[0].songIds;
            await window.api.offline.syncAlbum({
                album,
                preserveExisting: true,
                tracks,
            });
            return {
                originalOrder,
                reducedOrder,
                restoredOrder: (await window.api.offline.listAlbums())[0].songIds,
            };
        },
        { serverUrl: mockJellyfin.url },
    );

    expect(result.reducedOrder).toEqual(result.originalOrder.filter((id) => id !== 'song-3'));
    expect(result.restoredOrder).toEqual(result.originalOrder);
});

test('@nightly completes a partial playlist from its context menu', async ({
    mockJellyfin,
    page,
}) => {
    await login(page);
    await navigateTo(page, '/playlists');
    let playlist = page.getByText('Automation Playlist', { exact: true }).first();
    await expect(playlist).toBeVisible({ timeout: 15_000 });
    await playlist.click({ button: 'right' });
    await page
        .getByRole('menuitem', { exact: true, name: 'Keep playlist available offline' })
        .click();
    await waitForLatestTask(page, 'complete');
    await waitForOfflineEntryCount(page, 6);

    await navigateTo(page, '/playlists/playlist-1/songs');
    await expect(page.getByRole('heading', { level: 1, name: 'Automation Playlist' })).toBeVisible({
        timeout: 15_000,
    });
    const requestCountsBefore = Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => {
            const songId = `song-${index + 1}`;
            return [songId, downloadRequestCount(mockJellyfin, songId)];
        }),
    );
    await removeOfflineTrack(page, 'Automation Track 6');
    await waitForOfflineEntryCount(page, 5);

    await navigateTo(page, '/playlists');
    playlist = page.getByText('Automation Playlist', { exact: true }).first();
    await expect(playlist).toBeVisible({ timeout: 15_000 });
    await playlist.click({ button: 'right' });
    const completeAction = page.getByRole('menuitem', {
        exact: true,
        name: 'Download remaining track (1)',
    });
    await expect(completeAction).toBeVisible();
    await expect(
        page.getByRole('menuitem', { exact: true, name: 'Remove downloaded tracks' }),
    ).toBeVisible();
    await completeAction.click();

    await waitForOfflineEntryCount(page, 6);
    expect(downloadRequestCount(mockJellyfin, 'song-6')).toBe(requestCountsBefore['song-6'] + 1);
    for (const songId of ['song-1', 'song-2', 'song-3', 'song-4', 'song-5']) {
        expect(downloadRequestCount(mockJellyfin, songId)).toBe(requestCountsBefore[songId]);
    }

    await playlist.click({ button: 'right' });
    await expect(
        page.getByRole('menuitem', {
            exact: true,
            name: 'Stop keeping playlist offline',
        }),
    ).toBeVisible();
});

test('@nightly records duplicate playlist positions without downloading a track twice', async ({
    page,
}) => {
    await login(page);
    await navigateTo(page, '/playlists');
    const playlist = page.getByText('Automation Playlist', { exact: true }).first();
    await expect(playlist).toBeVisible({ timeout: 15_000 });
    await playlist.click({ button: 'right' });
    await page
        .getByRole('menuitem', { exact: true, name: 'Keep playlist available offline' })
        .click();
    await waitForLatestTask(page, 'complete');
    await waitForOfflineEntryCount(page, 6);

    const result = await page.evaluate(async () => {
        const [storedPlaylist] = await window.api.offline.listPlaylists();
        const tracks = (await window.api.offline.list()).map((entry) => ({
            song: entry.song,
            url: 'http://127.0.0.1/existing-file-must-not-download',
        }));
        const sync = await window.api.offline.syncPlaylist({
            playlist: storedPlaylist,
            tracks: [...tracks, tracks[0]],
        });
        return {
            playlist: (await window.api.offline.listPlaylists())[0],
            sync,
        };
    });

    expect(result.sync).toMatchObject({ downloaded: 0, removed: 0, unchanged: 6 });
    expect(result.playlist.songIds).toHaveLength(6);
    expect(result.playlist.trackCount).toBe(7);
});

test('@nightly preserves a partial album when downloading a remaining track fails', async ({
    mockJellyfin,
    page,
}) => {
    await login(page);
    const heading = await downloadAlbum(page);
    const missingSong = await page.evaluate(async () => {
        const entry = (await window.api.offline.list()).find((item) => item.song.id === 'song-6');
        return entry?.song;
    });
    expect(missingSong).toBeDefined();
    await removeOfflineTrack(page, 'Automation Track 6');
    await waitForOfflineEntryCount(page, 5);
    const retainedSource = await resolveOfflineSong(page, 'song-1');
    expect(retainedSource).not.toBeNull();

    mockJellyfin.setFailedDownloadIds(['song-6']);
    await heading
        .locator('..')
        .getByRole('button', { name: 'Download remaining track (1)' })
        .click();

    await expect(page.getByText('Could not save items for offline playback')).toBeVisible();
    await waitForOfflineEntryCount(page, 5);
    expect(await resolveOfflineSong(page, 'song-1')).toMatchObject({
        filePath: retainedSource.filePath,
    });
    await expect(
        heading.locator('..').getByRole('button', { name: 'Retry remaining track (1)' }),
    ).toBeVisible();

    mockJellyfin.setFailedDownloadIds([]);
    const silentRepair = await page.evaluate(
        async ({ song, url }) => {
            const [album] = await window.api.offline.listAlbums();
            return window.api.offline.syncAlbum({
                album,
                preserveExisting: true,
                silent: true,
                tracks: [{ song, url: `${url}/Items/song-6/Download` }],
            });
        },
        { song: missingSong, url: mockJellyfin.url },
    );
    expect(silentRepair).toMatchObject({ downloaded: 1, removed: 0 });
    await waitForOfflineEntryCount(page, 6);

    await page.reload();
    await navigateTo(page, '/library/albums/album-1');
    const reloadedHeading = page.getByRole('heading', {
        level: 1,
        name: 'Automation Album',
    });
    await expect(
        reloadedHeading.locator('..').getByRole('button', {
            name: 'Remove offline download',
        }),
    ).toBeVisible({ timeout: 15_000 });
});

test('@nightly additive completion never removes entries omitted by an incomplete inventory', async ({
    page,
}) => {
    await login(page);
    await downloadAlbum(page);

    const result = await page.evaluate(async () => {
        const [album] = await window.api.offline.listAlbums();
        const entries = await window.api.offline.list();
        const tracks = entries.map((entry) => ({
            song: entry.song,
            url: 'http://127.0.0.1/existing-file-must-not-download',
        }));
        await window.api.offline.syncAlbum({
            album: { ...album, automatic: true },
            tracks,
        });
        const sync = await window.api.offline.syncAlbum({
            album: {
                id: album.id,
                name: album.name,
                serverId: album.serverId,
            },
            preserveExisting: true,
            tracks: tracks.slice(0, 2),
        });
        return {
            album: (await window.api.offline.listAlbums())[0],
            entries: await window.api.offline.list(),
            sync,
        };
    });

    expect(result.sync).toMatchObject({ downloaded: 0, removed: 0, unchanged: 2 });
    expect(result.album.automatic).toBe(true);
    expect(result.album.songIds).toHaveLength(6);
    expect(result.entries).toHaveLength(6);
});
