import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

test('@nightly starts a fixture track from the songs library', async ({ mockJellyfin, page }) => {
    await login(page);
    await navigateTo(page, '/library/songs');
    const song = getSongCell(page, 'Automation Track 1');
    await expect(song).toBeVisible({ timeout: 15_000 });
    await song.dblclick();
    await expect(page.getByText('Automation Track 1', { exact: true }).last()).toBeVisible();
    await expect
        .poll(() =>
            mockJellyfin.state.requests.some(
                (request) =>
                    request.pathname.toLowerCase().includes('/audio/song-1/') ||
                    request.pathname.toLowerCase().includes('/items/song-1/download'),
            ),
        )
        .toBe(true);
});

test('@full adds a song next without interrupting the current track', async ({ page }) => {
    await login(page);
    await navigateTo(page, '/library/album-artists/artist-1');

    const firstSong = getSongCell(page, 'Automation Track 6');
    await expect(firstSong).toBeVisible({ timeout: 15_000 });
    await firstSong.dblclick();

    const playerBar = page.locator('.media-player');
    await expect(playerBar.getByText('Automation Track 6', { exact: true })).toBeVisible();

    await getSongCell(page, 'Automation Track 2').click({ button: 'right' });
    await page.getByRole('menuitem', { exact: true, name: 'Add to queue next' }).click();

    await expect(playerBar.getByText('Automation Track 6', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'View queue' }).click();
    await expect(
        page.locator('#sidebar-queue').getByText('Automation Track 2', { exact: true }).first(),
    ).toBeVisible();
});

test('@full fades into the next queued track without advancing twice', async ({ page }) => {
    await login(page);
    await navigateTo(page, '/library/songs');

    const firstSong = getSongCell(page, 'Automation Track 1');
    await expect(firstSong).toBeVisible({ timeout: 15_000 });
    await firstSong.dblclick();

    const playerBar = page.locator('.media-player');
    const fadeToNext = playerBar.getByRole('button', { name: 'Fade to next' });
    await expect(fadeToNext).toBeEnabled();
    await fadeToNext.click();
    await expect(fadeToNext).toBeDisabled();

    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    [...document.querySelectorAll('audio')].filter((audio) => !audio.paused).length,
            ),
        )
        .toBeGreaterThan(1);

    await expect(playerBar.getByText('Automation Track 2', { exact: true })).toBeVisible({
        timeout: 8_000,
    });
    await expect(fadeToNext).toBeEnabled();
    await page.getByRole('button', { name: 'View queue' }).click();
    const queue = page.locator('#sidebar-queue');
    await expect(queue.getByText('Automation Track 2', { exact: true }).first()).toBeVisible();
    await expect(queue.getByText('Automation Track 3', { exact: true }).first()).toBeVisible();
});

test('@full ignores an ended event from the inactive Web player', async ({ page }) => {
    await login(page);
    await navigateTo(page, '/library/songs');

    const firstSong = getSongCell(page, 'Automation Track 1');
    await expect(firstSong).toBeVisible({ timeout: 15_000 });
    await firstSong.dblclick();

    const playerBar = page.locator('.media-player');
    await expect(playerBar.getByText('Automation Track 1', { exact: true })).toBeVisible();
    await expect.poll(() => page.locator('audio').count()).toBe(2);
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    [...document.querySelectorAll('audio')].filter((audio) => !audio.paused).length,
            ),
        )
        .toBe(1);

    await page.evaluate(() => {
        const inactive = [...document.querySelectorAll('audio')].find((audio) => audio.paused);
        if (!inactive) throw new Error('Inactive Web player was not found');
        inactive.dispatchEvent(new Event('ended'));
    });

    await expect(playerBar.getByText('Automation Track 1', { exact: true })).toBeVisible();
});

test('@full does not restart the incoming track when manual fade is pressed during crossfade', async ({
    page,
}) => {
    await login(page);
    await navigateTo(page, '/library/songs');

    const firstSong = getSongCell(page, 'Automation Track 1');
    await expect(firstSong).toBeVisible({ timeout: 15_000 });
    await firstSong.dblclick();

    await expect
        .poll(() =>
            page.evaluate(() => {
                const active = [...document.querySelectorAll('audio')].find(
                    (audio) => !audio.paused,
                );
                return active?.duration ?? 0;
            }),
        )
        .toBeGreaterThan(0);

    const incomingIndex = await page.evaluate(() => {
        const players = [...document.querySelectorAll('audio')];
        const activeIndex = players.findIndex((audio) => !audio.paused);
        const active = players[activeIndex];
        if (!active || !Number.isFinite(active.duration)) {
            throw new Error('Active Web player was not ready');
        }
        active.currentTime = Math.max(0, active.duration - 3.5);
        return activeIndex === 0 ? 1 : 0;
    });

    await expect
        .poll(() =>
            page.evaluate(
                (index) => [...document.querySelectorAll('audio')][index]?.currentTime ?? 0,
                incomingIndex,
            ),
        )
        .toBeGreaterThan(0.7);

    const beforeFadeClick = await page.evaluate(
        (index) => [...document.querySelectorAll('audio')][index]?.currentTime ?? 0,
        incomingIndex,
    );
    await page.locator('.media-player').getByRole('button', { name: 'Fade to next' }).click();
    await page.waitForTimeout(300);
    const afterFadeClick = await page.evaluate(
        (index) => [...document.querySelectorAll('audio')][index]?.currentTime ?? 0,
        incomingIndex,
    );

    expect(afterFadeClick).toBeGreaterThan(beforeFadeClick);
});
