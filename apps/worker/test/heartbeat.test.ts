import { describe, expect, it, vi } from 'vitest';

import { createWorkerHeartbeat } from '../src/heartbeat';
import type { Logger } from '../src/logger';

const createLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}) satisfies Logger;

describe('worker heartbeat', () => {
  it('emits only safe structured lifecycle fields', () => {
    const logger = createLogger();
    const now = vi.fn(() => new Date('2026-08-30T12:00:00.000Z'));
    const heartbeat = createWorkerHeartbeat({
      logger,
      workerId: 'worker-1',
      analysisProvider: 'gemini',
      intervalMs: 60_000,
      timer: { now, setInterval: vi.fn(() => 'interval'), clearInterval: vi.fn() },
    });

    heartbeat.recordClaimed();
    heartbeat.recordCompleted();
    heartbeat.recordRetryScheduled();
    heartbeat.emit();

    expect(logger.info).toHaveBeenCalledWith('Worker heartbeat', expect.objectContaining({
      workerId: 'worker-1',
      status: 'alive',
      analysisProvider: 'gemini',
      lastClaimedJobAt: '2026-08-30T12:00:00.000Z',
      lastCompletedJobAt: '2026-08-30T12:00:00.000Z',
      lastRetryScheduledAt: '2026-08-30T12:00:00.000Z',
    }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('GEMINI_API_KEY');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('document text');
  });

  it('uses the configured interval without starting real timers in tests', () => {
    const logger = createLogger();
    const setInterval = vi.fn(() => 'interval');
    const clearInterval = vi.fn();
    const heartbeat = createWorkerHeartbeat({
      logger,
      workerId: 'worker-1',
      analysisProvider: 'deterministic',
      intervalMs: 1234,
      timer: { now: () => new Date('2026-08-30T12:00:00.000Z'), setInterval, clearInterval },
    });

    heartbeat.start();
    heartbeat.start();
    heartbeat.stop();

    expect(setInterval).toHaveBeenCalledOnce();
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1234);
    expect(clearInterval).toHaveBeenCalledWith('interval');
  });
});
