import assert from 'node:assert/strict';
import test from 'node:test';

import {
    captureCrossfadeTransitionSettings,
    resolveCrossfadeTransitionSettings,
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
