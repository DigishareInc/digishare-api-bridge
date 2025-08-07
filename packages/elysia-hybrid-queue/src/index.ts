import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { Queue } from 'hybrid-queue';
import { HybridQueuePluginOptions } from './types';
import { mergeOptions, validateOptions } from './config';
import { logger } from './logger';
import { CleanupService } from './cleanup';
import { 
  ConfigurationError, 
  QueueOperationError, 
  CleanupError,
  createErrorResponse} from './errors';

// Global cleanup service instance
let cleanupService: CleanupService | null = null;

/**
 * Get the global cleanup service instance
 */
function getCleanupService(): CleanupService | null {
  return cleanupService;
}

/**
 * Create and configure the Elysia Hybrid Queue plugin
 */
export function hybridQueue(userOptions: Partial<HybridQueuePluginOptions> = {}) {
  let options: Required<HybridQueuePluginOptions>;
  
  try {
     options = mergeOptions(userOptions);
     validateOptions(options);
   } catch (error) {
     throw new ConfigurationError(
       `Invalid plugin configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
     );
   }

  return new Elysia({ name: 'hybrid-queue' })
    .use(cors(options.cors))
    .onStart(async () => {
      logger.info('Initializing Hybrid Queue plugin', {
        databasePath: options.databasePath,
        routePrefix: options.routePrefix,
        enableAdminUI: options.enableAdminUI,
        enableAPI: options.enableAPI
      });

      // Initialize cleanup service if enabled
      if (options.cleanup.enabled) {
        cleanupService = new CleanupService({
          databasePath: options.databasePath,
          intervalMinutes: options.cleanup.intervalMinutes!,
          retentionCompletedHours: options.cleanup.retentionCompletedHours!,
          retentionFailedHours: options.cleanup.retentionFailedHours!,
          dryRun: options.cleanup.dryRun!,
          batchSize: options.cleanup.batchSize!
        });
        
        await cleanupService.start();
        logger.info('Cleanup service started');
      }
    })
    .onStop(async () => {
      logger.info('Shutting down Hybrid Queue plugin');
      
      if (cleanupService) {
        await cleanupService.stop();
        cleanupService = null;
        logger.info('Cleanup service stopped');
      }
    })
    .group(options.routePrefix, (app) => {
      let groupedApp = app;

      // Add admin UI if enabled
      if (options.enableAdminUI) {
        groupedApp = groupedApp
          .get('/admin', () => {
            return new Response(
              getAdminHTML(options.routePrefix),
              {
                headers: {
                  'Content-Type': 'text/html'
                }
              }
            );
          });
      }

      // Add API endpoints if enabled
      if (options.enableAPI) {
        groupedApp = groupedApp.group('/api', (api) => {
          return api
            // Get all queues and their stats
            .get('/queues', () => {
              try {
                const queueNames = Queue.getAllQueueNames();
                const queues = queueNames.map(name => {
                  const queue = new Queue(name);
                  try {
                    const stats = queue.getStats();
                    return {
                      name,
                      ...stats
                    };
                  } finally {
                    queue.close();
                  }
                });

                return {
                  success: true,
                  queues
                };
              } catch (error) {
                return {
                  success: false,
                  queues: [],
                  error: error instanceof Error ? error.message : 'Unknown error'
                };
              }
            }, {
              detail: {
                tags: ['Queue Management'],
                summary: 'Get All Queues',
                description: 'Retrieve statistics for all available queues',
                responses: {
                  200: {
                    description: 'Successfully retrieved queue statistics',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            success: { type: 'boolean' },
                            queues: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  name: { type: 'string' },
                                  waiting: { type: 'number' },
                                  active: { type: 'number' },
                                  completed: { type: 'number' },
                                  failed: { type: 'number' },
                                  total: { type: 'number' }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
            
            // Get jobs for a specific queue
            .get('/queues/:name/jobs', ({ params, query }: { params: any; query: any }) => {
              try {
                const { name } = params;
                const status = query.status as string;
                const limit = query.limit ? parseInt(query.limit as string) : 100;
                
                if (!name || typeof name !== 'string') {
                  throw new QueueOperationError('Queue name is required', name);
                }
                
                const queue = new Queue(name);
                try {
                  const jobs = queue.getJobs(status as any, limit);
                  return {
                    success: true,
                    queueName: name,
                    jobs
                  };
                } finally {
                  queue.close();
                }
              } catch (error) {
                return createErrorResponse(error, 'get-jobs');
              }
            }, {
              detail: {
                tags: ['Queue Management'],
                summary: 'Get Queue Jobs',
                description: 'Retrieve jobs for a specific queue with optional filtering',
                parameters: [
                  {
                    name: 'name',
                    in: 'path',
                    required: true,
                    description: 'Queue name',
                    schema: { type: 'string' }
                  },
                  {
                    name: 'status',
                    in: 'query',
                    required: false,
                    description: 'Filter jobs by status (waiting, active, completed, failed)',
                    schema: { type: 'string', enum: ['waiting', 'active', 'completed', 'failed'] }
                  },
                  {
                    name: 'limit',
                    in: 'query',
                    required: false,
                    description: 'Maximum number of jobs to return',
                    schema: { type: 'integer', default: 100 }
                  }
                ],
                responses: {
                  200: {
                    description: 'Successfully retrieved jobs',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            success: { type: 'boolean' },
                            queueName: { type: 'string' },
                            jobs: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string' },
                                  type: { type: 'string' },
                                  data: { type: 'object' },
                                  status: { type: 'string' },
                                  attempts: { type: 'number' },
                                  createdAt: { type: 'string' },
                                  processedAt: { type: 'string', nullable: true },
                                  error: { type: 'string', nullable: true }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  400: {
                    description: 'Invalid queue name or parameters'
                  }
                }
              }
            })
            
            // Retry a specific job
            .post('/queues/:name/jobs/:id/retry', async ({ params }: { params: any }) => {
              try {
                const { name, id: jobId } = params;
                
                if (!name || typeof name !== 'string') {
                  throw new QueueOperationError('Queue name is required', name);
                }
                
                const queue = new Queue(name);
                try {
                  const success = queue.retryJob(jobId);
                  
                  if (success) {
                    logger.info('Job retried successfully', { queueName: name, jobId });
                    return {
                      success: true,
                      message: 'Job retried successfully'
                    };
                  } else {
                    return {
                      success: false,
                      error: 'Job not found or could not be retried'
                    };
                  }
                } finally {
                  queue.close();
                }
              } catch (error) {
                return createErrorResponse(error, 'retry-job');
              }
            }, {
              detail: {
                tags: ['Queue Management'],
                summary: 'Retry Job',
                description: 'Retry a failed or completed job by resetting it to waiting status',
                parameters: [
                  {
                    name: 'name',
                    in: 'path',
                    required: true,
                    description: 'Queue name',
                    schema: { type: 'string' }
                  },
                  {
                    name: 'id',
                    in: 'path',
                    required: true,
                    description: 'Job ID to retry',
                    schema: { type: 'string' }
                  }
                ],
                responses: {
                  200: {
                    description: 'Job retry result',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            success: { type: 'boolean' },
                            message: { type: 'string' },
                            error: { type: 'string', nullable: true }
                          }
                        }
                      }
                    }
                  },
                  400: {
                    description: 'Invalid queue name or job ID'
                  },
                  404: {
                    description: 'Job not found or could not be retried'
                  }
                }
              }
            })
            
            // Delete a specific job
            .delete('/queues/:name/jobs/:id', async ({ params }: { params: any }) => {
              try {
                const { name, id: jobId } = params;
                
                if (!name || typeof name !== 'string') {
                  throw new QueueOperationError('Queue name is required', name);
                }
                
                if (!jobId) {
                  throw new QueueOperationError('Job ID is required', jobId);
                }
                
                const queue = new Queue(name);
                try {
                  const success = queue.deleteSpecificJob(jobId);
                  
                  if (success) {
                    logger.info('Job deleted successfully', { queueName: name, jobId });
                    return {
                      success: true,
                      message: 'Job deleted successfully'
                    };
                  } else {
                    return {
                      success: false,
                      error: 'Job not found or could not be deleted'
                    };
                  }
                } finally {
                  queue.close();
                }
              } catch (error) {
                return createErrorResponse(error, 'delete-job');
              }
            }, {
              detail: {
                tags: ['Queue Management'],
                summary: 'Delete Job',
                description: 'Delete a specific job from the queue',
                parameters: [
                  {
                    name: 'name',
                    in: 'path',
                    required: true,
                    description: 'Queue name',
                    schema: { type: 'string' }
                  },
                  {
                    name: 'id',
                    in: 'path',
                    required: true,
                    description: 'Job ID to delete',
                    schema: { type: 'string' }
                  }
                ],
                responses: {
                  200: {
                    description: 'Job deletion result',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            success: { type: 'boolean' },
                            message: { type: 'string' },
                            error: { type: 'string', nullable: true }
                          }
                        }
                      }
                    }
                  },
                  400: {
                    description: 'Invalid queue name or job ID'
                  },
                  404: {
                    description: 'Job not found'
                  }
                }
              }
            })
            
            // Cleanup endpoints
            .get('/cleanup/status', () => {
              try {
                if (!cleanupService) {
                  throw new CleanupError('Cleanup service not initialized');
                }
                
                const lastStats = cleanupService.getLastCleanupStats();
                const isRunning = cleanupService.isCleanupRunning();
                const nextScheduled = cleanupService.getNextScheduledCleanup();
                
                return {
                  success: true,
                  status: {
                    isRunning,
                    nextScheduledCleanup: nextScheduled.toISOString(),
                    lastCleanupStats: lastStats
                  }
                };
              } catch (error) {
                return createErrorResponse(error, 'cleanup-status');
              }
            }, {
              detail: {
                tags: ['Cleanup Management'],
                summary: 'Get Cleanup Status',
                description: 'Get the current status of the queue cleanup service',
                responses: {
                  200: {
                    description: 'Cleanup service status',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            success: { type: 'boolean' },
                            enabled: { type: 'boolean' },
                            dryRun: { type: 'boolean' },
                            lastRun: { type: 'string', nullable: true },
                            nextRun: { type: 'string', nullable: true },
                            config: {
                              type: 'object',
                              properties: {
                                retentionCompletedHours: { type: 'number' },
                                retentionFailedHours: { type: 'number' },
                                batchSize: { type: 'number' },
                                intervalMinutes: { type: 'number' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
            
            .post('/cleanup/trigger', async ({ query }: { query: any }) => {
              try {
                if (!cleanupService) {
                  throw new CleanupError('Cleanup service not initialized');
                }
                
                const dryRun = query.dryRun === 'true';
                if (query.dryRun !== undefined && typeof query.dryRun !== 'string') {
                  throw new CleanupError('dryRun parameter must be a boolean');
                }
                
                const result = await cleanupService.manualCleanup(dryRun);
                return {
                  success: true,
                  result
                };
              } catch (error) {
                return createErrorResponse(error, 'cleanup-trigger');
              }
            }, {
              detail: {
                tags: ['Cleanup Management'],
                summary: 'Trigger Manual Cleanup',
                description: 'Manually trigger a cleanup operation for old jobs',
                parameters: [
                  {
                    name: 'dryRun',
                    in: 'query',
                    required: false,
                    description: 'Whether to perform a dry run (preview only)',
                    schema: { type: 'boolean', default: false }
                  }
                ],
                responses: {
                  200: {
                    description: 'Cleanup operation result',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            success: { type: 'boolean' },
                            result: {
                              type: 'object',
                              properties: {
                                deletedJobs: { type: 'number' },
                                processedQueues: { type: 'number' },
                                duration: { type: 'number' },
                                dryRun: { type: 'boolean' }
                              }
                            },
                            error: { type: 'string', nullable: true }
                          }
                        }
                      }
                    }
                  },
                  500: {
                    description: 'Cleanup operation failed'
                  }
                }
              }
            })
            
            .get('/cleanup/stats', () => {
              try {
                const queueNames = Queue.getAllQueueNames();
                const queueStats = queueNames.map((name: string) => {
                  const queue = new Queue(name);
                  const stats = queue.getCleanupStats();
                  queue.close();
                  return {
                    queueName: name,
                    ...stats
                  };
                });
                
                return {
                  success: true,
                  queueStats
                };
              } catch (error) {
                logger.error('Error fetching cleanup statistics', error);
                return {
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error'
                };
              }
            }, {
              detail: {
                tags: ['Cleanup Management'],
                summary: 'Get Cleanup Statistics',
                description: 'Get cleanup statistics for all queues showing old jobs that can be cleaned up',
                responses: {
                  200: {
                    description: 'Cleanup statistics for all queues',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            success: { type: 'boolean' },
                            queueStats: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  queueName: { type: 'string' },
                                  oldCompletedJobs: { type: 'number' },
                                  oldFailedJobs: { type: 'number' },
                                  totalOldJobs: { type: 'number' }
                                }
                              }
                            },
                            error: { type: 'string', nullable: true }
                          }
                        }
                      }
                    }
                  }
                }
              }
            })
            
            .get('/cleanup/queues/:name/old-jobs', ({ params, query }: { params: any; query: any }) => {
              try {
                const { name } = params;
                const status = query.status as string || 'completed';
                const hours = query.hours ? parseInt(query.hours as string) : 168; // 7 days default
                const limit = query.limit ? parseInt(query.limit as string) : 100;
                
                const queue = new Queue(name);
                const oldJobs = queue.getOldJobs(status as any, hours, limit);
                queue.close();
                
                return {
                  success: true,
                  queueName: name,
                  status,
                  olderThanHours: hours,
                  oldJobs
                };
              } catch (error) {
                logger.error('Error fetching old jobs', error);
                return {
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error'
                };
              }
            }, {
              detail: {
                tags: ['Cleanup Management'],
                summary: 'Get Old Jobs for Queue',
                description: 'Get old jobs for a specific queue that are candidates for cleanup',
                parameters: [
                  {
                    name: 'name',
                    in: 'path',
                    required: true,
                    description: 'Queue name',
                    schema: { type: 'string' }
                  },
                  {
                    name: 'status',
                    in: 'query',
                    required: false,
                    description: 'Job status to filter by',
                    schema: { type: 'string', enum: ['completed', 'failed'], default: 'completed' }
                  },
                  {
                    name: 'hours',
                    in: 'query',
                    required: false,
                    description: 'Jobs older than this many hours',
                    schema: { type: 'integer', default: 168 }
                  },
                  {
                    name: 'limit',
                    in: 'query',
                    required: false,
                    description: 'Maximum number of jobs to return',
                    schema: { type: 'integer', default: 100 }
                  }
                ],
                responses: {
                  200: {
                    description: 'Old jobs for the specified queue',
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          properties: {
                            success: { type: 'boolean' },
                            queueName: { type: 'string' },
                            status: { type: 'string' },
                            olderThanHours: { type: 'number' },
                            oldJobs: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string' },
                                  type: { type: 'string' },
                                  status: { type: 'string' },
                                  createdAt: { type: 'string' },
                                  processedAt: { type: 'string', nullable: true }
                                }
                              }
                            },
                            error: { type: 'string', nullable: true }
                          }
                        }
                      }
                    }
                  }
                }
              }
            });
        });
      }

      return groupedApp;
    });
}

/**
 * Generate the admin HTML with dynamic route prefix
 */
function getAdminHTML(routePrefix: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Queue Management - Hybrid Queue</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <style type="text/tailwindcss">
        @theme {
            --color-primary: #4f46e5;
            --color-primary-dark: #3730a3;
            --color-secondary: #7c3aed;
            --color-success: #10b981;
            --color-warning: #f59e0b;
            --color-danger: #ef4444;
        }
        
        .queue-card-hover:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        
        .spinner {
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Custom scrollbar for better aesthetics */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        
        ::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }
        
        /* Smooth transitions for all interactive elements */
        * {
            transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
            transition-duration: 150ms;
        }
    </style>
</head>
<body class="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 min-h-screen p-4 md:p-6">
    <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="bg-white rounded-t-2xl shadow-2xl">
            <div class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-8 rounded-t-2xl">
                <div class="text-center">
                    <h1 class="text-4xl md:text-5xl font-bold mb-3 flex items-center justify-center gap-3">
                        <span class="text-5xl">🚀</span>
                        Queue Management
                    </h1>
                    <p class="text-indigo-100 text-lg md:text-xl font-medium">Monitor and manage your hybrid queues with style</p>
                </div>
            </div>
        </div>
        
        <!-- Main Content -->
        <div class="bg-white rounded-b-2xl shadow-2xl">
            <!-- Loading State -->
            <div id="loading" class="text-center py-16 px-8">
                <div class="inline-block w-12 h-12 border-4 border-gray-200 border-t-indigo-600 rounded-full spinner mb-6"></div>
                <p class="text-gray-600 text-lg font-medium">Loading queue data...</p>
            </div>
            
            <!-- Content -->
            <div id="content" class="hidden p-8">
                <!-- Queue Grid -->
            <div id="queueGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6 mb-8"></div>
                
                <!-- Cleanup Status Section -->
                <div id="cleanupSection" class="mb-8">
                    <div class="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-6">
                        <div class="flex items-center justify-between mb-6">
                            <h2 class="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                <span class="text-2xl">🧹</span>
                                Auto Cleanup Status
                            </h2>
                            <button id="manualCleanupBtn" class="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                                <span class="flex items-center gap-2">
                                    <span class="text-sm">🚀</span>
                                    Trigger Cleanup
                                </span>
                            </button>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <!-- Service Status -->
                            <div class="bg-white rounded-lg border border-gray-200 p-4">
                                <div class="text-sm font-medium text-gray-600 mb-2">Service Status</div>
                                <div id="cleanupServiceStatus" class="flex items-center gap-2">
                                    <span class="w-3 h-3 bg-gray-400 rounded-full"></span>
                                    <span class="text-sm text-gray-500">Loading...</span>
                                </div>
                            </div>
                            
                            <!-- Running Status -->
                            <div class="bg-white rounded-lg border border-gray-200 p-4">
                                <div class="text-sm font-medium text-gray-600 mb-2">Current State</div>
                                <div id="cleanupRunningStatus" class="flex items-center gap-2">
                                    <span class="w-3 h-3 bg-gray-400 rounded-full"></span>
                                    <span class="text-sm text-gray-500">Loading...</span>
                                </div>
                            </div>
                            
                            <!-- Next Scheduled -->
                            <div class="bg-white rounded-lg border border-gray-200 p-4">
                                <div class="text-sm font-medium text-gray-600 mb-2">Next Cleanup</div>
                                <div id="nextCleanupTime" class="text-sm text-gray-900 font-medium">Loading...</div>
                            </div>
                            
                            <!-- Last Run Stats -->
                            <div class="bg-white rounded-lg border border-gray-200 p-4">
                                <div class="text-sm font-medium text-gray-600 mb-2">Last Run</div>
                                <div id="lastCleanupStats" class="text-sm text-gray-900">
                                    <div class="text-gray-500">No data available</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Detailed Last Cleanup Stats -->
                        <div id="detailedCleanupStats" class="mt-6 bg-white rounded-lg border border-gray-200 p-4 hidden">
                            <div class="text-sm font-medium text-gray-600 mb-3">Last Cleanup Details</div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <span class="text-gray-600">Total Jobs Cleaned:</span>
                                    <span id="totalJobsCleaned" class="font-medium text-gray-900 ml-1">-</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">Completed Jobs:</span>
                                    <span id="completedJobsCleaned" class="font-medium text-green-600 ml-1">-</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">Failed Jobs:</span>
                                    <span id="failedJobsCleaned" class="font-medium text-red-600 ml-1">-</span>
                                </div>
                                <div>
                                    <span class="text-gray-600">Duration:</span>
                                    <span id="cleanupDuration" class="font-medium text-gray-900 ml-1">-</span>
                                </div>
                            </div>
                            <div class="mt-3">
                                <span class="text-gray-600 text-sm">Queues Affected:</span>
                                <div id="queuesCleaned" class="mt-1 flex flex-wrap gap-1"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Jobs Section -->
                <div id="jobsSection" class="hidden">
                    <!-- Jobs Header -->
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-6 p-6 bg-gray-50 rounded-xl border border-gray-200">
                        <h2 id="jobsTitle" class="text-2xl font-bold text-gray-900 mb-4 md:mb-0">Jobs</h2>
                        <div class="flex flex-wrap gap-2">
                            <button class="filter-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-indigo-600 text-white shadow-md" data-status="all">All</button>
                            <button class="filter-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50" data-status="waiting">Waiting</button>
                            <button class="filter-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50" data-status="processing">Processing</button>
                            <button class="filter-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50" data-status="completed">Completed</button>
                            <button class="filter-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50" data-status="failed">Failed</button>
                        </div>
                    </div>
                    
                    <!-- Jobs Table -->
                    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg">
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead class="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold text-gray-900">ID</th>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold text-gray-900 hidden sm:table-cell">Data</th>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold text-gray-900 hidden md:table-cell">Created</th>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold text-gray-900 hidden lg:table-cell">Attempts</th>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold text-gray-900">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="jobsTableBody" class="divide-y divide-gray-200"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const API_BASE = '${routePrefix}/api';
        let currentQueue = null;
        let currentFilter = 'all';
        let refreshInterval;

        // Initialize the application
        async function init() {
            await loadQueues();
            startAutoRefresh();
        }

        // Load all queues
        async function loadQueues() {
            try {
                const response = await fetch(\`\${API_BASE}/queues\`);
                const data = await response.json();
                
                if (data.success) {
                    renderQueues(data.queues);
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('content').style.display = 'block';
                } else {
                    console.error('Failed to load queues:', data.error);
                }
            } catch (error) {
                console.error('Error loading queues:', error);
            }
        }

        // Render queue cards
        function renderQueues(queues) {
            const grid = document.getElementById('queueGrid');
            grid.innerHTML = '';
            
            queues.forEach(queue => {
                const card = document.createElement('div');
                card.className = 'bg-white rounded-xl border border-gray-200 p-6 cursor-pointer transition-all duration-300 queue-card-hover hover:border-indigo-300 hover:shadow-lg';
                card.setAttribute('data-queue-card', queue.name);
                card.onclick = () => selectQueue(queue.name);
                
                card.innerHTML = \`
                    <div class="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <span class="w-3 h-3 bg-indigo-500 rounded-full"></span>
                        \${queue.name}
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                            <div class="text-2xl font-bold text-yellow-700">\${queue.waiting}</div>
                            <div class="text-sm text-yellow-600 font-medium">Waiting</div>
                        </div>
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                            <div class="text-2xl font-bold text-blue-700">\${queue.processing}</div>
                            <div class="text-sm text-blue-600 font-medium">Processing</div>
                        </div>
                        <div class="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                            <div class="text-2xl font-bold text-green-700">\${queue.completed}</div>
                            <div class="text-sm text-green-600 font-medium">Completed</div>
                        </div>
                        <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                            <div class="text-2xl font-bold text-red-700">\${queue.failed}</div>
                            <div class="text-sm text-red-600 font-medium">Failed</div>
                        </div>
                    </div>
                \`;
                
                grid.appendChild(card);
            });
        }

        // Select a queue and load its jobs
        async function selectQueue(queueName) {
            currentQueue = queueName;
            
            // Update active queue card
            document.querySelectorAll('[data-queue-card]').forEach(card => {
                card.classList.remove('ring-2', 'ring-indigo-500', 'border-indigo-500', 'bg-indigo-50');
                card.classList.add('border-gray-200');
            });
            
            // Find and highlight the selected card
            const cards = document.querySelectorAll('[data-queue-card]');
            cards.forEach(card => {
                if (card.textContent.includes(queueName)) {
                    card.classList.remove('border-gray-200');
                    card.classList.add('ring-2', 'ring-indigo-500', 'border-indigo-500', 'bg-indigo-50');
                }
            });
            
            // Show jobs section
            document.getElementById('jobsSection').classList.remove('hidden');
            document.getElementById('jobsTitle').textContent = \`Jobs - \${queueName}\`;
            
            await loadJobs();
        }

        // Load jobs for the current queue
        async function loadJobs() {
            if (!currentQueue) return;
            
            try {
                const statusParam = currentFilter === 'all' ? '' : \`?status=\${currentFilter}\`;
                const response = await fetch(\`\${API_BASE}/queues/\${currentQueue}/jobs\${statusParam}\`);
                const data = await response.json();
                
                if (data.success) {
                    renderJobs(data.jobs);
                } else {
                    console.error('Failed to load jobs:', data.error);
                }
            } catch (error) {
                console.error('Error loading jobs:', error);
            }
        }

        // Render jobs table
        function renderJobs(jobs) {
            const tbody = document.getElementById('jobsTableBody');
            tbody.innerHTML = '';
            
            jobs.forEach(job => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50 transition-colors duration-200';
                
                const statusColors = {
                    'waiting': 'bg-yellow-100 text-yellow-800 border-yellow-200',
                    'processing': 'bg-blue-100 text-blue-800 border-blue-200',
                    'completed': 'bg-green-100 text-green-800 border-green-200',
                    'failed': 'bg-red-100 text-red-800 border-red-200'
                };
                
                const statusClass = statusColors[job.status] || 'bg-gray-100 text-gray-800 border-gray-200';
                
                const canRetry = job.status === 'failed';
                const canDelete = ['completed', 'failed'].includes(job.status);
                
                row.innerHTML = \`
                    <td class="px-3 md:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">\${job.id}</td>
                    <td class="px-3 md:px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border \${statusClass}">
                            \${job.status}
                        </span>
                    </td>
                    <td class="px-3 md:px-6 py-4 max-w-xs truncate text-sm text-gray-900 hidden sm:table-cell" title="\${JSON.stringify(job.data)}">\${JSON.stringify(job.data)}</td>
                    <td class="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">\${new Date(job.created_at).toLocaleString()}</td>
                    <td class="px-3 md:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">\${job.attempts}</td>
                    <td class="px-3 md:px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div class="flex flex-col sm:flex-row gap-1 sm:gap-2">
                            <button class="inline-flex items-center justify-center px-2 md:px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed" \${!canRetry ? 'disabled' : ''} onclick="retryJob('\${job.id}')">Retry</button>
                            <button class="inline-flex items-center justify-center px-2 md:px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed" \${!canDelete ? 'disabled' : ''} onclick="deleteJob('\${job.id}')">Delete</button>
                        </div>
                    </td>
                \`;
                
                tbody.appendChild(row);
            });
        }

        // Retry a job
        async function retryJob(jobId) {
            if (!currentQueue) return;
            
            try {
                const response = await fetch(\`\${API_BASE}/queues/\${currentQueue}/jobs/\${jobId}/retry\`, {
                    method: 'POST'
                });
                const data = await response.json();
                
                if (data.success) {
                    await loadJobs();
                    await loadQueues();
                } else {
                    alert('Failed to retry job: ' + data.error);
                }
            } catch (error) {
                console.error('Error retrying job:', error);
                alert('Error retrying job');
            }
        }

        // Delete a job
        async function deleteJob(jobId) {
            if (!currentQueue) return;
            
            if (!confirm('Are you sure you want to delete this job?')) {
                return;
            }
            
            try {
                const response = await fetch(\`\${API_BASE}/queues/\${currentQueue}/jobs/\${jobId}\`, {
                    method: 'DELETE'
                });
                const data = await response.json();
                
                if (data.success) {
                    await loadJobs();
                    await loadQueues();
                } else {
                    alert('Failed to delete job: ' + data.error);
                }
            } catch (error) {
                console.error('Error deleting job:', error);
                alert('Error deleting job');
            }
        }

        // Handle filter button clicks
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                document.querySelectorAll('.filter-btn').forEach(btn => {
                    btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
                    btn.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-300', 'hover:bg-gray-50');
                });
                
                e.target.classList.remove('bg-white', 'text-gray-700', 'border', 'border-gray-300', 'hover:bg-gray-50');
                e.target.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
                
                currentFilter = e.target.dataset.status;
                loadJobs();
            }
        });

        // Load cleanup status
        async function loadCleanupStatus() {
            try {
                const response = await fetch(\`\${API_BASE}/cleanup/status\`);
                const data = await response.json();
                
                if (data.success) {
                    updateCleanupStatusUI(data.data);
                } else {
                    console.error('Failed to load cleanup status:', data.error);
                }
            } catch (error) {
                console.error('Error loading cleanup status:', error);
            }
        }

        // Update cleanup status UI
        function updateCleanupStatusUI(status) {
            // Update service status
            const serviceStatusEl = document.getElementById('cleanupServiceStatus');
            const isEnabled = status.nextScheduledCleanup !== null;
            serviceStatusEl.innerHTML = \`
                <span class="w-3 h-3 \${isEnabled ? 'bg-green-500' : 'bg-gray-400'} rounded-full"></span>
                <span class="text-sm \${isEnabled ? 'text-green-700' : 'text-gray-500'}">\${isEnabled ? 'Enabled' : 'Disabled'}</span>
            \`;
            
            // Update running status
            const runningStatusEl = document.getElementById('cleanupRunningStatus');
            runningStatusEl.innerHTML = \`
                <span class="w-3 h-3 \${status.isRunning ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'} rounded-full"></span>
                <span class="text-sm \${status.isRunning ? 'text-blue-700' : 'text-gray-500'}">\${status.isRunning ? 'Running' : 'Idle'}</span>
            \`;
            
            // Update next cleanup time
            const nextCleanupEl = document.getElementById('nextCleanupTime');
            if (status.nextScheduledCleanup) {
                const nextTime = new Date(status.nextScheduledCleanup);
                const now = new Date();
                const diffMs = nextTime - now;
                
                if (diffMs > 0) {
                    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    nextCleanupEl.innerHTML = \`
                        <div class="font-medium">\${nextTime.toLocaleString()}</div>
                        <div class="text-xs text-gray-500 mt-1">in \${diffHours}h \${diffMinutes}m</div>
                    \`;
                } else {
                    nextCleanupEl.innerHTML = '<div class="text-orange-600 font-medium">Overdue</div>';
                }
            } else {
                nextCleanupEl.innerHTML = '<div class="text-gray-500">Not scheduled</div>';
            }
            
            // Update last cleanup stats
            const lastStatsEl = document.getElementById('lastCleanupStats');
            const detailedStatsEl = document.getElementById('detailedCleanupStats');
            
            if (status.lastCleanupStats) {
                const stats = status.lastCleanupStats;
                const timestamp = new Date(stats.timestamp);
                
                lastStatsEl.innerHTML = \`
                    <div class="font-medium text-gray-900">\${stats.totalJobsCleaned} jobs cleaned</div>
                    <div class="text-xs text-gray-500 mt-1">\${timestamp.toLocaleString()}</div>
                    <button onclick="toggleDetailedStats()" class="text-xs text-indigo-600 hover:text-indigo-800 mt-1 underline">View details</button>
                \`;
                
                // Update detailed stats
                document.getElementById('totalJobsCleaned').textContent = stats.totalJobsCleaned;
                document.getElementById('completedJobsCleaned').textContent = stats.completedJobsCleaned;
                document.getElementById('failedJobsCleaned').textContent = stats.failedJobsCleaned;
                document.getElementById('cleanupDuration').textContent = \`\${Math.round(stats.duration)}ms\`;
                
                // Update queues cleaned
                const queuesBadges = stats.queuesCleaned.map(queue => 
                    \`<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">\${queue}</span>\`
                ).join('');
                document.getElementById('queuesCleaned').innerHTML = queuesBadges || '<span class="text-gray-500 text-xs">No queues affected</span>';
            } else {
                lastStatsEl.innerHTML = '<div class="text-gray-500">No cleanup performed yet</div>';
                detailedStatsEl.classList.add('hidden');
            }
            
            // Update manual cleanup button state
            const manualBtn = document.getElementById('manualCleanupBtn');
            manualBtn.disabled = status.isRunning;
            if (status.isRunning) {
                manualBtn.innerHTML = \`
                    <span class="flex items-center gap-2">
                        <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        Running...
                    </span>
                \`;
            } else {
                manualBtn.innerHTML = \`
                    <span class="flex items-center gap-2">
                        <span class="text-sm">🚀</span>
                        Trigger Cleanup
                    </span>
                \`;
            }
        }

        // Toggle detailed cleanup stats
        function toggleDetailedStats() {
            const detailedStatsEl = document.getElementById('detailedCleanupStats');
            detailedStatsEl.classList.toggle('hidden');
        }

        // Manual cleanup trigger
        async function triggerManualCleanup() {
            try {
                const response = await fetch(\`\${API_BASE}/cleanup/manual\`, {
                    method: 'POST'
                });
                const data = await response.json();
                
                if (data.success) {
                    // Immediately refresh cleanup status
                    await loadCleanupStatus();
                    // Show success message
                    alert('Manual cleanup triggered successfully!');
                } else {
                    alert('Failed to trigger cleanup: ' + data.error);
                }
            } catch (error) {
                console.error('Error triggering manual cleanup:', error);
                alert('Error triggering manual cleanup');
            }
        }

        // Auto-refresh functionality
        function startAutoRefresh() {
            refreshInterval = setInterval(async () => {
                await loadQueues();
                await loadCleanupStatus();
                if (currentQueue) {
                    await loadJobs();
                }
            }, 5000); // Refresh every 5 seconds
        }

        // Add event listener for manual cleanup button
        document.getElementById('manualCleanupBtn').addEventListener('click', triggerManualCleanup);
        
        // Initialize when page loads
        async function init() {
            await loadQueues();
            await loadCleanupStatus();
            startAutoRefresh();
        }
        
        init();
    </script>
</body>
</html>`;
}

// Export types for external use
export * from './types';
export { defaultOptions } from './config';