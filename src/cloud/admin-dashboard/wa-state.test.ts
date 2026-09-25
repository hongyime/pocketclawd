/**
 * Tests for wa-state.ts — WhatsApp state endpoint and SSE broadcast logic.
 * Uses mock http.IncomingMessage / ServerResponse objects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  registerWaStateProvider,
  broadcastWaStateChange,
  handleWaStateRequest,
} from './wa-state.js';

function mockRes() {
  return {
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
}

function mockReq(url: string, method = 'GET') {
  return { url, method, on: vi.fn() } as never;
}

beforeEach(() => {
  // Reset provider to null state between tests
  registerWaStateProvider(() => ({ status: 'unknown' }));
});

describe('registerWaStateProvider + _formatPayload', () => {
  it('reports connected=false when status is unknown', () => {
    registerWaStateProvider(() => ({ status: 'unknown' }));
    const res = mockRes();
    handleWaStateRequest(mockReq('/api/wa-state'), res as never);
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ connected: false, phone: null }));
  });

  it('reports connected=true with phone when status=connected and phoneNumber set', () => {
    registerWaStateProvider(() => ({ status: 'connected', phoneNumber: '6591234567@s.whatsapp.net' }));
    const res = mockRes();
    handleWaStateRequest(mockReq('/api/wa-state'), res as never);
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ connected: true, phone: '6591234567' }));
  });

  it('reports phone=null when connected but phoneNumber is null', () => {
    registerWaStateProvider(() => ({ status: 'connected', phoneNumber: null }));
    const res = mockRes();
    handleWaStateRequest(mockReq('/api/wa-state'), res as never);
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ connected: true, phone: null }));
  });

  it('strips @-domain from phone number', () => {
    registerWaStateProvider(() => ({ status: 'connected', phoneNumber: '123@any.domain' }));
    const res = mockRes();
    handleWaStateRequest(mockReq('/api/wa-state'), res as never);
    const body = JSON.parse((res.end.mock.calls[0][0] as string));
    expect(body.phone).toBe('123');
  });
});

describe('handleWaStateRequest', () => {
  it('returns false for non-matching URL', () => {
    const res = mockRes();
    expect(handleWaStateRequest(mockReq('/other'), res as never)).toBe(false);
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it('returns false for POST to /api/wa-state', () => {
    const res = mockRes();
    expect(handleWaStateRequest(mockReq('/api/wa-state', 'POST'), res as never)).toBe(false);
  });

  it('returns true and writes JSON for GET /api/wa-state', () => {
    const res = mockRes();
    const handled = handleWaStateRequest(mockReq('/api/wa-state'), res as never);
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'application/json' }));
    expect(res.end).toHaveBeenCalled();
  });

  it('returns true and starts SSE for GET /api/wa-state/stream', () => {
    const res = mockRes();
    const req = mockReq('/api/wa-state/stream');
    const handled = handleWaStateRequest(req, res as never);
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'text/event-stream' }));
    // Should emit initial snapshot
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: snapshot'));
    // Should register close/error cleanup handlers
    expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(req.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});

describe('broadcastWaStateChange', () => {
  it('is a no-op when no SSE clients are connected', () => {
    // No SSE clients registered — should not throw
    expect(() => broadcastWaStateChange()).not.toThrow();
  });

  it('writes to SSE clients when connected', () => {
    // Register a client via a real SSE request
    const res = mockRes();
    handleWaStateRequest(mockReq('/api/wa-state/stream'), res as never);

    registerWaStateProvider(() => ({ status: 'connected', phoneNumber: '999' }));
    broadcastWaStateChange();

    // Should have written a data frame after the initial snapshot
    const writes: string[] = res.write.mock.calls.map((c: string[]) => c[0]);
    const broadcast = writes.find((w) => w.startsWith('data:') && !w.includes('snapshot'));
    expect(broadcast).toBeTruthy();
    expect(broadcast).toContain('"connected":true');

    // Cleanup: trigger the close handler to remove client
    const closeCb = (res.on.mock.calls as [string, () => void][]).find(([e]) => e === 'close')?.[1];
    closeCb?.();
  });
});
