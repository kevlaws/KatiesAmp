import { useQuery } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import {
    accountVenue,
    fetchLineup,
    readSavedLineup,
    Show,
    Venue,
    venueDay,
    venueNames,
} from './lineup';

import { useCurrentServer } from '/@/renderer/store';
import { logger } from '/@/renderer/utils/logger';
import { useLocalStorage } from '/@/shared/hooks/use-local-storage';

type Lineup = {
    canChoose: boolean;
    choose: (venue: Venue) => void;
    date: string;
    failed: boolean;
    loading: boolean;
    refresh: () => void;
    shows?: Show[];
    venue?: Venue;
};
const LineupContext = createContext<Lineup | null>(null);
export const useLineup = () => useContext(LineupContext)!;

export function LiveMusicProvider({ children }: { children: ReactNode }) {
    const server = useCurrentServer();
    return (
        <VenueLineup key={JSON.stringify([server?.id, server?.userId])} server={server}>
            {children}
        </VenueLineup>
    );
}

function VenueLineup({
    children,
    server,
}: {
    children: ReactNode;
    server: ReturnType<typeof useCurrentServer>;
}) {
    const assigned = accountVenue(server?.username);
    const canChoose = Boolean(server?.isAdmin && !assigned);
    const [selection, choose] = useLocalStorage<null | Venue>({
        defaultValue: null,
        getInitialValueInEffect: false,
        key: 'gigpig-selected-venue:' + JSON.stringify([server?.id, server?.userId]),
    });
    const venue =
        assigned ??
        (canChoose && selection && venueNames.includes(selection) ? selection : undefined);
    const [day, setDay] = useState(() => venueDay());
    useEffect(() => {
        let timer: number;
        const update = () => {
            const current = venueDay();
            setDay((previous) => (previous.date === current.date ? previous : current));
            window.clearTimeout(timer);
            timer = window.setTimeout(update, Math.max(1, current.end - Date.now()));
        };
        update();
        window.addEventListener('focus', update);
        document.addEventListener('visibilitychange', update);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('focus', update);
            document.removeEventListener('visibilitychange', update);
        };
    }, []);
    const lineup = useQuery<{ failed: boolean; shows?: Show[] }>({
        enabled: Boolean(venue),
        initialData: () => {
            const shows = venue && readSavedLineup(venue, day.date);
            return shows ? { failed: false, shows } : undefined;
        },
        networkMode: 'always',
        queryFn: async ({ signal }) => {
            try {
                return { failed: false, shows: await fetchLineup(venue!, day, signal) };
            } catch (error) {
                if (signal.aborted) throw error;
                logger.warn('Could not refresh GigPig lineup', { error: String(error), venue });
                return { failed: true, shows: readSavedLineup(venue!, day.date) };
            }
        },
        queryKey: ['gigpig', venue, day.date],
        refetchOnMount: 'always',
        refetchOnReconnect: (query) => (query.state.data?.failed ? 'always' : false),
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Infinity,
    });
    return (
        <LineupContext.Provider
            value={{
                canChoose,
                choose,
                date: day.date,
                failed: Boolean(lineup.data?.failed),
                loading: lineup.isFetching,
                refresh: () => {
                    if (venue) void lineup.refetch({ cancelRefetch: false });
                },
                shows: lineup.data?.shows,
                venue,
            }}
        >
            {children}
        </LineupContext.Provider>
    );
}
