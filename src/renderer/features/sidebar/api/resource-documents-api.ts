import { queryOptions } from '@tanstack/react-query';

import { api } from '/@/renderer/api';
import { queryKeys } from '/@/renderer/api/query-keys';

export const resourceDocumentsQuery = (serverId: string, userId?: null | string) =>
    queryOptions({
        enabled: Boolean(serverId && userId),
        queryFn: ({ signal }) =>
            api.controller.getResourceDocuments({ apiClientProps: { serverId, signal } }),
        queryKey: queryKeys.resourceDocuments.list(serverId, userId),
        refetchInterval: 60 * 60_000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
        retry: 1,
        staleTime: 60_000,
    });
