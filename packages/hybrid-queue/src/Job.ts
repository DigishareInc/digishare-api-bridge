export interface Job {
  id: number;
  name: string;
  data: any;
  attempts: number;
  status: JobStatus;
  created_at: string;
  queue_name: string;
}

export type JobStatus = 'waiting' | 'processing' | 'completed' | 'failed';

export interface JobHandler<T = any> {
  (job: Job & { data: T }): Promise<void>;
}

export interface DatabaseJob {
  id: number;
  name: string;
  data: string; // JSON string in database
  attempts: number;
  status: JobStatus;
  created_at: string;
  queue_name: string;
}