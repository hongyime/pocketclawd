/**
 * Tests for SqliteStateAdapter — Chat SDK StateAdapter backed by SQLite.
 * Uses the real in-memory test DB + migrations so SQL paths are exercised.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestDb, closeDb } from './db/connection.js';
import { runMigrations } from './db/migrations/index.js';
import { SqliteStateAdapter } from './state-sqlite.js';

let adapter: SqliteStateAdapter;

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
  adapter = new SqliteStateAdapter();
});

afterEach(() => {
  closeDb();
});

// Vitest doesn't allow top-level await outside async tests, so we use
// a helper to connect before each group.
async function connected(): Promise<SqliteStateAdapter> {
  await adapter.connect();
  return adapter;
}

describe('SqliteStateAdapter — key-value', () => {
  it('returns null for missing key', async () => {
    const a = await connected();
    expect(await a.get('missing')).toBeNull();
  });

  it('stores and retrieves a value', async () => {
    const a = await connected();
    await a.set('k1', { x: 1 });
    expect(await a.get('k1')).toEqual({ x: 1 });
  });

  it('overwrites an existing value', async () => {
    const a = await connected();
    await a.set('k1', 'first');
    await a.set('k1', 'second');
    expect(await a.get('k1')).toBe('second');
  });

  it('respects TTL — expired value returns null', async () => {
    const a = await connected();
    await a.set('ttl-key', 'gone', 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    expect(await a.get('ttl-key')).toBeNull();
  });

  it('deletes a key', async () => {
    const a = await connected();
    await a.set('del-key', 'val');
    await a.delete('del-key');
    expect(await a.get('del-key')).toBeNull();
  });

  it('setIfNotExists returns true and sets value when key absent', async () => {
    const a = await connected();
    const ok = await a.setIfNotExists('new-key', 'hello');
    expect(ok).toBe(true);
    expect(await a.get('new-key')).toBe('hello');
  });

  it('setIfNotExists returns false when key already present', async () => {
    const a = await connected();
    await a.set('existing', 'original');
    const ok = await a.setIfNotExists('existing', 'overwrite');
    expect(ok).toBe(false);
    expect(await a.get('existing')).toBe('original');
  });

  it('setIfNotExists replaces an expired key', async () => {
    const a = await connected();
    await a.set('exp-key', 'old', 1); // expires in 1ms
    await new Promise((r) => setTimeout(r, 10));
    const ok = await a.setIfNotExists('exp-key', 'fresh');
    expect(ok).toBe(true);
    expect(await a.get('exp-key')).toBe('fresh');
  });
});

describe('SqliteStateAdapter — subscriptions', () => {
  it('isSubscribed returns false before subscribe', async () => {
    const a = await connected();
    expect(await a.isSubscribed('thread-1')).toBe(false);
  });

  it('isSubscribed returns true after subscribe', async () => {
    const a = await connected();
    await a.subscribe('thread-1');
    expect(await a.isSubscribed('thread-1')).toBe(true);
  });

  it('isSubscribed returns false after unsubscribe', async () => {
    const a = await connected();
    await a.subscribe('thread-1');
    await a.unsubscribe('thread-1');
    expect(await a.isSubscribed('thread-1')).toBe(false);
  });
});

describe('SqliteStateAdapter — locks', () => {
  it('acquireLock returns a lock object', async () => {
    const a = await connected();
    const lock = await a.acquireLock('t1', 5000);
    expect(lock).not.toBeNull();
    expect(lock?.threadId).toBe('t1');
    expect(lock?.token).toBeTruthy();
  });

  it('acquireLock returns null when already locked', async () => {
    const a = await connected();
    await a.acquireLock('t2', 5000);
    const second = await a.acquireLock('t2', 5000);
    expect(second).toBeNull();
  });

  it('releaseLock allows re-acquire', async () => {
    const a = await connected();
    const lock = await a.acquireLock('t3', 5000);
    await a.releaseLock(lock!);
    const lock2 = await a.acquireLock('t3', 5000);
    expect(lock2).not.toBeNull();
  });

  it('extendLock returns true and updates expiry', async () => {
    const a = await connected();
    const lock = await a.acquireLock('t4', 5000);
    const oldExpiry = lock!.expiresAt;
    const ok = await a.extendLock(lock!, 10000);
    expect(ok).toBe(true);
    expect(lock!.expiresAt).toBeGreaterThan(oldExpiry);
  });

  it('extendLock returns false for a released lock', async () => {
    const a = await connected();
    const lock = await a.acquireLock('t5', 5000);
    await a.releaseLock(lock!);
    const ok = await a.extendLock(lock!, 10000);
    expect(ok).toBe(false);
  });

  it('forceReleaseLock clears the lock', async () => {
    const a = await connected();
    await a.acquireLock('t6', 5000);
    await a.forceReleaseLock('t6');
    const lock2 = await a.acquireLock('t6', 5000);
    expect(lock2).not.toBeNull();
  });

  it('expired lock can be re-acquired', async () => {
    const a = await connected();
    await a.acquireLock('t7', 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    const lock2 = await a.acquireLock('t7', 5000);
    expect(lock2).not.toBeNull();
  });
});

describe('SqliteStateAdapter — lists', () => {
  it('getList returns empty array for missing key', async () => {
    const a = await connected();
    expect(await a.getList('nolist')).toEqual([]);
  });

  it('appendToList and getList round-trip', async () => {
    const a = await connected();
    await a.appendToList('mylist', 'a');
    await a.appendToList('mylist', 'b');
    await a.appendToList('mylist', 'c');
    expect(await a.getList('mylist')).toEqual(['a', 'b', 'c']);
  });

  it('maxLength trims old entries', async () => {
    const a = await connected();
    await a.appendToList('trimmed', 1, { maxLength: 2 });
    await a.appendToList('trimmed', 2, { maxLength: 2 });
    await a.appendToList('trimmed', 3, { maxLength: 2 });
    expect(await a.getList<number>('trimmed')).toEqual([2, 3]);
  });
});

describe('SqliteStateAdapter — queue', () => {
  it('enqueue and dequeue round-trip', async () => {
    const a = await connected();
    await a.enqueue('q1', { type: 'msg', data: 'hello' } as never, 10);
    const item = await a.dequeue('q1');
    expect((item as { data: string }).data).toBe('hello');
  });

  it('dequeue returns null on empty queue', async () => {
    const a = await connected();
    expect(await a.dequeue('empty-q')).toBeNull();
  });

  it('queueDepth reflects enqueue count', async () => {
    const a = await connected();
    await a.enqueue('q2', { type: 'a' } as never, 10);
    await a.enqueue('q2', { type: 'b' } as never, 10);
    expect(await a.queueDepth('q2')).toBe(2);
    await a.dequeue('q2');
    expect(await a.queueDepth('q2')).toBe(1);
  });

  it('disconnect is a no-op', async () => {
    const a = await connected();
    await expect(a.disconnect()).resolves.toBeUndefined();
  });
});
