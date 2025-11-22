/**
 * Cloudflare Worker environment bindings
 * Trace: spec_id: N/A, task_id: TASK-001
 */

export interface Env {
  // D1 Database
  DB: D1Database;

  // Static asset binding (Cloudflare Workers assets)
  ASSETS: Fetcher;

  // Secret environment variables
  LIBRARY_USER_ID: string;
  LIBRARY_PASSWORD: string;
  ALADIN_API_KEY: string;

  // Non-secret environment variables
  ENVIRONMENT: string;
}
