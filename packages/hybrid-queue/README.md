# Hybrid Queue

A BullMQ-inspired job queue package for Bun using SQLite. This is an MVP implementation that provides a simple, reliable job queue system without external dependencies.

## Features

- 🚀 **Bun Native**: Built specifically for Bun runtime using `bun:sqlite`
- 📦 **Zero Dependencies**: Uses only Bun's built-in SQLite module
- 🔄 **BullMQ-Inspired API**: Familiar interface for easy migration
- ⚡ **Fast Polling**: 1-second polling interval for responsive job processing
- 🔁 **Automatic Retries**: Built-in retry logic with configurable attempts (default: 3)
- 💾 **Persistent Storage**: SQLite-backed job persistence
- 🛡️ **Type Safe**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
bun add hybrid-queue
```

## Quick Start

```typescript
import { Queue, Worker } from 'hybrid-queue';

// Create a queue
const emailQueue = new Queue('email');

// Add jobs to the queue
await emailQueue.add('send_welcome_email', {
  to: 'user@example.com',
  name: 'John Doe'
});

await emailQueue.add('send_notification', {
  to: 'admin@example.com',
  message: 'New user registered'
});

// Create a worker to process jobs
const worker = new Worker('email', async (job) => {
  console.log(`Processing ${job.name} for:`, job.data);
  
  // Simulate email sending
  if (job.name === 'send_welcome_email') {
    console.log(`Sending welcome email to ${job.data.to}`);
    // Your email sending logic here
  } else if (job.name === 'send_notification') {
    console.log(`Sending notification: ${job.data.message}`);
    // Your notification logic here
  }
  
  // Job completed successfully
});

// The worker will automatically start processing jobs
console.log('Worker started, processing jobs...');
```

## API Reference

### Queue

The `Queue` class is responsible for adding jobs to the queue.

#### Constructor

```typescript
const queue = new Queue(name: string)
```

- `name`: The name of the queue

#### Methods

##### `add(name: string, data: any): Promise<void>`

Adds a new job to the queue.

```typescript
await queue.add('process_image', {
  imageUrl: 'https://example.com/image.jpg',
  userId: 123
});
```

- `name`: The job name/type
- `data`: Any serializable data for the job

### Worker

The `Worker` class processes jobs from a specific queue.

#### Constructor

```typescript
const worker = new Worker(queueName: string, handler: JobHandler)
```

- `queueName`: The name of the queue to process
- `handler`: An async function that processes jobs

#### Methods

##### `stop(): void`

Stops the worker from processing new jobs.

```typescript
worker.stop();
```

##### `getStatus(): { isRunning: boolean; queueName: string }`

Returns the current status of the worker.

```typescript
const status = worker.getStatus();
console.log(`Worker is ${status.isRunning ? 'running' : 'stopped'}`);
```

##### `close(): void`

Stops the worker and closes the database connection.

```typescript
worker.close();
```

### Job

The job object passed to your handler function.

```typescript
interface Job {
  id: number;           // Unique job ID
  name: string;         // Job name/type
  data: any;           // Job data
  attempts: number;     // Number of processing attempts
  status: JobStatus;    // Current job status
  created_at: string;   // ISO timestamp when job was created
  queue_name: string;   // Name of the queue
}

type JobStatus = 'waiting' | 'processing' | 'completed' | 'failed';
```

## Advanced Usage

### Error Handling and Retries

Jobs that throw errors will be automatically retried up to 3 times:

```typescript
const worker = new Worker('risky-jobs', async (job) => {
  if (Math.random() < 0.5) {
    throw new Error('Random failure!');
  }
  
  console.log('Job succeeded!');
});
```

### Multiple Workers

You can create multiple workers for the same queue:

```typescript
const worker1 = new Worker('heavy-tasks', processHeavyTask);
const worker2 = new Worker('heavy-tasks', processHeavyTask);

// Both workers will process jobs from the same queue
```

### Different Queue Types

```typescript
// Email queue
const emailQueue = new Queue('email');
const emailWorker = new Worker('email', processEmail);

// Image processing queue
const imageQueue = new Queue('images');
const imageWorker = new Worker('images', processImage);

// Notification queue
const notificationQueue = new Queue('notifications');
const notificationWorker = new Worker('notifications', sendNotification);
```

### Graceful Shutdown

```typescript
// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down workers...');
  worker.close();
  process.exit(0);
});
```

## Database

Hybrid Queue uses SQLite for persistence. The database file `queue.sqlite` will be created in your project root directory.

### Schema

The jobs table structure:

```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  data TEXT NOT NULL,           -- JSON string
  attempts INTEGER DEFAULT 0,
  status TEXT DEFAULT 'waiting',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  queue_name TEXT NOT NULL
);
```

## Configuration

### Polling Interval

Currently set to 1 second. This will be configurable in future versions.

### Max Attempts

Currently set to 3 attempts. This will be configurable in future versions.

## Roadmap

- [ ] Configurable polling intervals
- [ ] Configurable retry attempts
- [ ] Delayed jobs
- [ ] Job priorities
- [ ] Rate limiting
- [ ] Job progress tracking
- [ ] Dead letter queues
- [ ] Job scheduling (cron-like)
- [ ] Queue metrics and monitoring

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.