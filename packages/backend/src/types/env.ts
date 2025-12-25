/**
 * Cloudflare Worker environment bindings
 * Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-001, TASK-079
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
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;

  // Non-secret environment variables
  ENVIRONMENT: string;
  DEBUG?: string;
}
