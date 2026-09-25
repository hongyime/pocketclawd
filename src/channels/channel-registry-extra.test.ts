/**
 * Tests for channel-registry.ts — registration, getters, teardown.
 * Covers the previously-uncovered getChannelContainerConfig, teardown error path,
 * factory-returns-null skip path, and network error retry path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../log.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import {
  registerChannelAdapter,
  getChannelAdapter,
  getActiveAdapters,
  getRegisteredChannelNames,
  getChannelContainerConfig,
  initChannelAdapters,
  teardownChannelAdapters,
} from './channel-registry.js';

function makeAdapter(channelType: string, opts?: { setupThrows?: Error }) {
  return {
    name: channelType,
    channelType,
    supportsThreads: false,
    setup: opts?.setupThrows
      ? vi.fn().mockRejectedValue(opts.setupThrows)
      : vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn().mockResolvedValue(undefined),
    deliver: vi.fn(),
    setTyping: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

beforeEach(async () => {
  // Teardown any active adapters from prior tests
  await teardownChannelAdapters();
  vi.clearAllMocks();
});

describe('registerChannelAdapter + getRegisteredChannelNames', () => {
  it('registers a channel and reports its name', () => {
    registerChannelAdapter('test-ch', { factory: async () => makeAdapter('test-ch') });
    expect(getRegisteredChannelNames()).toContain('test-ch');
  });
});

describe('getChannelContainerConfig', () => {
  it('returns undefined for unknown channel', () => {
    expect(getChannelContainerConfig('nonexistent')).toBeUndefined();
  });

  it('returns containerConfig when registered', () => {
    const cc = { env: { FOO: 'bar' } };
    registerChannelAdapter('cfg-ch', { factory: async () => makeAdapter('cfg-ch'), containerConfig: cc });
    expect(getChannelContainerConfig('cfg-ch')).toBe(cc);
  });
});

describe('getChannelAdapter', () => {
  it('returns undefined before init', () => {
    expect(getChannelAdapter('not-init-ch')).toBeUndefined();
  });

  it('returns adapter after initChannelAdapters', async () => {
    const adapter = makeAdapter('ready-ch');
    registerChannelAdapter('ready-ch', { factory: async () => adapter });
    await initChannelAdapters(() => ({ conversations: [], onInbound: () => {}, onInboundEvent: () => {}, onMetadata: () => {}, onAction: () => {} }));
    expect(getChannelAdapter('ready-ch')).toBe(adapter);
  });
});

describe('getActiveAdapters', () => {
  it('returns all active adapters after init', async () => {
    const a1 = makeAdapter('ch-a1');
    const a2 = makeAdapter('ch-a2');
    registerChannelAdapter('ch-a1', { factory: async () => a1 });
    registerChannelAdapter('ch-a2', { factory: async () => a2 });
    await initChannelAdapters(() => ({ conversations: [], onInbound: () => {}, onInboundEvent: () => {}, onMetadata: () => {}, onAction: () => {} }));
    const active = getActiveAdapters();
    expect(active).toContain(a1);
    expect(active).toContain(a2);
  });
});

describe('initChannelAdapters', () => {
  it('skips adapters whose factory returns null (missing credentials)', async () => {
    registerChannelAdapter('null-ch', { factory: async () => null });
    await initChannelAdapters(() => ({ conversations: [], onInbound: () => {}, onInboundEvent: () => {}, onMetadata: () => {}, onAction: () => {} }));
    expect(getChannelAdapter('null-ch')).toBeUndefined();
  });

  it('logs error and continues when adapter setup throws a non-network error', async () => {
    const { log } = await import('../log.js');
    const badAdapter = makeAdapter('bad-ch', { setupThrows: new Error('bad config') });
    registerChannelAdapter('bad-ch', { factory: async () => badAdapter });
    await initChannelAdapters(() => ({ conversations: [], onInbound: () => {}, onInboundEvent: () => {}, onMetadata: () => {}, onAction: () => {} }));
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start'),
      expect.objectContaining({ channel: 'bad-ch' }),
    );
    expect(getChannelAdapter('bad-ch')).toBeUndefined();
  });

  it('retries on NetworkError and eventually registers when setup succeeds', async () => {
    vi.useFakeTimers();
    const networkErr = new Error('network failed');
    networkErr.name = 'NetworkError';
    const adapter = makeAdapter('retry-ch');
    adapter.setup = vi.fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce(undefined);
    registerChannelAdapter('retry-ch', { factory: async () => adapter });
    const initPromise = initChannelAdapters(() => ({ conversations: [], onInbound: () => {}, onInboundEvent: () => {}, onMetadata: () => {}, onAction: () => {} }));
    await vi.advanceTimersByTimeAsync(3000);
    await initPromise;
    expect(getChannelAdapter('retry-ch')).toBe(adapter);
    vi.useRealTimers();
  });
});

describe('teardownChannelAdapters', () => {
  it('tears down active adapters and clears them', async () => {
    const adapter = makeAdapter('teardown-ch');
    registerChannelAdapter('teardown-ch', { factory: async () => adapter });
    await initChannelAdapters(() => ({ conversations: [], onInbound: () => {}, onInboundEvent: () => {}, onMetadata: () => {}, onAction: () => {} }));
    await teardownChannelAdapters();
    expect(adapter.teardown).toHaveBeenCalled();
    expect(getChannelAdapter('teardown-ch')).toBeUndefined();
  });

  it('logs error but continues when teardown throws', async () => {
    const { log } = await import('../log.js');
    const adapter = makeAdapter('errdown-ch');
    adapter.teardown = vi.fn().mockRejectedValue(new Error('teardown boom'));
    registerChannelAdapter('errdown-ch', { factory: async () => adapter });
    await initChannelAdapters(() => ({ conversations: [], onInbound: () => {}, onInboundEvent: () => {}, onMetadata: () => {}, onAction: () => {} }));
    await teardownChannelAdapters();
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to stop'),
      expect.objectContaining({ channel: 'errdown-ch' }),
    );
  });
});
