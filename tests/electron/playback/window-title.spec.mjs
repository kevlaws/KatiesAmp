import {
    expect,
    getSongCell,
    login,
    navigateTo,
    packageVersion,
    test,
} from '../fixtures/katiesamp-test.mjs';

test('@full identifies the current playback and logged-in venue in the window title', async ({
    page,
}) => {
    await login(page);
    await navigateTo(page, '/library/songs');

    const song = getSongCell(page, 'Automation Track 1');
    await expect(song).toBeVisible({ timeout: 15_000 });
    await song.dblclick();

    const playingTitle = `(1 / 6) Automation Artist - Automation Track 1 - KatiesAmp v${packageVersion} - Admin`;
    await expect.poll(() => page.title()).toBe(playingTitle);
    expect(playingTitle).not.toContain('Automation Album');

    const playerBar = page.locator('.media-player');
    await playerBar.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(() => page.title()).toBe(`(Paused) ${playingTitle}`);
});
