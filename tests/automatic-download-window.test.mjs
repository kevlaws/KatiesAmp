import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createAutomaticDownloadWindowScheduler,
    getAutomaticDownloadOffsetMinutes,
    getAutomaticDownloadWindowPlan,
} from '../src/renderer/features/offline/utils/automatic-download-window.ts';

const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const createClock = (initialDate) => {
    let nextTimerId = 0;
    let now = initialDate.getTime();
    const timers = new Map();

    return {
        advanceTo: async (date) => {
            const target = date.getTime();
            while (true) {
                const next = [...timers.entries()]
                    .filter(([, candidate]) => candidate.at <= target)
                    .sort(([, left], [, right]) => left.at - right.at)[0];
                if (!next) break;

                const [id, timer] = next;
                timers.delete(id);
                now = timer.at;
                timer.callback();
                await flushPromises();
            }
            now = target;
            await flushPromises();
        },
        cancelTimer: (id) => timers.delete(id),
        jumpTo: (date) => {
            now = date.getTime();
        },
        now: () => new Date(now),
        scheduleTimer: (callback, delay) => {
            nextTimerId += 1;
            timers.set(nextTimerId, { at: now + delay, callback });
            return nextTimerId;
        },
        timerCount: () => timers.size,
    };
};

const deviceWithOffset = (predicate) => {
    for (let index = 0; index < 1_000; index += 1) {
        const deviceId = `device-${index}`;
        if (predicate(getAutomaticDownloadOffsetMinutes(deviceId))) return deviceId;
    }
    throw new Error('Unable to find a suitable test device');
};

const createHarness = ({ deviceId = 'venue-device', now }) => {
    const clock = createClock(now);
    const closed = [];
    const errors = [];
    const opened = [];
    const scheduler = createAutomaticDownloadWindowScheduler({
        cancelTimer: clock.cancelTimer,
        deviceId,
        endTime: '09:00',
        now: clock.now,
        onError: (error) => errors.push(error),
        onWindowClose: (window) => closed.push(window),
        onWindowOpen: (window, signal) => opened.push({ signal, window }),
        scheduleTimer: clock.scheduleTimer,
        startTime: '04:00',
    });

    return { clock, closed, errors, opened, scheduler };
};

test('device offsets are stable, bounded, and spread starts across the window', () => {
    const offsets = Array.from({ length: 64 }, (_, index) =>
        getAutomaticDownloadOffsetMinutes(`venue-${index}`),
    );

    assert.equal(getAutomaticDownloadOffsetMinutes('venue-12'), offsets[12]);
    assert.ok(offsets.every((offset) => Number.isInteger(offset) && offset >= 0 && offset <= 15));
    assert.ok(new Set(offsets).size > 1);
});

test('startup inside an active local-time window opens immediately', () => {
    const harness = createHarness({ now: new Date(2026, 5, 10, 5, 0) });

    harness.scheduler.start();

    assert.equal(harness.opened.length, 1);
    assert.equal(harness.closed.length, 0);
    assert.equal(harness.opened[0].signal.aborted, false);
    assert.equal(harness.clock.timerCount(), 1);
});

test('a device waits for its consistent offset before opening', async () => {
    const deviceId = deviceWithOffset((offset) => offset > 0);
    const offset = getAutomaticDownloadOffsetMinutes(deviceId);
    const harness = createHarness({ deviceId, now: new Date(2026, 5, 10, 4, 0) });

    harness.scheduler.start();
    assert.equal(harness.opened.length, 0);

    await harness.clock.advanceTo(new Date(2026, 5, 10, 4, offset - 1));
    assert.equal(harness.opened.length, 0);

    await harness.clock.advanceTo(new Date(2026, 5, 10, 4, offset));
    assert.equal(harness.opened.length, 1);
});

test('the configured end hard-stops active work and closes the window', async () => {
    const harness = createHarness({ now: new Date(2026, 5, 10, 8, 59) });

    harness.scheduler.start();
    const signal = harness.opened[0].signal;

    await harness.clock.advanceTo(new Date(2026, 5, 10, 9, 0));

    assert.equal(signal.aborted, true);
    assert.equal(harness.closed.length, 1);
    assert.equal(harness.opened.length, 1);
    assert.equal(harness.clock.timerCount(), 1);
});

test('starting after a missed window waits until the next day', () => {
    const now = new Date(2026, 5, 10, 9, 1);
    const plan = getAutomaticDownloadWindowPlan({
        deviceId: 'venue-device',
        endTime: '09:00',
        now,
        startTime: '04:00',
    });

    assert.equal(plan.active, false);
    assert.equal(plan.window.startAt.getDate(), 11);
    assert.equal(plan.nextTransitionAt.getTime(), plan.window.startAt.getTime());
});

test('refresh after sleep closes an expired window without daytime catch-up', () => {
    const harness = createHarness({ now: new Date(2026, 5, 10, 8, 0) });

    harness.scheduler.start();
    const signal = harness.opened[0].signal;
    harness.clock.jumpTo(new Date(2026, 5, 10, 12, 0));
    harness.scheduler.refresh();

    assert.equal(signal.aborted, true);
    assert.equal(harness.closed.length, 1);
    assert.equal(harness.opened.length, 1);
    assert.equal(harness.clock.timerCount(), 1);
});

test('cross-midnight windows use local dates correctly', () => {
    const now = new Date(2026, 5, 11, 0, 30);
    const plan = getAutomaticDownloadWindowPlan({
        deviceId: 'venue-device',
        endTime: '02:00',
        now,
        startTime: '23:00',
    });

    assert.equal(plan.active, true);
    assert.equal(plan.window.startAt.getDate(), 10);
    assert.equal(plan.window.endAt.getDate(), 11);
    assert.equal(plan.window.endAt.getHours(), 2);
});

test('disposing hard-stops an active window and prevents later callbacks', async () => {
    const harness = createHarness({ now: new Date(2026, 5, 10, 8, 0) });

    harness.scheduler.start();
    const signal = harness.opened[0].signal;
    harness.scheduler.dispose();

    assert.equal(signal.aborted, true);
    assert.equal(harness.closed.length, 1);
    assert.equal(harness.clock.timerCount(), 0);

    await harness.clock.advanceTo(new Date(2026, 5, 11, 9, 0));
    harness.scheduler.start();
    assert.equal(harness.opened.length, 1);
});

test('invalid and equal windows are rejected', () => {
    const baseOptions = {
        deviceId: 'venue-device',
        endTime: '09:00',
        now: new Date(2026, 5, 10, 3, 0),
        startTime: '04:00',
    };

    assert.throws(() =>
        getAutomaticDownloadWindowPlan({ ...baseOptions, startTime: 'not-a-time' }),
    );
    assert.throws(() => getAutomaticDownloadWindowPlan({ ...baseOptions, endTime: '04:00' }));
});

test('a short configured window keeps the device delay inside the window', () => {
    const deviceId = deviceWithOffset((offset) => offset === 15);
    const plan = getAutomaticDownloadWindowPlan({
        deviceId,
        endTime: '04:05',
        now: new Date(2026, 5, 10, 3, 0),
        startTime: '04:00',
    });

    assert.ok(plan.window.offsetMinutes >= 0 && plan.window.offsetMinutes < 5);
    assert.ok(plan.window.startAt < plan.window.endAt);
});
