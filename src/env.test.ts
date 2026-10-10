/**
 * Tests for env.ts — .env file parser and process.env fallback logic.
 * Uses vi.mock to avoid touching the real filesystem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./log.js', () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// We'll replace fs.readFileSync per test
const mockReadFileSync = vi.fn();
vi.mock('fs', () => ({ default: { readFileSync: (...args: unknown[]) => mockReadFileSync(...args) } }));

// Import AFTER mocks
const { readEnvFile } = await import('./env.js');

describe('readEnvFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any env vars we might set
    delete process.env['TEST_KEY_A'];
    delete process.env['TEST_KEY_B'];
  });

  it('parses unquoted values', () => {
    mockReadFileSync.mockReturnValue('TEST_KEY_A=hello\nTEST_KEY_B=world\n');
    expect(readEnvFile(['TEST_KEY_A', 'TEST_KEY_B'])).toEqual({ TEST_KEY_A: 'hello', TEST_KEY_B: 'world' });
  });

  it('strips double-quoted values', () => {
    mockReadFileSync.mockReturnValue('TEST_KEY_A="quoted value"\n');
    expect(readEnvFile(['TEST_KEY_A'])).toEqual({ TEST_KEY_A: 'quoted value' });
  });

  it('strips single-quoted values', () => {
    mockReadFileSync.mockReturnValue("TEST_KEY_A='single quoted'\n");
    expect(readEnvFile(['TEST_KEY_A'])).toEqual({ TEST_KEY_A: 'single quoted' });
  });

  it('skips comment lines and blank lines', () => {
    mockReadFileSync.mockReturnValue('# comment\n\nTEST_KEY_A=value\n');
    expect(readEnvFile(['TEST_KEY_A'])).toEqual({ TEST_KEY_A: 'value' });
  });

  it('skips lines without = sign', () => {
    mockReadFileSync.mockReturnValue('NOEQUALSSIGN\nTEST_KEY_A=ok\n');
    expect(readEnvFile(['TEST_KEY_A'])).toEqual({ TEST_KEY_A: 'ok' });
  });

  it('only returns requested keys', () => {
    mockReadFileSync.mockReturnValue('TEST_KEY_A=a\nTEST_KEY_B=b\nUNREQUESTED=x\n');
    expect(readEnvFile(['TEST_KEY_A'])).toEqual({ TEST_KEY_A: 'a' });
  });

  it('falls back to process.env when .env file not found', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    process.env['TEST_KEY_A'] = 'from-env';
    expect(readEnvFile(['TEST_KEY_A', 'TEST_KEY_B'])).toEqual({ TEST_KEY_A: 'from-env' });
  });

  it('process.env fills in keys missing from .env file', () => {
    mockReadFileSync.mockReturnValue('TEST_KEY_A=fromfile\n');
    process.env['TEST_KEY_B'] = 'from-process-env';
    expect(readEnvFile(['TEST_KEY_A', 'TEST_KEY_B'])).toEqual({
      TEST_KEY_A: 'fromfile',
      TEST_KEY_B: 'from-process-env',
    });
  });

  it('omits empty values', () => {
    mockReadFileSync.mockReturnValue('TEST_KEY_A=\n');
    expect(readEnvFile(['TEST_KEY_A'])).toEqual({});
  });

  it('handles value with embedded = sign', () => {
    mockReadFileSync.mockReturnValue('TEST_KEY_A=a=b=c\n');
    expect(readEnvFile(['TEST_KEY_A'])).toEqual({ TEST_KEY_A: 'a=b=c' });
  });

  it('returns empty object when no keys requested', () => {
    mockReadFileSync.mockReturnValue('TEST_KEY_A=value\n');
    expect(readEnvFile([])).toEqual({});
  });
});
