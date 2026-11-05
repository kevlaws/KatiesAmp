import type {
    Album,
    AlbumListQuery,
    AlbumListSort,
    BasePaginatedResponse,
    ControllerEndpoint,
    MusicFolder,
    Song,
    SongListQuery,
    SongListSort,
    SortOrder,
} from '/@/shared/types/domain-types';

export type AutomaticAlbumInventory = {
    items: AutomaticAlbumInventoryItem[];
    musicFolders: MusicFolder[];
};

export type AutomaticAlbumInventoryItem = {
    album: Album;
    musicFolderIds: string[];
    tracks: Song[];
};

const ALBUM_PAGE_SIZE = 200;
const TRACK_ALBUM_BATCH_SIZE = 50;
const TRACK_FALLBACK_CONCURRENCY = 3;

type InventoryClient = Pick<
    ControllerEndpoint,
    'getAlbumList' | 'getMusicFolderList' | 'getSongList'
>;

type LoadAutomaticAlbumInventoryArgs = {
    client: InventoryClient;
    serverId: string;
    signal?: AbortSignal;
};

const assertExpectedServer = (serverId: string, item: { _serverId: string }, operation: string) => {
    if (item._serverId !== serverId) {
        throw new Error(`${operation} returned an item from another server`);
    }
};

const itemKey = (serverId: string, item: { id: string }) => JSON.stringify([serverId, item.id]);

const throwForResponseError = (response: BasePaginatedResponse<unknown[]>, operation: string) => {
    if (!response.error) return;
    if (response.error instanceof Error) throw response.error;
    throw new Error(`${operation}: ${String(response.error)}`);
};

const uniqueMusicFolders = (folders: MusicFolder[]) => {
    const seenIds = new Set<string>();
    return folders.filter((folder) => {
        if (seenIds.has(folder.id)) return false;
        seenIds.add(folder.id);
        return true;
    });
};

const chunk = <T>(items: T[], size: number) => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
};

export const loadAutomaticAlbumInventory = async ({
    client,
    serverId,
    signal,
}: LoadAutomaticAlbumInventoryArgs): Promise<AutomaticAlbumInventory> => {
    const musicFolderResponse = await client.getMusicFolderList({
        apiClientProps: { serverId, signal },
    });
    throwForResponseError(musicFolderResponse, 'Failed to load accessible music folders');

    const musicFolders = uniqueMusicFolders(musicFolderResponse.items);
    const inventoryByAlbumKey = new Map<string, AutomaticAlbumInventoryItem>();

    for (const musicFolder of musicFolders) {
        const seenFolderAlbumKeys = new Set<string>();
        let startIndex = 0;

        while (true) {
            const query: AlbumListQuery = {
                limit: ALBUM_PAGE_SIZE,
                musicFolderId: musicFolder.id,
                sortBy: 'name' as AlbumListSort,
                sortOrder: 'ASC' as SortOrder,
                startIndex,
            };
            const response = await client.getAlbumList({
                apiClientProps: { serverId, signal },
                query,
            });
            throwForResponseError(response, `Failed to load albums from ${musicFolder.name}`);

            let newFolderAlbumCount = 0;
            for (const album of response.items) {
                assertExpectedServer(serverId, album, 'Album inventory');
                const key = itemKey(serverId, album);
                if (!seenFolderAlbumKeys.has(key)) {
                    seenFolderAlbumKeys.add(key);
                    newFolderAlbumCount += 1;
                }

                const existing = inventoryByAlbumKey.get(key);
                if (existing) {
                    if (!existing.musicFolderIds.includes(musicFolder.id)) {
                        existing.musicFolderIds.push(musicFolder.id);
                    }
                } else {
                    inventoryByAlbumKey.set(key, {
                        album,
                        musicFolderIds: [musicFolder.id],
                        tracks: [],
                    });
                }
            }

            if (response.items.length === 0) break;
            if (startIndex > 0 && newFolderAlbumCount === 0) {
                throw new Error(`Album pagination did not advance for ${musicFolder.name}`);
            }

            const nextStartIndex = startIndex + response.items.length;
            if (response.totalRecordCount !== null && nextStartIndex >= response.totalRecordCount) {
                break;
            }
            if (response.totalRecordCount === null && response.items.length < ALBUM_PAGE_SIZE) {
                break;
            }
            startIndex = nextStartIndex;
        }
    }

    const inventoryItems = [...inventoryByAlbumKey.values()];
    const inventoryByAlbumId = new Map<string, AutomaticAlbumInventoryItem>();
    for (const item of inventoryItems) {
        inventoryByAlbumId.set(itemKey(serverId, item.album), item);
    }

    const seenTrackKeys = new Set<string>();
    for (const albumBatch of chunk(inventoryItems, TRACK_ALBUM_BATCH_SIZE)) {
        const albumIds = albumBatch.map(({ album }) => album.id);
        const albumIdSet = new Set(albumIds);
        const query: SongListQuery = {
            albumIds,
            limit: -1,
            sortBy: 'album' as SongListSort,
            sortOrder: 'ASC' as SortOrder,
            startIndex: 0,
        };
        const response = await client.getSongList({
            apiClientProps: { serverId, signal },
            query,
        });
        throwForResponseError(response, 'Failed to load album tracks');

        for (const track of response.items) {
            assertExpectedServer(serverId, track, 'Track inventory');
            const trackKey = itemKey(serverId, track);
            if (!albumIdSet.has(track.albumId) || seenTrackKeys.has(trackKey)) continue;

            const albumKey = itemKey(serverId, { id: track.albumId });
            const inventoryItem = inventoryByAlbumId.get(albumKey);
            if (!inventoryItem) continue;

            seenTrackKeys.add(trackKey);
            inventoryItem.tracks.push(track);
        }
    }

    // Jellyfin's multi-AlbumIds lookup does not reliably resolve folder-backed album views.
    // A single album lookup uses ParentId instead, so retry empty or incomplete results through
    // that route and attach its children to the requested display album even when their canonical
    // albumId differs.
    const fallbackItems = inventoryItems.filter(
        ({ album, tracks }) =>
            tracks.length === 0 ||
            (album.songCount !== null &&
                album.songCount !== undefined &&
                tracks.length < album.songCount),
    );
    let nextFallbackIndex = 0;
    const loadNextFallback = async () => {
        while (nextFallbackIndex < fallbackItems.length) {
            const inventoryItem = fallbackItems[nextFallbackIndex];
            nextFallbackIndex += 1;
            const response = await client.getSongList({
                apiClientProps: { serverId, signal },
                query: {
                    albumIds: [inventoryItem.album.id],
                    limit: -1,
                    sortBy: 'album' as SongListSort,
                    sortOrder: 'ASC' as SortOrder,
                    startIndex: 0,
                },
            });
            throwForResponseError(
                response,
                `Failed to load tracks from ${inventoryItem.album.name}`,
            );

            const seenAlbumTrackKeys = new Set<string>();
            inventoryItem.tracks = response.items.filter((track) => {
                assertExpectedServer(serverId, track, 'Track inventory');
                const key = itemKey(serverId, track);
                if (seenAlbumTrackKeys.has(key)) return false;
                seenAlbumTrackKeys.add(key);
                return true;
            });
        }
    };
    await Promise.all(
        Array.from(
            { length: Math.min(TRACK_FALLBACK_CONCURRENCY, fallbackItems.length) },
            loadNextFallback,
        ),
    );

    return { items: inventoryItems, musicFolders };
};
