import { EnvConfig } from "./types";

// Environment validation and configuration
export function loadEnvironmentConfig(): EnvConfig {
  const env: EnvConfig = {
    API_KEY: process.env.API_KEY || "",
    TARGET_BASE_URL: process.env.TARGET_BASE_URL || "",
    TARGET_API_KEY: process.env.TARGET_API_KEY || "",
    PORT: process.env.PORT || "3000",
  };

  // Validate required environment variables
  const requiredEnvVars = ["API_KEY", "TARGET_BASE_URL", "TARGET_API_KEY"];
  const missingVars = requiredEnvVars.filter(
    (varName) => !env[varName as keyof EnvConfig]
  );

  if (missingVars.length > 0) {
    console.error("Missing required environment variables:", missingVars);
    console.error("Please set the following environment variables:");
    missingVars.forEach((varName) => {
      console.error(`  - ${varName}`);
    });
    process.exit(1);
  }

  return env;
}

// Export the validated environment configuration
export const env = loadEnvironmentConfig();
