/**
 * Tests for modules/approvals/response-handler.ts.
 * Mocks all external deps so no real DB or container needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../log.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../container-runner.js', () => ({ wakeContainer: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../session-manager.js', () => ({ writeSessionMessage: vi.fn() }));

const mockGetPendingApproval = vi.fn();
const mockDeletePendingApproval = vi.fn();
const mockGetSession = vi.fn();
vi.mock('../../db/sessions.js', () => ({
  getPendingApproval: (...a: unknown[]) => mockGetPendingApproval(...a),
  deletePendingApproval: (...a: unknown[]) => mockDeletePendingApproval(...a),
  getSession: (...a: unknown[]) => mockGetSession(...a),
}));

const mockResolveOneCLI = vi.fn().mockReturnValue(false);
vi.mock('./onecli-approvals.js', () => ({
  ONECLI_ACTION: 'onecli_credential',
  resolveOneCLIApproval: (...a: unknown[]) => mockResolveOneCLI(...a),
}));

const mockGetApprovalHandler = vi.fn();
vi.mock('./primitive.js', () => ({
  getApprovalHandler: (...a: unknown[]) => mockGetApprovalHandler(...a),
}));

import { handleApprovalsResponse } from './response-handler.js';
import type { ResponsePayload } from '../../response-registry.js';

function makePayload(overrides?: Partial<ResponsePayload>): ResponsePayload {
  return { questionId: 'q-1', value: 'approve', userId: 'u-admin', ...overrides } as ResponsePayload;
}

function makeApproval(overrides?: Record<string, unknown>) {
  return {
    approval_id: 'q-1',
    session_id: 'sess-1',
    request_id: 'q-1',
    action: 'some-action',
    payload: '{"key":"value"}',
    created_at: new Date().toISOString(),
    title: 'Approve?',
    options_json: '[]',
    status: 'pending',
    ...overrides,
  };
}

function makeSession() {
  return { id: 'sess-1', agent_group_id: 'ag-1', messaging_group_id: 'mg-1' };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveOneCLI.mockReturnValue(false);
  mockGetPendingApproval.mockReturnValue(undefined);
  mockGetSession.mockReturnValue(undefined);
  mockGetApprovalHandler.mockReturnValue(undefined);
});

describe('handleApprovalsResponse', () => {
  it('returns true when resolveOneCLIApproval claims it', async () => {
    mockResolveOneCLI.mockReturnValue(true);
    const result = await handleApprovalsResponse(makePayload());
    expect(result).toBe(true);
    expect(mockGetPendingApproval).not.toHaveBeenCalled();
  });

  it('returns false when no pending approval found', async () => {
    mockGetPendingApproval.mockReturnValue(undefined);
    const result = await handleApprovalsResponse(makePayload());
    expect(result).toBe(false);
  });

  it('handles stale OneCLI row — deletes and returns true', async () => {
    mockGetPendingApproval.mockReturnValue(makeApproval({ action: 'onecli_credential' }));
    const result = await handleApprovalsResponse(makePayload());
    expect(result).toBe(true);
    expect(mockDeletePendingApproval).toHaveBeenCalledWith('q-1');
  });

  it('handles approval with no session_id — deletes and returns', async () => {
    mockGetPendingApproval.mockReturnValue(makeApproval({ session_id: null }));
    await handleApprovalsResponse(makePayload());
    expect(mockDeletePendingApproval).toHaveBeenCalledWith('q-1');
  });

  it('handles approval with session not found — deletes and returns', async () => {
    mockGetPendingApproval.mockReturnValue(makeApproval());
    mockGetSession.mockReturnValue(undefined);
    await handleApprovalsResponse(makePayload());
    expect(mockDeletePendingApproval).toHaveBeenCalledWith('q-1');
  });

  it('rejects approval — notifies agent and wakes container', async () => {
    const { wakeContainer } = await import('../../container-runner.js');
    const { writeSessionMessage } = await import('../../session-manager.js');
    mockGetPendingApproval.mockReturnValue(makeApproval());
    mockGetSession.mockReturnValue(makeSession());
    await handleApprovalsResponse(makePayload({ value: 'reject' }));
    expect(mockDeletePendingApproval).toHaveBeenCalledWith('q-1');
    expect(writeSessionMessage).toHaveBeenCalled();
    expect(wakeContainer).toHaveBeenCalled();
  });

  it('approved but no handler registered — notifies and wakes container', async () => {
    const { wakeContainer } = await import('../../container-runner.js');
    mockGetPendingApproval.mockReturnValue(makeApproval());
    mockGetSession.mockReturnValue(makeSession());
    mockGetApprovalHandler.mockReturnValue(undefined);
    await handleApprovalsResponse(makePayload({ value: 'approve' }));
    expect(mockDeletePendingApproval).toHaveBeenCalledWith('q-1');
    expect(wakeContainer).toHaveBeenCalled();
  });

  it('approved and handler registered — calls handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const { wakeContainer } = await import('../../container-runner.js');
    mockGetPendingApproval.mockReturnValue(makeApproval());
    mockGetSession.mockReturnValue(makeSession());
    mockGetApprovalHandler.mockReturnValue(handler);
    await handleApprovalsResponse(makePayload({ value: 'approve' }));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      session: expect.objectContaining({ id: 'sess-1' }),
      payload: { key: 'value' },
      userId: 'u-admin',
    }));
    expect(mockDeletePendingApproval).toHaveBeenCalledWith('q-1');
    expect(wakeContainer).toHaveBeenCalled();
  });

  it('approved handler throws — logs error, still deletes and wakes', async () => {
    const { log } = await import('../../log.js');
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    const { wakeContainer } = await import('../../container-runner.js');
    mockGetPendingApproval.mockReturnValue(makeApproval());
    mockGetSession.mockReturnValue(makeSession());
    mockGetApprovalHandler.mockReturnValue(handler);
    await handleApprovalsResponse(makePayload({ value: 'approve' }));
    expect(log.error).toHaveBeenCalled();
    expect(mockDeletePendingApproval).toHaveBeenCalledWith('q-1');
    expect(wakeContainer).toHaveBeenCalled();
  });
});
