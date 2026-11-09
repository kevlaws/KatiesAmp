import assert from 'node:assert/strict';
import test from 'node:test';

import { createSeasonalHomeLogoRefreshScheduler } from '../src/renderer/features/home/utils/seasonal-home-logo-refresh.ts';
import { getSeasonalHomeLogo } from '../src/renderer/features/home/utils/seasonal-home-logo.ts';

const createClock = (initialDate) => {
    let nextTimerId = 0;
    let now = initialDate.getTime();
    const timers = new Map();

    return {
        advanceTo: (date) => {
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
            }
            now = target;
        },
        cancelTimer: (id) => timers.delete(id),
        jumpTo: (date) => {
            now = date.getTime();
        },
        nextTimerAt: () => {
            const next = [...timers.values()].sort((left, right) => left.at - right.at)[0];
            return next?.at ?? null;
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

const createHarness = (initialDate) => {
    const clock = createClock(initialDate);
    const refreshes = [];
    const scheduler = createSeasonalHomeLogoRefreshScheduler({
        cancelTimer: clock.cancelTimer,
        now: clock.now,
        onRefresh: () => {
            const refreshedAt = clock.now();
            refreshes.push({
                logo: getSeasonalHomeLogo(refreshedAt),
                refreshedAt,
            });
        },
        scheduleTimer: clock.scheduleTimer,
    });

    return { clock, refreshes, scheduler };
};

test('refreshes at the next local midnight and schedules the following midnight', () => {
    const harness = createHarness(new Date(2026, 11, 30, 23, 59, 30));

    harness.scheduler.start();

    assert.equal(harness.refreshes.length, 0);
    assert.equal(harness.clock.timerCount(), 1);
    assert.equal(harness.clock.nextTimerAt(), new Date(2026, 11, 31).getTime());

    harness.clock.advanceTo(new Date(2026, 11, 31));

    assert.equal(harness.refreshes.length, 1);
    assert.equal(harness.refreshes[0].refreshedAt.getTime(), new Date(2026, 11, 31).getTime());
    assert.equal(harness.refreshes[0].logo, 'new-year');
    assert.equal(harness.clock.timerCount(), 1);
    assert.equal(harness.clock.nextTimerAt(), new Date(2027, 0, 1).getTime());
});

test('returning to a visible document refreshes after sleep and replaces the stale timer', () => {
    const harness = createHarness(new Date(2026, 11, 30, 22));

    harness.scheduler.start();
    harness.clock.jumpTo(new Date(2026, 11, 31, 8));
    harness.scheduler.handleVisibilityChange('hidden');

    assert.equal(harness.refreshes.length, 0);
    assert.equal(harness.clock.nextTimerAt(), new Date(2026, 11, 31).getTime());

    harness.scheduler.handleVisibilityChange('visible');

    assert.equal(harness.refreshes.length, 1);
    assert.equal(harness.refreshes[0].logo, 'new-year');
    assert.equal(harness.refreshes[0].refreshedAt.getTime(), new Date(2026, 11, 31, 8).getTime());
    assert.equal(harness.clock.timerCount(), 1);
    assert.equal(harness.clock.nextTimerAt(), new Date(2027, 0, 1).getTime());
});

test('disposing cancels the pending refresh and ignores later visibility changes', () => {
    const harness = createHarness(new Date(2026, 9, 30, 23));

    harness.scheduler.start();
    harness.scheduler.dispose();

    assert.equal(harness.clock.timerCount(), 0);

    harness.clock.advanceTo(new Date(2026, 9, 31, 12));
    harness.scheduler.handleVisibilityChange('visible');

    assert.equal(harness.refreshes.length, 0);
    assert.equal(harness.clock.timerCount(), 0);
});
