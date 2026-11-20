import assert from 'node:assert/strict';
import test from 'node:test';

import { isCurrentMpvQueuePair } from '../src/renderer/features/player/audio-player/utils/mpv-queue-sync.ts';

test('accepts an MPV next-slot update while the same queue pair is still current', () => {
    assert.equal(isCurrentMpvQueuePair('queue-a', 'queue-b', 'queue-a', 'queue-b'), true);
});

test('rejects an MPV next-slot update after its next song was promoted to current', () => {
    assert.equal(isCurrentMpvQueuePair('queue-a', 'queue-b', 'queue-b', 'queue-c'), false);
});
