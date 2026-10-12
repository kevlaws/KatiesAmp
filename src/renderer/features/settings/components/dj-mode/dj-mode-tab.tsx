import { memo } from 'react';

import { DjModeSettings } from '/@/renderer/features/settings/components/dj-mode/dj-mode-settings';
import { Stack } from '/@/shared/components/stack/stack';

export const DjModeTab = memo(() => {
    return (
        <Stack gap="md">
            <DjModeSettings />
        </Stack>
    );
});
