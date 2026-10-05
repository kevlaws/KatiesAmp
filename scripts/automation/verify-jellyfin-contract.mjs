const serverUrl = process.argv[2] || 'http://127.0.0.1:8096';
const username = 'KatiesAmpAutomation';
const password = 'automation-password';
const clientAuthorization =
    'MediaBrowser Client="KatiesAmp Automation", Device="GitHub Actions", DeviceId="katiesamp-contract", Version="1.0.0"';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const request = async (pathname, { body, method = 'GET', token } = {}) => {
    const response = await fetch(new URL(pathname, serverUrl), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
            Accept: 'application/json',
            Authorization: clientAuthorization,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { 'X-Emby-Token': token } : {}),
        },
        method,
    });
    const text = await response.text();
    let value;
    try {
        value = text ? JSON.parse(text) : undefined;
    } catch {
        value = text;
    }
    if (!response.ok) {
        throw new Error(
            `${method} ${pathname} returned HTTP ${response.status}: ${JSON.stringify(value)}`,
        );
    }
    return { headers: response.headers, status: response.status, value };
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const waitFor = async (description, operation, timeoutMs = 60_000) => {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const value = await operation();
            if (value) return value;
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error(
        `Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`,
    );
};

const publicInfo = (await request('/System/Info/Public')).value;
for (const property of ['Id', 'ProductName', 'ServerName', 'Version']) {
    if (typeof publicInfo[property] !== 'string') {
        throw new Error(`Jellyfin public information is missing string property ${property}`);
    }
}
if (!publicInfo.ProductName.toLowerCase().includes('jellyfin')) {
    throw new Error(`Unexpected Jellyfin ProductName: ${publicInfo.ProductName}`);
}

if (!publicInfo.StartupWizardCompleted) {
    await request('/Startup/Configuration', {
        body: {
            MetadataCountryCode: 'GB',
            PreferredMetadataLanguage: 'en',
            UICulture: 'en-GB',
        },
        method: 'POST',
    });
    await request('/Startup/User', {
        body: { Name: username, Password: password },
        method: 'POST',
    });
    await request('/Startup/RemoteAccess', {
        body: { EnableAutomaticPortMapping: false, EnableRemoteAccess: true },
        method: 'POST',
    });
    await request('/Startup/Complete', { body: {}, method: 'POST' });
}

const authentication = (
    await request('/Users/AuthenticateByName', {
        body: { Pw: password, Username: username },
        method: 'POST',
    })
).value;
const token = authentication.AccessToken;
const userId = authentication.User?.Id;
if (!token || !userId) throw new Error('Jellyfin authentication did not return a token and user');

const user = (await request(`/Users/${userId}`, { token })).value;
if (user.Name !== username || typeof user.Policy?.IsAdministrator !== 'boolean') {
    throw new Error('Authenticated user and permission contract is incomplete');
}

let folders = (await request('/Library/VirtualFolders', { token })).value;
if (!folders.some((folder) => folder.Name === 'Automation Music')) {
    const query = new URLSearchParams({
        collectionType: 'music',
        name: 'Automation Music',
        paths: '/media',
        refreshLibrary: 'true',
    });
    await request(`/Library/VirtualFolders?${query}`, { method: 'POST', token });
    folders = (await request('/Library/VirtualFolders', { token })).value;
}
if (!folders.some((folder) => folder.Name === 'Automation Music')) {
    throw new Error('Jellyfin did not expose the automation music folder');
}

await request('/Library/Refresh', { method: 'POST', token });

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getItems = async (type) => {
    const query = new URLSearchParams({ IncludeItemTypes: type, Recursive: 'true' });
    return (await request(`/Users/${userId}/Items?${query}`, { token })).value.Items;
};

const songs = await waitFor('the generated audio track to be indexed', async () => {
    const items = await getItems('Audio');
    return items.find((item) => item.Name.includes('Automation Track')) ? items : null;
});
const song = songs.find((item) => item.Name.includes('Automation Track'));
if (!song) throw new Error('Jellyfin audio listing did not include the generated track');

const albums = await getItems('MusicAlbum');
if (!Array.isArray(albums)) throw new Error('Jellyfin album response did not contain Items');

const artists = (
    await request(`/Artists/AlbumArtists?UserId=${encodeURIComponent(userId)}`, { token })
).value.Items;
if (!Array.isArray(artists)) throw new Error('Jellyfin artist response did not contain Items');

const searchQuery = new URLSearchParams({
    IncludeItemTypes: 'Audio',
    Recursive: 'true',
    SearchTerm: 'Automation Track',
    UserId: userId,
});
const searchItems = (await request(`/Items?${searchQuery}`, { token })).value.Items;
if (!searchItems.some((item) => item.Id === song.Id)) {
    throw new Error('Jellyfin search did not return the generated track');
}

const playlistQuery = new URLSearchParams({
    Ids: song.Id,
    MediaType: 'Audio',
    Name: 'Automation Playlist',
    UserId: userId,
});
const playlist = (await request(`/Playlists?${playlistQuery}`, { method: 'POST', token })).value;
if (!playlist?.Id) throw new Error('Jellyfin playlist creation did not return an id');
const playlistItems = (
    await request(`/Playlists/${playlist.Id}/Items?UserId=${encodeURIComponent(userId)}`, {
        token,
    })
).value.Items;
if (!playlistItems.some((item) => item.Id === song.Id)) {
    throw new Error('Jellyfin playlist listing did not return the generated track');
}

const playback = await fetch(
    new URL(`/Audio/${song.Id}/stream?static=true&api_key=${encodeURIComponent(token)}`, serverUrl),
    { headers: { Range: 'bytes=0-127' } },
);
if (!playback.ok || !playback.headers.get('content-type')?.startsWith('audio/')) {
    throw new Error(
        `Jellyfin playback endpoint returned HTTP ${playback.status} and ${playback.headers.get('content-type')}`,
    );
}
if ((await playback.arrayBuffer()).byteLength === 0) {
    throw new Error('Jellyfin playback endpoint returned an empty response');
}

console.log(
    `Validated Jellyfin ${publicInfo.Version}: authentication, permissions, folders, albums, artists, search, playlists, and playback`,
);
