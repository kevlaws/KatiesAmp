export const KATIESAMP_DEFAULT_UI_SETTINGS = {
    fullScreenPlayer: {
        activeTab: 'queue',
    },
    general: {
        combinedLyricsAndVisualizer: true,
        externalLinks: false,
        homeFeatureStyle: 'multiple',
        showRatings: false,
        showVisualizerInSidebar: false,
    },
    lists: {
        album: {
            detailEnabledColumns: ['trackNumber', 'name', 'duration', 'userFavorite', 'actions'],
            display: 'table',
            enabledColumns: ['rowIndex', 'titleCombined', 'duration'],
        },
        albumArtist: {
            display: 'poster',
            enabledColumns: ['rowIndex', 'imageUrl', 'name', 'userFavorite'],
        },
        albumDetail: {
            display: 'table',
            enabledColumns: ['name', 'artists', 'duration'],
        },
        artist: {
            display: 'table',
            enabledColumns: ['imageUrl', 'name'],
        },
        fullScreen: {
            display: 'table',
            enabledColumns: ['titleCombined', 'duration', 'album', 'userFavorite'],
        },
        genre: {
            display: 'table',
            enabledColumns: ['rowIndex', 'name', 'songCount', 'albumCount'],
        },
        playlist: {
            display: 'table',
            enabledColumns: ['rowIndex', 'name', 'duration', 'songCount'],
        },
        playlistAlbum: {
            detailEnabledColumns: ['trackNumber', 'name', 'duration', 'userFavorite', 'actions'],
            display: 'poster',
            enabledColumns: [
                'rowIndex',
                'titleCombined',
                'duration',
                'genres',
                'releaseYear',
                'userFavorite',
            ],
        },
        playlistSong: {
            display: 'table',
            enabledColumns: ['rowIndex', 'titleCombined', 'duration', 'year', 'userFavorite'],
        },
        queueSong: {
            display: 'table',
            enabledColumns: [
                'rowIndex',
                'titleCombined',
                'duration',
                'album',
                'genres',
                'year',
                'userFavorite',
            ],
        },
        sideQueue: {
            display: 'table',
            enabledColumns: ['rowIndex', 'titleCombined', 'duration'],
        },
        song: {
            display: 'table',
            enabledColumns: ['rowIndex', 'titleCombined', 'duration', 'album'],
        },
    },
    sidebarEnabledItems: ['Home', 'Albums', 'Tracks', 'Artists-all', 'Settings'],
} as const;
