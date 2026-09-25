/**
 * Additional tests for modules/approvals/primitive.ts —
 * notifyAgent and requestApproval code paths not covered by picks.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../log.js', () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../db/messaging-groups.js', () => ({ getMessagingGroup: vi.fn().mockReturnValue(null) }));
vi.mock('../../db/sessions.js', () => ({ createPendingApproval: vi.fn().mockReturnValue(true), getSession: vi.fn().mockReturnValue(null) }));
vi.mock('../../delivery.js', () => ({ getDeliveryAdapter: vi.fn().mockReturnValue(null) }));
vi.mock('../../container-runner.js', () => ({ wakeContainer: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../session-manager.js', () => ({ writeSessionMessage: vi.fn() }));
vi.mock('../permissions/db/user-roles.js', () => ({
  getAdminsOfAgentGroup: vi.fn().mockReturnValue([]),
  getGlobalAdmins: vi.fn().mockReturnValue([]),
  getOwners: vi.fn().mockReturnValue([]),
}));
vi.mock('../permissions/user-dm.js', () => ({ ensureUserDm: vi.fn().mockResolvedValue(null) }));
vi.mock('../../channels/ask-question.js', () => ({ normalizeOptions: vi.fn((o: unknown) => o) }));

import { notifyAgent, requestApproval } from './primitive.js';
import type { Session } from '../../types.js';

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 'sess-1',
    agent_group_id: 'ag-1',
    messaging_group_id: 'mg-1',
    thread_id: null,
    agent_provider: null,
    status: 'active',
    container_status: 'idle',
    last_active: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  } as Session;
}

describe('notifyAgent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls writeSessionMessage with agent channel message', async () => {
    const { writeSessionMessage } = await import('../../session-manager.js');
    notifyAgent(makeSession(), 'hello agent');
    expect(writeSessionMessage).toHaveBeenCalledWith(
      'ag-1',
      'sess-1',
      expect.objectContaining({ kind: 'chat', channelType: 'agent' }),
    );
  });

  it('does not call wakeContainer when session no longer in DB', async () => {
    const { wakeContainer } = await import('../../container-runner.js');
    const { getSession } = await import('../../db/sessions.js');
    vi.mocked(getSession).mockReturnValue(undefined);
    notifyAgent(makeSession(), 'text');
    expect(wakeContainer).not.toHaveBeenCalled();
  });

  it('calls wakeContainer when session still in DB', async () => {
    const { wakeContainer } = await import('../../container-runner.js');
    const { getSession } = await import('../../db/sessions.js');
    vi.mocked(getSession).mockReturnValue(makeSession());
    notifyAgent(makeSession(), 'text');
    // wakeContainer is called async — just verify no throw
    await Promise.resolve();
    expect(wakeContainer).toHaveBeenCalled();
  });
});

describe('requestApproval', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notifies agent and returns early when no approvers configured', async () => {
    const { writeSessionMessage } = await import('../../session-manager.js');
    await requestApproval({
      session: makeSession(),
      agentName: 'bot',
      action: 'test-action',
      payload: {},
      title: 'T',
      question: 'Q',
    });
    // notifyAgent was called (no approver path)
    expect(writeSessionMessage).toHaveBeenCalled();
  });

  it('notifies agent when no DM channel found for any approver', async () => {
    const { getOwners } = await import('../permissions/db/user-roles.js');
    vi.mocked(getOwners).mockReturnValue([{ user_id: 'owner-1', role: 'owner', agent_group_id: null, granted_by: null, granted_at: '' }]);
    const { ensureUserDm } = await import('../permissions/user-dm.js');
    vi.mocked(ensureUserDm).mockResolvedValue(null);
    const { writeSessionMessage } = await import('../../session-manager.js');
    await requestApproval({
      session: makeSession(),
      agentName: 'bot',
      action: 'test-action',
      payload: {},
      title: 'T',
      question: 'Q',
    });
    expect(writeSessionMessage).toHaveBeenCalled();
  });
});
