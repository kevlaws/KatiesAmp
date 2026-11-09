import { useMemo } from 'react';

import { DownloadAction } from '/@/renderer/features/context-menu/actions/download-action';
import { GoToAction } from '/@/renderer/features/context-menu/actions/go-to-action';
import { PlayAction } from '/@/renderer/features/context-menu/actions/play-action';
import { SetFavoriteAction } from '/@/renderer/features/context-menu/actions/set-favorite-action';
import { SetRatingAction } from '/@/renderer/features/context-menu/actions/set-rating-action';
import { ContextMenuPreview } from '/@/renderer/features/context-menu/components/context-menu-preview';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { LibraryItem, Song } from '/@/shared/types/domain-types';

interface PlaylistSongContextMenuProps {
    items: Song[];
    type: LibraryItem.PLAYLIST_SONG;
}

export const PlaylistSongContextMenu = ({ items, type }: PlaylistSongContextMenuProps) => {
    const { ids } = useMemo(() => {
        const ids = items.map((item) => item.id);
        return { ids };
    }, [items]);

    return (
        <ContextMenu.Content
            bottomStickyContent={<ContextMenuPreview items={items} itemType={type} />}
        >
            <PlayAction ids={ids} inlineQueueActions="descriptive" itemType={type} songs={items} />
            <ContextMenu.Divider />
            <SetFavoriteAction ids={ids} itemType={type} />
            <SetRatingAction ids={ids} itemType={type} />
            <ContextMenu.Divider />
            <DownloadAction items={items} itemType={type} />
            <ContextMenu.Divider />
            <GoToAction items={items} />
        </ContextMenu.Content>
    );
};
