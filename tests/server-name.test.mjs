import assert from 'node:assert/strict';
import test from 'node:test';

import {
    KATIESAMP_DEFAULT_SERVER_NAME,
    KATIESAMP_LEGACY_SERVER_NAME,
    resolveKatiesAmpServerName,
} from '../src/renderer/features/servers/utils/server-name.ts';

test('clean installations use the current KatiesAmp media server name', () => {
    assert.equal(KATIESAMP_DEFAULT_SERVER_NAME, 'KATIESMEDIASERVER');
});

test('migrates the legacy KatiesAmp server name to the name reported by Jellyfin', () => {
    assert.equal(
        resolveKatiesAmpServerName(KATIESAMP_LEGACY_SERVER_NAME, 'KATIESMEDIASERVER'),
        'KATIESMEDIASERVER',
    );
});

test('keeps a managed KatiesAmp server name synchronized with Jellyfin', () => {
    assert.equal(
        resolveKatiesAmpServerName(KATIESAMP_DEFAULT_SERVER_NAME, 'KATIESMEDIASERVER-2'),
        'KATIESMEDIASERVER-2',
    );
    assert.equal(
        resolveKatiesAmpServerName(
            'KATIESMEDIASERVER-2',
            'KATIESMEDIASERVER-3',
            'KATIESMEDIASERVER-2',
        ),
        'KATIESMEDIASERVER-3',
    );
});

test('preserves an administrator-defined server alias', () => {
    assert.equal(
        resolveKatiesAmpServerName('Newcastle venue server', 'KATIESMEDIASERVER'),
        'Newcastle venue server',
    );
    assert.equal(
        resolveKatiesAmpServerName(
            'Newcastle venue server',
            'KATIESMEDIASERVER-2',
            'KATIESMEDIASERVER',
        ),
        'Newcastle venue server',
    );
});

test('preserves the stored name when Jellyfin does not report one', () => {
    assert.equal(
        resolveKatiesAmpServerName(KATIESAMP_LEGACY_SERVER_NAME),
        KATIESAMP_LEGACY_SERVER_NAME,
    );
    assert.equal(
        resolveKatiesAmpServerName(KATIESAMP_LEGACY_SERVER_NAME, '   '),
        KATIESAMP_LEGACY_SERVER_NAME,
    );
});
