export interface HybridQueuePluginOptions {
  /**
   * Database file path for SQLite storage
   * @default './queue.sqlite'
   */
  databasePath?: string;

  /**
   * Route prefix for all queue management endpoints
   * @default '/queue'
   */
  routePrefix?: string;

  /**
   * Enable or disable the admin UI
   * @default true
   */
  enableAdminUI?: boolean;

  /**
   * Enable or disable API endpoints
   * @default true
   */
  enableAPI?: boolean;

  /**
   * Cleanup configuration
   */
  cleanup?: {
    /**
     * Enable automatic cleanup
     * @default true
     */
    enabled?: boolean;

    /**
     * Cleanup interval in minutes
     * @default 60 (1 hour)
     */
    intervalMinutes?: number;

    /**
     * Retention period for completed jobs in hours
     * @default 24
     */
    retentionCompletedHours?: number;

    /**
     * Retention period for failed jobs in hours
     * @default 168 (7 days)
     */
    retentionFailedHours?: number;

    /**
     * Enable dry run mode (log what would be deleted without actually deleting)
     * @default false
     */
    dryRun?: boolean;

    /**
     * Batch size for cleanup operations
     * @default 1000
     */
    batchSize?: number;
  };

  /**
   * Queue configuration
   */
  queue?: {
    /**
     * Default polling interval in milliseconds
     * @default 1000
     */
    pollingInterval?: number;

    /**
     * Maximum number of retry attempts
     * @default 3
     */
    maxRetries?: number;

    /**
     * Retry delay in milliseconds
     * @default 5000
     */
    retryDelay?: number;
  };

  /**
   * CORS configuration for API endpoints
   */
  cors?: {
    /**
     * Allowed origins
     * @default ['*']
     */
    origin?: string | string[];

    /**
     * Allowed methods
     * @default ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
     */
    methods?: string[];

    /**
     * Allowed headers
     * @default ['Content-Type', 'Authorization']
     */
    headers?: string[];
  };

  /**
   * Authentication configuration for admin interface
   */
  auth?: {
    /**
     * Enable authentication for admin interface
     * @default false
     */
    enabled?: boolean;

    /**
     * Admin key required for login (required when auth is enabled)
     */
    adminKey?: string;

    /**
     * Session timeout in milliseconds
     * @default 3600000 (1 hour)
     */
    sessionTimeout?: number;
  };
}

export interface QueueStats {
  total: number;
  waiting: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface CleanupStats {
  totalJobsCleaned: number;
  completedJobsCleaned: number;
  failedJobsCleaned: number;
  queuesCleaned: string[];
  duration: number;
  timestamp: string;
}

export interface CleanupResult {
  success: boolean;
  stats: CleanupStats;
  dryRun: boolean;
  errors: string[];
}

export interface Job {
  id: string;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  data: JobData;
  created_at: string;
  updated_at: string;
  attempts: number;
  error?: string;
}

export interface JobData {
  [key: string]: any;
}

export interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}