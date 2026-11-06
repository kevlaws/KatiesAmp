import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyAudioOutputPreference,
    getAudioOutputPreference,
    includeUnavailableAudioDevice,
    resolveAudioOutputDeviceId,
    toAudioSinkId,
} from '../src/renderer/features/player/audio-player/utils/audio-output.ts';

const devices = [
    { label: 'System default', value: 'default' },
    { label: 'Venue USB Audio', value: 'venue-output' },
];

test('keeps the explicitly selected audio output', () => {
    assert.equal(
        resolveAudioOutputDeviceId(
            { deviceId: 'venue-output', deviceLabel: 'Venue USB Audio' },
            devices,
        ),
        'venue-output',
    );
});

test('rematches the same Windows endpoint when Chromium changes its id', () => {
    assert.equal(
        resolveAudioOutputDeviceId(
            { deviceId: 'old-endpoint-id', deviceLabel: 'Venue USB Audio' },
            devices,
        ),
        'venue-output',
    );
});

test('does not silently replace a missing or ambiguous selection with the default', () => {
    assert.equal(
        resolveAudioOutputDeviceId(
            { deviceId: 'missing-endpoint', deviceLabel: 'Missing output' },
            devices,
        ),
        'missing-endpoint',
    );

    assert.equal(
        resolveAudioOutputDeviceId(
            { deviceId: 'old-endpoint-id', deviceLabel: 'Duplicate output' },
            [
                ...devices,
                { label: 'Duplicate output', value: 'duplicate-1' },
                { label: 'Duplicate output', value: 'duplicate-2' },
            ],
        ),
        'old-endpoint-id',
    );
});

test('records the selected device label and preserves an unavailable choice in the menu', () => {
    assert.deepEqual(getAudioOutputPreference('venue-output', devices), {
        deviceId: 'venue-output',
        deviceLabel: 'Venue USB Audio',
    });

    const options = includeUnavailableAudioDevice(devices, {
        deviceId: 'missing-endpoint',
        deviceLabel: 'Venue sound card',
    });
    assert.deepEqual(options[0], {
        disabled: true,
        label: 'Venue sound card (currently unavailable)',
        value: 'missing-endpoint',
    });
});

test('only an explicit default selection clears the live sink', async () => {
    const calls = [];
    const target = {
        setSinkId: async (sinkId) => {
            calls.push(sinkId);
            target.sinkId = sinkId;
        },
        sinkId: 'venue-output',
    };

    await applyAudioOutputPreference(target, { deviceId: null, deviceLabel: null }, devices);

    assert.equal(toAudioSinkId(null), '');
    assert.deepEqual(calls, ['']);
});
