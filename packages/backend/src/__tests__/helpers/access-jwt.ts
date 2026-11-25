/**
 * Test helper: RS256 keys and Cloudflare Access style tokens.
 */

import { vi } from 'vitest';

export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
  jwk: JsonWebKey;
}

export async function generateSigningKey(kid: string): Promise<SigningKey> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey(
    'jwk',
    pair.publicKey,
  )) as JsonWebKey;
  return { kid, privateKey: pair.privateKey, jwk };
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export async function signToken(
  key: SigningKey,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: key.kid },
): Promise<string> {
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

export function certsResponse(...keys: SigningKey[]): Response {
  return new Response(
    JSON.stringify({
      keys: keys.map((k) => ({
        ...k.jwk,
        kid: k.kid,
        alg: 'RS256',
        use: 'sig',
      })),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

/** A fetch that serves the team's certs endpoint and nothing else. */
export function certsFetch(teamOrigin: string, ...keys: SigningKey[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === `${teamOrigin}/cdn-cgi/access/certs`) {
      return certsResponse(...keys);
    }
    return new Response('not stubbed', { status: 404 });
  });
}
