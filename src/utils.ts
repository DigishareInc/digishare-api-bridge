import { logger } from './middleware';

// HTTP client utility
export async function makeHttpRequest(url: string | URL | globalThis.Request, init?: RequestInit): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    logger.info(`Making ${init?.method} request to: ${url}`);
    
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Digishare-API-Bridge/1.0',
        ...init?.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`HTTP ${response.status}: ${errorText}`);
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.text();
    logger.info(`Request successful: ${response.status}`);
    
    return {
      success: true,
      data: data || 'OK'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Request failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage
    };
  }
}