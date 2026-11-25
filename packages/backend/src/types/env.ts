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
  CALENDAR_FEED_TOKEN?: string;

  // Cloudflare Access (per-user separation). Required outside local dev.
  // ACCESS_TEAM_DOMAIN: e.g. "myteam.cloudflareaccess.com"
  // ACCESS_AUD: the Access application's Application Audience (AUD) tag
  // ADMIN_EMAIL: the Access identity that owns the library account data
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAIL?: string;

  DEV_AUTH_EMAIL?: string;

  // Non-secret environment variables
  ENVIRONMENT: string;
  DEBUG?: string;
}
