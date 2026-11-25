/**
 * Cloudflare Access authentication
 *
 * Cloudflare Access signs users in at the edge and forwards a signed JWT in
 * the Cf-Access-Jwt-Assertion header. The Worker verifies that JWT itself
 * (RS256 signature against the team's published keys, AUD tag, issuer and
 * expiry) and takes the identity from its verified email claim. The
 * Cf-Access-Authenticated-User-Email header is never read: it is not signed,
 * and requests that bypass Access (for example a workers.dev URL) could set it.
 */

import { z } from 'zod';
import type { Env } from '../types';
import { OWNER_USER_ID } from '../utils/constants';
import { createUserRepository, type UserRepository } from './user-repository';

export const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion';

const CLOCK_SKEW_SECONDS = 60;
const SIGNING_KEYS_TTL_MS = 60 * 60 * 1000;
// An unknown kid triggers a refetch (key rotation), at most once per minute.
const SIGNING_KEYS_MIN_REFRESH_MS = 60 * 1000;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface AccessIdentity {
  email: string;
  sub: string | null;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  isAdmin: boolean;
}

export type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; status: 401 | 403 | 500 | 503; error: string };

export interface AccessConfig {
  /** https origin of the Access team domain, which is also the JWT issuer */
  teamOrigin: string;
  aud: string;
}

export interface AccessAuthDeps {
  fetchFn?: typeof fetch;
  now?: () => number;
  userRepository?: Pick<UserRepository, 'findOrCreateByEmail'>;
}

/** A token that fails verification; anything else is an infrastructure error. */
export class AccessTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessTokenError';
  }
}

const tokenHeaderSchema = z.object({
  alg: z.literal('RS256'),
  kid: z.string().min(1),
});

const tokenClaimsSchema = z.object({
  aud: z.union([z.string(), z.array(z.string())]),
  iss: z.string(),
  exp: z.number(),
  nbf: z.number().optional(),
  email: z.string().trim().min(1),
  sub: z.string().optional(),
});

const signingKeySetSchema = z.object({ keys: z.array(z.unknown()) });

const rsaSigningKeySchema = z.object({
  kid: z.string().min(1),
  kty: z.literal('RSA'),
  n: z.string().min(1),
  e: z.string().min(1),
});

interface CachedSigningKeys {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}

const signingKeyCache = new Map<string, CachedSigningKeys>();

export function clearAccessSigningKeyCache(): void {
  signingKeyCache.clear();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Accepts "team.cloudflareaccess.com" or a URL; always yields an https origin. */
export function toTeamOrigin(teamDomain: string): string {
  const trimmed = teamDomain.trim();
  const withScheme = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return `https://${new URL(withScheme).host}`;
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new AccessTokenError('Malformed token');
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJsonSegment(segment: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
  } catch {
    throw new AccessTokenError('Malformed token');
  }
}

async function fetchSigningKeys(
  teamOrigin: string,
  fetchFn: typeof fetch,
): Promise<Map<string, CryptoKey>> {
  const response = await fetchFn(`${teamOrigin}/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error(`Access certs request failed: ${response.status}`);
  }
  const body = signingKeySetSchema.safeParse(await response.json());
  if (!body.success) {
    throw new Error('Access certs response is malformed');
  }

  const keys = new Map<string, CryptoKey>();
  for (const candidate of body.data.keys) {
    const jwk = rsaSigningKeySchema.safeParse(candidate);
    if (!jwk.success) {
      continue;
    }
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: jwk.data.n, e: jwk.data.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      keys.set(jwk.data.kid, key);
    } catch (error) {
      console.warn(
        `[AccessAuth] Skipping unusable signing key ${jwk.data.kid}:`,
        error,
      );
    }
  }
  return keys;
}

async function getSigningKey(
  teamOrigin: string,
  kid: string,
  fetchFn: typeof fetch,
  nowMs: number,
): Promise<CryptoKey | null> {
  const cached = signingKeyCache.get(teamOrigin);
  if (cached) {
    const age = nowMs - cached.fetchedAt;
    const key = cached.keys.get(kid);
    if (key && age < SIGNING_KEYS_TTL_MS) {
      return key;
    }
    if (!key && age < SIGNING_KEYS_MIN_REFRESH_MS) {
      return null;
    }
  }

  const keys = await fetchSigningKeys(teamOrigin, fetchFn);
  signingKeyCache.set(teamOrigin, { keys, fetchedAt: nowMs });
  return keys.get(kid) ?? null;
}

/**
 * Verify a Cloudflare Access application token and return its identity.
 * Throws AccessTokenError when the token is not acceptable.
 */
export async function verifyAccessJwt(
  token: string,
  config: AccessConfig,
  deps: Pick<AccessAuthDeps, 'fetchFn' | 'now'> = {},
): Promise<AccessIdentity> {
  const fetchFn = deps.fetchFn ?? fetch;
  const nowMs = deps.now?.() ?? Date.now();

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AccessTokenError('Malformed token');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [
    string,
    string,
    string,
  ];

  const header = tokenHeaderSchema.safeParse(decodeJsonSegment(encodedHeader));
  if (!header.success) {
    throw new AccessTokenError('Unsupported token header');
  }

  const key = await getSigningKey(
    config.teamOrigin,
    header.data.kid,
    fetchFn,
    nowMs,
  );
  if (!key) {
    throw new AccessTokenError('Unknown signing key');
  }

  const signatureValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!signatureValid) {
    throw new AccessTokenError('Invalid token signature');
  }

  const claims = tokenClaimsSchema.safeParse(decodeJsonSegment(encodedPayload));
  if (!claims.success) {
    throw new AccessTokenError('Token is missing required claims');
  }

  const { aud, iss, exp, nbf, email, sub } = claims.data;
  const nowSeconds = nowMs / 1000;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(config.aud)) {
    throw new AccessTokenError('Token audience mismatch');
  }
  if (iss !== config.teamOrigin) {
    throw new AccessTokenError('Token issuer mismatch');
  }
  if (exp <= nowSeconds - CLOCK_SKEW_SECONDS) {
    throw new AccessTokenError('Token expired');
  }
  if (nbf !== undefined && nbf > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new AccessTokenError('Token not yet valid');
  }

  return { email: normalizeEmail(email), sub: sub ? sub : null };
}

function isLocalDevRequest(request: Request, env: Env): boolean {
  if (env.ENVIRONMENT !== 'development' || !env.DEV_AUTH_EMAIL) {
    return false;
  }
  return LOCAL_HOSTNAMES.has(new URL(request.url).hostname);
}

async function resolveIdentity(
  request: Request,
  env: Env,
  deps: AccessAuthDeps,
): Promise<
  { ok: true; identity: AccessIdentity } | Extract<AuthResult, { ok: false }>
> {
  if (env.DEV_AUTH_EMAIL && isLocalDevRequest(request, env)) {
    return {
      ok: true,
      identity: { email: normalizeEmail(env.DEV_AUTH_EMAIL), sub: null },
    };
  }

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL) {
    console.error(
      '[AccessAuth] ACCESS_TEAM_DOMAIN, ACCESS_AUD and ADMIN_EMAIL must all be set; rejecting request',
    );
    return {
      ok: false,
      status: 500,
      error: 'Authentication is not configured',
    };
  }

  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  try {
    const identity = await verifyAccessJwt(
      token,
      {
        teamOrigin: toTeamOrigin(env.ACCESS_TEAM_DOMAIN),
        aud: env.ACCESS_AUD,
      },
      deps,
    );
    return { ok: true, identity };
  } catch (error) {
    if (error instanceof AccessTokenError) {
      console.warn(`[AccessAuth] Rejected token: ${error.message}`);
      return { ok: false, status: 401, error: 'Unauthorized' };
    }
    console.error('[AccessAuth] Token verification unavailable:', error);
    return { ok: false, status: 503, error: 'Authentication unavailable' };
  }
}

/**
 * Authenticate a request and resolve the app user. ADMIN_EMAIL maps to the
 * owner user (id 1); every other identity gets its own user row.
 */
export async function authenticateRequest(
  request: Request,
  env: Env,
  deps: AccessAuthDeps = {},
): Promise<AuthResult> {
  const resolved = await resolveIdentity(request, env, deps);
  if (!resolved.ok) {
    return resolved;
  }

  const { email, sub } = resolved.identity;
  if (env.ADMIN_EMAIL && email === normalizeEmail(env.ADMIN_EMAIL)) {
    return { ok: true, user: { id: OWNER_USER_ID, email, isAdmin: true } };
  }

  try {
    const userRepository = deps.userRepository ?? createUserRepository(env.DB);
    const id = await userRepository.findOrCreateByEmail(email, sub);
    if (id === OWNER_USER_ID) {
      // The owner row belongs to ADMIN_EMAIL only.
      return { ok: false, status: 403, error: 'Forbidden' };
    }
    return { ok: true, user: { id, email, isAdmin: false } };
  } catch (error) {
    console.error('[AccessAuth] Failed to resolve user:', error);
    return { ok: false, status: 500, error: 'Internal Server Error' };
  }
}
