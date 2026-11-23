import assert from 'node:assert/strict';
import test from 'node:test';

import {
    calculateCrossfadeVolumes,
    captureCrossfadeTransitionSettings,
    resolveAutomaticCrossfadeDuration,
    resolveCrossfadeTransitionSettings,
    resolveManualCrossfadeDuration,
} from '../src/renderer/features/player/audio-player/utils/crossfade-transition.ts';

test('an active crossfade keeps the settings it started with', () => {
    const activeSettings = captureCrossfadeTransitionSettings(5, 'equalPower');

    assert.deepEqual(
        resolveCrossfadeTransitionSettings(true, activeSettings, 12, 'linear'),
        activeSettings,
    );
});

test('a future crossfade uses settings changed during playback', () => {
    const priorSettings = captureCrossfadeTransitionSettings(5, 'equalPower');

    assert.deepEqual(resolveCrossfadeTransitionSettings(false, priorSettings, 12, 'linear'), {
        duration: 12,
        style: 'linear',
    });
});

test('manual crossfade volumes move cleanly from the current track to the next track', () => {
    assert.deepEqual(calculateCrossfadeVolumes(0, 40, 'linear'), {
        current: 40,
        next: 0,
    });
    assert.deepEqual(calculateCrossfadeVolumes(0.5, 40, 'linear'), {
        current: 20,
        next: 20,
    });
    assert.deepEqual(calculateCrossfadeVolumes(1, 40, 'linear'), {
        current: 0,
        next: 40,
    });
});

test('manual crossfade duration is capped by either track ending', () => {
    assert.equal(resolveManualCrossfadeDuration(5, [8, 12]), 5);
    assert.equal(resolveManualCrossfadeDuration(5, [2, 12]), 2);
    assert.equal(resolveManualCrossfadeDuration(5, [Number.NaN, 1.5]), 1.5);
});

test('automatic crossfade leaves at least half of short tracks outside the overlap', () => {
    assert.equal(resolveAutomaticCrossfadeDuration(21, [180, 240]), 21);
    assert.equal(resolveAutomaticCrossfadeDuration(21, [12, 180]), 6);
    assert.equal(resolveAutomaticCrossfadeDuration(21, [180, 12]), 6);
    assert.equal(resolveAutomaticCrossfadeDuration(21, [30, Number.NaN]), 0);
    assert.equal(resolveAutomaticCrossfadeDuration(21, [30, 0]), 0);
    assert.equal(resolveAutomaticCrossfadeDuration(0, [30, 30]), 0);
    assert.equal(resolveAutomaticCrossfadeDuration(Number.NaN, [30, 30]), 0);
    assert.equal(resolveAutomaticCrossfadeDuration(21, []), 0);
});
