import { expect, login, navigateTo, test } from '../fixtures/katiesamp-test.mjs';

const administratorPassword = 'administrator-password';
const djPassword = 'separate-dj-password';

test.use({ serverLock: 'false' });

test('@full configures and opens the separate password-protected DJ workspace', async ({
    mockJellyfin,
    page,
}) => {
    mockJellyfin.setMusicFolders([
        { id: 'music-folder-1', name: "Katie O'Brien's Music" },
        { id: 'music-folder-2', name: 'DJ Music' },
    ]);
    await login(page);

    const mainFolder = page.getByRole('combobox', { name: 'Select music folder' });
    await mainFolder.click();
    await page.getByRole('option', { name: "Katie O'Brien's Music" }).click();

    await navigateTo(page, '/settings');
    await page
        .getByRole('textbox', { exact: true, name: 'Administrator password' })
        .fill(administratorPassword);
    await page.getByLabel('Confirm administrator password').fill(administratorPassword);
    await page.getByRole('button', { name: 'Set password and continue' }).click();

    await expect(page.getByLabel('Enable DJ Mode')).toHaveCount(0);
    const djSettingsTab = page.getByRole('tab', { exact: true, name: 'DJ Mode' });
    await expect(djSettingsTab).toBeVisible();
    await djSettingsTab.click();
    await expect(djSettingsTab).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { exact: true, name: 'Set DJ password' }).click();
    await page.getByRole('textbox', { exact: true, name: 'New DJ password' }).fill(djPassword);
    await page.getByRole('textbox', { name: 'Confirm new DJ password' }).fill(djPassword);
    await page
        .getByRole('dialog')
        .getByRole('button', { exact: true, name: 'Set DJ password' })
        .click();
    await expect(page.getByText('DJ password saved.')).toBeVisible();
    await expect(page.getByLabel('Enable DJ Mode')).toBeChecked();

    await navigateTo(page, '/');
    await page.getByRole('button', { exact: true, name: 'DJ Mode' }).click();
    await page
        .getByRole('textbox', { exact: true, name: 'DJ password' })
        .fill(administratorPassword);
    await page.getByRole('button', { exact: true, name: 'Open DJ Mode' }).click();
    await expect(page.getByText('The DJ password is incorrect.')).toBeVisible();
    await page.getByRole('textbox', { exact: true, name: 'DJ password' }).fill(djPassword);
    await page.getByRole('button', { exact: true, name: 'Open DJ Mode' }).click();

    const workspace = page.getByRole('dialog', { name: 'KatiesAmp DJ Mode' });
    await expect(workspace).toBeVisible();
    await expect(page.locator('#player-bar')).toHaveCount(0);
    await expect(workspace.getByRole('heading', { name: 'DJ Mode' })).toBeVisible();
    const djFolder = workspace.getByRole('combobox', { name: 'Select DJ music folder' });
    await expect(djFolder).toHaveValue("Katie O'Brien's Music");
    await expect(workspace.getByText('Automation Track 1', { exact: true })).toBeVisible();
    const albumFilter = workspace.getByRole('combobox', {
        name: 'Filter DJ library by album',
    });
    await expect(albumFilter).toHaveValue('All tracks');
    await albumFilter.click();
    await page.getByRole('option', { exact: true, name: 'Automation Album' }).click();
    await expect(albumFilter).toHaveValue('Automation Album');
    await expect(workspace.getByText('Automation Track 1', { exact: true })).toBeVisible();
    await expect
        .poll(() =>
            mockJellyfin.state.requests.some((request) => {
                const query = Object.fromEntries(
                    Object.entries(request.query).map(([key, value]) => [key.toLowerCase(), value]),
                );
                return (
                    request.pathname.toLowerCase() === '/users/test-user/items' &&
                    query.includeitemtypes?.includes('Audio') &&
                    query.parentid === 'album-1'
                );
            }),
        )
        .toBe(true);
    await albumFilter.click();
    await page.getByRole('option', { exact: true, name: 'All tracks' }).click();
    await expect(albumFilter).toHaveValue('All tracks');
    const deckA = workspace.getByRole('region', { name: 'Deck A' });
    const deckAControls = workspace.getByRole('complementary', { name: 'Deck A controls' });
    const masterMixer = workspace.getByRole('region', { name: 'Master mixer' });
    const deckBControls = workspace.getByRole('complementary', { name: 'Deck B controls' });
    const deckB = workspace.getByRole('region', { name: 'Deck B' });
    await expect(deckA).toContainText('Not ready');
    await expect(deckAControls).toContainText('A');
    await expect(deckBControls).toContainText('B');
    await expect(deckAControls.getByRole('meter', { name: 'Deck A output level' })).toHaveAttribute(
        'aria-valuenow',
        '0',
    );
    await expect(masterMixer.getByRole('meter', { name: 'Master output level' })).toHaveAttribute(
        'aria-valuenow',
        '0',
    );
    await expect(masterMixer).toContainText('Limiter ready');
    const deckABox = await deckA.boundingBox();
    const deckAControlsBox = await deckAControls.boundingBox();
    const masterMixerBox = await masterMixer.boundingBox();
    const deckBControlsBox = await deckBControls.boundingBox();
    const deckBBox = await deckB.boundingBox();
    expect(deckABox).not.toBeNull();
    expect(deckAControlsBox).not.toBeNull();
    expect(masterMixerBox).not.toBeNull();
    expect(deckBControlsBox).not.toBeNull();
    expect(deckBBox).not.toBeNull();
    expect(deckABox.x).toBeLessThan(deckAControlsBox.x);
    expect(deckAControlsBox.x).toBeLessThan(masterMixerBox.x);
    expect(masterMixerBox.x).toBeLessThan(deckBControlsBox.x);
    expect(deckBControlsBox.x).toBeLessThan(deckBBox.x);
    const positionBox = await deckA.getByLabel('Deck A position').boundingBox();
    const waveformBox = await deckA.getByLabel('Deck A waveform', { exact: true }).boundingBox();
    expect(positionBox).not.toBeNull();
    expect(waveformBox).not.toBeNull();
    expect(positionBox.y).toBeLessThan(waveformBox.y);
    expect(waveformBox.height).toBeLessThanOrEqual(80);

    await workspace
        .getByRole('button', { name: 'Load Automation Track 1 to Deck A' })
        .first()
        .click();
    await expect(deckA).toContainText('Automation Track 1');
    await expect(deckA.getByRole('button', { name: 'Deck A waveform zoom 4x' })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await deckA.getByRole('button', { name: 'Deck A waveform zoom 8x' }).click();
    await expect(deckA.getByRole('button', { name: 'Deck A waveform zoom 8x' })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    const deckAPosition = deckA.getByLabel('Deck A position');
    await expect(deckAPosition).toBeEnabled();
    await expect
        .poll(() =>
            page.evaluate(() => Boolean(window.localStorage.getItem('katiesamp-dj-waveform-v1'))),
        )
        .toBe(true);
    const deckADuration = Number(await deckAPosition.getAttribute('max'));
    await deckAPosition.fill(String(deckADuration - 5));
    await expect(deckA.getByText(/Ending in \d+s/)).toBeVisible();
    await deckAPosition.fill('0');
    const deckABpm = deckA.getByLabel('Deck A BPM');
    await expect(deckABpm).toHaveText(/^\d+\.\d BPM$/, { timeout: 20_000 });
    const detectedBpm = Number.parseFloat(await deckABpm.textContent());
    expect(detectedBpm).toBeGreaterThanOrEqual(115);
    expect(detectedBpm).toBeLessThanOrEqual(125);
    const artworkBox = await deckA.getByLabel('Deck A artwork').boundingBox();
    const bpmBox = await deckABpm.boundingBox();
    expect(artworkBox).not.toBeNull();
    expect(bpmBox).not.toBeNull();
    expect(bpmBox.y).toBeGreaterThanOrEqual(artworkBox.y + artworkBox.height);
    const deckAPitch = deckA.getByRole('slider', { name: 'Deck A pitch' });
    const pitchBox = await deckAPitch.boundingBox();
    expect(pitchBox).not.toBeNull();
    expect(pitchBox.height).toBeGreaterThan(pitchBox.width);
    const centrePitch = deckA.getByRole('button', { name: 'Deck A centre pitch' });
    const range8 = deckA.getByRole('button', { name: 'Deck A use 8 percent pitch range' });
    const range15 = deckA.getByRole('button', { name: 'Deck A use 15 percent pitch range' });
    const centrePitchBox = await centrePitch.boundingBox();
    expect(centrePitchBox).not.toBeNull();
    expect(Math.abs(centrePitchBox.width - centrePitchBox.height)).toBeLessThanOrEqual(2);
    expect(centrePitchBox.x).toBeGreaterThanOrEqual(pitchBox.x + pitchBox.width);
    await expect(range8).toHaveAttribute('aria-pressed', 'true');
    await range15.click();
    await expect(range15).toHaveAttribute('aria-pressed', 'true');
    await expect(deckAPitch).toHaveAttribute('max', '15');
    await deckAPitch.fill('12');
    await centrePitch.click();
    await expect(deckAPitch).toHaveValue('0');
    await deckAPitch.fill('12');
    await range8.click();
    await expect(deckAPitch).toHaveAttribute('max', '8');
    await expect(deckAPitch).toHaveValue('8');
    await deckAPitch.fill('5');
    await expect(deckAPitch).toHaveValue('5');
    const bendUp = deckA.getByRole('button', { name: 'Deck A pitch bend up' });
    const bendBox = await bendUp.boundingBox();
    const cueBox = await deckA.getByRole('button', { exact: true, name: 'Cue' }).boundingBox();
    expect(bendBox).not.toBeNull();
    expect(cueBox).not.toBeNull();
    expect(bendBox.width).toBeLessThan(cueBox.width);
    expect(bendBox.y).toBeGreaterThanOrEqual(pitchBox.y + pitchBox.height);
    await bendUp.dispatchEvent('pointerdown');
    await expect(bendUp).toHaveAttribute('aria-pressed', 'true');
    await bendUp.dispatchEvent('pointerup');
    await expect(bendUp).toHaveAttribute('aria-pressed', 'false');
    await expect(deckA.getByRole('button', { exact: true, name: '½ BPM' })).toHaveCount(0);
    await expect(deckA.getByRole('button', { exact: true, name: '2× BPM' })).toHaveCount(0);
    const syncBpm = deckA.getByRole('button', { exact: true, name: 'Sync BPM' });
    await expect(syncBpm).toBeDisabled();
    await workspace
        .getByRole('button', { name: 'Load Automation Track 2 to Deck B' })
        .first()
        .click();
    await expect(deckB.getByLabel('Deck B BPM')).toHaveText(/^\d+\.\d BPM$/, {
        timeout: 20_000,
    });
    await expect(syncBpm).toBeEnabled();
    await deckAPitch.fill('-8');
    await syncBpm.click();
    expect(Number(await deckAPitch.inputValue())).toBeGreaterThan(0);
    expect(
        await page.evaluate(() =>
            Object.values(
                JSON.parse(window.localStorage.getItem('katiesamp-dj-bpm-v1') || '{}'),
            ).some((value) => typeof value === 'number'),
        ),
    ).toBe(true);
    await expect(masterMixer).toContainText('Limiter ready');
    const treble = deckAControls.getByRole('slider', { exact: true, name: 'Deck A Treble' });
    await treble.fill('6');
    await expect(treble).toHaveValue('6');
    await treble.dblclick();
    await expect(treble).toHaveValue('0');
    const filter = deckAControls.getByLabel('Deck A Filter');
    await filter.fill('0.5');
    await expect(filter).toHaveValue('0.5');
    const channelVolume = deckAControls.getByRole('slider', {
        exact: true,
        name: 'Deck A channel volume',
    });
    const channelVolumeBox = await channelVolume.boundingBox();
    expect(channelVolumeBox).not.toBeNull();
    expect(channelVolumeBox.width).toBeGreaterThan(70);
    await channelVolume.fill('0.75');
    await expect(channelVolume).toHaveValue('0.75');
    await channelVolume.fill('0');
    await deckAControls.getByRole('button', { name: 'Reset Deck A channel volume' }).click();
    await expect(channelVolume).toHaveValue('1');
    const trebleKill = deckAControls.getByRole('button', { name: 'Deck A Treble kill' });
    const frequencyLegend = deckA.getByLabel(
        'Frequency colours: treble blue, mids green, bass red',
    );
    await expect(frequencyLegend.locator('b')).toHaveText(['Treble', 'Mid', 'Bass']);
    await expect(frequencyLegend.getByText('Treble', { exact: true })).toHaveAttribute(
        'data-killed',
        'false',
    );
    await expect(trebleKill).toHaveAttribute('aria-pressed', 'false');
    await trebleKill.click();
    await expect(trebleKill).toHaveAttribute('aria-pressed', 'true');
    await expect(frequencyLegend.getByText('Treble', { exact: true })).toHaveAttribute(
        'data-killed',
        'true',
    );
    await expect(deckA.locator('[data-high-killed="true"]')).toHaveCount(1);
    await deckA.getByRole('button', { name: 'Eject Deck A' }).click();
    await expect(deckA).not.toContainText('Automation Track 1');
    await expect(deckA).toContainText('Not ready');
    await deckB.getByRole('button', { name: 'Eject Deck B' }).click();

    await workspace.getByRole('button', { name: 'Add Automation Track 2 to preparation' }).click();
    await expect(workspace.getByText('Automation Track 2', { exact: true })).toHaveCount(2);
    const preparationList = workspace.getByRole('list', { name: 'Preparation list' });
    await workspace
        .getByRole('listitem', { name: 'Automation Track 1 library track' })
        .dragTo(preparationList);
    await expect(preparationList.getByRole('listitem')).toHaveText([
        /Automation Track 2/,
        /Automation Track 1/,
    ]);
    await preparationList
        .getByRole('listitem', { name: 'Automation Track 1 preparation track' })
        .dragTo(
            preparationList.getByRole('listitem', {
                name: 'Automation Track 2 preparation track',
            }),
        );
    await expect(preparationList.getByRole('listitem')).toHaveText([
        /Automation Track 1/,
        /Automation Track 2/,
    ]);

    await djFolder.click();
    await page.getByRole('option', { name: 'DJ Music' }).click();
    await expect(djFolder).toHaveValue('DJ Music');
    const crossfader = workspace.getByLabel('Crossfader');
    await crossfader.fill('1');
    await workspace.getByRole('button', { exact: true, name: 'Centre crossfade' }).click();
    await expect(crossfader).toHaveValue('0');
    const crossfadeToggle = workspace.getByRole('button', {
        exact: true,
        name: 'Disable crossfade',
    });
    await expect(crossfadeToggle).toHaveAttribute('aria-pressed', 'false');
    await crossfadeToggle.click();
    await expect(crossfader).toBeDisabled();
    await expect(
        workspace.getByRole('button', { exact: true, name: 'Enable crossfade' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await workspace.getByRole('button', { exact: true, name: 'Enable crossfade' }).click();
    await expect(crossfader).toBeEnabled();
    await workspace.getByRole('button', { exact: true, name: 'Exit DJ Mode' }).click();
    await expect(workspace).not.toBeVisible();
    await expect(page.locator('#player-bar')).toBeVisible();
    await expect(mainFolder).toHaveValue("Katie O'Brien's Music");
});
