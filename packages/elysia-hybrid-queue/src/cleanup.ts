import { Queue } from 'hybrid-queue';
import { logger } from './logger';

export interface CleanupServiceOptions {
  databasePath: string;
  intervalMinutes: number;
  retentionCompletedHours: number;
  retentionFailedHours: number;
  dryRun: boolean;
  batchSize: number;
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

/**
 * Service for cleaning up old jobs from queues
 */
export class CleanupService {
  private options: CleanupServiceOptions;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastCleanupStats: CleanupStats | null = null;
  private nextScheduledCleanup: Date;

  constructor(options: CleanupServiceOptions) {
    this.options = options;
    this.nextScheduledCleanup = new Date(Date.now() + options.intervalMinutes * 60 * 1000);
  }

  /**
   * Start the cleanup service
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      logger.warn('Cleanup service is already running');
      return;
    }

    logger.info('Starting cleanup service', {
      intervalMinutes: this.options.intervalMinutes,
      retentionCompletedHours: this.options.retentionCompletedHours,
      retentionFailedHours: this.options.retentionFailedHours,
      dryRun: this.options.dryRun
    });

    // Schedule periodic cleanup
    this.intervalId = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.error('Scheduled cleanup failed', error);
      }
    }, this.options.intervalMinutes * 60 * 1000);

    // Perform initial cleanup
    setTimeout(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.error('Initial cleanup failed', error);
      }
    }, 5000); // Wait 5 seconds after startup
  }

  /**
   * Stop the cleanup service
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Cleanup service stopped');
    }
  }

  /**
   * Perform manual cleanup
   */
  async manualCleanup(dryRun?: boolean): Promise<CleanupResult> {
    const actualDryRun = dryRun !== undefined ? dryRun : this.options.dryRun;
    return this.performCleanup(actualDryRun);
  }

  /**
   * Get the last cleanup statistics
   */
  getLastCleanupStats(): CleanupStats | null {
    return this.lastCleanupStats;
  }

  /**
   * Check if cleanup is currently running
   */
  isCleanupRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the next scheduled cleanup time
   */
  getNextScheduledCleanup(): Date {
    return this.nextScheduledCleanup;
  }

  /**
   * Perform the actual cleanup operation
   */
  private async performCleanup(dryRun?: boolean): Promise<CleanupResult> {
    if (this.isRunning) {
      throw new Error('Cleanup is already running');
    }

    this.isRunning = true;
    const startTime = Date.now();
    const actualDryRun = dryRun !== undefined ? dryRun : this.options.dryRun;
    const errors: string[] = [];
    
    let totalJobsCleaned = 0;
    let completedJobsCleaned = 0;
    let failedJobsCleaned = 0;
    const queuesCleaned: string[] = [];

    try {
      logger.info(`Starting cleanup ${actualDryRun ? '(DRY RUN)' : ''}`, {
        retentionCompletedHours: this.options.retentionCompletedHours,
        retentionFailedHours: this.options.retentionFailedHours,
        batchSize: this.options.batchSize
      });

      const queueNames = Queue.getAllQueueNames();
      
      for (const queueName of queueNames) {
        try {
          const queue = new Queue(queueName);
          
          // Clean completed jobs
          const completedCleaned = queue.cleanupOldJobs(
            'completed',
            this.options.retentionCompletedHours,
            this.options.batchSize,
            actualDryRun
          );
          
          // Clean failed jobs
          const failedCleaned = queue.cleanupOldJobs(
            'failed',
            this.options.retentionFailedHours,
            this.options.batchSize,
            actualDryRun
          );
          
          queue.close();
          
          const queueTotal = completedCleaned + failedCleaned;
          if (queueTotal > 0) {
            queuesCleaned.push(queueName);
            totalJobsCleaned += queueTotal;
            completedJobsCleaned += completedCleaned;
            failedJobsCleaned += failedCleaned;
            
            logger.info(`Cleaned ${queueTotal} jobs from queue ${queueName}`, {
              completed: completedCleaned,
              failed: failedCleaned,
              dryRun: actualDryRun
            });
          }
        } catch (error) {
          const errorMsg = `Failed to cleanup queue ${queueName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          logger.error(errorMsg, error);
        }
      }

      const duration = Date.now() - startTime;
      const stats: CleanupStats = {
        totalJobsCleaned,
        completedJobsCleaned,
        failedJobsCleaned,
        queuesCleaned,
        duration,
        timestamp: new Date().toISOString()
      };

      this.lastCleanupStats = stats;
      this.nextScheduledCleanup = new Date(Date.now() + this.options.intervalMinutes * 60 * 1000);

      logger.info(`Cleanup completed ${actualDryRun ? '(DRY RUN)' : ''}`, {
        totalJobsCleaned,
        queuesCleaned: queuesCleaned.length,
        duration: `${duration}ms`,
        errors: errors.length
      });

      return {
        success: true,
        stats,
        dryRun: actualDryRun,
        errors
      };
    } catch (error) {
      const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      logger.error(errorMsg, error);
      
      return {
        success: false,
        stats: {
          totalJobsCleaned,
          completedJobsCleaned,
          failedJobsCleaned,
          queuesCleaned,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        },
        dryRun: actualDryRun,
        errors
      };
    } finally {
      this.isRunning = false;
    }
  }
}