import { Song } from '/@/shared/types/domain-types';

const BPM_CACHE_KEY = 'katiesamp-dj-bpm-v1';

const cacheKey = (song: Song) =>
    [song._serverId, song.id, song.updatedAt, song.size, song.duration].join(':');

const readCache = (): Record<string, number> => {
    try {
        return JSON.parse(window.localStorage.getItem(BPM_CACHE_KEY) || '{}');
    } catch {
        return {};
    }
};

export const getCachedBpm = (song: Song) => readCache()[cacheKey(song)];

export const setCachedBpm = (song: Song, bpm: number) => {
    try {
        window.localStorage.setItem(
            BPM_CACHE_KEY,
            JSON.stringify({ ...readCache(), [cacheKey(song)]: bpm }),
        );
    } catch {
        // BPM caching is optional when storage is unavailable.
    }
};

export const detectBpm = (buffer: AudioBuffer) => {
    const samples = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const start = Math.min(Math.floor(sampleRate * 10), Math.floor(samples.length * 0.1));
    const end = Math.min(samples.length, start + sampleRate * 90);
    const hopSize = Math.max(64, Math.round(sampleRate / 64));
    const windowSize = hopSize * 2;
    const onset: number[] = [];
    let averageEnergy = 0;

    for (let offset = start; offset + windowSize < end; offset += hopSize) {
        let energy = 0;
        for (let index = offset; index < offset + windowSize; index += 2) {
            energy += samples[index] * samples[index];
        }
        energy = Math.sqrt(energy / (windowSize / 2));
        averageEnergy = averageEnergy === 0 ? energy : averageEnergy * 0.92 + energy * 0.08;
        onset.push(Math.max(0, energy - averageEnergy * 1.08));
    }

    if (onset.length < 64 || Math.max(...onset) < 0.001) return undefined;

    const framesPerSecond = sampleRate / hopSize;
    const minimumLag = Math.floor((framesPerSecond * 60) / 190);
    const maximumLag = Math.ceil((framesPerSecond * 60) / 65);
    let bestLag = 0;
    let bestScore = 0;

    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
        let product = 0;
        let leftPower = 0;
        let rightPower = 0;

        for (let index = lag; index < onset.length; index += 1) {
            const left = onset[index];
            const right = onset[index - lag];
            product += left * right;
            leftPower += left * left;
            rightPower += right * right;
        }

        const score = product / Math.sqrt(leftPower * rightPower || 1);
        if (score > bestScore) {
            bestLag = lag;
            bestScore = score;
        }
    }

    if (!bestLag || bestScore < 0.02) return undefined;

    let bpm = (framesPerSecond * 60) / bestLag;
    while (bpm < 80) bpm *= 2;
    while (bpm > 160) bpm /= 2;
    return Math.round(bpm * 10) / 10;
};
