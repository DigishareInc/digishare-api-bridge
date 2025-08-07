import type { HybridQueuePluginOptions } from './types';

export const defaultOptions: Required<HybridQueuePluginOptions> = {
  databasePath: './queue.sqlite',
  routePrefix: '/queue',
  enableAdminUI: true,
  enableAPI: true,
  cleanup: {
      enabled: true,
      intervalMinutes: 60, // 1 hour
      retentionCompletedHours: 24,
      retentionFailedHours: 168, // 7 days
      dryRun: false,
      batchSize: 1000,
    },
  queue: {
    pollingInterval: 1000,
    maxRetries: 3,
    retryDelay: 5000,
  },
  cors: {
    origin: ['*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization'],
  },
};

/**
 * Merges user options with default options
 */
export function mergeOptions(userOptions: HybridQueuePluginOptions = {}): Required<HybridQueuePluginOptions> {
  return {
    ...defaultOptions,
    ...userOptions,
    cleanup: {
      ...defaultOptions.cleanup,
      ...userOptions.cleanup,
    },
    queue: {
      ...defaultOptions.queue,
      ...userOptions.queue,
    },
    cors: {
      ...defaultOptions.cors,
      ...userOptions.cors,
    },
  };
}

/**
 * Validates plugin options
 */
export function validateOptions(options: Required<HybridQueuePluginOptions>): void {
  if (!options.databasePath || typeof options.databasePath !== 'string') {
    throw new Error('databasePath must be a non-empty string');
  }

  if (!options.routePrefix || typeof options.routePrefix !== 'string') {
    throw new Error('routePrefix must be a non-empty string');
  }

  if (!options.routePrefix.startsWith('/')) {
    throw new Error('routePrefix must start with "/"');
  }

  if (options.cleanup.intervalMinutes !== undefined && options.cleanup.intervalMinutes < 1) {
    throw new Error('cleanup.intervalMinutes must be at least 1');
  }

  if (options.cleanup.retentionCompletedHours !== undefined && options.cleanup.retentionCompletedHours < 1) {
    throw new Error('cleanup.retentionCompletedHours must be at least 1');
  }

  if (options.cleanup.retentionFailedHours !== undefined && options.cleanup.retentionFailedHours < 1) {
    throw new Error('cleanup.retentionFailedHours must be at least 1');
  }

  if (options.cleanup.batchSize !== undefined && (options.cleanup.batchSize < 1 || options.cleanup.batchSize > 10000)) {
    throw new Error('cleanup.batchSize must be between 1 and 10000');
  }

  if (options.queue.pollingInterval !== undefined && options.queue.pollingInterval < 100) {
    throw new Error('queue.pollingInterval must be at least 100ms');
  }

  if (options.queue.maxRetries !== undefined && options.queue.maxRetries < 0) {
    throw new Error('queue.maxRetries must be non-negative');
  }

  if (options.queue.retryDelay !== undefined && options.queue.retryDelay < 0) {
    throw new Error('queue.retryDelay must be non-negative');
  }
}