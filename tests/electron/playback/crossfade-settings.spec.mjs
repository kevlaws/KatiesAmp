import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const playingTime = (page) =>
    page.evaluate(() => {
        const active = [...document.querySelectorAll('audio')].find((audio) => !audio.paused);
        return active?.currentTime ?? 0;
    });

test('@full changes the crossfade duration without interrupting playback', async ({ page }) => {
    await login(page);
    await navigateTo(page, '/library/songs');

    const song = getSongCell(page, 'Automation Track 1');
    await expect(song).toBeVisible({ timeout: 15_000 });
    await song.dblclick();
    await expect.poll(() => playingTime(page)).toBeGreaterThan(0);

    await page.locator('.media-player').getByRole('button', { name: 'Settings' }).click();

    const duration = page.getByRole('slider', { name: 'Crossfade duration' });
    await expect(duration).toBeEnabled();
    await expect(duration).toHaveAttribute('aria-valuenow', '5');

    const timeBeforeChange = await playingTime(page);
    await duration.focus();
    await duration.press('ArrowRight');

    await expect(duration).toHaveAttribute('aria-valuenow', '6');
    await expect.poll(() => playingTime(page)).toBeGreaterThan(timeBeforeChange);
});
