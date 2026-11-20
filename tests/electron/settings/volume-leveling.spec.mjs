import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const administratorPassword = 'volume-leveling-test-password';

const unlockSettingsIfNeeded = async (page) => {
    const dialog = page.getByRole('dialog', { name: 'Administrator access' });
    const heading = page.getByRole('heading', { name: 'Settings' });
    await expect(dialog.or(heading)).toBeVisible();
    if (await heading.isVisible()) return;

    await dialog
        .getByRole('textbox', { exact: true, name: 'Administrator password' })
        .fill(administratorPassword);

    const confirmation = dialog.getByRole('textbox', {
        exact: true,
        name: 'Confirm administrator password',
    });
    if (await confirmation.isVisible().catch(() => false)) {
        await confirmation.fill(administratorPassword);
        await dialog.getByRole('button', { name: 'Set password and continue' }).click();
        return;
    }

    await dialog.getByRole('button', { name: 'Unlock' }).click();
};

const openPlaybackSettings = async (page) => {
    await navigateTo(page, '/settings');
    await unlockSettingsIfNeeded(page);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('tab', { name: 'Playback' }).click();
};

const selectOption = async (page, combobox, option) => {
    await combobox.click();
    await page.getByRole('option', { exact: true, name: option }).click();
};

const playingTime = (page) =>
    page.evaluate(() => {
        const active = [...document.querySelectorAll('audio')].find((audio) => !audio.paused);
        return active?.currentTime ?? 0;
    });

test('@full configures and restores automatic volume levelling', async ({ page }) => {
    await login(page);
    await openPlaybackSettings(page);

    const enabled = page.getByRole('switch', { name: 'Automatic volume levelling' });
    const profile = page.getByRole('combobox', { name: 'Volume levelling profile' });
    const venueBoost = page.getByRole('combobox', { name: 'Venue output boost' });

    await expect(enabled).toBeChecked();
    await expect(profile).toHaveValue('Natural');
    await expect(venueBoost).toHaveValue('+3 dB (default)');

    await selectOption(page, venueBoost, '+6 dB');
    await expect(venueBoost).toHaveValue('+6 dB');

    await selectOption(page, profile, 'Tavern');
    await expect(profile).toHaveValue('Tavern');

    await page.reload();
    await openPlaybackSettings(page);
    await expect(profile).toHaveValue('Tavern');
    await expect(venueBoost).toHaveValue('+6 dB');

    await enabled.uncheck({ force: true });
    await expect(profile).toHaveCount(0);
    await expect(venueBoost).toBeVisible();

    await page.reload();
    await openPlaybackSettings(page);
    await expect(enabled).not.toBeChecked();
    await expect(profile).toHaveCount(0);
    await expect(venueBoost).toHaveValue('+6 dB');

    await enabled.check({ force: true });
    await expect(profile).toHaveValue('Natural');
});

test('@full exposes volume levelling for Web and MPV playback', async ({ page }) => {
    await login(page);
    await openPlaybackSettings(page);

    const audioPlayer = page.getByRole('combobox', { name: 'Audio player' });
    const enabled = page.getByRole('switch', { name: 'Automatic volume levelling' });
    const profile = page.getByRole('combobox', { name: 'Volume levelling profile' });
    const venueBoost = page.getByRole('combobox', { name: 'Venue output boost' });

    await expect(audioPlayer).toHaveValue('Web');
    await expect(enabled).toBeVisible();
    await expect(profile).toBeVisible();
    await expect(venueBoost).toBeVisible();

    await selectOption(page, audioPlayer, 'MPV');
    await expect(audioPlayer).toHaveValue('MPV');
    await expect(enabled).toBeVisible();
    await expect(profile).toBeVisible();
    await expect(venueBoost).toBeVisible();
});

test('@full changes venue audio controls from the player settings menu', async ({ page }) => {
    await login(page);
    await navigateTo(page, '/library/songs');

    const song = getSongCell(page, 'Automation Track 1');
    await expect(song).toBeVisible({ timeout: 15_000 });
    await song.dblclick();
    await expect.poll(() => playingTime(page)).toBeGreaterThan(0);

    const player = page.locator('.media-player');
    await player.getByRole('button', { name: 'Settings' }).click();

    const profile = page.getByRole('combobox', { name: 'Volume levelling profile' });
    const venueBoost = page.getByRole('combobox', { name: 'Venue output boost' });
    await expect(profile).toHaveValue('Natural');
    await expect(venueBoost).toHaveValue('+3 dB (default)');

    const timeBeforeChange = await playingTime(page);
    await selectOption(page, profile, 'Tavern');
    await expect
        .poll(() =>
            page.evaluate(() => window.__katiesAmpAudioAutomation?.dsp?.leveler.ratio.value),
        )
        .toBeCloseTo(1.5, 5);

    await selectOption(page, venueBoost, '+6 dB');
    await expect
        .poll(() =>
            page.evaluate(() => window.__katiesAmpAudioAutomation?.dsp?.venueOutputGain.gain.value),
        )
        .toBeCloseTo(10 ** (6 / 20), 5);
    await expect.poll(() => playingTime(page)).toBeGreaterThan(timeBeforeChange);

    await page.reload();
    await player.getByRole('button', { name: 'Settings' }).click();
    await expect(profile).toHaveValue('Tavern');
    await expect(venueBoost).toHaveValue('+6 dB');

    await page.getByRole('heading', { name: 'Tracks' }).click();
    await expect(profile).toHaveCount(0);
    await openPlaybackSettings(page);
    await expect(profile).toHaveValue('Tavern');
    await expect(venueBoost).toHaveValue('+6 dB');

    const enabled = page.getByRole('switch', { name: 'Automatic volume levelling' });
    await enabled.uncheck({ force: true });
    await navigateTo(page, '/library/songs');
    await player.getByRole('button', { name: 'Settings' }).click();
    await expect(profile).toHaveValue('');
    await expect(profile).toHaveAttribute('placeholder', 'Off - select a profile');

    await selectOption(page, profile, 'Natural');
    await page.getByRole('heading', { name: 'Tracks' }).click();
    await expect(profile).toHaveCount(0);
    await openPlaybackSettings(page);
    await expect(enabled).toBeChecked();
    await expect(profile).toHaveValue('Natural');
});
