/**
 * Tests for container-config.ts — configFromDb and materializeContainerJson.
 * configFromDb is pure (no I/O); materializeContainerJson needs DB + fs mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./log.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const mockGetAgentGroup = vi.fn();
const mockGetContainerConfig = vi.fn();
vi.mock('./db/agent-groups.js', () => ({ getAgentGroup: (...args: unknown[]) => mockGetAgentGroup(...args) }));
vi.mock('./db/container-configs.js', () => ({ getContainerConfig: (...args: unknown[]) => mockGetContainerConfig(...args) }));

const mockWriteFileSync = vi.fn();
const mockExistsSync = vi.fn().mockReturnValue(true);
const mockMkdirSync = vi.fn();
vi.mock('fs', () => ({
  default: {
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  },
}));

vi.mock('./config.js', () => ({ GROUPS_DIR: '/groups' }));

import { configFromDb, materializeContainerJson } from './container-config.js';
import type { AgentGroup, ContainerConfigRow } from './types.js';

function makeRow(overrides?: Partial<ContainerConfigRow>): ContainerConfigRow {
  return {
    agent_group_id: 'ag-1',
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
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as ContainerConfigRow;
}

function makeGroup(overrides?: Partial<AgentGroup>): AgentGroup {
  return {
    id: 'ag-1',
    name: 'Test Group',
    folder: 'test-group',
    agent_provider: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as AgentGroup;
}

describe('configFromDb', () => {
  it('builds ContainerConfig from a minimal DB row', () => {
    const config = configFromDb(makeRow(), makeGroup());
    expect(config.mcpServers).toEqual({});
    expect(config.packages).toEqual({ apt: [], npm: [] });
    expect(config.additionalMounts).toEqual([]);
    expect(config.skills).toBe('all');
    expect(config.groupName).toBe('Test Group');
    expect(config.agentGroupId).toBe('ag-1');
  });

  it('uses group name as assistantName when assistant_name is null', () => {
    const config = configFromDb(makeRow({ assistant_name: null }), makeGroup({ name: 'My Bot' }));
    expect(config.assistantName).toBe('My Bot');
  });

  it('uses assistant_name from row when set', () => {
    const config = configFromDb(makeRow({ assistant_name: 'Clawd' }), makeGroup());
    expect(config.assistantName).toBe('Clawd');
  });

  it('maps image_tag null to undefined', () => {
    const config = configFromDb(makeRow({ image_tag: null }), makeGroup());
    expect(config.imageTag).toBeUndefined();
  });

  it('maps image_tag value through', () => {
    const config = configFromDb(makeRow({ image_tag: 'v1.2.3' }), makeGroup());
    expect(config.imageTag).toBe('v1.2.3');
  });

  it('maps provider null to undefined', () => {
    const config = configFromDb(makeRow({ provider: null }), makeGroup());
    expect(config.provider).toBeUndefined();
  });

  it('maps provider value through', () => {
    const config = configFromDb(makeRow({ provider: 'bedrock' }), makeGroup());
    expect(config.provider).toBe('bedrock');
  });

  it('maps max_messages_per_prompt null to undefined', () => {
    const config = configFromDb(makeRow({ max_messages_per_prompt: null }), makeGroup());
    expect(config.maxMessagesPerPrompt).toBeUndefined();
  });

  it('maps max_messages_per_prompt value through', () => {
    const config = configFromDb(makeRow({ max_messages_per_prompt: 10 }), makeGroup());
    expect(config.maxMessagesPerPrompt).toBe(10);
  });

  it('parses non-trivial mcpServers JSON', () => {
    const mcp = { myServer: { command: 'node', args: ['server.js'] } };
    const config = configFromDb(makeRow({ mcp_servers: JSON.stringify(mcp) }), makeGroup());
    expect(config.mcpServers).toEqual(mcp);
  });

  it('parses skills as array', () => {
    const config = configFromDb(makeRow({ skills: '["ts","py"]' }), makeGroup());
    expect(config.skills).toEqual(['ts', 'py']);
  });

  it('maps model null to undefined', () => {
    const config = configFromDb(makeRow({ model: null }), makeGroup());
    expect(config.model).toBeUndefined();
  });

  it('maps effort null to undefined', () => {
    const config = configFromDb(makeRow({ effort: null }), makeGroup());
    expect(config.effort).toBeUndefined();
  });
});

describe('materializeContainerJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it('throws when agent group not found', async () => {
    mockGetAgentGroup.mockReturnValue(undefined);
    expect(() => materializeContainerJson('missing')).toThrow('Agent group not found: missing');
  });

  it('throws when container config not found', () => {
    mockGetAgentGroup.mockReturnValue(makeGroup());
    mockGetContainerConfig.mockReturnValue(undefined);
    expect(() => materializeContainerJson('ag-1')).toThrow('Container config not found for agent group: ag-1');
  });

  it('writes container.json and returns config', () => {
    mockGetAgentGroup.mockReturnValue(makeGroup());
    mockGetContainerConfig.mockReturnValue(makeRow());
    const config = materializeContainerJson('ag-1');
    expect(config.agentGroupId).toBe('ag-1');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('container.json'),
      expect.stringContaining('"agentGroupId": "ag-1"'),
    );
  });

  it('creates dir when missing', () => {
    mockGetAgentGroup.mockReturnValue(makeGroup());
    mockGetContainerConfig.mockReturnValue(makeRow());
    mockExistsSync.mockReturnValue(false);
    materializeContainerJson('ag-1');
    expect(mockMkdirSync).toHaveBeenCalled();
  });
});
