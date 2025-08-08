# Elysia Hybrid Queue Plugin

A powerful and easy-to-use Elysia plugin for queue management with built-in admin UI, cleanup service, and comprehensive API endpoints.

## Features

- 🚀 **Easy Integration**: Simple `.use()` plugin integration with Elysia
- 🎛️ **Admin UI**: Built-in web interface for queue management
- 🔧 **Configurable**: Customizable database path, route prefix, and cleanup settings
- 🧹 **Auto Cleanup**: Automatic cleanup of old jobs with configurable retention
- 📊 **Statistics**: Real-time queue statistics and monitoring
- 🛡️ **Error Handling**: Robust error handling with custom error types
- 🔒 **Type Safe**: Full TypeScript support with comprehensive type definitions
- 🌐 **CORS Support**: Configurable CORS settings for API endpoints

## Installation

```bash
npm install elysia-hybrid-queue
# or
yarn add elysia-hybrid-queue
# or
pnpm add elysia-hybrid-queue
```

## Quick Start

```typescript
import { Elysia } from 'elysia';
import { hybridQueuePlugin } from 'elysia-hybrid-queue';

const app = new Elysia()
  .use(hybridQueuePlugin())
  .listen(3000);

console.log('Server running on http://localhost:3000');
console.log('Queue Admin UI: http://localhost:3000/queue/admin');
```

## Configuration

### Basic Configuration

```typescript
import { hybridQueuePlugin } from 'elysia-hybrid-queue';

const app = new Elysia()
  .use(hybridQueuePlugin({
    databasePath: './data/queues.db',
    routePrefix: '/api/queue',
    enableUI: true,
    enableAPI: true
  }))
  .listen(3000);
```

### Advanced Configuration

```typescript
import { hybridQueuePlugin } from 'elysia-hybrid-queue';

const app = new Elysia()
  .use(hybridQueuePlugin({
    databasePath: './data/queues.db',
    routePrefix: '/queue',
    enableUI: true,
    enableAPI: true,
    cleanup: {
      intervalMinutes: 30,
      retentionCompletedHours: 24,
      retentionFailedHours: 72,
      dryRun: false,
      batchSize: 100
    },
    queue: {
      pollingIntervalMs: 1000,
      maxRetries: 3,
      retryDelayMs: 5000
    },
    cors: {
      origin: ['http://localhost:3000'],
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type']
    },
    auth: {
      enabled: true,
      adminKey: 'your-secure-admin-key-here',
      sessionTimeout: 7200000 // 2 hours
    }
  }))
  .listen(3000);
```

## Configuration Options

### `HybridQueuePluginOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `databasePath` | `string` | `'./queue.db'` | Path to SQLite database file |
| `routePrefix` | `string` | `'/queue'` | Prefix for all plugin routes |
| `enableUI` | `boolean` | `true` | Enable admin UI interface |
| `enableAPI` | `boolean` | `true` | Enable API endpoints |
| `cleanup` | `CleanupOptions` | See below | Cleanup service configuration |
| `queue` | `QueueOptions` | See below | Queue behavior configuration |
| `cors` | `CorsOptions` | `undefined` | CORS configuration |
| `auth` | `AuthOptions` | See below | Authentication configuration |

### `CleanupOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `intervalMinutes` | `number` | `60` | Cleanup interval in minutes |
| `retentionCompletedHours` | `number` | `24` | Hours to keep completed jobs |
| `retentionFailedHours` | `number` | `72` | Hours to keep failed jobs |
| `dryRun` | `boolean` | `false` | Run cleanup in dry-run mode |
| `batchSize` | `number` | `100` | Number of jobs to process per batch |

### `QueueOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pollingIntervalMs` | `number` | `1000` | Job polling interval in milliseconds |
| `maxRetries` | `number` | `3` | Maximum retry attempts for failed jobs |
| `retryDelayMs` | `number` | `5000` | Delay between retries in milliseconds |

### `AuthOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable authentication for admin UI |
| `adminKey` | `string` | `'admin-queue-2024-secure-key'` | Admin key for authentication (CHANGE IN PRODUCTION) |
| `sessionTimeout` | `number` | `3600000` | Session timeout in milliseconds (1 hour) |

> **Security Note**: Authentication is enabled by default for security. Always change the default `adminKey` in production environments to a secure, unique value.

## API Endpoints

When `enableAPI` is true, the following endpoints are available:

### Queue Management

- `GET {routePrefix}/api/queues` - Get all queues and their statistics
- `GET {routePrefix}/api/queues/:name/jobs` - Get jobs for a specific queue
  - Query params: `status` (pending|processing|completed|failed), `limit` (number)
- `POST {routePrefix}/api/queues/:name/jobs/:id/retry` - Retry a failed job
- `DELETE {routePrefix}/api/queues/:name/jobs/:id` - Delete a specific job

### Cleanup Management

- `GET {routePrefix}/api/cleanup/status` - Get cleanup service status
- `POST {routePrefix}/api/cleanup/trigger` - Manually trigger cleanup
  - Body: `{ "dryRun": boolean }`
- `GET {routePrefix}/api/cleanup/stats` - Get cleanup statistics
- `GET {routePrefix}/api/cleanup/queues/:name/old-jobs` - Get old jobs for cleanup
  - Query params: `status`, `hours`, `limit`

### Authentication

- `POST {routePrefix}/api/auth/login` - Login with admin key
  - Body: `{ "adminKey": string }`
- `POST {routePrefix}/api/auth/logout` - Logout and clear session
- `GET {routePrefix}/api/auth/status` - Check authentication status

### Admin UI

- `GET {routePrefix}/admin` - Queue management web interface (requires authentication)

## Usage Examples

### Using with Existing Queue System

```typescript
import { Elysia } from 'elysia';
import { hybridQueuePlugin } from 'elysia-hybrid-queue';
import { Queue } from 'hybrid-queue';

const app = new Elysia()
  .use(hybridQueuePlugin({
    databasePath: './data/queues.db',
    routePrefix: '/queue'
  }))
  .post('/api/send-email', async ({ body }) => {
    // Add job to queue
    const emailQueue = new Queue('email');
    const jobId = await emailQueue.add('send-email', {
      to: body.email,
      subject: body.subject,
      content: body.content
    });
    emailQueue.close();
    
    return { success: true, jobId };
  })
  .listen(3000);
```

### Custom Error Handling

```typescript
import { hybridQueuePlugin } from 'elysia-hybrid-queue';

const app = new Elysia()
  .use(hybridQueuePlugin())
  .onError(({ error, code }) => {
    if (error.name === 'QueueOperationError') {
      return {
        success: false,
        error: 'Queue operation failed',
        details: error.message
      };
    }
    
    return {
      success: false,
      error: 'Internal server error'
    };
  })
  .listen(3000);
```

### Production Setup

```typescript
import { Elysia } from 'elysia';
import { hybridQueuePlugin } from 'elysia-hybrid-queue';

const app = new Elysia()
  .use(hybridQueuePlugin({
    databasePath: process.env.QUEUE_DB_PATH || './data/production-queues.db',
    routePrefix: '/internal/queue',
    enableUI: process.env.NODE_ENV !== 'production',
    enableAPI: true,
    cleanup: {
      intervalMinutes: 15, // More frequent cleanup
      retentionCompletedHours: 12, // Shorter retention
      retentionFailedHours: 48,
      batchSize: 500 // Larger batches
    },
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }
  }))
  .listen(process.env.PORT || 3000);
```

## Error Types

The plugin provides custom error types for better error handling:

- `HybridQueuePluginError` - Base error class
- `ConfigurationError` - Configuration validation errors
- `QueueOperationError` - Queue operation failures
- `CleanupError` - Cleanup service errors

## TypeScript Support

The plugin is fully typed with TypeScript. Import types as needed:

```typescript
import type {
  HybridQueuePluginOptions,
  QueueStats,
  CleanupStats,
  JobData,
  CleanupResult
} from 'elysia-hybrid-queue';
```

## Development

### Building the Plugin

```bash
cd packages/elysia-hybrid-queue
npm run build
```

### Running Tests

```bash
npm test
```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.