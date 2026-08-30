import type { Logger } from './logger.js';

export interface WorkerHeartbeat {
  start(): void;
  stop(): void;
  emit(): void;
  recordClaimed(): void;
  recordCompleted(): void;
  recordFailed(): void;
  recordRetryScheduled(): void;
}

interface HeartbeatTimer {
  now(): Date;
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface WorkerHeartbeatDependencies {
  logger: Logger;
  workerId: string;
  analysisProvider: string;
  intervalMs: number;
  timer?: HeartbeatTimer;
}

const systemTimer: HeartbeatTimer = {
  now: () => new Date(),
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export const createWorkerHeartbeat = ({ logger, workerId, analysisProvider, intervalMs, timer = systemTimer }: WorkerHeartbeatDependencies): WorkerHeartbeat => {
  const state: Record<string, Date | undefined> = { startedAt: timer.now() };
  let intervalHandle: unknown;

  const emit = () => {
    logger.info('Worker heartbeat', {
      workerId,
      status: 'alive',
      analysisProvider,
      startedAt: state.startedAt?.toISOString(),
      ...(state.lastClaimedJobAt ? { lastClaimedJobAt: state.lastClaimedJobAt.toISOString() } : {}),
      ...(state.lastCompletedJobAt ? { lastCompletedJobAt: state.lastCompletedJobAt.toISOString() } : {}),
      ...(state.lastFailedJobAt ? { lastFailedJobAt: state.lastFailedJobAt.toISOString() } : {}),
      ...(state.lastRetryScheduledAt ? { lastRetryScheduledAt: state.lastRetryScheduledAt.toISOString() } : {}),
    });
  };

  const record = (field: string) => { state[field] = timer.now(); };

  return {
    start: () => {
      if (intervalHandle !== undefined) return;
      intervalHandle = timer.setInterval(emit, intervalMs);
    },
    stop: () => {
      if (intervalHandle === undefined) return;
      timer.clearInterval(intervalHandle);
      intervalHandle = undefined;
    },
    emit,
    recordClaimed: () => record('lastClaimedJobAt'),
    recordCompleted: () => record('lastCompletedJobAt'),
    recordFailed: () => record('lastFailedJobAt'),
    recordRetryScheduled: () => record('lastRetryScheduledAt'),
  };
};
