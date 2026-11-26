import { readFile } from 'node:fs/promises';

import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

test('@full lists shared resource PDFs and opens the latest copy without interrupting playback', async ({
    electronApp,
    mockJellyfin,
    page,
}) => {
    const guide = {
        Id: 'resource-music-guide',
        Name: 'Venue Music Guide',
        Path: '/resources/Venue Music Guide.PDF',
        bytes: Buffer.from('%PDF-1.7\n% Revision 1\n'),
    };
    mockJellyfin.state.resourceLibrary = {
        documents: [
            guide,
            {
                Id: 'resource-book',
                Name: 'EPUB example',
                Path: '/resources/Other.epub',
            },
        ],
        id: 'venue-resources',
        name: 'Music & DJ Resources',
    };
    await electronApp.evaluate(({ app, shell }) => {
        app.setPath('temp', app.getPath('userData'));
        globalThis.openedResourcePaths = [];
        shell.openPath = async (path) => {
            globalThis.openedResourcePaths.push(path);
            return '';
        };
    });
    const openedPaths = () => electronApp.evaluate(() => globalThis.openedResourcePaths);

    await login(page);
    const sidebar = page.locator('#left-sidebar');
    const album = sidebar.getByRole('link', { name: 'Automation Album', exact: true });
    const resources = sidebar.getByRole('region', { name: 'Music & DJ Resources' });
    const openGuide = resources.getByRole('button', { name: guide.Name });
    await expect(openGuide).toBeInViewport();
    expect((await resources.boundingBox()).y).toBeGreaterThan((await album.boundingBox()).y);
    await expect(resources.getByText('EPUB example')).toHaveCount(0);

    await navigateTo(page, '/library/songs');
    await getSongCell(page, 'Automation Track 1').dblclick();
    const playerBar = page.locator('.media-player');
    const pause = playerBar.getByRole('button', { exact: true, name: 'Pause' });
    await expect(pause).toBeVisible();

    await openGuide.click();
    await expect.poll(async () => (await openedPaths()).length).toBe(1);
    expect(await readFile((await openedPaths())[0], 'utf8')).toContain('Revision 1');
    await expect(pause).toBeVisible();

    guide.bytes = Buffer.from('%PDF-1.7\n% Revision 2\n');
    await openGuide.click();
    await expect.poll(async () => (await openedPaths()).length).toBe(2);
    expect(await readFile((await openedPaths())[1], 'utf8')).toContain('Revision 2');
    await expect(playerBar).toContainText('Automation Track 1');
    await expect(pause).toBeVisible();

    mockJellyfin.setDeniedItemIds([guide.Id]);
    await openGuide.click();
    await expect(page.getByText('Could not open the PDF.', { exact: false })).toBeVisible();
    expect(await openedPaths()).toHaveLength(2);
});

test('@full refreshes versioned PDF names after an hour with the app open', async ({
    mockJellyfin,
    page,
}) => {
    const library = {
        documents: [
            {
                Id: 'dj-briefing-v1',
                Name: 'DJ Briefing v1',
                Path: '/resources/DJ Briefing v1.pdf',
            },
        ],
        id: 'venue-resources',
        name: 'Music & DJ Resources',
    };
    mockJellyfin.state.resourceLibrary = library;
    await page.clock.install();
    await login(page);

    const resources = page.getByRole('region', { name: 'Music & DJ Resources' });
    const oldBriefing = resources.getByRole('button', { exact: true, name: 'DJ Briefing v1' });
    const newBriefing = resources.getByRole('button', { exact: true, name: 'DJ Briefing v2' });
    await expect(oldBriefing).toBeVisible();

    library.documents = [
        {
            Id: 'dj-briefing-v2',
            Name: 'DJ Briefing v2',
            Path: '/resources/DJ Briefing v2.pdf',
        },
    ];
    await page.clock.fastForward(59 * 60_000);
    expect(
        mockJellyfin.state.requests.filter((request) => request.query.IncludeItemTypes === 'Book'),
    ).toHaveLength(1);
    await expect(oldBriefing).toBeVisible();

    await page.clock.fastForward(60_000);
    await expect(newBriefing).toBeVisible();
    await expect(oldBriefing).toHaveCount(0);
    expect(
        mockJellyfin.state.requests.some((request) =>
            /^\/items\/dj-briefing-v[12]\/download$/i.test(request.pathname),
        ),
    ).toBe(false);
});
