import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const feed = 'https://widgets.gigpig.uk/calendar/whatson?*';
const birmingham = '9720c1ad-93f0-416a-906c-870d44d48419';
const york = 'bd23c9a4-fc19-4694-953d-13190a8a93e1';
const event = (venue, artist, start, id = 1) => ({
    artist: { name: artist },
    id,
    start,
    venue: { uuid: venue },
});
const documentsTitle = 'Music & DJ Resources';
const musicTitle = 'Today’s live music';

test('@full shares a single Birmingham Cavern lineup across both views, with independently collapsible venue lists', async ({
    mockJellyfin,
    page,
}) => {
    mockJellyfin.state.username = 'Birmingham Cavern';
    mockJellyfin.state.isAdmin = false;
    mockJellyfin.state.resourceLibrary = {
        documents: [{ Id: 'brief', Name: 'DJ Briefing', Path: '/docs/DJ Briefing.pdf' }],
        id: 'documents',
        name: documentsTitle,
    };
    await page.clock.install({ time: new Date('2026-11-27T12:00:00Z') });
    const calls = [];
    let name = 'Afternoon set';
    await page.route(feed, async (route) => {
        calls.push(new URL(route.request().url()).searchParams.get('venue'));
        await route.fulfill({
            json: { data: [event(birmingham, name, '2026-11-27T14:00:00+00:00')], success: true },
        });
    });
    await login(page, { username: 'Birmingham Cavern' });
    await expect(page.getByText('Afternoon set', { exact: false })).toBeVisible();
    await navigateTo(page, '/library/songs');
    await getSongCell(page, 'Automation Track 1').dblclick();
    await page.getByRole('button', { name: 'View queue' }).click();
    const right = page.locator('#sidebar-queue');
    const docs = right.getByRole('button', { exact: true, name: documentsTitle });
    const music = right.getByRole('button', { exact: true, name: musicTitle });
    await docs.click();
    await expect(right.getByRole('button', { name: 'DJ Briefing' })).toBeHidden();
    await expect(right.getByText('Afternoon set', { exact: false })).toBeVisible();
    await music.focus();
    await page.keyboard.press('Enter');
    await expect(music).toHaveAttribute('aria-expanded', 'false');
    await docs.click();
    await expect(right.getByRole('button', { name: 'DJ Briefing' })).toBeVisible();
    await page.getByRole('link', { exact: true, name: 'Live music' }).click();
    const table = page.getByRole('table', { name: musicTitle });
    await expect(table).toContainText('14:00');
    expect(calls).toEqual([birmingham]);
    name = 'Revised set';
    await page.getByRole('button', { name: 'Refresh lineup' }).click();
    await expect(table).toContainText(name);
    await music.click();
    await expect(right.getByText(name, { exact: false })).toBeVisible();
    await expect(right.getByRole('combobox')).toHaveCount(0);
    await expect(
        page.locator('.media-player').getByRole('button', { exact: true, name: 'Pause' }),
    ).toBeVisible();
    expect(calls).toEqual([birmingham, birmingham]);
});

test('@full Admin remembers the chosen venue, uses its saved lineup offline and rolls over at 04:00', async ({
    page,
}) => {
    await page.clock.install({ time: new Date('2026-11-28T03:55:00Z') });
    let failing = false;
    const calls = [];
    await page.route(feed, async (route) => {
        calls.push(new URL(route.request().url()).searchParams.get('venue'));
        if (failing) return route.fulfill({ body: '', status: 503 });
        return route.fulfill({
            json: {
                data: [
                    event(york, 'Late set', '2026-11-28T02:00:00+00:00'),
                    event(york, 'Saturday set', '2026-11-28T18:00:00+00:00', 2),
                ],
                success: true,
            },
        });
    });
    await login(page);
    const sidebar = page.locator('#left-sidebar');
    await sidebar.getByLabel('Choose venue', { exact: true }).click();
    expect(calls).toEqual([]);
    await page.getByRole('option', { exact: true, name: 'York' }).click();
    await expect(sidebar).toContainText('Late set');
    failing = true;
    await page.reload();
    await expect(sidebar).toContainText('Showing the saved lineup');
    await expect(sidebar).toContainText('Late set');
    await expect(sidebar).not.toContainText('Saturday set');
    await page.clock.fastForward(5 * 60_000);
    await expect(sidebar).toContainText('The lineup is unavailable');
    await expect(sidebar).not.toContainText('Late set');
    failing = false;
    await sidebar.getByRole('button', { exact: true, name: 'Refresh' }).click();
    await expect(sidebar).toContainText('Saturday set');
    expect(calls).toEqual([york, york, york, york]);
    await sidebar.getByLabel('Choose venue', { exact: true }).click();
    await page.getByRole('option', { exact: true, name: 'Birmingham' }).click();
    await expect(sidebar).toContainText('No live music listed for this day');
    await expect(sidebar).not.toContainText('Saturday set');
    expect(calls.at(-1)).toBe(birmingham);
});
