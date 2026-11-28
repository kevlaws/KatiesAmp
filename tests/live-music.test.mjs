import assert from 'node:assert/strict';
import test from 'node:test';

import {
    accountVenue,
    parseLineup,
    venueDay,
    venues,
} from '../src/renderer/features/live-music/lineup.ts';

test('venue usernames and the Cavern alias resolve only to their own public calendar', () => {
    for (const venue of Object.keys(venues)) assert.equal(accountVenue(venue.toUpperCase()), venue);
    assert.equal(accountVenue('  Birmingham Cavern  '), 'Birmingham');
    assert.equal(accountVenue('Katies York'), 'York');
    assert.equal(accountVenue('Admin'), undefined);
    assert.equal(accountVenue('New York'), undefined);
});

test('UK trading days end at 04:00 even across both clock changes', () => {
    for (const [date, start, end] of [
        ['2026-03-28', '2026-03-28T04:00Z', '2026-03-29T03:00Z'],
        ['2026-10-24', '2026-10-24T03:00Z', '2026-10-25T04:00Z'],
        ['2026-12-31', '2026-12-31T04:00Z', '2027-01-01T04:00Z'],
    ]) {
        const expected = { date, end: Date.parse(end), start: Date.parse(start) };
        assert.deepEqual(venueDay(expected.start), expected);
        assert.deepEqual(venueDay(expected.end - 1), expected);
        assert.equal(venueDay(expected.end).start, expected.end);
    }
});

test('the lineup includes simultaneous bookings and late sets, sorted within the venue day', () => {
    const entry = (id, start, venue = venues.York) => ({
        artist: { name: 'Act ' + id },
        id,
        start,
        venue: { uuid: venue },
    });
    const first = entry(1, '2026-07-01T04:00:00+01:00');
    const day = venueDay(Date.parse('2026-07-01T20:00:00Z'));
    const data = [
        entry(3, '2026-07-02T03:59:00+01:00'),
        first,
        first,
        null,
        entry(4, '2026-07-02T04:00:00+01:00'),
        entry(2, first.start),
        entry(5, first.start, venues.Leeds),
        entry(6, '2026-07-01T03:59:00+01:00'),
    ];
    assert.deepEqual(
        parseLineup({ data, success: true }, 'York', day).map((s) => s.id),
        ['1', '2', '3'],
    );
    assert.deepEqual(parseLineup({ data: [], success: true }, 'York', day), []);
    assert.throws(() => parseLineup({ success: false }, 'York', day));
    assert.throws(() => parseLineup({ data: [{}], success: true }, 'York', day));
});
