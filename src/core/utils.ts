import { logger } from "./middleware";

// Timing utilities
export class Timer {
  private startTime: number;

  constructor() {
    this.startTime = performance.now();
  }

  elapsed(): number {
    return parseFloat((performance.now() - this.startTime).toFixed(2));
  }

  reset(): void {
    this.startTime = performance.now();
  }

  static measure<T>(
    operation: () => T | Promise<T>
  ): Promise<{ result: T; executionTime: number }> {
    const startTime = performance.now();
    const result = operation();

    if (result instanceof Promise) {
      return result.then((res) => ({
        result: res,
        executionTime: parseFloat((performance.now() - startTime).toFixed(2)),
      }));
    }

    return Promise.resolve({
      result,
      executionTime: parseFloat((performance.now() - startTime).toFixed(2)),
    });
  }
}

// HTTP client utility
export async function makeHttpRequest(
  url: string | URL | globalThis.Request,
  init?: RequestInit
): Promise<{
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
}> {
  const startTime = performance.now();

  try {
    logger.info(`Making ${init?.method} request to: ${url}`);

    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Digishare-API-Bridge/1.0",
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      const executionTime = performance.now() - startTime;
      logger.error(
        `HTTP ${response.status}: ${errorText} (took ${executionTime.toFixed(
          2
        )}ms)`
      );
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        executionTime,
      };
    }

    const data = await response.text();
    const executionTime = performance.now() - startTime;
    logger.info(
      `Request successful: ${response.status} (took ${executionTime.toFixed(
        2
      )}ms)`
    );

    return {
      success: true,
      data: data || "OK",
      executionTime,
    };
  } catch (error) {
    const executionTime = performance.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      `Request failed: ${errorMessage} (took ${executionTime.toFixed(2)}ms)`
    );
    return {
      success: false,
      error: errorMessage,
      executionTime,
    };
  }
}


export function objectToSimpleYaml(data: any, indentLevel = 0): string {
    const lines = [];
    const indent = ' '.repeat(indentLevel * 2); // 2 spaces per level

    for (const [key, value] of Object.entries(data)) {
        // Skip null and undefined values
        if (value === null || value === undefined) {
            continue;
        }

        if (typeof value === 'object' && !Array.isArray(value)) {
            // --- Handle Objects ---
            lines.push(`${indent}${key}:`);
            lines.push(objectToSimpleYaml(value, indentLevel + 1));
        } else if (Array.isArray(value)) {
            // --- Handle Arrays ---
            lines.push(`${indent}${key}:`);
            for (const item of value) {
                if (typeof item === 'object' && item !== null) {
                    const itemYaml = objectToSimpleYaml(item, indentLevel + 2);
                    // Format object in an array with an initial hyphen
                    const indentedItemYaml = itemYaml.replace(/^(\s*)/, `$1- `);
                    lines.push(indentedItemYaml);
                } else {
                    lines.push(`${indent}  - ${item}`);
                }
            }
        } else {
            // --- Handle Primitives (string, number, etc.) ---
            lines.push(`${indent}${key}: ${value}`);
        }
    }
    return lines.join('\n');
}