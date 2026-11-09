import { expect, login, navigateTo, packageVersion, test } from '../fixtures/katiesamp-test.mjs';

const companyLogoCases = [
    {
        date: new Date(2026, 5, 15, 12),
        name: 'standard',
        sourcePattern: /katie-obriens-logo(?:-[a-zA-Z0-9]+)?\.webp(?:[?#].*)?$/,
    },
    {
        date: new Date(2026, 11, 24, 12),
        name: 'Christmas',
        sourcePattern: /katie-obriens-logo-christmas/,
    },
    {
        date: new Date(2026, 11, 31, 12),
        name: 'New Year',
        sourcePattern: /katie-obriens-logo-new-year/,
    },
    {
        date: new Date(2026, 9, 31, 12),
        name: 'Halloween',
        sourcePattern: /katie-obriens-logo-halloween/,
    },
    {
        date: new Date(2026, 10, 9, 12),
        name: 'Remembrance',
        sourcePattern: /katie-obriens-logo-remembrance/,
    },
    {
        date: new Date(2026, 2, 17, 12),
        name: "St Patrick's Day",
        sourcePattern: /katie-obriens-logo-st-patricks/,
    },
    {
        date: new Date(2026, 3, 5, 12),
        name: 'Easter',
        sourcePattern: /katie-obriens-logo-easter/,
    },
];

const companyLogoLayouts = [
    { height: 900, name: 'wide', width: 1440 },
    { height: 700, name: 'narrow', width: 760 },
];

const resizeApplication = async (electronApp, { height, width }) => {
    await electronApp.evaluate(
        async ({ BrowserWindow }, size) => {
            BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height, false);
            await new Promise((resolve) => setTimeout(resolve, 100));
        },
        { height, width },
    );
};

const expectCompanyLogoToFit = async (companyLogo) => {
    await expect(companyLogo).toBeVisible();

    const metrics = await companyLogo.evaluate((image) => {
        const imageBounds = image.getBoundingClientRect();
        const frameBounds = image.parentElement?.getBoundingClientRect();
        const toPlainBounds = (bounds) =>
            bounds && {
                bottom: bounds.bottom,
                height: bounds.height,
                left: bounds.left,
                right: bounds.right,
                top: bounds.top,
                width: bounds.width,
            };

        return {
            complete: image.complete,
            frame: toPlainBounds(frameBounds),
            image: toPlainBounds(imageBounds),
            naturalHeight: image.naturalHeight,
            naturalWidth: image.naturalWidth,
            objectFit: getComputedStyle(image).objectFit,
            viewport: {
                height: document.documentElement.clientHeight,
                width: document.documentElement.clientWidth,
            },
        };
    });

    expect(metrics.complete).toBe(true);
    expect(metrics.naturalWidth).toBeGreaterThan(0);
    expect(metrics.naturalHeight).toBeGreaterThan(0);
    expect(metrics.objectFit).toBe('contain');
    expect(metrics.frame).not.toBeNull();
    expect(metrics.image).not.toBeNull();

    const tolerance = 1;
    expect(metrics.image.width).toBeGreaterThan(0);
    expect(metrics.image.height).toBeGreaterThan(0);
    expect(metrics.image.left).toBeGreaterThanOrEqual(metrics.frame.left - tolerance);
    expect(metrics.image.top).toBeGreaterThanOrEqual(metrics.frame.top - tolerance);
    expect(metrics.image.right).toBeLessThanOrEqual(metrics.frame.right + tolerance);
    expect(metrics.image.bottom).toBeLessThanOrEqual(metrics.frame.bottom + tolerance);
    expect(metrics.image.left).toBeGreaterThanOrEqual(-tolerance);
    expect(metrics.image.top).toBeGreaterThanOrEqual(-tolerance);
    expect(metrics.image.right).toBeLessThanOrEqual(metrics.viewport.width + tolerance);
    expect(metrics.image.bottom).toBeLessThanOrEqual(metrics.viewport.height + tolerance);
};

test('@full home resolves every seasonal company logo in wide and narrow layouts', async ({
    electronApp,
    page,
}) => {
    await page.clock.install({ time: companyLogoCases[0].date });
    await resizeApplication(electronApp, companyLogoLayouts[0]);
    await login(page);

    const companyLogo = page.getByAltText("Katie O'Brien's Irish Taverns");

    for (const [index, companyLogoCase] of companyLogoCases.entries()) {
        await test.step(`${companyLogoCase.name} logo resolves`, async () => {
            if (index > 0) {
                await page.clock.setFixedTime(companyLogoCase.date);
                await page.evaluate(() => {
                    document.dispatchEvent(new Event('visibilitychange'));
                });
            }

            await expect(companyLogo).toHaveAttribute('src', companyLogoCase.sourcePattern);
        });

        for (const layout of companyLogoLayouts) {
            await test.step(`${companyLogoCase.name} logo fits the ${layout.name} layout`, async () => {
                await resizeApplication(electronApp, layout);
                await expectCompanyLogoToFit(companyLogo);
            });
        }
    }
});

test('@full shows the ready update action beside the current version', async ({
    electronApp,
    page,
}) => {
    await login(page);

    const currentVersion = page.getByText(`v${packageVersion}`, { exact: true });
    const installUpdate = page.getByRole('button', { name: 'Install update 9.9.9' });
    await expect(currentVersion).toBeVisible();
    await expect(installUpdate).toHaveCount(0);

    await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('update-downloaded', '9.9.9');
    });

    await expect(installUpdate).toBeVisible();
    await expect(page.getByText('Update ready - 9.9.9', { exact: true })).toBeVisible();

    const currentVersionBox = await currentVersion.boundingBox();
    const installUpdateBox = await installUpdate.boundingBox();
    expect(currentVersionBox).not.toBeNull();
    expect(installUpdateBox).not.toBeNull();
    const overlapsHorizontally =
        installUpdateBox.x < currentVersionBox.x + currentVersionBox.width &&
        installUpdateBox.x + installUpdateBox.width > currentVersionBox.x;
    const overlapsVertically =
        installUpdateBox.y < currentVersionBox.y + currentVersionBox.height &&
        installUpdateBox.y + installUpdateBox.height > currentVersionBox.y;
    expect(overlapsHorizontally && overlapsVertically).toBe(false);
    if (overlapsVertically) {
        expect(installUpdateBox.x + installUpdateBox.width).toBeLessThanOrEqual(
            currentVersionBox.x + 1,
        );
    }

    await installUpdate.click();
    await expect(installUpdate).toBeEnabled();
});

test('@full home layout remains readable when the application window is narrow', async ({
    electronApp,
    page,
}) => {
    await login(page);
    await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(760, 700);
    });
    await page.waitForTimeout(500);

    const label = page.getByText('Server status', { exact: true });
    const status = page.getByText('Connected to KATIESMEDIASERVER', { exact: true });
    const musicFolderLabel = page.getByText('Music folder', { exact: true });
    const musicFolderSelector = page.getByRole('combobox', { name: 'Select music folder' });
    await expect(label).toBeVisible();
    await expect(status).toBeVisible();
    await expect(musicFolderLabel).toBeVisible();
    await expect(musicFolderSelector).toBeVisible();

    const labelBox = await label.boundingBox();
    const statusBox = await status.boundingBox();
    const musicFolderLabelBox = await musicFolderLabel.boundingBox();
    const musicFolderSelectorBox = await musicFolderSelector.boundingBox();
    expect(labelBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(musicFolderLabelBox).not.toBeNull();
    expect(musicFolderSelectorBox).not.toBeNull();
    const overlapsHorizontally =
        labelBox.x < statusBox.x + statusBox.width && labelBox.x + labelBox.width > statusBox.x;
    const overlapsVertically =
        labelBox.y < statusBox.y + statusBox.height && labelBox.y + labelBox.height > statusBox.y;
    expect(overlapsHorizontally && overlapsVertically).toBe(false);

    expect(musicFolderLabelBox.width).toBeGreaterThan(70);
    expect(musicFolderSelectorBox.y).toBeGreaterThanOrEqual(
        musicFolderLabelBox.y + musicFolderLabelBox.height,
    );
});

test('@full home exposes the configured music folder selector', async ({ page }) => {
    await login(page);
    const applicationCard = page.getByText('Application', { exact: true }).locator('..');
    const softwareLabel = applicationCard.getByText('Software', { exact: true });
    const softwareValue = applicationCard.getByText('KatiesAmp', { exact: true });
    const softwareLabelBox = await softwareLabel.boundingBox();
    const softwareValueBox = await softwareValue.boundingBox();
    expect(softwareLabelBox).not.toBeNull();
    expect(softwareValueBox).not.toBeNull();
    expect(softwareValueBox.x).toBeGreaterThan(softwareLabelBox.x + softwareLabelBox.width);
    expect(softwareValueBox.y).toBeLessThan(softwareLabelBox.y + softwareLabelBox.height);

    const selector = page.getByRole('combobox', { name: 'Select music folder' });
    await expect(selector).toBeVisible();
    await expect(selector).toHaveValue("Katie O'Brien's Music");
    await selector.click();
    await expect(page.getByRole('option', { name: 'All music folders' })).toHaveCount(0);
    await expect(page.getByRole('option', { name: "Katie O'Brien's Music" })).toBeVisible();
});

test('@full updates a removed music folder after playback is paused', async ({
    mockJellyfin,
    page,
}) => {
    await page.clock.install();
    await login(page);
    const selector = page.getByRole('combobox', { name: 'Select music folder' });
    await expect(selector).toHaveValue("Katie O'Brien's Music");

    await navigateTo(page, '/library/albums/album-1');
    const albumHeading = page.getByRole('heading', { level: 1, name: 'Automation Album' });
    await expect(albumHeading).toBeVisible({ timeout: 15_000 });
    await albumHeading.locator('..').getByRole('button', { exact: true, name: 'Play' }).click();
    await navigateTo(page, '/');
    const playerBar = page.locator('.media-player');
    const pauseButton = playerBar.getByRole('button', { name: 'Pause' });
    await expect(playerBar.getByText('Automation Track 1', { exact: true })).toBeVisible();
    await expect(pauseButton).toBeVisible();
    await pauseButton.click();

    mockJellyfin.setMusicFolders([{ id: 'music-folder-2', name: 'Replacement Music' }]);
    await page.clock.runFor('01:00');

    await expect(selector).toHaveValue('Replacement Music');
    await expect(playerBar.getByRole('button', { name: 'Play' })).toBeDisabled();

    mockJellyfin.setDeniedItemIds(['album-1']);
    await page.evaluate(() => {
        window.location.hash = '#/library/albums/album-1';
    });
    await expect(page.getByLabel('Username')).toHaveCount(0);
    await expect(page.getByText('Home', { exact: true })).toBeVisible();
});
