import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveReleaseVersion } from '../scripts/automation/resolve-release-version.mjs';

test('beta resolution increments only matching releases', () => {
    assert.deepEqual(
        resolveReleaseVersion({
            channel: 'beta',
            currentVersion: '0.1.4-beta.6',
            releaseTags: ['v0.1.4-beta.2', 'v0.1.4-beta.7', 'v0.1.5-beta.20'],
        }),
        {
            manifest: 'beta.yml',
            tag: 'v0.1.4-beta.8',
            version: '0.1.4-beta.8',
        },
    );
});

test('an explicit beta version is preserved', () => {
    assert.equal(
        resolveReleaseVersion({
            channel: 'beta',
            currentVersion: '0.1.4-beta.6',
            releaseTags: [],
            requestedVersion: '0.2.0-beta.3',
        }).version,
        '0.2.0-beta.3',
    );
});

test('a beta base version starts at beta one', () => {
    assert.equal(
        resolveReleaseVersion({
            channel: 'beta',
            currentVersion: '0.1.4-beta.6',
            releaseTags: [],
            requestedVersion: '0.2.0',
        }).version,
        '0.2.0-beta.1',
    );
});

test('release resolution removes the current prerelease suffix', () => {
    assert.deepEqual(
        resolveReleaseVersion({
            channel: 'release',
            currentVersion: '0.1.4-beta.6',
            releaseTags: [],
        }),
        { manifest: 'latest.yml', tag: 'v0.1.4', version: '0.1.4' },
    );
});

test('duplicate and malformed release versions are rejected', () => {
    assert.throws(
        () =>
            resolveReleaseVersion({
                channel: 'beta',
                currentVersion: '0.1.4-beta.6',
                releaseTags: ['v0.1.4-beta.7'],
                requestedVersion: '0.1.4-beta.7',
            }),
        /already exists/,
    );
    assert.throws(
        () =>
            resolveReleaseVersion({
                channel: 'release',
                currentVersion: '0.1.4-beta.6',
                releaseTags: [],
                requestedVersion: '0.1',
            }),
        /Invalid release version/,
    );
    assert.throws(
        () =>
            resolveReleaseVersion({
                channel: 'alpha',
                currentVersion: '0.1.4-beta.6',
                releaseTags: [],
            }),
        /Unsupported release channel/,
    );
});
