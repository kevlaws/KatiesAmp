import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const administratorPassword = 'automatic-album-download-test-password';

const formatLocalTime = (date) =>
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

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

const enableCurrentAutomaticDownloadWindow = async (page) => {
    await navigateTo(page, '/settings');
    await unlockSettingsIfNeeded(page);
    await page.getByRole('tab', { name: 'General' }).click();

    const now = new Date();
    const start = new Date(now.getTime() - 20 * 60_000);
    const end = new Date(now.getTime() + 60 * 60_000);
    const enabled = page.getByRole('switch', { name: 'Automatic album downloads' });
    await enabled.check({ force: true });
    await page.getByLabel('Download window starts').fill(formatLocalTime(start));
    await page.getByLabel('Download window ends').fill(formatLocalTime(end));
};

test('@nightly downloads every accessible album and retains it when access disappears', async ({
    mockJellyfin,
    page,
}) => {
    mockJellyfin.setMusicFolders([
        { id: 'music-folder-a', name: 'Seasonal A' },
        { id: 'music-folder-b', name: 'Seasonal B' },
    ]);
    await login(page);
    await enableCurrentAutomaticDownloadWindow(page);

    await expect
        .poll(
            () => page.evaluate(() => window.api.offline.listAlbums().then((albums) => albums[0])),
            { timeout: 30_000 },
        )
        .toMatchObject({
            automatic: true,
            id: 'album-1',
            songIds: expect.arrayContaining(['song-1']),
        });
    await expect
        .poll(() => page.evaluate(() => window.api.offline.list().then((items) => items.length)))
        .toBe(6);
    await expect
        .poll(() =>
            page.evaluate(() =>
                window.api.offline
                    .listDownloadTasks()
                    .then((tasks) =>
                        tasks.find(
                            (task) => task.itemIds.includes('album-1') && task.state === 'complete',
                        ),
                    ),
            ),
        )
        .toMatchObject({ automatic: true, silent: true, state: 'complete' });

    await navigateTo(page, '/library/albums/album-1');
    const sidebarAlbum = page
        .locator('#left-sidebar')
        .getByText('Automation Album', { exact: true })
        .locator('xpath=ancestor::a[1]');
    await expect(sidebarAlbum.getByRole('img', { name: 'Available offline' })).toBeVisible();
    const albumHeading = page.getByRole('heading', { level: 1, name: 'Automation Album' });
    await expect(
        albumHeading.locator('..').getByRole('button', { name: 'Remove offline download' }),
    ).toBeVisible();
    await expect(
        getSongCell(page, 'Automation Track 1').getByRole('img', { name: 'Available offline' }),
    ).toBeVisible();

    expect(
        mockJellyfin.state.requests
            .filter((request) => request.query.IncludeItemTypes === 'MusicAlbum')
            .map((request) => request.query.ParentId),
    ).toEqual(expect.arrayContaining(['music-folder-a', 'music-folder-b']));

    mockJellyfin.setMusicFolders([]);
    await page.reload();
    await page.waitForTimeout(1_000);

    await expect
        .poll(() => page.evaluate(() => window.api.offline.list().then((items) => items.length)))
        .toBe(6);
    await expect
        .poll(() => page.evaluate(() => window.api.offline.listAlbums().then((items) => items)))
        .toHaveLength(1);
});

test('@nightly does not mark a new zero-track automatic album as downloaded', async ({ page }) => {
    const message = await page.evaluate(() =>
        window.api.offline
            .syncAlbum({
                album: {
                    automatic: true,
                    id: 'empty-album',
                    name: 'Empty Album',
                    serverId: 'server-1',
                },
                silent: true,
                tracks: [],
            })
            .then(
                () => null,
                (error) => String(error),
            ),
    );

    expect(message).toContain('Automatic album scan returned no tracks');
    await expect.poll(() => page.evaluate(() => window.api.offline.listAlbums())).toEqual([]);
});
