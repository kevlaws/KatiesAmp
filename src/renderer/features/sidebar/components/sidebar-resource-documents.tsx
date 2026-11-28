import { useMutation, useQuery } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useTranslation } from 'react-i18next';

import styles from './sidebar-resource-documents.module.css';

import { api } from '/@/renderer/api';
import { resourceDocumentsQuery } from '/@/renderer/features/sidebar/api/resource-documents-api';
import { SidebarSection } from '/@/renderer/features/sidebar/components/sidebar-section';
import { useAuthStore, useCurrentServer } from '/@/renderer/store';
import { logger } from '/@/renderer/utils/logger';
import { Button } from '/@/shared/components/button/button';
import { Icon } from '/@/shared/components/icon/icon';
import { toast } from '/@/shared/components/toast/toast';
import { ServerType } from '/@/shared/types/domain-types';
import { ResourceDocument } from '/@/shared/types/resource-document';

export const SidebarResourceDocuments = () => {
    const server = useCurrentServer();
    if (!isElectron() || !window.api?.utils || server?.type !== ServerType.JELLYFIN) {
        return null;
    }
    return (
        <ResourceDocumentList
            key={`${server.id}:${server.userId}`}
            serverId={server.id}
            userId={server.userId}
        />
    );
};

const ResourceDocumentList = ({
    serverId,
    userId,
}: {
    serverId: string;
    userId?: null | string;
}) => {
    const { t } = useTranslation();
    const { data: documents } = useQuery(resourceDocumentsQuery(serverId, userId));
    const openPdf = useMutation({
        mutationFn: async (document: ResourceDocument) => {
            const bytes = await api.controller.getResourcePdf({
                apiClientProps: { serverId },
                query: { id: document.id },
            });
            const activeServer = useAuthStore.getState().currentServer;
            if (activeServer?.id !== serverId || activeServer.userId !== userId) return;
            await window.api.utils.openResourcePdf(bytes, document.name);
        },
        onError: (error, document) => {
            logger.warn('Could not open a venue resource', {
                error: error.message,
                itemId: document.id,
                serverId,
            });
            toast.error({ message: t('page.sidebar.resourceOpenError') });
        },
        retry: false,
    });

    if (!documents?.length) return null;

    return (
        <SidebarSection id="resources" title={t('page.sidebar.resources')}>
            {documents.map((document) => (
                <Button
                    className={styles.button}
                    classNames={{ inner: styles.inner, label: styles.label }}
                    disabled={openPdf.isPending && openPdf.variables.id !== document.id}
                    key={document.id}
                    loading={openPdf.isPending && openPdf.variables.id === document.id}
                    onClick={() => openPdf.mutate(document)}
                    title={document.name}
                    variant="subtle"
                >
                    <Icon className={styles.icon} icon="fileText" size="1rem" />
                    <span className={styles.name}>{document.name}</span>
                    <Icon
                        className={styles.openIcon}
                        color="primary"
                        icon="externalLink"
                        size="1rem"
                    />
                </Button>
            ))}
        </SidebarSection>
    );
};
