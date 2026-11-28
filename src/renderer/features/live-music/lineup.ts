import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { z } from 'zod';

dayjs.extend(utc);
dayjs.extend(timezone);
const zone = 'Europe/London';

// Public venue IDs from the GigPig calendars on the Katie's venue pages.
export const venues = {
    Barnsley: '36b8c4c4-90b3-4152-8941-92ea4b97c7ff',
    Birmingham: '9720c1ad-93f0-416a-906c-870d44d48419',
    Cheltenham: '06254ef0-1a87-4ac7-9c84-43aa4902bbb0',
    Durham: '717ac3b3-54d1-4958-a968-805fc896cb1d',
    Harrogate: '8dc089c7-bfe6-40d2-ac4d-64e9720822a3',
    Leeds: '0db0ee4e-7371-46b1-a503-9ab6756b2723',
    Leicester: '2f649678-1880-4025-90e1-4c83bf949087',
    Lincoln: '97ea7133-01ac-4ca3-b4fd-4a00ca4004f1',
    Manchester: 'd11f49bd-362a-49eb-838d-4f149211dffb',
    Newcastle: 'f3864bbd-43eb-46af-a692-ac18c4cdd193',
    Nottingham: 'cc004416-2c4f-4622-a3e2-c9bac66f0b27',
    Sheffield: '65da1204-af2b-4563-a425-db392e0d9210',
    York: 'bd23c9a4-fc19-4694-953d-13190a8a93e1',
};
export type Venue = keyof typeof venues;
export const venueNames = Object.keys(venues) as Venue[];
export function accountVenue(username?: null | string) {
    const name = username
        ?.trim()
        .toLowerCase()
        .replace(/^katie['’]?s[\s_-]+/, '')
        .replace(/[\s_-]+/g, ' ');
    if (name === 'birmingham cavern') return 'Birmingham';
    return venueNames.find((venue) => venue.toLowerCase() === name);
}

export function venueDay(now = Date.now()) {
    const london = dayjs(now).tz(zone);
    const calendarDay = dayjs.utc(london.format('YYYY-MM-DD'));
    const date = (london.hour() < 4 ? calendarDay.subtract(1, 'day') : calendarDay).format(
        'YYYY-MM-DD',
    );
    const tomorrow = dayjs.utc(date).add(1, 'day').format('YYYY-MM-DD');
    return {
        date,
        end: dayjs.tz(tomorrow + ' 04:00', zone).valueOf(),
        start: dayjs.tz(date + ' 04:00', zone).valueOf(),
    };
}

const showSchema = z.object({ artist: z.string(), id: z.string(), start: z.number() });
const savedSchema = z.object({ date: z.string(), shows: z.array(showSchema) });
export type Show = z.infer<typeof showSchema>;
const feedSchema = z.object({ data: z.array(z.unknown()), success: z.literal(true) });
const eventSchema = z.object({
    artist: z.object({ name: z.string().trim().min(1) }),
    id: z.union([z.string(), z.number()]),
    start: z.string().datetime({ offset: true }),
    venue: z.object({ uuid: z.string() }),
});

export function parseLineup(payload: unknown, venue: Venue, day: ReturnType<typeof venueDay>) {
    const shows = new Map<string, Show>();
    const { data } = feedSchema.parse(payload);
    let hasValidBooking = false;
    for (const entry of data) {
        const event = eventSchema.safeParse(entry);
        if (!event.success) continue;
        hasValidBooking = true;
        if (event.data.venue.uuid !== venues[venue]) continue;
        const start = Date.parse(event.data.start);
        if (start >= day.start && start < day.end) {
            const id = String(event.data.id);
            shows.set(id, { artist: event.data.artist.name, id, start });
        }
    }
    if (data.length && !hasValidBooking) throw new Error('GigPig returned unrecognised bookings');
    return [...shows.values()].sort((a, b) => a.start - b.start);
}

const storageKey = (venue: Venue) => 'gigpig-lineup-v1:' + venues[venue];
export async function fetchLineup(
    venue: Venue,
    day: ReturnType<typeof venueDay>,
    signal: AbortSignal,
) {
    const response = await fetch(
        'https://widgets.gigpig.uk/calendar/whatson?venue=' + venues[venue],
        {
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
        },
    );
    if (!response.ok) throw new Error('GigPig returned HTTP ' + response.status);
    const shows = parseLineup(await response.json(), venue, day);
    try {
        localStorage.setItem(storageKey(venue), JSON.stringify({ date: day.date, shows }));
    } catch {
        // The current lineup remains usable in memory.
    }
    return shows;
}

export function readSavedLineup(venue: Venue, date: string) {
    try {
        const saved = savedSchema.safeParse(
            JSON.parse(localStorage.getItem(storageKey(venue)) ?? 'null'),
        );
        if (saved.success && saved.data.date === date) return saved.data.shows;
    } catch {
        // Storage can be unavailable in a temporary profile.
    }
    return undefined;
}
