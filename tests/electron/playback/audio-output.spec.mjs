import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const DEFAULT_VENUE_OUTPUT_MULTIPLIER = 10 ** (3 / 20);
const ONE_DECIBEL_RATIO = 10 ** (1 / 20);

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

const waitForSettledSingleTrack = async (page, expectedSongId) => {
    const hasOnlyExpectedTrackPlaying = () =>
        page.evaluate((songId) => {
            const activeAudio = [...document.querySelectorAll('audio')].filter(
                (audio) => !audio.paused && audio.currentTime > 0,
            );
            if (activeAudio.length !== 1) return false;

            const source = decodeURIComponent(activeAudio[0].currentSrc).toLowerCase();
            return (
                source.includes(`/audio/${songId.toLowerCase()}/`) ||
                source.includes(`/items/${songId.toLowerCase()}/`)
            );
        }, expectedSongId);

    await expect.poll(hasOnlyExpectedTrackPlaying, { timeout: 20_000 }).toBe(true);

    // Require the single-track state to remain stable before sampling. This avoids
    // measuring the tail of the previous element during a manual crossfade.
    await page.waitForTimeout(300);
    await expect.poll(hasOnlyExpectedTrackPlaying).toBe(true);
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

test('@full keeps the selected Windows audio output through an update and reasserts it', async ({
    page,
}) => {
    await page.addInitScript(() => {
        window.__katiesAmpSinkCalls = [];
        window.__katiesAmpActiveSink = '';
        window.__katiesAmpSinkAvailable = sessionStorage.getItem('sink-available') === 'true';

        if (sessionStorage.getItem('audio-output-seeded') !== 'true') {
            const persistedSettings = JSON.parse(
                localStorage.getItem('store_settings') || '{"state":{}}',
            );
            localStorage.setItem(
                'store_settings',
                JSON.stringify({
                    ...persistedSettings,
                    state: {
                        ...persistedSettings.state,
                        playback: {
                            ...persistedSettings.state?.playback,
                            audioDeviceId: 'venue-output',
                            type: 'web',
                            webAudio: true,
                        },
                    },
                    // Simulate the persisted store from the immediately previous release.
                    version: 38,
                }),
            );
            sessionStorage.setItem('audio-output-seeded', 'true');
        }

        Object.defineProperty(AudioContext.prototype, 'setSinkId', {
            configurable: true,
            value: async function setSinkId(sinkId) {
                window.__katiesAmpSinkCalls.push(sinkId);
                if (!window.__katiesAmpSinkAvailable) {
                    throw new DOMException('Audio endpoint is not ready', 'NotFoundError');
                }
                window.__katiesAmpActiveSink = sinkId;
            },
        });

        Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
            configurable: true,
            value: async () => [
                {
                    deviceId: 'default',
                    groupId: 'default-group',
                    kind: 'audiooutput',
                    label: 'System default',
                    toJSON: () => ({}),
                },
                {
                    deviceId: 'venue-output',
                    groupId: 'venue-group',
                    kind: 'audiooutput',
                    label: 'Venue USB Audio',
                    toJSON: () => ({}),
                },
            ],
        });
    });

    await page.reload();
    await login(page);

    await expect
        .poll(() => page.evaluate(() => window.__katiesAmpSinkCalls.includes('venue-output')))
        .toBe(true);

    await page.evaluate(() => {
        window.__katiesAmpSinkAvailable = true;
        sessionStorage.setItem('sink-available', 'true');
        navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
    });
    await expect.poll(() => page.evaluate(() => window.__katiesAmpActiveSink)).toBe('venue-output');

    const storedPreference = await page.evaluate(() => {
        const playback = JSON.parse(localStorage.getItem('store_settings') || '{"state":{}}').state
            ?.playback;
        return {
            deviceId: playback?.audioDeviceId,
            deviceLabel: playback?.audioDeviceLabel,
        };
    });
    expect(storedPreference).toEqual({
        deviceId: 'venue-output',
        deviceLabel: 'Venue USB Audio',
    });

    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__katiesAmpActiveSink)).toBe('venue-output');
});

test('@full routes HTML audio to the saved output when Web Audio is disabled', async ({ page }) => {
    await page.addInitScript(() => {
        window.__katiesAmpElementSinkCalls = [];
        if (sessionStorage.getItem('audio-output-seeded') !== 'true') {
            const persistedSettings = JSON.parse(
                localStorage.getItem('store_settings') || '{"state":{}}',
            );
            localStorage.setItem(
                'store_settings',
                JSON.stringify({
                    ...persistedSettings,
                    state: {
                        ...persistedSettings.state,
                        playback: {
                            ...persistedSettings.state?.playback,
                            audioDeviceId: 'venue-output',
                            audioDeviceLabel: 'Venue USB Audio',
                            type: 'web',
                            webAudio: false,
                        },
                    },
                }),
            );
            sessionStorage.setItem('audio-output-seeded', 'true');
        }
        Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
            configurable: true,
            value: async function setSinkId(sinkId) {
                window.__katiesAmpElementSinkCalls.push(sinkId);
            },
        });
        Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
            configurable: true,
            value: async () => [
                {
                    deviceId: 'venue-output',
                    groupId: 'venue-group',
                    kind: 'audiooutput',
                    label: 'Venue USB Audio',
                    toJSON: () => ({}),
                },
            ],
        });
    });

    await page.reload();
    await login(page);
    await navigateTo(page, '/library/songs');

    const firstSong = getSongCell(page, 'Automation Track 1');
    await expect(firstSong).toBeVisible({ timeout: 15_000 });
    await firstSong.dblclick();

    await expect
        .poll(() =>
            page.evaluate(() => window.__katiesAmpElementSinkCalls.includes('venue-output')),
        )
        .toBe(true);
});

test('@full measures levelling, limiting, and crossfade through the live Web Audio graph', async ({
    page,
}) => {
    await login(page);
    await navigateTo(page, '/library/songs');

    const firstSong = getSongCell(page, 'Automation Track 1');
    await expect(firstSong).toBeVisible({ timeout: 15_000 });
    await firstSong.dblclick();
    await waitForActiveAudio(page, 'Automation Track 1');
    await waitForSettledSingleTrack(page, 'song-1');
    await expect
        .poll(() =>
            page.evaluate(() => window.__katiesAmpAudioAutomation?.dsp?.venueOutputGain.gain.value),
        )
        .toBeCloseTo(DEFAULT_VENUE_OUTPUT_MULTIPLIER, 5);
    const quietTrack = await measureOutput(page);

    await page.getByRole('button', { name: 'View queue' }).click();
    await page
        .locator('#sidebar-queue')
        .getByText('Automation Track 2', { exact: true })
        .first()
        .dblclick();
    await waitForActiveAudio(page, 'Automation Track 2');
    await waitForSettledSingleTrack(page, 'song-2');
    const loudTrack = await measureOutput(page);

    expect(quietTrack.rms).toBeGreaterThan(0.01);
    expect(loudTrack.rms).toBeGreaterThan(0.01);
    const normalizedOutputRatio = loudTrack.rms / quietTrack.rms;
    expect(normalizedOutputRatio).toBeGreaterThanOrEqual(1 / ONE_DECIBEL_RATIO);
    expect(normalizedOutputRatio).toBeLessThanOrEqual(ONE_DECIBEL_RATIO);

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

    // Venue boost is upstream of the final peak-protection compressor. The
    // browser compressor is not a brick-wall limiter, so allow its documented
    // transient overshoot while proving the +3 dB boost cannot pass through
    // unprotected during an overlapping crossfade.
    expect(crossfade.peak).toBeLessThanOrEqual(ONE_DECIBEL_RATIO);
    expect(crossfade.minimumLimiterReduction).toBeLessThan(-0.1);
});
