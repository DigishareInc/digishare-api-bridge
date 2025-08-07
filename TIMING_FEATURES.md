# ⏱️ Timing Features Documentation

This document describes the comprehensive timing measurements implemented in the Digishare API Bridge.

## 🎯 Overview

The API bridge now includes detailed timing measurements for:

1. **Total Elysia Request Execution Time** - Complete request lifecycle
2. **makeHttpRequest Execution Time** - External API call duration  
3. **Data Transformation Time** - Time spent processing/transforming data
4. **Individual Operation Timing** - Granular timing for different operations

## 📊 Timing Measurements

### 1. Health Check Endpoint (`GET /`)

**Response includes:**
```json
{
  "service": "Digishare API Bridge",
  "status": "running", 
  "timestamp": "2025-08-07T12:56:19.362Z",
  "timing": {
    "responseTime": 0.01
  }
}
```

### 2. Webhook Endpoints

#### Ticket Created (`POST /webhook/ticket-created`)

**Success Response includes:**
```json
{
  "success": true,
  "message": "Event processed successfully",
  "ticketId": "ticket-123",
  "targetServer": "https://api.example.com",
  "timing": {
    "dataTransformationTime": 1.25,
    "externalApiCallTime": 150.75,
    "totalExecutionTime": 152.50
  }
}
```

#### Ticket Updated (`POST /webhook/ticket-updated`)

**Success Response includes:**
```json
{
  "success": true,
  "message": "Event processed",
  "ticketId": "ticket-123",
  "targetServer": "https://api.example.com",
  "results": {
    "leadUpdate": {
      "success": true,
      "data": "OK",
      "executionTime": 145.30
    }
  },
  "timing": {
    "dataTransformationTime": 2.10,
    "externalApiCallTime": 145.30,
    "totalExecutionTime": 148.75
  }
}
```

## 🔧 Implementation Details

### Request Lifecycle Timing

The middleware tracks the complete request lifecycle:

```typescript
// Request start
.onRequest(({ request, store }) => {
  (store as any).requestStartTime = performance.now();
  logger.info(`${request.method} ${url.pathname} - Request started`);
})

// Request completion
.onAfterHandle(({ request, store, response }) => {
  const executionTime = performance.now() - startTime;
  logger.info(`${request.method} ${url.pathname} - Request completed (${executionTime.toFixed(2)}ms)`);
})
```

### HTTP Request Timing

External API calls are timed using `performance.now()`:

```typescript
export async function makeHttpRequest(url, init) {
  const startTime = performance.now();
  
  try {
    const response = await fetch(url, init);
    const executionTime = performance.now() - startTime;
    
    return {
      success: true,
      data: await response.text(),
      executionTime
    };
  } catch (error) {
    const executionTime = performance.now() - startTime;
    return {
      success: false,
      error: error.message,
      executionTime
    };
  }
}
```

### Operation-Level Timing

Individual operations within endpoints are timed:

```typescript
// Data transformation timing
const transformStartTime = performance.now();
const leadParams = transformToCreateLead(event, env.TARGET_API_KEY);
const queryString = buildQueryString(leadParams);
const transformTime = performance.now() - transformStartTime;

// Total operation timing
const operationStartTime = performance.now();
// ... operations ...
const totalTime = performance.now() - operationStartTime;
```

## 🛠️ Utility Classes

### Timer Class

A utility class for easy timing measurements:

```typescript
import { Timer } from './utils';

// Basic usage
const timer = new Timer();
// ... do work ...
const elapsed = timer.elapsed(); // Returns time in milliseconds

// Measure async operations
const { result, executionTime } = await Timer.measure(async () => {
  return await someAsyncOperation();
});
```

## 📈 Performance Monitoring

### Log Output Examples

```
[INFO] 2025-08-07T12:55:02.374Z - GET / - Request started
[INFO] 2025-08-07T12:55:02.375Z - GET / - Request completed (0.85ms)

[INFO] 2025-08-07T12:55:10.123Z - POST /webhook/ticket-created - Request started
[INFO] 2025-08-07T12:55:10.125Z - Making POST request to: https://api.example.com/Api/Leads/CreateNewLead
[INFO] 2025-08-07T12:55:10.275Z - Request successful: 200 (took 150.25ms)
[INFO] 2025-08-07T12:55:10.276Z - Successfully forwarded ticket.created event {"timing":{"transformTime":1.25,"httpRequestTime":150.25,"totalTime":152.50}}
[INFO] 2025-08-07T12:55:10.277Z - POST /webhook/ticket-created - Request completed (154.75ms)
```

## 🎯 Benefits

1. **Performance Monitoring** - Track API response times and identify bottlenecks
2. **Debugging** - Understand where time is spent in request processing
3. **SLA Monitoring** - Ensure external API calls meet performance requirements
4. **Optimization** - Identify slow operations for optimization
5. **Transparency** - Provide timing information to API consumers

## 🔍 Usage Tips

1. **Monitor External API Performance** - Use `externalApiCallTime` to track third-party API performance
2. **Optimize Data Transformation** - Use `dataTransformationTime` to identify slow transformation logic
3. **Track Total Request Time** - Use `totalExecutionTime` for end-to-end performance monitoring
4. **Set Performance Alerts** - Monitor timing values and alert when thresholds are exceeded

## 🧪 Testing

Use the included test script to verify timing functionality:

```bash
node test-timing.js
```

This will test the health endpoint and demonstrate the timing response structure.