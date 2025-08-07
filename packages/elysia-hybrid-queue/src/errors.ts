/**
 * Custom error classes for the Hybrid Queue plugin
 */

export class HybridQueuePluginError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'HybridQueuePluginError';
  }
}

export class ConfigurationError extends HybridQueuePluginError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class QueueOperationError extends HybridQueuePluginError {
  constructor(message: string, public queueName?: string) {
    super(message, 'QUEUE_OPERATION_ERROR');
    this.name = 'QueueOperationError';
  }
}

export class CleanupError extends HybridQueuePluginError {
  constructor(message: string) {
    super(message, 'CLEANUP_ERROR');
    this.name = 'CleanupError';
  }
}

/**
 * Error response helper for API endpoints
 */
export function createErrorResponse(error: unknown, context?: string) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const errorCode = error instanceof HybridQueuePluginError ? error.code : 'UNKNOWN_ERROR';
  
  return {
    success: false,
    error: message,
    code: errorCode,
    context
  };
}

/**
 * Safe error handler that ensures errors don't crash the application
 */
export function safeErrorHandler<T>(
  operation: () => T,
  fallback: T,
  context?: string
): T {
  try {
    return operation();
  } catch (error) {
    console.error(`Error in ${context || 'operation'}:`, error);
    return fallback;
  }
}

/**
 * Async safe error handler
 */
export async function safeAsyncErrorHandler<T>(
  operation: () => Promise<T>,
  fallback: T,
  context?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`Error in ${context || 'async operation'}:`, error);
    return fallback;
  }
}