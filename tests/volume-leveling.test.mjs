import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildMpvAudioFilters,
    buildMpvTrackAudioConfiguration,
    buildMpvVolumeLevelingFilters,
    calculateReplayGainMultiplier,
    configureCompressorNode,
    decibelsToLinear,
    getReplayGainMode,
    migrateVolumeLevelingSettings,
    OUTPUT_LIMITER,
    resolveReplayGainAdjustment,
    VOLUME_LEVELING_MODE,
} from '../src/renderer/features/player/audio-player/utils/volume-leveling.ts';

test('natural levelling uses track gain and a final limiter', () => {
    assert.equal(getReplayGainMode(VOLUME_LEVELING_MODE.NATURAL), 'track');

    const filters = buildMpvVolumeLevelingFilters(VOLUME_LEVELING_MODE.NATURAL, false);
    assert.equal(filters.length, 1);
    assert.match(filters[0], /alimiter=/);
    assert.match(filters[0], /latency=true/);
});

test('tavern levelling adds gentle compression before the final limiter', () => {
    const filters = buildMpvVolumeLevelingFilters(VOLUME_LEVELING_MODE.TAVERN, false);

    assert.equal(filters.length, 2);
    assert.match(filters[0], /acompressor=/);
    assert.match(filters[0], /ratio=1\.5/);
    assert.match(filters[1], /alimiter=/);
});

test('turning levelling off bypasses processing unless the manual compressor needs protection', () => {
    assert.equal(getReplayGainMode(VOLUME_LEVELING_MODE.OFF), 'no');
    assert.deepEqual(buildMpvVolumeLevelingFilters(VOLUME_LEVELING_MODE.OFF, false), []);
    assert.match(buildMpvVolumeLevelingFilters(VOLUME_LEVELING_MODE.OFF, true)[0], /alimiter=/);
});

test('Jellyfin gain can raise a quiet track when peak metadata is unavailable', () => {
    const multiplier = calculateReplayGainMultiplier({
        clip: true,
        gainInfo: { track: 6 },
        mode: 'track',
        peakInfo: null,
    });

    assert.ok(Math.abs(multiplier - 1.9952623149688795) < 0.000001);
});

test('known peak metadata still caps ReplayGain before the final limiter', () => {
    const multiplier = calculateReplayGainMultiplier({
        clip: true,
        gainInfo: { track: 6 },
        mode: 'track',
        peakInfo: { track: 0.75 },
    });

    assert.ok(Math.abs(multiplier - 4 / 3) < 0.000001);
});

test('venue output boost raises every track equally', () => {
    const threeDB = decibelsToLinear(3);
    const sixDB = decibelsToLinear(6);
    const twelveDB = decibelsToLinear(12);
    const quietTrack = 0.2;
    const loudTrack = 0.5;

    assert.ok(Math.abs(threeDB - 1.4125375446227544) < 0.000001);
    assert.ok(Math.abs(sixDB - 1.9952623149688795) < 0.000001);
    assert.ok(Math.abs(twelveDB - 3.9810717055349722) < 0.000001);
    assert.ok(
        Math.abs((loudTrack * threeDB) / (quietTrack * threeDB) - loudTrack / quietTrack) <
            0.000001,
    );
    assert.ok(
        Math.abs((loudTrack * sixDB) / (quietTrack * sixDB) - loudTrack / quietTrack) < 0.000001,
    );
    assert.ok(
        Math.abs((loudTrack * twelveDB) / (quietTrack * twelveDB) - loudTrack / quietTrack) <
            0.000001,
    );
});

test('MPV applies the selected venue boost before final peak protection', () => {
    const filters = buildMpvAudioFilters(
        { bands: [], enabled: false, preamp: 0 },
        {
            attack: 20,
            enabled: false,
            knee: 4,
            makeup: 0,
            ratio: 4,
            release: 200,
            threshold: -18,
        },
        VOLUME_LEVELING_MODE.OFF,
        6,
    );

    assert.match(filters, /^volume=6dB,lavfi=\[alimiter=/);
    assert.ok(filters.indexOf('volume=6dB') < filters.indexOf('alimiter='));
});

test('Web final stage is fast peak protection, not a brick-wall guarantee', () => {
    assert.equal(OUTPUT_LIMITER.threshold, -1);
    assert.equal(OUTPUT_LIMITER.ratio, 20);
    assert.equal(OUTPUT_LIMITER.attack, 3);
    assert.notEqual(OUTPUT_LIMITER.ratio, Number.POSITIVE_INFINITY);
});

test('ReplayGain telemetry reports the applied source, dB adjustment, and peak limiting', () => {
    const adjustment = resolveReplayGainAdjustment({
        clip: true,
        gainInfo: { album: 3, track: 6 },
        mode: 'track',
        peakInfo: { track: 0.75 },
        preampDB: 1,
    });

    assert.equal(adjustment.source, 'track');
    assert.equal(adjustment.peakLimited, true);
    assert.ok(Math.abs(adjustment.multiplier - 4 / 3) < 0.000001);
    assert.ok(Math.abs(adjustment.adjustmentDB - 2.4987747321659985) < 0.000001);
});

test('invalid track metadata falls back to a valid album gain', () => {
    const adjustment = resolveReplayGainAdjustment({
        clip: true,
        gainInfo: { album: -4, track: Number.NaN },
        mode: 'track',
    });

    assert.equal(adjustment.source, 'album');
    assert.ok(Math.abs(adjustment.adjustmentDB + 4) < 0.000001);
});

test('MPV uses server normalisation as a file-local gain and disables embedded ReplayGain', () => {
    const configuration = buildMpvTrackAudioConfiguration({
        clip: true,
        compressor: {
            attack: 20,
            enabled: false,
            knee: 4,
            makeup: 0,
            ratio: 4,
            release: 200,
            threshold: -18,
        },
        equalizer: { bands: [], enabled: false, preamp: 0 },
        gainInfo: { track: -7.25 },
        peakInfo: null,
        venueOutputBoostDB: 12,
        volumeLevelingMode: VOLUME_LEVELING_MODE.NATURAL,
    });

    assert.equal(configuration.adjustment.source, 'track');
    assert.ok(Math.abs(configuration.adjustment.adjustmentDB + 7.25) < 0.000001);
    assert.equal(configuration.replayGainMode, 'no');
    assert.equal(configuration.loadOptions[1], 'replaygain=no');
    assert.match(configuration.audioFilters, /^volume=-7\.250000dB,volume=12dB,/);
    assert.ok(
        configuration.audioFilters.indexOf('volume=12dB') <
            configuration.audioFilters.indexOf('alimiter='),
    );
});

test('MPV keeps embedded ReplayGain as fallback only when server gain is unavailable', () => {
    const configuration = buildMpvTrackAudioConfiguration({
        clip: true,
        compressor: {
            attack: 20,
            enabled: false,
            knee: 4,
            makeup: 0,
            ratio: 4,
            release: 200,
            threshold: -18,
        },
        equalizer: { bands: [], enabled: false, preamp: 0 },
        gainInfo: null,
        peakInfo: null,
        venueOutputBoostDB: 3,
        volumeLevelingMode: VOLUME_LEVELING_MODE.NATURAL,
    });

    assert.equal(configuration.adjustment.source, 'none');
    assert.equal(configuration.replayGainMode, 'track');
    assert.equal(configuration.loadOptions[1], 'replaygain=track');
});

test('MPV current and queued tracks retain independent server gain filters', () => {
    const base = {
        clip: true,
        compressor: {
            attack: 20,
            enabled: false,
            knee: 4,
            makeup: 0,
            ratio: 4,
            release: 200,
            threshold: -18,
        },
        equalizer: { bands: [], enabled: false, preamp: 0 },
        peakInfo: null,
        venueOutputBoostDB: 3,
        volumeLevelingMode: VOLUME_LEVELING_MODE.NATURAL,
    };
    const current = buildMpvTrackAudioConfiguration({ ...base, gainInfo: { track: 5 } });
    const next = buildMpvTrackAudioConfiguration({ ...base, gainInfo: { track: -8 } });

    assert.match(current.loadOptions[0], /^af=volume=5\.000000dB,/);
    assert.match(next.loadOptions[0], /^af=volume=-8\.000000dB,/);
    assert.notEqual(current.loadOptions[0], next.loadOptions[0]);
});

test('compressor configuration supports active and transparent nodes', () => {
    const node = {
        attack: { value: -1 },
        knee: { value: -1 },
        ratio: { value: -1 },
        release: { value: -1 },
        threshold: { value: -1 },
    };

    configureCompressorNode(node, {
        attack: 50,
        knee: 6,
        makeup: 2,
        ratio: 1.5,
        release: 500,
        threshold: -15,
    });
    assert.deepEqual(node, {
        attack: { value: 0.05 },
        knee: { value: 6 },
        ratio: { value: 1.5 },
        release: { value: 0.5 },
        threshold: { value: -15 },
    });

    configureCompressorNode(node, null);
    assert.deepEqual(node, {
        attack: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 1 },
        release: { value: 0.25 },
        threshold: { value: 0 },
    });
});

test('existing settings migrate to safe natural levelling defaults', () => {
    const settings = {
        playback: {
            mpvProperties: {
                replayGainClip: false,
                replayGainMode: 'no',
            },
            volumeLevelingMode: 'off',
        },
    };

    migrateVolumeLevelingSettings(settings, 36);

    assert.deepEqual(settings, {
        playback: {
            mpvProperties: {
                replayGainClip: true,
                replayGainMode: 'track',
            },
            volumeLevelingMode: 'natural',
        },
    });
});

test('current settings are not overwritten by the volume levelling migration', () => {
    const settings = {
        playback: {
            mpvProperties: {
                replayGainClip: false,
                replayGainMode: 'no',
            },
            volumeLevelingMode: 'off',
        },
    };

    migrateVolumeLevelingSettings(settings, 37);

    assert.deepEqual(settings, {
        playback: {
            mpvProperties: {
                replayGainClip: false,
                replayGainMode: 'no',
            },
            volumeLevelingMode: 'off',
        },
    });
});

test('MPV applies EQ, manual compression, automatic levelling, and limiting in order', () => {
    const filters = buildMpvAudioFilters(
        {
            bands: [{ freq: 1000, gain: 2 }],
            enabled: true,
            preamp: -2,
        },
        {
            attack: 20,
            enabled: true,
            knee: 4,
            makeup: 1,
            ratio: 4,
            release: 200,
            threshold: -18,
        },
        VOLUME_LEVELING_MODE.TAVERN,
        3,
    );

    const preampIndex = filters.indexOf('volume=-2dB');
    const equalizerIndex = filters.indexOf('equalizer=f=1000');
    const manualCompressorIndex = filters.indexOf('ratio=4');
    const levelerIndex = filters.indexOf('ratio=1.5');
    const venueBoostIndex = filters.indexOf('volume=3dB');
    const limiterIndex = filters.indexOf('alimiter=');

    assert.ok(preampIndex >= 0);
    assert.ok(preampIndex < equalizerIndex);
    assert.ok(equalizerIndex < manualCompressorIndex);
    assert.ok(manualCompressorIndex < levelerIndex);
    assert.ok(levelerIndex < venueBoostIndex);
    assert.ok(venueBoostIndex < limiterIndex);
});
