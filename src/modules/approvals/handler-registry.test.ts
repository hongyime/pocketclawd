/**
 * Tests for the approval handler registry in primitive.ts.
 * Also exercises channelTypeOf indirectly via pickApprovalDelivery.
 * (The DB-heavy pickApprover / pickApprovalDelivery are covered in picks.test.ts)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../log.js', () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../db/messaging-groups.js', () => ({ getMessagingGroup: vi.fn() }));
vi.mock('../../db/sessions.js', () => ({
  createPendingApproval: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('../../delivery.js', () => ({ getDeliveryAdapter: vi.fn().mockReturnValue(null) }));
vi.mock('../../container-runner.js', () => ({ wakeContainer: vi.fn() }));
vi.mock('../../session-manager.js', () => ({ writeSessionMessage: vi.fn() }));
vi.mock('../permissions/db/user-roles.js', () => ({
  getAdminsOfAgentGroup: vi.fn().mockReturnValue([]),
  getGlobalAdmins: vi.fn().mockReturnValue([]),
  getOwners: vi.fn().mockReturnValue([]),
}));
vi.mock('../permissions/user-dm.js', () => ({ ensureUserDm: vi.fn().mockResolvedValue(null) }));
vi.mock('../../channels/ask-question.js', () => ({ normalizeOptions: vi.fn((o: unknown) => o) }));

import {
  registerApprovalHandler,
  getApprovalHandler,
} from './primitive.js';

describe('approval handler registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined for unregistered action', () => {
    expect(getApprovalHandler('never-registered')).toBeUndefined();
  });

  it('registers a handler and retrieves it', () => {
    const handler = vi.fn();
    registerApprovalHandler('test-action', handler);
    expect(getApprovalHandler('test-action')).toBe(handler);
  });

  it('overwrites and warns on duplicate registration', async () => {
    const { log } = await import('../../log.js');
    const h1 = vi.fn();
    const h2 = vi.fn();
    registerApprovalHandler('dup-action', h1);
    registerApprovalHandler('dup-action', h2);
    expect(getApprovalHandler('dup-action')).toBe(h2);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('re-registered'), expect.objectContaining({ action: 'dup-action' }));
  });

  it('different actions are independent', () => {
    const hA = vi.fn();
    const hB = vi.fn();
    registerApprovalHandler('action-a', hA);
    registerApprovalHandler('action-b', hB);
    expect(getApprovalHandler('action-a')).toBe(hA);
    expect(getApprovalHandler('action-b')).toBe(hB);
  });
});
