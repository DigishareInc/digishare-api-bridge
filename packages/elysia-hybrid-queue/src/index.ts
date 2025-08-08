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

// Global auth sessions store
const authSessions = new Map<string, { expires: number }>();

/**
 * Get the global cleanup service instance
 */
function getCleanupService(): CleanupService | null {
  return cleanupService;
}

/**
 * Generate a random session ID
 */
function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Clean expired sessions
 */
function cleanExpiredSessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of authSessions.entries()) {
    if (session.expires < now) {
      authSessions.delete(sessionId);
    }
  }
}

/**
 * Check if user is authenticated
 */
function isAuthenticated(request: Request, options: Required<HybridQueuePluginOptions>): boolean {
  if (!options.auth.enabled) {
    return true; // Auth disabled, allow access
  }

  // Clean expired sessions periodically
  cleanExpiredSessions();

  // Check for session cookie
  const cookies = request.headers.get('cookie');
  if (cookies) {
    const sessionMatch = cookies.match(/queueAdminSession=([^;]+)/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      const session = authSessions.get(sessionId);
      if (session && session.expires > Date.now()) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Create authentication middleware
 */
function createAuthMiddleware(options: Required<HybridQueuePluginOptions>) {
  return (request: Request) => {
    if (!isAuthenticated(request, options)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }
  };
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
          .get('/admin', ({ request }) => {
            // Check authentication for admin UI
            if (options.auth.enabled && !isAuthenticated(request, options)) {
              return new Response(
                getLoginHTML(options.routePrefix),
                {
                  headers: {
                    'Content-Type': 'text/html'
                  }
                }
              );
            }
            
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

      // Add authentication endpoints
      groupedApp = groupedApp.group('/auth', (auth) => {
        return auth
          .post('/login', async ({ body, set }) => {
            try {
              const { adminKey } = body as { adminKey: string };
              
              if (!options.auth.enabled) {
                return {
                  success: false,
                  error: 'Authentication is not enabled'
                };
              }
              
              if (!adminKey || adminKey !== options.auth.adminKey) {
                set.status = 401;
                return {
                  success: false,
                  error: 'Invalid admin key'
                };
              }
              
              // Create session
              const sessionId = generateSessionId();
              const expires = Date.now() + (options.auth.sessionTimeout || 3600000);
              authSessions.set(sessionId, { expires });
              
              // Set session cookie
              const maxAge = Math.floor((options.auth.sessionTimeout || 3600000) / 1000);
              set.headers['Set-Cookie'] = `queueAdminSession=${sessionId}; HttpOnly; Path=${options.routePrefix}; Max-Age=${maxAge}`;
              
              return {
                success: true,
                message: 'Login successful'
              };
            } catch (error) {
              set.status = 500;
              return {
                success: false,
                error: 'Login failed'
              };
            }
          })
          
          .post('/logout', ({ request, set }) => {
            try {
              // Get session from cookie
              const cookies = request.headers.get('cookie');
              if (cookies) {
                const sessionMatch = cookies.match(/queueAdminSession=([^;]+)/);
                if (sessionMatch) {
                  const sessionId = sessionMatch[1];
                  authSessions.delete(sessionId);
                }
              }
              
              // Clear session cookie
              set.headers['Set-Cookie'] = `queueAdminSession=; HttpOnly; Path=${options.routePrefix}; Max-Age=0`;
              
              return {
                success: true,
                message: 'Logout successful'
              };
            } catch (error) {
              set.status = 500;
              return {
                success: false,
                error: 'Logout failed'
              };
            }
          })
          
          .get('/status', ({ request }) => {
            return {
              success: true,
              authenticated: isAuthenticated(request, options),
              authEnabled: options.auth.enabled
            };
          });
      })
      
      // Add API endpoints if enabled
      if (options.enableAPI) {
        groupedApp = groupedApp.group('/api', (api) => {
          // Apply auth middleware to API routes if auth is enabled
          if (options.auth.enabled) {
            api = api.derive(({ request }) => {
              const authResult = createAuthMiddleware(options)(request);
              if (authResult) {
                throw authResult;
              }
              return {};
            });
          }
          
          return api
            // Get all queues and their stats
            .get('/queues', () => {
              try {
                const queueNames = Queue.getAllQueueNames();
                const queues = queueNames.map((name: string) => {
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
 * Generate the login HTML with dynamic route prefix
 */
function getLoginHTML(routePrefix: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Queue Admin Login - Hybrid Queue</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <style type="text/tailwindcss">
        @theme {
            --color-primary: #4f46e5;
            --color-primary-dark: #3730a3;
        }
    </style>
</head>
<body class="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 min-h-screen flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
                <span class="text-3xl">🔐</span>
                Admin Login
            </h1>
            <p class="text-gray-600">Enter your admin key to access the queue management interface</p>
        </div>
        
        <form id="loginForm" class="space-y-6">
            <div>
                <label for="adminKey" class="block text-sm font-medium text-gray-700 mb-2">Admin Key</label>
                <input 
                    type="password" 
                    id="adminKey" 
                    name="adminKey" 
                    required 
                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="Enter your admin key"
                >
            </div>
            
            <button 
                type="submit" 
                id="loginBtn"
                class="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <span id="loginBtnText">Login</span>
                <span id="loginBtnSpinner" class="hidden">
                    <span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                    Logging in...
                </span>
            </button>
        </form>
        
        <div id="errorMessage" class="hidden mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"></div>
    </div>
    
    <script>
        const API_BASE = '${routePrefix}';
        
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const adminKey = document.getElementById('adminKey').value;
            const loginBtn = document.getElementById('loginBtn');
            const loginBtnText = document.getElementById('loginBtnText');
            const loginBtnSpinner = document.getElementById('loginBtnSpinner');
            const errorMessage = document.getElementById('errorMessage');
            
            // Show loading state
            loginBtn.disabled = true;
            loginBtnText.classList.add('hidden');
            loginBtnSpinner.classList.remove('hidden');
            errorMessage.classList.add('hidden');
            
            try {
                const response = await fetch(\`\${API_BASE}/auth/login\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ adminKey })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Redirect to admin interface
                    window.location.href = \`\${API_BASE}/admin\`;
                } else {
                    // Show error
                    errorMessage.textContent = data.error || 'Login failed';
                    errorMessage.classList.remove('hidden');
                }
            } catch (error) {
                console.error('Login error:', error);
                errorMessage.textContent = 'Network error. Please try again.';
                errorMessage.classList.remove('hidden');
            } finally {
                // Reset loading state
                loginBtn.disabled = false;
                loginBtnText.classList.remove('hidden');
                loginBtnSpinner.classList.add('hidden');
            }
        });
        
        // Focus on admin key input
        document.getElementById('adminKey').focus();
    </script>
</body>
</html>`;
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
        
        :root {
            /* Light theme variables */
            --bg-primary: #ffffff;
            --bg-secondary: #f8fafc;
            --bg-tertiary: #f1f5f9;
            --bg-gradient-start: #6366f1;
            --bg-gradient-end: #8b5cf6;
            --text-primary: #1f2937;
            --text-secondary: #6b7280;
            --text-tertiary: #9ca3af;
            --border-primary: #e5e7eb;
            --border-secondary: #d1d5db;
            --shadow-color: rgba(0, 0, 0, 0.1);
            --card-bg: #ffffff;
            --header-bg: linear-gradient(to right, #4f46e5, #7c3aed);
            --scrollbar-track: #f1f5f9;
            --scrollbar-thumb: #cbd5e1;
            --scrollbar-thumb-hover: #94a3b8;
        }
        
        [data-theme="dark"] {
            /* Dark theme variables */
            --bg-primary: #111827;
            --bg-secondary: #1f2937;
            --bg-tertiary: #374151;
            --bg-gradient-start: #1e1b4b;
            --bg-gradient-end: #581c87;
            --text-primary: #f9fafb;
            --text-secondary: #d1d5db;
            --text-tertiary: #9ca3af;
            --border-primary: #374151;
            --border-secondary: #4b5563;
            --shadow-color: rgba(0, 0, 0, 0.3);
            --card-bg: #1f2937;
            --header-bg: linear-gradient(to right, #312e81, #581c87);
            --scrollbar-track: #374151;
            --scrollbar-thumb: #6b7280;
            --scrollbar-thumb-hover: #9ca3af;
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
            background: var(--scrollbar-track);
            border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb {
            background: var(--scrollbar-thumb);
            border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
            background: var(--scrollbar-thumb-hover);
        }
        
        /* Smooth transitions for all interactive elements */
        * {
            transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
            transition-duration: 150ms;
        }
    </style>
</head>
<body class="min-h-screen p-4 md:p-6" style="background: linear-gradient(to bottom right, var(--bg-gradient-start), var(--bg-gradient-end));">
    <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="rounded-t-2xl shadow-2xl" style="background: var(--card-bg);">
            <div class="text-white p-8 rounded-t-2xl" style="background: var(--header-bg);">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                        <span class="w-3 h-3 bg-green-400 rounded-full"></span>
                        <span class="text-sm text-indigo-100">Authenticated</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <button 
                            id="themeToggle" 
                            class="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
                            title="Toggle dark mode"
                        >
                            <span id="themeIcon" class="text-sm">🌙</span>
                            <span id="themeText" class="hidden sm:inline">Dark</span>
                        </button>
                        <button 
                            id="logoutBtn" 
                            class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
                        >
                            <span class="text-sm">🚪</span>
                            Logout
                        </button>
                    </div>
                </div>
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
        <div class="rounded-b-2xl shadow-2xl" style="background: var(--card-bg);">
            <!-- Loading State -->
            <div id="loading" class="text-center py-16 px-8">
                <div class="inline-block w-12 h-12 border-4 rounded-full spinner mb-6" style="border-color: var(--border-primary); border-top-color: #4f46e5;"></div>
                <p class="text-lg font-medium" style="color: var(--text-secondary);">Loading queue data...</p>
            </div>
            
            <!-- Content -->
            <div id="content" class="hidden p-8">
                <!-- Queue Grid -->
            <div id="queueGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6 mb-8"></div>
                
                <!-- Cleanup Status Section -->
                <div id="cleanupSection" class="mb-8">
                    <div class="rounded-xl p-6" style="background: var(--bg-secondary); border: 1px solid var(--border-primary);">
                        <div class="flex items-center justify-between mb-6">
                            <h2 class="text-2xl font-bold flex items-center gap-3" style="color: var(--text-primary);">
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
                            <div class="rounded-lg p-4" style="background: var(--card-bg); border: 1px solid var(--border-primary);">
                                <div class="text-sm font-medium mb-2" style="color: var(--text-secondary);">Service Status</div>
                                <div id="cleanupServiceStatus" class="flex items-center gap-2">
                                    <span class="w-3 h-3 bg-gray-400 rounded-full"></span>
                                    <span class="text-sm text-gray-500">Loading...</span>
                                </div>
                            </div>
                            
                            <!-- Running Status -->
                            <div class="rounded-lg p-4" style="background: var(--card-bg); border: 1px solid var(--border-primary);">
                                <div class="text-sm font-medium mb-2" style="color: var(--text-secondary);">Current State</div>
                                <div id="cleanupRunningStatus" class="flex items-center gap-2">
                                    <span class="w-3 h-3 bg-gray-400 rounded-full"></span>
                                    <span class="text-sm text-gray-500">Loading...</span>
                                </div>
                            </div>
                            
                            <!-- Next Scheduled -->
                            <div class="rounded-lg p-4" style="background: var(--card-bg); border: 1px solid var(--border-primary);">
                                <div class="text-sm font-medium mb-2" style="color: var(--text-secondary);">Next Cleanup</div>
                                <div id="nextCleanupTime" class="text-sm font-medium" style="color: var(--text-primary);">Loading...</div>
                            </div>
                            
                            <!-- Last Run Stats -->
                            <div class="rounded-lg p-4" style="background: var(--card-bg); border: 1px solid var(--border-primary);">
                                <div class="text-sm font-medium mb-2" style="color: var(--text-secondary);">Last Run</div>
                                <div id="lastCleanupStats" class="text-sm" style="color: var(--text-primary);">
                                    <div class="text-gray-500">No data available</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Detailed Last Cleanup Stats -->
                        <div id="detailedCleanupStats" class="mt-6 rounded-lg p-4 hidden" style="background: var(--card-bg); border: 1px solid var(--border-primary);">
                            <div class="text-sm font-medium mb-3" style="color: var(--text-secondary);">Last Cleanup Details</div>
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
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-6 p-6 rounded-xl" style="background: var(--bg-secondary); border: 1px solid var(--border-primary);">
                        <h2 id="jobsTitle" class="text-2xl font-bold mb-4 md:mb-0" style="color: var(--text-primary);">Jobs</h2>
                        <div class="flex flex-wrap gap-2">
                            <button class="filter-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-indigo-600 text-white shadow-md" data-status="all">All</button>
                            <button class="filter-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50" data-status="waiting">Waiting</button>
                            <button class="filter-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50" data-status="processing">Processing</button>
                            <button class="filter-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50" data-status="completed">Completed</button>
                            <button class="filter-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50" data-status="failed">Failed</button>
                        </div>
                    </div>
                    
                    <!-- Jobs Table -->
                    <div class="rounded-xl overflow-hidden shadow-lg" style="background: var(--card-bg); border: 1px solid var(--border-primary);">
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead style="background: var(--bg-secondary); border-bottom: 1px solid var(--border-primary);">
                                    <tr>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold" style="color: var(--text-primary);">ID</th>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold" style="color: var(--text-primary);">Status</th>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold hidden sm:table-cell" style="color: var(--text-primary);">Data</th>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold hidden md:table-cell" style="color: var(--text-primary);">Created</th>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold hidden lg:table-cell" style="color: var(--text-primary);">Attempts</th>
                                        <th class="px-3 md:px-6 py-4 text-left text-sm font-semibold" style="color: var(--text-primary);">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="jobsTableBody" style="border-top: 1px solid var(--border-primary);"></tbody>
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
                card.className = 'rounded-xl border p-6 cursor-pointer transition-all duration-300 queue-card-hover hover:shadow-lg';
                card.style.cssText = 'background-color: var(--bg-primary); border-color: var(--border-primary); color: var(--text-primary);';
                card.setAttribute('data-queue-card', queue.name);
                card.onclick = () => selectQueue(queue.name);
                
                card.innerHTML = \`
                    <div class="text-xl font-bold mb-4 flex items-center gap-2" style="color: var(--text-primary);">
                        <span class="w-3 h-3 bg-indigo-500 rounded-full"></span>
                        \${queue.name}
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="border rounded-lg p-3 text-center" style="background-color: var(--bg-secondary); border-color: var(--border-primary);">
                            <div class="text-2xl font-bold text-yellow-700">\${queue.waiting}</div>
                            <div class="text-sm text-yellow-600 font-medium">Waiting</div>
                        </div>
                        <div class="border rounded-lg p-3 text-center" style="background-color: var(--bg-secondary); border-color: var(--border-primary);">
                            <div class="text-2xl font-bold text-blue-700">\${queue.processing}</div>
                            <div class="text-sm text-blue-600 font-medium">Processing</div>
                        </div>
                        <div class="border rounded-lg p-3 text-center" style="background-color: var(--bg-secondary); border-color: var(--border-primary);">
                            <div class="text-2xl font-bold text-green-700">\${queue.completed}</div>
                            <div class="text-sm text-green-600 font-medium">Completed</div>
                        </div>
                        <div class="border rounded-lg p-3 text-center" style="background-color: var(--bg-secondary); border-color: var(--border-primary);">
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
                card.classList.remove('ring-2', 'ring-indigo-500');
                card.style.cssText = 'background-color: var(--bg-primary); border-color: var(--border-primary); color: var(--text-primary);';
            });
            
            // Find and highlight the selected card
            const cards = document.querySelectorAll('[data-queue-card]');
            cards.forEach(card => {
                if (card.textContent.includes(queueName)) {
                    card.classList.add('ring-2', 'ring-indigo-500');
                    card.style.cssText = 'background-color: var(--bg-accent); border-color: var(--border-accent); color: var(--text-primary);';
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
                row.className = 'transition-colors duration-200';
                row.style.cssText = 'color: var(--text-primary);';
                row.onmouseenter = () => row.style.backgroundColor = 'var(--bg-hover)';
                row.onmouseleave = () => row.style.backgroundColor = 'transparent';
                
                const statusColors = {
                    'waiting': 'text-yellow-800',
                    'processing': 'text-blue-800',
                    'completed': 'text-green-800',
                    'failed': 'text-red-800'
                };
                
                const statusClass = statusColors[job.status] || 'text-gray-800';
                
                const canRetry = job.status === 'failed';
                const canDelete = ['completed', 'failed'].includes(job.status);
                
                row.innerHTML = \`
                    <td class="px-3 md:px-6 py-4 whitespace-nowrap text-sm font-medium" style="color: var(--text-primary);">\${job.id}</td>
                    <td class="px-3 md:px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border \${statusClass}" style="background-color: var(--bg-secondary); border-color: var(--border-primary);">
                            \${job.status}
                        </span>
                    </td>
                    <td class="px-3 md:px-6 py-4 max-w-xs truncate text-sm hidden sm:table-cell" style="color: var(--text-primary);" title="\${JSON.stringify(job.data)}">\${JSON.stringify(job.data)}</td>
                    <td class="px-3 md:px-6 py-4 whitespace-nowrap text-sm hidden md:table-cell" style="color: var(--text-secondary);">\${new Date(job.created_at).toLocaleString()}</td>
                    <td class="px-3 md:px-6 py-4 whitespace-nowrap text-sm hidden lg:table-cell" style="color: var(--text-secondary);">\${job.attempts}</td>
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
                    btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md', 'bg-white', 'text-gray-700', 'border', 'border-gray-300', 'hover:bg-gray-50');
                    btn.style.cssText = 'background-color: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-primary);';
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
                
                // Debug logging
                console.log('Cleanup status response:', data);
                
                if (data.success) {
                    if (data.status) {
                        console.log('Status object:', data.status);
                        updateCleanupStatusUI(data.status);
                    } else {
                        console.warn('Status object is missing from response');
                        showCleanupStatusError('Cleanup status data is missing');
                    }
                } else {
                    console.error('Failed to load cleanup status:', data.error);
                    showCleanupStatusError(data.error || 'Failed to load cleanup status');
                }
            } catch (error) {
                console.error('Error loading cleanup status:', error);
                showCleanupStatusError('Unable to connect to cleanup service');
            }
        }
        
        // Show cleanup status error in UI
        function showCleanupStatusError(message) {
            const serviceStatusEl = document.getElementById('cleanupServiceStatus');
            const runningStatusEl = document.getElementById('cleanupRunningStatus');
            const nextCleanupEl = document.getElementById('nextCleanupTime');
            const lastStatsEl = document.getElementById('lastCleanupStats');
            const manualBtn = document.getElementById('manualCleanupBtn');
            
            if (serviceStatusEl) {
                serviceStatusEl.innerHTML = \`
                    <span class="w-3 h-3 bg-red-500 rounded-full"></span>
                    <span class="text-sm text-red-700">Error</span>
                \`;
            }
            
            if (runningStatusEl) {
                runningStatusEl.innerHTML = \`
                    <span class="w-3 h-3 bg-gray-400 rounded-full"></span>
                    <span class="text-sm text-gray-500">Unknown</span>
                \`;
            }
            
            if (nextCleanupEl) {
                nextCleanupEl.innerHTML = \`<div class="text-red-600">\${message}</div>\`;
            }
            
            if (lastStatsEl) {
                lastStatsEl.innerHTML = \`<div class="text-red-600">\${message}</div>\`;
            }
            
            if (manualBtn) {
                manualBtn.disabled = true;
                manualBtn.innerHTML = \`
                    <span class="flex items-center gap-2">
                        <span class="text-sm">⚠️</span>
                        Service Error
                    </span>
                \`;
            }
        }

        // Update cleanup status UI
        function updateCleanupStatusUI(status) {
            // Validate status object
            if (!status || typeof status !== 'object') {
                console.error('Invalid status object:', status);
                showCleanupStatusError('Invalid cleanup status data');
                return;
            }
            
            // Update service status
            const serviceStatusEl = document.getElementById('cleanupServiceStatus');
            const isEnabled = status.nextScheduledCleanup !== null && status.nextScheduledCleanup !== undefined;
            if (serviceStatusEl) {
                serviceStatusEl.innerHTML = \`
                    <span class="w-3 h-3 \${isEnabled ? 'bg-green-500' : 'bg-gray-400'} rounded-full"></span>
                    <span class="text-sm \${isEnabled ? 'text-green-700' : 'text-gray-500'}">\${isEnabled ? 'Enabled' : 'Disabled'}</span>
                \`;
            }
            
            // Update running status
            const runningStatusEl = document.getElementById('cleanupRunningStatus');
            const isRunning = Boolean(status.isRunning);
            if (runningStatusEl) {
                runningStatusEl.innerHTML = \`
                    <span class="w-3 h-3 \${isRunning ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'} rounded-full"></span>
                    <span class="text-sm \${isRunning ? 'text-blue-700' : 'text-gray-500'}">\${isRunning ? 'Running' : 'Idle'}</span>
                \`;
            }
            
            // Update next cleanup time
            const nextCleanupEl = document.getElementById('nextCleanupTime');
            if (nextCleanupEl) {
                if (status.nextScheduledCleanup && status.nextScheduledCleanup !== null) {
                    try {
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
                    } catch (error) {
                        console.error('Error parsing nextScheduledCleanup date:', error);
                        nextCleanupEl.innerHTML = '<div class="text-red-600">Invalid date</div>';
                    }
                } else {
                    nextCleanupEl.innerHTML = '<div class="text-gray-500">Not scheduled</div>';
                }
            }
            
            // Update last cleanup stats
            const lastStatsEl = document.getElementById('lastCleanupStats');
            const detailedStatsEl = document.getElementById('detailedCleanupStats');
            
            if (lastStatsEl) {
                if (status.lastCleanupStats && typeof status.lastCleanupStats === 'object') {
                    const stats = status.lastCleanupStats;
                    try {
                        const timestamp = new Date(stats.timestamp);
                        
                        lastStatsEl.innerHTML = \`
                            <div class="font-medium text-gray-900">\${stats.totalJobsCleaned || 0} jobs cleaned</div>
                            <div class="text-xs text-gray-500 mt-1">\${timestamp.toLocaleString()}</div>
                            <button onclick="toggleDetailedStats()" class="text-xs text-indigo-600 hover:text-indigo-800 mt-1 underline">View details</button>
                        \`;
                        
                        // Update detailed stats with null checks
                        const totalEl = document.getElementById('totalJobsCleaned');
                        const completedEl = document.getElementById('completedJobsCleaned');
                        const failedEl = document.getElementById('failedJobsCleaned');
                        const durationEl = document.getElementById('cleanupDuration');
                        const queuesEl = document.getElementById('queuesCleaned');
                        
                        if (totalEl) totalEl.textContent = stats.totalJobsCleaned || 0;
                        if (completedEl) completedEl.textContent = stats.completedJobsCleaned || 0;
                        if (failedEl) failedEl.textContent = stats.failedJobsCleaned || 0;
                        if (durationEl) durationEl.textContent = \`\${Math.round(stats.duration || 0)}ms\`;
                        
                        // Update queues cleaned
                        if (queuesEl) {
                            const queuesBadges = (stats.queuesCleaned || []).map(queue => 
                                \`<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">\${queue}</span>\`
                            ).join('');
                            queuesEl.innerHTML = queuesBadges || '<span class="text-gray-500 text-xs">No queues affected</span>';
                        }
                    } catch (error) {
                        console.error('Error processing lastCleanupStats:', error);
                        lastStatsEl.innerHTML = '<div class="text-red-600">Error loading stats</div>';
                    }
                } else {
                    lastStatsEl.innerHTML = '<div class="text-gray-500">No cleanup performed yet</div>';
                    if (detailedStatsEl) detailedStatsEl.classList.add('hidden');
                }
            }
            
            // Update manual cleanup button state
            const manualBtn = document.getElementById('manualCleanupBtn');
            if (manualBtn) {
                const isRunning = Boolean(status.isRunning);
                manualBtn.disabled = isRunning;
                if (isRunning) {
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

        // Logout functionality
        async function logout() {
            try {
                const response = await fetch(\`\${API_BASE.replace('/api', '')}/auth/logout\`, {
                    method: 'POST'
                });
                
                // Redirect to login page regardless of response
                window.location.href = \`\${API_BASE.replace('/api', '')}/admin\`;
            } catch (error) {
                console.error('Logout error:', error);
                // Still redirect on error
                window.location.href = \`\${API_BASE.replace('/api', '')}/admin\`;
            }
        }

        // Theme management
        function initTheme() {
            const savedTheme = localStorage.getItem('admin-theme') || 'light';
            applyTheme(savedTheme);
            updateThemeToggleButton(savedTheme);
        }

        function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
            localStorage.setItem('admin-theme', newTheme);
            updateThemeToggleButton(newTheme);
        }

        function applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
        }

        function updateThemeToggleButton(theme) {
            const toggleBtn = document.getElementById('themeToggle');
            if (toggleBtn) {
                toggleBtn.innerHTML = theme === 'light' ? '🌙' : '☀️';
                toggleBtn.title = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
            }
        }

        // Add event listeners
        document.getElementById('manualCleanupBtn').addEventListener('click', triggerManualCleanup);
        document.getElementById('logoutBtn').addEventListener('click', logout);
        document.getElementById('themeToggle').addEventListener('click', toggleTheme);
        
        // Initialize when page loads
        async function init() {
            initTheme();
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