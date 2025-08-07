import { Elysia } from 'elysia';

// Logger utility
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data ? JSON.stringify(data) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
  }
};

// Request logging middleware
export const requestLogger = (app: Elysia) => app
  .onRequest(({ request }) => {
    const url = new URL(request.url);
    logger.info(`${request.method} ${url.pathname}`);
  });

// Error handling middleware
export const errorHandler = (app: Elysia) => app
  .onError(({ error, code }) => {
    logger.error(`Error ${code}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code
    };
  });

// API Key authentication middleware
export const apiKeyAuth = (apiKey: string) => (app: Elysia) => app
  .onBeforeHandle(({ headers, set }) => {
    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.includes(apiKey)) {
      logger.warn('Unauthorized request - invalid or missing API key');
      set.status = 401;
      return {
        success: false,
        error: 'Unauthorized'
      };
    }
  });

export { logger };