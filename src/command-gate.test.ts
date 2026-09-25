/**
 * Tests for command-gate.ts — command classification and admin gating.
 * Mocks DB to avoid needing a real SQLite instance for the isAdmin path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB modules BEFORE importing gateCommand
const mockHasTable = vi.fn();
const mockPrepare = vi.fn();
const mockGetDb = vi.fn();

vi.mock('./db/connection.js', () => ({
  getDb: () => mockGetDb(),
  hasTable: (db: unknown, name: string) => mockHasTable(db, name),
}));

const { gateCommand } = await import('./command-gate.js');

describe('gateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Non-command messages pass through ────────────────────────────────────
  it('passes plain text messages', () => {
    expect(gateCommand('hello world', 'u1', 'ag1')).toEqual({ action: 'pass' });
  });

  it('passes JSON messages with non-slash text', () => {
    expect(gateCommand(JSON.stringify({ text: 'hello' }), 'u1', 'ag1')).toEqual({ action: 'pass' });
  });

  it('passes malformed JSON as plain text (no slash)', () => {
    expect(gateCommand('{bad json', 'u1', 'ag1')).toEqual({ action: 'pass' });
  });

  // ── Filtered commands are dropped ────────────────────────────────────────
  it('filters /help', () => {
    expect(gateCommand('/help', 'u1', 'ag1')).toEqual({ action: 'filter' });
  });

  it('filters /login', () => {
    expect(gateCommand('/login', 'u1', 'ag1')).toEqual({ action: 'filter' });
  });

  it('filters /logout', () => {
    expect(gateCommand('/logout', 'u1', 'ag1')).toEqual({ action: 'filter' });
  });

  it('filters /doctor', () => {
    expect(gateCommand('/doctor', 'u1', 'ag1')).toEqual({ action: 'filter' });
  });

  it('filters /config', () => {
    expect(gateCommand('/config', 'u1', 'ag1')).toEqual({ action: 'filter' });
  });

  it('filters /remote-control', () => {
    expect(gateCommand('/remote-control', 'u1', 'ag1')).toEqual({ action: 'filter' });
  });

  it('filters commands case-insensitively', () => {
    expect(gateCommand('/HELP', 'u1', 'ag1')).toEqual({ action: 'filter' });
  });

  it('filters command embedded in JSON', () => {
    expect(gateCommand(JSON.stringify({ text: '/help' }), 'u1', 'ag1')).toEqual({ action: 'filter' });
  });

  // ── Admin commands: no user_roles table → allow all ──────────────────────
  it('passes admin commands when user_roles table does not exist', () => {
    mockGetDb.mockReturnValue({});
    mockHasTable.mockReturnValue(false);
    expect(gateCommand('/clear', 'u1', 'ag1')).toEqual({ action: 'pass' });
  });

  it('denies admin commands when userId is null (short-circuits before table check)', () => {
    // isAdmin: if (!userId) return false — no DB call at all
    expect(gateCommand('/compact', null, 'ag1')).toEqual({ action: 'deny', command: '/compact' });
  });

  // ── Admin commands: user_roles table exists, userId null → deny ───────────
  it('denies admin commands when userId is null and user_roles table exists', () => {
    const fakeDb = { prepare: mockPrepare };
    mockGetDb.mockReturnValue(fakeDb);
    mockHasTable.mockReturnValue(true);
    expect(gateCommand('/clear', null, 'ag1')).toEqual({ action: 'deny', command: '/clear' });
  });

  // ── Admin commands: user_roles table exists, user IS admin → pass ─────────
  it('passes admin command when user has owner role', () => {
    const mockGet = vi.fn().mockReturnValue({ 1: 1 });
    const fakeDb = { prepare: vi.fn().mockReturnValue({ get: mockGet }) };
    mockGetDb.mockReturnValue(fakeDb);
    mockHasTable.mockReturnValue(true);
    expect(gateCommand('/clear', 'u-owner', 'ag1')).toEqual({ action: 'pass' });
  });

  // ── Admin commands: user_roles table exists, user NOT admin → deny ────────
  it('denies admin command when user has no role', () => {
    const mockGet = vi.fn().mockReturnValue(undefined);
    const fakeDb = { prepare: vi.fn().mockReturnValue({ get: mockGet }) };
    mockGetDb.mockReturnValue(fakeDb);
    mockHasTable.mockReturnValue(true);
    expect(gateCommand('/compact', 'u-regular', 'ag1')).toEqual({ action: 'deny', command: '/compact' });
  });

  // ── All admin commands covered ────────────────────────────────────────────
  it('recognises all five admin commands', () => {
    mockGetDb.mockReturnValue({});
    mockHasTable.mockReturnValue(false);
    for (const cmd of ['/clear', '/compact', '/context', '/cost', '/files']) {
      expect(gateCommand(cmd, 'u1', 'ag1')).toEqual({ action: 'pass' });
    }
  });

  // ── Unknown slash commands pass through ──────────────────────────────────
  it('passes unknown slash commands', () => {
    expect(gateCommand('/unknown-command', 'u1', 'ag1')).toEqual({ action: 'pass' });
  });

  // ── Command with arguments ────────────────────────────────────────────────
  it('correctly identifies command token in message with arguments', () => {
    expect(gateCommand('/help arg1 arg2', 'u1', 'ag1')).toEqual({ action: 'filter' });
  });
});
