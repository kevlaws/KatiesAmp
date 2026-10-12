import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeDjWaveform } from '../src/renderer/features/dj/dj-waveform-analysis.ts';

const createBuffer = (samples, sampleRate) => ({
    duration: samples.length / sampleRate,
    getChannelData: () => samples,
    sampleRate,
});

const average = (values) => values.reduce((total, value) => total + value, 0) / values.length;

test('frequency analysis distinguishes bass-heavy and treble-heavy audio', () => {
    const sampleRate = 8000;
    const duration = 6;
    const bass = new Float32Array(sampleRate * duration);
    const treble = new Float32Array(sampleRate * duration);

    for (let index = 0; index < bass.length; index += 1) {
        const time = index / sampleRate;
        bass[index] = Math.sin(time * Math.PI * 2 * 100) * 0.8;
        treble[index] = Math.sin(time * Math.PI * 2 * 3000) * 0.8;
    }

    const bassAnalysis = analyzeDjWaveform(createBuffer(bass, sampleRate));
    const trebleAnalysis = analyzeDjWaveform(createBuffer(treble, sampleRate));

    assert.ok(average(bassAnalysis.low) > average(bassAnalysis.high));
    assert.ok(average(trebleAnalysis.high) > average(trebleAnalysis.low));
    assert.equal(bassAnalysis.amplitudes.length, 1024);
});

test('beat-grid analysis finds the repeating beat offset', () => {
    const sampleRate = 8000;
    const duration = 10;
    const samples = new Float32Array(sampleRate * duration);
    const expectedOffset = 0.25;

    for (let beat = expectedOffset; beat < duration; beat += 0.5) {
        const start = Math.round(beat * sampleRate);
        for (let index = start; index < Math.min(samples.length, start + 160); index += 1) {
            samples[index] = Math.sin(((index - start) / 160) * Math.PI) * 0.9;
        }
    }

    const analysis = analyzeDjWaveform(createBuffer(samples, sampleRate), 120);

    assert.ok(Math.abs(analysis.beatOffset - expectedOffset) <= 0.03);
});
