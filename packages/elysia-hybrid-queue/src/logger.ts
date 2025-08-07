/**
 * Simple logger for the hybrid-queue plugin
 */
export const logger = {
  info: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] [hybrid-queue] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  
  error: (message: string, error?: any) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] [hybrid-queue] ${message}`, error);
  },
  
  warn: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] [hybrid-queue] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  
  debug: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    console.debug(`[${timestamp}] [DEBUG] [hybrid-queue] ${message}`, meta ? JSON.stringify(meta) : '');
  }
};