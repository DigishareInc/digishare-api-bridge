import { Database } from 'bun:sqlite';
import { Job, JobStatus, DatabaseJob } from './Job';
import path from 'path';

export class Queue {
  private db: Database;
  private queueName: string;

  constructor(name: string) {
    this.queueName = name;
    
    // Initialize SQLite database
    const dbPath = path.join(process.cwd(), 'queue.sqlite');
    this.db = new Database(dbPath);
    
    // Create jobs table if it doesn't exist
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        status TEXT DEFAULT 'waiting',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        queue_name TEXT NOT NULL
      )
    `;
    
    this.db.exec(createTableQuery);
    
    // Create index for better performance
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_queue_status ON jobs(queue_name, status)');
  }

  async add(name: string, data: any): Promise<Job> {
    const insertQuery = `
      INSERT INTO jobs (name, data, queue_name, status, attempts, created_at)
      VALUES (?, ?, ?, 'waiting', 0, datetime('now'))
    `;
    
    const stmt = this.db.prepare(insertQuery);
    const result = stmt.run(name, JSON.stringify(data), this.queueName);
    
    // Get the created job
    const selectQuery = 'SELECT * FROM jobs WHERE id = ?';
    const selectStmt = this.db.prepare(selectQuery);
    const row = selectStmt.get(result.lastInsertRowid) as DatabaseJob;
    
    return {
      id: row.id,
      name: row.name,
      data: JSON.parse(row.data),
      attempts: row.attempts,
      status: row.status,
      created_at: row.created_at,
      queue_name: row.queue_name
    };
  }

  // Internal method to get waiting jobs (used by Worker)
  getWaitingJobs(limit: number = 1): Job[] {
    const selectQuery = `
      SELECT * FROM jobs 
      WHERE queue_name = ? AND status = 'waiting'
      ORDER BY created_at ASC
      LIMIT ?
    `;
    
    const stmt = this.db.prepare(selectQuery);
    const rows = stmt.all(this.queueName, limit) as DatabaseJob[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      data: JSON.parse(row.data),
      attempts: row.attempts,
      status: row.status,
      created_at: row.created_at,
      queue_name: row.queue_name
    }));
  }

  // Internal method to update job status
  updateJobStatus(jobId: number, status: JobStatus, attempts?: number): void {
    let updateQuery: string;
    let params: any[];
    
    if (attempts !== undefined) {
      updateQuery = 'UPDATE jobs SET status = ?, attempts = ? WHERE id = ?';
      params = [status, attempts, jobId];
    } else {
      updateQuery = 'UPDATE jobs SET status = ? WHERE id = ?';
      params = [status, jobId];
    }
    
    const stmt = this.db.prepare(updateQuery);
    stmt.run(...params);
  }

  // Internal method to delete completed jobs
  deleteJob(jobId: number): void {
    const deleteQuery = 'DELETE FROM jobs WHERE id = ?';
    const stmt = this.db.prepare(deleteQuery);
    stmt.run(jobId);
  }

  // Get database instance for Worker class
  getDatabase(): Database {
    return this.db;
  }

  // Get queue statistics
  getStats(): { waiting: number; processing: number; failed: number; completed: number } {
    const statsQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM jobs 
      WHERE queue_name = ?
      GROUP BY status
    `;
    
    const stmt = this.db.prepare(statsQuery);
    const rows = stmt.all(this.queueName) as { status: string; count: number }[];
    
    const stats = { waiting: 0, processing: 0, failed: 0, completed: 0 };
    rows.forEach(row => {
      if (row.status in stats) {
        stats[row.status as keyof typeof stats] = row.count;
      }
    });
    
    return stats;
  }

  // Get all jobs in the queue with optional status filter
  getJobs(status?: JobStatus, limit: number = 100): Job[] {
    let selectQuery = `
      SELECT * FROM jobs 
      WHERE queue_name = ?
    `;
    const params: any[] = [this.queueName];
    
    if (status) {
      selectQuery += ' AND status = ?';
      params.push(status);
    }
    
    selectQuery += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    
    const stmt = this.db.prepare(selectQuery);
    const rows = stmt.all(...params) as DatabaseJob[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      data: JSON.parse(row.data),
      attempts: row.attempts,
      status: row.status,
      created_at: row.created_at,
      queue_name: row.queue_name
    }));
  }

  // Retry a failed job
  retryJob(jobId: number): boolean {
    const selectQuery = 'SELECT * FROM jobs WHERE id = ? AND queue_name = ?';
    const selectStmt = this.db.prepare(selectQuery);
    const job = selectStmt.get(jobId, this.queueName) as DatabaseJob;
    
    if (!job) {
      return false;
    }
    
    // Reset job to waiting status and reset attempts
    const updateQuery = 'UPDATE jobs SET status = "waiting", attempts = 0 WHERE id = ?';
    const updateStmt = this.db.prepare(updateQuery);
    updateStmt.run(jobId);
    
    return true;
  }

  // Delete a specific job
  deleteSpecificJob(jobId: number): boolean {
    const selectQuery = 'SELECT * FROM jobs WHERE id = ? AND queue_name = ?';
    const selectStmt = this.db.prepare(selectQuery);
    const job = selectStmt.get(jobId, this.queueName);
    
    if (!job) {
      return false;
    }
    
    const deleteQuery = 'DELETE FROM jobs WHERE id = ?';
    const deleteStmt = this.db.prepare(deleteQuery);
    deleteStmt.run(jobId);
    
    return true;
  }

  // Get all queue names from database
  static getAllQueueNames(dbPath?: string): string[] {
    const db = new Database(dbPath || path.join(process.cwd(), 'queue.sqlite'));
    
    try {
      const query = 'SELECT DISTINCT queue_name FROM jobs';
      const stmt = db.prepare(query);
      const rows = stmt.all() as { queue_name: string }[];
      return rows.map(row => row.queue_name);
    } finally {
      db.close();
    }
  }

  // Cleanup old jobs based on status and age
  cleanupOldJobs(status: JobStatus, olderThanHours: number, batchSize: number = 1000, dryRun: boolean = false): number {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);
    
    let totalCleaned = 0;
    let hasMore = true;
    
    while (hasMore) {
      // Get batch of jobs to clean
      const selectQuery = `
        SELECT id FROM jobs 
        WHERE queue_name = ? AND status = ? AND created_at < ?
        LIMIT ?
      `;
      
      const selectStmt = this.db.prepare(selectQuery);
      const jobs = selectStmt.all(this.queueName, status, cutoffTime.toISOString(), batchSize) as { id: number }[];
      
      if (jobs.length === 0) {
        hasMore = false;
        break;
      }
      
      if (!dryRun) {
        // Delete jobs in batch
        const jobIds = jobs.map(job => job.id);
        const placeholders = jobIds.map(() => '?').join(',');
        const deleteQuery = `DELETE FROM jobs WHERE id IN (${placeholders})`;
        const deleteStmt = this.db.prepare(deleteQuery);
        deleteStmt.run(...jobIds);
      }
      
      totalCleaned += jobs.length;
      
      // If we got fewer jobs than batch size, we're done
      if (jobs.length < batchSize) {
        hasMore = false;
      }
    }
    
    return totalCleaned;
  }

  // Get cleanup statistics for this queue
  getCleanupStats(): {
    totalJobs: number;
    jobsByStatus: { [key: string]: number };
    oldestJob: string | null;
    newestJob: string | null;
    queueSizeBytes: number;
  } {
    // Get total jobs and jobs by status
    const statsQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM jobs 
      WHERE queue_name = ?
      GROUP BY status
    `;
    
    const statsStmt = this.db.prepare(statsQuery);
    const statusRows = statsStmt.all(this.queueName) as { status: string; count: number }[];
    
    const jobsByStatus: { [key: string]: number } = {};
    let totalJobs = 0;
    
    statusRows.forEach(row => {
      jobsByStatus[row.status] = row.count;
      totalJobs += row.count;
    });
    
    // Get oldest and newest job timestamps
    const timeQuery = `
      SELECT 
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM jobs 
      WHERE queue_name = ?
    `;
    
    const timeStmt = this.db.prepare(timeQuery);
    const timeResult = timeStmt.get(this.queueName) as { oldest: string | null; newest: string | null };
    
    // Estimate queue size (rough calculation)
    const sizeQuery = `
      SELECT 
        SUM(LENGTH(data) + LENGTH(name) + 100) as estimated_size
      FROM jobs 
      WHERE queue_name = ?
    `;
    
    const sizeStmt = this.db.prepare(sizeQuery);
    const sizeResult = sizeStmt.get(this.queueName) as { estimated_size: number | null };
    
    return {
      totalJobs,
      jobsByStatus,
      oldestJob: timeResult.oldest,
      newestJob: timeResult.newest,
      queueSizeBytes: sizeResult.estimated_size || 0
    };
  }

  // Get jobs older than specified hours
  getOldJobs(status: JobStatus, olderThanHours: number, limit: number = 100): Job[] {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);
    
    const selectQuery = `
      SELECT * FROM jobs 
      WHERE queue_name = ? AND status = ? AND created_at < ?
      ORDER BY created_at ASC
      LIMIT ?
    `;
    
    const stmt = this.db.prepare(selectQuery);
    const rows = stmt.all(this.queueName, status, cutoffTime.toISOString(), limit) as DatabaseJob[];
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      data: JSON.parse(row.data),
      attempts: row.attempts,
      status: row.status,
      created_at: row.created_at,
      queue_name: row.queue_name
    }));
  }

  // Recover orphaned processing jobs (reset to waiting status)
  recoverOrphanedJobs(): number {
    const updateQuery = `
      UPDATE jobs 
      SET status = 'waiting' 
      WHERE queue_name = ? AND status = 'processing'
    `;
    
    const stmt = this.db.prepare(updateQuery);
    const result = stmt.run(this.queueName);
    
    const recoveredCount = result.changes;
    if (recoveredCount > 0) {
      console.log(`Recovered ${recoveredCount} orphaned processing jobs in queue: ${this.queueName}`);
    }
    
    return recoveredCount;
  }

  // Close database connection
  close(): void {
    this.db.close();
  }
}