import assert from 'node:assert/strict';
import test from 'node:test';

import { getManualUpdateCheckFeedback } from '../src/renderer/features/settings/utils/manual-update-check.ts';

const cases = [
    {
        defaultMessage: 'Version {{version}} is ready to install.',
        status: 'downloaded',
        translationKey: 'setting.manualUpdateCheck_ready',
        type: 'success',
    },
    {
        defaultMessage: 'Version {{version}} is available and is downloading.',
        status: 'available',
        translationKey: 'setting.manualUpdateCheck_available',
        type: 'info',
    },
    {
        defaultMessage: 'An update check is already in progress.',
        status: 'checking',
        translationKey: 'setting.manualUpdateCheck_inProgress',
        type: 'info',
    },
    {
        defaultMessage: 'Unable to check for updates.',
        status: 'error',
        translationKey: 'setting.manualUpdateCheck_error',
        type: 'error',
    },
    {
        defaultMessage: 'KatiesAmp is up to date.',
        status: 'not-available',
        translationKey: 'setting.manualUpdateCheck_current',
        type: 'success',
    },
    {
        defaultMessage: 'KatiesAmp is up to date.',
        status: 'idle',
        translationKey: 'setting.manualUpdateCheck_current',
        type: 'success',
    },
];

for (const { defaultMessage, status, translationKey, type } of cases) {
    test(`maps ${status} update checks to ${type} feedback`, () => {
        assert.deepEqual(getManualUpdateCheckFeedback({ status }), {
            defaultMessage,
            translationKey,
            type,
        });
    });
}
