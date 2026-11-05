import { expect, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const administratorPassword = 'automatic-download-settings-test-password';

const unlockSettingsIfNeeded = async (page) => {
    const dialog = page.getByRole('dialog', { name: 'Administrator access' });
    const heading = page.getByRole('heading', { name: 'Settings' });
    await expect(dialog.or(heading)).toBeVisible();
    if (await heading.isVisible()) return;

    await dialog
        .getByRole('textbox', { exact: true, name: 'Administrator password' })
        .fill(administratorPassword);

    const confirmation = dialog.getByRole('textbox', {
        exact: true,
        name: 'Confirm administrator password',
    });
    if (await confirmation.isVisible().catch(() => false)) {
        await confirmation.fill(administratorPassword);
        await dialog.getByRole('button', { name: 'Set password and continue' }).click();
        return;
    }

    await dialog.getByRole('button', { name: 'Unlock' }).click();
};

const openApplicationSettings = async (page) => {
    await navigateTo(page, '/settings');
    await unlockSettingsIfNeeded(page);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('tab', { name: 'General' }).click();
};

test('@full configures and restores the automatic album download window', async ({ page }) => {
    await login(page);
    await openApplicationSettings(page);

    const enabled = page.getByRole('switch', { name: 'Automatic album downloads' });
    const startTime = page.getByLabel('Download window starts');
    const endTime = page.getByLabel('Download window ends');

    await expect(enabled).not.toBeChecked();
    await expect(startTime).toHaveCount(0);
    await expect(endTime).toHaveCount(0);

    await enabled.check({ force: true });
    await expect(startTime).toHaveValue('04:00');
    await expect(endTime).toHaveValue('09:00');

    await startTime.fill('03:30');
    await endTime.fill('03:30');
    await expect(page.getByText('Start and end times must be different.')).toBeVisible();

    await endTime.fill('08:30');
    await expect(page.getByText('Start and end times must be different.')).toHaveCount(0);

    await page.reload();
    await openApplicationSettings(page);
    await expect(enabled).toBeChecked();
    await expect(startTime).toHaveValue('03:30');
    await expect(endTime).toHaveValue('08:30');
});
