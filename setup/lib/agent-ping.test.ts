/**
 * Tests for setup/lib/agent-ping.ts — classifyPingResult pure logic.
 * pingCliAgent is skipped (spawns real child process).
 */
import { describe, it, expect } from 'vitest';
import { classifyPingResult } from './agent-ping.js';

describe('classifyPingResult', () => {
  it('returns ok when exit 0 and stdout has content', () => {
    expect(classifyPingResult(0, 'pong\n')).toBe('ok');
  });

  it('returns socket_error on exit code 2', () => {
    expect(classifyPingResult(2, '')).toBe('socket_error');
  });

  it('returns no_reply on null exit code', () => {
    expect(classifyPingResult(null, '')).toBe('no_reply');
  });

  it('returns no_reply on exit 0 but empty stdout', () => {
    expect(classifyPingResult(0, '')).toBe('no_reply');
  });

  it('returns no_reply on exit 3', () => {
    expect(classifyPingResult(3, '')).toBe('no_reply');
  });

  it('returns auth_error on Invalid bearer token', () => {
    expect(classifyPingResult(1, '', 'Invalid bearer token: expired')).toBe('auth_error');
  });

  it('returns auth_error on authentication error (underscore)', () => {
    expect(classifyPingResult(1, 'authentication_error found')).toBe('auth_error');
  });

  it('returns auth_error on Failed to authenticate', () => {
    expect(classifyPingResult(1, '', 'Failed to authenticate with server')).toBe('auth_error');
  });

  it('returns auth_error on Please run /login', () => {
    expect(classifyPingResult(1, 'Please run /login to continue')).toBe('auth_error');
  });

  it('returns auth_error on Not logged in', () => {
    expect(classifyPingResult(1, 'Not logged in')).toBe('auth_error');
  });

  it('returns auth_error on Invalid API key', () => {
    expect(classifyPingResult(1, '', 'Invalid API key provided')).toBe('auth_error');
  });

  it('auth check is case-insensitive', () => {
    expect(classifyPingResult(1, '', 'INVALID BEARER TOKEN')).toBe('auth_error');
  });

  it('socket_error takes priority over empty stdout (exit 2)', () => {
    expect(classifyPingResult(2, 'some output')).toBe('socket_error');
  });
});
