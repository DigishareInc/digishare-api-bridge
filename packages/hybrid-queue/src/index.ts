// Main exports for hybrid-queue package
export { Queue } from './Queue';
export { Worker } from './Worker';
export type { Job, JobStatus, JobHandler } from './Job';

// Import for default export
import { Queue } from './Queue';
import { Worker } from './Worker';

// Package version and info
export const version = '1.0.0';
export const name = 'hybrid-queue';

// Default export for convenience
export default {
  Queue,
  Worker,
  version,
  name
};