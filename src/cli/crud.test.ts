/**
 * Tests for crud.ts — resource registry, normalizeArgs, and generic
 * handler validation logic. Mocks getDb so no real SQLite is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock registry + DB before import
vi.mock('./registry.js', () => ({ register: vi.fn() }));

const mockRun = vi.fn().mockReturnValue({ changes: 1 });
const mockGet = vi.fn();
const mockAll = vi.fn().mockReturnValue([]);
const mockPrepare = vi.fn().mockReturnValue({ run: mockRun, get: mockGet, all: mockAll });
const mockDb = { prepare: mockPrepare };
vi.mock('../db/connection.js', () => ({ getDb: () => mockDb }));

// Import after mocks
import {
  getResource,
  getResources,
  registerResource,
  type ResourceDef,
} from './crud.js';

// Minimal resource definition for tests
function makeResource(plural: string, overrides?: Partial<ResourceDef>): ResourceDef {
  return {
    name: plural.slice(0, -1), // strip trailing s
    plural,
    table: `tbl_${plural}`,
    description: `Test ${plural}`,
    idColumn: 'id',
    columns: [
      { name: 'id', type: 'string', description: 'Primary key', generated: true },
      { name: 'name', type: 'string', description: 'Name', required: true },
      { name: 'score', type: 'number', description: 'Score', updatable: true },
      { name: 'status', type: 'string', description: 'Status', updatable: true, enum: ['active', 'inactive'] },
    ],
    operations: { list: 'open', get: 'open', create: 'open', update: 'open', delete: 'open' },
    ...overrides,
  };
}

describe('resource registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getResource returns undefined for unknown plural', () => {
    expect(getResource('nonexistent-plural')).toBeUndefined();
  });

  it('registerResource adds to registry and getResource returns it', () => {
    const def = makeResource('widgets');
    registerResource(def);
    expect(getResource('widgets')).toBe(def);
  });

  it('getResources returns all registered resources sorted by plural', () => {
    registerResource(makeResource('zebras'));
    registerResource(makeResource('alpacas'));
    const names = getResources().map((r) => r.plural);
    expect(names.indexOf('alpacas')).toBeLessThan(names.indexOf('zebras'));
  });
});

describe('normalizeArgs (via parseArgs wrapper)', () => {
  // normalizeArgs is internal — it's exercised indirectly via the registered
  // command's parseArgs. We call genericCreate/genericList/etc via the handler
  // that was registered. Instead, test the known transformation by calling
  // the handlers directly with hyphenated keys.
  it('registered list handler normalizes hyphen-keys to underscore-keys', async () => {
    const def = makeResource('users2');
    registerResource(def);
    const cmd = vi.mocked((await import('./registry.js')).register).mock.calls
      .find((c) => c[0].name === 'users2-list')?.[0];
    // parseArgs should convert hyphen to underscore
    expect(cmd?.parseArgs({ 'agent-id': 'x' })).toEqual({ agent_id: 'x' });
  });
});

describe('genericCreate validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when required column is missing', async () => {
    const def = makeResource('products');
    registerResource(def);
    const { register } = await import('./registry.js');
    const createCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'products-create')?.[0];
    // 'name' is required — omit it
    await expect(createCmd!.handler({ id: undefined }, {} as never)).rejects.toThrow('--name is required');
  });

  it('throws when enum column has invalid value', async () => {
    const def = makeResource('products2', {
      columns: [
        { name: 'id', type: 'string', description: 'ID', generated: true },
        { name: 'mode', type: 'string', description: 'Mode', required: true, enum: ['a', 'b'] },
      ],
    });
    registerResource(def);
    const { register } = await import('./registry.js');
    const createCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'products2-create')?.[0];
    await expect(createCmd!.handler({ mode: 'z' }, {} as never)).rejects.toThrow('must be one of: a, b');
  });

  it('accepts valid enum value', async () => {
    mockRun.mockReturnValue({ changes: 1 });
    const def = makeResource('products3', {
      columns: [
        { name: 'id', type: 'string', description: 'ID', generated: true },
        { name: 'mode', type: 'string', description: 'Mode', required: true, enum: ['a', 'b'] },
      ],
    });
    registerResource(def);
    const { register } = await import('./registry.js');
    const createCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'products3-create')?.[0];
    const result = await createCmd!.handler({ mode: 'a' }, {} as never);
    expect((result as Record<string, unknown>).mode).toBe('a');
  });

  it('coerces number-type columns', async () => {
    mockRun.mockReturnValue({ changes: 1 });
    const def = makeResource('products4', {
      columns: [
        { name: 'id', type: 'string', description: 'ID', generated: true },
        { name: 'qty', type: 'number', description: 'Qty', required: true },
      ],
    });
    registerResource(def);
    const { register } = await import('./registry.js');
    const createCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'products4-create')?.[0];
    const result = await createCmd!.handler({ qty: '42' }, {} as never);
    expect((result as Record<string, unknown>).qty).toBe(42);
  });
});

describe('genericUpdate validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when id is missing', async () => {
    const def = makeResource('orders');
    registerResource(def);
    const { register } = await import('./registry.js');
    const updateCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'orders-update')?.[0];
    await expect(updateCmd!.handler({ id: '' }, {} as never)).rejects.toThrow('id is required');
  });

  it('throws when nothing to update', async () => {
    const def = makeResource('orders2');
    registerResource(def);
    const { register } = await import('./registry.js');
    const updateCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'orders2-update')?.[0];
    // Only updatable cols are score and status — pass neither
    await expect(updateCmd!.handler({ id: 'x' }, {} as never)).rejects.toThrow('nothing to update');
  });

  it('throws when enum column has invalid value on update', async () => {
    const def = makeResource('orders3');
    registerResource(def);
    const { register } = await import('./registry.js');
    const updateCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'orders3-update')?.[0];
    await expect(updateCmd!.handler({ id: 'x', status: 'bad' }, {} as never)).rejects.toThrow('must be one of: active, inactive');
  });
});

describe('genericGet validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when id is missing', async () => {
    const def = makeResource('items');
    registerResource(def);
    const { register } = await import('./registry.js');
    const getCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'items-get')?.[0];
    await expect(getCmd!.handler({ id: '' }, {} as never)).rejects.toThrow('id is required');
  });

  it('throws when row not found', async () => {
    mockGet.mockReturnValue(undefined);
    const def = makeResource('items2');
    registerResource(def);
    const { register } = await import('./registry.js');
    const getCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'items2-get')?.[0];
    await expect(getCmd!.handler({ id: 'missing-id' }, {} as never)).rejects.toThrow('not found: missing-id');
  });
});

describe('genericDelete validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when id is missing', async () => {
    const def = makeResource('tags');
    registerResource(def);
    const { register } = await import('./registry.js');
    const delCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'tags-delete')?.[0];
    await expect(delCmd!.handler({ id: '' }, {} as never)).rejects.toThrow('id is required');
  });

  it('throws when row not found', async () => {
    mockRun.mockReturnValue({ changes: 0 });
    const def = makeResource('tags2');
    registerResource(def);
    const { register } = await import('./registry.js');
    const delCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'tags2-delete')?.[0];
    await expect(delCmd!.handler({ id: 'ghost' }, {} as never)).rejects.toThrow('not found: ghost');
  });

  it('returns deleted id on success', async () => {
    mockRun.mockReturnValue({ changes: 1 });
    const def = makeResource('tags3');
    registerResource(def);
    const { register } = await import('./registry.js');
    const delCmd = vi.mocked(register).mock.calls
      .find((c) => c[0].name === 'tags3-delete')?.[0];
    expect(await delCmd!.handler({ id: 'the-id' }, {} as never)).toEqual({ deleted: 'the-id' });
  });
});
