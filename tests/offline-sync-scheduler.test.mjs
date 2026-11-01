import assert from 'node:assert/strict';
import test from 'node:test';

import { createOfflineSyncScheduler } from '../src/renderer/features/offline/utils/offline-sync-scheduler.ts';

const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const createClock = () => {
    let nextTimerId = 0;
    let now = 0;
    const timers = new Map();

    return {
        advance: async (duration) => {
            const target = now + duration;
            while (true) {
                const next = [...timers.entries()]
                    .filter(([, timer]) => timer.at <= target)
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
        now: () => now,
        scheduleTimer: (callback, delay) => {
            nextTimerId += 1;
            timers.set(nextTimerId, { at: now + delay, callback });
            return nextTimerId;
        },
        timerCount: () => timers.size,
    };
};

const deferred = () => {
    let reject;
    let resolve;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        reject = rejectPromise;
        resolve = resolvePromise;
    });
    return { promise, reject, resolve };
};

const createHarness = ({ playing = false, runSync } = {}) => {
    const clock = createClock();
    let isPlaying = playing;
    let runCount = 0;
    const errors = [];
    const scheduler = createOfflineSyncScheduler({
        cancelTimer: clock.cancelTimer,
        cooldownMs: 60_000,
        isPlaying: () => isPlaying,
        now: clock.now,
        onError: (error) => errors.push(error),
        runSync: async () => {
            runCount += 1;
            return runSync ? runSync(runCount) : true;
        },
        scheduleTimer: clock.scheduleTimer,
    });

    return {
        clock,
        errors,
        getRunCount: () => runCount,
        scheduler,
        setPlaying: (value) => {
            isPlaying = value;
        },
    };
};

test('an empty initial scan does not delay the first managed sync', async () => {
    const harness = createHarness({ runSync: async (runCount) => runCount > 1 });

    await harness.scheduler.request({ immediate: true });
    await harness.scheduler.request();

    assert.equal(harness.getRunCount(), 2);
    assert.equal(harness.clock.timerCount(), 0);
});

test('ordinary trigger bursts share one cooldown timer and one later sync', async () => {
    const harness = createHarness();

    await harness.scheduler.request({ immediate: true });
    void harness.scheduler.request();
    void harness.scheduler.request();
    void harness.scheduler.request();

    assert.equal(harness.getRunCount(), 1);
    assert.equal(harness.clock.timerCount(), 1);

    await harness.clock.advance(59_999);
    assert.equal(harness.getRunCount(), 1);

    await harness.clock.advance(1);
    assert.equal(harness.getRunCount(), 2);
});

test('requests during a sync produce at most one cooldown follow-up', async () => {
    const firstRun = deferred();
    const harness = createHarness({
        runSync: (runCount) => (runCount === 1 ? firstRun.promise : true),
    });

    const activeRun = harness.scheduler.request({ immediate: true });
    await flushPromises();
    void harness.scheduler.request();
    void harness.scheduler.request();
    firstRun.resolve(true);
    await activeRun;

    assert.equal(harness.getRunCount(), 1);
    assert.equal(harness.clock.timerCount(), 1);

    await harness.clock.advance(60_000);
    assert.equal(harness.getRunCount(), 2);
});

test('an immediate request bypasses an existing cooldown', async () => {
    const harness = createHarness();

    await harness.scheduler.request({ immediate: true });
    void harness.scheduler.request();
    assert.equal(harness.clock.timerCount(), 1);

    await harness.scheduler.request({ immediate: true });

    assert.equal(harness.getRunCount(), 2);
    assert.equal(harness.clock.timerCount(), 0);
});

test('an immediate request during an active sync runs one immediate follow-up', async () => {
    const firstRun = deferred();
    const harness = createHarness({
        runSync: (runCount) => (runCount === 1 ? firstRun.promise : true),
    });

    const activeRun = harness.scheduler.request({ immediate: true });
    await flushPromises();
    void harness.scheduler.request({ immediate: true });
    void harness.scheduler.request({ immediate: true });

    firstRun.resolve(true);
    await activeRun;
    await flushPromises();

    assert.equal(harness.getRunCount(), 2);
    assert.equal(harness.clock.timerCount(), 0);
});

test('playback defers trigger bursts and pause drains one sync immediately', async () => {
    const harness = createHarness({ playing: true });

    void harness.scheduler.request();
    void harness.scheduler.request({ immediate: true });
    void harness.scheduler.request();
    assert.equal(harness.getRunCount(), 0);

    harness.setPlaying(false);
    harness.scheduler.notifyPlaybackChanged();
    await flushPromises();
    harness.scheduler.notifyPlaybackChanged();
    await flushPromises();

    assert.equal(harness.getRunCount(), 1);
});

test('a cooldown that expires during playback resumes immediately after pause', async () => {
    const harness = createHarness();

    await harness.scheduler.request({ immediate: true });
    void harness.scheduler.request();
    harness.setPlaying(true);

    await harness.clock.advance(60_000);
    assert.equal(harness.getRunCount(), 1);
    assert.equal(harness.clock.timerCount(), 0);

    harness.setPlaying(false);
    harness.scheduler.notifyPlaybackChanged();
    await flushPromises();

    assert.equal(harness.getRunCount(), 2);
});

test('disposing cancels scheduled work and blocks future requests', async () => {
    const harness = createHarness();

    await harness.scheduler.request({ immediate: true });
    void harness.scheduler.request();
    assert.equal(harness.clock.timerCount(), 1);

    harness.scheduler.dispose();
    await harness.clock.advance(60_000);
    await harness.scheduler.request({ immediate: true });

    assert.equal(harness.getRunCount(), 1);
    assert.equal(harness.clock.timerCount(), 0);
});

test('disposing during an active sync prevents a queued follow-up', async () => {
    const firstRun = deferred();
    const harness = createHarness({ runSync: () => firstRun.promise });

    const activeRun = harness.scheduler.request({ immediate: true });
    await flushPromises();
    void harness.scheduler.request();
    harness.scheduler.dispose();

    firstRun.resolve(true);
    await activeRun;
    await harness.clock.advance(60_000);

    assert.equal(harness.getRunCount(), 1);
    assert.equal(harness.clock.timerCount(), 0);
});

test('a rejected sync reports the failure and does not wedge the scheduler', async () => {
    const failure = new Error('offline sync failed');
    const harness = createHarness({
        runSync: async (runCount) => {
            if (runCount === 1) throw failure;
            return true;
        },
    });

    await harness.scheduler.request({ immediate: true });
    await harness.scheduler.request();

    assert.equal(harness.getRunCount(), 2);
    assert.deepEqual(harness.errors, [failure]);
    assert.equal(harness.clock.timerCount(), 0);
});
