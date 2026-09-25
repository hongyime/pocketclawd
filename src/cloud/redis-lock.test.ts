/**
 * Tests for RedisDistributedLock and key builders in redis-lock.ts.
 * Mocks the ioredis client so no real Redis is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RedisDistributedLock, cronLockKey, notifiedKey } from './redis-lock.js';
import type { Redis } from 'ioredis';

function makeMockRedis(): jest.Mocked<Pick<Redis, 'set' | 'eval' | 'exists'>> {
  return {
    set: vi.fn(),
    eval: vi.fn(),
    exists: vi.fn(),
  };
}

describe('RedisDistributedLock', () => {
  let redis: ReturnType<typeof makeMockRedis>;
  let lock: RedisDistributedLock;

  beforeEach(() => {
    redis = makeMockRedis();
    lock = new RedisDistributedLock(redis as unknown as Redis);
  });

  describe('acquire', () => {
    it('returns token when SET NX succeeds', async () => {
      redis.set.mockResolvedValue('OK' as never);
      const token = await lock.acquire('my-lock', 30);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(redis.set).toHaveBeenCalledWith('my-lock', expect.any(String), 'EX', 30, 'NX');
    });

    it('returns null when SET NX fails (lock already held)', async () => {
      redis.set.mockResolvedValue(null as never);
      const token = await lock.acquire('my-lock', 30);
      expect(token).toBeNull();
    });

    it('returns different tokens on successive acquires', async () => {
      redis.set.mockResolvedValue('OK' as never);
      const t1 = await lock.acquire('k1', 5);
      const t2 = await lock.acquire('k2', 5);
      expect(t1).not.toBe(t2);
    });
  });

  describe('release', () => {
    it('returns true when Lua script returns 1 (token matched)', async () => {
      redis.eval.mockResolvedValue(1 as never);
      const ok = await lock.release('my-lock', 'some-token');
      expect(ok).toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'my-lock',
        'some-token',
      );
    });

    it('returns false when Lua script returns 0 (token mismatch / expired)', async () => {
      redis.eval.mockResolvedValue(0 as never);
      const ok = await lock.release('my-lock', 'stale-token');
      expect(ok).toBe(false);
    });
  });

  describe('markOnce', () => {
    it('returns true when SET NX succeeds (first call)', async () => {
      redis.set.mockResolvedValue('OK' as never);
      const marked = await lock.markOnce('my-flag', 86400);
      expect(marked).toBe(true);
      expect(redis.set).toHaveBeenCalledWith('my-flag', '1', 'EX', 86400, 'NX');
    });

    it('returns false when SET NX fails (already marked)', async () => {
      redis.set.mockResolvedValue(null as never);
      const marked = await lock.markOnce('my-flag', 86400);
      expect(marked).toBe(false);
    });
  });

  describe('wasMarked', () => {
    it('returns true when key exists', async () => {
      redis.exists.mockResolvedValue(1 as never);
      expect(await lock.wasMarked('my-flag')).toBe(true);
    });

    it('returns false when key does not exist', async () => {
      redis.exists.mockResolvedValue(0 as never);
      expect(await lock.wasMarked('my-flag')).toBe(false);
    });
  });
});

describe('key builders', () => {
  it('cronLockKey builds the expected key', () => {
    expect(cronLockKey('morning-digest', '2024-01-15')).toBe(
      'nanoclaw:cron-lock:morning-digest:2024-01-15',
    );
  });

  it('notifiedKey builds the expected key', () => {
    expect(notifiedKey('telegram:123', '20240115')).toBe(
      'nanoclaw:notified:telegram:123:20240115',
    );
  });

  it('key builders are pure and deterministic', () => {
    expect(cronLockKey('job', 'window')).toBe(cronLockKey('job', 'window'));
    expect(notifiedKey('u', 'd')).toBe(notifiedKey('u', 'd'));
  });
});
