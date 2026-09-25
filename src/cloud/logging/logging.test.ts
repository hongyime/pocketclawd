/**
 * Tests for cloud/logging/index.ts — redactSensitiveData and CloudWatchLogger.
 * Pure logic tests; no AWS SDK calls needed.
 */
import { describe, it, expect } from 'vitest';
import { redactSensitiveData, CloudWatchLogger, REDACTION_MASK } from './index.js';

describe('redactSensitiveData', () => {
  it('returns unchanged string when no sensitive data present', () => {
    expect(redactSensitiveData('hello world')).toBe('hello world');
  });

  it('redacts Bearer tokens', () => {
    const out = redactSensitiveData('Authorization: Bearer abc123.def456.ghi789');
    expect(out).toContain(`Bearer ${REDACTION_MASK}`);
    expect(out).not.toContain('abc123');
  });

  it('redacts sk- API keys', () => {
    const key = 'sk-abcdefghijklmnopqrstuvwxyz';
    const out = redactSensitiveData(`key=${key}`);
    expect(out).not.toContain(key);
    expect(out).toContain(REDACTION_MASK);
  });

  it('redacts AWS AKIA access keys', () => {
    const out = redactSensitiveData('AKIAIOSFODNN7EXAMPLE is the key');
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('redacts JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = redactSensitiveData(jwt);
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('redacts JSON password fields', () => {
    const out = redactSensitiveData('{"password":"supersecret123"}');
    expect(out).not.toContain('supersecret123');
    expect(out).toContain(REDACTION_MASK);
  });

  it('redacts JSON token fields', () => {
    const out = redactSensitiveData('{"token":"my-token-value"}');
    expect(out).not.toContain('my-token-value');
  });

  it('redacts key=value format passwords', () => {
    const out = redactSensitiveData('password=mysecret');
    expect(out).not.toContain('mysecret');
    expect(out).toContain(REDACTION_MASK);
  });

  it('redacts E.164 phone numbers', () => {
    const out = redactSensitiveData('Phone: +6584731565');
    expect(out).not.toContain('+6584731565');
  });

  it('redacts WhatsApp JIDs', () => {
    const out = redactSensitiveData('from: 6584731565@s.whatsapp.net');
    expect(out).not.toContain('6584731565@s.whatsapp.net');
  });

  it('redacts email addresses', () => {
    const out = redactSensitiveData('user@example.com logged in');
    expect(out).not.toContain('user@example.com');
  });

  it('preserves non-sensitive structure around redacted values', () => {
    const out = redactSensitiveData('{"user":"alice","password":"secret"}');
    expect(out).toContain('"user":"alice"');
    expect(out).toContain(REDACTION_MASK);
  });
});

describe('CloudWatchLogger', () => {
  it('constructs with defaults', () => {
    expect(() => new CloudWatchLogger()).not.toThrow();
  });

  it('log() returns a LogEntry with correct level and message', () => {
    const logger = new CloudWatchLogger();
    const entry = logger.log('INFO', 'test message');
    expect(entry.level).toBe('INFO');
    expect(entry.message).toBe('test message');
    expect(entry.timestamp).toBeTruthy();
  });

  it('log() redacts sensitive data in message', () => {
    const logger = new CloudWatchLogger();
    const entry = logger.log('INFO', 'Bearer sometoken123');
    expect(entry.message).not.toContain('sometoken123');
    expect(entry.message).toContain(REDACTION_MASK);
  });

  it('log() redacts sensitive data in context', () => {
    const logger = new CloudWatchLogger();
    const entry = logger.log('INFO', 'msg', { password: 'secret' });
    expect(JSON.stringify(entry.context)).not.toContain('secret');
  });

  it('info() delegates to log with INFO level', () => {
    const logger = new CloudWatchLogger();
    const entry = logger.info('info msg');
    expect(entry.level).toBe('INFO');
    expect(entry.message).toBe('info msg');
  });

  it('warn() delegates to log with WARNING level', () => {
    const logger = new CloudWatchLogger();
    const entry = logger.warn('warn msg');
    expect(entry.level).toBe('WARNING');
  });

  it('error() delegates to log with ERROR level', () => {
    const logger = new CloudWatchLogger();
    const entry = logger.error('error msg');
    expect(entry.level).toBe('ERROR');
  });

  it('log() omits context when not provided', () => {
    const logger = new CloudWatchLogger();
    const entry = logger.log('INFO', 'no context');
    expect(entry.context).toBeUndefined();
  });

  it('accepts config overrides', () => {
    expect(() => new CloudWatchLogger({ region: 'us-east-1', maxBufferSize: 50 })).not.toThrow();
  });
});
