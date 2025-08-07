// Elysia Hybrid Queue Plugin API Types

// Queue Job Types
export interface QueueJob {
  id: string;
  type: string;
  data: any;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  attempts: number;
  createdAt: string;
  processedAt?: string;
  error?: string;
}

// Queue Information
export interface QueueInfo {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface QueueListResponse extends ApiResponse {
  queues: QueueInfo[];
}

export interface QueueJobsResponse extends ApiResponse {
  queueName: string;
  jobs: QueueJob[];
}

export interface JobActionResponse extends ApiResponse {
  message: string;
}

// Cleanup Types
export interface CleanupConfig {
  retentionCompletedHours: number;
  retentionFailedHours: number;
  batchSize: number;
  intervalMinutes: number;
}

export interface CleanupStatus extends ApiResponse {
  enabled: boolean;
  dryRun: boolean;
  lastRun?: string;
  nextRun?: string;
  config: CleanupConfig;
}

export interface CleanupStats {
  deletedJobs: number;
  processedQueues: number;
  duration: number;
  dryRun: boolean;
}

export interface CleanupResult extends ApiResponse {
  result: CleanupStats;
}

export interface QueueCleanupStats {
  queueName: string;
  oldCompletedJobs: number;
  oldFailedJobs: number;
  totalOldJobs: number;
}

export interface CleanupStatsResponse extends ApiResponse {
  queueStats: QueueCleanupStats[];
}

export interface OldJobsResponse extends ApiResponse {
  queueName: string;
  status: string;
  olderThanHours: number;
  oldJobs: QueueJob[];
}

// Plugin Configuration Types
export interface HybridQueuePluginOptions {
  prefix?: string;
  databasePath?: string;
  cleanup?: {
    enabled?: boolean;
    retentionCompletedHours?: number;
    retentionFailedHours?: number;
    batchSize?: number;
    intervalMinutes?: number;
    dryRun?: boolean;
  };
  adminUI?: {
    enabled?: boolean;
    path?: string;
  };
}

// Query Parameters
export interface GetJobsQuery {
  status?: 'waiting' | 'active' | 'completed' | 'failed';
  limit?: number;
}

export interface TriggerCleanupQuery {
  dryRun?: boolean;
}

export interface GetOldJobsQuery {
  status?: 'completed' | 'failed';
  hours?: number;
  limit?: number;
}

// Path Parameters
export interface QueueParams {
  name: string;
}

export interface JobParams extends QueueParams {
  id: string;
}