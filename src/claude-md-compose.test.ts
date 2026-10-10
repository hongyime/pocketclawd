/**
 * Tests for claude-md-compose.ts — composeGroupClaudeMd and migrateGroupsToClaudeLocal.
 * Mocks fs and db so no real disk I/O or DB is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./log.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('./config.js', () => ({ GROUPS_DIR: '/groups' }));
vi.mock('./db/container-configs.js', () => ({ getContainerConfig: vi.fn().mockReturnValue(null) }));

const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockReadlinkSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockSymlinkSync = vi.fn();
const mockReaddirSync = vi.fn().mockReturnValue([]);
const mockLstatSync = vi.fn();
const mockRenameSync = vi.fn();
const mockRmSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    readlinkSync: (...a: unknown[]) => mockReadlinkSync(...a),
    unlinkSync: (...a: unknown[]) => mockUnlinkSync(...a),
    symlinkSync: (...a: unknown[]) => mockSymlinkSync(...a),
    readdirSync: (...a: unknown[]) => mockReaddirSync(...a),
    lstatSync: (...a: unknown[]) => mockLstatSync(...a),
    renameSync: (...a: unknown[]) => mockRenameSync(...a),
    rmSync: (...a: unknown[]) => mockRmSync(...a),
  },
}));

import { composeGroupClaudeMd, migrateGroupsToClaudeLocal } from './claude-md-compose.js';
import type { AgentGroup } from './types.js';

function makeGroup(overrides?: Partial<AgentGroup>): AgentGroup {
  return {
    id: 'ag-1',
    name: 'Test',
    folder: 'test-group',
    agent_provider: null,
    created_at: new Date().toISOString(),
    ...overrides,
  } as AgentGroup;
}

describe('composeGroupClaudeMd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadlinkSync.mockImplementation(() => { throw new Error('ENOENT'); });
    // No skills, no mcp-tools dirs
    mockReaddirSync.mockReturnValue([]);
  });

  it('creates groupDir when missing', () => {
    composeGroupClaudeMd(makeGroup());
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('test-group'),
      expect.objectContaining({ recursive: true }),
    );
  });

  it('creates fragments dir', () => {
    composeGroupClaudeMd(makeGroup());
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.claude-fragments'),
      expect.objectContaining({ recursive: true }),
    );
  });

  it('writes CLAUDE.md with composed header', () => {
    composeGroupClaudeMd(makeGroup());
    // writeAtomic() writes to a .tmp file then renames — check renameSync
    const renameCall = mockRenameSync.mock.calls.find(
      (c: string[]) => (c[1] as string).endsWith('CLAUDE.md'),
    );
    expect(renameCall).toBeTruthy();
    // Content was written to the .tmp path in writeFileSync before rename
    const tmpPath = renameCall[0] as string;
    const writeCall = mockWriteFileSync.mock.calls.find((c: string[]) => c[0] === tmpPath);
    expect(writeCall).toBeTruthy();
    expect(writeCall[1]).toContain('Composed at spawn');
    expect(writeCall[1]).toContain('@./.claude-shared.md');
  });

  it('creates empty CLAUDE.local.md when missing', () => {
    composeGroupClaudeMd(makeGroup());
    const call = mockWriteFileSync.mock.calls.find(
      (c: string[]) => (c[0] as string).endsWith('CLAUDE.local.md'),
    );
    expect(call).toBeTruthy();
    expect(call[1]).toBe('');
  });

  it('does not create CLAUDE.local.md when it already exists', () => {
    mockExistsSync.mockImplementation((p: string) =>
      (p as string).endsWith('CLAUDE.local.md'),
    );
    composeGroupClaudeMd(makeGroup());
    const calls = mockWriteFileSync.mock.calls.filter(
      (c: string[]) => (c[0] as string).endsWith('CLAUDE.local.md'),
    );
    expect(calls.length).toBe(0);
  });

  it('removes stale fragments not in desired set', () => {
    // One stale fragment exists in fragmentsDir
    mockReaddirSync.mockImplementation((p: string) =>
      (p as string).endsWith('.claude-fragments') ? ['stale-frag.md'] : [],
    );
    composeGroupClaudeMd(makeGroup());
    expect(mockUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('stale-frag.md'),
    );
  });

  it('writes inline fragment for MCP server with instructions', async () => {
    const { getContainerConfig } = await import('./db/container-configs.js');
    vi.mocked(getContainerConfig).mockReturnValue({
      mcp_servers: JSON.stringify({
        myServer: { command: 'node', instructions: 'Use myServer for X.' },
      }),
    } as never);
    composeGroupClaudeMd(makeGroup());
    // The inline fragment should be atomically written
    const fragCall = mockWriteFileSync.mock.calls.find(
      (c: string[]) => (c[0] as string).includes('mcp-myServer.md'),
    );
    expect(fragCall).toBeTruthy();
    expect(fragCall[1]).toBe('Use myServer for X.');
    vi.mocked(getContainerConfig).mockReturnValue(null);
  });

  it('creates symlink for .claude-shared.md', () => {
    composeGroupClaudeMd(makeGroup());
    expect(mockSymlinkSync).toHaveBeenCalledWith(
      '/app/CLAUDE.md',
      expect.stringContaining('.claude-shared.md'),
    );
  });

  it('falls back to writeFileSync when symlinkSync fails with EPERM', () => {
    mockSymlinkSync.mockImplementation(() => {
      const err = new Error('EPERM') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      throw err;
    });
    composeGroupClaudeMd(makeGroup());
    // Should fall back to writing a placeholder
    const fallbackCall = mockWriteFileSync.mock.calls.find(
      (c: string[]) => (c[0] as string).endsWith('.claude-shared.md'),
    );
    expect(fallbackCall).toBeTruthy();
    expect(fallbackCall[1]).toContain('/app/CLAUDE.md');
  });

  it('skips re-creating symlink when target is already correct', () => {
    mockReadlinkSync.mockReturnValue('/app/CLAUDE.md'); // already points to right target
    composeGroupClaudeMd(makeGroup());
    // symlinkSync should NOT be called for .claude-shared.md
    const symlinkCalls = mockSymlinkSync.mock.calls.filter(
      (c: string[]) => (c[1] as string).endsWith('.claude-shared.md'),
    );
    expect(symlinkCalls.length).toBe(0);
  });
});

describe('migrateGroupsToClaudeLocal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when GROUPS_DIR does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    migrateGroupsToClaudeLocal();
    expect(mockRenameSync).not.toHaveBeenCalled();
  });

  it('removes .claude-global.md symlink when present', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      { name: 'my-group', isDirectory: () => true },
    ]);
    // lstatSync succeeds for .claude-global.md (it exists)
    mockLstatSync.mockImplementation(() => ({}));
    // CLAUDE.md doesn't exist, CLAUDE.local.md doesn't exist
    mockExistsSync.mockImplementation((p: string) => {
      if ((p as string) === '/groups') return true;
      if ((p as string).endsWith('.claude-global.md')) return false; // after lstat
      return false;
    });
    migrateGroupsToClaudeLocal();
    expect(mockUnlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('.claude-global.md'),
    );
  });

  it('skips global directory', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      { name: 'global', isDirectory: () => true },
    ]);
    migrateGroupsToClaudeLocal();
    // Should not call lstatSync for the global folder
    expect(mockLstatSync).not.toHaveBeenCalled();
  });

  it('renames CLAUDE.md to CLAUDE.local.md when local does not exist', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if ((p as string) === '/groups') return true;
      if ((p as string).endsWith('CLAUDE.md') && !(p as string).endsWith('CLAUDE.local.md')) return true;
      if ((p as string).endsWith('CLAUDE.local.md')) return false;
      return false;
    });
    mockReaddirSync.mockReturnValue([
      { name: 'my-group', isDirectory: () => true },
    ]);
    mockLstatSync.mockImplementation(() => { throw new Error('ENOENT'); });
    migrateGroupsToClaudeLocal();
    expect(mockRenameSync).toHaveBeenCalledWith(
      expect.stringContaining('CLAUDE.md'),
      expect.stringContaining('CLAUDE.local.md'),
    );
  });

  it('removes groups/global/ if it exists', () => {
    // path.join may produce OS-specific separators; match loosely
    mockExistsSync.mockImplementation((p: string) => {
      const norm = (p as string).replace(/\\/g, '/');
      return norm === '/groups' || norm.endsWith('/groups/global');
    });
    mockReaddirSync.mockReturnValue([]);
    migrateGroupsToClaudeLocal();
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringMatching(/global/),
      expect.objectContaining({ recursive: true }),
    );
  });
});
