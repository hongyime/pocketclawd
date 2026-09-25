/**
 * Tests for group-init.ts — initGroupFilesystem and ensurePreCompactHook.
 * Mocks fs so no real disk I/O occurs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./log.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('./config.js', () => ({ GROUPS_DIR: '/groups', DATA_DIR: '/data' }));
vi.mock('./db/container-configs.js', () => ({ ensureContainerConfig: vi.fn() }));

const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockReaddirSync = vi.fn().mockReturnValue([]);

vi.mock('fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  },
}));

import { initGroupFilesystem } from './group-init.js';
import type { AgentGroup } from './types.js';

function makeGroup(overrides?: Partial<AgentGroup>): AgentGroup {
  return {
    id: 'ag-test',
    name: 'Test Group',
    folder: 'test-group',
    agent_provider: null,
    created_at: new Date().toISOString(),
    ...overrides,
  } as AgentGroup;
}

describe('initGroupFilesystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: nothing exists yet
    mockExistsSync.mockReturnValue(false);
  });

  it('creates groupDir when missing', () => {
    initGroupFilesystem(makeGroup());
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('test-group'),
      expect.objectContaining({ recursive: true }),
    );
  });

  it('writes empty CLAUDE.local.md when no instructions provided', () => {
    initGroupFilesystem(makeGroup());
    const claudeLocalCall = mockWriteFileSync.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && (c[0] as string).includes('CLAUDE.local.md'),
    );
    expect(claudeLocalCall).toBeTruthy();
    expect(claudeLocalCall[1]).toBe('');
  });

  it('seeds CLAUDE.local.md with instructions when provided', () => {
    initGroupFilesystem(makeGroup(), { instructions: 'You are a test agent.' });
    const claudeLocalCall = mockWriteFileSync.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && (c[0] as string).includes('CLAUDE.local.md'),
    );
    expect(claudeLocalCall[1]).toBe('You are a test agent.\n');
  });

  it('creates .claude-shared directory', () => {
    initGroupFilesystem(makeGroup());
    const sharedDirCall = mockMkdirSync.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && (c[0] as string).includes('.claude-shared'),
    );
    expect(sharedDirCall).toBeTruthy();
  });

  it('writes settings.json with PreCompact hook', () => {
    initGroupFilesystem(makeGroup());
    const settingsCall = mockWriteFileSync.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && (c[0] as string).includes('settings.json'),
    );
    expect(settingsCall).toBeTruthy();
    const parsed = JSON.parse(settingsCall[1]);
    expect(parsed.hooks.PreCompact).toBeDefined();
  });

  it('creates skills directory', () => {
    initGroupFilesystem(makeGroup());
    const skillsDirCall = mockMkdirSync.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && (c[0] as string).includes('skills'),
    );
    expect(skillsDirCall).toBeTruthy();
  });

  it('skips creation steps when all paths already exist', () => {
    mockExistsSync.mockReturnValue(true);
    // settings.json exists — readFileSync should be called to check PreCompact hook
    const existingSettings = JSON.stringify({
      hooks: { PreCompact: [{ hooks: [{ type: 'command', command: 'bun /app/src/compact-instructions.ts' }] }] },
    });
    mockReadFileSync.mockReturnValue(existingSettings);
    initGroupFilesystem(makeGroup());
    // No mkdirSync calls for already-existing dirs
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });

  it('adds PreCompact hook to existing settings.json that lacks it', () => {
    // groupDir, CLAUDE.local.md, .claude-shared, skills all exist
    mockExistsSync.mockImplementation((p: string) => {
      // settings.json exists (to trigger the ensurePreCompactHook path)
      // but group dir, claude local, claude-shared dir, skills dir all "exist"
      return true;
    });
    // Settings file missing the PreCompact hook
    mockReadFileSync.mockReturnValue(JSON.stringify({ hooks: {} }));
    initGroupFilesystem(makeGroup());
    const settingsWriteCall = mockWriteFileSync.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && (c[0] as string).includes('settings.json'),
    );
    expect(settingsWriteCall).toBeTruthy();
    const written = JSON.parse(settingsWriteCall[1]);
    const hookCommands = JSON.stringify(written.hooks.PreCompact);
    expect(hookCommands).toContain('compact-instructions.ts');
  });

  it('calls ensureContainerConfig for the agent group', async () => {
    const { ensureContainerConfig } = await import('./db/container-configs.js');
    initGroupFilesystem(makeGroup());
    expect(ensureContainerConfig).toHaveBeenCalledWith('ag-test');
  });
});
