/**
 * Tests for src/modules/typing/index.ts.
 * Covers: setTypingAdapter, startTypingRefresh, pauseTypingRefreshAfterDelivery,
 * stopTypingRefresh, and the heartbeat-gated interval logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock session-manager heartbeatPath before import
vi.mock('../../session-manager.js', () => ({ heartbeatPath: vi.fn((agentGroupId: string, sessionId: string) => `/hb/${agentGroupId}/${sessionId}`) }));

// Mock fs.statSync used by isHeartbeatFresh
const mockStatSync = vi.fn();
vi.mock('fs', () => ({ default: { statSync: (...args: unknown[]) => mockStatSync(...args) } }));

import {
  setTypingAdapter,
  startTypingRefresh,
  pauseTypingRefreshAfterDelivery,
  stopTypingRefresh,
} from './index.js';

function freshAdapter() {
  const setTyping = vi.fn().mockResolvedValue(undefined);
  setTypingAdapter({ setTyping });
  return { setTyping };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Flush pending microtasks (Promise callbacks) without advancing timers. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('setTypingAdapter', () => {
  it('can be called without throwing', () => {
    expect(() => setTypingAdapter({ setTyping: vi.fn() })).not.toThrow();
  });
});

describe('startTypingRefresh', () => {
  it('fires an immediate typing call on start', async () => {
    const { setTyping } = freshAdapter();
    startTypingRefresh('sess-1', 'ag-1', 'telegram', 'p-1', null);
    await flush();
    expect(setTyping).toHaveBeenCalledWith('telegram', 'p-1', null);
    stopTypingRefresh('sess-1');
  });

  it('fires periodic typing while within grace window', async () => {
    const { setTyping } = freshAdapter();
    startTypingRefresh('sess-2', 'ag-1', 'telegram', 'p-2', null);
    await flush();
    const callsBefore = setTyping.mock.calls.length;

    // Advance less than TYPING_GRACE_MS (15000ms) — should keep firing
    await vi.advanceTimersByTimeAsync(4100); // one interval tick
    expect(setTyping.mock.calls.length).toBeGreaterThan(callsBefore);
    stopTypingRefresh('sess-2');
  });

  it('stops typing when grace expires and heartbeat is stale', async () => {
    const { setTyping } = freshAdapter();
    mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); }); // stale heartbeat
    startTypingRefresh('sess-3', 'ag-1', 'telegram', 'p-3', null);
    await flush();

    // Advance past TYPING_GRACE_MS (15000ms) + a few interval ticks
    await vi.advanceTimersByTimeAsync(20000);
    const callsAfterGrace = setTyping.mock.calls.length;

    // Further ticks should NOT produce more calls (stopped)
    await vi.advanceTimersByTimeAsync(8000);
    expect(setTyping.mock.calls.length).toBe(callsAfterGrace);
  });

  it('continues typing past grace when heartbeat is fresh', async () => {
    const { setTyping } = freshAdapter();
    // Return current fake-timer time on every call so the heartbeat is always fresh
    mockStatSync.mockImplementation(() => ({ mtimeMs: Date.now() }));
    startTypingRefresh('sess-4', 'ag-1', 'telegram', 'p-4', 'thread-1');
    await flush();

    await vi.advanceTimersByTimeAsync(20000); // past grace
    const callsAfterGrace = setTyping.mock.calls.length;

    // Heartbeat still fresh — should keep firing
    await vi.advanceTimersByTimeAsync(4100);
    expect(setTyping.mock.calls.length).toBeGreaterThan(callsAfterGrace);
    stopTypingRefresh('sess-4');
  });

  it('resetting an existing session resets grace and clears pause', async () => {
    const { setTyping } = freshAdapter();
    startTypingRefresh('sess-5', 'ag-1', 'telegram', 'p-5', null);
    await flush();
    pauseTypingRefreshAfterDelivery('sess-5');

    const callsBefore = setTyping.mock.calls.length;
    // Re-start same session — should fire immediately and clear pause
    startTypingRefresh('sess-5', 'ag-1', 'telegram', 'p-5', null);
    await flush();
    expect(setTyping.mock.calls.length).toBeGreaterThan(callsBefore);
    stopTypingRefresh('sess-5');
  });
});

describe('pauseTypingRefreshAfterDelivery', () => {
  it('is a no-op for unknown session', () => {
    expect(() => pauseTypingRefreshAfterDelivery('nonexistent')).not.toThrow();
  });

  it('pauses interval ticks for POST_DELIVERY_PAUSE_MS', async () => {
    const { setTyping } = freshAdapter();
    startTypingRefresh('sess-6', 'ag-1', 'telegram', 'p-6', null);
    await flush();
    pauseTypingRefreshAfterDelivery('sess-6');

    const callsAfterPause = setTyping.mock.calls.length;
    // Tick inside pause window should not fire setTyping
    await vi.advanceTimersByTimeAsync(4100);
    expect(setTyping.mock.calls.length).toBe(callsAfterPause);
    stopTypingRefresh('sess-6');
  });
});

describe('stopTypingRefresh', () => {
  it('is a no-op for unknown session', () => {
    expect(() => stopTypingRefresh('nonexistent')).not.toThrow();
  });

  it('stops interval ticks after stop is called', async () => {
    const { setTyping } = freshAdapter();
    startTypingRefresh('sess-7', 'ag-1', 'telegram', 'p-7', null);
    await flush();
    stopTypingRefresh('sess-7');

    const callsAfterStop = setTyping.mock.calls.length;
    await vi.advanceTimersByTimeAsync(8200); // two interval ticks
    expect(setTyping.mock.calls.length).toBe(callsAfterStop);
  });
});
