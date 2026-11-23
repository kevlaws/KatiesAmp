import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const playingTime = (page) =>
    page.evaluate(() => {
        const active = [...document.querySelectorAll('audio')].find((audio) => !audio.paused);
        return active?.currentTime ?? 0;
    });

const playingAudioCount = (page) =>
    page.evaluate(
        () => [...document.querySelectorAll('audio')].filter((audio) => !audio.paused).length,
    );

const seedLegacyCrossfadeDuration = (page, duration) =>
    page.evaluate(
        ({ savedDuration }) =>
            new Promise((resolve, reject) => {
                const request = indexedDB.open('keyval-store');
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const database = request.result;
                    const transaction = database.transaction('keyval', 'readwrite');
                    transaction.onerror = () => reject(transaction.error);
                    transaction.oncomplete = () => {
                        database.close();
                        resolve(undefined);
                    };
                    transaction.objectStore('keyval').put(
                        JSON.stringify({
                            state: { player: { crossfadeDuration: savedDuration } },
                            version: 3,
                        }),
                        'player-store',
                    );
                };
            }),
        { savedDuration: duration },
    );

test('@full defaults crossfade to 21 seconds and preserves an edited duration', async ({
    page,
}) => {
    await login(page);
    await navigateTo(page, '/library/songs');

    const song = getSongCell(page, 'Automation Track 1');
    await expect(song).toBeVisible({ timeout: 15_000 });
    await song.dblclick();
    await expect.poll(() => playingTime(page)).toBeGreaterThan(0);

    await page.locator('.media-player').getByRole('button', { name: 'Settings' }).click();

    const duration = page.getByRole('slider', { name: 'Crossfade duration' });
    await expect(duration).toBeEnabled();
    await expect(duration).toHaveAttribute('aria-valuenow', '21');

    const timeBeforeChange = await playingTime(page);
    await duration.focus();
    await duration.press('ArrowLeft');

    await expect(duration).toHaveAttribute('aria-valuenow', '20');
    await expect.poll(() => playingTime(page)).toBeGreaterThan(timeBeforeChange);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.media-player').getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('slider', { name: 'Crossfade duration' })).toHaveAttribute(
        'aria-valuenow',
        '20',
    );
});

test('@full caps a 21-second crossfade to the shorter incoming track', async ({
    mockJellyfin,
    page,
}) => {
    mockJellyfin.setSongDuration('song-1', 60);
    await login(page);
    await navigateTo(page, '/library/songs');

    const song = getSongCell(page, 'Automation Track 1');
    await expect(song).toBeVisible({ timeout: 15_000 });
    await song.dblclick();

    await page.waitForFunction(() =>
        [...document.querySelectorAll('audio')].some(
            (audio) => !audio.paused && Number.isFinite(audio.duration) && audio.duration > 0,
        ),
    );
    await page.evaluate(() => {
        const audioElements = [...document.querySelectorAll('audio')];
        const active = audioElements.find((audio) => !audio.paused);
        if (!active) throw new Error('No active audio element is available');

        active.dataset.crossfadeTestActive = 'true';
        active.currentTime = 40;
    });

    await expect.poll(() => playingAudioCount(page)).toBe(1);
    await page.waitForTimeout(1_500);
    await expect.poll(() => playingAudioCount(page)).toBe(1);

    await page.evaluate(() => {
        const active = document.querySelector('audio[data-crossfade-test-active="true"]');
        if (!active) throw new Error('No active audio element is available');
        active.currentTime = 54.5;
    });
    await expect.poll(() => playingAudioCount(page)).toBe(2);
});

test('@full preserves a legacy five-second crossfade during store hydration', async ({ page }) => {
    await login(page);
    await seedLegacyCrossfadeDuration(page, 5);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.media-player').getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByRole('slider', { name: 'Crossfade duration' })).toHaveAttribute(
        'aria-valuenow',
        '5',
    );
});
