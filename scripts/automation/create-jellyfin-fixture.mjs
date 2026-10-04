import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = process.argv[2] || 'test-results/jellyfin';
const sampleRate = 8_000;
const durationSeconds = 2;
const sampleCount = sampleRate * durationSeconds;
const dataSize = sampleCount * 2;
const wave = Buffer.alloc(44 + dataSize);

wave.write('RIFF', 0);
wave.writeUInt32LE(36 + dataSize, 4);
wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(sampleRate, 24);
wave.writeUInt32LE(sampleRate * 2, 28);
wave.writeUInt16LE(2, 32);
wave.writeUInt16LE(16, 34);
wave.write('data', 36);
wave.writeUInt32LE(dataSize, 40);

for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 4_000;
    wave.writeInt16LE(sample, 44 + index * 2);
}

await mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, 'Automation Track.wav');
await writeFile(outputPath, wave);
console.log(outputPath);
