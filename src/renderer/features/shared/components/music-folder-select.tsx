import { useServerLibraryControls } from '/@/renderer/features/shared/hooks/use-server-library-controls';
import { Select } from '/@/shared/components/select/select';

export const MusicFolderSelect = () => {
    const { musicFolders, musicFoldersQuery, selectedMusicFolders, selectMusicFolder } =
        useServerLibraryControls();
    const options =
        musicFolders?.items.map((folder) => ({ label: folder.name, value: folder.id })) || [];

    return (
        <Select
            aria-label="Select music folder"
            data={options}
            disabled={
                musicFoldersQuery.isLoading ||
                musicFoldersQuery.isError ||
                !musicFolders?.items.length
            }
            onChange={(value) => {
                if (value) selectMusicFolder(value);
            }}
            placeholder={
                musicFoldersQuery.isLoading
                    ? 'Loading folders…'
                    : musicFolders?.items.length
                      ? 'Choose a music folder'
                      : 'Folders unavailable'
            }
            value={selectedMusicFolders[0]?.id || null}
            width="100%"
        />
    );
};
