import assert from 'node:assert/strict';
import test from 'node:test';

import {
    describeOutputSampleFormat,
    describePlaybackEngine,
    describeResampling,
    formatChannels,
    formatDecibels,
    formatSampleRate,
    linearGainToDecibels,
} from '../src/renderer/features/player/signal-path/signal-path-utils.ts';
test('formats verifiable source and gain telemetry', () => {
    assert.equal(formatSampleRate(44100), '44.1 kHz');
    assert.equal(formatSampleRate(null), 'Unavailable');
    assert.equal(formatChannels(1), 'Mono');
    assert.equal(formatChannels(2), 'Stereo');
    assert.equal(formatChannels(6), '6 channels');
    assert.equal(formatDecibels(linearGainToDecibels(2)), '+6.0 dB');
    assert.equal(formatDecibels(linearGainToDecibels(1)), '+0.0 dB');
});

test('reports resampling only when both rates are known', () => {
    assert.equal(describeResampling(44100, 48000), '44.1 kHz to 48 kHz');
    assert.equal(describeResampling(48000, 48000), 'No resampling (48 kHz)');
    assert.equal(describeResampling(undefined, 48000), 'Unavailable');
    assert.equal(describeResampling(44100, undefined), 'Unavailable');
});

test('does not invent decoder output details for engines that do not expose them', () => {
    assert.equal(describePlaybackEngine('web'), 'Chromium media decoder');
    assert.equal(describePlaybackEngine('local'), 'Local mpv / FFmpeg decoder');
    assert.equal(describeOutputSampleFormat('web', true), '32-bit float (Web Audio)');
    assert.equal(describeOutputSampleFormat('local', false), 'Unavailable');
});
