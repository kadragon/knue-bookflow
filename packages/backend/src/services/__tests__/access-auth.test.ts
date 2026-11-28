/**
 * Cloudflare Access authentication tests.
 * Tokens are signed with a locally generated RS256 key served as the team's
 * certs endpoint.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  encodeJson,
  generateSigningKey,
  type SigningKey,
  certsFetch as sharedCertsFetch,
  signToken,
} from '../../__tests__/helpers/access-jwt';
import type { Env } from '../../types';
import {
  ACCESS_JWT_HEADER,
  AccessTokenError,
  authenticateRequest,
  clearAccessSigningKeyCache,
  toTeamOrigin,
  verifyAccessJwt,
} from '../access-auth';

const TEAM_DOMAIN = 'example-team.cloudflareaccess.com';
const TEAM_ORIGIN = `https://${TEAM_DOMAIN}`;
const AUD = 'aud-tag-123';
const NOW_MS = Date.UTC(2026, 10, 25, 12, 0, 0);
const NOW_S = NOW_MS / 1000;
const CONFIG = { teamOrigin: TEAM_ORIGIN, aud: AUD };

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    aud: [AUD],
    iss: TEAM_ORIGIN,
    exp: NOW_S + 3600,
    iat: NOW_S - 10,
    nbf: NOW_S - 10,
    email: 'Member@Example.com',
    sub: 'sub-member',
    type: 'app',
    ...overrides,
  };
}

function certsFetch(...keys: SigningKey[]) {
  return sharedCertsFetch(TEAM_ORIGIN, ...keys) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>;
}

let signingKey: SigningKey;
let otherKey: SigningKey;

beforeEach(async () => {
  clearAccessSigningKeyCache();
  signingKey ??= await generateSigningKey('kid-1');
  otherKey ??= await generateSigningKey('kid-2');
});

describe('toTeamOrigin', () => {
  it.each([
    [TEAM_DOMAIN, TEAM_ORIGIN],
    [`https://${TEAM_DOMAIN}/`, TEAM_ORIGIN],
    [`http://${TEAM_DOMAIN}`, TEAM_ORIGIN],
  ])('normalizes %s to an https origin', (input, expected) => {
    expect(toTeamOrigin(input)).toBe(expected);
  });
});

describe('verifyAccessJwt', () => {
  const verify = (token: string, fetchFn: typeof fetch, nowMs = NOW_MS) =>
    verifyAccessJwt(token, CONFIG, { fetchFn, now: () => nowMs });

  it('returns the normalized email and sub of a valid token', async () => {
    const token = await signToken(signingKey, validClaims());

    await expect(verify(token, certsFetch(signingKey))).resolves.toEqual({
      email: 'member@example.com',
      sub: 'sub-member',
    });
  });

  it('accepts a string aud claim', async () => {
    const token = await signToken(signingKey, validClaims({ aud: AUD }));
    await expect(verify(token, certsFetch(signingKey))).resolves.toBeTruthy();
  });

  it.each([
    ['another application audience', { aud: ['other-aud'] }],
    ['another issuer', { iss: 'https://evil.cloudflareaccess.com' }],
    ['an expired token', { exp: NOW_S - 61 }],
    ['a token that is not valid yet', { nbf: NOW_S + 61 }],
    ['a token without email (service token)', { email: undefined }],
    ['a token with an empty email', { email: '  ' }],
  ])('rejects %s', async (_label, overrides) => {
    const token = await signToken(signingKey, validClaims(overrides));
    await expect(verify(token, certsFetch(signingKey))).rejects.toBeInstanceOf(
      AccessTokenError,
    );
  });

  it('allows small clock skew', async () => {
    const token = await signToken(
      signingKey,
      validClaims({ exp: NOW_S - 30, nbf: NOW_S + 30 }),
    );
    await expect(verify(token, certsFetch(signingKey))).resolves.toBeTruthy();
  });

  it('rejects a token signed by a key that is not published', async () => {
    const forged = await signToken(otherKey, validClaims(), {
      alg: 'RS256',
      kid: signingKey.kid,
    });
    await expect(verify(forged, certsFetch(signingKey))).rejects.toThrow(
      'Invalid token signature',
    );
  });

  it('rejects a tampered payload', async () => {
    const token = await signToken(signingKey, validClaims());
    const [header, , signature] = token.split('.');
    const tampered = `${header}.${encodeJson(validClaims({ email: 'admin@example.com' }))}.${signature}`;
    await expect(verify(tampered, certsFetch(signingKey))).rejects.toThrow(
      'Invalid token signature',
    );
  });

  it.each([
    ['alg none', { alg: 'none', kid: 'kid-1' }],
    ['HS256', { alg: 'HS256', kid: 'kid-1' }],
    ['no kid', { alg: 'RS256' }],
  ])('rejects a header with %s', async (_label, header) => {
    const token = await signToken(signingKey, validClaims(), header);
    await expect(verify(token, certsFetch(signingKey))).rejects.toThrow(
      'Unsupported token header',
    );
  });

  it.each(['', 'a.b', 'not-a-jwt', 'a.b.c.d', '%%%.e30.sig'])(
    'rejects the malformed token %j',
    async (token) => {
      await expect(
        verify(token, certsFetch(signingKey)),
      ).rejects.toBeInstanceOf(AccessTokenError);
    },
  );

  it('caches signing keys between requests', async () => {
    const fetchFn = certsFetch(signingKey);
    const token = await signToken(signingKey, validClaims());

    await verify(token, fetchFn);
    await verify(token, fetchFn, NOW_MS + 30 * 60 * 1000);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refetches keys for an unknown kid after rotation, at most once a minute', async () => {
    const before = certsFetch(signingKey);
    await verify(await signToken(signingKey, validClaims()), before);

    const rotatedToken = await signToken(otherKey, validClaims());
    // Within a minute an unknown kid does not trigger another fetch.
    await expect(verify(rotatedToken, before, NOW_MS + 10_000)).rejects.toThrow(
      'Unknown signing key',
    );
    expect(before).toHaveBeenCalledTimes(1);

    const after = certsFetch(signingKey, otherKey);
    await expect(
      verify(rotatedToken, after, NOW_MS + 2 * 60 * 1000),
    ).resolves.toBeTruthy();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('surfaces a certs endpoint failure as an infrastructure error', async () => {
    const failing = vi.fn(
      async () => new Response('down', { status: 502 }),
    ) as unknown as typeof fetch;
    const token = await signToken(signingKey, validClaims());

    const error = await verify(token, failing).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AccessTokenError);
  });
});

describe('authenticateRequest', () => {
  const baseEnv = {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    LIBRARY_USER_ID: '',
    LIBRARY_PASSWORD: '',
    ALADIN_API_KEY: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    ENVIRONMENT: 'production',
    ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
    ACCESS_AUD: AUD,
    ADMIN_EMAIL: 'Admin@Example.com',
  } satisfies Env;

  function request(
    headers: Record<string, string> = {},
    url = 'https://book.example.com/api/books',
  ): Request {
    return new Request(url, { headers });
  }

  function deps(id = 42) {
    return {
      fetchFn: certsFetch(signingKey),
      now: () => NOW_MS,
      userRepository: { findOrCreateByEmail: vi.fn(async () => id) },
    };
  }

  it('maps ADMIN_EMAIL (case-insensitively) to the owner user', async () => {
    const d = deps();
    const token = await signToken(
      signingKey,
      validClaims({ email: 'admin@EXAMPLE.com' }),
    );

    const result = await authenticateRequest(
      request({ [ACCESS_JWT_HEADER]: token }),
      baseEnv,
      d,
    );

    expect(result).toEqual({
      ok: true,
      user: { id: 1, email: 'admin@example.com', isAdmin: true },
    });
    expect(d.userRepository.findOrCreateByEmail).not.toHaveBeenCalled();
  });

  it('resolves other identities to their own user row', async () => {
    const d = deps(42);
    const token = await signToken(signingKey, validClaims());

    const result = await authenticateRequest(
      request({ [ACCESS_JWT_HEADER]: token }),
      baseEnv,
      d,
    );

    expect(result).toEqual({
      ok: true,
      user: { id: 42, email: 'member@example.com', isAdmin: false },
    });
    expect(d.userRepository.findOrCreateByEmail).toHaveBeenCalledWith(
      'member@example.com',
      'sub-member',
    );
  });

  it('never lets a non-admin identity act as the owner row', async () => {
    const token = await signToken(signingKey, validClaims());
    const result = await authenticateRequest(
      request({ [ACCESS_JWT_HEADER]: token }),
      baseEnv,
      deps(1),
    );
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects a request without the Access JWT', async () => {
    const result = await authenticateRequest(request(), baseEnv, deps());
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('returns 401 for a signature with an invalid Base64URL length', async () => {
    const [header, payload] = (
      await signToken(signingKey, validClaims())
    ).split('.');
    const d = deps();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const result = await authenticateRequest(
        request({ [ACCESS_JWT_HEADER]: `${header}.${payload}.A` }),
        baseEnv,
        d,
      );

      expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
      expect(d.fetchFn).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('ignores Cf-Access-Authenticated-User-Email without a valid JWT', async () => {
    const d = deps();
    const result = await authenticateRequest(
      request({ 'Cf-Access-Authenticated-User-Email': 'admin@example.com' }),
      baseEnv,
      d,
    );
    expect(result).toMatchObject({ ok: false, status: 401 });

    const forged = await signToken(otherKey, validClaims(), {
      alg: 'RS256',
      kid: signingKey.kid,
    });
    const withForgedToken = await authenticateRequest(
      request({
        [ACCESS_JWT_HEADER]: forged,
        'Cf-Access-Authenticated-User-Email': 'admin@example.com',
      }),
      baseEnv,
      d,
    );
    expect(withForgedToken).toMatchObject({ ok: false, status: 401 });
    expect(d.userRepository.findOrCreateByEmail).not.toHaveBeenCalled();
  });

  it('uses the header email of a valid token only through its claim', async () => {
    const token = await signToken(signingKey, validClaims());
    const result = await authenticateRequest(
      request({
        [ACCESS_JWT_HEADER]: token,
        'Cf-Access-Authenticated-User-Email': 'admin@example.com',
      }),
      baseEnv,
      deps(42),
    );
    expect(result).toMatchObject({
      ok: true,
      user: { id: 42, isAdmin: false },
    });
  });

  it.each(['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'ADMIN_EMAIL'] as const)(
    'fails closed with 500 when %s is missing',
    async (name) => {
      const token = await signToken(signingKey, validClaims());
      const env: Env = { ...baseEnv, [name]: undefined };
      const result = await authenticateRequest(
        request({ [ACCESS_JWT_HEADER]: token }),
        env,
        deps(),
      );
      expect(result).toMatchObject({ ok: false, status: 500 });
    },
  );

  it('returns 503 when the signing keys cannot be fetched', async () => {
    const token = await signToken(signingKey, validClaims());
    const result = await authenticateRequest(
      request({ [ACCESS_JWT_HEADER]: token }),
      baseEnv,
      {
        ...deps(),
        fetchFn: vi.fn(async () => {
          throw new Error('network down');
        }) as unknown as typeof fetch,
      },
    );
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it('returns 500 when the user lookup fails', async () => {
    const token = await signToken(signingKey, validClaims());
    const result = await authenticateRequest(
      request({ [ACCESS_JWT_HEADER]: token }),
      baseEnv,
      {
        ...deps(),
        userRepository: {
          findOrCreateByEmail: vi.fn(async () => {
            throw new Error('D1 down');
          }),
        },
      },
    );
    expect(result).toMatchObject({ ok: false, status: 500 });
  });

  describe('local development fallback', () => {
    const devEnv: Env = {
      ...baseEnv,
      ENVIRONMENT: 'development',
      ACCESS_TEAM_DOMAIN: undefined,
      ACCESS_AUD: undefined,
      ADMIN_EMAIL: 'dev@example.com',
      DEV_AUTH_EMAIL: 'Dev@Example.com',
    };

    it.each([
      'http://localhost:8787/api/books',
      'http://127.0.0.1:8787/api/books',
      'http://[::1]:8787/api/books',
    ])('authenticates %s as DEV_AUTH_EMAIL without a JWT', async (url) => {
      const result = await authenticateRequest(
        request({}, url),
        devEnv,
        deps(),
      );
      expect(result).toEqual({
        ok: true,
        user: { id: 1, email: 'dev@example.com', isAdmin: true },
      });
    });

    it('treats the dev identity as a member unless it is ADMIN_EMAIL', async () => {
      const result = await authenticateRequest(
        request({}, 'http://localhost:8787/api/books'),
        { ...devEnv, ADMIN_EMAIL: undefined },
        deps(42),
      );
      expect(result).toMatchObject({
        ok: true,
        user: { id: 42, isAdmin: false },
      });
    });

    it('is ignored outside ENVIRONMENT=development', async () => {
      const result = await authenticateRequest(
        request({}, 'http://localhost:8787/api/books'),
        { ...devEnv, ENVIRONMENT: 'production' },
        deps(),
      );
      expect(result).toMatchObject({ ok: false, status: 500 });

      const configured = await authenticateRequest(
        request({}, 'http://localhost:8787/api/books'),
        { ...baseEnv, DEV_AUTH_EMAIL: 'dev@example.com' },
        deps(),
      );
      expect(configured).toMatchObject({ ok: false, status: 401 });
    });

    it('is ignored for non-local hosts', async () => {
      const result = await authenticateRequest(
        request({}, 'https://book.example.com/api/books'),
        { ...devEnv, ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, ACCESS_AUD: AUD },
        deps(),
      );
      expect(result).toMatchObject({ ok: false, status: 401 });
    });
  });
});
