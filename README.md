# Digishare API Bridge

> A robust, scalable webhook processing system that bridges Digishare API events with external services and APIs.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Elysia](https://img.shields.io/badge/Elysia-000000?style=flat&logo=elysia&logoColor=white)](https://elysiajs.com/)
[![Bun](https://img.shields.io/badge/Bun-000000?style=flat&logo=bun&logoColor=white)](https://bun.sh/)

## 🚀 Overview

The Digishare API Bridge is a high-performance webhook processing system designed to seamlessly connect Digishare events with external APIs and services. Built with modern TypeScript and powered by Elysia, it provides reliable, scalable, and maintainable webhook processing with advanced queue management.

### Key Features

- **🔄 Webhook Processing**: Reliable handling of Digishare `ticket.created` and `ticket.updated` events
- **📊 Queue Management**: Advanced job queuing with retry logic, monitoring, and admin interface
- **🔐 Security**: API key authentication and request validation
- **📈 Scalability**: Built-in concurrency control and performance optimization
- **🎯 Flexibility**: Easy customization for different APIs and business requirements
- **📱 Admin Interface**: Web-based queue monitoring with dark mode support
- **🔧 Developer Experience**: Comprehensive logging, error handling, and debugging tools

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [API Documentation](#-api-documentation)
- [Configuration](#-configuration)
- [Queue Management](#-queue-management)
- [Customization](#-customization)
- [Deployment](#-deployment)
- [Monitoring](#-monitoring)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## ⚡ Quick Start

### Prerequisites

- **Bun** >= 1.0.0 ([Install Bun](https://bun.sh/docs/installation))
- **Node.js** >= 18.0.0 (for compatibility)
- External API endpoint for webhook forwarding

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd api_bridge2

# Install dependencies
bun install
```

### 2. Environment Configuration

```bash
# Copy environment template
copy .env.example .env

# Edit .env with your configuration
notepad .env
```

**Required Environment Variables:**

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Authentication
API_KEY=your_secure_api_key_here
ADMIN_KEY=your_admin_key_here

# Target API Configuration
TARGET_API_KEY=your_target_api_key
TARGET_BASE_URL=https://your-target-api.com
```

### 3. Start the Service

```bash
# Development mode with hot reload
bun run dev

# Production mode
bun run start
```

### 4. Verify Installation

```bash
# Test the health endpoint
curl http://localhost:3000/

# Access admin interface
# Open http://localhost:3000/queue in your browser
# Use your ADMIN_KEY for authentication
```

## 📡 API Documentation

### Webhook Endpoints

#### POST `/webhook/ticket-created`

Processes Digishare ticket creation events.

**Headers:**
```
Content-Type: application/json
X-API-Key: your_api_key
```

**Request Body:**
```json
{
  "event": "ticket.created",
  "data": {
    "id": "ticket_123",
    "channel_id": "web",
    "comment": "User inquiry about services",
    "created_at": "2024-01-15T10:30:00Z",
    "information": {
      "id_lead": "lead_456",
      "id_projet": "project_789",
      "third": {
        "name": "John Doe",
        "email": "john@example.com",
        "mobile": "+1234567890"
      },
      "utm_source": "google",
      "utm_campaign": "summer_campaign"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook received and queued"
}
```

#### POST `/webhook/ticket-updated`

Processes Digishare ticket update events.

**Headers & Body:** Same format as ticket-created

### Admin Endpoints

#### GET `/queue`

Access the web-based admin interface for queue monitoring.

**Authentication:** Requires `ADMIN_KEY` via query parameter or form login.

**Features:**
- Real-time queue status monitoring
- Job details and history
- Manual cleanup controls
- Dark mode interface
- Automatic logout on authentication errors

### Health Check

#### GET `/`

Returns service health status.

**Response:**
```json
{
  "message": "Digishare API Bridge is running",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0"
}
```

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `API_KEY` | Yes | - | Webhook authentication key |
| `ADMIN_KEY` | Yes | - | Admin interface access key |
| `TARGET_API_KEY` | Yes | - | External API authentication |
| `TARGET_BASE_URL` | Yes | - | External API base URL |

### Queue Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `QUEUE_CLEANUP_ENABLED` | `true` | Enable automatic cleanup |
| `QUEUE_CLEANUP_INTERVAL_HOURS` | `24` | Cleanup interval |
| `QUEUE_CLEANUP_COMPLETED_JOBS_RETENTION_HOURS` | `168` | Keep completed jobs (7 days) |
| `QUEUE_CLEANUP_FAILED_JOBS_RETENTION_HOURS` | `720` | Keep failed jobs (30 days) |

### Advanced Configuration

For detailed configuration options, see:
- [Configuration Guide](/.trae/documents/CONFIGURATION_GUIDE.md)
- [Configuration Reference](/.trae/documents/CONFIGURATION_REFERENCE.md)

## 🔄 Queue Management

### Queue Types

- **ticket-created**: Processes new ticket events
- **ticket-updated**: Processes ticket update events

### Queue Features

- **Automatic Retry**: Failed jobs are retried with exponential backoff
- **Concurrency Control**: Configurable parallel job processing
- **Dead Letter Queue**: Failed jobs are preserved for analysis
- **Cleanup Automation**: Automatic removal of old completed jobs
- **Real-time Monitoring**: Web interface for queue status

### Admin Interface

Access the admin interface at `http://localhost:3000/queue`

**Features:**
- 📊 Queue statistics and job counts
- 🔍 Job details and error logs
- 🧹 Manual cleanup controls
- 🌙 Dark mode support
- 🔐 Secure authentication
- 📱 Responsive design

## 🎨 Customization

### Core Files

- **`src/types.ts`**: Define API parameter interfaces
- **`src/transformer.ts`**: Data transformation logic
- **`src/services/webhookQueue.ts`**: Queue handlers and processing

### Adding New Integrations

1. **Define Types** in `src/types.ts`:
```typescript
export interface NewAPIParams {
  apiKey: string;
  data: any;
  // Add your fields
}
```

2. **Create Transformer** in `src/transformer.ts`:
```typescript
export function transformToNewAPI(
  event: DigishareTicketCreatedEvent,
  apiKey: string
): NewAPIParams {
  // Transform logic here
}
```

3. **Add Queue Handler** in `src/services/webhookQueue.ts`:
```typescript
export const newAPIQueue = new Queue('new-api');
// Add handler implementation
```

### Detailed Customization Guides

- [Customization Guide](/.trae/documents/CUSTOMIZATION_GUIDE.md) - Complete customization instructions
- [Integration Examples](/.trae/documents/INTEGRATION_EXAMPLES.md) - Real-world integration examples
- [Troubleshooting Guide](/.trae/documents/TROUBLESHOOTING_GUIDE.md) - Common issues and solutions

## 🚀 Deployment

### Docker Deployment

```dockerfile
# Dockerfile
FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN bun run build

# Expose port
EXPOSE 3000

# Start application
CMD ["bun", "run", "start"]
```

```bash
# Build and run
docker build -t api-bridge .
docker run -p 3000:3000 --env-file .env api-bridge
```

### Docker Compose

```yaml
version: '3.8'
services:
  api-bridge:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Production Considerations

- Use process managers (PM2, systemd)
- Configure reverse proxy (nginx, Apache)
- Set up monitoring and logging
- Implement backup strategies
- Configure SSL/TLS certificates

For detailed deployment guides, see [Deployment Guide](/.trae/documents/DEPLOYMENT_GUIDE.md).

## 📊 Monitoring

### Logging

The application provides comprehensive logging:

- **Request Logging**: All incoming requests
- **Job Processing**: Queue job execution details
- **Error Tracking**: Detailed error information
- **Performance Metrics**: Processing times and throughput

### Health Checks

- **Service Health**: `GET /` endpoint
- **Queue Health**: Admin interface monitoring
- **Job Status**: Real-time job processing status

### Metrics

- Job processing rates
- Queue sizes and wait times
- Error rates and types
- API response times

## 🔧 Troubleshooting

### Common Issues

#### 1. Webhook Authentication Errors

**Problem**: 401 Unauthorized responses

**Solution**:
```bash
# Verify API key configuration
echo $API_KEY

# Test with curl
curl -H "X-API-Key: your_api_key" http://localhost:3000/webhook/ticket-created
```

#### 2. Queue Processing Failures

**Problem**: Jobs stuck in queue

**Solution**:
1. Check admin interface at `/queue`
2. Review error logs
3. Verify external API connectivity
4. Check environment variables

#### 3. External API Connection Issues

**Problem**: Target API unreachable

**Solution**:
```bash
# Test API connectivity
curl -v $TARGET_BASE_URL

# Verify API key
echo $TARGET_API_KEY
```

### Debug Mode

```bash
# Enable debug logging
NODE_ENV=development bun run dev

# Check logs
tail -f logs/app.log
```

### Getting Help

1. Check the [Troubleshooting Guide](/.trae/documents/TROUBLESHOOTING_GUIDE.md)
2. Review application logs
3. Test with the admin interface
4. Verify configuration settings

## 🤝 Contributing

### Development Setup

```bash
# Clone repository
git clone <repository-url>
cd api_bridge2

# Install dependencies
bun install

# Start development server
bun run dev
```

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add comprehensive error handling
- Include logging for debugging
- Write tests for new features

### Testing

```bash
# Run tests
bun test

# Run with coverage
bun test --coverage
```

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Update documentation
6. Submit a pull request

### Project Structure

```
api_bridge2/
├── src/
│   ├── core/           # Core configuration and utilities
│   ├── services/       # Queue handlers and business logic
│   ├── types.ts        # Type definitions
│   ├── transformer.ts  # Data transformation logic
│   └── index.ts        # Main application entry
├── packages/           # Local packages
│   ├── elysia-hybrid-queue/  # Queue management package
│   └── hybrid-queue/         # Core queue implementation
├── .trae/documents/    # Documentation
└── README.md          # This file
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Elysia](https://elysiajs.com/) - Fast and friendly web framework
- [Bun](https://bun.sh/) - Fast JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript

---

**Need help?** Check our [documentation](/.trae/documents/) or open an issue for support.

**Ready to customize?** Start with the [Customization Guide](/.trae/documents/CUSTOMIZATION_GUIDE.md).

**Deploying to production?** Follow our [Deployment Guide](/.trae/documents/DEPLOYMENT_GUIDE.md).
