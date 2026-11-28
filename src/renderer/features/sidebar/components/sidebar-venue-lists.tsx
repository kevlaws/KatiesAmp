import { SidebarLiveMusic } from '/@/renderer/features/live-music/live-music';
import { SidebarResourceDocuments } from '/@/renderer/features/sidebar/components/sidebar-resource-documents';

export function SidebarVenueLists() {
    return (
        <>
            <SidebarResourceDocuments />
            <SidebarLiveMusic />
        </>
    );
}
