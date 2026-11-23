import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const openSignalPath = async (page) => {
    await page.getByRole('button', { name: 'Menu' }).click();
    const trigger = page.getByRole('menuitem', { name: 'Signal path' });
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    return page.getByTestId('signal-path-popout');
};

test('@full opens the compact signal path pop-out and reports only known playback telemetry', async ({
    page,
}) => {
    await login(page);

    const emptyDialog = await openSignalPath(page);
    await expect(emptyDialog).toContainText('Play a track to see its live signal path.');
    await expect(page.locator('.mantine-Modal-overlay')).toHaveCount(0);
    const emptyBounds = await emptyDialog.boundingBox();
    expect(emptyBounds).not.toBeNull();
    expect(emptyBounds.width).toBeLessThanOrEqual(480);
    expect(emptyBounds.height).toBeLessThanOrEqual(700);
    await page.keyboard.press('Escape');
    await expect(emptyDialog).not.toBeVisible();

    await navigateTo(page, '/library/songs');
    const song = getSongCell(page, 'Automation Track 1');
    await expect(song).toBeVisible({ timeout: 15_000 });
    await song.dblclick();
    await expect(page.locator('.media-player')).toContainText('Automation Track 1');

    const signalPath = await openSignalPath(page);
    await expect(signalPath).toContainText('Automation Track 1');
    await expect(signalPath).toContainText('Live signal');

    const sourceStage = signalPath.getByText('Source', { exact: true }).locator('..');
    await expect(sourceStage).toContainText('Server stream');
    await expect(sourceStage).toContainText('Received format is not reported');
    await expect(sourceStage).toContainText('library source PCM_S16LE');
    await expect(sourceStage).toContainText('128 kbps');
    await expect(sourceStage).toContainText('8 kHz');
    await expect(sourceStage).toContainText('Mono');
    await expect(sourceStage).not.toContainText('PCM_S16LE · Server stream');

    const decoderStage = signalPath.getByText('Decoder', { exact: true }).locator('..');
    await expect(decoderStage).toContainText('Chromium media decoder');
    await expect(decoderStage).toContainText('32-bit float (Web Audio)');

    const levellingStage = signalPath.getByText('Volume levelling', { exact: true }).locator('..');
    await expect(levellingStage).toContainText('Natural · +18.0 dB', { timeout: 10_000 });
    await expect(levellingStage).toContainText('Live applied gain · track metadata');

    const boostStage = signalPath.getByText('Venue output boost', { exact: true }).locator('..');
    await expect(boostStage).toContainText('+3.0 dB');

    const limiterStage = signalPath
        .getByText('Final peak protection', { exact: true })
        .locator('..');
    await expect(limiterStage).toContainText('Enabled · -1.0 dB compressor target');
    await expect(limiterStage).toContainText('not a mathematical brick-wall limiter');

    const resamplerStage = signalPath.getByText('Resampler', { exact: true }).locator('..');
    await expect(resamplerStage).toContainText('Unavailable');
    await expect(resamplerStage).toContainText('Decoded source rate is not reported');

    await page.keyboard.press('Escape');
    await expect(signalPath).not.toBeVisible();

    // Downloading the current song does not replace the source already loaded
    // by the player. Mere offline availability must not be presented as active
    // offline playback or as a known decoded source rate.
    await song.click({ button: 'right' });
    await page.getByText('Download for offline use', { exact: true }).click();
    await expect
        .poll(() =>
            page.evaluate(() =>
                window.api.offline
                    .list()
                    .then((entries) => entries.some((entry) => entry.song.id === 'song-1')),
            ),
        )
        .toBe(true);

    const offlineAvailableSignalPath = await openSignalPath(page);
    const offlineSourceStage = offlineAvailableSignalPath
        .getByText('Source', { exact: true })
        .locator('..');
    await expect(offlineSourceStage).toContainText('Playback source not reported');
    await expect(offlineSourceStage).toContainText('Offline copy available');

    const offlineResamplerStage = offlineAvailableSignalPath
        .getByText('Resampler', { exact: true })
        .locator('..');
    await expect(offlineResamplerStage).toContainText('Unavailable');
    await expect(offlineResamplerStage).toContainText('Decoded source rate is not reported');
});
