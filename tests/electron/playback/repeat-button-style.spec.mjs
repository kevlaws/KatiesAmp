import { expect, getSongCell, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const backgroundColor = (button) =>
    button.evaluate((element) => getComputedStyle(element).backgroundColor);

test('@full clearly highlights repeat-one and repeat-all while repeat is enabled', async ({
    page,
}) => {
    await login(page);
    await navigateTo(page, '/library/songs');

    const song = getSongCell(page, 'Automation Track 1');
    await expect(song).toBeVisible({ timeout: 15_000 });
    await song.dblclick();

    const playerBar = page.locator('.media-player');
    const repeatOff = playerBar.getByRole('button', { name: 'Repeat disabled' });
    await expect(repeatOff).toHaveAttribute('aria-pressed', 'false');
    const inactiveBackground = await backgroundColor(repeatOff);
    const inactiveClass = await repeatOff.getAttribute('class');

    await repeatOff.click();
    const repeatOne = playerBar.getByRole('button', { name: 'Repeat one' });
    await expect(repeatOne).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => backgroundColor(repeatOne)).not.toBe(inactiveBackground);
    const repeatOneClass = await repeatOne.getAttribute('class');
    const repeatOneIcon = await repeatOne.locator('svg').evaluate((element) => element.outerHTML);
    expect(repeatOneClass).not.toBe(inactiveClass);

    await repeatOne.click();
    const repeatAll = playerBar.getByRole('button', { name: 'Repeat all' });
    await expect(repeatAll).toHaveAttribute('aria-pressed', 'true');
    expect(await repeatAll.getAttribute('class')).toBe(repeatOneClass);
    expect(await repeatAll.locator('svg').evaluate((element) => element.outerHTML)).not.toBe(
        repeatOneIcon,
    );

    await repeatAll.click();
    await expect(playerBar.getByRole('button', { name: 'Repeat disabled' })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
});
