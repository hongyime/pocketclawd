/**
 * Additional tests for src/cli/registry.ts —
 * covers the duplicate-name throw and listCommands sort order.
 * The main register/lookup paths are exercised via dispatch.test.ts;
 * these tests specifically target the uncovered branches.
 */
import { describe, it, expect } from 'vitest';
import { register, lookup, listCommands } from './registry.js';

describe('register', () => {
  it('throws when registering a duplicate command name', () => {
    // crud.test.ts may have already registered some names; pick a unique one
    const def = {
      name: 'unique-cmd-for-dup-test',
      description: 'test',
      access: 'open' as const,
      parseArgs: (raw: Record<string, unknown>) => raw,
      handler: async () => ({}),
    };
    register(def);
    expect(() => register(def)).toThrow('already registered');
  });
});

describe('listCommands', () => {
  it('returns registered commands sorted by name', () => {
    register({
      name: 'zzz-last-cmd',
      description: 'z',
      access: 'open',
      parseArgs: (r) => r,
      handler: async () => ({}),
    });
    register({
      name: 'aaa-first-cmd',
      description: 'a',
      access: 'open',
      parseArgs: (r) => r,
      handler: async () => ({}),
    });
    const names = listCommands().map((c) => c.name);
    const idx1 = names.indexOf('aaa-first-cmd');
    const idx2 = names.indexOf('zzz-last-cmd');
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(idx2);
  });

  it('lookup returns undefined for unknown command', () => {
    expect(lookup('does-not-exist-xyz')).toBeUndefined();
  });
});
