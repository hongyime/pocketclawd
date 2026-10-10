import { describe, it, expect, vi, afterEach } from 'vitest';
import { emitStatus } from './status.js';

describe('emitStatus', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('emits a block with the step name and all fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitStatus('NODE_CHECK', { version: '22.0.0', ok: true });
    expect(spy).toHaveBeenCalledOnce();
    const out: string = spy.mock.calls[0][0];
    expect(out).toContain('=== NANOCLAW SETUP: NODE_CHECK ===');
    expect(out).toContain('version: 22.0.0');
    expect(out).toContain('ok: true');
    expect(out).toContain('=== END ===');
  });

  it('handles numeric values', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitStatus('DISK', { freeMb: 4096 });
    const out: string = spy.mock.calls[0][0];
    expect(out).toContain('freeMb: 4096');
  });

  it('handles an empty fields object', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitStatus('EMPTY', {});
    const out: string = spy.mock.calls[0][0];
    expect(out).toContain('=== NANOCLAW SETUP: EMPTY ===');
    expect(out).toContain('=== END ===');
  });
});
