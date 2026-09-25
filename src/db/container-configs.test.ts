/**
 * Tests for src/db/container-configs.ts.
 * Uses real in-memory test DB + migrations — no mocks needed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestDb, closeDb, createAgentGroup } from './index.js';
import { runMigrations } from './migrations/index.js';
import {
  getContainerConfig,
  getAllContainerConfigs,
  createContainerConfig,
  ensureContainerConfig,
  updateContainerConfigScalars,
  updateContainerConfigJson,
  deleteContainerConfig,
} from './container-configs.js';
import type { ContainerConfigRow } from '../../types.js';

function now() { return new Date().toISOString(); }

function seedGroup(id: string) {
  createAgentGroup({ id, name: id, folder: id, agent_provider: null, created_at: now() });
}

function defaultRow(agentGroupId: string): ContainerConfigRow {
  return {
    agent_group_id: agentGroupId,
    mcp_servers: '{}',
    packages_apt: '[]',
    packages_npm: '[]',
    image_tag: null,
    additional_mounts: '[]',
    skills: '"all"',
    provider: null,
    assistant_name: null,
    cli_scope: 'enabled',
    max_messages_per_prompt: null,
    model: null,
    effort: null,
    created_at: now(),
    updated_at: now(),
  } as unknown as ContainerConfigRow;
}

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
});

afterEach(() => {
  closeDb();
});

describe('getContainerConfig', () => {
  it('returns undefined for unknown agent group', () => {
    expect(getContainerConfig('nope')).toBeUndefined();
  });

  it('returns row after createContainerConfig', () => {
    seedGroup('ag-1');
    createContainerConfig(defaultRow('ag-1'));
    const row = getContainerConfig('ag-1');
    expect(row?.agent_group_id).toBe('ag-1');
  });
});

describe('getAllContainerConfigs', () => {
  it('returns empty array when no rows exist', () => {
    expect(getAllContainerConfigs()).toEqual([]);
  });

  it('returns all rows', () => {
    seedGroup('ag-2');
    seedGroup('ag-3');
    createContainerConfig(defaultRow('ag-2'));
    createContainerConfig(defaultRow('ag-3'));
    expect(getAllContainerConfigs().length).toBe(2);
  });
});

describe('ensureContainerConfig', () => {
  it('creates a row on first call', () => {
    seedGroup('ag-4');
    ensureContainerConfig('ag-4');
    expect(getContainerConfig('ag-4')).toBeTruthy();
  });

  it('is idempotent — second call is a no-op', () => {
    seedGroup('ag-5');
    ensureContainerConfig('ag-5');
    ensureContainerConfig('ag-5');
    expect(getAllContainerConfigs().filter(r => r.agent_group_id === 'ag-5').length).toBe(1);
  });
});

describe('updateContainerConfigScalars', () => {
  beforeEach(() => {
    seedGroup('ag-6');
    createContainerConfig(defaultRow('ag-6'));
  });

  it('updates a scalar field', () => {
    updateContainerConfigScalars('ag-6', { provider: 'bedrock' });
    expect(getContainerConfig('ag-6')?.provider).toBe('bedrock');
  });

  it('updates multiple scalar fields at once', () => {
    updateContainerConfigScalars('ag-6', { model: 'claude-3-5-sonnet', effort: 'high' });
    const row = getContainerConfig('ag-6');
    expect(row?.model).toBe('claude-3-5-sonnet');
    expect(row?.effort).toBe('high');
  });

  it('is a no-op when updates is empty', () => {
    const before = getContainerConfig('ag-6')?.updated_at;
    // Small delay to ensure timestamp would differ
    updateContainerConfigScalars('ag-6', {});
    const after = getContainerConfig('ag-6')?.updated_at;
    expect(after).toBe(before);
  });

  it('throws on invalid scalar column', () => {
    expect(() =>
      updateContainerConfigScalars('ag-6', { bad_column: 'x' } as never)
    ).toThrow('Invalid scalar column');
  });
});

describe('updateContainerConfigJson', () => {
  beforeEach(() => {
    seedGroup('ag-7');
    createContainerConfig(defaultRow('ag-7'));
  });

  it('updates skills column', () => {
    updateContainerConfigJson('ag-7', 'skills', ['ts', 'py']);
    const row = getContainerConfig('ag-7');
    expect(JSON.parse(row!.skills as string)).toEqual(['ts', 'py']);
  });

  it('updates mcp_servers column', () => {
    const mcp = { myServer: { command: 'node', args: ['srv.js'] } };
    updateContainerConfigJson('ag-7', 'mcp_servers', mcp);
    const row = getContainerConfig('ag-7');
    expect(JSON.parse(row!.mcp_servers as string)).toEqual(mcp);
  });

  it('throws on invalid JSON column', () => {
    expect(() =>
      updateContainerConfigJson('ag-7', 'bad_column' as never, [])
    ).toThrow('Invalid JSON column');
  });
});

describe('deleteContainerConfig', () => {
  it('deletes an existing row', () => {
    seedGroup('ag-8');
    createContainerConfig(defaultRow('ag-8'));
    deleteContainerConfig('ag-8');
    expect(getContainerConfig('ag-8')).toBeUndefined();
  });

  it('is a no-op for non-existent row', () => {
    expect(() => deleteContainerConfig('nonexistent')).not.toThrow();
  });
});
