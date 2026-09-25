/**
 * Tests for src/db/sessions.ts — Session CRUD, PendingQuestion, PendingApproval,
 * and getAskQuestionRender. Uses real in-memory test DB + migrations.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestDb, closeDb, createAgentGroup, createMessagingGroup } from './index.js';
import { runMigrations } from './migrations/index.js';
import {
  createSession,
  getSession,
  findSession,
  findSessionByAgentGroup,
  findSessionForAgent,
  getSessionsByAgentGroup,
  getActiveSessions,
  getRunningSessions,
  updateSession,
  deleteSession,
  createPendingQuestion,
  getPendingQuestion,
  deletePendingQuestion,
  createPendingApproval,
  getPendingApproval,
  updatePendingApprovalStatus,
  deletePendingApproval,
  getPendingApprovalsByAction,
  getAskQuestionRender,
} from './sessions.js';
import type { Session, PendingApproval } from '../types.js';

function now() { return new Date().toISOString(); }
let _sessCounter = 0;

function makeSession(overrides?: Partial<Session>): Session {
  const id = `sess-${++_sessCounter}`;
  return {
    id,
    agent_group_id: 'ag-1',
    messaging_group_id: 'mg-1',
    thread_id: null,
    agent_provider: null,
    status: 'active',
    container_status: 'idle',
    last_active: now(),
    created_at: now(),
    ...overrides,
  } as Session;
}

beforeEach(() => {
  _sessCounter = 0; // reset counter so session IDs are predictable per test
  const db = initTestDb();
  runMigrations(db);
  // seed a group + messaging group for FK constraints
  createAgentGroup({ id: 'ag-1', name: 'Test', folder: 'test', agent_provider: null, created_at: now() });
  createMessagingGroup({
    id: 'mg-1', channel_type: 'telegram', platform_id: '111',
    name: null, is_group: 0, unknown_sender_policy: 'allow', created_at: now(), updated_at: now(),
  } as never);
});

afterEach(() => { closeDb(); });

describe('createSession + getSession', () => {
  it('returns undefined for unknown id', () => {
    expect(getSession('nope')).toBeUndefined();
  });

  it('creates and retrieves a session', () => {
    createSession(makeSession());
    const s = getSession('sess-1');
    expect(s?.id).toBe('sess-1');
    expect(s?.status).toBe('active');
  });
});

describe('findSession', () => {
  it('returns undefined when no matching active session', () => {
    expect(findSession('mg-1', null)).toBeUndefined();
  });

  it('finds session without thread_id', () => {
    createSession(makeSession({ thread_id: null }));
    const s = findSession('mg-1', null);
    expect(s?.id).toBe('sess-1');
  });

  it('finds session with thread_id', () => {
    createSession(makeSession({ thread_id: 'thread-x' }));
    const s = findSession('mg-1', 'thread-x');
    expect(s?.id).toBe('sess-1');
  });

  it('does not return inactive session', () => {
    createSession(makeSession({ status: 'ended' }));
    expect(findSession('mg-1', null)).toBeUndefined();
  });
});

describe('findSessionForAgent', () => {
  it('returns undefined when no match', () => {
    expect(findSessionForAgent('ag-1', 'mg-1', null)).toBeUndefined();
  });

  it('finds by agent group + messaging group', () => {
    createSession(makeSession());
    const s = findSessionForAgent('ag-1', 'mg-1', null);
    expect(s?.id).toBe('sess-1');
  });

  it('finds with thread_id', () => {
    createSession(makeSession({ thread_id: 't1' }));
    const s = findSessionForAgent('ag-1', 'mg-1', 't1');
    expect(s?.id).toBe('sess-1');
  });
});

describe('findSessionByAgentGroup', () => {
  it('returns undefined when no active session', () => {
    expect(findSessionByAgentGroup('ag-1')).toBeUndefined();
  });

  it('returns most-recent active session', () => {
    createSession(makeSession({ id: 'sess-old', created_at: '2024-01-01T00:00:00Z' }));
    createSession(makeSession({ id: 'sess-new', created_at: '2024-06-01T00:00:00Z' }));
    const s = findSessionByAgentGroup('ag-1');
    expect(s?.id).toBe('sess-new');
  });
});

describe('getSessionsByAgentGroup', () => {
  it('returns empty array initially', () => {
    expect(getSessionsByAgentGroup('ag-1')).toEqual([]);
  });

  it('returns all sessions for agent group', () => {
    createSession(makeSession());
    createSession(makeSession({ status: 'ended' }));
    expect(getSessionsByAgentGroup('ag-1').length).toBe(2);
  });
});

describe('getActiveSessions', () => {
  it('returns only active sessions', () => {
    createSession(makeSession({ status: 'active' }));
    createSession(makeSession({ status: 'ended' }));
    const active = getActiveSessions();
    expect(active.every(s => s.status === 'active')).toBe(true);
    expect(active.length).toBe(1);
  });
});

describe('getRunningSessions', () => {
  it('returns sessions with running or idle container status', () => {
    createSession(makeSession({ container_status: 'running' }));
    createSession(makeSession({ container_status: 'idle' }));
    createSession(makeSession({ container_status: 'stopped' }));
    const running = getRunningSessions();
    expect(running.length).toBe(2);
  });
});

describe('updateSession', () => {
  it('updates status', () => {
    createSession(makeSession());
    updateSession('sess-1', { status: 'ended' });
    expect(getSession('sess-1')?.status).toBe('ended');
  });

  it('is a no-op when updates is empty', () => {
    createSession(makeSession());
    updateSession('sess-1', {});
    expect(getSession('sess-1')?.status).toBe('active');
  });

  it('throws on invalid column', () => {
    createSession(makeSession());
    expect(() => updateSession('sess-1', { bad_col: 'x' } as never)).toThrow('Invalid updatable column');
  });
});

describe('deleteSession', () => {
  it('deletes a session', () => {
    createSession(makeSession());
    deleteSession('sess-1');
    expect(getSession('sess-1')).toBeUndefined();
  });
});

describe('PendingQuestion', () => {
  it('returns undefined for unknown question', () => {
    expect(getPendingQuestion('q-nope')).toBeUndefined();
  });

  it('createPendingQuestion returns true on insert', () => {
    createSession(makeSession());
    const ok = createPendingQuestion({
      question_id: 'q-1',
      session_id: 'sess-1',
      message_out_id: 'msg-1',
      platform_id: '111',
      channel_type: 'telegram',
      thread_id: null,
      title: 'Choose',
      options: [{ label: 'Yes', value: 'yes', selectedLabel: 'Yes' }],
      created_at: now(),
    } as never);
    expect(ok).toBe(true);
  });

  it('createPendingQuestion is idempotent (returns false on dup)', () => {
    createSession(makeSession());
    const pq = {
      question_id: 'q-2', session_id: 'sess-1', message_out_id: 'm1',
      platform_id: '111', channel_type: 'telegram', thread_id: null,
      title: 'Q', options: [], created_at: now(),
    } as never;
    createPendingQuestion(pq);
    expect(createPendingQuestion(pq)).toBe(false);
  });

  it('getPendingQuestion returns parsed options', () => {
    createSession(makeSession());
    const opts = [{ label: 'A', value: 'a', selectedLabel: 'A' }];
    createPendingQuestion({
      question_id: 'q-3', session_id: 'sess-1', message_out_id: 'm1',
      platform_id: '111', channel_type: 'telegram', thread_id: null,
      title: 'Pick', options: opts, created_at: now(),
    } as never);
    const q = getPendingQuestion('q-3');
    expect(q?.options).toEqual(opts);
  });

  it('deletePendingQuestion removes it', () => {
    createSession(makeSession());
    createPendingQuestion({
      question_id: 'q-4', session_id: 'sess-1', message_out_id: 'm1',
      platform_id: '111', channel_type: 'telegram', thread_id: null,
      title: 'T', options: [], created_at: now(),
    } as never);
    deletePendingQuestion('q-4');
    expect(getPendingQuestion('q-4')).toBeUndefined();
  });
});

describe('PendingApproval', () => {
  function makeApproval(id: string): Parameters<typeof createPendingApproval>[0] {
    return {
      approval_id: id,
      request_id: id,
      action: 'test-action',
      payload: '{}',
      created_at: now(),
      title: 'Approve this?',
      options_json: '[]',
    };
  }

  it('returns undefined for unknown approval', () => {
    expect(getPendingApproval('a-nope')).toBeUndefined();
  });

  it('creates and retrieves approval', () => {
    createPendingApproval(makeApproval('a-1'));
    const a = getPendingApproval('a-1');
    expect(a?.approval_id).toBe('a-1');
    expect(a?.status).toBe('pending');
  });

  it('is idempotent', () => {
    const a = makeApproval('a-dup');
    createPendingApproval(a);
    expect(createPendingApproval(a)).toBe(false);
  });

  it('updatePendingApprovalStatus changes status', () => {
    createPendingApproval(makeApproval('a-2'));
    updatePendingApprovalStatus('a-2', 'approved');
    expect(getPendingApproval('a-2')?.status).toBe('approved');
  });

  it('deletePendingApproval removes it', () => {
    createPendingApproval(makeApproval('a-3'));
    deletePendingApproval('a-3');
    expect(getPendingApproval('a-3')).toBeUndefined();
  });

  it('getPendingApprovalsByAction filters by action', () => {
    createPendingApproval(makeApproval('a-4'));
    createPendingApproval({ ...makeApproval('a-5'), action: 'other' });
    const rows = getPendingApprovalsByAction('test-action');
    expect(rows.every(r => r.action === 'test-action')).toBe(true);
    expect(rows.length).toBe(1);
  });
});

describe('getAskQuestionRender', () => {
  it('returns undefined for unknown id', () => {
    expect(getAskQuestionRender('nope')).toBeUndefined();
  });

  it('returns question render for pending_question id', () => {
    createSession(makeSession());
    createPendingQuestion({
      question_id: 'qr-1', session_id: 'sess-1', message_out_id: 'm1',
      platform_id: '111', channel_type: 'telegram', thread_id: null,
      title: 'QTitle', options: [{ label: 'X', value: 'x', selectedLabel: 'X' }],
      created_at: now(),
    } as never);
    const render = getAskQuestionRender('qr-1');
    expect(render?.title).toBe('QTitle');
    expect(render?.options[0].value).toBe('x');
  });

  it('returns approval render for pending_approval id', () => {
    createPendingApproval({
      approval_id: 'ar-1', request_id: 'ar-1',
      action: 'a', payload: '{}', created_at: now(),
      title: 'ATitle', options_json: '[{"label":"A","value":"a","selectedLabel":"A"}]',
    });
    const render = getAskQuestionRender('ar-1');
    expect(render?.title).toBe('ATitle');
  });
});
