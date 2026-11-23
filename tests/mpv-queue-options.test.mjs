import assert from 'node:assert/strict';
import test from 'node:test';

import {
    appendAutoNextMpvQueueEntry,
    appendInsertedMpvQueueEntry,
    replaceMpvQueueEntries,
} from '../src/main/features/core/player/mpv-queue-load.ts';

const createMpvLoadProbe = () => {
    const calls = [];
    return {
        calls,
        mpv: {
            load: async (url, mode, options) => {
                calls.push({ mode, options, url });
            },
        },
    };
};

test('manual MPV queue replacement forwards independent current and next audio options', async () => {
    const { calls, mpv } = createMpvLoadProbe();
    const currentOptions = ['af=volume=5dB,alimiter', 'replaygain=no'];
    const nextOptions = ['af=volume=-8dB,alimiter', 'replaygain=no'];

    await replaceMpvQueueEntries(
        mpv,
        { options: currentOptions, url: 'current.mp3' },
        { options: nextOptions, url: 'next.mp3' },
        () => assert.fail('current queue entry should load'),
    );

    assert.deepEqual(calls, [
        { mode: 'replace', options: currentOptions, url: 'current.mp3' },
        { mode: 'append', options: nextOptions, url: 'next.mp3' },
    ]);
});

test('MPV next-slot insertion forwards its file-local audio options', async () => {
    const { calls, mpv } = createMpvLoadProbe();
    const options = ['af=volume=3dB,alimiter', 'replaygain=no'];

    await appendInsertedMpvQueueEntry(mpv, { options, url: 'inserted-next.mp3' });

    assert.deepEqual(calls, [{ mode: 'append', options, url: 'inserted-next.mp3' }]);
});

test('MPV auto-next refill forwards its new queued track audio options', async () => {
    const { calls, mpv } = createMpvLoadProbe();
    const options = ['af=volume=-4dB,alimiter', 'replaygain=no'];

    await appendAutoNextMpvQueueEntry(mpv, { options, url: 'auto-next.mp3' });

    assert.deepEqual(calls, [{ mode: 'append', options, url: 'auto-next.mp3' }]);
});
