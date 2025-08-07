import { Queue } from './Queue';
import { Job, JobHandler } from './Job';

export class Worker {
  private queue: Queue;
  private handler: JobHandler;
  private isRunning: boolean = false;
  private pollInterval: Timer | null = null;
  private readonly POLL_INTERVAL_MS = 1000; // 1 second
  private readonly MAX_ATTEMPTS = 3;

  constructor(queueName: string, handler: JobHandler) {
    this.queue = new Queue(queueName);
    this.handler = handler;
    this.start();
  }

  private start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log(`Worker started for queue: ${this.queue['queueName']}`);
    
    // Start polling for jobs
    this.pollInterval = setInterval(() => {
      this.processJobs();
    }, this.POLL_INTERVAL_MS);
  }

  private async processJobs(): Promise<void> {
    try {
      // Get waiting jobs from the queue
      const jobs = this.queue.getWaitingJobs(1);
      
      if (jobs.length === 0) {
        return;
      }

      const job = jobs[0];
      await this.processJob(job);
    } catch (error) {
      console.error('Error in job processing loop:', error);
    }
  }

  private async processJob(job: Job): Promise<void> {
    try {
      // Mark job as processing
      this.queue.updateJobStatus(job.id, 'processing');
      
      console.log(`Processing job ${job.id}: ${job.name}`);
      
      // Execute the job handler
      await this.handler(job);
      
      // Job completed successfully - delete it
      this.queue.deleteJob(job.id);
      console.log(`Job ${job.id} completed successfully`);
      
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      await this.handleJobFailure(job, error);
    }
  }

  private async handleJobFailure(job: Job, error: any): Promise<void> {
    const newAttempts = job.attempts + 1;
    
    if (newAttempts >= this.MAX_ATTEMPTS) {
      // Max attempts reached - mark as failed
      this.queue.updateJobStatus(job.id, 'failed', newAttempts);
      console.log(`Job ${job.id} failed permanently after ${newAttempts} attempts`);
    } else {
      // Retry the job - mark as waiting again
      this.queue.updateJobStatus(job.id, 'waiting', newAttempts);
      console.log(`Job ${job.id} will be retried (attempt ${newAttempts}/${this.MAX_ATTEMPTS})`);
    }
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    console.log(`Worker stopped for queue: ${this.queue['queueName']}`);
  }

  public getStatus(): { isRunning: boolean; queueName: string } {
    return {
      isRunning: this.isRunning,
      queueName: this.queue['queueName']
    };
  }

  // Cleanup method to close database connection
  public close(): void {
    this.stop();
    this.queue.close();
  }
}