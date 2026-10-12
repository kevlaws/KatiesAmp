import type { Song } from '/@/shared/types/domain-types';

const CACHE_KEY = 'katiesamp-dj-waveform-v1';
const CACHE_LIMIT = 24;
const CACHE_VERSION = 1;

export type DjWaveformAnalysis = {
    amplitudes: Float32Array;
    beatOffset?: number;
    duration: number;
    high: Float32Array;
    low: Float32Array;
    mid: Float32Array;
};

type CachedWaveform = {
    accessedAt: number;
    beatOffset?: number;
    bins: number;
    data: string;
    duration: number;
    key: string;
    version: number;
};

const cacheKey = (song: Song) =>
    [song._serverId, song.id, song.updatedAt, song.size, song.duration].join(':');

const decodeBytes = (encoded: string) => {
    const binary = window.atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
};

const encodeBytes = (bytes: Uint8Array) => {
    let binary = '';
    const chunkSize = 8192;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return window.btoa(binary);
};

const readCache = (): CachedWaveform[] => {
    try {
        const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || '[]');
        return Array.isArray(cached) ? cached : [];
    } catch {
        return [];
    }
};

const detectBeatOffset = (samples: Float32Array, sampleRate: number, bpm?: number) => {
    if (!bpm || bpm <= 0 || samples.length < sampleRate * 4) return undefined;

    const framesPerSecond = 100;
    const hopSize = Math.max(1, Math.round(sampleRate / framesPerSecond));
    const frameCount = Math.min(
        Math.floor(samples.length / hopSize),
        Math.floor(framesPerSecond * 90),
    );
    const onset = new Float32Array(frameCount);
    let average = 0;
    let previous = 0;

    for (let frame = 0; frame < frameCount; frame += 1) {
        const start = frame * hopSize;
        const end = Math.min(samples.length, start + hopSize);
        let energy = 0;
        for (let index = start; index < end; index += 2) {
            energy += Math.abs(samples[index]);
        }
        energy /= Math.max(1, Math.ceil((end - start) / 2));
        average = average === 0 ? energy : average * 0.96 + energy * 0.04;
        onset[frame] = Math.max(0, energy - previous, energy - average * 1.05);
        previous = energy;
    }

    const interval = (framesPerSecond * 60) / bpm;
    const candidates = Math.max(1, Math.round(interval));
    let bestOffset = 0;
    let bestScore = 0;

    for (let offset = 0; offset < candidates; offset += 1) {
        let score = 0;
        for (let beat = offset; beat < frameCount; beat += interval) {
            const frame = Math.round(beat);
            score += Math.max(onset[frame - 1] || 0, onset[frame] || 0, onset[frame + 1] || 0);
        }
        if (score > bestScore) {
            bestOffset = offset;
            bestScore = score;
        }
    }

    return bestOffset / framesPerSecond;
};

export const analyzeDjWaveform = (buffer: AudioBuffer, bpm?: number): DjWaveformAnalysis => {
    const duration = buffer.duration;
    const source = buffer.getChannelData(0);
    const binCount = Math.min(8192, Math.max(1024, Math.round(duration * 8)));
    const amplitudes = new Float32Array(binCount);
    const lowEnergy = new Float64Array(binCount);
    const midEnergy = new Float64Array(binCount);
    const highEnergy = new Float64Array(binCount);
    const sampleCounts = new Uint32Array(binCount);
    const stride = Math.max(1, Math.floor(buffer.sampleRate / 8000));
    const effectiveSampleRate = buffer.sampleRate / stride;
    const lowAlpha = 1 - Math.exp((-2 * Math.PI * 220) / effectiveSampleRate);
    const midAlpha = 1 - Math.exp((-2 * Math.PI * 1800) / effectiveSampleRate);
    let lowPass = 0;
    let midPass = 0;
    let maximumAmplitude = 0;

    for (let index = 0; index < source.length; index += stride) {
        const sample = source[index];
        const bin = Math.min(binCount - 1, Math.floor((index / source.length) * binCount));
        const amplitude = Math.abs(sample);
        lowPass += lowAlpha * (sample - lowPass);
        midPass += midAlpha * (sample - midPass);
        const low = lowPass;
        const mid = midPass - lowPass;
        const high = sample - midPass;

        amplitudes[bin] = Math.max(amplitudes[bin], amplitude);
        lowEnergy[bin] += low * low;
        midEnergy[bin] += mid * mid;
        highEnergy[bin] += high * high;
        sampleCounts[bin] += 1;
        maximumAmplitude = Math.max(maximumAmplitude, amplitude);
    }

    const low = new Float32Array(binCount);
    const mid = new Float32Array(binCount);
    const high = new Float32Array(binCount);

    for (let bin = 0; bin < binCount; bin += 1) {
        amplitudes[bin] = Math.sqrt(amplitudes[bin] / (maximumAmplitude || 1));
        const count = sampleCounts[bin] || 1;
        const lowRms = Math.sqrt(lowEnergy[bin] / count);
        const midRms = Math.sqrt(midEnergy[bin] / count);
        const highRms = Math.sqrt(highEnergy[bin] / count);
        const total = lowRms + midRms + highRms || 1;
        low[bin] = lowRms / total;
        mid[bin] = midRms / total;
        high[bin] = highRms / total;
    }

    return {
        amplitudes,
        beatOffset: detectBeatOffset(source, buffer.sampleRate, bpm),
        duration,
        high,
        low,
        mid,
    };
};

export const getCachedDjWaveform = (song: Song): DjWaveformAnalysis | undefined => {
    try {
        const key = cacheKey(song);
        const entries = readCache();
        const entry = entries.find((candidate) => candidate.key === key);
        if (!entry || entry.version !== CACHE_VERSION || entry.bins <= 0) return undefined;

        const bytes = decodeBytes(entry.data);
        if (bytes.length !== entry.bins * 4) return undefined;
        const amplitudes = new Float32Array(entry.bins);
        const low = new Float32Array(entry.bins);
        const mid = new Float32Array(entry.bins);
        const high = new Float32Array(entry.bins);
        for (let bin = 0; bin < entry.bins; bin += 1) {
            const offset = bin * 4;
            amplitudes[bin] = bytes[offset] / 255;
            low[bin] = bytes[offset + 1] / 255;
            mid[bin] = bytes[offset + 2] / 255;
            high[bin] = bytes[offset + 3] / 255;
        }

        return {
            amplitudes,
            beatOffset: entry.beatOffset,
            duration: entry.duration,
            high,
            low,
            mid,
        };
    } catch {
        return undefined;
    }
};

export const setCachedDjWaveform = (song: Song, analysis: DjWaveformAnalysis) => {
    try {
        const bytes = new Uint8Array(analysis.amplitudes.length * 4);
        for (let bin = 0; bin < analysis.amplitudes.length; bin += 1) {
            const offset = bin * 4;
            bytes[offset] = Math.round(analysis.amplitudes[bin] * 255);
            bytes[offset + 1] = Math.round(analysis.low[bin] * 255);
            bytes[offset + 2] = Math.round(analysis.mid[bin] * 255);
            bytes[offset + 3] = Math.round(analysis.high[bin] * 255);
        }

        const key = cacheKey(song);
        const entry: CachedWaveform = {
            accessedAt: Date.now(),
            beatOffset: analysis.beatOffset,
            bins: analysis.amplitudes.length,
            data: encodeBytes(bytes),
            duration: analysis.duration,
            key,
            version: CACHE_VERSION,
        };
        const entries = readCache()
            .filter((candidate) => candidate.key !== key && candidate.version === CACHE_VERSION)
            .sort((left, right) => right.accessedAt - left.accessedAt)
            .slice(0, CACHE_LIMIT - 1);
        window.localStorage.setItem(CACHE_KEY, JSON.stringify([entry, ...entries]));
    } catch {
        // Waveform caching is optional when storage is unavailable or full.
    }
};
