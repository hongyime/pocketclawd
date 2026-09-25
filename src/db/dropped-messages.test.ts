/**
 * Tests for src/db/dropped-messages.ts.
 * Uses real in-memory test DB + migrations.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestDb, closeDb } from './index.js';
import { runMigrations } from './migrations/index.js';
import { recordDroppedMessage, getUnregisteredSenders } from './dropped-messages.js';

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
});

afterEach(() => {
  closeDb();
});

describe('recordDroppedMessage', () => {
  it('inserts a new row on first call', () => {
    recordDroppedMessage({ channel_type: 'telegram', platform_id: 'u1', user_id: null, sender_name: null, reason: 'unregistered', messaging_group_id: null, agent_group_id: null });
    const rows = getUnregisteredSenders();
    expect(rows).toHaveLength(1);
    expect(rows[0].channel_type).toBe('telegram');
    expect(rows[0].message_count).toBe(1);
  });

  it('increments message_count on duplicate (channel_type + platform_id)', () => {
    const msg = { channel_type: 'telegram', platform_id: 'u2', user_id: null, sender_name: null, reason: 'unregistered', messaging_group_id: null, agent_group_id: null };
    recordDroppedMessage(msg);
    recordDroppedMessage(msg);
    recordDroppedMessage(msg);
    const rows = getUnregisteredSenders();
    const row = rows.find(r => r.platform_id === 'u2');
    expect(row?.message_count).toBe(3);
  });

  it('updates sender_name on subsequent calls when provided', () => {
    recordDroppedMessage({ channel_type: 'telegram', platform_id: 'u3', user_id: null, sender_name: null, reason: 'unregistered', messaging_group_id: null, agent_group_id: null });
    recordDroppedMessage({ channel_type: 'telegram', platform_id: 'u3', user_id: null, sender_name: 'Alice', reason: 'unregistered', messaging_group_id: null, agent_group_id: null });
    const rows = getUnregisteredSenders();
    const row = rows.find(r => r.platform_id === 'u3');
    expect(row?.sender_name).toBe('Alice');
  });

  it('stores user_id and agent_group_id when provided', () => {
    recordDroppedMessage({ channel_type: 'discord', platform_id: 'u4', user_id: 'uid-1', sender_name: 'Bob', reason: 'no_session', messaging_group_id: 'mg-1', agent_group_id: 'ag-1' });
    const rows = getUnregisteredSenders();
    const row = rows.find(r => r.platform_id === 'u4');
    expect(row?.user_id).toBe('uid-1');
    expect(row?.agent_group_id).toBe('ag-1');
  });
});

describe('getUnregisteredSenders', () => {
  it('returns empty array when no rows exist', () => {
    expect(getUnregisteredSenders()).toEqual([]);
  });

  it('returns rows ordered by last_seen DESC', () => {
    recordDroppedMessage({ channel_type: 'telegram', platform_id: 'early', user_id: null, sender_name: null, reason: 'r', messaging_group_id: null, agent_group_id: null });
    recordDroppedMessage({ channel_type: 'telegram', platform_id: 'late', user_id: null, sender_name: null, reason: 'r', messaging_group_id: null, agent_group_id: null });
    const rows = getUnregisteredSenders();
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      recordDroppedMessage({ channel_type: 'telegram', platform_id: `p${i}`, user_id: null, sender_name: null, reason: 'r', messaging_group_id: null, agent_group_id: null });
    }
    expect(getUnregisteredSenders(3)).toHaveLength(3);
  });
});
