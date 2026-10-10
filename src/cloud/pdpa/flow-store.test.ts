/**
 * Tests for pdpa/flow-store.ts — InMemoryPdpaFlowStore (no Redis needed)
 * and RedisPdpaFlowStore (mocked Redis).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryPdpaFlowStore, RedisPdpaFlowStore } from './flow-store.js';
import type { Redis } from 'ioredis';

// ── InMemoryPdpaFlowStore ─────────────────────────────────────────────────

describe('InMemoryPdpaFlowStore', () => {
  let store: InMemoryPdpaFlowStore;

  beforeEach(() => {
    store = new InMemoryPdpaFlowStore();
  });

  describe('pending deletion', () => {
    it('hasPendingDeletion returns false initially', async () => {
      expect(await store.hasPendingDeletion('u1')).toBe(false);
    });

    it('setPendingDeletion + hasPendingDeletion', async () => {
      await store.setPendingDeletion('u1', '2024-01-01T00:00:00Z');
      expect(await store.hasPendingDeletion('u1')).toBe(true);
    });

    it('clearPendingDeletion removes it', async () => {
      await store.setPendingDeletion('u1', '2024-01-01T00:00:00Z');
      await store.clearPendingDeletion('u1');
      expect(await store.hasPendingDeletion('u1')).toBe(false);
    });

    it('hasPendingDeletionSync matches async', async () => {
      await store.setPendingDeletion('u2', 'ts');
      expect(store.hasPendingDeletionSync('u2')).toBe(true);
      await store.clearPendingDeletion('u2');
      expect(store.hasPendingDeletionSync('u2')).toBe(false);
    });

    it('clearPendingDeletion is a no-op for unknown user', async () => {
      await expect(store.clearPendingDeletion('nobody')).resolves.toBeUndefined();
    });
  });

  describe('pending consent', () => {
    it('hasPendingConsent returns false initially', async () => {
      expect(await store.hasPendingConsent('u1')).toBe(false);
    });

    it('setPendingConsent + hasPendingConsent', async () => {
      await store.setPendingConsent('u1');
      expect(await store.hasPendingConsent('u1')).toBe(true);
    });

    it('clearPendingConsent removes it', async () => {
      await store.setPendingConsent('u1');
      await store.clearPendingConsent('u1');
      expect(await store.hasPendingConsent('u1')).toBe(false);
    });

    it('hasPendingConsentSync matches async', async () => {
      await store.setPendingConsent('u3');
      expect(store.hasPendingConsentSync('u3')).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('clears both deletions and consent', async () => {
      await store.setPendingDeletion('u1', 'ts');
      await store.setPendingConsent('u1');
      await store.clearAll();
      expect(await store.hasPendingDeletion('u1')).toBe(false);
      expect(await store.hasPendingConsent('u1')).toBe(false);
    });

    it('clearAllSync equivalent', () => {
      store.clearAllSync();
      expect(store.hasPendingDeletionSync('any')).toBe(false);
      expect(store.hasPendingConsentSync('any')).toBe(false);
    });
  });

  describe('isolation between users', () => {
    it('setting for u1 does not affect u2', async () => {
      await store.setPendingDeletion('u1', 'ts');
      await store.setPendingConsent('u1');
      expect(await store.hasPendingDeletion('u2')).toBe(false);
      expect(await store.hasPendingConsent('u2')).toBe(false);
    });
  });
});

// ── RedisPdpaFlowStore ────────────────────────────────────────────────────

describe('RedisPdpaFlowStore', () => {
  let redis: Record<string, jest.Mock>;
  let store: RedisPdpaFlowStore;

  beforeEach(() => {
    redis = {
      set: vi.fn().mockResolvedValue('OK'),
      exists: vi.fn().mockResolvedValue(0),
      del: vi.fn().mockResolvedValue(1),
      scan: vi.fn().mockResolvedValue(['0', []]),
    };
    store = new RedisPdpaFlowStore(redis as unknown as Redis);
  });

  it('setPendingDeletion calls redis.set with correct prefix and TTL', async () => {
    await store.setPendingDeletion('u1', '2024-01-01');
    expect(redis.set).toHaveBeenCalledWith(
      'pdpa:pending-deletion:u1', '2024-01-01', 'EX', 86400,
    );
  });

  it('hasPendingDeletion calls redis.exists and returns true when key exists', async () => {
    redis.exists.mockResolvedValue(1);
    expect(await store.hasPendingDeletion('u1')).toBe(true);
    expect(redis.exists).toHaveBeenCalledWith('pdpa:pending-deletion:u1');
  });

  it('hasPendingDeletion returns false when key missing', async () => {
    redis.exists.mockResolvedValue(0);
    expect(await store.hasPendingDeletion('u1')).toBe(false);
  });

  it('clearPendingDeletion calls redis.del', async () => {
    await store.clearPendingDeletion('u1');
    expect(redis.del).toHaveBeenCalledWith('pdpa:pending-deletion:u1');
  });

  it('setPendingConsent calls redis.set with consent prefix', async () => {
    await store.setPendingConsent('u2');
    expect(redis.set).toHaveBeenCalledWith('pdpa:pending-consent:u2', '1', 'EX', 86400);
  });

  it('hasPendingConsent calls redis.exists with consent prefix', async () => {
    redis.exists.mockResolvedValue(1);
    expect(await store.hasPendingConsent('u2')).toBe(true);
    expect(redis.exists).toHaveBeenCalledWith('pdpa:pending-consent:u2');
  });

  it('clearPendingConsent calls redis.del with consent prefix', async () => {
    await store.clearPendingConsent('u2');
    expect(redis.del).toHaveBeenCalledWith('pdpa:pending-consent:u2');
  });

  it('clearAll scans and deletes both prefixes', async () => {
    redis.scan
      .mockResolvedValueOnce(['0', ['pdpa:pending-deletion:u1']])
      .mockResolvedValueOnce(['0', ['pdpa:pending-consent:u1']]);
    await store.clearAll();
    expect(redis.del).toHaveBeenCalledWith('pdpa:pending-deletion:u1');
    expect(redis.del).toHaveBeenCalledWith('pdpa:pending-consent:u1');
  });
});
