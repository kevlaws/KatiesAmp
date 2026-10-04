import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const waitForActiveAudio = async (page, expectedTitle) => {
    await expect(
        page.locator('.media-player').getByText(expectedTitle, { exact: true }),
    ).toBeVisible();
    await expect
        .poll(() =>
            page.evaluate(() =>
                [...document.querySelectorAll('audio')].some(
                    (audio) => !audio.paused && audio.currentTime > 0,
                ),
            ),
        )
        .toBe(true);
};

const measureOutput = (page, sampleCount = 16) =>
    page.evaluate(async (count) => {
        const automation = window.__katiesAmpAudioAutomation;
        if (!automation?.dsp?.outputAnalyser) {
            throw new Error('KatiesAmp Web Audio automation probe is unavailable');
        }
        if (automation.context.state !== 'running') await automation.context.resume();

        const analyser = automation.dsp.outputAnalyser;
        const samples = new Float32Array(analyser.fftSize);
        let peak = 0;
        let minimumLimiterReduction = 0;
        let sumOfSquares = 0;
        let values = 0;
        for (let sample = 0; sample < count; sample += 1) {
            analyser.getFloatTimeDomainData(samples);
            for (const value of samples) {
                peak = Math.max(peak, Math.abs(value));
                sumOfSquares += value * value;
                values += 1;
            }
            minimumLimiterReduction = Math.min(
                minimumLimiterReduction,
                automation.dsp.limiter.reduction,
            );
            await new Promise((resolve) => setTimeout(resolve, 25));
        }

        return {
            limiterReduction: automation.dsp.limiter.reduction,
            minimumLimiterReduction,
            peak,
            rms: Math.sqrt(sumOfSquares / values),
        };
    }, sampleCount);

test('@nightly measures levelling, limiting, and crossfade through the live Web Audio graph', async ({
    page,
}) => {
    await login(page);
    await navigateTo(page, '/library/songs');

    const firstSong = getSongCell(page, 'Automation Track 1');
    await expect(firstSong).toBeVisible({ timeout: 15_000 });
    await firstSong.dblclick();
    await waitForActiveAudio(page, 'Automation Track 1');
    const quietTrack = await measureOutput(page);

    await page.getByRole('button', { name: 'View queue' }).click();
    await page
        .locator('#sidebar-queue')
        .getByText('Automation Track 2', { exact: true })
        .first()
        .dblclick();
    await waitForActiveAudio(page, 'Automation Track 2');
    const loudTrack = await measureOutput(page);

    expect(quietTrack.rms).toBeGreaterThan(0.01);
    expect(loudTrack.rms).toBeGreaterThan(0.01);
    expect(loudTrack.rms / quietTrack.rms).toBeGreaterThan(0.65);
    expect(loudTrack.rms / quietTrack.rms).toBeLessThan(1.75);

    await page.evaluate(() => {
        const automation = window.__katiesAmpAudioAutomation;
        if (!automation) throw new Error('KatiesAmp Web Audio automation probe is unavailable');
        for (const gain of automation.gains) gain.gain.value = 40;
        const active = [...document.querySelectorAll('audio')].find((audio) => !audio.paused);
        if (!active || !Number.isFinite(active.duration)) {
            throw new Error('No active audio element is available for the crossfade probe');
        }
        active.currentTime = Math.max(0, active.duration - 4);
    });

    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    [...document.querySelectorAll('audio')].filter((audio) => !audio.paused).length,
            ),
        )
        .toBeGreaterThan(1);
    const crossfade = await measureOutput(page, 24);

    expect(crossfade.peak).toBeLessThanOrEqual(1.1);
    expect(crossfade.minimumLimiterReduction).toBeLessThan(-0.1);
});
