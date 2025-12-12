/**
 * Response utilities for creating standardized HTTP responses
 */

/**
 * Creates a JSON response with proper Content-Type header
 * @param data - Data to be serialized as JSON
 * @param init - Optional ResponseInit options (status, headers, etc.)
 * @returns Response object with JSON content
 */
export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}
