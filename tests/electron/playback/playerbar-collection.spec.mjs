import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

test('@full player bar shows the Jellyfin playlist instead of track album metadata', async ({
    mockJellyfin,
    page,
}) => {
    await login(page);
    await navigateTo(page, '/playlists/playlist-1/songs');

    const firstSong = getSongCell(page, 'Automation Track 1');
    await expect(firstSong).toBeVisible({ timeout: 15_000 });
    await firstSong.dblclick();

    const playerBar = page.locator('.media-player');
    const collectionLink = playerBar.locator('.song-album a');
    await expect(collectionLink).toHaveText('Automation Playlist');
    await expect(collectionLink).toHaveAttribute('href', '#/playlists/playlist-1/songs');
    await expect(playerBar.getByText('Automation Album', { exact: true })).toHaveCount(0);

    await playerBar.getByRole('button', { exact: true, name: 'Next' }).click();
    await expect(playerBar.getByText('Automation Track 2', { exact: true })).toBeVisible();
    await expect(collectionLink).toHaveText('Automation Playlist');

    mockJellyfin.setAvailable(false);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    const restoredCollectionLink = page.locator('.media-player .song-album a');
    await expect(restoredCollectionLink).toHaveText('Automation Playlist');
    await expect(restoredCollectionLink).toHaveAttribute('href', '#/playlists/playlist-1/songs');
});

test('@full player bar keeps the authoritative album label when metadata differs', async ({
    mockJellyfin,
    page,
}) => {
    mockJellyfin.state.library.songs.forEach((song) => {
        song.Album = 'Embedded Metadata Album';
    });

    await login(page);
    await navigateTo(page, '/library/albums/album-1');

    const firstSong = getSongCell(page, 'Automation Track 1');
    await expect(firstSong).toBeVisible({ timeout: 15_000 });
    await firstSong.dblclick();

    const playerBar = page.locator('.media-player');
    const collectionLink = playerBar.locator('.song-album a');
    await expect(collectionLink).toHaveText('Automation Album');
    await expect(collectionLink).toHaveAttribute('href', '#/library/albums/album-1');
    await expect(playerBar.getByText('Embedded Metadata Album', { exact: true })).toHaveCount(0);

    mockJellyfin.setAvailable(false);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.media-player .song-album a')).toHaveText('Automation Album');
});

test('@full keeps collection and repeat state clear in the narrow player layout', async ({
    electronApp,
    page,
}) => {
    await login(page);
    await navigateTo(page, '/playlists/playlist-1/songs');

    const firstSong = getSongCell(page, 'Automation Track 1');
    await expect(firstSong).toBeVisible({ timeout: 15_000 });
    await firstSong.dblclick();

    await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(760, 700, false);
    });

    const mobilePlayerBar = page.locator('.media-player:visible');
    await expect(mobilePlayerBar).toHaveCount(1);
    const collectionLink = mobilePlayerBar.locator('.song-album a');
    await expect(collectionLink).toHaveText('Automation Playlist');
    await expect(collectionLink).toHaveAttribute('href', '#/playlists/playlist-1/songs');

    const mobileCoverArt = mobilePlayerBar.locator('.player-cover-art:visible');
    await expect(mobileCoverArt).toHaveCount(1);
    await mobileCoverArt.click();
    const repeatOff = page.locator(
        'button[aria-label="Repeat disabled"][aria-pressed="false"]:visible',
    );
    await expect(repeatOff).toHaveCount(1);
    const inactiveBackground = await repeatOff.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
    );

    await repeatOff.click();
    const repeatOne = page.locator('button[aria-label="Repeat one"][aria-pressed="true"]:visible');
    await expect(repeatOne).toHaveCount(1);
    await expect
        .poll(() => repeatOne.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(inactiveBackground);
});
